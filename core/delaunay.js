// Bowyer–Watson Delaunay triangulation and Voronoi edge extraction (no dependencies).
// Used for areoles: the finest vein orders form a polygonal reticulum around Poisson-spaced cells.
export function delaunay(points) {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  const d = Math.max(maxX - minX, maxY - minY) * 20;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = points.concat([[mx - d, my - d], [mx, my + d], [mx + d, my - d]]);
  let tris = [mk(P, n, n + 1, n + 2)];
  // insert in spatially coherent order (sorted by x) for speed
  const order = points.map((_, i) => i).sort((a, b) => points[a][0] - points[b][0]);
  for (const i of order) {
    const [px, py] = P[i];
    const bad = [], keep = [];
    for (const t of tris) {
      // triangles sorted by x: once circle is entirely left of point it stays left (x sweep); simple check
      const dx = px - t.cx, dy = py - t.cy;
      if (dx * dx + dy * dy < t.r2) bad.push(t); else keep.push(t);
    }
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      const k = a < b ? a + ',' + b : b + ',' + a;
      if (edges.has(k)) edges.delete(k); else edges.set(k, [a, b]);
    }
    for (const [a, b] of edges.values()) keep.push(mk(P, a, b, i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n);
}

function mk(P, a, b, c) {
  const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
}

// Voronoi edges: segment between circumcentres of the two triangles sharing each Delaunay edge.
export function voronoiEdges(points) {
  const tris = delaunay(points);
  const byEdge = new Map();
  for (const t of tris) for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
    const k = a < b ? a + ',' + b : b + ',' + a;
    if (!byEdge.has(k)) byEdge.set(k, []);
    byEdge.get(k).push(t);
  }
  const out = [];
  for (const [k, ts] of byEdge) if (ts.length === 2) {
    const [a, b] = k.split(',').map(Number);
    out.push({ p: [ts[0].cx, ts[0].cy], q: [ts[1].cx, ts[1].cy], cells: [a, b] });
  }
  return { edges: out, tris };
}
