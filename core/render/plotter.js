// Pen-plotter output: G-code and HPGL. Paths fit to page, ordered nearest-neighbour to cut pen travel.
import { nearestNeighbour } from './animate.js';
import { hatchLines } from './svg.js';
import { bbox } from '../geom.js';

export function plotterPaths(scene, opts = {}) {
  const roles = opts.roles || null;
  let paths = scene.parts.filter((p) => !roles || roles.includes(p.role)).filter((p) => p.role !== 'sorus' || opts.sori !== false).map((p) => ({ role: p.role, pts: p.closed ? [...p.pts, p.pts[0]] : p.pts }));
  if (opts.hatch) {
    const size = Math.max(scene.bbox.w, scene.bbox.h);
    for (const f of scene.fills) if (f.hatchRing) for (const seg of hatchLines([f.hatchRing, ...f.rings.slice(1)], Math.max(0.5, Math.max((f.ref || size) * 0.0068, size * 0.0011) * 3.4), Math.PI / 4)) paths.push({ role: 'hatch', pts: seg });
  }
  // Fit to page.
  const page = opts.page || { w: 210, h: 297 };
  const margin = opts.margin ?? 10;
  const bb = bbox(paths.map((p) => p.pts));
  const s = opts.trueSize ? 1 : Math.min((page.w - 2 * margin) / bb.w, (page.h - 2 * margin) / bb.h);
  const ox = (page.w - bb.w * s) / 2, oy = (page.h - bb.h * s) / 2;
  paths = paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [ox + (x - bb.x0) * s, oy + (y - bb.y0) * s]) }));
  return { paths: nearestNeighbour(paths), scale: s, page };
}

export function renderGcode(scene, opts = {}) {
  const { paths, scale } = plotterPaths(scene, opts);
  const up = opts.penUp || 'G0 Z5', down = opts.penDown || 'G1 Z0 F1000';
  const feed = opts.feed || 3000, travel = opts.travel || 6000;
  const f = (v) => v.toFixed(3);
  const lines = [`; leafdraw ${scene.meta.name} seed ${scene.meta.seed} scale ${scale.toFixed(4)}`, 'G21 ; mm', 'G90 ; absolute', up];
  for (const p of paths) {
    lines.push(`G0 X${f(p.pts[0][0])} Y${f(p.pts[0][1])} F${travel}`, down);
    for (let i = 1; i < p.pts.length; i++) lines.push(`G1 X${f(p.pts[i][0])} Y${f(p.pts[i][1])} F${feed}`);
    lines.push(up);
  }
  lines.push('G0 X0 Y0', 'M2');
  return lines.join('\n');
}

export function renderHPGL(scene, opts = {}) {
  const { paths } = plotterPaths(scene, opts);
  const u = (v) => Math.round(v * 40); // 40 plotter units per mm
  const out = ['IN;', 'SP1;'];
  for (const p of paths) {
    out.push(`PU${u(p.pts[0][0])},${u(p.pts[0][1])};`);
    out.push('PD' + p.pts.slice(1).map(([x, y]) => `${u(x)},${u(y)}`).join(',') + ';');
  }
  out.push('PU;SP0;');
  return out.join('\n');
}
