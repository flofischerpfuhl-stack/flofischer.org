// Calc Paper engine · line-by-line evaluation on mathjs 15 (number mode, no BigNumber → no DecimalError, no 30 s asin).
// Adds: locale-aware number reading with an honest echo, line references (line3, ans, sum), natural phrases
// (19% of 1.200, 5 min), shared unit table with the Units tool (kit/eval.js convertUnits), friendly errors with
// quick fixes, free-variable detection for plots and sliders, angle mode (RAD/DEG) shared with the graph.
import { convertUnits } from '../kit/eval.js';

const MJ = window.math;
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const CONSTS = new Set(['pi', 'e', 'i', 'tau', 'phi', 'Infinity', 'NaN', 'true', 'false', 'null', 'E', 'PI', 'LN2', 'LN10', 'SQRT2']);
const UNIT_PRETTY = { degC: '°C', degF: '°F', deg: '°', minute: 'min', hour: 'h', second: 's', liter: 'L', l: 'L' };
const UNIT_NAMES = { kg: 'kilograms', g: 'grams', m: 'metres', km: 'kilometres', cm: 'centimetres', mm: 'millimetres', mi: 'miles', ft: 'feet', inch: 'inches', lb: 'pounds', s: 'seconds', h: 'hours', minute: 'minutes', hour: 'hours', L: 'litres', l: 'litres', degC: '°C', degF: '°F', W: 'watts', kWh: 'kilowatt hours', J: 'joules' };

// ── two math instances: radians and degrees (trig overridden, snapped so sin(pi) = 0 and tan(pi/2) is undefined) ──
function makeMath(angle) {
  const m = MJ.create(MJ.all, { number: 'number', precision: 64 });
  const k = angle === 'deg' ? Math.PI / 180 : 1;
  const snap = (v) => (Math.abs(v) < 1e-14 ? 0 : Math.abs(v) > 1e15 ? NaN : v);
  const fwd = (name, f) => m.typed(name, {
    number: (x) => snap(f(x * k)),
    Unit: (u) => snap(f(u.toNumber('rad'))),
    'Array | Matrix': (a) => m.map(a, (v) => snap(f(v * k))),
  });
  const inv = (name, f) => m.typed(name, { number: (x) => snap(f(x) / k), 'Array | Matrix': (a) => m.map(a, (v) => snap(f(v) / k)) });
  m.import({
    sin: fwd('sin', Math.sin), cos: fwd('cos', Math.cos), tan: fwd('tan', Math.tan),
    sec: fwd('sec', (x) => 1 / Math.cos(x)), csc: fwd('csc', (x) => 1 / Math.sin(x)), cot: fwd('cot', (x) => 1 / Math.tan(x)),
    asin: inv('asin', Math.asin), acos: inv('acos', Math.acos), atan: inv('atan', Math.atan),
    ln: m.typed('ln', { number: (x) => Math.log(x) }),
  }, { override: true });
  return m;
}
const MATH = { rad: null, deg: null };
export const mathFor = (angle = 'rad') => (MATH[angle] ||= makeMath(angle));

// ── number formatting: 'pt' = 1234.5 (default, decimal point) · 'en' = 1,234.5 · 'de' = 1.234,5 (explicit option only) ──
const NF = {};
const nf = (fmt, max) => (NF[fmt + max] ||= new Intl.NumberFormat(fmt === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: max, useGrouping: fmt !== 'pt' }));
export function fmtNumber(v, fmt = 'pt', { sig = 12, maxFrac = 10 } = {}) {
  if (typeof v !== 'number') return String(v);
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e15 || a < 1e-7)) {
    const [mant, ex] = v.toExponential(Math.min(sig, 7) - 1).split('e');
    const mm = String(Number(mant)).replace('-', '−');
    return `${fmt === 'de' ? mm.replace('.', ',') : mm} × 10${String(+ex).split('').map((c) => SUP[c] || c).join('')}`;
  }
  const r = Number(v.toPrecision(sig));
  return nf(fmt, maxFrac).format(r).replace('-', '−');
}
/** Plain machine form for copying into code ("1428", "0.19"). */
export const rawNumber = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(12))) : String(v));
const prettyUnit = (u) => String(u).replace(/\b(degC|degF|deg|minute|hour|second|liter)\b/g, (x) => UNIT_PRETTY[x] || x).replace(/\s*\/\s*/g, '/').replace(/\s*\^\s*2/g, '²').replace(/\s*\^\s*3/g, '³');

/** Pretty-print source for echoes and the mobile display (ASCII stays the source of truth). */
export function pretty(s) {
  return String(s).replace(/\*\*/g, '^').replace(/\s*\*\s*/g, ' × ').replace(/(\S)\s*-\s*/g, '$1 − ').replace(/^-/, '−')
    .replace(/\bsqrt\(/g, '√(').replace(/\bpi\b/g, 'π').replace(/\^2(?!\d)/g, '²').replace(/\^3(?!\d)/g, '³').replace(/\s+/g, ' ').trim();
}

// ── locale number reading ──
// de: 1.000 / 1.234.567 / 1.000,25 = grouping; 1,5 = decimal comma.  en: 1,000 / 1,234.5 = grouping.
// Lists [1, 2] and identifiers (log10, line3) are never touched. Returns { text, changed (ambiguous re-read) }.
export function readNumbers(src, fmt) {
  let out = '', i = 0, changed = false, sq = 0, conv = false;
  while (i < src.length) {
    const rest = src.slice(i), c = src[i];
    const id = /^[A-Za-z_][\w]*/.exec(rest);
    if (id) { out += id[0]; i += id[0].length; continue; }
    if (c === '[') sq++; else if (c === ']') sq = Math.max(0, sq - 1);
    if (/\d/.test(c)) {
      let m;
      if (fmt === 'de' && (m = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\d.])/.exec(rest))) {
        out += m[0].replace(/\./g, '').replace(',', '.'); changed = true; i += m[0].length; continue;
      }
      if (fmt === 'de' && !sq && (m = /^\d+,\d+/.exec(rest))) { out += m[0].replace(',', '.'); conv = true; i += m[0].length; continue; }
      if (fmt !== 'de' && !sq && (m = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/.exec(rest))) { out += m[0].replace(/,/g, ''); i += m[0].length; continue; }
      m = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(rest); out += m[0]; i += m[0].length; continue;
    }
    out += c; i++;
  }
  return { text: out, changed, conv };
}

/** "1,5" or "3 + 1,25" outside brackets (not 1,200-style grouping): positions of decimal-comma numbers. */
function decimalCommas(src) {
  const out = []; let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (depth || !/\d/.test(c) || (i && /[\w.]/.test(src[i - 1]))) continue;
    const m = /^\d+,\d+(?![\d,.])/.exec(src.slice(i));
    if (m && !/^\d{1,3}(?:,\d{3})+$/.test(m[0])) out.push({ at: i, tok: m[0] });
    if (m) i += m[0].length - 1; else { const n = /^\d+/.exec(src.slice(i)); i += n[0].length - 1; }
  }
  return out;
}

// ── natural phrases → mathjs ──
function naturalize(s) {
  return s
    .replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'sqrt(').replace(/√\s*([\d.]+|[a-z]\w*)/gi, 'sqrt($1)')
    .replace(/°\s*C\b/g, ' degC').replace(/°\s*F\b/g, ' degF').replace(/(\d)\s*°(?![CF])/g, '$1 deg')
    .replace(/(\d)\s*(mins?|minutes?)\b/g, '$1 minute').replace(/(\d)\s*(hrs?|hours?)\b/g, '$1 hour')
    .replace(/\b(in|to)\s+(mins?|minutes?)\s*$/g, '$1 minute').replace(/\b(in|to)\s+(hrs?|hours?)\s*$/g, '$1 hour')
    .replace(/%\s*of\s+/gi, '% * ').replace(/%\s*off\s+/gi, '% OFF ')
    .replace(/(\S+)\s*%\s*OFF\s+(.+)$/, '($2) * (1 - $1%)');
}

// ── references ──
const REF_RE = /\b(?:line(\d+)|(ans|prev)|(sum|total))\b(?!\s*\()/g;

// ── lexer for the highlight overlay (same length as source; classes only) ──
export function lex(src, known) {
  const toks = []; let i = 0, depth = 0;
  const stack = [];
  while (i < src.length) {
    const rest = src.slice(i), c = src[i];
    if (/^\s*(\/\/|#)/.test(rest) && (c === '/' || c === '#')) { toks.push({ s: i, e: src.length, c: 'com' }); break; }
    let m = /^\d[\d.,]*(?:e[+-]?\d+)?%?/i.exec(rest);
    if (m) { toks.push({ s: i, e: i + m[0].length, c: 'num' }); i += m[0].length; continue; }
    m = /^[A-Za-z_][\w]*/.exec(rest);
    if (m) {
      const w = m[0]; const after = src.slice(i + w.length);
      let cls = 'id';
      if (/^(in|to|as|of|off)$/.test(w)) cls = 'kw';
      else if (/^line\d+$|^(ans|prev|sum|total)$/.test(w)) cls = 'ref';
      else if (/^\s*\(/.test(after) && (known.fns.has(w) || known.math(w))) cls = 'fn';
      else if (known.vars.has(w)) cls = 'var';
      else if (CONSTS.has(w)) cls = 'const';
      else if (known.unit(w) && /[\d)]\s*$/.test(src.slice(0, i)) || (known.unit(w) && /\b(in|to|as)\s+$/.test(src.slice(0, i)))) cls = 'unit';
      else if (w === 'x' || w === 'y') cls = 'xvar';
      toks.push({ s: i, e: i + w.length, c: cls }); i += w.length; continue;
    }
    if (c === '(' || c === '[') { stack.push(i); toks.push({ s: i, e: i + 1, c: 'p' + (depth % 3), pair: true }); depth++; i++; continue; }
    if (c === ')' || c === ']') {
      if (stack.length) { depth--; stack.pop(); toks.push({ s: i, e: i + 1, c: 'p' + (depth % 3), pair: true }); }
      else toks.push({ s: i, e: i + 1, c: 'bad' });
      i++; continue;
    }
    if ('+-*/^=%!<>×÷−·√'.includes(c)) { toks.push({ s: i, e: i + 1, c: c === '=' ? 'eq' : 'op', ch: c === '*' ? '×' : c === '-' ? '−' : c }); i++; continue; }
    if (c === '°') { toks.push({ s: i, e: i + 1, c: 'unit' }); i++; continue; }
    i++;
  }
  return { toks, open: stack };
}

// ── helpers ──
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function parenCheck(src) {
  const st = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '/' && src[i + 1] === '/') break;
    if (src[i] === '(') st.push(i);
    else if (src[i] === ')') { if (!st.length) return { extra: i }; st.pop(); }
  }
  return st.length ? { missing: st.length, at: st[0] } : null;
}
function unitWords(m, s) {
  const out = [];
  for (const w of s.match(/[A-Za-z]+/g) || []) if (m.Unit.isValuelessUnit(w) && !out.includes(w)) out.push(w);
  return out;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return +v;
  if (v && v.isUnit) return v.toNumber();
  return NaN;
}
function isSingleUnitUse(node, parent) {
  // `5 m`, `(1+2) kg` (implicit multiply after a value) or the right side of `in`/`to`
  if (!parent) return false;
  if (parent.isOperatorNode && parent.implicit && parent.args[1] === node) return true;
  if (parent.isOperatorNode && parent.fn === 'to' && parent.args[1] === node) return true;
  if (parent.isOperatorNode && parent.fn === 'divide' && parent.args[1] === node) {
    return true; // km/h
  }
  return false;
}

/**
 * evaluateSheet(lines, { angle, fmt }) → { results, scope, plots, sliders, known }
 * results[i] = { kind, text, copy, value, unit, name, error, echo, hint, plot }
 *   kind: empty | comment | heading | value | assign | fn | plot | error | pending
 */
export function evaluateSheet(lines, { angle = 'rad', fmt = 'pt' } = {}) {
  const m = mathFor(angle);
  const scope = new Map();
  const results = [];
  const defined = new Map();      // name -> line index
  const fns = new Set();
  // pre-pass: which names does the sheet define (so `a` used above its slider line still reads as a variable)
  lines.forEach((ln, i) => {
    const mm = /^\s*([A-Za-z_]\w*)\s*(\(([^)]*)\))?\s*=(?!=)/.exec(ln.replace(/^\s*[A-Za-z][\w ]*:\s+(?=\S)/, ''));
    if (mm && !defined.has(mm[1])) { defined.set(mm[1], i); if (mm[2]) fns.add(mm[1]); }
  });
  const isUnit = (w) => { try { return m.Unit.isValuelessUnit(w); } catch { return false; } };
  const inMath = (w) => w.length > 1 && typeof m[w] === 'function';
  let lastVal = null, block = [];
  const plots = [];

  lines.forEach((raw, idx) => {
    const r = { kind: 'empty', text: '', copy: '', value: null };
    results.push(r);
    let src = raw;
    if (!src.trim()) { block = []; return; }
    if (/^\s*(\/\/|#)/.test(src)) { r.kind = /^\s*#/.test(src) ? 'heading' : 'comment'; block = []; return; }
    src = src.replace(/\s*\/\/.*$/, '');
    const label = /^\s*([A-Za-z][\w ]*?):\s+(?=\S)/.exec(src);
    if (label && !/^\s*[A-Za-z_]\w*\s*\(/.test(src)) { r.label = label[1]; src = src.slice(label[0].length); }

    // paren balance first: the most common typing error, with a precise fix
    const pc = parenCheck(src);
    const off = raw.indexOf(src);
    if (pc?.missing) {
      r.kind = 'error';
      r.error = { msg: pc.missing > 1 ? `Missing ${pc.missing} closing brackets` : 'Missing )', detail: `for the ( in column ${pc.at + off + 1}`, at: [pc.at + off, pc.at + off + 1], fix: { label: pc.missing > 1 ? `Add ${')'.repeat(pc.missing)}` : 'Add )', apply: raw.replace(/\s*$/, '') + ')'.repeat(pc.missing) }, soft: true };
      // still preview the value it would have
      try { const v = m.evaluate(naturalize(readNumbers(src + ')'.repeat(pc.missing), fmt).text), new Map(scope)); if (typeof v === 'number') r.error.preview = fmtNumber(v, fmt); } catch { /* */ }
      return;
    }
    if (pc && 'extra' in pc) {
      r.kind = 'error';
      const at = pc.extra + off;
      r.error = { msg: 'Extra )', detail: 'there is no ( to close', at: [at, at + 1], fix: { label: 'Remove )', apply: raw.slice(0, at) + raw.slice(at + 1) } };
      return;
    }

    // decimal comma typed while the sheet uses a decimal point: say so and offer the fix (comma is an explicit option)
    if (fmt !== 'de') {
      const dc = decimalCommas(src);
      if (dc.length) {
        r.kind = 'error';
        const fixed = dc.reduce((t, d) => t.slice(0, d.at) + d.tok.replace(',', '.') + t.slice(d.at + d.tok.length), src);
        r.error = { msg: 'Use a point for decimals', detail: 'decimal comma: ⋯ › Number format', at: [dc[0].at + off, dc[0].at + off + dc[0].tok.length], fix: { label: `Use ${dc[0].tok.replace(',', '.')}`, apply: raw.slice(0, off) + fixed + raw.slice(off + src.length) } };
        return;
      }
    }

    // locale reading + natural phrases + references
    const rn = readNumbers(src, fmt);
    if (rn.changed) r.echo = pretty(rn.text);
    let expr = naturalize(rn.text);
    const refs = [];
    expr = expr.replace(REF_RE, (all, n, a, s) => {
      if (n) { refs.push(+n); return `__line${n}`; }
      if (a) return '__ans';
      return '__sum';
    });
    for (const n of refs) {
      const t = results[n - 1];
      if (!t || n - 1 >= idx) { r.kind = 'error'; r.error = { msg: `line${n} doesn’t exist yet`, detail: `this is line ${idx + 1}` }; return; }
      if (t.value == null) { r.kind = 'error'; r.error = { msg: `line${n} has no value`, detail: t.kind === 'error' ? 'it has an error itself' : '' }; return; }
      scope.set(`__line${n}`, t.value);
    }
    if (/__ans/.test(expr)) scope.set('__ans', lastVal ?? 0);
    if (/__sum/.test(expr)) {
      let s = null;
      try { for (const v of block) s = s == null ? v : typeof s === 'number' && typeof v === 'number' ? s + v : m.add(s, v); } catch { r.kind = 'error'; r.error = { msg: 'Can’t add these lines', detail: 'they have different units' }; return; }
      scope.set('__sum', s ?? 0); r.sumOf = block.length;
    }

    // simple "<n> <unit> in <unit>" → the Units tool's table (kit/eval.js), so both tools always agree
    const ku = convertUnits(expr.replace(/\bdegC\b/g, '°C').replace(/\bdegF\b/g, '°F').replace(/\bminute\b/g, 'min').replace(/\bhour\b/g, 'h'));
    if (ku && !/[=]/.test(expr)) {
      const a = Math.abs(ku.value);
      const v = a !== 0 && (a < 1e-4 || a >= 1e12) ? fmtNumber(ku.value, fmt, { sig: 6 }) : nf(fmt, a >= 100 ? 2 : a >= 1 ? 4 : 6).format(ku.value).replace('-', '−');
      Object.assign(r, { kind: 'value', text: `${v} ${ku.unit}`, num: v, unit: ku.unit, copy: `${v} ${ku.unit}`, value: ku.value, units: true, dim: ku.dim });
      lastVal = ku.value; return;
    }

    let node;
    try { node = m.parse(expr); } catch (e) { fail(r, e, expr, raw, defined, scope, m, fmt); return; }

    // y = … with x → plot
    if (node.isAssignmentNode && node.object?.name === 'y' && !defined.has('x')) {
      const free = freeSyms(node.value, new Set(['x', ...defined.keys()]), scope, isUnit, m, true);
      return plotLine(r, idx, raw, node.value, 'y', ['x'], free);
    }
    // f(x) = …
    if (node.isFunctionAssignmentNode) {
      const free = freeSyms(node.expr, new Set([...node.params, ...defined.keys()]), scope, isUnit, m, true);
      try { node.evaluate(scope); } catch { /* defined lazily */ }
      fns.add(node.name);
      if (node.params.length === 1) return plotLine(r, idx, raw, node.expr, node.name, node.params, free);
      Object.assign(r, { kind: 'fn', name: node.name, text: `${node.name}(${node.params.join(', ')})`, copy: '' });
      return;
    }
    // bare expression with a free x → plot
    const freeTop = freeSyms(node, new Set(), scope, isUnit, m, false);
    if (freeTop.has('x') && !node.isAssignmentNode) {
      const free = freeSyms(node, new Set(['x', ...defined.keys()]), scope, isUnit, m, true);
      return plotLine(r, idx, raw, node, 'y', ['x'], free);
    }
    if (freeTop.size) {
      const name = [...freeTop][0];
      notDefined(r, name, raw, defined, scope, m, isUnit(name));
      return;
    }

    let val;
    try { val = node.evaluate(scope); } catch (e) { fail(r, e, expr, raw, defined, scope, m, fmt); return; }
    if (node.isAssignmentNode) { r.kind = 'assign'; r.name = node.object?.name || node.name; } else r.kind = 'value';
    try { setValue(r, val, fmt, m); } catch (e) { r.kind = 'error'; r.error = { msg: 'Can’t show this result', raw: String(e?.message || e) }; r.value = null; return; }
    if (r.kind === 'error') return;
    if (typeof val === 'number' && !Number.isFinite(val) && /\/\s*0(?![.\d])/.test(expr)) { r.kind = 'error'; r.error = { msg: 'Can’t divide by zero' }; r.value = null; return; }
    if (r.value != null) { lastVal = r.value; block.push(r.value); }
  });

  function plotLine(r, idx, raw, bodyNode, name, params, free) {
    r.kind = 'plot'; r.name = name;
    const key = name === 'y' ? `L${idx}` : name;
    const code = bodyNode.compile();
    r.plot = { key, name, line: idx, param: params[0], code, node: bodyNode, free: [...free], label: name === 'y' ? 'y' : `${name}(${params[0]})` };
    if (free.size) {
      const v = [...free][0];
      r.hint = { msg: `${v} isn’t defined yet`, fix: { label: `Add slider ${v}`, kind: 'slider', name: v, line: idx } };
    } else plots.push(r.plot);
  }

  // finalize plot evaluators against the final scope (sliders may be defined below the function)
  const pscope = new Map(scope);
  for (const p of plots) {
    const code = p.code, param = p.param;
    p.f = (x) => { pscope.set(param, x); try { return toNum(code.evaluate(pscope)); } catch { return NaN; } };
  }
  // sliders: plain numeric assignments used by a plotted line
  const sliders = [];
  results.forEach((r, i) => {
    if (r.kind !== 'assign' || typeof r.value !== 'number' || !r.name) return;
    if (!/^\s*[A-Za-z_]\w*\s*=\s*-?[\d.,]+\s*$/.test(lines[i])) return;
    const used = plots.some((p) => p.code && new RegExp(`\\b${r.name}\\b`).test(lines[p.line]));
    if (used) sliders.push({ name: r.name, line: i, value: r.value });
  });
  return { results, scope, plots, sliders, known: { vars: new Set([...defined.keys()].filter((k) => !fns.has(k))), fns, math: inMath, unit: isUnit } };
}

function freeSyms(node, bound, scope, isUnit, m, fnBody) {
  const out = new Set();
  node.traverse((n, path, parent) => {
    if (!n.isSymbolNode) return;
    if (parent && parent.isFunctionNode && path === 'fn') return;
    if (parent && parent.isAssignmentNode && path === 'object') return;
    const w = n.name;
    if (bound.has(w) || scope.has(w) || CONSTS.has(w) || w.startsWith('__')) return;
    if (typeof m[w] !== 'undefined' && w.length > 1) return;
    if (isUnit(w)) {
      // single letters inside a plotted body are variables (a, b, h …), not units; elsewhere only when used like a unit
      if (w.length > 1 && !fnBody) return;
      if (w.length > 1 && fnBody && isSingleUnitUse(n, parent)) return;
      if (w.length === 1 && !fnBody && isSingleUnitUse(n, parent)) return;
      if (w.length > 1) return;
    }
    out.add(w);
  });
  return out;
}

function setValue(r, val, fmt, m) {
  if (typeof val === 'function') { r.kind = 'fn'; r.text = 'ƒ'; return; }
  if (typeof val === 'number') {
    r.value = val; r.text = fmtNumber(val, fmt); r.copy = r.text;
    if (Number.isNaN(val)) { r.kind = 'error'; r.error = { msg: 'Not defined here', detail: 'the function has no value at this point' }; r.value = null; }
    return;
  }
  if (typeof val === 'boolean') { r.text = val ? 'true' : 'false'; r.copy = r.text; return; }
  if (val && val.isUnit) {
    const n = val.toNumber(); const u = prettyUnit(val.formatUnits());
    const a = Math.abs(n);
    const t = a !== 0 && (a < 1e-4 || a >= 1e12) ? fmtNumber(n, fmt, { sig: 6 }) : fmtNumber(n, fmt, { sig: 10, maxFrac: a >= 100 ? 2 : a >= 1 ? 4 : 6 });
    Object.assign(r, { text: `${t} ${u}`, num: t, unit: u, copy: `${t} ${u}`, value: val, units: true });
    return;
  }
  if (val && (val.isMatrix || Array.isArray(val))) {
    const arr = val.toArray ? val.toArray() : val;
    const f = (a) => (Array.isArray(a) ? `[${a.map(f).join(', ')}]` : typeof a === 'number' ? fmtNumber(a, fmt) : String(a));
    r.text = f(arr); r.copy = m.format(val, { precision: 12 }); r.value = null; r.matrix = true; return;
  }
  if (val && val.isComplex) { r.text = m.format(val, { precision: 10 }).replace(/\./g, fmt === 'de' ? ',' : '.'); r.copy = r.text; r.value = null; r.note = 'complex'; return; }
  if (val && val.isResultSet) { const e = val.entries.at(-1); return setValue(r, e, fmt, m); }
  r.text = String(val); r.copy = r.text;
}

function notDefined(r, name, raw, defined, scope, m, unitToo) {
  r.kind = 'error';
  const at = new RegExp(`\\b${name}\\b`).exec(raw);
  const cands = [...scope.keys()].filter((k) => !k.startsWith('__'));
  const best = cands.map((k) => [k, lev(k.toLowerCase(), name.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
  r.error = { msg: `${name} isn’t defined`, at: at ? [at.index, at.index + name.length] : null };
  if (unitToo) r.error.detail = `on its own, ${name} would mean a unit`;
  if (best && best[1] <= 2 && best[1] < name.length) r.error.fix = { label: `Use ${best[0]}`, apply: raw.replace(new RegExp(`\\b${name}\\b`), best[0]) };
  else r.error.fix = { label: `Define ${name}`, kind: 'define', name };
}

function fail(r, e, expr, raw, defined, scope, m, fmt) {
  const msg = String(e?.message || e);
  r.kind = 'error';
  let mm;
  if ((mm = /Undefined symbol (\w+)/.exec(msg))) return notDefined(r, mm[1], raw, defined, scope, m, false);
  if (/Units do not match/.test(msg)) {
    const us = unitWords(m, expr);
    const nm = (u) => UNIT_NAMES[u] || u;
    r.error = { msg: us.length >= 2 ? `Can’t combine ${nm(us[0])} and ${nm(us[1])}` : 'These units don’t fit together', detail: 'they measure different things' };
    return;
  }
  if (/Unexpected end of expression/.test(msg)) {
    r.error = { msg: 'Unfinished', detail: 'add a number after the last operator', soft: true, typing: true };
    try { const v = m.evaluate(expr.replace(/[\s+\-*/^]+$/, ''), new Map(scope)); if (typeof v === 'number') r.error.preview = fmtNumber(v, fmt); } catch { /* */ }
    return;
  }
  if (/Unexpected operator/.test(msg)) { r.error = { msg: 'Two operators in a row', detail: msg.replace(/.*\(char (\d+)\).*/, 'near column $1') }; return; }
  if (/Unexpected type of argument/.test(msg)) { r.error = { msg: 'That function can’t take this kind of value', raw: msg }; return; }
  if (/Value expected|Unexpected/.test(msg)) { r.error = { msg: 'Can’t read this line', detail: 'check the operators and names', raw: msg }; return; }
  r.error = { msg: 'Can’t calculate this line', raw: msg };
}
