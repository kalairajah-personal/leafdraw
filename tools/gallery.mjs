// Regenerate the README gallery: node tools/gallery.mjs  → docs/images/*.png (+ one animated SVG)
// Every image is a real render of the current code; seeds are fixed so the gallery is reproducible.
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import { draw, renderSVG, renderAnimatedSVG, registerSpecies, getSpecies, autoSpec } from '../core/index.js';

const OUT = new URL('../docs/images/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
registerSpecies(JSON.parse(fs.readFileSync(new URL('../data/species.json', import.meta.url))));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Lay out rendered SVGs in a grid; each cell scaled to fit, caption underneath.
function grid(cells, { cols, cw = 360, ch = 440, title = '', bg = '#fbfaf6' }) {
  const rows = Math.ceil(cells.length / cols), capH = 46, top = title ? 64 : 16;
  const W = cols * cw, H = top + rows * (ch + capH) + 12;
  let body = '';
  cells.forEach((c, i) => {
    const x = (i % cols) * cw, y = top + Math.floor(i / cols) * (ch + capH);
    const uniq = (t) => t.replace(/id="([^"]+)"/g, `id="c${i}_$1"`).replace(/url\(#([^)]+)\)/g, `url(#c${i}_$1)`).replace(/href="#([^"]+)"/g, `href="#c${i}_$1"`);
    const inner = uniq(c.svg).replace(/^<\?xml[^>]*>\s*/, '').replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, '<svg$1').replace(/<rect width="100%" height="100%"[^>]*\/>/, '').replace('<svg ', `<svg x="${x + 12}" y="${y + 8}" width="${cw - 24}" height="${ch - 16}" preserveAspectRatio="xMidYMid meet" `);
    body += inner;
    body += `<text x="${x + cw / 2}" y="${y + ch + 16}" text-anchor="middle" font-family="Georgia, serif" font-style="${c.italic === false ? 'normal' : 'italic'}" font-size="19" fill="#26261f">${esc(c.title)}</text>`;
    if (c.sub) body += `<text x="${x + cw / 2}" y="${y + ch + 38}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#6b6a60">${esc(c.sub)}</text>`;
  });
  const head = title ? `<text x="24" y="42" font-family="Georgia, serif" font-size="26" fill="#26261f">${esc(title)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${bg}"/>${head}${body}</svg>`;
}
function png(name, svg, width) {
  const buf = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true }, background: '#fbfaf6' }).render().asPng();
  fs.writeFileSync(new URL(name, OUT), buf);
  console.log(name, (buf.length / 1024).toFixed(0) + ' KB');
}
const cell = (id, seed, opts = {}, sub) => {
  const sp = typeof id === 'string' ? getSpecies(id) : id;
  const sc = draw(sp, seed, { detail: opts.detail || 'medium' });
  return { svg: renderSVG(sc, { style: opts.style || 'color', season: opts.season }), title: opts.title || sp.name, sub: sub ?? (sp.common || [])[0] ?? '' , italic: opts.italic };
};

// 1. Hero: one per leaf architecture.
png('hero.png', grid([
  cell('quercus-alba', 3), cell('acer-saccharum', 2, { season: 'fall' }), cell('liriodendron-tulipifera', 4),
  cell('ginkgo-biloba', 1, { season: 'fall' }), cell('tilia-americana', 5), cell('monstera-deliciosa', 2),
  cell('aesculus-hippocastanum', 1), cell('cocos-nucifera', 2), cell('pteridium-aquilinum', 3),
  cell('nelumbo-nucifera', 1), cell('castanea-dentata', 2), cell('musa-acuminata', 1),
], { cols: 6, cw: 300, ch: 380 }), 1800);

// 2. One leaf, eight styles.
const STY = ['line', 'hatch', 'stipple', 'color', 'botanical', 'cleared', 'silhouette', 'venation', 'photo'];
png('styles.png', grid(STY.map((s) => cell('tilia-americana', 5, { style: s, title: s, italic: false, detail: 'full' }, '')), { cols: 9, cw: 220, ch: 300, title: 'Tilia americana — nine render styles' }), 1800);

// 3. Seasons.
png('seasons.png', grid(['spring', 'summer', 'fall', 'dried'].map((s) => cell('acer-rubrum', 7, { season: s, title: s, italic: false }, '')), { cols: 4, cw: 300, ch: 320, title: 'Acer rubrum — seasons' }), 1200);

// 4. Compound, monocot, gymnosperm, fern.
png('architectures.png', grid([
  cell('fraxinus-americana', 2, {}, 'imparipinnate'), cell('gleditsia-triacanthos', 2, {}, 'bipinnate'), cell('trifolium-repens', 2, {}, 'ternate'),
  cell('citrus-sinensis', 2, {}, 'unifoliate, winged'), cell('iris-germanica', 2, {}, 'ensiform, parallel'), cell('sagittaria-latifolia', 2, {}, 'sagittate, campylodromous'),
  cell('pinus-strobus', 2, {}, 'needles, fascicle of 5'), cell('thuja-occidentalis', 2, {}, 'scale leaves'), cell('polystichum-acrostichoides', 2, {}, 'fern frond, sori'),
], { cols: 9, cw: 250, ch: 320 }), 1800);

// 5. Venation close-up (cleared-leaf style, full detail).
{
  const sc = draw(getSpecies('ulmus-americana'), 4, { detail: 'full' });
  png('venation.png', renderSVG(sc, { style: 'cleared' }), 900);
}

// 6. Any species: built only from published text + family template (no curated data).
const src = JSON.parse(fs.readFileSync(new URL('../data/validation/holdout-sources.json', import.meta.url)));
const ANY = ['Acer pseudoplatanus', 'Delonix regia', 'Ricinus communis', 'Azadirachta indica', 'Tamarindus indica', 'Mangifera indica'];
png('any-species.png', grid(ANY.map((n) => {
  const s = src.find((x) => x.name === n);
  const spec = autoSpec({ name: n, family: s.family, genus: s.genus, className: s.className }, [(s.powo || []).map((d) => d.t).join(' \n'), s.wiki || ''].join(' \n'));
  return cell(spec, 4, {}, `${s.family} · tier C`);
}), { cols: 6, cw: 300, ch: 400, title: 'Any species — drawn from its published description' }), 1800);

// 7. Slow drawing (animated SVG; GitHub renders SMIL in <img>).
{
  const sc = draw(getSpecies('quercus-alba'), 3, { detail: 'medium' });
  const svg = renderAnimatedSVG(sc, { order: 'illustrator', duration: 10 });
  fs.writeFileSync(new URL('drawing.svg', OUT), svg);
  console.log('drawing.svg', (svg.length / 1024).toFixed(0) + ' KB');
}
