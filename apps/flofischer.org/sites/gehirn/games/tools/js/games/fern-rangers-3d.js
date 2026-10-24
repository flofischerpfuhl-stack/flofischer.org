/**
 * Fern Rangers in 3D (Three.js). Draws a FernRangersSession; the 2D overlay (squad count, popups, health numbers, boss
 * bar, grenade button, screen flashes) stays on the session's canvas pass, projected through this camera.
 * World mapping: session x → three x, distance ahead z → three −z, the squad stands at the origin.
 *
 * Scenery is procedural per world (no photo backdrops, nothing to blur): a baked panorama (world/panorama.js: painted
 * sky with clouds and sun, terrain with trees, houses and the landmark) on one plane at the back, the sculpted props of
 * the world along the road (scripts/games-sculpt), a looping strip of roadside dressing (world/roadside.js: fences,
 * lamps, flowers, stones, ruins, snow banks or crystals, gravel shoulders) and, on the meadows and dunes, wind-blown
 * grass at the roadside.
 */
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, MergedCrowd, Particles, TextPlane, projector, LOW_GPU } from './three-kit.js';
import { loadModel } from './models.js';
import { tuft, windy } from './world/island.js';
import { Panorama } from './world/panorama.js';
import { RoadLoop } from './world/roadside.js';
import { ROAD, WEAPONS, BOSSES, PICKUPS, gateText, gateGood, laserOn, laserWarn, geyserState } from './fern-rangers.js';

// The sculpted cast: the squad mixes the four Ranger species; aliens and robots come the other way.
const SPECIES = ['RANGER_BUNNY', 'RANGER_FOX', 'RANGER_HEDGEHOG', 'RANGER_RACCOON'];
const ENEMY_MODEL = { zorbling: 'ZORBLING', zipper: 'ZIPPER', klonk: 'KLONKBOT', shield: 'SHIELD_KLONK', spitter: 'SPITTER', blorb: 'BLORB', buzz: 'BUZZBOT' };
const ENEMY_SCALE = { zorbling: 1.35, zipper: 1.0, klonk: 1.15, shield: 1.1, spitter: 1.3, blorb: 1.0, buzz: 1.25 };
const ENEMY_MAX = { zorbling: 220, zipper: 120, klonk: 140, shield: 50, spitter: 40, blorb: 50, buzz: 80 };
const BOSS_MODEL = { tank: 'KLONK_TANK', drill: 'DRILL_MECH', walker: 'FROST_WALKER', mothership: 'UFO' };
const BOSS_SCALE = { tank: 2.3, drill: 2.4, walker: 2.6, mothership: 1.7 };
const load = (name, lods = ['lo', 'sh']) => Promise.all(lods.map((l) => loadModel(name, l).catch(() => null)));
const CAST = Object.fromEntries(await Promise.all([...SPECIES, ...Object.values(ENEMY_MODEL)].map(async (name) => {
  const [model, shadowModel] = await load(name);
  return [name, { model, shadowModel }];
})));
const BOSS_CAST = Object.fromEntries(await Promise.all(Object.entries(BOSS_MODEL).map(async ([k, name]) => [k, { model: (await load(name, ['lo']))[0] }])));

const FAR = 92;
const THEMES = {
  meadow: {
    ground: 't-grass', sky: { top: 0x4f9ef0, horizon: 0xe4f3ff }, fog: 0xd2e8fa,
    light: { sun: 0xfff1d6, sky: 0xd6ecff, ground: 0x4f6e2c, intensity: 2.6, ambient: 1.2 }, exposure: 1.05,
    near: ['TREE_ROUND', 'BUSH', 'TREE_ROUND', 'ROCK', 'BUSH'], far: ['COTTAGE', 'TREE_ROUND', 'WINDMILL', 'TREE_ROUND', 'COTTAGE'], grass: { colour: [0.27, 0.55, 0.32], height: 0.24 },
  },
  dunes: {
    ground: 't-sand', sky: { top: 0x5f93db, horizon: 0xffe2b0 }, fog: 0xf6dcb4,
    light: { sun: 0xffd29a, sky: 0xffe3c2, ground: 0x9a6b3a, intensity: 2.6, ambient: 1.1 }, exposure: 1.05,
    near: ['CACTUS', 'DESERT_ROCK', 'CACTUS', 'PALM'], far: ['MESA', 'DESERT_ROCK', 'PALM'], grass: { colour: [0.11, 0.42, 0.5], height: 0.18 },
  },
  frost: {
    ground: 't-snow', sky: { top: 0x3f78c8, horizon: 0xeaf5ff }, fog: 0xdfecfa,
    light: { sun: 0xffffff, sky: 0xe0f0ff, ground: 0xb0c4d8, intensity: 2.3, ambient: 1.1 }, exposure: 0.95,
    near: ['PINE_SNOW', 'SNOW_ROCK', 'PINE_SNOW', 'ICE_CRYSTAL'], far: ['PINE_SNOW', 'OBSERVATORY', 'PINE_SNOW'], grass: null,
  },
  ember: {
    ground: 't-lavarock', sky: { top: 0x2a1b40, horizon: 0xe0704a }, fog: 0x6a3446,
    light: { sun: 0xffb27a, sky: 0xff9a6a, ground: 0x3a1408, intensity: 2.2, ambient: 1.0 }, exposure: 1.05,
    near: ['BASALT', 'FERNSTONE', 'BASALT', 'ROCK'], far: ['VOLCANO', 'BASALT'], grass: { colour: [0.06, 0.35, 0.22], height: 0.15 }, ufo: true,
  },
};

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  return t;
}
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

/** Instanced sculpted props that scroll past along the roadside; positions come from a hash of their slot. */
class Roadside {
  constructor(scene, models, max) {
    this.kinds = models.map((m) => ({ model: m, meshes: [], max }));
    const mats = {
      matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
      gloss: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.02 }),
      glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    for (const k of this.kinds) {
      if (!k.model) continue;
      for (const g of k.model) {
        const m = mats[g.mat]();
        if (g.mat === 'matte') m.userData.cheapIbl = true;
        const mesh = new THREE.InstancedMesh(g.geometry, m, max);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = g.mat !== 'glow'; mesh.receiveShadow = g.mat !== 'glow';
        scene.add(mesh); k.meshes.push({ mesh, pivot: g.pivot, spin: g.ch === 'spin' });
      }
    }
    this._m = new THREE.Matrix4(); this._a = new THREE.Matrix4(); this._t = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  begin() { for (const k of this.kinds) k.n = 0; }
  add(kind, x, z, rot, scale, time = 0) {
    const k = this.kinds[kind];
    if (!k || !k.model || k.n >= k.max) return;
    this._m.compose(this._v.set(x, 0, z), this._q.setFromEuler(this._e.set(0, rot, 0)), this._s.setScalar(scale));
    for (const { mesh, pivot, spin } of k.meshes) {
      if (spin) {
        // windmill sails turn about the hub
        this._a.makeTranslation(pivot[0], pivot[1], pivot[2]).multiply(this._t.makeRotationZ(-time * 0.8)).multiply(this._t.makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
        mesh.setMatrixAt(k.n, this._t.multiplyMatrices(this._m, this._a));
      } else mesh.setMatrixAt(k.n, this._m);
    }
    k.n++;
  }
  end() { for (const k of this.kinds) for (const { mesh } of k.meshes) { mesh.count = k.n || 0; mesh.instanceMatrix.needsUpdate = true; } }
  dispose(scene) { for (const k of this.kinds) for (const { mesh } of k.meshes) { scene.remove(mesh); mesh.material.dispose(); } }
}

/** Little round icons for the pickups, drawn once. */
function pickupIcon(type) {
  return canvasTex(128, 128, (g) => {
    const col = PICKUPS[type].color;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(64, 68, 56, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(64, 62, 54, 0, 7); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'medkit') { g.fillRect(52, 34, 24, 56); g.fillRect(36, 50, 56, 24); }
    else if (type === 'grenade') { g.beginPath(); g.arc(64, 70, 24, 0, 7); g.fill(); g.fillRect(56, 36, 16, 14); g.lineWidth = 6; g.beginPath(); g.arc(80, 38, 9, 3, 6); g.stroke(); }
    else if (type === 'freeze') { g.lineWidth = 7; for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; g.beginPath(); g.moveTo(64 - Math.cos(a) * 30, 62 - Math.sin(a) * 30); g.lineTo(64 + Math.cos(a) * 30, 62 + Math.sin(a) * 30); g.stroke(); } }
    else if (type === 'bubble') { g.lineWidth = 7; g.beginPath(); g.arc(64, 62, 26, 0, 7); g.stroke(); g.beginPath(); g.arc(56, 52, 7, 0, 7); g.fill(); }
    else if (type === 'turret') { g.fillRect(44, 60, 40, 22); g.fillRect(58, 36, 12, 28); g.fillRect(40, 82, 48, 8); }
    else if (type === 'double') { g.font = '900 52px Geist, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2×', 64, 64); }
    else if (type === 'revive') { g.beginPath(); g.moveTo(64, 92); g.bezierCurveTo(20, 60, 36, 26, 64, 46); g.bezierCurveTo(92, 26, 108, 60, 64, 92); g.fill(); }
  });
}

export class FernRangers3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    // Shadows are rendered every second frame: figures move a few centimetres per frame, the lag is invisible.
    this.renderer.shadowMap.autoUpdate = false;
    this.frame = 0;
    this.scene = new THREE.Scene();
    // Real reflections only where they show (figures, gates, barrels); ground, road and props get the same soft
    // environment light from a gradient (three-kit cheapIbl) instead of two cube-map lookups per pixel.
    this.env = studioEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.themeName = null;
    this.gates = new Map(); this.props = new Map(); this.pool = new Map();
    this.w = 1; this.h = 1;
    this.uniforms = { uTime: { value: 0 } };
    this.build();
  }

  build() {
    const s = this.scene;
    // the horizon: one baked panorama plane (rebaked per world and screen size)
    this.pano = new Panorama();
    s.add(this.pano.mesh);
    this.far = new THREE.Group(); s.add(this.far);
    // Opaque near ground and road (cheap: early depth rejects everything behind them) plus thin transparent strips at
    // the far end that fade into the fog. Texture offsets of strip and main plane are kept continuous.
    const fade = canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    fade.colorSpace = THREE.NoColorSpace; fade.wrapS = fade.wrapT = THREE.ClampToEdgeWrapping;
    const NEAR_LEN = FAR + 20, STRIP = 50;
    const plane = (w, len, z0, m) => { const me = new THREE.Mesh(new THREE.PlaneGeometry(w, len), m); me.rotation.x = -Math.PI / 2; me.position.set(0, 0, z0 - len / 2); me.receiveShadow = true; s.add(me); return me; };
    const cheap = (m) => { m.userData.cheapIbl = true; return m; };
    this.ground = plane(400, NEAR_LEN, 20, cheap(mat(0xffffff, { roughness: 0.95 })));
    this.ground.position.y = -0.02;
    this.groundFar = plane(400, STRIP, 20 - NEAR_LEN, cheap(mat(0xffffff, { roughness: 0.95, transparent: true, depthWrite: false })));
    this.groundFar.material.alphaMap = fade; this.groundFar.position.y = -0.02;
    const asphalt = texture('t-asphalt', { repeat: [1, NEAR_LEN / 6] });
    this.road = plane(ROAD * 2, NEAR_LEN, 20, cheap(mat(0xffffff, { roughness: 0.85, map: asphalt })));
    const asphaltFar = asphalt.clone(); asphaltFar.repeat.set(1, STRIP / 6);
    this.roadFar = plane(ROAD * 2, STRIP, 20 - NEAR_LEN, cheap(mat(0xffffff, { roughness: 0.85, map: asphaltFar, transparent: true, depthWrite: false })));
    this.roadFar.material.alphaMap = fade;
    this.nearLen = NEAR_LEN; this.strip = STRIP;
    const curbTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#f4f4f5'; g.fillRect(0, 0, w, h); g.fillStyle = '#4c8f3a'; g.fillRect(0, 0, w, h / 2); }, [1, (FAR + 40) / 2]);
    this.curbs = [-1, 1].map((side) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, FAR + 40), cheap(mat(0xffffff, { map: curbTex, roughness: 0.6 })));
      m.position.set(side * (ROAD + 0.12), 0.07, -(FAR + 40) / 2 + 20); m.receiveShadow = true; m.castShadow = true;
      s.add(m); return m;
    });
    this.curbTex = curbTex;
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 1.6), cheap(mat(0xffffff, { roughness: 0.6 })), 40);
    this.dashes.receiveShadow = true; s.add(this.dashes);
    // finish line
    const checker = canvasTex(128, 32, (g) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 8, j * 8, 8, 8); } });
    this.finish = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 1.2), cheap(mat(0xffffff, { map: checker })));
    strip.rotation.x = -Math.PI / 2; strip.position.y = 0.012; strip.receiveShadow = true; this.finish.add(strip);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 10), mat(0xf5f5f5, { metalness: 0.3 }));
      pole.position.set(side * (ROAD + 0.4), 1.7, 0); pole.castShadow = true; this.finish.add(pole);
    }
    const banner = new TextPlane(ROAD * 2 + 0.8, 0.9, 512); banner.set('FERNHAVEN', { fill: '#fde047' });
    const bannerBg = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2 + 1, 0.9, 0.1), mat(0x2f7d3a));
    bannerBg.position.set(0, 3.2, 0); banner.mesh.position.set(0, 3.2, 0.06);
    this.finish.add(bannerBg, banner.mesh);
    s.add(this.finish);

    this.lights = addLights(s, { shadowBox: 13, mapSize: 2048 });
    // one crowd per species; soldier i is species i % 4, so each crowd holds a quarter of the 100-soldier cap; the
    // depth pre-pass keeps the mixed squad as cheap as one sorted crowd
    this.squads = SPECIES.map((n) => new MergedCrowd(s, null, 25, { ...CAST[n], prepass: true }));
    this.enemies = Object.fromEntries(Object.entries(ENEMY_MODEL).map(([type, name]) => [type, new MergedCrowd(s, null, ENEMY_MAX[type], CAST[name])]));
    this.bosses = Object.fromEntries(Object.entries(BOSS_CAST).map(([k, c]) => [k, c.model ? new MergedCrowd(s, null, 1, { model: c.model }) : null]));
    this.caged = new MergedCrowd(s, null, 12, CAST.RANGER_FOX);
    this.bullets = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.8, 2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), 600);
    this.bullets.frustumCulled = false; this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    s.add(this.bullets);
    const additive = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flashes = new Particles(s, 40, new THREE.SphereGeometry(1, 8, 6), additive(0xffffff));
    this.sparks = new Particles(s, 800);
    this.gooFx = new Particles(s, 40, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8dff4a, emissive: 0x3a8a10, emissiveIntensity: 0.8, roughness: 0.15 }));
    this.grenadeFx = new Particles(s, 8, new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.4, metalness: 0.3 }));
    this.rings = Array.from({ length: 6 }, () => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), additive(0xffd36b, 1));
      r.rotation.x = -Math.PI / 2; r.visible = false; s.add(r); return r;
    });
    // telegraphs: lane strips on the road, target discs, beam columns
    this.laneWarn = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(0xff3b3b, 0.5)); m.rotation.x = -Math.PI / 2; m.visible = false; s.add(m); return m; });
    this.discWarn = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), additive(0xb04bff, 0.5)); m.rotation.x = -Math.PI / 2; m.visible = false; s.add(m); return m; });
    this.beams = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 24, 1, true), additive(0xd6a8ff, 0.6)); m.visible = false; s.add(m); return m; });
    // the shield bubble and the turret drop
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshPhysicalMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    this.bubble.visible = false; s.add(this.bubble);
    this.turret = new THREE.Group();
    { const steel = mat(0x8f959e, { metalness: 0.6, roughness: 0.3 }), orange = mat(0x5d7a35, { roughness: 0.5 });
      const legs = [0, 1, 2].map((i) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), steel); const a = (i / 3) * Math.PI * 2; l.position.set(Math.cos(a) * 0.15, 0.25, Math.sin(a) * 0.15); l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); return l; });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), orange); head.position.y = 0.6;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 10), steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.62, -0.3);
      this.turret.add(...legs, head, barrel); this.turret.traverse((o) => { o.castShadow = true; }); }
    this.turret.visible = false; s.add(this.turret);
    applyIbl(s, this.env, 0.55);
    this.barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 16);
    this.ringGeo = new THREE.TorusGeometry(0.345, 0.035, 6, 18);
    this.signGeo = new THREE.CircleGeometry(0.15, 3);
    this.crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    this.glowGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    this.postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.3, 10);
    this.barGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6);
    this.propMats = {
      barrel: mat(0xd7261e, { metalness: 0.35, roughness: 0.35 }), ring: mat(0x3a3a3a, { metalness: 0.6, roughness: 0.3 }),
      sign: new THREE.MeshBasicMaterial({ color: 0xfde047 }), crate: mat(0xffffff, { map: texture('t-wood', { repeat: [1, 1] }), roughness: 0.8 }),
      steel: mat(0x8f959e, { metalness: 0.6, roughness: 0.3 }), tin: mat(0xe07a2c, { metalness: 0.3, roughness: 0.4 }), dark: mat(0x2a2c31, { metalness: 0.4, roughness: 0.5 }),
      energy: additive(0x5ef0ff, 0.55), laser: additive(0xff3b5c, 0.8), ice: new THREE.MeshPhysicalMaterial({ color: 0xcdeeff, roughness: 0.06, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.75 }),
      crater: mat(0x2a2022, { roughness: 0.9 }), lava: new THREE.MeshBasicMaterial({ color: 0xff6a1f, toneMapped: false, transparent: true }),
      plume: additive(0xff8a3a, 0.75), wall: mat(0x7d8da3, { roughness: 0.7 }),
    };
    this.pickupMats = Object.fromEntries(Object.keys(PICKUPS).map((k) => [k, new THREE.SpriteMaterial({ map: pickupIcon(k), depthWrite: false })]));
    this.grass = null;
  }

  async setTheme(name, dark) {
    const key = name + (dark ? ':d' : '');
    if (key === this.themeName) return;
    this.themeName = key;
    const th = THEMES[name] || THEMES.meadow;
    this.th = th;
    this.tile = 10;
    for (const [m, len] of [[this.ground, this.nearLen], [this.groundFar, this.strip]]) {
      m.material.map = texture(th.ground, { repeat: [400 / this.tile, len / this.tile] });
      m.material.needsUpdate = true;
    }
    for (const m of [this.road, this.roadFar]) m.material.color.set(name === 'ember' ? 0x9a8a84 : 0xffffff);
    const L = this.lights;
    L.light.color.set(th.light.sun); L.light.intensity = th.light.intensity;
    L.hemi.color.set(th.light.sky); L.hemi.groundColor.set(th.light.ground); L.hemi.intensity = th.light.ambient;
    this.renderer.toneMappingExposure = th.exposure * (dark ? 0.92 : 1);
    this.scene.fog = new THREE.Fog(th.fog, 50, FAR + 70);
    // roadside props and grass for this world
    if (this.roadside) this.roadside.dispose(this.scene);
    if (this.farProps) this.farProps.dispose(this.scene);
    this.roadside = null; this.farProps = null;
    const near = await Promise.all(th.near.map((n) => loadModel(n, 'lo').catch(() => null)));
    const far = await Promise.all(th.far.map((n) => loadModel(n, 'lo').catch(() => null)));
    if (this.themeName !== key) return;
    const world = ['meadow', 'dunes', 'frost', 'ember'].indexOf(name);
    this.pano.build({ world: Math.max(0, world), dark, low: LOW_GPU, fog: th.fog, light: th.light });
    this.panoDirty = true;
    if (this.loop) { this.scene.remove(this.loop.group, this.loop.static); this.loop.dispose(); }
    this.loop = new RoadLoop({ world: Math.max(0, world), road: ROAD, P: 128, low: LOW_GPU, dark });
    this.scene.add(this.loop.group, this.loop.static);
    this.roadside = new Roadside(this.scene, near, 40);
    this.farProps = new Roadside(this.scene, far, 12);
    // far props stand outside the shadow box: no shadow pass for them
    for (const k of this.farProps.kinds) for (const { mesh } of k.meshes) mesh.castShadow = false;
    if (this.grass) { this.scene.remove(this.grass); this.grass = null; }
    if (th.grass && !LOW_GPU) this.grass = this.makeGrass(th.grass);
    applyIbl(this.scene, this.env, 0.55);
    this.warmedFor = null;
  }

  /** Grass tufts along both roadsides; they loop with the road (one instanced mesh, swaying in the wind). */
  makeGrass(spec) {
    // (fewer than before: the roadside loop now carries flowers and tufts on the verge too)
    const N = 760, geo = tuft(Math.random, 6);
    const mesh = new THREE.InstancedMesh(geo, windy(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), this.uniforms), N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    const col = new THREE.Color();
    this.grassBase = [];
    for (let i = 0; i < N; i++) {
      const side = i % 2 ? 1 : -1, off = ROAD + 0.35 + Math.pow(hash(i * 3.1), 1.6) * 7;
      this.grassBase.push({ x: side * off, z: hash(i * 7.7) * (FAR + 30), s: spec.height * (0.6 + hash(i * 1.3) * 0.9), r: hash(i) * 6 });
      col.setHSL(spec.colour[0] + (hash(i * 5.1) - 0.5) * 0.05, spec.colour[1], spec.colour[2] + hash(i * 2.3) * 0.08);
      mesh.setColorAt(i, col);
    }
    this.scene.add(mesh);
    return mesh;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep about 7.6 road units visible across the squad row, whatever the screen shape.
    const wantHalf = 3.7 / 8.4;
    this.camera.fov = Math.min(84, Math.max(46, (2 * Math.atan(wantHalf / aspect) * 180) / Math.PI));
    this.camera.updateProjectionMatrix();
    this.panoDirty = true;
  }

  /**
   * Before a level runs: build the pooled gates and props it will need and draw everything once, so every shader
   * (including shadow variants and the enemy crowds) is compiled now and not when the first alien walks in.
   */
  warm(s) {
    this.warmedFor = s;
    const counts = new Map();
    for (const e of s.ents) {
      const key = this.keyOf(e);
      if (key && !counts.has(key)) counts.set(key, () => (e.kind === 'gate' ? this.makeGate(e.x1 - e.x0 - 0.16, 1.9) : this.makeProp(e, key)));
    }
    const shown = [];
    for (const [key, make] of counts) {
      const have = this.pool.get(key)?.length || 0;
      for (let i = have; i < 3; i++) this.give(key, make());
      for (const o of this.pool.get(key)) { (o.group || o).visible = true; (o.group || o).position.set(0, 0, -12); shown.push(o); }
    }
    for (const c of [...this.squads, ...Object.values(this.enemies), ...Object.values(this.bosses).filter(Boolean), this.caged]) { c.begin(); c.add(0, -20, -10, 0, 1); c.end(); }
    const m = new THREE.Matrix4().makeTranslation(0, -20, -10);
    this.bullets.setMatrixAt(0, m); this.bullets.count = 1;
    for (const fx of [this.flashes, this.sparks, this.gooFx, this.grenadeFx]) { fx.begin(); fx.add(0, -20, -10, 0.1, 0xffffff); fx.end(); }
    const extras = [this.rings[0], this.laneWarn[0], this.discWarn[0], this.beams[0], this.bubble, this.turret];
    for (const o of extras) o.visible = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    for (const o of shown) (o.group || o).visible = false;
    for (const o of extras) o.visible = false;
    this.bullets.count = 0;
  }
  keyOf(e) {
    if (e.kind === 'gate') return 'gate:' + (e.x1 - e.x0 - 0.16).toFixed(2);
    if (e.kind === 'barrel' || e.kind === 'crate' || e.kind === 'cage' || e.kind === 'geyser') return e.kind;
    if (e.kind === 'pickup') return 'pickup:' + e.type;
    if (e.kind === 'block' || e.kind === 'laser') return `${e.kind}:${(e.x1 - e.x0).toFixed(2)}`;
    if (e.kind === 'ice') return `ice:${(e.x1 - e.x0).toFixed(1)}:${e.len}`;
    if (e.kind === 'fork') return `fork:${e.len}`;
    return null;
  }

  render(s, view) {
    this.setTheme(s.themeName, view.dark);
    if (this.warmedFor !== s) this.warm(s);
    this.uniforms.uTime.value = s.t;
    const cam = this.camera;
    const camX = s.px * 0.35;
    const shake = s.shake > 0 && !view.reduced ? s.shake : 0;
    if (this.panoDirty && this.pano.scene) {
      // bake from the centred camera; the plane then follows the camera sideways
      this.panoDirty = false;
      cam.position.set(0, 4.1, 6.4); cam.lookAt(0, 0.8, -7); cam.updateMatrixWorld();
      this.pano.bake(this.renderer, cam);
    }
    cam.position.set(camX + (Math.random() - 0.5) * shake * 0.25, 4.1 + (Math.random() - 0.5) * shake * 0.2, 6.4);
    cam.lookAt(camX * 0.7, 0.8, -7);
    if (this.pano.base) this.pano.mesh.position.set(this.pano.base.x + camX * 0.98, this.pano.base.y, this.pano.base.z);
    this.loop?.update(s.pos);
    const L = this.lights.light;
    L.position.set(-5 + s.px * 0.3, 12, 4); L.target.position.set(s.px * 0.3, 0, -6);

    const pos = s.pos;
    const gOff = (pos / this.tile) % 1, rOff = (pos / 6) % 1;
    if (this.ground.material.map) { this.ground.material.map.offset.y = gOff; this.groundFar.material.map.offset.y = (gOff + this.nearLen / this.tile) % 1; }
    this.road.material.map.offset.y = rOff; this.roadFar.material.map.offset.y = (rOff + this.nearLen / 6) % 1;
    this.curbTex.offset.y = (pos / 2) % 1;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const d = Math.floor(pos / 4) * 4 + i * 4 - 8;
      const z = d - pos;
      if (z > FAR) break;
      m.makeTranslation(0, 0.006, -z - 0.8); this.dashes.setMatrixAt(n++, m);
    }
    this.dashes.count = n; this.dashes.instanceMatrix.needsUpdate = true;
    this.drawRoadside(s);
    const fz = s.L.length - pos;
    this.finish.visible = fz < FAR && fz > -10;
    this.finish.position.set(0, 0, -fz - 0.6);

    this.drawEntities(s);
    this.drawSquad(s);
    this.drawShots(s);
    this.drawWarnings(s);
    this.drawParticles(s);
    if ((this.frame++ & 1) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, cam);
  }

  drawRoadside(s) {
    const pos = s.pos;
    if (this.roadside) {
      const R = this.roadside, kinds = this.th.near.length;
      R.begin();
      // two rows per side; every slot picks its prop, offset, size and turn from a hash of its distance
      for (let i = 0; i < 36; i++) {
        const d = Math.floor(pos / 5) * 5 + i * 5 - 10;
        const z = d - pos;
        if (z > FAR - 5) break;
        for (const side of [-1, 1]) {
          const h = hash(d * 1.7 + side * 31);
          R.add(Math.floor(h * kinds), side * (ROAD + 1.5 + hash(d + side) * 3.2), -z, h * 6, 0.85 + hash(d * 3 + side) * 0.5);
          if (hash(d * 2.3 + side) > 0.45) R.add(Math.floor(hash(d * 5 + side) * kinds), side * (ROAD + 6 + hash(d * 7 - side) * 6), -z - 2.5, hash(d) * 6, 0.9 + hash(d * 9) * 0.6);
        }
      }
      R.end();
    }
    if (this.farProps && !LOW_GPU) {
      const F = this.farProps, kinds = this.th.far.length;
      F.begin();
      for (let i = 0; i < 8; i++) {
        const d = Math.floor(pos / 16) * 16 + i * 16 - 16;
        const z = d - pos;
        if (z > FAR + 10) break;
        const side = hash(d * 0.37) > 0.5 ? 1 : -1;
        F.add(Math.floor(hash(d * 1.13) * kinds), side * (ROAD + 13 + hash(d * 2.9) * 14), -z, side < 0 ? 0.6 + hash(d) : -0.6 - hash(d), 1 + hash(d * 4.1) * 0.4, s.t);
      }
      F.end();
    }
    if (this.grass) {
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
      const P = FAR + 30;
      this.grassBase.forEach((g, i) => {
        const z = ((g.z - pos) % P + P) % P - 10;
        M.compose(v.set(g.x, -0.01, -z), q.setFromEuler(e.set(0, g.r, 0)), sc.set(1, g.s / 0.95, 1));
        this.grass.setMatrixAt(i, M);
      });
      this.grass.instanceMatrix.needsUpdate = true;
    }
  }

  drawSquad(s) {
    const sq = this.squads; for (const c of sq) c.begin();
    const lost = s.result && !s.result.won;
    if (!lost) {
      // Front to back (nearest the camera first) within each species crowd; the depth pre-pass does the rest.
      const order = this.order || (this.order = []);
      order.length = s.slots.length;
      for (let i = 0; i < order.length; i++) order[i] = i;
      order.sort((a, b) => s.slots[a].z - s.slots[b].z);
      for (const i of order) {
        const sl = s.slots[i];
        sq[i & 3].add(s.px + sl.x, 0, -sl.z, Math.PI, 1.1, { phase: s.t * 11 + i * 1.7, swing: s.speed > 0.5 ? 1 : 0.15, recoil: s.muzzle, lean: s.onIce ? (s.tx - s.px) * 0.08 : 0 });
      }
    }
    for (const c of sq) c.end();
    // shield bubble around the squad, the turret beside it
    this.bubble.visible = s.buffs.bubble > 0 && !lost;
    if (this.bubble.visible) { const r = s.radius + 0.7; this.bubble.position.set(s.px, 0.5, -0.1); this.bubble.scale.set(r, r * 0.75, r); this.bubble.material.opacity = 0.16 + Math.sin(s.t * 6) * 0.05 + (s.buffs.bubble < 1.5 ? Math.sin(s.t * 30) * 0.08 : 0); }
    this.turret.visible = s.buffs.turret > 0 && !lost;
    if (this.turret.visible) { this.turret.position.set(s.turretX, 0, -1.2); this.turret.rotation.y = Math.sin(s.t * 3) * 0.1; }
  }

  drawEntities(s) {
    for (const c of Object.values(this.enemies)) c.begin();
    for (const c of Object.values(this.bosses)) c?.begin();
    this.caged.begin();
    const seen = new Set();
    // nearest first, for the same early-depth benefit as the squad
    const ents = this.sorted || (this.sorted = []);
    ents.length = 0;
    for (const e of s.ents) ents.push(e);
    ents.sort((a, b) => a.d - b.d);
    const icy = new THREE.Color(0xbfe9ff);
    for (const e of ents) {
      const z = e.d - s.pos;
      if (z > FAR || z < -8 - (e.len || 0)) continue;
      const fade = e.alive ? 1 : Math.max(0, e.fade || 0);
      if (e.kind === 'enemy') {
        if (fade <= 0) continue;
        const pose = { phase: e.phase * 1.6, swing: e.active && !(e.frozen > 0) ? 1 : 0.1, flash: e.flash > 0 ? 0.85 : 0, squash: e.alive ? 0 : 1 - fade, tint: e.frozen > 0 ? icy : null };
        if (e.type === 'boss') {
          const b = this.bosses[e.boss];
          const k = e.boss === 'mothership';
          pose.spin = s.t * 0.6; pose.recoil = Math.max(0, 1 - (BOSSES[e.boss].every - e.attackT) * 3);
          b?.add(e.x, k ? 2.6 + Math.sin(s.t * 1.3) * 0.25 : 0, -z, 0, BOSS_SCALE[e.boss], { ...pose, swing: k ? 0 : 0.6, flash: e.coreOpen > 0 && k ? 0.25 + Math.sin(s.t * 12) * 0.2 : pose.flash });
          continue;
        }
        const c = this.enemies[e.type];
        if (e.type === 'shield' && !(e.shield > 0)) pose.hide = 'recoil';
        if (e.type === 'spitter') pose.recoil = Math.max(0, 1 - (2.6 - e.fire) * 4);
        if (e.type === 'buzz') pose.spin = s.t * 22;
        c.add(e.x, e.type === 'buzz' ? 0.75 + Math.sin(s.t * 3 + e.phase) * 0.12 : 0, -z, 0, ENEMY_SCALE[e.type], pose);
      } else {
        const key = this.keyOf(e);
        if (!key) continue;
        seen.add(e); this.drawThing(e, key, z, fade, s);
      }
    }
    for (const c of Object.values(this.enemies)) c.end();
    for (const c of Object.values(this.bosses)) c?.end();
    this.caged.end();
    for (const [e, obj] of this.gates) if (!seen.has(e)) { this.give(obj.key, obj); this.gates.delete(e); }
    for (const [e, obj] of this.props) if (!seen.has(e)) { this.give(obj.userData.key, obj); this.props.delete(e); }
  }

  /**
   * Gates and props are pooled: a passed gate is hidden and reused for the next one of the same size, so no new
   * meshes, materials or shaders are created while playing (that is what caused hitches).
   */
  take(key, make) {
    const list = this.pool.get(key);
    const o = (list && list.pop()) || make();
    (o.group || o).visible = true;
    return o;
  }
  give(key, o) {
    (o.group || o).visible = false;
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key).push(o);
  }

  drawThing(e, key, z, fade, s) {
    if (e.kind === 'gate') {
      let o = this.gates.get(e);
      if (!o) { o = this.take(key, () => this.makeGate(e.x1 - e.x0 - 0.16, 1.9)); o.good = null; o.op = null; this.gates.set(e, o); }
      this.updateGate(o, e, z, fade);
      return;
    }
    let o = this.props.get(e);
    if (!o) { o = this.take(key, () => this.makeProp(e, key)); this.props.set(e, o); }
    this.updateProp(o, e, z, fade, s);
  }

  makeGate(wdt, H) {
    const group = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(wdt, H), new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5, emissive: 0x1d4ed8, emissiveIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 }));
    panel.position.y = H / 2;
    const postMat = mat(0x1e3a8a, { metalness: 0.4, roughness: 0.35 });
    const posts = [-1, 1].map((sd) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, H + 0.2, 10), postMat); p.position.set(sd * wdt / 2, (H + 0.2) / 2, 0); p.castShadow = true; return p; });
    const top = new THREE.Mesh(new THREE.BoxGeometry(wdt + 0.2, 0.14, 0.18), postMat); top.position.y = H + 0.12; top.castShadow = true;
    const label = new TextPlane(wdt * 0.9, H * 0.62, 320);
    label.mesh.position.set(0, H * 0.52, 0.03);
    group.add(panel, ...posts, top, label.mesh);
    this.scene.add(group);
    applyIbl(group, this.env, 0.55);
    return { group, panel, postMat, label, good: null, key: 'gate:' + wdt.toFixed(2) };
  }
  updateGate(o, e, z, fade) {
    const good = gateGood(e);
    if (o.good !== good || o.op !== e.op) {
      o.good = good; o.op = e.op;
      const col = good ? (e.op === 'rate' ? 0x22d3ee : 0x3b82f6) : 0xef4444;
      o.panel.material.color.set(col); o.panel.material.emissive.set(col).multiplyScalar(0.5);
      o.postMat.color.set(good ? (e.op === 'rate' ? 0x0e7490 : 0x1e3a8a) : 0x991b1b);
    }
    o.label.set(gateText(e), { sub: e.op === 'rate' ? 'FIRE RATE' : '' });
    const pulse = e.pulse > 0 ? e.pulse : 0;
    o.panel.material.opacity = (0.42 + pulse * 0.25) * fade;
    o.label.mesh.material.opacity = fade;
    o.label.mesh.scale.setScalar(1 + pulse * 0.12);
    o.group.position.set((e.x0 + e.x1) / 2, 0, -z);
    o.group.scale.set(1, e.alive ? 1 : 1 + (1 - fade) * 0.3, 1);
  }

  makeProp(e, key) {
    const o = new THREE.Group();
    o.userData.key = key;
    const M = this.propMats;
    const add = (mesh, shadow = true) => { mesh.castShadow = shadow; mesh.receiveShadow = true; o.add(mesh); return mesh; };
    if (e.kind === 'barrel') {
      add(new THREE.Mesh(this.barrelGeo, M.barrel)).position.y = 0.45;
      for (const y of [0.18, 0.72]) { const r = add(new THREE.Mesh(this.ringGeo, M.ring), false); r.rotation.x = Math.PI / 2; r.position.y = y; }
      add(new THREE.Mesh(this.signGeo, M.sign), false).position.set(0, 0.45, 0.345);
    } else if (e.kind === 'crate' || e.kind === 'cage') {
      if (e.kind === 'crate') add(new THREE.Mesh(this.crateGeo, M.crate)).position.y = 0.45;
      else {
        // a cage: steel floor and roof, bars all round; a captured Ranger waits inside (drawn by the caged crowd)
        add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), M.steel)).position.y = 0.04;
        add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), M.tin)).position.y = 1.08;
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const b = add(new THREE.Mesh(this.barGeo, M.steel), false); b.position.set(Math.cos(a) * 0.46, 0.56, Math.sin(a) * 0.46); }
      }
      const glow = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({ color: e.kind === 'cage' ? 0x86efac : 0xfacc15, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.y = 0.5; glow.scale.y = e.kind === 'cage' ? 1.1 : 1; o.add(glow); o.userData.glow = glow;
    } else if (e.kind === 'block') {
      // an alien barricade: orange robot plates between posts, a humming energy band on top
      const len = e.x1 - e.x0;
      add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 0.35), M.tin)).position.set(0, 0.35, 0);
      for (let x = -len / 2 + 0.3; x <= len / 2 - 0.3 + 1e-3; x += Math.max(0.6, (len - 0.6) / Math.max(1, Math.round((len - 0.6) / 0.9)))) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 0.4), M.dark)).position.set(x, 0.37, 0);
      const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.08), M.energy); band.position.set(0, 0.86, 0); o.add(band);
    } else if (e.kind === 'laser') {
      const len = e.x1 - e.x0;
      for (const sd of [-1, 1]) add(new THREE.Mesh(this.postGeo, M.steel)).position.set(sd * len / 2, 0.65, 0);
      const beams = [];
      for (const y of [0.3, 0.65, 1.0]) { const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), M.laser.clone()); b.position.set(0, y, 0); o.add(b); beams.push(b); }
      o.userData.beams = beams;
    } else if (e.kind === 'ice') {
      const ice = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0 + 1, e.len), M.ice); ice.rotation.x = -Math.PI / 2; ice.position.set(0, 0.015, -e.len / 2); ice.receiveShadow = true; o.add(ice);
    } else if (e.kind === 'fork') {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, e.len), M.wall)).position.set(0, 0.45, -e.len / 2);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, e.len), M.energy); cap.position.set(0, 0.96, -e.len / 2); o.add(cap);
    } else if (e.kind === 'geyser') {
      const crater = add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.18, 20), M.crater)); crater.position.y = 0.05;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), M.lava.clone()); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.15; o.add(pool);
      const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3, 16, 1, true), M.plume.clone()); plume.position.y = 1.5; o.add(plume);
      o.userData.pool = pool; o.userData.plume = plume;
    } else if (e.kind === 'pickup') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: PICKUPS[e.type].color, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; o.add(ring);
      const icon = new THREE.Sprite(this.pickupMats[e.type]); icon.scale.setScalar(0.8); icon.position.y = 0.75; o.add(icon); o.userData.icon = icon;
    }
    applyIbl(o, this.env, 0.55);
    this.scene.add(o);
    return o;
  }
  updateProp(o, e, z, fade, s) {
    const x = e.kind === 'block' || e.kind === 'laser' || e.kind === 'ice' ? (e.x0 + e.x1) / 2 : e.kind === 'fork' ? e.x : e.x;
    o.position.set(x, 0, -z);
    const shrink = e.kind === 'ice' || e.kind === 'fork' || e.kind === 'geyser' ? 1 : e.alive ? (e.flash > 0 ? 1.08 : 1) : Math.max(0.01, fade);
    o.scale.setScalar(shrink);
    if (o.userData.glow) o.userData.glow.material.opacity = 0.18 + Math.sin(s.t * 6) * 0.12;
    if (e.kind === 'crate') o.rotation.y = Math.sin(s.t * 1.5) * 0.15;
    if (e.kind === 'cage' && e.alive) this.caged.add(e.x, 0.08, -z, Math.sin(s.t * 2) * 0.3, 0.8, { phase: s.t * 3, swing: 0.2, armsUp: Math.sin(s.t * 4) > 0 });
    if (e.kind === 'pickup') { o.userData.icon.position.y = 0.75 + Math.sin(s.t * 3 + e.x) * 0.1; }
    if (e.kind === 'laser') {
      const on = laserOn(e, s.t), warn = laserWarn(e, s.t);
      for (const b of o.userData.beams) { b.visible = on || (warn && Math.sin(s.t * 40) > 0); b.material.opacity = on ? 0.85 : 0.35; }
    }
    if (e.kind === 'geyser') {
      const st = geyserState(e, s.t);
      o.userData.pool.material.color.setHex(st === 'idle' ? 0x7a2a10 : 0xff6a1f);
      o.userData.pool.material.opacity = st === 'warn' ? 0.7 + Math.sin(s.t * 20) * 0.3 : 1;
      o.userData.plume.visible = st === 'burst';
      if (st === 'burst') o.userData.plume.scale.set(1, 0.6 + Math.random() * 0.5, 1);
    }
  }

  drawShots(s) {
    const w = WEAPONS[s.weapon];
    this.bullets.material.color.set(w.color);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const v = new THREE.Vector3(), sc = new THREE.Vector3(1.6, 1, 1.6);
    let n = 0;
    for (const b of s.bullets) {
      const z = b.d - s.pos;
      if (z > FAR || n >= 600) continue;
      m.compose(v.set(b.x, b.turret ? 0.62 : 0.5, -z - 0.4), q, sc);
      this.bullets.setMatrixAt(n++, m);
    }
    this.bullets.count = n; this.bullets.instanceMatrix.needsUpdate = true;
    const f = this.flashes; f.begin();
    if (s.muzzle > 0.35 && !(s.result && !s.result.won)) {
      const shooters = Math.min(s.n, 12), R = Math.min(s.radius * 0.85, ROAD);
      for (let i = 0; i < shooters; i++) {
        const off = shooters === 1 ? 0 : (i / (shooters - 1) - 0.5) * 2 * R;
        f.add(s.px + off + 0.06, 0.52, -0.9, 0.12 * s.muzzle + 0.04, w.color);
      }
    }
    f.end();
    // goo blobs and grenades in flight
    const g = this.gooFx; g.begin();
    for (const b of s.goo) g.add(b.x, b.h, -(b.d - s.pos), 0.22, 0xffffff, s.t * 3, 0.19);
    g.end();
    const gr = this.grenadeFx; gr.begin();
    for (const t of s.throws) {
      const k = Math.min(1, t.t / t.dur);
      gr.add(t.x0 + (t.tx - t.x0) * k, 0.6 + Math.sin(k * Math.PI) * 2.6, -((t.d0 + (t.td - t.d0) * k) - s.pos), 0.16, 0xffffff, s.t * 8);
    }
    gr.end();
  }

  drawWarnings(s) {
    let lane = 0, disc = 0, beam = 0;
    for (const o of [...this.laneWarn, ...this.discWarn, ...this.beams]) o.visible = false;
    for (const w of s.warnings) {
      const k = Math.min(1, Math.max(0, 1 - w.t / w.dur));
      if (w.done) {
        // the strike itself: a short bright column
        if ((w.kind === 'beam' || w.kind === 'strike') && beam < this.beams.length) {
          const b = this.beams[beam++]; b.visible = true; b.position.set(w.x, 15, -0.5); b.scale.set(w.r * (1 + w.t * 2), 1, w.r * (1 + w.t * 2)); b.material.opacity = Math.max(0, 0.7 + w.t * 1.5);
        }
        continue;
      }
      if (w.kind === 'beam' || w.kind === 'strike') {
        if (disc >= this.discWarn.length) continue;
        const d = this.discWarn[disc++]; d.visible = true; d.position.set(w.x, 0.03, -0.5); d.scale.setScalar(w.r * (1.4 - k * 0.4));
        d.material.opacity = 0.25 + k * 0.4 + Math.sin(s.t * 24) * 0.08;
      } else {
        if (lane >= this.laneWarn.length) continue;
        const l = this.laneWarn[lane++]; l.visible = true;
        const len = 24;
        l.position.set((w.x0 + w.x1) / 2, 0.03, -len / 2 + 2); l.scale.set(w.x1 - w.x0, len, 1);
        l.material.color.setHex(w.kind === 'breath' ? 0x6fd6ff : 0xff3b3b);
        l.material.opacity = 0.18 + k * 0.4 + Math.sin(s.t * 24) * 0.06;
      }
    }
  }

  drawParticles(s) {
    const sp = this.sparks; sp.begin();
    let ring = 0;
    for (const r of this.rings) r.visible = false;
    for (const p of s.parts) {
      const z = p.d - s.pos;
      if (z > FAR || z < -8) continue;
      if (p.ring) {
        const r = this.rings[ring++]; if (!r) continue;
        const q = 1 - p.life / p.max;
        r.visible = true; r.position.set(p.x, 0.15, -z); r.scale.setScalar(Math.max(0.01, p.radius * q)); r.material.opacity = 1 - q;
        continue;
      }
      const life = Math.min(1, (p.life / p.max) * 2);
      sp.add(p.x, p.h + 0.05, -z, Math.max(0.02, p.size * 1.4 * life), p.color, p.life * 7);
    }
    sp.end();
  }

  /** Projection for the 2D overlay: distance ahead z and height h → CSS px plus the local scale (px per unit). */
  projectFn() {
    const pr = projector(this.camera, this.w, this.h);
    return (x, z, h = 0) => {
      const a = pr(x, h, -z), b = pr(x + 1, h, -z);
      return { x: a.x, y: a.y, s: Math.hypot(b.x - a.x, b.y - a.y) };
    };
  }
  /** Screen x on the squad's row → road x (for mouse steering). */
  layoutFor() {
    const proj = this.projectFn();
    const o = proj(0, 0, 0), u = proj(1, 0, 0);
    const ppu = Math.max(1, u.x - o.x);
    return { ppu, toWorldX: (sx) => (sx - o.x) / ppu };
  }
  dispose() { this.renderer.dispose(); }
}

export const create = (canvas) => new FernRangers3D(canvas);
