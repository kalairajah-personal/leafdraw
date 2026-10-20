// Slow-draw animation. Pen orders:
//   illustrator: outline → petiole/axes → primaries → secondaries → tertiaries → areoles → details → fill
//   growth:      petiole → primaries → secondaries → outline → tertiaries → areoles → fill
//   plotter:     greedy nearest-neighbour path order (what a pen plotter would do)
import { renderSVG, orderParts, ROLE_ORDER } from './svg.js';
import { polyLength, dist } from '../geom.js';

const GROWTH = ['petiole', 'stem', 'rachis', 'rachilla', 'petiolule', 'v1', 'v2', 'outline', 'hole', 'v3', 'v4', 'v5', 'stomata', 'sorus', 'spine', 'awn', 'cirrus', 'hair', 'fold', 'shade', 'shade-light', 'joint'];

export function penOrder(parts, mode = 'illustrator') {
  if (mode === 'growth') return parts.slice().sort((a, b) => (a.leaf ?? 0) - (b.leaf ?? 0) || GROWTH.indexOf(a.role) - GROWTH.indexOf(b.role));
  if (mode === 'plotter') return nearestNeighbour(parts);
  return orderParts(parts);
}

export function nearestNeighbour(parts) {
  const left = parts.slice();
  const out = [];
  let cur = [0, 0];
  while (left.length) {
    let bi = 0, bd = Infinity, rev = false;
    for (let i = 0; i < left.length; i++) {
      const p = left[i].pts;
      const d0 = dist(cur, p[0]), d1 = left[i].closed ? Infinity : dist(cur, p[p.length - 1]);
      if (d0 < bd) { bd = d0; bi = i; rev = false; }
      if (d1 < bd) { bd = d1; bi = i; rev = true; }
    }
    const [p] = left.splice(bi, 1);
    const pts = rev ? p.pts.slice().reverse() : p.pts;
    out.push({ ...p, pts });
    cur = pts[pts.length - 1];
  }
  return out;
}

export function renderAnimatedSVG(scene, opts = {}) {
  const order = penOrder(scene.parts, opts.order || 'illustrator');
  const total = opts.duration ?? 12;
  const lens = order.map((p) => Math.pow(Math.max(0.2, polyLength(p.pts, p.closed)), 0.8));
  const sum = lens.reduce((a, b) => a + b, 0) || 1;
  const strokeBudget = total * 0.86;
  let t = 0;
  const times = lens.map((l) => { const dur = Math.max(0.015, (l / sum) * strokeBudget); const r = { start: t, dur }; t += dur * 0.92; return r; });
  const hatchDur = Math.max(0.5, total * 0.1);
  const anim = { order, times, fillDelay: t, hatchDelay: t, hatchDur };
  return renderSVG(scene, { ...opts, animate: anim, taper: false });
}

export { ROLE_ORDER };
