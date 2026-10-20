"""Herbarium sheet → individual leaf masks (no deep model; runs in CI).

Pressed plant material is darker and more saturated (green→brown) than the paper; labels, barcodes and
rulers are achromatic; colour charts are saturated *rectangles*. Steps:
  1. plant mask: chroma + darkness feature, Otsu over the sheet, drop achromatic pixels
  2. cut stems/petioles: opening with a disk sized to stem width → blades fall apart into components
  3. keep clean, isolated blades: not touching the border, not rectangular, plausible size, solidity
     consistent with the expected lobing, area near the sheet's median leaf (overlaps are outliers)
  4. regrow each blade into the unopened mask (so the petiole stub is kept for base/apex orientation)
Returns [(mask_crop, bbox)] plus a debug overlay. Measurements then go through measure.measure_leaf,
the same code that measures rendered leaves, so real and drawn leaves are scored alike.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import color, filters, measure, morphology


def plant_mask(rgb: np.ndarray) -> np.ndarray:
    hsv = color.rgb2hsv(rgb)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    lab = color.rgb2lab(rgb)
    chroma = np.hypot(lab[..., 1], lab[..., 2]) / 60.0
    paper_v = np.percentile(v, 75)
    feat = 0.6 * np.clip((paper_v - v) / max(paper_v, 1e-3), 0, 1) + 0.4 * np.clip(chroma, 0, 1)
    t = filters.threshold_otsu(feat)
    m = feat > max(t, 0.12)
    # Achromatic ink, barcodes, black rulers: low saturation regardless of darkness.
    m &= s > 0.10
    # Plant hues: yellow-green → brown → dark (exclude blue/purple chart patches).
    m &= (h < 0.48) | (h > 0.92) | (v < 0.25)
    m = ndi.binary_opening(m, structure=morphology.disk(1))
    return ndi.binary_fill_holes(m)


def split_leaves(mask: np.ndarray, lobed: bool = False, stem_frac: float = 0.0045):
    H, W = mask.shape
    r = max(2, int(round(max(H, W) * stem_frac)))
    opened = ndi.binary_opening(mask, structure=morphology.disk(r))
    lab = measure.label(opened)
    props = [p for p in measure.regionprops(lab)]
    img_area = H * W
    cands = []
    for p in props:
        if p.area < img_area * 0.0015 or p.area > img_area * 0.2:
            continue
        y0, x0, y1, x1 = p.bbox
        if y0 <= 2 or x0 <= 2 or y1 >= H - 2 or x1 >= W - 2:
            continue
        if p.extent > 0.86 and p.solidity > 0.97:  # rectangles: labels, colour chart, ruler
            continue
        if p.solidity < (0.42 if lobed else 0.8):
            continue
        if p.axis_major_length < 25:
            continue
        cands.append(p)
    if not cands:
        return [], r
    med = float(np.median([p.area for p in cands]))
    keep = [p for p in cands if 0.35 * med <= p.area <= 2.6 * med]
    out = []
    for p in keep:
        blade = lab == p.label
        # regrow into the original mask a little (petiole stub, teeth tips), bounded around the blade
        gl = measure.label(ndi.binary_dilation(blade, structure=morphology.disk(r * 3)) & mask)
        ids = gl[blade]
        ids = ids[ids > 0]
        grown = (gl == np.bincount(ids).argmax()) if ids.size else blade
        y0, x0, y1, x1 = p.bbox
        pad = r * 4
        Y0, X0, Y1, X1 = max(0, y0 - pad), max(0, x0 - pad), min(H, y1 + pad), min(W, x1 + pad)
        out.append((grown[Y0:Y1, X0:X1], (X0, Y0, X1, Y1)))
    return out, r


def overlay(rgb: np.ndarray, leaves, size: int = 520) -> Image.Image:
    im = Image.fromarray((rgb * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    for m, (x0, y0, x1, y1) in leaves:
        for c in measure.find_contours(m.astype(float), 0.5):
            pts = [(float(x) + x0, float(y) + y0) for y, x in c[:: max(1, len(c) // 300)]]
            if len(pts) > 2:
                d.line(pts + [pts[0]], fill=(255, 0, 180), width=max(2, im.width // 400))
    im.thumbnail((size, size))
    return im
