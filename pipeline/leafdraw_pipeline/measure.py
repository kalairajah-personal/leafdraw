"""Morphometrics from a leaf mask (mirrors core/measure.js so generated and real leaves are scored alike).

Orientation: principal axis of the blade; the base is the end where the petiole was removed.
All lengths are returned in mm when mm_per_px is given.
"""
from __future__ import annotations

import numpy as np
from skimage import measure

from .segment import remove_petiole


def _largest_contour(mask: np.ndarray) -> np.ndarray:
    cs = measure.find_contours(mask.astype(float), 0.5)
    c = max(cs, key=len)
    return c[:, ::-1]  # (x, y) in pixels, y down


def efd(contour: np.ndarray, harmonics: int = 20) -> np.ndarray:
    """Elliptic Fourier descriptors (Kuhl & Giardina 1982), normalised for size/rotation/start point."""
    d = np.diff(np.vstack([contour, contour[:1]]), axis=0)
    dt = np.hypot(d[:, 0], d[:, 1])
    keep = dt > 1e-9
    d, dt = d[keep], dt[keep]
    t = np.concatenate([[0], np.cumsum(dt)])
    T = t[-1]
    coeffs = np.zeros((harmonics, 4))
    for n in range(1, harmonics + 1):
        c = 2 * n * np.pi / T
        k = T / (2 * n * n * np.pi * np.pi)
        dcos = np.cos(c * t[1:]) - np.cos(c * t[:-1])
        dsin = np.sin(c * t[1:]) - np.sin(c * t[:-1])
        coeffs[n - 1] = k * np.array([np.sum(d[:, 0] / dt * dcos), np.sum(d[:, 0] / dt * dsin), np.sum(d[:, 1] / dt * dcos), np.sum(d[:, 1] / dt * dsin)])
    a1, b1, c1, d1 = coeffs[0]
    theta = 0.5 * np.arctan2(2 * (a1 * b1 + c1 * d1), a1 ** 2 - b1 ** 2 + c1 ** 2 - d1 ** 2)
    out = np.zeros_like(coeffs)
    for n in range(harmonics):
        ct, st = np.cos((n + 1) * theta), np.sin((n + 1) * theta)
        a, b, c, dd = coeffs[n]
        out[n] = [a * ct + b * st, -a * st + b * ct, c * ct + dd * st, -c * st + dd * ct]
    a1s, c1s = out[0, 0], out[0, 2]
    psi = np.arctan2(c1s, a1s)
    R = np.array([[np.cos(psi), np.sin(psi)], [-np.sin(psi), np.cos(psi)]])
    for n in range(harmonics):
        m = R @ out[n].reshape(2, 2)
        out[n] = m.ravel()
    return out / (np.hypot(a1s, c1s) or 1)


def count_teeth(contour: np.ndarray, length: float) -> tuple[int, float]:
    """Teeth = local maxima of protrusion above a smoothed contour. Returns (count, median height px)."""
    pts = contour
    n = len(pts)
    win = max(3, int(n * 0.02))
    k = np.ones(2 * win + 1) / (2 * win + 1)
    sm = np.stack([np.convolve(np.r_[pts[-win:, i], pts[:, i], pts[:win, i]], k, mode="valid") for i in range(2)], axis=1)
    cen = pts.mean(axis=0)
    prot = np.hypot(*(pts - cen).T) - np.hypot(*(sm - cen).T)
    thr = length * 0.0025
    peaks = (prot > thr) & (prot >= np.roll(prot, 1)) & (prot > np.roll(prot, -1))
    return int(peaks.sum()), float(np.median(prot[peaks])) if peaks.any() else 0.0


def lobe_depth(contour: np.ndarray, axis_pts: tuple) -> float:
    """Deepest sinus as fraction of hull→midrib distance (0 = unlobed, 1 = to the midrib)."""
    from scipy.spatial import ConvexHull
    hull = contour[ConvexHull(contour).vertices]
    base, apex = axis_pts
    ax = (apex - base) / (np.linalg.norm(apex - base) or 1)
    perp = np.array([-ax[1], ax[0]])
    L = np.linalg.norm(apex - base)
    best = 0.0
    for p in contour[:: max(1, len(contour) // 1500)]:
        t = np.dot(p - base, ax) / L
        if t < 0.12 or t > 0.88:
            continue
        n = abs(np.dot(p - base, perp))
        a, b = hull, np.roll(hull, -1, axis=0)
        ab = b - a
        tt = np.clip(np.einsum("ij,ij->i", p - a, ab) / np.maximum(np.einsum("ij,ij->i", ab, ab), 1e-9), 0, 1)
        dh = np.min(np.hypot(*(p - (a + ab * tt[:, None])).T))
        best = max(best, dh / (dh + n + 1e-9))
    return float(best)


def measure_leaf(mask: np.ndarray, mm_per_px: float = 1.0) -> dict:
    blade, petiole = remove_petiole(mask)
    ys, xs = np.nonzero(blade)
    P = np.stack([xs, ys], axis=1).astype(float)
    c = P.mean(axis=0)
    cov = np.cov((P - c).T)
    w, v = np.linalg.eigh(cov)
    ax = v[:, np.argmax(w)]
    proj = (P - c) @ ax
    lo, hi = proj.min(), proj.max()
    # base = end nearest the petiole pixels (else the narrower end)
    if petiole.sum() > 10:
        py, px = np.nonzero(petiole)
        pp = (np.stack([px, py], axis=1) - c) @ ax
        base_is_lo = abs(np.median(pp) - lo) < abs(np.median(pp) - hi)
    else:
        base_is_lo = True
    if not base_is_lo:
        ax, proj, lo, hi = -ax, -proj, -hi, -lo
    base_pt, apex_pt = c + ax * lo, c + ax * hi
    perp = np.array([-ax[1], ax[0]])
    across = (P - c) @ perp
    length = hi - lo
    bins = 60
    t = (proj - lo) / max(length, 1e-9)
    idx = np.clip((t * bins).astype(int), 0, bins - 1)
    widths = np.zeros(bins)
    for b in range(bins):
        sel = across[idx == b]
        widths[b] = np.ptp(sel) if len(sel) else 0
    width = np.ptp(across)
    contour = _largest_contour(blade)
    perim = float(np.sum(np.hypot(*np.diff(np.vstack([contour, contour[:1]]), axis=0).T)))
    area = float(blade.sum())
    teeth, th = count_teeth(contour, length)
    half = lambda tt: widths[min(bins - 1, int(tt * bins))] / 2
    s = mm_per_px
    return {
        "length": length * s, "width": width * s, "aspect": length / max(width, 1e-9),
        "widest": (int(np.argmax(widths)) + 0.5) / bins,
        "apexAngle": float(np.degrees(2 * np.arctan2(half(0.9), 0.1 * length))),
        "baseAngle": float(np.degrees(2 * np.arctan2(half(0.1), 0.1 * length))),
        "area": area * s * s, "perimeter": perim * s, "circularity": 4 * np.pi * area / perim ** 2,
        "teeth": teeth, "toothHeight": th * s, "teethPerCm": teeth / (perim * s / 10) if perim else 0,
        "lobeDepth": lobe_depth(contour, (base_pt, apex_pt)),
        "petiole": float(petiole.sum()) ** 0.5 * s,
        "efd": efd(contour, 12).round(5).tolist(),
    }
