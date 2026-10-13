// Viewers · table readers shared by the Table and Database viewers.
// Real: CSV/TSV with delimiter sniffing (German ";" exports), JSON / NDJSON records, Arrow IPC (bundled apache-arrow),
// and a small read-only SQLite file reader (b-tree pages, records, overflow pages) for tables and schema.
// Parquet: header/footer check is real; the sample's columns come from a sidecar JSON standing in for DuckDB-WASM.

export const sqlName = (s) => s.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'c_$1') || 'column';
export const isNumType = (t) => /INT|REAL|NUM|FLOA|DOUB|DEC/i.test(t || '');
const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });

// ───────────────────────── delimited text ─────────────────────────
export function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const cands = [';', ',', '\t', '|'];
  let best = ',', score = -1;
  for (const c of cands) {
    const counts = lines.map((l) => splitRow(l, c).length);
    const consistent = counts.every((n) => n === counts[0]) ? 2 : 1;
    const s = (counts[0] > 1 ? counts[0] : 0) * consistent;
    if (s > score) { score = s; best = c; }
  }
  return best;
}
function splitRow(line, d) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
export function parseDelimited(text, delim) {
  text = text.replace(/^﻿/, '');
  const d = delim || sniffDelimiter(text);
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  while (rows.length && rows.at(-1).every((c) => c === '')) rows.pop();
  return { rows, delimiter: d, decimalComma: d === ';' && rows.slice(1, 30).some((r) => r.some((c) => /^-?\d+,\d+$/.test(c))) };
}
export const DELIM_NAME = { ';': 'semicolon', ',': 'comma', '\t': 'tab', '|': 'pipe' };

// ───────────────────────── JSON records ─────────────────────────
export function parseJSONRows(text, name) {
  let recs;
  const t = text.trim();
  if (/\.(ndjson|jsonl)$/i.test(name) || (t.startsWith('{') && t.includes('\n{'))) recs = t.split(/\n+/).filter(Boolean).map((l) => JSON.parse(l));
  else { const v = JSON.parse(t); recs = Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Object.values(v).find(Array.isArray) || [v]; }
  const cols = []; for (const r of recs) for (const k of Object.keys(r || {})) if (!cols.includes(k)) cols.push(k);
  return [cols, ...recs.map((r) => cols.map((c) => { const v = r?.[c]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); }))];
}

// ───────────────────────── typed tables (for SQL-like browsing) ─────────────────────────
export function typedTable(name, rows2d, { decimalComma = false } = {}) {
  const head = rows2d[0] || []; const body = rows2d.slice(1);
  const cols = head.map((h, i) => {
    const vals = body.map((r) => r[i]).filter((v) => v != null && v !== '');
    const num = (v) => (decimalComma ? /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(v) : /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v));
    const type = vals.length && vals.every(num) ? (vals.every((v) => /^-?\d+$/.test(v.replace(/\./g, ''))) && !vals.some((v) => /,/.test(v)) ? 'INTEGER' : 'REAL') : 'TEXT';
    return { name: sqlName(String(h || `column_${i + 1}`)), label: String(h || ''), type };
  });
  const conv = (v, c) => (v == null || v === '' ? null : c.type === 'TEXT' ? v : Number(decimalComma ? v.replace(/\./g, '').replace(',', '.') : v));
  const rows = body.map((r) => cols.map((c, i) => conv(r[i], c)));
  return { name, type: 'table', count: rows.length, columns: cols, pk: [], rows, sql: `CREATE TABLE ${name} (${cols.map((c) => `${c.name} ${c.type}`).join(', ')})` };
}

// ───────────────────────── Arrow IPC (real, bundled) ─────────────────────────
export async function readArrow(file) {
  const A = await import('../vendor/apache-arrow-13.0.0.esm.js');
  const t = A.tableFromIPC(new Uint8Array(await file.arrayBuffer()));
  const cols = t.schema.fields.map((f) => f.name);
  const rows = t.toArray().map((r) => { const o = r.toJSON(); return cols.map((c) => (o[c] == null ? '' : String(o[c]))); });
  return [cols, ...rows];
}

// ───────────────────────── Parquet (mock reader for the sample) ─────────────────────────
export async function readParquet(file) {
  const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 4).arrayBuffer()));
  const tail = new TextDecoder().decode(new Uint8Array(await file.slice(-4).arrayBuffer()));
  if (head !== 'PAR1' || tail !== 'PAR1') throw human(`${file.name} isn’t a Parquet file`, 'Parquet files start and end with “PAR1”. This one doesn’t, so it’s cut off or another format.', `head ${JSON.stringify(head)} tail ${JSON.stringify(tail)}`);
  const r = await fetch('./samples/messwerte.parquet.json').then((x) => x.json()).catch(() => null);
  if (!r || file.size !== r.size) throw human(`${file.name} needs the Parquet engine`, 'This preview only carries the sample’s data. The real viewer reads any Parquet file with the bundled DuckDB engine.', 'mockup: no Parquet decoder');
  return [r.columns, ...r.rows.map((x) => x.map((v) => (v == null ? '' : String(v))))];
}

// ───────────────────────── SQLite (real, read-only) ─────────────────────────
export function readSQLite(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf);
  if (new TextDecoder().decode(u8.slice(0, 15)) !== 'SQLite format 3') throw new Error('not SQLite');
  let ps = dv.getUint16(16); if (ps === 1) ps = 65536; const usable = ps - u8[20];
  const enc = dv.getUint32(56); const dec = new TextDecoder(enc === 2 ? 'utf-16le' : enc === 3 ? 'utf-16be' : 'utf-8');
  const ver = dv.getUint32(96);
  const varint = (p) => { let v = 0; for (let i = 0; i < 9; i++) { const b = u8[p + i]; if (i === 8) return [v * 256 + b, p + 9]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return [v, p + i + 1]; } return [v, p + 9]; };
  const pageOff = (n) => (n - 1) * ps;
  function payload(p, P) { // p = start of payload in page; handles overflow chain
    const X = usable - 35; if (P <= X) return u8.subarray(p, p + P);
    const M = Math.floor(((usable - 12) * 32) / 255) - 23; let K = M + ((P - M) % (usable - 4)); if (K > X) K = M;
    const out = new Uint8Array(P); out.set(u8.subarray(p, p + K)); let got = K; let ov = dv.getUint32(p + K);
    while (ov && got < P) { const o = pageOff(ov); const n = Math.min(usable - 4, P - got); out.set(u8.subarray(o + 4, o + 4 + n), got); got += n; ov = dv.getUint32(o); }
    return out;
  }
  function record(bytes) {
    const bdv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vi = (p) => { let v = 0; for (let i = 0; i < 9; i++) { const b = bytes[p + i]; if (i === 8) return [v * 256 + b, p + 9]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return [v, p + i + 1]; } return [v, p + 9]; };
    let [hs, p] = vi(0); const types = []; while (p < hs) { const [t, np] = vi(p); types.push(t); p = np; }
    let q = hs; const out = [];
    for (const t of types) {
      if (t === 0) out.push(null);
      else if (t >= 1 && t <= 6) { const n = [0, 1, 2, 3, 4, 6, 8][t]; let v = 0; for (let i = 0; i < n; i++) v = v * 256 + bytes[q + i]; if (bytes[q] & 0x80) v -= 2 ** (8 * n); out.push(v); q += n; }
      else if (t === 7) { out.push(bdv.getFloat64(q)); q += 8; }
      else if (t === 8) out.push(0); else if (t === 9) out.push(1);
      else if (t >= 12 && t % 2 === 0) { const n = (t - 12) / 2; out.push(`[blob ${n} bytes]`); q += n; }
      else if (t >= 13) { const n = (t - 13) / 2; out.push(dec.decode(bytes.subarray(q, q + n))); q += n; }
      else out.push(null);
    }
    return out;
  }
  function walk(root, cb, guard = { n: 0 }) {
    const o = root === 1 ? 100 : pageOff(root); const base = pageOff(root); const type = u8[o];
    if (++guard.n > 200000) throw new Error('page loop');
    const cells = dv.getUint16(o + 3);
    if (type === 0x0d) { for (let i = 0; i < cells; i++) { let p = base + dv.getUint16(o + 8 + i * 2); let P, rowid; [P, p] = varint(p); [rowid, p] = varint(p); cb(rowid, record(payload(p, P))); } }
    else if (type === 0x05) { for (let i = 0; i < cells; i++) { const p = base + dv.getUint16(o + 12 + i * 2); walk(dv.getUint32(p), cb, guard); } walk(dv.getUint32(o + 8), cb, guard); }
    else throw new Error(`unexpected page type ${type} at page ${root}`);
  }
  const master = []; walk(1, (rowid, r) => master.push({ type: r[0], name: r[1], tbl: r[2], root: r[3], sql: r[4] }));
  const tables = [];
  for (const m of master) {
    if (m.type === 'table' && !m.name.startsWith('sqlite_')) {
      const cols = parseCols(m.sql); const pkAlias = cols.findIndex((c) => /INTEGER/i.test(c.type) && c.pk);
      const rows = []; walk(m.root, (rowid, r) => { if (pkAlias >= 0) r[pkAlias] = rowid; while (r.length < cols.length) r.push(null); rows.push(r.slice(0, cols.length)); });
      tables.push({ name: m.name, type: 'table', count: rows.length, columns: cols.map(({ name, type }) => ({ name, type })), pk: cols.filter((c) => c.pk).map((c) => c.name), rows, sql: m.sql });
    } else if (m.type === 'view') tables.push({ name: m.name, type: 'view', count: null, columns: [], pk: [], rows: null, sql: m.sql });
  }
  return { tables, hdr: { pageSize: ps, pages: dv.getUint32(28), encoding: ['', 'UTF-8', 'UTF-16le', 'UTF-16be'][enc] || 'UTF-8', version: `${Math.floor(ver / 1e6)}.${Math.floor(ver / 1e3) % 1000}.${ver % 1000}` } };
}
function parseCols(sql) {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')')); const parts = []; let depth = 0, cur = '';
  for (const ch of body) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; } parts.push(cur);
  const tablePk = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(body)?.[1]?.split(',').map((x) => x.trim().replace(/["`[\]]/g, '')) || [];
  return parts.map((p) => p.trim()).filter((p) => p && !/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i.test(p)).map((p) => {
    const m = /^["`[]?([^"`\]\s]+)["`\]]?\s*([A-Za-z]+(?:\s*\([^)]*\))?)?/.exec(p); const name = m[1]; const type = (m[2] || '').toUpperCase().replace(/\s*\(.*$/, '') || 'ANY';
    return { name, type: /^(NOT|PRIMARY|REFERENCES|DEFAULT|UNIQUE)$/.test(type) ? 'ANY' : type, pk: /PRIMARY\s+KEY/i.test(p) || tablePk.includes(name) };
  });
}
