// Flora / encyclopedia description text → traits + numeric params.
// Rule-based, vocabulary-driven (same glossary as the renderer), so output is always drawable.
// Used for: any-species resolution (tier C), and automatic literature validation of curated species.
import { TRAITS } from './traits.js';

// Plain-English phrases → [category, term]. Checked before glossary words (longest first).
const PHRASES = [
  [/\b(bi|twice)[- ]?pinnate(ly compound)?\b/, 'structure', 'bipinnate'],
  [/\b(tri|thrice)[- ]?pinnate(ly compound)?\b/, 'structure', 'tripinnate'],
  [/\b(odd|impari)[- ]?pinnate\b|\bpinnately compound\b[^.;]{0,60}\bterminal leaflet\b/, 'structure', 'imparipinnate'],
  [/\b(even|pari)[- ]?pinnate\b/, 'structure', 'paripinnate'],
  [/\bpinnately compound\b|\bpinnate leaves\b|\bcompound pinnate\b|\bfeather[- ]shaped\b|\bpinnate(ly)? (divided|arranged) leaflets\b/, 'structure', 'pinnate-any'],
  [/\bpalmately compound\b|\bdigitate\b|\bpalmate leaves with (5|6|7|8|9|five|six|seven|eight|nine) leaflets\b/, 'structure', 'palmately-compound'],
  [/\bpairs of pinnae\b[^.;]*\bleaflets\b|\bpinnae?\b[^.;]{0,30}\b(lined|set) with\b[^.;]*\bleaflets\b|\bleaflets (on|per) each pinna\b/, 'structure', 'bipinnate'],
  [/\b(three|3)\b[^.;]{0,40}\bleaflets\b/, 'structure', 'ternate'],
  [/\btrifoliate\b|\btrifoliolate\b|\bthree leaflets\b|\b3 leaflets\b|\bternate\b/, 'structure', 'ternate'],
  [/\bunifoliolate\b|\bunifoliate\b/, 'structure', 'unifoliate'],
  [/\bfan[- ]shaped\b|\bcostapalmate\b|\bpalmate fronds?\b/, 'shape', 'flabellate'],
  [/\bheart[- ]shaped\b/, 'shape', 'cordate'],
  [/\bkidney[- ]shaped\b/, 'shape', 'reniform'],
  [/\blance[- ]shaped\b|\blanceolate\b/, 'shape', 'lanceolate'],
  [/\begg[- ]shaped\b/, 'shape', 'ovate'],
  [/\bstrap[- ]shaped\b|\bstrap[- ]like\b/, 'shape', 'lorate'],
  [/\bsword[- ]shaped\b/, 'shape', 'ensiform'],
  [/\bneedle[- ](like|shaped)\b|\bneedles\b/, 'shape', 'acicular'],
  [/\barrow(head)?[- ]shaped\b/, 'shape', 'sagittate'],
  [/\bspoon[- ]shaped\b/, 'shape', 'spatulate'],
  [/\b(triangular)\b/, 'shape', 'deltoid'],
  [/\b(round|rounded|circular) (leaves|blades?)\b/, 'shape', 'orbicular'],
  [/\bgrass[- ]like\b|\bnarrow(ly)? linear\b/, 'shape', 'linear'],
  [/\bdoubly (serrate|toothed)\b/, 'margin', 'doubly-serrate'],
  [/\bfinely (toothed|serrate)\b/, 'margin', 'serrulate'],
  [/\bcoarsely toothed\b|\btoothed\b/, 'margin', 'dentate'],
  [/\bsaw[- ]toothed\b/, 'margin', 'serrate'],
  [/\bscalloped\b|\bround[- ]toothed\b/, 'margin', 'crenate'],
  [/\b(spiny|spinous|spinulose|spine[- ]tipped teeth|prickly)\b/, 'margin', 'spiny'],
  [/\bwavy\b/, 'margin', 'undulate'],
  [/\b(untoothed|smooth[- ]edged|smooth margins?|without teeth)\b/, 'margin', 'entire'],
  [/\bpalmately (lobed|veined)\b|\b(3|4|5|6|7|three|four|five|six|seven)[- ]lobed\b/, 'lobation', 'palmately-lobed'],
  [/\bpinnately lobed\b/, 'lobation', 'pinnately-lobed'],
  [/\b(spine|bristle)[- ]tipped teeth\b/, 'margin', 'spiny'],
  [/\bteeth\b/, 'margin', 'dentate'],
  [/\bbasal rosette\b|\brosette\b/, 'phyllotaxis', 'rosulate'],
  [/\b(in )?(bundles|fascicles|clusters) of (2|3|4|5|two|three|four|five)\b/, 'phyllotaxis', 'fascicled'],
  [/\bscale[- ]like\b/, 'shape', 'rhomboid'],
  [/\bpeltate\b|\bpetiole attached (near|to) the (centre|center)\b/, 'attachment', 'peltate'],
  [/\bclasping\b|\bsessile\b|\bstalkless\b/, 'attachment', 'sessile'],
  [/\bparallel[- ]veined\b|\bparallel veins\b/, 'primary', 'parallel'],
  [/\bpleated\b|\bplicate\b/, 'folding', 'plicate'],
  [/\binduplicate\b/, 'folding', 'conduplicate'],
  [/\bperforated\b|\bholes\b|\bfenestrat/, 'surface', 'fenestrate'],
];

const CONTEXT = { apex: 'apex', tip: 'apex', apices: 'apex', base: 'base', bases: 'base', margin: 'margin', margins: 'margin', edges: 'margin', veins: 'secondary', venation: 'secondary', lobes: 'lobation', leaflets: 'structure' };
const NON_LEAF = /\b(sori|sorus|spores?|sporangia|indusi(a|um)|bractlets?|hairs?|scales?|flowers?|florets?|heads?|peduncles?|pedicels?|racemes?|spikes?|panicles?|cymes?|umbels?|staminate|pistillate|ovar(y|ies)|styles?|stigmas?|filaments?|anthers?|petals?|sepals?|fruits?|seeds?|bracts?|capsules?|cones?|nuts?|berr(y|ies)|drupes?|calyx|corolla|tepals?|stamens?|catkins?|inflorescences?|spathe|spadix|achenes?|samaras?|bark|twigs?|buds?|stipules?|petioles?)\b/;
const LEAF = /\b(lea(f|ves)|leaflets?|blades?|fronds?|pinnae|pinnules?|needles?|foliage|lamina)\b/;
const UNIT = { mm: 1, cm: 10, dm: 100, m: 1000, in: 25.4, inch: 25.4, inches: 25.4, ft: 304.8, feet: 304.8, foot: 304.8 };
const U = String.raw`(mm|cm|dm|m|millimet(?:er|re)s?|centimet(?:er|re)s?|decimet(?:er|re)s?|met(?:er|re)s?|inches|inch|in|feet|foot|ft)`;
const unitOf = (u) => { u = u.toLowerCase(); return UNIT[u] ?? (u.startsWith('milli') ? 1 : u.startsWith('centi') ? 10 : u.startsWith('deci') ? 100 : u.startsWith('met') ? 1000 : 1); };
const SKIP_CLAUSE = /==|\b(confused|section|subgenus|hybrids?|names?|etymology|epithet|occasionally|exceptionally|abnormal\w*|enormous|noted that|distinguish\w*|juvenile|seedlings?|young plants?|cultivars?|var\.|'[^']+'|‘[^’]+’|fossil|similar species|related species|resembl\w+|unlike|compared|than (?:the |those )?(?:of )?[a-z]+ [a-z]+)\b/;
const QUAL = /\b(no|rarely|not|never|seldom|occasionally|slightly|without|lacking|non)[- ]?$/;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const RANGE = String.raw`(?:${NUM}\s*(?:[-–—‒]|to)\s*)?${NUM}`;
const SIZE_L = new RegExp(String.raw`(up to |to |less than |under |not more than |about |approximately |c\.\s*)?${RANGE}\s*${U}\b(?:\s*\([^)]*\))?\s*(?:long|in length|length)`, 'i');
const SIZE_BARE = new RegExp(String.raw`(?:lea(?:f|ves)|blades?|lamina|leaflets?)\s+(?:are\s+|is\s+)?(?:usually\s+|mostly\s+|generally\s+|typically\s+)?(up to |to )?${RANGE}\s*${U}\b`, 'i');
const SIZE_LxW = new RegExp(String.raw`(up to |to )?${RANGE}\s*${U}?\s*(?:×|x|by)\s*${RANGE}\s*${U}\b`, 'i');
const SIZE_W = new RegExp(String.raw`(up to |to )?${RANGE}\s*${U}\b(?:\s*\([^)]*\))?\s*(?:wide|broad|across|in width)`, 'i');
const COUNT = new RegExp(String.raw`${RANGE}\s*(?:or more\s*)?(?:pairs of )?(?:[a-z-]+\s+){0,2}?(?:leaflets|pinnae|lobes|leaves per (?:bundle|fascicle)|needles per (?:bundle|fascicle)|segments)\b`, 'i');
const WORDNUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

let VOCAB = null;
function vocab() {
  if (VOCAB) return VOCAB;
  const v = new Map();
  for (const [cat, d] of Object.entries(TRAITS)) {
    if (cat === 'plantGroup') continue;
    for (const [id, term] of Object.entries(d.terms)) {
      if (id === 'none' || id === 'flat' || id === 'simple') continue;
      for (const w of [id, id.replace(/-/g, ' '), ...(term.aliases || [])]) {
        const k = w.toLowerCase();
        if (!v.has(k)) v.set(k, []);
        v.get(k).push([cat, id]);
      }
    }
  }
  VOCAB = { map: v, words: [...v.keys()].sort((a, b) => b.length - a.length) };
  return VOCAB;
}

const num = (s) => (s == null ? null : parseFloat(String(s).replace(',', '.')));
const rng = (a, b) => (a != null ? [num(a), num(b)] : [num(b), num(b)]);
const words2num = (s) => s.replace(/(\d+)\s*\+\s*\d+\s*⁄\s*\d+/g, '$1').replace(/(\d)\s*⁄\s*\d+/g, '$1').replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (w) => WORDNUM[w.toLowerCase()]);
// [lo,hi] from regex groups; 'up to X' → [0.4X, X].
const span = (upto, a, b, u) => {
  const r = rng(a, b).map((x) => x * u);
  if (upto && a == null && /up|to|less|under|not/.test(upto)) return [round(r[1] * 0.4), r[1]];
  if (upto && a == null && /about|approx|c\./.test(upto)) return [round(r[1] * 0.75), round(r[1] * 1.25)];
  return r;
};
// Size number must belong to a leaf word: nearest preceding organ word within 90 chars is a leaf word.
function leafOwned(c, idx) {
  const pre = c.slice(Math.max(0, idx - 90), idx);
  const organs = [...pre.matchAll(/\b(lea(?:f|ves)|leaflets?|blades?|lamina|fronds?|pinnae|needles?|petioles?|stalks?|stems?|flowers?|petals?|bracts?|fruits?|seeds?|nuts?|buds?|heads?|racemes?|spikes?|panicles?|peduncles?|pedicels?|catkins?|cones?|scales?|plants?|trees?|shrubs?|height|tall|spines?|sori)\b/g)];
  const last = organs.pop();
  if (!last) return null;
  if (/^(leaflet|pinnae)/.test(last[1])) return 'leaflet';
  return /^(lea|blade|lamina|frond|needle)/.test(last[1]) ? 'leaf' : null;
}

// Split into clauses; keep leaf clauses (drop flower/fruit clauses unless they also name leaves).
export function leafClauses(text) {
  const out = [];
  for (const sent of String(text || '').replace(/[ \t\r]+/g, ' ').split(/(?<=[.;])\s+|\n+/)) {
    const s = sent.toLowerCase();
    if (SKIP_CLAUSE.test(s) && !/^(leaves|leaf|blades?|lamina)\b/.test(s.trim())) continue;
    const leafy = LEAF.test(s);
    for (const cl of s.split(/;|, (?=(?:and |while |whereas )?(?:the )?(?:flowers?|fruits?|petals?|seeds?|bark)\b)/)) {
      if (!cl.trim()) continue;
      const first = cl.match(/\b(lea(?:f|ves)|leaflets?|blades?|lamina|fronds?|pinnae|pinnules?|needles?|foliage)\b/);
      const firstNon = cl.match(NON_LEAF);
      const nonLeaf = (firstNon && !first) || (firstNon && first && firstNon.index < first.index && !/^(?:the )?(?:leaf|leaves)/.test(cl.trim()));
      if ((leafy || LEAF.test(cl)) && !nonLeaf) out.push(cl.trim());
    }
  }
  return out;
}

// Main extractor. Returns { traits, alt, params, evidence }.
// alt[cat] = every term of that category named in the clause that set it ("ovate to cordate", "entire or denticulate").
export function extractTraits(text) {
  const { map, words } = vocab();
  const clauses = leafClauses(text);
  const traits = {}, evidence = {}, params = {}, alt = {};
  const marginMods = new Set();
  for (const cl of clauses) {
    const isLeaflet = /\b(leaflets?|pinnae|pinnules?)\b/.test(cl);
    const ctx = (cl.match(/[a-z]+/g) || []).map((w) => CONTEXT[w]).find(Boolean) || null;
    const taken = new Array(cl.length).fill(false);
    const hits = [];
    const qualified = (i) => QUAL.test(cl.slice(Math.max(0, i - 14), i).trimEnd() + ' ') || QUAL.test(cl.slice(Math.max(0, i - 14), i));
    for (const [re, cat, id] of PHRASES) {
      const m = cl.match(re);
      if (!m || qualified(m.index)) continue;
      // "pinnate leaves ... terminal lobe" describes a lobed (pinnatifid) blade, not a compound leaf.
      if (cat === 'structure' && id === 'pinnate-any' && /\blobes?\b/.test(cl) && !/leaflets?|pinnae/.test(cl)) { hits.push([m.index, 'lobation', 'pinnatifid']); continue; }
      hits.push([m.index, cat, id]);
      for (let k = m.index; k < m.index + m[0].length; k++) taken[k] = true;
    }
    for (const w of words) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let m;
      while ((m = re.exec(cl))) {
        if (taken.slice(m.index, m.index + w.length).some(Boolean)) continue;
        for (let k = m.index; k < m.index + w.length; k++) taken[k] = true;
        if (qualified(m.index)) continue;
        if (/^\s*(odou?r|smell|scent|taste|flavou?r)/.test(cl.slice(m.index + w.length))) continue;
        const opts = map.get(w);
        const near = cl.slice(Math.max(0, m.index - 25), m.index + w.length + 25);
        const nctx = (near.match(/\b(apex|apices|tip|base|bases|margin|margins|veins|venation)\b/) || [])[1];
        const c2 = nctx ? CONTEXT[nctx] : ctx;
        const pick = opts.find((o) => o[0] === c2) || opts.find((o) => !(o[0] in traits)) || opts[0];
        hits.push([m.index, pick[0], pick[1], opts]);
      }
    }
    hits.sort((a, b) => a[0] - b[0]);
    const setHere = new Set();
    const lobeSubject = /^(?:the )?(?:leaf )?(lobes?|teeth|segments?|pinnules?|sinus(?:es)?)\b/.test(cl.trim());
    const veinCtx = /\b(veins?|vein(ed|lets)|nerv\w*|venation|midrib|costa)\b/.test(cl);
    for (const [, cat, id, opts] of hits) {
      if (['primary', 'secondary', 'tertiary', 'marginalVein', 'areoles'].includes(cat) && !veinCtx) continue;
      if (lobeSubject && ['shape', 'apex', 'base'].includes(cat)) continue;
      if (cat === 'phyllotaxis' && /\b(leaflets?|pinnae|pinnules?)\b/.test(cl) && !/\bleaves (are |arranged )?(alternate|opposite|spiral|whorled)/.test(cl)) continue;
      if (isLeaflet && ['shape', 'apex', 'base', 'margin'].includes(cat)) { params.leafletTraits ||= {}; params.leafletTraits[cat] ||= id; }
      if (cat === 'margin' && traits.margin && traits.margin !== id && !setHere.has('margin')) { if (['ciliate', 'spiny', 'undulate', 'crisped'].includes(id)) marginMods.add(id); continue; }
      if (!(cat in traits)) { traits[cat] = id; evidence[cat] = cl.slice(0, 200); alt[cat] = new Set([id]); setHere.add(cat); }
      else if (setHere.has(cat)) alt[cat].add(id);
      // Same word may name another category (hastate shape/base): record as alternative there too.
    }
    for (const [, , , opts] of hits) for (const [c2, id2] of opts || []) if (setHere.has(c2)) alt[c2].add(id2);
    // Sizes (only numbers owned by a leaf word). Every size statement in the clause is considered.
    const c = words2num(cl);
    const found = [];
    for (const re of [SIZE_LxW, SIZE_L, SIZE_BARE]) {
      for (const m of c.matchAll(new RegExp(re.source, 'gi'))) {
        if (found.some((f) => m.index < f.end && m.index + m[0].length > f.start)) continue;
        found.push({ re, m, start: m.index, end: m.index + m[0].length });
      }
    }
    for (const { re, m } of found.sort((x, y) => x.start - y.start)) {
      let own, L, W;
      if (re === SIZE_LxW) { own = leafOwned(c, m.index); const u2 = unitOf(m[7]), u1 = m[4] ? unitOf(m[4]) : u2; L = span(m[1], m[2], m[3], u1); W = span(m[1], m[5], m[6], u2); }
      else if (re === SIZE_L) { own = leafOwned(c, m.index); L = span(m[1], m[2], m[3], unitOf(m[4])); }
      else {
        if (/^\s*(?:\([^)]*\)\s*)?(across|wide|broad|in diameter|diameter|in width|tall|high)/.test(c.slice(m.index + m[0].length))) continue;
        own = /^leaflet/.test(m[0]) ? 'leaflet' : 'leaf'; L = span(m[1], m[2], m[3], unitOf(m[4]));
      }
      if (!own || params[own + 'Size']) continue;
      if (!W) { const w = c.slice(m.index + m[0].length, m.index + m[0].length + 45).match(new RegExp(String.raw`^\s*(?:\([^)]*\)\s*)?(?:,\s*|and\s+|by\s+|×\s*)` + SIZE_W.source, 'i')); if (w) W = span(w[1] || m[1], w[2], w[3], unitOf(w[4])); }
      params[own + 'Size'] = { L, ...(W ? { W } : {}), src: cl.slice(0, 200) };
    }
    for (const k of c.matchAll(new RegExp(COUNT.source, 'gi'))) {
      const s0 = k[0];
      const what = /lobes|segments/.test(s0) ? 'lobes' : /needles|bundle|fascicle/.test(s0) ? 'fascicle' : /pairs of pinnae/.test(s0) ? 'pinnaPairs' : /pinnae/.test(s0) ? 'pinnae' : /pairs/.test(s0) ? 'pairs' : 'leaflets';
      const r = rng(k[1], k[2]);
      if (r[1] > 300 || r[0] < 1) continue;
      params[what] ||= r;
    }
  }
  if (marginMods.size) traits.marginMods = [...marginMods];
  return { traits, alt: Object.fromEntries(Object.entries(alt).map(([k, v]) => [k, [...v]])), params, evidence, clauses: clauses.length };
}

// Convert extracted sizes into spec params ([mean, sd], mm).
export function sizeParams(sz) {
  if (!sz?.L) return {};
  const [l0, l1] = sz.L;
  const out = { length: [round((l0 + l1) / 2), round(Math.max((l1 - l0) / 4, (l0 + l1) * 0.05))] };
  if (sz.W) {
    const [w0, w1] = sz.W;
    const a = ((l0 + l1) / 2) / Math.max(0.1, (w0 + w1) / 2);
    out.aspect = [round(a, 2), round(a * 0.12, 2)];
  }
  return out;
}
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
