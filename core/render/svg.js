// Scene → SVG. Styles: line, hatch, stipple, color, botanical, cleared, silhouette, venation, photo.
// Output in millimetres (print/plot at true size). Scene is y-up; SVG is y-down.
import { resolvePalette, jitterLab, mixLab } from '../palette.js';
import { clipSegmentToRings, bbox, clamp, resample, polyLength, pointInPoly, poissonInPoly } from '../geom.js';
import { makeRng } from '../rng.js';

export const ROLE_W = { outline: 0.75, v1: 1.0, v2: 0.45, v3: 0.25, v4: 0.13, v5: 0.1, petiole: 1.4, rachis: 1.15, rachilla: 0.8, petiolule: 0.8, stem: 1.6, hair: 0.22, spine: 0.45, awn: 0.35, cirrus: 0.6, fold: 0.45, shade: 0.22, 'shade-light': 0.16, stomata: 0.3, hole: 0.5, sorus: 0.45, joint: 0.6, hatch: 0.2 };
export const ROLE_ORDER = ['petiole', 'stem', 'rachis', 'rachilla', 'petiolule', 'joint', 'outline', 'hole', 'v1', 'v2', 'v3', 'v4', 'v5', 'stomata', 'sorus', 'spine', 'awn', 'cirrus', 'hair', 'fold', 'shade', 'shade-light', 'hatch'];
const TAPER = new Set(['v1', 'v2', 'petiole', 'stem', 'rachis', 'cirrus']);

const STYLES = {
  line: { bg: '#ffffff', ink: '#1d1d1b', fill: '#ffffff', hatch: false },
  hatch: { bg: '#ffffff', ink: '#1d1d1b', fill: '#ffffff', hatch: true },
  stipple: { bg: '#ffffff', ink: '#1d1d1b', fill: '#ffffff', stipple: true },
  color: { color: true },
  botanical: { color: true, inkOver: true },
  cleared: { bg: '#f4f1e8', ink: '#7b2416', fill: '#ece4cc', outline: '#6a3a24' },
  silhouette: { bg: '#ffffff', ink: '#1d1d1b', fill: '#1d1d1b', silhouette: true },
  venation: { bg: '#ffffff', ink: '#1d1d1b', fill: 'none', outline: '#b8b8b0' },
  // Photo-like specimen scan: lamina texture, relief lighting, soft veins, drop shadow (for image-ID scoring and realism).
  photo: { color: true, photo: true },
};
// Vein visibility in photo style (real leaves show minor veins faintly).
const PHOTO_ALPHA = { v1: 0.9, v2: 0.7, v3: 0.38, v4: 0.2, v5: 0.14, hair: 0.5, shade: 0.4, 'shade-light': 0.3, outline: 0.55, hole: 0.55 };

function photoFilter(size, seed) {
  const f = (110 / size).toFixed(4), f2 = (9 / size).toFixed(4), blur = (size * 0.012).toFixed(3), sh = (size * 0.012).toFixed(3);
  return `<defs><filter id="ld-photo" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="4" seed="${seed % 997}" result="n"/>`
    + `<feTurbulence type="fractalNoise" baseFrequency="${f2}" numOctaves="2" seed="${(seed * 7) % 991}" result="n2"/>`
    + `<feComposite in="n" in2="n2" operator="arithmetic" k1="0" k2="0.7" k3="0.3" k4="0" result="nn"/>`
    + `<feColorMatrix in="nn" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="g0"/>`
    + `<feComponentTransfer in="g0" result="g"><feFuncR type="linear" slope="0.45" intercept="0.275"/><feFuncG type="linear" slope="0.45" intercept="0.275"/><feFuncB type="linear" slope="0.45" intercept="0.275"/></feComponentTransfer>`
    + `<feComposite in="g" in2="SourceGraphic" operator="in" result="gm"/>`
    + `<feBlend in="SourceGraphic" in2="gm" mode="overlay" result="tex"/>`
    + `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="b"/>`
    + `<feDiffuseLighting in="b" surfaceScale="${(size * 0.04).toFixed(2)}" diffuseConstant="1" lighting-color="#ffffff" result="l"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>`
    + `<feComposite in="tex" in2="l" operator="arithmetic" k1="1.18" k2="0" k3="0" k4="0" result="lit"/>`
    + `<feComposite in="lit" in2="SourceAlpha" operator="in" result="leaf"/>`
    + `<feDropShadow in="leaf" dx="${sh}" dy="${sh}" stdDeviation="${(size * 0.01).toFixed(3)}" flood-color="#000" flood-opacity="0.22"/>`
    + `</filter></defs>`;
}

export function renderSVG(scene, opts = {}) {
  const style = STYLES[opts.style || 'line'] ? opts.style || 'line' : 'line';
  const S = STYLES[style];
  const pal = resolvePalette(opts.palette || scene.meta.palette, scene.meta.group, opts.season || 'summer');
  const bb = scene.bbox;
  const size = Math.max(bb.w, bb.h);
  const pad = opts.pad ?? size * 0.06;
  const labelH = opts.labels ? size * 0.17 : 0;
  let W = bb.w + 2 * pad;
  const H = bb.h + 2 * pad + labelH;
  const xShift = opts.labels && W < H * 0.62 ? (H * 0.62 - W) / 2 : 0;
  W += 2 * xShift;
  const sc = opts.scale || 1; // mm per scene-mm (true size = 1)
  const X = (x) => (x - bb.x0 + pad + xShift).toFixed(2), Y = (y) => (bb.y1 - y + pad).toFixed(2);
  const d = (pts, closed) => 'M' + pts.map((p) => X(p[0]) + ' ' + Y(p[1])).join('L') + (closed ? 'Z' : '');
  const strokeScale = opts.strokeScale || 1;
  const baseW = (ref) => Math.max((ref || size) * 0.0068, size * 0.0011, 0.04) * strokeScale;
  const bg = opts.background ?? (S.photo ? '#f1f0ea' : S.color ? '#ffffff' : S.bg);
  const anim = opts.animate || null;
  const rng = makeRng(scene.meta.seed || 1, 'render');

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${(W * sc).toFixed(2)}mm" height="${(H * sc).toFixed(2)}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">`);
  out.push(`<title>${esc(scene.meta.name)}${scene.meta.common?.[0] ? ' — ' + esc(scene.meta.common[0]) : ''} (seed ${scene.meta.seed})</title>`);
  if (anim) out.push(animStyle(anim));
  if (bg && bg !== 'none') out.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  if (S.photo) out.push(photoFilter(size, scene.meta.seed || 1));

  const fillColor = S.color ? pal.blade : S.fill;
  const colorFor = (role) => {
    if (S.silhouette) return role === 'petiole' || role === 'stem' || role === 'rachis' ? S.ink : null;
    if (S.color && !S.inkOver) {
      if (role === 'outline' || role === 'hole') return pal.edge;
      if (['petiole', 'rachis', 'rachilla', 'petiolule', 'stem', 'joint'].includes(role)) return pal.petiole;
      if (role === 'sorus') return '#7a4a22';
      if (role === 'spine' || role === 'awn') return mixLab(pal.edge, '#c8b070', 0.3);
      if (role === 'shade' || role === 'fold') return mixLab(pal.edge, pal.blade, 0.4);
      return pal.vein;
    }
    if (S.inkOver) return ['v3', 'v4', 'v5', 'hair', 'shade', 'shade-light'].includes(role) ? mixLab('#2a2a22', pal.blade, 0.45) : '#2a2a22';
    if (style === 'cleared' && (role === 'outline' || role === 'hole')) return S.outline;
    if (style === 'venation' && (role === 'outline' || role === 'hole')) return S.outline;
    if (style === 'venation' && ['hair', 'shade', 'shade-light', 'fold'].includes(role)) return null;
    return S.ink;
  };

  const fillsSVG = (fills) => {
    const o = [];
    for (const f of fills) {
      if (fillColor === 'none') break;
      o.push(`<path d="${f.rings.map((r) => d(r, true)).join('')}" fill="${fillColor}" fill-rule="evenodd" stroke="none"/>`);
      if (S.color && opts.mottle !== false) o.push(...mottle(f, pal, opts.season, rng, d, baseW(f.ref)));
      if (f.shade) o.push(`<path d="${d(f.shade, true)}" fill="${S.color ? pal.underside : '#e6e6e0'}" stroke="none"/>`);
    }
    return o;
  };
  const hatchSVG = (fills) => {
    if (!(S.hatch || S.stipple)) return [];
    const hp = [];
    for (const f of fills) {
      if (!f.hatchRing) continue;
      const rings = [f.hatchRing, ...f.rings.slice(1)];
      const w = baseW(f.ref);
      if (S.hatch) for (const seg of hatchLines(rings, w * 3.4, Math.PI / 4)) hp.push(d(seg));
      else for (const p of stippleDots(rings, w * 2.6, rng)) hp.push(`M${X(p[0])} ${Y(p[1])}h0.001`);
    }
    if (!hp.length) return [];
    return [`<path class="hatch" d="${hp.join('')}" fill="none" stroke="${S.ink}" stroke-width="${(baseW(fills[0]?.ref || size) * ROLE_W.hatch).toFixed(3)}" stroke-linecap="round"${anim ? ` pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:ld-draw ${anim.hatchDur.toFixed(2)}s linear forwards;animation-delay:${anim.hatchDelay.toFixed(2)}s"` : ''}/>`];
  };
  const strokeSVG = (p, a) => {
    const col = colorFor(p.role);
    if (!col) return [];
    const w = baseW(p.ref) * (ROLE_W[p.role] ?? 0.3) * (p.wscale || 1);
    if (p.role === 'sorus') return [`<path d="${d(p.pts, true)}" fill="${col}" stroke="none"${a ? fadeAttr(a) : ''}/>`];
    const op = S.photo && PHOTO_ALPHA[p.role] != null ? ` stroke-opacity="${PHOTO_ALPHA[p.role]}"` : '';
    if (TAPER.has(p.role) && !a && p.pts.length > 6 && opts.taper !== false) {
      const k = 4, n = p.pts.length, o = [];
      for (let j = 0; j < k; j++) {
        const seg = p.pts.slice(Math.floor((j * (n - 1)) / k), Math.floor(((j + 1) * (n - 1)) / k) + 1);
        if (seg.length > 1) o.push(`<path d="${d(seg)}" fill="none" stroke="${col}" stroke-width="${(w * (1 - 0.13 * j)).toFixed(3)}"${op} stroke-linecap="round" stroke-linejoin="round"/>`);
      }
      return o;
    }
    return [`<path d="${d(p.pts, p.closed)}" fill="none" stroke="${col}" stroke-width="${w.toFixed(3)}"${op} stroke-linecap="round" stroke-linejoin="round"${a ? drawAttr(a) : ''}/>`];
  };

  if (anim) {
    const f = fillsSVG(scene.fills);
    if (f.length) out.push(`<g class="fills" style="opacity:0;animation:ld-fade .8s ease forwards;animation-delay:${anim.fillDelay.toFixed(2)}s">${f.join('')}</g>`);
    out.push(...hatchSVG(scene.fills));
    out.push(`<g class="strokes">${anim.order.flatMap((p, i) => strokeSVG(p, anim.times[i])).join('')}</g>`);
  } else {
    // Painter's order per leaf/leaflet: fill, hatch, strokes — later leaves cover earlier ones.
    const keyOf = (o) => (o.leaf == null ? -1e9 : (o.depth ?? 0) * 1e5 + o.leaf);
    const groups = new Map();
    const g = (k) => { if (!groups.has(k)) groups.set(k, { fills: [], parts: [] }); return groups.get(k); };
    for (const f of scene.fills) g(keyOf(f)).fills.push(f);
    for (const p of scene.parts) g(keyOf(p)).parts.push(p);
    if (S.photo) out.push('<g filter="url(#ld-photo)">');
    for (const k of [...groups.keys()].sort((a, b) => a - b)) {
      const grp = groups.get(k);
      out.push(`<g>${[...fillsSVG(grp.fills), ...hatchSVG(grp.fills), ...orderParts(grp.parts).flatMap((p) => strokeSVG(p))].join('')}</g>`);
    }
    if (S.photo) out.push('</g>');
  }

  // ---- labels ----
  if (opts.labels) {
    const fs = size * 0.032;
    const y0 = bb.h + 2 * pad + labelH * 0.3;
    const ink = S.color ? '#2a2a22' : (S.ink === '#7b2416' ? '#3a2a20' : '#1d1d1b');
    out.push(`<text x="${pad.toFixed(2)}" y="${y0.toFixed(2)}" font-family="Georgia, serif" font-style="italic" font-size="${fs.toFixed(2)}" fill="${ink}">${esc(scene.meta.name)}</text>`);
    const sub = [scene.meta.common?.[0], scene.meta.family, `seed ${scene.meta.seed}`].filter(Boolean).join(' · ');
    out.push(`<text x="${pad.toFixed(2)}" y="${(y0 + fs * 1.35).toFixed(2)}" font-family="Helvetica, Arial, sans-serif" font-size="${(fs * 0.62).toFixed(2)}" fill="${ink}" opacity="0.75">${esc(sub)}</text>`);
    // scale bar
    const bar = niceBar(size);
    const bx = W - pad - bar, by = y0 + fs * 2.3;
    out.push(`<path d="M${bx.toFixed(2)} ${by.toFixed(2)}h${bar}M${bx.toFixed(2)} ${(by - fs * 0.25).toFixed(2)}v${(fs * 0.5).toFixed(2)}M${(bx + bar).toFixed(2)} ${(by - fs * 0.25).toFixed(2)}v${(fs * 0.5).toFixed(2)}" stroke="${ink}" stroke-width="${(fs * 0.06).toFixed(3)}"/>`);
    out.push(`<text x="${(bx + bar / 2).toFixed(2)}" y="${(by + fs * 0.85).toFixed(2)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${(fs * 0.55).toFixed(2)}" fill="${ink}">${bar >= 10 ? bar / 10 + ' cm' : bar + ' mm'}</text>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

export function orderParts(parts) {
  return parts.slice().sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0) || (a.leaf ?? 0) - (b.leaf ?? 0) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

export function hatchLines(rings, spacing, angle) {
  const bb = bbox(rings);
  const c = Math.cos(angle), s = Math.sin(angle);
  const diag = Math.hypot(bb.w, bb.h);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const out = [];
  for (let k = -diag / 2; k <= diag / 2; k += spacing) {
    const a = [cx - c * diag / 2 - s * k, cy - s * diag / 2 + c * k];
    const b = [cx + c * diag / 2 - s * k, cy + s * diag / 2 + c * k];
    for (const seg of clipSegmentToRings(a, b, rings)) out.push(seg);
  }
  return out;
}

function stippleDots(rings, r, rng) {
  return poissonInPoly(rings[0], r, rng, 6000, rings.slice(1));
}

function mottle(f, pal, season, rng, d, w) {
  const out = [];
  const bb = bbox([f.rings[0]]);
  const n = Math.round(clamp((bb.w * bb.h) / Math.pow(Math.max(bb.w, bb.h) * 0.18, 2), 4, 40));
  const id = 'c' + Math.floor(rng.next() * 1e9).toString(36);
  out.push(`<clipPath id="${id}"><path d="${f.rings.map((r) => d(r, true)).join('')}" clip-rule="evenodd"/></clipPath><g clip-path="url(#${id})">`);
  for (let i = 0; i < n; i++) {
    const p = [bb.x0 + rng.next() * bb.w, bb.y0 + rng.next() * bb.h];
    if (!pointInPoly(p, f.rings[0])) continue;
    const r = Math.max(bb.w, bb.h) * (0.06 + 0.14 * rng.next());
    let col = jitterLab(pal.blade, rng, 6, 4);
    if (season === 'fall' && rng.next() < 0.35) col = mixLab(pal.blade, '#b5401c', 0.35 + 0.3 * rng.next());
    const pts = Array.from({ length: 14 }, (_, k) => { const a = (k / 14) * Math.PI * 2; const rr = r * (0.75 + 0.5 * rng.next()); return [p[0] + rr * Math.cos(a), p[1] + rr * 0.8 * Math.sin(a)]; });
    out.push(`<path d="${d(pts, true)}" fill="${col}" opacity="0.45"/>`);
  }
  out.push('</g>');
  return out;
}

function animStyle(a) {
  return `<style>@keyframes ld-draw{to{stroke-dashoffset:0}}@keyframes ld-fade{to{opacity:1}}@keyframes ld-pop{to{opacity:1}}</style>`;
}
function drawAttr(t) { return ` pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:ld-draw ${t.dur.toFixed(3)}s linear forwards;animation-delay:${t.start.toFixed(3)}s"`; }
function fadeAttr(t) { return ` style="opacity:0;animation:ld-pop .2s linear forwards;animation-delay:${t.start.toFixed(3)}s"`; }
function niceBar(size) { const t = size * 0.18; for (const v of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (v >= t) return v; return 1000; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
