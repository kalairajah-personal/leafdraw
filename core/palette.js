// Color palettes. Species palettes (measured from photos by the pipeline, stored as hex)
// override group defaults. Missing roles are derived in CIELAB.
const DEFAULTS = {
  summer: { blade: '#4f7d32', vein: '#b6cf7f', edge: '#2d4a19', petiole: '#7f9a45' },
  fall: { blade: '#c9a13b', vein: '#efd98f', edge: '#7c5d12', petiole: '#a07b2a' },
  dried: { blade: '#9a7a4e', vein: '#c9b087', edge: '#5c4527', petiole: '#7d6040' },
  spring: { blade: '#7fae3f', vein: '#cfe39a', edge: '#4c7420', petiole: '#97b85a' },
};
const GROUP = {
  'conifer-needle': { summer: { blade: '#2f5a3a', vein: '#9fbf9c', edge: '#1c3a24' } },
  'conifer-scale': { summer: { blade: '#3e6b3a', vein: '#98b98a', edge: '#244423' } },
  monocot: { summer: { blade: '#5a8a3a', vein: '#a9c77f', edge: '#36571f' } },
  fern: { summer: { blade: '#4b8a3c', vein: '#a8cf86', edge: '#2b5520' } },
  ginkgo: { summer: { blade: '#6a9a3a', vein: '#bcd58a', edge: '#3d5f1d' }, fall: { blade: '#e0b52a', vein: '#f3dc7e', edge: '#9a7810' } },
};

export function resolvePalette(spPalette, group, season = 'summer') {
  const base = { ...DEFAULTS[season] || DEFAULTS.summer, ...(GROUP[group]?.[season] || {}) };
  const sp = spPalette?.[season] || (season !== 'summer' ? null : spPalette?.summer);
  const out = { ...base, ...(sp || {}) };
  if (sp?.blade && !sp.vein) out.vein = mixLab(sp.blade, '#f4f0b0', 0.45);
  if (sp?.blade && !sp.edge) out.edge = mixLab(sp.blade, '#000000', 0.35);
  if (sp?.blade && !sp.petiole) out.petiole = mixLab(sp.blade, out.vein, 0.5);
  out.underside = mixLab(out.blade, '#d8dfc0', 0.35);
  return out;
}

// --- color math (sRGB ↔ CIELAB, D65) ---
export function hexToRgb(h) { const s = h.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbToHex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function rgbToLab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToRgb([L, a, b]) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const fi = (t) => (t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29));
  x = fi(x) * 0.95047; y = fi(y); z = fi(z) * 1.08883;
  return [gam(x * 3.2406 + y * -1.5372 + z * -0.4986), gam(x * -0.9689 + y * 1.8758 + z * 0.0415), gam(x * 0.0557 + y * -0.204 + z * 1.057)];
}
export function mixLab(h1, h2, t) {
  const a = rgbToLab(hexToRgb(h1)), b = rgbToLab(hexToRgb(h2));
  return rgbToHex(labToRgb(a.map((v, i) => v + (b[i] - v) * t)));
}
export function jitterLab(h, rng, dL = 4, dab = 3) {
  const l = rgbToLab(hexToRgb(h));
  return rgbToHex(labToRgb([l[0] + (rng.next() - 0.5) * 2 * dL, l[1] + (rng.next() - 0.5) * 2 * dab, l[2] + (rng.next() - 0.5) * 2 * dab]));
}
