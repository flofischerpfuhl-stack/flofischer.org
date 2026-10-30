/**
 * A Wind Waker style cloud bank that hides one island (the overworld uses it for locked regions, and as a short veil while a region swaps in).
 * `cover` 1 = closed bank, 0 = gone; `part()` plays the opening once: the puffs drift outward and up, shrink and fade. One instanced mesh.
 */
import { THREE as T } from '../three-kit.js';
import { Batch, mtx, rng, smoothstep } from './decor.js';
import { SEA_Y } from './sea.js';

const ease = (k) => k * k * (3 - 2 * k);
const LIGHT = new T.Vector3(-0.35, 0.8, 0.5).normalize(), LUMPS = [[0, 0.5, 0, 1], [-1, 0.32, 0.1, 0.76], [1, 0.34, -0.1, 0.72], [0.35, 0.95, 0.15, 0.7], [-0.4, 0.88, -0.2, 0.6], [0.05, 0.3, 0.55, 0.62]];

/** One round Wind Waker puff: a cluster of smooth lumps, lit from the upper left in its vertex colours (white top, soft blue-grey underside). */
export function puffGeometry(seed = 1, scale = [1, 1, 1]) {
  const r = rng(seed * 31 + 7), b = new Batch(), ball = new T.IcosahedronGeometry(1, 1), shade = new T.Color('#aebfe0'), lit = new T.Color('#ffffff');
  for (const [x, y, z, s] of LUMPS) {
    const k = s * (0.9 + r() * 0.2);
    b.add(ball, mtx([x * scale[0], y * scale[1], z * scale[2]], [0, 0, 0], [k * 1.05 * scale[0], k * 0.82 * scale[1], k * scale[2]]), 0xffffff, (i, vx, vy, vz, nx, ny, nz, c) => {
      const d = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z, t = smoothstep(-0.25, 0.65, d) * (0.55 + 0.45 * smoothstep(0, 0.7, vy));
      c.copy(shade).lerp(lit, t);
    });
  }
  return b.geometry();
}

let shadowTexture = null;
function shadowTex() {
  if (shadowTexture) return shadowTexture;
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2), a = 1 - smoothstep(0.35, 1, d), k = (j * n + i) * 4;
    data.set([14, 54, 122, Math.round(a * 140)], k);
  }
  shadowTexture = new T.DataTexture(data, n, n, T.RGBAFormat); shadowTexture.minFilter = shadowTexture.magFilter = T.LinearFilter; shadowTexture.needsUpdate = true; return shadowTexture;
}

/** radius: island radius in scene metres. The bank covers the island and rises about half a radius above the sea. */
export function createCloudBank({ radius = 20, seed = 1, puffs = 16, baseY = 0 } = {}) {
  const rand = rng(seed * 97 + 13), group = new T.Group(); group.name = 'CloudBank';
  const geometry = puffGeometry(seed);
  const material = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true, depthWrite: false });
  const mesh = new T.InstancedMesh(geometry, material, puffs); mesh.frustumCulled = false; mesh.renderOrder = 3; group.add(mesh);
  const shadowMaterial = new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMaterial); shadow.position.y = SEA_Y + 0.25 - baseY; shadow.renderOrder = -1; shadow.frustumCulled = false; group.add(shadow);
  const items = [];
  for (let i = 0; i < puffs; i++) {
    const ring = i < 3 ? 0.12 : i < 10 ? 0.5 : 0.82, a = (i / puffs) * 6.2832 * 2.3 + rand() * 0.8;
    const s = radius * (ring < 0.6 ? 0.4 : 0.34) * (0.8 + rand() * 0.4);
    items.push({ a, ring: ring * (0.85 + rand() * 0.3), s, y: baseY + radius * (0.1 + (i < 10 ? 0.24 : 0.08) * rand()), yaw: rand() * 3, drift: 0.7 + rand() * 0.6, bob: rand() * 6.28 });
  }
  const dummy = new T.Object3D();
  let progress = 0, parting = false, partStart = 0, onDone = null, cover = 1, dirty = true, duration = 2300, formStart = -2, formMs = 0;
  function layout(time) {
    const open = ease(Math.min(1, progress)), fade = 1 - smoothstep(0.5, 1, progress);
    material.opacity = Math.max(0, Math.min(1, cover)) * fade; shadowMaterial.opacity = material.opacity * 0.9; shadow.scale.setScalar(radius * (2.5 + open * 2));
    for (let i = 0; i < puffs; i++) {
      const it = items[i], r = radius * it.ring * (1 + open * 1.5 * it.drift), bob = Math.sin(time * 0.6 + it.bob) * radius * 0.015;
      const grow = 0.55 + 0.45 * Math.min(1, cover * 1.4);
      dummy.position.set(Math.cos(it.a) * r, it.y + open * radius * 0.45 * it.drift + bob, Math.sin(it.a) * r);
      dummy.rotation.set(0, it.yaw, 0);
      const k = grow * (1 - 0.5 * open);
      dummy.scale.set(it.s * 1.25 * k, it.s * k, it.s * 1.1 * k);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; dirty = false;
  }
  layout(0);
  return {
    group, mesh,
    get covered() { return cover > 0 && progress < 1; },
    get parting() { return parting; },
    setCover(value) { formStart = -2; cover = value; if (value > 0) { progress = 0; parting = false; } group.visible = value > 0; dirty = true; },
    /** Opens the bank; onDone runs once when the island is clear. A cut (reduced motion) passes duration 0. */
    part(done = null, ms = 2300) {
      duration = ms; onDone = done;
      if (!ms) { progress = 1; cover = 0; parting = false; group.visible = false; onDone?.(); onDone = null; return; }
      parting = true; partStart = -1; group.visible = true;
    },
    /** Closes the bank again over `ms` (a veil while a region swaps in behind it). */
    form(ms = 350) { parting = false; progress = 0; onDone = null; formMs = ms; formStart = -1; cover = 0.001; group.visible = true; dirty = true; },
    update(time) {
      if (formStart !== -2) {
        if (formStart === -1) formStart = time;
        cover = formMs ? Math.max(0.001, Math.min(1, (time - formStart) * 1000 / formMs)) : 1;
        if (cover >= 1) formStart = -2;
        layout(time);
      } else if (parting) {
        if (partStart < 0) partStart = time;
        progress = Math.min(1, (time - partStart) * 1000 / duration);
        if (progress >= 1) { parting = false; cover = 0; group.visible = false; onDone?.(); onDone = null; }
        layout(time);
      } else if (group.visible && cover > 0) layout(time);
      else if (dirty) layout(time);
    },
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); shadow.geometry.dispose(); shadowMaterial.dispose(); },
  };
}

/** Slow ambient clouds in the sky band of the world view. `place` keeps them on screen: (camera, half height, aspect, time, visibility 0..1, lowest sky edge as fraction of half height). */
export function createSkyClouds({ count = 8, seed = 5 } = {}) {
  const r = rng(seed), group = new T.Group(); group.name = 'SkyClouds';
  const geometry = puffGeometry(seed + 2), material = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new T.InstancedMesh(geometry, material, count); mesh.frustumCulled = false; mesh.renderOrder = -1; group.add(mesh);
  const items = Array.from({ length: count }, (_, i) => ({ x: (i + r() * 0.8) / count, y: r(), s: 0.045 + r() * 0.05, v: 0.004 + r() * 0.006 }));
  const dummy = new T.Object3D(), right = new T.Vector3(), up = new T.Vector3(), fwd = new T.Vector3();
  return {
    group,
    place(camera, h, aspect, time, show, low) {
      group.visible = show > 0.01; if (!group.visible) return;
      material.opacity = show; camera.matrixWorld.extractBasis(right, up, fwd);
      for (let i = 0; i < count; i++) {
        const it = items[i], u = ((it.x + time * it.v) % 1 + 1) % 1, y = low + (1 - low) * (0.12 + 0.8 * it.y);
        dummy.position.copy(camera.position).addScaledVector(right, (u * 2.5 - 1.25) * h * aspect).addScaledVector(up, y * h).addScaledVector(fwd, -120);
        dummy.scale.set(it.s * h * 1.7, it.s * h * 0.8, it.s * h * 0.8); dummy.rotation.set(0, 0.4, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); },
  };
}
