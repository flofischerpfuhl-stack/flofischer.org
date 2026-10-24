/**
 * The Arcade hub's stage, baked once per screen size (decor.js Baker): a wooden podium with a brass rim and a glowing
 * green edge, a floor of planks, velvet curtains with folds, tie-backs and a gold-trimmed valance, a lit
 * "FERNWORK ARCADE" sign, string lights, three spotlight beams, potted ferns and glowing Fernstones on pedestals,
 * footlights. Only the game boxes, their shadows and a few drifting motes are drawn live.
 *
 * buildStage() → { scene, textures, motes: [{ x, y, z }] }
 */
import { THREE, texture } from '../three-kit.js';
import { RoundedBoxGeometry } from '../../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { Batch, mtx, blob, glowQuad, modelInstances, rng } from './decor.js';
import { PROPS } from './tower-scenery.js';

export function buildStage({ env = null } = {}) {
  const scene = new THREE.Scene(), rand = rng(42), textures = [];
  scene.environment = env;
  scene.background = new THREE.Color(0x0b0d14);
  scene.fog = new THREE.Fog(0x0b0d14, 9, 22);
  const hemi = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.55);
  const key = new THREE.SpotLight(0xffe2b8, 160, 22, 0.5, 0.6, 2); key.position.set(-2.5, 7, 6); key.target.position.set(0, -0.6, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004;
  const rimL = new THREE.SpotLight(0x8fd0ff, 60, 18, 0.45, 0.7, 2); rimL.position.set(5, 6, -2); rimL.target.position.set(0, -1, 0);
  const warm = new THREE.PointLight(0xffb060, 6, 9, 2); warm.position.set(0, 2.6, -2.6);
  scene.add(hemi, key, key.target, rimL, rimL.target, warm);
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 32), rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.08), ball = blob(2);

  // floor of planks
  const planks = texture('t-wood', { repeat: [26, 12] }); textures.push(planks);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshStandardMaterial({ color: 0x4a3226, map: planks, roughness: 0.45, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.32, -2); floor.receiveShadow = true; scene.add(floor);
  // the podium: two tiers, a wooden top with a brass rim and a glowing green edge
  const top = texture('t-wood', { repeat: [3, 3] }); textures.push(top);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.65, 0.25, 96), [new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0xc89a6a, map: top, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0x3a2a22 })]);
  pod.position.y = -1.09; pod.receiveShadow = true; pod.castShadow = true; scene.add(pod);
  const tier = new THREE.Mesh(new THREE.CylinderGeometry(3.95, 4.05, 0.14, 96), new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.6 }));
  tier.position.y = -1.26; tier.receiveShadow = true; scene.add(tier);
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 0.9, roughness: 0.28 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.63, 0.035, 8, 160), brass); ring.rotation.x = Math.PI / 2; ring.position.y = -0.965; scene.add(ring);
  const led = new THREE.Mesh(new THREE.TorusGeometry(3.66, 0.014, 6, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fae6c).multiplyScalar(2.2) }));
  led.rotation.x = Math.PI / 2; led.position.y = -1.0; scene.add(led);
  // footlights along the front edge of the tier
  const glow = new Batch();
  for (let k = -6; k <= 6; k++) {
    const a = Math.PI / 2 + k * 0.11, x = Math.cos(a) * 3.98, z = Math.sin(a) * 3.98;
    glow.add(ball, mtx([x, -1.17, z], [0, 0, 0], 0.045), new THREE.Color(0xffd890).multiplyScalar(2.4));
  }

  // velvet curtains with folds, tie-backs, a valance with gold trim
  const velvet = new THREE.MeshStandardMaterial({ color: 0x15462c, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
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
  trim.add(rbox, mtx([0, 3.55, -3.3], [0, 0, 0], [12, 0.7, 0.3]), 0x123d26);
  for (let x = -6; x <= 6; x += 0.4) trim.add(ball, mtx([x, 3.16, -3.12], [0, 0, 0], [0.09, 0.12, 0.05]), 0xd8a84a);
  trim.add(box, mtx([0, 3.22, -3.13], [0, 0, 0], [12, 0.04, 0.04]), 0xd8a84a);
  for (const x of [-3.2, 3.2]) trim.add(cyl, mtx([x, 0.6, -3.3], [Math.PI / 2, 0, 0], [0.12, 0.45, 0.12]), 0xd8a84a);

  // the sign: lit letters on a dark board, hung from two chains
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1410'; g.fillRect(0, 0, 1024, 192);
    g.strokeStyle = '#d8a84a'; g.lineWidth = 8; g.strokeRect(10, 10, 1004, 172);
    g.font = '900 104px Geist, Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ffd27a'; g.shadowBlur = 28; g.fillStyle = '#ffe9b0'; g.fillText('FERNWORK ARCADE', 512, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.5, 1.5, 1.5) }));
    sign.position.set(0, 1.78, -3.95); sign.scale.setScalar(0.6); scene.add(sign);
    for (const x of [-1.25, 1.25]) trim.add(box, mtx([x, 2.5, -3.95], [0, 0, 0], [0.025, 1.2, 0.025]), 0x6a6a70);
    const q = glowQuad(2.4, 0xffc060, 0.45); q.position.set(0, 1.78, -3.9); q.scale.set(1.4, 0.5, 1); scene.add(q);
  }
  // string lights across the top in three swags
  for (let s = 0; s < 3; s++) {
    const x0 = -4.2 + s * 2.8, x1 = x0 + 2.8;
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = x0 + (x1 - x0) * t, y = 2.55 - Math.sin(t * Math.PI) * 0.35, z = -3.1;
      glow.add(ball, mtx([x, y - 0.05, z], [0, 0, 0], 0.035), new THREE.Color([0xffd27a, 0x8ff0c8, 0xff9ab8, 0x9ac8ff][k % 4]).multiplyScalar(2.2));
      if (k < 12) { const nx = x0 + (x1 - x0) * (t + 1 / 12), ny = 2.55 - Math.sin((t + 1 / 12) * Math.PI) * 0.35; trim.add(box, mtx([(x + nx) / 2, (y + ny) / 2, z], [0, 0, Math.atan2(ny - y, nx - x)], [Math.hypot(nx - x, ny - y), 0.012, 0.012]), 0x222222); }
    }
  }
  // spotlight beams from above (soft additive cones)
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex(), color: 0x1c1812, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const [x, rz] of [[-4.5, -0.42], [0, 0], [4.5, 0.42]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1.5, 6.4, 24, 1, true), beamMat);
    cone.position.set(x * 0.6, 2.2, -3.0); cone.rotation.z = rz; scene.add(cone);
  }
  // potted ferns and Fernstones on pedestals at both sides
  const pot = new Batch();
  for (const side of [-1, 1]) {
    const x = side * 2.45, z = -2.5;
    pot.add(cyl, mtx([x, -0.95, z], [0, 0, 0], [0.38, 0.6, 0.38]), 0xb4532a);
    pot.add(cyl, mtx([x, -0.64, z], [0, 0, 0], [0.42, 0.08, 0.42]), 0xc8683a);
    const px = side * 3.1, pz = -2.9;
    pot.add(rbox, mtx([px, -0.55, pz], [0, 0, 0], [0.7, 1.5, 0.7]), 0x2a2420);
    pot.add(rbox, mtx([px, 0.24, pz], [0, 0, 0], [0.82, 0.1, 0.82]), 0xd8a84a);
  }
  scene.add(Object.assign(pot.mesh({ roughness: 0.6, side: THREE.DoubleSide }), { castShadow: true, receiveShadow: true }));
  if (PROPS.BUSH) scene.add(modelInstances(PROPS.BUSH, [-1, 1].map((side) => mtx([side * 2.45, -0.66, -2.5], [0, side * 2, 0], 1.5))));
  if (PROPS.FERNSTONE) scene.add(modelInstances(PROPS.FERNSTONE, [-1, 1].map((side) => mtx([side * 3.1, 0.3, -2.9], [0, side, 0], 0.9))));
  for (const side of [-1, 1]) { const q = glowQuad(1.1, 0x5ff0c8, 0.6); q.position.set(side * 3.1, 0.75, -2.8); scene.add(q); }
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
