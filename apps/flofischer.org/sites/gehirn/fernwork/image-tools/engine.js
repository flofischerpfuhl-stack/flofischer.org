// Image Tools engine: recipe → pixels, marks (draw/text/shapes/fill/blur), EXIF read + rewrite, palette, encoder bridge,
// ZIP and ICO writers. Everything here is real (canvas + JS). Only background removal and OCR use pre-made result assets.

export const ADJ = [
  { key: 'brightness', label: 'Brightness', icon: 'sun', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', icon: 'contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', icon: 'droplet', min: -100, max: 100 },
  { key: 'sharpen', label: 'Sharpen', icon: 'focus', min: 0, max: 100, unit: ' %' },
  { key: 'blur', label: 'Blur', icon: 'waves', min: 0, max: 20, unit: ' px' },
  { key: 'warmth', label: 'Warmth', icon: 'thermometer', min: -100, max: 100, more: true },
  { key: 'vignette', label: 'Vignette', icon: 'aperture', min: -100, max: 100, more: true },
];
export const ADJ_BY = Object.fromEntries(ADJ.map((a) => [a.key, a]));
const ADJ0 = () => Object.fromEntries(ADJ.map((a) => [a.key, 0]));

// ───────────────────────── recipe ─────────────────────────
// Marks are stored in *frame* coordinates (after rotate/straighten, before crop), normalised 0…1; sizes in frame pixels.
const rotPt = (p, deg) => (deg === 90 ? { x: 1 - p.y, y: p.x } : deg === -90 || deg === 270 ? { x: p.y, y: 1 - p.x } : deg === 180 ? { x: 1 - p.x, y: 1 - p.y } : p);
const flipPt = (p, axis) => (axis === 'v' ? { x: p.x, y: 1 - p.y } : { x: 1 - p.x, y: p.y });
function rotRect(r, deg) {
  const a = rotPt({ x: r.x, y: r.y }, deg), b = rotPt({ x: r.x + r.w, y: r.y + r.h }, deg);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
function mapShape(s, f) {
  const o = { ...s };
  if (s.pts) o.pts = s.pts.map(f);
  if (s.a) o.a = f(s.a); if (s.b) o.b = f(s.b);
  return o;
}
/** Fold the enabled recipe steps into one effective state. `skip(step)` leaves steps out (before/after views). */
export function effective(doc, { skip } = {}) {
  const e = { rot: 0, fx: false, fy: false, straighten: 0, crop: null, aspect: null, adj: ADJ0(), bg: null, marks: [], refine: [], opacity: 100 };
  for (const s of doc.recipe) {
    if (!s.on || (skip && skip(s))) continue;
    if (s.type === 'rotate') { e.rot = (e.rot + s.deg + 360) % 360; if (e.crop) e.crop = rotRect(e.crop, s.deg); e.marks = e.marks.map((m) => ({ ...m, shape: mapShape(m.shape, (p) => rotPt(p, s.deg)) })); }
    else if (s.type === 'flip') {
      const v = s.axis === 'v';
      if (v === (e.rot % 180 === 0)) e.fy = !e.fy; else e.fx = !e.fx; // screen axis → source axis at the current rotation
      if (e.crop) e.crop = v ? { ...e.crop, y: 1 - e.crop.y - e.crop.h } : { ...e.crop, x: 1 - e.crop.x - e.crop.w };
      e.marks = e.marks.map((m) => ({ ...m, shape: mapShape(m.shape, (p) => flipPt(p, s.axis)) }));
    }
    else if (s.type === 'straighten') e.straighten = s.deg;
    else if (s.type === 'crop') { e.crop = s.rect; e.aspect = s.aspect; }
    else if (s.type === 'adjust') e.adj[s.key] = s.value;
    else if (s.type === 'auto') Object.assign(e.adj, s.values);
    else if (s.type === 'bg') e.bg = s;
    else if (s.type === 'mark') e.marks.push(s);
    else if (s.type === 'refine') e.refine.push(s);
    else if (s.type === 'opacity') e.opacity = s.value;
  }
  return e;
}
export const isGeo = (s) => ['rotate', 'flip', 'straighten', 'crop'].includes(s.type);

/** Frame (after rotate/straighten) and output (after crop) sizes in source pixels; m maps source px → output px. */
export function geometry(doc, e, { noCrop = false } = {}) {
  const w = doc.w, h = doc.h;
  const swap = e.rot % 180 !== 0;
  const fw = swap ? h : w, fh = swap ? w : h;
  const t = Math.abs(e.straighten) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const cover = Math.max((fw * c + fh * s) / fw, (fw * s + fh * c) / fh);
  const cr = !noCrop && e.crop ? e.crop : { x: 0, y: 0, w: 1, h: 1 };
  const ox = cr.x * fw, oy = cr.y * fh, ow = Math.max(1, Math.round(cr.w * fw)), oh = Math.max(1, Math.round(cr.h * fh));
  const sx = e.fx ? -1 : 1, sy = e.fy ? -1 : 1;
  const m = new DOMMatrix().translate(-ox, -oy).translate(fw / 2, fh / 2).rotate(e.rot + e.straighten).scale(sx, sy).scale(cover).translate(-w / 2, -h / 2);
  return { w, h, fw, fh, ox, oy, ow, oh, cover, m };
}
/** frame-normalised ↔ output-normalised */
export const toOut = (p, g) => ({ x: (p.x * g.fw - g.ox) / g.ow, y: (p.y * g.fh - g.oy) / g.oh });
export const toFrame = (q, g) => ({ x: (g.ox + q.x * g.ow) / g.fw, y: (g.oy + q.y * g.oh) / g.fh });

// ───────────────────────── pixels ─────────────────────────
function makeLut(light, contrast) {
  const lut = new Uint8ClampedArray(256);
  const l = light / 100, c = contrast / 100;
  const gamma = Math.pow(2, -l * 1.55);
  const k = c >= 0 ? 1 + c * 1.35 : 1 + c * 0.8;
  for (let i = 0; i < 256; i++) {
    let v = Math.pow(i / 255, gamma);
    if (l > 0) v = v + (1 - v) * l * 0.1; else v = v * (1 + l * 0.25);
    v = (v - 0.5) * k + 0.5;
    if (c > 0) { const sgm = 1 / (1 + Math.exp(-(v - 0.5) * 6 * c)); v = v * (1 - c * 0.25) + sgm * c * 0.25; }
    lut[i] = Math.round(v * 255);
  }
  return lut;
}
function sharpenPass(ctx, W, H, amount) {
  const id = ctx.getImageData(0, 0, W, H), s = id.data, o = new Uint8ClampedArray(s), a = amount;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = s[i + c] * (1 + 4 * a) - a * (s[i + c - 4] + s[i + c + 4] + s[i + c - W * 4] + s[i + c + W * 4]);
        o[i + c] = v;
      }
    }
  }
  id.data.set(o); ctx.putImageData(id, 0, 0);
}
/** Adjustments run on the output canvas; blur and sharpen are scale-aware so preview ≈ export. */
function applyAdjust(ctx, W, H, adj, scale) {
  if (adj.blur > 0) {
    const t = mk(W, H), tx = t.getContext('2d'); tx.drawImage(ctx.canvas, 0, 0);
    ctx.save(); ctx.clearRect(0, 0, W, H); ctx.filter = `blur(${adj.blur * scale}px)`; ctx.drawImage(t, 0, 0); ctx.restore();
  }
  if (adj.sharpen > 0) sharpenPass(ctx, W, H, (adj.sharpen / 100) * 0.9 * Math.min(1, scale * 1.4 + 0.2));
  const { brightness, contrast, saturation, warmth } = adj;
  if (brightness || contrast || saturation || warmth) {
    const id = ctx.getImageData(0, 0, W, H), d = id.data;
    const lut = makeLut(brightness, contrast), sat = 1 + saturation / 100 * (saturation > 0 ? 0.9 : 1), wr = warmth / 100;
    const rw = 1 + wr * 0.17, gw = 1 + wr * 0.03, bw = 1 - wr * 0.2;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
      if (sat !== 1) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
      if (wr) { r *= rw; g *= gw; b *= bw; }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(id, 0, 0);
  }
  if (adj.vignette) {
    const v = adj.vignette / 100;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
    const col = v > 0 ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${Math.abs(v) * 0.75})`);
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}
export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

function refinedCutout(doc, strokes, k) {
  const c = mk(doc.w * k, doc.h * k), x = c.getContext('2d');
  x.drawImage(doc.cutout, 0, 0, c.width, c.height);
  for (const st of strokes || []) {
    x.save(); x.scale(k, k); x.beginPath();
    for (const p of st.pts) { x.moveTo(p.x + st.r, p.y); x.arc(p.x, p.y, st.r, 0, Math.PI * 2); }
    if (st.mode === 'erase') { x.globalCompositeOperation = 'destination-out'; x.fill(); }
    else { x.clip(); x.drawImage(doc.bmp, 0, 0, doc.w, doc.h); }
    x.restore();
  }
  return c;
}
function sourceLayer(doc, e, k, ghost) {
  if (!e.bg || !doc.cutout) return null;
  const bg = e.bg, c = mk(doc.w * k, doc.h * k), x = c.getContext('2d');
  if (bg.fill === 'white' || bg.fill === 'color') { x.fillStyle = bg.fill === 'white' ? '#ffffff' : bg.color || '#e8f0ff'; x.fillRect(0, 0, c.width, c.height); }
  else if (bg.fill === 'blur') { x.filter = `blur(${Math.max(2, 18 * k * doc.w / 1024)}px)`; x.drawImage(doc.bmp, -20 * k, -20 * k, c.width + 40 * k, c.height + 40 * k); x.filter = 'none'; }
  if (ghost && bg.fill === 'transparent') { x.globalAlpha = 0.22; x.drawImage(doc.bmp, 0, 0, c.width, c.height); x.globalAlpha = 1; }
  const cut = refinedCutout(doc, e.refine, k);
  if (bg.shadow) { x.save(); x.shadowColor = 'rgba(0,0,0,.38)'; x.shadowBlur = 36 * k * doc.w / 1024; x.shadowOffsetY = 18 * k * doc.w / 1024; x.drawImage(cut, 0, 0); x.restore(); }
  else x.drawImage(cut, 0, 0);
  return c;
}

// ───────────────────────── marks ─────────────────────────
export const FONTS = [
  ['Geist, system-ui, sans-serif', 'Geist'], ['Impact, Haettenschweiler, "Arial Black", sans-serif', 'Impact'], ['"Arial Black", Arial, sans-serif', 'Arial Black'],
  ['Arial, Helvetica, sans-serif', 'Arial'], ['Verdana, Geneva, sans-serif', 'Verdana'], ['Tahoma, Geneva, sans-serif', 'Tahoma'], ['"Trebuchet MS", Arial, sans-serif', 'Trebuchet'],
  ['Georgia, serif', 'Georgia'], ['"Times New Roman", Times, serif', 'Times'], ['"Courier New", monospace', 'Courier'], ['"Comic Sans MS", "Comic Sans", cursive', 'Comic'],
];
const fontStr = (s) => `${s.weight || 700} ${s.fsize}px ${s.font || FONTS[0][0]}`;
let mctx = null;
const measure = () => (mctx ||= mk(4, 4).getContext('2d'));
/** Text lines (wrapped to s.w × frame width when set) and their widths, in frame px. */
export function textLines(s, fw) {
  const x = measure(); x.font = fontStr(s);
  const raw = String(s.text || '').split('\n'), max = s.w ? s.w * fw : 0, out = [];
  for (const para of raw) {
    if (!max) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) { const t = line ? line + ' ' + word : word; if (line && x.measureText(t).width > max) { out.push(line); line = word; } else line = t; }
    out.push(line);
  }
  return out.map((t) => ({ t, w: x.measureText(t).width }));
}
function pixelate(x, rx, ry, rw, rh, cell) {
  if (rw < 2 || rh < 2) return;
  const t = mk(rw / cell, rh / cell), tx = t.getContext('2d');
  tx.drawImage(x.canvas, rx, ry, rw, rh, 0, 0, t.width, t.height);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, t.width, t.height, rx, ry, rw, rh); x.restore();
}
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
/** Scanline flood fill on the canvas at device px (sx, sy); tolerance 0–255 per channel distance. */
function floodFill(x, sx, sy, color, tol, alpha) {
  const W = x.canvas.width, H = x.canvas.height; sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const id = x.getImageData(0, 0, W, H), d = id.data, i0 = (sy * W + sx) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3], [cr, cg, cb] = hexRgb(color), t2 = tol * tol * 3;
  const seen = new Uint8Array(W * H);
  const match = (p) => { const i = p * 4; const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0, da = d[i + 3] - a0; return dr * dr + dg * dg + db * db + da * da <= t2; };
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(); let xx = stack.pop(); let p = y * W + xx;
    while (xx >= 0 && !seen[p] && match(p)) { xx--; p--; }
    xx++; p++; let up = false, dn = false;
    while (xx < W && !seen[p] && match(p)) {
      seen[p] = 1; const i = p * 4;
      d[i] = d[i] + (cr - d[i]) * alpha; d[i + 1] = d[i + 1] + (cg - d[i + 1]) * alpha; d[i + 2] = d[i + 2] + (cb - d[i + 2]) * alpha; d[i + 3] = d[i + 3] + (255 - d[i + 3]) * alpha;
      if (y > 0) { const q = p - W; if (!seen[q] && match(q)) { if (!up) { stack.push(xx, y - 1); up = true; } } else up = false; }
      if (y < H - 1) { const q = p + W; if (!seen[q] && match(q)) { if (!dn) { stack.push(xx, y + 1); dn = true; } } else dn = false; }
      xx++; p++;
    }
  }
  x.putImageData(id, 0, 0);
}
/** Draw one mark onto the output canvas. g = geometry, scale = output scale (device px per output px). */
export function drawMark(x, s, g, scale) {
  const FW = g.fw, FH = g.fh, P = (p) => [p.x * FW, p.y * FH];
  const toDev = (p) => [(p.x * FW - g.ox) * scale, (p.y * FH - g.oy) * scale];
  x.save();
  x.setTransform(scale, 0, 0, scale, -g.ox * scale, -g.oy * scale);
  x.globalAlpha = (s.opacity ?? 100) / 100; x.lineCap = 'round'; x.lineJoin = 'round';
  const k = s.kind;
  if (k === 'brush' || k === 'pencil' || k === 'eraser') {
    x.lineWidth = s.size; x.strokeStyle = s.color || '#000';
    if (k === 'eraser') x.globalCompositeOperation = 'destination-out';
    if (k === 'brush') { x.shadowColor = s.color; x.shadowBlur = s.size * 0.45 * scale; }
    x.beginPath();
    s.pts.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); });
    if (s.pts.length === 1) { const [a, b] = P(s.pts[0]); x.lineTo(a + 0.01, b); }
    x.stroke();
  } else if (k === 'rect' || k === 'ellipse' || k === 'line' || k === 'arrow') {
    const [ax, ay] = P(s.a), [bx, by] = P(s.b);
    x.lineWidth = s.width; x.strokeStyle = s.color;
    if (k === 'rect' || k === 'ellipse') {
      x.beginPath();
      if (k === 'rect') x.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      else x.ellipse((ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2, 0, 0, Math.PI * 2);
      if (s.fill) { x.fillStyle = s.fill; x.fill(); }
      if (s.width > 0) x.stroke();
    } else {
      const ang = Math.atan2(by - ay, bx - ax), hl = Math.max(s.width * 4.2, 10);
      x.beginPath(); x.moveTo(ax, ay);
      if (k === 'arrow') x.lineTo(bx - Math.cos(ang) * hl * 0.6, by - Math.sin(ang) * hl * 0.6); else x.lineTo(bx, by);
      x.stroke();
      if (k === 'arrow') { x.fillStyle = s.color; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx - hl * Math.cos(ang - 0.45), by - hl * Math.sin(ang - 0.45)); x.lineTo(bx - hl * Math.cos(ang + 0.45), by - hl * Math.sin(ang + 0.45)); x.closePath(); x.fill(); }
    }
  } else if (k === 'text') {
    const lines = textLines(s, FW), lh = s.fsize * 1.2, [ax, ay] = P(s.a);
    x.font = fontStr(s); x.textBaseline = 'top'; x.textAlign = s.align || 'left';
    lines.forEach((ln, i) => {
      if (s.outlineW > 0) { x.lineWidth = s.outlineW * 2; x.strokeStyle = s.outline || '#000'; x.strokeText(ln.t, ax, ay + i * lh); }
      x.fillStyle = s.color; x.fillText(ln.t, ax, ay + i * lh);
    });
  } else if (k === 'blur') {
    const [ax, ay] = toDev(s.a), [bx, by] = toDev(s.b);
    x.restore(); x.save();
    const cell = Math.max(4, (s.cell || 24) * scale);
    pixelate(x, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), cell);
  } else if (k === 'fill') {
    const [dx, dy] = toDev(s.a);
    x.restore(); x.save();
    floodFill(x, dx, dy, s.color, s.tol ?? 32, (s.opacity ?? 100) / 100);
  }
  x.restore();
}
/** Bounds of a mark, frame-normalised. */
export function markBounds(s, g) {
  const FW = g.fw, FH = g.fh;
  if (s.pts) {
    const xs = s.pts.map((p) => p.x), ys = s.pts.map((p) => p.y), px = (s.size || 4) / 2 / FW, py = (s.size || 4) / 2 / FH;
    return { x: Math.min(...xs) - px, y: Math.min(...ys) - py, w: Math.max(...xs) - Math.min(...xs) + px * 2, h: Math.max(...ys) - Math.min(...ys) + py * 2 };
  }
  if (s.kind === 'text') {
    const lines = textLines(s, FW), w = Math.max(1, ...lines.map((l) => l.w)), h = lines.length * s.fsize * 1.2;
    const left = s.align === 'center' ? s.a.x * FW - w / 2 : s.align === 'right' ? s.a.x * FW - w : s.a.x * FW;
    return { x: left / FW, y: s.a.y, w: w / FW, h: h / FH };
  }
  if (s.kind === 'fill') { const r = 14; return { x: s.a.x - r / FW, y: s.a.y - r / FH, w: 2 * r / FW, h: 2 * r / FH }; }
  const pad = (s.width || 0) / 2;
  return { x: Math.min(s.a.x, s.b.x) - pad / FW, y: Math.min(s.a.y, s.b.y) - pad / FH, w: Math.abs(s.b.x - s.a.x) + 2 * pad / FW, h: Math.abs(s.b.y - s.a.y) + 2 * pad / FH };
}
export function moveShape(s, dx, dy) { return mapShape(s, (p) => ({ x: p.x + dx, y: p.y + dy })); }

/**
 * render(doc, { scale, skip, noCrop, noMarks, maxDim, ghost, hide }) → canvas of the output at `scale` × output pixels.
 * Preview and export share this path, so what you see is what you save.
 */
export function render(doc, { scale = 1, skip, noCrop = false, noMarks = false, maxDim, ghost = false, hide } = {}) {
  const e = effective(doc, { skip });
  const g = geometry(doc, e, { noCrop });
  if (maxDim) scale = Math.min(scale, maxDim / Math.max(g.ow, g.oh));
  const W = Math.max(1, Math.round(g.ow * scale)), H = Math.max(1, Math.round(g.oh * scale));
  const c = mk(W, H), x = c.getContext('2d', { willReadFrequently: true });
  const k = Math.min(1, scale * g.cover * 1.05);
  const layer = sourceLayer(doc, e, k, ghost);
  x.imageSmoothingQuality = 'high';
  x.globalAlpha = e.opacity / 100;
  x.setTransform(new DOMMatrix().scale(scale).multiply(g.m));
  x.drawImage(layer || doc.bmp, 0, 0, doc.w, doc.h);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
  applyAdjust(x, W, H, e.adj, scale);
  if (!noMarks) for (const m of e.marks) if (m.id !== hide) drawMark(x, m.shape, g, scale);
  c._geo = g; c._eff = e; c._scale = scale;
  return c;
}
export const hasAlpha = (doc) => {
  const e = effective(doc);
  return !!(e.bg && doc.cutout && e.bg.fill === 'transparent') || e.opacity < 100 || e.marks.some((m) => m.shape.kind === 'eraser') || !!doc.alpha;
};

// ───────────────────────── analysis ─────────────────────────
function smallPixels(src, n = 72) {
  const r = Math.min(1, n / Math.max(src.width, src.height));
  const c = mk(src.width * r, src.height * r), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height).data;
}
/** k-means palette; every swatch is a real pixel colour (the member closest to its centroid). */
export function palette(src, k = 6) {
  const d = smallPixels(src, 80), px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  const dist = (a, b) => (a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11;
  const cents = [px[Math.floor(px.length / 2)].slice()];
  while (cents.length < k) {
    let best = null, bd = -1; for (let i = 0; i < px.length; i += 3) { const dd = Math.min(...cents.map((c) => dist(px[i], c))); if (dd > bd) { bd = dd; best = px[i]; } }
    cents.push(best.slice());
  }
  const asg = new Array(px.length).fill(0);
  for (let it = 0; it < 10; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => { let bi = 0, bd = Infinity; cents.forEach((c, j) => { const dd = dist(p, c); if (dd < bd) { bd = dd; bi = j; } }); asg[i] = bi; const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
    sum.forEach((s, j) => { if (s[3]) cents[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  const out = cents.map((c, j) => {
    let best = null, bd = Infinity, n = 0;
    px.forEach((p, i) => { if (asg[i] !== j) return; n++; const dd = dist(p, c); if (dd < bd) { bd = dd; best = p; } });
    return best ? { rgb: best, share: n / px.length } : null;
  }).filter(Boolean).sort((a, b) => b.share - a.share);
  return out.map((o) => ({ ...o, hex: rgbHex(o.rgb) }));
}
export const rgbHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
export function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}
/** Auto enhance from the real histogram: stretch levels, nudge colour. */
export function autoValues(src) {
  const d = smallPixels(src, 96); const hist = new Array(256).fill(0); let n = 0, satSum = 0;
  for (let i = 0; i < d.length; i += 4) { const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); hist[y]++; n++; satSum += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); }
  const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * p) return i; } return 255; };
  const lo = pct(0.01), hi = pct(0.99), med = pct(0.5), sat = satSum / n;
  const cl = (v) => Math.max(-60, Math.min(60, Math.round(v)));
  return { brightness: cl((118 - med) / 2.4), contrast: cl((1 - (hi - lo) / 235) * 70), saturation: cl((70 - sat) / 2.2) };
}

// ───────────────────────── EXIF ─────────────────────────
const TAGS = { 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright',
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime',
  0x9201: 'ShutterSpeed', 0x9202: 'Aperture', 0x9204: 'ExposureBias', 0x9207: 'MeteringMode', 0x9209: 'Flash', 0x920a: 'FocalLength', 0xa002: 'PixelWidth', 0xa003: 'PixelHeight',
  0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa405: 'FocalLengthIn35mm', 0xa432: 'LensSpec', 0xa433: 'LensMake', 0xa434: 'LensModel' };
const GPS = { 1: 'LatRef', 2: 'Lat', 3: 'LonRef', 4: 'Lon', 5: 'AltRef', 6: 'Alt', 7: 'TimeStamp', 0x1d: 'DateStamp', 0x11: 'ImgDirection' };
/** Locate the Exif APP1 segment in a JPEG: { start, end, tiff } byte offsets, or null. */
function findExif(v) {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const m = v.getUint16(o), len = v.getUint16(o + 2);
    if (m === 0xffe1 && o + 10 < v.byteLength && v.getUint32(o + 4) === 0x45786966) return { start: o, end: o + 2 + len, tiff: o + 10 };
    if ((m & 0xff00) !== 0xff00 || m === 0xffda) break;
    o += 2 + len;
  }
  return null;
}
/** readExif(ArrayBuffer) → { tags, gps, count, location } or null. Small, dependency-free JPEG/TIFF reader. */
export function readExif(buf) {
  const v = new DataView(buf), f = findExif(v);
  return f ? parseTiff(v, f.tiff) : null;
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p) => v.getUint16(p, le), u32 = (p) => v.getUint32(p, le), s32 = (p) => v.getInt32(p, le);
  const out = { tags: {}, gps: {}, count: 0 };
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function val(e) {
    const type = u16(e + 2), cnt = u32(e + 4), sz = (sizes[type] || 1) * cnt, p = sz > 4 ? t + u32(e + 8) : e + 8;
    if (type === 2) { let s = ''; for (let i = 0; i < cnt - 1; i++) s += String.fromCharCode(v.getUint8(p + i)); try { return decodeURIComponent(escape(s)).trim(); } catch { return s.trim(); } }
    if (type === 3) return cnt === 1 ? u16(p) : Array.from({ length: cnt }, (_, i) => u16(p + i * 2));
    if (type === 4) return u32(p);
    if (type === 1 || type === 7) return cnt === 1 ? v.getUint8(p) : null;
    if (type === 5 || type === 10) { const r = (i) => (type === 5 ? u32(p + i * 8) / u32(p + i * 8 + 4) : s32(p + i * 8) / s32(p + i * 8 + 4)); return cnt === 1 ? r(0) : Array.from({ length: cnt }, (_, i) => r(i)); }
    return null;
  }
  function ifd(off, map, into) {
    if (t + off + 2 > v.byteLength) return;
    const n = u16(t + off);
    for (let i = 0; i < n; i++) {
      const e = t + off + 2 + i * 12, tag = u16(e); out.count++;
      if (tag === 0x8769) ifd(u32(e + 8), TAGS, out.tags);
      else if (tag === 0x8825) ifd(u32(e + 8), GPS, out.gps);
      else if (map[tag]) { try { into[map[tag]] = val(e); } catch { /* skip bad entry */ } }
    }
  }
  ifd(u32(t + 4), TAGS, out.tags);
  const g = out.gps;
  if (g.Lat && g.Lon) out.location = { lat: (g.Lat[0] + g.Lat[1] / 60 + g.Lat[2] / 3600) * (g.LatRef === 'S' ? -1 : 1), lon: (g.Lon[0] + g.Lon[1] / 60 + g.Lon[2] / 3600) * (g.LonRef === 'W' ? -1 : 1), alt: g.Alt };
  return out;
}
/** Copy of the Exif APP1 segment with location removed (mode 'location') and Orientation reset to 1 (pixels are already upright). */
function exifSegment(buf, mode, { resetOrientation = true } = {}) {
  const v0 = new DataView(buf), f = findExif(v0); if (!f) return null;
  const seg = new Uint8Array(buf.slice(f.start, f.end)), v = new DataView(seg.buffer), t = 10;
  const le = v.getUint16(t) === 0x4949, u16 = (p) => v.getUint16(p, le), u32 = (p) => v.getUint32(p, le);
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const ifd0 = u32(t + 4), n = u16(t + ifd0);
  for (let i = 0; i < n; i++) {
    const e = t + ifd0 + 2 + i * 12, tag = u16(e);
    if (tag === 0x0112 && resetOrientation) v.setUint16(e + 8, 1, le);
    if (tag === 0x8825 && mode === 'location') {
      const go = t + u32(e + 8), m = u16(go);
      for (let j = 0; j < m; j++) {
        const ge = go + 2 + j * 12, type = u16(ge + 2), cnt = u32(ge + 4), sz = (sizes[type] || 1) * cnt;
        if (sz > 4) { const p = t + u32(ge + 8); seg.fill(0, p, Math.min(seg.length, p + sz)); }
        seg.fill(0, ge, ge + 12);
      }
      v.setUint16(go, 0, le);
    }
  }
  return seg;
}
/** Strip or rewrite metadata in a JPEG without re-encoding (zero generation loss). mode: 'all' | 'location' | 'keep'. */
export async function jpegMeta(blob, mode) {
  if (mode === 'keep') return blob;
  const buf = await blob.arrayBuffer(), v = new DataView(buf), f = findExif(v);
  if (!f) return blob;
  const head = new Uint8Array(buf, 0, f.start), tail = new Uint8Array(buf, f.end);
  if (mode === 'all') return new Blob([head, tail], { type: 'image/jpeg' });
  const seg = exifSegment(buf, 'location', { resetOrientation: false });
  return new Blob([head, seg, tail], { type: 'image/jpeg' });
}
/** Re-insert the original metadata into a freshly encoded JPEG (canvas output has none). */
export async function addMeta(blob, origBuf, mode) {
  if (mode === 'all' || !origBuf) return blob;
  const seg = exifSegment(origBuf, mode); if (!seg) return blob;
  const buf = new Uint8Array(await blob.arrayBuffer());
  return new Blob([buf.subarray(0, 2), seg, buf.subarray(2)], { type: 'image/jpeg' });
}
// Tiny offline gazetteer (the real build ships GeoNames cities15000, ~1 MB, lazily).
const PLACES = [[3.945, 73.49, 'Maafushi, Maldives'], [47.874, 8.004, 'Feldberg, Black Forest, Germany'], [48.879, 2.34, 'Rue des Martyrs, Paris'], [52.514, 13.35, 'Tiergarten, Berlin']];
export function placeName(loc) {
  let best = null, bd = 1e9; for (const [la, lo, n] of PLACES) { const d = (la - loc.lat) ** 2 + (lo - loc.lon) ** 2; if (d < bd) { bd = d; best = n; } }
  return bd < 0.5 ? best : null;
}
export function humanExif(x) {
  if (!x) return null;
  const t = x.tags, r = {};
  if (t.Model) r.camera = /^(apple|samsung)$/i.test(t.Make || '') || (t.Model || '').toLowerCase().includes((t.Make || '').toLowerCase()) ? t.Model : `${cap(t.Make)} ${t.Model}`;
  const fl35 = t.FocalLengthIn35mm, lensKind = fl35 ? (fl35 < 20 ? 'Ultra wide' : fl35 < 40 ? 'Main' : fl35 < 60 ? 'Standard' : 'Telephoto') : null;
  if (t.FNumber || fl35) r.lens = [/iphone|galaxy|pixel/i.test(t.Model || '') ? lensKind : (t.LensModel || '').replace(/R$/, '').trim(), fl35 ? `${fl35} mm` : null, t.FNumber ? `ƒ/${+t.FNumber.toFixed(2)}` : null].filter(Boolean).join(' · ');
  if (t.ExposureTime) r.exposure = [t.ExposureTime < 1 ? `1/${Math.round(1 / t.ExposureTime)} s` : `${t.ExposureTime} s`, t.ISO ? `ISO ${t.ISO}` : null].filter(Boolean).join(' · ');
  const dt = t.DateTimeOriginal || t.DateTime;
  if (dt) { const [d, tm = '0:0'] = dt.split(' '); const [Y, M, D] = d.split(':').map(Number); const [hh, mm] = tm.split(':').map(Number); const date = new Date(Y, M - 1, D, hh, mm);
    r.taken = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  if (t.Software) r.software = t.Software;
  if (x.location) { r.location = x.location; r.place = placeName(x.location); }
  r.count = x.count;
  return r;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
export const fmtCoord = (l) => `${Math.abs(l.lat).toFixed(4)}° ${l.lat >= 0 ? 'N' : 'S'}, ${Math.abs(l.lon).toFixed(4)}° ${l.lon >= 0 ? 'E' : 'W'}`;

// ───────────────────────── encoding (Web Worker) ─────────────────────────
let worker = null, seq = 0; const pending = new Map();
function w() {
  if (!worker) {
    worker = new Worker(new URL('./encoder-worker.js', import.meta.url));
    worker.onmessage = (ev) => { const p = pending.get(ev.data.id); if (p) { pending.delete(ev.data.id); ev.data.error ? p.reject(new Error(ev.data.error)) : p.resolve(ev.data); } };
  }
  return worker;
}
export const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png', avif: 'image/webp' /* see note below */ };
/**
 * encode(canvas, { format, quality, width, height, target, flatten }) → { blob, quality, bytes }.
 * Real encoders (canvas JPEG / WebP / PNG) in a worker. AVIF: Chromium has no canvas AVIF encoder, so the mockup encodes
 * WebP and reports ≈ 0.78× its size; the real build uses libavif (jSquash) in the same worker.
 */
export async function encode(canvas, opts) {
  const bmp = await createImageBitmap(canvas);
  const id = ++seq;
  const res = await new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); w().postMessage({ id, bmp, ...opts, mime: MIME[opts.format] }, [bmp]); });
  const bytes = opts.format === 'avif' ? Math.round(res.blob.size * 0.78) : res.blob.size;
  return { ...res, bytes };
}

// ───────────────────────── containers ─────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** zip([{ name, data: Uint8Array|Blob }]) → Blob (stored, UTF-8 names). */
export async function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const data = f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : f.data;
    const name = enc.encode(f.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
/** ico([{ size, png: Blob }]) → Blob (PNG-in-ICO, Vista+). */
export async function ico(entries) {
  const pngs = await Promise.all(entries.map(async (e) => new Uint8Array(await e.png.arrayBuffer())));
  const head = new DataView(new ArrayBuffer(6 + 16 * entries.length));
  head.setUint16(2, 1, true); head.setUint16(4, entries.length, true);
  let off = 6 + 16 * entries.length;
  entries.forEach((e, i) => { const p = 6 + i * 16; head.setUint8(p, e.size >= 256 ? 0 : e.size); head.setUint8(p + 1, e.size >= 256 ? 0 : e.size); head.setUint16(p + 4, 1, true); head.setUint16(p + 6, 32, true); head.setUint32(p + 8, pngs[i].length, true); head.setUint32(p + 12, off, true); off += pngs[i].length; });
  return new Blob([head.buffer, ...pngs], { type: 'image/x-icon' });
}
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
