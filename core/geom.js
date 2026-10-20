// 2D geometry helpers. Points are [x, y]; math frame (y up). Units: mm.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const rot = (a, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; };
export const perp = (a) => [-a[1], a[0]];
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angleOf = (v) => Math.atan2(v[1], v[0]);
export const dirFrom = (ang) => [Math.cos(ang), Math.sin(ang)];

export function polyLength(pts, closed = false) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 1) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

export function cumLengths(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

// Point at fraction s (0..1) of arc length.
export function pointAt(pts, s, cum = cumLengths(pts)) {
  const L = cum[cum.length - 1];
  const target = clamp(s, 0, 1) * L;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < target) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1;
  return lerp(pts[lo], pts[hi], (target - cum[lo]) / seg);
}

export function tangentAt(pts, s, cum = cumLengths(pts)) {
  const e = 0.01;
  return norm(sub(pointAt(pts, Math.min(1, s + e), cum), pointAt(pts, Math.max(0, s - e), cum)));
}

// Uniform resample by step length.
export function resample(pts, step, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts;
  const cum = cumLengths(src);
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.round(L / step));
  const out = [];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) out.push(pointAt(src, i / n, cum));
  return out;
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]);
  return a / 2;
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function distToSeg(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const t = clamp(dot(ap, ab) / (dot(ab, ab) || 1), 0, 1);
  return dist(p, add(a, mul(ab, t)));
}

export function distToPoly(p, poly, closed = true) {
  let d = Infinity;
  const n = poly.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) d = Math.min(d, distToSeg(p, poly[i], poly[(i + 1) % n]));
  return d;
}

export function closestOnPoly(p, poly, closed = true) {
  let best = { d: Infinity, pt: poly[0], i: 0, t: 0 };
  const n = poly.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = poly[i], b = poly[(i + 1) % n], ab = sub(b, a);
    const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
    const q = add(a, mul(ab, t));
    const d = dist(p, q);
    if (d < best.d) best = { d, pt: q, i, t };
  }
  return best;
}

export function segIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, pt: [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])] };
}

// First intersection of ray (origin, dir) with polyline; returns {pt, dist, s} or null.
export function rayHitPolyline(o, dir, pl, maxLen = 1e4) {
  const far = add(o, mul(dir, maxLen));
  let best = null;
  for (let i = 0; i < pl.length - 1; i++) {
    const h = segIntersect(o, far, pl[i], pl[i + 1]);
    if (h && h.t * maxLen > 1e-6 && (!best || h.t < best.t)) best = { ...h, seg: i };
  }
  if (!best) return null;
  return { pt: best.pt, dist: best.t * maxLen, seg: best.seg };
}

// Clip straight segment a→b to polygon (even-odd, holes allowed as extra rings). Returns inside pieces.
export function clipSegmentToRings(a, b, rings) {
  const ts = [0, 1];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const h = segIntersect(a, b, ring[j], ring[i]);
      if (h) ts.push(h.t);
    }
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-9) continue;
    const mid = lerp(a, b, (ts[i] + ts[i + 1]) / 2);
    let inside = false;
    for (const ring of rings) if (pointInPoly(mid, ring)) inside = !inside;
    if (inside) out.push([lerp(a, b, ts[i]), lerp(a, b, ts[i + 1])]);
  }
  return out;
}

// Split polyline into pieces outside any of the given polygons.
export function cutPolylineByPolys(pl, polys, step = 0.25) {
  if (!polys.length) return [pl];
  const pb = bbox([pl]);
  polys = polys.filter((h) => { const b = h._bb || (h._bb = bbox([h])); return !(b.x1 < pb.x0 || b.x0 > pb.x1 || b.y1 < pb.y0 || b.y0 > pb.y1); });
  if (!polys.length) return [pl];
  const boxes = polys.map((h) => h._bb);
  const dense = resample(pl, step);
  const pieces = [];
  let cur = [];
  for (const p of dense) {
    const inHole = polys.some((h, k) => { const b = boxes[k]; return p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 && pointInPoly(p, h); });
    if (inHole) { if (cur.length > 1) pieces.push(cur); cur = []; } else cur.push(p);
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

export function bbox(ptsList) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pts of ptsList) for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function chaikin(pts, iters = 2, closed = false) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = [];
    const n = p.length;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push(lerp(a, b, 0.25), lerp(a, b, 0.75));
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

// Cubic bezier sampler.
export function bezier(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

// Outward normals for a closed polygon (any orientation).
export function vertexNormals(poly, closed = true) {
  const ccw = signedArea(poly) > 0;
  const n = poly.length;
  return poly.map((p, i) => {
    const a = poly[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = poly[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = norm(sub(b, a));
    return ccw ? [t[1], -t[0]] : [-t[1], t[0]];
  });
}

export function transformPts(pts, { scale = 1, sx = scale, sy = scale, rotate = 0, tx = 0, ty = 0 } = {}) {
  const c = Math.cos(rotate), s = Math.sin(rotate);
  return pts.map(([x, y]) => { x *= sx; y *= sy; return [x * c - y * s + tx, x * s + y * c + ty]; });
}

// Simple spatial hash for proximity queries.
export class SpatialHash {
  constructor(cell = 2) { this.cell = cell; this.map = new Map(); }
  key(x, y) { return (Math.floor(x / this.cell) * 73856093) ^ (Math.floor(y / this.cell) * 19349663); }
  insert(p, data) { const k = this.key(p[0], p[1]); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push({ p, data }); }
  near(p, r) {
    const out = [], c = this.cell, n = Math.ceil(r / c);
    const cx = Math.floor(p[0] / c), cy = Math.floor(p[1] / c);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const k = ((cx + i) * 73856093) ^ ((cy + j) * 19349663);
      const b = this.map.get(k);
      if (b) for (const e of b) if (dist(e.p, p) <= r) out.push(e);
    }
    return out;
  }
  nearest(p, r) {
    let best = null, bd = Infinity;
    for (const e of this.near(p, r)) { const d = dist(e.p, p); if (d < bd) { bd = d; best = e; } }
    return best ? { ...best, d: bd } : null;
  }
}

// Poisson-disk sampling inside polygon (Bridson-lite via dart throwing with grid).
export function poissonInPoly(poly, r, rng, maxPts = 4000, holes = []) {
  const bb = bbox([poly]);
  const hash = new SpatialHash(r);
  const out = [];
  const tries = Math.min(maxPts * 8, Math.ceil((bb.w * bb.h) / (r * r)) * 6);
  for (let i = 0; i < tries && out.length < maxPts; i++) {
    const p = [bb.x0 + rng.next() * bb.w, bb.y0 + rng.next() * bb.h];
    if (!pointInPoly(p, poly) || holes.some((h) => pointInPoly(p, h))) continue;
    if (hash.near(p, r).length) continue;
    hash.insert(p); out.push(p);
  }
  return out;
}

// Remove self-intersection loops from an open polyline (keeps the outer path).
export function removeLoops(pts) {
  const cell = (() => { const b = bbox([pts]); return Math.max(b.w, b.h) / 64 || 1; })();
  let out = pts.slice();
  for (let guard = 0; guard < 50; guard++) {
    const grid = new Map();
    const key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    let found = null;
    for (let i = 0; i < out.length - 1 && !found; i++) {
      const a = out[i], b = out[i + 1];
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const cand = new Set();
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const k = gx + ',' + gy; const l = grid.get(k); if (l) for (const j of l) cand.add(j);
        if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
      }
      for (const j of cand) {
        if (j >= i - 1) continue;
        const h = segIntersect(out[j], out[j + 1], a, b);
        if (h) { found = { j, i, pt: h.pt }; break; }
      }
    }
    if (!found) break;
    out = [...out.slice(0, found.j + 1), found.pt, ...out.slice(found.i + 1)];
  }
  return out;
}
