/**
 * Pip’s Tower in 3D (Three.js): the tower of each world (stone, sandstone, ice or basalt, each with its own light and a
 * procedural backdrop), golden pins and levers, glossy water, glowing lava, sand, goo, gas, Fernstone crystals, ice,
 * gates, keys and teleport pads, and the sculpted cast: Pip with Biscuit, Zorblings, Klonkbots, Buzzbots and the boss.
 * The simulation stays 2D (board x right, y down, 360 × 640); here board (x, y) maps to three (x − 180, 320 − y) on the
 * z = 0 plane, which faces the camera head-on so the overlay can use a plain scale + offset.
 *
 * Everything static (sky, hills, the plateau, the tower with its rooms and roof: world/tower-scenery.js) is baked once
 * per level and screen size into a colour + depth image (decor.js Baker) and drawn back as one full-screen quad; only
 * the moving things are real geometry each frame, plus a shadow catcher on the back wall, torch flames and the
 * world's ambient particles (pollen, dust, snow, embers).
 */
import { THREE, studioEnvironment, createRenderer, texture, mat, addLights, MergedCrowd, Particles, LOW_GPU } from './three-kit.js';
import { loadModel } from './models.js';
import { BOARD_W, BOARD_H } from './pips-tower.js';
import { Baker } from './world/decor.js';
import { buildTowerScenery, propsReady } from './world/tower-scenery.js';

const DEPTH = 64;          // wall depth (z from −32 to +32)
const HUD = 56;            // CSS px the HUD covers at the top
const BX = (x) => x - BOARD_W / 2, BY = (y) => BOARD_H / 2 - y;
const PR = 5;

// The sculpted cast (scripts/games-sculpt), low detail for play plus the shadow-only bake.
const load = async (name) => {
  const [model, shadowModel] = await Promise.all([loadModel(name, 'lo'), loadModel(name, 'sh').catch(() => null)]);
  return { model, shadowModel };
};
await propsReady;
const CAST = Object.fromEntries(await Promise.all(['PIP', 'BISCUIT', 'ZORBLING', 'KLONKBOT', 'BUZZBOT', 'BLORB', 'KLONK_TANK', 'FROST_WALKER']
  .map(async (n) => [n, await load(n)])));
// Model, scale (board px per model unit) and the model's lowest point (it stands on the body's feet).
const FIG = {
  hero: { model: 'PIP', s: 64, base: 0 },
  zorbling: { model: 'ZORBLING', s: 56, base: 0 },
  klonkbot: { model: 'KLONKBOT', s: 47, base: 0 },
  buzzbot: { model: 'BUZZBOT', s: 68, base: 0.34 },
};
// One boss per world: a big Blorb, the Klonk Tank, the Frost Walker, the Zorb Queen (a royal Blorb).
const BOSS = [
  { model: 'BLORB', s: 76, tint: null }, { model: 'KLONK_TANK', s: 66, tint: null },
  { model: 'FROST_WALKER', s: 70, tint: null }, { model: 'BLORB', s: 80, tint: new THREE.Color(1.25, 0.7, 1.2) },
];

// The tower and backdrop of each world (docs/games/UNIVERSE.md): procedural, no photo backdrops.
const LOOKS = [
  { // Fernhaven Meadows: warm stone, red roof, grassy mound, sunny morning hills
    back: ['t-brick', 0xfff2e2], wall: ['t-stone', 0xfff6ea], roof: 0xc2412d, flag: 0x3f9b4a, mound: ['t-grass', 0x86c55e],
    sun: 0xfff1d6, intensity: 2.5, ambient: 1.25, sky: 0xe8f0ff, ground: 0x8a6a48, exposure: 1.05,
    bg: { top: 0x4f9ef0, horizon: 0xdff1ff, far: 0x9cc6a0, near: 0x5fae4a, glow: 0xfff3c4, kind: 0 },
  },
  { // Sunbake Dunes: sandstone, terracotta roof, golden hour mesas
    back: ['t-brick', 0xf7cf98], wall: ['t-stone', 0xf2c088], roof: 0xd9783a, flag: 0x2aa6a0, mound: ['t-sand', 0xffe0b0],
    sun: 0xffcf96, intensity: 2.7, ambient: 1.1, sky: 0xffe3c2, ground: 0x9a6b3a, exposure: 1.05,
    bg: { top: 0x5f93db, horizon: 0xffd6a0, far: 0xe2a774, near: 0xc8784a, glow: 0xffd08a, kind: 1 },
  },
  { // Frostpeak: icy blue stone, snow caps, crisp peaks and an aurora
    back: ['t-stone', 0xd6e6f8], wall: ['t-stone', 0xe4eefa], roof: 0x3566c2, flag: 0xe2f2ff, mound: ['t-snow', 0xffffff],
    sun: 0xe8f2ff, intensity: 2.4, ambient: 1.3, sky: 0xdcecff, ground: 0x7d8fa8, exposure: 1.0, snow: true,
    bg: { top: 0x3f78c8, horizon: 0xe6f3ff, far: 0xbcd2ea, near: 0x8fb0d4, glow: 0x9ff7d8, kind: 2 },
  },
  { // Ember Isles: basalt, glowing seams, dusk volcanoes under the mothership
    back: ['t-lavarock', 0xd6c2ba], wall: ['t-lavarock', 0xe2cec6], roof: 0x7a2a4e, flag: 0xff8a3d, mound: ['t-lavarock', 0x947a72],
    sun: 0xffb27a, intensity: 2.6, ambient: 1.3, sky: 0xffc2a0, ground: 0x4a2a30, exposure: 1.08, seams: true,
    bg: { top: 0x2a1b40, horizon: 0xe0704a, far: 0x5a3040, near: 0x2c1e26, glow: 0xff9a4a, kind: 3 },
  },
];

/** Merge box geometries (position, normal, uv, index) into one, so the tower's walls are one draw call. */
function merge(geos) {
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
/** A wall segment [x1, y1, x2, y2] as a box, its stone pattern stretched by length instead of squashed. */
function wallBox(seg, thick = 14, depth = DEPTH, z = 0) {
  const [ax, ay, bx, by] = seg;
  const len = Math.hypot(bx - ax, by - ay) + thick;
  const g = new THREE.BoxGeometry(len, thick, depth);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 64);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(BX((ax + bx) / 2), BY((ay + by) / 2), z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan2(by - ay, bx - ax)), new THREE.Vector3(1, 1, 1)));
  return g;
}

export class PipsTower3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.8;
    this.camera = new THREE.PerspectiveCamera(28, 1, 10, 6000);
    this.level = null; this.w = 1; this.h = 1;
    this.build();
  }

  build() {
    const s = this.scene;
    this.baker = new Baker();
    s.add(this.baker.quad);
    // the live shadow catcher on the back wall: only the moving things cast onto it (the static shade is baked)
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false }));
    this.catcher.receiveShadow = true; this.catcher.renderOrder = -900; this.catcher.visible = !LOW_GPU; s.add(this.catcher);
    this.lights = addLights(s, { dir: [-260, 520, 620], shadowBox: 420, mapSize: 2048, intensity: 2.5, ambient: 1.25, sky: 0xe8f0ff, ground: 0x8a6a48 });
    this.lights.light.shadow.camera.far = 2000;
    this.lights.light.shadow.bias = -0.0004;
    // materials
    this.mWater = new THREE.MeshPhysicalMaterial({ color: 0x2b8af5, roughness: 0.05, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x0b47a8, emissiveIntensity: 0.45, transparent: true, opacity: 0.9 });
    this.mLava = new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.4, emissive: 0xe83200, emissiveIntensity: 0.85 });
    this.mStone = new THREE.MeshStandardMaterial({ color: 0x6b6460, roughness: 0.9, flatShading: true });
    this.mGem = new THREE.MeshStandardMaterial({ color: 0x5ff0c8, roughness: 0.18, metalness: 0.1, emissive: 0x16b48a, emissiveIntensity: 0.55, flatShading: true });
    this.mSand = new THREE.MeshStandardMaterial({ color: 0xe8b46c, roughness: 0.95, flatShading: true });
    this.mGoo = new THREE.MeshStandardMaterial({ color: 0x9b3cf0, roughness: 0.15, metalness: 0.05, emissive: 0x4c0f8a, emissiveIntensity: 0.55 });
    this.mGas = new THREE.MeshStandardMaterial({ color: 0xb6f05a, roughness: 0.8, emissive: 0x4f8a10, emissiveIntensity: 0.6, transparent: true, opacity: 0.32, depthWrite: false });
    const max = 520;
    const inst = (g, m, shadow = true, n = max) => { const im = new THREE.InstancedMesh(g, m, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true; im.count = 0; s.add(im); return im; };
    this.parts = {
      water: inst(new THREE.SphereGeometry(PR * 1.85, 12, 10), this.mWater, false),
      lava: inst(new THREE.SphereGeometry(PR * 1.8, 12, 10), this.mLava, false),
      stone: inst(new THREE.IcosahedronGeometry(PR * 1.4, 0), this.mStone),
      gem: inst(new THREE.OctahedronGeometry(PR * 1.35, 0), this.mGem),
      sand: inst(new THREE.IcosahedronGeometry(PR * 1.25, 0), this.mSand),
      goo: inst(new THREE.SphereGeometry(PR * 1.75, 10, 8), this.mGoo, false),
      gas: inst(new THREE.IcosahedronGeometry(PR * 2.6, 1), this.mGas, false, 260),
    };
    this.parts.gas.renderOrder = 2;
    this.crowd = {
      hero: new MergedCrowd(s, null, 1, CAST.PIP),
      biscuit: new MergedCrowd(s, null, 1, CAST.BISCUIT),
      zorbling: new MergedCrowd(s, null, 8, CAST.ZORBLING),
      klonkbot: new MergedCrowd(s, null, 6, CAST.KLONKBOT),
      buzzbot: new MergedCrowd(s, null, 6, CAST.BUZZBOT),
    };
    this.bossCrowds = {};
    this.fx = new Particles(s, 700);
    this.glow = new Particles(s, 200, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    // ambient life: drifting motes (normal and glowing), chimney smoke
    const ball = new THREE.SphereGeometry(1, 6, 4);
    this.amb = new Particles(s, 140, ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ambGlow = new Particles(s, 90, ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.smoke = new Particles(s, 24, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }));
    for (const p of [this.amb, this.ambGlow, this.smoke]) p.mesh.renderOrder = 3;
    this.ac = new THREE.Color();
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.visible = false; s.add(this.ring);
    this.mPin = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.22 });
    this.hoverMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, metalness: 0.8, roughness: 0.2, emissive: 0xffb300, emissiveIntensity: 0.6 });
    this.mKnob = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.1 });
    this.mGold = new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.25, metalness: 0.85, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3();
    this.tint = new THREE.Color();
  }

  bossCrowd(world) {
    const b = BOSS[world] || BOSS[0];
    const key = `${b.model}:${world}`;
    if (!this.bossCrowds[key]) this.bossCrowds[key] = { crowd: new MergedCrowd(this.scene, null, 1, CAST[b.model]), ...b };
    return this.bossCrowds[key];
  }

  /** The level: the baked diorama (rebuilt when the level, world or theme changes) and the live, moving parts. */
  buildLevel(sess, dark) {
    if (this.tower) { this.scene.remove(this.tower); this.tower.traverse((o) => { o.geometry?.dispose(); }); }
    const tower = (this.tower = new THREE.Group());
    const L = sess.L, look = (this.look = LOOKS[sess.world] || LOOKS[0]);
    const b = L.bounds || [40, 40, 320, 600];
    this.renderer.toneMappingExposure = look.exposure * (dark ? 0.92 : 1);
    // the diorama depends only on the level and the theme: a retry keeps the scenery and its bake
    if (this.sceneryFor !== L || this.sceneryDark !== dark) {
      this.scenery?.dispose();
      this.scenery = buildTowerScenery({ L, world: sess.world, dark, low: LOW_GPU, look });
      this.sceneryFor = L; this.sceneryDark = dark;
      this.bakeDirty = true; this.texReady = -1;
    }
    this.catcher.scale.set(b[2] - b[0], b[3] - b[1], 1);
    this.catcher.position.set(BX((b[0] + b[2]) / 2), BY((b[1] + b[3]) / 2), -DEPTH / 2 + 0.5);
    const wood = mat(0xffffff, { map: texture('t-wood', { repeat: [1, 1] }), roughness: 0.8 });
    this.breakables = sess.breakables.map((w) => { const m = new THREE.Mesh(wallBox([w.ax, w.ay, w.bx, w.by]), wood); m.castShadow = true; tower.add(m); return m; });
    // gates: a golden frame with bars
    this.gates = sess.gates.map((g) => {
      const grp = new THREE.Group();
      const len = Math.hypot(g.bx - g.ax, g.by - g.ay);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(len + 10, 10, DEPTH * 0.5), new THREE.MeshStandardMaterial({ color: 0x7a5418, roughness: 0.5, metalness: 0.4 }));
      grp.add(frame);
      for (let x = -len / 2 + 6; x <= len / 2 - 6; x += 14) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 13, 8), this.mGold); bar.position.set(x, 0, DEPTH * 0.3); bar.rotation.x = Math.PI / 2; grp.add(bar); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 6), this.mGold); lock.position.z = DEPTH * 0.3 + 3; grp.add(lock);
      grp.position.set(BX((g.ax + g.bx) / 2), BY((g.ay + g.by) / 2), 0);
      grp.rotation.z = -Math.atan2(g.by - g.ay, g.bx - g.ax);
      grp.traverse((o) => { o.castShadow = true; });
      tower.add(grp); return grp;
    });
    // ice blocks
    const mIce = new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.78, emissive: 0x4fa8e0, emissiveIntensity: 0.25 });
    this.iceMeshes = sess.ice.map((ic) => {
      const [x0, y0, x1, y1] = ic.rect;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, DEPTH * 0.8, 1, 1, 1), mIce);
      m.position.set(BX((x0 + x1) / 2), BY((y0 + y1) / 2), 0); m.castShadow = true; tower.add(m); return m;
    });
    // levers: a base with a stick on the wall, and the tipping platform
    const mPlat = mat(0xb4532a, { roughness: 0.6 });
    this.leverMeshes = sess.levers.map((lv) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 16), mat(0x475569, { roughness: 0.5, metalness: 0.4 }));
      base.position.set(BX(lv.at[0]), BY(lv.at[1]), DEPTH / 2 - 6);
      const stick = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 20, 8), mat(0x94a3b8, { metalness: 0.6, roughness: 0.3 })); rod.position.y = 10;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(5.5, 14, 10), this.mKnob); knob.position.y = 21;
      stick.add(rod, knob); stick.position.copy(base.position); stick.position.y += 2;
      const len = Math.hypot(lv.base[2] - lv.base[0], lv.base[3] - lv.base[1]);
      const plat = new THREE.Mesh(new THREE.BoxGeometry(len + 12, 12, DEPTH * 0.9), mPlat);
      plat.geometry.translate(len / 2, 0, 0); plat.castShadow = true; plat.receiveShadow = true;
      tower.add(base, stick, plat);
      return { stick, knob, plat };
    });
    // teleport pads and their exits
    this.portalMeshes = sess.portals.map((pt) => {
      const [x0, y0, x1, y1] = pt.from;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 4, DEPTH * 0.8), new THREE.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.7, toneMapped: false }));
      pad.position.set(BX((x0 + x1) / 2), BY(y1) + 1, 0);
      const exit = new THREE.Mesh(new THREE.TorusGeometry(13, 2.6, 8, 28), new THREE.MeshBasicMaterial({ color: 0xd8a8ff, toneMapped: false }));
      exit.position.set(BX(pt.to[0]), BY(pt.to[1]), 4);
      tower.add(pad, exit);
      return { pad, exit };
    });
    // pins
    this.pinMeshes = sess.pins.map((pin) => {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, pin.len, 16), this.mPin);
      bar.rotation.z = Math.PI / 2; bar.position.x = pin.len / 2; bar.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 3.6, 12, 28), this.mPin);
      ring.position.x = pin.len + 12;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 10), this.mPin);
      g.add(bar, ring, cap);
      g.rotation.z = -Math.atan2(pin.dy, pin.dx);
      tower.add(g);
      return g;
    });
    // rocks, bombs and keys
    const stoneTex = texture(look.wall[0], { repeat: [1, 1] });
    this.rockMeshes = sess.rocks.map((r) => {
      let m;
      if (r.kind === 'boulder') {
        m = new THREE.Mesh(new THREE.IcosahedronGeometry(r.r, 1), mat(0xd8d0c8, { map: stoneTex, flat: true, roughness: 0.9 }));
      } else if (r.kind === 'key') {
        m = new THREE.Group();
        const bow = new THREE.Mesh(new THREE.TorusGeometry(5, 2, 8, 18), this.mGold); bow.position.x = -5;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(14, 3.4, 3.4), this.mGold); shaft.position.x = 6;
        const bit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, 3.4), this.mGold); bit.position.set(11, -3, 0);
        m.add(bow, shaft, bit);
      } else {
        m = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r.r, 18, 14), mat(0x1c1c22, { roughness: 0.25, metalness: 0.3 }));
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 10, 6), mat(0xa16207)); fuse.position.y = r.r + 3;
        const spark = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false }));
        spark.position.y = r.r + 9; m.add(ball, fuse, spark); m.userData.spark = spark;
      }
      m.castShadow = true; m.traverse?.((o) => { o.castShadow = true; });
      tower.add(m); return m;
    });
    // the flag on the roof's finial
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 46, 8), mat(0x6b4a2a));
    flagPole.position.set(BX((b[0] + b[2]) / 2), BY(b[1] - 62) + 25, 0); tower.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), mat(look.flag, { side: THREE.DoubleSide }));
    flag.geometry.translate(15, 0, 0);
    flag.position.set(BX((b[0] + b[2]) / 2), BY(b[1] - 62) + 39, 0); this.flag = flag; tower.add(flag);
    this.scene.add(tower);
    // light of the world (for the live parts; the baked scene has its own)
    const li = this.lights;
    li.light.color.set(look.sun); li.hemi.color.set(look.sky); li.hemi.groundColor.set(look.ground);
    li.light.intensity = look.intensity * (dark ? 0.7 : 1); li.hemi.intensity = look.ambient * (dark ? 0.72 : 1);
    this.level = sess;
  }

  /** Bake the static diorama for the current level and view (again when a texture finishes loading). */
  bake() {
    const sc = this.scenery;
    const ready = sc.textures.filter((t) => t.image && (t.image.width || t.image.naturalWidth)).length;
    if (!this.bakeDirty && ready === this.texReady) return;
    this.bakeDirty = false; this.texReady = ready;
    this.baker.shift(this.camera, 0, 0);
    this.camera.position.set(0, this.camY, this.dist);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // supersampled (the bake is also the anti-aliasing of all that detail); dense screens need less
    const ss = LOW_GPU ? 1 : size.x * size.y > 2.6e6 || this.renderer.getPixelRatio() >= 1.4 ? 1.5 : 2;
    sc.fit(this.camera, size.y * ss);
    this.baker.bake(this.renderer, sc.scene, this.camera, ss);
    // the bake's shadow map is only needed while baking
    sc.scene.traverse((o) => { if (o.isDirectionalLight && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
  }

  resize(w, h, dpr) {
    if (w !== this.w || h !== this.h || dpr !== this.renderer.getPixelRatio()) this.bakeDirty = true;
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the board (with roof) below the HUD; the z = 0 plane fills `fit` of the free height.
    const boardH = BOARD_H + 70, boardW = BOARD_W + 40;
    const availH = Math.max(80, h - HUD - 6);
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const distH = (boardH / 2) / tanH * (h / availH);
    const distW = (boardW / 2) / (tanH * this.camera.aspect);
    this.dist = Math.max(distH, distW);
    // shift the camera so the board's centre sits in the middle of the free area under the HUD
    const pxPerUnit = h / (2 * this.dist * tanH);
    const centreY = BY(BOARD_H / 2 - 35);
    this.camY = centreY + (HUD / 2) / pxPerUnit;
    this.camera.position.set(0, this.camY, this.dist);
    this.camera.lookAt(0, this.camY, 0);
    this.camera.near = this.dist * 0.1; this.camera.far = this.dist + 7000;
    this.camera.updateProjectionMatrix();
  }

  layoutFor() {
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const s = this.h / (2 * this.dist * tanH); // px per board unit on the z = 0 plane
    const ox = this.w / 2 + (BX(0)) * s, oy = this.h / 2 - (BY(0) - this.camY) * s;
    return { s, ox, oy };
  }

  render(sess, view) {
    if (this.level !== sess || this.dark !== view.dark) { this.dark = view.dark; this.buildLevel(sess, view.dark); this.resize(this.w, this.h, this.renderer.getPixelRatio()); }
    this.bake();
    // shake moves the whole picture (baked and live alike) in screen space
    const shake = sess.shake > 0 && !view.reduced ? sess.shake * 6 : 0;
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360), k = shake / (this.dist * tanH);
    this.baker.shift(this.camera, (Math.random() - 0.5) * k / this.camera.aspect, (Math.random() - 0.5) * k);
    if (this.flag) this.flag.rotation.y = Math.sin(sess.t * 3) * 0.3;

    sess.pins.forEach((pin, i) => {
      const g = this.pinMeshes[i];
      g.visible = pin.state !== 'out';
      const [ax, ay] = sess.pinSeg(pin);
      g.position.set(BX(ax), BY(ay), 0);
      const hot = pin.i === sess.hover && pin.state === 'in';
      for (const c of g.children) c.material = hot ? this.hoverMat : this.mPin;
    });
    sess.levers.forEach((lv, i) => {
      const m = this.leverMeshes[i], [ax, ay, bx, by] = [lv.plat.ax, lv.plat.ay, lv.plat.bx, lv.plat.by];
      m.plat.position.set(BX(ax), BY(ay), 0);
      m.plat.rotation.z = -Math.atan2(by - ay, bx - ax);
      m.stick.rotation.z = (lv.turn > 0 ? -1 : 1) * (0.6 - 1.2 * (lv.turn ? lv.ang / lv.turn : 0));
      m.knob.material = lv.i === sess.hover && lv.state === 'in' ? this.hoverMat : this.mKnob;
    });
    this.breakables.forEach((m, i) => { m.visible = sess.breakables[i].alive; });
    this.gates.forEach((m, i) => { const g = sess.gates[i]; m.visible = g.alive || g.openT < 0.35; if (!g.alive) m.scale.setScalar(Math.max(0.01, 1 - g.openT / 0.35)); });
    this.iceMeshes.forEach((m, i) => { m.visible = sess.ice[i].alive; });
    this.portalMeshes.forEach((m, i) => {
      const pt = sess.portals[i], k = 0.6 + Math.sin(sess.t * 4 + i) * 0.15 + pt.pulse * 0.6;
      m.exit.rotation.z = sess.t * 2; m.exit.scale.setScalar(0.9 + pt.pulse * 0.4);
      m.pad.material.opacity = Math.min(1, k);
    });
    sess.rocks.forEach((r, i) => {
      const m = this.rockMeshes[i];
      m.visible = r.alive;
      m.position.set(BX(r.x), BY(r.y), 0);
      if (r.kind !== 'bomb') m.rotation.z = -r.rot;
      else if (m.userData.spark) m.userData.spark.scale.setScalar(0.7 + Math.random() * 0.6);
    });
    this.drawParticles(sess);
    this.drawCharacters(sess);
    this.drawFx(sess);
    this.drawAmbient(sess, view);
    this.renderer.render(this.scene, this.camera);
  }

  drawParticles(sess) {
    const counts = { water: 0, lava: 0, stone: 0, gem: 0, sand: 0, goo: 0, gas: 0 };
    const meshes = this.parts;
    const { m4, q, e, v, sc } = this;
    for (let i = 0; i < sess.parts.length; i++) {
      const p = sess.parts[i];
      if (p.dead) continue;
      const mesh = meshes[p.t], n = counts[p.t]++;
      if (n >= mesh.instanceMatrix.count) continue;
      // a little depth jitter per particle so piles read as 3D
      const z = ((i * 7919) % 17) - 8;
      let k = 1;
      if (p.t === 'gem') q.setFromEuler(e.set(((i * 37) % 10) * 0.2, sess.t * 0.8 + (i % 7) * 0.9, ((i * 13) % 9) * 0.15));
      else if (p.t === 'stone' || p.t === 'sand') q.setFromEuler(e.set(i, i * 0.7, 0));
      else { q.identity(); if (p.t === 'lava' || p.t === 'goo') k = 1 + Math.sin(sess.t * 6 + i) * 0.08; else if (p.t === 'gas') k = 0.85 + Math.sin(sess.t * 3 + i) * 0.15; }
      m4.compose(v.set(BX(p.x), BY(p.y), p.t === 'water' || p.t === 'lava' || p.t === 'goo' ? z * 1.4 : p.t === 'gas' ? z * 2 : z), q, sc.set(k, k, k));
      mesh.setMatrixAt(n, m4);
    }
    for (const [t, mesh] of Object.entries(meshes)) { mesh.count = Math.min(counts[t], mesh.instanceMatrix.count); mesh.instanceMatrix.needsUpdate = true; }
  }

  /** Recolour instance i of a crowd (burnt, shorted out, the boss's tint). */
  paint(crowd, i, color) { for (const c of crowd.channels) c.mesh.setColorAt(i, color); }

  drawCharacters(sess) {
    const h = sess.hero, t = sess.t;
    const happy = h.mood === 'happy', burnt = h.dead && h.cause === 'lava';
    const C = this.crowd;
    for (const c of Object.values(C)) c.begin();
    // Pip, and Biscuit at his side (on the roomier side, cheering on a win and lying down on a loss)
    const hop = happy ? Math.abs(Math.sin(t * 10)) * 8 : 0;
    const feet = BY(h.y + h.r);
    C.hero.add(BX(h.x), feet + hop, 4, h.walk ? h.walk * 1.2 : 0.25, FIG.hero.s, {
      phase: h.walk ? t * 12 : t * 2, swing: h.walk ? 1 : 0.15, armsUp: happy || (h.dead && !burnt),
      squash: h.dead && h.cause === 'boulder' ? 0.8 : 0, lean: h.dead && !burnt ? 0.4 : 0,
    });
    if (burnt) this.paint(C.hero, 0, this.tint.setRGB(0.18, 0.15, 0.14));
    else if (h.dead && (h.cause === 'goo' || h.cause === 'gas')) this.paint(C.hero, 0, this.tint.setRGB(0.75, 1.1, 0.7));
    const side = h.x > BOARD_W / 2 ? -1 : 1;
    const sad = !!sess.result && !sess.result.won;
    C.biscuit.add(BX(h.x + side * 31), feet + (happy ? Math.abs(Math.sin(t * 12 + 1)) * 10 : 0), -8, -side * 0.6, 62, {
      phase: t * (happy ? 14 : 3), swing: happy ? 1 : 0.2, squash: sad ? 0.35 : 0,
    });
    for (const en of sess.enemies) {
      if (en.dead && en.deathT > 0.8) continue;
      const fade = en.dead ? Math.max(0.05, 1 - en.deathT / 0.8) : 1;
      if (en.type === 'chief') {
        const bc = this.bossCrowd(sess.world);
        bc.crowd.begin();
        const hit = t - en.hitT < 0.35;
        bc.crowd.add(BX(en.x), BY(en.y + en.r), -6, Math.sin(t * 1.3) * 0.25, bc.s * fade, { phase: t * 3, swing: 0.4, flash: hit ? 1 : 0, squash: en.dead ? 0.5 : 0 });
        if (bc.tint && !hit) this.paint(bc.crowd, 0, bc.tint);
        bc.crowd.end();
        continue;
      }
      const f = FIG[en.type], crowd = C[en.type];
      const n = crowd.count;
      const dir = en.charging ? Math.sign(h.x - en.x) : 0;
      const bob = en.fly && !en.dead ? Math.sin(t * 5 + en.hx) * 3 : 0;
      crowd.add(BX(en.x), BY(en.y + en.r) - f.base * f.s + bob, 4, dir * 1.1, f.s * (en.dead ? Math.max(0.4, fade) : 1), {
        phase: t * (en.charging ? 14 : 3), swing: en.charging ? 1 : 0.2, spin: t * 30,
        squash: en.dead && en.cause === 'boulder' ? 0.85 : 0, lean: en.dead && en.cause === 'water' ? 0.5 : 0,
      });
      if (en.dead && en.cause === 'lava') this.paint(crowd, n, this.tint.setRGB(0.2, 0.17, 0.16));
      else if (en.dead && en.cause === 'water') { const z = (Math.floor(t * 20) % 2) ? 1.8 : 0.6; this.paint(crowd, n, this.tint.setRGB(z * 0.7, z * 0.85, z * 1.3)); }
    }
    for (const c of Object.values(C)) c.end();
    for (const bc of Object.values(this.bossCrowds)) if (!sess.chief || bc !== this.bossCrowd(sess.world)) { bc.crowd.begin(); bc.crowd.end(); }
  }

  drawFx(sess) {
    const fx = this.fx, gl = this.glow; fx.begin(); gl.begin();
    this.ring.visible = false;
    for (const f of sess.fx) {
      if (f.ring) {
        const q = 1 - f.life / f.max;
        this.ring.visible = true; this.ring.position.set(BX(f.x), BY(f.y), 10);
        this.ring.scale.setScalar(Math.max(0.01, f.r * q)); this.ring.material.opacity = 1 - q;
        continue;
      }
      const life = Math.max(0, Math.min(1, (f.life / f.max) * 1.5));
      if (f.puff) gl.add(BX(f.x), BY(f.y), 20, f.size * 1.2 * (0.4 + life), f.color.startsWith('rgba(241') ? 0x8a8f99 : f.color.startsWith('#a855f7') || f.color.startsWith('rgba(216') ? 0x4a1a6a : 0x3a3530);
      else fx.add(BX(f.x), BY(f.y), 14, f.size * 0.9 * life + 0.3, f.color, f.life * 8);
    }
    // Fernstones flying to Pip
    for (const c of sess.coins) {
      const q = 1 - c.life / c.max;
      const x = c.x + (sess.hero.x - c.x) * q, y = c.y + (sess.hero.y - 40 - c.y) * q - Math.sin(q * Math.PI) * 30;
      gl.add(BX(x), BY(y), 24, PR * (1.3 - q * 0.6), 0x5ff0c8);
    }
    // lava glow
    for (let i = 0; i < sess.parts.length; i += 3) {
      const p = sess.parts[i];
      if (!p.dead && p.t === 'lava') gl.add(BX(p.x), BY(p.y), 18, 9 + Math.sin(sess.t * 5 + i) * 2, 0x5a1800);
    }
    fx.end(); gl.end();
  }

  /** The world's ambient life (cheap: one instanced draw each); none on software WebGL. */
  drawAmbient(sess, view) {
    const a = this.amb, g = this.ambGlow, sm = this.smoke, c = this.ac;
    a.begin(); g.begin(); sm.begin();
    const sc = this.scenery;
    if (!LOW_GPU && sc && !view.reduced) {
      const t = sess.t, kind = sc.ambient.kind, dark = this.dark;
      const h = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
      const wrap = (v, lo, hi) => lo + ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));
      const n = kind === 'snow' ? 110 : kind === 'ember' ? 60 : kind === 'dust' ? 60 : dark ? 50 : 36;
      for (let i = 0; i < n; i++) {
        const x0 = (h(i, 1) * 2 - 1) * 640, z = -170 + h(i, 2) * 260, sp = 0.5 + h(i, 3);
        if (kind === 'snow') {
          const y = wrap(380 - t * 26 * sp - h(i, 4) * 760, -360, 400), x = x0 + Math.sin(t * 0.9 * sp + i) * 16 + t * 6;
          a.add(wrap(x, -660, 660), y, z, 1.1 + h(i, 5) * 1.6, c.setRGB(1, 1, 1));
        } else if (kind === 'dust') {
          const x = wrap(x0 + t * 18 * sp, -660, 660), y = -320 + h(i, 4) * 300 + Math.sin(t * 0.7 + i) * 12;
          a.add(x, y, z, 0.7 + h(i, 5) * 0.9, c.setRGB(1, 0.86, 0.62));
        } else if (kind === 'ember') {
          const y = wrap(-330 + t * 30 * sp + h(i, 4) * 700, -340, 380), x = x0 + Math.sin(t * 1.3 * sp + i) * 14;
          if (i % 3) g.add(x, y, z, 0.8 + h(i, 5) * 1.1, c.setRGB(1.6, 0.55 + h(i, 6) * 0.3, 0.12));
          else a.add(x, wrap(380 - t * 12 * sp - h(i, 4) * 700, -340, 380), z, 1 + h(i, 5), c.setRGB(0.45, 0.4, 0.42));
        } else { // pollen by day, fireflies at night
          const x = x0 + Math.sin(t * 0.4 * sp + i * 2) * 40, y = -300 + h(i, 4) * (dark ? 520 : 380) + Math.sin(t * 0.8 * sp + i) * 20;
          const pulse = dark ? 0.6 + 0.4 * Math.sin(t * 3 * sp + i * 5) : 1;
          g.add(x, y, z, (dark ? 1.6 : 0.9 + h(i, 5) * 0.7) * pulse, dark ? c.setRGB(0.9, 1.4, 0.45) : c.setRGB(1, 0.95, 0.55));
        }
      }
      // torch and lantern flames flicker over their baked glow
      sc.torches.forEach((tr, i) => {
        if (tr.smoke) {
          for (let k = 0; k < 10; k++) {
            const ph = (t * 0.28 + k / 10) % 1, s = (5 + ph * 16) * Math.min(1, (1 - ph) * 4);
            sm.add(tr.x + ph * 34 + Math.sin(t + k) * 4, tr.y + 6 + ph * 110, tr.z, s, c.setRGB(0.92, 0.92, 0.95), k);
          }
          return;
        }
        const f = 0.75 + 0.18 * Math.sin(t * 11 + i * 1.7) + 0.1 * Math.sin(t * 23 + i * 3.1);
        g.add(tr.x, tr.y + 1, tr.z + 2, tr.size * 0.42 * f, c.set(tr.color).multiplyScalar(0.5));
      });
    }
    a.end(); g.end(); sm.end();
  }

  dispose() { this.renderer.dispose(); }
}

export const create = (canvas) => new PipsTower3D(canvas);
