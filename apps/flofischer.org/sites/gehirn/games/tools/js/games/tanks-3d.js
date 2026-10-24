/**
 * Bounce Brigade in 3D (Three.js): a walled toy arena seen from a fixed, tilted camera that frames the whole map
 * (turned a quarter on portrait phones, so the long side runs up the screen). Mapping: session (x, y) → three
 * (x − W/2, 0, y − H/2).
 *
 * Tanks are built from rounded parts (tracks, hull, a turret that turns on its own, a barrel that kicks back); Hazel
 * peeks out of her hatch, every Klonkbot tank has one glowing eye and an antenna. Walls and crates are instanced
 * rounded blocks in the world's material, pits/lava, ice and vents are flat tiles, tread marks and scorch marks are
 * decals; shells, mines, smoke and sparks are instanced. Walls cast static shadows; the shadow map is refreshed every
 * other frame for the tanks.
 */
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, MergedCrowd, Particles, LOW_GPU, furPatch } from './three-kit.js';
import { RoundedBoxGeometry } from '../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { loadModel } from './models.js';
import { W, H, T } from './tanks-levels.js';
import { TYPES } from './tanks.js';

const BOSS_MODEL = { klonk: 'KLONK_TANK', drill: 'DRILL_MECH', walker: 'FROST_WALKER', mothership: 'UFO' };
const LO = Object.fromEntries(await Promise.all(['RANGER_HEDGEHOG', ...Object.values(BOSS_MODEL)].map(async (n) => [n, await loadModel(n, 'lo').catch(() => null)])));

const THEMES = [
  { // Fernhaven Meadows: oak blocks on a mown lawn
    ground: 't-grass', floor: 0x9ccf6a, floorAlt: 0x8cc25c, wall: 0xc9925a, wallMap: 't-wood', crate: 0xb07a45, fog: 0xcfe7f5, sky: 0xd6ecff, sun: 0xfff1d6, hemiG: 0x4f6e2c, exposure: 1.05,
    props: [['TREE_ROUND', 22, 1.5, true], ['BUSH', 30, 1.15], ['ROCK', 10, 1.2], ['COTTAGE', 3, 2.6, true], ['WINDMILL', 1, 2.8, true]],
  },
  { // Sunbake Dunes: sandstone blocks, canyon cracks
    ground: 't-sand', floor: 0xecc98c, floorAlt: 0xe2bb7a, wall: 0xd9a45f, wallMap: 't-stone', crate: 0xa86e3a, fog: 0xf3d6a8, sky: 0xffe3c2, sun: 0xffd29a, hemiG: 0x9a6b3a, exposure: 1.05,
    props: [['CACTUS', 22, 1.6, true], ['DESERT_ROCK', 20, 1.7], ['PALM', 8, 1.8, true], ['MESA', 2, 2.6, true]],
  },
  { // Frostpeak: ice blocks on packed snow
    ground: 't-snow', floor: 0xe6eef8, floorAlt: 0xdbe6f3, wall: 0x6fb2e8, wallMap: null, crate: 0x8a6a4a, fog: 0xd8e8f8, sky: 0xe0f0ff, sun: 0xffffff, hemiG: 0xb0c4d8, exposure: 0.96, glossyWall: true,
    props: [['PINE_SNOW', 30, 1.7, true], ['SNOW_ROCK', 14, 1.3], ['ICE_CRYSTAL', 10, 1.5], ['OBSERVATORY', 1, 2.4, true]],
  },
  { // Ember Isles: basalt blocks, lava pools, vents
    ground: 't-lavarock', floor: 0x5d4f4f, floorAlt: 0x524444, wall: 0x3b3236, wallMap: 't-stone', crate: 0x5a3a2a, fog: 0x4a2a36, sky: 0xff9a6a, sun: 0xffb27a, hemiG: 0x3a1408, exposure: 1.1, lava: true,
    props: [['BASALT', 26, 1.8, true], ['FERNSTONE', 10, 1.5], ['VOLCANO', 1, 2.6, true]],
  },
];

const TAU = Math.PI * 2;
const v3 = new THREE.Vector3();

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
/** Track tread: dark rubber with cleats (scrolled per tank as it drives). */
const treadTex = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#2b2a2e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#4a4850'; g.fillRect(i * 16 + 2, 4, 10, h - 8); g.fillStyle = '#1b1a1e'; g.fillRect(i * 16 + 12, 0, 3, h); }
}, [3, 1]);
/** Crate: planks with a frame and a cross brace. */
const crateTex = (base) => canvasTex(128, 128, (g, w) => {
  const c = new THREE.Color(base), css = (k) => `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
  g.fillStyle = css(1); g.fillRect(0, 0, w, w);
  for (let i = 0; i < 5; i++) { g.fillStyle = css(0.92 + (i % 2) * 0.1); g.fillRect(0, i * 25.6, w, 24); }
  g.strokeStyle = css(0.62); g.lineWidth = 14; g.strokeRect(7, 7, w - 14, w - 14);
  g.lineWidth = 12; g.beginPath(); g.moveTo(12, 12); g.lineTo(w - 12, w - 12); g.stroke();
  g.fillStyle = css(0.45); for (const [x, y] of [[12, 12], [w - 12, 12], [12, w - 12], [w - 12, w - 12]]) { g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
});
/** Ice tile: pale blue with frosty streaks. */
const iceTex = () => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#cfeaf9'; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { g.beginPath(); const y = Math.random() * w; g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 60); g.stroke(); }
  g.strokeStyle = 'rgba(120,170,210,.35)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, w - 2);
});

/** A toy tank as a group; its turret group turns on its own. */
function buildTank(geo, { color, player = false, ghost = false, eye = 0xffd34d }) {
  const root = new THREE.Group(), body = new THREE.Group(), turret = new THREE.Group(), barrel = new THREE.Group();
  root.add(body); body.add(turret); turret.add(barrel);
  const tint = new THREE.Color(color);
  const hullM = mat(tint, { roughness: 0.42, metalness: 0.08 });
  const darkM = mat(tint.clone().multiplyScalar(0.62), { roughness: 0.5 });
  const treadM = mat(0xffffff, { map: geo.tread.clone(), roughness: 0.85 });
  treadM.map.needsUpdate = true;
  const metalM = mat(0x8d939c, { roughness: 0.32, metalness: 0.7 });
  const parts = [];
  const add = (parent, g, m, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = ry; mesh.castShadow = true; parent.add(mesh); parts.push(mesh); return mesh; };
  // tracks with wheels peeking out, the hull, a sloped glacis
  for (const z of [-0.25, 0.25]) {
    add(body, geo.rbox, treadM, 0, 0.13, z, 0.8, 0.24, 0.17);
    for (const x of [-0.27, -0.09, 0.09, 0.27]) add(body, geo.wheel, metalM, x, 0.12, z * 1.42, 0.075, 0.03, 0.075).rotation.x = Math.PI / 2;
  }
  add(body, geo.rbox, hullM, 0, 0.27, 0, 0.7, 0.17, 0.46);
  add(body, geo.rbox, darkM, 0.27, 0.3, 0, 0.18, 0.1, 0.4);
  // turret, barrel with a muzzle ring
  turret.position.set(-0.03, 0.36, 0);
  add(turret, geo.dome, hullM, 0, 0, 0, 0.21, 0.15, 0.2);
  add(turret, geo.rbox, darkM, 0, 0.04, 0, 0.3, 0.06, 0.26);
  barrel.position.set(0.12, 0.06, 0);
  add(barrel, geo.tube, metalM, 0.25, 0, 0, 0.05, 0.42, 0.05).rotation.z = -Math.PI / 2;
  add(barrel, geo.tube, darkM, 0.47, 0, 0, 0.072, 0.07, 0.072).rotation.z = -Math.PI / 2;
  let driver = null, eyeMesh = null;
  if (player) {
    // a leaf emblem on the hull sides and Hazel in the hatch
    const leafM = new THREE.MeshBasicMaterial({ map: geo.leaf, transparent: true, depthWrite: false });
    for (const z of [-0.232, 0.232]) { const m = new THREE.Mesh(geo.plane, leafM); m.position.set(-0.05, 0.28, z); m.scale.setScalar(0.17); if (z < 0) m.rotation.y = Math.PI; turret.parent.add(m); }
    if (LO.RANGER_HEDGEHOG) {
      driver = new THREE.Group();
      for (const part of LO.RANGER_HEDGEHOG) {
        if (part.ch === 'legL' || part.ch === 'legR') continue;
        const m = part.mat === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: part.mat === 'gloss' ? 0.25 : 0.65 });
        if (part.geometry.attributes.aFur && part.mat !== 'glow') furPatch(m);
        const mesh = new THREE.Mesh(part.geometry, m); mesh.castShadow = part.mat !== 'glow'; driver.add(mesh);
      }
      driver.scale.setScalar(0.4); driver.position.set(-0.06, -0.1, 0); driver.rotation.y = Math.PI / 2;
      turret.add(driver);
    }
  } else {
    // a Klonkbot tank: one glowing eye on the turret front, an antenna with a bobble
    eyeMesh = new THREE.Mesh(geo.ball, new THREE.MeshBasicMaterial({ color: eye, toneMapped: false }));
    eyeMesh.position.set(0.12, 0.1, 0); eyeMesh.scale.set(0.05, 0.075, 0.075); turret.add(eyeMesh);
    const rim = add(turret, geo.ring, metalM, 0.13, 0.1, 0, 0.085, 0.085, 0.085); rim.rotation.y = Math.PI / 2;
    add(turret, geo.tube, metalM, -0.09, 0.2, -0.07, 0.012, 0.24, 0.012);
    add(turret, geo.ball, mat(0xff5a4d, { emissive: 0xff2a1a, emissiveIntensity: 0.6 }), -0.09, 0.33, -0.07, 0.035, 0.035, 0.035);
  }
  root.scale.setScalar(1.22);
  const mats = [hullM, darkM, treadM, metalM];
  if (ghost) for (const m of mats) { m.transparent = true; m.depthWrite = false; }
  return { root, body, turret, barrel, driver, eye: eyeMesh, treadM, mats, parts };
}

/** A boss from the baked cast (vertex-coloured, one group). */
function bossFigure(model) {
  const g = new THREE.Group(), mats = [];
  for (const part of model) {
    const m = part.mat === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: part.mat === 'gloss' ? 0.25 : 0.62, metalness: 0.05 });
    const mesh = new THREE.Mesh(part.geometry, m); mesh.castShadow = part.mat !== 'glow'; g.add(mesh);
    if (part.mat !== 'glow') mats.push(m);
  }
  return { group: g, mats };
}

/** Instanced flat quads on the ground with colour and alpha per instance (tread marks, scorch, rings). */
class Decals {
  constructor(scene, max, frag) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying vec3 vC; varying float vA; void main() { vUv = uv; vC = instanceColor; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vA; void main() { ${frag} }`,
    }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  add(x, z, sx, sz, rot, color, alpha, y = 0.012) {
    if (this.n >= this.max) return;
    this._q.setFromAxisAngle(this._up, rot);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(color));
    this.alpha.array[this.n] = alpha; this.n++;
  }
  end() { const m = this.mesh; m.count = this.n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true; }
}

export class Tanks3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.env = studioEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
    this.w = 1; this.h = 1; this.frame = 0; this.session = null; this.themeKey = null; this.rev = -1; this.portrait = false;
    this.time = 0;
    this.build();
    const v = new THREE.Vector3(), out = { x: 0, y: 0, s: 1 };
    this._proj = (x, y, h = 0) => {
      v.set(x - W / 2, h, y - H / 2).project(this.camera);
      const sx = (v.x + 1) / 2 * this.w, sy = (1 - v.y) / 2 * this.h;
      v.set(x - W / 2 + 1, h, y - H / 2).project(this.camera);
      out.s = Math.hypot((v.x + 1) / 2 * this.w - sx, (1 - v.y) / 2 * this.h - sy); out.x = sx; out.y = sy;
      return out;
    };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), hit = new THREE.Vector3(), gp = { x: 0, y: 0 };
    // the cursor is read at turret height, so aiming feels right on the tilted view
    this.groundAt = (sx, sy) => {
      ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      gp.x = hit.x + W / 2; gp.y = hit.z + H / 2; return gp;
    };
    // screen directions (right, down) → arena directions, for the stick and the keys on a turned camera
    const dir = { x: 0, y: 0 };
    this.dirFn = (mx, my) => {
      if (!this.portrait) { dir.x = mx; dir.y = my; return dir; }
      dir.x = -my; dir.y = mx; return dir;
    };
  }
  projectFn() { return this._proj; }

  build() {
    const s = this.scene;
    this.lights = addLights(s, { intensity: 2.5, ambient: 1.1, dir: [-6, 14, 8], shadowBox: 13, mapSize: LOW_GPU ? 1024 : 2048 });
    this.lights.light.shadow.bias = -0.0008;
    this.geo = {
      rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.18),
      block: new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
      dome: (() => { const g = new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2); return g; })(),
      tube: new THREE.CylinderGeometry(1, 1, 1, 14),
      wheel: new THREE.CylinderGeometry(1, 1, 1, 16),
      ball: new THREE.SphereGeometry(1, 14, 10),
      ring: new THREE.TorusGeometry(1, 0.22, 8, 18),
      plane: new THREE.PlaneGeometry(1, 1),
      tread: treadTex(),
      leaf: canvasTex(128, 128, (g) => {
        g.translate(64, 64); g.rotate(-0.5);
        g.fillStyle = '#e9f7d8'; g.beginPath(); g.ellipse(0, 0, 50, 26, 0, 0, TAU); g.fill();
        g.fillStyle = '#2f7a2a'; g.beginPath(); g.ellipse(0, 0, 42, 19, 0, 0, TAU); g.fill();
        g.strokeStyle = '#e9f7d8'; g.lineWidth = 5; g.beginPath(); g.moveTo(-42, 0); g.lineTo(40, 0); g.stroke();
        for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 10, 0); g.lineTo(i * 10 + 10, -13); g.moveTo(i * 10, 0); g.lineTo(i * 10 + 10, 13); g.stroke(); }
      }),
    };
    // the world around the arena and the arena floor
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat(0xffffff, { roughness: 0.95 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.02; this.ground.receiveShadow = true; s.add(this.ground);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat(0xffffff, { roughness: 0.9 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; s.add(this.floor);
    // blocks (walls and the border ring) and crates: one instanced mesh each
    const maxBlocks = W * H + 2 * (W + H) + 8;
    this.walls = new THREE.InstancedMesh(this.geo.block, mat(0xffffff, { roughness: 0.6 }), maxBlocks);
    this.walls.castShadow = this.walls.receiveShadow = true; s.add(this.walls);
    this.wallCaps = new THREE.InstancedMesh(this.geo.block, mat(0xffffff, { roughness: 0.75 }), maxBlocks);
    this.wallCaps.receiveShadow = true; s.add(this.wallCaps);
    this.crates = new THREE.InstancedMesh(this.geo.block, mat(0xffffff, { roughness: 0.7 }), W * H);
    this.crates.castShadow = this.crates.receiveShadow = true; s.add(this.crates);
    // ice, pits / lava, vents
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.ice = new THREE.InstancedMesh(flat, mat(0xffffff, { map: iceTex(), roughness: 0.12, metalness: 0.05 }), W * H);
    this.ice.receiveShadow = true; s.add(this.ice);
    this.lavaU = { uTime: { value: 0 }, uLava: { value: 0 } };
    this.pits = new THREE.InstancedMesh(flat, new THREE.ShaderMaterial({
      uniforms: this.lavaU,
      vertexShader: 'attribute vec4 aEdge; varying vec2 vUv; varying vec3 vW; varying vec4 vEdge; void main() { vUv = uv; vEdge = aEdge; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime, uLava; varying vec2 vUv; varying vec3 vW; varying vec4 vEdge;
        float n(vec2 p) { return sin(p.x * 2.1 + uTime * 0.7) * sin(p.y * 1.7 - uTime * 0.5) + sin((p.x - p.y) * 3.3 + uTime) * 0.5; }
        void main() {
          // only sides that border solid ground get a rim, so neighbouring pit tiles read as one canyon
          float d = 1.0;
          if (vEdge.x > 0.5) d = min(d, vUv.x); if (vEdge.y > 0.5) d = min(d, 1.0 - vUv.x);
          if (vEdge.z > 0.5) d = min(d, 1.0 - vUv.y); if (vEdge.w > 0.5) d = min(d, vUv.y);
          float edge = smoothstep(0.0, 0.28, d);
          vec3 col;
          if (uLava > 0.5) { float f = n(vW.xz * 1.6) * 0.5 + 0.5; col = mix(vec3(1.0, 0.24, 0.02), vec3(1.0, 0.75, 0.2), f) * (1.25 + 0.25 * sin(uTime * 2.0 + vW.x)); col = mix(vec3(0.15, 0.05, 0.03), col, edge * 0.9 + 0.1); }
          else { col = mix(vec3(0.42, 0.27, 0.15), vec3(0.06, 0.04, 0.03), edge); }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }), W * H);
    this.pits.position.y = 0.006; s.add(this.pits);
    this.pitEdge = new THREE.InstancedBufferAttribute(new Float32Array(W * H * 4), 4);
    this.pits.geometry = flat.clone(); this.pits.geometry.setAttribute('aEdge', this.pitEdge);
    this.vents = new THREE.InstancedMesh(flat, new THREE.ShaderMaterial({
      uniforms: { uTime: this.lavaU.uTime },
      vertexShader: 'attribute float aK; varying vec2 vUv; varying float vK; void main() { vUv = uv; vK = aK; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vK;
        void main() { vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
          float crack = smoothstep(0.08, 0.0, abs(sin(atan(p.y, p.x) * 5.0) * r - 0.05)) * step(0.2, r);
          vec3 dark = vec3(0.12, 0.08, 0.08); vec3 hot = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.85, 0.3), vK);
          float glow = vK * (0.6 + 0.4 * sin(uTime * 14.0)) * (1.0 - r * 0.6);
          vec3 col = mix(dark, hot, max(crack * (0.35 + vK), glow));
          gl_FragColor = vec4(col * (1.0 + vK * 1.5), smoothstep(1.0, 0.85, r));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    }), 32);
    this.ventK = new THREE.InstancedBufferAttribute(new Float32Array(32), 1); this.ventK.setUsage(THREE.DynamicDrawUsage);
    this.vents.geometry = flat.clone(); this.vents.geometry.setAttribute('aK', this.ventK);
    this.vents.position.y = 0.008; s.add(this.vents);
    // decals: tread marks, scorch marks under wrecks and blasts
    this.treads = new Decals(s, 420, 'float e = smoothstep(0.0, 0.25, min(vUv.y, 1.0 - vUv.y)) * step(0.5, fract(vUv.x * 3.0)); gl_FragColor = vec4(vC, vA * e);');
    this.scorch = new Decals(s, 48, 'float r = length(vUv - 0.5) * 2.0; float n = 0.75 + 0.25 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 7.0 + r * 5.0); gl_FragColor = vec4(vC, vA * (1.0 - smoothstep(0.35, 1.0, r)) * n);');
    // shells, mines, wrecks, smoke and sparks
    this.shellM = new THREE.InstancedMesh(this.geo.ball, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4, emissive: 0x332a1a }), 64);
    this.shellM.castShadow = true; this.shellM.frustumCulled = false; this.shellM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); s.add(this.shellM);
    for (let i = 0; i < 64; i++) this.shellM.setColorAt(i, new THREE.Color(1, 1, 1));
    this.flames = new Particles(s, 160, this.geo.ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.smoke = new Particles(s, 320, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }));
    this.sparks = new Particles(s, 200, new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.mineBody = new THREE.InstancedMesh(this.geo.dome, mat(0xffffff, { roughness: 0.35, metalness: 0.3 }), 16);
    this.mineBody.castShadow = true; this.mineBody.frustumCulled = false; s.add(this.mineBody);
    for (let i = 0; i < 16; i++) this.mineBody.setColorAt(i, new THREE.Color(1, 1, 1));
    this.mineLight = new Particles(s, 16, this.geo.ball, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.wrecks = new THREE.InstancedMesh(this.geo.rbox, mat(0x2a2624, { roughness: 0.9 }), 48);
    this.wrecks.castShadow = true; this.wrecks.frustumCulled = false; s.add(this.wrecks);
    // props around the arena (per world)
    this.props = new Map();
    this.tankViews = new Map();
    this.bossView = null;
  }

  setTheme(sess, dark) {
    const key = sess.L.world + (dark ? ':d' : '');
    if (key === this.themeKey) return;
    this.themeKey = key;
    const th = THEMES[sess.L.world];
    this.ground.material.map = texture(th.ground, { repeat: [28, 28] }); this.ground.material.color.set(0xffffff).multiplyScalar(0.92); this.ground.material.needsUpdate = true;
    const fog = new THREE.Color(th.fog); if (dark) fog.multiplyScalar(0.62);
    this.scene.background = fog; this.scene.fog = new THREE.Fog(fog, (this.camDist || 28) * 1.05, (this.camDist || 28) * 2.6);
    const L = this.lights;
    L.light.color.set(th.sun); L.hemi.color.set(th.sky); L.hemi.groundColor.set(th.hemiG);
    this.renderer.toneMappingExposure = th.exposure * (dark ? 0.88 : 1);
    this.walls.material.map = th.wallMap ? texture(th.wallMap, { repeat: [1, 1] }) : null;
    this.walls.material.color.set(th.wall);
    this.walls.material.roughness = th.glossyWall ? 0.18 : 0.62; this.walls.material.metalness = th.glossyWall ? 0.1 : 0.02;
    this.walls.material.needsUpdate = true;
    this.wallCaps.material.color.set(th.wall).offsetHSL(0, -0.05, 0.08);
    this.crates.material.map = crateTex(th.crate); this.crates.material.needsUpdate = true;
    this.lavaU.uLava.value = th.lava ? 1 : 0;
    this.rev = -1; // repaint the floor in this world's look
    // props: scattered around the arena (outside the border ring), static
    for (const c of this.props.values()) for (const ch of c.channels) { ch.mesh.count = 0; if (ch.shadow) ch.shadow.count = 0; }
    let seed = 11 + sess.L.world * 97;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const missing = th.props.filter(([n]) => !LO[n]);
    if (missing.length) Promise.all(missing.map(async ([n]) => { LO[n] = await loadModel(n, 'lo').catch(() => null); })).then(() => { if (this.themeKey === key) this.themeKey = null; });
    for (const [name, count, scale, tall] of th.props) {
      if (!LO[name]) continue;
      let c = this.props.get(name);
      if (!c) {
        c = new MergedCrowd(this.scene, null, 48, { model: LO[name], shadowModel: tall ? LO[name] : null });
        for (const ch of c.channels) ch.mesh.material.userData.cheapIbl = true;
        this.props.set(name, c);
        applyIbl(this.scene, this.env, 0.55);
      }
      c.begin();
      let placed = 0, guard = 0;
      while (placed < count && guard++ < count * 30) {
        const x = (r() * 2 - 1) * 26, z = (r() * 2 - 1) * 17;
        const big = count <= 3;
        if (Math.abs(x) < W / 2 + (big ? 5 : 2.2) && Math.abs(z) < H / 2 + (big ? 4 : 1.8)) continue;
        // keep the band in front of the camera low (it would cover the arena)
        if (z > H / 2 && tall && Math.abs(x) < W / 2 + 4) continue;
        c.add(x, 0, z, r() * TAU, scale * (0.8 + r() * 0.4), { swing: 0 }); placed++;
      }
      c.end();
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The static map: blocks, crates, ice, pits, vents (again whenever a crate breaks). */
  layout(sess) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    let nw = 0, nc = 0, ni = 0, np = 0;
    const th = THEMES[sess.L.world];
    const rand = ((seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; })(sess.L.seed % 2147483646 + 1);
    const wall = (x, y, h = 0.82) => {
      const j = (rand() - 0.5) * 0.06;
      m.compose(p.set(x - W / 2 + 0.5, h / 2, y - H / 2 + 0.5), q.setFromAxisAngle(v3.set(0, 1, 0), j), sc.set(0.98, h, 0.98));
      this.walls.setMatrixAt(nw, m); this.walls.setColorAt(nw, c.set(0xffffff).multiplyScalar(0.9 + rand() * 0.16));
      m.compose(p.set(x - W / 2 + 0.5, h + 0.015, y - H / 2 + 0.5), q, sc.set(0.86, 0.04, 0.86));
      this.wallCaps.setMatrixAt(nw, m); this.wallCaps.setColorAt(nw, c.set(0xffffff));
      nw++;
    };
    for (let x = -1; x <= W; x++) { wall(x, -1, 1.0); wall(x, H, 0.62); }
    for (let y = 0; y < H; y++) { wall(-1, y, 0.9); wall(W, y, 0.9); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = sess.grid[y * W + x], cx = x - W / 2 + 0.5, cz = y - H / 2 + 0.5;
      if (t === T.WALL) wall(x, y);
      else if (t === T.CRATE) {
        m.compose(p.set(cx, 0.34, cz), q.setFromAxisAngle(v3.set(0, 1, 0), (rand() - 0.5) * 0.12), sc.set(0.84, 0.68, 0.84));
        this.crates.setMatrixAt(nc, m); this.crates.setColorAt(nc++, c.set(0xffffff).multiplyScalar(0.88 + rand() * 0.2));
      } else if (t === T.ICE) { m.compose(p.set(cx, 0.004, cz), q.identity(), sc.set(1, 1, 1)); this.ice.setMatrixAt(ni++, m); }
      else if (t === T.PIT) {
        m.compose(p.set(cx, 0, cz), q.identity(), sc.set(1, 1, 1));
        const open = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H || sess.grid[yy * W + xx] !== T.PIT ? 1 : 0);
        this.pitEdge.setXYZW(np, open(x - 1, y), open(x + 1, y), open(x, y - 1), open(x, y + 1));
        this.pits.setMatrixAt(np++, m);
      }
    }
    this.walls.count = nw; this.wallCaps.count = nw; this.crates.count = nc; this.ice.count = ni; this.pits.count = np;
    for (const im of [this.walls, this.wallCaps, this.crates, this.ice, this.pits]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.pitEdge.needsUpdate = true;
    this.vents.count = sess.vents.length;
    sess.vents.forEach((v, i) => { m.compose(p.set(v.x - W / 2 + 0.5, 0, v.y - H / 2 + 0.5), q.identity(), sc.set(0.96, 1, 0.96)); this.vents.setMatrixAt(i, m); });
    this.vents.instanceMatrix.needsUpdate = true;
    // ambient occlusion along the blocks, painted into the floor's light: a canvas of the arena
    const px = 48, cv = document.createElement('canvas'); cv.width = W * px; cv.height = H * px;
    const g = cv.getContext('2d');
    const base = new THREE.Color(th.floor), alt = new THREE.Color(th.floorAlt), hex = (c, k = 1) => `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
    const world = sess.L.world;
    g.fillStyle = hex(base); g.fillRect(0, 0, cv.width, cv.height);
    if (world === 0) {
      // a mown lawn: broad stripes, clover speckles
      for (let x = 0; x < W; x += 2) { g.fillStyle = hex(alt); g.fillRect(x * px, 0, px, cv.height); }
      for (let i = 0; i < 2600; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(40,90,20,.22)' : 'rgba(230,250,170,.22)'; g.fillRect(rand() * cv.width, rand() * cv.height, 2 + rand() * 3, 2 + rand() * 3); }
      for (let i = 0; i < 70; i++) { g.fillStyle = rand() < 0.7 ? 'rgba(255,255,255,.85)' : 'rgba(255,230,120,.9)'; g.beginPath(); g.arc(rand() * cv.width, rand() * cv.height, 2.2, 0, TAU); g.fill(); }
    } else if (world === 1) {
      // packed sand with wind ripples
      g.strokeStyle = hex(alt, 0.93); g.lineWidth = 3;
      for (let y = 6; y < cv.height; y += 14) { g.beginPath(); for (let x = 0; x <= cv.width; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 4); g.stroke(); }
      for (let i = 0; i < 1800; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(150,100,50,.18)' : 'rgba(255,240,200,.25)'; g.fillRect(rand() * cv.width, rand() * cv.height, 2, 2); }
    } else if (world === 2) {
      // packed snow with blue shadows and sparkle
      for (let i = 0; i < 160; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40); const x = rand() * cv.width, y = rand() * cv.height; g.save(); g.translate(x, y); gr.addColorStop(0, 'rgba(160,190,225,.18)'); gr.addColorStop(1, 'rgba(160,190,225,0)'); g.fillStyle = gr; g.fillRect(-40, -40, 80, 80); g.restore(); }
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(rand() * cv.width, rand() * cv.height, 1.5, 1.5); }
    } else {
      // basalt slabs with glowing seams
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = hex((x * 7 + y * 3) % 3 ? base : alt, 0.92 + rand() * 0.16); g.fillRect(x * px + 2, y * px + 2, px - 4, px - 4); }
      g.strokeStyle = 'rgba(255,110,30,.35)'; g.lineWidth = 2;
      for (let i = 0; i < 26; i++) { g.beginPath(); let x = rand() * cv.width, y = rand() * cv.height; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    }
    // a fine tile grid, so ricochet angles are easy to read
    g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1;
    for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, cv.height); g.stroke(); }
    for (let y = 1; y < H; y++) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(cv.width, y * px); g.stroke(); }
    g.filter = 'blur(10px)';
    g.fillStyle = 'rgba(0,0,0,.34)';
    for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
      const t = x < 0 || y < 0 || x >= W || y >= H ? T.WALL : sess.grid[y * W + x];
      if (t === T.WALL || t === T.CRATE) g.fillRect(x * px - 10, y * px - 6, px + 20, px + 20);
    }
    g.filter = 'none';
    if (this.floorTex) this.floorTex.dispose();
    this.floorTex = new THREE.CanvasTexture(cv); this.floorTex.colorSpace = THREE.SRGBColorSpace; this.floorTex.anisotropy = 4;
    this.floor.material.emissiveMap = null;
    this.floor.material.color.set(0xffffff);
    this.floor.material.map = this.floorTex;
    this.floor.material.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  setup(sess) {
    this.session = sess; this.rev = -1;
    for (const tv of this.tankViews.values()) this.scene.remove(tv.root);
    this.tankViews.clear();
    if (this.bossView) { this.scene.remove(this.bossView.group); this.bossView = null; }
    for (const tk of sess.tanks) this.viewFor(tk);
    this.renderer.shadowMap.needsUpdate = true;
  }
  viewFor(tk) {
    let tv = this.tankViews.get(tk.id);
    if (tv) return tv;
    if (tk.boss) {
      const model = LO[BOSS_MODEL[tk.boss]];
      const f = model ? bossFigure(model) : { group: new THREE.Group(), mats: [] };
      tv = { root: f.group, boss: true, mats: f.mats, scale: tk.def.fly ? 2.0 : 1.75 };
    } else {
      const D = tk.def;
      tv = buildTank(this.geo, { color: tk.team === 0 ? 0x4f9a3a : D.color, player: tk.team === 0, ghost: !!D?.ghost, eye: tk.type === 'ace' ? 0xff3b30 : tk.type === 'ghost' ? 0x9be7ff : 0xffd34d });
    }
    applyIbl(tv.root, this.env, 0.7);
    this.scene.add(tv.root);
    this.tankViews.set(tk.id, tv);
    return tv;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(LOW_GPU ? Math.min(1, dpr) : dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h > w * 1.08;
    // frame the arena (with its border ring): find the closest distance where every corner is on screen
    const tilt = 1.02, yaw = this.portrait ? -Math.PI / 2 : 0;
    const corners = [];
    for (const x of [-W / 2 - 1, W / 2 + 1]) for (const z of [-H / 2 - 1, H / 2 + 1]) for (const y of [0, 1]) corners.push(new THREE.Vector3(x, y, z));
    const place = (d) => {
      const cx = 0, cz = 0.35;
      this.camera.position.set(cx + Math.sin(yaw) * Math.cos(tilt) * d, Math.sin(tilt) * d, cz + Math.cos(yaw) * Math.cos(tilt) * d);
      this.camera.lookAt(cx, 0, cz);
      this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    };
    let lo = 8, hi = 90;
    for (let i = 0; i < 24; i++) {
      const d = (lo + hi) / 2; place(d);
      const fits = corners.every((c) => { v3.copy(c).project(this.camera); return Math.abs(v3.x) < 0.97 && v3.y < 0.86 && v3.y > -0.94; });
      if (fits) hi = d; else lo = d;
    }
    place(hi);
    this.camDist = hi;
    if (this.scene.fog) { this.scene.fog.near = hi * 1.05; this.scene.fog.far = hi * 2.6; }
    this.lights.light.position.set(-7, 15, 9); this.lights.light.target.position.set(0, 0, 0);
    this.renderer.shadowMap.needsUpdate = true;
  }

  render(s, view) {
    if (this.session !== s) this.setup(s);
    this.setTheme(s, view.dark);
    if (this.rev !== s.rev) { this.rev = s.rev; this.layout(s); }
    this.time = view.time || this.time + 1 / 60;
    this.lavaU.uTime.value = this.time;
    for (let i = 0; i < s.vents.length; i++) this.ventK.array[i] = s.vents[i].state === 2 ? 1 : s.vents[i].k * 0.8;
    this.ventK.needsUpdate = true;
    this.drawTanks(s);
    this.drawShells(s);
    this.drawGround(s);
    this.drawFx(s);
    if ((this.frame++ & 1) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  drawTanks(s) {
    for (const tk of s.tanks) {
      const tv = this.viewFor(tk);
      const show = tk.alive && !tk.under;
      tv.root.visible = show;
      if (!show) continue;
      const x = tk.x - W / 2, z = tk.y - H / 2;
      if (tv.boss) {
        const fly = tk.def.fly ? 1.4 + Math.sin(this.time * 1.6) * 0.15 : 0;
        tv.root.position.set(x, fly, z);
        tv.root.rotation.y = -tk.aim + Math.PI / 2;
        tv.root.scale.setScalar(tv.scale * (1 + (tk.flash > 0 ? 0.05 : 0)));
        const f = tk.flash > 0 ? 2.2 : tk.armour > 0 ? 1.25 : 1;
        for (const m of tv.mats) m.color.setRGB(f, f, f);
        continue;
      }
      tv.root.position.set(x, 0, z);
      tv.root.rotation.y = -tk.ang;
      tv.turret.rotation.y = -(tk.aim - tk.ang);
      tv.barrel.position.x = 0.12 - tk.recoil * 0.08;
      tv.body.position.y = tk.moving > 0.2 ? Math.abs(Math.sin(tk.tread * 9)) * 0.012 : 0;
      tv.body.rotation.z = -tk.recoil * 0.05;
      tv.treadM.map.offset.x = -tk.tread * 0.9;
      // a hit tank flashes white; a ghost is a shimmer unless it fires, gets hit or comes close
      const ghost = tk.def?.ghost;
      let op = 1;
      if (ghost) op = s.ghostVisible(tk) ? 0.75 : 0.07 + 0.04 * Math.sin(this.time * 6 + tk.id);
      for (const m of tv.mats) { m.opacity = op; m.emissive.setRGB(tk.flash > 0 ? 0.8 : 0, tk.flash > 0 ? 0.8 : 0, tk.flash > 0 ? 0.8 : 0); }
      if (tv.eye) {
        tv.eye.material.color.set(tk.type === 'ace' ? 0xff3b30 : tk.type === 'ghost' ? 0x9be7ff : 0xffd34d).multiplyScalar(tk.charge > 0 ? 3 : tk.want != null ? 1.6 : 0.9);
        tv.eye.scale.set(0.05, 0.075, 0.075).multiplyScalar(tk.charge > 0 ? 1.5 + Math.sin(this.time * 40) * 0.2 : 1);
      }
      if (tv.driver) tv.driver.position.y = -0.1 + (tk.moving > 0.2 ? 0 : Math.sin(this.time * 2.4) * 0.008);
    }
  }

  drawShells(s) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    let n = 0;
    this.flames.begin();
    for (const sh of s.shells) {
      if (n >= 64) break;
      const a = Math.atan2(sh.vy, sh.vx), x = sh.x - W / 2, z = sh.y - H / 2, rocket = sh.kind === 1;
      m.compose(p.set(x, 0.42, z), q.setFromEuler(e.set(0, -a, 0)), sc.set(rocket ? 0.16 : 0.12, 0.07, 0.07));
      this.shellM.setMatrixAt(n, m); this.shellM.setColorAt(n, c.set(sh.team === 0 ? 0xe8f5d0 : rocket ? 0xff8a3d : 0xf4f1ea)); n++;
      // a smoke trail behind, a flame for rockets
      const dx = Math.cos(a), dz = Math.sin(a);
      for (let k = 1; k <= (rocket ? 5 : 3); k++) {
        const b = k * (rocket ? 0.09 : 0.11);
        if (rocket) this.flames.add(x - dx * b, 0.42, z - dz * b, 0.07 * (1 - k / 6), k < 2 ? 0xffe08a : 0xff6a1a);
        else this.flames.add(x - dx * b, 0.42, z - dz * b, 0.045 * (1 - k / 4), 0x998f80);
      }
    }
    this.shellM.count = n; this.shellM.instanceMatrix.needsUpdate = true; if (this.shellM.instanceColor) this.shellM.instanceColor.needsUpdate = true;
    // mines: a little dome that blinks faster as the fuse runs out
    let k = 0;
    this.mineLight.begin();
    for (const mi of s.mines) {
      if (k >= 16) break;
      const x = mi.x - W / 2, z = mi.y - H / 2;
      m.compose(p.set(x, 0, z), q.identity(), sc.set(0.22, 0.12, 0.22));
      this.mineBody.setMatrixAt(k, m); this.mineBody.setColorAt(k, c.set(mi.team === 0 ? 0x4f9a3a : 0xeab308)); k++;
      const rate = mi.trig >= 0 ? 24 : mi.fuse < 2 ? 12 : 3;
      if (Math.sin(this.time * rate) > 0) this.mineLight.add(x, 0.13, z, 0.04, mi.trig >= 0 || mi.fuse < 2 ? 0xff3b30 : 0xfff3a0);
    }
    this.mineBody.count = k; this.mineBody.instanceMatrix.needsUpdate = true; if (this.mineBody.instanceColor) this.mineBody.instanceColor.needsUpdate = true;
    this.mineLight.end();
    // wrecks
    let wn = 0;
    for (const wr of s.wrecks || []) {
      if (wn >= 48) break;
      const x = wr.x - W / 2, z = wr.y - H / 2, big = wr.boss ? 1.9 : 1;
      m.compose(p.set(x, 0.1 * big, z), q.setFromEuler(e.set(0.05, -wr.ang, 0.08)), sc.set(0.66 * big, 0.2 * big, 0.48 * big));
      this.wrecks.setMatrixAt(wn++, m);
    }
    this.wrecks.count = wn; this.wrecks.instanceMatrix.needsUpdate = true;
  }

  drawGround(s) {
    this.treads.begin();
    for (const mk of s.marks) this.treads.add(mk.x - W / 2, mk.y - H / 2, 0.34, 0.5, -mk.ang, 0x2b2118, Math.min(0.28, mk.life * 0.05));
    this.treads.end();
    this.scorch.begin();
    for (const wr of s.wrecks || []) this.scorch.add(wr.x - W / 2, wr.y - H / 2, wr.boss ? 3.4 : 1.7, wr.boss ? 3.4 : 1.7, wr.x * 3.1, 0x120c0a, 0.7, 0.014);
    for (const f of s.fx) if (f.kind === 'blast') this.scorch.add(f.x - W / 2, f.y - H / 2, f.r * 1.8, f.r * 1.8, f.x * 5, 0x1a100a, 0.55 * Math.min(1, f.t * 6), 0.016);
    this.scorch.end();
  }

  drawFx(s) {
    this.smoke.begin(); this.sparks.begin();
    const t = this.time;
    for (const f of s.fx) {
      const k = f.t / f.max, x = f.x - W / 2, z = f.y - H / 2;
      if (f.kind === 'boom' || f.kind === 'blast') {
        const R = (f.r || 1) * (f.kind === 'blast' ? 1 : 0.8);
        // fireball, then a column of smoke
        if (k < 0.45) this.flames.add(x, 0.3 + k, z, R * (0.35 + k * 1.1), k < 0.2 ? 0xffe6a0 : 0xff7a1a);
        for (let i = 0; i < 8; i++) {
          const a = i * 0.785 + f.x, rr = R * (0.2 + k * 0.7);
          this.smoke.add(x + Math.cos(a) * rr, 0.25 + k * 1.6 + (i % 3) * 0.15, z + Math.sin(a) * rr, R * 0.22 * (0.6 + k), k < 0.25 ? 0x5a4a40 : 0x6d6a66, a);
        }
        if (k < 0.5) for (let i = 0; i < 10; i++) { const a = i * 0.63 + f.y, rr = R * k * 2.2; this.sparks.add(x + Math.cos(a) * rr, 0.3 + Math.sin(k * 3.1) * 0.6 * (i % 2 + 0.5), z + Math.sin(a) * rr, 0.05 * (1 - k), 0xffc04d, a); }
      } else if (f.kind === 'puff') {
        for (let i = 0; i < 3; i++) this.smoke.add(x + (i - 1) * 0.08, 0.42 + k * 0.4, z, 0.08 + k * 0.1, 0xd8d2c8, i);
      } else if (f.kind === 'spark') {
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + f.x * 3, rr = 0.1 + k * 0.5; this.sparks.add(x + Math.cos(a) * rr, 0.45 + k * 0.2, z + Math.sin(a) * rr, 0.035 * (1 - k), 0xfff1a0, a); }
      } else if (f.kind === 'crate') {
        for (let i = 0; i < 8; i++) { const a = i * 0.79 + f.x, rr = 0.2 + k * 1.1; this.smoke.add(x + Math.cos(a) * rr, Math.max(0.05, 0.6 * Math.sin(k * 3.1)) , z + Math.sin(a) * rr, 0.09, THEMES[s.L.world].crate, a * 3 + k * 9); }
      }
    }
    // burning wrecks keep smoking
    for (const wr of s.wrecks || []) {
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.6 + i * 0.5 + wr.x) % 1;
        this.smoke.add(wr.x - W / 2 + Math.sin(ph * 5 + i) * 0.1, 0.3 + ph * 1.4, wr.y - H / 2, 0.08 + ph * 0.16, 0x4a4542, ph * 6);
      }
    }
    // vents spit embers while they erupt
    for (const v of s.vents) if (v.state === 2) for (let i = 0; i < 6; i++) { const ph = (t * 1.8 + i / 6) % 1; this.sparks.add(v.x - W / 2 + 0.5 + Math.sin(i * 2.1 + t) * 0.25, ph * 1.8, v.y - H / 2 + 0.5 + Math.cos(i * 1.7) * 0.25, 0.05 * (1 - ph), 0xffa13d, i + t); }
    this.smoke.end(); this.sparks.end(); this.flames.end();
  }
}

export const create = (canvas) => new Tanks3D(canvas);
