/**
 * The ground around a Bounce Brigade play set: the authored region is already a complete toy board with its rim, so this only sets it
 * down on the playroom floor: a soft contact shadow painted into the floor (through the sea's shore texture) and a handful of toys
 * lying around it in the colours of the set (blocks, balls, a drum), one merged mesh. It never touches the region's meshes.
 */
import { THREE as T } from '../three-kit.js';
import { Batch, mtx, rng } from './decor.js';
import { SEA_Y } from './sea.js';

const PRIMARY = ['#e8504a', '#f2b632', '#3f8fe0', '#58b65a', '#9a5fd0'];
const MARGIN = 14, CELL = 1.5;

export function playset(world, { biome = 'meadow', seed = 1, sea = null, onChange = null } = {}) {
  const u = world.unitScale, center = world.bounds.getCenter(new T.Vector3()), size = world.bounds.getSize(new T.Vector3());
  const group = new T.Group(); group.name = `Playset_${biome}`; group.position.set(center.x, 0, center.z); group.scale.setScalar(u);
  const hx = size.x / 2 / u, hz = size.z / 2 / u, rand = rng(seed * 37 + 5), state = { ready: false, ms: 0, builds: 0, maxSliceMs: 0 };
  const t0 = performance.now(), nx = Math.ceil((2 * hx + 2 * (MARGIN + 6)) / CELL), nz = Math.ceil((2 * hz + 2 * (MARGIN + 6)) / CELL), gx0 = -hx - MARGIN - 6, gz0 = -hz - MARGIN - 6, tile = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = gx0 + (i + 0.5) * CELL, z = gz0 + (j + 0.5) * CELL, d = Math.hypot(Math.max(0, Math.abs(x) - hx + 0.5), Math.max(0, Math.abs(z) - hz + 0.5));
    tile[j * nx + i] = d <= 0 ? 0 : Math.min(255, Math.round((d / 12) * 255));
  }
  const at = [center.x + gx0 * u, center.z + gz0 * u];
  sea?.paint(tile, nx, nz, at[0], at[1], CELL * u);
  // toys on the floor around the board
  const batch = new Batch(), box = new T.BoxGeometry(1, 1, 1), ball = new T.SphereGeometry(1, 12, 8), drum = new T.CylinderGeometry(1, 1, 1, 14), cone = new T.ConeGeometry(1, 1, 10), taken = [];
  const col = (hex) => new T.Color(hex), floorY = SEA_Y / u;
  for (let n = 0; n < 60 && taken.length < 11; n++) {
    const side = rand() * 4 | 0, along = rand() - 0.5, out = 3.5 + rand() * (MARGIN - 6), x = side < 2 ? along * (2 * hx + 8) : (side === 2 ? -1 : 1) * (hx + out), z = side < 2 ? (side === 0 ? -1 : 1) * (hz + out) : along * (2 * hz + 8);
    if (taken.some((q) => Math.hypot(q[0] - x, q[1] - z) < 7)) continue;
    taken.push([x, z]);
    const s = 1.8 + rand() * 2.4, yaw = rand() * 6, color = col(PRIMARY[Math.floor(rand() * PRIMARY.length)]), pick = rand();
    if (pick < 0.4) batch.add(box, mtx([x, floorY + s / 2, z], [0, yaw, 0], s), color);
    else if (pick < 0.65) batch.add(ball, mtx([x, floorY + s * 0.55, z], [0, yaw, 0], s * 0.55), color);
    else if (pick < 0.85) { batch.add(drum, mtx([x, floorY + s * 0.4, z], [0, yaw, 0], [s * 0.55, s * 0.8, s * 0.55]), color); batch.add(drum, mtx([x, floorY + s * 0.82, z], [0, yaw, 0], [s * 0.6, 0.25, s * 0.6]), col('#fff4d6')); }
    else { batch.add(box, mtx([x, floorY + s * 0.25, z], [0, yaw, 0], [s * 1.4, s * 0.5, s * 1.4]), col('#c9823f')); batch.add(cone, mtx([x, floorY + s * 1.05, z], [0, yaw, 0], [s * 0.6, s * 1.1, s * 0.6]), color); }
  }
  const geometry = batch.geometry(), material = new T.MeshLambertMaterial({ vertexColors: true }), mesh = new T.Mesh(geometry, material); mesh.name = 'PlaysetToys'; group.add(mesh);
  state.ready = true; state.builds = 1; state.ms = performance.now() - t0;
  const ready = Promise.resolve().then(() => onChange?.());
  return {
    group, state, ready, heightAt: () => null,
    release() { group.removeFromParent(); sea?.clear(at[0], at[1], nx, nz, CELL * u); geometry.dispose(); material.dispose(); },
  };
}
