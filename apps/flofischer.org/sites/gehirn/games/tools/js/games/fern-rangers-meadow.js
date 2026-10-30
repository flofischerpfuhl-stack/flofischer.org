/**
 * Fern Rangers, Fernhaven meadow (world 1): a composed march route instead of loose roadside props.
 *
 * Layers, from the road outwards: a flowering verge, hedge and fence runs that frame the road with gaps for views,
 * groves of round trees and bushes on gentle side slopes, and a landmark every ~40 units (windmill hill, hamlet,
 * wheat field, camp, mill pond, orchard). Everything is merged, vertex-coloured geometry in 32-unit chunks that repeat
 * every P units; scrolling is one group offset (`update(pos)`), like the other Rangers route layers.
 *
 * Assets: the original Fernwork sculpts (tools/games-assets/models), the Fernworld meadow flora, and a few CC0 Kenney
 * pieces (tools/games-assets/kenney, Nature Kit and Fantasy Town Kit 2.0) recoloured to the same palette.
 */
import { THREE } from './three-kit.js';
import { loadModel } from './models.js';
import { Batch, mtx, rng, createNoise, smoothstep, flower, tuft } from './world/decor.js';
import { terrace, paintedGround, worldPalette, composeWorld } from './fern-rangers-worlds.js';
import { GLTFLoader } from '../../games-assets/fernworld/vendor/GLTFLoader.js';

const KENNEY = new URL('../../games-assets/kenney/', import.meta.url);
const gltf = new GLTFLoader();
const kenneyCache = new Map();
// Kenney greens and woods mapped onto the meadow palette (the trees and bushes of the original sculpts).
const RECOLOUR = [
  { test: (c) => c.g > c.r * 1.15 && c.g > c.b * 1.05, to: new THREE.Color(0x4f9a35), keep: 0.35 },
];

/** A Kenney GLB as [{ mat, geometry }] with vertex colours taken from its material or colour-map texture. */
export function kenneyModel(path, { recolour = true, grey = null } = {}) {
  const key = path + (grey ? ':' + grey : '');
  if (!kenneyCache.has(key)) kenneyCache.set(key, (async () => {
    const g = await gltf.loadAsync(new URL(`${path}.glb`, KENNEY).href);
    g.scene.updateMatrixWorld(true);
    const parts = [];
    let pixels = null;
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) geo.setIndex(geo.index.clone());
      const m = Array.isArray(o.material) ? o.material[0] : o.material, base = m.color.clone(), N = geo.attributes.position.count;
      const col = new Float32Array(N * 3), uv = geo.attributes.uv, c = new THREE.Color();
      if (m.map?.image && uv) {
        if (!pixels) {
          const im = m.map.image, cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
          const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0); pixels = { data: ctx.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height };
        }
        for (let i = 0; i < N; i++) {
          const x = Math.min(pixels.w - 1, Math.max(0, Math.floor((uv.getX(i) % 1) * pixels.w))), y = Math.min(pixels.h - 1, Math.max(0, Math.floor((uv.getY(i) % 1) * pixels.h))), k = (y * pixels.w + x) * 4;
          c.setRGB(pixels.data[k] / 255, pixels.data[k + 1] / 255, pixels.data[k + 2] / 255, THREE.SRGBColorSpace);
          col.set([c.r, c.g, c.b], i * 3);
        }
      } else for (let i = 0; i < N; i++) col.set([base.r, base.g, base.b], i * 3);
      if (recolour) for (let i = 0; i < N; i++) {
        c.fromArray(col, i * 3);
        for (const r of RECOLOUR) if (r.test(c)) { const l = (c.r + c.g + c.b) / 3; c.lerp(r.to.clone().multiplyScalar(0.7 + l), 1 - r.keep); }
        // optional: low-saturation light parts (e.g. the stone planter under a hedge) take another colour
        if (grey && c.g < c.r * 1.12 + 0.02 && c.g > 0.12) c.set(grey);
        c.toArray(col, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      parts.push({ mat: 'matte', ch: 'body', geometry: geo });
    });
    return parts;
  })());
  return kenneyCache.get(key);
}

const CH = 32;
/** A strip of chunky grass spikes, 1 unit long (console-map style lawn edge), dark at the root, light at the tips. */
function frill(height = 0.34, spikes = 7, rows = 2) {
  const pos = [], col = [], root = new THREE.Color(0x2f7a1e), tip = new THREE.Color(0x8fd04e);
  for (let r = 0; r < rows; r++) for (let k = 0; k < spikes; k++) {
    const x0 = k / spikes - 0.5 + (r ? 0.5 / spikes : 0), x1 = x0 + 1 / spikes, xm = (x0 + x1) / 2 + (r ? 0.02 : -0.02), h = height * (0.75 + ((k * 7 + r * 3) % 5) * 0.1), zr = r ? -0.06 : 0.04;
    pos.push(x0, 0, zr, x1, 0, zr, xm, h, zr + 0.02);
    col.push(...root.toArray(), ...root.toArray(), ...tip.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 0.6, 0.8]).flat(), 3));
  return g;
}
/**
 * Stylised mown lawn (one tile = 10 units): two broad soft bands of light and deeper green across the road, a gentle
 * wave in the band edges and a faint fleck of blades — low frequency like a hand-painted console map, not a photo.
 */
let lawn = null;
export function lawnTexture() {
  if (lawn) return lawn;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S), A = [0x3f, 0x96, 0x24], B = [0x74, 0xc4, 0x3a];
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fleck = new Float32Array(S * S); for (let i = 0; i < 2600; i++) { const x = (r() * S) | 0, y = (r() * S) | 0, v = (r() - 0.5) * 0.12; for (let k = 0; k < 3; k++) fleck[((y + k) % S) * S + x] += v; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // band position along the road (v), with a wave across it; tileable in both directions
    const v = y / S + 0.035 * Math.sin((x / S) * Math.PI * 2) + 0.015 * Math.sin((x / S) * Math.PI * 6 + 1);
    const t = 0.5 + 0.5 * Math.sin(v * Math.PI * 2), band = t * t * (3 - 2 * t), f = 1 + fleck[y * S + x];
    const i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, (A[c] + (B[c] - A[c]) * band) * f));
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  lawn = new THREE.CanvasTexture(cv); lawn.colorSpace = THREE.SRGBColorSpace; lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping; lawn.anisotropy = 4;
  return lawn;
}

/** The meadow side slope: rises from flat verges into hills, periodic in z with period P. */
export function meadowHeight(x, z, P, noise) {
  const a = Math.abs(x), t = (z / P) * Math.PI * 2;
  const ripple = 0.5 + 0.5 * Math.sin(t * 2 + Math.sign(x) * 1.7) * Math.cos(t * 3 - x * 0.05);
  const wobble = noise.fbm2(Math.cos(t) * 3 + x * 0.04, Math.sin(t) * 3, 3) * 0.5 + 0.5;
  return smoothstep(8.5, 26, a) * (1.2 + ripple * 2.6 + wobble * 2.2) + smoothstep(26, 70, a) * (3 + wobble * 6);
}

export class MeadowScenery {
  /** library: the Rangers ChannelLibrary (Fernworld meadow flora); road: half width of the road. */
  static async create({ library, road = 3, P = 256, low = false, world = 'meadow' }) {
    const self = new MeadowScenery();
    self.P = P; self.group = new THREE.Group(); self.chunks = []; self.windmills = [];
    const noise = createNoise(41), rand = rng(1337);
    const old = async (n) => loadModel(n, 'lo');
    const [tree, bush, cottage, rock, windmill, fernA, log, stump, hedge, fence, gateK, lantern, wheat, pumpkin, tent, fire, logs, stall, cart, roof] = world !== 'meadow' ? [] : await Promise.all([
      old('TREE_ROUND'), old('BUSH'), old('COTTAGE'), old('ROCK'), old('WINDMILL'),
      library.model('meadow_fern_arching', 'lo'), library.model('woodland_fallen_log', 'lo'), library.model('woodland_stump_rings', 'lo'),
      kenneyModel('town/hedge-large', { grey: 0x3f6a2a }), kenneyModel('nature/fence_simple', { recolour: false }), kenneyModel('nature/fence_gate', { recolour: false }), kenneyModel('town/lantern', { recolour: false }),
      kenneyModel('nature/crops_wheatStageB', { recolour: false }), kenneyModel('nature/crop_pumpkin', { recolour: false }), kenneyModel('nature/tent_detailedOpen', { recolour: false }),
      kenneyModel('nature/campfire_stones', { recolour: false }), kenneyModel('nature/log_stack', { recolour: false }), kenneyModel('town/stall-green', { recolour: false }), kenneyModel('town/cart', { recolour: false }),
      kenneyModel('town/banner-green', { recolour: false }),
    ]);
    const NC = Math.ceil(P / CH), chunks = Array.from({ length: NC }, () => ({ matte: new Batch(), glow: new Batch() }));
    // levelled terraces (the wheat field, ponds, streams) are cut into the slope: terrain, soil and props share one height
    const pads = [], levels = new Map();
    const pad = (x0, x1, z0, z1, y, edge = 2.4) => { const p = { x0, x1, z0, z1, y, edge }; pads.push(p); return p; };
    const K = { meadow: 1, dunes: 1.15, frost: 1, ember: 1.25 }[world];
    const baseH = (x, z) => terrace(world, meadowHeight(x, z, P, noise) * K, Math.abs(x));
    const H = (x, z) => {
      let h = baseH(x, z);
      for (const p of pads) {
        const d = Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1, 0);
        if (d < p.edge) h += (p.y - h) * (1 - smoothstep(0, p.edge, d));
      }
      return h;
    };
    const field = world === 'meadow' ? pad(-16, -8.3, -144, -128.5, baseH(-12, -136) + 0.1) : null;
    // place a model; z in (−P, 0]; y follows the slope (lowest corner, so nothing floats)
    // soft contact shadows under everything that stands on the ground (the scenery casts no real shadows)
    const shadows = [], footprint = new Map();
    const foot = (model) => {
      if (!footprint.has(model)) { const b = new THREE.Box3(); for (const g of model) { g.geometry.computeBoundingBox(); b.union(g.geometry.boundingBox); } footprint.set(model, [b.max.x - b.min.x, b.max.z - b.min.z]); }
      return footprint.get(model);
    };
    let grassTuft = null; // set below; tufts around the feet of props
    const put = (model, x, z, { yaw = 0, s = 1, tint = 0xffffff, sink = 0.04, sx = 1, sy = 1, y = null, shade = true, tufts = shade ? 4 : 0 } = {}) => {
      const zz = ((z % P) - P) % P, bin = chunks[Math.min(NC - 1, Math.floor(-zz / CH))];
      const r = 0.35 * s, ground = y ?? Math.min(H(x, zz), H(x + r, zz), H(x - r, zz), H(x, zz + r), H(x, zz - r));
      const m = mtx([x, ground - sink * s, zz], [0, yaw, 0], [s * sx, s * sy, s]), t = tint instanceof THREE.Color ? tint : new THREE.Color(tint);
      for (const g of model) {
        if (g.ch === 'spin') continue;
        (g.mat === 'glow' ? bin.glow : bin.matte).add(g.geometry, m, t);
      }
      if (shade) {
        const [fx, fz] = foot(model), w = fx * s * sx, d = fz * s;
        // the sun stands left, high and in front: a dark core at the foot, and a long soft shadow falling right and back
        const gy = Math.max(H(x, zz), ground) + 0.03;
        shadows.push({ x, y: gy, z: zz, w: w * 1.05, d: d * 1.05, yaw, k: 1 });
        shadows.push({ x: x + 0.35 * w, y: gy + 0.002, z: zz - 0.25 * d, w: w * 1.5, d: d * 1.7, yaw: yaw * 0.3 - 0.5, k: 0.55 });
      }
      // grass grows around the foot, so the prop stands in the meadow instead of on it
      if (tufts && grassTuft) {
        const [fx, fz] = foot(model), rx = fx * s * sx * 0.5, rz = fz * s * 0.5;
        for (let i = 0; i < tufts; i++) {
          const a = (i / tufts) * 6.283 + rand() * 0.8, tx = x + Math.cos(a) * rx * (0.85 + rand() * 0.3), tz = z + Math.sin(a) * rz * (0.85 + rand() * 0.3), tzz = ((tz % P) - P) % P;
          const tb = chunks[Math.min(NC - 1, Math.floor(-tzz / CH))];
          tb.matte.add(grassTuft[0].geometry, mtx([tx, H(tx, tzz), tzz], [0, -a + Math.PI / 2, 0], [0.7, 0.7 + rand() * 0.5, 0.7]), 0xffffff);
        }
      }
    };
    const green = (k) => new THREE.Color().setHSL(0.27 + (rand() - 0.5) * 0.05, 0.55 + rand() * 0.15, 0.42 + rand() * 0.1).multiplyScalar(k);
    const leafTint = () => new THREE.Color().setRGB(0.86 + rand() * 0.22, 0.9 + rand() * 0.18, 0.78 + rand() * 0.2);

    // 1. The slopes themselves: two strips of terrain per chunk, so each chunk can be culled (built after the
    // composition, which may cut terraces into them).
    const buildTerrain = () => {
      const pal = world === 'meadow' ? null : worldPalette(world);
      const c0 = new THREE.Color(0xf2f6ea), c1 = new THREE.Color(0xffffff), c2 = new THREE.Color(0xd8e6c8), cFar = pal ? new THREE.Color(pal.far) : new THREE.Color(0xd6e8e4), c = new THREE.Color();
      const cTint = pal ? new THREE.Color(...pal.tint) : null, cRiser = new THREE.Color(...(pal ? pal.riser : [2.3, 0.25, 1.1]));
      const xs = []; for (let x = 6.5; x < 56; x += x < 26 ? 1.5 : 5) xs.push(x);
      for (let k = 0; k < NC; k++) for (const side of [-1, 1]) {
        const zs = []; for (let z = -k * CH; z >= -(k + 1) * CH - 0.001; z -= 2) zs.push(z);
        const pos = [], col = [], idx = [], uv = [];
        for (const z of zs) for (const ax of xs) {
          const x = side * ax, y = H(x, z) - 0.03; pos.push(x, y, z); uv.push(x / 10, z / 10);
          const n = noise.fbm2(x * 0.12, z * 0.12, 3) * 0.5 + 0.5, slope = smoothstep(9, 20, ax);
          if (pal) c.copy(c1).multiply(cTint).multiplyScalar(0.92 + n * 0.16).lerp(cFar, smoothstep(30, 85, ax) * 0.5);
          else c.copy(c0).lerp(c1, n * 0.8).lerp(c2, smoothstep(0.62, 0.9, noise.fbm2(x * 0.05 + 7, z * 0.05, 2) * 0.5 + 0.5) * 0.5 * slope).lerp(cFar, smoothstep(30, 85, ax) * 0.55);
          // steep risers between the terraces show earth or rock
          const steep = smoothstep(0.3, 0.85, Math.hypot(H(x + 0.7, z) - H(x - 0.7, z), H(x, z + 0.7) - H(x, z - 0.7)) / 1.4);
          c.lerp(cRiser, steep * 0.9);
          col.push(c.r, c.g, c.b);
        }
        const nx = xs.length;
        for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
          if (side > 0) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e); // counter-clockwise seen from above
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        chunks[k].terrain = (chunks[k].terrain || []).concat(g);
      }
    };

    const edge = road + 0.35;
    if (world !== 'meadow') {
      const glowAt = (geo, x, y, z, col, k = 1) => { const zz = ((z % P) - P) % P; chunks[Math.min(NC - 1, Math.floor(-zz / CH))].glow.add(geo, mtx([x, y, zz], [0, 0, 0], 1), new THREE.Color(col).multiplyScalar(k)); };
      const flatBox = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 24);
      await composeWorld(world, {
        put, rand, edge, P, H,
        model: (id) => library.model(id, 'lo'), old, kenney: (p, o = { recolour: false }) => kenneyModel(p, o),
        tint: (b, j) => new THREE.Color(b[0], b[1], b[2]).multiplyScalar(1 - j / 2 + rand() * j),
        glow: glowAt,
        glowCrack: (x, z, len, yaw) => { const zz = ((z % P) - P) % P, bin = chunks[Math.min(NC - 1, Math.floor(-zz / CH))]; bin.glow.add(flatBox, mtx([x, H(x, zz) + 0.13, zz], [0, yaw, 0], [0.16, 0.05, len]), new THREE.Color(0xff6a20).multiplyScalar(1.5)); },
        disc: (x, z, r, col, dy = 0, glow = false) => { const zz = ((z % P) - P) % P, bin = chunks[Math.min(NC - 1, Math.floor(-zz / CH))], gy = discY(x, zz, r); (glow ? bin.glow : bin.matte).add(cyl, mtx([x, gy + dy, zz], [0, 0, 0], [r, 0.06, r]), glow ? new THREE.Color(col).multiplyScalar(1.5) : col); },
        stream: (x, z, len, w) => { const zz = ((z % P) - P) % P, y = discY(x, zz, 1, len / 2, w / 2) + 0.05, bin = chunks[Math.min(NC - 1, Math.floor(-zz / CH))]; bin.glow.add(flatBox, mtx([x, y, zz], [0, 0, 0], [w, 0.06, len]), new THREE.Color(0xff6a20).multiplyScalar(1.6)); },
      });
    }
    // a pad under a pond or stream: flatten the slope there once, return the level
    function discY(x, z, rx, rz = rx, hx = rx) { const key = x + ',' + z; if (!levels.has(key)) { const y = baseH(x, z) + 0.05; levels.set(key, y); pad(x - hx - 1.2, x + hx + 1.2, z - rz - 1.2, z + rz + 1.2, y - 0.03, 2.6); } return levels.get(key); }
    if (world === 'meadow') {
    // 2. The verge: flower clumps and tall grass between road edge and hedges, denser in the "flower meadow" stretches.
    // (low-poly procedural blossoms of the original road; the sculpted meadow flora is ~1k triangles per stem)
    const blossom = [[0xffffff, 0xffd23f, 8], [0xfff2a8, 0xff8a3d, 5], [0xf2a6c4, 0xffd23f, 5], [0xb9a6f2, 0xffd23f, 5], [0xff7a5c, 0xffd23f, 5]].map(([c, m, n]) => [{ mat: 'matte', geometry: flower(c, m, n) }]);
    grassTuft = [{ mat: 'matte', geometry: frill(0.3, 5, 2) }];
    for (const side of [-1, 1]) for (let z = -0.5; z > -P; z -= 0.7) {
      const bloom = 0.5 + 0.5 * Math.sin((z / P) * Math.PI * 8 + side);
      if (rand() > 0.3 + bloom * 0.5) continue;
      const x = side * (edge + 0.2 + rand() * 1.9), f = blossom[(rand() * (bloom > 0.6 ? 5 : 2)) | 0];
      for (let n = 0; n < 2 + ((rand() * 3) | 0); n++) put(f, x + (rand() - 0.5) * 0.5, z + (rand() - 0.5) * 0.5, { yaw: rand() * 6.3, s: 0.24 + rand() * 0.12, sink: 0, shade: false });
      if (rand() < 0.5) put(grassTuft, x + side * 0.4, z, { yaw: (rand() - 0.5) * 0.6, s: 0.8, sy: 0.7 + rand() * 0.4, sink: 0, shade: false });
    }
    // a spiky grass frill along both road edges, as console maps edge every lawn
    const edgeFrill = frill(0.34, 8, 2);
    for (const side of [-1, 1]) for (let z = -0.5; z > -P; z -= 0.9) {
      const zz = ((z % P) - P) % P, bin = chunks[Math.min(NC - 1, Math.floor(-zz / CH))];
      bin.matte.add(edgeFrill, mtx([side * (edge + 0.06), 0.2, zz], [0, -side * Math.PI / 2 + (rand() - 0.5) * 0.15, 0], [1.05, 0.8 + rand() * 0.4, 1]), 0xffffff);
    }
    // 3. Frame: hedge runs and fence runs with lanterns, broken by gaps where the view opens onto a landmark.
    const views = [-40, -88, -136, -184, -232].map((z) => [z - 10, z + 10]);
    const inView = (z, side) => views.some(([a, b], i) => (i % 2 ? 1 : -1) === side && z > a && z < b);
    for (const side of [-1, 1]) {
      const x = side * (edge + 2.35);
      for (let z = -1; z > -P; z -= 1) {
        if (inView(z, side)) continue;
        const run = Math.floor((z - side * 37) / 18) & 3; // 18-unit runs: hedge, hedge, fence, open
        if (run < 2 && (-z | 0) % 2 === 0) { put(hedge, x, z, { yaw: 0, s: 2, sx: 1.05, sy: 0.9 + 0.15 * Math.sin(z * 0.7), tint: leafTint(), sink: 0.13, tufts: 2 }); }
        else if (run === 2 && ((-z | 0) % 2 === 0)) {
          put(fence, x, z - 1, { yaw: Math.PI / 2, s: 2.0, tint: 0xc08a5a });
          if ((-z | 0) % 12 === 0) { put(lantern, x - side * 0.15, z, { s: 1.35 }); chunks[Math.min(NC - 1, Math.floor(((-z) % P) / CH))].glow.add(new THREE.SphereGeometry(0.09, 8, 6), mtx([x - side * 0.15, 1.95, z], [0, 0, 0], 1), new THREE.Color(0xffc870).multiplyScalar(1.6)); }
        }
      }
    }
    // 4. Groves: 3–6 round trees with bushes at their feet, alternating sides, open meadow in between.
    const grove = (cx, cz, n) => {
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.3, r = 0.8 + rand() * 2.6, x = cx + Math.cos(a) * r * 1.3, z = cz + Math.sin(a) * r;
        if (Math.abs(x) < edge + 3.6) continue;
        put(tree, x, z, { yaw: rand() * 6.3, s: 1.9 + rand() * 1.4, tint: leafTint(), sink: 0.06 });
      }
      for (let i = 0; i < n + 2; i++) {
        const x = cx + (rand() - 0.5) * 6, z = cz + (rand() - 0.5) * 5;
        if (Math.abs(x) < edge + 3.0) continue;
        put(bush, x, z, { yaw: rand() * 6.3, s: 1.4 + rand() * 1.2, tint: leafTint() });
      }
      if (rand() < 0.6) put(rock, cx + (rand() - 0.5) * 4, cz + (rand() - 0.5) * 3, { yaw: rand() * 6.3, s: 1.2 + rand() * 1.4, sink: 0.15 });
      if (rand() < 0.35) put(rand() < 0.5 ? log : stump, cx + (rand() - 0.5) * 4, cz + (rand() - 0.5) * 3, { yaw: rand() * 6.3, s: 1.1 });
      if (rand() < 0.5) put(fernA, cx + (rand() - 0.5) * 3, cz + (rand() - 0.5) * 3, { yaw: rand() * 6.3, s: 1.6 });
    };
    for (let z = -14, i = 0; z > -P; z -= 13, i++) {
      const side = i % 2 ? 1 : -1;
      if (inView(z, side)) continue;
      grove(side * (edge + 5.5 + rand() * 5), z, 3 + ((rand() * 3) | 0));
    }
    // background tree lines on the far slopes (both sides, always), so the horizon is never empty
    for (const side of [-1, 1]) for (let z = -3; z > -P; z -= 6.5) {
      const x = side * (22 + rand() * 26);
      put(tree, x, z + rand() * 3, { yaw: rand() * 6.3, s: 2.8 + rand() * 2.2, tint: leafTint().multiplyScalar(0.92) });
      if (rand() < 0.5) put(bush, x + (rand() - 0.5) * 6, z, { s: 2.2 + rand(), tint: leafTint() });
    }
    // 5. Landmarks, one per view gap.
    const landmark = [
      (z, side) => { // windmill hill with a cottage at its foot
        const x = side * 15; self.windmills.push({ x, z, s: 3.4, yaw: side * 0.5 }); put(windmill, x, z, { s: 3.4, yaw: side * 0.5 });
        put(cottage, x - side * 4.5, z + 4, { s: 3.2, yaw: side * 0.9 }); put(cart, x - side * 2.5, z + 6.5, { s: 1.7, yaw: 1.2 });
        for (let i = 0; i < 6; i++) put(bush, x + (rand() - 0.5) * 8, z + (rand() - 0.5) * 8, { s: 1.4 + rand(), tint: leafTint() });
      },
      (z, side) => { // hamlet: three cottages around a market stall, a banner over the lane
        const x = side * 13;
        for (const [dx, dz, yaw] of [[0, -3, 0.2], [-side * 4.5, 2, 1.4], [side * 4, 3.5, -1.1]]) put(cottage, x + dx, z + dz, { s: 3.4 + rand() * 0.6, yaw });
        put(stall, x - side * 3.2, z - 3.5, { s: 1.9, yaw: -side * 1.4 }); put(roof, x - side * 5.8, z, { s: 2.4, yaw: Math.PI / 2 });
        put(tree, x + side * 6, z - 6, { s: 3, tint: leafTint() }); put(tree, x - side * 1, z + 7, { s: 2.6, tint: leafTint() });
      },
      (z, side) => { // wheat field with pumpkins and a cart
        const x0 = side * 9, box = [{ mat: 'matte', geometry: new THREE.BoxGeometry(1, 1, 1) }];
        // tilled soil: a dark bed with one raised furrow per crop row, sunk into the meadow at the edges
        put(box, x0 + side * 3.15, z - 0.5, { s: 14.5, sx: 7.6 / 14.5, sy: 0.1 / 14.5, y: field.y - 0.02, sink: 0, tint: 0x4a3220, shade: false });
        for (let r = 0; r < 7; r++) put(box, x0 + side * r * 1.05, z - 0.5, { s: 14, sx: 0.62 / 14, sy: 0.16 / 14, y: field.y - 0.01, sink: 0, tint: 0x6b4a2c, shade: false });
        for (let r = 0; r < 7; r++) for (let c = 0; c < 11; c++) put(wheat, x0 + side * r * 1.05, z - 7 + c * 1.3, { s: 1.6 + rand() * 0.3, yaw: rand() * 0.4, tint: 0xf0c45a, shade: false });
        for (let i = 0; i < 8; i++) put(pumpkin, x0 + side * (8 + rand() * 3), z - 5 + rand() * 10, { s: 1.6, yaw: rand() * 6.3, shade: false });
        put(cart, x0 + side * 9.5, z + 6, { s: 1.8, yaw: 0.6 }); put(fence, x0 - side * 0.8, z - 8, { s: 2, yaw: 0 });
      },
      (z, side) => { // ranger camp: tent, fire, log stack and the company banner
        const x = side * 9.5;
        put(tent, x, z - 1, { s: 3.2, yaw: side * 1.3 }); put(tent, x + side * 3.6, z + 3, { s: 2.8, yaw: side * 0.6 });
        put(fire, x - side * 2.3, z + 2, { s: 2.2 }); put(logs, x - side * 3.8, z + 0.5, { s: 2.2, yaw: 0.7 }); put(roof, x - side * 1.5, z - 4.5, { s: 2.6, yaw: Math.PI / 2 });
        chunks[Math.min(NC - 1, Math.floor((-z % P) / CH))].glow.add(new THREE.ConeGeometry(0.35, 0.9, 7), mtx([x - side * 2.3, H(x - side * 2.3, z + 2) + 0.55, z + 2], [0, 0, 0], 1), new THREE.Color(0xff9a3a).multiplyScalar(1.7));
        for (let i = 0; i < 4; i++) put(tree, x + side * (5 + rand() * 4), z + (rand() - 0.5) * 9, { s: 2.4 + rand(), tint: leafTint() });
      },
      (z, side) => { // orchard rows of small round trees, a second windmill on the ridge behind
        const x0 = side * 9;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) put(tree, x0 + side * r * 3.2, z - 5 + c * 3.3, { s: 1.6 + rand() * 0.3, tint: new THREE.Color().setRGB(1.05, 0.95, 0.85) });
        self.windmills.push({ x: side * 26, z: z - 4, s: 4.2, yaw: -side * 0.4 }); put(windmill, side * 26, z - 4, { s: 4.2, yaw: -side * 0.4 });
      },
    ];
    views.forEach(([a, b], i) => landmark[i % landmark.length]((a + b) / 2, i % 2 ? 1 : -1));
    }
    buildTerrain();

    // assemble: one opaque mesh (terrain + props share the lambert-ish standard material) and one glow mesh per chunk
    // Lambert: the scenery is matte and fills most of the screen, so it takes the cheapest lit shading (HD 630 budget)
    const matte = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // the slopes carry the same painted grass as the flat road-side ground (10 units per tile)
    const slope = new THREE.MeshLambertMaterial({ vertexColors: true });
    slope.map = world === 'meadow' ? lawnTexture() : paintedGround(world);
    self.materials = [matte, glow, slope];
    chunks.forEach((c, k) => {
      const g = new THREE.Group(); g.userData.z = -(k + 0.5) * CH;
      for (const t of c.terrain || []) { const m = new THREE.Mesh(t, slope); m.receiveShadow = true; g.add(m); }
      if (!c.matte.empty) { const m = new THREE.Mesh(c.matte.geometry(), matte); m.receiveShadow = true; g.add(m); }
      if (!c.glow.empty) g.add(new THREE.Mesh(c.glow.geometry(), glow));
      self.group.add(g); self.chunks.push(g);
    });
    // the next repeat follows right behind (shared geometry), so the far road is never bare late in a level
    for (const g of [...self.chunks]) { const c = g.clone(); c.position.z = -P; c.userData.z = g.userData.z - P; self.group.add(c); self.chunks.push(c); }
    // contact shadows: one instanced soft disc per standing prop, drawn over the ground and slopes
    {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(20,40,10,0.62)'); gr.addColorStop(0.55, 'rgba(20,40,10,0.38)'); gr.addColorStop(1, 'rgba(20,40,10,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      self.materials.push(mat);
      const q = new THREE.Quaternion(), e = new THREE.Euler(), M = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      for (const [k, opacity] of [[1, 0.85], [0.55, 0.42]]) {
        const list = shadows.filter((d) => d.k === k), m = k === 1 ? mat : mat.clone();
        m.opacity = opacity; if (m !== mat) self.materials.push(m);
        const mesh = new THREE.InstancedMesh(geo, m, list.length);
        list.forEach((d, i) => { M.compose(v.set(d.x, d.y, d.z), q.setFromEuler(e.set(0, d.yaw, 0)), sc.set(d.w, 1, d.d)); mesh.setMatrixAt(i, M); });
        mesh.frustumCulled = false; mesh.renderOrder = 1; self.group.add(mesh);
        const wrap = mesh.clone(); wrap.position.z = -P; self.group.add(wrap); // the next repeat
      }
      self.shadowTex = tex;
    }
    // windmill sails turn: their own small meshes per mill (the bodies are merged above)
    const sails = (windmill || []).filter((g) => g.ch === 'spin');
    self.sails = [];
    for (const w of self.windmills) for (const g of sails) {
      const m = new THREE.Mesh(g.geometry, matte), holder = new THREE.Group(), pivot = new THREE.Group();
      const ground = H(w.x, w.z) - 0.04 * w.s;
      holder.position.set(w.x, ground, w.z); holder.rotation.y = w.yaw; holder.scale.setScalar(w.s);
      pivot.position.set(...g.pivot); m.position.set(-g.pivot[0], -g.pivot[1], -g.pivot[2]);
      pivot.add(m); holder.add(pivot); self.group.add(holder); self.sails.push({ pivot, holder, z: w.z });
      const h2 = holder.clone(); h2.position.z -= P; self.group.add(h2); self.sails.push({ pivot: h2.children[0], holder: h2, z: w.z - P });
    }
    self.height = H;
    return self;
  }

  update(pos, t = 0) {
    const off = ((pos % this.P) + this.P) % this.P;
    this.group.position.z = off;
    for (const c of this.chunks) { const z = c.userData.z + off; c.visible = z > -165 && z < 34; }
    for (const s of this.sails) { s.pivot.rotation.z = -t * 0.7; const z = s.z + off; s.holder.visible = z > -175 && z < 40; }
  }

  dispose() {
    this.group.removeFromParent();
    const done = new Set();
    this.group.traverse((o) => { if (o.isMesh && !done.has(o.geometry) && !this.sails.some((s) => s.pivot.children.includes(o))) { done.add(o.geometry); o.geometry?.dispose(); } });
    for (const m of this.materials) m.dispose();
    this.shadowTex?.dispose();
  }
}
