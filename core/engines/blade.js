// Width-profile blade engine: simple blades of any glossary shape, apex, base, pinnate lobing.
// Local frame: attachment (0,0), apex at (0,L) before falcate curve. y up. mm.
import { chaikin, add, sub, mul, norm, resample, cumLengths, clamp, smoothstep, bezier, dist, lerp, removeLoops } from '../geom.js';
import { applyMargin } from '../margin.js';

const softmin = (a, b, k) => {
  if (!isFinite(b)) return a;
  if (k <= 1e-6) return Math.min(a, b);
  const m = Math.min(a, b);
  return m - k * Math.log(Math.exp(-(a - m) / k) + Math.exp(-(b - m) / k));
};

export function buildBlade(cfg, rng) {
  const L = cfg.L;
  const B = cfg.blade;
  const W = L / B.aspect;
  const lob = cfg.lobes || { kind: 'none' };

  // ---- envelope profile: half-width at t∈[0,1] ----
  const pw = B.widest;
  const s = Math.max(0.4, B.sharp);
  const a = s * pw, b = s * (1 - pw);
  const gmax = Math.pow(pw, a) * Math.pow(1 - pw, b);
  const raw = (t) => {
    if (t <= 0 || t >= 1) return 0;
    let f;
    if (B.angular) f = t < pw ? t / pw : (1 - t) / (1 - pw);
    else f = (Math.pow(t, a) * Math.pow(1 - t, b)) / gmax;
    if (B.flat > 1) f = Math.pow(clamp(f, 0, 1), 1 / B.flat);
    if (B.waist) f *= 1 - B.waist.depth * Math.exp(-Math.pow((t - B.waist.pos) / 0.11, 2));
    return (f * W) / 2;
  };

  const ap = cfg.apex, bs = cfg.base;
  let tLo = 0, tHi = 1;
  if (bs.kind === 'cut') tLo = bs.cut;
  if (bs.kind === 'lobes') tLo = 0.07;
  if (ap.kind === 'cut') tHi = ap.cut;
  const pointLen = ap.kind === 'point' ? ap.point : 0;
  const ell = (d, a, b) => (d <= 0 ? 0 : d >= a ? b * (1 + ((d - a) / a) * 6) : b * Math.sqrt(Math.max(0, 1 - Math.pow((a - d) / a, 2))));

  // Sampler for a blade of length Lx whose profile domain starts at tLoX, with base shaping bsx.
  const makeSample = (Lx, tLoX, bsx) => {
    const prof = (t) => raw(tLoX + (tHi - tLoX) * clamp(t / (1 - pointLen), 0, 1));
    return (t) => {
      let hw = prof(t);
      const dA = (1 - pointLen - t) * Lx;
      const dB = t * Lx;
      const apexAngle = ap.kind === 'angle' || ap.kind === 'awn' || ap.kind === 'cirrus' || (ap.kind === 'point' && !ap.round);
      if (apexAngle) {
        const c = Math.max(0, dA) * Math.tan(ap.angle / 2);
        hw = softmin(hw, c, W * 0.06);
        if (dA < W * 0.02) hw = Math.min(hw, c);
      }
      if (ap.round || ap.kind === 'round' || ap.kind === 'notch') {
        const a = Math.min(0.5 * W, (1 - pw) * Lx * 0.95);
        hw = softmin(hw, ell(dA, a, W * 0.5), W * 0.03);
      }
      if (ap.kind === 'concave') {
        const T = ap.tip * Lx;
        if (dA < T * 1.25) {
          const H = prof(1 - ap.tip - pointLen);
          hw = softmin(hw, H * Math.pow(clamp(Math.max(0, dA) / T, 0, 1.25), ap.power), W * 0.01);
        }
      }
      if (bsx.kind === 'angle') {
        const c = dB * Math.tan(bsx.angle / 2);
        hw = softmin(hw, c, bsx.type === 'cuneate' ? W * 0.03 : W * 0.11);
        if (dB < W * 0.02) hw = Math.min(hw, c);
      }
      if (bsx.kind === 'round') { const a = Math.min(0.5 * W, pw * Lx * 0.95); hw = softmin(hw, ell(dB, a, W * 0.5), W * 0.03); }
      if (bsx.kind === 'concave') {
        const T = bsx.tip * Lx;
        if (dB < T) { const H = prof(bsx.tip); hw = Math.min(hw, Math.max(Math.min(0.4, W * 0.02), H * Math.pow(dB / T, bsx.power))); }
      }
      if (pointLen > 0) {
        const sbw = ap.pw * Math.max(0.5, W * 0.045);
        const k = (1 - t) / pointLen;
        if (t > 1 - pointLen * 1.5) hw = Math.max(hw, sbw * Math.min(1.5, k));
        if (t >= 1) hw = 0;
      }
      return Math.max(0, hw);
    };
  };
  const sample = makeSample(L, tLo, bs);
  const roundLobes = bs.kind === 'lobes' && (bs.lobe === 'cordate' || bs.lobe === 'auriculate');
  const Dl = roundLobes ? bs.depth * L : 0;
  const sampleExt = roundLobes ? makeSample(L + Dl, 0, { kind: 'round' }) : null;

  const N = 520;
  const ts = Array.from({ length: N + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / N));
  const curveX = (y) => B.curve * L * Math.pow(clamp(y / L, 0, 1), 2);

  function half(side) {
    const r = rng.fork(side > 0 ? 'R' : 'L');
    const obl = (side < 0 && B.obliqueSide !== 'right') || (side > 0 && B.obliqueSide === 'right') ? B.oblique : 0;
    const widthScale = side < 0 ? 1 - B.asym : 1;
    const hw = (t) => sample(t) * widthScale;
    let pts, lobeTips = [];
    if (lob.kind === 'pinnate') ({ pts, lobeTips } = lobedHalf(hw, L, lob, r, side, ts));
    else if (roundLobes) pts = ts.map((t) => [sampleExt(t) * widthScale, -Dl + t * (L + Dl)]);
    else pts = ts.map((t) => [hw(t), t * L]);

    // Lobed bases (cordate, auriculate, sagittate, hastate): replace the bottom with a lobe curve.
    let basePts = [[0, 0]];
    if (roundLobes && lob.kind !== 'pinnate') {
      // Cordate / auriculate: rounded outline continues below the attachment; the sinus cuts in from the petiole.
      const maxX = Math.max(...pts.map((p) => p[0]));
      const sw = (bs.lobe === 'auriculate' ? 0.22 : 0.42) * maxX;
      let i = pts.findIndex((p) => p[1] < 0 && p[0] >= sw);
      if (i < 1) i = pts.findIndex((p) => p[1] >= -Dl * 0.3);
      const Q = pts[i];
      const Qn = pts[Math.min(pts.length - 1, i + 3)];
      const tq = norm(sub(Q, Qn));
      basePts = bezier([0, 0], [Q[0] * 0.08, Q[1] * 0.55], add(Q, mul(tq, -dist(Q, [0, 0]) * 0.0) ).map((v, k) => (k === 0 ? Q[0] * 0.55 : Q[1] * 1.08)), Q, 20);
      lobeTips.push({ pt: pts.slice(i).reduce((m, p) => (p[1] < m[1] ? p : m), Q), basal: true });
      pts = pts.slice(i + 1);
    } else if (bs.kind === 'lobes') {
      const lowMax = Math.max(...pts.filter((p) => p[1] < Math.max(pw, 0.3) * L).map((p) => p[0]));
      const j = Math.max(1, pts.findIndex((p) => p[0] >= (bs.lobe === 'cordate' || bs.lobe === 'auriculate' ? 0.8 : 0.02) * lowMax));
      const J = pts[j];
      const w = Math.max(J[0], W * 0.15);
      const D = bs.depth * L;
      let lobe;
      if (bs.lobe === 'cordate') { const Jn = pts[Math.min(pts.length - 1, j + 6)]; const tx = Jn[0] - J[0], ty = Jn[1] - J[1]; const tl = Math.hypot(tx, ty) || 1; const back = [J[0] - (tx / tl) * D * 0.55, J[1] - (ty / tl) * D * 0.55]; lobe = chaikin([[0, 0], [0.08 * w, -0.5 * D], [0.4 * w, -1.05 * D], [0.82 * w, -0.92 * D], [1.0 * w, -0.2 * D], [Math.min(back[0], w * 1.02), Math.max(back[1], J[1] * 0.25)], J], 3); }
      else if (bs.lobe === 'auriculate') lobe = chaikin([[0, 0], [0.3 * w, -0.25 * D], [0.55 * w, -1.0 * D], [0.86 * w, -0.85 * D], [0.95 * w, 0.15 * D], J], 3);
      else if (bs.lobe === 'sagittate') {
        const tip = [0.5 * w + Math.sin(bs.flare) * D, -D];
        lobe = [...chaikin([[0, 0], [0.12 * w, -0.12 * D], [0.32 * w, -0.5 * D], tip], 2), ...chaikin([tip, [0.95 * w, -0.32 * D], J], 2).slice(1)];
      } else {
        const tip = [w * 0.9 + Math.sin(bs.flare) * D, -Math.cos(bs.flare) * D];
        lobe = [...chaikin([[0, 0], [0.4 * w, -0.1 * D], [0.75 * w, -0.08 * D], tip], 2), ...chaikin([tip, [0.95 * w, 0.06 * D + 0.03 * L], J], 2).slice(1)];
      }
      basePts = lobe;
      pts = pts.slice(j + 1);
      lobeTips.push({ pt: basePts.reduce((m, p) => (p[1] < m[1] ? p : m), basePts[0]), basal: true });
    }
    let path = [...basePts, ...pts.filter((p, i) => p[0] > 0 || i === pts.length - 1)];
    const last = path[path.length - 1];
    if (last[0] > 0.01) path.push([0, last[1]]);
    // Oblique base: this side starts higher on the midrib.
    if (obl > 0) path = path.map(([x, y]) => [x, obl * L + y * (1 - obl)]);
    // Notch (emarginate / retuse / obcordate).
    if (ap.notch) {
      const Nd = ap.notch * L, nw = W * (0.08 + ap.notch * 1.6);
      const yTop = Math.max(...path.map((p) => p[1]));
      path = path.map(([x, y]) => (y > yTop - Nd * 3 - nw ? [x, y - Nd * Math.pow(Math.max(0, 1 - x / nw), 2)] : [x, y]));
    }
    const tx = ([x, y]) => [x + curveX(y), y];
    path = path.map(tx);
    lobeTips = lobeTips.map((lt) => ({ ...lt, pt: tx(obl > 0 ? [lt.pt[0], obl * L + lt.pt[1] * (1 - obl)] : lt.pt) }));
    return { path: resample(path, clamp(L / 900, 0.05, 0.5)), lobeTips, obl };
  }

  const R = half(1), Lh = half(-1);
  const marg = (h, r) => {
    const cum = cumLengths(h.path);
    const targetS = h.lobeTips.map((lt) => nearestS(h.path, cum, lt.pt));
    return applyMargin(h.path, cfg.margin, targetS, r, { midX: curveX });
  };
  const mR = marg(R, rng.fork('marginR'));
  const mL = marg(Lh, rng.fork('marginL'));
  const mirror = (pts) => pts.map(([x, y]) => [2 * curveX(y) - x, y]);

  const right = removeLoops(mR.path.map((p) => [Math.max(p[0], curveX(p[1]) - 0.0), p[1]]));
  const left = mirror(removeLoops(mL.path));
  const apexPt = right[right.length - 1];
  const outline = [...right, ...left.slice(0, -1).reverse()];
  if (Lh.obl > 0 || R.obl > 0) outline.push([curveX(0), 0]);

  const midrib = [];
  const yEnd = apexPt[1] - 0.004 * L;
  for (let i = 0; i <= 60; i++) { const y = (i / 60) * yEnd; midrib.push([curveX(y), y]); }

  const extras = [...mR.extras, ...mL.extras.map((e) => ({ ...e, pts: mirror(e.pts) }))];
  if (ap.kind === 'awn' && ap.awn) extras.push({ role: 'awn', pts: [apexPt, [apexPt[0] + B.curve * L * 0.2, apexPt[1] + ap.awn * L]] });
  if (ap.kind === 'cirrus' && ap.cirrus) {
    const c = ap.cirrus * L;
    extras.push({ role: 'cirrus', pts: bezier(apexPt, add(apexPt, [0, c * 0.4]), add(apexPt, [c * 0.35, c * 0.8]), add(apexPt, [c * 0.1, c])) });
  }
  const lobeTips = [...R.lobeTips.map((t) => ({ ...t, side: 1 })), ...Lh.lobeTips.map((t) => ({ ...t, pt: mirror([t.pt])[0], side: -1 }))];
  if (lob.bristle) for (const lt of lobeTips) if (!lt.basal) {
    const dir = norm([lt.pt[0] - curveX(lt.pt[1]), Math.abs(lt.pt[0] - curveX(lt.pt[1])) * 0.7]);
    extras.push({ role: 'spine', pts: [lt.pt, add(lt.pt, mul(dir, lob.bristle * L))] });
  }

  return {
    outline, right, left, midrib, apex: apexPt, attach: [curveX(0), 0],
    toothTips: [...mR.tips.map((t) => ({ ...t, side: 1 })), ...mL.tips.map((t) => ({ ...t, pt: mirror([t.pt])[0], normal: [-t.normal[0], t.normal[1]], side: -1 }))],
    lobeTips: lobeTips.filter((t) => !t.basal), basalLobes: lobeTips.filter((t) => t.basal),
    extras, width: W, curveX, oblique: Math.max(R.obl, Lh.obl),
  };
}

function lerpN(a, b, w) { return a + (b - a) * w; }

function nearestS(path, cum, p) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) { const d = dist(path[i], p); if (d < bd) { bd = d; bi = i; } }
  return cum[bi];
}

// Pinnate lobes built explicitly: sinus points and lobe tips joined by cubic curves.
// Rounded lobes: tangent at tip follows the envelope (rounded head). Acute: straight flanks.
// U sinus: tangent along the midrib at sinus bottom. V sinus: sharp corner.
function lobedHalf(hw, L, lob, rng, side, ts) {
  const K = Math.max(1, lob.count);
  const t0 = lob.range?.[0] ?? (lob.lyrate ? 0.05 : 0.1);
  const t1 = lob.range?.[1] ?? (lob.lyrate ? 0.62 : 0.88);
  const gap = (t1 - t0) / K;
  const phase = side > 0 ? 0 : (rng.next() - 0.5) * 0.25 * gap;
  const centers = Array.from({ length: K }, (_, k) => t0 + (k + 0.5) * gap + phase + (rng.next() - 0.5) * (lob.irregular || 0.08) * gap);
  const sinus = [t0 + phase * 0.5, ...centers.slice(0, -1).map((c, k) => (c + centers[k + 1]) / 2), centers[K - 1] + gap * 0.5];
  const lean = (lob.lean ?? 0.22) * gap;
  const depthAt = (j) => {
    let d = lob.depth * clamp(1 + (rng.next() - 0.5) * 2 * (lob.irregular || 0.08), 0.6, 1.25);
    if (lob.lyrate) d = Math.min(0.96, lob.depth * (1.2 - 0.45 * (j / K)));
    return clamp(d, 0.02, 0.97);
  };
  const S = sinus.map((t, j) => [hw(t) * (1 - (j === 0 ? depthAt(j) * 0.55 : depthAt(j))), t * L]);
  const T = centers.map((c, k) => {
    const t = clamp(c + lean, 0, 0.98);
    const size = lob.lyrate ? 0.75 + 0.25 * (k / K) : clamp(1 + (rng.next() - 0.5) * (lob.irregular || 0.08), 0.85, 1.1);
    return [hw(t) * size, t * L];
  });
  const envTan = (t) => { const e = 0.004; return norm([(hw(t + e) - hw(t - e)) / (2 * e), L]); };
  const pts = [];
  // base → first sinus
  for (const t of ts) if (t < sinus[0]) pts.push([hw(t) * (1 - (1 - S[0][0] / Math.max(hw(sinus[0]), 1e-6)) * smoothstep(0, sinus[0], t)), t * L]);
  pts.push(S[0]);
  const rounded = lob.shape !== 'acute';
  const slit = lob.sinus === 'slit';
  const U = lob.sinus !== 'V' && !slit;
  const sl = L * 0.005;
  const outN = norm([1, 0.35]);
  for (let k = 0; k < K; k++) {
    let s0 = S[k], s1 = S[k + 1];
    const tp = T[k];
    const half = Math.max(dist(s0, s1) * 0.5, L * 0.01);
    const tt = envTan(tp[1] / L);
    const rs = U ? half * 0.55 : 0;
    if (slit) {
      if (k > 0) { pts.push(add(s0, [-sl * 0.6, 0]), add(s0, [0, sl])); }
      s0 = add(s0, [0, k > 0 ? sl : 0]);
      s1 = add(s1, [0, -sl]);
    }
    const h0 = Math.max(L * 0.01, tp[0] - s0[0]), h1 = Math.max(L * 0.01, tp[0] - s1[0]);
    // rising flank
    const c1 = slit ? add(s0, mul(outN, h0 * 0.6)) : U ? add(add(s0, [0, rs]), [half * 0.25, 0]) : lerp(s0, tp, 0.3);
    const c2 = rounded ? sub(tp, mul(tt, half * 0.95)) : lerp(s0, tp, 0.75);
    pts.push(...bezier(s0, c1, c2, tp, 18).slice(1));
    // falling flank
    const d1 = rounded ? add(tp, mul(tt, half * 0.95)) : lerp(tp, s1, 0.25);
    const d2 = slit ? add(s1, mul(outN, h1 * 0.6)) : U ? add(s1, [half * 0.2, -rs]) : lerp(tp, s1, 0.7);
    pts.push(...bezier(tp, d1, d2, s1, 18).slice(1));
  }
  // last sinus → apex along envelope
  const tl = sinus[K];
  const dl = 1 - S[K][0] / Math.max(hw(tl), 1e-6);
  for (const t of ts) if (t > tl) pts.push([hw(t) * (1 - dl * (1 - smoothstep(tl, tl + gap * 0.8, t))), t * L]);
  // lobe sublobing (laciniate) via coarse secondary incisions
  let out = pts;
  if (lob.sublobes) out = sublobe(pts, L, rng);
  return { pts: out, lobeTips: T.map((pt) => ({ pt })) };
}

function sublobe(pts, L, rng) {
  const dense = resample(pts, L / 600);
  const cum = cumLengths(dense);
  const per = L * 0.035;
  return dense.map((p, i) => {
    if (i === 0 || i === dense.length - 1) return p;
    const tn = norm(sub(dense[Math.min(i + 1, dense.length - 1)], dense[i - 1]));
    const n = [tn[1], -tn[0]];
    const u = (cum[i] / per) % 1;
    const amp = L * 0.012 * (u < 0.75 ? u / 0.75 : (1 - u) / 0.25);
    return add(p, mul(n, amp * smoothstep(0, L * 0.08, p[0])));
  });
}
