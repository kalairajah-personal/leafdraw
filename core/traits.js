// Trait vocabulary. Terms follow the Wikipedia "Glossary of leaf morphology" and the
// Manual of Leaf Architecture (Ellis et al. 2009). Each term carries a numeric definition,
// so a term name always produces the same measurable geometry.
//
// Ranges are [lo, hi]. Fractions of blade length L unless noted. Angles in degrees.

export const TRAITS = {
  plantGroup: {
    label: 'Plant group',
    terms: {
      dicot: { def: 'Broadleaf angiosperm (dicot / eudicot / magnoliid).' },
      monocot: { def: 'Monocot: typically parallel-veined, entire margin.' },
      'conifer-needle': { def: 'Conifer with needle leaves (Pinus, Abies, Picea).' },
      'conifer-scale': { def: 'Conifer with overlapping scale leaves (Thuja, Juniperus).' },
      ginkgo: { def: 'Ginkgo: fan blade with dichotomous veins.' },
      fern: { def: 'Fern frond: pinnate to tripinnate, free forking veins, sori.' },
    },
  },

  structure: {
    label: 'Structure',
    terms: {
      simple: { def: 'Blade in one continuous section.' },
      unifoliate: { def: 'Compound with a single leaflet; jointed at petiole top.', leaflets: 1 },
      bifoliolate: { def: 'Two leaflets.', aliases: ['geminate', 'jugate'], leaflets: 2 },
      bigeminate: { def: 'Two leaflets, each bifoliolate.', leaflets: 2, nested: 'bifoliolate' },
      ternate: { def: 'Three leaflets.', aliases: ['trifoliate', 'trifoliolate'], leaflets: 3 },
      biternate: { def: 'Three components, each with three leaflets.', leaflets: 3, nested: 'ternate' },
      'palmately-compound': { def: 'Leaflets radiating from one point.', aliases: ['palmately compound', 'digitate'], leaflets: [5, 9] },
      paripinnate: { def: 'Pinnate, even number of leaflets, no terminal leaflet.', aliases: ['even-pinnate'], pairs: [4, 12] },
      imparipinnate: { def: 'Pinnate with a terminal leaflet (odd number).', aliases: ['odd-pinnate'], pairs: [2, 8] },
      bipinnate: { def: 'Leaflets themselves pinnately compound.', pairs: [3, 10], nested: 'paripinnate' },
      tripinnate: { def: 'Each leaflet itself bipinnate.', pairs: [3, 6], nested: 'bipinnate' },
    },
  },

  shape: {
    label: 'Blade shape',
    // aspect = L/W; widest = position of max width from base (0..1);
    // sharp = profile sharpness (1 = circular arcs, 2 = pointed); flat = side flattening (1 none).
    terms: {
      acicular: { def: 'Needle-like, slender and pointed.', aspect: [40, 120], widest: [0.1, 0.3], engine: 'needle' },
      filiform: { def: 'Thread-shaped.', aspect: [120, 400], widest: [0.4, 0.6], engine: 'needle', flat: 6 },
      subulate: { def: 'Awl-shaped, tapering from base to a fine point.', aspect: [8, 20], widest: [0.02, 0.08], engine: 'needle', angular: true },
      linear: { def: 'Long and very narrow, sides parallel.', aspect: [10, 20], widest: [0.45, 0.55], sharp: 1, flat: 4 },
      ensiform: { def: 'Sword-shaped: long, narrow, sharp tip.', aspect: [8, 15], widest: [0.25, 0.35], sharp: 1.2, flat: 3, apex: 'acute' },
      lorate: { def: 'Strap-shaped.', aspect: [5, 12], widest: [0.45, 0.55], sharp: 1, flat: 4.5, apex: 'rounded' },
      lanceolate: { def: 'Lance-shaped, widest in lower third.', aspect: [3, 6], widest: [0.3, 0.4], sharp: 2.0 },
      oblanceolate: { def: 'Reversed lanceolate, widest near tip.', aspect: [3, 6], widest: [0.62, 0.72], sharp: 2.0 },
      elliptic: { def: 'Widest at middle, ends taper alike.', aspect: [1.6, 2.4], widest: [0.47, 0.53], sharp: 1.85 },
      oblong: { def: 'Elongated with roughly parallel sides.', aspect: [1.8, 3], widest: [0.48, 0.52], sharp: 1, flat: 2.4 },
      ovate: { def: 'Egg-shaped, widest near base.', aspect: [1.3, 2], widest: [0.3, 0.4], sharp: 1.75 },
      obovate: { def: 'Reversed ovate, widest near tip.', aspect: [1.3, 2], widest: [0.6, 0.7], sharp: 1.75 },
      orbicular: { def: 'Circular.', aspect: [1, 1.12], widest: [0.48, 0.52], sharp: 1 },
      reniform: { def: 'Kidney-shaped: wider than long, cordate base.', aspect: [0.6, 0.85], widest: [0.42, 0.52], sharp: 1, base: 'cordate', apex: 'rounded' },
      cordate: { def: 'Heart-shaped, petiole in notch.', aspect: [1.1, 1.5], widest: [0.25, 0.35], sharp: 1.3, base: 'cordate', aliases: ['cordiform'] },
      obcordate: { def: 'Heart-shaped, attached at tapering end.', aspect: [1.0, 1.35], widest: [0.68, 0.78], sharp: 1.15, apex: 'emarginate', base: 'cuneate', notch: [0.12, 0.2] },
      deltoid: { def: 'Triangular, attached at a side.', aspect: [0.9, 1.25], widest: [0.06, 0.14], angular: true, base: 'truncate', aliases: ['deltate'] },
      rhomboid: { def: 'Diamond-shaped.', aspect: [1.2, 1.8], widest: [0.42, 0.55], angular: true, aliases: ['rhombic'] },
      trullate: { def: 'Trowel-shaped: angular, widest below middle.', aspect: [1.3, 2], widest: [0.25, 0.35], angular: true },
      obtrullate: { def: 'Reversed trullate: widest above middle.', aspect: [1.3, 2], widest: [0.65, 0.75], angular: true },
      spatulate: { def: 'Spoon-shaped: broad rounded end tapering to base.', aspect: [2.5, 4], widest: [0.78, 0.86], sharp: 1.25, base: 'attenuate', apex: 'rounded' },
      cuneiform: { def: 'Narrowly triangular, widest at far end, corners rounded.', aspect: [1.2, 2], widest: [0.85, 0.92], angular: true, base: 'cuneate', apex: 'truncate' },
      falcate: { def: 'Sickle-shaped.', aspect: [4, 8], widest: [0.3, 0.4], sharp: 2.0, curve: [0.12, 0.25] },
      pandurate: { def: 'Fiddle-shaped: obovate with mid constriction.', aspect: [1.6, 2.4], widest: [0.66, 0.72], sharp: 1.2, waist: { pos: [0.4, 0.48], depth: [0.22, 0.35] } },
      hastate: { def: 'Spear-shaped: pointed, flaring basal lobes.', aspect: [1.6, 2.6], widest: [0.12, 0.2], sharp: 1.6, base: 'hastate', aliases: ['spear-shaped'] },
      sagittate: { def: 'Arrowhead-shaped, basal lobes pointing down.', aspect: [1.3, 2.1], widest: [0.15, 0.25], sharp: 1.5, base: 'sagittate' },
      flabellate: { def: 'Fan-like, semicircular.', engine: 'polar', aspect: [0.55, 0.8], spread: [55, 80] },
      palmate: { def: 'Palm-shaped: lobes or leaflets from the base.', engine: 'polar', aspect: [0.85, 1.15] },
    },
  },

  lobation: {
    label: 'Lobing',
    // depth = sinus depth as fraction of the distance from margin envelope to midrib (or petiole).
    terms: {
      none: { def: 'Unlobed.' },
      lobed: { def: 'Divided by clefts (shallow).', aliases: ['lobate'], kind: 'pinnate', depth: [0.2, 0.35], count: [2, 4] },
      'pinnately-lobed': { def: 'Lobes along the midrib.', aliases: ['pinnately lobed'], kind: 'pinnate', depth: [0.3, 0.6], count: [3, 6] },
      pinnatifid: { def: 'Incisions less than halfway to the midrib.', kind: 'pinnate', depth: [0.28, 0.48], count: [3, 7] },
      pinnatipartite: { def: 'Incisions over halfway to the midrib.', kind: 'pinnate', depth: [0.55, 0.85], count: [3, 7] },
      pinnatisect: { def: 'Incisions almost to the midrib.', kind: 'pinnate', depth: [0.88, 0.96], count: [4, 10] },
      lyrate: { def: 'Pinnately lobed, large terminal lobe, small laterals.', kind: 'pinnate', depth: [0.5, 0.85], count: [3, 6], lyrate: true },
      laciniate: { def: 'Very deeply lobed, lobes drawn out and irregular.', kind: 'pinnate', depth: [0.8, 0.95], count: [5, 9], irregular: 0.35, sublobes: true, acute: true },
      multifid: { def: 'Cleft into many parts.', kind: 'pinnate', depth: [0.75, 0.92], count: [8, 14], acute: true },
      'palmately-lobed': { def: 'Lobes spread radially from a point.', aliases: ['palmately lobed'], kind: 'palmate', depth: [0.3, 0.6], count: [3, 7] },
      palmatifid: { def: 'Palmate incisions less than halfway to petiole.', kind: 'palmate', depth: [0.25, 0.48], count: [3, 7] },
      palmatipartite: { def: 'Palmate incisions over halfway to petiole.', kind: 'palmate', depth: [0.55, 0.85], count: [3, 7] },
      palmatisect: { def: 'Palmate incisions almost to the petiole.', kind: 'palmate', depth: [0.88, 0.96], count: [5, 9] },
      pedate: { def: 'Palmate with outer lobes cleft again.', kind: 'palmate', depth: [0.85, 0.95], count: [3, 3], pedate: true },
    },
  },

  apex: {
    label: 'Apex',
    terms: {
      acute: { def: 'Pointed, angle < 90°, sides straight to convex.', angle: [50, 80] },
      subobtuse: { def: 'Neither blunt nor sharp.', angle: [85, 100] },
      obtuse: { def: 'Blunt, angle > 90°.', angle: [105, 150] },
      rounded: { def: 'Circular, no point.', kind: 'round' },
      truncate: { def: 'Squared-off end.', kind: 'cut', cut: [0.86, 0.93] },
      acuminate: { def: 'Tapering to a long concave point.', kind: 'concave', tip: [0.08, 0.16], power: [1.6, 2.2] },
      caudate: { def: 'Tailed apex.', kind: 'concave', tip: [0.16, 0.28], power: [2.4, 3.2], tail: true },
      cuspidate: { def: 'Sharp, rigid, elongated cusp.', kind: 'point', base: 'obtuse', point: [0.035, 0.07], pw: [0.5, 0.8] },
      mucronate: { def: 'Abrupt small sharp point continuing the midrib.', kind: 'point', base: 'rounded', point: [0.012, 0.025], pw: [0.15, 0.3] },
      apiculate: { def: 'Tapering to a short slender point.', kind: 'point', base: 'obtuse', point: [0.02, 0.04], pw: [0.3, 0.5] },
      aristate: { def: 'Ending in a stiff bristle.', kind: 'awn', base: 'acute', awn: [0.05, 0.12] },
      emarginate: { def: 'Slightly indented at the tip.', kind: 'notch', base: 'rounded', notch: [0.02, 0.05] },
      retuse: { def: 'Shallow notch in a round apex.', kind: 'notch', base: 'rounded', notch: [0.008, 0.02] },
      subulate: { def: 'Awl-like tapering point.', kind: 'concave', tip: [0.25, 0.4], power: [1.1, 1.3] },
      cirrate: { def: 'Rachis extends into a whip-like cirrus.', kind: 'cirrus', base: 'acute', cirrus: [0.3, 0.6] },
      ecirrate: { def: 'Without a cirrus.', angle: [55, 80] },
    },
  },

  base: {
    label: 'Base',
    terms: {
      acute: { def: 'Angle < 90°, sides convex.', angle: [55, 85] },
      cuneate: { def: 'Wedge-shaped, straight sides.', angle: [35, 75], straight: true },
      subobtuse: { def: 'Somewhat blunt.', angle: [88, 100] },
      obtuse: { def: 'Angle > 90°.', angle: [105, 160] },
      rounded: { def: 'Circular, no point.', kind: 'round' },
      truncate: { def: 'Squared-off base.', kind: 'cut', cut: [0.04, 0.08] },
      attenuate: { def: 'Tissue tapers down the petiole.', kind: 'concave', tip: [0.2, 0.35], power: [1.5, 2] },
      cordate: { def: 'Rounded basal lobes with a sinus at the petiole.', kind: 'lobes', lobe: 'cordate', depth: [0.08, 0.2] },
      auriculate: { def: 'Small ear-like lobes beyond the attachment.', kind: 'lobes', lobe: 'auriculate', depth: [0.03, 0.08] },
      sagittate: { def: 'Basal lobes pointing downward.', kind: 'lobes', lobe: 'sagittate', depth: [0.18, 0.35] },
      hastate: { def: 'Basal lobes flaring outward.', kind: 'lobes', lobe: 'hastate', depth: [0.12, 0.28] },
      oblique: { def: 'Asymmetrical base, one side lower.', kind: 'round', oblique: [0.04, 0.12] },
    },
  },

  symmetry: {
    label: 'Symmetry',
    terms: {
      symmetrical: { def: 'Halves mirror each other.' },
      asymmetrical: { def: 'Blade shape differs on each side of midrib.', asym: [0.12, 0.25] },
    },
  },

  margin: {
    label: 'Margin',
    // spacing/height as fractions of L (spacing) and of L (height).
    terms: {
      entire: { def: 'Smooth, without teeth.', profile: 'none' },
      serrate: { def: 'Saw-toothed, teeth pointing forward.', profile: 'saw', spacing: [0.025, 0.045], height: [0.007, 0.014] },
      serrulate: { def: 'Finely serrate.', profile: 'saw', spacing: [0.01, 0.018], height: [0.0025, 0.005] },
      'doubly-serrate': { def: 'Each tooth bearing smaller teeth.', aliases: ['doubly serrate'], profile: 'saw', spacing: [0.04, 0.07], height: [0.012, 0.02], minor: [2, 3] },
      dentate: { def: 'Teeth pointing outward.', profile: 'tri', spacing: [0.03, 0.06], height: [0.01, 0.02] },
      denticulate: { def: 'Finely toothed.', profile: 'tri', spacing: [0.01, 0.018], height: [0.003, 0.006] },
      crenate: { def: 'Rounded teeth.', profile: 'scallop', spacing: [0.03, 0.06], height: [0.008, 0.016] },
      crenulate: { def: 'Finely crenate.', profile: 'scallop', spacing: [0.01, 0.02], height: [0.003, 0.006] },
      sinuate: { def: 'Deep wave-like indentations.', profile: 'wave', spacing: [0.14, 0.25], height: [0.025, 0.05] },
      undulate: { def: 'Wavy edge, shallower than sinuate.', profile: 'wave', spacing: [0.06, 0.12], height: [0.006, 0.014] },
      lobate: { def: 'Indented, not reaching center (see lobing).', profile: 'none', lobation: 'lobed' },
      spiny: { def: 'Stiff sharp points.', aliases: ['pungent'], profile: 'wave', spacing: [0.12, 0.2], height: [0.03, 0.06], spines: [0.03, 0.06] },
      ciliate: { def: 'Fringed with hairs.', profile: 'none', hairs: [0.008, 0.016] },
      crisped: { def: 'Curly edge.', profile: 'crisp', spacing: [0.015, 0.03], height: [0.004, 0.01] },
    },
  },

  attachment: {
    label: 'Attachment',
    terms: {
      petiolate: { def: 'Blade on a petiole.', petiole: [0.15, 0.4] },
      sessile: { def: 'No petiole.', petiole: [0, 0] },
      peltate: { def: 'Petiole attached near blade center.', engine: 'polar' },
      perfoliate: { def: 'Blade surrounds the stem.', petiole: [0, 0] },
    },
  },

  surface: {
    label: 'Surface',
    terms: {
      laminar: { def: 'Flat, continuous.' },
      fenestrate: { def: 'Large openings through the blade.', holes: 'fenestrate' },
      perforate: { def: 'Many small holes.', holes: 'perforate' },
    },
  },

  form3d: {
    label: '3-D form',
    terms: {
      flat: { def: 'Flat blade (laminar).' },
      terete: { def: 'Cylindrical in cross-section.' },
      semiterete: { def: 'Rounded one side, flat the other.' },
      undulate: { def: 'Blade wave-like in 3-D.' },
    },
  },

  folding: {
    label: 'Folding',
    terms: {
      none: { def: 'Not folded.' },
      carinate: { def: 'Keel-shaped longitudinal ridge.', aliases: ['keeled'] },
      conduplicate: { def: 'Folded upward along midrib.' },
      reduplicate: { def: 'Folded downward along midrib.' },
      cucullate: { def: 'Hooded: margins and tip curved down.' },
      involute: { def: 'Margins rolled upward.' },
      revolute: { def: 'Margins rolled downward.' },
      plicate: { def: 'Parallel folds (pleated).' },
      supervolute: { def: 'One half rolled within the other.' },
    },
  },

  primary: {
    label: 'Primary venation',
    terms: {
      pinnate: { def: 'Single midvein.' },
      actinodromous: { def: '3+ basal primaries radiating to margin.', count: [3, 7] },
      palinactinodromous: { def: 'Primaries radiate, with further branching above.', count: [3, 7] },
      acrodromous: { def: '2+ primaries arch and converge toward apex.', count: [3, 5] },
      campylodromous: { def: 'Several primaries in recurved arches meeting at apex.', count: [5, 9] },
      parallel: { def: 'Many veins parallel to the midvein (monocots).', count: [7, 31] },
      flabellate: { def: 'Several equal veins fanning out, branching distally.', count: [6, 14] },
      dichotomous: { def: 'Veins fork repeatedly into equal pairs.', count: [2, 2] },
    },
  },

  secondary: {
    label: 'Secondary venation',
    terms: {
      craspedodromous: { def: 'Secondaries end at the margin (teeth or lobes).' },
      semicraspedodromous: { def: 'Secondaries loop, branch reaches teeth.' },
      brochidodromous: { def: 'Secondaries join in arches near margin.' },
      'festooned-brochidodromous': { def: 'Loops with extra outer loops.' },
      eucamptodromous: { def: 'Secondaries curve up and fade, not joining.' },
      cladodromous: { def: 'Secondaries branch freely near margin.' },
      reticulodromous: { def: 'Secondaries lose identity in a reticulum.' },
      parallelodromous: { def: 'Secondaries parallel to primaries (monocot).' },
      none: { def: 'No distinct secondaries.' },
    },
  },

  tertiary: {
    label: 'Tertiary venation',
    terms: {
      'opposite-percurrent': { def: 'Tertiaries cross between secondaries without offset.' },
      'alternate-percurrent': { def: 'Tertiaries cross with an offset.' },
      'mixed-percurrent': { def: 'Mix of opposite and alternate.' },
      reticulate: { def: 'Tertiaries form an irregular net.' },
      ramified: { def: 'Tertiaries branch freely.' },
      transverse: { def: 'Short cross-veins between parallel veins.' },
      none: { def: 'No tertiaries visible.' },
    },
  },

  areoles: {
    label: 'Areoles (4th+)',
    terms: {
      'well-developed': { def: 'Small regular areoles with veinlets.', spacing: 0.014 },
      moderate: { def: 'Medium irregular areoles.', spacing: 0.02 },
      poor: { def: 'Large, incomplete areoles.', spacing: 0.032 },
      none: { def: 'No higher-order venation drawn.' },
    },
  },

  marginalVein: {
    label: 'Marginal vein',
    terms: {
      none: { def: 'No marginal vein.' },
      fimbrial: { def: 'Vein runs along the margin.', offset: 0.004 },
      intramarginal: { def: 'Vein parallel to margin, set inward.', offset: 0.015 },
    },
  },

  phyllotaxis: {
    label: 'Arrangement on stem',
    terms: {
      alternate: { def: 'One leaf per node, spiral (137.5°).' },
      distichous: { def: 'Alternate in two ranks.' },
      opposite: { def: 'Two leaves per node.' },
      decussate: { def: 'Opposite pairs rotated 90°.' },
      whorled: { def: '3+ leaves per node.' },
      rosulate: { def: 'Basal rosette.' },
      fascicled: { def: 'Clustered bundles (spur shoots, fascicles).' },
    },
  },
};

// Every term from the Wikipedia glossary → [category, id].
export const GLOSSARY = {
  structure: ['bifoliolate', 'geminate', 'jugate', 'bigeminate', 'bipinnate', 'biternate', 'imparipinnate', 'odd-pinnate', 'paripinnate', 'even-pinnate', 'palmately compound', 'simple', 'ternate', 'trifoliate', 'trifoliolate', 'tripinnate', 'unifoliate', 'digitate'],
  shape: ['acicular', 'acuminate', 'acute', 'apiculate', 'aristate', 'asymmetrical', 'attenuate', 'auriculate', 'caudate', 'cirrate', 'cordate', 'cordiform', 'cuneate', 'cuneiform', 'cuspidate', 'deltoid', 'deltate', 'digitate', 'ecirrate', 'elliptic', 'emarginate', 'ensiform', 'falcate', 'fenestrate', 'filiform', 'flabellate', 'hastate', 'laciniate', 'laminar', 'lanceolate', 'linear', 'lobed', 'lorate', 'lyrate', 'mucronate', 'multifid', 'obcordate', 'oblanceolate', 'oblique', 'oblong', 'obovate', 'obtrullate', 'obtuse', 'orbicular', 'ovate', 'palmate', 'palmately lobed', 'palmatifid', 'palmatipartite', 'palmatisect', 'pandurate', 'pedate', 'peltate', 'perfoliate', 'perforate', 'pinnately lobed', 'pinnatifid', 'pinnatipartite', 'pinnatisect', 'reniform', 'retuse', 'rhomboid', 'rhombic', 'rounded', 'semiterete', 'sagittate', 'spatulate', 'spear-shaped', 'subobtuse', 'subulate', 'terete', 'trullate', 'truncate', 'undulate', 'unifoliate'],
  margin: ['entire', 'ciliate', 'crenate', 'crenulate', 'crisped', 'dentate', 'denticulate', 'doubly serrate', 'serrate', 'serrulate', 'sinuate', 'lobate', 'undulate', 'spiny', 'pungent'],
  folding: ['carinate', 'keeled', 'conduplicate', 'cucullate', 'involute', 'plicate', 'reduplicate', 'revolute', 'supervolute'],
};

const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, '-');

// Find term by id or alias inside one category.
export function findTerm(category, term) {
  const cat = TRAITS[category];
  if (!cat || term == null) return null;
  const n = norm(term);
  for (const [id, t] of Object.entries(cat.terms)) {
    if (norm(id) === n || (t.aliases || []).some((a) => norm(a) === n)) return { id, ...t };
  }
  return null;
}

// Find a glossary word anywhere; returns all matching [category, id].
export function lookup(word) {
  const hits = [];
  for (const cat of Object.keys(TRAITS)) {
    const t = findTerm(cat, word);
    if (t) hits.push([cat, t.id]);
  }
  return hits;
}

// Parse a loose term list ("ovate, serrate, acuminate, pinnate") into a trait object.
// Ambiguous words resolve by category priority.
const PRIORITY = ['structure', 'shape', 'lobation', 'margin', 'apex', 'base', 'primary', 'secondary', 'tertiary', 'attachment', 'surface', 'form3d', 'folding', 'symmetry', 'phyllotaxis', 'plantGroup', 'areoles', 'marginalVein'];
export function parseTraitList(list) {
  const out = {};
  const words = Array.isArray(list) ? list : String(list).split(/[,;]+/);
  for (let w of words) {
    w = w.trim();
    if (!w) continue;
    const m = w.match(/^([a-zA-Z0-9]+)\s*[:=]\s*(.+)$/);
    if (m && TRAITS[m[1]]) { const t = findTerm(m[1], m[2]); if (t) out[m[1]] = t.id; continue; }
    const hits = lookup(w);
    if (!hits.length) continue;
    hits.sort((a, b) => PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
    // Prefer a category not yet filled (e.g. "acute" → apex first, then base).
    const free = hits.find(([c]) => !(c in out)) || hits[0];
    if (free[0] === 'margin' && out.margin) out.marginMods = [...(out.marginMods || []), free[1]];
    else out[free[0]] = free[1];
  }
  return out;
}

export function listTerms() {
  return Object.fromEntries(Object.entries(TRAITS).map(([k, v]) => [k, { label: v.label, terms: Object.fromEntries(Object.entries(v.terms).map(([id, t]) => [id, t.def])) }]));
}
