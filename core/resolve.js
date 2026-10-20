// Spec (traits + numeric params) → concrete engine config, sampled with a seeded RNG.
// Precedence: species params (mean ± sd) > trait numeric definitions > defaults.
import { findTerm } from './traits.js';
import { validate } from './constraints.js';

const D2R = Math.PI / 180;

function mid(range, rng, spread = 0.6) {
  if (range == null) return undefined;
  if (typeof range === 'number') return range;
  const [lo, hi] = range;
  return lo + (hi - lo) * (0.5 - spread / 2 + spread * rng.next());
}

// Species params may be number | [mean, sd] | {mean, sd}. Returns sampled number or undefined.
function sp(params, key, rng, lo = -Infinity, hi = Infinity) {
  const v = params?.[key];
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return rng.sample(v, lo, hi);
  if (typeof v === 'object' && 'mean' in v) return rng.sample([v.mean, v.sd || 0], lo, hi);
  return v;
}

const pickEngine = (t) => {
  if (t.plantGroup === 'fern') return 'frond';
  if (t.structure !== 'simple') return 'compound';
  const sh = findTerm('shape', t.shape);
  if (sh?.engine === 'needle' || ['terete', 'semiterete'].includes(t.form3d)) return 'needle';
  const lob = findTerm('lobation', t.lobation);
  if (t.attachment === 'peltate' || lob?.kind === 'palmate' || sh?.engine === 'polar') return 'polar';
  return 'blade';
};

export function resolve(spec, rng) {
  const params = spec.params || {};
  const v = validate({ ...(spec.traits || {}) });
  const t = v.traits;
  const engine = spec.engine || pickEngine(t);
  const L = sp(params, 'length', rng, 2, 2000) ?? defaultLength(t);

  const cfg = { engine, traits: t, validation: v, L, params, palette: spec.palette, name: spec.name, id: spec.id };

  const sh = findTerm('shape', t.shape) || {};
  const ap = findTerm('apex', t.apex) || {};
  const ba = findTerm('base', t.base) || {};
  const lob = findTerm('lobation', t.lobation) || {};
  const mg = findTerm('margin', t.margin) || {};
  const att = findTerm('attachment', t.attachment) || {};

  cfg.petiole = sp(params, 'petiole', rng, 0, 5) ?? mid(att.petiole ?? [0.15, 0.35], rng);
  if (engine === 'needle' || t.attachment === 'sessile' || t.attachment === 'perfoliate') cfg.petiole = params.petiole != null ? cfg.petiole : 0;

  // ---- blade outline ----
  cfg.blade = {
    aspect: sp(params, 'aspect', rng, 0.3, 500) ?? mid(sh.aspect || [1.6, 2.4], rng),
    widest: sp(params, 'widest', rng, 0.02, 0.95) ?? mid(sh.widest || [0.45, 0.55], rng),
    sharp: sp(params, 'sharp', rng, 0.6, 4) ?? sh.sharp ?? 1.3,
    flat: sp(params, 'flat', rng, 1, 10) ?? sh.flat ?? 1,
    angular: params.angular ?? !!sh.angular,
    curve: sp(params, 'curve', rng, -0.5, 0.5) ?? (sh.curve ? mid(sh.curve, rng) : 0),
    waist: sh.waist ? { pos: mid(sh.waist.pos, rng), depth: sp(params, 'waistDepth', rng, 0, 0.6) ?? mid(sh.waist.depth, rng) } : null,
    asym: sp(params, 'asym', rng, 0, 0.5) ?? (t.symmetry === 'asymmetrical' ? mid([0.12, 0.25], rng) : 0),
    oblique: sp(params, 'oblique', rng, 0, 0.3) ?? (ba.oblique ? mid(ba.oblique, rng) : 0),
  };
  cfg.apex = resolveTip(ap, params, rng, 'apex', sh);
  cfg.base = resolveTip(ba, params, rng, 'base', sh);
  if (t.base === 'oblique' && cfg.base.kind !== 'lobes') cfg.base = { ...cfg.base, kind: 'round' };
  if (params.obliqueSide) cfg.blade.obliqueSide = params.obliqueSide;

  // ---- lobes ----
  cfg.lobes = { kind: lob.kind || 'none' };
  if (lob.kind) {
    cfg.lobes.count = Math.round(sp(params, 'lobeCount', rng, 1, 40) ?? mid(lob.count, rng));
    cfg.lobes.depth = sp(params, 'lobeDepth', rng, 0, 0.99) ?? mid(lob.depth, rng);
    cfg.lobes.shape = params.lobeShape || (lob.acute ? 'acute' : 'rounded');
    cfg.lobes.lyrate = !!lob.lyrate;
    cfg.lobes.irregular = sp(params, 'lobeIrregular', rng, 0, 1) ?? lob.irregular ?? 0.08;
    cfg.lobes.sublobes = params.sublobes ?? !!lob.sublobes;
    cfg.lobes.pedate = !!lob.pedate;
    cfg.lobes.sinus = params.sinus || (lob.acute ? 'V' : 'U');
    cfg.lobes.shape = params.lobeShape || (lob.acute || lob.kind === 'palmate' ? 'acute' : 'rounded');
    cfg.lobes.tips = params.lobeTips || (lob.acute || lob.kind === 'palmate' ? 'acute' : 'rounded');
    cfg.lobes.bristle = sp(params, 'lobeBristle', rng, 0, 0.1) ?? 0;
    cfg.lobes.lean = sp(params, 'lobeLean', rng, -1, 1);
    cfg.lobes.range = params.lobeRange || null;
    cfg.lobes.spread = sp(params, 'lobeSpread', rng, 20, 180);
    cfg.lobes.decay = sp(params, 'lobeDecay', rng, 0, 0.9);
    cfg.lobes.lobeWidth = sp(params, 'lobeWidth', rng, 0.2, 1.5);
  }

  // ---- polar specifics ----
  if (engine === 'polar') {
    const count = cfg.lobes.kind === 'palmate' ? cfg.lobes.count : 1;
    const flab = t.shape === 'flabellate';
    cfg.polar = {
      count: t.attachment === 'peltate' && cfg.lobes.kind === 'none' ? 1 : count,
      spread: (cfg.lobes.spread ?? sp(params, 'spread', rng, 10, 180) ?? (flab ? mid(sh.spread, rng) : defaultSpread(count))) * D2R,
      decay: cfg.lobes.decay ?? sp(params, 'decay', rng, 0, 0.9) ?? (count <= 3 ? 0.25 : 0.45),
      depth: cfg.lobes.kind === 'palmate' ? cfg.lobes.depth : 0,
      aspect: sp(params, 'aspect', rng, 0.4, 2) ?? (flab ? mid(sh.aspect, rng) : 1),
      lobeWidth: cfg.lobes.lobeWidth ?? (cfg.lobes.tips === 'acute' ? 1.15 : 0.85),
      base: t.attachment === 'peltate' ? 'peltate' : flab ? 'cuneate' : ({ cordate: 'cordate', auriculate: 'cordate', truncate: 'truncate', cuneate: 'cuneate', acute: 'cuneate', attenuate: 'cuneate', rounded: 'rounded', obtuse: 'rounded', subobtuse: 'rounded', oblique: 'cordate' })[t.base] || 'truncate',
      baseDepth: sp(params, 'baseDepth', rng, 0, 0.5) ?? 0.12,
      peltOffset: sp(params, 'peltOffset', rng, 0, 0.5) ?? 0.08,
      notch: t.apex === 'emarginate' ? (sp(params, 'apexNotch', rng, 0, 0.6) ?? 0.15) : 0,
      sinus: cfg.lobes.sinus || 'U',
      tips: cfg.lobes.tips || 'rounded',
      pedate: cfg.lobes.pedate,
      flabellate: flab,
    };
  }

  // ---- margin ----
  const mods = spec.traits?.marginMods || t.marginMods || [];
  cfg.margin = { profile: mg.profile || 'none', type: t.margin };
  if (mg.spacing) {
    cfg.margin.spacing = sp(params, 'toothSpacing', rng, 0.05, 50) ?? mid(mg.spacing, rng) * L;
    cfg.margin.height = sp(params, 'toothHeight', rng, 0.01, 30) ?? mid(mg.height, rng) * L;
  }
  cfg.margin.minor = mg.minor ? Math.round(sp(params, 'minorTeeth', rng, 1, 6) ?? mid(mg.minor, rng)) : 0;
  cfg.margin.spines = mg.spines || mods.includes('spiny') ? (sp(params, 'spineLength', rng, 0, 30) ?? mid(mg.spines || [0.03, 0.06], rng) * L) : 0;
  cfg.margin.hairs = mg.hairs || mods.includes('ciliate') ? (sp(params, 'hairLength', rng, 0, 10) ?? mid(mg.hairs || [0.008, 0.016], rng) * L) : 0;
  cfg.margin.toothAwn = sp(params, 'toothAwn', rng, 0, 10) ?? 0; // bristle-tipped teeth (Castanea)

  // ---- venation ----
  cfg.venation = {
    primary: t.primary,
    primaryCount: Math.round(sp(params, 'primaryCount', rng, 1, 40) ?? (t.attachment === 'peltate' && cfg.lobes.kind !== 'palmate' ? mid([9, 15], rng) : cfg.lobes.kind === 'palmate' ? (cfg.lobes.pedate ? 7 : cfg.lobes.count) : mid(findTerm('primary', t.primary)?.count || [1, 1], rng))),
    suprabasal: sp(params, 'suprabasal', rng, 0, 0.5) ?? 0,
    secondary: t.secondary,
    secCount: sp(params, 'secCount', rng, 1, 60),
    secAngleBase: (sp(params, 'secAngleBase', rng, 10, 90) ?? mid([48, 62], rng)) * D2R,
    secAngleApex: (sp(params, 'secAngleApex', rng, 10, 90) ?? mid([34, 46], rng)) * D2R,
    secCurve: sp(params, 'secCurve', rng, -1, 1) ?? 0.35,
    intersecondary: sp(params, 'intersecondary', rng, 0, 1) ?? 0,
    tertiary: t.tertiary,
    tertSpacing: sp(params, 'tertSpacing', rng, 0.005, 0.2) ?? 0.035,
    areoles: t.areoles,
    areoleSpacing: sp(params, 'areoleSpacing', rng, 0.003, 0.2) ?? findTerm('areoles', t.areoles)?.spacing,
    marginal: t.marginalVein,
    marginalOffset: (sp(params, 'marginalOffset', rng, 0, 0.1) ?? findTerm('marginalVein', t.marginalVein)?.offset ?? 0) * L,
    parallelCount: Math.round(sp(params, 'parallelCount', rng, 3, 200) ?? (t.primary === 'parallel' ? mid([9, 25], rng) : 0)),
    sori: params.sori ?? (t.plantGroup === 'fern'),
  };

  cfg.surface = { holes: findTerm('surface', t.surface)?.holes || null, holeCount: sp(params, 'holeCount', rng, 0, 400), holeSize: sp(params, 'holeSize', rng, 0, 0.3), splits: sp(params, 'splits', rng, 0, 40) ?? 0 };
  cfg.form3d = t.form3d;
  cfg.folding = t.folding;

  // ---- compound ----
  if (engine === 'compound' || engine === 'frond') cfg.compound = resolveCompound(spec, t, params, rng, L);
  return cfg;
}

function defaultLength(t) {
  return { 'conifer-needle': 80, 'conifer-scale': 3, monocot: 300, fern: 450, ginkgo: 60 }[t.plantGroup] || 110;
}

function defaultSpread(n) {
  if (n <= 1) return 0;
  return { 2: 35, 3: 52, 4: 75, 5: 100, 6: 115, 7: 125, 8: 135, 9: 142 }[n] || 145;
}

function resolveTip(term, params, rng, which, shape) {
  const P = which === 'apex' ? 'apex' : 'base';
  const out = { type: term.id || (which === 'apex' ? 'acute' : 'rounded'), kind: term.kind || 'angle' };
  const baseTerm = term.base ? findTerm(which, term.base) : null;
  out.angle = (sp(params, P + 'Angle', rng, 10, 179) ?? mid(term.angle || baseTerm?.angle || (term.kind === 'round' ? [150, 170] : [60, 80]), rng)) * D2R;
  if (term.kind === 'round' || baseTerm?.kind === 'round') out.round = true;
  if (term.cut) out.cut = sp(params, P + 'Cut', rng, 0, 0.3) ?? mid(term.cut, rng);
  if (term.tip) { out.tip = sp(params, P + 'Tip', rng, 0.01, 0.6) ?? mid(term.tip, rng); out.power = mid(term.power, rng); }
  if (term.point) { out.point = sp(params, P + 'Point', rng, 0, 0.2) ?? mid(term.point, rng); out.pw = mid(term.pw, rng); }
  if (term.awn) out.awn = sp(params, P + 'Awn', rng, 0, 0.3) ?? mid(term.awn, rng);
  if (term.notch || (shape?.notch && which === 'apex') || params[P + 'Notch'] != null) out.notch = sp(params, P + 'Notch', rng, 0, 0.4) ?? mid(shape?.notch && which === 'apex' ? shape.notch : term.notch, rng);
  if (out.notch && term.kind === 'cut') out.kind = 'cut';
  if (term.cirrus) out.cirrus = sp(params, 'cirrus', rng, 0, 2) ?? mid(term.cirrus, rng);
  if (term.lobe) { out.lobe = term.lobe; out.depth = sp(params, 'baseDepth', rng, 0, 0.6) ?? mid(term.depth, rng); out.flare = (sp(params, 'baseFlare', rng, 0, 180) ?? (term.lobe === 'hastate' ? 95 : term.lobe === 'sagittate' ? 15 : 40)) * D2R; }
  if (term.tail) out.tail = true;
  return out;
}

function resolveCompound(spec, t, params, rng, L) {
  const st = findTerm('structure', t.structure) || {};
  const c = spec.compound || {};
  const out = {
    kind: t.plantGroup === 'fern' ? 'frond' : t.structure,
    pairs: Math.round(c.pairs != null ? rng.sample(c.pairs, 1, 130) : mid(st.pairs || [3, 6], rng)),
    leaflets: Math.round(c.leaflets != null ? rng.sample(c.leaflets, 1, 15) : mid(Array.isArray(st.leaflets) ? st.leaflets : [st.leaflets || 3, st.leaflets || 3], rng)),
    terminal: c.terminal ?? (t.structure === 'imparipinnate' || t.structure === 'tripinnate' ? true : t.structure === 'paripinnate' || t.structure === 'bipinnate' ? false : true),
    nested: st.nested || null,
    rachis: c.rachis != null ? rng.sample(c.rachis, 0.1, 5) : 0.75,
    petiolule: c.petiolule != null ? rng.sample(c.petiolule, 0, 1) : 0.04,
    terminalPetiolule: c.terminalPetiolule != null ? rng.sample(c.terminalPetiolule, 0, 1) : null,
    angle: (c.angle != null ? rng.sample(c.angle, 5, 90) : 60) * D2R,
    taper: c.taper != null ? rng.sample(c.taper, 0, 1) : 0.35,
    spread: (c.spread != null ? rng.sample(c.spread, 10, 300) : ({ 3: 120, 4: 150, 5: 185, 6: 210, 7: 230, 8: 250, 9: 265 })[Math.round(c.leaflets != null ? (Array.isArray(c.leaflets) ? c.leaflets[0] : c.leaflets) : 5)] || 200) * D2R,
    alternate: c.alternate ?? false,
    winged: c.winged ?? 0,
    taperMin: c.taperMin ?? null,
    taperCenter: c.taperCenter ?? null,
    leafletScale: c.leafletScale != null ? rng.sample(c.leafletScale, 0.02, 1) : null,
    pinnaPairs: c.pinnaPairs != null ? Math.round(rng.sample(c.pinnaPairs, 2, 60)) : null,
    sublevels: c.sublevels ?? null,
    leaflet: c.leaflet || { traits: { ...t, structure: 'simple', plantGroup: t.plantGroup === 'fern' ? 'dicot' : t.plantGroup }, params: {} },
  };
  return out;
}
