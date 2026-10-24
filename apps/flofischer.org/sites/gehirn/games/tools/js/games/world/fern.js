/**
 * A procedural 3D fern, the plant Fernwork is named after: fronds that rise and arch outwards, two rows of leaflets
 * (pinnae) that shrink towards the tip, dark green at the heart and fresh green at the tips, and one or two young
 * fronds still rolled up as fiddleheads. One vertex-coloured mesh, both sides of every leaflet lit.
 *
 * fernModel({ seed, fronds, size, tall }) → [{ ch: 'body', mat: 'matte', pivot, geometry }] (the baked-model format, so
 * modelInstances(), Roadside and the island props can place it like any sculpt)
 */
import { THREE } from '../three-kit.js';

const cache = new Map();

export function fernModel({ seed = 1, fronds = 9, size = 1, tall = 1 } = {}) {
  const key = `${seed}:${fronds}:${size}:${tall}`;
  if (cache.has(key)) return cache.get(key);
  let s = seed * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const P = [], N = [], C = [];
  const dark = new THREE.Color(0x24561f), mid = new THREE.Color(0x3f8a2e), light = new THREE.Color(0x8fd06a), stem = new THREE.Color(0x4a6a22);
  const tri = (a, b, c, ca, cb, cc) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    // front and back face, so the leaflets are lit from both sides with any material
    for (const [p, q, w, k] of [[a, b, c, 1], [a, c, b, -1]]) {
      P.push(p.x, p.y, p.z, q.x, q.y, q.z, w.x, w.y, w.z);
      for (let i = 0; i < 3; i++) N.push(n.x * k * 0.6, n.y * k * 0.6 + 0.4, n.z * k * 0.6);
      const cs = k > 0 ? [ca, cb, cc] : [ca, cc, cb];
      for (const col of cs) C.push(col.r, col.g, col.b);
    }
  };
  const frond = (az, len, rise, droop, curl = 0) => {
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const SEG = 18;
    // the rachis: up and out, then arching down towards the tip
    const pt = (t) => {
      const out = len * t, up = len * (rise * t - droop * t * t);
      return new THREE.Vector3(dir.x * out, up, dir.z * out);
    };
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 1; i < SEG; i++) {
      const t = i / SEG, p = pt(t), p2 = pt(Math.min(1, t + 1 / SEG));
      const fwd = new THREE.Vector3().subVectors(p2, p).normalize();
      // leaflets: longest a third of the way up, tapering to nothing at the tip
      const L = len * 0.22 * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - t * 0.35);
      const W = L * 0.32;
      const tone = mid.clone().lerp(light, t * 0.85).lerp(dark, (1 - t) * 0.45);
      const tipTone = tone.clone().lerp(light, 0.35);
      for (const sd of [-1, 1]) {
        // leaflets angle forward and droop a little; each is a slim, slightly folded diamond
        const out = side.clone().multiplyScalar(sd).add(fwd.clone().multiplyScalar(0.55)).normalize();
        const tip = p.clone().addScaledVector(out, L).add(new THREE.Vector3(0, -L * 0.18, 0));
        const mid1 = p.clone().addScaledVector(out, L * 0.45).addScaledVector(fwd, W).add(new THREE.Vector3(0, W * 0.35, 0));
        const mid2 = p.clone().addScaledVector(out, L * 0.45).addScaledVector(fwd, -W * 0.8).add(new THREE.Vector3(0, W * 0.2, 0));
        tri(p, mid1, tip, tone, tone, tipTone);
        tri(p, tip, mid2, tone, tipTone, tone);
      }
      // the stalk itself, a thin ribbon
      const a = p.clone().addScaledVector(side, 0.008), b = p.clone().addScaledVector(side, -0.008), c = p2.clone().addScaledVector(side, -0.006), d = p2.clone().addScaledVector(side, 0.006);
      tri(a, b, c, stem, stem, stem); tri(a, c, d, stem, stem, stem);
    }
    if (curl) {
      // a fiddlehead: a short stalk ending in a coil
      const base = new THREE.Vector3(dir.x * 0.05, 0, dir.z * 0.05);
      let prev = base.clone();
      for (let i = 1; i <= 26; i++) {
        const t = i / 26, ang = t * Math.PI * 2.6, rad = curl * (1 - t * 0.8);
        const q = new THREE.Vector3(dir.x * (0.05 + Math.sin(ang) * rad), curl * 2.2 * Math.min(1, t * 2.2) + (1 - Math.cos(ang)) * rad * 0.5, dir.z * (0.05 + Math.sin(ang) * rad));
        const w = 0.022 * (1 - t * 0.6);
        const col = mid.clone().lerp(light, t);
        tri(prev.clone().addScaledVector(side, w), prev.clone().addScaledVector(side, -w), q.clone().addScaledVector(side, -w), col, col, col);
        tri(prev.clone().addScaledVector(side, w), q.clone().addScaledVector(side, -w), q.clone().addScaledVector(side, w), col, col, col);
        prev = q;
      }
    }
  };
  // two rings: wide arching fronds outside, longer, steeper ones in the heart (tall > 1 makes the heart taller)
  for (let k = 0; k < fronds; k++) {
    const inner = k % 3 === 2, az = (k / fronds) * Math.PI * 2 + (r() - 0.5) * 0.5;
    if (inner) frond(az, (0.95 + r() * 0.3) * size * tall, 1.5 + r() * 0.35, 1.05 + r() * 0.3);
    else frond(az, (0.75 + r() * 0.35) * size * (0.6 + tall * 0.4), 1.15 + r() * 0.5, 0.95 + r() * 0.5);
  }
  frond(r() * 6.28, 0, 0, 0, 0.07 * size);
  frond(r() * 6.28, 0, 0, 0, 0.055 * size);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  // linear colours (THREE.Color values are linear already)
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geometry.computeBoundingSphere();
  const model = [{ ch: 'body', mat: 'matte', pivot: [0, 0, 0], armBase: 0, geometry }];
  cache.set(key, model);
  return model;
}
