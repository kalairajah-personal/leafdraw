// Margin module: applies tooth profiles along a half-margin path (attachment → apex, right side, x ≥ 0).
// Serrate teeth lean toward the nearest "target" (lobe tip or apex), matching real tooth orientation.
import { resample, cumLengths, sub, norm, add, mul, rot, smoothstep, clamp } from './geom.js';

const PROFILES = {
  saw: (u) => (u < 0.72 ? Math.pow(u / 0.72, 0.85) : Math.pow((1 - u) / 0.28, 1.25)),
  tri: (u) => 1 - Math.abs(2 * u - 1),
  scallop: (u) => Math.pow(Math.sin(Math.PI * u), 0.6),
  wave: (u) => 0.5 - 0.5 * Math.cos(2 * Math.PI * u),
};
const TIP_U = { saw: 0.72, tri: 0.5, scallop: 0.5, wave: 0.5, crisp: 0.5 };

/**
 * @param path half margin, open polyline
 * @param m margin config {profile, spacing, height, minor, spines, hairs, toothAwn}
 * @param targetsS arclength positions (in mm along path) of lobe tips / apex
 * @param opts {startFade, endFade, skipRanges:[[s0,s1]]}
 */
export function applyMargin(path, m, targetsS, rng, opts = {}) {
  const extras = [];
  const tips = [];
  if (!m || m.profile === 'none' || !m.spacing) {
    if (m?.hairs) extras.push(...hairs(path, m.hairs, rng));
    return { path, tips, extras };
  }
  const step = clamp(m.spacing / 14, 0.05, 0.6);
  const pts = resample(path, step);
  const cum = cumLengths(pts);
  const total = cum[cum.length - 1];
  const startFade = opts.startFade ?? Math.min(total * 0.06, m.spacing * 1.5);
  const endFade = opts.endFade ?? Math.min(total * 0.05, m.spacing * 1.2);

  // Tooth boundaries with jitter.
  const bounds = [];
  let s = startFade * 0.5 + rng.next() * m.spacing * 0.3;
  while (s < total) { bounds.push(s); s += m.spacing * (0.86 + 0.28 * rng.next()); }
  bounds.push(total + m.spacing);
  const hj = bounds.map(() => 0.85 + 0.3 * rng.next());
  const phases = bounds.map(() => rng.next() * Math.PI * 2);
  const targets = [...(targetsS || []), total].sort((a, b) => a - b);

  const out = [];
  let ti = 0;
  const prof = PROFILES[m.profile] || PROFILES.tri;
  const tipU = TIP_U[m.profile] ?? 0.5;
  const tipCandidates = new Map();
  for (let i = 0; i < pts.length; i++) {
    const si = cum[i];
    while (ti < bounds.length - 2 && si > bounds[ti + 1]) ti++;
    const a = bounds[ti], b = bounds[ti + 1];
    let u = si < a ? 0 : clamp((si - a) / (b - a), 0, 1);
    // Direction toward nearest target.
    let ahead = targets.find((x) => x >= si) ?? total, behind = -Infinity;
    for (const x of targets) if (x < si) behind = x;
    const forward = (si - behind) < (ahead - si) * 0.55 ? -1 : 1;
    const uu = forward > 0 ? u : 1 - u;
    let y;
    if (m.profile === 'crisp') y = 0.5 + 0.5 * Math.sin(2 * Math.PI * u + phases[ti]) * Math.sin(Math.PI * u * 3 + phases[ti + 1]);
    else y = prof(uu);
    if (m.minor && m.profile === 'saw' && uu < TIP_U.saw * 0.95) {
      const k = m.minor + 1;
      const um = (uu / (TIP_U.saw * 0.95)) * k;
      const fm = um - Math.floor(um);
      if (Math.floor(um) < k - 1) y += 0.3 * PROFILES.saw(fm) * (0.6 + 0.4 * uu);
    }
    let amp = m.height * hj[ti];
    amp *= smoothstep(0, startFade, si) * (1 - smoothstep(total - endFade, total, si));
    if (opts.skip && opts.skip.some(([s0, s1]) => si > s0 && si < s1)) amp = 0;
    if (opts.limitByX !== false) amp = Math.min(amp, Math.max(0, pts[i][0] - (opts.midX ? opts.midX(pts[i][1]) : 0)) * 0.4);
    const tA = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
    const nrm = [tA[1], -tA[0]]; // outward for right half
    let disp = m.profile === 'wave' || m.profile === 'crisp' ? (y - 0.5) * 2 * amp : y * amp;
    let p = add(pts[i], mul(nrm, disp));
    if (m.profile === 'saw') p = add(p, mul(tA, forward * y * amp * 0.18));
    out.push(p);
    // Tooth tip bookkeeping.
    if (amp > m.height * 0.35) {
      const du = Math.abs(uu - tipU);
      const prev = tipCandidates.get(ti);
      if (!prev || du < prev.du) tipCandidates.set(ti, { du, idx: out.length - 1, normal: nrm, tangent: mul(tA, forward), s: si });
    }
  }
  for (const c of tipCandidates.values()) {
    if (c.du > 0.15) continue;
    tips.push({ pt: out[c.idx], s: c.s, normal: c.normal, tangent: c.tangent, idx: c.idx });
  }
  // Spines / bristles at tips.
  const spike = m.spines || m.toothAwn;
  if (spike) for (const tp of tips) {
    const dir = norm(add(tp.normal, mul(tp.tangent, 0.9)));
    extras.push({ role: 'spine', pts: [tp.pt, add(tp.pt, mul(dir, spike * (0.8 + 0.4 * rng.next())))] });
  }
  if (m.hairs) extras.push(...hairs(out, m.hairs, rng));
  return { path: out, tips, extras };
}

function hairs(path, len, rng) {
  const res = [];
  const pts = resample(path, Math.max(0.35, len * 0.45));
  for (let i = 1; i < pts.length - 1; i++) {
    const t = norm(sub(pts[i + 1], pts[i - 1]));
    const n = rot([t[1], -t[0]], (rng.next() - 0.3) * 0.7);
    const l = len * (0.6 + 0.6 * rng.next());
    res.push({ role: 'hair', pts: [pts[i], add(pts[i], mul(n, l))] });
  }
  return res;
}
