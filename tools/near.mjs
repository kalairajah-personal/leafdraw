// Terms close enough to count as agreement (botanists use them interchangeably for the same leaf).
export const NEAR = [
  ['serrate', 'serrulate', 'dentate', 'denticulate', 'doubly-serrate'], ['crenate', 'crenulate'], ['entire', 'undulate', 'sinuate'],
  ['ovate', 'elliptic', 'oblong'], ['lanceolate', 'oblanceolate', 'linear', 'elliptic'], ['obovate', 'oblanceolate', 'spatulate', 'elliptic'], ['cordate', 'ovate', 'deltoid', 'reniform', 'orbicular'],
  ['acute', 'acuminate', 'cuspidate', 'mucronate'], ['obtuse', 'rounded', 'subobtuse', 'truncate'],
  ['cuneate', 'attenuate', 'acute'], ['rounded', 'obtuse', 'truncate', 'cordate'],
  ['pinnately-lobed', 'pinnatifid', 'pinnatipartite', 'pinnatisect', 'lobed'], ['spiny', 'ciliate'], ['palmately-lobed', 'palmatifid', 'palmatipartite', 'lobed'],
  ['alternate', 'distichous'], ['pinnate-any', 'imparipinnate', 'paripinnate', 'bipinnate'], ['opposite', 'decussate'], ['imparipinnate', 'paripinnate'],
  ['pinnate', 'campylodromous'], ['obcordate', 'cordate', 'orbicular', 'reniform'], ['falcate', 'lanceolate', 'oblong'], ['acicular', 'linear', 'subulate'],
  ['palmate', 'ovate', 'orbicular', 'cordate', 'reniform', 'deltoid'], ['palmately-lobed', 'palmatisect', 'palmatipartite', 'palmatifid'],
  ['lyrate', 'pinnatifid', 'pinnately-lobed'], ['multifid', 'pinnatisect', 'laciniate', 'pinnatipartite'], ['crenate', 'dentate', 'serrate'], ['oblique', 'rounded', 'cordate'], ['obovate', 'oblong'],
];
export const near = (a, b) => a === b || NEAR.some((g) => g.includes(a) && g.includes(b));
