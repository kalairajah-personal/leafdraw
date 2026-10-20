// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  draw, registerSpecies, listSpecies, renderSVG, renderAnimatedSVG, renderGcode, renderHPGL, sceneToJSON,
  validate, parseTraitList, lookup, GLOSSARY, TRAITS, measureOutline, lobeDepth, composeScenes,
} from '../core/index.js';
import { pointInPoly, signedArea } from '../core/geom.js';
import { findTerm } from '../core/traits.js';

const species = JSON.parse(fs.readFileSync(new URL('../data/species.json', import.meta.url)));
registerSpecies(species);
const outlineOf = (sc) => sc.parts.find((p) => p.role === 'outline').pts;
const midOf = (sc) => sc.parts.find((p) => p.role === 'v1');

test('deterministic: same seed → identical scene; different seed → different', () => {
  const a = sceneToJSON(draw('ulmus-americana', 42));
  const b = sceneToJSON(draw('ulmus-americana', 42));
  const c = sceneToJSON(draw('ulmus-americana', 43));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('every catalog species draws, with closed outline and veins inside the blade', () => {
  for (const s of listSpecies()) {
    const view = s.traits.plantGroup === 'conifer-scale' ? 'shoot' : 'leaf';
    const sc = draw(s, 1, { view, detail: 'medium' });
    assert.ok(sc.parts.length > 3, `${s.id} has parts`);
    if (s.compound || s.traits.plantGroup === 'conifer-scale' || s.traits.plantGroup === 'fern') continue;
    const o = outlineOf(sc);
    assert.ok(Math.abs(signedArea(o)) > 1, `${s.id} outline has area`);
    const veinPts = sc.parts.filter((p) => /^v[1-5]$/.test(p.role)).flatMap((p) => p.pts.filter((_, i) => i % 3 === 0 && i > 1 && i < p.pts.length - 2));
    if (!veinPts.length) continue;
    const inside = veinPts.filter((p) => pointInPoly(p, o)).length / veinPts.length;
    const deep = ['pinnatipartite', 'pinnatisect', 'multifid', 'laciniate', 'lyrate'].includes(s.traits.lobation);
    assert.ok(inside > (deep ? 0.92 : 0.97), `${s.id}: ${(inside * 100).toFixed(1)}% vein points inside`);
  }
});

test('every Wikipedia glossary term is in the vocabulary', () => {
  const missing = [];
  for (const [, words] of Object.entries(GLOSSARY)) for (const w of words) if (!lookup(w).length) missing.push(w);
  assert.deepEqual(missing, []);
});

test('every vocabulary term renders (or is rejected with a reason)', () => {
  const base = { plantGroup: 'dicot', shape: 'elliptic', margin: 'serrate' };
  const report = [];
  for (const [cat, def] of Object.entries(TRAITS)) {
    for (const id of Object.keys(def.terms)) {
      let traits = { ...base, [cat]: id };
      if (cat === 'plantGroup') traits = { plantGroup: id };
      if (cat === 'lobation' && /palm|pedate/.test(id)) traits.shape = 'palmate';
      if (cat === 'form3d' && /terete/.test(id)) Object.assign(traits, { shape: 'linear', margin: 'entire', plantGroup: 'monocot' });
      if (cat === 'primary' && id === 'parallel') Object.assign(traits, { shape: 'linear', margin: 'entire', plantGroup: 'monocot' });
      if (cat === 'primary' && (id === 'flabellate' || id === 'dichotomous')) traits.shape = 'flabellate';
      if (cat === 'secondary' && id === 'parallelodromous') Object.assign(traits, { plantGroup: 'monocot', primary: 'pinnate', margin: 'entire' });
      if (cat === 'shape' && ['acicular', 'filiform', 'subulate'].includes(id)) Object.assign(traits, { plantGroup: 'conifer-needle', margin: 'entire' });
      if (cat === 'shape' && ['linear', 'ensiform', 'lorate'].includes(id)) traits.margin = 'entire';
      const v = validate(traits);
      if (!v.ok) { report.push({ cat, id, rejected: v.errors.map((e) => e.msg) }); continue; }
      const sc = draw({ id: `t-${cat}-${id}`, traits, params: {} }, 1, { detail: 'low' });
      assert.ok(sc.parts.length > 0, `${cat}=${id}`);
    }
  }
  // Rejections must carry a message; none are expected with the compatible defaults above.
  assert.deepEqual(report, []);
});

test('impossible combinations are rejected; implied traits are filled', () => {
  assert.equal(validate(parseTraitList('linear, palmatifid')).ok, false);
  assert.equal(validate({ shape: 'acicular', lobation: 'pinnatifid' }).ok, false);
  assert.equal(validate({ secondary: 'craspedodromous', margin: 'entire' }).ok, false);
  const v = validate({ shape: 'obcordate' });
  assert.equal(v.traits.apex, 'emarginate');
  assert.equal(validate({ shape: 'reniform' }).traits.base, 'cordate');
  assert.equal(validate({ primary: 'parallel', plantGroup: 'monocot', shape: 'linear' }).traits.secondary, 'parallelodromous');
});

test('drawn geometry matches the numeric term definitions', () => {
  const check = (traits, fn, seeds = [1, 2, 3]) => {
    for (const s of seeds) {
      const sc = draw({ id: 'm', traits, params: {} }, s, { detail: 'low' });
      const o = outlineOf(sc), mid = midOf(sc);
      fn(measureOutline(o, mid.pts[0], mid.pts[mid.pts.length - 1]), o, mid);
    }
  };
  for (const [shape, [lo, hi]] of [['lanceolate', [2.6, 7]], ['elliptic', [1.4, 2.7]], ['ovate', [1.15, 2.3]], ['orbicular', [0.85, 1.3]], ['linear', [8, 24]]]) {
    const ends = shape === 'orbicular' ? 'rounded' : 'acute';
    check({ shape, margin: 'entire', apex: ends, base: ends }, (m) => assert.ok(m.aspect >= lo && m.aspect <= hi, `${shape} aspect ${m.aspect.toFixed(2)}`));
  }
  check({ shape: 'ovate', margin: 'entire' }, (m) => assert.ok(m.widest < 0.47, `ovate widest ${m.widest}`));
  check({ shape: 'obovate', margin: 'entire' }, (m) => assert.ok(m.widest > 0.5, `obovate widest ${m.widest}`));
  check({ shape: 'elliptic', margin: 'serrate' }, (m) => assert.ok(m.teeth > 10, `serrate teeth ${m.teeth}`));
  check({ shape: 'elliptic', margin: 'entire' }, (m) => assert.ok(m.teeth < 6, `entire teeth ${m.teeth}`));
  check({ shape: 'elliptic', apex: 'acute', margin: 'entire' }, (m) => assert.ok(m.apexAngle < 95, `acute apex ${m.apexAngle}`));
  for (const [lob, lo, hi] of [['pinnatifid', 0.2, 0.55], ['pinnatipartite', 0.45, 0.9], ['pinnatisect', 0.8, 1]]) {
    check({ shape: 'oblong', lobation: lob, margin: 'entire' }, (m, o, mid) => {
      const d = lobeDepth(o, mid.pts[0], mid.pts[mid.pts.length - 1]);
      assert.ok(d >= lo && d <= hi, `${lob} depth ${d.toFixed(2)}`);
    });
  }
});

test('craspedodromous secondaries end at tooth tips', () => {
  const sc = draw('fagus-grandifolia', 1, { detail: 'low' });
  const o = outlineOf(sc);
  const secs = sc.parts.filter((p) => p.role === 'v2');
  const nearMargin = secs.filter((p) => {
    const e = p.pts[p.pts.length - 1];
    return o.some((q) => Math.hypot(q[0] - e[0], q[1] - e[1]) < 1.2);
  }).length;
  assert.ok(nearMargin / secs.length > 0.8, `${nearMargin}/${secs.length} secondaries reach the margin`);
});

test('renderers produce well-formed output for every style', () => {
  const sc = draw('acer-rubrum', 2);
  for (const style of ['line', 'hatch', 'stipple', 'color', 'botanical', 'cleared', 'silhouette', 'venation']) {
    const svg = renderSVG(sc, { style, labels: true, season: 'fall' });
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  }
  const anim = renderAnimatedSVG(sc, { order: 'plotter', duration: 5 });
  assert.match(anim, /@keyframes ld-draw/);
  const g = renderGcode(sc);
  assert.match(g, /^; leafdraw/);
  assert.ok(g.split('\n').filter((l) => l.startsWith('G1 X')).length > 100);
  assert.match(renderHPGL(sc), /^IN;/);
  const plate = composeScenes([draw('acer-rubrum', 1), draw('acer-rubrum', 2)], { cols: 2 });
  assert.ok(plate.parts.length > sc.parts.length);
});

test('glossary aliases resolve (spear-shaped → hastate, digitate → palmately-compound, keeled → carinate)', () => {
  assert.equal(findTerm('shape', 'spear-shaped').id, 'hastate');
  assert.equal(findTerm('structure', 'digitate').id, 'palmately-compound');
  assert.equal(findTerm('folding', 'keeled').id, 'carinate');
  assert.equal(findTerm('margin', 'pungent').id, 'spiny');
});
