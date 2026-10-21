"""Measure real leaves on GBIF herbarium sheets and compare with the drawn species.

For each species: open-licence specimen images (GBIF), resized through GBIF's image service, are split into
clean isolated leaves (herbarium.py) and measured with measure.measure_leaf — the same code used on renders.
Dimensionless traits only (aspect, widest point, lobe depth, circularity, apex/base angle): sheet scale varies.
"""
from __future__ import annotations

import io
import json
import os
import statistics as st
import tempfile
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

from . import gbif
from .herbarium import overlay, plant_mask, split_leaves
from .measure import measure_leaf

KEYS = ("aspect", "widest", "lobeDepth", "circularity", "apexAngle", "baseAngle")


def fetch_image(url: str, width: int = 1400) -> np.ndarray | None:
    thumb = "https://api.gbif.org/v1/image/unsafe/" + f"{width}x/" + urllib.parse.quote(url, safe="")
    for u in (thumb,):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "leafdraw-pipeline/0.2"})
            with urllib.request.urlopen(req, timeout=20) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGB")
            s = width / max(im.size)
            if s < 1:
                im = im.resize((int(im.width * s), int(im.height * s)))
            return np.asarray(im).astype(np.float32) / 255.0
        except Exception:
            continue
    return None


def _stats(xs):
    xs = sorted(x for x in xs if x == x)
    if not xs:
        return None
    q = lambda p: xs[min(len(xs) - 1, int(p * (len(xs) - 1) + 0.5))]
    return {"median": round(st.median(xs), 3), "q1": round(q(0.25), 3), "q3": round(q(0.75), 3), "n": len(xs)}


def measure_species(spec: dict, n_sheets: int = 20, per_sheet: int = 6, out_dir: str = "specimens") -> dict:
    os.makedirs(out_dir, exist_ok=True)
    lobed = (spec.get("traits", {}).get("lobation") or "none") != "none" or spec.get("traits", {}).get("shape") == "palmate"
    mt = gbif.match_name(spec["name"])
    items = gbif.specimen_images(mt.get("acceptedUsageKey") or mt["usageKey"], n_sheets * 2)
    leaves, sheets, thumbs = [], [], []
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(8) as ex:  # downloads dominate run time; fetch in parallel
        images = list(ex.map(lambda it: fetch_image(it["url"]), items[: int(n_sheets * 1.5) + 2]))
    for it, rgb in zip(items, images):
        if len(sheets) >= n_sheets:
            break
        if rgb is None:
            continue
        try:
            found, _ = split_leaves(plant_mask(rgb), lobed=lobed)
        except Exception:
            continue
        got = 0
        for m, bb in found[:per_sheet]:
            try:
                ms = measure_leaf(m, 1.0)
            except Exception:
                continue
            if not (1.0 <= ms["aspect"] <= 40):
                continue
            leaves.append({k: round(float(ms[k]), 4) for k in KEYS} | {"occurrence": it["occurrence"]})
            got += 1
        sheets.append({"occurrence": it["occurrence"], "institution": it.get("institution"), "license": it["license"], "leaves": got})
        if got and len(thumbs) < 8:
            thumbs.append(overlay(rgb, found[:per_sheet], 360))
    if thumbs:
        W = sum(t.width for t in thumbs[:4]); Hh = max(t.height for t in thumbs) * ((len(thumbs) + 3) // 4)
        sheet = Image.new("RGB", (max(W, 1), max(Hh, 1)), "white")
        x = y = 0
        rowh = max(t.height for t in thumbs)
        for i, t in enumerate(thumbs):
            if i and i % 4 == 0:
                x, y = 0, y + rowh
            sheet.paste(t, (x, y)); x += t.width
        sheet.save(os.path.join(out_dir, f"{spec['id']}.jpg"), quality=70)
    res = {"id": spec["id"], "name": spec["name"], "gbifKey": mt.get("usageKey"), "sheets": len(sheets), "leaves": len(leaves),
           "stats": {k: _stats([l[k] for l in leaves]) for k in KEYS}, "sources": sheets, "raw": leaves}
    with open(os.path.join(out_dir, f"{spec['id']}.json"), "w") as f:
        json.dump(res, f, indent=1)
    return res


def measure_drawn(spec_id: str, seeds=range(1, 6)) -> dict:
    """Same measurements on our silhouette renders (the comparison baseline)."""
    from .segment import load_rgb, segment_leaf
    from .validate import render
    vals = []
    with tempfile.TemporaryDirectory() as d:
        for s in seeds:
            png = os.path.join(d, f"{s}.png")
            render(spec_id, s, png, style="silhouette", width=900)
            m = segment_leaf(load_rgb(png), dark_leaf=True)
            vals.append(measure_leaf(m, 1.0))
    return {k: _stats([v[k] for v in vals]) for k in KEYS}
