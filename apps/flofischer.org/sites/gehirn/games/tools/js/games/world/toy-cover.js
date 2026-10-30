/**
 * A dust sheet thrown over a locked play set on the playroom floor (Bounce Brigade's counterpart of the cloud bank, same controller):
 * a lumpy cloth with scalloped folds that lifts off, turns and fades when the set is unlocked. One mesh, vertex colours.
 */
import { THREE as T } from '../three-kit.js';
import { rng, createNoise, smoothstep } from './decor.js';
import { coverController, shadowTex } from './cloud-bank.js';

const RINGS = 12, SEGMENTS = 44;

/** The cloth: a polar grid whose height is a few soft humps (the toys underneath) and whose hem is a scalloped circle lying on the floor. */
function sheetGeometry(seed) {
  const rand = rng(seed * 17 + 3), noise = createNoise(seed + 9), humps = Array.from({ length: 4 }, (_, i) => ({ a: rand() * 6.28, d: i ? 0.35 + rand() * 0.3 : 0, w: 0.3 + rand() * 0.18, h: i ? 0.35 + rand() * 0.35 : 0.7 }));
  const folds = 7 + Math.floor(rand() * 3), phase = rand() * 6, pos = [], col = [], idx = [], cloth = new T.Color('#fffaf0'), shade = new T.Color('#8f9dbb'), dust = new T.Color('#e6dcc4'), tmp = new T.Color();
  for (let r = 0; r <= RINGS; r++) {
    const rho = r / RINGS;
    for (let s = 0; s <= SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2, hem = 1 + 0.06 * Math.sin(a * folds + phase) + 0.03 * Math.sin(a * 3 + phase * 2);
      let h = 0;
      for (const hump of humps) { const dx = rho * Math.cos(a) - hump.d * Math.cos(hump.a), dz = rho * Math.sin(a) - hump.d * Math.sin(hump.a); h += hump.h * Math.exp(-(dx * dx + dz * dz) / (hump.w * hump.w)); }
      const edge = smoothstep(1, 0.6, rho), fold = 1 + 0.16 * Math.sin(a * folds + phase) * smoothstep(0.2, 1, rho);
      const y = Math.min(1.1, h) * edge * fold * 0.78 + 0.02 + 0.03 * noise.fbm2(Math.cos(a) * rho * 4, Math.sin(a) * rho * 4, 2);
      pos.push(Math.cos(a) * rho * hem, y, Math.sin(a) * rho * hem);
      tmp.copy(cloth).lerp(shade, 0.5 * (0.5 + 0.5 * Math.sin(a * folds + phase)) * smoothstep(0.2, 1, rho)).lerp(dust, 0.25 * smoothstep(0.7, 1, rho) + 0.12 * noise.fbm2(rho * 5, a, 2));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEGMENTS; s++) { const a = r * (SEGMENTS + 1) + s, b = a + 1, c = a + SEGMENTS + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** radius: set radius in metres; the sheet covers about 0.78 of it. level: height of the floor the set stands on, shadowY: where its shadow lies. */
export function createToyCover({ radius = 30, seed = 1, level = 0, shadowY = 0.4 } = {}) {
  const group = new T.Group(); group.name = 'DustSheet';
  const geometry = sheetGeometry(seed), material = new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: true, side: T.DoubleSide });
  const mesh = new T.Mesh(geometry, material); mesh.renderOrder = 3; mesh.frustumCulled = false; group.add(mesh);
  const shadowMaterial = new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMaterial); shadow.position.y = shadowY; shadow.renderOrder = -1; shadow.frustumCulled = false; group.add(shadow);
  const size = radius * 0.8, height = radius * 0.62;
  function layout(time, { open, fade, cover }) {
    const k = 1 - 0.35 * open, grow = 0.6 + 0.4 * Math.min(1, cover * 1.4);
    material.opacity = Math.max(0, Math.min(1, cover)) * fade; shadowMaterial.opacity = material.opacity * 0.85;
    mesh.position.set(0, level + open * radius * 0.9 + Math.sin(time * 0.7 + seed) * radius * 0.006, 0);
    mesh.rotation.set(open * 0.35, open * 1.1 + seed, open * -0.3);
    mesh.scale.set(size * k * grow, height * grow, size * k * grow);
    shadow.scale.setScalar(radius * (1.9 + open * 0.8));
  }
  return Object.assign(coverController(group, layout), { mesh, dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); shadow.geometry.dispose(); shadowMaterial.dispose(); } });
}
