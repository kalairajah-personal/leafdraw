// Any-species resolver: taxonomy + description text → drawable spec (tier C).
// Precedence: description text > genus prior > family prior > class default.
// Every trait is validated against the constraint matrix; contradicting text terms are dropped, not drawn.
import { extractTraits, sizeParams } from './text.js';
import { taxonPrior } from './families.js';
import { validate } from './constraints.js';

const LEAFLET_CATS = ['shape', 'apex', 'base', 'margin', 'lobation', 'secondary', 'tertiary', 'symmetry'];
const COMPOUND = new Set(['unifoliate', 'bifoliolate', 'bigeminate', 'ternate', 'biternate', 'palmately-compound', 'paripinnate', 'imparipinnate', 'bipinnate', 'tripinnate']);
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

// taxon: { name, family, genus, className, common?, key? }, text: description(s) joined.
export function autoSpec(taxon, text = '', opts = {}) {
  const prior = taxonPrior(taxon);
  const ex = extractTraits(text);
  const t = { ...prior.traits };
  const from = Object.fromEntries(Object.keys(t).map((k) => [k, prior.level]));
  // Group from text: needles/fronds trump nothing else if class unknown.
  for (const [k, v] of Object.entries(ex.traits)) {
    if (k === 'marginMods') { t.marginMods = v; continue; }
    if (k === 'structure' && v === 'pinnate-any') { if (!/pinnate/.test(t.structure || '')) { t.structure = 'imparipinnate'; from.structure = 'text'; } continue; }
    t[k] = v; from[k] = 'text';
  }
  if (t.plantGroup === 'conifer-needle' && t.shape === 'rhomboid') t.plantGroup = 'conifer-scale';
  if (t.plantGroup && t.plantGroup.startsWith('conifer') && from.structure === 'text') delete t.structure;
  if (t.plantGroup === 'fern' && !t.structure) t.structure = 'bipinnate';

  // Drop text-sourced terms that make the combination invalid (one at a time, latest category first).
  const dropped = [];
  const compoundNow = () => COMPOUND.has(t.structure) && t.plantGroup !== 'fern';
  // For compound leaves the blade terms describe leaflets: validate them on the leaflet, not the whole leaf.
  const checkSet = () => {
    if (!compoundNow()) return stripCompound(t);
    const lt = { ...(prior.compound?.leaflet?.traits || {}) };
    for (const c of LEAFLET_CATS) if (from[c] === 'text') lt[c] = t[c];
    if (t.plantGroup === 'monocot') lt.plantGroup = 'monocot';
    return lt;
  };
  for (let guard = 0; guard < 8; guard++) {
    const v = validate(checkSet());
    if (v.ok) break;
    const cand = Object.keys(t).filter((k) => from[k] === 'text' && k !== 'structure' && k !== 'plantGroup');
    const k = cand.pop();
    if (!k) break;
    dropped.push(`${k}=${t[k]}`); delete t[k];
    if (prior.traits[k]) { t[k] = prior.traits[k]; from[k] = prior.level; }
  }

  const params = { ...prior.params };
  const leafSz = sizeParams(ex.params.leafSize);
  const leafletSz = sizeParams(ex.params.leafletSize);
  const isCompound = COMPOUND.has(t.structure) && t.plantGroup !== 'fern';
  Object.assign(params, leafSz);
  if (ex.params.leaves) {/* ignore */}
  const spec = {
    id: slug(taxon.name), name: taxon.name, common: taxon.common ? [].concat(taxon.common) : [], family: taxon.family || '',
    tier: 'C', sources: opts.sources || [], traits: { ...t }, params, auto: { prior: prior.level, from, dropped, evidence: ex.evidence, clauses: ex.clauses },
  };
  if (isCompound) {
    const base = prior.compound || {};
    const lt = { ...(base.leaflet?.traits || {}) };
    // In compound leaves, blade descriptors in text describe the leaflets.
    for (const c of LEAFLET_CATS) {
      const v = ex.params.leafletTraits?.[c] ?? (from[c] === 'text' ? t[c] : undefined);
      if (v) lt[c] = v;
      if (from[c] === 'text') delete spec.traits[c];
    }
    // Rachis/petiole words ("terete", "channelled") are not blade forms on a compound leaf.
    for (const c of ['form3d', 'surface']) if (from[c] === 'text') { dropped.push(`${c}=${spec.traits[c]} (rachis)`); delete spec.traits[c]; }
    // Family-template blade terms belong to the leaflet, not the whole compound leaf.
    for (const c of LEAFLET_CATS) if (from[c] !== 'text' && c in spec.traits) { if (!(c in lt) && !base.leaflet) lt[c] = spec.traits[c]; delete spec.traits[c]; }
    if (t.plantGroup === 'monocot') lt.plantGroup = 'monocot';
    const lp = { ...(base.leaflet?.params || {}), ...leafletSz };
    const C = { ...base, leaflet: { traits: lt, params: lp } };
    if (ex.params.leaflets) {
      const n = (ex.params.leaflets[0] + ex.params.leaflets[1]) / 2;
      if (['paripinnate', 'imparipinnate'].includes(t.structure)) C.pairs = [Math.max(1, Math.round((n - (t.structure === 'imparipinnate' ? 1 : 0)) / 2)), 1];
      if (t.structure === 'palmately-compound') C.leaflets = [Math.round(n), 0.5];
    }
    const avg = (r) => (r[0] + r[1]) / 2;
    if (ex.params.pairs) C.pairs = [Math.round(avg(ex.params.pairs)), 1];
    if (['bipinnate', 'tripinnate'].includes(t.structure)) {
      // "8–25 pairs of pinnae, each with 30–60 leaflets": pinna pairs on the rachis, leaflet pairs per pinna.
      if (ex.params.pinnaPairs) C.pinnaPairs = [Math.round(avg(ex.params.pinnaPairs)), 1];
      else if (ex.params.pinnae) C.pinnaPairs = [Math.max(1, Math.round(avg(ex.params.pinnae) / 2)), 1];
      if (ex.params.leaflets) C.pairs = [Math.max(2, Math.round(avg(ex.params.leaflets) / 2)), 1];
      C.pinnaPairs ||= [5, 1];
      C.pairs ||= [10, 2];
    }
    if (!C.pairs && ['paripinnate', 'imparipinnate', 'bipinnate', 'tripinnate'].includes(t.structure)) C.pairs = [4, 1];
    if (C.angle == null) C.angle = 55;
    // Sanity: a leaflet cannot be longer than half the whole leaf.
    if (lp.length && params.length) { const L0 = Array.isArray(params.length) ? params.length[0] : params.length; const l0 = Array.isArray(lp.length) ? lp.length[0] : lp.length; if (l0 > L0 * 0.5 && !['ternate', 'palmately-compound', 'unifoliate', 'bifoliolate'].includes(t.structure)) { lp.length = [Math.round(L0 * 0.25), Math.round(L0 * 0.03)]; spec.auto.dropped.push(`leaflet length ${l0}mm > half leaf`); } }
    spec.compound = C;
    // Leaflet length absent: estimate from leaf length.
    if (!lp.length && params.length) { const L0 = Array.isArray(params.length) ? params.length[0] : params.length; const pp = Array.isArray(C.pairs) ? C.pairs[0] : C.pairs || 4; const f = ['bipinnate', 'tripinnate'].includes(t.structure) ? 0.6 / (pp + 1) : Math.min(0.35, 1.6 / (pp + 1)); lp.length = [Math.round(L0 * f), Math.round(L0 * f * 0.12)]; }
  }
  // Generic "lobed" on a palmate/actinodromous blade means palmately lobed.
  if (spec.traits.lobation === 'lobed' && (spec.traits.shape === 'palmate' || spec.traits.primary === 'actinodromous')) spec.traits.lobation = 'palmately-lobed';
  if (ex.params.lobes && spec.traits.lobation && spec.traits.lobation !== 'none') {
    const n = Math.round((ex.params.lobes[0] + ex.params.lobes[1]) / 2);
    if (n >= 2 && n <= 15) params.lobeCount = [n, 0.4];
  }
  if (ex.params.fascicle && t.plantGroup === 'conifer-needle') params.fascicle = Math.round((ex.params.fascicle[0] + ex.params.fascicle[1]) / 2);
  const vTop = validate(stripCompound(spec.traits));
  const vLeaf = spec.compound ? validate({ ...spec.compound.leaflet.traits }) : vTop;
  const v = { ok: vTop.ok && vLeaf.ok, errors: [...vTop.errors, ...(spec.compound ? vLeaf.errors : [])], warnings: [...vTop.warnings, ...(spec.compound ? vLeaf.warnings : [])] };
  spec.auto.valid = v.ok; spec.auto.errors = v.errors.map((e) => e.id); spec.auto.warnings = v.warnings.map((e) => e.id);
  return spec;
}

function stripCompound(t) { const { marginMods, ...r } = t; return r; }

// ---------- live fetchers (Node 18+ / browsers with CORS) ----------
const LEAFY = /\b(lea(f|ves)|leaflets?|blades?|petioles?|fronds?|pinnae|pinnules?|needles?|lobes?|lobed|margins?|veins?|venation)\b/i;
export function leafSentences(txt, max = 2400) {
  const out = [];
  for (const s of String(txt || '').replace(/\n+/g, ' ').split(/(?<=[.;])\s+/)) {
    if (LEAFY.test(s) && s.length < 600) out.push(s.trim());
    if (out.join(' ').length > max) break;
  }
  return out.join(' ').slice(0, max);
}

export async function fetchTaxon(name, f = (u) => globalThis.fetch(u)) {
  let netFail = false;
  const j = (u) => f(u).then((r) => (r.ok ? r.json() : null)).catch(() => { netFail = true; return null; });
  const g = await j(`https://api.gbif.org/v1/species/match?kingdom=Plantae&name=${encodeURIComponent(name)}`);
  if (!g && netFail) throw new Error('network unreachable');
  if (!g || !g.usageKey || g.matchType === 'NONE' || g.kingdom !== 'Plantae' || !['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'].includes(g.rank)) {
    // Common name ("neem", "banyan") → backbone vernacular search.
    const v = await j(`https://api.gbif.org/v1/species/search?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&qField=VERNACULAR&rank=SPECIES&highertaxonKey=6&status=ACCEPTED&limit=5&q=${encodeURIComponent(name)}`);
    const hit = (v?.results || [])[0];
    if (hit && hit.canonicalName && hit.canonicalName.toLowerCase() !== name.toLowerCase()) return fetchTaxon(hit.canonicalName, f);
    return { error: `No GBIF match for "${name}"` };
  }
  const accepted = g.acceptedUsageKey ? await j(`https://api.gbif.org/v1/species/${g.acceptedUsageKey}`) : null;
  const canon = accepted?.canonicalName || g.canonicalName || g.scientificName;
  const taxon = { name: canon, family: g.family, genus: g.genus, className: g.class, key: g.acceptedUsageKey || g.usageKey, rank: g.rank, matchType: g.matchType, status: g.status };
  const texts = [], sources = [`GBIF ${taxon.key}`];
  const w = await j(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(canon)}`);
  const page = w && Object.values(w.query?.pages || {})[0];
  if (page?.extract) { texts.push(leafSentences(page.extract)); sources.push(`Wikipedia: ${page.title}`); }
  const ps = await j(`https://powo.science.kew.org/api/2/search?q=${encodeURIComponent(canon)}`);
  const r0 = (ps?.results || []).find((x) => x.name === canon) || null;
  if (r0) {
    const pt = await j(`https://powo.science.kew.org/api/2/taxon/${r0.fqId}?fields=descriptions`);
    for (const src of Object.values(pt?.descriptions || {})) {
      for (const [k, arr] of Object.entries(src.descriptions || {})) {
        if (!/morphologyLeaf|morphologyGeneral/i.test(k)) continue;
        for (const d of arr) { if (/leaf|leaves|leaflet|frond|pinna|blade/i.test(d.description)) { texts.unshift(d.description); sources.push(`POWO/${src.source}`); } }
      }
    }
  }
  const v = await j(`https://api.gbif.org/v1/species/${taxon.key}/vernacularNames?limit=50`);
  taxon.common = (v?.results || []).filter((x) => x.language === 'eng').map((x) => x.vernacularName).slice(0, 3);
  return { taxon, text: texts.join(' \n'), sources: [...new Set(sources)] };
}

export async function resolveName(name, f) {
  const r = await fetchTaxon(name, f);
  if (r.error) return r;
  return autoSpec(r.taxon, r.text, { sources: r.sources });
}
