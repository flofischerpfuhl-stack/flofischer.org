// Colour maths: parse, sRGB ⇄ OKLab/OKLCH/HSL/HSV, gamut mapping, WCAG 2 + APCA contrast, contrast fix,
// OKLCH scale 50–950 anchored on the colour, harmonies, colour-blindness simulation, names.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

// colour object: { r, g, b } in 0..1 (sRGB, may be out of gamut before mapping), a in 0..1
export function hex({ r, g, b, a = 1 }, { alpha = true } = {}) {
  const h = (v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b) + (alpha && a < 0.999 ? h(a) : '');
}
export const rgb255 = (c) => [Math.round(clamp(c.r) * 255), Math.round(clamp(c.g) * 255), Math.round(clamp(c.b) * 255)];

export function toOklab({ r, g, b }) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}
export function fromOklab({ L, A, B }) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return { r: toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: toGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) };
}
export function toOklch(c) { const { L, A, B } = toOklab(c); const C = Math.hypot(A, B); let h = (Math.atan2(B, A) * 180) / Math.PI; if (h < 0) h += 360; return { l: L, c: C, h: C < 1e-4 ? 0 : h }; }
export function fromOklchRaw({ l, c, h }) { const r = (h * Math.PI) / 180; return fromOklab({ L: l, A: c * Math.cos(r), B: c * Math.sin(r) }); }
const inGamut = (x) => x.r >= -1e-4 && x.r <= 1.0001 && x.g >= -1e-4 && x.g <= 1.0001 && x.b >= -1e-4 && x.b <= 1.0001;
/** OKLCH → sRGB with chroma reduction until in gamut (CSS Color 4 style, simplified). */
export function fromOklch({ l, c, h }) {
  l = clamp(l); let x = fromOklchRaw({ l, c, h });
  if (inGamut(x)) return { r: clamp(x.r), g: clamp(x.g), b: clamp(x.b) };
  let lo = 0, hi = c;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inGamut(fromOklchRaw({ l, c: m, h }))) lo = m; else hi = m; }
  x = fromOklchRaw({ l, c: lo, h }); return { r: clamp(x.r), g: clamp(x.g), b: clamp(x.b) };
}
export function toHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s, l };
}
export function fromHsl({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4) };
}
export function toHsv({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: max ? d / max : 0, v: max };
}
export function fromHsv({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5), g: f(3), b: f(1) };
}

// ── formatting ───────────────────────────────────────────────────────────────
const r1 = (v, n = 1) => +v.toFixed(n);
export function formats(c) {
  const [R, G, B] = rgb255(c), hs = toHsl(c), ok = toOklch(c), a = c.a ?? 1;
  const al = a < 0.999 ? ` / ${Math.round(a * 100)}%` : '';
  return {
    hex: hex(c),
    rgb: `rgb(${R} ${G} ${B}${al})`,
    hsl: `hsl(${Math.round(hs.h)} ${Math.round(hs.s * 100)}% ${Math.round(hs.l * 100)}%${al})`,
    oklch: `oklch(${r1(ok.l * 100, 1)}% ${r1(ok.c, 3)} ${r1(ok.h, 1)}${al})`,
  };
}

// ── parse ────────────────────────────────────────────────────────────────────
const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', rebeccapurple: '#663399', tomato: '#ff6347', gold: '#ffd700', navy: '#000080', teal: '#008080', orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', silver: '#c0c0c0', crimson: '#dc143c', coral: '#ff7f50', salmon: '#fa8072', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', pink: '#ffc0cb', indigo: '#4b0082', forestgreen: '#228b22', seagreen: '#2e8b57', skyblue: '#87ceeb', slategray: '#708090', hotpink: '#ff69b4', transparent: '#00000000' };
const num = (s, scale = 1) => (s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));
/** parse('#15803d' | 'rgb(…)' | 'hsl(…)' | 'oklch(…)' | name | '15803d') → { r,g,b,a } or null. complete=false rejects partial 3/4-digit hex while typing. */
export function parse(input, { partial = true } = {}) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) s = NAMED[s];
  let m = /^#?([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 5 || h.length === 7) return null;
    if (h.length <= 4) { if (!partial) return null; h = [...h].map((x) => x + x).join(''); }
    if (!s.startsWith('#') && !/[a-f]/.test(h) && h.length !== 6) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  m = /^(rgba?|hsla?|oklch|oklab|hsv)\(\s*([^)]*)\)$/.exec(s);
  if (!m) return null;
  const parts = m[2].replace(/\s*\/\s*/, ' / ').split(/[\s,]+/).filter(Boolean);
  const slash = parts.indexOf('/'); let a = 1;
  if (slash >= 0) { a = num(parts[slash + 1], 1); parts.splice(slash, 2); } else if (parts.length === 4) a = num(parts.pop(), 1);
  if (parts.length < 3) return null;
  let c;
  if (m[1].startsWith('rgb')) c = { r: num(parts[0], 255) / 255, g: num(parts[1], 255) / 255, b: num(parts[2], 255) / 255 };
  else if (m[1].startsWith('hsl')) c = fromHsl({ h: parseFloat(parts[0]), s: num(parts[1].endsWith('%') ? parts[1] : parts[1] + '%', 1), l: num(parts[2].endsWith('%') ? parts[2] : parts[2] + '%', 1) });
  else if (m[1] === 'oklch') c = fromOklch({ l: parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]), c: num(parts[1], 0.4), h: parseFloat(parts[2]) || 0 });
  else if (m[1] === 'oklab') c = fromOklab({ L: parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]), A: num(parts[1], 0.4), B: num(parts[2], 0.4) });
  else c = fromHsv({ h: parseFloat(parts[0]), s: num(parts[1], 1), v: num(parts[2], 1) });
  if ([c.r, c.g, c.b, a].some((v) => Number.isNaN(v))) return null;
  return { r: clamp(c.r), g: clamp(c.g), b: clamp(c.b), a: clamp(a) };
}

// ── contrast ─────────────────────────────────────────────────────────────────
export function luminance(c) { return 0.2126 * toLin(clamp(c.r)) + 0.7152 * toLin(clamp(c.g)) + 0.0722 * toLin(clamp(c.b)); }
export function wcag(fg, bg) { const a = luminance(fg), b = luminance(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
/** APCA-W3 0.0.98G-4g: Lc (signed; positive = dark text on light). */
export function apca(fg, bg) {
  const Y = (c) => { const [R, G, B] = rgb255(c).map((v) => (v / 255) ** 2.4); let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B; if (y < 0.022) y += (0.022 - y) ** 1.414; return y; };
  const yt = Y(fg), yb = Y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let out;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; out = s < 0.1 ? 0 : s - 0.027; } else { const s = (yb ** 0.65 - yt ** 0.62) * 1.14; out = s > -0.1 ? 0 : s + 0.027; }
  return out * 100;
}
export function apcaVerdict(lc) {
  const a = Math.abs(lc);
  if (a >= 90) return 'Great for any text'; if (a >= 75) return 'Fine for body text'; if (a >= 60) return 'OK for larger text'; if (a >= 45) return 'Headlines only'; if (a >= 30) return 'Icons and borders only'; return 'Too faint for text';
}
/** Nearest OKLCH lightness for `fg` that reaches `target` against `bg` (hue and chroma kept, gamut-mapped). */
export function fixContrast(fg, bg, target = 4.5) {
  const o = toOklch(fg); let best = null;
  for (const dir of [-1, 1]) {
    for (let i = 1; i <= 200; i++) {
      const l = o.l + dir * i * 0.005; if (l < 0 || l > 1) break;
      const c = fromOklch({ l, c: o.c, h: o.h });
      if (wcag(c, bg) >= target) { const d = Math.abs(l - o.l); if (!best || d < best.d) best = { c, d, l }; break; }
    }
  }
  return best ? best.c : null;
}

// ── scale 50–950 (OKLCH), anchored: the colour itself is one of the steps ─────
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const TL = [0.971, 0.936, 0.885, 0.808, 0.716, 0.627, 0.532, 0.452, 0.392, 0.338, 0.256];
const TC = [0.16, 0.3, 0.52, 0.8, 0.95, 1, 0.95, 0.84, 0.7, 0.58, 0.44];
export function scale(base) {
  const o = toOklch(base);
  let ai = 0; TL.forEach((l, i) => { if (Math.abs(l - o.l) < Math.abs(TL[ai] - o.l)) ai = i; });
  const dl = o.l - TL[ai];
  return STEPS.map((step, i) => {
    if (i === ai) return { step, c: { ...base, a: 1 }, anchor: true };
    const w = Math.exp(-Math.abs(i - ai) / 2.2);
    const l = clamp(TL[i] + dl * w, 0.12, 0.985);
    const ch = o.c * (TC[i] / TC[ai]);
    const hh = o.h + (i - ai) * 0.6;
    return { step, c: fromOklch({ l, c: ch, h: hh }), anchor: false };
  });
}

// ── harmonies (OKLCH hue) ────────────────────────────────────────────────────
export const HARMONIES = { auto: 'Auto', analogous: 'Analogous', complementary: 'Complementary', triad: 'Triad', split: 'Split complementary', tetrad: 'Tetrad', mono: 'Monochrome' };
const OFFS = { analogous: [0, -32, 32, -64, 64], complementary: [0, 180, 0, 180, 0], triad: [0, 120, 240, 120, 240], split: [0, 150, 210, 150, 210], tetrad: [0, 90, 180, 270, 0], mono: [0, 0, 0, 0, 0] };
export function harmony(base, kind, rnd = Math.random, locked = []) {
  const o = toOklch(base);
  if (kind === 'auto') kind = ['analogous', 'complementary', 'triad', 'split', 'tetrad'][Math.floor(rnd() * 5)];
  const offs = OFFS[kind];
  return offs.map((d, i) => {
    if (locked[i]) return locked[i];
    if (i === 0) return { ...base, a: 1 };
    const L = kind === 'mono' ? clamp(0.25 + i * 0.17 + (rnd() - 0.5) * 0.08, 0.15, 0.96) : clamp(o.l + (rnd() - 0.5) * 0.5, 0.25, 0.94);
    const C = clamp(o.c * (0.55 + rnd() * 0.75), 0.02, 0.3);
    return fromOklch({ l: L, c: kind === 'mono' ? o.c * (0.5 + rnd() * 0.6) : C, h: (o.h + d + (rnd() - 0.5) * 14 + 360) % 360 });
  });
}

// ── colour-blindness simulation (Machado et al. 2009, severity 1, in linear RGB) ──
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export const CVD_LABELS = { none: 'Normal vision', protan: 'Protanopia (no red)', deutan: 'Deuteranopia (no green)', tritan: 'Tritanopia (no blue)', achroma: 'Achromatopsia (no colour)' };
export function simulate(c, kind) {
  if (!kind || kind === 'none') return c;
  const R = toLin(c.r), G = toLin(c.g), B = toLin(c.b);
  if (kind === 'achroma') { const y = toGam(0.2126 * R + 0.7152 * G + 0.0722 * B); return { r: y, g: y, b: y }; }
  const m = CVD[kind];
  return { r: clamp(toGam(clamp(m[0][0] * R + m[0][1] * G + m[0][2] * B))), g: clamp(toGam(clamp(m[1][0] * R + m[1][1] * G + m[1][2] * B))), b: clamp(toGam(clamp(m[2][0] * R + m[2][1] * G + m[2][2] * B))) };
}

// ── names (small curated list, nearest in OKLab) ─────────────────────────────
const NAMES = [
  ['Fern green', '#15803d'], ['Forest', '#14532d'], ['Moss', '#5f7f3a'], ['Mint', '#86efac'], ['Sage', '#9caf88'], ['Lime', '#84cc16'], ['Emerald', '#10b981'], ['Jade', '#00a86b'],
  ['Teal', '#0d9488'], ['Lagoon', '#0e7490'], ['Sky', '#38bdf8'], ['Cornflower', '#6495ed'], ['Royal blue', '#2563eb'], ['Navy', '#1e3a8a'], ['Ink', '#111827'], ['Indigo', '#4f46e5'],
  ['Violet', '#7c3aed'], ['Lavender', '#c4b5fd'], ['Plum', '#7e22ce'], ['Orchid', '#d946ef'], ['Rose', '#f43f5e'], ['Raspberry', '#be123c'], ['Brick', '#b91c1c'], ['Tomato', '#ef4444'],
  ['Coral', '#fb7185'], ['Salmon', '#fa8072'], ['Peach', '#fdba74'], ['Tangerine', '#f97316'], ['Rust', '#c2410c'], ['Amber', '#f59e0b'], ['Mustard', '#ca8a04'], ['Butter', '#fde68a'],
  ['Sand', '#d6c4a8'], ['Clay', '#a16207'], ['Cocoa', '#5b3a29'], ['Espresso', '#2b1d14'], ['Charcoal', '#27272a'], ['Graphite', '#52525b'], ['Slate', '#64748b'], ['Fog', '#d4d4d8'],
  ['Mist', '#f4f4f5'], ['Snow', '#ffffff'], ['Midnight', '#0b0b0c'], ['Spring green', '#4ade80'], ['Pine', '#166534'], ['Olive', '#65a30d'], ['Seafoam', '#5eead4'], ['Bubblegum', '#f9a8d4'],
].map(([n, h]) => [n, toOklab(parse(h))]);
export function nameOf(c) {
  const o = toOklab(c); let best = NAMES[0], bd = 1e9;
  for (const n of NAMES) { const d = (n[1].L - o.L) ** 2 + (n[1].A - o.A) ** 2 + (n[1].B - o.B) ** 2; if (d < bd) { bd = d; best = n; } }
  return bd < 0.004 ? best[0] : `Near ${best[0].toLowerCase()}`;
}

/** Most distinct colours in an image (k-means in OKLab on a downsampled copy). */
export function extract(imgData, k = 5) {
  const { data, width, height } = imgData; const pts = [];
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 6000)));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) { const i = (y * width + x) * 4; if (data[i + 3] < 128) continue; pts.push(toOklab({ r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255 })); }
  if (!pts.length) return [];
  let cs = []; for (let i = 0; i < k; i++) cs.push({ ...pts[Math.floor(((i + 0.5) / k) * pts.length)] });
  // spread init: farthest point
  cs = [pts[0]]; while (cs.length < k) { let bi = 0, bd = -1; for (let i = 0; i < pts.length; i += 3) { const p = pts[i]; const d = Math.min(...cs.map((c) => (c.L - p.L) ** 2 + (c.A - p.A) ** 2 + (c.B - p.B) ** 2)); if (d > bd) { bd = d; bi = i; } } cs.push({ ...pts[bi] }); }
  let counts = [];
  for (let it = 0; it < 10; it++) {
    const sum = cs.map(() => ({ L: 0, A: 0, B: 0, n: 0 }));
    for (const p of pts) { let bi = 0, bd = 1e9; cs.forEach((c, i) => { const d = (c.L - p.L) ** 2 + (c.A - p.A) ** 2 + (c.B - p.B) ** 2; if (d < bd) { bd = d; bi = i; } }); const s = sum[bi]; s.L += p.L; s.A += p.A; s.B += p.B; s.n++; }
    cs = sum.map((s, i) => (s.n ? { L: s.L / s.n, A: s.A / s.n, B: s.B / s.n } : cs[i])); counts = sum.map((s) => s.n);
  }
  return cs.map((c, i) => ({ c: fromOklab(c), n: counts[i] })).sort((a, b) => b.n - a.n).map((x) => ({ r: clamp(x.c.r), g: clamp(x.c.g), b: clamp(x.c.b), a: 1 }));
}
