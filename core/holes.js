// Surface openings: fenestrate (large elongated windows, e.g. Monstera) and perforate (many small holes).
import { poissonInPoly, add, mul, rot, dirFrom, pointInPoly, clamp } from './geom.js';
import { Field } from './field.js';

export function buildHoles(geo, cfg, rng) {
  const kind = cfg.surface?.holes;
  if (!kind) return [];
  const L = cfg.L, W = geo.width;
  const field = new Field(geo.outline, [], 300);
  const holes = [];
  if (kind === 'perforate') {
    const r = clamp((cfg.surface.holeSize ?? 0.025) * W, 0.4, 20);
    const pts = poissonInPoly(geo.outline, r * 4, rng, cfg.surface.holeCount ?? 60);
    for (const c of pts) {
      if (field.d(c) < r * 2.5 || Math.abs(c[0] - (geo.curveX?.(c[1]) ?? 0)) < r * 2) continue;
      const rr = r * (0.6 + 0.8 * rng.next());
      holes.push(ellipse(c, rr, rr * (0.8 + 0.3 * rng.next()), rng.next() * Math.PI, 14));
    }
  } else {
    // Fenestrate: rows of elongated windows between midrib and margin, oriented along secondaries.
    const ang = ((cfg.venation.secAngleBase + cfg.venation.secAngleApex) / 2);
    const rows = 2;
    const count = Math.round(cfg.surface.holeCount ?? 7);
    for (const side of [1, -1]) for (let row = 0; row < rows; row++) {
      for (let i = 0; i < count; i++) {
        const t = 0.14 + (0.72 * (i + 0.5 + (rng.next() - 0.5) * 0.4)) / count;
        const y = t * geo.apex[1];
        const [hr, hl] = field.widthAt(y, geo.curveX?.(y) ?? 0);
        const hw = side > 0 ? hr : hl;
        if (hw < W * 0.12) continue;
        const f = row === 0 ? 0.3 : 0.62;
        const c = [(geo.curveX?.(y) ?? 0) + side * hw * (f + (rng.next() - 0.5) * 0.06), y];
        const a = hw * (cfg.surface.holeSize ?? 0.14) * (row === 0 ? 1.1 : 0.85) * (0.8 + 0.4 * rng.next());
        const b = a * 0.32;
        const h = ellipse(c, a, b, Math.PI / 2 - side * ang, 18);
        if (h.every((p) => pointInPoly(p, geo.outline) && field.d(p) > W * 0.03)) holes.push(h);
      }
    }
  }
  return holes;
}

function ellipse(c, a, b, ang, n) {
  return Array.from({ length: n }, (_, k) => add(c, rot([a * Math.cos((2 * Math.PI * k) / n), b * Math.sin((2 * Math.PI * k) / n)], ang)));
}
