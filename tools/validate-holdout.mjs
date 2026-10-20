// Holdout validation of the any-species (tier C) path on species the curated set never saw.
// Input: data/validation/holdout-sources.json (GBIF taxonomy + Wikipedia + POWO leaf text, fetched live).
// Checks: (1) auto spec valid + drawable, (2) Wikipedia vs POWO extracted traits agree (two independent sources),
// (3) sizes agree across sources, (4) how much came from text vs family templates.
import fs from 'fs';
import { extractTraits } from '../core/text.js';
import { autoSpec } from '../core/auto.js';
import { draw } from '../core/index.js';
import { near } from './near.mjs';

const src = JSON.parse(fs.readFileSync(new URL('../data/validation/holdout-sources.json', import.meta.url)));
const curated = new Set(JSON.parse(fs.readFileSync(new URL('../data/species.json', import.meta.url))).map((s) => s.name));
const CHECK = ['structure', 'shape', 'lobation', 'margin', 'apex', 'base', 'phyllotaxis', 'attachment'];
const rows = []; const tally = { agree: 0, near: 0, disagree: 0 }; let sizeN = 0, sizeOk = 0, valid = 0, drawn = 0, withText = 0;
const fromCounts = { text: 0, genus: 0, family: 0, class: 0, none: 0 };
for (const s of src) {
  if (!s.name || curated.has(s.name)) continue;
  const powoTxt = (s.powo || []).map((d) => d.t).join(' \n');
  const text = [powoTxt, s.wiki || ''].join(' \n');
  const spec = autoSpec({ name: s.name, family: s.family, genus: s.genus, className: s.className }, text);
  const row = { name: s.name, family: s.family, prior: spec.auto.prior, valid: spec.auto.valid, fromText: Object.entries(spec.auto.from).filter(([, v]) => v === 'text').map(([k]) => k), structure: spec.traits.structure, group: spec.traits.plantGroup };
  if (spec.auto.valid) valid++;
  try { draw(spec, 1, { detail: 'low' }); drawn++; row.drawn = true; } catch (e) { row.drawError = e.message; }
  if (row.fromText.length) withText++;
  for (const v of Object.values(spec.auto.from)) fromCounts[v] = (fromCounts[v] || 0) + 1;
  if (s.wiki && powoTxt) {
    const a = extractTraits(s.wiki), b = extractTraits(powoTxt);
    row.cross = {};
    for (const c of CHECK) {
      if (!a.traits[c] || !b.traits[c]) continue;
      const A = a.alt[c] || [a.traits[c]], B = b.alt[c] || [b.traits[c]];
      const v = A.some((x) => B.includes(x)) ? 'agree' : A.some((x) => B.some((y) => near(x, y))) ? 'near' : 'disagree';
      row.cross[c] = { wiki: A.join('/'), powo: B.join('/'), v, ew: a.evidence[c], ep: b.evidence[c] }; tally[v]++;
    }
    const la = a.params.leafSize?.L, lb = b.params.leafSize?.L;
    if (la && lb) { sizeN++; const ok = la[0] <= lb[1] * 1.25 && lb[0] <= la[1] * 1.25; if (ok) sizeOk++; row.size = { wiki: la, powo: lb, ok }; }
  }
  rows.push(row);
}
const summary = { date: new Date().toISOString().slice(0, 10), species: rows.length, validSpecs: valid, drawn, withTextTraits: withText, traitSources: fromCounts, crossSource: { compared: tally.agree + tally.near + tally.disagree, ...tally, speciesWithBoth: rows.filter((r) => r.cross).length }, size: { compared: sizeN, overlapping: sizeOk } };
fs.writeFileSync(new URL('../data/validation/holdout-report.json', import.meta.url), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
if (process.argv.includes('-v')) for (const r of rows) { for (const [c, v] of Object.entries(r.cross || {})) if (v.v === 'disagree') console.log(r.name.padEnd(28), c, v.wiki, '≠', v.powo, '\n   W:', v.ew, '\n   P:', v.ep); if (r.size && !r.size.ok) console.log(r.name.padEnd(28), 'size', r.size.wiki, r.size.powo); }
