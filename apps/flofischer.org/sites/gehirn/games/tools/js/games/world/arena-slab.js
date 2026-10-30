/** Arena ground as a slab: a flat playfield with a thick lip, a layered cliff side that tapers into a tip, and small
 * islets beyond it. Pure geometry (no assets), vertex-coloured, finite and deterministic per world and seed. */
import { THREE } from '../three-kit.js';
import { createNoise } from './noise.js';

export const SLAB_PAD = 10;
const TAU = Math.PI * 2;

/** lip: grass/sand/snow/ash on top and its underside; rock: the cliff strata; top: ground colour of an islet cap. */
export const SLAB_PALETTE = [
  { top: 0x6fbf3a, lip: 0x7ed03a, lipSide: 0x6a8f2e, earth: 0x7a5230, rock: [0x8f8a80, 0x6f6a66], cloud: 0xffffff },
  { top: 0xe9c882, lip: 0xf0cf8c, lipSide: 0xd49a58, earth: 0xb8743c, rock: [0xd9a36a, 0xa86a3e], cloud: 0xfff1da },
  { top: 0xeef6fc, lip: 0xffffff, lipSide: 0xcfe3f5, earth: 0x7096c4, rock: [0xb9d5ee, 0x8fb0d4], cloud: 0xf4faff },
  { top: 0x5a3f48, lip: 0x8a5a52, lipSide: 0x4e3238, earth: 0x2e2028, rock: [0x4a3038, 0x261a22], cloud: 0x8f6a72 },
];

/** Outline radius at an angle: three soft lobes plus a little finer wobble, trimmed towards the camera. */
export function slabRadius(theta, S, seed = 0) {
  // the camera side (+z) is trimmed so the lip and the cliff side show in front of the field
  const front = Math.max(0, Math.sin(theta));
  return S * (1 - 0.115 * front * Math.sqrt(front) + 0.032 * Math.sin(theta * 3 + seed) + 0.018 * Math.sin(theta * 5 + seed * 2.3) + 0.008 * Math.sin(theta * 11 + seed * 1.7));
}

/** Ring profile (offset from the outline radius, height, colour source) from the playfield out and down to the tip. */
function profile(S, c) {
  const k = Math.min(1, S / 30), depth = 5 + 12 * k;
  const rock = (i) => c.rock[i % 2];
  return [
    [-1.4, 0.015, c.lip], [-0.9, 0.075, c.lip], [-0.35, 0.12, c.lip], [0.05, 0.07, c.lip], [0.24, -0.14, c.lip],
    [0.28, -0.14, c.lipSide], [0.3, -0.46, c.lipSide], [0.02, -0.5, c.earth],
    [-0.2, -1.9 * k - 0.4, c.earth], [-0.25, -1.9 * k - 0.4, rock(0)],
    [-0.7 * k - 0.3, -0.34 * depth, rock(0)], [-0.8 * k - 0.3, -0.34 * depth, rock(1)],
    [-2.6 * k - 0.4, -0.55 * depth, rock(1)], [-2.7 * k - 0.4, -0.55 * depth, rock(0)],
    [-S * 0.42, -0.78 * depth, rock(0)], [-S * 0.43, -0.78 * depth, rock(1)],
    [-S * 0.82, -depth, rock(1)],
  ];
}

/**
 * Slab rim (lip + side + tip) as one indexed geometry. With `cap` the top surface is included (islets).
 * `outline(theta)` gives the radius; the cliff side gets lobed noise growing with depth so it reads as rock.
 */
export function slabGeometry(world, S, { seed = 1, segments = 96, cap = false } = {}) {
  const c = SLAB_PALETTE[world], noise = createNoise(seed + world * 13), rings = profile(S, c);
  const colour = (hex) => new THREE.Color(hex);
  const P = [], C = [], I = [], ringCount = rings.length + (cap ? 1 : 0), tip = rings.at(-1)[1];
  const rowOf = (ring, i) => {
    const [dr, y, src] = ring, col = colour(src);
    const strata = y < -0.6 ? 0.9 + 0.1 * Math.sin(y * 2.7 + i) : 1;
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * TAU, depth = Math.max(0, -y) / Math.max(1, -tip);
      const wob = 1 + depth * 0.14 * noise.n2(Math.cos(theta) * 2.2 + y * 0.3, Math.sin(theta) * 2.2 - y * 0.2);
      const r = Math.max(0, slabRadius(theta, S, seed) + dr * (dr < 0 ? wob : 1) + (dr < 0 ? depth * 0.5 * noise.n2(theta * 1.7, y * 0.4) : 0));
      const shade = strata * (0.92 + 0.08 * noise.n2(theta * 4, y * 1.3));
      P.push(Math.cos(theta) * r, y, Math.sin(theta) * r); C.push(col.r * shade, col.g * shade, col.b * shade);
    }
  };
  if (cap) rowOf([-S, 0.015, c.top], 0);
  rings.forEach((ring, i) => rowOf(ring, i));
  for (let i = 0; i + 1 < ringCount; i++) for (let j = 0; j < segments; j++) {
    const a = i * segments + j, b = i * segments + (j + 1) % segments, d = (i + 1) * segments + j, e = (i + 1) * segments + (j + 1) % segments;
    I.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/** The textured playfield: a disc up to the lip, uv in world metres / 160 so the ground tile keeps its scale. */
export function slabGround(S, { seed = 1, segments = 96, rings = 24 } = {}) {
  const P = [], N = [], UV = [], I = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < segments; j++) {
    const theta = (j / segments) * TAU, r = i === 0 ? 0 : (i / rings) * (slabRadius(theta, S, seed) - 1.4), x = Math.cos(theta) * r, z = Math.sin(theta) * r;
    P.push(x, 0, z); N.push(0, 1, 0); UV.push(x / 160 + 0.5, z / 160 + 0.5);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
    const a = i * segments + j, b = i * segments + (j + 1) % segments, d = (i + 1) * segments + j, e = (i + 1) * segments + (j + 1) % segments;
    I.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I); g.computeBoundingSphere();
  return g;
}

/** Islets and cloud banks around the slab: deterministic positions outside the slab, none overlapping. */
export function islandLayout(world, S, seed = 1) {
  const noise = createNoise(seed + 5 + world), out = [];
  const ring = [[0.32, 1.45, 4.2], [0.9, 1.7, 3.2], [1.5, 1.62, 5.0], [2.2, 1.9, 3.0], [3.1, 1.55, 3.6], [3.9, 1.75, 4.4], [4.7, 1.6, 2.8], [5.5, 1.85, 3.8]];
  ring.forEach(([a, d, r], k) => {
    const theta = a + 0.4 * noise.n2(k, seed), dist = S * d + 2 * noise.n2(k * 3, 1);
    out.push({ x: Math.cos(theta) * dist, z: Math.sin(theta) * dist, y: -2.5 - 3.5 * (k % 3), radius: r, seed: seed + k });
  });
  return out;
}
