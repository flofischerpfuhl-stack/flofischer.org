/**
 * How high the authored slab stands along its edge: a ray straight down at every metre or so of the footprint's rim (a little inside),
 * so the land built around it can meet the slab at the same height on each side. Returns edge(lx, lz) -> height in the slab's own metres.
 */
import { THREE as T } from '../three-kit.js';

const STEP = 2, INSETS = [0.4, 1.4, 3];

export function rimProfile(root, hx, hz) {
  root.updateMatrixWorld(true);
  const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), origin = new T.Vector3(), count = Math.round((4 * (hx + hz)) / STEP), samples = new Float32Array(count).fill(NaN);
  ray.firstHitOnly = true;
  const at = (k, inset) => {
    const t = (k / count) * 4 * (hx + hz), a = hx * 2, b = hz * 2;
    if (t < a) return [-hx + t, -hz + inset];
    if (t < a + b) return [hx - inset, -hz + (t - a)];
    if (t < 2 * a + b) return [hx - (t - a - b), hz - inset];
    return [-hx + inset, hz - (t - 2 * a - b)];
  };
  const meshes = []; root.traverse((n) => { if (n.isMesh && [n.material].flat().every((m) => !m.transparent)) meshes.push(n); });
  const fast = [], slow = [];
  for (const m of meshes) (!Array.isArray(m.material) && m.geometry.attributes.position?.itemSize === 3 && !m.isSkinnedMesh && !m.isInstancedMesh && !m.morphTargetInfluences ? fast : slow).push(m);
  const grid = heightGrid(fast);
  for (let k = 0; k < count; k++) {
    for (const inset of INSETS) {
      const [x, z] = at(k, inset);
      let y = grid(x, z);
      if (slow.length) { ray.set(origin.set(x, 80, z), down); const hit = ray.intersectObjects(slow, false)[0]; if (hit && !(hit.point.y < y)) y = hit.point.y; }
      if (y > -Infinity) { samples[k] = y; break; }
    }
  }
  const known = [...samples].filter(Number.isFinite), mean = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0.6;
  for (let k = 0; k < count; k++) if (!Number.isFinite(samples[k])) {
    let l = 1, r = 1; while (l < count && !Number.isFinite(samples[(k - l + count) % count])) l++; while (r < count && !Number.isFinite(samples[(k + r) % count])) r++;
    const a = samples[(k - l + count) % count], b = samples[(k + r) % count]; samples[k] = Number.isFinite(a) && Number.isFinite(b) ? (a * r + b * l) / (l + r) : mean;
  }
  const edge = (lx, lz) => {
    const x = Math.max(-hx, Math.min(hx, lx)), z = Math.max(-hz, Math.min(hz, lz)), dl = x + hx, dr = hx - x, dt = z + hz, db = hz - z, m = Math.min(dl, dr, dt, db);
    let t;
    if (m === dt) t = dl; else if (m === dr) t = 2 * hx + dt; else if (m === db) t = 2 * hx + 2 * hz + dr; else t = 4 * hx + 2 * hz + db;
    const f = (t / STEP) % count, i = Math.floor(f), u = f - i;
    return samples[i % count] * (1 - u) + samples[(i + 1) % count] * u;
  };
  return { edge, mean };
}

/** Highest surface under (x, z) for a straight-down ray, as Raycaster would find it (same side culling), but looked up in an xz bucket grid instead of testing every triangle. */
export function heightGrid(meshes) {
  const tris = [], cell = STEP * 2, buckets = new Map(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index, n = index ? index.count : pos.count, side = mesh.material.side;
    for (let i = 0; i < n; i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld); b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld); c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      if (ny === 0 || (side === T.FrontSide && ny < 0) || (side === T.BackSide && ny > 0)) continue;
      const id = tris.length / 9; tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / cell), x1 = Math.floor(Math.max(a.x, b.x, c.x) / cell), z0 = Math.floor(Math.min(a.z, b.z, c.z) / cell), z1 = Math.floor(Math.max(a.z, b.z, c.z) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx * 65536 + gz; let list = buckets.get(key); if (!list) buckets.set(key, list = []); list.push(id); }
    }
  }
  const t = Float32Array.from(tris);
  return (x, z) => {
    const list = buckets.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)); let best = -Infinity;
    if (!list) return best;
    for (const id of list) {
      const o = id * 9, ax = t[o], az = t[o + 2], bx = t[o + 3], bz = t[o + 5], cx = t[o + 6], cz = t[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (d === 0) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      const y = u * t[o + 1] + v * t[o + 4] + w * t[o + 7];
      if (y <= 80 && y > best) best = y;
    }
    return best;
  };
}
