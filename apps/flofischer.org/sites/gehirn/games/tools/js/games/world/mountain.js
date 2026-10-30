/**
 * Pip's great mountain: a rock spur under every hop of the climb (so the terraces read as shoulders of one ridge instead of separate
 * pillars), and a snow-capped summit behind the highest terrace. Everything is one merged mesh in vertex colours; the cloud sea
 * hides the foot of it.
 */
import { THREE as T } from '../three-kit.js';
import { createNoise } from './decor.js';
import { SEA_Y } from './sea.js';

const smooth = (k) => k * k * (3 - 2 * k);
const ROCK = [new T.Color('#8a8d92'), new T.Color('#5d636d'), new T.Color('#3f4552')], SNOW = new T.Color('#f6faff');

/** A triangular ridge from island a to island b: apex just under the path, flanks sloping to the cloud sea. */
function spur(a, b, i, noise, out) {
  const rows = 16, base = SEA_Y - 3, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, side = (i % 2 ? 1 : -1) * 5, tmp = new T.Color();
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1), w = Math.sin(t * Math.PI) * side, x = a.x + ux * len * t - uz * w, z = a.z + uz * len * t + ux * w, apex = SEA_Y + a.level + (b.level - a.level) * smooth(t) - 0.4;
    const half = Math.max(10, (apex - base) * 0.62 + 5 + 4 * noise.fbm2(x * 0.05, z * 0.05, 2)), nx = -uz, nz = ux;
    for (const s of [-1, 1]) for (const [h, f] of [[apex, 0], [base, 1]]) {
      const k = Math.min(1, (apex - h) / 20 + (noise.fbm2(x * 0.09 + s, z * 0.09 + h * 0.04, 2) * 0.3) + (f ? 0.3 : 0));
      tmp.copy(ROCK[0]).lerp(ROCK[2], Math.max(0, Math.min(1, k))).multiplyScalar(0.95 + 0.1 * Math.sign(Math.sin(h * 0.9 + i)));
      if (apex > 22 && f === 0) tmp.lerp(SNOW, 0.7);
      out.pos.push(x + nx * half * f * s, h, z + nz * half * f * s); out.col.push(tmp.r, tmp.g, tmp.b);
    }
    out.n += 4;
  }
  // rows of four vertices: apex left, base left, apex right, base right; two flanks per row pair
  for (let r = 0; r < rows - 1; r++) {
    const v = out.n - (rows - r) * 4, w = v + 4;
    out.idx.push(v, v + 1, w, w, v + 1, w + 1); // left flank
    out.idx.push(v + 2, w + 2, v + 3, w + 2, w + 3, v + 3); // right flank
    out.idx.push(v, w, v + 2, w, w + 2, v + 2); // the top, under the steps
  }
}

/** The summit: a broad cone with a few shoulders, banded rock turning to snow above 60 % of its height. */
function summit(x, z, base, top, radius, noise, out) {
  const rings = 7, seg = 12, start = out.n, tmp = new T.Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings, rad = radius * (1 - t) ** 0.8 * (1 + 0.16 * noise.fbm2(t * 3, 1, 2)), y = base + (top - base) * t;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2, wob = 1 + 0.18 * noise.fbm2(Math.cos(a) * 1.6 + t, Math.sin(a) * 1.6, 2), yy = y + (noise.fbm2(s * 0.7, t * 4, 2)) * 3;
      tmp.copy(ROCK[0]).lerp(ROCK[2], Math.min(1, t * 1.2)).multiplyScalar(0.92 + 0.12 * Math.sign(Math.sin(y * 0.8)));
      if (t > 0.58) tmp.lerp(SNOW, Math.min(1, (t - 0.58) * 5));
      out.pos.push(x + Math.cos(a) * rad * wob, yy, z + Math.sin(a) * rad * wob); out.col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  out.n += (rings + 1) * seg;
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = start + r * seg + s, b = start + r * seg + (s + 1) % seg, c = a + seg, d = b + seg; out.idx.push(a, b, c, b, d, c); }
}

/** entries: archipelago island entries (x, z, level). Returns { group, dispose }. */
export function createMountain({ entries, seed = 4 }) {
  const noise = createNoise(seed), out = { pos: [], col: [], idx: [], n: 0 }, group = new T.Group(); group.name = 'Mountain';
  for (let i = 0; i < entries.length - 1; i++) spur(entries[i], entries[i + 1], i, noise, out);
  const top = entries.at(-1), prev = entries.at(-2) ?? top, dx = top.x - prev.x, dz = top.z - prev.z, len = Math.hypot(dx, dz) || 1;
  summit(top.x + (dx / len) * 34, top.z + (dz / len) * 34, SEA_Y - 3, SEA_Y + top.level + 46, 52, noise, out);
  summit(top.x + (dx / len) * 12 - (dz / len) * 46, top.z + (dz / len) * 12 + (dx / len) * 46, SEA_Y - 3, SEA_Y + top.level + 22, 34, noise, out);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(out.pos, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(out.col, 3)); geometry.setIndex(out.idx); geometry.computeVertexNormals();
  const material = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), mesh = new T.Mesh(geometry, material); mesh.name = 'MountainBody'; mesh.frustumCulled = false; group.add(mesh);
  return { group, dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); } };
}
