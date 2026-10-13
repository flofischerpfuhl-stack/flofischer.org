// Fernboard scene engine: element model, hand-drawn geometry (rough-style, seeded), hit testing, arrow binding,
// SVG rendering for the live board, thumbnails and exports. No DOM state in here except text measurement.
import { ICONS } from '../kit/icons.js';

// ───────────────────────── palette (content surface; own isolated palette, per theme) ─────────────────────────
export const COLORS = ['ink', 'blue', 'green', 'orange', 'red', 'violet'];
export const STICKY = ['yellow', 'pink', 'mint', 'sky'];
const PAL = {
  light: {
    paper: '#ffffff', grid: '#d6d6dc', raised: '#ffffff', frame: '#e1e1e6', label: '#63636b', onInk: '#ffffff',
    ink: '#1e1e24', blue: '#2563eb', green: '#15803d', orange: '#c2410c', red: '#dc2626', violet: '#7c3aed', gray: '#6b6b73',
    yellow: '#fff2a8', pink: '#ffd9e3', mint: '#d4f5de', sky: '#d8e7ff', stickyInk: '#1e1e24', tint: 13, hatch: .5,
  },
  dark: {
    paper: '#111113', grid: '#2c2c32', raised: '#18181b', frame: '#2e2e34', label: '#9a9aa3', onInk: '#111113',
    ink: '#e9e9ee', blue: '#7aa7ff', green: '#4ade80', orange: '#fb923c', red: '#f87171', violet: '#b197fc', gray: '#a1a1aa',
    yellow: '#4f4413', pink: '#552236', mint: '#173f27', sky: '#1b3360', stickyInk: '#f3f3f5', tint: 20, hatch: .6,
  },
};
export const SERIES = ['#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#0d9488', '#ca8a04', '#db2777', '#4b5563'];
export const SERIES_DARK = ['#6ea0ff', '#fb8c4b', '#a78bfa', '#f87171', '#2dd4bf', '#facc15', '#f472b6', '#9ca3af'];
export const pal = (theme) => PAL[theme] || PAL.light;
/** CSS custom properties for a theme (used inline on the live board and inside exported SVGs). */
export function themeVars(theme) {
  const p = pal(theme);
  const v = [`--k-paper:${p.paper}`, `--k-grid:${p.grid}`, `--k-raised:${p.raised}`, `--k-frame:${p.frame}`, `--k-label:${p.label}`, `--k-on-ink:${p.onInk}`, `--k-sticky-ink:${p.stickyInk}`];
  for (const c of [...COLORS, 'gray']) v.push(`--k-${c}:${p[c]}`, `--t-${c}:color-mix(in srgb, ${p[c]} ${p.tint}%, ${p.paper})`);
  for (const s of STICKY) v.push(`--s-${s}:${p[s]}`);
  (theme === 'dark' ? SERIES_DARK : SERIES).forEach((c, i) => v.push(`--m-${i}:${c}`));
  return v.join(';');
}

// ───────────────────────── seeded randomness + rough strokes ─────────────────────────
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const f = (n) => Math.round(n * 100) / 100;

function pass(x1, y1, x2, y2, r, rough, overlay) {
  const lenSq = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  let off = 1.6; if (off * off * 100 > lenSq) off = Math.sqrt(lenSq) / 10;
  const half = off / 2, div = 0.2 + r() * 0.2;
  const o = (x) => rough * (r() * 2 * x - x);
  const mx = o((1.4 * (y2 - y1)) / 200), my = o((1.4 * (x1 - x2)) / 200);
  const rr = () => o(overlay ? half : off);
  return `M${f(x1 + rr())} ${f(y1 + rr())}C${f(mx + x1 + (x2 - x1) * div + rr())} ${f(my + y1 + (y2 - y1) * div + rr())} ${f(mx + x1 + 2 * (x2 - x1) * div + rr())} ${f(my + y1 + 2 * (y2 - y1) * div + rr())} ${f(x2 + rr())} ${f(y2 + rr())}`;
}
export function roughLine(x1, y1, x2, y2, r, rough = 1) {
  if (!rough) return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  return pass(x1, y1, x2, y2, r, rough, false) + pass(x1, y1, x2, y2, r, rough, true);
}
export function roughPoly(pts, closed, r, rough = 1) {
  let d = '';
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; d += roughLine(a[0], a[1], b[0], b[1], r, rough); }
  return d;
}
function catmull(pts, closed = false) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || (closed ? pts[pts.length - 2] : pts[i]), p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || (closed ? pts[1] : p2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
export function roughEllipse(cx, cy, rx, ry, r, rough = 1) {
  if (!rough) return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
  let d = '';
  for (let k = 0; k < 2; k++) {
    const n = Math.max(9, Math.min(22, Math.round(Math.hypot(rx, ry) / 9)));
    const start = r() * Math.PI * 2, over = 0.08 + r() * 0.16, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = start + ((Math.PI * 2 + over) * i) / n;
      const j = 1 + (r() - 0.5) * 0.035 * rough, jx = (r() - 0.5) * 1.2 * rough, jy = (r() - 0.5) * 1.2 * rough;
      pts.push([cx + Math.cos(a) * rx * j + jx, cy + Math.sin(a) * ry * j + jy]);
    }
    d += catmull(pts);
  }
  return d;
}
/** Smooth freehand path through points (quadratic midpoints). */
export function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return `M${f(pts[0][0])} ${f(pts[0][1])}L${f((pts[1] || pts[0])[0] + 0.01)} ${f((pts[1] || pts[0])[1])}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`; }
  const l = pts[pts.length - 1]; d += `L${f(l[0])} ${f(l[1])}`;
  return d;
}

// ───────────────────────── text measurement ─────────────────────────
let mctx = null;
export function measure(text, size, weight = 500, family = 'Geist') {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  mctx.font = `${weight} ${size}px ${family}, system-ui, sans-serif`;
  return mctx.measureText(text).width;
}
export function wrap(text, size, maxW, weight = 500) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/(\s+)/); let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && measure(test.trimEnd(), size, weight) > maxW && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ───────────────────────── model ─────────────────────────
let idc = 0;
export const uid = (p = 'e') => `${p}${Date.now().toString(36).slice(-5)}${(idc++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
export const SW = { 1: 1.4, 2: 2.2, 3: 3.6 };
export const FONT = { s: 16, m: 20, l: 28 };
export function make(type, props = {}) {
  const base = { id: uid(), type, x: 0, y: 0, w: 0, h: 0, color: 'ink', fill: 'none', sw: 2, sloppy: 1, seed: newSeed(), label: '' };
  if (type === 'text') Object.assign(base, { text: '', font: 'm' });
  if (type === 'sticky') Object.assign(base, { w: 180, h: 150, text: '', tone: 'yellow' });
  if (type === 'arrow' || type === 'line') Object.assign(base, { pts: [[0, 0], [0, 0]], start: null, end: null, head: type === 'arrow' });
  if (type === 'pen') Object.assign(base, { pts: [] });
  if (type === 'diagram') Object.assign(base, { w: 460, h: 300, code: '', title: 'Diagram' });
  if (type === 'mindmap') Object.assign(base, { w: 560, h: 340, md: '', title: 'Mind map' });
  return Object.assign(base, props);
}
export const isLinear = (el) => el.type === 'arrow' || el.type === 'line';
export const isBlock = (el) => el.type === 'diagram' || el.type === 'mindmap';
export const isBindable = (el) => !isLinear(el) && el.type !== 'pen';
export function bounds(el) {
  if (isLinear(el)) { const xs = el.pts.map((p) => p[0]), ys = el.pts.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  if (el.type === 'pen') { const xs = el.pts.map((p) => p[0]), ys = el.pts.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x: el.x + x, y: el.y + y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}
export function unionBounds(els) {
  if (!els.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of els) { const b = bounds(e); const t = isBlock(e) ? 26 : 0; x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y - t); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
export function moveBy(el, dx, dy) {
  if (isLinear(el)) el.pts = el.pts.map(([x, y]) => [x + dx, y + dy]);
  else { el.x += dx; el.y += dy; }
}
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
export function hit(el, x, y, tol = 6) {
  if (isLinear(el)) { for (let i = 0; i < el.pts.length - 1; i++) if (distSeg(x, y, el.pts[i], el.pts[i + 1]) <= tol + el.sw) return true; return false; }
  if (el.type === 'pen') { const p = el.pts; for (let i = 0; i < p.length - 1; i++) if (distSeg(x - el.x, y - el.y, p[i], p[i + 1]) <= tol + 2) return true; return false; }
  const b = bounds(el), top = isBlock(el) ? 26 : 0;
  if (el.type === 'ellipse') { const rx = b.w / 2 + tol, ry = b.h / 2 + tol; return ((x - b.x - b.w / 2) / rx) ** 2 + ((y - b.y - b.h / 2) / ry) ** 2 <= 1; }
  if (el.type === 'diamond') { const a = b.w / 2 + tol, c = b.h / 2 + tol; return Math.abs(x - b.x - b.w / 2) / a + Math.abs(y - b.y - b.h / 2) / c <= 1; }
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol - top && y <= b.y + b.h + tol;
}
export const center = (el) => { const b = bounds(el); return [b.x + b.w / 2, b.y + b.h / 2]; };
/** Where a ray from the element's centre towards (tx,ty) leaves its outline (+gap). */
export function boundaryPoint(el, tx, ty, gap = 7) {
  const b = bounds(el), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let dx = tx - cx, dy = ty - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const a = b.w / 2 + gap, c = b.h / 2 + gap;
  let t;
  if (el.type === 'ellipse') t = 1 / Math.sqrt((dx / a) ** 2 + (dy / c) ** 2);
  else if (el.type === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / c);
  else t = Math.min(Math.abs(dx) > 1e-6 ? a / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? c / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}
/** Re-route arrows bound to shapes. */
export function updateBindings(els) {
  const by = new Map(els.map((e) => [e.id, e]));
  for (const a of els) {
    if (!isLinear(a)) continue;
    const s = a.start && by.get(a.start), e = a.end && by.get(a.end);
    if (a.start && !s) a.start = null; if (a.end && !e) a.end = null;
    if (!s && !e) continue;
    const p0 = a.pts[0], p1 = a.pts[a.pts.length - 1];
    const tgtForStart = e ? center(e) : p1, tgtForEnd = s ? center(s) : p0;
    if (s) a.pts[0] = boundaryPoint(s, tgtForStart[0], tgtForStart[1]);
    if (e) a.pts[a.pts.length - 1] = boundaryPoint(e, tgtForEnd[0], tgtForEnd[1]);
  }
}

// ───────────────────────── rendering (inner markup in local coordinates) ─────────────────────────
const stroke = (el) => `stroke:var(--k-${el.color})`;
function fillFor(el) {
  if (el.fill === 'tint') return `fill:var(--t-${el.color})`;
  if (el.fill === 'solid') return `fill:var(--k-${el.color})`;
  if (el.fill === 'hatch') return `fill:url(#hatch-${el.color})`;
  return 'fill:none';
}
function labelSvg(el, w, h, { color } = {}) {
  if (!el.label) return '';
  const size = FONT[el.font || 'm'] * (el.type === 'diamond' ? 0.9 : 1), maxW = (el.type === 'rect' ? w - 20 : w * 0.7);
  const lines = wrap(el.label, size, Math.max(40, maxW)), lh = size * 1.25;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  const fillC = color || (el.fill === 'solid' ? 'var(--k-on-ink)' : 'var(--k-ink)');
  return `<text class="k-text" x="${f(w / 2)}" y="${f(y0)}" font-size="${size}" text-anchor="middle" dominant-baseline="central" style="fill:${fillC}">${lines.map((l, i) => `<tspan x="${f(w / 2)}" ${i ? `dy="${f(lh)}"` : ''}>${esc(l)}</tspan>`).join('')}</text>`;
}
export function textLayout(el) {
  const size = FONT[el.font || 'm'], lines = String(el.text || '').split('\n'), lh = size * 1.3;
  const w = Math.max(24, ...lines.map((l) => measure(l, size))) + 2;
  return { size, lines, lh, w, h: Math.max(lh, lines.length * lh) };
}
/**
 * Inner SVG for an element, in local coordinates (the caller wraps it in translate(x,y), except linear elements
 * which use absolute points). ctx.block(el) → { svg, vbW, vbH } | null provides block content.
 */
export function renderInner(el, ctx = {}) {
  const r = rng(el.seed), rough = el.sloppy ? 1 : 0, sw = SW[el.sw] || 2;
  const common = `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (el.type) {
    case 'rect': {
      const { w, h } = el;
      const fillD = el.fill === 'none' ? '' : rough ? `<path d="M2 2H${f(w - 1)}V${f(h - 2)}H1Z" style="${fillFor(el)}" stroke="none"/>` : `<rect width="${f(w)}" height="${f(h)}" rx="10" style="${fillFor(el)}" stroke="none"/>`;
      const out = rough ? `<path d="${roughPoly([[0, 0], [w, 0], [w, h], [0, h]], true, r, rough)}" fill="none" style="${stroke(el)}" ${common}/>` : `<rect width="${f(w)}" height="${f(h)}" rx="10" fill="none" style="${stroke(el)}" ${common}/>`;
      return fillD + out + labelSvg(el, w, h);
    }
    case 'ellipse': {
      const { w, h } = el;
      const fillD = el.fill === 'none' ? '' : `<ellipse cx="${f(w / 2)}" cy="${f(h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" style="${fillFor(el)}" stroke="none"/>`;
      return fillD + `<path d="${roughEllipse(w / 2, h / 2, w / 2, h / 2, r, rough)}" fill="none" style="${stroke(el)}" ${common}/>` + labelSvg(el, w, h);
    }
    case 'diamond': {
      const { w, h } = el, P = [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
      const fillD = el.fill === 'none' ? '' : `<path d="M${P.map((p) => p.join(' ')).join('L')}Z" style="${fillFor(el)}" stroke="none"/>`;
      return fillD + `<path d="${rough ? roughPoly(P, true, r, rough) : `M${P.map((p) => p.join(' ')).join('L')}Z`}" fill="none" style="${stroke(el)}" ${common}/>` + labelSvg(el, w, h);
    }
    case 'arrow': case 'line': {
      const p = el.pts; let d = '';
      for (let i = 0; i < p.length - 1; i++) d += roughLine(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], r, rough);
      if (el.head && p.length > 1) {
        const a = p[p.length - 2], b = p[p.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.min(16 + sw * 2, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.5);
        for (const s of [-1, 1]) { const t = ang + Math.PI + s * 0.47; d += roughLine(b[0], b[1], b[0] + Math.cos(t) * L, b[1] + Math.sin(t) * L, r, rough * 0.6); }
      }
      return `<path d="${d}" fill="none" style="${stroke(el)}" ${common}/>`;
    }
    case 'pen':
      return `<path d="${smoothPath(el.pts)}" fill="none" style="${stroke(el)}" stroke-width="${f(sw * 1.25)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'text': {
      const L = textLayout(el);
      return `<text class="k-text" font-size="${L.size}" style="fill:var(--k-${el.color})">${L.lines.map((l, i) => `<tspan x="0" y="${f(L.lh * i + L.size * 1.02)}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
    }
    case 'sticky': {
      const { w, h } = el, size = 17, lines = wrap(el.text, size, w - 28), lh = size * 1.3;
      return `<path d="M3 5 L${f(w - 1)} 3 L${f(w)} ${f(h)} L1 ${f(h - 1)}Z" fill="rgba(0,0,0,.07)" transform="translate(1.5 3)"/>`
        + `<rect width="${f(w)}" height="${f(h)}" rx="3" style="fill:var(--s-${el.tone})"/>`
        + `<text class="k-text" font-size="${size}" style="fill:var(--k-sticky-ink)">${lines.map((l, i) => `<tspan x="14" y="${f(16 + size + i * lh)}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
    }
    case 'image':
      return `<image href="${esc(el.src)}" width="${f(el.w)}" height="${f(el.h)}" preserveAspectRatio="xMidYMid meet"/>`;
    case 'diagram': case 'mindmap': {
      const { w, h } = el, c = ctx.block?.(el);
      const icon = `<g transform="scale(.667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.type === 'diagram' ? 'workflow' : 'network']}</g>`;
      let inner = '';
      if (c?.svg) inner = (c.stale ? '<g opacity=".5">' : '<g>') + nestSvg(c.svg, 14, 14, w - 28, h - 28) + '</g>' + (c.stale ? `<g transform="translate(${f(w - 118)} 10)"><rect width="108" height="24" rx="12" style="fill:var(--k-raised);stroke:var(--k-red)"/><text x="54" y="16.5" text-anchor="middle" font-size="12" class="k-ui" style="fill:var(--k-red)">Needs a fix</text></g>` : '');
      else inner = `<text x="${f(w / 2)}" y="${f(h / 2)}" text-anchor="middle" font-size="14" style="fill:var(--k-label)" class="k-ui">${c?.loading ? 'Rendering…' : c?.error ? 'This diagram needs a fix · press Enter' : 'Empty block · press Enter to edit'}</text>`;
      return `<g class="k-blocklabel" transform="translate(2 -23)" style="color:var(--k-label)">${icon}<text x="22" y="12" font-size="13" class="k-ui" style="fill:var(--k-label)">${esc(el.title || (el.type === 'diagram' ? 'Diagram' : 'Mind map'))}</text></g>`
        + `<rect width="${f(w)}" height="${f(h)}" rx="12" style="fill:var(--k-raised);stroke:var(--k-frame)" stroke-width="1"/>` + `<g class="k-blockbody">${inner}</g>`;
    }
    default: return '';
  }
}
/** Put an <svg …> string inside another SVG at x,y,w,h (meet). */
export function nestSvg(svg, x, y, w, h) {
  return svg.replace(/<svg\b([^>]*)>/, (m, attrs) => {
    let a = attrs.replace(/\s(width|height|x|y|preserveAspectRatio)="[^"]*"/g, '').replace(/\sstyle="[^"]*"/, '');
    return `<svg${a} x="${f(x)}" y="${f(y)}" width="${f(Math.max(1, w))}" height="${f(Math.max(1, h))}" preserveAspectRatio="xMidYMid meet">`;
  });
}
export function hatchDefs() {
  return [...COLORS].map((c) => `<pattern id="hatch-${c}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-41)"><line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--k-${c})" stroke-width="1.3" opacity=".5"/></pattern>`).join('');
}
export function elementSvg(el, ctx) {
  const inner = renderInner(el, ctx);
  if (isLinear(el)) return `<g data-id="${el.id}">${inner}</g>`;
  return `<g data-id="${el.id}" transform="translate(${f(el.x)} ${f(el.y)})">${inner}</g>`;
}

// ───────────────────────── whole-scene SVG (exports, thumbnails, history) ─────────────────────────
export const BASE_CSS = '.k-text{font-family:Geist,system-ui,sans-serif;font-weight:500;white-space:pre}.k-ui{font-family:Geist,system-ui,sans-serif;font-weight:500}';
/**
 * sceneSvg(elements, { theme, background: 'board'|'white'|'transparent', padding, ctx, fontCss, grid, maxW, maxH })
 * → { svg, w, h } in world units (fitted to content).
 */
export function sceneSvg(els, { theme = 'light', background = 'board', padding = 32, ctx = {}, fontCss = '', grid = false, box } = {}) {
  const b = box || unionBounds(els) || { x: 0, y: 0, w: 400, h: 240 };
  const x = b.x - padding, y = b.y - padding, w = Math.max(1, b.w + padding * 2), h = Math.max(1, b.h + padding * 2);
  const bg = background === 'transparent' ? '' : `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${background === 'white' ? '#ffffff' : pal(theme).paper}"/>`;
  const gridD = grid ? `<pattern id="k-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" style="fill:var(--k-grid)"/></pattern><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#k-dots)"/>` : '';
  const body = els.map((e) => elementSvg(e, ctx)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" style="${themeVars(theme)}"><style>${fontCss}${BASE_CSS}</style><defs>${hatchDefs()}</defs>${bg}${gridD}${body}</svg>`;
  return { svg, w, h, x, y };
}
