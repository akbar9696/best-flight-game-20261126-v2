// A tiny deterministic generator: the same seed always builds the same valley, the same
// ring course and the same weather, so a screenshot scene can be replayed exactly. The
// 2-D hash beside it places trees, houses and field rows without storing a map.

export function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Deterministic 1-D value noise in [0, 1), smooth between integer points. */
export function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i, seed);
  const b = hash1(i + 1, seed);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/** Deterministic 2-D hash in [0, 1) for a grid cell (cx, cz). */
export function hash2(cx, cz, seed) {
  let h = ((cx * 374761393 + cz * 668265263 + seed * 2246822519) >>> 0);
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash1(i, seed) {
  let h = (i * 374761393 + seed * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
