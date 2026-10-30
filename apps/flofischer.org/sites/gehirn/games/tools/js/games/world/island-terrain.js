/**
 * Island terrain for the overworld: the authored region (a GLB diorama) becomes the middle of an island in the shared sea.
 * Around the region's footprint this builds stepped plateaus with cliff edges, thick grass (or sand, snow, basalt) lips, earth
 * sides, beaches, a harbour channel where the region's own water meets the edge, and props. It never touches the region's meshes.
 *
 * The region is sampled once into a top-down height and colour raster (its own triangles), so the land starts at the rim's
 * height and colour and no seam shows. All work runs in budgeted slices (generators) so the main thread never blocks for long.
 * Everything is in region metres (the group carries the region's unit scale and centre).
 */
import { THREE as T } from '../three-kit.js';
import { loadModel } from '../models.js';
import { modelInstances, mtx, rng, createNoise, smoothstep } from './decor.js';
import { SEA_Y } from './sea.js';

const CELL = 0.6, EXTENT = 32, FINE = 0.5, BINS = 96, STEP = 1.5, FLAT_BAND = 5.5, SLICE_MS = 6;

export const BIOMES = {
  meadow: { top: ['#79c93d', '#62b535'], lip: '#b9ec4c', earth: ['#a06a3a', '#7a4b2b'], sand: '#f2de9c', models: { tree: 'TREE_ROUND', bush: 'BUSH', rock: 'ROCK', extra: ['COTTAGE', 'WINDMILL'] }, trees: 1, treeSize: 1.9 },
  sand: { top: ['#efc66f', '#e2b15c'], lip: '#fde596', earth: ['#bc7440', '#8f512d'], sand: '#f7e5ac', models: { tree: 'PALM', bush: 'CACTUS', rock: 'DESERT_ROCK', extra: ['MESA'] }, trees: 0.45, treeSize: 2.1 },
  snow: { top: ['#f3f9ff', '#dbeaf7'], lip: '#ffffff', earth: ['#8ca9c8', '#6b88aa'], sand: '#eaf4fb', models: { tree: 'PINE_SNOW', bush: 'ICE_CRYSTAL', rock: 'SNOW_ROCK', extra: [] }, trees: 0.9, treeSize: 2.2 },
  basalt: { top: ['#6b6987', '#5a5873'], lip: '#a09eba', earth: ['#3c3955', '#2c2a40'], sand: '#6e6a80', models: { tree: 'ROCK', bush: 'ROCK', rock: 'ROCK', extra: ['VOLCANO'] }, trees: 0.5, treeSize: 2.6, treeTint: [1.3, 1.25, 1.7] },
  stone: { top: ['#6fa268', '#5d9060'], lip: '#aedc8a', earth: ['#6e7f90', '#566474'], sand: '#d5dcd6', models: { tree: 'PINE_SNOW', bush: 'BUSH', rock: 'ROCK', extra: [] }, trees: 0.5, treeSize: 2 },
};
export const BIOME_OF = ['meadow', 'sand', 'snow', 'basalt', 'stone'];
// the other worlds: bare mountain terraces (Pip), floating arena islands without the landmark models (Momo)
const crag = (top, lip, earth, sand, tree = 'PINE_SNOW', trees = 0.35) => ({ top, lip, earth, sand, models: { tree, bush: 'ROCK', rock: 'ROCK', extra: [] }, trees, treeSize: 1.8 });
Object.assign(BIOMES, {
  'crag-moss': crag(['#79a35f', '#68935a'], '#b3cf84', ['#8a8f93', '#6c7378'], '#b9b49c', 'PINE_SNOW', 0.5),
  'crag-sand': crag(['#d6b676', '#c8a266'], '#eed39c', ['#a58963', '#876c4c'], '#e7d3a1', 'PALM', 0.25),
  'crag-frost': crag(['#e8f0f6', '#d2dfe9'], '#ffffff', ['#8e9fb2', '#6f8196'], '#eaf4fb', 'PINE_SNOW', 0.45),
  'crag-basalt': crag(['#5f6076', '#505168'], '#9a9bb4', ['#3b3b4d', '#2b2b3a'], '#6e6a80', 'ROCK', 0.2),
});
for (const key of ['meadow', 'sand', 'snow', 'basalt']) BIOMES[`sky-${key}`] = { ...BIOMES[key], models: { ...BIOMES[key].models, extra: [] } };

const modelCache = new Map();
const model = (name) => { if (!modelCache.has(name)) modelCache.set(name, loadModel(name, 'lo')); return modelCache.get(name); };

let deadline = 0;
const over = () => performance.now() > deadline;
/** Runs a generator in time slices (a bare yield gives the main thread back, yielding a promise waits for it); resolves with its return value. */
function run(gen, aborted, stats) {
  return new Promise((resolve, reject) => {
    const step = (input) => {
      if (aborted()) return resolve(null);
      const began = performance.now(); deadline = began + SLICE_MS;
      let r;
      try { r = gen.next(input); } catch (e) { return reject(e); }
      if (stats) stats.maxSliceMs = Math.max(stats.maxSliceMs, performance.now() - began);
      if (r.done) return resolve(r.value);
      if (r.value && typeof r.value.then === 'function') r.value.then(step, reject); else setTimeout(step, 0);
    };
    setTimeout(step, 0);
  });
}

/** Top-down raster of a region: highest land surface, highest water surface and the colour of the land there. */
function* sampleRegion(root, cx, cz, u, hx, hz) {
  const nx = Math.ceil((2 * hx) / FINE), nz = Math.ceil((2 * hz) / FINE);
  const land = new Float32Array(nx * nz).fill(-1e9), water = new Float32Array(nx * nz).fill(-1e9), col = new Float32Array(nx * nz * 3);
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && !o.userData.owDepthOnly && o.geometry.attributes.position) meshes.push(o); });
  for (const m of meshes) {
    const isWater = (Array.isArray(m.material) ? m.material[0] : m.material)?.name === 'water';
    const P = m.geometry.attributes.position, C = m.geometry.attributes.color, I = m.geometry.index, n = P.count, e = m.matrixWorld.elements;
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if ((i & 16383) === 0 && over()) yield;
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      X[i] = ((e[0] * x + e[4] * y + e[8] * z + e[12] - cx) / u + hx) / FINE; Y[i] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / u; Z[i] = ((e[2] * x + e[6] * y + e[10] * z + e[14] - cz) / u + hz) / FINE;
    }
    const tris = (I ? I.count : n) / 3, target = isWater ? water : land;
    for (let t = 0; t < tris; t++) {
      if ((t & 2047) === 0 && over()) yield;
      const a = I ? I.getX(t * 3) : t * 3, b = I ? I.getX(t * 3 + 1) : t * 3 + 1, c = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      const x0 = X[a], x1 = X[b], x2 = X[c], z0 = Z[a], z1 = Z[b], z2 = Z[c];
      const i0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), i1 = Math.min(nx - 1, Math.floor(Math.max(x0, x1, x2)));
      const j0 = Math.max(0, Math.floor(Math.min(z0, z1, z2))), j1 = Math.min(nz - 1, Math.floor(Math.max(z0, z1, z2)));
      if (i0 > i1 || j0 > j1) continue;
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      let hit = false;
      const put = (k, y) => {
        if (y <= target[k]) return;
        target[k] = y;
        if (!isWater && C) { const r = (C.getX(a) + C.getX(b) + C.getX(c)) / 3, g = (C.getY(a) + C.getY(b) + C.getY(c)) / 3, bl = (C.getZ(a) + C.getZ(b) + C.getZ(c)) / 3; col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = bl; }
      };
      if (Math.abs(det) > 1e-9) {
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const px = i + 0.5, pz = j + 0.5, l0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / det, l1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / det, l2 = 1 - l0 - l1;
          if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
          hit = true; put(j * nx + i, l0 * Y[a] + l1 * Y[b] + l2 * Y[c]);
        }
      }
      if (!hit) { const i = Math.min(nx - 1, Math.max(0, Math.floor((x0 + x1 + x2) / 3))), j = Math.min(nz - 1, Math.max(0, Math.floor((z0 + z1 + z2) / 3))); put(j * nx + i, Math.max(Y[a], Y[b], Y[c])); }
    }
  }
  return { nx, nz, land, water, col };
}

/** Euclidean-ish distance and nearest-seed index on a grid (two chamfer rounds carrying the seed). */
function* distanceField(seed, nx, nz) {
  const n = nx * nz, dist = new Float32Array(n).fill(1e9), src = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) if (seed[k]) { dist[k] = 0; src[k] = k; }
  const relax = (k, o, i, j) => {
    const s = src[o]; if (s < 0) return;
    const d = Math.hypot(i - (s % nx), j - Math.floor(s / nx)) * CELL;
    if (d < dist[k]) { dist[k] = d; src[k] = s; }
  };
  for (let round = 0; round < 2; round++) {
    for (let j = 0; j < nz; j++) { if (over()) yield; for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) relax(k, k - 1, i, j); if (j) { relax(k, k - nx, i, j); if (i) relax(k, k - nx - 1, i, j); if (i < nx - 1) relax(k, k - nx + 1, i, j); } } }
    for (let j = nz - 1; j >= 0; j--) { if (over()) yield; for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) relax(k, k + 1, i, j); if (j < nz - 1) { relax(k, k + nx, i, j); if (i < nx - 1) relax(k, k + nx + 1, i, j); if (i) relax(k, k + nx - 1, i, j); } } }
  }
  return { dist, src };
}

/**
 * world: the loaded region. opts: biome (key of BIOMES), harbour (the region's water at its edge is the sea: carve a channel),
 * sea (createSea result, receives the shore distances), lift (metres the whole island sits above the sea), beach, drop (depth of the rim wall in metres), keel ({ slope, depth, floor }: rock hanging underneath), seed, onChange, dressing (URL of precomputed trees and bushes inside the region).
 * Returns { group, ready, release, heightAt, info }.
 */
export function island(world, { biome = 'meadow', harbour = false, sea = null, seed = 7, onChange = null, instancedLambert = true, dressing = null, lift = 0, beach = true, drop = 1, keel = null } = {}) {
  const B = BIOMES[biome], u = world.unitScale, center = world.bounds.getCenter(new T.Vector3()), half = world.bounds.getSize(new T.Vector3()).multiplyScalar(0.5 / u);
  const group = new T.Group(); group.name = `Island_${biome}`; group.position.set(center.x, 0, center.z); group.scale.setScalar(u);
  const hx = half.x, hz = half.z, geometries = [], materials = [], instances = [], seaY = (SEA_Y + lift) / u;
  const noise = createNoise(seed), rand = rng(seed * 31 + 5);
  let released = false, grid = null;
  const away = world.cameraPosition.clone().sub(world.cameraTarget).setY(0).normalize().multiplyScalar(-1);
  const state = { ready: false, ms: 0, builds: 0, maxSliceMs: 0 };

  function* build() {
    const t0 = performance.now();
    const rs = yield* sampleRegion(world.root, center.x, center.z, u, hx, hz);
    const nx = Math.ceil((2 * hx + 2 * EXTENT) / CELL), nz = Math.ceil((2 * hz + 2 * EXTENT) / CELL), gx0 = -hx - EXTENT, gz0 = -hz - EXTENT, N = nx * nz;
    const px = (i) => gx0 + (i + 0.5) * CELL, pz = (j) => gz0 + (j + 0.5) * CELL;
    // region raster lookups (local metres)
    const fineAt = (x, z) => { const i = Math.floor((x + hx) / FINE), j = Math.floor((z + hz) / FINE); return i >= 0 && j >= 0 && i < rs.nx && j < rs.nz ? j * rs.nx + i : -1; };
    const inside = new Uint8Array(N), seedRing = new Uint8Array(N), seedOut = new Uint8Array(N);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const f = fineAt(px(i), pz(j)); inside[j * nx + i] = f >= 0 && (rs.land[f] > -1e8 || rs.water[f] > -1e8) ? 1 : 0; }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, nb = [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < nz - 1 ? k + nx : -1];
      if (inside[k]) { if (nb.some((o) => o >= 0 && !inside[o])) seedRing[k] = 1; } else if (nb.some((o) => o >= 0 && inside[o])) seedOut[k] = 1;
    }
    yield;
    const outer = yield* distanceField(seedRing, nx, nz), inner = yield* distanceField(seedOut, nx, nz);
    // rim bins: ground height, colour and harbour water of the region's edge, by angle around the centre
    const binH = new Float32Array(BINS).fill(NaN), binC = new Float32Array(BINS * 3), binW = new Float32Array(BINS), binN = new Float32Array(BINS);
    const binOf = (x, z) => Math.min(BINS - 1, Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * BINS));
    for (let k = 0; k < N; k++) {
      if (!seedRing[k]) continue;
      const x = px(k % nx), z = pz(Math.floor(k / nx));
      let best = 1e9, bc = -1, waterHits = 0, total = 0, wl = -1e9;
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const f = fineAt(x + a * FINE * 0.5, z + b * FINE * 0.5); if (f < 0) continue;
        const l = rs.land[f], w = rs.water[f]; if (l < -1e8 && w < -1e8) continue;
        total++; if (w > -1e8 && w >= l - 0.05) { waterHits++; wl = Math.max(wl, w); }
        if (l > -1e8 && l < best) { best = l; bc = f; }
      }
      const bin = binOf(x, z); binN[bin]++;
      const isWater = harbour && total && waterHits / total > 0.5 && wl < seaY + 0.5;
      if (isWater) binW[bin]++;
      else if (bc >= 0 && (Number.isNaN(binH[bin]) || best < binH[bin])) { binH[bin] = best; binC[bin * 3] = rs.col[bc * 3]; binC[bin * 3 + 1] = rs.col[bc * 3 + 1]; binC[bin * 3 + 2] = rs.col[bc * 3 + 2]; }
    }
    const mouth = new Uint8Array(BINS); for (let b = 0; b < BINS; b++) mouth[b] = binN[b] && binW[b] / binN[b] > 0.5 ? 1 : 0;
    let known = 0, mean = 0; for (let b = 0; b < BINS; b++) if (!Number.isNaN(binH[b])) { known++; mean += binH[b]; } mean = known ? mean / known : 0.4;
    for (let b = 0; b < BINS; b++) if (Number.isNaN(binH[b])) { // fill from the nearest known bin
      for (let r = 1; r < BINS; r++) { const o = [(b + r) % BINS, (b - r + BINS) % BINS].find((q) => !Number.isNaN(binH[q])); if (o !== undefined) { binH[b] = binH[o]; binC.copyWithin(b * 3, o * 3, o * 3 + 3); break; } }
      if (Number.isNaN(binH[b])) binH[b] = mean;
    }
    const smooth = (arr, passes, radius) => { for (let p = 0; p < passes; p++) { const c = arr.slice(); for (let b = 0; b < BINS; b++) { if (mouth[b]) continue; let s = 0, w = 0; for (let r = -radius; r <= radius; r++) { const q = (b + r + BINS) % BINS; if (mouth[q]) continue; s += c[q]; w++; } arr[b] = s / w; } } };
    smooth(binH, 3, 2);
    const rimC = (b) => [binC[b * 3], binC[b * 3 + 1], binC[b * 3 + 2]];
    // island shape and terrace field
    const H = new Float32Array(N), colors = new Float32Array(N * 3), kk = new Uint8Array(N), sandW = new Float32Array(N);
    const tc = [new T.Color(B.top[0]), new T.Color(B.top[1])], lip = new T.Color(B.lip), earthA = new T.Color(B.earth[0]), earthB = new T.Color(B.earth[1]), sand = new T.Color(B.sand);
    const stripeDir = [Math.cos(0.5), Math.sin(0.5)];
    const biasAt = (x, z) => Math.max(-1, Math.min(1, ((x * away.x + z * away.z) / (Math.max(hx, hz) + 10))));
    for (let j = 0; j < nz; j++) {
      if (over()) yield;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, x = px(i), z = pz(j);
        if (inside[k]) {
          const b = binOf(x, z), din = inner.dist[k];
          H[k] = !mouth[b] && din <= 1.4 ? binH[b] - 0.1 : seaY - 1.6;
          continue;
        }
        const d = outer.dist[k], s = outer.src[k], b = binOf(px(s % nx), pz(Math.floor(s / nx)));
        const bias = biasAt(x, z), R = Math.max(9.5, 13 + 6 * noise.fbm2(x * 0.045 + 11, z * 0.045, 3) + 3 * bias);
        if (d >= R) { H[k] = seaY - drop; continue; }
        if (mouth[b]) { H[k] = seaY - 0.7; kk[k] = 0; continue; }
        const e = smoothstep(FLAT_BAND - 1, R * 0.85, d + noise.fbm2(x * 0.06 + 40, z * 0.06, 2) * 3.5) * (-0.6 + 2.8 * (0.5 + 0.5 * bias)) + noise.fbm2(x * 0.035 + 3, z * 0.035, 3) * 1.8 * smoothstep(4, 9, d) + noise.fbm2(x * 0.22, z * 0.22, 2) * 0.28 * smoothstep(5, 8, d);
        const level = Math.max(0, Math.min(2, Math.floor(e)));
        kk[k] = level;
        let h = binH[b] + STEP * level + (level < 2 ? 0.16 * (e - Math.floor(e)) : 0.12) * smoothstep(3, 8, d);
        const shoreK = beach && lift === 0 && level === 0 ? smoothstep(R - 3.4, R - 0.5, d) : 0;
        sandW[k] = shoreK; h = h + (seaY + 0.03 - h) * shoreK;
        H[k] = h;
      }
    }
    yield;
    // vertex colours: grass tops with mow stripes, bright lips on plateau edges, earth sides with strata, sand, rim blend
    const c = new T.Color(), tmp = new T.Color();
    for (let j = 0; j < nz; j++) {
      if (over()) yield;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, x = px(i), z = pz(j), h = H[k];
        if (h < seaY - 0.5) { colors[k * 3] = earthB.r; colors[k * 3 + 1] = earthB.g; colors[k * 3 + 2] = earthB.b; continue; }
        let drop = 0, low = h; for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) { if ((a || bb) && i + a >= 0 && j + bb >= 0 && i + a < nx && j + bb < nz) low = Math.min(low, H[k + bb * nx + a]); }
        drop = h - low;
        let high = h; for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) { if ((a || bb) && i + a >= 0 && j + bb >= 0 && i + a < nx && j + bb < nz) high = Math.max(high, H[k + bb * nx + a]); }
        const rise = high - h;
        const n = noise.fbm2(x * 0.2, z * 0.2, 2) * 0.5 + 0.5, stripe = Math.sin((x * stripeDir[0] + z * stripeDir[1]) * 0.95) > 0 ? 1 : 0;
        c.copy(tc[0]).lerp(tc[1], n * 0.8 + stripe * 0.25);
        c.multiplyScalar(0.96 + stripe * 0.08);
        if (drop > 0.45) c.lerp(lip, 0.9);                    // the top edge of a plateau: the thick lip
        else if (rise > 0.45) c.copy(earthA).lerp(earthB, 0.4 + n * 0.3); // the face / foot of a cliff
        else if (high - low > 0.3) c.lerp(lip, 0.45);          // the lip's inner band
        if (rise > 0.45 && drop <= 0.45) c.multiplyScalar(0.8 + 0.2 * Math.sin(h * 7));
        if (sandW[k] > 0) c.lerp(sand, Math.min(1, sandW[k] * 1.4));
        if (h < seaY + 0.18 && !inside[k]) c.lerp(sand, 0.7);
        if (!inside[k]) {
          const d = outer.dist[k], blend = 1 - smoothstep(0.4, 4.2, d);
          if (blend > 0) { const b = binOf(px(outer.src[k] % nx), pz(Math.floor(outer.src[k] / nx))), rc = rimC(b); tmp.setRGB(rc[0], rc[1], rc[2]); if (!mouth[b]) c.lerp(tmp, blend * 0.85); }
        }
        colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
      }
    }
    yield;
    // mesh: only quads that have dry land (or the cliff down to the water)
    const pos = new Float32Array(N * 3), idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; pos[k * 3] = px(i); pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = pz(j); }
    for (let j = 0; j < nz - 1; j++) {
      if (over()) yield;
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
        if (Math.max(H[a], H[b], H[d], H[e]) < seaY - (drop > 1 ? drop - 0.02 : 0.02)) continue;
        idx.push(a, d, b, b, d, e);
      }
    }
    const nor = new Float32Array(N * 3);
    for (let j = 0; j < nz; j++) {
      if (over()) yield;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, dx = (H[i < nx - 1 ? k + 1 : k] - H[i ? k - 1 : k]) / ((i && i < nx - 1 ? 2 : 1) * CELL), dz = (H[j < nz - 1 ? k + nx : k] - H[j ? k - nx : k]) / ((j && j < nz - 1 ? 2 : 1) * CELL), l = Math.hypot(dx, 1, dz);
        nor[k * 3] = -dx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -dz / l;
      }
    }
    const g = new T.BufferGeometry(); geometries.push(g);
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(colors, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setIndex(idx);
    const mat = new T.MeshLambertMaterial({ vertexColors: true }); materials.push(mat);
    const terrain = new T.Mesh(g, mat); terrain.name = 'IslandTerrain'; terrain.receiveShadow = true; group.add(terrain);
    yield;
    if (keel) yield* underside({ keel, nx, nz, px, pz, H, inside, binH, binOf, seaY });
    // shore distances for the sea (metres to the nearest dry cell, 0 on land)
    const land = new Uint8Array(N); for (let k = 0; k < N; k++) land[k] = H[k] > seaY + 0.01 ? 1 : 0;
    const shore = yield* distanceField(land, nx, nz), tile = new Uint8Array(N);
    for (let k = 0; k < N; k++) tile[k] = land[k] ? 0 : Math.min(255, Math.round((shore.dist[k] / 12) * 255));
    grid = { nx, nz, gx0, gz0, H, kk, outer, inside, mouth, binOf, cells: N, tile };
    sea?.paint(tile, nx, nz, center.x + gx0 * u, center.z + gz0 * u, CELL * u);
    yield;
    // props
    const extra = dressing ? yield fetchJson(dressing) : null;
    yield* dress({ extra, B, nx, nz, px, pz, gx0, gz0, H, kk, outer, inside, mouth, binOf });
    state.ready = true; state.ms = performance.now() - t0; state.builds++;
    onChange?.();
  }

  /** Rock hanging under the island (Pip's terraces and Momo's floating islands): the bottom is the top minus a thickness that grows inwards from the rim. */
  function* underside({ keel, nx, nz, px, pz, H, inside, binH, binOf, seaY }) {
    const N = nx * nz, stride = 2, land = new Uint8Array(N), seed = new Uint8Array(N);
    for (let k = 0; k < N; k++) { land[k] = H[k] > seaY + 0.01 || inside[k] ? 1 : 0; seed[k] = land[k] ? 0 : 1; }
    const field = yield* distanceField(seed, nx, nz), floor = (SEA_Y + keel.floor) / u, start = drop + 0.3;
    const top = (k) => (inside[k] ? binH[binOf(px(k % nx), pz(Math.floor(k / nx)))] - 0.1 : H[k]);
    const cols = Math.floor((nx - 1) / stride) + 1, rows = Math.floor((nz - 1) / stride) + 1, bottom = new Float32Array(cols * rows).fill(NaN);
    const rock = [new T.Color(B.earth[0]), new T.Color(B.earth[1])], colors = new Float32Array(cols * rows * 3), pos = new Float32Array(cols * rows * 3), tint = new T.Color();
    for (let r = 0; r < rows; r++) {
      if (over()) yield;
      for (let c = 0; c < cols; c++) {
        const k = r * stride * nx + c * stride; if (!land[k]) continue;
        const x = px(c * stride), z = pz(r * stride), wob = 1 + 0.3 * noise.fbm2(x * 0.09 + 5, z * 0.09, 2), y0 = top(k), thick = start + Math.min(keel.depth, field.dist[k] * keel.slope * wob), y = Math.max(floor, y0 - thick), v = r * cols + c;
        bottom[v] = y; pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        const t = Math.min(1, (y0 - y) / Math.max(6, keel.depth)), band = 0.9 + 0.12 * Math.sign(Math.sin(y * 1.2 + noise.fbm2(x * 0.1, z * 0.1, 2) * 3));
        tint.copy(rock[0]).lerp(rock[1], Math.min(1, t * 1.3)).multiplyScalar(band * (1.06 - 0.22 * t)); colors.set([tint.r, tint.g, tint.b], v * 3);
      }
    }
    const idx = [], nor = new Float32Array(cols * rows * 3), cell = CELL * stride;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (Number.isNaN(bottom[a]) || Number.isNaN(bottom[b]) || Number.isNaN(bottom[d]) || Number.isNaN(bottom[e])) continue;
      idx.push(a, b, d, b, e, d);
    }
    const get = (v, fallback) => (Number.isNaN(bottom[v]) ? fallback : bottom[v]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = r * cols + c; if (Number.isNaN(bottom[v])) continue;
      const y = bottom[v], fx = (get(v + (c < cols - 1 ? 1 : 0), y) - get(v - (c ? 1 : 0), y)) / (2 * cell), fz = (get(v + (r < rows - 1 ? cols : 0), y) - get(v - (r ? cols : 0), y)) / (2 * cell), l = Math.hypot(fx, 1, fz);
      nor[v * 3] = fx / l; nor[v * 3 + 1] = -1 / l; nor[v * 3 + 2] = fz / l;
    }
    const g = new T.BufferGeometry(); geometries.push(g);
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(colors, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setIndex(idx);
    const mat = new T.MeshLambertMaterial({ vertexColors: true }); materials.push(mat);
    const mesh = new T.Mesh(g, mat); mesh.name = 'IslandUnderside'; group.add(mesh);
    yield;
  }

  function heightAt(x, z) {
    if (!grid) return null;
    const fx = (x - grid.gx0) / CELL - 0.5, fz = (z - grid.gz0) / CELL - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= grid.nx - 1 || j >= grid.nz - 1) return null;
    const tx = fx - i, tz = fz - j, a = grid.H[j * grid.nx + i], b = grid.H[j * grid.nx + i + 1], c = grid.H[(j + 1) * grid.nx + i], d = grid.H[(j + 1) * grid.nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  function* dress(s) {
    const { extra, B, nx, nz, px, pz, gx0, gz0, H, kk, outer, inside, mouth, binOf } = s;
    const [tree, bush, rock, ...extras] = yield Promise.all([B.models.tree, B.models.bush, B.models.rock, ...B.models.extra].map(model));
    const near = (k) => { // flat, dry, not on a cliff edge, outside the region
      if (inside[k] || H[k] < seaY + 0.25 || outer.dist[k] < 0.9) return false;
      const i = k % nx, j = Math.floor(k / nx); if (i < 2 || j < 2 || i >= nx - 2 || j >= nz - 2) return false;
      const h = H[k]; for (const o of [-2, -1, 1, 2]) if (Math.abs(H[k + o] - h) > 0.35 || Math.abs(H[k + o * nx] - h) > 0.35) return false;
      return true;
    };
    const cells = []; for (let k = 0; k < nx * nz; k++) if (near(k)) cells.push(k);
    const pick = () => { const k = cells[Math.floor(rand() * cells.length)]; return [px(k % nx) + (rand() - 0.5) * CELL, pz(Math.floor(k / nx)) + (rand() - 0.5) * CELL, k]; };
    const trees = [], treeTint = [], bushes = [], bushTint = [], rocks = [];
    const tint = (v = [1, 1, 1]) => new T.Color().setRGB((0.9 + rand() * 0.2) * v[0], (0.92 + rand() * 0.16) * v[1], (0.86 + rand() * 0.2) * v[2]);
    const want = Math.min(cells.length * 0.025 * B.trees, 140);
    for (let n = 0; n < want * 3 && trees.length < want && cells.length; n++) {
      if ((n & 63) === 0 && over()) yield;
      const [x, z, k] = pick(), clump = noise.fbm2(x * 0.08, z * 0.08, 2) * 0.5 + 0.5; if (clump < 0.42) continue;
      const sc = B.treeSize * (0.75 + rand() * 0.6); trees.push(mtx([x, H[k] - 0.05 * sc, z], [0, rand() * 6.3, 0], sc)); treeTint.push(tint(B.treeTint));
      if (rand() < 0.5) {
        const bx = x + (rand() - 0.5) * 2.6, bz = z + (rand() - 0.5) * 2.6, bi = Math.floor((bx - gx0) / CELL), bj = Math.floor((bz - gz0) / CELL), bk = bj * nx + bi;
        if (bi >= 0 && bj >= 0 && bi < nx && bj < nz && near(bk)) { bushes.push(mtx([bx, H[bk] - 0.04, bz], [0, rand() * 6.3, 0], 1.1 + rand() * 0.9)); bushTint.push(tint()); }
      }
    }
    for (let n = 0; n < Math.min(cells.length * 0.01, 70) && cells.length; n++) { const [x, z, k] = pick(); rocks.push(mtx([x, H[k] - 0.05, z], [0, rand() * 6.3, 0], 0.8 + rand() * 1.4)); }
    // a hedge of bushes and stones on the region's rim: the seam disappears under it
    const ringCells = []; for (let k = 0; k < nx * nz; k++) if (!inside[k] && outer.dist[k] > 0.2 && outer.dist[k] < 1.5 && H[k] > seaY + 0.15 && !mouth[binOf(px(outer.src[k] % nx), pz(Math.floor(outer.src[k] / nx)))]) ringCells.push(k);
    for (const k of ringCells) { if (rand() > 0.35) continue; const x = px(k % nx) + (rand() - 0.5) * CELL, z = pz(Math.floor(k / nx)) + (rand() - 0.5) * CELL; if (rand() < 0.75) { bushes.push(mtx([x, H[k] - 0.05, z], [0, rand() * 6.3, 0], 0.9 + rand() * 0.8)); bushTint.push(tint()); } else rocks.push(mtx([x, H[k] - 0.1, z], [0, rand() * 6.3, 0], 0.7 + rand() * 0.8)); }
    if (extra) { // trees and bushes on the region's own free ground (raycast offline), so the whole region reads as lush as the land
      const ox = (world.root.position.x - center.x) / u, oz = (world.root.position.z - center.z) / u, oy = world.root.position.y / u, at = (o, sc) => mtx([o.x + ox, o.y + oy - 0.05 * sc, o.z + oz], [0, o.yaw, 0], sc);
      for (const o of extra.trees) { trees.push(at(o, o.s * 1.25)); treeTint.push(tint()); }
      for (const o of extra.bushes) { bushes.push(at(o, o.s * 1.3)); bushTint.push(tint()); }
    }
    instances.push(modelInstances(tree, trees, { tints: treeTint }), modelInstances(bush, bushes, { tints: bushTint }), modelInstances(rock, rocks));
    // landmarks on the high terraces
    const high = cells.filter((k) => kk[k] >= 1 && outer.dist[k] > 7), spots = [];
    for (let n = 0; n < 60 && spots.length < extras.length * 2 && high.length; n++) { const k = high[Math.floor(rand() * high.length)], x = px(k % nx), z = pz(Math.floor(k / nx)); if (spots.every((p) => Math.hypot(p[0] - x, p[1] - z) > 9)) spots.push([x, z, k]); }
    extras.forEach((m, n) => { const list = spots.slice(n * 2, n * 2 + (n === 0 ? 2 : 1)).map(([x, z, k]) => mtx([x, H[k] - 0.08, z], [0, rand() * 6.3, 0], B.models.extra[n] === 'VOLCANO' ? 1.3 : B.models.extra[n] === 'MESA' ? 1.5 : 3)); instances.push(modelInstances(m, list)); });
    for (const g of instances) { if (instancedLambert) lambertify(g); group.add(g); g.traverse((o) => { if (o.material) materials.push(o.material); }); }
  }

  const driver = run(build(), () => released, state).catch((e) => { console.error('[games] island build failed', e); });
  return {
    group, heightAt, state, ready: driver,
    release() {
      released = true; group.removeFromParent();
      if (grid) sea?.clear(center.x + grid.gx0 * u, center.z + grid.gz0 * u, grid.nx, grid.nz, CELL * u);
      for (const g of instances) g.traverse((o) => o.isInstancedMesh && o.dispose());
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
    },
  };
}

const fetchJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// matte scenery: instanced Standard materials become Lambert (cheaper per pixel; the cel pass converts both)
function lambertify(g) { g.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) { const old = o.material; o.material = new T.MeshLambertMaterial({ vertexColors: true }); old.dispose(); } }); }
