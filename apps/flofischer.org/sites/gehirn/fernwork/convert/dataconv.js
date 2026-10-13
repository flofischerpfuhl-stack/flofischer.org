// Convert mockup · Data Converter engine (real, small): JSON, JSON5, YAML, TOML, XML, CSV, TSV, NDJSON in and out.
// Same contract as today's data-converter.js (parse → JS value → serialize). The real build keeps js-yaml/smol-toml/fast-xml-parser.

export const DATA_FORMATS = [
  ['json', 'JSON', 'Objects and arrays'], ['json5', 'JSON5', 'JSON with comments'], ['yaml', 'YAML', 'Readable config'],
  ['toml', 'TOML', 'Config files'], ['xml', 'XML', 'Older systems'], ['csv', 'CSV', 'Opens in Excel'],
  ['tsv', 'TSV', 'Tabs instead of commas'], ['ndjson', 'NDJSON', 'One JSON object per line'],
];
export const EXT = { json: 'json', json5: 'json5', yaml: 'yaml', toml: 'toml', xml: 'xml', csv: 'csv', tsv: 'tsv', ndjson: 'ndjson' };
export const DELIMS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };

/** detect(text) → format id (null when empty). */
export function detectFormat(text) {
  const t = text.trim(); if (!t) return null;
  if (t.startsWith('<')) return 'xml';
  if (/^[[{]/.test(t)) {
    try { JSON.parse(t); return 'json'; } catch { /* next */ }
    const lines = t.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => { try { JSON.parse(l); return true; } catch { return false; } })) return 'ndjson';
    return 'json5';
  }
  if (/^\s*\[\[?[\w.-]+\]\]?\s*$/m.test(t) && /=/.test(t)) return 'toml';
  if (/^[\w"-]+\s*=\s*\S/m.test(t) && !/^[^=\n]*[,;\t]/.test(t)) return 'toml';
  const d = detectDelimiter(t);
  if (d === '\t') return 'tsv';
  if (d) return 'csv';
  if (/^[\w"' -]+:(\s|$)/m.test(t) || /^-\s/m.test(t)) return 'yaml';
  return 'csv';
}
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20); if (lines.length < 1) return null;
  let best = null;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => splitRow(l, d).length);
    if (counts[0] > 1 && counts.every((c) => c === counts[0]) && (!best || counts[0] > best.n)) best = { d, n: counts[0] };
  }
  return best?.d || null;
}
function splitRow(line, d) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === d) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
export const parseDelimited = (text, d) => text.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => splitRow(l, d));

/** Looks like 1.234,56 / 12,5 numbers (decimal comma)? Only a hint; the user decides (owner rule). */
export function looksDecimalComma(text) {
  return /(^|[;\t|])\s*-?\d{1,3}(\.\d{3})*,\d{1,2}\s*($|[;\t|])/m.test(text);
}
const BOOL = { true: true, false: false };
function coerce(v, { inferTypes, decimalComma }) {
  if (!inferTypes) return v;
  const s = String(v).trim();
  if (s === '') return null;
  if (s.toLowerCase() in BOOL) return BOOL[s.toLowerCase()];
  if (s === 'null') return null;
  let n = s;
  if (decimalComma) { if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(n)) return v; n = n.replace(/\./g, '').replace(',', '.'); }
  else if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(n)) return v;
  if (/^-?0\d/.test(n)) return v; // leading zeros: ids, zip codes stay text
  return Number(n);
}
function rowsToObjects(rows, opts) {
  if (!rows.length) return [];
  const [head, ...body] = rows; const seen = {};
  const keys = head.map((k, i) => { const b = String(k).trim() || `Column ${i + 1}`; seen[b] = (seen[b] || 0) + 1; return seen[b] > 1 ? `${b} (${seen[b]})` : b; });
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, coerce(r[i] ?? '', opts)])));
}
function objectsToRows(v) {
  const arr = Array.isArray(v) ? v : [v];
  if (arr.length && Array.isArray(arr[0])) return arr;
  if (arr.every((x) => !x || typeof x !== 'object')) return [['value'], ...arr.map((x) => [x ?? ''])];
  const keys = [...new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))];
  return [keys, ...arr.map((o) => keys.map((k) => { const x = o?.[k]; return x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : x; }))];
}
const cell = (v, d) => { const s = String(v ?? ''); return s.includes(d) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// ── JSON5 (lenient) ──
function parseJson5(t) {
  const s = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/'((?:\\.|[^'\\])*)'/g, (_, x) => JSON.stringify(x.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(s);
}
const json5Key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function toJson5(v, ind = '') {
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => ind + '  ' + toJson5(x, ind + '  ')).join(',\n')},\n${ind}]` : '[]';
  if (v && typeof v === 'object') { const e = Object.entries(v); return e.length ? `{\n${e.map(([k, x]) => `${ind}  ${json5Key(k)}: ${toJson5(x, ind + '  ')}`).join(',\n')},\n${ind}}` : '{}'; }
  return typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v);
}

// ── YAML (block style subset: maps, lists, scalars, flow lists, quoted strings, comments) ──
function yScalar(v) {
  v = v.trim(); if (v === '' || v === '~' || v === 'null') return null;
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v) && !/^-?0\d/.test(v)) return Number(v);
  if (/^".*"$/.test(v)) return JSON.parse(v);
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean).map(yScalar);
  if (/^\{.*\}$/.test(v)) return Object.fromEntries(v.slice(1, -1).split(',').filter((x) => x.trim()).map((p) => { const i = p.indexOf(':'); return [p.slice(0, i).trim(), yScalar(p.slice(i + 1))]; }));
  return v.replace(/\s+#.*$/, '');
}
function parseYaml(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((raw, n) => ({ raw, n: n + 1 })).filter((l) => l.raw.trim() && !/^\s*#/.test(l.raw) && l.raw.trim() !== '---');
  let i = 0;
  const indentOf = (l) => l.raw.match(/^ */)[0].length;
  function block(ind) {
    if (i >= lines.length) return null;
    if (/^\s*-(\s|$)/.test(lines[i].raw) && indentOf(lines[i]) === ind) {
      const arr = [];
      while (i < lines.length && indentOf(lines[i]) === ind && /^\s*-(\s|$)/.test(lines[i].raw)) {
        const rest = lines[i].raw.replace(/^\s*-\s?/, '');
        if (!rest.trim()) { i++; arr.push(block(indentOf(lines[i] || { raw: '' }))); continue; }
        if (/^[\w"' .-]+:(\s|$)/.test(rest)) { lines[i] = { raw: ' '.repeat(ind + 2) + rest, n: lines[i].n }; arr.push(block(ind + 2)); continue; }
        arr.push(yScalar(rest)); i++;
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length && indentOf(lines[i]) === ind) {
      const l = lines[i]; const m = /^\s*("[^"]*"|'[^']*'|[^:]+?)\s*:(\s+(.*))?$/.exec(l.raw);
      if (!m) throw new Error(`line ${l.n}: expected "key: value"`);
      const key = m[1].replace(/^["']|["']$/g, ''); i++;
      const val = m[3];
      if (val === undefined || val.trim() === '' ) obj[key] = i < lines.length && indentOf(lines[i]) > ind ? block(indentOf(lines[i])) : (i < lines.length && indentOf(lines[i]) === ind && /^\s*-\s/.test(lines[i].raw) ? block(ind) : null);
      else if (val.trim() === '|' || val.trim() === '>') { const parts = []; const ci = i < lines.length ? indentOf(lines[i]) : 0; while (i < lines.length && indentOf(lines[i]) >= ci && ci > ind) parts.push(lines[i++].raw.slice(ci)); obj[key] = parts.join(val.trim() === '|' ? '\n' : ' ') + '\n'; }
      else obj[key] = yScalar(val);
    }
    if (i < lines.length && indentOf(lines[i]) > ind) throw new Error(`line ${lines[i].n}: unexpected indentation`);
    return obj;
  }
  const out = block(lines.length ? indentOf(lines[0]) : 0);
  if (i < lines.length) throw new Error(`line ${lines[i].n}: couldn't read this line`);
  return out;
}
const yStr = (v) => (v === null ? 'null' : typeof v === 'string' ? (/^[\p{L}\p{N}][\p{L}\p{N} ._@/&()+-]*$/u.test(v) && !/^(true|false|null|yes|no|~)$/i.test(v) && !/^-?\d/.test(v) ? v : JSON.stringify(v)) : String(v));
function toYaml(v, ind = '') {
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === 'object' && Object.keys(x).length ? `${ind}- ${toYaml(x, ind + '  ').trimStart()}` : `${ind}- ${x && typeof x === 'object' ? (Array.isArray(x) ? '[]' : '{}') : yStr(x)}`)).join('\n') : `${ind}[]`;
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => (x && typeof x === 'object' && Object.keys(x).length ? `${ind}${yStr(k)}:\n${toYaml(x, ind + '  ')}` : `${ind}${yStr(k)}: ${x && typeof x === 'object' ? (Array.isArray(x) ? '[]' : '{}') : yStr(x)}`)).join('\n');
  return ind + yStr(v);
}

// ── TOML (subset: tables, arrays of tables, dotted keys, inline arrays) ──
function tVal(s, n) {
  s = s.trim();
  if (/^".*"$/.test(s)) return JSON.parse(s);
  if (/^'.*'$/.test(s)) return s.slice(1, -1);
  if (/^(true|false)$/.test(s)) return s === 'true';
  if (/^[-+]?\d[\d_]*(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return Number(s.replace(/_/g, ''));
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  if (/^\[.*\]$/.test(s)) { const inner = s.slice(1, -1).trim(); return inner ? inner.match(/("([^"\\]|\\.)*"|'[^']*'|[^,]+)/g).map((x) => tVal(x, n)) : []; }
  if (/^\{.*\}$/.test(s)) return Object.fromEntries(s.slice(1, -1).split(',').filter((x) => x.trim()).map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim().replace(/^"|"$/g, ''), tVal(p.slice(i + 1), n)]; }));
  throw new Error(`line ${n}: can't read value ${s}`);
}
function parseToml(text) {
  const root = {}; let cur = root;
  const path = (obj, keys, arr) => { let o = obj; keys.forEach((k, i) => { const last = i === keys.length - 1; if (last && arr) { (o[k] ||= []).push({}); o = o[k][o[k].length - 1]; } else { if (Array.isArray(o[k])) o = o[k][o[k].length - 1]; else o = (o[k] ||= {}); } }); return o; };
  text.replace(/\r/g, '').split('\n').forEach((raw, idx) => {
    const l = raw.replace(/\s+#[^"']*$/, '').trim(); if (!l || l.startsWith('#')) return;
    let m;
    if ((m = /^\[\[\s*([^\]]+)\s*\]\]$/.exec(l))) cur = path(root, m[1].split('.').map((x) => x.trim().replace(/^"|"$/g, '')), true);
    else if ((m = /^\[\s*([^\]]+)\s*\]$/.exec(l))) cur = path(root, m[1].split('.').map((x) => x.trim().replace(/^"|"$/g, '')), false);
    else if ((m = /^("[^"]+"|[\w.-]+)\s*=\s*(.+)$/.exec(l))) { const keys = m[1].replace(/^"|"$/g, '').split('.'); const tgt = keys.length > 1 ? path(cur, keys.slice(0, -1), false) : cur; tgt[keys[keys.length - 1]] = tVal(m[2], idx + 1); }
    else throw new Error(`line ${idx + 1}: expected "key = value" or [table]`);
  });
  return root;
}
const tKey = (k) => (/^[\w-]+$/.test(k) ? k : JSON.stringify(k));
const tLit = (v) => (v === null ? '""' : Array.isArray(v) ? `[${v.map(tLit).join(', ')}]` : typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${tKey(k)} = ${tLit(x)}`).join(', ')} }` : JSON.stringify(v));
function toToml(v) {
  if (Array.isArray(v)) v = { rows: v };
  if (!v || typeof v !== 'object') v = { value: v };
  const out = [];
  const emit = (obj, prefix) => {
    const scal = []; const subs = []; const arrs = [];
    for (const [k, x] of Object.entries(obj)) {
      if (Array.isArray(x) && x.length && x.every((y) => y && typeof y === 'object' && !Array.isArray(y))) arrs.push([k, x]);
      else if (x && typeof x === 'object' && !Array.isArray(x)) subs.push([k, x]);
      else scal.push(`${tKey(k)} = ${tLit(x)}`);
    }
    if (scal.length) out.push(scal.join('\n'));
    for (const [k, x] of subs) { const p = prefix ? `${prefix}.${tKey(k)}` : tKey(k); out.push(`[${p}]`); emit(x, p); }
    for (const [k, list] of arrs) { const p = prefix ? `${prefix}.${tKey(k)}` : tKey(k); for (const it of list) { out.push(`[[${p}]]`); emit(it, p); } }
  };
  emit(v, '');
  return out.join('\n').replace(/\n(\[)/g, '\n\n$1') + '\n';
}

// ── XML (fast-xml-parser style: attributes as @_name, repeated children → arrays) ──
function parseXml(text, opts) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) { const m = /line (\d+)/i.exec(err.textContent); throw new Error(m ? `line ${m[1]}: the XML isn't well-formed` : "the XML isn't well-formed"); }
  const val = (s) => (opts.inferTypes ? coerce(s, { inferTypes: true }) : s);
  const walk = (el) => {
    const kids = [...el.children]; const attrs = [...el.attributes];
    if (!kids.length && !attrs.length) return val(el.textContent.trim());
    const o = {}; attrs.forEach((a) => (o['@_' + a.name] = val(a.value)));
    for (const k of kids) { const v = walk(k); if (k.tagName in o) { if (!Array.isArray(o[k.tagName])) o[k.tagName] = [o[k.tagName]]; o[k.tagName].push(v); } else o[k.tagName] = v; }
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(); if (txt) o['#text'] = val(txt);
    return o;
  };
  return { [doc.documentElement.tagName]: walk(doc.documentElement) };
}
const xe = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const xtag = (k) => String(k).replace(/[^\w.-]+/g, '_').replace(/^(\d)/, '_$1') || 'item';
function toXml(v) {
  const node = (k, x, ind) => {
    if (Array.isArray(x)) return x.map((y) => node(k, y, ind)).join('');
    if (x && typeof x === 'object') {
      const attrs = Object.entries(x).filter(([a]) => a.startsWith('@_')).map(([a, y]) => ` ${a.slice(2)}="${xe(y)}"`).join('');
      const kids = Object.entries(x).filter(([a]) => !a.startsWith('@_') && a !== '#text');
      const text = x['#text'] != null ? xe(x['#text']) : '';
      if (!kids.length) return `${ind}<${xtag(k)}${attrs}${text ? `>${text}</${xtag(k)}>` : '/>'}\n`;
      return `${ind}<${xtag(k)}${attrs}>${text}\n${kids.map(([a, y]) => node(a, y, ind + '  ')).join('')}${ind}</${xtag(k)}>\n`;
    }
    return x == null || x === '' ? `${ind}<${xtag(k)}/>\n` : `${ind}<${xtag(k)}>${xe(x)}</${xtag(k)}>\n`;
  };
  const wrapped = v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 ? v : { root: Array.isArray(v) ? { row: v } : v };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + Object.entries(wrapped).map(([k, x]) => node(k, x, '')).join('');
}

/** parse(text, from, opts) → value. opts: { delimiter: 'auto'|'comma'|…, inferTypes, decimalComma } */
export function parse(text, from, opts = {}) {
  switch (from) {
    case 'json': return JSON.parse(text);
    case 'json5': return parseJson5(text);
    case 'yaml': return parseYaml(text);
    case 'toml': return parseToml(text);
    case 'xml': return parseXml(text, opts);
    case 'csv': { const d = DELIMS[opts.delimiter] || detectDelimiter(text) || ','; return rowsToObjects(parseDelimited(text, d), opts); }
    case 'tsv': return rowsToObjects(parseDelimited(text, '\t'), opts);
    case 'ndjson': return text.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`line ${i + 1}: ${e.message.replace(/^.*?: /, '')}`); } });
    default: throw new Error(`can't read ${from}`);
  }
}
export function serialize(v, to, opts = {}) {
  switch (to) {
    case 'json': return JSON.stringify(v, null, 2) + '\n';
    case 'json5': return toJson5(v) + '\n';
    case 'yaml': return toYaml(v) + '\n';
    case 'toml': return toToml(v);
    case 'xml': return toXml(v);
    case 'csv': case 'tsv': { const d = to === 'tsv' ? '\t' : DELIMS[opts.delimiter] || ','; return objectsToRows(v).map((r) => r.map((c) => cell(c, d)).join(d)).join('\n') + '\n'; }
    case 'ndjson': return (Array.isArray(v) ? v : [v]).map((x) => JSON.stringify(x)).join('\n') + '\n';
    default: throw new Error(`can't write ${to}`);
  }
}
/** Friendly error text: "line 3: …" kept, library prefixes removed. */
export function friendly(e, from) {
  let m = String(e?.message || e);
  const pos = /position (\d+)/.exec(m);
  m = m.replace(/^(SyntaxError|Error):\s*/, '').replace(/ in JSON at position \d+.*$/, '').replace(/\(line \d+ column \d+\)/, '');
  return { msg: `Couldn't read this as ${from.toUpperCase()}: ${m.trim()}`, pos: pos ? +pos[1] : null };
}

const escH = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/** Light syntax colouring (escaped, safe for innerHTML). */
export function highlight(text, fmt) {
  if (text.length > 60000) return escH(text);
  if (fmt === 'json' || fmt === 'ndjson' || fmt === 'json5') {
    return escH(text).replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*(?=\s*:))(\s*:)?|\b(true|false)\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/g, (m, str, colon, bool) => {
      if (str) return colon ? `<span class="tk-key">${str}</span>${colon}` : /^['"]/.test(str) ? `<span class="tk-str">${str}</span>` : str;
      if (bool) return `<span class="tk-bool">${m}</span>`;
      if (m === 'null') return '<span class="tk-null">null</span>';
      return `<span class="tk-num">${m}</span>`;
    });
  }
  if (fmt === 'yaml' || fmt === 'toml') {
    const sep = fmt === 'yaml' ? ':' : '=';
    return escH(text).split('\n').map((l) => (/^\s*\[/.test(l) && fmt === 'toml' ? `<span class="tk-key">${l}</span>` : l.replace(new RegExp(`^(\\s*-?\\s*)([^${sep}\\n]+?)(\\s*${sep})(\\s*)(.*)$`), (m, a, k, c, sp, v) => `${a}<span class="tk-key">${k}</span>${c}${sp}${v ? scalar(v) : ''}`))).join('\n');
  }
  if (fmt === 'xml') return escH(text).replace(/(&lt;\/?)([\w.:-]+)/g, '$1<span class="tk-key">$2</span>');
  return escH(text);
}
const scalar = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? `<span class="tk-num">${v}</span>` : /^(true|false)$/.test(v) ? `<span class="tk-bool">${v}</span>` : v === 'null' ? '<span class="tk-null">null</span>' : `<span class="tk-str">${v}</span>`);

export const SAMPLES = {
  json: `{\n  "name": "Acme",\n  "employees": 3,\n  "active": true,\n  "tags": ["web", "mobile"]\n}\n`,
  json5: `{\n  name: 'Acme',\n  /* trailing comma OK */\n  employees: 3,\n  active: true,\n}\n`,
  yaml: `name: Acme\nemployees: 3\nactive: true\ntags:\n  - web\n  - mobile\n`,
  toml: `name = "Acme"\nemployees = 3\nactive = true\ntags = ["web", "mobile"]\n`,
  xml: `<?xml version="1.0"?>\n<company>\n  <name>Acme</name>\n  <employees>3</employees>\n  <active>true</active>\n</company>\n`,
  csv: `Kunde;Ort;Umsatz;Bestellungen;Aktiv;Kunde seit\nAcme GmbH;Berlin;15.230,50;42;true;2019-03-14\nBeta Studio;Hamburg;4.890,00;11;true;2021-07-01\nCobalt AG;München;23.950,75;67;false;2017-11-20\nDelta Bau;Köln;1.200,00;3;true;2024-01-08\n`,
  tsv: `name\temployees\tactive\nAcme\t3\ttrue\nBeta\t12\tfalse\n`,
  ndjson: `{"name":"Acme","employees":3}\n{"name":"Beta","employees":12}\n`,
};
