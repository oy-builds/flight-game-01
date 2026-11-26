// Deterministic value noise: the island's hills, ridges and beaches are all
// built from this, so the same seed always grows the same island and the
// screenshots always show the same terrain.
export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Value noise in [-1, 1] at world position (x, z), cell size `cell`. */
export function valueNoise(x, z, cell, seed) {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed) * 2 - 1;
  const b = hash2(ix + 1, iz, seed) * 2 - 1;
  const c = hash2(ix, iz + 1, seed) * 2 - 1;
  const d = hash2(ix + 1, iz + 1, seed) * 2 - 1;
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fz;
}

/** Fractal noise: three octaves of value noise, still in roughly [-1, 1]. */
export function fbm(x, z, seed) {
  return (
    valueNoise(x, z, 420, seed) * 0.55 +
    valueNoise(x, z, 170, seed + 7) * 0.3 +
    valueNoise(x, z, 68, seed + 13) * 0.15
  );
}

/** Ridged noise: sharp crests, good for the mountain spine. */
export function ridged(x, z, seed) {
  const n = fbm(x, z, seed);
  return 1 - Math.abs(n);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep between edges a and b. */
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
