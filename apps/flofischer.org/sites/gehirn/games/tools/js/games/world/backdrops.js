/**
 * The painted backdrop behind the world map: what stands beyond the sea at the horizon. A 768 x 512 canvas that the scene stretches
 * over the screen; the world view puts the horizon at `horizon` (a fraction of the height from the top), so everything beyond it
 * lives in that strip. Each game paints its own: open sea (Rangers), distant peaks (Pip), a dusk sky with far floating islands
 * (Fernling-Arena), the playroom wall (Bounce Brigade).
 */
import { THREE } from '../three-kit.js';

const W = 768, H = 512;
const shade = (hex, dark) => { const c = new THREE.Color(hex); if (dark) c.multiplyScalar(0.35); return `#${c.getHexString()}`; };

function gradient(g, y0, y1, stops) { const grad = g.createLinearGradient(0, y0, 0, y1); for (const [at, color] of stops) grad.addColorStop(at, color); g.fillStyle = grad; g.fillRect(0, y0, W, y1 - y0); }

function openSea(g, { world, dark, sky }) {
  const base = new THREE.Color(sky); if (dark) base.multiplyScalar(0.35);
  const skyHex = `#${base.getHexString()}`;
  gradient(g, 0, H, [[0, dark ? '#101b2a' : skyHex], [0.6, dark ? skyHex : '#f5efe0'], [1, dark ? '#19232d' : skyHex]]);
  const sun = g.createRadialGradient(140, 95, 5, 140, 95, 150); sun.addColorStop(0, dark ? '#d4e7f455' : '#fff6ccaa'); sun.addColorStop(1, '#ffffff00'); g.fillStyle = sun; g.fillRect(0, 0, 350, 280);
  for (let layer = 0; layer < 3; layer++) {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 24) { const wave = Math.sin(x * 0.009 + world * 1.9 + layer) * 26 + Math.sin(x * 0.023 + layer * 3.1) * 11; g.lineTo(x, 310 + layer * 55 + wave * (world === 2 ? 1.7 : 1)); }
    g.lineTo(W, H); g.closePath();
    const ridge = new THREE.Color(['#658d76', '#b28754', '#8da7c6', '#8d6777', '#6a7e92'][world] ?? '#658d76'); if (dark) ridge.multiplyScalar(0.65);
    g.fillStyle = `#${ridge.getHexString()}${['26', '38', '49'][layer]}`; g.fill();
  }
}

/** Pip: a high, clear sky; ranges of peaks standing in the cloud sea, snow on their tips. */
function peaks(g, { dark, horizon }) {
  const line = horizon * H;
  gradient(g, 0, H, [[0, shade('#3f7fd8', dark)], [horizon, shade('#a9d2f5', dark)], [Math.min(1, horizon + 0.02), shade('#e6f1fc', dark)], [1, shade('#e6f1fc', dark)]]);
  const sun = g.createRadialGradient(610, line * 0.45, 4, 610, line * 0.45, 120); sun.addColorStop(0, dark ? '#e6efff44' : '#fffbe0cc'); sun.addColorStop(1, '#ffffff00'); g.fillStyle = sun; g.fillRect(400, 0, 368, line * 1.5);
  for (const [layer, tone, snow, scale] of [[0, '#9db8dc', '#f4f8ff', 0.8], [1, '#7a98c6', '#ffffff', 1]]) {
    const peaks = [];
    for (let x = -40 + layer * 30, k = 0; x < W + 80; k++) { const w = 60 + ((k * 37 + layer * 11) % 50), h = (18 + ((k * 53 + layer * 29) % 40)) * scale * 1.4; peaks.push([x + w / 2, line + 4 - h, w]); x += w * 0.8; }
    g.fillStyle = shade(tone, dark);
    for (const [x, y, w] of peaks) { g.beginPath(); g.moveTo(x - w * 0.75, line + 4); g.lineTo(x - w * 0.08, y + 3); g.lineTo(x, y); g.lineTo(x + w * 0.1, y + 4); g.lineTo(x + w * 0.75, line + 4); g.closePath(); g.fill(); }
    g.fillStyle = shade(snow, dark);
    for (const [x, y, w] of peaks) { const d = (line + 4 - y) * 0.36; g.beginPath(); g.moveTo(x - d * 0.52, y + d); g.lineTo(x - d * 0.14, y + d * 0.78); g.lineTo(x, y); g.lineTo(x + d * 0.16, y + d * 0.8); g.lineTo(x + d * 0.55, y + d); g.lineTo(x + d * 0.2, y + d * 0.88); g.lineTo(x - d * 0.12, y + d * 1.02); g.closePath(); g.fill(); void w; }
  }
  for (let i = 0; i < 7; i++) { const x = (i * 131 + 40) % W, y = line * (0.3 + 0.5 * ((i * 37) % 10) / 10); g.fillStyle = shade('#ffffff', dark); g.globalAlpha = 0.55; g.beginPath(); g.ellipse(x, y, 46, 7, 0, 0, Math.PI * 2); g.fill(); g.ellipse(x + 20, y - 5, 28, 6, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
}

/** Fernling-Arena: dusk above the clouds, a low sun, far floating islands in violet. */
function dusk(g, { dark, horizon }) {
  const line = horizon * H;
  gradient(g, 0, H, [[0, shade('#5f3fa8', dark)], [horizon * 0.55, shade('#d36fb0', dark)], [horizon, shade('#ffc79a', dark)], [Math.min(1, horizon + 0.02), shade('#ffd9b8', dark)], [1, shade('#ffd9b8', dark)]]);
  const sun = g.createRadialGradient(560, line - 6, 6, 560, line - 6, 150); sun.addColorStop(0, dark ? '#ffd9aa55' : '#fff3c8ee'); sun.addColorStop(0.35, dark ? '#ff9a7a22' : '#ffd08a88'); sun.addColorStop(1, '#ffffff00'); g.fillStyle = sun; g.fillRect(380, 0, 380, line + 20);
  g.fillStyle = shade('#fff6d6', dark); g.beginPath(); g.arc(560, line - 6, 20, 0, Math.PI * 2); g.fill();
  const far = shade('#8a5fb4', dark), farLow = shade('#b078b8', dark);
  for (const [x, y, w, k] of [[90, 0.62, 56, 1], [250, 0.4, 36, 0.7], [380, 0.72, 64, 1.1], [690, 0.5, 44, 0.8]]) {
    const cy = line * y, h = 22 * k;
    g.fillStyle = k > 0.9 ? far : farLow; g.beginPath(); g.ellipse(x, cy, w, 6 * k, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - w * 0.85, cy + 2); g.quadraticCurveTo(x - w * 0.3, cy + h * 0.9, x, cy + h); g.quadraticCurveTo(x + w * 0.3, cy + h * 0.9, x + w * 0.85, cy + 2); g.closePath(); g.fill();
    g.fillStyle = shade('#6fbf8f', dark); g.globalAlpha = 0.8; g.beginPath(); g.ellipse(x, cy - 2, w * 0.8, 4 * k, 0, Math.PI, 0); g.fill(); g.globalAlpha = 1;
  }
  if (dark) for (let i = 0; i < 24; i++) { g.fillStyle = '#ffffffaa'; g.fillRect((i * 97) % W, (i * 53) % Math.max(8, line - 20), 2, 2); }
}

/** Bounce Brigade: the playroom wall above the floor: stripes of wallpaper, a shelf of toys, a window, the skirting board. */
function playroom(g, { dark, horizon }) {
  const line = horizon * H;
  g.fillStyle = shade('#e4cfa2', dark); g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 48) { g.fillStyle = shade('#efddb4', dark); g.fillRect(x, 0, 24, line); }
  g.fillStyle = shade('#c9a876', dark); g.fillRect(0, line - 4, W, 4);
  g.fillStyle = shade('#7a4e2b', dark); g.fillRect(0, line - 17, W, 14); g.fillStyle = shade('#9a6a3e', dark); g.fillRect(0, line - 17, W, 4);
  // window, with a sky and curtains
  const wx = 96, wy = 12, ww = 138, wh = line - 40;
  g.fillStyle = shade('#8fc4ee', dark); g.fillRect(wx, wy, ww, wh); g.fillStyle = shade('#ffffff', dark); g.globalAlpha = 0.8; g.beginPath(); g.ellipse(wx + 50, wy + 22, 28, 8, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.fillStyle = shade('#f7f1e2', dark); g.fillRect(wx - 5, wy - 5, ww + 10, 5); g.fillRect(wx - 5, wy + wh, ww + 10, 6); g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  g.fillStyle = shade('#d9574f', dark); g.fillRect(wx - 16, wy - 8, 20, wh + 12); g.fillRect(wx + ww - 6, wy - 8, 20, wh + 12);
  // shelf with blocks, a ball and a toy train
  const sy = line - 40;
  g.fillStyle = shade('#8c5a30', dark); g.fillRect(330, sy, 400, 6);
  const toys = [['#e8504a', 22], ['#f2b632', 30], ['#3f8fe0', 18], ['#58b65a', 26], ['#e8504a', 20]];
  let x = 344;
  for (const [color, size] of toys) { g.fillStyle = shade(color, dark); g.fillRect(x, sy - size, size, size); x += size + 6; }
  g.fillStyle = shade('#f2b632', dark); g.beginPath(); g.arc(x + 14, sy - 14, 14, 0, Math.PI * 2); g.fill(); x += 40;
  g.fillStyle = shade('#3f8fe0', dark); g.fillRect(x, sy - 18, 60, 18); g.fillStyle = shade('#e8504a', dark); g.fillRect(x + 6, sy - 28, 22, 10); g.fillStyle = shade('#222a33', dark);
  for (const cx of [x + 12, x + 30, x + 48]) { g.beginPath(); g.arc(cx, sy, 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = shade('#d7e8f2', dark); g.fillRect(630, 10, 64, 44); g.fillStyle = shade('#a66a3a', dark); g.fillRect(626, 6, 72, 4); g.fillRect(626, 54, 72, 4); g.fillRect(626, 6, 4, 52); g.fillRect(694, 6, 4, 52);
  g.fillStyle = shade('#e8504a', dark); g.fillRect(640, 18, 14, 14); g.fillStyle = shade('#58b65a', dark); g.fillRect(660, 28, 14, 14);
}

const PAINTERS = { sea: openSea, peaks, dusk, playroom };

/** g: 2D context of a 768 x 512 canvas. kind: one of the style backdrops. */
export function paintBackdrop(g, kind, options) { (PAINTERS[kind] ?? openSea)(g, options); }
