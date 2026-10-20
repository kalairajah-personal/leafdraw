// Shoot view: leaves arranged on a stem by phyllotaxis, with painter's-order occlusion
// (back leaves' lines are cut where front leaves cover them, like fishdraw).
import { add, mul, rot, bezier, transformPts, cutPolylineByPolys, resample, chaikin, clamp, lerp, angleOf } from './geom.js';

const GOLDEN = 137.507764 * Math.PI / 180;

export function buildShoot(cfg, rng, buildLeaf, opts = {}) {
  const t = cfg.traits;
  const L = cfg.L;
  const phy = opts.phyllotaxis || t.phyllotaxis || 'alternate';
  if (t.plantGroup === 'conifer-scale') return scaleBranchlet(cfg, rng, buildLeaf, opts);
  const nodes = opts.nodes || (phy === 'rosulate' ? 1 : phy === 'fascicled' ? 4 : 5);
  const leaves = [];
  const parts = [], fills = [];
  const elev = (opts.leafAngle ?? 48) * Math.PI / 180;

  if (phy === 'rosulate') {
    const n = opts.count || 11;
    for (let i = 0; i < n; i++) {
      const phi = i * GOLDEN;
      const age = 1 - i / (n * 1.25);
      leaves.push({ origin: [0, 0], dir: [Math.sin(phi), Math.cos(phi)], scale: clamp(age, 0.35, 1), depth: i, sx: 1, sy: 1, seed: i });
    }
  } else {
    const internode = (opts.internode ?? (phy === 'fascicled' ? 0.25 : ['opposite', 'decussate', 'whorled'].includes(phy) ? 0.62 : 0.42)) * L;
    const stemLen = internode * (nodes + 0.6);
    const stem = bezier([0, 0], [L * 0.02, stemLen * 0.35], [-L * 0.02, stemLen * 0.7], [0, stemLen], 40);
    parts.push({ role: 'stem', pts: stem, leaf: -1, depth: 0, wscale: 1 });
    for (let k = 0; k < nodes; k++) {
      const y = internode * (k + 0.5);
      const P = stem[Math.round((y / stemLen) * (stem.length - 1))];
      const age = clamp(1 - 0.08 * (nodes - 1 - k), 0.55, 1) * (1 - 0.12 * (k / nodes));
      let az = [];
      if (phy === 'alternate') az = [k * GOLDEN];
      else if (phy === 'distichous') az = [k * Math.PI];
      else if (phy === 'opposite') az = [0, Math.PI];
      else if (phy === 'decussate') az = k % 2 ? [Math.PI / 2, -Math.PI / 2] : [0, Math.PI];
      else if (phy === 'whorled') { const m = opts.whorl || 3; az = Array.from({ length: m }, (_, j) => (j * 2 * Math.PI) / m + (k % 2) * Math.PI / m); }
      else if (phy === 'fascicled') {
        const m = opts.fascicle || (t.plantGroup === 'conifer-needle' ? 5 : 5);
        const spread = t.plantGroup === 'conifer-needle' ? 0.32 : 1.4;
        const base = k * GOLDEN;
        const side = Math.cos(base) >= 0 ? 1 : -1;
        const dir0 = rot([0, 1], -side * 0.8);
        // sheath / spur
        parts.push({ role: 'stem', pts: [P, add(P, mul(dir0, L * 0.04))], leaf: -1, depth: 0, wscale: 1.8 });
        const o = add(P, mul(dir0, L * 0.04));
        for (let j = 0; j < m; j++) {
          const a = (j - (m - 1) / 2) * (spread / Math.max(1, m - 1)) * 2;
          leaves.push({ origin: o, dir: rot(dir0, a), scale: age * (0.85 + 0.15 * rng.next()), depth: Math.sin(base + j), sx: 1, sy: 1, seed: k * 10 + j });
        }
        continue;
      }
      for (const phi of az) {
        if (t.attachment === 'perfoliate') { leaves.push({ origin: P, dir: [0, 1], scale: age, depth: 1 + k, sx: 1, sy: 1, seed: k, perfoliate: true }); break; }
        const dx = Math.cos(phi) * Math.sin(elev), dz = Math.cos(elev), depth = Math.sin(phi);
        const plen = Math.hypot(dx, dz);
        leaves.push({ origin: P, dir: [dx / plen, dz / plen], scale: age, depth, sx: 0.55 + 0.45 * Math.abs(Math.cos(phi)) + 0.45 * Math.max(0, depth) * 0, sy: clamp(plen, 0.3, 1), seed: k * 4 + Math.round(phi * 10) });
      }
    }
    // apical bud
    const tip = stem[stem.length - 1];
    parts.push({ role: 'outline', pts: chaikin([add(tip, [-L * 0.012, 0]), add(tip, [0, L * 0.05]), add(tip, [L * 0.012, 0])], 2), leaf: -1, depth: 0, closed: false });
  }

  // Build and place leaves (back to front).
  leaves.sort((a, b) => a.depth - b.depth);
  const placed = [];
  leaves.forEach((lf, i) => {
    const built = buildLeaf(lf.seed);
    const ang = angleOf(lf.dir) - Math.PI / 2;
    let originAdj = lf.origin;
    const tf = (pts) => transformPts(pts.map(([x, y]) => [x * lf.sx, y * lf.sy]), { scale: lf.scale, rotate: ang, tx: originAdj[0], ty: originAdj[1] });
    if (lf.perfoliate) {
      // centre blade on the node
      const ys = built.fills[0].rings[0].map((p) => p[1]);
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2 * lf.scale;
      originAdj = [lf.origin[0], lf.origin[1] - cy];
    }
    const lp = built.parts.map((p) => ({ ...p, pts: tf(p.pts), leaf: i, depth: lf.depth, ref: (p.ref || L) * lf.scale }));
    const lfills = built.fills.map((f) => ({ ...f, rings: f.rings.map(tf), hatchRing: f.hatchRing ? tf(f.hatchRing) : null, leaf: i, depth: lf.depth }));
    placed.push({ parts: lp, fills: lfills, depth: lf.depth, perfoliate: lf.perfoliate });
  });

  // Occlusion: cut every earlier part by outlines of later (front) leaves.
  const allParts = [...parts.map((p) => ({ ...p })), ...placed.flatMap((pl) => pl.parts)];
  const occluders = placed.map((pl, i) => ({ i, depth: pl.depth, polys: pl.fills.map((f) => f.rings[0]) }));
  const result = [];
  for (const p of allParts) {
    const front = occluders.filter((o) => (p.leaf === -1 ? (o.depth > 0 || placed[o.i].perfoliate) : o.i > p.leaf)).flatMap((o) => o.polys);
    if (!front.length || p.closed && p.role !== 'outline') { result.push(p); continue; }
    for (const pts of cutPolylineByPolys(p.pts, front, Math.max(0.2, L / 400))) result.push({ ...p, pts, closed: false });
  }
  return { parts: result, fills: placed.flatMap((p) => p.fills) };
}

function scaleBranchlet(cfg, rng, buildLeaf, opts) {
  const parts = [], fills = [];
  const s = cfg.L; // scale leaf length (mm)
  const build = (o, dir, len, depth) => {
    const ax = resample([o, add(o, mul(dir, len))], s * 0.25);
    parts.push({ role: 'stem', pts: ax, leaf: -1, depth: 0, wscale: Math.max(0.25, 1 - depth * 0.35) });
    const n = Math.floor(len / (s * 0.62));
    for (let i = 0; i < n; i++) {
      const P = lerp(o, add(o, mul(dir, len)), (i + 0.5) / n);
      const facial = i % 2 === 0;
      const ang = angleOf(dir) - Math.PI / 2;
      if (facial) {
        const lf = buildLeaf(i);
        const tf = (pts) => transformPts(pts, { scale: 0.85, rotate: ang, tx: P[0], ty: P[1] - s * 0.3 });
        lf.parts.forEach((p) => parts.push({ ...p, pts: tf(p.pts), leaf: 1, depth: 1 }));
        lf.fills.forEach((f) => fills.push({ ...f, rings: f.rings.map(tf), hatchRing: f.hatchRing ? tf(f.hatchRing) : null }));
        parts.push({ role: 'sorus', pts: Array.from({ length: 8 }, (_, k) => add(P, [Math.cos(k * 0.785) * s * 0.06, Math.sin(k * 0.785) * s * 0.06 + s * 0.05])), closed: true });
      } else for (const side of [1, -1]) {
        const lf = buildLeaf(i * 2 + side);
        const tf = (pts) => transformPts(pts.map(([x, y]) => [x * 0.45, y]), { scale: 0.9, rotate: ang - side * 0.32, tx: P[0] + side * s * 0.22 * Math.cos(ang), ty: P[1] - s * 0.35 });
        lf.parts.forEach((p) => parts.push({ ...p, pts: tf(p.pts), leaf: 0, depth: 0 }));
        lf.fills.forEach((f) => fills.push({ ...f, rings: f.rings.map(tf), hatchRing: null }));
      }
    }
    if (depth < 2) {
      const m = Math.floor(len / (s * 4));
      for (let j = 1; j <= m; j++) {
        const side = j % 2 ? 1 : -1;
        const P = lerp(o, add(o, mul(dir, len)), j / (m + 1));
        build(P, rot(dir, -side * 0.85), len * (0.55 - 0.3 * (j / m)) * (depth ? 0.6 : 1), depth + 1);
      }
    }
  };
  build([0, 0], [0, 1], s * (opts.branchScale || 22), 0);
  return { parts, fills };
}
