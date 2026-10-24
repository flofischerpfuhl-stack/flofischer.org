/**
 * Momo's Last Stand in 3D (Three.js). Draws a MomoSession from a tilted camera that follows Momo; the 2D overlay
 * (health bars, damage numbers, cards, the stick) stays on the session's canvas pass, projected through this camera.
 * Mapping: session (x, y) → three (x, 0, y); y grows towards the camera.
 *
 * Performance: every crowd (enemies, sparks, shots, decals, particles) is one instanced mesh per material, filled from
 * the session's pools each frame without allocating; only Momo, the boss and the tall props cast real shadows (the
 * horde gets blob shadows), and the shadow map is redrawn every second frame.
 */
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, MergedCrowd, Particles, BlobShadows } from './three-kit.js';
import { loadModel } from './models.js';
import { KINDS, WEAPONS } from './momo.js';

// the cast and the props (sculpted, scripts/games-sculpt), loaded before the view is created
const ENEMY_MODEL = { zorbling: 'ZORBLING', zipper: 'ZIPPER', klonkbot: 'KLONKBOT', shield: 'SHIELD_KLONK', spitter: 'SPITTER', blorb: 'BLORB', buzzbot: 'BUZZBOT' };
// (the bosses use UFO, ICE_CRYSTAL and the Fernstone; the scenery props of a world load when it is first shown)
const NAMES = ['MOMO', ...Object.values(ENEMY_MODEL), 'UFO', 'ICE_CRYSTAL', 'FERNSTONE'];
const LO = Object.fromEntries(await Promise.all(NAMES.map(async (n) => [n, await loadModel(n, 'lo')])));
const SH = { MOMO: await loadModel('MOMO', 'sh') };

// in-game scale and hover height per enemy kind (models are about one unit tall)
const LOOK = {
  zorbling: { scale: 1.25 }, zipper: { scale: 1.1 }, klonkbot: { scale: 1.2 }, shield: { scale: 1.22 },
  spitter: { scale: 1.3 }, blorb: { scale: 1.05 }, buzzbot: { scale: 1.4, fly: 0.55 },
};
const MAX = { zorbling: 280, zipper: 160, klonkbot: 160, shield: 100, spitter: 100, blorb: 80, buzzbot: 160 };

const THEMES = {
  meadow: {
    ground: 't-grass', tint: 0xffffff, fog: 0xbfe0f5, exposure: 1.05, rim: 0xfff6d8,
    light: { sun: 0xfff1d6, sky: 0xd6ecff, ground: 0x4f6e2c, intensity: 2.6, ambient: 1.15 },
    props: [['TREE_ROUND', 40, 1.3, true], ['BUSH', 44, 1.1], ['ROCK', 16, 1.2], ['COTTAGE', 5, 2.4, true]], landmark: ['WINDMILL', 2.6],
  },
  dunes: {
    ground: 't-sand', tint: 0xffffff, fog: 0xf3d6a8, exposure: 1.05, rim: 0xfff1d0,
    light: { sun: 0xffd29a, sky: 0xffe3c2, ground: 0x9a6b3a, intensity: 2.6, ambient: 1.1 },
    props: [['CACTUS', 40, 1.5, true], ['DESERT_ROCK', 34, 1.6], ['PALM', 12, 1.7, true]], landmark: ['MESA', 2.4],
  },
  frost: {
    ground: 't-snow', tint: 0xffffff, fog: 0xd8e8f8, exposure: 0.95, rim: 0x9cc8ef,
    light: { sun: 0xffffff, sky: 0xe0f0ff, ground: 0xb0c4d8, intensity: 2.3, ambient: 1.05 },
    props: [['PINE_SNOW', 54, 1.6, true], ['SNOW_ROCK', 20, 1.3], ['ICE_CRYSTAL', 20, 1.6]], landmark: ['OBSERVATORY', 2.2],
  },
  ember: {
    ground: 't-lavarock', tint: 0xb8a8a2, fog: 0x4a2a36, exposure: 1.1, rim: 0xff8a3d,
    light: { sun: 0xffb27a, sky: 0xff9a6a, ground: 0x3a1408, intensity: 2.3, ambient: 1.0 },
    props: [['BASALT', 48, 1.7, true], ['FERNSTONE', 24, 1.5]], landmark: ['VOLCANO', 2.2],
  },
};
const WORLD_KEYS = ['meadow', 'dunes', 'frost', 'ember'];
const GOLD = new THREE.Color(1.35, 1.1, 0.42), WHITE = new THREE.Color(1, 1, 1);

/** Ground decals (hazard warnings, storms): a flat quad per instance with colour, alpha and a fill progress. */
function decalMaterial(shape) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute float aAlpha; attribute float aProg; varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
      void main() { vUv = uv; vC = instanceColor; vA = aAlpha; vP = aProg; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: shape === 'disc'
      ? `varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
        void main() { float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
          float rim = smoothstep(0.84, 0.94, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float fill = (1.0 - smoothstep(vP - 0.04, vP, r)) * 0.5;
          gl_FragColor = vec4(vC, max(rim, fill + 0.16 * (1.0 - r * 0.5)) * vA); }`
      : shape === 'soft'
        ? `varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
          void main() { float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
            float n = 0.75 + 0.25 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 6.0 + r * 9.0 - vP * 3.0);
            gl_FragColor = vec4(vC, (1.0 - smoothstep(0.55, 1.0, r)) * n * vA); }`
        : `varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
          void main() { float e = min(vUv.y, 1.0 - vUv.y); float rim = 1.0 - smoothstep(0.06, 0.16, e);
            float stripe = step(0.5, fract(vUv.x * 9.0 - abs(vUv.y - 0.5) * 2.0 - vP * 3.0)) * 0.22;
            float fill = (1.0 - smoothstep(vP - 0.02, vP, vUv.x)) * 0.5;
            float a = vP >= 0.999 ? 0.95 : max(rim * 0.9, fill + 0.12 + stripe);
            gl_FragColor = vec4(vC, a * vA); }`,
  });
}
class Decals {
  constructor(scene, max, shape) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.prog = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.prog.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha); geo.setAttribute('aProg', this.prog);
    this.mesh = new THREE.InstancedMesh(geo, decalMaterial(shape), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, WHITE);
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  /** x, z centre; sx along the rotation's x (length), sz across; rot about y. */
  add(x, z, sx, sz, rot, color, alpha, prog, y = 0.03) {
    if (this.n >= this.max) return;
    this._q.setFromAxisAngle(this._up, rot);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(color));
    this.alpha.array[this.n] = alpha; this.prog.array[this.n] = prog;
    this.n++;
  }
  end() { const m = this.mesh; m.count = this.n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true; this.prog.needsUpdate = true; }
}

/** Plain instanced mesh with per-instance colour (shots, sparks, drones, beams). */
class Inst {
  constructor(scene, geo, material, max, { shadow = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = shadow;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, WHITE);
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sy, sz, rx, ry, rz, color = null) {
    if (this.n >= this.max) return;
    this._q.setFromEuler(this._e.set(rx, ry, rz));
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, this._m);
    if (color != null) this.mesh.setColorAt(this.n, this._c.set(color));
    this.n++;
  }
  /** A box stretched from (x1,y1,z1) to (x2,y2,z2) with thickness t. */
  seg(x1, y1, z1, x2, y2, z2, t, color) {
    if (this.n >= this.max) return;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, len = Math.hypot(dx, dy, dz) || 0.001;
    this._v.set(dx / len, dy / len, dz / len);
    this._q.setFromUnitVectors(Inst.X, this._v);
    this._m.compose(this._s.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), this._q, Inst.tmp.set(len, t, t));
    this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(color));
    this.n++;
  }
  end() { const m = this.mesh; m.count = this.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
Inst.X = new THREE.Vector3(1, 0, 0); Inst.tmp = new THREE.Vector3();

/** A spark: an elongated octahedron with baked facet shading (bright top, darker sides), self-lit. */
function facetGem() {
  const g = new THREE.OctahedronGeometry(0.17, 0); // polyhedra are already non-indexed
  g.scale(1, 1.5, 1);
  const P = g.attributes.position, col = new Float32Array(P.count * 3);
  for (let f = 0; f < P.count / 3; f++) {
    const y = (P.getY(f * 3) + P.getY(f * 3 + 1) + P.getY(f * 3 + 2)) / 3, x = (P.getX(f * 3) + P.getX(f * 3 + 1) + P.getX(f * 3 + 2)) / 3;
    const k = y > 0 ? (x > 0 ? 1.0 : 0.82) : (x > 0 ? 0.62 : 0.48);
    for (let v = 0; v < 3; v++) col.set([k, k, k], (f * 3 + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** Ice: pale blue with a few white cracks and streaks (drawn once). */
function iceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#e9f7ff'); gr.addColorStop(0.8, '#cdeaff'); gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
  let seed = 3; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9; i++) { let x = 128 + (r() - 0.5) * 120, y = 128 + (r() - 0.5) * 120; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 7;
  for (let i = 0; i < 4; i++) { const x = 40 + r() * 170; g.beginPath(); g.moveTo(x, 60 + r() * 40); g.lineTo(x + 40, 20 + r() * 30); g.stroke(); }
  g.strokeStyle = 'rgba(120,180,230,.8)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Merge a few primitive geometries (each with its own transform) into one non-indexed geometry. */
function merge(parts) {
  const pos = [], nor = [], m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const [g0, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    nm.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const FIG_MATS = {
  matte: (tint) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02, color: tint }),
  gloss: (tint) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.1, color: tint }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};
/** One baked model as a group of plain meshes (for the bosses), optionally tinted, without some channels. */
function figure(model, { tint = 0xffffff, skip = null, shadow = true } = {}) {
  const g = new THREE.Group(), mats = [];
  for (const part of model) {
    if (skip && skip.includes(part.ch)) continue;
    const m = FIG_MATS[part.mat](new THREE.Color(tint));
    const mesh = new THREE.Mesh(part.geometry, m);
    mesh.castShadow = shadow && part.mat !== 'glow';
    g.add(mesh);
    if (part.mat !== 'glow') mats.push(m);
  }
  return { group: g, mats };
}

export class Momo3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.renderer.shadowMap.autoUpdate = false;
    // plain PCF: the soft variant costs a lot per pixel on the big ground and the difference does not show from up here
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.env = studioEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 220);
    this.w = 1; this.h = 1; this.frame = 0; this.themeKey = null; this.session = null;
    this.camPos = new THREE.Vector3(0, 0, 0); this.camInit = false;
    this.build();
    // overlay projection (one shared result object, see MomoSession.proj)
    const v = new THREE.Vector3(), out = { x: 0, y: 0, s: 1 };
    const proj = (x, y, h = 0) => {
      v.set(x, h, y).project(this.camera);
      const sx = (v.x + 1) / 2 * this.w, sy = (1 - v.y) / 2 * this.h;
      v.set(x + 1, h, y).project(this.camera);
      out.s = Math.abs((v.x + 1) / 2 * this.w - sx); out.x = sx; out.y = sy;
      return out;
    };
    this._proj = proj;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), gp = { x: 0, y: 0 };
    this.groundAt = (sx, sy) => {
      ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      gp.x = hit.x; gp.y = hit.z; return gp;
    };
  }
  projectFn() { return this._proj; }

  build() {
    const s = this.scene;
    const cheap = (m) => { m.userData.cheapIbl = true; return m; };
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), cheap(mat(0xffffff, { roughness: 0.95 })));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; s.add(this.ground);
    // drawn after the figures, so the depth test skips the ground under them (it is the most expensive surface)
    this.ground.renderOrder = 1;
    // the arena's edge: a soft painted ring on the ground
    this.rim = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.015, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.rim.rotation.x = -Math.PI / 2; this.rim.position.y = 0.02; s.add(this.rim);
    this.lights = addLights(s, { shadowBox: 15, mapSize: 2048, dir: [-6, 14, 8] });
    this.lights.light.shadow.camera.far = 60;

    // Momo
    this.momo = new MergedCrowd(s, null, 1, { model: LO.MOMO, shadowModel: SH.MOMO });
    // enemies, one crowd per kind; Shield-Klonks whose shield broke use a copy without the shield channel
    this.crowds = KINDS.map((k) => new MergedCrowd(s, null, MAX[k], { model: LO[ENEMY_MODEL[k]] }));
    this.broken = new MergedCrowd(s, null, MAX.shield, { model: LO.SHIELD_KLONK.filter((g) => g.ch !== 'recoil') });
    this.blobs = new BlobShadows(s, 360, 0.3);
    // The horde gets the gradient ambient light instead of environment reflections: with 200 aliens on screen the
    // reflection lookups cost more than everything else together (13.4 → 7 ms on an Intel HD 630); the sun still
    // gives them their gloss highlights.
    for (const c of [...this.crowds, this.broken]) for (const ch of c.channels) ch.mesh.material.userData.cheapIbl = true;

    // shots and gadgets
    const glossy = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.roughness ?? 0.15, metalness: o.metalness ?? 0.1, transparent: !!o.opacity, opacity: o.opacity ?? 1, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
    this.bubbles = new Inst(s, new THREE.SphereGeometry(1, 14, 10), glossy(0xa5f3fc, { opacity: 0.72, emissive: 0x38bdf8, ei: 0.75 }), 220);
    const wrenchGeo = merge([
      [new THREE.BoxGeometry(0.16, 0.08, 1.0)],
      [new THREE.TorusGeometry(0.2, 0.07, 6, 12, Math.PI * 1.45), [0, 0, 0.6], [Math.PI / 2, 0, Math.PI * 0.27]],
      [new THREE.TorusGeometry(0.11, 0.05, 6, 12), [0, 0, -0.55], [Math.PI / 2, 0, 0]],
    ]);
    this.wrenches = new Inst(s, wrenchGeo, glossy(0xd4dbe4, { metalness: 0.8, roughness: 0.25 }), 40, { shadow: true });
    const droneGeo = merge([
      [new THREE.SphereGeometry(0.2, 12, 8), [0, 0, 0], [0, 0, 0], [1, 0.75, 1]],
      [new THREE.TorusGeometry(0.27, 0.04, 6, 16), [0, 0, 0], [Math.PI / 2, 0, 0]],
      [new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), [0, 0.18, 0]],
    ]);
    this.drones = new Inst(s, droneGeo, glossy(0x9be15d, { metalness: 0.3, roughness: 0.3 }), 8, { shadow: true });
    this.droneEyes = new Inst(s, new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 8);
    this.minesM = new Inst(s, merge([[new THREE.CylinderGeometry(0.26, 0.3, 0.12, 14)], [new THREE.SphereGeometry(0.12, 10, 6), [0, 0.08, 0]]]), glossy(0xf472b6, { metalness: 0.4, roughness: 0.3 }), 12);
    this.mineLights = new Inst(s, new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 12);
    const bolt = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.boltM = new Inst(s, new THREE.BoxGeometry(1, 1, 1), bolt, 420);
    // energy sparks and pickups: one glowing octahedron mesh, colour and size per instance
    this.gemsM = new Inst(s, facetGem(), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }), 340);
    this.goo = new Inst(s, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 90);
    this.beams = new Inst(s, new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 40);

    // ground decals
    this.hazDisc = new Decals(s, 40, 'disc');
    this.hazLine = new Decals(s, 40, 'line');
    this.soft = new Decals(s, 16, 'soft');
    this.ice = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8ccfff, map: iceTexture(), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 12);
    this.ice.count = 0; this.ice.receiveShadow = true; this.ice.frustumCulled = false; s.add(this.ice);

    // effects
    this.sparks = new Particles(s, 600);
    this.sparks.mesh.material.userData.cheapIbl = true;
    this.dust = new Particles(s, 160, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.rings = Array.from({ length: 14 }, () => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.visible = false; s.add(r); return r;
    });

    // generator: a steel plinth with a big glowing Fernstone
    this.gen = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.6, 20), mat(0x5b6878, { metalness: 0.6, roughness: 0.35 }));
    plinth.position.y = 0.3; plinth.castShadow = true; plinth.receiveShadow = true;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 28), mat(0xf59e0b, { metalness: 0.7, roughness: 0.3 }));
    coil.rotation.x = Math.PI / 2; coil.position.y = 0.62;
    const stone = figure(LO.FERNSTONE, { shadow: true });
    stone.group.scale.setScalar(2.2); stone.group.position.y = 0.6;
    this.genStone = stone.group; this.genMats = stone.mats;
    this.gen.add(plinth, coil, stone.group); this.gen.visible = false; s.add(this.gen);

    this.buildBosses();
    this.props = new Map();
    this.bossList = Object.values(this.bosses);
    for (const b of this.bossList) for (const m of b.mats) m.userData.base = m.color.clone();
    applyIbl(s, this.env, 0.55);
  }

  buildBosses() {
    const s = this.scene, B = (this.bosses = {});
    const mk = () => ({ steel: mat(0x7d8a9a, { metalness: 0.6, roughness: 0.3 }), dark: mat(0x2f3540, { metalness: 0.3, roughness: 0.6 }), orange: mat(0xf59e0b, { metalness: 0.5, roughness: 0.3 }) });
    let { steel, dark, orange } = mk();
    const add = (g, geo, m, p, r = [0, 0, 0]) => { const me = new THREE.Mesh(geo, m); me.position.set(...p); me.rotation.set(...r); me.castShadow = true; g.add(me); return me; };
    // Klonk Tank: a Klonkbot driving a tank
    {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      add(body, new THREE.BoxGeometry(2.4, 0.75, 2.9), steel, [0, 0.75, 0]);
      for (const sx of [-1, 1]) add(body, new THREE.CapsuleGeometry(0.42, 2.5, 4, 12), dark, [sx * 1.3, 0.45, 0], [Math.PI / 2, 0, 0]);
      const turret = new THREE.Group(); turret.position.y = 1.15; body.add(turret);
      add(turret, new THREE.CylinderGeometry(0.85, 0.95, 0.45, 18), orange, [0, 0.2, -0.2]);
      add(turret, new THREE.CylinderGeometry(0.16, 0.2, 1.9, 10), steel, [0, 0.25, 1.2], [Math.PI / 2, 0, 0]);
      const pilot = figure(LO.KLONKBOT); pilot.group.scale.setScalar(1.5); pilot.group.position.set(0, 0.3, -0.35); turret.add(pilot.group);
      g.visible = false; s.add(g);
      B.tank = { group: g, body, mats: [steel, dark, orange, ...pilot.mats], lift: 0 };
    }
    ({ steel, dark, orange } = mk());
    // Dune Drill Mech: a giant Shield-Klonk whose shield arm became a drill
    {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const fig = figure(LO.SHIELD_KLONK, { skip: ['recoil'], tint: 0xffe2b0 }); fig.group.scale.setScalar(2.7); body.add(fig.group);
      const drill = new THREE.Group(); drill.position.set(0.25, 1.45, 1.0); body.add(drill);
      add(drill, new THREE.ConeGeometry(0.62, 2.1, 14), orange, [0, 0, 1.0], [Math.PI / 2, 0, 0]);
      add(drill, new THREE.CylinderGeometry(0.66, 0.66, 0.35, 14), steel, [0, 0, -0.05], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) add(drill, new THREE.TorusGeometry(0.5 - i * 0.14, 0.05, 6, 16), dark, [0, 0, 0.45 + i * 0.5]);
      g.visible = false; s.add(g);
      B.drill = { group: g, body, drill, mats: [steel, dark, orange, ...fig.mats], lift: 0 };
      this.mound = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 10), mat(0xd9b07c, { roughness: 0.95 }));
      this.mound.scale.set(1, 0.35, 1); this.mound.visible = false; this.mound.castShadow = true; s.add(this.mound);
    }
    ({ steel, dark, orange } = mk());
    // Frost Walker: an ice-blue Klonkbot on four long legs
    {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const ice = mat(0xbfe6ff, { metalness: 0.5, roughness: 0.2 });
      const fig = figure(LO.KLONKBOT, { tint: 0xc8e6ff }); fig.group.scale.setScalar(2.3); fig.group.position.y = 1.7; body.add(fig.group);
      add(body, new THREE.CylinderGeometry(1.1, 0.9, 0.5, 16), steel, [0, 1.75, 0]);
      const crystal = figure(LO.ICE_CRYSTAL); crystal.group.scale.setScalar(2.0); crystal.group.position.set(0, 3.9, -0.3); body.add(crystal.group);
      const legs = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const hip = new THREE.Group(); hip.position.set(sx * 0.85, 1.7, sz * 0.75); body.add(hip);
        add(hip, new THREE.CylinderGeometry(0.16, 0.13, 1.4, 8), ice, [sx * 0.45, -0.35, sz * 0.35], [sz * 0.5, 0, -sx * 0.6]);
        add(hip, new THREE.CylinderGeometry(0.13, 0.22, 1.5, 8), steel, [sx * 0.95, -0.95, sz * 0.75], [-sz * 0.15, 0, sx * 0.12]);
        legs.push({ hip, sx, sz });
      }
      g.visible = false; s.add(g);
      B.walker = { group: g, body, legs, mats: [steel, ice, ...fig.mats, ...crystal.mats], lift: 0 };
    }
    ({ steel, dark, orange } = mk());
    // The Zorb Queen's mothership: the UFO, huge, with a glowing underside
    {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const fig = figure(LO.UFO); fig.group.scale.setScalar(2.6); body.add(fig.group);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 8, 32), new THREE.MeshBasicMaterial({ color: 0x9df7ff, toneMapped: false }));
      glow.rotation.x = Math.PI / 2; glow.position.y = -0.55; body.add(glow);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.3, 3.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9df7ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.y = -2.3; body.add(cone);
      g.visible = false; s.add(g);
      B.mothership = { group: g, body, cone, mats: fig.mats, lift: 3.4 };
    }
  }

  setTheme(sess, dark) {
    const key = WORLD_KEYS[sess.L.world] + (dark ? ':d' : '') + ':' + sess.R;
    if (key === this.themeKey) return;
    this.themeKey = key;
    const th = THEMES[WORLD_KEYS[sess.L.world]];
    this.ground.material.map = texture(th.ground, { repeat: [16, 16] });
    this.ground.material.color.set(th.tint); this.ground.material.needsUpdate = true;
    const fog = new THREE.Color(th.fog);
    if (dark) fog.multiplyScalar(0.7);
    this.scene.background = fog;
    this.scene.fog = new THREE.Fog(fog, 26, 62);
    const L = this.lights;
    L.light.color.set(th.light.sun); L.light.intensity = th.light.intensity;
    L.hemi.color.set(th.light.sky); L.hemi.groundColor.set(th.light.ground); L.hemi.intensity = th.light.ambient;
    this.renderer.toneMappingExposure = th.exposure * (dark ? 0.9 : 1);
    this.rim.scale.setScalar(sess.R); this.rim.material.color.set(th.rim);
    // props around the arena (static: filled once per world)
    for (const c of this.props.values()) for (const ch of c.channels) { ch.mesh.count = 0; if (ch.shadow) ch.shadow.count = 0; }
    let seed = 7 + sess.L.world * 101;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const all = [...th.props, [th.landmark[0], 3, th.landmark[1], true, true]];
    const missing = all.filter(([name]) => !LO[name]);
    if (missing.length) {
      // scenery of a world not seen yet: fetch it, then place it (the arena plays fine meanwhile)
      Promise.all(missing.map(async ([name]) => { LO[name] = await loadModel(name, 'lo'); })).then(() => { if (this.themeKey === key) this.themeKey = null; }).catch(() => {});
    }
    for (const [name, count, scale, tall, landmark] of all) {
      if (!LO[name]) continue;
      let c = this.props.get(name);
      if (!c) {
        c = new MergedCrowd(this.scene, null, 64, { model: LO[name], shadowModel: tall ? LO[name] : null });
        for (const ch of c.channels) ch.mesh.material.userData.cheapIbl = true;
        this.props.set(name, c);
        applyIbl(this.scene, this.env, 0.55);
      }
      c.begin();
      for (let i = 0; i < count; i++) {
        const a = landmark ? (i / count) * Math.PI * 2 + 0.6 : ((i + r() * 0.9) / count) * Math.PI * 2; // spread evenly, jittered
        const d = landmark ? sess.R + 9 + r() * 3 : sess.R + 1.0 + Math.pow(r(), 0.8) * 8;
        c.add(Math.cos(a) * d, 0, Math.sin(a) * d, r() * Math.PI * 2, scale * (0.8 + r() * 0.45), { swing: 0 });
      }
      c.end();
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** New session: ice patches, the generator, the boss model; draw everything once so every shader compiles now. */
  setup(sess) {
    this.session = sess;
    this.camInit = false;
    const m = new THREE.Matrix4();
    this.ice.count = sess.ice.length;
    sess.ice.forEach((p, i) => { m.makeScale(p.r, 1, p.r).setPosition(p.x, 0.015, p.y); this.ice.setMatrixAt(i, m); });
    this.ice.instanceMatrix.needsUpdate = true;
    this.gen.visible = !!sess.gen;
    for (const b of Object.values(this.bosses)) b.group.visible = false;
    // warm-up: one of everything off to the side, rendered once
    const far = -60;
    for (const c of [...this.crowds, this.broken, this.momo]) { c.begin(); c.add(far, 0, far, 0, 1); c.end(); }
    for (const fx of [this.bubbles, this.wrenches, this.drones, this.droneEyes, this.minesM, this.mineLights, this.boltM, this.gemsM, this.goo, this.beams]) { fx.begin(); fx.add(far, 0, far, 0.1, 0.1, 0.1, 0, 0, 0, 0xffffff); fx.end(); }
    for (const d of [this.hazDisc, this.hazLine, this.soft]) { d.begin(); d.add(far, far, 1, 1, 0, 0xffffff, 0.5, 0.5); d.end(); }
    this.sparks.begin(); this.sparks.add(far, 0, far, 0.1, 0xffffff); this.sparks.end();
    this.dust.begin(); this.dust.add(far, 0, far, 0.1, 0xffffff); this.dust.end();
    this.blobs.begin(); this.blobs.add(far, far, 1); this.blobs.end();
    this.rings[0].visible = true;
    const boss = sess.L.boss ? this.bosses[sess.L.boss] : null;
    if (boss) { boss.group.visible = true; boss.group.position.set(far, 0, far); }
    this.camera.position.set(0, 20, 14); this.camera.lookAt(0, 0, 0);
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.rings[0].visible = false;
    if (boss) boss.group.visible = false;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // distance so that about ±7 units show across the short side (±5.4 across a portrait phone)
    const tilt = 0.98, half = Math.tan((this.camera.fov * Math.PI) / 360);
    const vertical = (6.6 * Math.sin(tilt)) / half, horizontal = (w >= h ? 6.6 : 4.6) / (half * this.camera.aspect);
    this.camDist = Math.min(40, Math.max(vertical, horizontal));
    this.tilt = tilt;
  }

  render(s, view) {
    if (this.session !== s) this.setup(s);
    this.setTheme(s, view.dark);
    const cam = this.camera;
    // follow Momo, a little ahead of where she walks
    const tx = s.x + s.vx * 0.25, tz = s.y + s.vy * 0.2 - 0.6;
    if (!this.camInit) { this.camPos.set(tx, 0, tz); this.camInit = true; }
    this.camPos.x += (tx - this.camPos.x) * 0.12; this.camPos.z += (tz - this.camPos.z) * 0.12;
    const shake = s.shake > 0 && !view.reduced ? s.shake * 0.35 : 0, sx = shake ? (Math.random() - 0.5) * shake : 0, sz = shake ? (Math.random() - 0.5) * shake : 0;
    const d = this.camDist;
    this.scene.fog.near = d + 4; this.scene.fog.far = d + 34;
    cam.position.set(this.camPos.x + sx, Math.sin(this.tilt) * d, this.camPos.z + Math.cos(this.tilt) * d + sz);
    cam.lookAt(this.camPos.x + sx, 0, this.camPos.z + sz);
    cam.updateMatrixWorld();
    const L = this.lights.light;
    L.position.set(this.camPos.x - 6, 14, this.camPos.z + 8); L.target.position.set(this.camPos.x, 0, this.camPos.z);

    this.drawMomo(s);
    this.drawEnemies(s);
    this.drawBoss(s);
    this.drawGadgets(s);
    this.drawGround(s);
    this.drawFx(s);
    if (this.gen.visible && s.gen) {
      this.gen.position.set(s.gen.x, 0, s.gen.y);
      this.genStone.rotation.y = s.time * 0.8;
      this.genStone.position.y = 0.6 + Math.sin(s.time * 2) * 0.06;
      const f = 1 + s.gen.flash * 2;
      for (const m of this.genMats) m.color.setRGB(f, f * (1 - s.gen.flash * 0.5), f * (1 - s.gen.flash * 0.5));
    }
    if ((this.frame++ & 1) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, cam);
  }

  drawMomo(s) {
    const c = this.momo; c.begin();
    const lost = s.result && !s.result.won, won = s.result && s.result.won;
    c.add(s.x, 0, s.y, lost ? s.face : won ? 0 : s.face, 1.35, {
      phase: s.walk, swing: lost ? 0 : s.moving, flash: s.iframes > 0.25 ? 0.6 : 0, squash: lost ? 0.45 : 0, armsUp: won && Math.sin(s.time * 6) > 0, lean: 0,
    });
    c.end();
  }

  drawEnemies(s) {
    const cr = this.crowds, br = this.broken, blobs = this.blobs;
    for (const c of cr) c.begin();
    br.begin(); blobs.begin();
    this.beams.begin();
    const it = s.en.items;
    blobs.add(s.x, s.y, 0.62);
    for (let i = 0; i < s.en.n; i++) {
      const e = it[i];
      if (e.dead || e.boss) continue;
      const kind = KINDS[e.kind], look = LOOK[kind];
      const crowd = kind === 'shield' && e.shield <= 0 ? br : cr[e.kind];
      const grow = e.spawnIn > 0 ? 1 - e.spawnIn / 0.35 : 1;
      const sc = look.scale * e.scale * (0.3 + 0.7 * grow);
      const y = (look.fly || 0) + (look.fly ? Math.sin(e.phase * 0.8) * 0.12 : 0) + (1 - grow) * 1.2;
      crowd.add(e.x, y, e.y, e.face, sc, {
        phase: e.phase, swing: 1, flash: e.flash > 0 ? 0.8 : e.charge > 0 ? e.charge * 0.6 : 0, spin: s.time * 30,
      });
      if (e.elite) tintLast(crowd, GOLD);
      blobs.add(e.x, e.y, e.r * 1.15);
      if (e.spawnIn > 0) this.beams.add(e.x, 1.6, e.y, 0.45 * e.scale, 3.2, 0.45 * e.scale, 0, 0, 0, kind === 'klonkbot' || kind === 'shield' || kind === 'buzzbot' ? 0xffb35a : 0xc77dff);
    }
    // the fallen: a quick squash where they stood
    const C = s.corpses.items;
    for (let i = 0; i < s.corpses.n; i++) {
      const c = C[i], kind = KINDS[c.kind], look = LOOK[kind], q = 1 - c.life / 0.4;
      (kind === 'shield' ? br : cr[c.kind]).add(c.x, look.fly ? look.fly * (1 - q) : 0, c.y, c.face, look.scale * c.scale, { flash: 1 - q, squash: q, swing: 0 });
      if (c.elite) tintLast(kind === 'shield' ? br : cr[c.kind], GOLD);
    }
    for (const c of cr) c.end();
    br.end(); blobs.end();
  }

  drawBoss(s) {
    const b = s.boss;
    for (const k of this.bossList) k.group.visible = false;
    this.mound.visible = false;
    if (!b) return;
    const B = this.bosses[s.L.boss];
    if (b.dead) return;
    if (b.hidden) {
      this.mound.visible = true;
      this.mound.position.set(b.cx + (b.x - b.cx) * Math.max(0, 1 - b.st / 1.75), 0, b.cy + (b.y - b.cy) * Math.max(0, 1 - b.st / 1.75));
      return;
    }
    const grow = b.spawnIn > 0 ? 1 - b.spawnIn / 1.2 : 1;
    B.group.visible = true;
    B.group.position.set(b.x, B.lift + (1 - grow) * 6, b.y);
    B.group.rotation.y = b.face;
    B.group.scale.setScalar(0.4 + 0.6 * grow);
    const f = b.flash > 0 ? 2.2 : b.state === 'aim' || b.state === 'cast' ? 1 + Math.abs(Math.sin(s.time * 14)) * 0.35 : 1;
    for (const m of B.mats) m.color.copy(m.userData.base).multiplyScalar(f);
    if (s.L.boss === 'tank') B.body.position.y = Math.abs(Math.sin(b.phase * 3)) * 0.05;
    else if (s.L.boss === 'drill') { B.drill.rotation.z = s.time * (b.state === 'charge' ? 30 : 8); B.body.position.y = Math.abs(Math.sin(b.phase * 2)) * 0.08; }
    else if (s.L.boss === 'walker') {
      for (const l of B.legs) l.hip.rotation.x = Math.sin(b.phase * 1.5 + (l.sx * l.sz > 0 ? 0 : Math.PI)) * 0.25;
      B.body.position.y = Math.abs(Math.sin(b.phase * 1.5)) * 0.12 - (b.state === 'cast' ? 0.3 : 0);
    } else {
      B.body.rotation.y = s.time * 0.4 - b.face;
      B.body.position.y = Math.sin(s.time * 1.6) * 0.2;
      B.cone.material.opacity = b.state === 'cast' ? 0.22 + Math.abs(Math.sin(s.time * 10)) * 0.12 : 0.1;
    }
  }

  drawGadgets(s) {
    const bu = this.bubbles, wr = this.wrenches; bu.begin(); wr.begin();
    const S = s.shots.items;
    for (let i = 0; i < s.shots.n; i++) {
      const p = S[i];
      if (p.kind === 0) { const r = p.r * (1 + Math.sin(p.age * 30) * 0.06); bu.add(p.x, 0.62, p.y, r, r, r, 0, 0, 0); }
      else wr.add(p.x, 0.7, p.y, p.r * 1.5, p.r * 1.5, p.r * 1.5, 0, p.spin, 0);
    }
    bu.end(); wr.end();
    const dr = this.drones, eyes = this.droneEyes; dr.begin(); eyes.begin();
    const w = s.weapon('drones');
    if (w) {
      const i = s.wi(w), n = WEAPONS.drones.n[i], rad = WEAPONS.drones.rad[i];
      for (let k = 0; k < n; k++) {
        const a = s.droneAngle + (k / n) * Math.PI * 2, x = s.x + Math.cos(a) * rad, z = s.y + Math.sin(a) * rad, y = 0.8 + Math.sin(s.time * 4 + k) * 0.08;
        dr.add(x, y, z, w.evo ? 1.25 : 1, w.evo ? 1.25 : 1, w.evo ? 1.25 : 1, 0, -a, 0, w.evo ? 0xfde047 : 0x9be15d);
        eyes.add(x + Math.cos(a) * 0.18, y, z + Math.sin(a) * 0.18, 1, 1, 1, 0, 0, 0, 0xffffff);
      }
    }
    dr.end(); eyes.end();
    const mi = this.minesM, ml = this.mineLights; mi.begin(); ml.begin();
    const honey = s.weapon('mines')?.evo;
    for (let i = 0; i < s.mines.n; i++) {
      const m = s.mines.items[i];
      mi.add(m.x, 0.06, m.y, 1, 1, 1, 0, 0, 0, honey ? 0xfbbf24 : 0xf472b6);
      const blink = m.arm > 0 ? 0.4 : (Math.sin(s.time * 10 + i) > 0 ? 1 : 0.3);
      ml.add(m.x, 0.22, m.y, blink, blink, blink, 0, 0, 0, m.arm > 0 ? 0x888888 : 0xff4d6d);
    }
    mi.end(); ml.end();
    // lightning: each hop drawn as three jagged glowing segments
    const bo = this.boltM; bo.begin();
    for (let i = 0; i < s.bolts.n; i++) {
      const b = s.bolts.items[i], P = b.pts, a = Math.min(1, b.life / 0.22);
      for (let k = 0; k + 1 < b.n; k++) {
        let x0 = P[k * 2], z0 = P[k * 2 + 1], y0 = k === 0 ? 1.0 : 0.6;
        const x1 = P[k * 2 + 2], z1 = P[k * 2 + 3];
        for (let j = 1; j <= 3; j++) {
          const t = j / 3, jit = j < 3 ? 0.35 : 0;
          const xx = x0 + (x1 - x0) / (4 - j) + (Math.random() - 0.5) * jit, zz = z0 + (z1 - z0) / (4 - j) + (Math.random() - 0.5) * jit, yy = y0 + (0.6 - y0) * t + (Math.random() - 0.5) * jit * 0.5;
          bo.seg(x0, y0, z0, xx, yy, zz, 0.07 * a + 0.02, 0xe9d5ff);
          bo.seg(x0, y0, z0, xx, yy, zz, 0.18 * a, 0x7c3aed);
          x0 = xx; z0 = zz; y0 = yy;
        }
      }
    }
    bo.end();
    // sparks and pickups
    const ge = this.gemsM; ge.begin();
    for (let i = 0; i < s.gems.n; i++) {
      const g = s.gems.items[i], bob = Math.sin(s.time * 4 + g.bob) * 0.08, spin = s.time * 2 + g.bob;
      if (g.kind === 0) { const sc = g.v > 4 ? 1.5 : g.v > 1 ? 1.2 : 0.95; ge.add(g.x, 0.35 + bob, g.y, sc, sc * 1.5, sc, 0.45, spin, 0.3, g.v > 4 ? 0xfde047 : g.v > 1 ? 0x86efac : 0x5eead4); }
      else ge.add(g.x, 0.55 + bob, g.y, 2.2, 2.6, 2.2, 0.45, spin, 0.3, g.kind === 1 ? 0xff4d6d : g.kind === 2 ? 0x60a5fa : 0xfacc15);
    }
    ge.end();
    const go = this.goo; go.begin();
    for (let i = 0; i < s.foeShots.n; i++) {
      const f = s.foeShots.items[i], r = f.r * (1 + Math.sin(s.time * 20 + i) * 0.1);
      go.add(f.x, 0.55, f.y, r, r * (f.kind ? 0.6 : 1), r, 0, f.kind ? Math.atan2(f.vx, f.vy) : 0, 0, f.kind ? 0xbfeaff : 0x9cff3a);
    }
    go.end();
    // a short beam on Momo while she levels up
    if (s.levelFlash > 0) this.beams.add(s.x, 2, s.y, 0.7, 4, 0.7, 0, 0, 0, 0xfde68a);
    this.beams.end();
  }

  drawGround(s) {
    const hd = this.hazDisc, hl = this.hazLine, so = this.soft;
    hd.begin(); hl.begin(); so.begin();
    for (let i = 0; i < s.haz.n; i++) {
      const h = s.haz.items[i];
      const prog = h.warn > 0 ? 1 - h.warn / h.warnMax : 1;
      const lava = h.src === 0;
      const color = h.warn > 0 ? (lava ? 0xff6a1f : 0xff3b3b) : (lava ? 0xffc04a : 0xffe08a);
      const alpha = h.warn > 0 ? 0.55 + 0.3 * Math.abs(Math.sin(s.time * (6 + prog * 10))) : 0.95;
      if (h.kind === 0) hd.add(h.x, h.y, h.r * 2, h.r * 2, 0, color, alpha, h.warn > 0 ? prog : 1);
      else {
        const dx = h.x2 - h.x, dz = h.y2 - h.y, len = Math.hypot(dx, dz);
        hl.add((h.x + h.x2) / 2, (h.y + h.y2) / 2, len, h.r, -Math.atan2(dz, dx), color, alpha, h.warn > 0 ? prog : 1);
      }
    }
    // sand storms: a swirling dust disc
    for (const st of s.storms) so.add(st.x, st.y, st.r * 2.2, st.r * 2.2, st.spin * 0.8, 0xc8925a, 0.9, s.time, 0.05);
    hd.end(); hl.end(); so.end();
    const du = this.dust; du.begin();
    for (let k = 0; k < s.storms.length; k++) {
      const st = s.storms[k];
      for (let i = 0; i < 52; i++) {
        const a = st.spin * (1.8 + (i % 3) * 0.4) + i * 2.399, r = st.r * Math.sqrt(((i * 0.618) % 1)) * 0.95;
        du.add(st.x + Math.cos(a) * r, 0.2 + ((i * 0.37 + s.time * 0.3) % 1) * 2.2, st.y + Math.sin(a) * r, 0.07 + (i % 4) * 0.03, i % 3 ? 0xe9c38c : 0xb07a48, a);
      }
    }
    du.end();
  }

  drawFx(s) {
    const sp = this.sparks; sp.begin();
    const P = s.parts.items;
    for (let i = 0; i < s.parts.n; i++) {
      const p = P[i], life = Math.min(1, (p.life / p.max) * 2);
      sp.add(p.x, p.h + 0.05, p.y, Math.max(0.02, p.size * 1.4 * life), p.color, p.life * 7);
    }
    sp.end();
    for (const r of this.rings) r.visible = false;
    const G = s.rings.items;
    for (let i = 0; i < s.rings.n && i < this.rings.length; i++) {
      const g = G[i], r = this.rings[i], q = 1 - g.life / g.max;
      r.visible = true; r.position.set(g.x, 0.15, g.y); r.scale.setScalar(Math.max(0.01, g.r * (0.3 + 0.7 * q))); r.material.opacity = 1 - q; r.material.color.set(g.color);
    }
  }
  dispose() { this.renderer.dispose(); }
}

/** Gold tint for the figure just added to a crowd (elites). */
function tintLast(crowd, color) {
  const i = crowd.count - 1;
  if (i < 0) return;
  for (const c of crowd.channels) c.mesh.setColorAt(i, color);
}

export const create = (canvas) => new Momo3D(canvas);
