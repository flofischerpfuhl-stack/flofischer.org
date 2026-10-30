/**
 * A distant island as a few hundred triangles: stepped, wobbly slabs with a thick lip and an earth side, a handful of trees or
 * a volcano. The overworld shows it for every island that is not the one the player stands on; the authored region and the
 * detailed terrain take over only on approach. No model files, no region data: it builds in about a millisecond.
 */
import { THREE as T } from '../three-kit.js';
import { Batch, mtx, rng, createNoise } from './decor.js';
import { BIOMES } from './island-terrain.js';
import { SEA_Y } from './sea.js';

const SEGMENTS = 22, TREE = { meadow: '#4aa534', sand: '#7fae45', snow: '#3f7f77', basalt: '#4b4763', stone: '#4c8a56' };

/** Cylinder whose radius wobbles with the angle (the same wobble for rim and cap, so lip and side stay aligned). */
function slab(radius, height, wobble, phase, amount = 0.14) {
  const g = new T.CylinderGeometry(radius, radius * 1.04, height, SEGMENTS, 1);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), a = Math.atan2(z, x), k = 1 + amount * wobble(Math.cos(a) * 1.7 + phase, Math.sin(a) * 1.7 + phase * 0.7);
    P.setX(i, x * k); P.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * radius: outer radius of the beach in metres (the full island is about 5 % bigger). Returns { group, radius, landRadius, shoreTile, release }.
 * shoreTile is a square Uint8 grid of shore distances for the sea (0 land, 255 open water), cell metres wide, centred on the island.
 */
export function createIslandSilhouette({ biome = 'meadow', radius = 36, seed = 1 } = {}) {
  const B = BIOMES[biome] ?? BIOMES.meadow, rand = rng(seed * 53 + 9), noise = createNoise(seed + 3);
  const wobble = (x, y) => noise.fbm2(x, y, 2);
  const group = new T.Group(); group.name = `Silhouette_${biome}`;
  const earth = new Batch(), grass = new Batch(), props = new Batch();
  const col = (hex, k = 1) => new T.Color(hex).multiplyScalar(k);
  const tier = (r, y0, y1, ox, oz, phase) => {
    const h = y1 - y0;
    earth.add(slab(r, h, wobble, phase), mtx([ox, y0 + h / 2, oz]), col(B.earth[0]), (i, x, y, z, nx, ny, nz, c) => { c.multiplyScalar(0.8 + 0.25 * Math.max(0, Math.min(1, (y - y0) / h))); });
    grass.add(slab(r * 1.01, 0.5, wobble, phase), mtx([ox, y1 - 0.15, oz]), col(B.lip));
    grass.add(slab(r * 0.84, 0.52, wobble, phase + 0.3, 0.1), mtx([ox, y1 - 0.12, oz]), col(B.top[0]));
  };
  // beach and the three plateaus: wide and low, a smaller one to the back, a small crown
  earth.add(slab(radius, 1.4, wobble, 0.2, 0.09), mtx([0, SEA_Y - 0.4, 0]), col(B.sand));
  tier(radius * 0.82, -1.6, 1.35, 0, 0, 0.9);
  const back = rand() * 6.28, bx = Math.cos(back) * radius * 0.2, bz = Math.sin(back) * radius * 0.2;
  tier(radius * 0.55, 1.2, 2.9, bx, bz, 2.1);
  tier(radius * 0.3, 2.7, 4.3, bx * 1.4, bz * 1.4, 3.4);
  const top = [bx * 1.4, 4.3, bz * 1.4];
  if (biome === 'basalt') {
    const cone = new T.ConeGeometry(radius * 0.26, 10, 14, 1); cone.translate(0, 5, 0);
    props.add(cone, mtx([top[0], top[1] - 0.2, top[2]]), col('#4a4560'), (i, x, y, z, nx, ny, nz, c) => { if (y > top[1] + 8.6) c.set('#ff7a2e'); });
  }
  const tree = new T.ConeGeometry(1, 2.6, 7, 1); tree.translate(0, 1.3, 0);
  const crown = new T.IcosahedronGeometry(1, 0); crown.translate(0, 1.4, 0);
  const rock = new T.IcosahedronGeometry(1, 0);
  const count = biome === 'basalt' ? 7 : biome === 'sand' ? 8 : 15;
  for (let n = 0; n < count; n++) {
    const a = rand() * 6.28, d = Math.sqrt(rand()) * radius * 0.7, x = Math.cos(a) * d, z = Math.sin(a) * d, onCrown = Math.hypot(x - top[0], z - top[2]) < radius * 0.26, onBack = Math.hypot(x - bx, z - bz) < radius * 0.5;
    const y = onCrown ? 4.3 : onBack ? 2.9 : 1.35, s = (0.9 + rand() * 0.8) * (biome === 'snow' ? 1.3 : 1);
    if (biome === 'basalt' || (biome === 'stone' && rand() < 0.4)) props.add(rock, mtx([x, y, z], [0, rand() * 6, 0], [s * 1.2, s * 0.8, s * 1.2]), col(biome === 'basalt' ? '#6f6a86' : '#8a96a4'));
    else if (biome === 'meadow' || biome === 'sand') props.add(crown, mtx([x, y + (biome === 'sand' ? 1.6 : 0), z], [0, 0, 0], biome === 'sand' ? [0.9, 0.5, 0.9] : s * 1.1), col(TREE[biome], 0.9 + rand() * 0.2));
    else props.add(tree, mtx([x, y, z], [0, 0, 0], [s * 0.9, s * 1.5, s * 0.9]), col(TREE[biome], 0.9 + rand() * 0.2));
  }
  const geometries = [], materials = [];
  for (const [batch, name] of [[earth, 'SilhouetteEarth'], [grass, 'SilhouetteGrass'], [props, 'SilhouetteProps']]) {
    if (batch.empty) continue;
    const g = batch.geometry(), m = new T.MeshLambertMaterial({ vertexColors: true }); geometries.push(g); materials.push(m);
    const mesh = new T.Mesh(g, m); mesh.name = name; group.add(mesh);
  }
  // shore distances for the sea: a little smaller than the full island's land so the real terrain always wins
  const cell = 2, half = Math.ceil((radius + 14) / cell), n = half * 2, tile = new Uint8Array(n * n), landRadius = radius * 0.86;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i - half + 0.5) * cell, z = (j - half + 0.5) * cell, a = Math.atan2(z, x), r = landRadius * (1 + 0.09 * wobble(Math.cos(a) * 1.7 + 0.2, Math.sin(a) * 1.7 + 0.14)), d = Math.hypot(x, z) - r;
    tile[j * n + i] = d <= 0 ? 0 : Math.min(255, Math.round((d / 12) * 255));
  }
  return {
    group, radius, landRadius, shoreTile: { data: tile, size: n, cell, half },
    release() { group.removeFromParent(); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}
