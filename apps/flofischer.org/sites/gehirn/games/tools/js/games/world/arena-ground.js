/** Painted, low-frequency arena ground in the cel language of the Rangers lawn: broad soft bands, a few big shapes and
 * flat colour per region instead of a photo texture. One 10m tile per world plus the ring/band painting that goes into
 * the arena overlay. */
import { THREE } from '../three-kit.js';

const TAU = Math.PI * 2, TILE = 256;
const step = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixc = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];

/** Region palettes: tile colours (a darker, b lighter), the overlay rings (light/dark rgb strings) and the ring accent. */
export const GROUND_PALETTE = [
  { a: [0x4a, 0xa0, 0x2a], b: [0x72, 0xc2, 0x3a], blot: [0x3a, 0x8e, 0x28], light: '156,220,78', dark: '34,112,40', accent: '255,236,150' },
  { a: [0xe6, 0xa4, 0x4c], b: [0xf2, 0xc2, 0x72], blot: [0xdc, 0x96, 0x44], light: '255,232,160', dark: '196,118,52', accent: '255,246,206' },
  { a: [0xd4, 0xe4, 0xf4], b: [0xfb, 0xfe, 0xff], blot: [0xa9, 0xc9, 0xea], light: '255,255,255', dark: '132,178,222', accent: '255,255,255' },
  { a: [0x46, 0x34, 0x40], b: [0x6c, 0x54, 0x60], blot: [0x2a, 0x1e, 0x2a], light: '138,108,120', dark: '18,12,20', accent: '168,86,60' },
];

const cache = new Map();
export function paintedGround(world) {
  if (cache.has(world)) return cache.get(world);
  const cv = document.createElement('canvas'); cv.width = cv.height = TILE;
  const g = cv.getContext('2d'), img = g.createImageData(TILE, TILE), P = GROUND_PALETTE[world];
  let seed = 11 + world * 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blots = Array.from({ length: world === 3 ? 0 : 3 }, () => ({ x: r(), y: r(), s: 0.1 + r() * 0.1 }));
  const cells = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push({ x: (i + 0.2 + r() * 0.6) / 3, y: (j + 0.2 + r() * 0.6) / 3, h: r() });
  const wrap = (d) => d - Math.round(d);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const u = x / TILE, v = y / TILE; let col;
    if (world === 3) {
      let d1 = 9, d2 = 9, c1 = null;
      for (const c of cells) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const d = Math.hypot(u - c.x - ox, v - c.y - oy);
        if (d < d1) { d2 = d1; d1 = d; c1 = c; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1, plate = 0.3 + 0.3 * (Math.floor(c1.h * 3) / 2) + 0.25 * step(0.2, 0.03, d1);
      col = mixc(P.a, P.b, Math.min(1, plate * 0.9));
      if (edge < 0.05) col = mixc(col, [0x16, 0x0e, 0x16], step(0.05, 0.015, edge));
    } else {
      let t;
      if (world === 1) { const w = (u * 2 + v) * TAU + 0.7 * Math.sin(u * TAU * 2 + 1) + 0.5 * Math.sin(v * TAU * 3); t = 0.5 + 0.5 * Math.sin(w); t = step(0.25, 0.75, t); }
      else { const w = v + 0.04 * Math.sin(u * TAU) + 0.018 * Math.sin(u * TAU * 3 + 1); t = 0.5 + 0.5 * Math.sin(w * TAU); t = step(0.3, 0.7, t); }
      col = mixc(P.a, P.b, t);
      for (const b of blots) { const d = Math.hypot(wrap(u - b.x), wrap(v - b.y) * 1.2); col = mixc(col, P.blot, step(b.s, b.s * 0.62, d) * 0.4); }
    }
    const i = (y * TILE + x) * 4;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, col[c]));
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4; tex.repeat.set(16, 16);
  cache.set(world, tex);
  return tex;
}

/** Concentric bands, an inked playfield border ring and a plaza halo, painted under the routes. */
export function paintArenaRings(g, { world, R, px, scale, plaza }) {
  const P = GROUND_PALETTE[world], ring = (radius, width, rgba) => { g.strokeStyle = rgba; g.lineWidth = width * scale; g.beginPath(); g.arc(px(0), px(0), radius * scale, 0, TAU); g.stroke(); };
  const first = plaza + 1.1, band = 3.3, outer = R - 2.2;
  for (let k = 0, r0 = first; r0 + band * 0.5 < outer; k++, r0 += band) ring(r0 + band / 2, band, `rgba(${k % 2 ? P.light : P.dark},${world === 3 ? 0.22 : 0.15})`);
  ring(outer, 1.5, `rgba(${P.light},0.45)`);
  ring(outer - 0.95, 0.14, `rgba(${P.dark},0.55)`);
  ring(outer + 0.95, 0.14, `rgba(${P.dark},0.55)`);
  ring(plaza + 0.55, 1.1, `rgba(${P.accent},${world === 3 ? 0.35 : 0.3})`);
}

/** A scalloped grass/drift/ash frill (unit radius) with lighter blade tips: sits at the feet of props instead of a flat disc. */
export function frillGeometry(blades = 21) {
  const P = [0, 0, 0], C = [0.78, 0.78, 0.78], I = [];
  for (let k = 0; k < blades * 2; k++) {
    const a = (k / (blades * 2)) * TAU, tip = k % 2 === 0, rad = tip ? 1 : 0.8;
    P.push(Math.cos(a) * rad, tip ? 0.006 : 0, Math.sin(a) * rad); const l = tip ? 1.28 : 0.95; C.push(l, l, l);
  }
  for (let k = 0; k < blades * 2; k++) I.push(0, 1 + ((k + 1) % (blades * 2)), 1 + k);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(I);
  return geo;
}
