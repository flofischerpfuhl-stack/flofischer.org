/** Procedural dressing for the Pip's Tower scenery: per-world palettes, canvas masonry and roof textures, window spots.
 * Runs while a level is built (the diorama is baked once), never per frame. No assets, only canvas and primitives.
 */
import { THREE as T } from "../three-kit.js";

/** One look per world: brick / sandstone / ice / basalt wall, slab and lip colours, window glass, banner, backdrop layers. */
export const STYLE = [
  { // Viridis: red brick tower, grass-lipped stone slabs, warm lanterns
    wall: "brick", back: 0x8e4b3d, mortar: 0x5a3a33, pier: 0xa66a52, slab: 0xe3d3ae, lip: 0x62c241, frame: 0x7d6a58,
    glass: 0xffd98a, banner: 0xc83c2c, emblem: 0xffe08a, roof: 0xc2412d, roofLip: 0x8f2a1f, accent: 0x3f9b4a,
    hills: [0x5fa24c, 0x7cba6a, 0x9ccf92], peak: null, rockTint: 0xe8d4b0, lamp: 0xffc47a,
  },
  { // Sahrun: ochre sandstone, sand-drift lips, teal banners, dusk windows
    wall: "blocks", back: 0x9b5a34, mortar: 0x5a3320, pier: 0xd8a465, slab: 0xf6e4b4, lip: 0xffd45e, frame: 0xa86a3a,
    glass: 0xffb347, banner: 0x1f9fa0, emblem: 0xffe9a8, roof: 0xd9783a, roofLip: 0xa8501f, accent: 0x2aa6a0,
    hills: [0xe0a85c, 0xe9bf82, 0xf0d2a4], peak: "mesa", rockTint: 0xffe0b0, lamp: 0xffb25a,
  },
  { // Hibern: blue ice blocks, thick snow lips, cold crystal light
    wall: "ice", back: 0x52799a, mortar: 0x2f5070, pier: 0x86adc8, slab: 0xe6f4ff, lip: 0xffffff, frame: 0x6f8fb0,
    glass: 0xa8f0ff, banner: 0x2e6fd6, emblem: 0xe8fbff, roof: 0x3d6fc4, roofLip: 0xf4fbff, accent: 0x6fd6ff,
    hills: [0xb9d4ec, 0xd2e4f4, 0xe6f1fa], peak: "snow", rockTint: 0xc8def2, lamp: 0x9fe8ff,
  },
  { // Vulkara: black basalt with glowing seams, ember lips, lava glow
    wall: "basalt", back: 0x3a3340, mortar: 0x221c28, pier: 0x6a5f70, slab: 0x8b8190, lip: 0xff7a22, frame: 0x4a414f,
    glass: 0xff8a3a, banner: 0xd8431c, emblem: 0xffd25a, roof: 0x7a2a4e, roofLip: 0xff7a22, accent: 0xff7a22,
    hills: [0x4b3a42, 0x6a4b52, 0x8c5f58], peak: "volcano", rockTint: 0x9d94a4, lamp: 0xff9a4a,
  },
];

const css = (hex, k = 1, a = 1) => {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgba(${c((hex >> 16) & 255)},${c((hex >> 8) & 255)},${c(hex & 255)},${a})`;
};
const lcg = (seed) => {
  let a = seed >>> 0;
  return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296;
};

export function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Brick / block / ice / basalt masonry. `tone` scales the base colour (piers lighter, back wall darker). Returns { map, emissive? }. */
export function masonry(kind, base, mortar, seed, { w = 512, h = 1024, tone = 1 } = {}) {
  const rand = lcg(seed);
  const rows = kind === "brick" ? 46 : kind === "basalt" ? 0 : 22;
  const rowH = kind === "brick" ? 22 : 44;
  let glow = null;
  const map = canvasTexture(w, h, (g) => {
    g.fillStyle = css(mortar, tone);
    g.fillRect(0, 0, w, h);
    if (kind === "basalt") {
      glow = document.createElement("canvas");
      glow.width = w;
      glow.height = h;
      const e = glow.getContext("2d");
      e.fillStyle = "#000";
      e.fillRect(0, 0, w, h);
      let x = 0;
      while (x < w) {
        const cw = 38 + rand() * 30;
        let y = 0;
        while (y < h) {
          const ch = 90 + rand() * 170,
            k = 0.78 + rand() * 0.5;
          g.fillStyle = css(base, tone * k);
          g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
          g.fillStyle = css(0xffffff, 1, 0.09);
          g.fillRect(x + 2, y + 2, 5, ch - 4);
          g.fillStyle = css(0x000000, 1, 0.22);
          g.fillRect(x + cw - 8, y + 2, 6, ch - 4);
          // glowing seam: a jagged ember line along the column's right edge and across its foot
          e.strokeStyle = "rgba(255,120,30,0.95)";
          e.lineWidth = 3;
          e.beginPath();
          e.moveTo(x + cw - 1, y);
          for (let yy = y; yy < y + ch; yy += 14) e.lineTo(x + cw - 1 + (rand() - 0.5) * 5, yy + 14);
          e.lineTo(x, y + ch - 1);
          e.stroke();
          y += ch;
        }
        x += cw;
      }
    } else {
      for (let r = 0; r * rowH < h; r++) {
        const y = r * rowH,
          bw = kind === "brick" ? 56 : 80 + rand() * 60;
        let x = -((r % 2) * bw * 0.5) - rand() * 20,
          bwv = bw;
        while (x < w) {
          if (kind !== "brick") bwv = 70 + rand() * 80;
          const k = 0.86 + rand() * 0.3,
            tint = kind === "ice" ? [0.92 + rand() * 0.1, 1, 1.06] : [1, 1, 1];
          g.fillStyle = css(base, tone * k).replace(/rgba\((\d+),(\d+),(\d+)/, (m, a, b, c) => `rgba(${Math.min(255, a * tint[0]) | 0},${Math.min(255, b * tint[1]) | 0},${Math.min(255, c * tint[2]) | 0}`);
          g.fillRect(x + 1.5, y + 1.5, bwv - 3, rowH - 3);
          g.fillStyle = css(0xffffff, 1, kind === "ice" ? 0.28 : 0.13);
          g.fillRect(x + 1.5, y + 1.5, bwv - 3, kind === "ice" ? 6 : 3);
          g.fillStyle = css(0x000000, 1, 0.2);
          g.fillRect(x + 1.5, y + rowH - 6, bwv - 3, 4.5);
          if (kind === "brick" && rand() < 0.1) {
            g.fillStyle = css(0x3f8a3a, 1, 0.55);
            g.fillRect(x + rand() * (bwv - 12), y + rowH - 10, 12, 8);
          }
          if (kind === "blocks" && rand() < 0.16) {
            g.fillStyle = css(mortar, tone * 0.9, 0.55);
            const gx = x + 10 + rand() * (bwv - 40);
            g.fillRect(gx, y + 12, 5, 18);
            g.fillRect(gx + 9, y + 12, 14, 5);
            g.fillRect(gx + 9, y + 25, 14, 5);
          }
          if (kind === "ice" && rand() < 0.2) {
            g.strokeStyle = css(0xffffff, 1, 0.6);
            g.lineWidth = 2;
            g.beginPath();
            const cx = x + 10 + rand() * (bwv - 20);
            g.moveTo(cx, y + 6);
            g.lineTo(cx + 9, y + 20);
            g.lineTo(cx - 2, y + 34);
            g.stroke();
          }
          x += bwv;
        }
      }
    }
    // soft darkening towards the edges: the wall sits in a recess
    const v = g.createLinearGradient(0, 0, w, 0);
    v.addColorStop(0, "rgba(0,0,0,.34)");
    v.addColorStop(0.16, "rgba(0,0,0,0)");
    v.addColorStop(0.84, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.34)");
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  });
  let emissive = null;
  if (glow) {
    emissive = new T.CanvasTexture(glow);
    emissive.colorSpace = T.SRGBColorSpace;
  }
  return { map, emissive };
}

/** Roof shingles: scalloped rows, optional snow on the upper part. */
export function shingles(color, trim, snow = false, seed = 5) {
  const rand = lcg(seed);
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = css(color, 0.7);
    g.fillRect(0, 0, w, h);
    const rh = 16, tw = 32;
    for (let r = 0; r * rh < h + rh; r++) {
      for (let x = -((r % 2) * tw) / 2; x < w; x += tw) {
        const k = 0.88 + rand() * 0.26;
        g.fillStyle = css(color, k);
        g.beginPath();
        g.moveTo(x + 1, r * rh);
        g.lineTo(x + tw - 1, r * rh);
        g.lineTo(x + tw - 1, r * rh + rh * 0.5);
        g.quadraticCurveTo(x + tw / 2, r * rh + rh * 1.35, x + 1, r * rh + rh * 0.5);
        g.fill();
        g.strokeStyle = css(0x000000, 1, 0.28);
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    if (snow) {
      g.fillStyle = "rgba(255,255,255,.95)";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, 0);
      for (let x = w; x >= 0; x -= 16) g.lineTo(x, h * 0.42 + Math.sin(x * 0.2) * 7 + 6);
      g.fill();
    }
    g.fillStyle = css(trim, 1, 0.9);
    g.fillRect(0, h - 5, w, 5);
  });
}

export const archShape = (w, h) => {
  const r = w / 2,
    sh = new T.Shape();
  sh.moveTo(-r, 0);
  sh.lineTo(-r, h - r);
  sh.absarc(0, h - r, r, Math.PI, 0, true);
  sh.lineTo(r, 0);
  sh.closePath();
  return sh;
};

/** Hip roof: a rectangle (half width hw, half depth hd) rising to a ridge (half length rl) at height h. Own UVs for the shingles. */
export function hipRoofGeometry(hw, hd, rl, h, repeat = 2.2) {
  const B = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]],
    R = [[-rl, h, 0], [rl, h, 0]];
  const tris = [
    [B[0], B[1], R[1], R[0], 0], // front trapezoid
    [B[2], B[3], R[0], R[1], 0], // back trapezoid
    [B[1], B[2], R[1], null, 1], // right triangle
    [B[3], B[0], R[0], null, 1], // left triangle
  ];
  const pos = [], uv = [];
  const push = (v, u, t) => (pos.push(...v), uv.push(u, t));
  const quad = (a, b, c, d) => {
    push(a, 0, 0); push(b, repeat, 0); push(c, repeat * 0.8, 1); push(a, 0, 0); push(c, repeat * 0.8, 1); push(d, repeat * 0.2, 1);
  };
  for (const [a, b, c, d, tri] of tris) {
    if (tri) { push(a, 0, 0); push(b, repeat * 0.5, 0); push(c, repeat * 0.25, 1); } else quad(a, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Free spots on the back wall for windows: board coordinates, away from every wall, pin, fill and body of the level. */
export function windowSpots(L, random, max = 5) {
  const R = [];
  const seg = (x1, y1, x2, y2, pad) => R.push([Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad]);
  for (const w of L.walls || []) seg(...w, 22);
  for (const w of L.pins || []) seg(...w, 26);
  for (const w of L.gates || []) seg(...w, 24);
  for (const w of L.wood || []) seg(...w, 24);
  for (const f of L.fill || []) R.push([f[1] - 16, f[2] - 16, f[3] + 16, f[4] + 16]);
  for (const i of L.ice || []) R.push([i[0] - 16, i[1] - 16, i[2] + 16, i[3] + 16]);
  for (const l of [...(L.levers || []), ...(L.flaps || [])]) { if (l.plat) seg(...l.plat, 26); if (l.at) seg(l.at[0], l.at[1], l.at[0], l.at[1], 30); }
  for (const pl of L.plates || []) { R.push([pl.at[0] - 20, pl.at[2] - 50, pl.at[1] + 20, pl.at[2] + 20]); for (const d of [...(pl.door ? [pl.door] : []), ...(pl.doors || []), ...(pl.shut || [])]) seg(...d, 26); }
  for (const p of [...(L.boulders || []), ...(L.bombs || []), ...(L.keys || []), ...(L.enemies || [])]) seg(p[0], p[1], p[0], p[1], 40);
  for (const p of L.portals || []) { seg(...p.from, 30); seg(p.to[0], p.to[1], p.to[0], p.to[1], 40); }
  if (L.chief) seg(L.chief.at[0], L.chief.at[1], L.chief.at[0], L.chief.at[1], 70);
  if (L.hero) seg(L.hero[0] - 60, L.hero[1] - 70, L.hero[0] + 60, L.hero[1], 10);
  const spots = [];
  for (let y = 100; y <= 520; y += 70)
    for (let x = 76; x <= 284; x += 52) spots.push([x + (random() - 0.5) * 14, y + (random() - 0.5) * 14]);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const out = [];
  for (const [x, y] of spots) {
    const box = [x - 24, y - 38, x + 24, y + 38];
    if (R.some((r) => box[0] < r[2] && box[2] > r[0] && box[1] < r[3] && box[3] > r[1])) continue;
    if (out.some((o) => Math.hypot(o[0] - x, o[1] - y) < 100)) continue;
    out.push([x, y]);
    if (out.length >= max) break;
  }
  return out;
}
