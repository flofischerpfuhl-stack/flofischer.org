/**
 * A figure from the baked cast (models.js) as one live group, with pivots for legs and arms, for the scenes that move
 * one hero at a time (overworld hop, Arcade idle) instead of a MergedCrowd.
 *
 * figure(model) → { root, body, legs: [{ pivot, side }], arms: [{ pivot, side }] }
 *   root: place and turn it; body: bob it; a leg swings on pivot.rotation.x, an arm lifts on pivot.rotation.z * side
 */
import { THREE, furPatch } from '../three-kit.js';

const MATS = {
  matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02 }),
  gloss: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.04 }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

export function figure(model) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // one pivot per limb channel; a limb can come in several material groups (sleeve, glove, lantern)
  const pivots = new Map();
  for (const g of model) {
    const m = MATS[g.mat]();
    if (g.geometry.attributes.aFur && g.mat !== 'glow') furPatch(m);
    const mesh = new THREE.Mesh(g.geometry, m);
    mesh.castShadow = g.mat !== 'glow';
    if (/^(leg|arm)[LR]$/.test(g.ch)) {
      if (!pivots.has(g.ch)) { const p = new THREE.Group(); p.position.set(...g.pivot); body.add(p); pivots.set(g.ch, { pivot: p, ch: g.ch, x: g.pivot[0] }); }
      mesh.position.set(-g.pivot[0], -g.pivot[1], -g.pivot[2]);
      pivots.get(g.ch).pivot.add(mesh);
    } else body.add(mesh);
  }
  const limbs = [...pivots.values()];
  return {
    root, body,
    legs: limbs.filter((l) => l.ch.startsWith('leg')).map((l) => ({ pivot: l.pivot, side: l.ch === 'legL' ? 1 : -1 })),
    // side: +1 for the arm on the +x side, so pivot.rotation.z = side * a lifts it outwards
    arms: limbs.filter((l) => l.ch.startsWith('arm')).map((l) => ({ pivot: l.pivot, side: l.x >= 0 ? 1 : -1, ch: l.ch })),
  };
}
