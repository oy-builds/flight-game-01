// Tern Island: the heightfield, the airfield plateau, the runway, and the
// landmarks a pilot steers by — the lighthouse, the village, the lake and
// the mountain spine. Everything the renderer draws and everything the
// flight model collides with reads its heights from heightAt().
import { RINGS, RUNWAY, WORLD } from './config.js';
import { clamp, fbm, hash2, ridged, smoothstep } from './noise.js';

const SEED = 20261126;

// The mountain spine runs diagonally across the north-west of the island.
const PEAK_X = -520;
const PEAK_Z = -480;

// A crater lake sits in the hills south-east of the field.
const LAKE_X = 560;
const LAKE_Z = 540;
const LAKE_R = 210;
const LAKE_Y = 30; // water level

/** Distance from (x, z) to the runway centreline, in metres. */
export function runwayDistance(x, z) {
  const dx = x - RUNWAY.centreX;
  const dz = z - RUNWAY.centreZ;
  // Runway runs along x (heading 09/27).
  const along = Math.abs(dx);
  const across = Math.abs(dz);
  if (along <= RUNWAY.length / 2) return across;
  const ex = along - RUNWAY.length / 2;
  return Math.hypot(ex, across);
}

/** Is (x, z) on the paved runway strip? */
export function onRunway(x, z) {
  const dx = Math.abs(x - RUNWAY.centreX);
  const dz = Math.abs(z - RUNWAY.centreZ);
  return dx <= RUNWAY.length / 2 && dz <= RUNWAY.width / 2;
}

/** Ground height in metres at world (x, z). Sea is 0; the airfield is a plateau. */
export function heightAt(x, z) {
  const r = Math.hypot(x, z) / WORLD.islandRadius;
  // Island falloff: full height inland, sinking to the sea at the shore.
  const falloff = smoothstep(1.05, 0.25, r);
  // Rolling hills: noise mapped to 0..1 so the island always has relief,
  // never a flat pancake where the noise happens to run negative.
  const n1 = fbm(x + 31, z - 17, SEED) * 0.5 + 0.5;
  const n2 = fbm(x * 1.7, z * 1.7, SEED + 3) * 0.5 + 0.5;
  let h = (10 + 55 * n1 + 25 * n2) * falloff;
  // Mountain spine.
  const peakD = Math.hypot(x - PEAK_X, z - PEAK_Z) / 420;
  h += 150 * ridged(x * 0.9 + 11, z * 0.9 - 5, SEED + 9) * Math.exp(-peakD * peakD * 1.6) * falloff;
  h = Math.max(h, 2.5 * falloff);
  // Crater lake bowl: the floor drops to just under the water level.
  const lakeD = Math.hypot(x - LAKE_X, z - LAKE_Z) / LAKE_R;
  if (lakeD < 1.4) {
    const bowl = smoothstep(1.4, 0.55, lakeD);
    h = h * (1 - bowl) + (LAKE_Y - 4) * bowl;
  }
  // Airfield plateau: flatten everything near the runway.
  const rd = runwayDistance(x, z);
  const flat = smoothstep(240, 70, rd);
  h = h * (1 - flat) + WORLD.plateauHeight * flat;
  return h;
}

/** Colour of the ground at (x, z, height), as [r, g, b] in 0..1. */
export function groundColour(x, z, h) {
  const r = Math.hypot(x, z) / WORLD.islandRadius;
  const n = fbm(x * 2.3, z * 2.3, SEED + 21);
  // Beach sand at the waterline.
  if (h < 4.5) return [0.86, 0.78, 0.58];
  // Lake shore.
  const lakeD = Math.hypot(x - LAKE_X, z - LAKE_Z);
  if (lakeD < LAKE_R * 1.05 && h < LAKE_Y + 6) return [0.78, 0.72, 0.52];
  // Rock and snow high up.
  if (h > 150) return [0.82, 0.83, 0.86];
  if (h > 105) return [0.52, 0.48, 0.44];
  // Grass, two tones mixed by noise so fields read as fields.
  if (n > 0.12) return [0.38, 0.62, 0.3];
  if (n < -0.18) return [0.48, 0.66, 0.34];
  return [0.42, 0.64, 0.32];
}

/**
 * Build the terrain mesh: positions, per-vertex colours and triangle indices.
 * The grid is WORLD.grid cells across WORLD.size metres.
 */
export function buildTerrainMesh() {
  const cells = WORLD.grid;
  const size = WORLD.size;
  const step = size / cells;
  const vertsPerSide = cells + 1;
  const positions = new Float32Array(vertsPerSide * vertsPerSide * 3);
  const colours = new Float32Array(vertsPerSide * vertsPerSide * 3);
  const indices = new Uint16Array(cells * cells * 6); // 111x111 verts < 65536: WebGL1-safe
  let vi = 0;
  for (let iz = 0; iz < vertsPerSide; iz += 1) {
    for (let ix = 0; ix < vertsPerSide; ix += 1) {
      const x = -size / 2 + ix * step;
      const z = -size / 2 + iz * step;
      const h = heightAt(x, z);
      positions[vi * 3] = x;
      positions[vi * 3 + 1] = h;
      positions[vi * 3 + 2] = z;
      const c = groundColour(x, z, h);
      colours[vi * 3] = c[0];
      colours[vi * 3 + 1] = c[1];
      colours[vi * 3 + 2] = c[2];
      vi += 1;
    }
  }
  let ii = 0;
  for (let iz = 0; iz < cells; iz += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const a = iz * vertsPerSide + ix;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      indices[ii] = a; indices[ii + 1] = c; indices[ii + 2] = b;
      indices[ii + 3] = b; indices[ii + 4] = c; indices[ii + 5] = d;
      ii += 6;
    }
  }
  return { positions, colours, indices };
}

/** The ring course, with a flown flag per ring (cloned fresh each sortie). */
export function freshRings() {
  return RINGS.map((ring) => ({ ...ring, flown: false }));
}

/** The lighthouse beacon the Island Hop sortie rounds. */
export const BEACON = { x: -980, y: 46, z: 620 };

/** Landmark spots for the village, hangars and trees. */
export const VILLAGE = { x: 180, z: 260, houses: 14 };
export const LIGHTHOUSE = { x: -980, z: 620 };
export const HANGARS = [
  { x: -60, z: 90, w: 26, d: 18, h: 9 },
  { x: -110, z: 90, w: 22, d: 16, h: 8 },
];

/** Deterministic tree positions (avoiding the runway and the village). */
export function treePositions(count) {
  const trees = [];
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 40) {
    tries += 1;
    const rx = hash2(tries, 1, SEED + 31) * 2 - 1;
    const rz = hash2(tries, 2, SEED + 31) * 2 - 1;
    const x = rx * 1050;
    const z = rz * 1050;
    if (runwayDistance(x, z) < 120) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 120) continue;
    const h = heightAt(x, z);
    if (h < 6 || h > 110) continue;
    trees.push({ x, z, y: h, s: 0.8 + hash2(tries, 3, SEED + 31) * 0.7 });
    placed += 1;
  }
  return trees;
}

export { LAKE_X, LAKE_Z, LAKE_R, LAKE_Y, PEAK_X, PEAK_Z };
