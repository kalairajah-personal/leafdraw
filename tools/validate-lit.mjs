// Automatic literature validation of curated species.
// Inputs: data/validation/curated-sources.json (GBIF match + Wikipedia + POWO leaf text, fetched live).
// Checks: (1) taxonomy (name accepted, family matches GBIF), (2) traits stated in text agree with curated traits,
// (3) leaf length within text range, (4) aspect within text range. Output: data/validation/report.json + console table.
import fs from 'fs';
import { extractTraits } from '../core/text.js';
import { validate } from '../core/constraints.js';
import { findTerm } from '../core/traits.js';

const species = JSON.parse(fs.readFileSync(new URL('../data/species.json', import.meta.url)));
const src = JSON.parse(fs.readFileSync(new URL('../data/validation/curated-sources.json', import.meta.url)));
const byName = Object.fromEntries(src.map((s) => [s.name, s]));

import { near } from './near.mjs';
const CHECK = ['structure', 'shape', 'lobation', 'margin', 'apex', 'base', 'phyllotaxis', 'attachment', 'surface'];

const rows = [];
let agree = 0, nearN = 0, disagree = 0;
for (const sp of species) {
  const s = byName[sp.name] || {};
  const g = s.gbif || {};
  const famOk = !g.family || !sp.family || g.family === sp.family;
  const text = [...(s.powo?.desc || []).filter((d) => /morphologyLeaf/.test(d.k)).map((d) => d.t), s.wiki || ''].join(' \n');
  const ex = extractTraits(text);
  const full = validate(sp.traits).traits;
  const cmp = {};
  const curatedLeaflet = sp.compound?.leaflet?.traits || {};
  for (const c of CHECK) {
    const tv = ex.traits[c];
    if (!tv) continue;
    let mine = ['shape', 'apex', 'base', 'margin', 'lobation'].includes(c) && sp.compound ? (curatedLeaflet[c] ?? full[c]) : full[c];
    if (c === 'shape' && sp.traits.shape == null && !sp.compound) mine = full.shape;
    const alts = ex.alt[c] || [tv];
    let verdict = alts.includes(mine) ? 'agree' : alts.some((a) => near(mine, a)) ? 'near' : 'disagree';
    // Ginkgo-type: a notched apex is how a two-lobed fan is encoded.
    if (verdict === 'disagree' && c === 'lobation' && tv === 'lobed' && ['emarginate', 'retuse'].includes(full.apex)) verdict = 'near';
    cmp[c] = { curated: mine, text: alts.join('/'), verdict, evidence: ex.evidence[c] };
    if (verdict === 'agree') agree++; else if (verdict === 'near') nearN++; else disagree++;
  }
  // Size: text length range vs curated mean.
  let size = null;
  const sz = ex.params.leafSize || (sp.compound ? null : null);
  const L = Array.isArray(sp.params?.length) ? sp.params.length[0] : sp.params?.length;
  if (sz?.L && L) {
    const [lo, hi] = sz.L; const inR = L >= lo * 0.85 && L <= hi * 1.15;
    size = { curated: L, text: [lo, hi], verdict: inR ? 'agree' : 'disagree', evidence: sz.src };
    if (sz.W && sp.params?.aspect) {
      const a = Array.isArray(sp.params.aspect) ? sp.params.aspect[0] : sp.params.aspect;
      const aLo = lo / sz.W[1], aHi = hi / sz.W[0];
      size.aspect = { curated: a, text: [round(aLo), round(aHi)], verdict: a >= aLo * 0.8 && a <= aHi * 1.2 ? 'agree' : 'disagree' };
    }
  }
  rows.push({
    id: sp.id, name: sp.name, taxonomy: { gbif: g.status, match: g.match, family: g.family, familyOk: famOk, herbariumImages: g.herbImages, wikipedia: s.wikiTitle, powoAccepted: s.powo?.accepted },
    textChars: text.length, sources: [s.wikiTitle && `Wikipedia: ${s.wikiTitle}`, ...(s.powo?.desc || []).filter((d) => /morphologyLeaf/.test(d.k)).map((d) => `POWO/${d.src}`)].filter(Boolean), traits: cmp, size,
  });
}
function round(x) { return Math.round(x * 100) / 100; }
const sizeRows = rows.filter((r) => r.size);
const summary = {
  date: new Date().toISOString().slice(0, 10), species: rows.length,
  taxonomy: { gbifAccepted: rows.filter((r) => r.taxonomy.gbif === 'ACCEPTED').length, familyMatch: rows.filter((r) => r.taxonomy.familyOk).length, withHerbariumImages: rows.filter((r) => r.taxonomy.herbariumImages > 0).length },
  traits: { compared: agree + nearN + disagree, agree, near: nearN, disagree },
  size: { compared: sizeRows.length, lengthAgree: sizeRows.filter((r) => r.size.verdict === 'agree').length, aspectCompared: sizeRows.filter((r) => r.size.aspect).length, aspectAgree: sizeRows.filter((r) => r.size.aspect?.verdict === 'agree').length },
};
fs.writeFileSync(new URL('../data/validation/report.json', import.meta.url), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const r of rows) {
  const bad = Object.entries(r.traits).filter(([, v]) => v.verdict === 'disagree').map(([c, v]) => `${c}: ${v.curated}≠${v.text}`);
  if (r.size?.verdict === 'disagree') bad.push(`length ${r.size.curated}mm vs ${r.size.text.map(Math.round).join('–')}`);
  if (r.size?.aspect?.verdict === 'disagree') bad.push(`aspect ${r.size.aspect.curated} vs ${r.size.aspect.text.join('–')}`);
  if (!r.taxonomy.familyOk) bad.push(`family ≠ GBIF ${r.taxonomy.family}`);
  if (bad.length) console.log(r.id.padEnd(28), bad.join(' | '));
}
