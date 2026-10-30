/** Fern Rangers: authored campaign and Sturmbastion assets, bounded motion
 * batches, native sockets and shared WebGL context. Gameplay stays in sessions. */
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, Particles, TextPlane, projector, LOW_GPU, compileReady } from './three-kit.js';
import { LIVE_TROOP_HEIGHT, TROOP_PROFILES, warmCampaignFormations, campaignFormation, nearestMuzzle, shotSegment } from './fern-rangers-formation.js';
import { RangersArt, ENEMY_ASSET, BOSS_ASSET } from './fern-rangers-art.js';
import { RangerSettlements, RangerRoute } from './fern-rangers-scenery.js';
import { RangerProps } from './fern-rangers-props.js';
import { Sturmbastion3D } from './fern-rangers-sturmbastion-3d.js';
import { tuft, windy } from './world/island.js';
import { createShading, shadeFromUrl } from './cel-shading.js';

import { RangerPanorama } from './fern-rangers-panorama.js';
import { MeadowScenery, lawnTexture } from './fern-rangers-meadow.js';
import { paintedGround } from './fern-rangers-worlds.js';
import { ROAD, WEAPONS, BOSSES, LANES_MAX } from './fern-rangers.js';

const FAR = 92;
const THEMES = {
  meadow: {
    ground: 't-grass', sky: { top: 0x4f9ef0, horizon: 0xe4f3ff }, fog: 0xd2e8fa,
    light: { sun: 0xffe6bf, sky: 0xcfe6ff, ground: 0x5a7a30, intensity: 3.0, ambient: 1.0 }, exposure: 1.05,
    near: [], far: [], // composed by MeadowScenery grass: { colour: [0.27, 0.55, 0.32], height: 0.24 },
  },
  dunes: {
    ground: 't-sand', sky: { top: 0x5f93db, horizon: 0xffe2b0 }, fog: 0xf6dcb4,
    light: { sun: 0xffd29a, sky: 0xffe3c2, ground: 0x9a6b3a, intensity: 2.6, ambient: 1.1 }, exposure: 1.05,
    near: ['woodland_palm_sahrun','fw_sandstone_bedded','meadow_reed'], far: ['fw_sandstone_bedded','woodland_palm_sahrun'], grass: { colour: [0.11, 0.42, 0.5], height: 0.18 },
  },
  frost: {
    ground: 't-snow', sky: { top: 0x3f78c8, horizon: 0xeaf5ff }, fog: 0xdfecfa,
    light: { sun: 0xffffff, sky: 0xe0f0ff, ground: 0xb0c4d8, intensity: 2.3, ambient: 1.1 }, exposure: 0.95,
    near: ['woodland_spruce_tiered','fw_snow_wind_drift','fw_ice_crystal_cluster'], far: ['fw_cliff_straight','woodland_spruce_tiered'], grass: null,
  },
  ember: {
    ground: 't-lavarock', sky: { top: 0x2a1b40, horizon: 0xe0704a }, fog: 0x6a3446,
    light: { sun: 0xffc08a, sky: 0xffa882, ground: 0x6a2a18, intensity: 2.6, ambient: 1.5 }, exposure: 1.2,
    near: ['fw_basalt_columns','fw_petra_raw_fossil','fw_lava_fissure'], far: ['fw_cliff_corner','fw_basalt_columns'], grass: { colour: [0.06, 0.35, 0.22], height: 0.15 }, ufo: true,
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
    this.frame = 0;this.preparing=Promise.resolve();this.prepareEpoch=0;this.disposed=false;
    this.campaignScene = new THREE.Scene();
    // Real reflections only where they show (figures, gates, barrels); ground, road and props get the same soft
    // environment light from a gradient (three-kit cheapIbl) instead of two cube-map lookups per pixel.
    this.env = studioEnvironment(this.renderer);
    // shared Wind Waker cel look (cel-shading.js): applyIbl() converts every standard material through env.userData.shading, Lambert scenery via apply()
    const variant = shadeFromUrl(); this.shading = variant ? createShading(variant, { ambient: .7 }) : null; if (this.shading) this.env.userData.shading = this.shading;
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
    this.pano = new RangerPanorama(); s.add(this.pano.mesh);
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
    const asphalt = this.routeTexture('meadow',NEAR_LEN);
    this.road = plane(ROAD * 2, NEAR_LEN, 20, cheap(mat(0xffffff, { roughness: 0.85, map: asphalt })));
    const asphaltFar = asphalt.clone(); asphaltFar.repeat.set(1, STRIP / 6);
    this.roadFar = plane(ROAD * 2, STRIP, 20 - NEAR_LEN, cheap(mat(0xffffff, { roughness: 0.85, map: asphaltFar, transparent: true, depthWrite: false })));
    this.roadFar.material.alphaMap = fade;
    this.nearLen = NEAR_LEN; this.strip = STRIP;
    this.emberBanks=[-1,1].map(side=>{const bank=new THREE.Mesh(new THREE.BoxGeometry(17,.24,NEAR_LEN+STRIP),cheap(mat(0x343942,{map:texture('t-lavarock',{repeat:[1.7,(NEAR_LEN+STRIP)/10]}),roughness:.95})));bank.position.set(side*(ROAD+8.5),-.13,20-(NEAR_LEN+STRIP)/2);bank.visible=false;s.add(bank);return bank;});
    // the road is a slab: a raised verge lip (grass, sand, snow or rock on top, earth or stone on its side) runs along both edges
    const curbTex = canvasTex(4, 4, () => {}, [1, 1]);
    this.curbs = [-1, 1].map((side) => {
      const geo = new THREE.BoxGeometry(0.62, 0.24, FAR + 40);
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
      const lipMat = cheap(mat(0xffffff, { roughness: 0.8 })); lipMat.vertexColors = true;
      const m = new THREE.Mesh(geo, lipMat);
      m.position.set(side * (ROAD + 0.28), 0.12, -(FAR + 40) / 2 + 20); m.receiveShadow = true; m.castShadow = true;
      s.add(m); return m;
    });
    this.curbTex = curbTex;
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 1.6), cheap(mat(0xffffff, { roughness: 0.6 })), 40);
    this.dashes.receiveShadow = true; this.dashes.visible=false; s.add(this.dashes);
    // finish line
    const checker=canvasTex(128,32,g=>{g.fillStyle='#9b937d';g.fillRect(0,0,128,32);g.fillStyle='#dbcea5';g.fillRect(0,3,128,3);g.fillRect(0,26,128,3);for(let i=0;i<8;i++){g.beginPath();g.moveTo(i*16+2,16);g.lineTo(i*16+8,9);g.lineTo(i*16+14,16);g.lineTo(i*16+8,23);g.fill();}});
    this.finish = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 1.2), cheap(mat(0xffffff, { map: checker })));
    strip.rotation.x = -Math.PI / 2; strip.position.y = 0.012; strip.receiveShadow = true; this.finish.add(strip);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 10), mat(0xf5f5f5, { metalness: 0.3 }));
      pole.position.set(side * (ROAD + 0.4), 1.7, 0); pole.castShadow = true; this.finish.add(pole);
    }
    const banner = new TextPlane(ROAD * 2 + 0.8, 0.9, 512); banner.set('SEKTOR FREI', { fill: '#fde047' });
    const bannerBg = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2 + 1, 0.9, 0.1), mat(0x345b68));
    bannerBg.position.set(0, 3.2, 0); banner.mesh.position.set(0, 3.2, 0.06);
    this.finish.add(bannerBg, banner.mesh);
    s.add(this.finish);

    this.lights = addLights(s, { shadowBox: 13, mapSize: 2048 });
    // all tracers in one instanced draw; matrices are written straight into the instance buffer (see drawShots)
    this.bullets = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.8, 2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.NormalBlending, depthWrite: false }), SHOTS_MAX);
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

  routeTexture(name,len) {
    const palette={meadow:['#a99677','#b8a585','#7f6f55'],dunes:['#a58b68','#b59e79','#907a5a'],frost:['#87959d','#a7b0b3','#73838b'],ember:['#605961','#766b70','#4c474f']}[name]||['#777b69','#8c8e7c','#626956'];
    return canvasTex(512,512,(g,w,h)=>{
      g.fillStyle=palette[2];g.fillRect(0,0,w,h);
      for(let row=0;row<12;row++)for(let col=-1;col<9;col++){
        const x=col*64+(row%2)*32,y=row*44,shade=hash(row*31+col*19);
        g.fillStyle=palette[shade>.5?0:1];g.fillRect(x+2,y+2,60,40);
        g.fillStyle='rgba(242,229,195,.07)';g.fillRect(x+3,y+3,58,2);
      }
      // Worn earthen shoulders blend into the verge, without highway markings.
      const fade=g.createLinearGradient(0,0,w,0);fade.addColorStop(0,'rgba(91,77,53,.55)');fade.addColorStop(.13,'rgba(91,77,53,0)');fade.addColorStop(.87,'rgba(91,77,53,0)');fade.addColorStop(1,'rgba(91,77,53,.55)');g.fillStyle=fade;g.fillRect(0,0,w,h);
    },[1,len/8]);
  }
  groundTexture(name,len) {
    const p={meadow:['#6f8753','#7c945e','#647d4a'],dunes:['#c0a279','#cbb18c','#b69970'],frost:['#dce6e9','#e8edef','#cddbe0'],ember:['#49434b','#51494e','#403d46']}[name];
    return canvasTex(512,512,(g,w,h)=>{g.fillStyle=p[0];g.fillRect(0,0,w,h);for(let i=0;i<2400;i++){g.fillStyle=p[i%2+1];const x=hash(i*1.21)*w,y=hash(i*4.77)*h;g.globalAlpha=.13+hash(i)*.15;g.fillRect(x,y,3+hash(i*7)*9,2+hash(i*3)*5);}g.globalAlpha=1;},[400/this.tile,len/this.tile]);
  }

  async setTheme(name, dark) {
    const key=name;
    if (key === this.themeName) return;
    this.themeName = key; this.renderDark = dark; this.shading?.setDark(!!dark);
    const th = THEMES[name] || THEMES.meadow;
    this.th = th;
    for(const bank of this.emberBanks)bank.visible=false;
    this.tile = 10;
    const lip = { meadow: [0x7ed03a, 0x7a5230], dunes: [0xf0cf8c, 0xb8743c], frost: [0xffffff, 0x7096c4], ember: [0x8a5a52, 0x2e2028] }[name] || [0x7ed03a, 0x7a5230];
    for (const curb of this.curbs) {
      const col = curb.geometry.attributes.color, top = new THREE.Color(lip[0]), side = new THREE.Color(lip[1]);
      for (let i = 0; i < col.count; i++) { const c = Math.floor(i / 4) === 2 ? top : side; col.setXYZ(i, c.r, c.g, c.b); }
      col.needsUpdate = true;
    }
    for (const [m, len] of [[this.ground, this.nearLen], [this.groundFar, this.strip]]) {
      m.material.map?.dispose();
      if (name === 'meadow') { const t = lawnTexture().clone(); t.repeat.set(400 / this.tile, len / this.tile) /* one tile = this.tile units, as the scroll offset pos / tile assumes */; t.needsUpdate = true; m.material.map = t; }
      else { const t = paintedGround(name).clone(); t.repeat.set(400 / this.tile, len / this.tile); t.needsUpdate = true; m.material.map = t; }
      m.material.color.set(0xffffff);
      m.material.needsUpdate = true;
    }
    for(const [m,len] of [[this.road,this.nearLen],[this.roadFar,this.strip]]){m.material.map?.dispose();m.material.map=this.routeTexture(name,len);m.material.color.set(0xffffff);m.material.needsUpdate=true;}
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
    await this.pano.build({library:this.art.library,world:Math.max(0,world),dark,low:LOW_GPU,fog:th.fog,light:th.light}); this.panoDirty = true;
    if (this.pano.scene) this.shading?.apply(this.pano.scene, { outline: false });
    if (this.loop) { this.scene.remove(this.loop.group, this.loop.static); this.loop.dispose(); }
    this.settlements?.dispose();this.settlements=null;this.meadow?.dispose();this.meadow=null;this.loop=null;
    // one composed route per world (terraced slopes, framing, groups, landmarks) replaces the loose roadside props
    const scenery = await MeadowScenery.create({ library: this.art.library, road: ROAD, low: LOW_GPU, world: name });
    if (this.themeName !== key) { scenery.dispose(); return; }
    this.meadow = scenery; this.scene.add(scenery.group);
    if (this.grass) { this.scene.remove(this.grass);this.grass.geometry.dispose();this.grass.material.dispose();this.grass.dispose(); this.grass = null;this.grassMats=false; }
    if (th.grass && !LOW_GPU) this.grass = this.makeGrass(th.grass);
    applyIbl(this.scene, this.env, 0.55);
    this.shading?.apply(this.campaignScene, { outline: false }); // Lambert scenery (meadow, route, terrain) and anything applyIbl skips
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
    const changed=this.w!==w||this.h!==h||this.dpr!==dpr;this.w=w;this.h=h;this.dpr=dpr;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.campaignCamera.aspect = aspect;
    // Keep about 7.6 road units visible across the squad row, whatever the screen shape.
    const wantHalf = 3.7 / 8.4;
    this.campaignCamera.fov = Math.min(84, Math.max(46, (2 * Math.atan(wantHalf / aspect) * 180) / Math.PI));
    this.campaignCamera.updateProjectionMatrix();
    this.panoDirty ||= changed;
  }

  /**
   * Before a level runs: build the pooled gates and props it will need and draw everything once, so every shader
   * (including shadow variants and the enemy crowds) is compiled now and not when the first alien walks in.
   */
  prepare(s,options={}) {
    const epoch=++this.prepareEpoch;this.prepareController?.abort();const controller=new AbortController();this.prepareController=controller;
    const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
    const job=this.preparing.catch(()=>{}).then(()=>this.prepareLevel(s,{...options,signal},epoch));this.preparing=job.catch(()=>{});return job;
  }
  async prepareLevel(s,{onProgress,signal,background=false}={},epoch) {
    const started=performance.now(),check=()=>{signal?.throwIfAborted();if(this.disposed||epoch!==this.prepareEpoch)throw new DOMException('Rangers preparation superseded','AbortError');};
    const stage=name=>{check();onProgress?.({phase:'prepare',stage:name,done:false});};check();
    // behind the map every step hands the main thread back first, so panning and tapping stay smooth
    const pause=background?()=>new Promise(resolve=>setTimeout(resolve,0)):null,rest=async()=>{if(pause){await pause();check();}};
    if(this.prepared===s){onProgress?.({phase:'prepare',stage:'Trupp bereit',done:true,cache:'session'});return;}
    this.prepared=null;
    try {
      if(s.mode==='sturmbastion') {
        this.campaignScene.visible=false;this.bonus ||= new Sturmbastion3D(this.renderer,this.env);this.bonus.scene.visible=true;
        await this.bonus.prepare(s,{onProgress,signal});check();this.prepared=s;
        this.prepareMetrics={milliseconds:performance.now()-started,mode:'sturmbastion',reused:!!this.bonus.prepareMetrics?.reused};return;
      }
      this.campaignScene.visible=true;if(this.bonus)this.bonus.scene.visible=false;
      const reused=this.regionKey===s.themeName&&!!this.art;
      if(!reused){this.clearCampaign();this.regionKey=s.themeName;this.art=new RangersArt(this.campaignScene,this.env);this.native=new RangerProps(this.campaignScene,this.art,this.env);this.themeName=null;}
      this.art.library.setProgressListener(onProgress,signal);this.resetCampaignVisuals();
      const before=this.art.batches.size+this.art.channels.size+this.art.actors.length;
      const types=new Set(s.ents.filter(e=>e.kind==='enemy'&&e.type!=='boss').map(e=>e.type));if(s.boss)types.add(BOSSES[s.boss.boss].minion);if(types.has('blorb'))types.add('zorbling');
      this.prefetchAssets(s,types);
      stage('Legionäre und Bewegungen vorbereiten …');await this.art.prepareTroops();check();await rest();await warmCampaignFormations(s,{pause});check();
      for(const type of types){stage('Automaten vorbereiten …');await this.art.batch(ENEMY_ASSET[type],320,'far');check();await rest();await this.art.batch(ENEMY_ASSET[type],320,'lo');check();await rest();}
      if(types.has('blorb')){await this.art.prepareHulkSockets();check();}
      stage('Tore und Ausrüstung vorbereiten …');await this.native.prepare(s,{onProgress,signal});check();await rest();
      if(s.boss){const id=BOSS_ASSET[s.boss.boss];if(this.bossActorId!==id){this.bossActor=await this.art.actor(id,'lo');this.bossActorId=id;}check();}
      else if(this.bossActor)this.bossActor.scene.visible=false;
      stage('Marschroute und Horizont vorbereiten …');await this.setTheme(s.themeName,!!this.renderDark);check();await rest();
      const grown=this.art.batches.size+this.art.channels.size+this.art.actors.length!==before;
      this.prepared=s;
      // link the programs in parallel first; the first render() then finds them ready instead of blocking on each one
      let compile=0;if(!this.campaignCompiled||grown){onProgress?.({phase:'compile',done:false});const t=performance.now();await Promise.all([compileReady(this.renderer,this.campaignScene,this.campaignCamera),this.pano?.scene?compileReady(this.renderer,this.pano.scene,this.campaignCamera,null,4000,this.pano.targetFor(this.renderer)):null]);check();compile=performance.now()-t;onProgress?.({phase:'compile',done:true,milliseconds:compile});this.campaignCompiled=true;}
      this.render(s,{dark:!!this.renderDark,reduced:true});check();
      this.prepareMetrics={milliseconds:performance.now()-started,mode:'campaign',region:this.regionKey,reused,compiled:compile,batches:this.art.batches.size,channels:this.art.channels.size,actors:this.art.actors.length,templates:this.art.templates.size};
      onProgress?.({phase:'prepare',stage:'Trupp bereit',done:true,cache:reused?'region':'cold'});
    } catch(error) {
      this.prepared=null;
      if(s.mode==='sturmbastion'){this.bonus?.dispose();this.bonus=null;}else this.clearCampaign();
      throw error;
    } finally {this.art?.library.setProgressListener(null);this.bonus?.art.library.setProgressListener(null);}
  }
  /** Start every download the level needs at once; the serial set-up below then finds the cached promises instead of waiting on one file at a time. */
  prefetchAssets(s,types) {
    const lib=this.art.library,warm=load=>{try{load()?.catch?.(()=>{});}catch{/* the serial set-up below reports a real failure */}};
    for(const id of ['CAPTAIN_HAZEL','HUMAN_LEGIONARY','HALFGROWN_LEGIONARY','GIANT_LEGIONARY'])warm(()=>lib.model(id,'lo'));
    warm(()=>lib.template('DUCK_LEGIONARY','lo'));
    for(const type of types)for(const lod of ['far','lo'])warm(()=>lib.template(ENEMY_ASSET[type],lod));
    if(types.has('blorb'))warm(()=>lib.template('HULK','lo'));
    if(s.boss)warm(()=>lib.template(BOSS_ASSET[s.boss.boss],'lo'));
    warm(()=>{for(const id of this.native.assetIds(s))warm(()=>lib.template(id,'lo'));});
  }
  resetCampaignVisuals() {
    this.art.reset();this.native.reset();this.finishFor=null;this.finishUp=null;this.troopPlaces=[];
    this.bullets.count=0;for(const fx of [this.flashes,this.sparks,this.gooFx,this.grenadeFx]){fx.begin();fx.end();}
    for(const list of [this.rings,this.laneWarn,this.discWarn,this.beams])for(const o of list)o.visible=false;this.bubble.visible=false;
  }
  clearCampaign() {
    this.native?.dispose();this.art?.dispose();this.native=null;this.art=null;this.bossActor=null;this.bossActorId=null;this.regionKey=null;this.campaignCompiled=false;
    this.roadside?.dispose(this.campaignScene);this.farProps?.dispose(this.campaignScene);this.roadside=this.farProps=null;
    if(this.loop){this.campaignScene.remove(this.loop.group,this.loop.static);this.loop.dispose();this.loop=null;}
    this.settlements?.dispose();this.settlements=null;this.meadow?.dispose();this.meadow=null;
    if(this.grass){this.grass.removeFromParent();this.grass.geometry.dispose();this.grass.material.dispose();this.grass.dispose();this.grass=null;}
    this.pano?.scene?.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});if(this.pano)this.pano.scene=null;this.themeName=null;
  }

  render(s, view) {
    if(this.prepared!==s)return;
    if(s.mode==='sturmbastion'){this.bonus.resize(this.w,this.h);return this.bonus.render(s,view);}
    // Theme events redraw through render(); toggling darkness must not reload
    // or dispose a running landscape. Only its baked sky/light state changes.
    if(this.renderDark!==!!view.dark) {
      this.renderDark=!!view.dark;const dark=this.renderDark;
      this.renderer.toneMappingExposure=this.th.exposure*(dark?.92:1);
      this.pano.sky.material.uniforms.night.value=dark?1:0;
      this.pano.scene.fog.color.set(this.th.fog).multiplyScalar(dark?.55:1);
      for(const o of this.pano.scene.children) {
        if(o.isHemisphereLight)o.intensity=this.th.light.ambient*(dark?.6:1);
        if(o.isDirectionalLight)o.intensity=this.th.light.intensity*(dark?.5:1);
      }
      this.panoDirty=true;
    }
    this.art.begin(); this.native.begin();
    this.uniforms.uTime.value = s.t;
    const cam = this.camera;
    const camX = s.px * 0.35;
    const shake = s.shake > 0 && !view.reduced ? s.shake : 0;
    if(this.panoDirty && this.pano.scene) {
      this.panoDirty=false; cam.position.set(0,4.1,6.4);cam.lookAt(0,.8,-7);cam.updateMatrixWorld();const t=performance.now();this.art.library.progress({phase:'bake',id:'rangers-backdrop',done:false});this.pano.bake(this.renderer,cam);this.art.library.progress({phase:'bake',id:'rangers-backdrop',done:true,milliseconds:performance.now()-t});
    }
    cam.position.set(camX + (Math.random() - 0.5) * shake * 0.25, 4.1 + (Math.random() - 0.5) * shake * 0.2, 6.4);
    cam.lookAt(camX * 0.7, .8, -7);
    if(this.pano.base)this.pano.mesh.position.set(this.pano.base.x+camX*.98,this.pano.base.y,this.pano.base.z);
    this.loop?.update(s.pos);this.settlements?.update(s.pos);this.meadow?.update(s.pos,s.t);
    const L = this.lights.light;
    L.position.set(-5 + s.px * 0.3, 12, 4); L.target.position.set(s.px * 0.3, 0, -6);

    const pos = s.pos;
    const gOff = (pos / this.tile) % 1, rOff = (pos / 8) % 1;
    if (this.ground.material.map) { this.ground.material.map.offset.y = gOff; this.groundFar.material.map.offset.y = (gOff + this.nearLen / this.tile) % 1; }
    this.road.material.map.offset.y = rOff; this.roadFar.material.map.offset.y = (rOff + this.nearLen / 8) % 1;
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
    // Leave clear sightlines around authored forks. World-space exclusions
    // keep the same clusters absent before, during and after the approach.
    const forks = s.L.events.filter(e => e.t === 'fork');
    if (this.roadside) {
      const R = this.roadside;
      R.begin();
      // Authored little vignettes alternate with open verges. A tree stands
      // behind its shrubs/rocks, never interchanged with a wall or bridge.
      for (let i=0;i<9;i++) {
        const d=Math.floor(pos/16)*16+i*16-16, z=d-pos;
        if(z>FAR-5)break;
        if(forks.some(e => d >= e.d - 18 && d <= e.d + e.len + 18))continue;
        const slot=Math.round(d/16), side=slot%2?1:-1;
        const x=side*(ROAD+3.2), yaw=side*.24;
        if(s.themeName==='meadow') {
          R.add(0,x,-z,yaw,1.15); R.add(1,x+side*1.8,-z-1.4,-yaw,.9); R.add(2,x-side*.8,-z+1.3,yaw,.9); R.add(3,x+side*2.6,-z+1.8,0,.8);
        } else if(s.themeName==='dunes') {
          R.add(0,x+side,-z-1,side*.3,1.2); R.add(1,x-side*.7,-z+1.4,side*.25,1.1); R.add(2,x+side*1.7,-z+.8,0,.8);
        } else if(s.themeName==='frost') {
          R.add(0,x+side*.6,-z-1,side*.2,1.1); R.add(1,x-side*.7,-z+.8,0,1.25); R.add(2,x+side*1.7,-z+1.6,side*.3,.75);
        } else {
          R.add(0,x+side*.5,-z-1,side*.2,1.15); R.add(1,x-side*.6,-z+.8,.2,.8); R.add(2,x+side*1.5,-z+1.8,0,.9);
        }
      }
      R.end();
    }
    if (this.farProps && !LOW_GPU) {
      const F = this.farProps; F.begin();
      for(let i=0;i<6;i++) {
        const d=Math.floor(pos/24)*24+i*24-24,z=d-pos;if(z>FAR+10)break;
        const slot=Math.round(d/24),side=slot%2?1:-1;
        F.add(0,side*(ROAD+13),-z,side*.2,1.4,s.t);
        F.add(1,side*(ROAD+16),-z-4,side*.3,1.2,s.t);
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
      this.troopPlaces=campaignFormation(s);
      for(const p of this.troopPlaces) {
        const muzzle=this.art.troop(p.i,s.px+p.x,p.z,s.t,{size:p.size,speed:s.speed,firing:s.muzzle,lean:s.onIce?(s.tx-s.px)*.08:0});
        if(muzzle){p.mx=muzzle.x;p.my=muzzle.y;p.mz=muzzle.z;}
      }
    }
    this.bubble.visible=s.buffs.bubble>0&&!lost;
    if(this.bubble.visible){
      const places=this.troopPlaces||[],near=Math.max(0,...places.map(p=>p.z)),far=Math.min(0,...places.map(p=>p.z)),r=s.radius+.7;
      const h=Math.max(...places.map(p=>LIVE_TROOP_HEIGHT[p.id]));this.bubble.position.set(s.px,h/2,(near+far)/2);this.bubble.scale.set(r,h/2+.2,Math.max(r,(near-far)/2+.7));
    }
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
        this.art.machine(e.type,e.x*(1-k)+(birth?birth.x+socket.x:0)*k,-z*(1-k)+(birth?-birth.d+s.pos+socket.z:0)*k,s.t,{active:e.active&&!e.frozen,speed:e.speed||1,phase:e.phase||0,disabled:!e.alive,age,near:z<15,split:e.split,hitAge:s.t-(e.hitAt??-99),fireAge:s.t-(e.fireAt??-99),alert:e.alert||0,shield:e.shield>0,frozen:e.frozen>0,wheelPhase:e.phase/(3*Math.max(.1,e.speed||1))});
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
      const wd = .7 * Math.min(1.5, 1 + lg * 0.18), len = Math.min(2.4, 1 + lg * 0.3);
      const segment=shotSegment(S.x[i],z,nearestMuzzle(this.troopPlaces||[],S.x[i]),h,!!S.turret[i]);if(!segment.visible)continue;
      const v=this._shotVector||(this._shotVector=new THREE.Vector3()),q=this._shotQ||(this._shotQ=new THREE.Quaternion()),m=this._shotMatrix||(this._shotMatrix=new THREE.Matrix4()),p=this._shotPosition||(this._shotPosition=new THREE.Vector3()),sc=this._shotScale||(this._shotScale=new THREE.Vector3()),axis=this._shotAxis||(this._shotAxis=new THREE.Vector3(0,1,0));
      const {head,tail}=segment;v.set(head.x-tail.x,head.y-tail.y,head.z-tail.z);const length=Math.max(.02,v.length());v.normalize();q.setFromUnitVectors(axis,v);p.set((head.x+tail.x)/2,(head.y+tail.y)/2,(head.z+tail.z)/2);m.compose(p,q,sc.set(wd,length/.89,wd));m.toArray(a,n*16);
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
        if (k > .3) { const p=nearestMuzzle(this.troopPlaces||[],s.px+s.laneX[i]); if(p) f.add(p.mx,p.my,p.mz,(.05*k+.01)*big,col); }
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
  squadBadgeAnchor() {
    const project=this.projectFn(),places=this.troopPlaces||[],bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
    for(const p of places){const h=TROOP_PROFILES[p.id].max[1]*p.size+.025;for(const x of[p.left,p.right])for(const d of[p.front,p.back])for(const y of[0,h]){const q=project((this.prepared?.px||0)+x,d,y);bounds.left=Math.min(bounds.left,q.x);bounds.right=Math.max(bounds.right,q.x);bounds.top=Math.min(bounds.top,q.y);bounds.bottom=Math.max(bounds.bottom,q.y);}}
    const base=project(this.prepared?.px||0,0,0);return {x:base.x,s:base.s,bodyTop:Number.isFinite(bounds.top)?bounds.top:base.y,bodyBounds:Number.isFinite(bounds.top)?bounds:undefined};
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
    this.disposed=true;this.prepareEpoch++;this.prepareController?.abort();
    this.pano?.target?.dispose();this.pano?.scene?.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});
    this.shading?.dispose();this.native?.dispose();this.art?.dispose();this.bonus?.dispose();this.loop?.dispose();this.settlements?.dispose();
    this.roadside?.dispose(this.campaignScene);this.farProps?.dispose(this.campaignScene);
    const geo=new Set(),mats=new Set(),tex=new Set();this.campaignScene.traverse(o=>{if(o.geometry)geo.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)tex.add(v);}});
    for(const x of geo)x.dispose();for(const x of mats)x.dispose();for(const x of tex)x.dispose();this.env.dispose();this.renderer.dispose();
  }
}

export const create = (canvas) => new FernRangers3D(canvas);
