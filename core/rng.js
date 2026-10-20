// Seeded PRNG. Same (key, seed) → same leaf, every platform.
export function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

export function makeRng(seed, key = '') {
  let a = (hashString(String(key)) ^ (Number(seed) * 2654435761)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal: (mu = 0, sd = 1) => {
      let u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // Sample a param given [mean, sd] or a plain number; clamp to optional [lo, hi].
    sample: (spec, lo = -Infinity, hi = Infinity) => {
      if (Array.isArray(spec)) {
        const [m, s] = spec;
        const z = Math.max(-2, Math.min(2, rng.normal(0, 1)));
        return Math.min(hi, Math.max(lo, m + z * (s || 0)));
      }
      return spec;
    },
    fork: (k) => makeRng(Math.floor(next() * 1e9), key + '/' + k),
  };
  return rng;
}
