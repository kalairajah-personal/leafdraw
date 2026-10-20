// leafdraw core API.
//   draw(spec, seed, options) → Scene   (pure, deterministic, no I/O)
//   renderSVG / renderAnimatedSVG / renderGcode / renderHPGL / sceneToJSON
import { makeRng } from './rng.js';
import { resolve } from './resolve.js';
import { buildSingle } from './leaf.js';
import { buildCompound } from './compound.js';
import { buildShoot } from './shoot.js';
import { bbox } from './geom.js';
import { validate, RULES, DEFAULTS } from './constraints.js';
import { TRAITS, GLOSSARY, findTerm, lookup, parseTraitList, listTerms } from './traits.js';
export { renderSVG } from './render/svg.js';
export { renderAnimatedSVG, penOrder } from './render/animate.js';
export { renderGcode, renderHPGL, plotterPaths } from './render/plotter.js';
export { resolvePalette } from './palette.js';
export { TRAITS, GLOSSARY, findTerm, lookup, parseTraitList, listTerms, validate, RULES, DEFAULTS, resolve };

export const VERSION = '0.2.1';
const registry = new Map();

export function registerSpecies(list) {
  for (const s of list) {
    registry.set(s.id, s);
    if (s.name) registry.set(s.name.toLowerCase(), s);
    for (const c of s.common || []) registry.set(String(c).toLowerCase(), s);
  }
}
export function getSpecies(key) {
  if (!key) return null;
  return registry.get(key) || registry.get(String(key).toLowerCase()) || registry.get(String(key).toLowerCase().replace(/\s+/g, '-')) || null;
}
export function listSpecies() { return [...new Set(registry.values())]; }

/**
 * @param spec species object or {traits, params}; or a species id/name string; or trait list string ("ovate, serrate")
 * @param seed integer
 * @param options {view:'leaf'|'shoot', detail:'auto'|'full'|'medium'|'low', phyllotaxis, nodes}
 */
export function draw(spec, seed = 1, options = {}) {
  if (typeof spec === 'string') spec = getSpecies(spec) || { id: 'custom', name: 'Custom leaf', traits: parseTraitList(spec), params: {} };
  const key = spec.id || spec.name || JSON.stringify(spec.traits || {});
  const rng = makeRng(seed, key);
  const cfg = resolve(spec, rng.fork('resolve'));
  if (!cfg.validation.ok && !options.force) {
    const e = new Error('Invalid trait combination: ' + cfg.validation.errors.map((x) => x.msg).join(' '));
    e.validation = cfg.validation;
    throw e;
  }
  let built;
  const view = options.view || 'leaf';
  const one = (r) => (cfg.engine === 'compound' || cfg.engine === 'frond')
    ? buildCompound(resolve(spec, r.fork('resolve')), r, options)
    : buildSingle(r === rng ? cfg : resolve(spec, r.fork('resolve')), r, options);
  if (view === 'shoot' || cfg.traits.plantGroup === 'conifer-scale' && view !== 'leaf-only') {
    built = buildShoot(cfg, rng, (k) => one(rng.fork('leaf' + k)), { ...options, detail: options.detail || 'medium' });
  } else built = one(rng);

  const parts = built.parts.filter((p) => p.pts && p.pts.length >= 2);
  const bb = bbox([...parts.map((p) => p.pts), ...built.fills.flatMap((f) => f.rings)]);
  return {
    version: 1,
    units: 'mm',
    parts,
    fills: built.fills,
    bbox: bb,
    meta: {
      id: spec.id || 'custom', name: spec.name || 'Custom leaf', common: spec.common || [], family: spec.family || '',
      seed, view, engine: cfg.engine, L: cfg.L, traits: cfg.traits, validation: cfg.validation,
      palette: spec.palette || null, group: cfg.traits.plantGroup, tier: spec.tier || 'C', sources: spec.sources || [],
    },
  };
}

export function sceneToJSON(scene, round = 3) {
  const r = (v) => Math.round(v * 10 ** round) / 10 ** round;
  return JSON.stringify({ ...scene, parts: scene.parts.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [r(x), r(y)]) })), fills: scene.fills.map((f) => ({ role: f.role, rings: f.rings.map((ring) => ring.map(([x, y]) => [r(x), r(y)])) })) });
}

// Compose several scenes into one grid (herbarium plate / seed sheet).
export function composeScenes(scenes, { cols = 3, gap = null } = {}) {
  const size = Math.max(...scenes.map((s) => Math.max(s.bbox.w, s.bbox.h)));
  const g = gap ?? size * 0.12;
  const cw = Math.max(...scenes.map((s) => s.bbox.w)) + g, ch = Math.max(...scenes.map((s) => s.bbox.h)) + g;
  const parts = [], fills = [];
  scenes.forEach((s, i) => {
    const cx = (i % cols) * cw, cy = -Math.floor(i / cols) * ch;
    const dx = cx - s.bbox.x0 + (cw - g - s.bbox.w) / 2, dy = cy - s.bbox.y0;
    const mv = (pts) => pts.map(([x, y]) => [x + dx, y + dy]);
    for (const p of s.parts) parts.push({ ...p, pts: mv(p.pts), leaf: (p.leaf ?? 0) + i * 10000 });
    for (const f of s.fills) fills.push({ ...f, rings: f.rings.map(mv), hatchRing: f.hatchRing ? mv(f.hatchRing) : null, leaf: (f.leaf ?? 0) + i * 10000 });
  });
  return { ...scenes[0], parts, fills, bbox: bbox([...parts.map((p) => p.pts), ...fills.flatMap((f) => f.rings)]), meta: { ...scenes[0].meta, seed: scenes.map((s) => s.meta.seed).join(',') } };
}

export { measureOutline, lobeDepth, countTeeth } from './measure.js';
export { autoSpec, resolveName, fetchTaxon } from './auto.js';
export { extractTraits } from './text.js';
export { taxonPrior, FAMILY, GENUS } from './families.js';
