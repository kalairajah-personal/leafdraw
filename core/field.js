// Rasterized blade mask + distance-to-margin field. Fast inside tests and margin proximity
// for vein growth, independent of outline vertex count.
import { bbox } from './geom.js';

export class Field {
  constructor(outline, holes = [], maxCells = 520) {
    const bb = bbox([outline]);
    const pad = Math.max(bb.w, bb.h) * 0.02 + 0.5;
    this.x0 = bb.x0 - pad; this.y0 = bb.y0 - pad;
    const w = bb.w + 2 * pad, h = bb.h + 2 * pad;
    this.h = Math.max(w, h) / maxCells;
    this.nx = Math.ceil(w / this.h) + 1; this.ny = Math.ceil(h / this.h) + 1;
    const n = this.nx * this.ny;
    this.mask = new Uint8Array(n);
    this.fillPoly(outline, 1);
    for (const hole of holes) this.fillPoly(hole, 0, true);
    this.dist = new Float32Array(n);
    this.edt();
  }
  fillPoly(poly, val, xor = false) {
    for (let j = 0; j < this.ny; j++) {
      const y = this.y0 + (j + 0.5) * this.h;
      const xs = [];
      for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
        const a = poly[k], b = poly[i];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - this.x0) / this.h - 0.5));
        const i1 = Math.min(this.nx - 1, Math.floor((xs[m + 1] - this.x0) / this.h - 0.5));
        for (let i = i0; i <= i1; i++) this.mask[j * this.nx + i] = xor ? 0 : val;
      }
    }
  }
  // Two-pass chamfer distance (in mm) from every inside cell to nearest outside cell.
  edt() {
    const { nx, ny, mask, dist } = this;
    const INF = 1e9, a = 1, b = Math.SQRT2;
    for (let k = 0; k < nx * ny; k++) dist[k] = mask[k] ? INF : 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!dist[k]) continue;
      let d = dist[k];
      if (i > 0) d = Math.min(d, dist[k - 1] + a);
      if (j > 0) { d = Math.min(d, dist[k - nx] + a); if (i > 0) d = Math.min(d, dist[k - nx - 1] + b); if (i < nx - 1) d = Math.min(d, dist[k - nx + 1] + b); }
      dist[k] = d;
    }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i; if (!dist[k]) continue;
      let d = dist[k];
      if (i < nx - 1) d = Math.min(d, dist[k + 1] + a);
      if (j < ny - 1) { d = Math.min(d, dist[k + nx] + a); if (i < nx - 1) d = Math.min(d, dist[k + nx + 1] + b); if (i > 0) d = Math.min(d, dist[k + nx - 1] + b); }
      dist[k] = d;
    }
    for (let k = 0; k < nx * ny; k++) dist[k] *= this.h;
  }
  idx(p) {
    const i = Math.floor((p[0] - this.x0) / this.h), j = Math.floor((p[1] - this.y0) / this.h);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return -1;
    return j * this.nx + i;
  }
  inside(p) { const k = this.idx(p); return k >= 0 && this.mask[k] === 1; }
  d(p) { const k = this.idx(p); return k < 0 ? 0 : this.dist[k]; }
  // Gradient of distance (points inward, away from margin).
  grad(p) {
    const e = this.h;
    const gx = this.d([p[0] + e, p[1]]) - this.d([p[0] - e, p[1]]);
    const gy = this.d([p[0], p[1] + e]) - this.d([p[0], p[1] - e]);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  }
  // Half-widths at height y relative to midline x=cx (scan).
  widthAt(y, cx) {
    const j = Math.floor((y - this.y0) / this.h);
    if (j < 0 || j >= this.ny) return [0, 0];
    let r = 0, l = 0;
    for (let i = 0; i < this.nx; i++) if (this.mask[j * this.nx + i]) {
      const x = this.x0 + (i + 0.5) * this.h;
      if (x >= cx) r = Math.max(r, x - cx); else l = Math.max(l, cx - x);
    }
    return [r, l];
  }
}
