/**
 * Gate Rush in 3D (Three.js). Draws a GateRushSession; the 2D overlay (squad count, popups, health numbers, boss bar,
 * screen flashes) stays on the session's canvas pass, projected through this camera.
 * World mapping: session x → three x, distance ahead z → three −z, the squad stands at the origin.
 */
import { THREE, studioEnvironment, createRenderer, texture, mat, addLights, Crowd, Particles, TextPlane, projector } from './three-kit.js';
import { FERN_RANGER, ROTLING, ROTLING_CAP, MOSS_BRUTE, ROT_KING_TINT } from './characters.js';
import { ROAD, WEAPONS, ENEMY, gateText, gateGood } from './gate-rush.js';

const FAR = 92;
const THEMES = {
  meadow: { sky: 's-meadow', ground: 't-grass', light: { sun: 0xfff1d6, sky: 0xd6ecff, ground: 0x4f6e2c, intensity: 2.6, ambient: 1.2 }, deco: 'tree', exposure: 1.05 },
  desert: { sky: 's-desert', ground: 't-sand', light: { sun: 0xffd29a, sky: 0xffe3c2, ground: 0x9a6b3a, intensity: 2.6, ambient: 1.1 }, deco: 'cactus', exposure: 1.05 },
  city: { sky: 's-city', ground: 't-cobble', groundRepeat: 3, light: { sun: 0xeef2ff, sky: 0xc9d3e6, ground: 0x4a4f57, intensity: 2.2, ambient: 1.25 }, deco: 'building', exposure: 1.05 },
  snow: { sky: 's-snow', ground: 't-snow', light: { sun: 0xffffff, sky: 0xe0f0ff, ground: 0xb0c4d8, intensity: 2.3, ambient: 1.1 }, deco: 'pine', exposure: 0.95 },
  night: { sky: 's-night', ground: 't-grass', groundTint: 0x55628a, light: { sun: 0x9fb4ff, sky: 0x4a5a9a, ground: 0x1a1f33, intensity: 1.3, ambient: 0.9 }, deco: 'lamp', exposure: 1.15 },
  lava: { sky: 's-lava', ground: 't-lavarock', light: { sun: 0xffb27a, sky: 0xff9a6a, ground: 0x3a1408, intensity: 2.2, ambient: 1.0 }, deco: 'rock', exposure: 1.05 },
};

const geo = {
  trunk: new THREE.CylinderGeometry(0.12, 0.18, 1, 7),
  blob: new THREE.IcosahedronGeometry(1, 3),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cactus: new THREE.CapsuleGeometry(0.18, 1, 4, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  rock: new THREE.IcosahedronGeometry(1, 0),
};
const P = (g, color, o = {}) => ({ geo: g, color, ...o });
const DECO = {
  tree: [P(geo.trunk, 0x7a4a26, { pos: [0, 0.5, 0], scale: [1, 1, 1] }), P(geo.blob, 0x3f9d3b, { pos: [0, 1.5, 0], scale: [0.85, 0.75, 0.85] }), P(geo.blob, 0x58b847, { pos: [0.3, 1.85, 0.15], scale: [0.5, 0.45, 0.5] }), P(geo.blob, 0x4aa843, { pos: [-0.35, 1.7, -0.1], scale: [0.45, 0.4, 0.45] })],
  pine: [P(geo.trunk, 0x6a4123, { pos: [0, 0.35, 0], scale: [0.8, 0.7, 0.8] }), P(geo.cone, 0x2f7d4a, { pos: [0, 1.2, 0], scale: [0.75, 1.3, 0.75], flat: true }), P(geo.cone, 0x3a9058, { pos: [0, 1.9, 0], scale: [0.5, 0.9, 0.5], flat: true }), P(geo.cone, 0xf4f8ff, { pos: [0, 2.25, 0], scale: [0.24, 0.35, 0.24], flat: true })],
  cactus: [P(geo.cactus, 0x3f8f46, { pos: [0, 0.75, 0], scale: [1, 1, 1] }), P(geo.cactus, 0x4ea155, { pos: [0.32, 0.9, 0], scale: [0.6, 0.35, 0.6] }), P(geo.cactus, 0x4ea155, { pos: [-0.3, 0.75, 0], scale: [0.6, 0.3, 0.6] }), P(geo.sphere, 0xff6fa5, { pos: [0, 1.48, 0], scale: [0.1, 0.07, 0.1], noShadow: true })],
  building: [P(geo.box, 0xffffff, { pos: [0, 1.6, 0], scale: [1.6, 3.2, 1.6], map: 't-facade' }), P(geo.box, 0x3a3f4a, { pos: [0, 3.25, 0], scale: [1.7, 0.12, 1.7] })],
  lamp: [P(geo.trunk, 0x3c4458, { pos: [0, 1.4, 0], scale: [0.35, 2.8, 0.35], metalness: 0.5 }), P(geo.sphere, 0xffffff, { pos: [0, 2.85, 0], scale: [0.22, 0.22, 0.22], emissive: 0xffd68a, emissiveIntensity: 3, noShadow: true }), P(geo.box, 0x3c4458, { pos: [0, 2.68, 0], scale: [0.5, 0.06, 0.5] })],
  rock: [P(geo.rock, 0x3b3330, { pos: [0, 0.4, 0], scale: [0.9, 0.6, 0.8], flat: true }), P(geo.rock, 0x2c2522, { pos: [0.5, 0.25, 0.2], scale: [0.45, 0.35, 0.4], flat: true }), P(geo.sphere, 0xffffff, { pos: [0, 0.02, 0], scale: [0.9, 0.04, 0.9], emissive: 0xff5a1f, emissiveIntensity: 2.2, noShadow: true })],
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

export class GateRush3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.themeName = null;
    this.gates = new Map(); this.props = new Map();
    this.w = 1; this.h = 1;
    this.build();
  }

  build() {
    const s = this.scene;
    // backdrop: the sky picture on a far plane, its horizon band sitting on the ground's far edge
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(330, 220), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthWrite: false }));
    this.backdrop.position.set(0, 26, -FAR - 30);
    this.backdrop.renderOrder = -1;
    s.add(this.backdrop);
    // far fade: the ground and road melt into the backdrop instead of ending at a hard line
    const fade = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#000'); gr.addColorStop(0.62, '#fff'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    fade.colorSpace = THREE.NoColorSpace; fade.wrapS = fade.wrapT = THREE.ClampToEdgeWrapping;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(240, FAR + 140), mat(0xffffff, { roughness: 0.95, transparent: true }));
    this.ground.material.alphaMap = fade;
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.set(0, -0.02, -(FAR + 140) / 2 + 30);
    this.ground.receiveShadow = true;
    s.add(this.ground);
    this.road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, FAR + 40), mat(0xffffff, { roughness: 0.85, transparent: true, map: texture('t-asphalt', { repeat: [1, (FAR + 40) / 6] }) }));
    const roadFade = fade.clone(); roadFade.needsUpdate = true; this.road.material.alphaMap = roadFade;
    this.road.rotation.x = -Math.PI / 2; this.road.position.set(0, 0, -(FAR + 40) / 2 + 20);
    this.road.receiveShadow = true;
    s.add(this.road);
    const curbTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#f4f4f5'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0453a'; g.fillRect(0, 0, w, h / 2); }, [1, (FAR + 40) / 2]);
    this.curbs = [-1, 1].map((side) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, FAR + 40), mat(0xffffff, { map: curbTex, roughness: 0.6 }));
      m.position.set(side * (ROAD + 0.12), 0.07, -(FAR + 40) / 2 + 20); m.receiveShadow = true; m.castShadow = true;
      s.add(m); return m;
    });
    this.curbTex = curbTex;
    // centre dashes
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 1.6), mat(0xffffff, { roughness: 0.6 }), 40);
    this.dashes.receiveShadow = true; s.add(this.dashes);
    // finish line
    const checker = canvasTex(128, 32, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 8, j * 8, 8, 8); } });
    this.finish = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 1.2), mat(0xffffff, { map: checker }));
    strip.rotation.x = -Math.PI / 2; strip.position.y = 0.012; strip.receiveShadow = true; this.finish.add(strip);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 10), mat(0xf5f5f5, { metalness: 0.3 }));
      pole.position.set(side * (ROAD + 0.4), 1.7, 0); pole.castShadow = true; this.finish.add(pole);
    }
    const banner = new TextPlane(ROAD * 2 + 0.8, 0.9, 512); banner.set('FINISH', { fill: '#fde047' });
    const bannerBg = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2 + 1, 0.9, 0.1), mat(0x1f4fd1));
    bannerBg.position.set(0, 3.2, 0); banner.mesh.position.set(0, 3.2, 0.06);
    this.finish.add(bannerBg, banner.mesh);
    s.add(this.finish);

    this.lights = addLights(s, { shadowBox: 13, mapSize: 2048 });
    this.squad = new Crowd(s, FERN_RANGER, 100);
    this.rotlings = new Crowd(s, ROTLING, 260);
    this.brutes = new Crowd(s, MOSS_BRUTE, 40);
    this.bossCrowd = new Crowd(s, MOSS_BRUTE, 1);
    this.crown = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), mat(0xfacc15, { metalness: 0.7, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 0.4 }));
      const a = (i / 5) * Math.PI * 2; spike.position.set(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15); this.crown.add(spike);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 18), mat(0xfacc15, { metalness: 0.7, roughness: 0.25 }));
    band.rotation.x = Math.PI / 2; this.crown.add(band);
    s.add(this.crown);
    this.bullets = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.8, 2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), 500);
    this.bullets.rotation.x = 0; this.bullets.frustumCulled = false; this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    s.add(this.bullets);
    this.flashes = new Particles(s, 40, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks = new Particles(s, 800);
    this.rings = Array.from({ length: 6 }, () => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.visible = false; s.add(r); return r;
    });
    this.barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 16);
    this.ringGeo = new THREE.TorusGeometry(0.345, 0.035, 6, 18);
    this.spikeGeo = new THREE.ConeGeometry(0.16, 0.7, 6);
  }

  setTheme(name, dark) {
    const key = name + (dark ? ':d' : '');
    if (key === this.themeName) return;
    this.themeName = key;
    const th = THEMES[name] || THEMES.meadow;
    const skyTex = texture(th.sky, { clamp: true });
    this.backdrop.material.map = skyTex; this.backdrop.material.needsUpdate = true;
    const gr = th.groundRepeat || 1;
    const groundTex = texture(th.ground, { repeat: [24 * gr, ((FAR + 140) / 10) * gr] });
    this.ground.material.map = groundTex; this.ground.material.color.set(th.groundTint ?? 0xffffff); this.ground.material.needsUpdate = true;
    this.road.material.color.set(name === 'lava' ? 0x9a8a84 : name === 'night' ? 0x9aa4c0 : 0xffffff);
    this.groundRepeat = (FAR + 140) / 10;
    const L = this.lights;
    L.light.color.set(th.light.sun); L.light.intensity = th.light.intensity;
    L.hemi.color.set(th.light.sky); L.hemi.groundColor.set(th.light.ground); L.hemi.intensity = th.light.ambient;
    this.renderer.toneMappingExposure = th.exposure * (dark ? 0.92 : 1);
    this.scene.fog = new THREE.Fog(0xffffff, 40, FAR + 60);
    this.fogFromSky(skyTex);
    if (this.deco) this.deco.dispose(this.scene);
    this.deco = new Crowd(this.scene, DECO[th.deco], 40);
    this.decoKind = th.deco;
    this.dashes.material.color.set(name === 'city' || name === 'night' ? 0xfde047 : 0xffffff);
  }
  /** Fog takes the colour of the picture's horizon band so the ground melts into the backdrop. */
  fogFromSky(tex) {
    const apply = () => {
      try {
        const img = tex.image, c = document.createElement('canvas'); c.width = 32; c.height = 32;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
        const d = g.getImageData(0, 20, 32, 4).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        this.scene.fog.color.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
      } catch { /* keep white fog */ }
    };
    if (tex.image && tex.image.width) apply(); else { const prev = tex.onUpdate; tex.onUpdate = () => { prev?.(); apply(); }; setTimeout(apply, 600); setTimeout(apply, 2000); }
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

  /** z ahead of the squad → three z */
  render(s, view) {
    this.setTheme(s.L.theme, view.dark);
    const cam = this.camera;
    const camX = s.px * 0.35;
    const shake = s.shake > 0 && !view.reduced ? s.shake : 0;
    cam.position.set(camX + (Math.random() - 0.5) * shake * 0.25, 4.1 + (Math.random() - 0.5) * shake * 0.2, 6.4);
    cam.lookAt(camX * 0.7, 0.8, -7);
    const L = this.lights.light;
    L.position.set(-5 + s.px * 0.3, 12, 4); L.target.position.set(s.px * 0.3, 0, -6);
    this.backdrop.position.x = camX * 0.9;

    // scrolling ground, road, curbs, dashes
    const pos = s.pos;
    if (this.ground.material.map) this.ground.material.map.offset.y = ((pos / 10) * this.ground.material.map.repeat.y / ((FAR + 140) / 10)) % 1;
    if (this.road.material.map) this.road.material.map.offset.y = (pos / 6) % 1;
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
    // roadside
    this.deco.begin();
    for (let i = 0; i < 40; i++) {
      const d = Math.floor(pos / 5) * 5 + i * 5 - 10;
      const z = d - pos;
      if (z > FAR - 5) break;
      const seed = Math.abs(Math.sin(d * 12.9898) * 43758.5453) % 1;
      const side = (Math.floor(d / 5) % 2) ? 1 : -1;
      const off = this.decoKind === 'building' ? 5 + seed * 3 : this.decoKind === 'lamp' ? 0.8 : 1.6 + seed * 4;
      const sc = this.decoKind === 'building' ? 1.6 + seed * 1.4 : 0.9 + seed * 0.7;
      this.deco.add(side * (ROAD + off), 0, -z, seed * 6, sc, { swing: 0 });
      if (this.decoKind !== 'lamp' && this.decoKind !== 'building') this.deco.add(-side * (ROAD + 2.4 + seed * 6), 0, -z - 2.5, seed * 3, sc * 0.8, { swing: 0 });
    }
    this.deco.end();
    // finish line
    const fz = s.L.length - pos;
    this.finish.visible = fz < FAR && fz > -10;
    this.finish.position.set(0, 0, -fz - 0.6);

    this.drawEntities(s, view);
    this.drawSquad(s);
    this.drawShots(s);
    this.drawParticles(s);
    this.renderer.render(this.scene, cam);
  }

  drawSquad(s) {
    const c = this.squad; c.begin();
    const lost = s.result && !s.result.won;
    if (!lost) {
      for (let i = 0; i < s.slots.length; i++) {
        const sl = s.slots[i];
        c.add(s.px + sl.x, 0, -sl.z, Math.PI, 1.2, { phase: s.t * 11 + i * 1.7, swing: s.speed > 0.5 ? 1 : 0.15, recoil: s.muzzle, lean: 0 });
      }
    }
    c.end();
  }

  drawEntities(s, view) {
    const zc = this.rotlings, br = this.brutes, boss = this.bossCrowd;
    zc.begin(); br.begin(); boss.begin();
    this.crown.visible = false;
    const seen = new Set();
    for (const e of s.ents) {
      const z = e.d - s.pos;
      if (z > FAR || z < -8) continue;
      const fade = e.alive ? 1 : Math.max(0, e.fade);
      if (e.kind === 'enemy') {
        if (fade <= 0) continue;
        const def = ENEMY[e.type];
        const moving = e.active ? 1 : 0.1;
        const pose = { phase: e.phase * 1.6, swing: moving, flash: e.flash > 0 ? 0.85 : 0, squash: e.alive ? 0 : 1 - fade, tint: null };
        if (e.type === 'zombie' || e.type === 'runner') {
          pose.tint = ROTLING_CAP[e.type];
          zc.add(e.x, 0, -z, 0, e.type === 'runner' ? 1.05 : 1.15, pose);
        } else if (e.type === 'brute') {
          br.add(e.x, 0, -z, 0, 1.15, pose);
        } else {
          pose.tint = ROT_KING_TINT;
          boss.add(e.x, 0, -z, 0, 2.6, pose);
          this.crown.visible = e.alive;
          this.crown.position.set(e.x, 1.42 * 2.6 + 0.48 + Math.abs(Math.sin(e.phase * 1.6)) * 0.1, -z + 0.18 * 2.6);
          this.crown.scale.setScalar(2.2);
        }
        void def;
      } else if (e.kind === 'gate') {
        seen.add(e); this.drawGate(e, z, fade);
      } else if (e.kind === 'barrel' || e.kind === 'crate' || e.kind === 'spikes') {
        seen.add(e); this.drawProp(e, z, fade, s);
      }
    }
    zc.end(); br.end(); boss.end();
    for (const [e, obj] of this.gates) if (!seen.has(e)) { this.scene.remove(obj.group); this.gates.delete(e); }
    for (const [e, obj] of this.props) if (!seen.has(e)) { this.scene.remove(obj); this.props.delete(e); }
  }

  drawGate(e, z, fade) {
    let o = this.gates.get(e);
    const wdt = e.x1 - e.x0 - 0.16, H = 1.9;
    if (!o) {
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
      o = { group, panel, postMat, label, good: null };
      this.gates.set(e, o);
    }
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

  drawProp(e, z, fade, s) {
    let o = this.props.get(e);
    if (!o) {
      o = new THREE.Group();
      if (e.kind === 'barrel') {
        const body = new THREE.Mesh(this.barrelGeo, mat(0xd7261e, { metalness: 0.35, roughness: 0.35 }));
        body.position.y = 0.45; body.castShadow = true; o.add(body);
        for (const y of [0.18, 0.72]) { const r = new THREE.Mesh(this.ringGeo, mat(0x3a3a3a, { metalness: 0.6, roughness: 0.3 })); r.rotation.x = Math.PI / 2; r.position.y = y; o.add(r); }
        const sign = new THREE.Mesh(new THREE.CircleGeometry(0.15, 3), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
        sign.position.set(0, 0.45, 0.345); o.add(sign);
      } else if (e.kind === 'crate') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat(0xffffff, { map: texture('t-wood', { repeat: [1, 1] }), roughness: 0.8 }));
        body.position.y = 0.45; body.castShadow = true; o.add(body);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.y = 0.45; o.add(glow); o.userData.glow = glow;
      } else {
        const len = e.x1 - e.x0;
        const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.5), mat(0x3f3f46, { metalness: 0.5, roughness: 0.4 }));
        base.position.set(0, 0.08, 0); base.castShadow = true; o.add(base);
        const n = Math.max(2, Math.round(len / 0.4));
        for (let i = 0; i < n; i++) {
          const sp = new THREE.Mesh(this.spikeGeo, mat(0xd4d4d8, { metalness: 0.8, roughness: 0.25 }));
          sp.position.set(-len / 2 + (i + 0.5) * (len / n), 0.5, 0); sp.castShadow = true; o.add(sp);
        }
        o.userData.cx = (e.x0 + e.x1) / 2;
      }
      this.scene.add(o); this.props.set(e, o);
    }
    const x = e.kind === 'spikes' ? o.userData.cx : e.x;
    o.position.set(x, 0, -z);
    o.scale.setScalar(e.alive ? (e.flash > 0 ? 1.08 : 1) : Math.max(0.01, fade));
    if (o.userData.glow) o.userData.glow.material.opacity = 0.18 + Math.sin(s.t * 6) * 0.12;
    if (e.kind === 'crate') o.rotation.y = Math.sin(s.t * 1.5) * 0.15;
  }

  drawShots(s) {
    const w = WEAPONS[s.weapon];
    this.bullets.material.color.set(w.color);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const v = new THREE.Vector3(), sc = new THREE.Vector3(1.6, 1, 1.6);
    let n = 0;
    for (const b of s.bullets) {
      const z = b.d - s.pos;
      if (z > FAR || n >= 500) continue;
      m.compose(v.set(b.x, 0.5, -z - 0.4), q, sc);
      this.bullets.setMatrixAt(n++, m);
    }
    this.bullets.count = n; this.bullets.instanceMatrix.needsUpdate = true;
    // muzzle flashes at the front row
    const f = this.flashes; f.begin();
    if (s.muzzle > 0.35 && !(s.result && !s.result.won)) {
      const shooters = Math.min(s.n, 12), R = Math.min(s.radius * 0.85, ROAD);
      for (let i = 0; i < shooters; i++) {
        const off = shooters === 1 ? 0 : (i / (shooters - 1) - 0.5) * 2 * R;
        f.add(s.px + off + 0.06, 0.52, -0.9, 0.12 * s.muzzle + 0.04, w.color);
      }
    }
    f.end();
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

export const create = (canvas) => new GateRush3D(canvas);
