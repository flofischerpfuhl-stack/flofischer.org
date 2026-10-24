/**
 * Pip's Tower: the static diorama of a level, built into its own scene for the Baker (decor.js) — sky with painted
 * clouds, sun or moon, round stars and the Frostpeak aurora; terrain with hills, trees, houses and the world's landmark;
 * the plateau under the tower with grass, flowers, ferns, rocks, a path, fences and lamps; and the tower itself: quoins,
 * cornice, a shingled hip roof with a lit dormer and chimney, buttresses, a turret, a balcony, banners, ivy, lanterns,
 * pin sockets, and inside every chamber a room (windows, torches, shelves, roots, icicles, pipes or crystals per
 * world). Board coordinates as in pips-tower-3d.js: board (x, y) → three (x − 180, 320 − y), the board on z = 0, the
 * tower 64 deep (back wall at z = −32).
 *
 * buildTowerScenery({ L, world, dark, low, look }) → { scene, fit(camera, res), torches, ambient, textures, dispose() }
 * (await propsReady first: the sculpted props it places)
 */
import { THREE, texture } from '../three-kit.js';
import { loadModel } from '../models.js';
import { RoundedBoxGeometry } from '../../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { skyMaterial } from './sky.js';
import { Batch, mtx, paint, rock, tuft, flower, fern, vine, cloud, blob, glowQuad, modelInstances, rng, createNoise, smoothstep, lerp } from './decor.js';

const BX = (x) => x - 180, BY = (y) => 320 - y;
const DEPTH = 64, ZB = -DEPTH / 2, ZF = DEPTH / 2;
const GROUND = BY(607) - 3; // the plateau's surface, just under the tower floor

// Props baked by scripts/games-sculpt/props.js (missing or half-written files are skipped).
const PROP_NAMES = ['TREE_ROUND', 'BUSH', 'ROCK', 'COTTAGE', 'WINDMILL', 'CACTUS', 'DESERT_ROCK', 'PALM', 'MESA', 'PINE_SNOW', 'SNOW_ROCK', 'ICE_CRYSTAL', 'OBSERVATORY', 'BASALT', 'FERNSTONE', 'VOLCANO', 'UFO'];
export const PROPS = {};
export const propsReady = Promise.all(PROP_NAMES.map((n) => loadModel(n, 'lo').then((m) => { PROPS[n] = m; }).catch(() => {})));

// The look of each world's surroundings (docs/games/UNIVERSE.md).
export const WORLD = [
  { // Fernhaven Meadows: sunny morning, rolling green hills, cottages, a windmill, ivy and flowers
    sky: { top: 0x3f8fe6, horizon: 0xe4f3ff, glow: 0xfff1c4, cloud: 0xffffff, shade: 0xb8c8e0 },
    fog: 0xd2e6f4, ground: [0x4f9a35, 0x8cc95a], groundTex: 't-grass', far: [0x6aa860, 0x9cc8a0], rock: [0.6, 0.57, 0.52],
    tuft: [[0.08, 0.2, 0.05], [0.34, 0.6, 0.18]], flowers: [0xffffff, 0xfff2a8, 0xf2a6c4, 0xb9a6f2, 0xff8a5c], ferns: true, ivy: true, moss: 0.8,
    trees: ['TREE_ROUND'], small: ['BUSH', 'ROCK'], houses: ['COTTAGE'], landmark: 'WINDMILL',
    torch: 0xffb050, window: 0xbfe4ff, banner: [0x3f9b4a, 0xfff4d6], wood: 0x8a5a33, metal: 0x3a3a40, trim: 0xf3ead8,
    ambient: { kind: 'pollen', color: 0xfff2a8 }, smoke: true, hills: 'roll',
  },
  { // Sunbake Dunes: golden hour, mesas, cacti and palms, cloth awnings and clay pots
    sky: { top: 0x4f7fd0, horizon: 0xffd29a, glow: 0xffc070, cloud: 0xfff0dc, shade: 0xd89a7a },
    fog: 0xf2cfa0, ground: [0xd9a05c, 0xf0c888], groundTex: 't-sand', far: [0xd08a58, 0xe8b07a], rock: [0.78, 0.5, 0.34],
    tuft: [[0.32, 0.36, 0.12], [0.62, 0.62, 0.3]], flowers: [0xff7a4a, 0xffd23f], ferns: false, ivy: false, moss: 0.0,
    trees: ['PALM', 'CACTUS'], small: ['DESERT_ROCK', 'CACTUS'], houses: [], landmark: 'MESA',
    torch: 0xffa040, window: 0xffe0b0, banner: [0x2aa6a0, 0xffe6b8], wood: 0x9a6a3a, metal: 0x5a4030, trim: 0xf7deb0,
    ambient: { kind: 'dust', color: 0xffe2b0 }, smoke: false, hills: 'mesa',
  },
  { // Frostpeak: crisp blue, snowy pines and peaks, icicles, an observatory and the aurora
    sky: { top: 0x2f63b8, horizon: 0xe2f0ff, glow: 0xd6f0ff, cloud: 0xffffff, shade: 0xa8bcd8 },
    fog: 0xd8e8f8, ground: [0xe6eef8, 0xffffff], groundTex: 't-snow', far: [0xb8cce4, 0xe8f0fa], rock: [0.52, 0.58, 0.68],
    tuft: [[0.16, 0.3, 0.3], [0.5, 0.66, 0.62]], flowers: [], ferns: false, ivy: false, moss: 0.0, snow: true,
    trees: ['PINE_SNOW'], small: ['SNOW_ROCK', 'ICE_CRYSTAL'], houses: [], landmark: 'OBSERVATORY',
    torch: 0xffc070, window: 0xffd890, banner: [0x3566c2, 0xe2f2ff], wood: 0x7a5a40, metal: 0x4a5568, trim: 0xe8f0fa,
    ambient: { kind: 'snow', color: 0xffffff }, smoke: true, hills: 'peaks',
  },
  { // Ember Isles: dramatic dusk, volcanoes, lava, basalt, alien pipes and crystals, the mothership above
    sky: { top: 0x1f1435, horizon: 0xe8784a, glow: 0xff9a4a, cloud: 0x5a3a52, shade: 0x2a1a2a },
    fog: 0x6a3a44, ground: [0x3a2e30, 0x5a4644], groundTex: 't-lavarock', far: [0x3a2430, 0x5a3440], rock: [0.3, 0.26, 0.26],
    tuft: [[0.08, 0.16, 0.12], [0.2, 0.4, 0.3]], flowers: [], ferns: false, ivy: false, moss: 0.0, lava: true,
    trees: ['BASALT'], small: ['BASALT', 'FERNSTONE'], houses: [], landmark: 'VOLCANO',
    torch: 0xff8030, window: 0xff9a50, banner: [0x7a2a4e, 0xffb27a], wood: 0x4a3030, metal: 0x2a2a34, trim: 0x8a7468,
    ambient: { kind: 'ember', color: 0xff9a4a }, smoke: false, hills: 'volcano',
  },
];

/** Collision helpers for the board's walls. */
const segDist = (px, py, [ax, ay, bx, by]) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};

/**
 * The tower's chambers: flood-fill the board between the walls on a coarse grid; each region gets its box, area and
 * the cells it covers (for checking where a decoration fits).
 */
function chambers(L, b) {
  const S = 6, nx = Math.ceil((b[2] - b[0]) / S), ny = Math.ceil((b[3] - b[1]) / S);
  const walls = [...L.walls, ...(L.wood || []), ...(L.gates || [])];
  const grid = new Int16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = b[0] + (i + 0.5) * S, y = b[1] + (j + 0.5) * S;
    if (walls.some((w) => segDist(x, y, w) < 9)) grid[j * nx + i] = -1;
  }
  const regions = [];
  for (let s = 0; s < grid.length; s++) {
    if (grid[s] !== 0) continue;
    const id = regions.length + 1, st = [s], r = { id, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, n: 0 };
    grid[s] = id;
    while (st.length) {
      const k = st.pop(), i = k % nx, j = (k / nx) | 0;
      r.n++; r.x0 = Math.min(r.x0, i); r.x1 = Math.max(r.x1, i); r.y0 = Math.min(r.y0, j); r.y1 = Math.max(r.y1, j);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= nx || c >= ny) continue;
        const q = c * nx + a;
        if (grid[q] === 0) { grid[q] = id; st.push(q); }
      }
    }
    regions.push(r);
  }
  const free = (id, x0, y0, x1, y1) => { // is the board box [x0..x1, y0..y1] all inside region id?
    for (let y = y0; y <= y1; y += S) for (let x = x0; x <= x1; x += S) {
      const i = Math.floor((x - b[0]) / S), j = Math.floor((y - b[1]) / S);
      if (i < 0 || j < 0 || i >= nx || j >= ny || grid[j * nx + i] !== id) return false;
    }
    return true;
  };
  const out = regions.map((r) => ({ id: r.id, x0: b[0] + r.x0 * S, y0: b[1] + r.y0 * S, x1: b[0] + (r.x1 + 1) * S, y1: b[1] + (r.y1 + 1) * S, area: r.n * S * S })).map((r) => ({ ...r, free: (x0, y0, x1, y1) => free(r.id, x0, y0, x1, y1) }));
  /** The region a board box lies in completely (0 when it touches a wall or two rooms). */
  out.boxIn = (x0, y0, x1, y1) => {
    const i = Math.floor((x0 - b[0]) / S), j = Math.floor((y0 - b[1]) / S);
    const id = i >= 0 && j >= 0 && i < nx && j < ny ? grid[j * nx + i] : 0;
    return id > 0 && free(id, x0, y0, x1, y1) ? id : 0;
  };
  return out;
}

export function buildTowerScenery({ L, world = 0, dark = false, low = false, look }) {
  const W = WORLD[world] || WORLD[0];
  const b = L.bounds || [40, 40, 320, 600];
  const rand = rng(1 + world * 97 + L.walls.length * 13 + (L.pins?.length || 0) * 7);
  const noise = createNoise(7 + world);
  const scene = new THREE.Scene();
  const night = dark ? 1 : 0;
  const textures = [];
  const tex = (name, repeat) => { const t = texture(name, { repeat }); textures.push(t); return t; };
  scene.fog = new THREE.Fog(new THREE.Color(W.fog).multiplyScalar(dark ? 0.45 : 1), 2200, 5200);

  // lights: the world's sun with soft shadows over the tower and its plateau, sky fill, and warm point lights
  const hemi = new THREE.HemisphereLight(look.sky, look.ground, look.ambient * (dark ? 0.62 : 1));
  const sun = new THREE.DirectionalLight(look.sun, look.intensity * (dark ? 0.55 : 1));
  sun.position.set(-260 * 3, 520 * 3, 620 * 3); sun.target.position.set(0, 0, -100);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 620, bottom: -560, near: 1000, far: 4800 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);
  const lamps = []; // { x, y, z, color, power } → point lights (the strongest few) and live flame flicker
  const torches = [];

  // ── sky ──
  const skyMat = skyMaterial(W.sky, world, night);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
  sky.position.z = -5400; sky.renderOrder = -10; scene.add(sky);

  // ── terrain: the plateau the tower stands on, then hills rising to the horizon ──
  const hillsAt = (x, z) => {
    const far = smoothstep(-520, -1500, z), dist = Math.min(1, (-z - 500) / 2400);
    let h = 0;
    if (W.hills === 'roll') h = (noise.fbm2(x * 0.0012, z * 0.0016, 4) * 0.5 + 0.55) * (180 + dist * 520);
    else if (W.hills === 'mesa') { const n = noise.fbm2(x * 0.0009, z * 0.0011, 4) * 0.5 + 0.5; const step = smoothstep(0.5, 0.56, n) * 0.75 + smoothstep(0.66, 0.7, n) * 0.35; h = (step * 380 + n * 60) * (0.5 + dist * 0.7); }
    else if (W.hills === 'peaks') { const r = 1 - Math.abs(noise.fbm2(x * 0.00055, z * 0.0008, 4)); h = Math.pow(r, 2.6) * (160 + dist * 900) + 60 * dist; }
    else { h = (noise.fbm2(x * 0.0012, z * 0.0014, 4) * 0.5 + 0.5) * (120 + dist * 260); }
    return h * far;
  };
  const heightAt = (x, z) => GROUND + noise.fbm2(x * 0.004, z * 0.004, 3) * 6 * smoothstep(-20, -200, z) + hillsAt(x, z);
  {
    const nx = low ? 70 : 150, nz = low ? 40 : 90, X = 3600, Z0 = 420, Z1 = -3600;
    const g = new THREE.PlaneGeometry(1, 1, nx, nz); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(P.count * 3), c = new THREE.Color();
    const c0 = new THREE.Color(W.ground[0]), c1 = new THREE.Color(W.ground[1]), f0 = new THREE.Color(W.far[0]), f1 = new THREE.Color(W.far[1]);
    const rockC = new THREE.Color().setRGB(...W.rock);
    for (let i = 0; i < P.count; i++) {
      // denser rows near the tower: z runs quadratically from the front edge to the horizon
      const u = P.getX(i) + 0.5, v = 0.5 - P.getZ(i), zz = Z0 + (Z1 - Z0) * Math.pow(v, 1.7), xx = (u - 0.5) * 2 * X * (0.45 + v * 0.8);
      const y = heightAt(xx, zz);
      P.setXYZ(i, xx, y, zz);
      uv.setXY(i, xx / 90, zz / 90);
    }
    g.computeVertexNormals();
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N.getY(i);
      const n = noise.fbm2(x * 0.01, z * 0.01, 3) * 0.5 + 0.5, far = smoothstep(-500, -1600, z);
      c.copy(c0).lerp(c1, n).lerp(f0.clone().lerp(f1, n), far);
      c.lerp(rockC, smoothstep(0.82, 0.6, ny) * 0.8);
      if (W.snow || W.hills === 'peaks') c.lerp(new THREE.Color(0xf4f8ff), smoothstep(GROUND + 300, GROUND + 520, y) * 0.9);
      if (W.lava) c.lerp(new THREE.Color(0x2a1a1a), smoothstep(0.75, 0.55, ny) * 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex(W.groundTex, [1, 1]), roughness: 0.95 }));
    m.receiveShadow = true; scene.add(m);
  }

  // far props on the hills: trees, houses, the landmark (instanced baked models, scaled to the board)
  // a prop sinks to the lowest ground under its footprint, so nothing floats over a slope or a mesa's edge
  const footY = (x, z, r) => Math.min(heightAt(x, z), heightAt(x + r, z), heightAt(x - r, z), heightAt(x, z + r), heightAt(x, z - r));
  const place = (names, count, { zMin, zMax, xMax, xAvoid = 0, scale = [60, 100], slope = 0.7 } = {}) => {
    const out = {}, tints = {};
    for (let k = 0; k < count * 3 && count > 0; k++) {
      const x = (rand() * 2 - 1) * xMax, z = zMin + rand() * (zMax - zMin);
      if (Math.abs(x) < xAvoid && z > -480) continue;
      const e = 8, s = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      if (Math.abs(s) > slope) continue;
      const name = names[(rand() * names.length) | 0];
      if (!PROPS[name]) continue;
      const sc = scale[0] + rand() * (scale[1] - scale[0]);
      (out[name] ||= []).push(mtx([x, footY(x, z, sc * 0.35) - 2, z], [0, rand() * Math.PI * 2, 0], sc));
      (tints[name] ||= []).push(new THREE.Color().setHSL(0.0 + (rand() - 0.5) * 0.04, 0.0, 0.0).setRGB(0.82 + rand() * 0.3, 0.86 + rand() * 0.26, 0.8 + rand() * 0.25));
      if (--count <= 0) break;
    }
    for (const [name, list] of Object.entries(out)) scene.add(modelInstances(PROPS[name], list, { shadow: false, tints: tints[name] }));
  };
  place(W.trees, low ? 30 : 140, { zMin: -2400, zMax: -620, xMax: 3000, scale: [70, 130] });
  place(W.trees, low ? 6 : 14, { zMin: -560, zMax: -200, xMax: 1000, xAvoid: 330, scale: [80, 130] });
  if (W.houses.length) place(W.houses, low ? 2 : 7, { zMin: -1700, zMax: -700, xMax: 1800, scale: [60, 90], slope: 0.35 });
  if (W.houses.length) place(W.houses, 2, { zMin: -460, zMax: -320, xMax: 760, xAvoid: 330, scale: [80, 95], slope: 0.4 });
  if (PROPS[W.landmark]) {
    const lx = world === 3 ? -900 : 820, lz = world === 3 ? -2300 : -1150, s = world === 1 ? 150 : world === 3 ? 260 : 120, sink = world === 1 ? s * 0.5 : 6;
    scene.add(modelInstances(PROPS[W.landmark], [mtx([lx, footY(lx, lz, s * 1.2) - sink, lz], [0, world === 0 ? -0.5 : 0.3, 0], s)]));
    if (world === 1) scene.add(modelInstances(PROPS.MESA, [mtx([-1300, footY(-1300, -1900, 260) - 6, -1900], [0, 1.2, 0], 220)]));
    if (world === 3) { // a second volcano and glowing lava streams down the flanks
      scene.add(modelInstances(PROPS.VOLCANO, [mtx([1500, footY(1500, -2600, 360) - 6, -2600], [0, 1.7, 0], 300)]));
      const lavaB = new Batch();
      for (const [vx, vz, s] of [[-900, -2300, 260], [1500, -2600, 300]]) {
        const top = heightAt(vx, vz) + s * 2.4;
        lavaB.add(glowBlob, mtx([vx, top, vz], [0, 0, 0], [s * 0.5, s * 0.12, s * 0.5]), 0xff6a20);
      }
      scene.add(lavaB.mesh({ glow: true }));
    }
  }
  if (world === 3 && PROPS.UFO) scene.add(modelInstances(PROPS.UFO, [mtx([-520, 1180, -2600], [0.12, 0.4, -0.06], 520)], { fog: false }));

  // floating 3D clouds in front of the painted ones (not Ember: ash haze there)
  if (world !== 3 && !low) {
    const cb = new Batch();
    for (let k = 0; k < 9; k++) {
      const g = cloud(rand, 6 + ((rand() * 4) | 0), new THREE.Color(W.sky.shade).toArray());
      const s = 120 + rand() * 160;
      cb.add(g, mtx([(rand() * 2 - 1) * 2600, 520 + rand() * 900, -2200 - rand() * 1400], [0, 0, 0], [s * 1.6, s * 0.7, s]), dark ? 0x8090a8 : 0xffffff);
    }
    const cm = cb.mesh({ roughness: 1 }); cm.material.emissive = new THREE.Color(W.sky.cloud).multiplyScalar(0.35); cm.material.fog = true;
    scene.add(cm);
  }

  // ── the plateau around the tower: path, fences, lamps, bushes, rocks, grass, flowers, ferns ──
  const fol = new Batch(), stones = new Batch(), woodB = new Batch(), glow = new Batch();
  const tufts = [0, 1, 2].map((k) => tuft(rng(11 + k), 7, ...W.tuft));
  const flowers = W.flowers.map((c) => flower(c, c === 0xffd23f ? 0xff8a3d : 0xffd23f, c === 0xffffff ? 8 : 5));
  const ferns = W.ferns ? [fern(rng(5)), fern(rng(6), 6)] : [];
  const rocks = [0, 1, 2, 3].map((k) => rock(31 + k * 7 + world, { moss: W.moss, tone: W.rock }));
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10), rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const inTower = (x, z) => Math.abs(x) < 160 && z > ZB - 18 && z < ZF + 14;
  // grass and flowers everywhere visible: the band in front of the tower and the plateau beside it
  const nGrass = low ? 0 : 2600;
  for (let k = 0; k < nGrass; k++) {
    const z = lerp(150, -620, Math.pow(rand(), 1.4)), x = (rand() * 2 - 1) * (380 + (-z) * 0.9);
    if (inTower(x, z)) continue;
    const y = heightAt(x, z), s = (6 + rand() * 7) * (1 + Math.max(0, -z) / 500);
    fol.add(tufts[k % 3], mtx([x, y - 0.5, z], [0, rand() * 6.3, 0], [s * 1.4, s, s * 1.4]));
    if (flowers.length && rand() < 0.16) fol.add(flowers[(rand() * flowers.length) | 0], mtx([x + 4, y, z + 3], [0, rand() * 6.3, 0], s * (0.8 + rand() * 0.5)));
    if (ferns.length && rand() < 0.03) fol.add(ferns[k % 2], mtx([x, y, z], [0, rand() * 6.3, 0], s * 2.4));
  }
  // a fringe of grass and flowers hugging the tower's foot (kept low: Pip stands just behind it)
  if (!low) for (let x = -170; x <= 170; x += 5) {
    const z = ZF + 6 + rand() * 18, y = GROUND;
    fol.add(tufts[(rand() * 3) | 0], mtx([x, y, z], [0, rand() * 6.3, 0], [8, 5 + rand() * 4, 8]));
    if (flowers.length && rand() < 0.22) fol.add(flowers[(rand() * flowers.length) | 0], mtx([x, y, z + 4], [0, rand() * 6.3, 0], 6 + rand() * 3));
  }
  // rocks and boulders
  for (let k = 0; k < (low ? 10 : 46); k++) {
    const z = lerp(120, -560, rand()), x = (rand() * 2 - 1) * (360 + (-z) * 0.8);
    if (inTower(x, z) || Math.abs(x) < 210 && z > -60) continue;
    const s = 6 + rand() * (z < -200 ? 30 : 14);
    stones.add(rocks[k % 4], mtx([x, heightAt(x, z) + s * 0.15, z], [0, rand() * 6.3, 0], [s * 1.2, s, s]));
  }
  // small props (bushes, rocks, cacti, crystals) round the tower's sides
  {
    const out = {};
    for (let k = 0; k < (low ? 6 : 26); k++) {
      const side = rand() < 0.5 ? -1 : 1, x = side * (190 + rand() * 520), z = lerp(60, -420, rand());
      const name = W.small[(rand() * W.small.length) | 0];
      if (!PROPS[name]) continue;
      (out[name] ||= []).push(mtx([x, heightAt(x, z) - 1, z], [0, rand() * 6.3, 0], 34 + rand() * 30));
    }
    for (const [name, list] of Object.entries(out)) scene.add(modelInstances(PROPS[name], list, { shadow: true }));
  }
  // the path: flat stones leading from the tower's foot out to the left and right
  const flat = rock(77, { flat: 0.25, moss: W.moss * 0.4, tone: W.rock.map((v) => v * 1.15) });
  for (const side of [-1, 1]) for (let t = 0; t < 1; t += 0.045) {
    const x = side * (175 + t * 640), z = 30 - t * 260 + Math.sin(t * 7) * 30;
    stones.add(flat, mtx([x + (rand() - 0.5) * 8, heightAt(x, z) + 0.6, z], [0, rand() * 3, 0], [10 + rand() * 4, 3, 8 + rand() * 3]));
    stones.add(flat, mtx([x + 10, heightAt(x + 10, z + 9) + 0.6, z + 9], [0, rand() * 3, 0], [8, 3, 7]));
  }
  // a fence along the path (posts and two rails) and lamp posts with warm lanterns
  for (const side of [-1, 1]) {
    let px = side * 230, pz = -20;
    for (let k = 0; k < 9; k++) {
      const nxp = px + side * 46, nzp = pz - 22;
      const y0 = heightAt(px, pz), y1 = heightAt(nxp, nzp);
      woodB.add(rbox, mtx([px, y0 + 12, pz], [0, 0, 0], [4, 26, 4]), W.wood);
      if (k < 8) for (const hgt of [9, 19]) {
        const mx = (px + nxp) / 2, mz = (pz + nzp) / 2, my = (y0 + y1) / 2 + hgt, len = Math.hypot(nxp - px, nzp - pz);
        woodB.add(box, mtx([mx, my, mz], [0, -Math.atan2(nzp - pz, nxp - px), Math.atan2(y1 - y0, len)], [len, 2.6, 2]), new THREE.Color(W.wood).multiplyScalar(1.1));
      }
      px = nxp; pz = nzp;
    }
    const lx = side * 205, lz = 40, ly = heightAt(lx, lz);
    woodB.add(cyl, mtx([lx, ly + 30, lz], [0, 0, 0], [1.6, 60, 1.6]), W.metal);
    woodB.add(box, mtx([lx, ly + 61, lz], [0, 0, 0], [11, 2, 11]), W.metal);
    woodB.add(box, mtx([lx, ly + 52, lz], [0, 0, 0], [9, 2, 9]), W.metal);
    glow.add(box, mtx([lx, ly + 56.5, lz], [0, 0, 0], [7, 8, 7]), new THREE.Color(W.torch).multiplyScalar(2.2));
    lamps.push({ x: lx, y: ly + 56, z: lz, color: W.torch, power: 0.6, flame: 7 });
  }
  // a signpost by the right path
  {
    const sx = 300, sz = 70, sy = heightAt(sx, sz);
    woodB.add(rbox, mtx([sx, sy + 20, sz], [0, 0, 0], [3.5, 40, 3.5]), W.wood);
    woodB.add(rbox, mtx([sx + 8, sy + 33, sz + 2], [0, 0.15, -0.08], [26, 8, 2]), 0xe8d2a6);
    woodB.add(rbox, mtx([sx - 6, sy + 23, sz + 2], [0, -0.2, 0.06], [22, 7, 2]), 0xd8bf90);
  }

  // ── the tower ──
  const wallC = new THREE.Color(look.wall[1]).multiplyScalar(dark ? 0.72 : 1);
  const backC = new THREE.Color(look.back[1]).multiplyScalar((dark ? 0.62 : 1) * 0.86);
  const backTex = tex(look.back[0], [3, 6]), wallTex = tex(look.wall[0], [1, 1]);
  // back wall
  const backGeo = new THREE.PlaneGeometry(b[2] - b[0] + 4, b[3] - b[1] + 4, 28, 56);
  paint(backGeo, (c, x, y) => {
    const n = noise.fbm2(x * 0.02 + 5, y * 0.02, 3), low = smoothstep(-200, -280, y);
    const k = 0.86 + n * 0.22 - low * 0.12;
    c.setRGB(k, k * (1 + (W.moss ? low * 0.06 : 0)), k * (1 - low * 0.05));
  });
  const back = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ color: backC, map: backTex, roughness: 0.92, vertexColors: true }));
  back.position.set(BX((b[0] + b[2]) / 2), BY((b[1] + b[3]) / 2), ZB); back.receiveShadow = true; scene.add(back);
  // all walls of the level, stone texture stretched by length
  {
    const geos = L.walls.map((sg) => wallBox(sg));
    const m = new THREE.Mesh(mergeBoxes(geos), new THREE.MeshStandardMaterial({ color: wallC, map: wallTex, roughness: 0.85 }));
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  const trim = new THREE.Color(W.trim).lerp(wallC, 0.35).multiplyScalar(dark ? 0.7 : 0.95);
  const quoin = new Batch();
  // corner quoins: alternating long and short dressed stones up both outer edges, a plinth of big blocks at the foot
  for (const x of [b[0], b[2]]) {
    const side = x === b[0] ? -1 : 1;
    let y = b[1] + 2, k = 0;
    while (y < b[3]) {
      const h = 15 + rand() * 4, long = k % 2 === 0, w = long ? 22 : 15;
      const tone = trim.clone().multiplyScalar(0.86 + rand() * 0.16);
      quoin.add(rbox, mtx([BX(x) + side * (long ? -1 : 1) * 1.5, BY(y + h / 2), ZF + 1.5], [0, 0, (rand() - 0.5) * 0.02], [w, h - 1.6, 6]), tone);
      quoin.add(rbox, mtx([BX(x) + side * 8.2, BY(y + h / 2), ZF - (long ? 11 : 8)], [0, 0, 0], [4, h - 1.6, long ? 26 : 20]), tone);
      y += h; k++;
    }
  }
  for (let x = b[0] - 18; x < b[2] + 18; x += 26 + rand() * 4) {
    quoin.add(rbox, mtx([BX(x + 13), BY(b[3] + 12), ZF + 3], [0, 0, 0], [25, 12, 10]), trim.clone().multiplyScalar(0.72 + rand() * 0.14));
  }
  // cornice under the roof: moulding with corbels
  quoin.add(rbox, mtx([BX((b[0] + b[2]) / 2), BY(b[1] - 3), 2], [0, 0, 0], [b[2] - b[0] + 40, 9, DEPTH + 22]), trim);
  for (let x = b[0] - 12; x <= b[2] + 12; x += 18) quoin.add(rbox, mtx([BX(x), BY(b[1] + 6), ZF + 5], [0, 0, 0], [7, 9, 8]), trim.clone().multiplyScalar(0.88));
  // pin sockets: a brass ring plate where each pin or lever crosses an outer wall
  const brass = new Batch();
  const ringGeo = new THREE.TorusGeometry(7.5, 2.2, 6, 18);
  const outside = [];
  for (const [ax, ay, bx, by] of L.pins) {
    outside.push([ax, ay, bx, by]);
    for (const wx of [b[0], b[2]]) if ((ax - wx) * (bx - wx) < 0 && Math.abs(bx - ax) > 1) { const t = (wx - ax) / (bx - ax), y = ay + (by - ay) * t; brass.add(ringGeo, mtx([BX(wx), BY(y), ZF + 1], [0, 0, 0], 1), 0xc89a3a); }
  }
  for (const lv of L.levers || []) outside.push([lv.at[0], lv.at[1], lv.at[0], lv.at[1]]);
  const clearOf = (x, y, r) => outside.every((s) => segDist(x, y, s) > r);

  // ivy (Meadows): strands hanging from the cornice over the outer wall faces, a few climbing from the foot
  if (W.ivy && !low) {
    const strands = [0, 1, 2, 3, 4, 5].map((k) => vine(rng(40 + k), 1, 16));
    for (const x of [b[0], b[2]]) for (let k = 0; k < 4; k++) {
      const len = 50 + rand() * 120;
      fol.add(strands[(rand() * 6) | 0], mtx([BX(x) + (rand() - 0.5) * 16, BY(b[1] + 2), ZF + 4.5], [0, 0, (rand() - 0.5) * 0.15], [26, len, 1]));
    }
    for (const x of [b[0], b[2]]) for (let k = 0; k < 3; k++) {
      const len = 40 + rand() * 70;
      fol.add(strands[(rand() * 6) | 0], mtx([BX(x) + (rand() - 0.5) * 14, BY(b[3]) + len, ZF + 4.5], [0, 0, (rand() - 0.5) * 0.2], [24, len, 1]));
    }
  }
  // snow on the ledges and icicles under the cornice (Frostpeak)
  if (W.snow) {
    quoin.add(rbox, mtx([BX((b[0] + b[2]) / 2), BY(b[1] - 9), 2], [0, 0, 0], [b[2] - b[0] + 44, 5, DEPTH + 26]), 0xffffff);
    const ice = new THREE.ConeGeometry(1, 1, 5);
    for (let x = b[0] - 16; x <= b[2] + 16; x += 4 + rand() * 5) { const l = 5 + rand() * 14; glow.add(ice, mtx([BX(x), BY(b[1] + 2) - l / 2, ZF + 9], [Math.PI, 0, 0], [1.6, l, 1.6]), new THREE.Color(0xcfeaff).multiplyScalar(dark ? 0.5 : 0.95)); }
  }
  // glowing seams in the basalt (Ember)
  if (W.lava) {
    for (const y of [b[3] + 6, b[3] - 140, b[3] - 330]) glow.add(box, mtx([BX((b[0] + b[2]) / 2), BY(y), ZF + 0.6], [0, 0, 0], [b[2] - b[0] + 20, 1.6, 1]), new THREE.Color(0xff7a2a).multiplyScalar(1.6));
    for (const x of [b[0], b[2]]) glow.add(box, mtx([BX(x), BY((b[1] + b[3]) / 2), ZF + 0.6], [0, 0, 0], [1.4, b[3] - b[1], 1]), new THREE.Color(0xff6a20).multiplyScalar(1.2));
  }

  // buttresses behind the pins on both sides, a turret on the right, a balcony on the left
  const sideStone = new Batch();
  for (const side of [-1, 1]) {
    const x = side < 0 ? b[0] - 7 : b[2] + 7;
    sideStone.add(rbox, mtx([BX(x) + side * 9, BY((b[1] + b[3]) / 2 + 40), ZB + 8], [0, 0, 0], [18, b[3] - b[1] - 80, 18]), wallC.clone().multiplyScalar(0.9));
    sideStone.add(rbox, mtx([BX(x) + side * 14, BY(b[3] - 70), ZB + 10], [0, 0, 0], [28, 140, 20]), wallC.clone().multiplyScalar(0.84));
    sideStone.add(rbox, mtx([BX(x) + side * 12, BY(b[3] - 140), ZB + 10], [0, 0, side * 0.6], [20, 10, 20]), wallC.clone().multiplyScalar(0.8));
  }
  {
    // turret: a round tower with a slit window and a cone roof
    const tx = BX(b[2] + 30), tz = ZB + 4, y0 = BY(b[3] - 150), y1 = BY(b[1] + 150);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(19, 21, y1 - y0, 20, 1, true), new THREE.MeshStandardMaterial({ color: backC.clone().multiplyScalar(1.12), map: tex(look.back[0], [2, 3]), roughness: 0.85 }));
    t.position.set(tx, (y0 + y1) / 2, tz); t.castShadow = true; t.receiveShadow = true; scene.add(t);
    const roofC = new THREE.Color(look.roof).multiplyScalar(dark ? 0.7 : 1);
    sideStone.add(new THREE.ConeGeometry(26, 46, 20), mtx([tx, y1 + 23, tz], [0, 0, 0], 1), roofC);
    sideStone.add(cyl, mtx([tx, y1 + 2, tz], [0, 0, 0], [24, 5, 24]), trim);
    for (const wy of [y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.72]) {
      glow.add(rbox, mtx([tx, wy, tz + 19.5], [0, 0, 0], [5, 16, 2]), new THREE.Color(W.torch).multiplyScalar(1.6));
      sideStone.add(rbox, mtx([tx, wy, tz + 19], [0, 0, 0], [9, 20, 2]), trim);
    }
    if (W.snow) sideStone.add(new THREE.ConeGeometry(27, 14, 20), mtx([tx, y1 + 9, tz], [0, 0, 0], 1), 0xffffff);
    // balcony on the left: a wooden platform with a railing and flower pots
    const bx = BX(b[0] - 7) - 20, by = BY(b[3] - 210);
    woodB.add(box, mtx([bx, by, ZB + 12], [0, 0, 0], [40, 5, 24]), W.wood);
    for (let k = 0; k < 5; k++) woodB.add(box, mtx([bx - 18 + k * 9, by + 9, ZB + 23], [0, 0, 0], [1.8, 16, 1.8]), W.wood);
    woodB.add(box, mtx([bx, by + 17, ZB + 23], [0, 0, 0], [40, 2.4, 2.4]), W.wood);
    woodB.add(box, mtx([bx - 10, by - 10, ZB + 12], [0, 0, 0.8], [3, 22, 3]), W.wood);
    for (const k of [-12, 4]) {
      woodB.add(cyl, mtx([bx + k, by + 6, ZB + 12], [0, 0, 0], [4, 7, 4]), 0xb4532a);
      if (W.flowers.length) fol.add(flowers[(k + 12) % flowers.length], mtx([bx + k, by + 9, ZB + 12], [0, 0, 0], 9));
      else fol.add(tufts[0], mtx([bx + k, by + 9, ZB + 12], [0, 0, 0], 7));
    }
  }
  // banners on the buttresses, below the cornice
  {
    const [c0, c1] = W.banner.map((c) => new THREE.Color(c).multiplyScalar(dark ? 0.7 : 1));
    for (const side of [-1, 1]) {
      const x = BX(side < 0 ? b[0] - 16 : b[2] + 16);
      woodB.add(cyl, mtx([x, BY(b[1] + 22), ZB + 19], [0, 0, Math.PI / 2], [1.2, 22, 1.2]), 0xc89a3a);
      const banner = new THREE.PlaneGeometry(1, 1, 1, 4), P = banner.attributes.position;
      for (let i = 0; i < P.count; i++) if (P.getY(i) < -0.45) P.setY(i, P.getY(i) - (Math.abs(P.getX(i)) < 0.1 ? -0.12 : 0));
      sideStone.add(banner, mtx([x, BY(b[1] + 62), ZB + 18.5], [0, 0, 0], [18, 78, 1]), c0);
      sideStone.add(new THREE.CircleGeometry(5, 12), mtx([x, BY(b[1] + 52), ZB + 18.8], [0, 0, 0], 1), c1);
      sideStone.add(box, mtx([x, BY(b[1] + 40), ZB + 18.7], [0, 0, 0], [18, 2, 0.4]), c1);
      sideStone.add(box, mtx([x, BY(b[1] + 84), ZB + 18.7], [0, 0, 0], [18, 2, 0.4]), c1);
    }
  }
  // lanterns on iron brackets on the outer walls, wherever no pin or lever passes
  for (const side of [-1, 1]) {
    const x = side < 0 ? b[0] : b[2];
    for (const y of [b[1] + 120, b[1] + 260, b[3] - 110]) {
      const lx = x + side * 20;
      if (!clearOf(lx, y, 34) || !clearOf(x + side * 10, y, 30)) continue;
      woodB.add(box, mtx([BX(x + side * 11), BY(y - 13), ZF - 4], [0, 0, 0], [20, 2.2, 2.2]), W.metal);
      woodB.add(box, mtx([BX(lx), BY(y - 9), ZF - 4], [0, 0, 0], [12, 2, 12]), W.metal);
      woodB.add(box, mtx([BX(lx), BY(y + 6), ZF - 4], [0, 0, 0], [10, 2, 10]), W.metal);
      glow.add(box, mtx([BX(lx), BY(y - 1), ZF - 4], [0, 0, 0], [7, 12, 7]), new THREE.Color(W.torch).multiplyScalar(2));
      lamps.push({ x: BX(lx), y: BY(y - 1), z: ZF - 4, color: W.torch, power: 0.55, flame: 8 });
    }
  }

  // ── the roof: a hipped roof of shingles with ridge caps, a finial, a lit dormer and a chimney ──
  {
    const roofC = new THREE.Color(look.roof).multiplyScalar(dark ? 0.7 : 1);
    const ex = (b[2] - b[0]) / 2 + 26, ez = DEPTH / 2 + 16, y0 = BY(b[1] - 6), apex = BY(b[1] - 62), cx = BX((b[0] + b[2]) / 2);
    const under = new Batch();
    // the solid core under the shingles
    const core = new THREE.BufferGeometry();
    const v = [[-ex, 0, ez], [ex, 0, ez], [ex, 0, -ez], [-ex, 0, -ez], [0, apex - y0, 0]];
    core.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4].flatMap((i) => v[i]), 3));
    core.computeVertexNormals();
    under.add(core, mtx([cx, y0, 0]), roofC.clone().multiplyScalar(0.55));
    under.add(box, mtx([cx, y0 - 2, 0], [0, 0, 0], [ex * 2, 4, ez * 2]), roofC.clone().multiplyScalar(0.4));
    scene.add(under.mesh({ roughness: 0.8 }));
    // shingle rows on the front and both side faces
    const sh = new Batch(), tile = new RoundedBoxGeometry(1, 1, 1, 1, 0.25);
    const faces = [
      { a: [-ex, 0, ez], b: [ex, 0, ez] }, { a: [ex, 0, ez], b: [ex, 0, -ez] }, { a: [-ex, 0, -ez], b: [-ex, 0, ez] },
    ];
    const top = new THREE.Vector3(0, apex - y0, 0);
    for (const f of faces) {
      const A = new THREE.Vector3(...f.a), B = new THREE.Vector3(...f.b);
      const mid = A.clone().add(B).multiplyScalar(0.5), up = top.clone().sub(mid), slantLen = up.length(), upN = up.clone().normalize();
      const along = B.clone().sub(A).normalize(), normal = along.clone().cross(upN).normalize();
      if (normal.dot(mid.clone().setY(0)) < 0) { along.negate(); normal.negate(); } // stay right-handed
      const basis = new THREE.Matrix4().makeBasis(along, upN, normal);
      const rows = Math.round(slantLen / 7.5);
      for (let r = 0; r < rows; r++) {
        const t = (r + 0.5) / rows, width = A.distanceTo(B) * (1 - t) + 6, n = Math.max(1, Math.round(width / 11));
        for (let k = 0; k < n; k++) {
          const s = ((k + (r % 2 ? 0.5 : 0)) / n - 0.5) * width;
          if (Math.abs(s) > width / 2 - 2) continue;
          const p = mid.clone().addScaledVector(upN, t * slantLen).addScaledVector(along, s).addScaledVector(normal, 1.2);
          const m = new THREE.Matrix4().makeTranslation(cx + p.x, y0 + p.y, p.z).multiply(basis).multiply(new THREE.Matrix4().makeRotationX(-0.12)).multiply(new THREE.Matrix4().makeScale(10.4, 8.5, 2.4));
          sh.add(tile, m, W.snow && (t > 0.42 || rand() < t * 1.6) ? new THREE.Color(0xf2f7ff).multiplyScalar((dark ? 0.6 : 1) * (0.92 + rand() * 0.08)) : roofC.clone().multiplyScalar(0.8 + rand() * 0.3));
        }
      }
      // ridge cap along the hips
      for (const C of [A, B]) {
        const d = top.clone().sub(C), len = d.length();
        const m = new THREE.Matrix4().makeTranslation(cx + (C.x + top.x) / 2, y0 + (C.y + top.y) / 2 + 1.5, (C.z + top.z) / 2)
          .multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())))
          .multiply(new THREE.Matrix4().makeScale(3.4, len, 3.4));
        sh.add(cyl, m, roofC.clone().multiplyScalar(0.62));
      }
    }
    // fascia boards along the eaves
    sh.add(box, mtx([cx, y0 - 1, ez + 1], [0, 0, 0], [ex * 2 + 4, 5, 3]), new THREE.Color(W.wood).multiplyScalar(0.9));
    scene.add(Object.assign(sh.mesh({ roughness: 0.62 }), { castShadow: true }));
    // dormer with a round lit window
    const dy = y0 + (apex - y0) * 0.36, dz = ez * (1 - 0.36) + 6;
    const dm = new Batch();
    dm.add(rbox, mtx([cx, dy, dz - 4], [0, 0, 0], [30, 24, 14]), trim);
    dm.add(new THREE.ConeGeometry(23, 16, 4, 1), mtx([cx, dy + 19, dz - 4], [0, Math.PI / 4, 0], [1, 1, 0.55]), roofC.clone().multiplyScalar(0.75));
    dm.add(new THREE.TorusGeometry(8, 1.8, 6, 20), mtx([cx, dy, dz + 3.2]), new THREE.Color(W.wood).multiplyScalar(0.8));
    dm.add(box, mtx([cx, dy, dz + 3.6], [0, 0, 0], [1.4, 16, 1]), new THREE.Color(W.wood).multiplyScalar(0.8));
    dm.add(box, mtx([cx, dy, dz + 3.6], [0, 0, 0], [16, 1.4, 1]), new THREE.Color(W.wood).multiplyScalar(0.8));
    scene.add(Object.assign(dm.mesh({ roughness: 0.7 }), { castShadow: true }));
    glow.add(new THREE.CircleGeometry(8, 20), mtx([cx, dy, dz + 2.8]), new THREE.Color(W.torch).multiplyScalar(dark ? 2.4 : 1.5));
    lamps.push({ x: cx, y: dy, z: dz + 14, color: W.torch, power: 0.35 });
    // chimney on the right slope, finial at the apex
    const chx = cx + ex * 0.42, chz = -ez * 0.2, chy = y0 + (apex - y0) * 0.55;
    sideStone.add(rbox, mtx([chx, chy + 18, chz], [0, 0, 0], [16, 52, 16]), wallC.clone().multiplyScalar(0.9));
    sideStone.add(rbox, mtx([chx, chy + 45, chz], [0, 0, 0], [20, 5, 20]), trim);
    if (W.smoke) torches.push({ smoke: true, x: chx, y: chy + 50, z: chz });
    brass.add(new THREE.SphereGeometry(4.5, 12, 8), mtx([cx, apex + 3, 0]), 0xd8a83a);
  }

  // ── inside the chambers: rooms with depth (back wall dressing per world) ──
  const room = new Batch(), roomGlow = new Batch();
  const regions = chambers(L, b), boxIn = regions.boxIn;
  const zone = L.zone;
  const zB = ZB + 0.6;
  const woodC = new THREE.Color(W.wood), woodD = woodC.clone().multiplyScalar(0.7);
  const ITEMS = [[0xd94a3a, 0x3a7ad9, 0xe8c04a, 0x4aa86a], [0xc8783a, 0xa8603a, 0xe8b070, 0x3aa6a0], [0x6aa0e0, 0xd8e8f8, 0xe8c04a, 0x8a6ad9], [0x8a3cf0, 0x2ad8c0, 0x6a6a7a, 0xff8a3d]][world];
  const glowBall = blob(1), ball = blob(1), oct = new THREE.OctahedronGeometry(1, 0), cone5 = new THREE.ConeGeometry(1, 1, 5);
  const shelfItems = (x0, x1, y) => { // jars, books, pots or canisters on a shelf (board coords)
    for (let x = x0 + 4; x < x1 - 6;) {
      const kind = (rand() * 3) | 0, w = 5 + rand() * 5, h = 7 + rand() * 9, c = new THREE.Color(ITEMS[(rand() * 4) | 0]);
      if (kind === 0) for (let k = 0; k < 3; k++) room.add(box, mtx([BX(x + k * 2.6), BY(y) + h / 2, ZB + 6], [0, 0, (rand() - 0.5) * 0.15], [2.2, h * (0.8 + rand() * 0.3), 7]), c.clone().offsetHSL(rand() * 0.1, 0, (rand() - 0.5) * 0.2));
      else if (kind === 1) { room.add(cyl, mtx([BX(x + w / 2), BY(y) + h * 0.4, ZB + 6], [0, 0, 0], [w * 0.45, h * 0.8, w * 0.45]), c); room.add(cyl, mtx([BX(x + w / 2), BY(y) + h * 0.85, ZB + 6], [0, 0, 0], [w * 0.25, 2, w * 0.25]), 0x6a4a2a); }
      else { room.add(ball, mtx([BX(x + w / 2), BY(y) + w * 0.45, ZB + 6], [0, 0, 0], [w * 0.5, w * 0.45, w * 0.5]), c); if (world === 3) roomGlow.add(glowBall, mtx([BX(x + w / 2), BY(y) + w * 0.45, ZB + 9], [0, 0, 0], w * 0.22), c.clone().multiplyScalar(1.8)); }
      x += w + 1 + rand() * 4;
    }
  };
  const window_ = (cx, wy, ww, wh) => { // stone frame, mullions and the view outside (day sky, or the moonlit night)
    const view = new THREE.Color(dark ? 0x2a3a6a : W.window).multiplyScalar(dark ? 1 : 1.2);
    roomGlow.add(box, mtx([BX(cx), BY(wy), zB + 0.4], [0, 0, 0], [ww, wh, 0.5]), view);
    roomGlow.add(new THREE.CircleGeometry(ww / 2, 16, 0, Math.PI), mtx([BX(cx), BY(wy - wh / 2), zB + 0.4]), view);
    const fr = trim.clone().multiplyScalar(0.9);
    room.add(rbox, mtx([BX(cx - ww / 2 - 2.5), BY(wy), zB + 2], [0, 0, 0], [5, wh + 4, 4]), fr);
    room.add(rbox, mtx([BX(cx + ww / 2 + 2.5), BY(wy), zB + 2], [0, 0, 0], [5, wh + 4, 4]), fr);
    room.add(rbox, mtx([BX(cx), BY(wy + wh / 2 + 2), zB + 3], [0, 0, 0], [ww + 14, 5, 8]), fr);
    room.add(new THREE.TorusGeometry(ww / 2 + 2.5, 2.6, 5, 16, Math.PI), mtx([BX(cx), BY(wy - wh / 2), zB + 2]), fr);
    room.add(rbox, mtx([BX(cx), BY(wy - wh / 2 - ww / 2 - 3), zB + 2.5], [0, 0, 0], [6, 7, 5]), fr.clone().multiplyScalar(0.92)); // keystone
    room.add(box, mtx([BX(cx), BY(wy) + ww * 0.12, zB + 1.2], [0, 0, 0], [1.6, wh + ww / 2, 1]), woodD);
    room.add(box, mtx([BX(cx), BY(wy), zB + 1.2], [0, 0, 0], [ww, 1.6, 1]), woodD);
    // a faint beam of light falling into the room
    if (!dark && world !== 3) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(ww * 1.1, wh * 2.2), new THREE.MeshBasicMaterial({ map: beamTexture(), color: new THREE.Color(W.window).multiplyScalar(0.22), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      beam.position.set(BX(cx) + wh * 0.35, BY(wy) - wh * 1.05, zB + 3); beam.rotation.z = 0.32; scene.add(beam);
    }
    if (W.snow) room.add(rbox, mtx([BX(cx), BY(wy + wh / 2) + 4, zB + 4], [0, 0, 0], [ww + 12, 2.5, 7]), 0xffffff);
    if (W.ivy && rand() < 0.7) fol.add(vine(rng(90 + cx + wy), 1, 12), mtx([BX(cx - ww / 2 - 3), BY(wy - wh / 2 - 4), zB + 4.5], [0, 0, 0.1], [20, wh * 0.8, 1]));
    if (world === 1 && rand() < 0.6) { // a striped cloth awning over the window
      for (let k = 0; k < 4; k++) room.add(box, mtx([BX(cx - ww / 2 - 4 + (k + 0.5) * (ww + 8) / 4), BY(wy - wh / 2 - ww / 2 - 9), zB + 7], [0.5, 0, 0], [(ww + 8) / 4, 8, 1]), k % 2 ? 0xfff0d8 : W.banner[0]);
    }
  };
  const torch = (tx, ty) => {
    room.add(box, mtx([BX(tx), BY(ty + 5), zB + 3], [0, 0, 0], [3, 12, 3]), W.metal);
    room.add(cyl, mtx([BX(tx), BY(ty - 2), zB + 4], [0, 0, 0], [3.6, 5, 3.6]), W.metal);
    room.add(box, mtx([BX(tx), BY(ty + 12), zB + 1.5], [0, 0, 0], [7, 3, 2]), W.metal);
    roomGlow.add(glowBall, mtx([BX(tx), BY(ty - 7), zB + 4], [0, 0, 0], [2.6, 4.4, 2.6]), new THREE.Color(W.torch).multiplyScalar(2.2));
    lamps.push({ x: BX(tx), y: BY(ty - 8), z: zB + 9, color: W.torch, power: 0.5, flame: 6, room: true });
  };
  // windows and torches on a loose lattice over the whole back wall, wherever a room has the space
  const cols = 3, used = [];
  for (let row = 0, y = b[1] + 72; y < b[3] - 70; y += 150, row++) {
    for (let k = 0; k < cols; k++) {
      const ww = 28, wh = 46;
      for (const dx of [0, -26, 26, -48, 48]) {
        const cx = b[0] + ((b[2] - b[0]) * (k + 0.5)) / cols + dx;
        if (boxIn(cx - ww / 2 - 9, y - wh / 2 - ww / 2 - 10, cx + ww / 2 + 9, y + wh / 2 + 10)) {
          if (rand() < 0.62) { window_(cx, y, ww, wh); used.push([cx, y]); }
          break;
        }
      }
    }
    for (let k = 0; k <= cols; k++) {
      const tx = k === 0 ? b[0] + 16 : k === cols ? b[2] - 16 : b[0] + ((b[2] - b[0]) * k) / cols, ty = y - 6;
      if (used.some(([ux, uy]) => Math.abs(ux - tx) < 30 && Math.abs(uy - y) < 40)) continue;
      if (boxIn(tx - 9, ty - 16, tx + 9, ty + 16) && rand() < 0.75) torch(tx, ty);
    }
  }
  // floors and ceilings: every level stretch of wall gets a skirting board above, a beam with corbels below,
  // things standing along it (moss, mushrooms, pots, crystals) and things hanging from it (roots, icicles, chains)
  const levels = L.walls.filter(([ax, ay, bx, by]) => Math.abs(by - ay) < Math.abs(bx - ax) * 0.25 && Math.abs(bx - ax) > 30);
  for (const [ax, ay, bx, by] of levels) {
    const x0 = Math.min(ax, bx) + 7, x1 = Math.max(ax, bx) - 7, y = (ay + by) / 2, len = x1 - x0;
    // skirting above (this is a floor) and a beam below (a ceiling)
    if (boxIn(x0 + len * 0.3, y - 22, x0 + len * 0.7, y - 10)) {
      room.add(box, mtx([BX((x0 + x1) / 2), BY(y - 12), zB + 1], [0, 0, 0], [len + 4, 9, 2]), world === 0 ? woodC : trim.clone().multiplyScalar(0.8));
      room.add(box, mtx([BX((x0 + x1) / 2), BY(y - 16.5), zB + 1.6], [0, 0, 0], [len + 4, 1.4, 2.4]), world === 0 ? woodD : trim.clone().multiplyScalar(0.65));
    }
    if (y < b[3] - 20 && boxIn(x0 + len * 0.3, y + 10, x0 + len * 0.7, y + 20)) {
      room.add(box, mtx([BX((x0 + x1) / 2), BY(y + 12), zB + 3], [0, 0, 0], [len + 4, 7, 6]), world === 0 ? woodD : trim.clone().multiplyScalar(0.7));
      for (let x = x0 + 10; x < x1 - 6; x += 34) if (boxIn(x - 3, y + 14, x + 3, y + 24)) room.add(rbox, mtx([BX(x), BY(y + 20), zB + 4], [0, 0, 0], [6, 10, 8]), world === 0 ? woodD : trim.clone().multiplyScalar(0.75));
    }
    for (let x = x0 + 4; x < x1 - 4; x += 6 + rand() * 9) {
      const fy = y - 7, z = ZB + 4 + rand() * 7;
      if (!boxIn(x - 3, fy - 10, x + 3, fy - 2)) continue;
      if (W.ivy || world === 3) fol.add(tufts[(rand() * 3) | 0], mtx([BX(x), BY(fy) - 0.5, z], [0, rand() * 6, 0], [6, 3.5 + rand() * 4, 6]), world === 3 ? 0x7a5a6a : 0xffffff);
      if (rand() < 0.1) {
        if (world === 0) { room.add(cyl, mtx([BX(x), BY(fy) + 3, z], [0, 0, 0], [1, 6, 1]), 0xf3ead8); room.add(ball, mtx([BX(x), BY(fy) + 6.5, z], [0, 0, 0], [3.6, 2.2, 3.6]), 0xd94a3a); }
        else if (world === 1) { room.add(cyl, mtx([BX(x), BY(fy) + 5, z], [0, 0, 0], [4, 10, 4]), 0xc06a3a); room.add(cyl, mtx([BX(x), BY(fy) + 10.5, z], [0, 0, 0], [2.4, 2, 2.4]), 0xa0502a); }
        else if (world === 2) roomGlow.add(oct, mtx([BX(x), BY(fy) + 6, z], [0, rand(), 0.2], [3, 8, 3]), new THREE.Color(0x9fd8ff).multiplyScalar(0.9));
        else roomGlow.add(oct, mtx([BX(x), BY(fy) + 7, z], [0, rand(), 0.2], [3.4, 10, 3.4]), new THREE.Color(rand() < 0.5 ? 0x9a4af0 : 0x2ad8c0).multiplyScalar(1.4));
      }
    }
    if (y >= b[3] - 20) continue;
    for (let x = x0 + 8; x < x1 - 8; x += 9 + rand() * 16) {
      const cy = y + 7, z = ZB + 3 + rand() * 5;
      if (!boxIn(x - 3, cy + 2, x + 3, cy + 12)) continue;
      if (world === 0 && rand() < 0.5) fol.add(vine(rng(200 + x + y), 1, 8, [0.32, 0.26, 0.16]), mtx([BX(x), BY(cy + 4), z], [0, 0, 0], [14, 12 + rand() * 24, 1]));
      else if (world === 2) roomGlow.add(cone5, mtx([BX(x), BY(cy) - 5, z], [Math.PI, 0, 0], [2, 6 + rand() * 12, 2]), new THREE.Color(0xd8f0ff).multiplyScalar(dark ? 0.5 : 0.85));
      else if (world === 3 && rand() < 0.2) { for (let k = 0; k < 4; k++) room.add(new THREE.TorusGeometry(2, 0.7, 4, 8), mtx([BX(x), BY(cy + 6 + k * 4), z], [0, k % 2 ? Math.PI / 2 : 0, Math.PI / 2], 1), W.metal); }
    }
  }
  // loose, sunken and mossy bricks scattered over the back wall
  for (let k = 0; k < (low ? 10 : 60); k++) {
    const x = b[0] + 12 + rand() * (b[2] - b[0] - 24), y = b[1] + 10 + rand() * (b[3] - b[1] - 20);
    if (!boxIn(x - 9, y - 5, x + 9, y + 5)) continue;
    const sunk = rand() < 0.35, c = backC.clone().multiplyScalar(sunk ? 0.55 : 0.9 + rand() * 0.25);
    room.add(rbox, mtx([BX(x), BY(y), zB + (sunk ? -0.2 : 0.9)], [0, 0, (rand() - 0.5) * 0.08], [14 + rand() * 4, 6, sunk ? 0.6 : 2.4]), c);
    if (W.moss && rand() < 0.4) room.add(ball, mtx([BX(x + (rand() - 0.5) * 8), BY(y + 3), zB + 1.6], [0, 0, 0], [5 + rand() * 4, 2, 1.2]), 0x5a8a3a);
  }
  // per room: a shelf, a hanging tapestry, crystals or alien pipes where the wall is still bare
  for (const r of regions) {
    const w = r.x1 - r.x0, h = r.y1 - r.y0, cx = (r.x0 + r.x1) / 2;
    if (r.area < 1600 || w < 40 || h < 40) continue;
    if (w >= 64 && h >= 60) {
      const sy = r.y1 - Math.min(52, h * 0.42), left = rand() < 0.5, sw = Math.min(62, w * 0.42), sx0 = left ? r.x0 + 8 : r.x1 - 8 - sw, sx1 = sx0 + sw;
      if (r.free(sx0, sy - 22, sx1, sy + 6) && !used.some(([ux, uy]) => Math.abs(ux - (sx0 + sx1) / 2) < 50 && Math.abs(uy - sy) < 50)) {
        room.add(box, mtx([BX((sx0 + sx1) / 2), BY(sy) - 1.5, ZB + 5], [0, 0, 0], [sx1 - sx0, 3, 11]), woodC);
        for (const bx of [sx0 + 6, sx1 - 6]) room.add(box, mtx([BX(bx), BY(sy + 5), ZB + 3], [0, 0, 0], [2.5, 8, 5]), woodD);
        shelfItems(sx0, sx1, sy);
      }
    }
    if (world === 1 && w >= 60 && h >= 120) { // a patterned rug on the wall
      const tx = r.x0 + w * (rand() < 0.5 ? 0.28 : 0.72), ty = r.y0 + h * 0.5, tw = 26, th = 48;
      if (r.free(tx - tw / 2 - 4, ty - th / 2 - 6, tx + tw / 2 + 4, ty + th / 2 + 4) && !used.some(([ux, uy]) => Math.abs(ux - tx) < 40 && Math.abs(uy - ty) < 60)) {
        room.add(cyl, mtx([BX(tx), BY(ty - th / 2 - 2), zB + 3], [0, 0, Math.PI / 2], [1.4, tw + 8, 1.4]), W.metal);
        for (let k = 0; k < 6; k++) room.add(box, mtx([BX(tx), BY(ty - th / 2 + (k + 0.5) * th / 6), zB + 2], [0, 0, 0], [tw, th / 6, 0.8]), [0xc8483a, 0xe8b04a, 0x2aa6a0, 0xe8b04a, 0xc8483a, 0x7a3a5a][k]);
        used.push([tx, ty]);
      }
    }
    if (world === 2 && h >= 50) for (const [cxr, cyr] of [[r.x0 + 8, r.y1 - 8], [r.x1 - 8, r.y1 - 8]]) { // ice crystal clusters in the corners
      if (!r.free(cxr - 6, cyr - 16, cxr + 6, cyr)) continue;
      for (let k = 0; k < 4; k++) roomGlow.add(oct, mtx([BX(cxr + (rand() - 0.5) * 10), BY(cyr) + 4, ZB + 5 + rand() * 6], [0, rand() * 3, (rand() - 0.5) * 0.8], [2.6, 7 + rand() * 9, 2.6]), new THREE.Color(0xbfe8ff).multiplyScalar(dark ? 0.7 : 1.05));
    }
    if (world === 3 && w >= 80 && h >= 80 && r.free(r.x0 + 4, r.y0 + 14, r.x1 - 4, r.y0 + 22)) { // alien pipes with glowing teal bands
      room.add(cyl, mtx([BX(cx), BY(r.y0 + 18), ZB + 4], [0, 0, Math.PI / 2], [3.2, w - 10, 3.2]), 0x4a4a5a);
      for (let x = r.x0 + 14; x < r.x1 - 10; x += 30) roomGlow.add(cyl, mtx([BX(x), BY(r.y0 + 18), ZB + 4], [0, 0, Math.PI / 2], [3.6, 4, 3.6]), new THREE.Color(0x2ad8c0).multiplyScalar(1.3));
    }
    if (world === 3 && h >= 70) { // magma veins in the back wall
      const vx = r.x0 + w * (0.2 + rand() * 0.6);
      let px = vx, py = r.y0 + 10;
      for (let k = 0; k < 8 && py < r.y1 - 10; k++) {
        const nxp = px + (rand() - 0.5) * 22, nyp = py + 8 + rand() * 12;
        if (!r.free(Math.min(px, nxp) - 2, py, Math.max(px, nxp) + 2, nyp)) break;
        const len = Math.hypot(nxp - px, nyp - py);
        roomGlow.add(box, mtx([BX((px + nxp) / 2), BY((py + nyp) / 2), zB + 0.3], [0, 0, -Math.atan2(nyp - py, nxp - px)], [len + 1, 1.3, 0.4]), new THREE.Color(0xff6a20).multiplyScalar(1.1));
        px = nxp; py = nyp;
      }
    }
    // Pip's room: a rug and a little bed of straw for Biscuit
    if (zone && cx > zone[0] && cx < zone[2] && r.y1 > zone[1] && r.y1 <= zone[3] + 8) {
      room.add(box, mtx([BX(cx), BY(r.y1) + 0.6, ZB + 14], [0, 0, 0], [Math.min(70, w * 0.6), 1.2, 22]), 0xb4432a);
      room.add(box, mtx([BX(cx), BY(r.y1) + 0.8, ZB + 14], [0, 0, 0], [Math.min(60, w * 0.5), 1.3, 16]), 0xe8b04a);
    }
  }
  // the zone of Pip's room glows softly
  if (zone) {
    const [zx0, zy0, zx1, zy1] = zone;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(zx1 - zx0, zy1 - zy0), new THREE.MeshBasicMaterial({ color: 0x7ff0d0, transparent: true, opacity: 0.08, depthWrite: false, fog: false }));
    g.position.set(BX((zx0 + zx1) / 2), BY((zy0 + zy1) / 2), ZB + 0.3); scene.add(g);
  }
  // soft contact shade where walls meet the back wall (ambient occlusion), and a little grime and moss on it
  {
    const ao = new THREE.Mesh(aoStrips(L.walls), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: dark ? 0.42 : 0.34, depthWrite: false, vertexColors: true, fog: false }));
    ao.position.z = ZB + 0.2; scene.add(ao);
  }

  // finish the batches
  if (!fol.empty) scene.add(fol.mesh({ roughness: 0.9, side: THREE.DoubleSide }));
  if (!stones.empty) scene.add(Object.assign(stones.mesh({ roughness: 0.9 }), { castShadow: true }));
  if (!woodB.empty) scene.add(Object.assign(woodB.mesh({ roughness: 0.7 }), { castShadow: true }));
  if (!quoin.empty) scene.add(Object.assign(quoin.mesh({ roughness: 0.85 }), { castShadow: true }));
  if (!sideStone.empty) scene.add(Object.assign(sideStone.mesh({ roughness: 0.85, side: THREE.DoubleSide }), { castShadow: true }));
  if (!brass.empty) scene.add(brass.mesh({ roughness: 0.3, metalness: 0.8 }));
  if (!room.empty) scene.add(Object.assign(room.mesh({ roughness: 0.75 }), { castShadow: true }));
  if (!roomGlow.empty) scene.add(roomGlow.mesh({ glow: true }));
  if (!glow.empty) scene.add(glow.mesh({ glow: true }));

  // warm light from the lamps: real point lights for the strongest (cheap here, it is baked once), halos for all
  const lit = lamps.filter((l) => l.room).slice(0, low ? 0 : 6).concat(lamps.filter((l) => !l.room).slice(0, low ? 0 : 4));
  for (const l of lit) {
    const p = new THREE.PointLight(l.color, (l.room ? 9000 : 14000) * l.power * (dark ? 1.6 : 1), l.room ? 120 : 160, 2);
    p.position.set(l.x, l.y, l.z + (l.room ? 6 : 10)); scene.add(p);
  }
  for (const l of lamps) {
    const q = glowQuad(l.flame ? 22 : 30, l.color, dark ? 0.55 : 0.32);
    q.position.set(l.x, l.y, l.z + 2); scene.add(q);
    if (l.flame) torches.push({ x: l.x, y: l.y, z: l.z + 3, color: l.color, size: l.flame });
  }

  return {
    scene, textures, torches,
    ambient: W.ambient,
    /** Size the sky to the camera's view (call before every bake). */
    fit(camera, res) {
      const d = camera.position.z - sky.position.z, tanH = Math.tan((camera.fov * Math.PI) / 360);
      const vh = 2 * d * tanH * 1.08, vw = vh * camera.aspect;
      sky.scale.set(vw, vh, 1); sky.position.set(camera.position.x, camera.position.y, sky.position.z);
      skyMat.uniforms.aspect.value = vw / vh; skyMat.uniforms.res.value = res;
    },
    dispose() {
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material && !o.material.map?.isTexture) o.material.dispose?.(); });
      sun.shadow.map?.dispose();
    },
  };
}
const glowBlob = blob(1);
let beamTex = null;
/** A soft vertical streak (light falling through a window). */
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const g = c.getContext('2d'), gx = g.createLinearGradient(0, 0, 32, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 128); gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, 32, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

/** A wall segment as a box (stone pattern stretched by length), like pips-tower-3d.js. */
function wallBox([ax, ay, bx, by], thick = 14, depth = DEPTH) {
  const len = Math.hypot(bx - ax, by - ay) + thick;
  const g = new THREE.BoxGeometry(len, thick, depth);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 64);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(BX((ax + bx) / 2), BY((ay + by) / 2), 0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan2(by - ay, bx - ax)), new THREE.Vector3(1, 1, 1)));
  return g;
}
function mergeBoxes(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
/** Dark strips fading out from both sides of every wall, laid on the back wall (vertex alpha in the red channel). */
function aoStrips(walls) {
  const P = [], C = [], I = [];
  for (const [ax, ay, bx, by] of walls) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, ext = 7, r = 26;
    const x0 = ax - (dx / l) * ext, y0 = ay - (dy / l) * ext, x1 = bx + (dx / l) * ext, y1 = by + (dy / l) * ext;
    for (const s of [-1, 1]) {
      const b = P.length / 3;
      const pts = [[x0 + nx * 7 * s, y0 + ny * 7 * s, 1], [x1 + nx * 7 * s, y1 + ny * 7 * s, 1], [x1 + nx * (7 + r) * s, y1 + ny * (7 + r) * s, 0], [x0 + nx * (7 + r) * s, y0 + ny * (7 + r) * s, 0]];
      for (const [x, y, a] of pts) { P.push(BX(x), BY(y), 0); C.push(0, 0, 0, a); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  g.setIndex(I);
  return g;
}
