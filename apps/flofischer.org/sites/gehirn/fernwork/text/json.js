// JSON helpers for the Textbench JSON lens: detection, human error messages + repair, path at caret, offset of a path.
// Pure functions (used by the page and by json-worker.js).

export function detectKind(text, name = '') {
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase();
  if (ext === 'json' || ext === 'geojson') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'log') return 'log';
  const head = text.slice(0, 2000).trimStart();
  if (/^[[{]/.test(head) && /"\s*:/.test(head)) return 'json';
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/m.test(head)) return 'log';
  if (/^#{1,3} \S/m.test(head)) return 'md';
  return 'text';
}

/** Heuristic: looks like text copied from a PDF/Word (hard wraps, hyphenation, invisibles, ligatures). */
export function pdfPasteScore(text) {
  const lines = text.split('\n');
  const long = lines.filter((l) => l.length > 50);
  if (long.length < 4) return null;
  const hard = lines.filter((l, i) => l.length > 50 && lines[i + 1] && /^[a-zäöüß0-9„(]/.test(lines[i + 1])).length;
  const hyph = (text.match(/[a-zäöüß]-\n[a-zäöüß]/g) || []).length;
  const inv = (text.match(/[\u00a0\u00ad\u200b-\u200d\ufeff]/g) || []).length;
  const lig = (text.match(/[\ufb00-\ufb06]/g) || []).length;
  return hard >= 3 || hyph + inv + lig >= 3 ? { hard, hyph, inv, lig } : null;
}

const isWs = (c) => c === 32 || c === 10 || c === 13 || c === 9;
function prevNonWs(t, i) { i--; while (i >= 0 && isWs(t.charCodeAt(i))) i--; return i; }

/** Parse error → { pos, line, col, message, hint, fix: { from, to, insert, label } | null } */
export function explainError(text, err) {
  const m = /position (\d+)/.exec(err.message);
  let pos = m ? +m[1] : 0;
  if (!m && /Unexpected end/.test(err.message)) pos = text.length;
  const at = text[pos];
  const p = prevNonWs(text, pos); const prev = text[p];
  let message = 'Unexpected character', hint = '', fix = null;
  const valueEnd = /["\d\]}el]/.test(prev || '');
  if (pos === 0 && text.charCodeAt(0) === 0xfeff) { message = 'Byte order mark at the start'; fix = { from: 0, to: 1, insert: '', label: 'Remove BOM' }; }
  else if ((at === '"' || at === '{' || at === '[' || /[\d\-tfn]/.test(at || '')) && valueEnd) {
    message = 'Missing comma after value'; hint = 'Two values follow each other without a comma.';
    fix = { from: p + 1, to: p + 1, insert: ',', label: 'Inserted a comma' };
  } else if ((at === '}' || at === ']') && prev === ',') {
    message = `Trailing comma before ${at}`; hint = 'JSON doesn’t allow a comma after the last item.';
    fix = { from: p, to: p + 1, insert: '', label: 'Removed a trailing comma' };
  } else if (at === "'") { message = 'Single quotes aren’t valid JSON'; hint = 'Strings and keys need double quotes.'; fix = 'quotes'; }
  else if (at === '/') { message = 'Comments aren’t allowed in JSON'; fix = 'comments'; }
  else if (/[A-Za-z_$]/.test(at || '') && (prev === '{' || prev === ',')) { message = 'Key needs double quotes'; hint = 'Looks like a JavaScript object.'; fix = 'keys'; }
  else if (pos >= text.length) { message = 'JSON ends too early'; hint = 'A } or ] is missing at the end.'; }
  else message = `Unexpected ${JSON.stringify(at)}`;
  const before = text.slice(0, pos);
  const line = (before.match(/\n/g) || []).length + 1;
  const col = pos - before.lastIndexOf('\n');
  return { pos, line, col, message, hint, fix, raw: err.message };
}

/** Repair as a list of minimal edits against the ORIGINAL text (so the editor can apply one undoable change). */
export function repairEdits(text, maxFixes = 20) {
  const edits = []; let cur = text;
  const toOrig = (pos) => { let d = 0; for (const e of edits) if (e.cfrom < pos) d += e.insert.length - (e.cto - e.cfrom); return pos - d; };
  for (let n = 0; n < maxFixes; n++) {
    try { JSON.parse(cur); return { edits: edits.map(({ from, to, insert, label }) => ({ from, to, insert, label })), ok: true }; } catch (err) {
      const e = explainError(cur, err);
      let f = e.fix;
      if (f === 'quotes') { const s = cur.replace(/'([^'\\\n]*)'/g, '"$1"'); return { full: s, ok: safeOk(s), label: 'Single → double quotes' }; }
      if (f === 'comments') { const s = cur.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1'); return { full: s, ok: safeOk(s), label: 'Remove comments' }; }
      if (f === 'keys') { const s = cur.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":'); return { full: s, ok: safeOk(s), label: 'Quote keys' }; }
      if (!f) return { edits, ok: false, error: e };
      const of = toOrig(f.from), ot = of + (f.to - f.from);
      edits.push({ from: of, to: ot, insert: f.insert, label: f.label, cfrom: f.from, cto: f.to });
      cur = cur.slice(0, f.from) + f.insert + cur.slice(f.to);
    }
  }
  return { edits, ok: false };
}
function safeOk(s) { try { JSON.parse(s); return true; } catch { return false; } }

/** Path at offset: "$.orders[4911].items[0].sku" (linear scan; ~40 ms on 8 MB). */
export function pathAt(text, pos) {
  const st = []; let i = 0; const n = Math.min(pos, text.length);
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 34) { // string
      let j = i + 1; while (j < text.length) { const d = text.charCodeAt(j); if (d === 92) j += 2; else if (d === 34) break; else j++; }
      const top = st[st.length - 1];
      if (top && top.t === 'o' && top.expectKey) { let k = j + 1; while (isWs(text.charCodeAt(k))) k++; if (text[k] === ':') { top.key = text.slice(i + 1, j); top.expectKey = false; } }
      i = j + 1; continue;
    }
    if (c === 123) st.push({ t: 'o', key: null, expectKey: true });
    else if (c === 91) st.push({ t: 'a', i: 0 });
    else if (c === 125 || c === 93) st.pop();
    else if (c === 44) { const top = st[st.length - 1]; if (top) { if (top.t === 'a') top.i++; else { top.key = null; top.expectKey = true; } } }
    i++;
  }
  return '$' + st.map((f) => (f.t === 'a' ? `[${f.i}]` : f.key != null ? (/^[A-Za-z_$][\w$]*$/.test(f.key) ? `.${f.key}` : `[${JSON.stringify(f.key)}]`) : '')).join('');
}

/** Offset of the value at a simple path like ['orders', 4911] (scan until the stack matches). */
export function offsetOfPath(text, segs) {
  const st = []; let i = 0; const want = segs.map(String).join('\u0000');
  const cur = () => st.map((f) => (f.t === 'a' ? String(f.i) : f.key)).join('\u0000');
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 34) {
      let j = i + 1; while (j < text.length) { const d = text.charCodeAt(j); if (d === 92) j += 2; else if (d === 34) break; else j++; }
      const top = st[st.length - 1];
      if (top && top.t === 'o' && top.expectKey) { let k = j + 1; while (isWs(text.charCodeAt(k))) k++; if (text[k] === ':') { top.key = text.slice(i + 1, j); top.expectKey = false; if (cur() === want) { let v = k + 1; while (isWs(text.charCodeAt(v))) v++; return v; } } }
      i = j + 1; continue;
    }
    if (c === 123 || c === 91) {
      st.push(c === 123 ? { t: 'o', key: null, expectKey: true } : { t: 'a', i: 0 });
      if (c === 91) { let k = i + 1; while (isWs(text.charCodeAt(k))) k++; if (cur() === want && text[k] !== ']') return k; }
    } else if (c === 125 || c === 93) st.pop();
    else if (c === 44) { const top = st[st.length - 1]; if (top) { if (top.t === 'a') { top.i++; if (cur() === want) { let k = i + 1; while (isWs(text.charCodeAt(k))) k++; return k; } } else { top.key = null; top.expectKey = true; } } }
    i++;
  }
  return -1;
}

/** Shape summary for the status bar and tree root. */
export function summarize(v) {
  if (Array.isArray(v)) return { type: 'array', count: v.length, label: `${fmtN(v.length)} items` };
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    let big = null; for (const k of keys) if (Array.isArray(v[k]) && (!big || v[k].length > v[big].length)) big = k;
    return { type: 'object', keys: keys.length, biggest: big, count: big ? v[big].length : keys.length, label: big ? `${fmtN(v[big].length)} ${big}` : `${keys.length} keys` };
  }
  return { type: typeof v, label: typeof v };
}
export const fmtN = (n) => new Intl.NumberFormat('en-US').format(n);
export function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeysDeep(v[k])]));
  return v;
}
