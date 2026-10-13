// Convert mockup · text/data conversion (real): detect CSV/TSV/JSON/YAML, typed CSV parsing, JSON/YAML/TSV/CSV/Markdown/XML out.

const DELIMS = [';', ',', '\t', '|'];
export const DELIM_NAME = { ';': 'semicolon', ',': 'comma', '\t': 'tab', '|': 'pipe' };

/** detect(text) → { type: 'csv'|'json'|'yaml'|'xml'|'text', delim? } */
export function detect(text) {
  const t = text.trim();
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return { type: 'json' }; } catch { /* fall through */ } }
  if (/^<[?a-zA-Z]/.test(t)) return { type: 'xml' };
  const lines = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length >= 2) {
    let best = null;
    for (const d of DELIMS) {
      const counts = lines.map((l) => splitLine(l, d).length);
      if (counts[0] > 1 && counts.every((c) => c === counts[0]) && (!best || counts[0] > best.n)) best = { d, n: counts[0] };
    }
    if (best) return { type: 'csv', delim: best.d };
  }
  if (lines.filter((l) => /^\s*-?\s*[\w"' -]+:\s/.test(l)).length >= Math.max(2, lines.length * 0.6)) return { type: 'yaml' };
  return { type: 'text' };
}

function splitLine(line, d) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === d) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
export function parseCSV(text, d) { return text.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => splitLine(l, d).map((v) => v.trim())); }

const BOOL = { true: true, false: false, yes: true, no: false, ja: true, nein: false, wahr: true, falsch: false };
/** Parse a number in either 1,234.56 or 1.234,56 style. decimalComma decides ambiguous "1,5". */
function parseNum(s, decimalComma) {
  if (!/^[-+]?[\d.,\s]+$/.test(s) || !/\d/.test(s)) return null;
  let v = s.replace(/\s/g, '');
  if (decimalComma) v = v.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  else v = v.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(v)) return null;
  if (/^0\d/.test(v.replace(/^[-+]/, ''))) return null; // leading zeros = id/zip code, keep text
  return Number(v);
}
/** inferTypes(rows (without header), { decimalComma }) → per column 'number'|'boolean'|'date'|'text' */
export function inferTypes(rows, { decimalComma }) {
  const cols = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: cols }, (_, c) => {
    const vals = rows.map((r) => r[c]).filter((v) => v !== undefined && v !== '');
    if (!vals.length) return 'text';
    if (vals.every((v) => parseNum(v, decimalComma) !== null)) return 'number';
    if (vals.every((v) => v.toLowerCase() in BOOL)) return 'boolean';
    if (vals.every((v) => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(v))) return 'date';
    return 'text';
  });
}

/** table(text, opts) → { head: string[], rows: any[][] (typed), types, decimalComma } */
export function toTable(text, { delim, header = true, types: doTypes = true } = {}) {
  const raw = parseCSV(text, delim);
  const head = header ? raw[0] : raw[0].map((_, i) => `column${i + 1}`);
  const body = header ? raw.slice(1) : raw;
  const decimalComma = delim === ';' || body.some((r) => r.some((v) => /^\d{1,3}(\.\d{3})*,\d+$/.test(v)));
  const types = doTypes ? inferTypes(body, { decimalComma }) : head.map(() => 'text');
  const rows = body.map((r) => head.map((_, c) => {
    const v = r[c] ?? '';
    if (v === '') return doTypes ? null : '';
    if (types[c] === 'number') return parseNum(v, decimalComma);
    if (types[c] === 'boolean') return BOOL[v.toLowerCase()];
    return v;
  }));
  return { head, rows, types, decimalComma };
}

const yamlStr = (v) => (v === null ? 'null' : typeof v === 'string' ? (/^[\p{L}\p{N} .@/&-]+$/u.test(v) && !/^(true|false|null|yes|no|\d.*)$/i.test(v) ? v : JSON.stringify(v)) : String(v));
function toYAMLValue(v, ind = '') {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? `${ind}- ${toYAMLValue(x, ind + '  ').trimStart()}` : `${ind}- ${yamlStr(x)}`)).join('\n');
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? `${ind}${k}:\n${toYAMLValue(x, ind + '  ')}` : `${ind}${k}: ${yamlStr(x)}`)).join('\n');
  return ind + yamlStr(v);
}
const csvCell = (v, d) => { const s = v === null ? '' : String(v); return s.includes(d) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const xmlEsc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const tag = (k) => String(k).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^(\d)/, '_$1') || 'field';

/** Convert a detected input to a target format. Returns { text, count, unit } or { error }. */
export function convertText(input, det, target, opts = {}) {
  let data, table = null;
  try {
    if (det.type === 'csv') { table = toTable(input, { delim: det.delim, ...opts }); data = table.rows.map((r) => Object.fromEntries(table.head.map((k, i) => [k, r[i]]))); }
    else if (det.type === 'json') data = JSON.parse(input);
    else if (det.type === 'yaml') data = parseSimpleYAML(input);
    else return { error: 'This looks like plain text. Pick CSV, JSON or YAML, or open it in Textbench.' };
  } catch (e) { return { error: `Couldn't read this as ${det.type.toUpperCase()}: ${String(e.message || e).replace(/^.*?: /, '')}` }; }
  const arr = Array.isArray(data) ? data : [data];
  const head = table?.head || [...new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))];
  const rowsOf = () => arr.map((o) => head.map((k) => (o && typeof o === 'object' ? (typeof o[k] === 'object' && o[k] !== null ? JSON.stringify(o[k]) : o[k] ?? null) : o)));
  const n = arr.length; const unit = n === 1 ? 'object' : 'objects';
  switch (target) {
    case 'JSON': return { text: JSON.stringify(data, null, 2), count: n, unit, table };
    case 'YAML': return { text: toYAMLValue(data) + '\n', count: n, unit: n === 1 ? 'item' : 'items', table };
    case 'CSV': case 'TSV': case 'XLSX': {
      const d = target === 'TSV' ? '\t' : ',';
      return { text: [head.map((h) => csvCell(h, d)).join(d), ...rowsOf().map((r) => r.map((v) => csvCell(v, d)).join(d))].join('\n') + '\n', count: n, unit: n === 1 ? 'row' : 'rows', table, note: target === 'XLSX' ? 'Preview as CSV · the .xlsx keeps numbers as numbers' : '' };
    }
    case 'Markdown': {
      const rows = rowsOf().map((r) => r.map((v) => (v === null ? '' : String(v).replace(/\|/g, '\\|'))));
      const w = head.map((h, i) => Math.max(3, String(h).length, ...rows.map((r) => r[i].length)));
      const line = (cells) => `| ${cells.map((c, i) => String(c).padEnd(w[i])).join(' | ')} |`;
      return { text: [line(head), `| ${w.map((x) => '-'.repeat(x)).join(' | ')} |`, ...rows.map(line)].join('\n') + '\n', count: n, unit: n === 1 ? 'row' : 'rows', table };
    }
    case 'XML': return { text: `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${arr.map((o) => `  <row>\n${head.map((k) => `    <${tag(k)}>${xmlEsc(o?.[k] ?? '')}</${tag(k)}>`).join('\n')}\n  </row>`).join('\n')}\n</rows>\n`, count: n, unit: n === 1 ? 'row' : 'rows', table };
    case 'TOML': return { text: arr.map((o) => `[[row]]\n${head.map((k) => `${/^\w+$/.test(k) ? k : JSON.stringify(k)} = ${o?.[k] == null ? '""' : JSON.stringify(o[k])}`).join('\n')}`).join('\n\n') + '\n', count: n, unit: n === 1 ? 'table' : 'tables', table };
    default: return { error: `${target} isn't available for pasted text yet.` };
  }
}
function parseSimpleYAML(s) {
  const lines = s.replace(/\r/g, '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const val = (v) => { v = v.trim(); if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v); if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true'; if (v === 'null' || v === '~' || v === '') return null; return v.replace(/^["']|["']$/g, ''); };
  if (lines[0].trim().startsWith('- ')) {
    const out = []; let cur = null;
    for (const l of lines) { const m = /^(\s*)-\s+(.*)$/.exec(l); const body = m ? m[2] : l.trim(); if (m) { cur = {}; out.push(cur); } const kv = /^([^:]+):\s*(.*)$/.exec(body); if (kv && cur) cur[kv[1].trim()] = val(kv[2]); }
    return out;
  }
  return Object.fromEntries(lines.map((l) => { const kv = /^([^:]+):\s*(.*)$/.exec(l.trim()); return kv ? [kv[1].trim(), val(kv[2])] : [l.trim(), null]; }));
}

const escH = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/** Syntax colouring for JSON/YAML output (escaped, safe for innerHTML). */
export function highlight(text, target) {
  if (target === 'JSON') {
    return escH(text).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/g, (m, str, colon, bool) => {
      if (str) return colon ? `<span class="tk-key">${str}</span>${colon}` : `<span class="tk-str">${str}</span>`;
      if (bool) return `<span class="tk-bool">${m}</span>`;
      if (m === 'null') return `<span class="tk-null">null</span>`;
      return `<span class="tk-num">${m}</span>`;
    });
  }
  if (target === 'YAML') {
    return escH(text).split('\n').map((l) => l.replace(/^(\s*-?\s*)([^:\n]+)(:)(\s*)(.*)$/, (m, a, k, c, sp, v) => `${a}<span class="tk-key">${k}</span>${c}${sp}${v ? colorScalar(v) : ''}`)).join('\n');
  }
  return escH(text);
}
const colorScalar = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? `<span class="tk-num">${v}</span>` : /^(true|false)$/.test(v) ? `<span class="tk-bool">${v}</span>` : v === 'null' ? `<span class="tk-null">null</span>` : `<span class="tk-str">${v}</span>`);
