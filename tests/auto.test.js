import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { extractTraits } from '../core/text.js';
import { autoSpec, resolveName } from '../core/auto.js';
import { FAMILY, GENUS } from '../core/families.js';
import { draw } from '../core/index.js';

test('text: terms, alternatives, qualifiers, sizes', () => {
  const r = extractTraits('Leaves alternate, ovate to cordate, 5–12 × 3–8 cm, margin entire or denticulate, apex acuminate, base rounded. Flowers ovate, 2 cm long.');
  assert.equal(r.traits.shape, 'ovate');
  assert.ok(r.alt.shape.includes('cordate'));
  assert.ok(r.alt.margin.includes('denticulate'));
  assert.equal(r.traits.apex, 'acuminate');
  assert.deepEqual(r.params.leafSize.L, [50, 120]);
  assert.deepEqual(r.params.leafSize.W, [30, 80]);
  const q = extractTraits('Leaves rarely toothed, elliptic. Leaves up to 20 cm long.');
  assert.notEqual(q.traits.margin, 'dentate');
  assert.deepEqual(q.params.leafSize.L, [80, 200]);
  const u = extractTraits('Leaves are five to ten inches long.');
  assert.equal(Math.round(u.params.leafSize.L[1]), 254);
  const c = extractTraits('Pinnate leaves 4–6 m long, pinnae 60–90 centimeters long.');
  assert.deepEqual(c.params.leafSize.L, [4000, 6000]);
  assert.deepEqual(c.params.leafletSize.L, [600, 900]);
  const n = extractTraits('Staminate flowers in racemes 5–8 cm long, borne in the axil of an upper leaf.');
  assert.equal(n.params.leafSize, undefined);
});

test('every family and genus prior yields a valid, drawable spec', () => {
  const bad = [];
  for (const [fam, p] of Object.entries(FAMILY)) {
    const s = autoSpec({ name: `${fam} test`, family: fam, className: p.traits.plantGroup === 'monocot' ? 'Liliopsida' : 'Magnoliopsida' }, '');
    if (!s.auto.valid) bad.push(`${fam}: ${s.auto.errors}`);
    else { try { draw(s, 3, { detail: 'low' }); } catch (e) { bad.push(`${fam}: draw ${e.message}`); } }
  }
  for (const [g] of Object.entries(GENUS)) {
    const s = autoSpec({ name: `${g} test`, genus: g, className: 'Magnoliopsida' }, '');
    if (!s.auto.valid) bad.push(`${g}: ${s.auto.errors}`);
    else { try { draw(s, 3, { detail: 'low' }); } catch (e) { bad.push(`${g}: draw ${e.message}`); } }
  }
  assert.deepEqual(bad, []);
});

test('auto specs from real source text (62 curated species) are valid and drawable', () => {
  const src = JSON.parse(fs.readFileSync(new URL('../data/validation/curated-sources.json', import.meta.url)));
  const bad = [];
  for (const s of src) {
    const g = s.gbif || {};
    const text = [...(s.powo?.desc || []).map((d) => d.t), s.wiki || ''].join(' \n');
    const spec = autoSpec({ name: s.name, family: g.family, genus: s.name.split(' ')[0], className: g.cls }, text);
    if (!spec.auto.valid) { bad.push(`${s.name}: ${spec.auto.errors}`); continue; }
    try { draw(spec, 5, { detail: 'low' }); } catch (e) { bad.push(`${s.name}: ${e.message}`); }
  }
  assert.deepEqual(bad, []);
});

test('resolveName with mocked GBIF/Wikipedia/POWO', async () => {
  const fake = async (u) => {
    const body = u.includes('species/match') ? { usageKey: 1, kingdom: 'Plantae', matchType: 'EXACT', status: 'ACCEPTED', canonicalName: 'Cocos nucifera', family: 'Arecaceae', genus: 'Cocos', class: 'Liliopsida', rank: 'SPECIES' }
      : u.includes('wikipedia') ? { query: { pages: { 1: { title: 'Coconut', extract: 'It is a palm with pinnate leaves 4–6 m long, and pinnae 60–90 centimeters long.' } } } }
      : u.includes('vernacular') ? { results: [{ language: 'eng', vernacularName: 'Coconut palm' }] }
      : { results: [] };
    return { ok: true, json: async () => body };
  };
  const spec = await resolveName('Cocos nucifera', fake);
  assert.equal(spec.traits.structure, 'paripinnate');
  assert.equal(spec.params.length[0], 5000);
  assert.equal(spec.compound.leaflet.params.length[0], 750);
  assert.deepEqual(spec.common, ['Coconut palm']);
  draw(spec, 1, { detail: 'low' });
});
