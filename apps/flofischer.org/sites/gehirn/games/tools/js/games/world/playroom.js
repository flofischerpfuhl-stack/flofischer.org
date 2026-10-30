/**
 * Bounce Brigade's land: a child's playroom in real 3D. The play sets stand on one big wooden toy table with a checked play mat; the table
 * stands in a room with two papered walls, skirting boards, a window with curtains, a bookshelf, a toy chest, child chairs, a big teddy bear
 * and giant alphabet blocks. The floor is the sea shader's plank floor; the table's contact shadow comes from the shore tile.
 * Everything is real geometry (merged by colour), so the perspective camera shows the room from every angle.
 */
import { THREE as T } from '../three-kit.js';
import { Batch, mtx, rng } from './decor.js';

export const TABLE_Y = -1.8;
const FLOOR_DROP = 40, MARGIN = 9, WALL = 78, HEIGHT = 120;
const box = new T.BoxGeometry(1, 1, 1), ball = new T.SphereGeometry(1, 14, 10), cyl = new T.CylinderGeometry(1, 1, 1, 14), cone = new T.ConeGeometry(1, 1, 12), leg = new T.CylinderGeometry(0.8, 1, 1, 8);
const c = (hex) => new T.Color(hex);

function wallpaper() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fbf0d8'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#cfe6f3'; for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 32, 256);
  g.fillStyle = '#f4b9a8'; for (const [x, y] of [[48, 40], [48, 168], [112, 104], [112, 232], [176, 40], [176, 168], [240, 104], [240, 232]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 6 : 14; g.lineTo(x % 256 + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); }
  const t = new T.CanvasTexture(canvas); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t;
}
function letterBlock(letter, color) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#fff8e6'; g.font = '800 84px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 64, 70);
  const t = new T.CanvasTexture(canvas); t.colorSpace = T.SRGBColorSpace; return t;
}

export function buildPlayroom({ layout, sea = null, seed = 5 }) {
  const group = new T.Group(); group.name = 'Playroom';
  const { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } = layout.slabBounds ?? layout.bounds, X0 = bx0 - MARGIN, X1 = bx1 + MARGIN, Z0 = bz0 - MARGIN, Z1 = bz1 + MARGIN, floorY = TABLE_Y - FLOOR_DROP, rand = rng(seed * 11 + 3);
  const disposables = [], wood = new Batch(), toys = new Batch();
  const add = (geo, pos, scale, color, rot = [0, 0, 0], b = toys) => b.add(geo, mtx(pos, rot, scale), c(color));

  // the table: wooden top with a rounded edge, apron, four turned legs, the play mat on it
  const W = X1 - X0, D = Z1 - Z0, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, topY = TABLE_Y - 0.2;
  add(box, [cx, topY - 1.6, cz], [W, 3.2, D], '#e2aa6a', [0, 0, 0], wood);
  add(box, [cx, topY - 3.6, cz], [W - 4, 2.2, D - 4], '#c98f52', [0, 0, 0], wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = cx + sx * (W / 2 - 7), lz = cz + sz * (D / 2 - 7), h = topY - 4.7 - floorY;
    add(leg, [lx, floorY + h / 2, lz], [3.4, h, 3.4], '#cf9457', [0, 0, 0], wood); add(box, [lx, floorY + 0.7, lz], [5.4, 1.4, 5.4], '#b87d45', [0, 0, 0], wood);
  }
  const tiles = new Batch(), tile = 8, tx = Math.floor((W - 6) / tile), tz = Math.floor((D - 6) / tile), ox = cx - (tx * tile) / 2, oz = cz - (tz * tile) / 2;
  tiles.add(box, mtx([cx, TABLE_Y - 0.1, cz], [0, 0, 0], [tx * tile + 0.4, 0.2, tz * tile + 0.4]), c('#6fa59a'));
  for (let i = 0; i < tx; i++) for (let j = 0; j < tz; j++) if ((i + j) % 2) tiles.add(box, mtx([ox + (i + 0.5) * tile, TABLE_Y + 0.02, oz + (j + 0.5) * tile], [0, 0, 0], [tile, 0.16, tile]), c('#8fc4b4'));
  const mat = new T.Mesh(tiles.geometry(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); mat.receiveShadow = true; mat.name = 'PlayMat'; group.add(mat);

  // toys left on the play mat between and around the sets: blocks, little trees, a ball, a pawn; never on a slab or a track
  const free = (x, z) => layout.centers.every(([sx, sz], i) => Math.abs(x - sx) > layout.halves[i][0] + 4 && Math.abs(z - sz) > layout.halves[i][1] + 4) && layout.links.every((l) => { const dx = l.to[0] - l.from[0], dz = l.to[1] - l.from[1], t = Math.max(0, Math.min(1, ((x - l.from[0]) * dx + (z - l.from[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - l.from[0] - dx * t, z - l.from[1] - dz * t) > 5; });
  const placed = [], palette = ['#e8504a', '#f2b632', '#3f8fe0', '#58b65a', '#9a5fd0', '#f08a3c'];
  for (let n = 0; n < 400 && placed.length < 16; n++) {
    const x = X0 + 4 + rand() * (W - 8), z = Z0 + 4 + rand() * (D - 8);
    if (!free(x, z) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) continue;
    placed.push([x, z]);
    const color = palette[Math.floor(rand() * palette.length)], pick = rand(), yaw = rand() * 6, s = 1.8 + rand() * 1.4;
    if (pick < 0.3) { add(box, [x, TABLE_Y + s / 2, z], s, color, [0, yaw, 0], toys); if (rand() < 0.5) add(box, [x + 0.3, TABLE_Y + s * 1.5, z], s * 0.9, palette[Math.floor(rand() * palette.length)], [0, yaw + 0.5, 0], toys); }
    else if (pick < 0.5) { add(cyl, [x, TABLE_Y + s * 0.5, z], [s * 0.45, s, s * 0.45], '#8a5a34', [0, 0, 0], toys); add(cone, [x, TABLE_Y + s * 1.6, z], [s * 1.1, s * 1.5, s * 1.1], '#58b65a', [0, 0, 0], toys); }
    else if (pick < 0.7) add(ball, [x, TABLE_Y + s * 0.6, z], s * 0.6, color, [0, 0, 0], toys);
    else if (pick < 0.85) { add(cyl, [x, TABLE_Y + 0.5, z], [s * 0.5, 1, s * 0.5], color, [0, 0, 0], toys); add(ball, [x, TABLE_Y + 1.7, z], s * 0.38, color, [0, 0, 0], toys); }
    else { add(box, [x, TABLE_Y + 0.4, z], [s * 1.8, 0.8, s * 1.1], '#d8d4cc', [0, yaw, 0], toys); add(box, [x, TABLE_Y + 1.4, z], [s * 1.1, 1.4, s * 0.9], color, [0, yaw, 0], toys); }
  }

  // the room: floor (the sea plane), two walls, skirting boards, window, curtains
  const wp = wallpaper(), wallMaterial = new T.MeshStandardMaterial({ map: wp, roughness: 1 }); disposables.push(wp, wallMaterial);
  const cornerX = X0 - WALL, cornerZ = Z0 - WALL, spanX = X1 - cornerX + 120, spanZ = Z1 - cornerZ + 120;
  const backGeo = new T.PlaneGeometry(spanX, HEIGHT), sideGeo = new T.PlaneGeometry(spanZ, HEIGHT);
  for (const g of [backGeo, sideGeo]) { const uv = g.attributes.uv, k = g === backGeo ? spanX : spanZ; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k / 64, uv.getY(i) * HEIGHT / 64); }
  const back = new T.Mesh(backGeo, wallMaterial); back.position.set(cornerX + spanX / 2, floorY + HEIGHT / 2, cornerZ); group.add(back);
  const side = new T.Mesh(sideGeo, wallMaterial); side.rotation.y = Math.PI / 2; side.position.set(cornerX, floorY + HEIGHT / 2, cornerZ + spanZ / 2); group.add(side);
  add(box, [cornerX + spanX / 2, floorY + 3, cornerZ + 0.9], [spanX, 6, 1.8], '#fffaf0', [0, 0, 0], wood); add(box, [cornerX + 0.9, floorY + 3, cornerZ + spanZ / 2], [1.8, 6, spanZ], '#fffaf0', [0, 0, 0], wood);
  // window in the back wall: frame, mullions, bright panes, sill, curtains
  const wx = cornerX + 64, wy = floorY + 70, ww = 46, wh = 56;
  add(box, [wx, wy, cornerZ + 0.6], [ww + 8, wh + 8, 1.4], '#fffaf0', [0, 0, 0], wood);
  const pane = new T.Mesh(new T.PlaneGeometry(ww, wh), new T.MeshBasicMaterial({ color: '#dff3ff', toneMapped: false })); pane.position.set(wx, wy, cornerZ + 1.4); group.add(pane); disposables.push(pane.geometry, pane.material);
  add(box, [wx, wy, cornerZ + 2], [2, wh, 1], '#fffaf0', [0, 0, 0], wood); add(box, [wx, wy, cornerZ + 2], [ww, 2, 1], '#fffaf0', [0, 0, 0], wood); add(box, [wx, wy - wh / 2 - 3, cornerZ + 3.4], [ww + 12, 2.4, 6], '#fffaf0', [0, 0, 0], wood);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) add(box, [wx + s * (ww / 2 + 5.5) + (k - 1.5) * 1.1 * s, wy - 3, cornerZ + 4 + (k % 2) * 0.8], [1.5, wh + 18, 1.6], k % 2 ? '#f08a7a' : '#f4a695', [0, 0, 0], toys);
  add(box, [wx, wy + wh / 2 + 9.5, cornerZ + 4.2], [ww + 22, 2, 2.4], '#9a6b43', [0, 0, 0], wood);

  // bookshelf against the back wall, full of books and toys
  const sx = cornerX + 142, sw = 54, sh = 78, sd = 15;
  add(box, [sx - sw / 2, floorY + sh / 2, cornerZ + sd / 2], [2, sh, sd], '#c98b52', [0, 0, 0], wood); add(box, [sx + sw / 2, floorY + sh / 2, cornerZ + sd / 2], [2, sh, sd], '#c98b52', [0, 0, 0], wood);
  for (let k = 0; k <= 3; k++) add(box, [sx, floorY + 1 + k * (sh - 2) / 3, cornerZ + sd / 2], [sw, 2, sd], '#d89c5f', [0, 0, 0], wood);
  const bookColors = ['#e8504a', '#f2b632', '#3f8fe0', '#58b65a', '#9a5fd0', '#f08a3c', '#4fb3b0'];
  for (let shelf = 0; shelf < 3; shelf++) { let x = sx - sw / 2 + 3; const y0 = floorY + 2 + shelf * (sh - 2) / 3; while (x < sx + sw / 2 - 5) { const bw = 2 + rand() * 2.2, bh = 11 + rand() * 7; if (shelf === 1 && x > sx - 4 && x < sx + 14) { x += 14; continue; } add(box, [x + bw / 2, y0 + 1 + bh / 2, cornerZ + sd / 2], [bw, bh, sd - 3], bookColors[Math.floor(rand() * bookColors.length)], [0, 0, 0], toys); x += bw + 0.15; } }
  add(box, [sx + 4, floorY + 2 + (sh - 2) / 3 + 5.5, cornerZ + sd / 2], [8, 8, 8], '#e8504a', [0, 0, 0], toys); add(ball, [sx + 4, floorY + 2 + (sh - 2) / 3 + 13.5, cornerZ + sd / 2], 5, '#f2b632', [0, 0, 0], toys);
  add(cyl, [sx - 14, floorY + sh + 4, cornerZ + sd / 2], [4, 8, 4], '#58b65a', [0, 0, 0], toys); add(cone, [sx - 14, floorY + sh + 12, cornerZ + sd / 2], [4.4, 8, 4.4], '#e8504a', [0, 0, 0], toys);

  // toy chest against the side wall, lid open, toys spilling out
  const chestZ = cornerZ + 64, chestX = cornerX + 17;
  add(box, [chestX, floorY + 10, chestZ], [28, 20, 36], '#4a86c8', [0, 0, 0], toys); add(box, [chestX, floorY + 10, chestZ], [28.4, 3, 36.4], '#f2c14e', [0, 0, 0], toys); add(box, [chestX, floorY + 2.5, chestZ], [28.4, 3, 36.4], '#f2c14e', [0, 0, 0], toys);
  add(box, [chestX - 12, floorY + 28, chestZ], [2, 17, 36], '#4a86c8', [-0.0, 0, 0.25], toys); add(ball, [chestX + 2, floorY + 23, chestZ + 6], 6, '#e8504a', [0, 0, 0], toys); add(box, [chestX + 3, floorY + 22, chestZ - 8], [9, 9, 9], '#58b65a', [0, 0.5, 0], toys); add(cyl, [chestX, floorY + 24, chestZ - 1], [3.2, 12, 3.2], '#f2b632', [0.5, 0, 0.9], toys);

  // a big teddy bear sitting in the corner
  const bearX = cornerX + 44, bearZ = cornerZ + 46, fur = '#c98a4e', fur2 = '#e3b27d';
  add(ball, [bearX, floorY + 14, bearZ], [13, 15, 12], fur, [0, 0, 0], toys); add(ball, [bearX, floorY + 11, bearZ + 6], [8, 9, 6.5], fur2, [0, 0, 0], toys); add(ball, [bearX, floorY + 32, bearZ + 1], [10, 9.5, 9.5], fur, [0, 0, 0], toys);
  add(ball, [bearX, floorY + 29.5, bearZ + 8], [4.4, 3.6, 3.6], fur2, [0, 0, 0], toys); add(ball, [bearX, floorY + 31, bearZ + 11], [1.5, 1.2, 1.2], '#3a2418', [0, 0, 0], toys);
  for (const s of [-1, 1]) { add(ball, [bearX + s * 7.5, floorY + 40, bearZ], 3.6, fur, [0, 0, 0], toys); add(ball, [bearX + s * 4, floorY + 33.5, bearZ + 9], 1.2, '#3a2418', [0, 0, 0], toys); add(ball, [bearX + s * 14, floorY + 17, bearZ + 3], [4.2, 7, 4.2], fur, [0, 0, 0.5 * s], toys); add(ball, [bearX + s * 7, floorY + 3.5, bearZ + 9], [5, 3.5, 6.5], fur2, [0, 0, 0], toys); }
  add(box, [bearX, floorY + 22.6, bearZ + 6.5], [14, 2.4, 3], '#e8504a', [0, 0, 0], toys);

  // child chairs beside the table and a floor lamp
  for (const [px, pz, yaw] of [[X0 - 18, cz + 6, -Math.PI / 2], [cx - 6, Z0 - 18, Math.PI]]) {
    add(box, [px, floorY + 17, pz], [17, 2, 17], '#58b65a', [0, yaw, 0], toys);
    for (const [dx, dz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) { const lx = px + Math.cos(yaw) * dx + Math.sin(yaw) * dz, lz = pz - Math.sin(yaw) * dx + Math.cos(yaw) * dz; add(box, [lx, floorY + 8, lz], [2, 16, 2], '#d89c5f', [0, yaw, 0], toys); }
    const bx = px - Math.sin(yaw) * 8, bz = pz - Math.cos(yaw) * 8; add(box, [bx, floorY + 28, bz], [Math.abs(Math.cos(yaw)) * 17 + Math.abs(Math.sin(yaw)) * 2, 17, Math.abs(Math.cos(yaw)) * 2 + Math.abs(Math.sin(yaw)) * 17], '#58b65a', [0, 0, 0], toys);
  }
  // giant alphabet blocks on the floor, stacked
  const blocks = [];
  const blockMesh = (letter, color, p, size, yaw) => { const m = new T.Mesh(new T.BoxGeometry(size, size, size), new T.MeshStandardMaterial({ map: letterBlock(letter, color), roughness: 0.7 })); m.position.set(...p); m.rotation.y = yaw; m.castShadow = true; blocks.push(m); group.add(m); disposables.push(m.geometry, m.material, m.material.map); };
  const kx = X0 - 46, kz = Z1 - 10; blockMesh('A', '#e8504a', [kx, floorY + 7, kz], 14, 0.3); blockMesh('B', '#3f8fe0', [kx + 17, floorY + 7, kz + 4], 14, -0.2); blockMesh('C', '#f2b632', [kx + 7, floorY + 21, kz + 2], 14, 0.5);
  add(ball, [X0 - 40, floorY + 9, Z1 + 26], 9, '#e8504a', [0, 0, 0], toys); add(ball, [X0 - 40, floorY + 9, Z1 + 26], [9.2, 2, 9.2], '#fff4d6', [0, 0, 0], toys);
  add(cyl, [cornerX + 190, floorY + 21, cornerZ + 16], [2, 42, 2], '#6b4a30', [0, 0, 0], toys); add(cyl, [cornerX + 190, floorY + 3, cornerZ + 16], [9, 2.2, 9], '#6b4a30', [0, 0, 0], toys);
  const shade = new T.Mesh(new T.CylinderGeometry(10, 15, 15, 20, 1, true), new T.MeshBasicMaterial({ color: '#ffe9b0', side: T.DoubleSide, toneMapped: false })); shade.position.set(cornerX + 190, floorY + 49, cornerZ + 16); group.add(shade); disposables.push(shade.geometry, shade.material);

  const fit = [[X0, TABLE_Y, Z0], [X1, TABLE_Y, Z0], [X0, TABLE_Y, Z1], [X1, TABLE_Y, Z1], [X1, TABLE_Y - 22, Z1], [X0, TABLE_Y - 22, Z1], [X1, TABLE_Y - 22, Z0]].map((p) => new T.Vector3(...p));
  const meshes = [[wood, '#ffffff'], [toys, '#ffffff']].map(([batch]) => { const m = new T.Mesh(batch.geometry(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); m.castShadow = true; m.receiveShadow = true; group.add(m); disposables.push(m.geometry, m.material); return m; });
  disposables.push(mat.geometry, mat.material);

  // the table's contact shadow lies in the floor's shore tile: dark under and just around the table, light farther away
  const cell = 2, pad = 40, nx = Math.ceil((W + 2 * pad) / cell), nz = Math.ceil((D + 2 * pad) / cell), tx0 = X0 - pad, tz0 = Z0 - pad, data = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = tx0 + (i + 0.5) * cell, z = tz0 + (j + 0.5) * cell, d = Math.hypot(Math.max(Math.abs(x - cx) - W / 2 + 8, 0), Math.max(Math.abs(z - cz) - D / 2 + 8, 0)); data[j * nx + i] = Math.min(255, Math.round((d / 24) * 255 * 0.5)); }
  sea?.paint(data, nx, nz, tx0, tz0, cell);
  return {
    group, heightAt: () => TABLE_Y, ready: Promise.resolve(), floorY, fitPoints: () => fit, table: { x0: X0, x1: X1, z0: Z0, z1: Z1, y: TABLE_Y },
    release() { group.removeFromParent(); sea?.clear(tx0, tz0, nx, nz, cell); for (const d of disposables) d.dispose?.(); },
  };
}
