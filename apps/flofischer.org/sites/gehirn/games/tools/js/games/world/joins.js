/**
 * What joins two neighbouring regions in the shared scene, built from real geometry: a plank bridge with rope rails over a strait,
 * a toy track on a table, a rope-and-plank gangway between floating arenas, or a row of gold stepping stones across land.
 * Each join is one pickable mesh; tapping it travels to the region on the other side.
 */
import { THREE as T } from '../three-kit.js';
import { Batch, mtx } from './decor.js';

const cylX = new T.CylinderGeometry(1, 1, 0.6, 12).rotateZ(Math.PI / 2), cylZ = new T.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2), box = new T.BoxGeometry(1, 1, 1), post = new T.CylinderGeometry(0.5, 0.6, 1, 7), disc = new T.CylinderGeometry(0.5, 0.58, 0.2, 14);
const col = (hex) => new T.Color(hex);

const KINDS = {
  bridge: { plank: '#c18c52', alt: '#a8723e', rail: '#7a5636', rope: '#e8d3a0', width: 3.4 },
  gangway: { plank: '#dfe6f4', alt: '#b9c4e6', rail: '#8d7cc4', rope: '#ffe9a8', width: 3.4 },
};

/** link: { a, b, from, to, strait }; deck(x, z) -> height of the surface there. Returns a Group whose `userData.link` is the link. */
export function buildJoin(link, { kind = 'bridge', deck, lift = 0.25, openColor = null } = {}) {
  const [fx, fz] = link.from, [tx, tz] = link.to, dx = tx - fx, dz = tz - fz, length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), ux = dx / length, uz = dz / length;
  const batch = new Batch(), style = KINDS[kind] ?? KINDS.bridge;
  if (link.strait || kind === 'gangway') {
    const reach = 1.4, ax = fx - ux * reach, az = fz - uz * reach, bx = tx + ux * reach, bz = tz + uz * reach, span = length + 2 * reach, ha = deck(fx + ux * 2.6, fz + uz * 2.6) + lift, hb = deck(tx - ux * 2.6, tz - uz * 2.6) + lift;
    const pitch = 0.62, count = Math.ceil(span / pitch), sag = (t) => Math.sin(Math.PI * t) * 0.18;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ha + (hb - ha) * t - sag(t);
      batch.add(box, mtx([x, y, z], [0, yaw, 0], [style.width, 0.14, pitch * 0.9]), col(i % 2 ? style.plank : style.alt));
    }
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * (style.width / 2 - 0.05), oz = -Math.sin(yaw) * side * (style.width / 2 - 0.05), posts = Math.max(2, Math.round(span / 2.4) + 1);
      for (let i = 0; i < posts; i++) { const t = i / (posts - 1), x = ax + (bx - ax) * t + ox, z = az + (bz - az) * t + oz, y = ha + (hb - ha) * t - sag(t); batch.add(post, mtx([x, y + 0.65, z], [0, 0, 0], [0.22, 1.5, 0.22]), col(style.rail)); batch.add(box, mtx([x, y + 1.42, z], [0, yaw, 0], [0.34, 0.2, 0.34]), col(style.rope)); }
      for (let i = 0; i < count; i++) { const t = (i + 0.5) / count, x = ax + (bx - ax) * t + ox, z = az + (bz - az) * t + oz, y = ha + (hb - ha) * t - sag(t); batch.add(box, mtx([x, y + 1.05 - 0.1 * Math.sin(Math.PI * t), z], [0, yaw, 0], [0.09, 0.09, pitch * 1.02]), col(style.rope)); }
    }
  } else if (kind === 'track') {
    const along = (t, lateral, y) => [fx + dx * t + Math.cos(yaw) * lateral, deck(fx, fz) + lift + y, fz + dz * t - Math.sin(yaw) * lateral], pieces = Math.max(2, Math.round(length / 5.4));
    for (let i = 0; i < pieces; i++) {
      const t0 = i / pieces, t1 = (i + 1) / pieces, tm = (t0 + t1) / 2, len = (t1 - t0) * length - 0.2, mid = along(tm, 0, 0.25);
      batch.add(box, mtx(mid, [0, yaw, 0], [4.6, 0.5, len]), col(i % 2 ? '#e7b273' : '#dba462'));
      for (const side of [-1, 1]) { batch.add(box, mtx(along(tm, side * 1.35, 0.55), [0, yaw, 0], [0.5, 0.2, len]), col('#9c6a3d')); batch.add(box, mtx(along(tm, side * 1.8, 0.42), [0, yaw, 0], [0.28, 0.5, len]), col('#c7ccd6')); }
      for (let k = 0; k < 5; k++) batch.add(box, mtx(along(t0 + ((k + 0.5) / 5) * (t1 - t0), 0, 0.55), [0, yaw, 0], [3.9, 0.22, 0.5]), col('#b98350'));
    }
    if (link.a === 1) {
      const cars = [['#e8504a', 4.2, 3.4], ['#3f8fe0', 3.6, 3], ['#f2b632', 3.6, 3]];
      cars.forEach(([color, ln, ht], n) => {
        const t = 0.26 + n * 0.19, p = along(t, 0, 0.55 + ht / 2 + 0.5); batch.add(box, mtx(p, [0, yaw, 0], [2.8, ht, ln]), col(color)); batch.add(box, mtx([p[0], p[1] + ht / 2 + 0.2, p[2]], [0, yaw, 0], [3.1, 0.4, ln + 0.3]), col('#fff4d6'));
        for (const side of [-1, 1]) for (const e of [-1, 1]) { const w = along(t + (e * ln * 0.3) / length, side * 1.55, 1.15); batch.add(cylX, mtx(w, [0, yaw, 0], [0.9, 0.5, 0.9]), col('#3b3f4a')); }
      });
      const p = along(0.26 + 3 * 0.19 + 0.04, 0, 0.55 + 2.2); batch.add(cylZ, mtx([p[0], p[1] + 0.8, p[2]], [0, yaw, 0], [1.2, 3.6, 1.2]), col('#2f6fb8')); batch.add(box, mtx([p[0], p[1] + 0.6, p[2] - 0.2], [0, yaw, 0], [2.6, 2, 2.2]), col('#2f6fb8'));
    }
  } else {
    const path = link.path ?? [link.from, link.to], seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1])), total = seg.reduce((a, b) => a + b, 0), stones = Math.max(3, Math.floor(total / 2.3));
    const at = (d) => { let k = 0; while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++; } const u = Math.min(1, d / (seg[k] || 1)); return [path[k][0] + (path[k + 1][0] - path[k][0]) * u, path[k][1] + (path[k + 1][1] - path[k][1]) * u]; };
    for (let i = 0; i < stones; i++) { const [x, z] = at(((i + 0.5) / stones) * total); batch.add(disc, mtx([x, deck(x, z) + 0.12, z], [0, 0, 0], [0.9 + 0.18 * Math.sin(i), 1, 0.9 + 0.18 * Math.sin(i)]), col(i % 3 === 1 ? '#ffd877' : '#f2e3b4')); }
  }
  const geometry = batch.geometry(), material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), mesh = new T.Mesh(geometry, material);
  mesh.castShadow = true; mesh.name = `Join_${link.a}_${link.b}`; mesh.userData.link = link;
  const group = new T.Group(); group.name = mesh.name; group.add(mesh); group.userData.link = link;
  return { group, mesh, dispose() { geometry.dispose(); material.dispose(); group.removeFromParent(); } };
}
