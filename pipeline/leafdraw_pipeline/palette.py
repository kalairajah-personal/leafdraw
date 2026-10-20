"""Leaf colour palettes in CIELAB (k-means on masked pixels). Use calibrated field photos
(e.g. iNaturalist research-grade, CC-licensed) — herbarium sheets are dried and brown."""
from __future__ import annotations

import numpy as np
from skimage import color


def kmeans(X: np.ndarray, k: int = 4, iters: int = 25, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        C = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
    return C, lab


def leaf_palette(rgb: np.ndarray, mask: np.ndarray, k: int = 4) -> dict:
    lab = color.rgb2lab(rgb)[mask]
    if len(lab) > 40000:
        lab = lab[np.random.default_rng(0).choice(len(lab), 40000, replace=False)]
    C, labels = kmeans(lab, k)
    counts = np.bincount(labels, minlength=k)
    order = np.argsort(-counts)
    blade = C[order[0]]
    lighter = max(C, key=lambda c: c[0])
    darker = min(C, key=lambda c: c[0])
    to_hex = lambda c: "#" + "".join(f"{int(round(v * 255)):02x}" for v in np.clip(color.lab2rgb(c[None, None, :])[0, 0], 0, 1))
    return {"blade": to_hex(blade), "vein": to_hex(lighter), "edge": to_hex(darker), "labBlade": [round(float(x), 2) for x in blade]}
