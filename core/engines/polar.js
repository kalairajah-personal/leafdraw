// Polar engine: palmately lobed (palmatifid / -partite / -sect, pedate), flabellate (fan), peltate, palmate.
// Outline r(θ) around the attachment; θ = 0 points to the apex (+y), positive to the right.
import { resample, cumLengths, dist, clamp, smoothstep } from '../geom.js';
import { applyMargin } from '../margin.js';

export function buildPolar(cfg, rng) {
  const P = cfg.polar;
  const R = cfg.L;
  let n = Math.max(1, P.count | 0);
  let spread = P.spread, depth = P.depth, decay = P.decay;
  if (P.pedate) { n = 7; spread = Math.max(spread, 2.35); depth = Math.max(depth, 0.88); decay = Math.max(decay, 0.5); }
  const peltate = P.base === 'peltate';
  const rj = (r) => Array.from({ length: n }, () => 1 + (r.next() - 0.5) * 0.08);
  const jitR = rj(rng.fork('pr')), jitL = rj(rng.fork('pl'));
  const aj = Array.from({ length: n }, () => (rng.next() - 0.5) * 0.05);

  // Tip angles and lengths.
  const tips = Array.from({ length: n }, (_, k) => {
    const a = n === 1 ? 0 : -spread + (2 * spread * k) / (n - 1) + (n > 1 ? aj[k] : 0);
    const l = 1 - decay * Math.pow(Math.abs(a) / Math.max(spread, 1e-3), 1.5);
    return { a, l: Math.max(0.12, l) };
  });
  const gap = n > 1 ? (2 * spread) / (n - 1) : Math.PI;
  const p = P.tips === 'acute' ? 1.05 : P.tips === 'acuminate' ? 0.8 : 1.7; // lobe side curvature
  const dEff = clamp(depth, 0.001, 0.985);
  const w = n > 1 ? gap / (2 * Math.pow(dEff, 1 / p)) : Math.PI * 1.2;
  const blend = P.sinus === 'U' ? 0.05 : 0.012;

  const radius = (theta, side) => {
    const jit = side > 0 ? jitR : jitL;
    if (n === 1) {
      // unlobed: orbicular / fan envelope
      let r = 1;
      if (P.flabellate) r = 1 - 0.04 * Math.pow(theta / Math.max(spread, 0.1), 2);
      return r;
    }
    // smooth max over lobe functions
    let acc = 0, mx = 0;
    const vals = tips.map((t, k) => {
      const d = Math.abs(theta - t.a);
      return Math.max(0, t.l * jit[k] * (1 - Math.pow(d / w, p)));
    });
    mx = Math.max(...vals);
    for (const v of vals) acc += Math.exp((v - mx) / blend);
    const sm = mx + blend * Math.log(acc);
    return Math.max(sm, 0.04);
  };

  // Angle range per base type.
  let thMax;
  if (peltate) thMax = Math.PI;
  else if (P.base === 'cuneate') thMax = Math.min(Math.PI * 0.95, (n > 1 ? spread + w * 0.6 : spread) + 0.08);
  else thMax = Math.PI * 0.985;

  const center = peltate ? [0, 0] : [0, 0];
  const N = 900;
  const halfPath = (side) => {
    const pts = [];
    for (let j = 0; j <= N; j++) {
      const th = thMax * (1 - j / N);
      let r = radius(th, side) * R;
      if (P.notch) r *= 1 - P.notch * Math.exp(-Math.pow(th / 0.09, 2));
      if (!peltate) {
        if (P.base === 'cordate' || P.base === 'truncate') r *= smoothstep(Math.PI, Math.PI * (1 - (P.base === 'truncate' ? 0.06 : P.baseDepth * 1.4)), th) * 0.98 + 0.02 * (th < Math.PI * 0.97 ? 1 : 0);
        if (P.base === 'rounded') r *= 1 - 0.85 * smoothstep(Math.PI * 0.55, Math.PI, th);
        if (P.base === 'cuneate' && th > thMax - 0.12) r *= smoothstep(thMax, thMax - 0.12, th);
      }
      let x = r * Math.sin(th), y = r * Math.cos(th);
      pts.push([x, y]);
    }
    if (!peltate) pts.unshift([0, 0]);
    else pts.unshift([0, -radius(Math.PI, side) * R]);
    // drop duplicate near-zero points at base
    const clean = pts.filter((q, i) => i === 0 || dist(q, pts[i - 1]) > 1e-4);
    return resample(clean, Math.max(0.08, R / 900));
  };

  const tipPts = (side) => tips.filter((t) => (side > 0 ? t.a > 0.05 : t.a < -0.05)).map((t) => {
    const r = radius(t.a, side) * R; return [Math.abs(r * Math.sin(t.a)), r * Math.cos(t.a)];
  });
  const hp = { r: halfPath(1), l: halfPath(-1) };
  const tR = tipPts(1), tL = tipPts(-1);
  const marg = (path, tps, r) => {
    const cum = cumLengths(path);
    const ts = tps.map((tp) => { let bi = 0, bd = Infinity; path.forEach((q, i) => { const d = dist(q, tp); if (d < bd) { bd = d; bi = i; } }); return cum[bi]; });
    return applyMargin(path, cfg.margin, ts, r, { startFade: peltate ? 0 : R * 0.04, limitByX: !peltate });
  };
  const mR = marg(hp.r, tR, rng.fork('mr'));
  const mL = marg(hp.l, tL, rng.fork('ml'));
  const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
  const right = mR.path, left = mirror(mL.path);
  const outline = [...right, ...left.slice(1, -1).reverse()];
  const apex = [0, radius(0, 1) * R * (1 - (P.notch || 0))];
  const attach = peltate ? [0, -P.peltOffset * R] : [0, 0];
  const midrib = peltate ? null : resample([[0, 0], [0, apex[1] * 0.985]], R / 80);
  const width = Math.max(...outline.map((q) => q[0])) - Math.min(...outline.map((q) => q[0]));

  return {
    outline, right, left, midrib, apex, attach, center: attach, peltate,
    toothTips: [...mR.tips.map((t) => ({ ...t, side: 1 })), ...mL.tips.map((t) => ({ ...t, pt: [-t.pt[0], t.pt[1]], side: -1 }))],
    lobeTips: [...tR.map((pt) => ({ pt, side: 1 })), ...mirror(tL).map((pt) => ({ pt, side: -1 }))],
    extras: [...mR.extras, ...mL.extras.map((e) => ({ ...e, pts: mirror(e.pts) }))],
    width,
    curveX: () => 0,
  };
}
