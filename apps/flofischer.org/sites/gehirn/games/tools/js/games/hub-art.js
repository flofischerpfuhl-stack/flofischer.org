/** Canvas-drawn surfaces for the hub: fern mark, banners, cabinet headers, rug, stone floor, soft blobs. */
export const FONT = '"Geist", "Inter", system-ui, sans-serif';

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

/** The Fernwork fern-leaf mark: a curved stem with paired leaflets, tip at (cx, baseY - h). */
export function drawFern(g, cx, baseY, h, color) {
  g.save();
  g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
  g.lineWidth = Math.max(1.5, h * .035);
  g.beginPath(); g.moveTo(cx, baseY + h * .1); g.lineTo(cx, baseY - h); g.stroke();
  const pairs = 7;
  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1), y = baseY - h * (.14 + t * .72), len = h * (.3 - t * .17), rise = (1 - t * .35) * .9;
    for (const side of [-1, 1]) {
      g.save(); g.translate(cx, y); g.scale(side, 1); g.rotate(-rise);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .45, -len * .26, len, 0); g.quadraticCurveTo(len * .5, len * .2, 0, 0); g.fill();
      g.restore();
    }
  }
  g.beginPath(); g.moveTo(cx, baseY - h * 1.04); g.quadraticCurveTo(cx + h * .09, baseY - h * .88, cx, baseY - h * .78); g.quadraticCurveTo(cx - h * .09, baseY - h * .88, cx, baseY - h * 1.04); g.fill();
  g.restore();
}

export function bannerTexture(palette) {
  const [canvas, g] = makeCanvas(256, 576), dark = palette.dark;
  const shape = (inset = 0) => { g.beginPath(); g.moveTo(inset, inset); g.lineTo(256 - inset, inset); g.lineTo(256 - inset, 480 - inset * .4); g.lineTo(128, 572 - inset * 1.4); g.lineTo(inset, 480 - inset * .4); g.closePath(); };
  shape(); g.fillStyle = dark ? '#0c1410' : palette['accent-fill']; g.fill();
  shape(14); g.lineWidth = dark ? 5 : 3; g.strokeStyle = dark ? palette['accent-fill'] : 'rgba(255,255,255,.55)'; g.stroke();
  drawFern(g, 128, 360, 230, dark ? palette['accent-fill'] : palette['accent-on']);
  return canvas;
}

/** Cabinet marquee: header colour, title and a fern mark on each end. */
export function headerTexture(canvas, title, palette) {
  const g = canvas.getContext('2d'), { width: w, height: h } = canvas, dark = palette.dark;
  g.clearRect(0, 0, w, h);
  const shell = palette.shell || palette['accent-fill'];
  g.fillStyle = dark ? '#161a2c' : shell; g.fillRect(0, 0, w, h);
  g.lineWidth = h * .07; g.strokeStyle = dark ? shell : 'rgba(255,255,255,.55)'; g.strokeRect(h * .1, h * .1, w - h * .2, h * .8);
  const ink = dark ? '#ffffff' : '#ffffff', mark = dark ? shell : '#ffffff';
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = h * .56; g.font = `700 ${size}px ${FONT}`;
  const room = w * .66; const measured = g.measureText(title).width; if (measured > room) { size *= room / measured; g.font = `700 ${size}px ${FONT}`; }
  g.fillText(title, w / 2, h * .54);
  drawFern(g, w * .085, h * .86, h * .56, mark); drawFern(g, w * .915, h * .86, h * .56, mark);
  return canvas;
}

export function rugTexture(palette) {
  const [canvas, g] = makeCanvas(1024, 1024), dark = palette.dark, c = 512;
  g.clearRect(0, 0, 1024, 1024);
  const disc = (r, color) => { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); };
  if (dark) {
    disc(500, '#0f3d2e'); disc(450, '#15533b');
    g.lineWidth = 12; g.strokeStyle = palette['accent-fill']; g.beginPath(); g.arc(c, c, 480, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.globalAlpha = .6; g.beginPath(); g.arc(c, c, 420, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    drawFern(g, c, c + 190, 380, palette['accent-fill']);
  } else {
    disc(500, '#7fc79a'); disc(440, '#bfe6cc'); disc(405, '#d9f2e2');
    g.lineWidth = 10; g.strokeStyle = palette['accent-fill']; g.globalAlpha = .75; g.beginPath(); g.arc(c, c, 470, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    drawFern(g, c, c + 190, 380, '#ffffff');
  }
  return canvas;
}

/** Neutral stone tiles; the material colour tints them. */
export function stoneTexture() {
  const [canvas, g] = makeCanvas(512, 512);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const v = 232 + Math.floor(rnd() * 22); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(tx * 256 + 3, ty * 256 + 3, 250, 250);
    for (let i = 0; i < 140; i++) { const s = 1 + rnd() * 5, a = .025 + rnd() * .03; g.fillStyle = rnd() > .5 ? `rgba(255,255,255,${a})` : `rgba(90,80,60,${a})`; g.fillRect(tx * 256 + rnd() * 250, ty * 256 + rnd() * 250, s * 7, s * 3); }
  }
  g.fillStyle = 'rgba(80,72,60,.22)'; for (let i = 0; i < 2; i++) { g.fillRect(i * 256 - 1.5, 0, 3, 512); g.fillRect(0, i * 256 - 1.5, 512, 3); }
  return canvas;
}

export function blobTexture(alpha = .4) {
  const [canvas, g] = makeCanvas(128, 128), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, `rgba(20,18,14,${alpha})`); grad.addColorStop(.6, `rgba(20,18,14,${alpha * .45})`); grad.addColorStop(1, 'rgba(20,18,14,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return canvas;
}

/**
 * Floor: a big diamond pattern made of small diamond tiles with grout, a gentle per-tile colour variation and a
 * soft bevel highlight (painted, low frequency, like a Nintendo interior). One texture per theme.
 */
export function floorTexture(dark) {
  const S = 1024, [canvas, g] = makeCanvas(S, S);
  const pal = dark ? { a: [30, 76, 78], b: [40, 106, 94], c: [58, 146, 112], grout: '#0d2829' } : { a: [255, 243, 222], b: [255, 219, 172], c: [255, 250, 236], grout: '#e9cfa6' };
  g.fillStyle = pal.grout; g.fillRect(0, 0, S, S);
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const D = 128, r = D - 3; // half-diagonal of a tile, minus the grout
  for (let j = -1; j <= S / D + 1; j++) for (let i = -1; i <= S / D + 1; i++) {
    if ((i + j) & 1) continue;
    const cx = i * D, cy = j * D, mx = ((cx % 512) + 512) % 512, my = ((cy % 512) + 512) % 512, dd = Math.abs(mx - 256) + Math.abs(my - 256);
    const base = dd < 130 ? pal.c : dd <= 258 ? pal.b : pal.a, jit = 1 + (hash(((i % 8) + 8) % 8, ((j % 8) + 8) % 8) - .5) * .07;
    const col = base.map(v => Math.max(0, Math.min(255, Math.round(v * jit))));
    const grad = g.createLinearGradient(cx - r * .6, cy - r * .6, cx + r * .6, cy + r * .6);
    grad.addColorStop(0, `rgb(${col.map(v => Math.min(255, v + 9)).join(',')})`); grad.addColorStop(1, `rgb(${col.map(v => Math.max(0, v - 9)).join(',')})`);
    g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath();
    g.fillStyle = grad; g.fill();
  }
  return canvas;
}

/** Soft dark vignette for the floor (darker towards the walls and corners); drawn black, opacity set per theme. */
export function vignetteTexture() {
  const [canvas, g] = makeCanvas(256, 256), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(8,16,18,0)'); grad.addColorStop(.5, 'rgba(8,16,18,0)'); grad.addColorStop(.8, 'rgba(8,16,18,.45)'); grad.addColorStop(1, 'rgba(8,16,18,.85)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return canvas;
}

export function glowTexture() {
  const [canvas, g] = makeCanvas(128, 128), grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,.9)'); grad.addColorStop(.35, 'rgba(255,255,255,.28)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return canvas;
}
