/**
 * The edge of the overworld sea: small distant islets (earth sides, grass or sand or snow caps, a few trees) and slow cloud banks.
 * Built once for the whole archipelago; islets take the biome of the island next to them. Everything is merged into a few meshes.
 */
import { THREE as T } from '../three-kit.js';
import { loadModel } from '../models.js';
import { Batch, mtx, rng, cloud, modelInstances } from './decor.js';
import { SEA_Y } from './sea.js';

const SETS = [
  { cap: '#7fd041', side: '#9d663a', tree: 'TREE_ROUND', size: 2.2 },
  { cap: '#f0c870', side: '#b9703d', tree: 'PALM', size: 2.4 },
  { cap: '#f4faff', side: '#869fbf', tree: 'PINE_SNOW', size: 2.4 },
  { cap: '#575468', side: '#2d2b3b', tree: 'ROCK', size: 2.4 },
  { cap: '#86a77c', side: '#6a7b8c', tree: 'PINE_SNOW', size: 2.2 },
];

const PRIMARY = ['#e8504a', '#f2b632', '#3f8fe0', '#58b65a', '#9a5fd0'];

/** The far things that are not islets: peaks standing in the cloud sea (Pip), small floating islands (Fernling-Arena), toys left on the floor (Bounce Brigade). */
function farThing(kind, bodies, caps, x, z, rand, level) {
  const col = (hex, k = 1) => new T.Color(hex).multiplyScalar(k), yaw = rand() * 6;
  if (kind === 'peak') {
    const r = 9 + rand() * 12, h = 26 + rand() * 34, rock = col(rand() < 0.5 ? '#7b8fa8' : '#6b7e99', 0.92 + rand() * 0.16);
    bodies.add(new T.ConeGeometry(r, h, 7, 1), mtx([x, SEA_Y + level + h / 2 - 3, z], [0, yaw, 0]), rock);
    caps.add(new T.ConeGeometry(r * 0.42, h * 0.4, 7, 1), mtx([x, SEA_Y + level + h * 0.8 - 3, z], [0, yaw, 0]), col('#f4f9ff'));
  } else if (kind === 'floating') {
    const r = 7 + rand() * 7, y = SEA_Y + 16 + rand() * 20, depth = r * 1.1;
    bodies.add(new T.ConeGeometry(r * 0.9, depth, 12, 1).rotateX(Math.PI), mtx([x, y - depth / 2, z], [0, yaw, 0]), col('#7b5a86', 0.9 + rand() * 0.2));
    caps.add(new T.CylinderGeometry(r, r * 0.92, 1.1, 14, 1), mtx([x, y + 0.2, z], [0, yaw, 0]), col(rand() < 0.5 ? '#9fdc7a' : '#f0c870'));
    if (rand() < 0.7) caps.add(new T.ConeGeometry(r * 0.22, r * 0.9, 6, 1), mtx([x, y + r * 0.5, z], [0, yaw, 0]), col('#fff0d0'));
  } else {
    const size = 3 + rand() * 4.5, color = col(PRIMARY[Math.floor(rand() * PRIMARY.length)]), pick = rand();
    if (pick < 0.45) bodies.add(new T.BoxGeometry(1, 1, 1), mtx([x, SEA_Y + size / 2, z], [0, yaw, 0], size), color);
    else if (pick < 0.75) bodies.add(new T.SphereGeometry(1, 12, 8), mtx([x, SEA_Y + size * 0.6, z], [0, yaw, 0], size * 0.6), color);
    else { bodies.add(new T.CylinderGeometry(1, 1, 1, 14), mtx([x, SEA_Y + size * 0.4, z], [0, yaw, 0], [size * 0.5, size * 0.8, size * 0.5]), color); caps.add(new T.CylinderGeometry(1, 1, 0.3, 14), mtx([x, SEA_Y + size * 0.82, z], [0, yaw, 0], [size * 0.55, 1, size * 0.55]), col('#fff4d6')); }
  }
}

/** spacing: distance between island centres along x; zs: their z offsets. kind: islet (sea), peak, floating or toys; level: height of the sea. */
export function createHorizon({ spacing, zs, count = 5, centers = null, bounds = null, kind = 'islet', level = 0 }) {
  const rand = rng(404), group = new T.Group(); group.name = 'Horizon';
  const geometries = [], materials = [], instances = [], bodies = new Batch(), caps = new Batch(), spots = [];
  const cylinder = (rt, rb, h) => new T.CylinderGeometry(rt, rb, h, 14, 2);
  const color = (hex) => new T.Color(hex);
  // a row beside the islands, or (map layout) scattered around them: never closer than 70 m to an island or 24 m to another islet
  const total = centers ? (kind === 'toys' ? 26 : kind === 'islet' ? 16 : 14) : Math.round(((count - 1) * spacing + 140) / 20), placed = [];
  for (let n = 0; n < total; n++) {
    let x, z, near = 0;
    if (centers) {
      for (let tries = 0; tries < 40; tries++) {
        x = bounds.x0 + rand() * (bounds.x1 - bounds.x0); z = bounds.z0 + rand() * (bounds.z1 - bounds.z0);
        if (centers.every((c) => Math.hypot(c[0] - x, c[1] - z) > 74) && placed.every((q) => Math.hypot(q[0] - x, q[1] - z) > 26)) break;
        x = NaN;
      }
      if (Number.isNaN(x)) continue;
      placed.push([x, z]); let best = 1e9; centers.forEach((c, k) => { const d = Math.hypot(c[0] - x, c[1] - z); if (d < best) { best = d; near = k; } });
    } else {
      x = -50 + (n / (total - 1)) * ((count - 1) * spacing + 100) + (rand() - 0.5) * 8; const side = n % 2 ? 1 : -1;
      z = side * (54 + rand() * 40) + (zs[Math.min(count - 1, Math.max(0, Math.round(x / spacing)))] || 0) * 0.5; near = Math.min(count - 1, Math.max(0, Math.round(x / spacing)));
    }
    if (kind !== 'islet') { farThing(kind, bodies, caps, x, z, rand, level); continue; }
    const set = SETS[near], r = 6 + rand() * 7, h = 2.2 + rand() * 3.2;
    const bodyColor = color(set.side).multiplyScalar(0.9 + rand() * 0.2), capColor = color(set.cap).multiplyScalar(0.95 + rand() * 0.1);
    const flat = 0.8 + rand() * 0.4;
    bodies.add(cylinder(r * 0.82, r * 0.5, h), mtx([x, SEA_Y + h / 2 - 0.9, z], [0, rand() * 6, 0], [flat, 1, 1 / flat]), bodyColor);
    caps.add(cylinder(r, r * 0.9, 0.7), mtx([x, SEA_Y + h - 0.9 + 0.1, z], [0, rand() * 6, 0], [flat, 1, 1 / flat]), capColor);
    spots.push({ x, z, r, y: SEA_Y + h - 0.5, set: near });
  }
  for (const [b, name] of [[bodies, 'IsletBodies'], [caps, 'IsletCaps']]) {
    const g = b.geometry(); geometries.push(g);
    const m = new T.MeshLambertMaterial({ vertexColors: true }); materials.push(m);
    const mesh = new T.Mesh(g, m); mesh.name = name; group.add(mesh);
  }
  // trees on the islets, loaded after the first frame
  const treesReady = Promise.all(SETS.map((s) => loadModel(s.tree, 'lo'))).then((models) => {
    if (group.userData.released) return;
    SETS.forEach((set, k) => {
      const list = [];
      for (const sp of spots.filter((q) => q.set === k)) for (let t = 0; t < 2 + Math.floor(rand() * 3); t++) { const a = rand() * 6.3, d = rand() * sp.r * 0.6; list.push(mtx([sp.x + Math.cos(a) * d, sp.y, sp.z + Math.sin(a) * d], [0, rand() * 6, 0], set.size * (0.8 + rand() * 0.6))); }
      const g = modelInstances(models[k], list);
      g.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) { const old = o.material; o.material = new T.MeshLambertMaterial({ vertexColors: true }); old.dispose(); } if (o.material) materials.push(o.material); });
      instances.push(g); group.add(g);
    });
    group.userData.onTrees?.();
  }).catch(() => {});
  // cloud banks
  const cloudGroup = new T.Group(), cb = new Batch(), crand = rng(55);
  for (let k = 0; k < (centers ? 0 : 10); k++) {
    const x = centers ? bounds.x0 + crand() * (bounds.x1 - bounds.x0) : -60 + crand() * ((count - 1) * spacing + 120), z = centers ? bounds.z0 + crand() * (bounds.z1 - bounds.z0) : (crand() < 0.5 ? -1 : 1) * (150 + crand() * 50), s = 10 + crand() * 12;
    cb.add(cloud(crand, 6, [0.8, 0.88, 0.98]), mtx([x, 40 + crand() * 20, z], [0, crand() * 3, 0], [s * 1.8, s * 0.6, s]));
  }
  const cg = cb.geometry(); geometries.push(cg);
  const cm = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }); materials.push(cm);
  const clouds = new T.Mesh(cg, cm); clouds.name = 'Clouds'; cloudGroup.add(clouds); group.add(cloudGroup);
  return {
    group, treesReady,
    update(time) { cloudGroup.position.x = Math.sin(time * 0.03) * 12; },
    release() { group.userData.released = true; group.removeFromParent(); for (const g of instances) g.traverse((o) => o.isInstancedMesh && o.dispose()); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}
