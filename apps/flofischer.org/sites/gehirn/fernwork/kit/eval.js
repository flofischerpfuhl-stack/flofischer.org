// Fernwork kit · inline answers (math, units, time, colour) and paste detectors (URL, JWT, hash, UUID, Base64,
// epoch/ISO, colour, WIFI:, vCard, JSON). Pure functions, no DOM. Revision 1: NOT used by the shell any more (the
// command bar is a pure tool search); kept for pages that import it directly (Calculator: convertUnits) and for
// in-tool detection (e.g. JSON Formatter noticing a JWT). Real build: lazy-load calc-engine (mathjs) only when MATH_HINT matches; this is a tiny stand-in.

// ── number formatting ─────────────────────────────────────────────────────────
const NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 10 });
export function fmtNum(x, { sig = 10 } = {}) {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e15 || a < 1e-6)) return x.toExponential(6).replace(/\.?0+e/, 'e');
  return NF.format(Number(x.toPrecision(sig)));
}
export const rawNum = (x) => (Number.isFinite(x) ? String(Number(x.toPrecision(12))) : String(x));

// ── math ─────────────────────────────────────────────────────────────────────
const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
  atan: Math.atan, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, abs: Math.abs, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, exp: Math.exp,
};
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: Math.PI * 2 };
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, 'mod': 2, 'neg': 3, '^': 4 };
export const MATH_HINT = /^[\d\s.,+\-*/^%()×÷xπ!a-z]*[+\-*/^%×÷(!][\d\s.,+\-*/^%()×÷xπ!a-z]*$/i;

function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    if ((c === 'x' || c === 'X') && !/[a-z]/i.test(src[i + 1] || '')) { out.push({ t: 'op', v: '*' }); i++; continue; }
    const id = /^[a-zπ]+\d*/i.exec(src.slice(i));
    if (id) {
      const w = id[0].toLowerCase();
      if (w in FUNCS) out.push({ t: 'fn', v: w });
      else if (w in CONSTS) out.push({ t: 'num', v: CONSTS[w] });
      else if (w === 'mod') out.push({ t: 'op', v: 'mod' });
      else if (w === 'x') out.push({ t: 'op', v: '*' });
      else throw new Error('unknown ' + w);
      i += id[0].length; continue;
    }
    if (c === '*' && src[i + 1] === '*') { out.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^×÷'.includes(c)) { out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c }); i++; continue; }
    if (c === '%') { out.push({ t: 'post', v: '%' }); i++; continue; }
    if (c === '!') { out.push({ t: 'post', v: '!' }); i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    throw new Error('bad char ' + c);
  }
  return out;
}
function toRPN(tokens) {
  const out = [], st = []; let prev = null;
  for (const tk of tokens) {
    if (tk.t === 'num') out.push(tk);
    else if (tk.t === 'fn') st.push(tk);
    else if (tk.t === 'post') out.push(tk);
    else if (tk.t === 'op') {
      let op = tk.v;
      if (op === '-' && (!prev || prev.t === 'op' || prev.t === '(' || prev.t === 'fn')) op = 'neg';
      else if (op === '+' && (!prev || prev.t === 'op' || prev.t === '(')) { prev = tk; continue; }
      while (st.length) {
        const top = st[st.length - 1];
        if (top.t === 'fn') { out.push(st.pop()); continue; }
        if (top.t !== 'op') break;
        const right = op === '^' || op === 'neg';
        if ((right && PREC[top.v] > PREC[op]) || (!right && PREC[top.v] >= PREC[op])) out.push(st.pop()); else break;
      }
      st.push({ t: 'op', v: op });
    } else if (tk.t === '(') st.push(tk);
    else if (tk.t === ')') {
      while (st.length && st[st.length - 1].t !== '(') out.push(st.pop());
      if (!st.length) throw new Error('paren');
      st.pop();
      if (st.length && st[st.length - 1].t === 'fn') out.push(st.pop());
    }
    prev = tk;
  }
  while (st.length) { const t = st.pop(); if (t.t === '(') throw new Error('paren'); out.push(t); }
  return out;
}
function evalRPN(rpn) {
  const s = [];
  const fact = (n) => { if (n < 0 || n > 170 || n % 1) throw new Error('fact'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  for (const tk of rpn) {
    if (tk.t === 'num') s.push(tk.v);
    else if (tk.t === 'post') { const a = s.pop(); if (a === undefined) throw new Error('post'); s.push(tk.v === '%' ? a / 100 : fact(a)); }
    else if (tk.t === 'fn') { const a = s.pop(); if (a === undefined) throw new Error('fn'); s.push(FUNCS[tk.v](a)); }
    else if (tk.v === 'neg') { const a = s.pop(); if (a === undefined) throw new Error('neg'); s.push(-a); }
    else {
      const b = s.pop(), a = s.pop(); if (a === undefined || b === undefined) throw new Error('arity');
      s.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b : tk.v === '/' ? a / b : tk.v === 'mod' ? a % b : Math.pow(a, b));
    }
  }
  if (s.length !== 1) throw new Error('leftover');
  return s[0];
}
export function evalMath(input) {
  let q = String(input).trim().replace(/^=\s*/, '').replace(/\s*=\s*\??$/, '');
  q = q.replace(/(\d{1,3})(,\d{3})+(?!\d)/g, (m) => m.replace(/,/g, ''));
  q = q.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*/gi, '($1/100)*');
  if (!/[+\-*/^%×÷!(]|\d\s*x\s*\d|\b(sqrt|sin|cos|tan|log|ln|abs|mod)\b/i.test(q)) return null;
  if (/^[\d\s]+-[\d\s]+-[\d\s]+$/.test(q)) return null; // dates / phone-ish
  try {
    const v = evalRPN(toRPN(tokenize(q)));
    if (!Number.isFinite(v)) return { error: v !== v ? 'Not a number' : 'Division by zero' };
    return { value: v };
  } catch { return null; }
}

// ── units ────────────────────────────────────────────────────────────────────
const U = {}; // alias -> { dim, f, sym }
function def(dim, f, sym, ...aliases) { for (const a of [sym.toLowerCase(), ...aliases]) U[a] = { dim, f, sym }; }
def('length', 1e-6, 'µm', 'um', 'micrometer', 'micrometers', 'micron', 'microns');
def('length', .001, 'mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres');
def('length', .01, 'cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres');
def('length', 1, 'm', 'meter', 'meters', 'metre', 'metres');
def('length', 1000, 'km', 'kms', 'kilometer', 'kilometers', 'kilometre', 'kilometres');
def('length', .0254, 'in', 'inch', 'inches', '"', '″');
def('length', .3048, 'ft', 'foot', 'feet', "'", '′');
def('length', .9144, 'yd', 'yard', 'yards');
def('length', 1609.344, 'mi', 'mile', 'miles');
def('length', 1852, 'nmi', 'nautical mile', 'nautical miles');
def('mass', 1e-6, 'mg', 'milligram', 'milligrams');
def('mass', .001, 'g', 'gram', 'grams', 'gr');
def('mass', 1, 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos', 'kgs');
def('mass', 1000, 't', 'tonne', 'tonnes', 'ton', 'tons');
def('mass', .45359237, 'lb', 'lbs', 'pound', 'pounds');
def('mass', .028349523125, 'oz', 'ounce', 'ounces');
def('mass', 6.35029318, 'st', 'stone', 'stones');
def('volume', .001, 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres');
def('volume', .01, 'cl', 'centiliter', 'centilitre');
def('volume', 1, 'L', 'l', 'liter', 'liters', 'litre', 'litres');
def('volume', 1000, 'm³', 'm3', 'cubic meter', 'cubic meters');
def('volume', 3.785411784, 'gal', 'gallon', 'gallons');
def('volume', .946352946, 'qt', 'quart', 'quarts');
def('volume', .473176473, 'pt', 'pint', 'pints');
def('volume', .2365882365, 'cup', 'cups');
def('volume', .0295735295625, 'fl oz', 'floz', 'fluid ounce', 'fluid ounces');
def('volume', .01478676478125, 'tbsp', 'tablespoon', 'tablespoons');
def('volume', .00492892159375, 'tsp', 'teaspoon', 'teaspoons');
def('area', 1e-4, 'cm²', 'cm2');
def('area', 1, 'm²', 'm2', 'sqm', 'square meter', 'square meters', 'square metre');
def('area', 1e6, 'km²', 'km2', 'square kilometer', 'square kilometers');
def('area', 1e4, 'ha', 'hectare', 'hectares');
def('area', 4046.8564224, 'acre', 'acres', 'ac');
def('area', .09290304, 'ft²', 'ft2', 'sqft', 'sq ft', 'square foot', 'square feet');
def('area', 2589988.110336, 'mi²', 'mi2', 'square mile', 'square miles');
def('speed', 1, 'm/s', 'mps', 'meters per second');
def('speed', 1 / 3.6, 'km/h', 'kmh', 'kph', 'kmph', 'kilometers per hour');
def('speed', .44704, 'mph', 'miles per hour');
def('speed', 1852 / 3600, 'kn', 'knot', 'knots', 'kt');
def('data', .125, 'bit', 'bits');
def('data', 1, 'B', 'b', 'byte', 'bytes');
def('data', 1e3, 'kB', 'kb', 'kilobyte', 'kilobytes');
def('data', 1e6, 'MB', 'mb', 'megabyte', 'megabytes');
def('data', 1e9, 'GB', 'gb', 'gigabyte', 'gigabytes');
def('data', 1e12, 'TB', 'tb', 'terabyte', 'terabytes');
def('data', 1024, 'KiB', 'kib'); def('data', 1048576, 'MiB', 'mib'); def('data', 1073741824, 'GiB', 'gib'); def('data', 1099511627776, 'TiB', 'tib');
def('time', .001, 'ms', 'millisecond', 'milliseconds');
def('time', 1, 's', 'sec', 'secs', 'second', 'seconds');
def('time', 60, 'min', 'mins', 'minute', 'minutes');
def('time', 3600, 'h', 'hr', 'hrs', 'hour', 'hours');
def('time', 86400, 'd', 'day', 'days');
def('time', 604800, 'wk', 'week', 'weeks');
def('time', 2629746, 'mo', 'month', 'months');
def('time', 31556952, 'yr', 'year', 'years');
def('energy', 1, 'J', 'j', 'joule', 'joules');
def('energy', 1000, 'kJ', 'kj', 'kilojoule', 'kilojoules');
def('energy', 4.184, 'cal', 'calorie', 'calories');
def('energy', 4184, 'kcal', 'kilocalorie', 'kilocalories');
def('energy', 3600, 'Wh', 'wh', 'watt hour', 'watt hours');
def('energy', 3.6e6, 'kWh', 'kwh', 'kilowatt hour', 'kilowatt hours');
def('pressure', 1, 'Pa', 'pa', 'pascal'); def('pressure', 1000, 'kPa', 'kpa'); def('pressure', 1e5, 'bar', 'bars');
def('pressure', 6894.757293168, 'psi'); def('pressure', 101325, 'atm', 'atmosphere', 'atmospheres'); def('pressure', 133.322387415, 'mmHg', 'mmhg');
def('angle', Math.PI / 180, '°', 'deg', 'degree', 'degrees'); def('angle', 1, 'rad', 'radian', 'radians');
const TEMP = { c: 'C', '°c': 'C', celsius: 'C', degc: 'C', f: 'F', '°f': 'F', fahrenheit: 'F', degf: 'F', k: 'K', kelvin: 'K' };
const TEMP_SYM = { C: '°C', F: '°F', K: 'K' };

function unitOf(s) {
  const k = s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^degrees? /, '');
  if (TEMP[k]) return { dim: 'temp', t: TEMP[k], sym: TEMP_SYM[TEMP[k]] };
  return U[k] || U[k.replace(/\.$/, '')] || null;
}
const UNIT_RE = /^\s*(-?\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)\s*([a-zµ°'"″′²³/ .]+?)\s+(?:in|to|as|into|->|→|=)\s+([a-zµ°'"″′²³/ .]+?)\s*\??\s*$/i;
export function convertUnits(input) {
  const m = UNIT_RE.exec(String(input));
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const a = unitOf(m[2]), b = unitOf(m[3]);
  if (!a || !b || a.dim !== b.dim) return null;
  let v;
  if (a.dim === 'temp') {
    const toK = { C: (x) => x + 273.15, F: (x) => (x - 32) * 5 / 9 + 273.15, K: (x) => x };
    const fromK = { C: (x) => x - 273.15, F: (x) => (x - 273.15) * 9 / 5 + 32, K: (x) => x };
    v = fromK[b.t](toK[a.t](n));
  } else v = (n * a.f) / b.f;
  return { value: v, from: `${fmtNum(n)} ${a.sym}`, unit: b.sym, dim: a.dim };
}

// ── time ─────────────────────────────────────────────────────────────────────
export function relTime(ms, now = Date.now()) {
  const d = (ms - now) / 1000, a = Math.abs(d);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const steps = [[60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [2629746, 'week', 604800], [31556952, 'month', 2629746], [Infinity, 'year', 31556952]];
  for (const [lim, unit, div] of steps) if (a < lim) return rtf.format(Math.round(d / div), unit);
  return '';
}
const fmtUTC = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' UTC';
export function parseEpoch(s) {
  const t = String(s).trim();
  if (!/^\d{9,13}$/.test(t)) return null;
  const n = +t;
  const ms = t.length >= 12 ? n : n * 1000;
  if (ms < 315532800000 || ms > 4102444800000) return null; // 1980..2100
  return { ms, unit: t.length >= 12 ? 'milliseconds' : 'seconds' };
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// ── colour ───────────────────────────────────────────────────────────────────
export function parseColor(s) {
  const t = String(s).trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t); // bare hex is ambiguous with hashes, so '#' is required
  if (m) {
    let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(t);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(t);
  if (m) {
    const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100;
    const f = (n) => { const k = (n + h * 12) % 12, a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return { r: f(0), g: f(8), b: f(4) };
  }
  return null;
}
export const toHex = ({ r, g, b }) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
export function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; let h = 0, s = 0;
  if (max !== min) {
    const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

// ── answer(q): the top row of the command bar ─────────────────────────────────
// Returns null or { kind, q, value, unit?, copy, sub?, open: leafId, openLabel, swatch? }
const UNIT_LEAF = { length: 'units-length', area: 'units-area', volume: 'units-volume', mass: 'units-weight', temp: 'units-temperature', speed: 'units-speed', time: 'units-time', pressure: 'units-pressure', energy: 'units-energy', data: 'units-data', angle: 'units-angle' };
export function answer(q) {
  const s = String(q || '').trim();
  if (!s || s.length > 200) return null;
  const u = convertUnits(s);
  if (u) {
    const a = Math.abs(u.value);
    const v = a !== 0 && (a < 1e-4 || a >= 1e12) ? fmtNum(u.value, { sig: 6 }) : new Intl.NumberFormat('en-US', { maximumFractionDigits: a >= 100 ? 2 : a >= 1 ? 4 : 6 }).format(u.value);
    return { kind: 'unit', q: `${u.from} =`, value: v, unit: u.unit, copy: `${v} ${u.unit}`, open: UNIT_LEAF[u.dim] || 'units-length', openLabel: 'Units' };
  }
  const ep = parseEpoch(s);
  if (ep) return { kind: 'time', q: `Unix ${ep.unit}`, value: fmtUTC(ep.ms), copy: new Date(ep.ms).toISOString(), sub: relTime(ep.ms), open: 'timestamp', openLabel: 'Timestamp' };
  if (ISO_RE.test(s)) {
    const ms = Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s);
    if (!isNaN(ms)) return { kind: 'time', q: 'ISO date → Unix seconds', value: String(Math.floor(ms / 1000)), copy: String(Math.floor(ms / 1000)), sub: relTime(ms), open: 'timestamp', openLabel: 'Timestamp' };
  }
  const c = parseColor(s);
  if (c) return { kind: 'color', q: s, value: s.startsWith('#') ? `rgb(${c.r} ${c.g} ${c.b})` : toHex(c), copy: s.startsWith('#') ? `rgb(${c.r} ${c.g} ${c.b})` : toHex(c), sub: toHsl(c), swatch: toHex(c), open: 'color-picker', openLabel: 'Color Picker' };
  if (detect(s).length) return null;
  const m = evalMath(s);
  if (m && 'value' in m) return { kind: 'math', q: s.replace(/\s+/g, ' ') + ' =', value: fmtNum(m.value), copy: rawNum(m.value), open: 'calculator', openLabel: 'Calculator' };
  if (m && m.error) return { kind: 'math', q: s, value: m.error, copy: '', error: true, open: 'calculator', openLabel: 'Calculator' };
  return null;
}

// ── detect(text): what did the user paste? ───────────────────────────────────
const TRACKERS = /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_eid|mc_cid|igshid|igsh|si|ref|ref_src|spm|_hsenc|_hsmi|yclid|twclid|ttclid|s_cid|vero_id|oly_\w+|__s|feature)$/i;
function b64urlDecode(s) {
  try { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return decodeURIComponent(escape(atob(t + '==='.slice((t.length + 3) % 4)))); } catch { return null; }
}
/** Returns [{ type, label, detail, value, actions: [{ leaf, label, sub, primary? }] }] (most specific first). */
export function detect(text) {
  const s = String(text || '').trim();
  if (!s) return [];
  const out = [];
  // URL
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) {
    let n = 0, host = '';
    try { const u = new URL(s.startsWith('www.') ? 'https://' + s : s); host = u.hostname.replace(/^www\./, ''); u.searchParams.forEach((_, k) => { if (TRACKERS.test(k)) n++; }); } catch { /* ignore */ }
    out.push({ type: 'url', label: n ? `Link with ${n} tracker${n > 1 ? 's' : ''}` : 'Link', detail: host, value: s, actions: [
      { leaf: 'url-cleaner', label: 'URL Cleaner', sub: n ? `Remove ${n} tracker${n > 1 ? 's' : ''} before sharing` : 'Check for trackers', primary: true },
      { leaf: 'qr-generator', label: 'QR Code Generator', sub: 'Make a code for this link' },
    ] });
    return out;
  }
  // JWT
  if (/^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$/.test(s)) {
    const [h, p] = s.split('.');
    const head = JSON.parse(b64urlDecode(h) || '{}'); let pay = {};
    try { pay = JSON.parse(b64urlDecode(p) || '{}'); } catch { /* */ }
    const exp = pay.exp ? relTime(pay.exp * 1000) : '';
    out.push({ type: 'jwt', label: 'JSON Web Token', detail: [head.alg, pay.exp ? (pay.exp * 1000 < Date.now() ? 'expired ' + exp : 'expires ' + exp) : ''].filter(Boolean).join(' · '), value: s, actions: [
      { leaf: 'jwt-decoder', label: 'JWT Decoder', sub: 'Decode header and claims', primary: true },
    ] });
    return out;
  }
  // UUID
  const uu = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(s);
  if (uu) {
    out.push({ type: 'uuid', label: `UUID v${uu[1]}`, detail: uu[1] === '7' ? 'time-ordered' : uu[1] === '4' ? 'random' : '', value: s, actions: [
      { leaf: 'uuid-generator', label: 'UUID Generator', sub: 'Make new UUIDs', primary: true },
    ] });
    return out;
  }
  // Hex hash
  const HASH = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 128: 'SHA-512' };
  if (/^[0-9a-f]+$/i.test(s) && HASH[s.length]) {
    out.push({ type: 'hash', label: `${HASH[s.length]} hash`, detail: `${s.length} hex characters`, value: s, actions: [
      { leaf: 'hash-generator', label: 'Hash Generator', sub: 'Compare against a file or text', primary: true },
    ] });
    return out;
  }
  // Epoch / ISO
  const ep = parseEpoch(s);
  if (ep || ISO_RE.test(s)) {
    out.push({ type: 'time', label: ep ? `Unix time in ${ep.unit}` : 'ISO 8601 date', detail: ep ? relTime(ep.ms) : '', value: s, actions: [
      { leaf: 'timestamp', label: 'Timestamp', sub: 'All formats and time zones', primary: true },
    ] });
    return out;
  }
  // Colour
  if (parseColor(s)) {
    out.push({ type: 'color', label: 'Colour', detail: toHex(parseColor(s)), value: s, actions: [
      { leaf: 'color-picker', label: 'Color Picker', sub: 'HEX, RGB, HSL, OKLCH, contrast', primary: true },
    ] });
    return out;
  }
  // Wi-Fi
  if (/^WIFI:/i.test(s)) {
    const ssid = /S:((?:\\.|[^;])*)/i.exec(s)?.[1] || 'network';
    out.push({ type: 'wifi', label: `Wi-Fi network “${ssid}”`, detail: /T:(\w+)/i.exec(s)?.[1] || '', value: s, actions: [
      { leaf: 'wifi-qr', label: 'QR Code Generator', sub: 'Wi-Fi code guests scan to join', primary: true },
    ] });
    return out;
  }
  // vCard
  if (/^BEGIN:VCARD/i.test(s)) {
    const fn = /\nFN[^:]*:(.+)/i.exec(s)?.[1]?.trim() || 'contact';
    out.push({ type: 'vcard', label: `Contact card · ${fn}`, detail: 'vCard', value: s, actions: [
      { leaf: 'qr-generator', label: 'QR Code Generator', sub: 'Share the contact as a code', primary: true },
    ] });
    return out;
  }
  // JSON
  if (/^[[{]/.test(s) && s.length > 2) {
    try {
      const j = JSON.parse(s);
      const k = Array.isArray(j) ? j.length : Object.keys(j).length;
      const n = `${k} ${Array.isArray(j) ? 'item' : 'key'}${k === 1 ? '' : 's'}`;
      out.push({ type: 'json', label: 'JSON', detail: n, value: s, actions: [
        { leaf: 'json-formatter', label: 'JSON Formatter', sub: 'Pretty-print and explore', primary: true },
        { leaf: 'json-to-csv', label: 'JSON to CSV', sub: 'Make a table' },
      ] });
      return out;
    } catch { /* not json */ }
  }
  // Base64 (long, decodes to mostly printable text)
  if (s.length >= 16 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(s) && !/^\d+$/.test(s)) {
    const d = b64urlDecode(s);
    if (d && /^[\x20-\x7e\s -￿]+$/.test(d) && d.replace(/[^\x20-\x7e]/g, '').length / d.length > .9) {
      out.push({ type: 'base64', label: 'Base64 text', detail: `“${d.slice(0, 32)}${d.length > 32 ? '…' : ''}”`, value: s, actions: [
        { leaf: 'encode-decode', label: 'Encode / Decode', sub: 'Decode Base64', primary: true },
      ] });
    }
  }
  return out;
}

// ── tracking-parameter cleaner (shared by Clean link demo) ────────────────────
export function cleanUrl(s) {
  const u = new URL(s.startsWith('www.') ? 'https://' + s : s);
  const removed = [];
  [...u.searchParams.keys()].forEach((k) => { if (TRACKERS.test(k)) { removed.push(k); u.searchParams.delete(k); } });
  return { url: u.toString().replace(/\?$/, ''), removed };
}
