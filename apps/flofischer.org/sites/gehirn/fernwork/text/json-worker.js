// JSON work off the main thread: validate (with a human error + repair hint), format/minify and summarise.
// Formatting is LOSSLESS like today's tool: numbers and string escapes are copied verbatim (no 1.0 → 1, no big-int
// rounding). Without key sorting it is one streaming pass (fast on 8 MB); with sorting it builds a light token tree.
import { explainError, summarize } from './json.js';

function reformat(t, unit) {
  // t is known to be valid JSON (checked with JSON.parse first)
  const out = []; let depth = 0; const n = t.length; const nl = unit ? '\n' : '';
  const pad = (d) => (unit ? unit.repeat(d) : '');
  for (let i = 0; i < n; i++) {
    const c = t.charCodeAt(i);
    if (c === 32 || c === 10 || c === 13 || c === 9) continue;
    if (c === 34) { let j = i + 1; while (j < n) { const d = t.charCodeAt(j); if (d === 92) j += 2; else if (d === 34) break; else j++; } out.push(t.slice(i, j + 1)); i = j; continue; }
    if (c === 123 || c === 91) {
      let k = i + 1; while (k < n && /\s/.test(t[k])) k++;
      if (t.charCodeAt(k) === (c === 123 ? 125 : 93)) { out.push(c === 123 ? '{}' : '[]'); i = k; continue; }
      depth++; out.push(t[i] + nl + pad(depth)); continue;
    }
    if (c === 125 || c === 93) { depth--; out.push(nl + pad(depth) + t[i]); continue; }
    if (c === 44) { out.push(',' + nl + pad(depth)); continue; }
    if (c === 58) { out.push(unit ? ': ' : ':'); continue; }
    let j = i; while (j < n && !/[\s,:\]}]/.test(t[j])) j++; out.push(t.slice(i, j)); i = j - 1; // number / literal, verbatim
  }
  return out.join('');
}

// light lossless tree (only for "Sort keys")
function tree(t) {
  let i = 0; const ws = () => { while (/\s/.test(t[i] || '')) i++; };
  const str = () => { const s = i; i++; while (i < t.length) { const d = t.charCodeAt(i); if (d === 92) i += 2; else if (d === 34) break; else i++; } i++; return t.slice(s, i); };
  const val = () => {
    ws(); const c = t[i];
    if (c === '{') { i++; const e = []; ws(); if (t[i] === '}') { i++; return { o: e }; } for (;;) { ws(); const raw = str(); ws(); i++; const v = val(); e.push({ raw, key: JSON.parse(raw), v }); ws(); if (t[i++] === '}') return { o: e }; } }
    if (c === '[') { i++; const a = []; ws(); if (t[i] === ']') { i++; return { a }; } for (;;) { a.push(val()); ws(); if (t[i++] === ']') return { a }; } }
    if (c === '"') return { p: str() };
    const s = i; while (i < t.length && !/[\s,\]}]/.test(t[i])) i++; return { p: t.slice(s, i) };
  };
  return val();
}
function render(node, unit, d = 0) {
  const nl = unit ? '\n' : ''; const pad = (k) => (unit ? unit.repeat(k) : '');
  if (node.p != null) return node.p;
  if (node.a) return node.a.length ? '[' + nl + node.a.map((x) => pad(d + 1) + render(x, unit, d + 1)).join(',' + nl) + nl + pad(d) + ']' : '[]';
  const e = [...node.o].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return e.length ? '{' + nl + e.map((x) => pad(d + 1) + x.raw + (unit ? ': ' : ':') + render(x.v, unit, d + 1)).join(',' + nl) + nl + pad(d) + '}' : '{}';
}

self.onmessage = (e) => {
  const { id, op, text, indent = 2, sort = false } = e.data;
  const t0 = performance.now();
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    const v = JSON.parse(src);
    const summary = summarize(v);
    if (op === 'validate') { self.postMessage({ id, ok: true, summary, ms: performance.now() - t0 }); return; }
    const unit = op === 'minify' ? '' : indent === 'tab' ? '\t' : ' '.repeat(+indent || 2);
    const out = sort ? render(tree(src), unit) : reformat(src, unit);
    self.postMessage({ id, ok: true, summary, text: out, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id, ok: false, error: explainError(text, err), ms: performance.now() - t0 });
  }
};
