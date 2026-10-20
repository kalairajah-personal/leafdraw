"""Validation.

roundtrip(species): render silhouettes with the leafdraw CLI, segment + measure them with this pipeline,
compare with the spec's params. Proves the measuring and drawing sides agree (offline).

plantnet_identify(images): Pl@ntNet identification API — the automated "botanist test". A rendered
colour leaf should come back as its own species. Needs a free API key (my.plantnet.org).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request

import numpy as np


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CLI = os.path.join(ROOT, "cli", "leafdraw.js")


def render(species: str, seed: int, out_png: str, style: str = "silhouette", width: int = 900, detail: str = "low") -> float:
    """Render via the node CLI; returns mm per pixel of the PNG."""
    svg = subprocess.run(["node", CLI, "-s", species, "--seed", str(seed), "--style", style, "--detail", detail], capture_output=True, text=True, check=True).stdout
    vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    subprocess.run(["node", CLI, "-s", species, "--seed", str(seed), "--style", style, "--detail", detail, "-f", "png", "--width", str(width), "-o", out_png], capture_output=True, check=True)
    return float(vb[1]) / width


def roundtrip(species: str, seeds=(1, 2, 3, 4, 5)) -> dict:
    from .measure import measure_leaf  # needs scikit-image + scipy
    from .segment import load_rgb, segment_leaf
    spec = json.loads(subprocess.run(["node", CLI, "-s", species, "--info"], capture_output=True, text=True, check=True).stdout)
    ms = []
    with tempfile.TemporaryDirectory() as d:
        for s in seeds:
            png = os.path.join(d, f"{s}.png")
            mmpp = render(species, s, png)
            mask = segment_leaf(load_rgb(png, max_side=4000), dark_leaf=True)
            ms.append(measure_leaf(mask, mmpp))
    p = spec.get("params", {})
    target = lambda k: (p[k][0] if isinstance(p.get(k), list) else p.get(k))
    res = {"species": species, "n": len(ms)}
    for k in ("aspect", "widest", "length"):
        if target(k) is not None:
            got = float(np.mean([m[k] for m in ms]))
            res[k] = {"target": target(k), "measured": round(got, 3), "relErr": round(abs(got - target(k)) / target(k), 3)}
    res["lobeDepth"] = round(float(np.mean([m["lobeDepth"] for m in ms])), 3)
    res["teethPerCm"] = round(float(np.mean([m["teethPerCm"] for m in ms])), 3)
    return res


def plantnet_identify(images: list[str], api_key: str | None = None, organs: str = "leaf", project: str = "all") -> list[dict]:
    key = api_key or os.environ.get("PLANTNET_API_KEY")
    if not key:
        raise RuntimeError("Set PLANTNET_API_KEY (free key at https://my.plantnet.org).")
    boundary = "----leafdraw"
    body = b""
    for path in images:
        with open(path, "rb") as f:
            data = f.read()
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"organs\"\r\n\r\n{organs}\r\n".encode()
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"images\"; filename=\"{os.path.basename(path)}\"\r\nContent-Type: image/png\r\n\r\n".encode() + data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"https://my-api.plantnet.org/v2/identify/{project}?api-key={key}", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:200]
        if e.code == 404:  # Pl@ntNet's answer for "no species recognised in this image"
            return []
        raise RuntimeError(f"Pl@ntNet HTTP {e.code}: {msg}") from None
    return [{"name": x["species"]["scientificNameWithoutAuthor"], "score": x["score"]} for x in out.get("results", [])[:5]]


def botanist_score(species_id: str, scientific_name: str, seeds=range(1, 6)) -> dict:
    """Fraction of rendered colour leaves Pl@ntNet identifies as the right species (top-1 / top-5)."""
    norm = lambda n: " ".join(n.lower().replace("×", "x").replace(" x ", " ").split()[:2])
    want = norm(scientific_name)
    top1 = top5 = genus1 = recog = 0
    with tempfile.TemporaryDirectory() as d:
        for s in seeds:
            png = os.path.join(d, f"{s}.png")
            render(species_id, s, png, style="color", width=1200, detail="medium")
            res = plantnet_identify([png])
            names = [norm(r["name"]) for r in res]
            recog += bool(names)
            top1 += bool(names) and names[0] == want
            top5 += want in names
            genus1 += bool(names) and names[0].split()[0] == want.split()[0]
    n = len(list(seeds))
    return {"species": species_id, "top1": top1 / n, "top5": top5 / n, "genus1": genus1 / n, "recognised": recog / n, "guess": res[0]["name"] if res else None}
