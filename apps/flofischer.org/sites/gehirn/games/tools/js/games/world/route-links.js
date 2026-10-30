/**
 * What joins two neighbouring regions on the world map, one instanced mesh per kind of piece: stepping stones and buoys over the sea
 * (Rangers), rock steps up the mountain (Pip), a bridge of light between floating islands (Fernling-Arena), toy railway track across
 * the playroom floor (Bounce Brigade). The pieces are coloured by whether the island they lead to is open.
 */
import { THREE as T } from '../three-kit.js';
import { mtx, rng } from './decor.js';
import { SEA_Y } from './sea.js';

const smooth = (k) => k * k * (3 - 2 * k);
const BOX = () => new T.BoxGeometry(1, 1, 1), BALL = () => new T.SphereGeometry(1, 8, 5);

/** Points along the hop from island a to island b: x, z, height above the sea, heading and 0..1 progress. */
function samples(a, b, i, spacing, bend) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const from = a.radius * 0.9, to = len - b.radius * 0.9, n = Math.max(4, Math.floor((to - from) / spacing)), side = (i % 2 ? 1 : -1) * bend;
  const out = [];
  for (let s = 0; s < n; s++) {
    const t = n === 1 ? 0.5 : s / (n - 1), d = from + (to - from) * t, w = Math.sin(t * Math.PI) * side;
    out.push({ x: a.x + ux * d - uz * w, z: a.z + uz * d + ux * w, y: (a.level ?? 0) + ((b.level ?? 0) - (a.level ?? 0)) * smooth(t), t, yaw: 0 });
  }
  out.forEach((p, k) => { const q = out[Math.min(out.length - 1, k + 1)], r = out[Math.max(0, k - 1)]; p.yaw = Math.atan2(q.x - r.x, q.z - r.z); });
  return out;
}

/** The piece sets of each kind: geometry, material, [open colour, locked colour] and how to place the pieces along one hop. */
const KINDS = {
  stones: {
    spacing: 4.2, bend: 4,
    parts: [{ geo: BALL, basic: false, colors: ['#f1dd9c', '#b9ccdb'], place: (ps, rand) => ps.map((p) => { const r = 1.5 + rand() * 0.5; return mtx([p.x, SEA_Y + 0.02 + p.y, p.z], [0, rand() * 6, 0], [r * 1.25, 0.34, r]); }) }],
  },
  steps: {
    spacing: 4.6, bend: 5,
    parts: [{ geo: BOX, basic: false, colors: ['#e3dccb', '#aab6c4'], place: (ps, rand) => ps.map((p) => mtx([p.x, SEA_Y + 0.35 + p.y, p.z], [0, p.yaw + (rand() - 0.5) * 0.25, 0], [3, 0.7 + rand() * 0.3, 2.1])) }],
  },
  light: {
    spacing: 2.4, bend: 3,
    parts: [
      { geo: BOX, basic: true, colors: ['#ffe9a0', '#b3b9ea'], place: (ps) => ps.map((p) => mtx([p.x, SEA_Y + 0.8 + p.y, p.z], [0, p.yaw, 0], [3.4, 0.16, 2.0])) },
      { geo: BALL, basic: true, colors: ['#fffbe6', '#d6dbf5'], place: (ps) => ps.flatMap((p, k) => (k % 3 ? [] : [-1, 1].map((side) => mtx([p.x + Math.cos(p.yaw) * 1.15 * side, SEA_Y + 1.25 + p.y, p.z - Math.sin(p.yaw) * 1.15 * side], [0, 0, 0], 0.34)))) },
    ],
  },
  track: {
    spacing: 1.9, bend: 3,
    parts: [
      { geo: BOX, basic: false, colors: ['#c98a4b', '#9d9186'], place: (ps) => ps.map((p) => mtx([p.x, SEA_Y + 0.18 + p.y, p.z], [0, p.yaw, 0], [2.9, 0.2, 0.62])) },
      { geo: BOX, basic: false, colors: ['#e4e8ec', '#aeb4ba'], place: (ps) => ps.flatMap((p) => [-1, 1].map((side) => mtx([p.x + Math.cos(p.yaw) * 0.95 * side, SEA_Y + 0.42 + p.y, p.z - Math.sin(p.yaw) * 0.95 * side], [0, p.yaw, 0], [0.2, 0.2, 2.15]))) },
    ],
  },
};

/** entries: the archipelago's island entries ({ x, z, radius, level }). Hop h joins entry h to entry h + 1. */
export function createLinks({ entries, kind = 'stones', seed = 77 }) {
  const spec = KINDS[kind] ?? KINDS.stones, rand = rng(seed), group = new T.Group(); group.name = 'RouteLinks';
  const hops = [];
  for (let i = 0; i < entries.length - 1; i++) hops.push(samples(entries[i], entries[i + 1], i, spec.spacing, spec.bend));
  const meshes = spec.parts.map((part, pi) => {
    const lists = hops.map((ps) => part.place(ps, rand)), total = lists.reduce((n, l) => n + l.length, 0), geo = part.geo();
    const material = part.basic ? new T.MeshBasicMaterial({ toneMapped: false }) : new T.MeshLambertMaterial();
    const mesh = new T.InstancedMesh(geo, material, Math.max(1, total)); mesh.name = `Route_${kind}_${pi}`; mesh.count = total; mesh.frustumCulled = false;
    const slices = []; let at = 0;
    lists.forEach((list, h) => { list.forEach((m, k) => mesh.setMatrixAt(at + k, m)); slices.push([at, list.length, h]); at += list.length; });
    mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
    return { mesh, slices, colors: part.colors };
  });
  // a buoy beside every other stone: red and white, they bob in the swell
  let buoys = null;
  if (kind === 'stones') {
    const geo = new T.CylinderGeometry(0.7, 1.0, 1.9, 8, 3), material = new T.MeshLambertMaterial({ vertexColors: true }), P = geo.attributes.position, col = new Float32Array(P.count * 3);
    for (let k = 0; k < P.count; k++) { const y = P.getY(k), c = new T.Color(y > 0.2 ? '#ff4d3d' : y > -0.35 ? '#fffaf0' : '#ff4d3d'); col.set([c.r, c.g, c.b], k * 3); }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const spots = hops.flat().filter((_, k) => k % 2 === 1).map((p, k) => ({ x: p.x + 3.2 * (k % 2 ? 1 : -1), z: p.z - 3.2 * (k % 2 ? 1 : -1) }));
    const mesh = new T.InstancedMesh(geo, material, Math.max(1, spots.length)); mesh.name = 'RouteBuoys'; mesh.count = spots.length; mesh.frustumCulled = false; group.add(mesh);
    buoys = { mesh, spots, dummy: new T.Object3D(), geo, material };
  }
  function bob(time) {
    if (!buoys) return;
    const { spots, dummy, mesh } = buoys;
    spots.forEach((q, k) => { dummy.position.set(q.x, SEA_Y + 0.5 + Math.sin(time * 1.4 + k * 1.7) * 0.12, q.z); dummy.rotation.set(Math.sin(time + k) * 0.08, 0, Math.cos(time * 0.8 + k) * 0.08); dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
  }
  bob(0);
  const c = new T.Color();
  return {
    group, meshes: meshes.map((m) => m.mesh), get count() { return meshes[0].mesh.count; },
    /** isOpen(h): whether the island at the far end of hop h is open and revealed. */
    refresh(isOpen) {
      for (const part of meshes) {
        for (const [from, count, h] of part.slices) { c.set(part.colors[isOpen(h) ? 0 : 1]); for (let k = 0; k < count; k++) part.mesh.setColorAt(from + k, c); }
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
      }
    },
    update(time) { bob(time); },
    dispose() {
      for (const part of meshes) { part.mesh.geometry.dispose(); part.mesh.material.dispose(); part.mesh.dispose(); }
      if (buoys) { buoys.geo.dispose(); buoys.material.dispose(); buoys.mesh.dispose(); }
      group.removeFromParent();
    },
  };
}
