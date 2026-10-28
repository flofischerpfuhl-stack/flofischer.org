/** Fern Rangers: authored campaign and Sturmbastion assets, bounded motion
 * batches, native sockets and shared WebGL context. Gameplay stays in sessions. */
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, Particles, TextPlane, projector, LOW_GPU } from './three-kit.js';
import { RangersArt, ENEMY_ASSET, BOSS_ASSET } from './fern-rangers-art.js';
import { RangerSettlements } from './fern-rangers-scenery.js';
import { RangerProps } from './fern-rangers-props.js';
import { Sturmbastion3D } from './fern-rangers-sturmbastion-3d.js';
import { tuft, windy } from './world/island.js';

import { RoadLoop } from './world/roadside.js';
import { ROAD, WEAPONS, BOSSES, LANES_MAX } from './fern-rangers.js';

const FAR = 92;
const THEMES = {
  meadow: {
    ground: 't-grass', sky: { top: 0x4f9ef0, horizon: 0xe4f3ff }, fog: 0xd2e8fa,
    light: { sun: 0xfff1d6, sky: 0xd6ecff, ground: 0x4f6e2c, intensity: 2.6, ambient: 1.2 }, exposure: 1.05,
    near: ['woodland_birch_young','woodland_bush_flowering','meadow_fern_arching','fw_granite_moss'], far: ['woodland_oak_old','fw_wall_stone_arch','fw_bridge_wood'], grass: { colour: [0.27, 0.55, 0.32], height: 0.24 },
  },
  dunes: {
    ground: 't-sand', sky: { top: 0x5f93db, horizon: 0xffe2b0 }, fog: 0xf6dcb4,
    light: { sun: 0xffd29a, sky: 0xffe3c2, ground: 0x9a6b3a, intensity: 2.6, ambient: 1.1 }, exposure: 1.05,
    near: ['woodland_palm_sahrun','fw_sandstone_bedded','meadow_reed'], far: ['fw_wall_stone_arch','fw_pillar_carved','woodland_palm_sahrun'], grass: { colour: [0.11, 0.42, 0.5], height: 0.18 },
  },
  frost: {
    ground: 't-snow', sky: { top: 0x3f78c8, horizon: 0xeaf5ff }, fog: 0xdfecfa,
    light: { sun: 0xffffff, sky: 0xe0f0ff, ground: 0xb0c4d8, intensity: 2.3, ambient: 1.1 }, exposure: 0.95,
    near: ['woodland_spruce_tiered','fw_snow_wind_drift','fw_ice_crystal_cluster'], far: ['fw_cliff_straight','fw_wall_stone_arch','woodland_spruce_tiered'], grass: null,
  },
  ember: {
    ground: 't-lavarock', sky: { top: 0x2a1b40, horizon: 0xe0704a }, fog: 0x6a3446,
    light: { sun: 0xffb27a, sky: 0xff9a6a, ground: 0x3a1408, intensity: 2.2, ambient: 1.0 }, exposure: 1.05,
    near: ['fw_basalt_columns','fw_petra_raw_fossil','fw_lava_fissure'], far: ['fw_cliff_corner','fw_wall_stone_arch','fw_basalt_columns'], grass: { colour: [0.06, 0.35, 0.22], height: 0.15 }, ufo: true,
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
// particle colours arrive as CSS strings; parse each one once
const COLORS = new Map();
const colorOf = (css) => { let c = COLORS.get(css); if (!c) { c = new THREE.Color(css); COLORS.set(css, c); } return c; };
const WHITE = new THREE.Color(0xffffff);
const SHOTS_MAX = 640;

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
  dispose(scene) { for (const k of this.kinds) for (const { mesh } of k.meshes) { scene.remove(mesh); mesh.material.dispose();mesh.dispose(); } }
}

export class FernRangers3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    // Shadows are rendered every second frame: figures move a few centimetres per frame, the lag is invisible.
    this.renderer.shadowMap.autoUpdate = false;
    this.frame = 0;
    this.campaignScene = new THREE.Scene();
    // Real reflections only where they show (figures, gates, barrels); ground, road and props get the same soft
    // environment light from a gradient (three-kit cheapIbl) instead of two cube-map lookups per pixel.
    this.env = studioEnvironment(this.renderer);
    this.campaignCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.themeName = null;
    this.w = 1; this.h = 1;
    this.uniforms = { uTime: { value: 0 } };
    this.build();
  }

  get scene(){return this.prepared?.mode==='sturmbastion'?this.bonus.scene:this.campaignScene;}
  get camera(){return this.prepared?.mode==='sturmbastion'?this.bonus.camera:this.campaignCamera;}

  build() {
    const s = this.scene;
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
    this.emberBanks=[-1,1].map(side=>{const bank=new THREE.Mesh(new THREE.BoxGeometry(17,.24,NEAR_LEN+STRIP),cheap(mat(0x343942,{map:texture('t-lavarock',{repeat:[1.7,(NEAR_LEN+STRIP)/10]}),roughness:.95})));bank.position.set(side*(ROAD+8.5),-.13,20-(NEAR_LEN+STRIP)/2);bank.visible=false;s.add(bank);return bank;});
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
    // all tracers in one instanced draw; matrices are written straight into the instance buffer (see drawShots)
    this.bullets = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.8, 2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), SHOTS_MAX);
    this.bullets.frustumCulled = false; this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    s.add(this.bullets);
    const additive = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flashes = new Particles(s, LANES_MAX + 4, new THREE.SphereGeometry(1, 8, 6), additive(0xffffff));
    this.sparks = new Particles(s, 800);
    this.gooFx = new Particles(s, 40, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd5f4ee, emissive: 0x416e6b, emissiveIntensity: 0.8, roughness: 0.15 }));
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
    applyIbl(s, this.env, 0.55);
    this.grass = null;
  }

  async setTheme(name, dark) {
    const key = name + (dark ? ':d' : '');
    if (key === this.themeName) return;
    this.themeName = key;
    const th = THEMES[name] || THEMES.meadow;
    this.th = th;
    for(const bank of this.emberBanks)bank.visible=name==='ember';
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
    const near = await Promise.all(th.near.map(n => this.art.library.model(n,'lo')));
    const far = await Promise.all(th.far.map(n => this.art.library.model(n,'lo')));
    if (this.themeName !== key) return;
    const world = ['meadow', 'dunes', 'frost', 'ember'].indexOf(name);
    this.scene.background = new THREE.Color(th.fog);
    if (this.loop) { this.scene.remove(this.loop.group, this.loop.static); this.loop.dispose(); }
    this.settlements?.dispose();this.settlements=await RangerSettlements.create(this.art.library,this.scene,Math.max(0,world),this.env);
    this.loop = new RoadLoop({ world: Math.max(0, world), road: ROAD, P: 128, low: LOW_GPU, dark });
    this.scene.add(this.loop.group, this.loop.static);
    this.roadside = new Roadside(this.scene, near, 40);
    this.farProps = new Roadside(this.scene, far, 12);
    // far props stand outside the shadow box: no shadow pass for them
    for (const k of this.farProps.kinds) for (const { mesh } of k.meshes) mesh.castShadow = false;
    if (this.grass) { this.scene.remove(this.grass);this.grass.geometry.dispose();this.grass.material.dispose();this.grass.dispose(); this.grass = null;this.grassMats=false; }
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
    this.grassBase = []; this.grassMats = false;
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
  }

  /**
   * Before a level runs: build the pooled gates and props it will need and draw everything once, so every shader
   * (including shadow variants and the enemy crowds) is compiled now and not when the first alien walks in.
   */
  async prepare(s) {
    if (this.prepared === s) return;
    this.prepared=null;
    if (s.mode === 'sturmbastion') {
      this.bonus ||= new Sturmbastion3D(this.renderer, this.env);
      await this.bonus.prepare(s); this.prepared=s; return;
    }
    this.native?.dispose(); this.art?.dispose();
    this.art=new RangersArt(this.scene,this.env);
    this.native=new RangerProps(this.scene,this.art,this.env);
    this.themeName=null;
    const types=new Set(s.ents.filter(e=>e.kind==='enemy'&&e.type!=='boss').map(e=>e.type));
    if(s.boss) types.add(BOSSES[s.boss.boss].minion);
    if(types.has('blorb')) types.add('zorbling');
    await this.art.prepareTroops();
    for(const type of types) { await this.art.batch(ENEMY_ASSET[type],320,'far'); await this.art.batch(ENEMY_ASSET[type],320,'lo'); }
    if(types.has('blorb'))await this.art.prepareHulkSockets();
    await this.native.prepare(s);
    if(s.boss) this.bossActor=await this.art.actor(BOSS_ASSET[s.boss.boss],'lo'); else this.bossActor=null;
    await this.setTheme(s.themeName,false);
    this.prepared=s;
    this.render(s,{dark:false,reduced:true});
    await this.renderer.compileAsync(this.scene,this.camera);
  }

  render(s, view) {
    if(s.mode==='sturmbastion'){this.bonus.resize(this.w,this.h);return this.bonus.render(s,view);}
    if(this.prepared!==s) return;
    this.art.begin(); this.native.begin();
    this.uniforms.uTime.value = s.t;
    const cam = this.camera;
    const camX = s.px * 0.35;
    const shake = s.shake > 0 && !view.reduced ? s.shake : 0;
    cam.position.set(camX + (Math.random() - 0.5) * shake * 0.25, 5.6 + (Math.random() - 0.5) * shake * 0.2, 9.2);
    cam.lookAt(camX * 0.7, 1.0, -8);
    this.loop?.update(s.pos);this.settlements?.update(s.pos);
    const L = this.lights.light;
    L.position.set(-5 + s.px * 0.3, 12, 4); L.target.position.set(s.px * 0.3, 0, -6);

    const pos = s.pos;
    const gOff = (pos / this.tile) % 1, rOff = (pos / 6) % 1;
    if (this.ground.material.map) { this.ground.material.map.offset.y = gOff; this.groundFar.material.map.offset.y = (gOff + this.nearLen / this.tile) % 1; }
    this.road.material.map.offset.y = rOff; this.roadFar.material.map.offset.y = (rOff + this.nearLen / 6) % 1;
    this.curbTex.offset.y = (pos / 2) % 1;
    const m = this._dash || (this._dash = new THREE.Matrix4());
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const d = Math.floor(pos / 4) * 4 + i * 4 - 8;
      const z = d - pos;
      if (z > FAR) break;
      m.makeTranslation(0, 0.006, -z - 0.8); this.dashes.setMatrixAt(n++, m);
    }
    this.dashes.count = n; this.dashes.instanceMatrix.needsUpdate = true;
    this.drawRoadside(s);
    const fz = s.goal - pos;
    // boss levels: the finish arch rises out of the road where the boss went down (the level ends right there)
    if (this.finishFor !== s) { this.finishFor = s; this.finishUp = null; }
    let rise = 1;
    if (s.boss) {
      if (s.boss.alive) rise = 0;
      else { if (this.finishUp == null) this.finishUp = s.t; const k = Math.min(1, (s.t - this.finishUp) / 0.5); rise = 1 - (1 - k) * (1 - k); }
    }
    this.finish.visible = rise > 0 && fz < FAR && fz > -10;
    this.finish.position.set(0, 0, -fz - 0.6);
    this.finish.scale.set(1, Math.max(0.01, rise), 1);

    this.drawEntities(s);
    this.drawSquad(s);
    this.drawShots(s);
    this.drawWarnings(s);
    this.drawParticles(s);
    this.native.events(s); this.native.end(); this.art.end();
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
      // a tuft's matrix only changes by its distance along the road: rotation and size are baked once
      const P = FAR + 30, a = this.grass.instanceMatrix.array;
      if (!this.grassMats) {
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
        this.grassBase.forEach((g, i) => { M.compose(v.set(g.x, -0.01, 0), q.setFromEuler(e.set(0, g.r, 0)), sc.set(1, g.s / 0.95, 1)); M.toArray(a, i * 16); });
        this.grassMats = true;
      }
      const base = this.grassBase;
      for (let i = 0; i < base.length; i++) { const z = ((base[i].z - pos) % P + P) % P - 10; a[i * 16 + 14] = -z; }
      this.grass.instanceMatrix.needsUpdate = true;
    }
  }

  drawSquad(s) {
    const lost=s.result&&!s.result.won;
    if(!lost) {
      const count=Math.min(28,s.n);
      for(let i=0;i<count;i++) {
        const row=Math.floor(i/5),col=i%5, x=(col-2)*.7;
        // Full authored person scale. One giant stands behind the formation.
        this.art.troop(i,s.px+(i===17?-1.7:x),i===17?1.8:row*.68-.8,s.t);
      }
    }
    this.bubble.visible=s.buffs.bubble>0&&!lost;
    if(this.bubble.visible){this.bubble.position.set(s.px,1,-.1);this.bubble.scale.set(2.4,2.1,2.4);}
    this.native.turret(s);
  }
  drawEntities(s) {
    const dead=new Set();
    for(const v of s.visualEvents||[]) if(v.entity&&s.t-v.time<4) dead.add(v.entity);
    const entities=[...s.ents,...[...dead].filter(e=>!s.ents.includes(e))];
    for(const e of entities) {
      const z=e.d-s.pos,age=e.disabledAt==null?0:s.t-e.disabledAt;
      if(z>FAR||z< -10-(e.len||0))continue;
      if(e.kind==='enemy') {
        if(!e.alive&&((e.type==='blorb'&&e.split&&age>=1.2)||(age>2&&e.type!=='boss')))continue;
        if(e.type==='boss'){this.drawBoss(e,s,z,age);continue;}
        const birth=e.spawnHull,birthAge=birth?s.t-birth.time:99;if(birthAge<1.2)continue;const k=birth?Math.max(0,1-(birthAge-1.2)/.6):0,socket=birth?this.art.hulkSockets[birth.side<0?0:1]:null;
        this.art.machine(e.type,e.x*(1-k)+(birth?birth.x+socket.x:0)*k,-z*(1-k)+(birth?-birth.d+s.pos+socket.z:0)*k,s.t,{active:e.active&&!e.frozen,speed:e.speed||1,phase:e.phase||0,disabled:!e.alive,age,near:z<15,split:e.split,hitAge:s.t-(e.hitAt??-99),fireAge:s.t-(e.fireAt??-99),wheelPhase:e.phase/(3*Math.max(.1,e.speed||1))});
      } else this.native.entity(e,s,z,age);
    }
  }
  drawBoss(e,s,z,age) {
    const a=this.bossActor;if(!a)return;
    a.scene.visible=true;a.scene.position.set(e.x,e.boss==='mothership'?.85:0,-z);
    const hover=e.boss==='mothership',warning=s.warnings?.find(w=>w.boss===e);
    let clip=hover?'Idle_Hover':e.active?'Travel':'Idle',time=s.t,loop=true;
    const charge={tank:'Attack_FrontSweep',drill:'Drill_Charge',walker:'Frost_Charge',mothership:'Broadside_Charge'}[e.boss];
    const fire={tank:'Fire_Recoil',drill:'Drill_Strike',walker:'Frost_Fire',mothership:'Broadside_Fire'}[e.boss];
    const impact={tank:.08,drill:.384,walker:.10,mothership:.1667}[e.boss],shotAge=s.t-(e.fireAt??-99);
    if(!e.alive){clip=age<.55?(hover?'Disabled_Hover':'Disabled'):'EscapeHatch';time=age<.55?age:age-.55;loop=false;}
    else if(warning){clip=warning.t<=impact?fire:charge;time=warning.t<=impact?impact-warning.t:s.t-(e.attackAt||0);loop=false;}
    else if(shotAge<1.2){clip=fire;time=shotAge+impact;loop=false;}
    else if(e.coreOpen>0){clip='OpenWeakpoint';time=1;loop=false;}
    else if(s.t-(e.hitAt??-99)<.12){clip='Hit';time=s.t-e.hitAt;loop=false;}
    a.pose(clip,time,loop);
    if(!e.alive&&age>=.55)this.native.escape(a,e,s,age-.55);
  }

  drawShots(s) {
    const w = WEAPONS[s.weapon];
    // heavier tracers (a big squad, or guns faster than the tracers can show) burn brighter, towards white
    const heft = Math.max(1, s.heft || 1);
    const glow = Math.min(0.55, Math.log2(heft) * 0.12);
    this.bullets.material.color.copy(colorOf(w.color)).lerp(WHITE, glow);
    // Matrices go straight into the instance buffer: a tracer is the capsule turned to lie along the road (rotation
    // about x by 90°), scaled by its heft, at its spot; only the used part of the buffer is uploaded.
    const S = s.shots, a = this.bullets.instanceMatrix.array;
    let n = 0;
    for (let i = 0; i < S.n && n < SHOTS_MAX; i++) {
      const z = S.d[i] - s.pos;
      if (z > FAR) continue;
      const h = S.heft[i], lg = h > 1 ? Math.log2(h) : 0;
      // heavier tracers: a little thicker, clearly longer (streaks), see also the colour above
      const wd = 1.6 * Math.min(1.7, 1 + lg * 0.18), len = Math.min(2.4, 1 + lg * 0.3);
      const o = n * 16;
      a[o] = wd; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = 0; a[o + 6] = len; a[o + 7] = 0;
      a[o + 8] = 0; a[o + 9] = -wd; a[o + 10] = 0; a[o + 11] = 0;
      a[o + 12] = S.x[i]; a[o + 13] = S.turret[i] ? .78 : 1.12; a[o + 14] = -z - 0.4 * len; a[o + 15] = 1;
      n++;
    }
    const im = this.bullets.instanceMatrix;
    this.bullets.count = n;
    im.clearUpdateRanges(); im.addUpdateRange(0, Math.max(1, n) * 16); im.needsUpdate = true;
    const f = this.flashes; f.begin();
    if (!(s.result && !s.result.won)) {
      // a flash on every lane that just fired; heavy fire makes them bigger
      const lanes = Math.min(s.lanes || 1, LANES_MAX);
      const big = 1 + Math.min(0.8, Math.log2(heft) * 0.2), col = colorOf(w.color);
      for (let i = 0; i < lanes; i++) {
        const k = s.laneFlash[i];
        if (k > 0.3) f.add(s.px + s.laneX[i] + 0.06, 1.12, -0.9, (0.12 * k + 0.04) * big, col);
      }
    }
    f.end();
    // goo blobs and grenades in flight
    const g = this.gooFx; g.begin();
    for (const b of s.goo) g.add(b.x, b.h, -(b.d - s.pos), 0.22, WHITE, s.t * 3, 0.19);
    g.end();
    const gr = this.grenadeFx; gr.begin();
    gr.end();
  }

  drawWarnings(s) {
    let lane = 0, disc = 0, beam = 0;
    for (const o of this.laneWarn) o.visible = false;
    for (const o of this.discWarn) o.visible = false;
    for (const o of this.beams) o.visible = false;
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
      sp.add(p.x, p.h + 0.05, -z, Math.max(0.02, p.size * 1.4 * life), colorOf(p.color), p.life * 7);
    }
    sp.end();
  }

  /** Projection for the 2D overlay: distance ahead z and height h → CSS px plus the local scale (px per unit). */
  projectFn() {
    if(this.prepared?.mode==='sturmbastion')return this.bonus.projectFn();
    const pr = projector(this.camera, this.w, this.h);
    return (x, z, h = 0) => {
      const a = pr(x, h, -z), b = pr(x + 1, h, -z);
      return { x: a.x, y: a.y, s: Math.hypot(b.x - a.x, b.y - a.y) };
    };
  }
  /** Screen x on the squad's row → road x (for mouse steering). */
  layoutFor() {
    if(this.prepared?.mode==='sturmbastion')return this.bonus.layoutFor();
    const proj = this.projectFn();
    const o = proj(0, 0, 0), u = proj(1, 0, 0);
    const ppu = Math.max(1, u.x - o.x);
    return { ppu, toWorldX: (sx) => (sx - o.x) / ppu };
  }
  dispose() {
    this.native?.dispose();this.art?.dispose();this.bonus?.dispose();this.loop?.dispose();this.settlements?.dispose();
    this.roadside?.dispose(this.campaignScene);this.farProps?.dispose(this.campaignScene);
    const geo=new Set(),mats=new Set(),tex=new Set();this.campaignScene.traverse(o=>{if(o.geometry)geo.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)tex.add(v);}});
    for(const x of geo)x.dispose();for(const x of mats)x.dispose();for(const x of tex)x.dispose();this.env.dispose();this.renderer.dispose();
  }
}

export const create = (canvas) => new FernRangers3D(canvas);
