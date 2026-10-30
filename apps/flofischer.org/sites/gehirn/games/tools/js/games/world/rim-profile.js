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
  for (let k = 0; k < count; k++) {
    for (const inset of INSETS) {
      const [x, z] = at(k, inset); ray.set(origin.set(x, 80, z), down);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) { samples[k] = hit.point.y; break; }
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
