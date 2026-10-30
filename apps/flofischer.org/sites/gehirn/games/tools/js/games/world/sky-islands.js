/**
 * Fernling-Arena's land: the arenas hang close together in the sky at different heights. Each slab gets a real rock keel under it (strata
 * from earth to purple stone, a crystal cluster at the tip) and a few rocks drifting around, so every arena reads as a piece of
 * floating land and the whole group as one archipelago in the air above the cloud sea. Bridges between them come from joins.js.
 */
import { THREE as T } from '../three-kit.js';
import { mtx, rng, createNoise, smoothstep, Batch } from './decor.js';
import { BIOMES } from './island-terrain.js';

const RINGS = 12, SEGMENTS = 40, hex = (s) => new T.Color(s);

export function keel({ hx, hz, depth, seed, earth, rock }) {
  const noise = createNoise(seed + 3), rand = rng(seed * 7 + 1), pos = [], col = [], idx = [], c = new T.Color();
  const bandA = hex(earth), bandB = hex(rock), deep = hex('#5b4a7e'), lip = hex('#8d6b49');
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS, k = Math.pow(1 - t, 0.82) * (0.985 - 0.04 * smoothstep(0, 0.1, t));
    for (let s = 0; s <= SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), e = 2 / 3.2, rx = Math.sign(ca) * Math.pow(Math.abs(ca), e), rz = Math.sign(sa) * Math.pow(Math.abs(sa), e);
      const wob = 1 + 0.16 * noise.fbm2(Math.cos(a) * 1.6 + t * 3, Math.sin(a) * 1.6 + t * 2.4, 3) * smoothstep(0.05, 0.3, t), taper = k * wob;
      pos.push(rx * hx * taper, -t * depth * (1 + 0.18 * noise.fbm2(a * 2, 9, 2)) - 0.15 * (1 - t), rz * hz * taper);
      const band = 0.5 + 0.5 * Math.sin(t * 17 + noise.fbm2(ca * 2, sa * 2, 2) * 3);
      c.copy(bandA).lerp(bandB, band * 0.8).lerp(deep, smoothstep(0.25, 0.95, t)); if (t < 0.07) c.lerp(lip, 0.8); c.multiplyScalar(0.9 + 0.16 * rand());
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEGMENTS; s++) { const a = r * (SEGMENTS + 1) + s, b = a + 1, d = a + SEGMENTS + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildSkyIslands({ layout, biomes, seed = 11 }) {
  const group = new T.Group(); group.name = 'SkyIslands';
  const { centers, levels, halves } = layout, rand = rng(seed), geometries = [], materials = [];
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide });
  const crystals = new Batch(), rocks = new Batch(), cone = new T.ConeGeometry(1, 1, 5), ico = new T.IcosahedronGeometry(1, 1);
  centers.forEach(([x, z], i) => {
    const [hx, hz] = halves[i], B = BIOMES[biomes[i]], depth = 20 + rand() * 7, g = keel({ hx: hx - 0.2, hz: hz - 0.2, depth, seed: seed + i, earth: B.earth[0], rock: '#8a6fa8' });
    geometries.push(g); const mesh = new T.Mesh(g, material); mesh.position.set(x, levels[i], z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    const tip = [x + (rand() - 0.5) * 3, levels[i] - depth * 0.97, z + (rand() - 0.5) * 3];
    for (let k = 0; k < 4; k++) { const h = 3 + rand() * 4, a = rand() * 6.3; crystals.add(cone, mtx([tip[0] + Math.cos(a) * 1.2, tip[1] - h * 0.4, tip[2] + Math.sin(a) * 1.2], [Math.PI + (rand() - 0.5) * 0.5, a, (rand() - 0.5) * 0.5], [0.9 + rand() * 0.5, h, 0.9 + rand() * 0.5]), hex(k % 2 ? '#ff8fd0' : '#9ad0ff')); }
    for (let k = 0; k < 5; k++) { const a = rand() * 6.3, d = (0.95 + rand() * 0.4) * Math.hypot(hx, hz), s = 0.6 + rand() * 1.4, y = levels[i] - 2 - rand() * 14; rocks.add(ico, mtx([x + Math.cos(a) * d * 1.05, y, z + Math.sin(a) * d * 0.95], [rand() * 3, rand() * 3, 0], [s, s * 0.8, s]), hex(rand() < 0.5 ? '#9a7fb8' : '#b49a7a')); }
  });
  for (const batch of [crystals, rocks]) { const g = batch.geometry(), m = new T.MeshStandardMaterial({ vertexColors: true, roughness: batch === crystals ? 0.3 : 0.9, emissive: batch === crystals ? '#552255' : '#000000', emissiveIntensity: 0.6 }); geometries.push(g); materials.push(m); group.add(new T.Mesh(g, m)); }
  return {
    group, heightAt: (x, z) => { let best = 0, d = 1e9; centers.forEach(([cx, cz], i) => { const dd = Math.hypot(cx - x, cz - z); if (dd < d) { d = dd; best = levels[i]; } }); return best; }, ready: Promise.resolve(),
    release() { group.removeFromParent(); material.dispose(); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}
