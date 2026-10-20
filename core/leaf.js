// Single-leaf pipeline: outline engine → holes → folding → venation → decorations → parts.
import { buildBlade } from './engines/blade.js';
import { buildPolar } from './engines/polar.js';
import { buildVenation } from './venation.js';
import { buildHoles } from './holes.js';
import { applyFold, pleatShading } from './fold.js';
import { bezier, add, resample, chaikin, cutPolylineByPolys } from './geom.js';
import { Field } from './field.js';

export function detailFor(L, requested) {
  if (requested && requested !== 'auto') return requested;
  if (L < 8) return 'low';
  if (L < 30) return 'medium';
  return 'full';
}

export function buildSingle(cfg, rng, opts = {}) {
  const detail = detailFor(cfg.L, opts.detail);
  const c = structuredCloneCfg(cfg);
  if (c.engine === 'needle') {
    c.venation = { ...c.venation, primary: 'pinnate', secondary: 'none', tertiary: 'none', areoles: 'none', marginal: 'none' };
    if (c.apex.kind === 'angle') c.apex.angle = Math.min(c.apex.angle, 0.6);
    c.margin = c.margin.profile === 'saw' || c.margin.profile === 'tri' ? c.margin : { ...c.margin, profile: 'none' };
  }
  if (detail === 'low') c.venation = { ...c.venation, tertiary: 'none', areoles: 'none', intersecondary: 0 };
  if (detail === 'medium') c.venation = { ...c.venation, areoles: 'none' };

  let geo = c.engine === 'polar' ? buildPolar(c, rng.fork('outline')) : buildBlade(c, rng.fork('outline'));
  const holes = buildHoles(geo, c, rng.fork('holes'));
  const folded = applyFold(geo, c, rng.fork('fold'));
  geo = folded.geo;
  const parts = [];
  parts.push({ role: 'outline', pts: geo.outline, closed: true });

  let veins = [], sori = [];
  if (!geo.suppressVeins) {
    const ven = buildVenation(geo, c, rng.fork('veins'), { holes, cells: c.lobes?.kind && c.lobes.kind !== 'none' ? 760 : detail === 'full' ? 520 : 320 });
    veins = ven.veins; sori = ven.sori;
  } else if (geo.midrib && c.engine === 'needle') veins = [{ role: 'v1', pts: geo.midrib }];
  if (c.engine === 'needle' && c.traits.plantGroup === 'conifer-needle' && !geo.suppressVeins) {
    const fld = new Field(geo.outline, [], 300);
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 6; i <= 92; i++) { const y = (i / 100) * geo.apex[1]; const [r, l] = fld.widthAt(y, 0); pts.push([side * (side > 0 ? r : l) * 0.45, y]); }
      parts.push({ role: 'stomata', pts });
    }
  }
  for (const v of veins) parts.push(v);
  for (const h of holes) parts.push({ role: 'hole', pts: h, closed: true });
  for (const s of sori) parts.push({ role: 'sorus', pts: s, closed: true });
  for (const e of geo.extras || []) parts.push(e);
  for (const d of folded.decor) parts.push(d);
  if (geo.plicate) parts.push(...pleatShading(veins, geo.width, c.L));

  // Petiole.
  const pl = (c.petiole || 0) * c.L;
  if (pl > 0 && !opts.noPetiole) {
    const a = geo.attach;
    if (geo.peltate) {
      // seen from above: petiole hidden beneath; mark attachment
      const r = Math.max(0.6, c.L * 0.012);
      parts.push({ role: 'petiole', pts: Array.from({ length: 13 }, (_, k) => add(a, [r * Math.cos((k / 12) * 2 * Math.PI), r * Math.sin((k / 12) * 2 * Math.PI)])), closed: true });
    } else {
      const bend = (rng.next() - 0.5) * pl * 0.25;
      parts.push({ role: 'petiole', pts: bezier(a, add(a, [0, -pl * 0.35]), add(a, [bend, -pl * 0.7]), add(a, [bend * 1.4, -pl]), 16) });
    }
  }
  // Perfoliate: stem passes through the blade; draw the stem where it is not covered by the blade.
  if (c.traits.attachment === 'perfoliate' && !opts.noPetiole) {
    const top = geo.apex[1];
    const stem = [[0, -0.35 * c.L], [0, top * 0.18]];
    for (const seg of cutPolylineByPolys(stem, [geo.outline], Math.max(0.2, c.L / 300))) parts.push({ role: 'stem', pts: seg });
    const r = Math.max(0.6, c.L * 0.018), cy = top * 0.12;
    parts.push({ role: 'stem', pts: Array.from({ length: 17 }, (_, k) => [r * Math.cos((k / 16) * 2 * Math.PI), cy + r * Math.sin((k / 16) * 2 * Math.PI)]), closed: true });
  }
  let hatchRing = null;
  if (geo.left && geo.left.length > 2 && geo.midrib) hatchRing = [...geo.left, ...geo.midrib.slice().reverse()];
  else if (geo.peltate) hatchRing = geo.left && geo.left.length > 2 ? [...geo.left, [0, 0]] : null;
  const fills = [{ role: 'blade', rings: [geo.outline, ...holes], hatchRing, shade: geo.shadeRegion || null, ref: c.L }];
  const ref = c.engine === 'needle' ? Math.min(c.L, (geo.width || c.L) * 45) : c.L;
  for (const p of parts) p.ref = ref;
  fills[0].ref = ref;
  return { parts, fills, geo, holes, detail };
}

function structuredCloneCfg(cfg) {
  return { ...cfg, venation: { ...cfg.venation }, margin: { ...cfg.margin }, apex: { ...cfg.apex }, base: { ...cfg.base }, blade: { ...cfg.blade }, lobes: { ...cfg.lobes }, polar: cfg.polar ? { ...cfg.polar } : undefined };
}
