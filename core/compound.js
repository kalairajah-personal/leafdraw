// Compound leaves and fern fronds. Recursive placement of leaflets (or nested axes) on rachises.
// Kinds: unifoliate, bifoliolate, bigeminate, ternate, biternate, palmately-compound,
//        paripinnate, imparipinnate, bipinnate, tripinnate, frond (fern; once to thrice pinnate).
import { add, sub, mul, norm, rot, lerp, bezier, resample, pointAt, tangentAt, angleOf, transformPts, clamp } from './geom.js';
import { resolve } from './resolve.js';
import { buildSingle, detailFor } from './leaf.js';
import { buildBlade } from './engines/blade.js';
import { Field } from './field.js';

export function buildCompound(cfg, rng, opts = {}) {
  const C = cfg.compound;
  const L = cfg.L;
  const parts = [], fills = [];
  const isFern = C.kind === 'frond' || cfg.traits.plantGroup === 'fern';
  const leafletSpec = C.leaflet;
  const cache = new Map();

  // Leaflet template variants at a nominal length; scaled on placement.
  const variant = (key, nominalL, specOverride, k) => {
    const id = `${key}:${k % 4}`;
    if (cache.has(id)) return cache.get(id);
    const spec = specOverride || leafletSpec;
    const r = rng.fork(id);
    const lc = resolve({ ...spec, params: { ...(spec.params || {}), length: nominalL } }, r);
    lc.petiole = 0;
    const built = buildSingle(lc, r.fork('b'), { detail: opts.detail === 'full' ? detailFor(nominalL * (opts.scaleHint || 1)) : opts.detail || detailFor(nominalL), noPetiole: true });
    cache.set(id, built);
    return built;
  };

  let leafIdx = 0;
  const place = (built, origin, dir, scale, mirror, tag = 'leaflet') => {
    const ang = angleOf(dir) - Math.PI / 2;
    const li = ++leafIdx;
    const tf = (pts) => transformPts(mirror ? pts.map(([x, y]) => [-x, y]) : pts, { scale, rotate: ang, tx: origin[0], ty: origin[1] });
    for (const p of built.parts) parts.push({ ...p, pts: tf(p.pts), ref: (p.ref || 10) * scale, leaf: li });
    for (const f of built.fills) fills.push({ ...f, rings: f.rings.map(tf), hatchRing: f.hatchRing ? tf(f.hatchRing) : null, tag, ref: (f.ref || 10) * scale, leaf: li });
  };

  const stalk = (a, b, role = 'rachis', w = 1) => { parts.push({ role, pts: [a, b], wscale: w }); };
  const curveAxis = (o, dir, length, bend) => {
    const end = add(o, mul(rot(dir, bend), length));
    const c1 = add(o, mul(dir, length * 0.4));
    return bezier(o, c1, lerp(c1, end, 0.5), end, 40);
  };

  // Petiole (stipe for ferns).
  const petL = (cfg.petiole ?? 0.25) * L;
  const root = [0, 0];
  let top = [0, petL];
  parts.push({ role: 'petiole', pts: bezier(root, [0, petL * 0.3], [petL * 0.03, petL * 0.7], top, 16) });
  const up = [0, 1];

  // Default leaflet nominal length.
  const nominalFor = (axisLen, pairs) => clamp(axisLen * 1.7 / (pairs + 1.2), 1, 400);
  const leafL = (base) => leafletSpec?.params?.length ? (Array.isArray(leafletSpec.params.length) ? leafletSpec.params.length[0] : leafletSpec.params.length) : base;

  const pinnateAxis = (o, dir, axisLen, level, nested, depth) => {
    const pairs = depth === 0 ? (C.pinnaPairs && nested ? C.pinnaPairs : C.pairs) : Math.max(3, Math.round(C.pairs * (depth === 1 ? 1 : 0.7)));
    const bend = (rng.next() - 0.5) * 0.12 + (depth > 0 ? 0.06 : 0);
    const axis = curveAxis(o, dir, axisLen, bend);
    parts.push({ role: depth === 0 ? 'rachis' : 'rachilla', pts: axis, wscale: depth === 0 ? 1 : 0.7 / depth });
    const terminal = depth === 0 ? C.terminal : nested ? false : (C.kind === 'tripinnate' || isFern ? true : false);
    const n = pairs;
    const sEnd = terminal ? 0.88 : 0.995;
    for (let i = 0; i < n; i++) {
      const s0 = 0.06 + (sEnd - 0.06) * (n === 1 ? 1 : i / (n - 1));
      for (const side of [1, -1]) {
        const s = C.alternate || isFern ? clamp(s0 + (side < 0 ? 0.5 * (sEnd - 0.06) / n : 0), 0, 0.999) : s0;
        const P = pointAt(axis, s);
        const T = tangentAt(axis, s);
        const ang = C.angle * (isFern ? (1.12 - 0.3 * s) : (1.05 - 0.15 * s));
        const d = rot(T, -side * ang);
        const sc = isFern ? clamp(Math.sin(Math.PI * Math.min(1, s * 0.9 + 0.12)) * (1 - 0.65 * s), 0.12, 1) : clamp(1 - C.taper * Math.abs(s - (C.taperCenter ?? 0.55)) * 1.4, C.taperMin ?? 0.4, 1.05);
        if (nested) {
          const subLen = axisLen * (isFern ? 0.42 : 0.36) * sc;
          pinnateAxis(P, d, subLen, level + 1, nested === 'bipinnate' ? 'paripinnate' : null, depth + 1);
        } else {
          const nom = leafL(nominalFor(axisLen, n));
          const v = variant(`L${depth}`, nom, null, i * 2 + (side > 0 ? 0 : 1));
          const pet = C.petiolule * nom * sc;
          const at = add(P, mul(d, pet));
          if (pet > 0.05) stalk(P, at, 'petiolule');
          place(v, at, d, sc, side < 0);
        }
      }
    }
    if (terminal) {
      const E = axis[axis.length - 1];
      const T = norm(sub(E, axis[axis.length - 3]));
      const nom = leafL(nominalFor(axisLen, n)) * (isFern ? 0.6 : 1.05);
      const v = variant(`T${depth}`, nom, null, 0);
      const pet = (C.terminalPetiolule ?? C.petiolule * 1.6) * nom;
      const at = add(E, mul(T, pet));
      if (pet > 0.05) stalk(E, at, 'petiolule');
      place(v, at, T, isFern ? 0.5 : 1, false);
    }
    return axis;
  };

  const kind = C.kind;
  const nom0 = leafL(L * 0.55);
  if (kind === 'unifoliate') {
    const v = variant('U', nom0, null, 0);
    parts.push({ role: 'joint', pts: [add(top, [-nom0 * 0.03, 0]), add(top, [nom0 * 0.03, 0])] });
    if (C.winged > 0) {
      const w = C.winged * nom0;
      const wing = [...bezier([0, petL * 0.1], [w * 0.5, petL * 0.35], [w, petL * 0.8], [0, petL], 14), ...bezier([0, petL], [-w, petL * 0.8], [-w * 0.5, petL * 0.35], [0, petL * 0.1], 14)];
      parts.push({ role: 'outline', pts: wing, closed: true });
      fills.push({ role: 'blade', rings: [wing] });
    }
    place(v, add(top, [0, nom0 * 0.02]), up, 1, false);
  } else if (kind === 'bifoliolate' || kind === 'bigeminate') {
    const pair = (o, d, sc, depth) => {
      for (const side of [1, -1]) {
        const v = variant('B' + depth, nom0 * 0.8, null, side > 0 ? 0 : 1);
        place(v, o, rot(d, -side * 0.38), sc, side < 0);
      }
    };
    if (kind === 'bigeminate') {
      for (const side of [1, -1]) {
        const d = rot(up, -side * 0.6); const e = add(top, mul(d, L * 0.22));
        stalk(top, e, 'rachis'); pair(e, d, 0.7, 1);
      }
    } else pair(top, up, 1, 0);
  } else if (kind === 'ternate' || kind === 'biternate') {
    const trio = (o, d, sc, depth) => {
      if (C.palmate) {
        for (const a of [-1, 0, 1]) { const v = variant('Tp' + depth, nom0 * 0.75, null, a + 1); place(v, o, rot(d, -a * 0.95), sc * (a === 0 ? 1 : 0.92), a < 0); }
      } else {
        const tl = (C.terminalPetiolule ?? 0.2) * nom0 * sc;
        const e = add(o, mul(d, tl)); stalk(o, e, 'petiolule');
        place(variant('Tt' + depth, nom0 * 0.8, null, 0), e, d, sc, false);
        for (const side of [1, -1]) place(variant('Tl' + depth, nom0 * 0.72, null, side > 0 ? 1 : 2), add(o, mul(d, nom0 * 0.02)), rot(d, -side * 1.15), sc * 0.9, side < 0);
      }
    };
    if (kind === 'biternate') {
      for (const a of [-1, 0, 1]) { const d = rot(up, -a * 0.85); const e = add(top, mul(d, L * 0.28)); stalk(top, e, 'rachis'); trio(e, d, 0.55, 1); }
    } else trio(top, up, 1, 0);
  } else if (kind === 'palmately-compound') {
    const n = Math.max(3, C.leaflets);
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? 0 : -C.spread / 2 + (C.spread * i) / (n - 1);
      const f = Math.abs(a) / (C.spread / 2 || 1);
      const sc = 1 - 0.45 * Math.pow(f, 1.4);
      const d = rot(up, -a);
      const pet = C.petiolule * nom0 * sc;
      const at = add(top, mul(d, pet));
      if (pet > 0.05) stalk(top, at, 'petiolule');
      place(variant('P', nom0 * 0.85, null, i), at, d, sc, a < 0);
    }
  } else if (kind === 'paripinnate' || kind === 'imparipinnate') {
    pinnateAxis(top, up, L * C.rachis, 0, null, 0);
  } else if (kind === 'bipinnate') {
    pinnateAxis(top, up, L * C.rachis, 0, 'paripinnate', 0);
  } else if (kind === 'tripinnate') {
    pinnateAxis(top, up, L * C.rachis, 0, 'bipinnate', 0);
  } else if (isFern) {
    frond(top, L * (1 - (cfg.petiole ?? 0.25)));
  }

  // Cirrus (rachis whip).
  if (cfg.traits.apex === 'cirrate' && !isFern) {
    const tip = parts.filter((p) => p.role === 'rachis').map((p) => p.pts[p.pts.length - 1]).sort((a, b) => b[1] - a[1])[0] || top;
    const c = L * (cfg.apex.cirrus || 0.4);
    parts.push({ role: 'cirrus', pts: bezier(tip, add(tip, [0, c * 0.4]), add(tip, [c * 0.3, c * 0.8]), add(tip, [c * 0.05, c]), 20) });
  }
  return { parts, fills };

  // ---------------- fern frond ----------------
  function frond(o, len) {
    // Envelope from blade shape traits (oblong/lanceolate/deltoid…).
    const env = buildBlade({ ...cfg, L: len, lobes: { kind: 'none' }, margin: { profile: 'none' }, apex: { ...cfg.apex, kind: 'angle', angle: 1.2 }, base: { ...cfg.base, kind: cfg.base.kind === 'lobes' ? 'round' : cfg.base.kind } }, rng.fork('env'));
    const fld = new Field(env.outline, [], 260);
    const axis = curveAxis(o, up, len, (rng.next() - 0.5) * 0.1);
    parts.push({ role: 'rachis', pts: axis, wscale: 1 });
    const level = C.kind === 'frond' ? (cfg.traits.structure === 'tripinnate' ? 3 : cfg.traits.structure === 'bipinnate' ? 2 : 1) : 2;
    const pairs = C.pinnaPairs || Math.round(clamp(len / 18, 10, 34));
    for (let i = 0; i < pairs; i++) {
      for (const side of [1, -1]) {
        const s = clamp(0.03 + 0.93 * ((i + (side < 0 ? 0.5 : 0)) / pairs), 0, 0.985);
        const P = pointAt(axis, s), T = tangentAt(axis, s);
        const y = s * len;
        const [r, l] = fld.widthAt(y, 0);
        const hw = Math.max(len * 0.012, side > 0 ? r : l);
        const ang = (78 - 26 * s) * Math.PI / 180;
        const d = rot(T, -side * ang);
        const pl = hw / Math.sin(ang);
        if (level === 1) {
          const v = variant('F1', 60, pinnaSpec(), i * 2 + (side > 0 ? 0 : 1));
          place(v, P, d, pl / 60, side < 0, 'pinna');
        } else {
          const sub = curveAxis(P, d, pl, side * 0.08);
          parts.push({ role: 'rachilla', pts: sub, wscale: 0.55 });
          const np = clamp(Math.round(pl / Math.max(1.5, len * 0.012)), 4, 22);
          for (let j = 0; j < np; j++) for (const s2 of [1, -1]) {
            const u = clamp(0.06 + 0.9 * ((j + (s2 < 0 ? 0.35 : 0)) / np), 0, 0.98);
            const Q = pointAt(sub, u), T2 = tangentAt(sub, u);
            const d2 = rot(T2, -s2 * 1.05);
            const plen = (pl / np) * 1.25 * clamp(1 - 0.75 * u, 0.25, 1);
            if (level === 2) {
              const v = variant('F2', 20, pinnuleSpec(), j * 2 + (s2 > 0 ? 0 : 1));
              place(v, Q, d2, plen / 20, s2 * side < 0, 'pinnule');
            } else {
              const sub2 = curveAxis(Q, d2, plen, 0);
              parts.push({ role: 'rachilla', pts: sub2, wscale: 0.3 });
              const nseg = clamp(Math.round(plen / Math.max(0.8, len * 0.006)), 3, 8);
              for (let k = 0; k < nseg; k++) for (const s3 of [1, -1]) {
                const w = 0.12 + 0.85 * (k / nseg);
                const R2 = pointAt(sub2, w);
                const v = variant('F3', 8, pinnuleSpec(true), k + (s3 > 0 ? 0 : 1));
                place(v, R2, rot(tangentAt(sub2, w), -s3 * 0.95), (plen / nseg) * 1.3 * (1 - 0.6 * w) / 8, s3 < 0, 'segment');
              }
            }
          }
        }
      }
    }
  }

  function pinnaSpec() {
    return leafletSpec?.traits?.plantGroup === 'fern' ? leafletSpec : {
      traits: { plantGroup: 'dicot', shape: 'lanceolate', apex: 'acute', base: 'auriculate', margin: cfg.traits.margin || 'serrulate', primary: 'pinnate', secondary: 'cladodromous', tertiary: 'none', areoles: 'none', ...(leafletSpec?.traits || {}), structure: 'simple' },
      params: { aspect: [5, 0.4], ...(leafletSpec?.params || {}) },
    };
  }
  function pinnuleSpec(tiny) {
    return {
      traits: { plantGroup: 'dicot', shape: 'oblong', apex: 'obtuse', base: 'truncate', margin: tiny ? 'entire' : (cfg.traits.margin || 'crenate'), lobation: tiny ? 'none' : (cfg.traits.lobation && cfg.traits.lobation !== 'none' ? cfg.traits.lobation : 'none'), primary: 'pinnate', secondary: 'cladodromous', tertiary: 'none', areoles: 'none', structure: 'simple', ...(leafletSpec?.traits || {}) },
      params: { aspect: [2.4, 0.2], sori: !tiny && cfg.venation.sori, ...(leafletSpec?.params || {}) },
    };
  }
}
