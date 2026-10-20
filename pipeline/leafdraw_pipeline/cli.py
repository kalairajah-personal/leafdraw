"""python -m leafdraw_pipeline.cli <command> ...

  fetch    "Quercus alba" --n 40 --out work/quercus-alba        GBIF specimen images (open licences)
  measure  work/quercus-alba --mm-per-px 0.1                     segment + measure every image
  fit      work/quercus-alba --name "Quercus alba"              -> species/<id>.json (tier A)
  palette  photo.jpg                                             CIELAB palette
  text     "Quercus alba" description.txt                        -> tier B-text spec
  roundtrip quercus-alba                                         render→measure→compare
  identify image.png                                             Pl@ntNet (needs PLANTNET_API_KEY)
  score    [species-id ...] --seeds 3 --out score.json           Pl@ntNet botanist score for the catalog
"""
from __future__ import annotations

import argparse
import glob
import json
import os

from . import validate  # light: stdlib + numpy; image modules load per command below

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="leafdraw-pipeline")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch"); f.add_argument("name"); f.add_argument("--n", type=int, default=40); f.add_argument("--out", required=True)
    m = sub.add_parser("measure"); m.add_argument("dir"); m.add_argument("--mm-per-px", type=float, default=1.0)
    ft = sub.add_parser("fit"); ft.add_argument("dir"); ft.add_argument("--name", required=True); ft.add_argument("--family", default="")
    p = sub.add_parser("palette"); p.add_argument("image")
    t = sub.add_parser("text"); t.add_argument("name"); t.add_argument("file"); t.add_argument("--llm", action="store_true")
    r = sub.add_parser("roundtrip"); r.add_argument("species", nargs="+")
    i = sub.add_parser("identify"); i.add_argument("images", nargs="+")
    sc = sub.add_parser("score"); sc.add_argument("species", nargs="*"); sc.add_argument("--seeds", type=int, default=3); sc.add_argument("--out", default="score.json")
    a = ap.parse_args(argv)

    if a.cmd == "fetch":
        from . import gbif
        mt = gbif.match_name(a.name)
        print(json.dumps({k: mt.get(k) for k in ("usageKey", "scientificName", "family", "status")}))
        items = gbif.specimen_images(mt["usageKey"], a.n)
        got = gbif.download(items, a.out)
        print(f"{len(got)} images -> {a.out}")
    elif a.cmd == "measure":
        from .measure import measure_leaf
        from .segment import load_rgb, segment_leaf
        out = []
        for path in sorted(glob.glob(os.path.join(a.dir, "*.jpg")) + glob.glob(os.path.join(a.dir, "*.png"))):
            try:
                out.append({"image": path, **measure_leaf(segment_leaf(load_rgb(path)), a.mm_per_px)})
            except Exception as e:
                print(f"skip {path}: {e}")
        with open(os.path.join(a.dir, "measurements.json"), "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"{len(out)} measured")
    elif a.cmd == "fit":
        from .fit import fit_species
        ms = json.load(open(os.path.join(a.dir, "measurements.json")))
        src = json.load(open(os.path.join(a.dir, "sources.json"))) if os.path.exists(os.path.join(a.dir, "sources.json")) else []
        spec = fit_species(a.name, ms, src, a.family)
        path = os.path.join(ROOT, "species", spec["id"] + ".json")
        json.dump(spec, open(path, "w"), indent=2)
        print(f"wrote {path}")
    elif a.cmd == "palette":
        from .palette import leaf_palette
        from .segment import load_rgb
        rgb = load_rgb(a.image)
        print(json.dumps(leaf_palette(rgb, segment_leaf(rgb))))
    elif a.cmd == "text":
        from .text_traits import spec_from_text
        print(json.dumps(spec_from_text(a.name, open(a.file).read(), use_llm=a.llm), indent=2))
    elif a.cmd == "roundtrip":
        for s in a.species:
            print(json.dumps(validate.roundtrip(s)))
    elif a.cmd == "identify":
        print(json.dumps(validate.plantnet_identify(a.images), indent=2))
    elif a.cmd == "score":
        cat = json.load(open(os.path.join(ROOT, "data", "species.json")))
        todo = [s for s in cat if not a.species or s["id"] in a.species]
        rows = []
        for s in todo:
            try:
                r = validate.botanist_score(s["id"], s["name"], seeds=range(1, a.seeds + 1))
            except Exception as e:  # keep going; quota and network errors are per species
                r = {"species": s["id"], "error": str(e)}
            rows.append(r); print(json.dumps(r), flush=True)
            json.dump(rows, open(a.out, "w"), indent=1)
        ok = [r for r in rows if "top1" in r]
        if ok:
            avg = lambda k: sum(r[k] for r in ok) / len(ok)
            print(f"recognised as a plant {avg('recognised'):.0%} · top-1 {avg('top1'):.0%} · top-5 {avg('top5'):.0%} · genus top-1 {avg('genus1'):.0%} over {len(ok)} species")


if __name__ == "__main__":
    main()
