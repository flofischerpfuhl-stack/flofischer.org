/** Small cheap effects for the hub: cloud puffs, floating motes, spotlight discs, halos. Sprites and points only, no post pass. */
import { glowTexture, makeCanvas } from './hub-art.js';

/** The tint of each of Pip's forms (and the Fernwork green for the base form). */
export const FORM_COLORS = {
  PIP_KESSEL: '#2fd16a', PIP_FIRE_THROW: '#ff7a1a', PIP_BUBBLE_FLOAT: '#33d4f0', PIP_VINE_HOOK: '#4fc23a',
  PIP_STONE_STOMPER: '#a3a9b3', PIP_GALE_GLIDER: '#f5f9ff', PIP_SPARK_LEAP: '#ffd21f', PIP_FROST_BRIDGE: '#9fd6ff',
};

let glowCache = null;
export function softTexture(THREE, own) {
  if (!glowCache || glowCache.t !== own) { const t = own.tex(new THREE.CanvasTexture(glowTexture())); t.colorSpace = THREE.SRGBColorSpace; glowCache = { t: own, tex: t }; }
  return glowCache.tex;
}

/** Soft cloud puffs plus a few sparkles; a fixed pool of sprites. */
export function createPuffs({ THREE, own, scene }) {
  const map = softTexture(THREE, own), items = [];
  for (let i = 0; i < 30; i++) {
    const spark = i >= 16;
    const mat = own.mat(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, blending: spark ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0 }));
    const sprite = new THREE.Sprite(mat); sprite.visible = false; sprite.renderOrder = 6; scene.add(sprite);
    items.push({ sprite, mat, spark, life: 0, age: 0, vel: new THREE.Vector3(), size: 1 });
  }
  const tint = new THREE.Color();
  return {
    burst(position, color) {
      tint.set(color);
      for (const p of items) {
        const a = Math.random() * Math.PI * 2, up = (Math.random() - .35), sp = (p.spark ? 1.6 : .9) * (.6 + Math.random() * .8);
        p.vel.set(Math.cos(a) * sp, up * sp * (p.spark ? 1.4 : .8), Math.sin(a) * sp);
        p.sprite.position.copy(position).addScaledVector(p.vel, .06); p.size = p.spark ? .22 + Math.random() * .2 : .55 + Math.random() * .4;
        p.life = p.spark ? .7 + Math.random() * .3 : .55 + Math.random() * .25; p.age = 0;
        p.mat.color.copy(tint); if (!p.spark) p.mat.color.lerp(new THREE.Color('#ffffff'), .35);
        p.sprite.visible = true;
      }
    },
    update(dt) {
      for (const p of items) {
        if (!p.sprite.visible) continue;
        p.age += dt; const t = p.age / p.life;
        if (t >= 1) { p.sprite.visible = false; continue; }
        p.sprite.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(1 - Math.min(1, dt * 2.2));
        const grow = p.spark ? 1 - t * .5 : .55 + t * 1.1;
        p.sprite.scale.setScalar(p.size * grow * (p.spark ? 1 : 1.7));
        p.mat.opacity = (p.spark ? 1 : .8) * (1 - t) * Math.min(1, t * 8);
      }
    },
  };
}

/** Floating motes: warm sun sparkles in light mode, green-gold fireflies in dark mode. */
export function createMotes({ THREE, own, count = 80, box = { x: [-9, 9], y: [.4, 6.2], z: [-6.5, 7] } }) {
  const geo = own.geo(new THREE.BufferGeometry()), pos = new Float32Array(count * 3), col = new Float32Array(count * 3), base = new Float32Array(count * 3), seed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    base[i * 3] = box.x[0] + Math.random() * (box.x[1] - box.x[0]); base[i * 3 + 1] = box.y[0] + Math.random() * (box.y[1] - box.y[0]); base[i * 3 + 2] = box.z[0] + Math.random() * (box.z[1] - box.z[0]);
    seed[i * 3] = Math.random() * 6.28; seed[i * 3 + 1] = .4 + Math.random() * .8; seed[i * 3 + 2] = Math.random() * 6.28;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = own.mat(new THREE.PointsMaterial({ map: softTexture(THREE, own), size: .14, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, toneMapped: false }));
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 5;
  const tint = new THREE.Color('#ffe9a8'); let dark = false;
  return {
    points,
    setDark(d) { dark = d; tint.set(d ? '#b6ff6a' : '#fff0b8'); mat.size = d ? .22 : .15; },
    update(t, still = false) {
      for (let i = 0; i < count; i++) {
        const s = seed[i * 3], sp = seed[i * 3 + 1], ph = seed[i * 3 + 2], k = still ? 0 : 1;
        pos[i * 3] = base[i * 3] + Math.sin(t * .23 * sp + s) * .7 * k; pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * .4 * sp + ph) * .35 * k + (dark ? 0 : Math.sin(t * .1 + s) * .2 * k); pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * .19 * sp + s) * .6 * k;
        const tw = dark ? .25 + .75 * Math.pow(.5 + .5 * Math.sin(t * (1.1 + sp) + ph), 2) : .35 + .65 * Math.pow(.5 + .5 * Math.sin(t * (1.6 + sp) + ph), 6);
        col[i * 3] = tint.r * tw; col[i * 3 + 1] = tint.g * tw; col[i * 3 + 2] = tint.b * tw;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}

/** A soft additive disc on the floor (spotlight pool); `scale` is the diameter. */
export function createDisc({ THREE, own, diameter = 2.6 }) {
  const mat = own.mat(new THREE.MeshBasicMaterial({ map: softTexture(THREE, own), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: .5 }));
  const geo = own.geo(new THREE.PlaneGeometry(1, 1)); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.set(diameter, 1, diameter); mesh.renderOrder = 2;
  return mesh;
}

/** A camera-facing halo (cheap bloom stand-in). */
export function createHalo({ THREE, own, color = '#ffd9a0', size = 1.2, opacity = .6 }) {
  const mat = own.mat(new THREE.SpriteMaterial({ map: softTexture(THREE, own), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity }));
  const s = new THREE.Sprite(mat); s.scale.setScalar(size); s.renderOrder = 4; return s;
}

/** Glossy glass streak texture for the cabinet screens (a diagonal soft band on transparent). */
export function glassTexture() {
  const [canvas, g] = makeCanvas(256, 128);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(.38, 'rgba(255,255,255,0)'); grad.addColorStop(.5, 'rgba(255,255,255,.55)'); grad.addColorStop(.62, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.translate(128, 64); g.rotate(.45); g.translate(-200, -160); g.fillStyle = grad; g.fillRect(0, 0, 400, 320); g.restore();
  const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(255,255,255,.22)'); v.addColorStop(.35, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(0, 0, 256, 128);
  return canvas;
}
