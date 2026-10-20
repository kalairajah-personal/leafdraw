"""Leaf segmentation.

Default: Leafsnap-style colour segmentation (Kumar et al. 2012): leaves on an untextured background
separate well in saturation/value space; Otsu threshold, keep the largest component, fill holes.
Herbarium sheets (labels, rulers, many leaves) need LeafMachine2 (Weaver & Smith 2023); `leafmachine2_masks`
is an adapter that runs it when installed and returns the same mask format.
"""
from __future__ import annotations

import os
import subprocess

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, filters, measure, morphology


def load_rgb(path: str, max_side: int = 2000) -> np.ndarray:
    im = Image.open(path).convert("RGB")
    s = max_side / max(im.size)
    if s < 1:
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def segment_leaf(rgb: np.ndarray, dark_leaf: bool | None = None) -> np.ndarray:
    """Binary mask of the largest leaf. Works for photos on plain backgrounds and for rendered silhouettes."""
    hsv = color.rgb2hsv(rgb)
    sat, val = hsv[..., 1], hsv[..., 2]
    # Feature: saturation for green/coloured leaves, darkness for dried / ink silhouettes.
    if dark_leaf is None:
        dark_leaf = float(np.median(sat)) < 0.08 and float(sat.max()) < 0.25
    feat = (1.0 - val) if dark_leaf else np.maximum(sat, 1.0 - val)
    t = filters.threshold_otsu(feat)
    mask = feat > t
    mask = ndi.binary_opening(mask, structure=morphology.disk(1))
    lab = measure.label(mask)
    if lab.max() == 0:
        return mask
    largest = np.argmax(np.bincount(lab.ravel())[1:]) + 1
    mask = lab == largest
    return ndi.binary_fill_holes(mask)


def remove_petiole(mask: np.ndarray, frac: float = 0.025) -> tuple[np.ndarray, np.ndarray]:
    """Opening with a disk ~2.5% of the leaf size strips the petiole. Returns (blade, petiole_pixels)."""
    ys, xs = np.nonzero(mask)
    size = max(np.ptp(ys), np.ptp(xs)) if len(ys) else 1
    r = max(2, int(size * frac))
    blade = ndi.binary_opening(mask, structure=morphology.disk(r))
    lab = measure.label(blade)
    if lab.max() > 1:
        blade = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
    rest = measure.label(mask & ~blade)
    # petiole = the longest leftover piece (teeth and tips are short)
    best, bl = np.zeros_like(mask), 0
    for reg in measure.regionprops(rest):
        if reg.major_axis_length > bl:
            bl, best = reg.major_axis_length, rest == reg.label
    return blade, best


def leafmachine2_masks(image_path: str, out_dir: str) -> list[np.ndarray]:
    """Run LeafMachine2 (if installed via LEAFMACHINE2_DIR) and return per-leaf masks."""
    lm = os.environ.get("LEAFMACHINE2_DIR")
    if not lm or not os.path.isdir(lm):
        raise RuntimeError("LeafMachine2 not found. Clone https://github.com/Gene-Weaver/LeafMachine2 and set LEAFMACHINE2_DIR.")
    subprocess.run(["python", os.path.join(lm, "LeafMachine2.py"), "--dir_images_local", os.path.dirname(image_path), "--dir_output", out_dir], check=True)
    masks = []
    for root, _, files in os.walk(out_dir):
        for f in files:
            if f.endswith(".png") and "Segmentation_Whole_Leaf" in root:
                masks.append(np.asarray(Image.open(os.path.join(root, f)).convert("L")) > 127)
    return masks
