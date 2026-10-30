/**
 * A Wind Waker style cloud bank that hides one island (the overworld uses it for locked regions, and as a short veil while a region swaps in).
 * `cover` 1 = closed bank, 0 = gone; `part()` plays the opening once: the puffs drift outward and up, shrink and fade. One instanced mesh.
 */
import { THREE as T } from '../three-kit.js';
import { cloud, rng, smoothstep } from './decor.js';

const ease = (k) => k * k * (3 - 2 * k);

/** radius: island radius in scene metres. The bank covers the island and rises about half a radius above the sea. */
export function createCloudBank({ radius = 20, seed = 1, puffs = 22, baseY = 0 } = {}) {
  const rand = rng(seed * 97 + 13), group = new T.Group(); group.name = 'CloudBank';
  const geometry = cloud(rng(seed + 5), 7, [0.74, 0.8, 0.92]);
  const material = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true, depthWrite: false });
  const mesh = new T.InstancedMesh(geometry, material, puffs); mesh.frustumCulled = false; mesh.renderOrder = 3; group.add(mesh);
  const items = [];
  for (let i = 0; i < puffs; i++) {
    const ring = i < 3 ? 0.12 : i < 10 ? 0.5 : 0.82, a = (i / puffs) * 6.2832 * 2.3 + rand() * 0.8;
    const s = radius * (ring < 0.6 ? 0.36 : 0.3) * (0.8 + rand() * 0.4);
    items.push({ a, ring: ring * (0.85 + rand() * 0.3), s, y: baseY + radius * (0.1 + (i < 10 ? 0.28 : 0.1) * rand()), yaw: rand() * 3, drift: 0.7 + rand() * 0.6, bob: rand() * 6.28 });
  }
  const dummy = new T.Object3D();
  let progress = 0, parting = false, partStart = 0, onDone = null, cover = 1, dirty = true, duration = 2300, formStart = -2, formMs = 0;
  function layout(time) {
    const open = ease(Math.min(1, progress)), fade = 1 - smoothstep(0.5, 1, progress);
    material.opacity = Math.max(0, Math.min(1, cover)) * fade;
    for (let i = 0; i < puffs; i++) {
      const it = items[i], r = radius * it.ring * (1 + open * 1.5 * it.drift), bob = Math.sin(time * 0.6 + it.bob) * radius * 0.015;
      const grow = 0.55 + 0.45 * Math.min(1, cover * 1.4);
      dummy.position.set(Math.cos(it.a) * r, it.y + open * radius * 0.45 * it.drift + bob, Math.sin(it.a) * r);
      dummy.rotation.set(0, it.yaw, 0);
      const k = grow * (1 - 0.5 * open);
      dummy.scale.set(it.s * 1.8 * k, it.s * 0.75 * k, it.s * k);
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
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); },
  };
}
