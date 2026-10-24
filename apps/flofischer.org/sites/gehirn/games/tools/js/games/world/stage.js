/**
 * The Arcade hub's stage, baked once per screen size (decor.js Baker): a wooden podium with a brass rim and a glowing
 * green edge, a floor of planks, velvet curtains with folds, tie-backs and a gold-trimmed valance, a lit
 * "FERNWORK ARCADE" sign, string lights, three spotlight beams, the heroes of the three games standing at the sides,
 * footlights. Only the game boxes, their shadows and a few drifting motes are drawn live.
 *
 * buildStage() → { scene, textures, motes: [{ x, y, z }] }
 */
import { THREE, texture } from '../three-kit.js';
import { RoundedBoxGeometry } from '../../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { Batch, mtx, blob, glowQuad, modelInstances, rng } from './decor.js';
import { fernModel } from './fern.js';

/**
 * Two palettes in the Fernwork look, so the Arcade sits calmly inside the site's UI: light (off-white studio, pale sage
 * curtains, light oak, Fernwork green) and dark (near-black, deep moss, dark walnut, the same green), following the
 * site theme.
 */
const PALETTES = {
  light: {
    bg: 0xf3f6f2, fog: 0xf3f6f2, hemi: [0xffffff, 0xd8d2c4, 1.1], key: [0xfff6ea, 150], rim: [0xd8f0ff, 40], warm: [0xffe6c0, 3],
    floor: 0xd9c7a8, podSide: 0xe9e4da, podTop: 0xf3ead9, tier: 0xd4ccbd, led: 0x16a34a, foot: 0xffffff,
    curtain: 0xb4cbad, valance: 0x9fbc96, trim: 0x15803d, sign: ['#ffffff', '#15803d', '#d4d4d8', null], chain: 0x9a9aa0,
    signGlow: 0, lights: [0xfff3d6, 0xd9f99d, 0xffffff, 0xbbf7d0], lightPow: 1.3, beam: 0x0b0a08, pool: 0.12,
  },
  dark: {
    bg: 0x0b0d0c, fog: 0x0b0d0c, hemi: [0x9aa8a0, 0x1a1612, 0.6], key: [0xfff0d8, 150], rim: [0x9fd8c0, 55], warm: [0xffc880, 5],
    floor: 0x3a2c22, podSide: 0x262019, podTop: 0x6e5644, tier: 0x1c1814, led: 0x22c55e, foot: 0xd9f99d,
    curtain: 0x173d27, valance: 0x123020, trim: 0x22c55e, sign: ['#0f1411', '#4ade80', '#22c55e', '#4ade80'], chain: 0x55555c,
    signGlow: 0.35, lights: [0xfff3d6, 0xbbf7d0, 0x86efac, 0xffffff], lightPow: 2.0, beam: 0x16130e, pool: 0.3,
  },
};

export function buildStage({ env = null, figures = [], dark = false } = {}) {
  const C = dark ? PALETTES.dark : PALETTES.light;
  const scene = new THREE.Scene(), rand = rng(42), textures = [];
  scene.environment = env;
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.Fog(C.fog, dark ? 9 : 16, dark ? 22 : 40);
  const hemi = new THREE.HemisphereLight(...C.hemi);
  const key = new THREE.SpotLight(C.key[0], C.key[1], 22, 0.5, 0.6, 2); key.position.set(-2.5, 7, 6); key.target.position.set(0, -0.6, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004;
  const rimL = new THREE.SpotLight(C.rim[0], C.rim[1], 18, 0.45, 0.7, 2); rimL.position.set(5, 6, -2); rimL.target.position.set(0, -1, 0);
  const warm = new THREE.PointLight(C.warm[0], C.warm[1], 9, 2); warm.position.set(0, 2.6, -2.6);
  scene.add(hemi, key, key.target, rimL, rimL.target, warm);
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 32), rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.08), ball = blob(2);

  // floor of planks
  const planks = texture('t-wood', { repeat: [26, 22] }); textures.push(planks);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: C.floor, map: planks, roughness: 0.45, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.32, 5); floor.receiveShadow = true; scene.add(floor);
  // the podium: two tiers, a wooden top with a brass rim and a glowing green edge
  const top = texture('t-wood', { repeat: [3, 3] }); textures.push(top);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.65, 0.25, 96), [new THREE.MeshStandardMaterial({ color: C.podSide, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: C.podTop, map: top, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: C.podSide })]);
  pod.position.y = -1.09; pod.receiveShadow = true; pod.castShadow = true; scene.add(pod);
  const tier = new THREE.Mesh(new THREE.CylinderGeometry(3.95, 4.05, 0.14, 96), new THREE.MeshStandardMaterial({ color: C.tier, roughness: 0.6 }));
  tier.position.y = -1.26; tier.receiveShadow = true; scene.add(tier);
  const brass = new THREE.MeshStandardMaterial({ color: dark ? 0xd8a84a : 0x16a34a, metalness: dark ? 0.9 : 0.25, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.63, 0.035, 8, 160), brass); ring.rotation.x = Math.PI / 2; ring.position.y = -0.965; scene.add(ring);
  const led = new THREE.Mesh(new THREE.TorusGeometry(3.66, 0.014, 6, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.led).multiplyScalar(dark ? 2.2 : 1.4) }));
  led.rotation.x = Math.PI / 2; led.position.y = -1.0; scene.add(led);
  // footlights along the front edge of the tier
  const glow = new Batch();
  for (let k = -6; k <= 6; k++) {
    const a = Math.PI / 2 + k * 0.11, x = Math.cos(a) * 3.98, z = Math.sin(a) * 3.98;
    glow.add(ball, mtx([x, -1.17, z], [0, 0, 0], 0.045), new THREE.Color(C.foot).multiplyScalar(dark ? 2.4 : 1.2));
  }

  // velvet curtains with folds, tie-backs, a valance with gold trim
  const velvet = new THREE.MeshStandardMaterial({ color: C.curtain, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const curtain = (w, h, folds, x, z, gather = 0) => {
    const g = new THREE.PlaneGeometry(w, h, folds * 8, 24), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const u = P.getX(i) / w + 0.5, v = P.getY(i) / h + 0.5;
      // pulled towards a tie-back at 40 % height: the cloth narrows there
      const pinch = gather ? 1 - gather * Math.exp(-Math.pow((v - 0.4) / 0.25, 2)) : 1;
      P.setX(i, (u - 0.5) * w * pinch + (gather ? Math.sign(gather) * 0 : 0));
      P.setZ(i, Math.sin(u * folds * Math.PI * 2) * 0.16 * (0.6 + 0.4 * v));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, velvet); m.position.set(x, h / 2 - 1.32, z); m.receiveShadow = true; scene.add(m);
    return m;
  };
  curtain(16, 7.5, 18, 0, -4.2);
  curtain(2.4, 7.4, 4, -3.5, -3.5, 0.5);
  curtain(2.4, 7.4, 4, 3.5, -3.5, 0.5);
  const trim = new Batch();
  trim.add(rbox, mtx([0, 3.55, -3.3], [0, 0, 0], [12, 0.7, 0.3]), C.valance);
  for (let x = -6; x <= 6; x += 0.4) trim.add(ball, mtx([x, 3.16, -3.12], [0, 0, 0], [0.09, 0.12, 0.05]), C.trim);
  trim.add(box, mtx([0, 3.22, -3.13], [0, 0, 0], [12, 0.04, 0.04]), C.trim);

  // the sign: lit letters on a dark board, hung from two chains
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
    const g = c.getContext('2d');
    const [board, ink, edge, halo] = C.sign;
    g.fillStyle = board; g.fillRect(0, 0, 1024, 192);
    g.strokeStyle = edge; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 172);
    g.font = '800 96px Geist, Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (halo) { g.shadowColor = halo; g.shadowBlur = 24; }
    g.fillStyle = ink; g.fillText('FERNWORK ARCADE', 512, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(dark ? 1.4 : 1) }));
    sign.position.set(0, 1.78, -3.95); sign.scale.setScalar(0.6); scene.add(sign);
    for (const x of [-1.25, 1.25]) trim.add(box, mtx([x, 2.5, -3.95], [0, 0, 0], [0.025, 1.2, 0.025]), C.chain);
    const q = glowQuad(2.4, dark ? 0x4ade80 : 0xffffff, C.signGlow); q.position.set(0, 1.78, -3.9); q.scale.set(1.4, 0.5, 1); scene.add(q);
  }
  // string lights across the top in three swags
  for (let s = 0; s < 3; s++) {
    const x0 = -4.2 + s * 2.8, x1 = x0 + 2.8;
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = x0 + (x1 - x0) * t, y = 2.55 - Math.sin(t * Math.PI) * 0.35, z = -3.1;
      glow.add(ball, mtx([x, y - 0.05, z], [0, 0, 0], 0.035), new THREE.Color(C.lights[k % 4]).multiplyScalar(C.lightPow));
      if (k < 12) { const nx = x0 + (x1 - x0) * (t + 1 / 12), ny = 2.55 - Math.sin((t + 1 / 12) * Math.PI) * 0.35; trim.add(box, mtx([(x + nx) / 2, (y + ny) / 2, z], [0, 0, Math.atan2(ny - y, nx - x)], [Math.hypot(nx - x, ny - y), 0.012, 0.012]), 0x222222); }
    }
  }
  // spotlight beams from above (soft additive cones)
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex(), color: C.beam, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const [x, rz] of [[-4.5, -0.42], [0, 0], [4.5, 0.42]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1.5, 6.4, 24, 1, true), beamMat);
    cone.position.set(x * 0.6, 2.2, -3.0); cone.rotation.z = rz; scene.add(cone);
  }
  // the heroes of the three games wait at the sides of the stage, each in a small pool of light (a figure without a
  // model is drawn live by the caller, only its pool is baked)
  for (const f of figures) {
    if (f.model) scene.add(modelInstances(f.model, [mtx(f.pos, [0, f.rot, 0], f.scale)], { shadow: true }));
    const pool = glowQuad(1.4, 0xffd7a0, C.pool); pool.rotation.x = -Math.PI / 2; pool.position.set(f.pos[0], f.pos[1] + 0.01, f.pos[2]); scene.add(pool);
  }
  // ferns, the plant Fernwork is named after: big ones on the floor at the sides and against the curtains,
  // small ones at the foot of the podium
  // [x, y, z, scale, seed, tall]: a dense, tall hedge along the curtains, thick clumps on the floor at both sides of
  // the podium, smaller ones at its front corners
  const P = -0.965, F = -1.32;
  const FERNS = [[-3.3, P, -2.6, 1.35, 1, 1.3], [3.35, P, -2.55, 1.3, 2, 1.3], [-2.3, P, -3.0, 1.15, 9, 1.25], [2.35, P, -3.0, 1.15, 10, 1.25],
    [-1.2, P, -3.15, 0.95, 7, 1.2], [1.25, P, -3.15, 0.95, 8, 1.2], [0, P, -3.3, 0.8, 11, 1.1],
    [-4.6, F, -2.2, 1.8, 3, 1.35], [4.6, F, -2.3, 1.75, 4, 1.35], [-5.5, F, -0.9, 1.9, 12, 1.4], [5.5, F, -1.0, 1.85, 13, 1.4],
    [-4.9, F, 0.6, 1.5, 14, 1.2], [4.95, F, 0.55, 1.5, 15, 1.2], [-5.7, F, 1.9, 1.6, 16, 1.3], [5.7, F, 1.85, 1.6, 17, 1.3],
    [-3.7, F, 2.4, 1.0, 5, 1.1], [3.75, F, 2.35, 1.05, 6, 1.1], [-4.4, F, 3.1, 0.85, 18, 1], [4.45, F, 3.05, 0.85, 19, 1]];
  for (const [x, y, z, sc, seed, tall] of FERNS) scene.add(modelInstances(fernModel({ seed, fronds: 16, tall }), [mtx([x, y, z], [0, seed * 1.3, 0], sc)], { shadow: true }));
  scene.add(glow.mesh({ glow: true }));
  scene.add(Object.assign(trim.mesh({ roughness: 0.5, metalness: 0.4 }), { receiveShadow: true }));
  const motes = Array.from({ length: 40 }, () => ({ x: (rand() - 0.5) * 7, y: -0.8 + rand() * 5, z: -2 + rand() * 2.5, s: rand() }));
  return { scene, textures, motes };
}

let beam = null;
function beamTex() {
  if (beam) return beam;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 128); gy.addColorStop(0, 'rgba(0,0,0,0.9)'); gy.addColorStop(1, 'rgba(0,0,0,0.1)');
  g.fillStyle = gy; g.fillRect(0, 0, 64, 128);
  beam = new THREE.CanvasTexture(c);
  return beam;
}
