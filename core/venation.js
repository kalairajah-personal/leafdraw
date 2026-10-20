// Venation module. Implements Manual of Leaf Architecture categories:
// primary: pinnate, actinodromous, palinactinodromous, acrodromous, campylodromous, parallel, flabellate, dichotomous
// secondary: craspedodromous, semicraspedodromous, brochidodromous, festooned-brochidodromous,
//            eucamptodromous, cladodromous, reticulodromous, parallelodromous
// tertiary: opposite/alternate/mixed percurrent, reticulate, ramified, transverse
// higher orders: open space colonization (Runions et al. 2005) + loop closure → areoles with FEVs.
import { Field } from './field.js';
import { voronoiEdges } from './delaunay.js';
import {
  add, sub, mul, norm, len, dist, rot, lerp, dot, clamp, bezier, resample, cumLengths, pointAt, tangentAt,
  rayHitPolyline, SpatialHash, poissonInPoly, angleOf, cutPolylineByPolys, chaikin, polyLength, closestOnPoly,
} from './geom.js';

const D2R = Math.PI / 180;

export function buildVenation(geo, cfg, rng, opts = {}) {
  const V = cfg.venation;
  const L = cfg.L;
  const holes = opts.holes || [];
  const field = new Field(geo.outline, holes, opts.cells || 480);
  const W = geo.width || L / (cfg.blade?.aspect || 2);
  const step = clamp(L / 260, 0.12, 1.2);
  const veins = [];
  const hash = new SpatialHash(step * 3);
  let nextId = 1;

  const addVein = (pts, role, meta = {}) => {
    if (!pts || pts.length < 2) return null;
    const v = { id: nextId++, role, pts, ...meta };
    veins.push(v);
    for (const p of resample(pts, step)) hash.insert(p, v.id);
    return v;
  };

  const collides = (p, selfId, ignore = new Set()) => {
    for (const e of hash.near(p, step * 0.9)) if (e.data !== selfId && !ignore.has(e.data)) return e.data;
    return null;
  };

  // Generic marcher. dir0 unit vector; bendTo: function(p) → preferred unit direction; returns polyline.
  const march = (start, dir0, o = {}) => {
    const pts = [start];
    let p = start, d = dir0;
    const maxLen = o.maxLen ?? L * 2;
    const stopD = o.stopDist ?? step;
    const ignore = new Set(o.ignore || []);
    let travelled = 0;
    while (travelled < maxLen) {
      if (o.bendTo) {
        const target = o.bendTo(p, travelled);
        if (o.curvature != null) {
          const ang = Math.atan2(cross2(d, target), dot(d, target));
          const maxTurn = o.curvature * step;
          d = rot(d, clamp(ang, -maxTurn, maxTurn));
        } else d = norm(lerp(d, target, clamp(o.bendRate ?? 0.02, 0, 1)));
      }
      const np = add(p, mul(d, step));
      if (!field.inside(np)) break;
      if (field.d(np) < stopD && travelled > (o.minLen ?? step * 2)) { pts.push(np); break; }
      if (o.avoid !== false && travelled > (o.graceLen ?? step * 4)) {
        const hit = collides(np, -1, ignore);
        if (hit != null) { pts.push(np); return Object.assign(pts, { hitId: hit }); }
      }
      pts.push(np); p = np; travelled += step;
    }
    return pts;
  };

  const tips = (geo.toothTips || []).map((t, i) => ({ ...t, i, used: false }));
  const snap = (pl, side, radius) => {
    if (!tips.length || pl.length < 2) return pl;
    const end = pl[pl.length - 1];
    const dirEnd = norm(sub(end, pl[Math.max(0, pl.length - 4)]));
    let best = null, bd = Infinity;
    for (const t of tips) {
      if (t.used || (side && t.side !== side)) continue;
      const v = sub(t.pt, end);
      const d = len(v);
      if (d > radius) continue;
      const score = d - 0.5 * dot(v, dirEnd);
      if (score < bd) { bd = score; best = t; }
    }
    if (!best) return pl;
    best.used = true;
    // Rejoin: cut tail back ~35% of the remaining distance, bezier to tooth tip.
    const cut = Math.max(1, pl.length - Math.ceil(dist(end, best.pt) / step) - 3);
    const head = pl.slice(0, cut);
    const a = head[head.length - 1];
    const t0 = norm(sub(a, head[Math.max(0, head.length - 3)]));
    const curve = bezier(a, add(a, mul(t0, dist(a, best.pt) * 0.4)), lerp(a, best.pt, 0.75), best.pt, 12);
    return [...head, ...curve.slice(1)];
  };

  // ---------------- primaries ----------------
  const prim = V.primary;
  const mid = geo.midrib;
  const primaries = [];
  if (['pinnate', 'actinodromous', 'palinactinodromous', 'acrodromous', 'campylodromous'].includes(prim) && mid) primaries.push(addVein(mid, 'v1', { kind: 'midrib' }));

  if (prim === 'actinodromous' || prim === 'palinactinodromous') actinoPrimaries();
  else if (prim === 'acrodromous' || prim === 'campylodromous') arcPrimaries(prim === 'campylodromous');
  else if (prim === 'parallel') parallelVeins();
  else if (prim === 'flabellate' || prim === 'dichotomous') dichotomous();

  // Veins into basal lobes (cordate, sagittate, hastate, auriculate) when no primary reaches them.
  if (geo.basalLobes?.length && !['parallel', 'flabellate', 'dichotomous'].includes(prim)) {
    for (const bl of geo.basalLobes) {
      const tip = bl.pt;
      const served = veins.some((v) => dist(v.pts[v.pts.length - 1], tip) < W * 0.15);
      if (served) continue;
      const a = geo.attach;
      const m = add(lerp(a, tip, 0.5), [ (tip[0] - a[0]) * 0.15, Math.abs(tip[1] - a[1]) * 0.1 ]);
      const pts = trimToInside(resample(chaikin([a, m, tip], 2), step));
      const v = addVein(pts, 'v1', { kind: 'basal' });
      if (v) primaries.push(v);
    }
  }

  // ---------------- secondaries ----------------
  const groups = new Map(); // key → ordered secondaries
  if (!['parallel', 'flabellate', 'dichotomous'].includes(prim) && V.secondary !== 'none') {
    for (const p of primaries) for (const side of [1, -1]) secondariesOn(p, side);
    finishSecondaries();
  }

  // ---------------- tertiaries ----------------
  const tStyle = V.tertiary;
  if (['opposite-percurrent', 'alternate-percurrent', 'mixed-percurrent'].includes(tStyle)) {
    for (const g of groups.values()) for (let i = 0; i + 1 < g.length; i++) percurrent(g[i].pts, g[i + 1].pts, V.tertSpacing * L, tStyle, 'v3');
    // Between midrib and first/last secondaries of lateral primaries handled by areoles.
  } else if (tStyle === 'reticulate') {
    reticulum(V.tertSpacing * L * 1.25, 'v3', 0);
  } else if (tStyle === 'ramified') {
    colonize(V.tertSpacing * L * 1.15, 'v3', 0.15, 3);
  }

  // ---------------- marginal vein ----------------
  if (V.marginal && V.marginal !== 'none' && V.marginalOffset > 0) {
    const ring = resample(geo.outline, step * 2, true).map((p) => add(p, mul(field.grad(p), V.marginalOffset)));
    const keep = ring.filter((p) => dist(p, geo.attach) > W * 0.12 && field.inside(p));
    // break into runs (skip around attachment)
    const runs = []; let cur = [];
    for (const p of keep) { if (cur.length && dist(cur[cur.length - 1], p) > step * 6) { runs.push(cur); cur = []; } cur.push(p); }
    if (cur.length) runs.push(cur);
    for (const r of runs) if (r.length > 3) addVein(chaikin(r, 1), V.marginal === 'fimbrial' ? 'v3' : 'v2', { kind: 'marginal' });
  }

  // ---------------- areoles / higher orders ----------------
  if (V.areoles && V.areoles !== 'none' && V.areoleSpacing) reticulum(Math.max(0.45, V.areoleSpacing * L), 'v4', V.areoles === 'well-developed' ? 0.55 : 0.35);

  // Sori (ferns): dots near secondary ends.
  const dots = [];
  if (V.sori) {
    for (const v of veins) if (v.role === 'v2' && polyLength(v.pts) > 1) {
      const c = pointAt(v.pts, 0.62);
      const r = clamp(W * 0.05, 0.25, 1.4);
      dots.push(Array.from({ length: 10 }, (_, k) => add(c, [r * Math.cos((k / 10) * 2 * Math.PI), r * Math.sin((k / 10) * 2 * Math.PI)])));
    }
  }

  // Cut by holes.
  let out = veins.map((v) => ({ role: v.role, pts: v.pts }));
  if (holes.length) out = out.flatMap((v) => cutPolylineByPolys(v.pts, holes, step).map((pts) => ({ role: v.role, pts })));
  return { veins: out, sori: dots, field };

  // ======================= implementations =======================

  function midTangentAt(pl, s) { return tangentAt(pl, s); }

  function secondariesOn(primary, side) {
    if (!primary) return;
    const pl = primary.pts;
    const plen = polyLength(pl);
    const cum = cumLengths(pl);
    const isMid = primary.kind === 'midrib';
    const key = `${primary.id}:${side}`;
    const list = [];
    const sec = V.secondary;
    const actino = (prim === 'actinodromous' || prim === 'palinactinodromous');
    const arcs = (prim === 'acrodromous' || prim === 'campylodromous');

    // Lobe-targeted secondaries (pinnately lobed blades).
    const lobeTargets = isMid && prim === 'pinnate' ? (geo.lobeTips || []).filter((t) => t.side === side) : [];
    if (lobeTargets.length) {
      for (const lt of lobeTargets.sort((a, b) => a.pt[1] - b.pt[1])) {
        const tfrac = clamp(lt.pt[1] / L, 0, 1);
        const phi = lerpAng(V.secAngleBase, V.secAngleApex, tfrac);
        // choose midrib origin whose direction to tip best matches phi
        let best = 0, bd = Infinity;
        for (let i = 0; i < pl.length; i++) {
          const v = sub(lt.pt, pl[i]); if (v[1] < -W * 0.05) continue;
          const a = Math.acos(clamp(dot(norm(v), midTangentAt(pl, cum[i] / plen)), -1, 1));
          const dd = Math.abs(a - phi);
          if (dd < bd) { bd = dd; best = i; }
        }
        const o = pl[best];
        const tv = sub(lt.pt, o);
        const t0 = rot(norm(tv), -side * 0.12);
        let pts = bezier(o, add(o, mul(t0, len(tv) * 0.35)), lerp(o, lt.pt, 0.72), lt.pt, 28);
        pts = keepInside(resample(pts, step), Math.max(step, W * 0.025));
        const v = addVein(pts, 'v2', { parent: primary.id, side, s: cum[best] / plen });
        list.push(v);
      }
      // Sinus veins (thin, stop short of sinus margin).
      for (let i = 0; i + 1 < list.length; i++) {
        const s = (list[i].s + list[i + 1].s) / 2;
        const o = pointAt(pl, s, cum);
        const phi = lerpAng(V.secAngleBase, V.secAngleApex, s);
        const d0 = rot(midTangentAt(pl, s), -side * phi);
        const vpts = march(o, d0, { stopDist: Math.max(1.2, W * 0.04), ignore: [primary.id], bendTo: () => midTangentAt(pl, s), bendRate: 0.01 });
        if (polyLength(vpts) > W * 0.08) addVein(vpts, 'v3', { parent: primary.id, side, kind: 'sinus' });
      }
      groups.set(key, list);
      return;
    }

    // Natural secondaries.
    let n = V.secCount;
    let s0 = 0.05, s1 = 0.92;
    if (actino && !isMid) { s0 = 0.12; s1 = 0.9; }
    if (actino && isMid) s0 = Math.max(0.22, (V.suprabasal || 0) + 0.18);
    if (arcs && isMid) { s0 = 0.08; s1 = 0.9; }
    if (!n) {
      if (sec === 'parallelodromous') n = clamp(Math.round(plen / Math.max(1, L * 0.018)), 12, 90);
      else if (sec === 'craspedodromous' && tips.length) n = clamp(Math.round(tips.filter((t) => t.side === side).length * (cfg.margin.minor ? 1 : 0.7)), 4, 22);
      else n = clamp(Math.round(plen / (W * 0.27)), 5, 18);
      if (!isMid) n = clamp(Math.round(n * plen / L * 1.2), 2, 12);
      if (arcs && isMid) n = clamp(Math.round(n * 1.2), 6, 20);
    } else if (!isMid) n = clamp(Math.round(n * plen / L * 1.1), 2, 14);
    else n = Math.round(n);

    const spacings = Array.from({ length: n }, () => 0.8 + 0.4 * rng.next());
    const tot = spacings.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const s = s0 + ((acc + spacings[i] * 0.5) / tot) * (s1 - s0);
      acc += spacings[i];
      const o = pointAt(pl, s, cum);
      const tan = midTangentAt(pl, s);
      let phi = sec === 'parallelodromous' ? (V.secAngleBase + V.secAngleApex) / 2 : lerpAng(V.secAngleBase, V.secAngleApex, isMid ? s : 0.5);
      // Wide-based blades: basal secondaries spread wider (angle increasing proximally).
      if (isMid && prim === 'pinnate' && sec !== 'parallelodromous') phi += 20 * D2R * clamp(1 - s / 0.3, 0, 1) * clamp((0.5 - (cfg.blade?.widest ?? 0.5)) / 0.18, 0, 1);
      const d0 = rot(tan, -side * (phi + 8 * D2R));
      let stopDist;
      switch (sec) {
        case 'craspedodromous': stopDist = Math.max(step * 1.2, (cfg.margin.height || 0.5) * 1.5); break;
        case 'brochidodromous': case 'festooned-brochidodromous': case 'semicraspedodromous': stopDist = clamp(W * 0.06, 0.6, 12); break;
        case 'eucamptodromous': stopDist = clamp(W * 0.1, 1, 15); break;
        case 'cladodromous': stopDist = clamp(W * 0.12, 0.6, 15); break;
        case 'reticulodromous': stopDist = clamp(W * 0.18, 1, 20); break;
        case 'parallelodromous': stopDist = step * 1.2; break;
        default: stopDist = W * 0.06;
      }
      stopDist = Math.min(stopDist, Math.max(step * 1.2, field.d(add(o, mul(rot(tan, -side * Math.PI / 2), step * 2))) * 0.45));
      const curvature = sec === 'parallelodromous' ? 0 : sec === 'eucamptodromous' ? 3.2 / W : (sec === 'craspedodromous' ? 0.6 : 2.2) * (0.3 + V.secCurve) / W;
      const minAng = { craspedodromous: phi * 0.55, brochidodromous: 24 * D2R, 'festooned-brochidodromous': 24 * D2R, semicraspedodromous: 24 * D2R, eucamptodromous: 9 * D2R, cladodromous: 26 * D2R, reticulodromous: 30 * D2R }[sec] ?? 20 * D2R;
      const asym = rot(tan, -side * minAng);
      const ramp = sec === 'eucamptodromous' ? W * 0.18 : W * 0.06;
      let pts = march(o, d0, { stopDist, ignore: [primary.id], bendTo: (p, tr) => (tr < ramp ? d0 : asym), curvature });
      if (polyLength(pts) < Math.max(step * 3, W * 0.04)) continue;
      if (sec === 'craspedodromous') pts = snap(pts, isMid || !actino ? side : 0, Math.max((cfg.margin.spacing || 2) * 1.6, W * 0.12));
      const role = sec === 'parallelodromous' ? 'v2' : 'v2';
      const v = addVein(pts, role, { parent: primary.id, side, s });
      list.push(v);
      if (sec === 'eucamptodromous') {
        // fade: continue upward along margin, thinner
        const end = pts[pts.length - 1];
        const fade = march(end, norm(add(norm(sub(end, pts[pts.length - 3])), tan)), { stopDist: stopDist * 0.4, maxLen: W * 0.35, ignore: [v.id], bendTo: () => tan, bendRate: 0.05 });
        if (fade.length > 2) addVein(fade, 'v3', { parent: v.id });
      }
      if (sec === 'cladodromous') {
        const end = pts[pts.length - 1];
        const k = 2 + (rng.next() < 0.4 ? 1 : 0);
        const out = norm(mul(field.grad(end), -1));
        for (let j = 0; j < k; j++) {
          const ang = (j - (k - 1) / 2) * 0.5;
          const br = march(end, rot(out, ang), { stopDist: step, ignore: [v.id], maxLen: W * 0.4 });
          if (br.length > 2) addVein(br, 'v3', { parent: v.id });
        }
      }
    }
    if (V.intersecondary > 0 && sec !== 'parallelodromous') {
      for (let i = 0; i + 1 < list.length; i++) {
        if (rng.next() > V.intersecondary) continue;
        const s = (list[i].s + list[i + 1].s) / 2;
        const o = pointAt(pl, s, cum);
        const tan = midTangentAt(pl, s);
        const d0 = rot(tan, -side * lerpAng(V.secAngleBase, V.secAngleApex, s));
        const pts = march(o, d0, { stopDist: W * 0.2, ignore: [primary.id], bendTo: () => tan, bendRate: 0.01, maxLen: W * 0.35 });
        if (pts.length > 3) addVein(pts, 'v3', { parent: primary.id, side, kind: 'intersecondary' });
      }
    }
    groups.set(key, list.sort((a, b) => a.s - b.s));
  }

  function finishSecondaries() {
    const sec = V.secondary;
    if (sec === 'craspedodromous' || sec === 'semicraspedodromous') {
      // Unserved major teeth: abmedial branch from the nearest secondary (max 2 per secondary).
      const all = [...groups.values()].flat();
      const served = new Map();
      for (const t of tips) {
        if (t.used) continue;
        let best = null, bd = Infinity, bv = null;
        for (const v of all) {
          if ((served.get(v.id) || 0) >= 2) continue;
          const cand = v.pts.slice(Math.floor(v.pts.length * 0.45));
          for (const p of cand) { const d = dist(p, t.pt); if (d < bd) { bd = d; best = p; bv = v; } }
        }
        if (!best || bd > W * 0.28 || bd < step * 2) continue;
        const pts = bezier(best, lerp(best, t.pt, 0.35), lerp(best, t.pt, 0.75), t.pt, 10);
        if (pts.every((p, i) => i > pts.length - 3 || field.inside(p))) { addVein(pts, 'v3', { kind: 'tooth-branch' }); t.used = true; served.set(bv.id, (served.get(bv.id) || 0) + 1); }
      }
    }
    if (sec === 'brochidodromous' || sec === 'festooned-brochidodromous' || sec === 'semicraspedodromous') {
      for (const g of groups.values()) {
        for (let i = 0; i + 1 < g.length; i++) {
          const A = g[i].pts, Bv = g[i + 1].pts;
          const E = A[A.length - 1];
          const q = pointAt(Bv, 0.78);
          if (dist(E, q) > W * 0.8) continue;
          const tA = norm(sub(E, A[Math.max(0, A.length - 4)]));
          const toward = norm(sub(q, E));
          const bow = norm(add(tA, toward));
          const tB = tangentAt(Bv, 0.78);
          const loop = bezier(E, add(E, mul(bow, dist(E, q) * 0.4)), add(q, mul(tB, dist(E, q) * 0.16)), q, 14);
          if (loop.every((p) => field.inside(p))) {
            const lv = addVein(loop, 'v2', { kind: 'loop' });
            if (sec === 'festooned-brochidodromous') {
              const m0 = pointAt(loop, 0.25), m1 = pointAt(loop, 0.8);
              const out = mul(field.grad(pointAt(loop, 0.5)), -1);
              const f = bezier(m0, add(m0, mul(out, W * 0.05)), add(m1, mul(out, W * 0.05)), m1, 10);
              if (f.every((p) => field.inside(p))) addVein(f, 'v3', { kind: 'festoon' });
            }
            if (sec === 'semicraspedodromous') {
              const apexPt = pointAt(loop, 0.5);
              let best = null, bd = Infinity;
              for (const t of tips) { if (t.used) continue; const d = dist(t.pt, apexPt); if (d < bd) { bd = d; best = t; } }
              if (best && bd < W * 0.25) { best.used = true; addVein(bezier(apexPt, lerp(apexPt, best.pt, 0.3), lerp(apexPt, best.pt, 0.7), best.pt, 8), 'v3', { parent: lv.id }); }
            }
          }
        }
      }
    }
  }

  function percurrent(A, B, spacing, style, role) {
    const la = polyLength(A);
    if (la < spacing * 1.5) return;
    const cumA = cumLengths(A);
    const n = Math.floor(la / spacing);
    for (let k = 1; k < n; k++) {
      const s = k / n;
      if (s < 0.12 || s > 0.94) continue;
      const a = pointAt(A, s, cumA);
      const tA = tangentAt(A, s, cumA);
      const bNear = pointAt(B, clamp(s * 0.95, 0, 1));
      let dir = norm(sub(bNear, a));
      const nrm = [-tA[1], tA[0]];
      if (dot(nrm, dir) < 0) { nrm[0] *= -1; nrm[1] *= -1; }
      dir = norm(lerp(nrm, dir, 0.55));
      const hit = rayHitPolyline(a, dir, B, W * 1.2);
      if (!hit || hit.dist > W * 0.9 || hit.dist < step * 2) continue;
      const b = hit.pt;
      let st = style;
      if (style === 'mixed-percurrent') st = rng.next() < 0.5 ? 'opposite-percurrent' : 'alternate-percurrent';
      let pts;
      const m = lerp(a, b, 0.5);
      const off = mul([-dir[1], dir[0]], (rng.next() - 0.5) * dist(a, b) * 0.12);
      if (st === 'alternate-percurrent') {
        const kink = mul(tA, dist(a, b) * 0.18 * (rng.next() < 0.5 ? 1 : -1));
        pts = [a, add(lerp(a, b, 0.48), kink), add(lerp(a, b, 0.52), mul(kink, -0.2)), b];
      } else pts = chaikin([a, add(m, off), b], 2);
      if (pts.every((p) => field.inside(p))) addVein(pts, role, { kind: 'tertiary' });
    }
  }

  // Polygonal reticulum (areoles): Voronoi cells around Poisson-spaced centres, plus freely ending veinlets.
  function reticulum(spacing, role, fevFrac) {
    const pts = poissonInPoly(geo.outline, spacing, rng, 3500, holes);
    if (pts.length < 4) return;
    const { edges } = voronoiEdges(pts);
    const minD = Math.min(spacing * 0.12, W * 0.01);
    for (const e of edges) {
      let a = e.p, b = e.q;
      const ia = field.inside(a) && field.d(a) > minD, ib = field.inside(b) && field.d(b) > minD;
      if (!ia && !ib) continue;
      if (dist(a, b) > spacing * 3) continue;
      if (!ia || !ib) {
        const from = ia ? a : b, to = ia ? b : a;
        let q = from; const dir = norm(sub(to, from)); const L0 = dist(from, to);
        for (let t = 0; t < L0; t += step * 0.5) { const np = add(from, mul(dir, t)); if (!field.inside(np) || field.d(np) <= minD) break; q = np; }
        a = from; b = q;
        if (dist(a, b) < step) continue;
      }
      const m = lerp(a, b, 0.5);
      const nrm = norm([-(b[1] - a[1]), b[0] - a[0]]);
      const w = mul(nrm, (rng.next() - 0.5) * dist(a, b) * 0.18);
      const ptsE = [a, add(m, w), b];
      if (holes.length && ptsE.some((p) => holes.some((h) => pointInPolyFast(p, h)))) continue;
      addVein(ptsE, role, { kind: 'areole' });
    }
    if (fevFrac > 0) {
      const cellEdges = new Map();
      for (const e of edges) for (const c of e.cells) { if (!cellEdges.has(c)) cellEdges.set(c, []); cellEdges.get(c).push(e); }
      pts.forEach((c, i) => {
        if (rng.next() > fevFrac || field.d(c) < spacing * 0.4) return;
        const es = cellEdges.get(i); if (!es || !es.length) return;
        const e = es[Math.floor(rng.next() * es.length)];
        const start = lerp(e.p, e.q, 0.35 + 0.3 * rng.next());
        if (!field.inside(start)) return;
        const end = lerp(start, c, 0.55 + 0.3 * rng.next());
        addVein([start, end], 'v5', { kind: 'fev' });
        if (rng.next() < 0.45) { const dir = norm(sub(end, start)); addVein([end, add(end, mul(rot(dir, (rng.next() < 0.5 ? 1 : -1) * (0.5 + 0.5 * rng.next())), spacing * 0.2))], 'v5', { kind: 'fev' }); }
      });
    }
  }

  // Open space colonization (auxin sources → growing veinlets) + loop closure.
  function colonize(spacing, role, closeFrac, order) {
    const sources = poissonInPoly(geo.outline, spacing, rng, 2500, holes);
    const srcHash = new SpatialHash(spacing);
    const alive = sources.map((p) => ({ p, alive: true }));
    for (const s of alive) srcHash.insert(s.p, s);
    const nodeHash = new SpatialHash(spacing);
    const nodes = [];
    for (const v of veins) for (const p of resample(v.pts, spacing / 2.5)) { const n = { p, parent: null, children: 0, branch: -1, base: true }; nodes.push(n); nodeHash.insert(p, n); }
    const grow = spacing / 3.5, kill = spacing * 0.42, infl = spacing * 2.6;
    // kill sources already near veins
    for (const s of alive) if (nodeHash.near(s.p, kill).length) s.alive = false;
    let branchId = 0;
    for (let it = 0; it < 110; it++) {
      const pulls = new Map();
      for (const s of alive) {
        if (!s.alive) continue;
        const near = nodeHash.nearest(s.p, infl);
        if (!near) continue;
        const n = near.data;
        if (!pulls.has(n)) pulls.set(n, [0, 0, 0]);
        const d = norm(sub(s.p, n.p));
        const acc = pulls.get(n); acc[0] += d[0]; acc[1] += d[1]; acc[2]++;
      }
      if (!pulls.size) break;
      let grew = 0;
      for (const [n, acc] of pulls) {
        const dir = norm([acc[0], acc[1]]);
        if (!len(dir)) continue;
        const np = add(n.p, mul(dir, grow));
        if (!field.inside(np)) continue;
        const child = { p: np, parent: n, children: 0, branch: n.base || n.children > 0 ? branchId++ : n.branch, base: false };
        n.children++;
        nodes.push(child); nodeHash.insert(np, child); grew++;
        for (const e of srcHash.near(np, kill)) e.data.alive = false;
      }
      if (!grew) break;
    }
    // Collect grown chains as polylines.
    const grown = nodes.filter((n) => !n.base);
    const isTip = new Set(grown.filter((n) => n.children === 0));
    for (const tip of isTip) {
      const chain = [tip.p];
      let n = tip;
      while (n.parent) { n = n.parent; chain.push(n.p); if (n.base || n.children > 1) break; }
      if (chain.length >= 2) addVein(chain.reverse(), role, { kind: 'areole' });
      // Loop closure: connect FEV tip to a nearby node from another branch.
      if (rng.next() < closeFrac * 0.85) {
        let best = null, bd = Infinity;
        for (const e of nodeHash.near(tip.p, spacing * 1.1)) {
          const m = e.data; if (m === tip || m.branch === tip.branch || m === tip.parent) continue;
          const d = dist(m.p, tip.p); if (d < bd && d > grow * 0.5) { bd = d; best = m; }
        }
        if (best) addVein([tip.p, best.p], order >= 4 ? 'v5' : role, { kind: 'closure' });
      }
    }
  }

  function actinoPrimaries() {
    const n = Math.max(3, V.primaryCount | 0);
    const lateralPairs = Math.floor((n - 1) / 2);
    const base = geo.attach;
    const supra = V.suprabasal || 0;
    const tipsL = (geo.lobeTips || []).slice();
    const origin = supra > 0 ? pointAt(mid, supra) : base;
    const center = geo.center || origin;
    if (geo.peltate) {
      // radiate all around
      const count = Math.max(5, tipsL.length || n);
      const targets = tipsL.length ? tipsL.map((t) => t.pt) : Array.from({ length: count }, (_, k) => {
        const a = (k / count) * Math.PI * 2;
        return rayToMargin(center, [Math.sin(a), Math.cos(a)]);
      });
      for (const tp of targets) {
        const pts = resample(chaikin([center, lerp(center, tp, 0.5), tp], 1), step);
        primaries.push(addVein(trimToInside(pts), 'v1', { kind: 'primary' }));
      }
      return;
    }
    const lobeSorted = tipsL.map((t) => ({ ...t, a: Math.atan2(t.pt[0] - center[0], t.pt[1] - center[1]) })).sort((a, b) => a.a - b.a);
    const used = new Set();
    for (const side of [1, -1]) {
      const cand = lobeSorted.filter((t) => Math.sign(t.a) === side && Math.abs(t.a) > 0.15).sort((a, b) => Math.abs(a.a) - Math.abs(b.a));
      for (let k = 0; k < lateralPairs; k++) {
        let target = null;
        if (cand[k]) { target = cand[k].pt; used.add(cand[k]); }
        let pts;
        if (target) {
          const mid1 = add(lerp(origin, target, 0.5), mul([0, 1], dist(origin, target) * 0.04));
          pts = resample(chaikin([origin, mid1, target], 2), step);
          pts = trimToInside(pts);
        } else {
          const ang = side * ((k + 1) / (lateralPairs + 0.6)) * Math.min(115, 38 + 32 * lateralPairs) * D2R;
          const d0 = [Math.sin(ang), Math.cos(ang)];
          pts = march(origin, d0, { stopDist: (cfg.margin.height || 0.5) * 1.5 + step, avoid: false, bendTo: () => [0, 1], bendRate: 0.004, minLen: W * 0.25 });
          if (V.secondary === 'craspedodromous') pts = snap(pts, side, W * 0.2);
        }
        const v = addVein(pts, 'v1', { kind: 'primary' });
        primaries.push(v);
        if (prim === 'palinactinodromous' && v) {
          // fork toward an unused lobe tip near this primary
          const extra = cand.slice(lateralPairs).concat(lobeSorted.filter((t) => !used.has(t) && Math.sign(t.a) === side));
          const tgt = extra.find((t) => !used.has(t));
          if (tgt) {
            used.add(tgt);
            const fp = pointAt(v.pts, 0.45);
            addVein(resample(chaikin([fp, lerp(fp, tgt.pt, 0.5), tgt.pt], 1), step), 'v1', { kind: 'primary-branch' });
          }
        }
      }
    }
    // remaining lobe tips (e.g. small basal lobes): branch from nearest primary
    for (const t of lobeSorted) {
      if (used.has(t) || Math.abs(t.a) <= 0.15) continue;
      let best = null, bd = Infinity;
      for (const p of primaries) for (const q of p.pts) { const d = dist(q, t.pt); if (d < bd) { bd = d; best = q; } }
      if (best && bd > step * 3) addVein(resample([best, lerp(best, t.pt, 0.5), t.pt], step), 'v2', { kind: 'lobe-branch' });
    }
  }

  // Push points that leave the blade (e.g. across a sinus) back inside along the distance gradient.
  function keepInside(pts, margin) {
    return projectInside(chaikin(projectInside(pts, margin), 2), margin * 0.5);
  }
  function projectInside(pts, margin) {
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      let q = p;
      if (!field.inside(q)) {
        const c = closestOnPoly(q, geo.outline);
        const a = geo.outline[c.i], b = geo.outline[(c.i + 1) % geo.outline.length];
        const n = norm([-(b[1] - a[1]), b[0] - a[0]]);
        const q1 = add(c.pt, mul(n, step * 0.8)), q2 = add(c.pt, mul(n, -step * 0.8));
        q = field.inside(q1) ? q1 : q2;
      }
      for (let k = 0; k < 80 && field.inside(q) && field.d(q) < margin; k++) q = add(q, mul(field.grad(q), step * 0.5));
      return q;
    });
  }

  function trimToInside(pts) {
    const out = [];
    for (const p of pts) { if (!field.inside(p) && out.length > 2) break; out.push(p); }
    return out;
  }
  function rayToMargin(o, d) {
    let p = o;
    for (let i = 0; i < 5000; i++) { const np = add(p, mul(d, step)); if (!field.inside(np)) break; p = np; }
    return p;
  }

  function arcPrimaries(campy) {
    const nk = Math.max(2, Math.floor((V.primaryCount - 1) / 2));
    const ks = campy ? Array.from({ length: nk }, (_, i) => 0.25 + (0.65 * i) / Math.max(1, nk - 1)) : (V.primaryCount >= 5 ? [0.38, 0.78] : [0.62]);
    const y0 = (V.suprabasal || 0) * L;
    const apexY = geo.apex[1];
    const cx = (y) => (geo.curveX ? geo.curveX(y) : 0);
    for (const side of [1, -1]) for (const k of ks) {
      const pts = [];
      const yA = y0 + (campy ? 0.01 : 0.02) * L, yB = apexY - (campy ? 0.04 : 0.1) * L;
      for (let i = 0; i <= 80; i++) {
        const y = yA + (yB - yA) * (i / 80);
        const [r, l] = field.widthAt(y, cx(y));
        const hw = side > 0 ? r : l;
        const rise = Math.min(1, (i / 80) * 6);
        pts.push([cx(y) + side * hw * k * rise, y]);
      }
      pts.push([cx(apexY - 0.02 * L), apexY - 0.02 * L]);
      const sm = chaikin(pts.filter((p) => field.inside(p)), 2);
      primaries.push(addVein(sm, 'v1', { kind: 'arc' }));
    }
    // Ladder (percurrent) between midrib and arcs, between arcs.
    const bySide = (s) => primaries.filter((p) => p && p.kind === 'arc' && Math.sign(pointAt(p.pts, 0.5)[0] - cx(pointAt(p.pts, 0.5)[1])) === s);
    for (const side of [1, -1]) {
      const chain = [primaries[0], ...bySide(side).sort((a, b) => Math.abs(pointAt(a.pts, 0.5)[0]) - Math.abs(pointAt(b.pts, 0.5)[0]))];
      for (let i = 0; i + 1 < chain.length; i++) if (chain[i] && chain[i + 1]) percurrent(chain[i].pts, chain[i + 1].pts, V.tertSpacing * L * 1.4, 'opposite-percurrent', 'v2');
    }
  }

  function parallelVeins() {
    const n = Math.max(5, V.parallelCount || 11);
    const cx = (y) => (geo.curveX ? geo.curveX(y) : 0);
    const yA = 0.002 * L, yB = geo.apex[1];
    const lines = [];
    const half = Math.floor(n / 2);
    for (let k = -half; k <= half; k++) {
      const f = k / (half + 0.6);
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const y = yA + (yB - yA) * Math.pow(i / 120, 1);
        const [r, l] = field.widthAt(y, cx(y));
        const hw = f >= 0 ? r : l;
        pts.push([cx(y) + f * hw, y]);
      }
      const inside = pts.filter((p) => field.inside(p));
      if (inside.length < 3) continue;
      const v = addVein(inside, k === 0 ? 'v1' : (Math.abs(k) % 3 === 0 ? 'v2' : 'v3'), { kind: 'parallel' });
      lines.push({ k, v });
    }
    if (V.tertiary === 'transverse') {
      lines.sort((a, b) => a.k - b.k);
      for (let i = 0; i + 1 < lines.length; i++) {
        const A = lines[i].v.pts, B = lines[i + 1].v.pts;
        const count = Math.floor(polyLength(A) / Math.max(0.6, V.tertSpacing * L * 0.6));
        for (let j = 1; j < count; j++) {
          if (rng.next() < 0.45) continue;
          const s = j / count;
          const a = pointAt(A, s), b = pointAt(B, s);
          if (dist(a, b) < step) continue;
          addVein([a, b], 'v4', { kind: 'transverse' });
        }
      }
    }
  }

  function dichotomous() {
    // Ginkgo-type: veins enter as a pair, run radially, and fork whenever spacing exceeds ~2× target.
    const o = geo.attach;
    const ring = resample(geo.outline, step, true);
    const rMax = Math.max(...ring.map((p) => dist(p, o)));
    const d0 = clamp(L * 0.017, 0.35, 3);
    const dr = step * 1.5;
    const extent = (r) => {
      let lo = null, hi = null;
      for (let a = -1.6; a <= 1.6; a += 0.008) {
        const p = add(o, [r * Math.sin(a), r * Math.cos(a)]);
        if (field.inside(p)) { if (lo == null) lo = a; hi = a; }
      }
      return lo == null ? null : [lo, hi];
    };
    let live = [{ a: -0.03, pts: [o], order: 1 }, { a: 0.03, pts: [o], order: 1 }];
    const done = [];
    for (let r = dr; r < rMax * 1.02; r += dr) {
      const ex = extent(r);
      if (!ex) break;
      live.sort((p, q) => p.a - q.a);
      const n = live.length;
      const span = ex[1] - ex[0];
      // relax toward even spacing across the fan
      live.forEach((v, i) => { const target = ex[0] + ((i + 0.5) / n) * span; v.a += (target - v.a) * clamp(0.06 * (dr / step), 0.02, 0.2); });
      // fork where gap too wide
      if ((span * r) / n > 2.05 * d0) {
        let bi = 0, bg = -1;
        live.forEach((v, i) => {
          const left = i === 0 ? v.a - ex[0] : v.a - live[i - 1].a;
          const right = i === n - 1 ? ex[1] - v.a : live[i + 1].a - v.a;
          const g = left + right; if (g > bg) { bg = g; bi = i; }
        });
        const v = live[bi];
        const da = d0 / (2 * r);
        const last = v.pts[v.pts.length - 1];
        done.push(v);
        live.splice(bi, 1, { a: v.a - da, pts: [last], order: v.order + 1 }, { a: v.a + da, pts: [last], order: v.order + 1 });
      }
      const next = [];
      for (const v of live) {
        const p = add(o, [r * Math.sin(v.a), r * Math.cos(v.a)]);
        if (!field.inside(p)) { done.push(v); continue; }
        v.pts.push(p); next.push(v);
      }
      live = next;
      if (!live.length) break;
    }
    done.push(...live);
    for (const v of done) if (v.pts.length > 1) addVein(v.pts, v.order <= 2 ? 'v1' : 'v2', { kind: 'dichotomous' });
  }
}

function pointInPolyFast(p, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function cross2(a, b) { return a[0] * b[1] - a[1] * b[0]; }
function lerpAng(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
