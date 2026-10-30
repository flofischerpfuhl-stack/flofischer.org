/**
 * A distant island as a few hundred triangles: a plateau with a tall banded cliff side and a slim grass lip, a smaller plateau
 * behind it, and one big landmark per biome (windmill, mesa, snow peaks, volcano, fortress) from the existing model library.
 * The overworld shows it for every island that is not the one the player stands on; the authored region and the detailed
 * terrain take over only on approach. The relief builds in about a millisecond; the landmark models arrive after the first frame.
 */
import { THREE as T } from '../three-kit.js';
import { loadModel } from '../models.js';
import { Batch, mtx, rng, createNoise, modelInstances } from './decor.js';
import { BIOMES } from './island-terrain.js';
import { SEA_Y } from './sea.js';

const SEGMENTS = 30;
/** Models per biome: landmark (placed on the high ground), scatter (around the plateaus), counts and scale in metres per model unit. */
const KIT = {
  meadow: { landmark: [['WINDMILL', 1, 8.5], ['COTTAGE', 2, 5.5]], scatter: ['TREE_ROUND', 15, 3.6] },
  sand: { landmark: [['MESA', 3, 6.5]], scatter: ['PALM', 9, 4.8], extra: ['CACTUS', 5, 3.6] },
  snow: { landmark: [], scatter: ['PINE_SNOW', 16, 4.6], extra: ['SNOW_ROCK', 5, 5] },
  basalt: { landmark: [['VOLCANO', 1, 8.2]], scatter: ['ROCK', 9, 5] },
  stone: { landmark: [], scatter: ['PINE_SNOW', 9, 4.4] },
};

/** Cliff-sided plateau: radius wobbles with the angle and, a little, with height so the side reads as rock rather than a can. */
function cliff(radius, height, wobble, phase, { flare = 1.05, amount = 0.13 } = {}) {
  const g = new T.CylinderGeometry(radius * 0.97, radius * flare, height, SEGMENTS, 3);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(z, x);
    const k = 1 + amount * wobble(Math.cos(a) * 1.7 + phase, Math.sin(a) * 1.7 + phase * 0.7) + 0.035 * Math.sin(a * 11 + phase * 3 + y * 0.7);
    P.setX(i, x * k); P.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Flat disc with the same wobble, for the grass top. */
function cap(radius, height, wobble, phase, amount = 0.13) {
  const g = new T.CylinderGeometry(radius * 0.97, radius, height, SEGMENTS, 1);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), a = Math.atan2(z, x), k = 1 + amount * wobble(Math.cos(a) * 1.7 + phase, Math.sin(a) * 1.7 + phase * 0.7) + 0.035 * Math.sin(a * 11 + phase * 3);
    P.setX(i, x * k); P.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * radius: outer radius of the beach in metres (the full island is about 5 % bigger). Returns { group, radius, landRadius, shoreTile, ready, release }.
 * shoreTile is a square Uint8 grid of shore distances for the sea (0 land, 255 open water), cell metres wide, centred on the island.
 * ready resolves when the landmark models are in the group (the caller restyles the group then).
 */
export function createIslandSilhouette({ biome = 'meadow', radius = 36, seed = 1 } = {}) {
  const B = BIOMES[biome] ?? BIOMES.meadow, rand = rng(seed * 53 + 9), noise = createNoise(seed + 3);
  const wobble = (x, y) => noise.fbm2(x, y, 2), patch = createNoise(seed + 41);
  const group = new T.Group(); group.name = `Silhouette_${biome}`;
  const earth = new Batch(), grass = new Batch(), props = new Batch();
  const col = (hex, k = 1) => new T.Color(hex).multiplyScalar(k);
  const rockLine = (y0, y1) => (i, x, y, z, nx, ny, nz, c) => {
    const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0))), band = 0.86 + 0.14 * Math.sign(Math.sin(y * 1.35 + seed));
    c.lerp(col(B.earth[1]), 1 - t).multiplyScalar(band * (0.78 + 0.3 * t));
  };
  // plateau: cliff side (earth, banded, darker towards the waterline), slim lip, patchy top
  const tier = (r, y0, y1, ox, oz, phase) => {
    const h = y1 - y0;
    earth.add(cliff(r, h, wobble, phase), mtx([ox, y0 + h / 2, oz]), col(B.earth[0]), rockLine(y0, y1));
    grass.add(cap(r * 1.025, 0.8, wobble, phase), mtx([ox, y1 - 0.2, oz]), col(B.lip));
    grass.add(cap(r * 0.93, 0.85, wobble, phase + 0.05, 0.12), mtx([ox, y1 - 0.12, oz]), col(B.top[0]), (i, x, y, z, nx, ny, nz, c) => { c.lerp(col(B.top[1]), 0.5 + 0.5 * patch.fbm2(x * 0.06, z * 0.06, 2)); });
  };
  const back = rand() * 6.28 + Math.PI * 1.25, bx = Math.cos(back) * radius * 0.22, bz = Math.sin(back) * radius * 0.22;
  const baseTop = 3.4, midTop = 7.2, crownTop = 10.4;
  earth.add(cliff(radius, 1.8, wobble, 0.2, { flare: 1.02, amount: 0.09 }), mtx([0, SEA_Y - 0.6, 0]), col(B.sand));
  tier(radius * 0.84, -3.2, baseTop, 0, 0, 0.9);
  tier(radius * 0.52, baseTop - 0.3, midTop, bx, bz, 2.1);
  const crown = biome === 'basalt' || biome === 'sand' ? null : [bx * 1.5, bz * 1.5];
  if (crown) tier(radius * 0.28, midTop - 0.3, crownTop, crown[0], crown[1], 3.4);
  const heightAt = (x, z) => crown && Math.hypot(x - crown[0], z - crown[1]) < radius * 0.26 ? crownTop : Math.hypot(x - bx, z - bz) < radius * 0.5 ? midTop : baseTop;
  const top = crown ? [crown[0], crownTop, crown[1]] : [bx, midTop, bz];
  const part = (geo, m, color, shade) => props.add(geo, m, color, shade);
  if (biome === 'snow') { // peaks with white caps behind a few pines
    for (const [ox, oz, r, h] of [[0, 0, 0.17, 24], [0.5, 0.25, 0.12, 15], [-0.4, 0.3, 0.1, 12]]) {
      const cone = new T.ConeGeometry(radius * r, h, 9, 2); cone.translate(0, h / 2, 0);
      part(cone, mtx([top[0] + ox * radius * 0.5, top[1] - 0.3, top[2] + oz * radius * 0.5], [0, rand() * 6, 0]), col('#8296b4'), (i, x, y, z, nx, ny, nz, c) => { const k = (y - top[1]) / h; if (k > 0.42) c.set('#f7fbff'); else c.multiplyScalar(0.9 + 0.2 * Math.max(0, ny)); });
    }
  }
  if (biome === 'stone') fortress(part, top, radius, col);
  const geometries = [], materials = [];
  for (const [batch, name] of [[earth, 'SilhouetteEarth'], [grass, 'SilhouetteGrass'], [props, 'SilhouetteProps']]) {
    if (batch.empty) continue;
    const g = batch.geometry(), m = new T.MeshLambertMaterial({ vertexColors: true }); geometries.push(g); materials.push(m);
    const mesh = new T.Mesh(g, m); mesh.name = name; group.add(mesh);
  }
  // landmark and scatter models, merged per model into instanced meshes once they have loaded
  const kit = KIT[biome] ?? KIT.meadow, jobs = [], spot = (min, max) => {
    for (let n = 0; n < 30; n++) {
      const a = rand() * 6.28, d = (min + (max - min) * Math.sqrt(rand())) * radius, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - top[0], z - top[2]) > radius * 0.2 || n > 24) return [x, heightAt(x, z), z];
    }
  };
  for (const [name, count, scale] of kit.landmark) {
    const list = [];
    for (let k = 0; k < count; k++) {
      const p = count === 1 ? top : name === 'MESA' ? [bx + Math.cos(k * 2.4 + back) * radius * (0.12 + 0.28 * (k % 2)), baseTop - 0.2 + (k === 0 ? 0 : 0), bz + Math.sin(k * 2.4 + back) * radius * (0.12 + 0.28 * (k % 2))] : spot(0.2, 0.62);
      if (name === 'MESA') p[1] = Math.hypot(p[0] - bx, p[2] - bz) < radius * 0.5 ? midTop - 0.3 : baseTop - 0.3;
      list.push(mtx(p.map((v, i) => (i === 1 ? v - 0.3 : v)), [0, rand() * 6, 0], scale * (count === 1 ? 1 : 0.85 + rand() * 0.3) * (name === 'MESA' ? 0.8 + 0.4 * (k === 0) : 1)));
    }
    jobs.push([name, list]);
  }
  for (const spec of [kit.scatter, kit.extra]) {
    if (!spec) continue;
    const [name, count, scale] = spec, list = [];
    for (let k = 0; k < count; k++) { const p = spot(0.12, 0.74); list.push(mtx(p, [0, rand() * 6, 0], scale * (0.75 + rand() * 0.6))); }
    jobs.push([name, list]);
  }
  const instances = [];
  const ready = Promise.all(jobs.map(([name]) => loadModel(name, 'lo'))).then((models) => {
    if (group.userData.released) return;
    jobs.forEach(([, list], k) => {
      const g = modelInstances(models[k], list);
      g.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) { const old = o.material; o.material = new T.MeshLambertMaterial({ vertexColors: true }); old.dispose(); } if (o.material) materials.push(o.material); });
      instances.push(g); group.add(g);
    });
  }).catch(() => {});
  // shore distances for the sea: a little smaller than the full island's land so the real terrain always wins
  const cell = 2, half = Math.ceil((radius + 14) / cell), n = half * 2, tile = new Uint8Array(n * n), landRadius = radius * 0.86;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i - half + 0.5) * cell, z = (j - half + 0.5) * cell, a = Math.atan2(z, x), r = landRadius * (1 + 0.09 * wobble(Math.cos(a) * 1.7 + 0.2, Math.sin(a) * 1.7 + 0.14)), d = Math.hypot(x, z) - r;
    tile[j * n + i] = d <= 0 ? 0 : Math.min(255, Math.round((d / 12) * 255));
  }
  return {
    group, radius, landRadius, ready, shoreTile: { data: tile, size: n, cell, half },
    release() { group.userData.released = true; group.removeFromParent(); for (const g of instances) g.traverse((o) => o.isInstancedMesh && o.dispose()); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}

/** The Sturmbastion: keep, four round towers with pointed roofs, a curtain wall and a banner, in vertex colours. */
function fortress(part, top, radius, col) {
  const [x, y, z] = top, wall = col('#a9b4c0'), roof = col('#3f69a8'), dark = col('#6f7d8c');
  const box = new T.BoxGeometry(1, 1, 1), tube = new T.CylinderGeometry(1, 1.08, 1, 12, 1), spire = new T.ConeGeometry(1.25, 1, 12, 1);
  const s = radius * 0.2;
  part(box, mtx([x, y + s * 0.55, z], [0, 0.4, 0], [s * 1.5, s * 1.1, s * 1.5]), wall);
  part(spire, mtx([x, y + s * 1.1 + s * 0.6, z], [0, 0.4, 0], [s * 1.0, s * 1.2, s * 1.0]), roof);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const tx = x + dx * s * 1.6, tz = z + dz * s * 1.6;
    part(tube, mtx([tx, y + s * 0.8, tz], [0, 0, 0], [s * 0.42, s * 1.6, s * 0.42]), wall);
    part(spire, mtx([tx, y + s * 1.6 + s * 0.32, tz], [0, 0, 0], [s * 0.42, s * 0.64, s * 0.42]), roof);
  }
  for (const [ax, az, w, d] of [[0, -1, 3.2, 0.34], [0, 1, 3.2, 0.34], [-1, 0, 0.34, 3.2], [1, 0, 0.34, 3.2]]) part(box, mtx([x + ax * s * 1.6, y + s * 0.3, z + az * s * 1.6], [0, 0, 0], [s * w, s * 0.6, s * d]), dark);
  part(box, mtx([x, y + s * 2.3, z], [0, 0, 0], [0.5, s * 1.2, 0.5]), dark);
  part(box, mtx([x + s * 0.4, y + s * 2.6, z], [0, 0, 0], [s * 0.8, s * 0.5, 0.2]), col('#ffd23f'));
}
