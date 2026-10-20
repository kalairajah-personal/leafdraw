"""Measurements -> species spec (tier A). Trait terms are chosen by the same numeric definitions the
renderer uses (data/traits.json, exported by `npm run build`), so a fitted spec round-trips."""
from __future__ import annotations

import json
import os
import statistics as st

HERE = os.path.dirname(__file__)
TRAITS_JSON = os.path.join(HERE, "..", "..", "data", "traits.json")


def load_traits() -> dict:
    with open(TRAITS_JSON) as f:
        return json.load(f)


def _ms(xs, nd=3):
    xs = [x for x in xs if x == x]
    if not xs:
        return None
    m = st.fmean(xs)
    sd = st.pstdev(xs) if len(xs) > 1 else 0.0
    return [round(m, nd), round(sd, nd)]


def classify_shape(aspect: float, widest: float, traits: dict) -> str:
    best, bd = "elliptic", 1e9
    for tid, t in traits["traits"]["shape"]["terms"].items():
        if "aspect" not in t or t.get("engine") in ("polar",):
            continue
        a0, a1 = t["aspect"]
        w0, w1 = t.get("widest", [0.45, 0.55])
        da = 0 if a0 <= aspect <= a1 else min(abs(aspect - a0), abs(aspect - a1)) / max(a1, 1)
        dw = 0 if w0 <= widest <= w1 else min(abs(widest - w0), abs(widest - w1))
        score = da * 2 + dw * 3 + (0.15 if t.get("angular") else 0)
        if score < bd:
            bd, best = score, tid
    return best


def classify_lobation(depth: float) -> str:
    if depth < 0.15:
        return "none"
    if depth < 0.3:
        return "lobed"
    if depth < 0.5:
        return "pinnatifid"
    if depth < 0.88:
        return "pinnatipartite"
    return "pinnatisect"


def classify_margin(teeth_per_cm: float, tooth_height_rel: float) -> str:
    if teeth_per_cm < 0.25:
        return "entire"
    if tooth_height_rel < 0.006:
        return "serrulate"
    return "serrate"


def classify_angle(angle: float) -> str:
    return "acute" if angle < 85 else "subobtuse" if angle < 100 else "obtuse"


def fit_species(name: str, measurements: list[dict], sources: list[dict] | None = None, family: str = "", common=None) -> dict:
    traits = load_traits()
    M = measurements
    L = _ms([m["length"] for m in M], 1)
    asp = _ms([m["aspect"] for m in M])
    wid = _ms([m["widest"] for m in M])
    depth = st.fmean(m["lobeDepth"] for m in M)
    tpc = st.fmean(m["teethPerCm"] for m in M)
    th = st.fmean(m["toothHeight"] / max(m["length"], 1e-9) for m in M)
    lob = classify_lobation(depth)
    margin = classify_margin(tpc, th)
    spec = {
        "id": name.lower().replace(" ", "-").replace("×", "x"),
        "name": name, "common": common or [], "family": family, "tier": "A",
        "sources": [f"{s.get('institution', '?')} occurrence {s.get('occurrence')} ({s.get('license', '')})" for s in (sources or [])][:50],
        "traits": {
            "shape": classify_shape(asp[0], wid[0], traits),
            "lobation": lob,
            "margin": margin,
            "apex": classify_angle(st.fmean(m["apexAngle"] for m in M)),
            "base": classify_angle(st.fmean(m["baseAngle"] for m in M)),
        },
        "params": {"length": L, "aspect": asp, "widest": wid},
        "fit": {"n": len(M), "lobeDepth": round(depth, 3), "teethPerCm": round(tpc, 3), "efdMean": _efd_mean(M)},
    }
    if lob != "none":
        spec["params"]["lobeDepth"] = _ms([m["lobeDepth"] for m in M])
    if margin != "entire":
        perim = st.fmean(m["perimeter"] for m in M)
        teeth = st.fmean(m["teeth"] for m in M)
        spec["params"]["toothSpacing"] = round(perim / max(teeth, 1), 2)
        spec["params"]["toothHeight"] = round(st.fmean(m["toothHeight"] for m in M), 2)
    return spec


def _efd_mean(M):
    if not M or "efd" not in M[0]:
        return None
    import numpy as np
    return np.mean([m["efd"] for m in M], axis=0).round(4).tolist()
