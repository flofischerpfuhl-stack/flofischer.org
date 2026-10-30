/**
 * The land of a world map that is one connected place: a single height-and-colour mesh that runs under and around all region slabs,
 * meets each slab at the height of its rim, fills the gaps between neighbours (a path across, or a strait with a bridge), rises to the
 * highlands and falls to a beach and the sea at its edge. Scenery (trees, bushes, rocks) stands on it between the slabs.
 * The sea shader gets a shore-distance tile from the same data, so foam lines follow this coast.
 */
import { THREE as T } from '../three-kit.js';
import { loadModel } from '../models.js';
import { mtx, rng, createNoise, smoothstep, modelInstances } from './decor.js';
import { BIOMES } from './island-terrain.js';
import { SEA_Y } from './sea.js';

const CELL = 1, MARGIN = 22, PAD = 8, HALF_CORRIDOR = 6.5, WATER = 5.2, FLOOR = -3.5;
const hex = (s) => new T.Color(s);

/** rims: [(lx, lz) -> rim height] per region (null while unknown). */
export function buildContinent({ layout, biomes, seed = 3, rims = [], sea = null }) {
  const group = new T.Group(); group.name = 'Continent';
  const { centers, levels, halves, links } = layout, bounds = layout.slabBounds ?? layout.bounds, n = centers.length, noise = createNoise(seed + 31), rand = rng(seed * 13 + 1);
  const x0 = bounds.x0 - MARGIN, z0 = bounds.z0 - MARGIN, nx = Math.ceil((bounds.x1 - bounds.x0 + 2 * MARGIN) / CELL) + 1, nz = Math.ceil((bounds.z1 - bounds.z0 + 2 * MARGIN) / CELL) + 1;
  const palette = biomes.map((b) => { const B = BIOMES[b]; return { top: hex(B.top[0]), lip: hex(B.lip), earth: hex(B.earth[0]), sand: hex(B.sand) }; });
  const meanRim = rims.map((r) => r?.mean ?? 0.6), edgeAt = (i, x, z) => (rims[i]?.edge ? rims[i].edge(x - centers[i][0], z - centers[i][1]) : 0.6);
  const height = new Float32Array(nx * nz), land = new Float32Array(nx * nz), pathAt = new Float32Array(nx * nz), weights = new Float32Array(nx * nz * n), inside = new Uint8Array(nx * nz);
  const pathLinks = links.filter((l) => !l.strait);
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * CELL, z = z0 + j * CELL;
    let wsum = 0, dmin = 1e9, d = 1e9, level = 0, edgeNear = 0, edgeW = 0, rmin = 0;
    for (let r = 0; r < n; r++) {
      const [cx, cz] = centers[r], [hx, hz] = halves[r], ds = Math.hypot(Math.max(Math.abs(x - cx) - hx, 0), Math.max(Math.abs(z - cz) - hz, 0)), w = 1 / ((ds + 3.5) * (ds + 3.5));
      const edge = edgeAt(r, x, z), pad = PAD * smoothstep(0.2, 1.0, edge);
      weights[k * n + r] = w; wsum += w; level += w * (levels[r] + meanRim[r] * 0.55);
      const wr = 1 / ((ds + 0.6) ** 3); edgeNear += wr * (levels[r] + edge); edgeW += wr;
      d = Math.min(d, ds - pad); if (ds < dmin) { dmin = ds; rmin = r; }
      if (ds < 0.15) inside[k] = 1;
    }
    for (let r = 0; r < n; r++) weights[k * n + r] /= wsum;
    let corridor = 1e9;
    for (const l of pathLinks) { const dl = segDist(x, z, centers[l.a][0], centers[l.a][1], centers[l.b][0], centers[l.b][1]); corridor = Math.min(corridor, dl); }
    d = Math.min(d, corridor - HALF_CORRIDOR);
    for (const l of links) if (l.strait) {
      const mx = (l.from[0] + l.to[0]) / 2, mz = (l.from[1] + l.to[1]) / 2, ux = l.axis === '+x' || l.axis === '-x' ? 1 : 0, uz = 1 - ux, t = Math.abs((x - mx) * ux + (z - mz) * uz), lat = Math.abs((x - mx) * uz + (z - mz) * ux), reach = Math.max(ux ? halves[l.a][1] : halves[l.a][0], ux ? halves[l.b][1] : halves[l.b][0]) + PAD + 3;
      if (lat < reach) d = Math.max(d, (WATER / 2 - t) * Math.min(1, (reach - lat) / 3));
    }
    const around = level / wsum, nearEdge = edgeNear / edgeW, undul = noise.fbm2(x * 0.07, z * 0.07, 2) * 0.5, blend = smoothstep(0.5, 9, dmin);
    let g = nearEdge * (1 - blend) + around * blend + undul * smoothstep(2, 10, dmin) - 0.12 - 0.4 * (1 - blend);
    if (dmin < 0.15) g = levels[rmin] - 1.5; else if (dmin < 0.5) g -= (0.5 - dmin) * 0.6;
    land[k] = d;
    height[k] = g + (FLOOR - g) * smoothstep(-1.4, 1.8, d);
    pathAt[k] = corridor;
  }
  const geometry = new T.BufferGeometry(), pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), tmp = new T.Color(), cell = new T.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * CELL, z = z0 + j * CELL, h = height[k];
    pos.set([x, h, z], k * 3);
    const gx = (height[Math.min(nx - 1, i + 1) + j * nx] - height[Math.max(0, i - 1) + j * nx]) / (2 * CELL), gz = (height[i + Math.min(nz - 1, j + 1) * nx] - height[i + Math.max(0, j - 1) * nx]) / (2 * CELL), slope = Math.hypot(gx, gz);
    cell.setRGB(0, 0, 0); for (let r = 0; r < n; r++) cell.r += palette[r].top.r * weights[k * n + r], cell.g += palette[r].top.g * weights[k * n + r], cell.b += palette[r].top.b * weights[k * n + r];
    const sand = new T.Color(0, 0, 0), earth = new T.Color(0, 0, 0), lip = new T.Color(0, 0, 0);
    for (let r = 0; r < n; r++) { const w = weights[k * n + r]; sand.r += palette[r].sand.r * w; sand.g += palette[r].sand.g * w; sand.b += palette[r].sand.b * w; earth.r += palette[r].earth.r * w; earth.g += palette[r].earth.g * w; earth.b += palette[r].earth.b * w; lip.r += palette[r].lip.r * w; lip.g += palette[r].lip.g * w; lip.b += palette[r].lip.b * w; }
    const d = land[k], shade = 0.93 + 0.14 * (noise.fbm2(x * 0.18 + 9, z * 0.18, 2) * 0.5 + 0.5);
    cell.lerp(lip, 0.45 * smoothstep(-3.2, -1.2, d) * (1 - smoothstep(-1.2, -0.4, d)));
    cell.lerp(sand, smoothstep(0.55, 0.2, h - SEA_Y) * smoothstep(-4, -1, d) + (h < SEA_Y + 0.2 ? 0.5 : 0));
    cell.lerp(earth, smoothstep(0.75, 1.35, slope) * 0.9);
    cell.lerp(tmp.set('#e7d6a4'), smoothstep(2.1, 1.0, pathAt[k]) * 0.88 * (d < -0.5 ? 1 : 0));
    cell.multiplyScalar(shade); if (h < SEA_Y) cell.lerp(tmp.set('#b69a6a'), 0.5);
    col.set([cell.r, cell.g, cell.b], k * 3);
  }
  const index = new (nx * nz > 65535 ? Uint32Array : Uint16Array)((nx - 1) * (nz - 1) * 6);
  let q = 0; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1; index[q++] = a; index[q++] = c; index[q++] = b; index[q++] = b; index[q++] = c; index[q++] = e; }
  geometry.setAttribute('position', new T.BufferAttribute(pos, 3)); geometry.setAttribute('color', new T.BufferAttribute(col, 3)); geometry.setIndex(new T.BufferAttribute(index, 1)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), mesh = new T.Mesh(geometry, material); mesh.name = 'ContinentGround'; mesh.receiveShadow = true; group.add(mesh);

  const heightAt = (x, z) => { const fi = (x - x0) / CELL, fj = (z - z0) / CELL, i = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(nz - 2, Math.floor(fj))), u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j)), k = j * nx + i; return height[k] * (1 - u) * (1 - v) + height[k + 1] * u * (1 - v) + height[k + nx] * (1 - u) * v + height[k + nx + 1] * u * v; };

  // shore distance for the sea shader: metres to dry land (0 on land), slab interiors read as shallow water so a harbour has no foam sheet
  const dist = new Float32Array(nx * nz), isLand = (k) => height[k] > SEA_Y + 0.02 && !inside[k];
  for (let k = 0; k < nx * nz; k++) dist[k] = isLand(k) ? 0 : 1e3;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) dist[k] = Math.min(dist[k], dist[k - 1] + 1); if (j) dist[k] = Math.min(dist[k], dist[k - nx] + 1, i ? dist[k - nx - 1] + 1.41 : 1e3, i < nx - 1 ? dist[k - nx + 1] + 1.41 : 1e3); }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1); if (j < nz - 1) dist[k] = Math.min(dist[k], dist[k + nx] + 1, i < nx - 1 ? dist[k + nx + 1] + 1.41 : 1e3, i ? dist[k + nx - 1] + 1.41 : 1e3); }
  const tile = new Uint8Array(nx * nz); for (let k = 0; k < nx * nz; k++) tile[k] = inside[k] ? Math.round((3.5 / 12) * 255) : Math.min(255, Math.round((Math.min(dist[k], 12) / 12) * 255));
  sea?.paint(tile, nx, nz, x0, z0, CELL);

  // the stuff that stands on it
  const trails = new T.Group(); trails.name = 'Trails'; group.add(trails);
  const props = new T.Group(); props.name = 'Scenery'; group.add(props);
  const ready = (async () => {
    const spots = [];
    for (let m = 0; m < 9000 && spots.length < 240; m++) {
      const x = x0 + rand() * (nx - 1) * CELL, z = z0 + rand() * (nz - 1) * CELL, k = Math.round((z - z0) / CELL) * nx + Math.round((x - x0) / CELL);
      if (inside[k] || land[k] > -2.2 || height[k] < SEA_Y + 0.5 || pathAt[k] < 3 || spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 3.2)) continue;
      let w = 0, owner = 0; for (let r = 0; r < n; r++) if (weights[k * n + r] > w) { w = weights[k * n + r]; owner = r; }
      spots.push([x, z, owner]);
    }
    const byModel = new Map();
    for (const [x, z, owner] of spots) {
      const B = BIOMES[biomes[owner]], roll = rand(), kind = roll < 0.5 * B.trees + 0.12 ? 'tree' : roll < 0.8 ? 'bush' : 'rock', name = B.models[kind], size = kind === 'tree' ? B.treeSize * (0.8 + rand() * 0.6) : kind === 'bush' ? 1.1 + rand() * 0.8 : 0.9 + rand() * 1.3;
      (byModel.get(name) ?? byModel.set(name, []).get(name)).push(mtx([x, heightAt(x, z) - 0.05, z], [0, rand() * 6.3, 0], size));
    }
    for (const [name, list] of byModel) {
      try { const model = await loadModel(name, 'lo'); const g = modelInstances(model, list); g.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) { const old = o.material; o.material = new T.MeshLambertMaterial({ vertexColors: true }); old.dispose(); } }); props.add(g); } catch { /* a missing sculpt only thins the scenery */ }
    }
  })();
  return {
    group, heightAt, ready, trails, nx, nz, x0, z0,
    release() {
      group.removeFromParent(); sea?.clear(x0, z0, nx, nz, CELL); geometry.dispose(); material.dispose();
      props.traverse((o) => { if (o.isInstancedMesh) { o.dispose(); o.material?.dispose(); } }); trails.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    },
  };
}
