import { clamp, createNoise, smoothstep } from "./utils.js";

// Shared layout of the floating island. Seele occupies x < 0, Gehirn x > 0.
export const RX = 8.15;
export const RZ = 5.72;
export const TOP = 0.7;
export const WATER_Y = TOP - 0.045;

export const POND = { x: -4.3, z: 1.5, rx: 1.62, rz: 0.94 };
export const STREAM_START = 2.05;
export const CHAPEL = { x: -3.35, z: -2.1, rotation: -0.08 };
export const BRIDGE_Z = 3.5;
export const SEELE_SIGN = [-2.9, 4.4];
export const GEHIRN_SIGN = [3.3, 4.4];
export const GROTTO = { x: -6.55, z: -0.35, rotation: 1.2 };
export const WAYSIDE_CROSS = [-1.45, 2.55];

export const JUNGLE_TREES = [
  [-6.35, -2.75, 1.08], [-6.95, 0.95, 0.9], [-5.1, -4.3, 0.83],
  [-1.95, -4.55, 0.78], [-6.75, 3.15, 0.82], [-1.15, -2.55, 0.74],
];
export const PALMS = [[-5.75, 3.5, 0.92, 821], [-0.95, 0.45, 0.72, 833], [-7.25, -1.2, 0.7, 847]];
export const BANANAS = [[-2.05, -0.55], [-5.35, -1.35], [-4.9, 3.95], [-0.9, -4.0], [-7.05, -2.3], [-1.9, 3.6]];

export const PAGODA = { x: 3.65, z: -1.35 };
export const ROAD = { x0: 0.55, x1: 1.95 };
export const TORII_PATH = [[4.75, 4.15], [4.95, 3.1], [4.55, 2.05], [3.85, 1.15], [3.65, 0.25]];
export const SAKURA = [[6.55, 1.05, 0.82, 503], [6.0, 3.25, 0.7, 534], [2.95, 2.55, 0.64, 565], [3.0, -3.95, 0.72, 596], [5.55, 0.75, 0.58, 627]];
export const POLES = [[2.2, 3.85], [2.2, 0.75], [2.2, -1.65]];
export const VENDING = { x: 2.28, z: -2.9 };
export const TOWERS = [
  { x: 5.25, z: -3.55, w: 1.15, d: 0.95, h: 6.2, rotation: 0.05, facade: 0, sign: 0, billboard: true },
  { x: 6.45, z: -2.55, w: 1.0, d: 1.0, h: 4.6, rotation: -0.1, facade: 1, sign: 1 },
  { x: 4.3, z: -4.3, w: 0.85, d: 0.75, h: 3.4, rotation: 0.12, facade: 1, sign: 2 },
  { x: 7.25, z: -1.2, w: 0.7, d: 0.85, h: 3.1, rotation: 0.2, facade: 0 },
  { x: 5.95, z: -1.3, w: 0.72, d: 0.72, h: 3.9, rotation: -0.04, facade: 0, sign: 3 },
  { x: 3.4, z: -4.75, w: 0.7, d: 0.55, h: 2.1, rotation: 0.18, facade: 1 },
];

const noise = createNoise(7);

export function rimFactor(theta) {
  return 1
    + Math.sin(theta * 5) * 0.018
    + Math.sin(theta * 11 + 0.7) * 0.013
    + noise.n2(Math.cos(theta) * 1.4 + 3, Math.sin(theta) * 1.4) * 0.022;
}

export function insideIsland(x, z, margin = 0) {
  const theta = Math.atan2(z / RZ, x / RX);
  const factor = rimFactor(theta);
  const ax = RX * factor - margin;
  const az = RZ * factor - margin;
  return (x * x) / (ax * ax) + (z * z) / (az * az) < 1;
}

/** Distance (world units) from a point to the rim, negative outside. */
export function rimDistance(x, z) {
  const theta = Math.atan2(z / RZ, x / RX);
  const factor = rimFactor(theta);
  const normalized = Math.hypot(x / (RX * factor), z / (RZ * factor));
  return (1 - normalized) * Math.min(RX, RZ) * factor;
}

export function streamCenter(z) {
  const progress = (z - STREAM_START) / 2.9;
  return POND.x + 0.05 + Math.sin(progress * Math.PI * 1.25) * 0.2;
}

export function streamHalfWidth(z) {
  const progress = clamp((z - STREAM_START) / 2.9, 0, 1);
  return 0.4 + Math.sin(progress * Math.PI) * 0.08 - Math.max(0, progress - 0.8) * 0.2;
}

/** Signed distance to the pond + stream (negative inside the water). */
export function waterDistance(x, z) {
  const px = (x - POND.x) / POND.rx;
  const pz = (z - POND.z) / POND.rz;
  const pond = (Math.hypot(px, pz) - 1) * Math.min(POND.rx, POND.rz) * 1.08;
  let stream = Infinity;
  if (z > POND.z) {
    stream = Math.abs(x - streamCenter(z)) - streamHalfWidth(z);
    if (z < STREAM_START) stream += (STREAM_START - z) * 0.6;
  }
  return Math.min(pond, stream);
}

function gaussian(x, z, cx, cz, radius) {
  const dx = x - cx;
  const dz = z - cz;
  return Math.exp(-(dx * dx + dz * dz) / (radius * radius));
}

/** Height of the island top. Gehirn is a flat city plaza, Seele rolls gently. */
export function terrainHeight(x, z) {
  if (x >= 0) return TOP;
  const fromSeam = smoothstep(0.05, 1.2, -x);
  let hill = noise.fbm2(x * 0.3 + 11, z * 0.3 - 4, 3) * 0.24 + 0.05
    + 0.46 * gaussian(x, z, -6.3, -3.3, 2.1)
    + 0.26 * gaussian(x, z, -7.0, 1.7, 1.45)
    + 0.16 * gaussian(x, z, -1.7, -4.2, 1.3);
  const chapelX = (x - CHAPEL.x) / 1.75;
  const chapelZ = (z - (CHAPEL.z - 0.35)) / 2.6;
  const chapelPad = smoothstep(1.25, 0.85, Math.hypot(chapelX, chapelZ));
  hill = hill * (1 - chapelPad) + 0.04 * chapelPad;
  const grottoPad = smoothstep(1.4, 0.7, Math.hypot(x - GROTTO.x, z - GROTTO.z));
  hill = Math.max(hill, 0.18 * grottoPad + hill * (1 - grottoPad));
  const water = waterDistance(x, z);
  hill *= smoothstep(0.02, 0.95, water);
  hill *= smoothstep(0.0, 0.55, rimDistance(x, z)) * 0.7 + 0.3;
  let height = TOP + Math.max(hill, -0.04) * fromSeam;
  if (water < 0.3) height -= smoothstep(0.3, -0.42, water) * 0.26;
  return height;
}

/** Dirt path from the Seele sign to the chapel door. */
export const SEELE_PATH = [
  [-2.95, 4.05], [-2.55, 3.35], [-2.35, 2.55], [-2.28, 1.75], [-2.45, 0.95], [-2.95, 0.35], [-3.35, 0.05],
];

/** Stepping stones from the bridge round the pond to the grotto. */
export const SIDE_PATH = [
  [-3.05, 3.55], [-3.3, 3.5], [-4.95, 3.52], [-5.55, 3.05], [-6.1, 2.35], [-6.35, 1.45], [-6.3, 0.6],
];

export function pathDistance(points, x, z) {
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, az] = points[index];
    const [bx, bz] = points[index + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

export function samplePath(points, t) {
  const lengths = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
    lengths.push(length);
    total += length;
  }
  let distance = clamp(t, 0, 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index] || index === lengths.length - 1) {
      const local = lengths[index] ? distance / lengths[index] : 0;
      const [ax, az] = points[index];
      const [bx, bz] = points[index + 1];
      return { x: ax + (bx - ax) * local, z: az + (bz - az) * local, angle: Math.atan2(bx - ax, bz - az) };
    }
    distance -= lengths[index];
  }
  return { x: points[0][0], z: points[0][1], angle: 0 };
}

