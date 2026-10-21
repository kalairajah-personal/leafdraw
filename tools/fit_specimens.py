"""Fit species shape params to measured herbarium leaves.

Input : specimens report.json (pipeline `specimens`, branch `specimens`, out/report.json)
Output: species/fitted.json  (merged by species/build-species.mjs → data/species.json)

Loop per species: render the current spec (silhouette, 5 seeds) → measure with the same code as the
specimens → nudge params toward the specimen medians → rebuild → re-measure, until within tolerance.
Fitted: aspect (ratio), widest point (additive, only when specimen orientation is consistent),
lobe depth (additive, lobed species only).

  python tools/fit_specimens.py path/to/report.json [--min-leaves 12] [--ids a b c]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
from leafdraw_pipeline.specimens import measure_drawn  # noqa: E402

FIT = os.path.join(ROOT, "species", "fitted.json")


def rebuild():
    subprocess.run(["node", os.path.join(ROOT, "species", "build-species.mjs")], check=True, capture_output=True)


def mean_of(v):
    return v[0] if isinstance(v, list) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report")
    ap.add_argument("--min-leaves", type=int, default=12)
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--iters", type=int, default=4)
    a = ap.parse_args()
    report = [r for r in json.load(open(a.report)) if "specimen" in r and r.get("leaves", 0) >= a.min_leaves]
    if a.ids:
        report = [r for r in report if r["id"] in a.ids]
    fitted = json.load(open(FIT)) if os.path.exists(FIT) else {}
    cat = {s["id"]: s for s in json.load(open(os.path.join(ROOT, "data", "species.json")))}
    log = []
    for r in report:
        sid, S = r["id"], r["specimen"]
        sp = cat.get(sid)
        if not sp or sp.get("compound"):
            continue
        lobed = (sp["traits"].get("lobation") or "none") != "none"
        base = dict(sp["params"])
        # Quality gates — herbarium segmentation is trustworthy only for mid-sized, mid-aspect blades:
        # narrow/strap leaves fragment or fold on the sheet, very round/peltate leaves fold and overlap,
        # dissected leaves split into segments. Out-of-gate species are measured but not auto-fitted.
        A, D0 = S["aspect"], r["drawn"]["aspect"]
        reason = None
        if mean_of(base.get("aspect", 2)) > 3.5 or sp["traits"].get("plantGroup") == "monocot":
            reason = "narrow, strap-shaped or monocot leaf (fragments/folds on sheets)"
        elif D0["median"] < 1.12 or sp["traits"].get("attachment") == "peltate":
            reason = "round/peltate leaf (folds on sheets)"
        elif r["drawn"]["lobeDepth"]["median"] > 0.85:
            reason = "dissected leaf (segments measured separately)"
        elif A["q3"] / max(A["q1"], 1e-6) > 1.6:
            reason = f"inconsistent specimens (IQR {A['q1']}–{A['q3']})"
        elif abs(A["median"] / D0["median"] - 1) > 0.22:
            reason = f"specimen aspect {A['median']} vs drawn {D0['median']}: > 22% apart, review by hand"
        if reason:
            row = {"id": sid, "leaves": r["leaves"], "skipped": reason, "specimenAspect": A["median"], "drawnAspect": D0["median"]}
            log.append(row); print(json.dumps(row), flush=True)
            continue
        if "aspect" not in base and S["aspect"]:
            continue  # aspect comes from the term definition; leave unfitted rather than invent a param shape
        p = {k: base[k] for k in ("aspect", "widest", "lobeDepth") if k in base}
        # widest: trust only when the IQR is narrow (orientation consistent on the sheets)
        # Base/apex orientation on sheets is inferred from the petiole stub and can flip; fit the widest point
        # only when the leaves agree on which half is wider (IQR does not straddle the middle).
        W = S["widest"]
        wid_ok = bool(W) and not lobed and "widest" in p and (W["q3"] - W["q1"]) <= 0.2 and (W["q1"] > 0.5 or W["q3"] < 0.5)
        lob_ok = lobed and S["lobeDepth"] and "lobeDepth" in p and (S["lobeDepth"]["q3"] - S["lobeDepth"]["q1"]) < 0.35
        before = r["drawn"]
        for it in range(a.iters):
            D = measure_drawn(sid)
            err_a = S["aspect"]["median"] / D["aspect"]["median"] - 1
            err_w = (S["widest"]["median"] - D["widest"]["median"]) if wid_ok else 0
            err_l = (S["lobeDepth"]["median"] - D["lobeDepth"]["median"]) if lob_ok else 0
            if abs(err_a) < 0.04 and abs(err_w) < 0.03 and abs(err_l) < 0.04:
                break
            if "aspect" in p and abs(err_a) >= 0.04:
                m = mean_of(p["aspect"]) * (1 + err_a) ** 0.9
                m = min(max(m, mean_of(base["aspect"]) * 0.6), mean_of(base["aspect"]) * 1.6)
                p["aspect"] = [round(m, 3), round(m * 0.08, 3)]
            if wid_ok and abs(err_w) >= 0.03:
                w = min(max(mean_of(p["widest"]) + 0.9 * err_w, 0.08), 0.9)
                p["widest"] = [round(w, 3), 0.03]
            if lob_ok and abs(err_l) >= 0.04:
                l = min(max(mean_of(p["lobeDepth"]) + 0.9 * err_l, 0.1), 0.95)
                p["lobeDepth"] = [round(l, 3), 0.05]
            fitted[sid] = {"params": p, "leaves": r["leaves"], "sheets": r["sheets"], "date": dt.date.today().isoformat(),
                           "measured": {k: S[k] for k in ("aspect", "widest", "lobeDepth", "circularity") if S.get(k)}}
            json.dump(fitted, open(FIT, "w"), indent=1)
            rebuild()
        after = measure_drawn(sid)
        row = {"id": sid, "leaves": r["leaves"], "target": {k: S[k]["median"] for k in ("aspect", "widest") if S.get(k)},
               "before": {k: before[k]["median"] for k in ("aspect", "widest")}, "after": {k: after[k]["median"] for k in ("aspect", "widest")},
               "params": fitted.get(sid, {}).get("params")}
        log.append(row)
        print(json.dumps(row), flush=True)
        if sid not in fitted:  # already within tolerance: record the confirmation
            fitted[sid] = {"params": {}, "leaves": r["leaves"], "sheets": r["sheets"], "date": dt.date.today().isoformat(),
                           "measured": {k: S[k] for k in ("aspect", "widest", "lobeDepth", "circularity") if S.get(k)}}
            json.dump(fitted, open(FIT, "w"), indent=1)
    rebuild()
    json.dump(log, open(os.path.join(ROOT, "data", "validation", "specimen-fit.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
