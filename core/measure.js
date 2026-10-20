// Morphometrics on outlines (generated or traced). Used by tests (does the drawing match the
// numeric term definitions?) and mirrored in the Python pipeline (pipeline/leafdraw_pipeline/measure.py).
import { dist, polyLength, signedArea, resample, sub, norm, dot, cumLengths } from './geom.js';

/**
 * @param outline closed polygon
 * @param attach [x,y] petiole attachment
 * @param apex [x,y]
 * @returns { length, width, aspect, widest, area, perimeter, circularity, apexAngle, baseAngle, teeth, teethPerCm }
 */
export function measureOutline(outline, attach, apex) {
  const axis = norm(sub(apex, attach));
  const perpA = [-axis[1], axis[0]];
  let minT = Infinity, maxT = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of outline) {
    const v = sub(p, attach);
    const t = dot(v, axis), n = dot(v, perpA);
    minT = Math.min(minT, t); maxT = Math.max(maxT, t); minN = Math.min(minN, n); maxN = Math.max(maxN, n);
  }
  const length = dist(apex, attach);
  const width = maxN - minN;
  // widest position: scan slices along axis (from attachment to apex)
  const bins = 60;
  const wid = new Array(bins).fill(0).map(() => [Infinity, -Infinity]);
  for (const p of resample(outline, length / 400, true)) {
    const v = sub(p, attach);
    const t = dot(v, axis) / length;
    if (t < 0 || t >= 1) continue;
    const b = Math.min(bins - 1, Math.floor(t * bins));
    const n = dot(v, perpA);
    wid[b][0] = Math.min(wid[b][0], n); wid[b][1] = Math.max(wid[b][1], n);
  }
  let best = 0, bw = -1;
  wid.forEach(([a, b], i) => { if (b - a > bw && isFinite(a)) { bw = b - a; best = i; } });
  const area = Math.abs(signedArea(outline));
  const perimeter = polyLength(outline, true);
  // apex / base angle (MLA-style, measured to the outline 10% of blade length from the tip/base)
  const halfAt = (t) => { const b = Math.max(0, Math.min(bins - 1, Math.floor(t * bins))); return (wid[b][1] - wid[b][0]) / 2; };
  const apexAngle = 2 * Math.atan2(halfAt(0.9), 0.1 * length) * 180 / Math.PI;
  const baseAngle = 2 * Math.atan2(halfAt(0.1), 0.1 * length) * 180 / Math.PI;
  const teeth = countTeeth(outline, length);
  return {
    length, width, aspect: length / width, widest: (best + 0.5) / bins, area, perimeter,
    circularity: (4 * Math.PI * area) / (perimeter * perimeter), apexAngle, baseAngle,
    teeth, teethPerCm: teeth / (perimeter / 10),
  };
}

// Teeth = local maxima of outline distance to a heavily smoothed copy (detail above the envelope).
export function countTeeth(outline, length) {
  const pts = resample(outline, length / 500, true);
  const n = pts.length;
  const win = Math.max(3, Math.round(n * 0.02));
  const sm = pts.map((_, i) => {
    let sx = 0, sy = 0;
    for (let k = -win; k <= win; k++) { const q = pts[(i + k + n) % n]; sx += q[0]; sy += q[1]; }
    return [sx / (2 * win + 1), sy / (2 * win + 1)];
  });
  const cx = pts.reduce((a, p) => a + p[0], 0) / n, cy = pts.reduce((a, p) => a + p[1], 0) / n;
  const prot = pts.map((p, i) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(sm[i][0] - cx, sm[i][1] - cy));
  const thr = length * 0.0025;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = prot[(i - 1 + n) % n], b = prot[i], c = prot[(i + 1) % n];
    if (b > thr && b >= a && b > c) count++;
  }
  return count;
}

// Lobe depth: fraction of the way from the convex hull to the midrib reached by the deepest sinus.
export function lobeDepth(outline, attach, apex) {
  const hull = convexHull(outline);
  const axis = norm(sub(apex, attach));
  const perpA = [-axis[1], axis[0]];
  let best = 0;
  const Lx = dist(apex, attach);
  for (const p of outline) {
    const tt = dot(sub(p, attach), axis) / Lx;
    if (tt < 0.12 || tt > 0.88) continue;
    const n = Math.abs(dot(sub(p, attach), perpA));
    // distance from hull boundary along the perpendicular, approximate by distance to hull
    let dh = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      const ab = sub(b, a), ap = sub(p, a);
      const t = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)));
      dh = Math.min(dh, dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]));
    }
    const ratio = dh / (dh + n || 1);
    if (ratio > best) best = ratio;
  }
  return best;
}

export function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Fraction of polyline points inside polygon (vein containment check).
export function insideFraction(lines, outline, pip) {
  let tot = 0, ins = 0;
  for (const l of lines) for (const p of l) { tot++; if (pip(p, outline)) ins++; }
  return tot ? ins / tot : 1;
}

export { cumLengths };
