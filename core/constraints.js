// Botanical constraint matrix. Blocks impossible trait combos, warns on rare ones,
// fills implied traits. Returns { traits, errors, warnings, implied }.
import { TRAITS, findTerm } from './traits.js';

const DEFAULTS = {
  dicot: { structure: 'simple', shape: 'elliptic', lobation: 'none', apex: 'acute', base: 'rounded', symmetry: 'symmetrical', margin: 'entire', attachment: 'petiolate', surface: 'laminar', form3d: 'flat', folding: 'none', primary: 'pinnate', secondary: 'brochidodromous', tertiary: 'opposite-percurrent', areoles: 'moderate', marginalVein: 'none', phyllotaxis: 'alternate' },
  monocot: { structure: 'simple', shape: 'linear', lobation: 'none', apex: 'acute', base: 'truncate', symmetry: 'symmetrical', margin: 'entire', attachment: 'sessile', surface: 'laminar', form3d: 'flat', folding: 'none', primary: 'parallel', secondary: 'parallelodromous', tertiary: 'transverse', areoles: 'none', marginalVein: 'fimbrial', phyllotaxis: 'distichous' },
  'conifer-needle': { structure: 'simple', shape: 'acicular', lobation: 'none', apex: 'acute', base: 'truncate', symmetry: 'symmetrical', margin: 'entire', attachment: 'sessile', surface: 'laminar', form3d: 'flat', folding: 'none', primary: 'parallel', secondary: 'none', tertiary: 'none', areoles: 'none', marginalVein: 'none', phyllotaxis: 'fascicled' },
  'conifer-scale': { structure: 'simple', shape: 'rhomboid', lobation: 'none', apex: 'acute', base: 'truncate', symmetry: 'symmetrical', margin: 'entire', attachment: 'sessile', surface: 'laminar', form3d: 'flat', folding: 'none', primary: 'pinnate', secondary: 'none', tertiary: 'none', areoles: 'none', marginalVein: 'none', phyllotaxis: 'decussate' },
  ginkgo: { structure: 'simple', shape: 'flabellate', lobation: 'none', apex: 'emarginate', base: 'cuneate', symmetry: 'symmetrical', margin: 'entire', attachment: 'petiolate', surface: 'laminar', form3d: 'flat', folding: 'none', primary: 'dichotomous', secondary: 'none', tertiary: 'none', areoles: 'none', marginalVein: 'none', phyllotaxis: 'fascicled' },
  fern: { structure: 'bipinnate', shape: 'oblong', lobation: 'pinnatifid', apex: 'obtuse', base: 'truncate', symmetry: 'symmetrical', margin: 'crenate', attachment: 'sessile', surface: 'laminar', form3d: 'flat', folding: 'none', primary: 'pinnate', secondary: 'cladodromous', tertiary: 'none', areoles: 'none', marginalVein: 'none', phyllotaxis: 'rosulate' },
};

const TOOTHED = new Set(['serrate', 'serrulate', 'doubly-serrate', 'dentate', 'denticulate', 'crenate', 'crenulate', 'spiny']);
const NARROW = new Set(['acicular', 'filiform', 'subulate']);
const STRAP = new Set(['linear', 'ensiform', 'lorate']);
const LOBED_BASES = new Set(['cordate', 'auriculate', 'sagittate', 'hastate']);

// Each rule: when(t) → true means violation. level: 'error' (impossible) | 'warn' (rare) | 'fix' (auto-apply).
export const RULES = [
  { id: 'narrow-no-lobes', level: 'error', msg: 'Needle/thread/awn blades cannot be lobed.', when: (t) => NARROW.has(t.shape) && t.lobation !== 'none' },
  { id: 'narrow-venation', level: 'error', msg: 'Needle blades have a single vein or parallel veins only.', when: (t) => NARROW.has(t.shape) && !['parallel', 'pinnate'].includes(t.primary) },
  { id: 'narrow-base', level: 'error', msg: 'Needle blades cannot have lobed bases.', when: (t) => NARROW.has(t.shape) && LOBED_BASES.has(t.base) },
  { id: 'narrow-simple', level: 'error', msg: 'Needle blades are simple leaves.', when: (t) => NARROW.has(t.shape) && t.structure !== 'simple' },
  { id: 'strap-lobes', level: 'warn', msg: 'Strap-shaped blades are rarely lobed.', when: (t) => STRAP.has(t.shape) && t.lobation !== 'none' },
  { id: 'strap-actino', level: 'error', msg: 'Linear/strap blades cannot carry radiating (actinodromous) primaries.', when: (t) => STRAP.has(t.shape) && ['actinodromous', 'palinactinodromous'].includes(t.primary) },
  { id: 'palm-lobes-primary', level: 'error', msg: 'Palmate lobing needs radiating primaries (actinodromous/palinactinodromous).', when: (t) => /palm|pedate/.test(t.lobation) && !['actinodromous', 'palinactinodromous'].includes(t.primary) },
  { id: 'pinnate-lobes-primary', level: 'warn', msg: 'Pinnate lobing normally sits on a pinnate midvein.', when: (t) => ['pinnately-lobed', 'pinnatifid', 'pinnatipartite', 'pinnatisect', 'lyrate', 'multifid'].includes(t.lobation) && t.primary !== 'pinnate' },
  { id: 'crasp-needs-ends', level: 'error', msg: 'Craspedodromous secondaries must end in teeth or lobes; margin is entire and unlobed.', when: (t) => t.secondary === 'craspedodromous' && !TOOTHED.has(t.margin) && t.lobation === 'none' && t.margin !== 'sinuate' },
  { id: 'semicrasp-needs-teeth', level: 'error', msg: 'Semicraspedodromous needs a toothed margin.', when: (t) => t.secondary === 'semicraspedodromous' && !TOOTHED.has(t.margin) },
  { id: 'parallel-secondary', level: 'fix', msg: 'Parallel primaries imply parallelodromous secondaries.', when: (t) => t.primary === 'parallel' && !['parallelodromous', 'none'].includes(t.secondary), fix: { secondary: 'parallelodromous' } },
  { id: 'parallel-tertiary', level: 'fix', msg: 'Parallel venation uses transverse cross-veins.', when: (t) => t.primary === 'parallel' && !['transverse', 'none'].includes(t.tertiary), fix: { tertiary: 'transverse' } },
  { id: 'parallel-teeth', level: 'warn', msg: 'Parallel-veined blades are rarely toothed.', when: (t) => t.primary === 'parallel' && TOOTHED.has(t.margin) && t.margin !== 'serrulate' },
  { id: 'peltate-primary', level: 'error', msg: 'Peltate blades have primaries radiating from the attachment (actinodromous).', when: (t) => t.attachment === 'peltate' && !['actinodromous', 'palinactinodromous'].includes(t.primary) },
  { id: 'peltate-base', level: 'fix', msg: 'Peltate blades have no basal margin; base ignored.', when: (t) => t.attachment === 'peltate' && t.base !== 'rounded', fix: { base: 'rounded' } },
  { id: 'cuneiform-lobed-base', level: 'error', msg: 'Wedge/attenuate bases conflict with lobed bases.', when: (t) => ['cuneiform', 'spatulate'].includes(t.shape) && LOBED_BASES.has(t.base) },
  { id: 'obcordate-apex', level: 'fix', msg: 'Obcordate implies a notched (emarginate) apex.', when: (t) => t.shape === 'obcordate' && !['emarginate', 'retuse'].includes(t.apex), fix: { apex: 'emarginate' } },
  { id: 'reniform-base', level: 'fix', msg: 'Reniform implies a cordate base.', when: (t) => t.shape === 'reniform' && t.base !== 'cordate', fix: { base: 'cordate' } },
  { id: 'cordate-shape-base', level: 'fix', msg: 'Cordate shape implies a cordate base.', when: (t) => t.shape === 'cordate' && t.base !== 'cordate', fix: { base: 'cordate' } },
  { id: 'hastate-shape-base', level: 'fix', msg: 'Hastate shape implies a hastate base.', when: (t) => t.shape === 'hastate' && t.base !== 'hastate', fix: { base: 'hastate' } },
  { id: 'sagittate-shape-base', level: 'fix', msg: 'Sagittate shape implies a sagittate base.', when: (t) => t.shape === 'sagittate' && t.base !== 'sagittate', fix: { base: 'sagittate' } },
  { id: 'round-shape-pointed-ends', level: 'warn', msg: 'Orbicular/reniform blades have rounded ends; acute apex or base will narrow the outline.', when: (t) => ['orbicular', 'reniform'].includes(t.shape) && (['acute', 'cuneate'].includes(t.apex) || ['acute', 'cuneate'].includes(t.base)) },
  { id: 'deltoid-base', level: 'warn', msg: 'Deltoid blades are usually truncate to subcordate at the base.', when: (t) => t.shape === 'deltoid' && !['truncate', 'cordate', 'obtuse'].includes(t.base) },
  { id: 'flabellate-venation', level: 'error', msg: 'Fan blades need fanning veins (dichotomous, flabellate or actinodromous).', when: (t) => t.shape === 'flabellate' && !['dichotomous', 'flabellate', 'actinodromous'].includes(t.primary) },
  { id: 'dichotomous-shape', level: 'warn', msg: 'Dichotomous venation is mostly Ginkgo and ferns.', when: (t) => t.primary === 'dichotomous' && t.shape !== 'flabellate' && t.plantGroup !== 'fern' },
  { id: 'terete-flat', level: 'error', msg: 'Terete/semiterete leaves have no lobes, teeth or folds.', when: (t) => ['terete', 'semiterete'].includes(t.form3d) && (t.lobation !== 'none' || TOOTHED.has(t.margin) || t.folding !== 'none') },
  { id: 'terete-shape', level: 'error', msg: 'Terete leaves are narrow (linear, acicular, filiform or subulate).', when: (t) => ['terete', 'semiterete'].includes(t.form3d) && !NARROW.has(t.shape) && !STRAP.has(t.shape) },
  { id: 'perfoliate-sessile', level: 'warn', msg: 'Perfoliate leaves are drawn on a stem; shoot view recommended.', when: (t) => t.attachment === 'perfoliate' },
  { id: 'pedate-structure', level: 'error', msg: 'Pedate lobing applies to simple palmate blades.', when: (t) => t.lobation === 'pedate' && t.structure !== 'simple' },
  { id: 'cirrate-simple', level: 'warn', msg: 'A cirrus is a rachis extension; most common on compound leaves and palms.', when: (t) => t.apex === 'cirrate' && t.structure === 'simple' },
  { id: 'eucamp-teeth', level: 'warn', msg: 'Eucamptodromous secondaries rarely reach teeth.', when: (t) => t.secondary === 'eucamptodromous' && TOOTHED.has(t.margin) },
  { id: 'needle-group', level: 'warn', msg: 'Needle leaves are typical of conifers.', when: (t) => NARROW.has(t.shape) && !['conifer-needle', 'monocot'].includes(t.plantGroup) },
  { id: 'monocot-palmate', level: 'warn', msg: 'Monocot blades are rarely palmately lobed (palms are plicate).', when: (t) => t.plantGroup === 'monocot' && /palm/.test(t.lobation) },
  { id: 'supervolute-bud', level: 'warn', msg: 'Supervolute describes leaves in bud; drawn rolled.', when: (t) => t.folding === 'supervolute' },
  { id: 'fenestrate-size', level: 'warn', msg: 'Fenestrate holes need a broad blade.', when: (t) => t.surface === 'fenestrate' && (NARROW.has(t.shape) || STRAP.has(t.shape)) },
];

export function validate(input) {
  const group = input.plantGroup || 'dicot';
  const t = { ...(DEFAULTS[group] || DEFAULTS.dicot), ...stripUndef(input), plantGroup: group };
  const errors = [], warnings = [], implied = [];
  // Unknown terms.
  for (const [cat, val] of Object.entries(t)) {
    if (cat === 'marginMods') continue;
    if (TRAITS[cat] && !findTerm(cat, val)) errors.push({ id: 'unknown-term', msg: `Unknown ${cat} term: ${val}` });
    else if (TRAITS[cat]) t[cat] = findTerm(cat, val).id;
  }
  // Shape-implied bases/apices when user did not set them explicitly.
  const sh = findTerm('shape', t.shape);
  if (sh?.base && input.base == null) { t.base = sh.base; implied.push(`base=${sh.base} (from ${t.shape})`); }
  if (sh?.apex && input.apex == null) { t.apex = sh.apex; implied.push(`apex=${sh.apex} (from ${t.shape})`); }
  const mg = findTerm('margin', t.margin);
  if (mg?.lobation && (input.lobation == null || input.lobation === 'none')) { t.lobation = mg.lobation; implied.push(`lobation=${mg.lobation} (from lobate margin)`); }
  if (/palm|pedate/.test(t.lobation) && input.primary == null) { t.primary = 'actinodromous'; implied.push('primary=actinodromous (palmate lobing)'); }
  if (t.attachment === 'peltate' && input.primary == null) { t.primary = 'actinodromous'; implied.push('primary=actinodromous (peltate)'); }
  if ((t.lobation !== 'none' || TOOTHED.has(t.margin)) && input.secondary == null && group === 'dicot') { t.secondary = 'craspedodromous'; implied.push('secondary=craspedodromous (teeth/lobes)'); }
  if (t.shape === 'flabellate' && input.primary == null) { t.primary = 'dichotomous'; implied.push('primary=dichotomous (fan)'); }
  if (['terete', 'semiterete'].includes(t.form3d) && input.secondary == null) { t.secondary = 'none'; t.tertiary = 'none'; t.areoles = 'none'; }

  for (let pass = 0; pass < 3; pass++) {
    for (const r of RULES) {
      if (!r.when(t)) continue;
      if (r.level === 'fix') { Object.assign(t, r.fix); if (pass === 0) implied.push(r.msg); }
      else if (pass === 2) (r.level === 'error' ? errors : warnings).push({ id: r.id, msg: r.msg });
    }
  }
  return { traits: t, errors, warnings, implied, ok: errors.length === 0 };
}

function stripUndef(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '')); }

export { DEFAULTS };
