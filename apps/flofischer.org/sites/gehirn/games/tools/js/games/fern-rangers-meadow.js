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
/** The meadow side slope: rises from flat verges into hills, periodic in z with period P. */
export function meadowHeight(x, z, P, noise) {
  const a = Math.abs(x), t = (z / P) * Math.PI * 2;
  const ripple = 0.5 + 0.5 * Math.sin(t * 2 + Math.sign(x) * 1.7) * Math.cos(t * 3 - x * 0.05);
  const wobble = noise.fbm2(Math.cos(t) * 3 + x * 0.04, Math.sin(t) * 3, 3) * 0.5 + 0.5;
  return smoothstep(8.5, 26, a) * (1.2 + ripple * 2.6 + wobble * 2.2) + smoothstep(26, 70, a) * (3 + wobble * 6);
}

export class MeadowScenery {
  /** library: the Rangers ChannelLibrary (Fernworld meadow flora); road: half width of the road. */
  static async create({ library, road = 3, P = 256, low = false }) {
    const self = new MeadowScenery();
    self.P = P; self.group = new THREE.Group(); self.chunks = []; self.windmills = [];
    const noise = createNoise(41), rand = rng(1337);
    const old = async (n) => loadModel(n, 'lo');
    const [tree, bush, cottage, rock, windmill, fernA, log, stump, hedge, fence, gateK, lantern, wheat, pumpkin, tent, fire, logs, stall, cart, roof] = await Promise.all([
      old('TREE_ROUND'), old('BUSH'), old('COTTAGE'), old('ROCK'), old('WINDMILL'),
      library.model('meadow_fern_arching', 'lo'), library.model('woodland_fallen_log', 'lo'), library.model('woodland_stump_rings', 'lo'),
      kenneyModel('town/hedge-large', { grey: 0x3f6a2a }), kenneyModel('nature/fence_simple', { recolour: false }), kenneyModel('nature/fence_gate', { recolour: false }), kenneyModel('town/lantern', { recolour: false }),
      kenneyModel('nature/crops_wheatStageB', { recolour: false }), kenneyModel('nature/crop_pumpkin', { recolour: false }), kenneyModel('nature/tent_detailedOpen', { recolour: false }),
      kenneyModel('nature/campfire_stones', { recolour: false }), kenneyModel('nature/log_stack', { recolour: false }), kenneyModel('town/stall-green', { recolour: false }), kenneyModel('town/cart', { recolour: false }),
      kenneyModel('town/banner-green', { recolour: false }),
    ]);
    const NC = Math.ceil(P / CH), chunks = Array.from({ length: NC }, () => ({ matte: new Batch(), glow: new Batch() }));
    const H = (x, z) => meadowHeight(x, z, P, noise);
    // place a model; z in (−P, 0]; y follows the slope (lowest corner, so nothing floats)
    // soft contact shadows under everything that stands on the ground (the scenery casts no real shadows)
    const shadows = [], footprint = new Map();
    const foot = (model) => {
      if (!footprint.has(model)) { const b = new THREE.Box3(); for (const g of model) { g.geometry.computeBoundingBox(); b.union(g.geometry.boundingBox); } footprint.set(model, [b.max.x - b.min.x, b.max.z - b.min.z]); }
      return footprint.get(model);
    };
    const put = (model, x, z, { yaw = 0, s = 1, tint = 0xffffff, sink = 0.04, sx = 1, sy = 1, y = null, shade = true } = {}) => {
      const zz = ((z % P) - P) % P, bin = chunks[Math.min(NC - 1, Math.floor(-zz / CH))];
      const r = 0.35 * s, ground = y ?? Math.min(H(x, zz), H(x + r, zz), H(x - r, zz), H(x, zz + r), H(x, zz - r));
      const m = mtx([x, ground - sink * s, zz], [0, yaw, 0], [s * sx, s * sy, s]), t = tint instanceof THREE.Color ? tint : new THREE.Color(tint);
      for (const g of model) {
        if (g.ch === 'spin') continue;
        (g.mat === 'glow' ? bin.glow : bin.matte).add(g.geometry, m, t);
      }
      if (shade) {
        const [fx, fz] = foot(model), w = fx * s * sx * 1.25, d = fz * s * 1.25;
        // the sun stands left and in front: the shadow leans a little right and back
        shadows.push({ x: x + 0.12 * w, y: Math.max(H(x, zz), ground) + 0.03, z: zz - 0.08 * d, w, d, yaw });
      }
    };
    const green = (k) => new THREE.Color().setHSL(0.27 + (rand() - 0.5) * 0.05, 0.55 + rand() * 0.15, 0.42 + rand() * 0.1).multiplyScalar(k);
    const leafTint = () => new THREE.Color().setRGB(0.86 + rand() * 0.22, 0.9 + rand() * 0.18, 0.78 + rand() * 0.2);

    // 1. The slopes themselves: two strips of terrain per chunk, so each chunk can be culled.
    {
      const c0 = new THREE.Color(0x5f9f3a), c1 = new THREE.Color(0x8cc155), c2 = new THREE.Color(0x3f7f2e), cFar = new THREE.Color(0x8fb98a), c = new THREE.Color();
      const xs = []; for (let x = 6.5; x < 90; x += x < 30 ? 1.25 : 4) xs.push(x);
      for (let k = 0; k < NC; k++) for (const side of [-1, 1]) {
        const zs = []; for (let z = -k * CH; z >= -(k + 1) * CH - 0.001; z -= 2) zs.push(z);
        const pos = [], col = [], idx = [];
        for (const z of zs) for (const ax of xs) {
          const x = side * ax, y = H(x, z) - 0.03; pos.push(x, y, z);
          const n = noise.fbm2(x * 0.12, z * 0.12, 3) * 0.5 + 0.5, slope = smoothstep(9, 20, ax);
          c.copy(c0).lerp(c1, n * 0.8).lerp(c2, smoothstep(0.62, 0.9, noise.fbm2(x * 0.05 + 7, z * 0.05, 2) * 0.5 + 0.5) * 0.5 * slope).lerp(cFar, smoothstep(30, 85, ax) * 0.55);
          col.push(c.r, c.g, c.b);
        }
        const nx = xs.length;
        for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
          if (side > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        chunks[k].terrain = (chunks[k].terrain || []).concat(g);
      }
    }

    const edge = road + 0.35;
    // 2. The verge: flower clumps and tall grass between road edge and hedges, denser in the "flower meadow" stretches.
    // (low-poly procedural blossoms of the original road; the sculpted meadow flora is ~1k triangles per stem)
    const blossom = [[0xffffff, 0xffd23f, 8], [0xfff2a8, 0xff8a3d, 5], [0xf2a6c4, 0xffd23f, 5], [0xb9a6f2, 0xffd23f, 5], [0xff7a5c, 0xffd23f, 5]].map(([c, m, n]) => [{ mat: 'matte', geometry: flower(c, m, n) }]);
    const grassTuft = [{ mat: 'matte', geometry: tuft(rng(50), 7, [0.08, 0.2, 0.05], [0.34, 0.6, 0.18]) }];
    for (const side of [-1, 1]) for (let z = -0.5; z > -P; z -= 0.7) {
      const bloom = 0.5 + 0.5 * Math.sin((z / P) * Math.PI * 8 + side);
      if (rand() > 0.3 + bloom * 0.5) continue;
      const x = side * (edge + 0.2 + rand() * 1.9), f = blossom[(rand() * (bloom > 0.6 ? 5 : 2)) | 0];
      for (let n = 0; n < 2 + ((rand() * 3) | 0); n++) put(f, x + (rand() - 0.5) * 0.5, z + (rand() - 0.5) * 0.5, { yaw: rand() * 6.3, s: 0.24 + rand() * 0.12, sink: 0, shade: false });
      if (rand() < 0.5) put(grassTuft, x + side * 0.4, z, { yaw: rand() * 6.3, s: 0.45, sy: 0.7 + rand() * 0.4, sink: 0, shade: false });
    }
    // 3. Frame: hedge runs and fence runs with lanterns, broken by gaps where the view opens onto a landmark.
    const views = [-40, -88, -136, -184, -232].map((z) => [z - 10, z + 10]);
    const inView = (z, side) => views.some(([a, b], i) => (i % 2 ? 1 : -1) === side && z > a && z < b);
    for (const side of [-1, 1]) {
      const x = side * (edge + 2.35);
      for (let z = -1; z > -P; z -= 1) {
        if (inView(z, side)) continue;
        const run = Math.floor((z - side * 37) / 18) & 3; // 18-unit runs: hedge, hedge, fence, open
        if (run < 2) { put(hedge, x, z, { yaw: 0, s: 2.1, sx: 1.05, sy: 0.9 + 0.15 * Math.sin(z * 0.7), tint: leafTint(), sink: 0.13 }); }
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
        const x0 = side * 9;
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

    // assemble: one opaque mesh (terrain + props share the lambert-ish standard material) and one glow mesh per chunk
    // Lambert: the scenery is matte and fills most of the screen, so it takes the cheapest lit shading (HD 630 budget)
    const matte = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    self.materials = [matte, glow];
    chunks.forEach((c, k) => {
      const g = new THREE.Group(); g.userData.z = -(k + 0.5) * CH;
      for (const t of c.terrain || []) { const m = new THREE.Mesh(t, matte); m.receiveShadow = true; g.add(m); }
      if (!c.matte.empty) { const m = new THREE.Mesh(c.matte.geometry(), matte); m.receiveShadow = true; g.add(m); }
      if (!c.glow.empty) g.add(new THREE.Mesh(c.glow.geometry(), glow));
      self.group.add(g); self.chunks.push(g);
    });
    // contact shadows: one instanced soft disc per standing prop, drawn over the ground and slopes
    {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(20,40,10,0.62)'); gr.addColorStop(0.55, 'rgba(20,40,10,0.38)'); gr.addColorStop(1, 'rgba(20,40,10,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.InstancedMesh(geo, mat, shadows.length), q = new THREE.Quaternion(), e = new THREE.Euler(), M = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      shadows.forEach((d, i) => { M.compose(v.set(d.x, d.y, d.z), q.setFromEuler(e.set(0, d.yaw, 0)), sc.set(d.w, 1, d.d)); mesh.setMatrixAt(i, M); });
      mesh.frustumCulled = false; mesh.renderOrder = 1; self.group.add(mesh); self.materials.push(mat); self.shadowTex = tex;
    }
    // windmill sails turn: their own small meshes per mill (the bodies are merged above)
    const sails = windmill.filter((g) => g.ch === 'spin');
    self.sails = [];
    for (const w of self.windmills) for (const g of sails) {
      const m = new THREE.Mesh(g.geometry, matte), holder = new THREE.Group(), pivot = new THREE.Group();
      const ground = H(w.x, w.z) - 0.04 * w.s;
      holder.position.set(w.x, ground, w.z); holder.rotation.y = w.yaw; holder.scale.setScalar(w.s);
      pivot.position.set(...g.pivot); m.position.set(-g.pivot[0], -g.pivot[1], -g.pivot[2]);
      pivot.add(m); holder.add(pivot); self.group.add(holder); self.sails.push({ pivot, holder, z: w.z });
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
    this.group.traverse((o) => { if (o.isMesh && !this.sails.some((s) => s.pivot.children.includes(o))) o.geometry?.dispose(); });
    for (const m of this.materials) m.dispose();
    this.shadowTex?.dispose();
  }
}
