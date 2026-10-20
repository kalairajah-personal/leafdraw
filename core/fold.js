// 2.5D modifiers: folding/rolling (vernation) and 3-D forms rendered as illustrator conventions
// (fold lines, rolled-margin bands, keel lines, pleat shading, cylinder shading).
import { add, mul, resample, pointAt, dist, chaikin, clamp, sub, norm } from './geom.js';
import { Field } from './field.js';

export function applyFold(geo, cfg, rng) {
  const f = cfg.folding, form = cfg.form3d;
  const decor = [];
  const L = cfg.L, W = geo.width;
  if ((!f || f === 'none') && (!form || form === 'flat')) return { geo, decor };
  const cx = geo.curveX || (() => 0);

  if (f === 'conduplicate' || f === 'reduplicate') {
    // Fold along midrib: far half seen edge-on as a thin sliver.
    const k = 0.16;
    const squash = (p) => [cx(p[1]) + (p[0] - cx(p[1])) * k, p[1]];
    const leftSquashed = geo.left.map(squash);
    geo = { ...geo, outline: [...geo.right, ...leftSquashed.slice(0, -1).reverse()], left: leftSquashed, foldedHalf: leftSquashed };
    decor.push({ role: 'fold', pts: geo.midrib.map((p) => [p[0] - 0.003 * L, p[1]]) });
    if (f === 'reduplicate') decor.push({ role: 'fold', pts: geo.midrib.map((p) => [p[0] + 0.006 * L, p[1]]) });
    geo.shadeRegion = [...leftSquashed, ...geo.midrib.slice().reverse()];
  }
  if (f === 'carinate') {
    const off = Math.max(0.25, W * 0.012);
    decor.push({ role: 'fold', pts: geo.midrib.map((p) => [p[0] - off, p[1]]) }, { role: 'fold', pts: geo.midrib.map((p) => [p[0] + off, p[1]]) });
  }
  if (f === 'involute' || f === 'revolute') {
    const field = new Field(geo.outline, [], 360);
    const band = clamp(W * 0.06, 0.3, 8);
    const ring = resample(geo.outline, Math.max(0.2, band / 3), true);
    const inner = ring.map((p) => add(p, mul(field.grad(p), band)));
    const keep = inner.filter((p, i) => dist(ring[i], geo.attach) > band * 3 && dist(ring[i], geo.apex) > band * 1.5);
    decor.push({ role: 'fold', pts: chaikin(keep, 1) });
    // band shading strokes
    for (let i = 0; i < ring.length; i += 2) {
      if (dist(ring[i], geo.attach) < band * 3) continue;
      decor.push({ role: f === 'revolute' ? 'shade' : 'shade-light', pts: [ring[i], inner[i]] });
    }
  }
  if (f === 'plicate') {
    // pleats: shade strips beside secondaries (added after venation via flag)
    geo.plicate = true;
  }
  if (f === 'cucullate') {
    const yH = geo.apex[1] - 0.12 * L;
    const field = new Field(geo.outline, [], 300);
    const [r, l] = field.widthAt(yH, cx(yH));
    const rim = chaikin([[cx(yH) - l, yH], [cx(yH), yH - 0.05 * L], [cx(yH) + r, yH]], 3);
    decor.push({ role: 'fold', pts: rim });
    for (let i = 0; i < 18; i++) {
      const p = pointAt(rim, (i + 0.5) / 18);
      decor.push({ role: 'shade', pts: [p, add(p, [0, 0.06 * L * (0.6 + 0.4 * Math.sin((i / 17) * Math.PI))])] });
    }
  }
  if (f === 'supervolute') {
    // Rolled leaf in bud: replace blade with a rolled cylinder glyph.
    const rw = W * 0.2, top = geo.apex[1];
    const outline = [[-rw, 0.04 * L], [rw, 0.04 * L], [rw * 0.7, top * 0.96], [0, top], [-rw * 0.5, top * 0.94]];
    const spiral = [];
    for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 3, r = rw * (1 - i / 48); spiral.push([r * Math.cos(a) * 0.9, 0.04 * L + r * Math.sin(a) * 0.35]); }
    decor.push({ role: 'fold', pts: spiral }, { role: 'fold', pts: [[rw * 0.85, 0.08 * L], [-rw * 0.2, top * 0.93]] });
    geo = { ...geo, outline: chaikin(outline, 2, true), right: [], left: [], toothTips: [], lobeTips: [], suppressVeins: true };
  }
  if (form === 'terete' || form === 'semiterete') {
    // cylinder shading: dense lines near one or both edges
    const n = 5;
    for (const side of form === 'terete' ? [1, -1] : [1]) {
      for (let k = 0; k < n; k++) {
        const f2 = 0.55 + 0.4 * (k / (n - 1));
        const pts = [];
        for (let i = 2; i <= 98; i++) {
          const y = (i / 100) * geo.apex[1];
          const fld = geo._field || (geo._field = new Field(geo.outline, [], 300));
          const [r, l] = fld.widthAt(y, cx(y));
          pts.push([cx(y) + side * (side > 0 ? r : l) * f2, y]);
        }
        decor.push({ role: 'shade', pts });
      }
    }
    geo = { ...geo, suppressVeins: true };
  }
  if (form === 'undulate') {
    const ring = resample(geo.outline, Math.max(0.3, L * 0.004), true);
    const field = new Field(geo.outline, [], 300);
    const wave = L * 0.1;
    let s = 0;
    for (let i = 1; i < ring.length; i++) {
      s += dist(ring[i], ring[i - 1]);
      if (Math.sin((s / wave) * Math.PI * 2) > 0.2 && i % 2 === 0 && dist(ring[i], geo.attach) > W * 0.2) {
        decor.push({ role: 'shade', pts: [ring[i], add(ring[i], mul(field.grad(ring[i]), W * 0.12 * (0.6 + 0.4 * rng.next())))] });
      }
    }
  }
  return { geo, decor };
}

// After venation: pleat shading beside secondaries.
export function pleatShading(veins, W, L) {
  const out = [];
  for (const v of veins) {
    if (v.role !== 'v2' && v.role !== 'v1') continue;
    const pts = resample(v.pts, Math.max(0.5, L * 0.012));
    for (let i = 1; i < pts.length - 1; i += 2) {
      const t = norm(sub(pts[i + 1], pts[i - 1]));
      const nrm = [-t[1], t[0]];
      out.push({ role: 'shade-light', pts: [pts[i], add(pts[i], mul(nrm, W * 0.022))] });
    }
  }
  return out;
}
