/**
 * Pip's Tower: one real rock mountain. A single height-and-colour mesh rises from the cloud sea in rock strata (moss at the foot, grey
 * and brown rock, snow near the summit); every region slab sits on its own carved terrace, and a ledge path winds around the flank
 * from one terrace up to the next, with gold stones along it. Pines and boulders stand on the flatter ground.
 */
import { THREE as T } from '../three-kit.js';
import { loadModel } from '../models.js';
import { mtx, rng, createNoise, smoothstep, modelInstances } from './decor.js';
import { BIOMES } from './island-terrain.js';

const CELL = 1.3, STEEP = 0.7, LEDGE = 3.1, LEDGE_FADE = 4.5;
const hex = (s) => new T.Color(s);

export function buildMountain({ layout, biomes, seed = 7 }) {
  const group = new T.Group(); group.name = 'Mountain';
  const { centers, levels, halves, links } = layout, n = centers.length, noise = createNoise(seed + 5), rand = rng(seed * 19 + 2);
  const top = centers[n - 1], baseR = 100, peak = levels[n - 1] - 1.2, pad = 62;
  const xs = centers.map((c) => c[0]), zs = centers.map((c) => c[1]), x0 = Math.min(...xs) - pad, z0 = Math.min(...zs) - pad, nx = Math.ceil((Math.max(...xs) - Math.min(...xs) + 2 * pad) / CELL) + 1, nz = Math.ceil((Math.max(...zs) - Math.min(...zs) + 2 * pad) / CELL) + 1;
  const height = new Float32Array(nx * nz), pathW = new Float32Array(nx * nz), owner = new Int8Array(nx * nz), nearD = new Float32Array(nx * nz), inside = new Uint8Array(nx * nz);
  const crag = biomes.map((b) => ({ top: hex(BIOMES[b].top[0]), earth: hex(BIOMES[b].earth[0]), lip: hex(BIOMES[b].lip) }));
  const paths = links.map((l) => l.path ?? [l.from, l.to]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * CELL, z = z0 + j * CELL, r = Math.hypot(x - top[0], z - top[1]);
    const ridge = 1 - Math.abs(noise.fbm2(x * 0.045, z * 0.045, 3)), crags = noise.fbm2(x * 0.16 + 4, z * 0.16, 3);
    let H = Math.max(0, peak * Math.pow(Math.max(0, 1 - r / baseR), 1.1)) * (0.93 + 0.14 * ridge) + crags * 3.4 * Math.min(1, r / 18) + noise.fbm2(x * 0.03 + 2, z * 0.03, 2) * 5 - 2.5;
    let near = 1e9, own = 0;
    for (let s = 0; s < n; s++) {
      const [cx, cz] = centers[s], [hx, hz] = halves[s], ds = Math.hypot(Math.max(Math.abs(x - cx) - hx, 0), Math.max(Math.abs(z - cz) - hz, 0));
      if (ds < near) { near = ds; own = s; }
      const pedestal = levels[s] - 0.3 - STEEP * ds + crags * 1.8 * Math.min(1, ds / 5);
      const bench = levels[s] - 0.4 - 0.25 * ds, w = 1 - smoothstep(1.5, 11, ds);
      if (H > bench) H = H * (1 - w) + bench * w;
      if (pedestal > H) H = pedestal;
      if (ds < 0.3) { inside[k] = 1; own = s; }
    }
    if (inside[k]) H = levels[own] - 2.4;
    let wbest = 0;
    paths.forEach((path, li) => {
      let d = 1e9, tt = 0, acc = 0, total = 0;
      for (let q = 1; q < path.length; q++) total += Math.hypot(path[q][0] - path[q - 1][0], path[q][1] - path[q - 1][1]);
      for (let q = 1; q < path.length; q++) {
        const ax = path[q - 1][0], az = path[q - 1][1], bx = path[q][0], bz = path[q][1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len))), dist = Math.hypot(x - ax - dx * u, z - az - dz * u);
        if (dist < d) { d = dist; tt = (acc + u * len) / total; } acc += len;
      }
      if (d > LEDGE + LEDGE_FADE) return;
      const a = links[li].a, b = links[li].b, y = levels[a] + (levels[b] - levels[a]) * tt - 0.3, w = 1 - smoothstep(LEDGE, LEDGE + LEDGE_FADE, d), target = y - 0.9 * Math.max(0, d - LEDGE);
      if (!inside[k]) H = H * (1 - w) + target * w;
      if (w > wbest && !inside[k]) { wbest = w; pathW[k] = d; }
    });
    if (!wbest) pathW[k] = 99;
    height[k] = Math.max(H, -8); owner[k] = own; nearD[k] = near;
  }
  const geometry = new T.BufferGeometry(), pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), c = new T.Color(), tmp = new T.Color();
  const rockA = hex('#7b7f88'), rockB = hex('#9a8f84'), rockC = hex('#5e6470'), moss = hex('#6f9a5b'), snow = hex('#f6f9fd'), pathC = hex('#e1d8b8'), pathD = hex('#c9bf9c');
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * CELL, z = z0 + j * CELL, h = height[k];
    pos.set([x, h, z], k * 3);
    const gx = (height[Math.min(nx - 1, i + 1) + j * nx] - height[Math.max(0, i - 1) + j * nx]) / (2 * CELL), gz = (height[i + Math.min(nz - 1, j + 1) * nx] - height[i + Math.max(0, j - 1) * nx]) / (2 * CELL), slope = Math.hypot(gx, gz);
    const strata = 0.5 + 0.5 * Math.sin(h * 0.85 + noise.fbm2(x * 0.1, z * 0.1, 2) * 3.2);
    c.copy(rockA).lerp(rockB, strata * 0.75).lerp(rockC, smoothstep(0.7, 1.5, slope) * 0.55 + 0.15 * (1 - strata));
    const flat = 1 - smoothstep(0.35, 0.9, slope);
    c.lerp(moss, smoothstep(11, 1, h) * 0.85 * (0.3 + 0.7 * flat)); c.lerp(snow, smoothstep(26, 34, h + noise.fbm2(x * 0.08, z * 0.08, 2) * 5) * (0.35 + 0.65 * flat));
    c.lerp(tmp.copy(crag[owner[k]].top), flat * (1 - smoothstep(1.5, 9, nearD[k])) * 0.85);
    const ledge = pathW[k] < LEDGE + 1 ? 1 - smoothstep(1.2, 2.6, pathW[k]) : 0;
    c.lerp(pathD, ledge * 0.85).lerp(pathC, ledge * (pathW[k] < 1.4 ? 0.7 : 0));
    if (inside[k]) c.copy(rockC);
    c.multiplyScalar(0.92 + 0.14 * (noise.fbm2(x * 0.3 + 11, z * 0.3, 2) * 0.5 + 0.5));
    col.set([c.r, c.g, c.b], k * 3);
  }
  const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1; index[q++] = a; index[q++] = d; index[q++] = b; index[q++] = b; index[q++] = d; index[q++] = e; }
  geometry.setAttribute('position', new T.BufferAttribute(pos, 3)); geometry.setAttribute('color', new T.BufferAttribute(col, 3)); geometry.setIndex(new T.BufferAttribute(index, 1)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), mesh = new T.Mesh(geometry, material); mesh.name = 'MountainRock'; mesh.receiveShadow = true; group.add(mesh);
  const heightAt = (x, z) => { const fi = (x - x0) / CELL, fj = (z - z0) / CELL, i = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(nz - 2, Math.floor(fj))), u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j)), k = j * nx + i; return height[k] * (1 - u) * (1 - v) + height[k + 1] * u * (1 - v) + height[k + nx] * (1 - u) * v + height[k + nx + 1] * u * v; };

  const props = new T.Group(); props.name = 'Scenery'; group.add(props);
  const ready = (async () => {
    const byModel = new Map();
    for (let m = 0; m < 4000 && [...byModel.values()].reduce((s, l) => s + l.length, 0) < 70; m++) {
      const x = x0 + rand() * (nx - 1) * CELL, z = z0 + rand() * (nz - 1) * CELL, k = Math.round((z - z0) / CELL) * nx + Math.round((x - x0) / CELL), h = height[k];
      if (inside[k] || h < 3 || pathW[k] < 4.2) continue;
      const gx = height[k + 1] - height[k - 1], gz = height[k + nx] - height[k - nx]; if (Math.hypot(gx, gz) / (2 * CELL) > 0.55) continue;
      const rocky = rand() < 0.45, name = rocky ? 'ROCK' : h > 24 ? 'PINE_SNOW' : 'PINE_SNOW', size = rocky ? 1.2 + rand() * 1.8 : 1.8 + rand() * 1.1;
      (byModel.get(name) ?? byModel.set(name, []).get(name)).push(mtx([x, h - 0.05, z], [0, rand() * 6.3, 0], size));
    }
    for (const [name, list] of byModel) { try { const g = modelInstances(await loadModel(name, 'lo'), list); g.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) { const old = o.material; o.material = new T.MeshLambertMaterial({ vertexColors: true }); old.dispose(); } }); props.add(g); } catch { /* scenery only */ } }
  })();
  return {
    group, heightAt, ready,
    fitPoints: () => [[-70, -4, 50], [70, -4, 50], [-70, -4, -64], [70, -4, -64]].map(([dx, y, dz]) => new T.Vector3(top[0] + dx, y, top[1] + dz)),
    release() { group.removeFromParent(); geometry.dispose(); material.dispose(); props.traverse((o) => { if (o.isInstancedMesh) { o.dispose(); o.material?.dispose(); } }); },
  };
}
