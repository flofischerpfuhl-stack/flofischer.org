// Viewers · Table Viewer (Tables / Sheets). Real: XLSX + ODS (formulas kept and recalculated), CSV/TSV with delimiter
// and decimal-comma sniffing, JSON/NDJSON, Arrow; Parquet via the sample sidecar. View: sort, filter, selection sums.
// Edit: cell editing with a formula bar, formulas (SUM, AVERAGE, MIN, MAX, COUNT, ROUND, IF …), bold / italic / align,
// number formats, insert / delete rows and columns, sort, find & replace, remove duplicates, sheets, undo.
// Exports XLSX, ODS, CSV, TSV, JSON, HTML and print/PDF.
import { readXlsx, readOds, writeXlsx, writeOds } from './officeio.js';
import { parseDelimited, parseJSONRows, readArrow, readParquet, DELIM_NAME } from './tabular.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIdx = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const ref = (r, c) => `${colName(c)}${r + 1}`;
const OPT_KEY = 'fw:vw-table';
const loadOpt = () => { try { return { header: true, grid: true, headings: true, comma: false, freeze: true, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { header: true, grid: true, headings: true, comma: false, freeze: true }; } };
const saveOpt = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* */ } };
const FMTS = [['general', 'General', '1234.5'], ['number', 'Number', '1,234.50'], ['integer', 'Whole number', '1,235'], ['eur', 'Euro', '1,234.50 €'], ['usd', 'Dollar', '$1,234.50'], ['percent', 'Percent', '12.3 %'], ['scientific', 'Scientific', '1.23E+3'], ['date', 'Date', '2026-10-13'], ['time', 'Time', '14:30'], ['text', 'Text', 'as typed']];

// ───────────────────────── formulas ─────────────────────────
const FN = {
  SUM: (a) => a.flat().filter((x) => typeof x === 'number').reduce((s, x) => s + x, 0),
  AVERAGE: (a) => { const n = a.flat().filter((x) => typeof x === 'number'); return n.length ? FN.SUM(n) / n.length : err('#DIV/0!'); },
  MIN: (a) => Math.min(...a.flat().filter((x) => typeof x === 'number')), MAX: (a) => Math.max(...a.flat().filter((x) => typeof x === 'number')),
  COUNT: (a) => a.flat().filter((x) => typeof x === 'number').length, COUNTA: (a) => a.flat().filter((x) => x !== '' && x != null).length,
  MEDIAN: (a) => { const n = a.flat().filter((x) => typeof x === 'number').sort((x, y) => x - y); const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  PRODUCT: (a) => a.flat().filter((x) => typeof x === 'number').reduce((s, x) => s * x, 1),
  ROUND: (a) => { const k = 10 ** (a[1] ?? 0); return Math.round(num(a[0]) * k) / k; }, ABS: (a) => Math.abs(num(a[0])), SQRT: (a) => Math.sqrt(num(a[0])), POWER: (a) => num(a[0]) ** num(a[1]),
  IF: (a) => (truthy(a[0]) ? a[1] : a[2] ?? false), AND: (a) => a.flat().every(truthy), OR: (a) => a.flat().some(truthy),
  CONCAT: (a) => a.flat().join(''), LEN: (a) => String(a[0] ?? '').length, UPPER: (a) => String(a[0] ?? '').toUpperCase(), LOWER: (a) => String(a[0] ?? '').toLowerCase(),
  TODAY: () => new Date().toISOString().slice(0, 10),
};
const truthy = (x) => (typeof x === 'string' ? x.length > 0 && x.toUpperCase() !== 'FALSE' : !!x);
const num = (x) => (typeof x === 'number' ? x : x === '' || x == null ? 0 : isNaN(+x) ? err('#VALUE!') : +x);
function err(code) { throw Object.assign(new Error(code), { code }); }
function evaluate(src, get, range) {
  const toks = []; const re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|("(?:[^"]|"")*")|(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)\s*\(|(<=|>=|<>|[-+*/^&(),;:=<>%]))/y;
  let m, i = 0; while (i < src.length && (re.lastIndex = i, m = re.exec(src))) { i = re.lastIndex; if (m[1]) toks.push(['n', +m[1]]); else if (m[2]) toks.push(['s', m[2].slice(1, -1).replace(/""/g, '"')]); else if (m[3]) toks.push(['r', m[3].replace(/\$/g, '').toUpperCase()]); else if (m[4]) toks.push(['f', m[4].toUpperCase()]); else toks.push(['o', m[5]]); }
  if (src.slice(i).trim()) err('#NAME?');
  let p = 0; const peek = () => toks[p], eat = (v) => (toks[p] && toks[p][1] === v ? (p++, true) : false);
  const cmp = () => { let a = cat(); for (;;) { const t = peek(); if (t?.[0] === 'o' && ['=', '<>', '<', '>', '<=', '>='].includes(t[1])) { p++; const b = cat(); a = { '=': a == b, '<>': a != b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[t[1]]; } else return a; } };
  const cat = () => { let a = add(); while (eat('&')) a = String(a ?? '') + String(add() ?? ''); return a; };
  const add = () => { let a = mul(); for (;;) { if (eat('+')) a = num(a) + num(mul()); else if (eat('-')) a = num(a) - num(mul()); else return a; } };
  const mul = () => { let a = pow(); for (;;) { if (eat('*')) a = num(a) * num(pow()); else if (eat('/')) { const b = num(pow()); if (!b) err('#DIV/0!'); a = num(a) / b; } else return a; } };
  const pow = () => { let a = un(); while (eat('^')) a = num(a) ** num(un()); return a; };
  const un = () => { if (eat('-')) return -num(un()); if (eat('+')) return num(un()); let v = prim(); if (eat('%')) v = num(v) / 100; return v; };
  const prim = () => {
    const t = toks[p++]; if (!t) err('#ERROR!');
    if (t[0] === 'n' || t[0] === 's') return t[1];
    if (t[0] === 'r') return t[1].includes(':') ? range(t[1]) : get(t[1]);
    if (t[0] === 'f') { const fn = FN[t[1]]; if (!fn) err('#NAME?'); const args = []; if (!eat(')')) { do { args.push(cmp()); } while (eat(',') || eat(';')); if (!eat(')')) err('#ERROR!'); } return fn(args); }
    if (t[1] === '(') { const v = cmp(); eat(')'); return v; }
    if (t[0] === 'o' && /^(TRUE|FALSE)$/i.test(t[1])) return t[1].toUpperCase() === 'TRUE';
    err('#ERROR!');
  };
  const v = cmp(); if (p < toks.length) err('#ERROR!'); return v;
}

// ───────────────────────── workbook ─────────────────────────
function makeSheet(name, rows) { return { name, rows: rows.map((r) => r.map((v) => (v == null ? '' : String(v)))), style: {}, widths: {} }; }
function dims(sh) { let c = 0; for (const r of sh.rows) c = Math.max(c, r.length); return { rows: sh.rows.length, cols: c }; }
export default {
  id: 'table', label: 'Table', icon: 'sheet',
  modes: [{ id: 'view', label: 'View', icon: 'eye' }, { id: 'edit', label: 'Edit', icon: 'pencil' }],
  keys: [{ label: 'Edit cell', keys: 'enter' }, { label: 'Undo / redo', keys: 'mod+z' }, { label: 'Bold', keys: 'mod+b' }, { label: 'Find & replace', keys: 'mod+f' }],
  steps(d, ctx) {
    const x = extOf(d.name);
    return [
      { label: 'Loading sheet engine (bundled · 140 KB)', cached: 'Sheet engine ready', engine: 'sheet', ms: 300 },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 220, run: async () => {
        try {
          if (x === 'xlsx') d.wb = { sheets: (await readXlsx(d.file)).sheets.map((s) => makeSheet(s.name, s.rows.map((r) => Array.from(r, (v) => v ?? '')))), kind: 'Excel workbook' };
          else if (x === 'ods') d.wb = { sheets: (await readOds(d.file)).sheets.map((s) => makeSheet(s.name, s.rows)), kind: 'OpenDocument spreadsheet' };
          else if (x === 'xls') throw human(`${d.name} is an old Excel file`, 'Excel 97–2003 (.xls) isn’t read in this preview; the real viewer opens it. Saving it as .xlsx in Excel works everywhere.', 'BIFF8 not supported in mockup');
          else if (x === 'json' || x === 'ndjson' || x === 'jsonl') { const t = await d.file.text(); const snap = /"fernwork":"workbook"/.test(t.slice(0, 64)) ? JSON.parse(t) : null; d.wb = snap ? { sheets: snap.sheets, kind: 'Fernwork workbook snapshot' } : { sheets: [makeSheet(ctx.baseName(d.name), parseJSONRows(t, d.name))], kind: 'JSON records' }; }
          else if (x === 'arrow') d.wb = { sheets: [makeSheet(ctx.baseName(d.name), await readArrow(d.file))], kind: 'Arrow table' };
          else if (x === 'parquet') d.wb = { sheets: [makeSheet(ctx.baseName(d.name), await readParquet(d.file))], kind: 'Parquet table' };
          else { const t = await d.file.text(); const r = parseDelimited(t, x === 'tsv' ? '\t' : null); const rows = r.decimalComma ? r.rows.map((row, i) => (i ? row.map((v) => (/^-?\d+,\d+$/.test(v) ? v.replace(',', '.') : v)) : row)) : r.rows; d.wb = { sheets: [makeSheet(ctx.baseName(d.name), rows)], kind: `${DELIM_NAME[r.delimiter] || 'comma'}-separated text${r.decimalComma ? ' · decimal comma' : ''}`, delim: r.delimiter, decimalComma: r.decimalComma }; }
        } catch (e) { if (e.human) throw e; throw human(`${d.name} couldn’t be opened as a table`, x === 'xlsx' || x === 'ods' ? 'The spreadsheet package is damaged or isn’t a spreadsheet.' : 'The contents don’t form rows and columns.', String(e.message || e)); }
        d.origWb = JSON.stringify(d.wb.sheets);
        if (d.draft) { try { d.wb.sheets = JSON.parse(d.draft); } catch { /* */ } }
      } },
      { label: 'Calculating formulas', ms: 200 },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  saveOriginal(d, ctx) { if (!d.dirty) { ctx.download(d.name, d.file); ctx.toast(`Saved ${d.name}`); return; } exportAs(d, ctx, extOf(d.name) === 'ods' ? 'ods' : ['csv', 'tsv'].includes(extOf(d.name)) ? extOf(d.name) : 'xlsx'); },
  inspector(d, ctx) {
    const sh = d.ctl?.sheet(); if (!sh) return {}; const z = dims(sh);
    const info = ctx.kv([['Type', d.wb.kind], ['Sheets', `${d.wb.sheets.length}`], ['This sheet', `${ctx.nf(z.rows)} rows × ${z.cols} columns`], ['Formulas', ctx.nf(sh.rows.flat().filter((v) => String(v).startsWith('=')).length)], ['Changes', d.dirty ? 'Edited · kept on this device' : 'None']]);
    const s = d.ctl.selStats(); const selection = s ? ctx.kv([['Cells', s.range], ['Sum', `<strong>${s.sum}</strong>`], ['Average', s.avg], ['Count', s.count], ['Min / max', s.mm]]) : null;
    return { info, infoLabel: 'Workbook', selection, selectionLabel: 'Selection' };
  },
  status(d, ctx) { const s = d.ctl?.selStats(); if (!s) return null; return [`<strong class="ov-strong">${s.range}</strong>`, ...(s.n ? [`Sum ${s.sum}`, `Average ${s.avg}`, `Count ${s.count}`] : [`Count ${s.count}`])]; },
  options(d, ctx) {
    const o = d.opt; const set = (k) => { o[k] = !o[k]; saveOpt(o); d.ctl.render(); ctx.refresh('status insp'); };
    return [
      { group: 'View', items: [
        { label: 'First row is a header', checked: o.header, onSelect: () => set('header') },
        { label: 'Keep header visible', sub: 'Freeze the first row', checked: o.freeze, onSelect: () => set('freeze') },
        { label: 'Gridlines', checked: o.grid, onSelect: () => set('grid') },
        { label: 'Column letters and row numbers', checked: o.headings, onSelect: () => set('headings') },
      ] },
      { group: 'Numbers', items: [
        { label: 'Decimal point · 1,234.5', radio: true, checked: !o.comma, onSelect: () => { o.comma = false; saveOpt(o); d.ctl.render(); ctx.refresh('status insp'); } },
        { label: 'Decimal comma · 1.234,5', radio: true, checked: o.comma, onSelect: () => { o.comma = true; saveOpt(o); d.ctl.render(); ctx.refresh('status insp'); } },
      ] },
    ];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const sh = d.ctl.sheet();
    return [
      { group: 'Workbook', items: [
        { label: 'Excel (.xlsx)', sub: `${d.wb.sheets.length} sheet${d.wb.sheets.length > 1 ? 's' : ''}, formulas kept`, icon: 'file-spreadsheet', file: `${b}.xlsx`, onSelect: () => exportAs(d, ctx, 'xlsx') },
        { label: 'OpenDocument (.ods)', sub: 'LibreOffice, Numbers', icon: 'file-spreadsheet', file: `${b}.ods`, onSelect: () => exportAs(d, ctx, 'ods') }] },
      { group: `This sheet · ${sh.name}`, items: [
        { label: 'CSV', sub: 'Comma-separated, values', icon: 'file-text', file: `${b}.csv`, onSelect: () => exportAs(d, ctx, 'csv') },
        { label: 'CSV for German Excel', sub: 'Semicolons, decimal comma', icon: 'file-text', file: `${b}-excel.csv`, onSelect: () => exportAs(d, ctx, 'csv-de') },
        { label: 'TSV', sub: 'Tab-separated', icon: 'file-text', file: `${b}.tsv`, onSelect: () => exportAs(d, ctx, 'tsv') },
        { label: 'JSON', sub: d.opt.header ? 'One record per row' : 'Rows as arrays', icon: 'braces', file: `${b}.json`, onSelect: () => exportAs(d, ctx, 'json') },
        { label: 'HTML table', icon: 'code-xml', file: `${b}.html`, onSelect: () => exportAs(d, ctx, 'html') },
        { label: 'Print / PDF', icon: 'file-text', file: `${b}.pdf`, onSelect: () => exportAs(d, ctx, 'print') },
        { label: 'Workbook snapshot', sub: 'All sheets, formulas and formats · reopens here', icon: 'braces', file: `${b}.fernwork.json`, onSelect: () => { const name = `${b}.fernwork.json`; ctx.download(name, JSON.stringify({ fernwork: 'workbook', version: 1, sheets: d.wb.sheets }), 'application/json'); ctx.toast(`Saved ${name}`); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'edit', label: 'Edit cells', icon: 'pencil', run: () => ctx.setMode(d, 'edit') },
      { id: 'find', label: 'Find and replace…', icon: 'search', kbd: 'mod+f', run: () => d.ctl.find() },
      { id: 'dedupe', label: 'Remove duplicate rows', icon: 'list-checks', searchOnly: true, run: () => d.ctl.dedupe() },
      { id: 'xlsx', label: 'Save as Excel (.xlsx)', icon: 'download', searchOnly: true, run: () => exportAs(d, ctx, 'xlsx') },
      ...d.wb.sheets.map((s, i) => ({ id: 'sh' + i, label: `Go to sheet ${s.name}`, icon: 'sheet', searchOnly: true, run: () => d.ctl.go(i) })),
    ];
  },
  mobileSlots(d) { return [{ id: 'find', label: 'Find', icon: 'search', run: (doc) => doc.ctl.find() }, { id: 'info', label: 'Sum', icon: 'sigma' }, { id: 'more', label: 'View', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};

function exportAs(d, ctx, kind) {
  const b = ctx.baseName(d.name); const sh = d.ctl.sheet(); const vals = d.ctl.values(sh);
  const csvCell = (v, sep) => { const s = String(v ?? ''); return new RegExp(`[${sep === '\t' ? '\\t' : sep}"\\n]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  let name, blob;
  if (kind === 'xlsx') { name = `${b}.xlsx`; writeXlsx({ sheets: d.wb.sheets.map((s) => ({ name: s.name, rows: s.rows })) }).then((bl) => { ctx.download(name, bl); ctx.toast(`Saved ${name}`); }); return; }
  if (kind === 'ods') { name = `${b}.ods`; Promise.resolve(writeOds({ sheets: d.wb.sheets.map((s) => ({ name: s.name, rows: d.ctl.values(s) })) })).then((bl) => { ctx.download(name, bl); ctx.toast(`Saved ${name}`); }); return; }
  if (kind === 'csv') { name = `${b}.csv`; blob = '﻿' + vals.map((r) => r.map((v) => csvCell(v, ',')).join(',')).join('\n'); }
  else if (kind === 'csv-de') { name = `${b}-excel.csv`; blob = '﻿' + vals.map((r) => r.map((v) => csvCell(typeof v === 'number' ? String(v).replace('.', ',') : v, ';')).join(';')).join('\r\n'); }
  else if (kind === 'tsv') { name = `${b}.tsv`; blob = vals.map((r) => r.map((v) => csvCell(v, '\t')).join('\t')).join('\n'); }
  else if (kind === 'json') { name = `${b}.json`; const [hd, ...rest] = vals; blob = JSON.stringify(d.opt.header ? rest.map((r) => Object.fromEntries(hd.map((h, i) => [h || colName(i), r[i] ?? '']))) : vals, null, 2); }
  else if (kind === 'html' || kind === 'print') {
    const esc = ctx.esc; const html = `<!doctype html><meta charset="utf-8"><title>${esc(sh.name)}</title><style>body{font:13px system-ui,sans-serif}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}th{background:#f4f4f5;text-align:left}td.n{text-align:right}@page{size:landscape;margin:12mm}</style><table>${vals.map((r, i) => `<tr>${r.map((v) => (i === 0 && d.opt.header ? `<th>${esc(v)}</th>` : `<td class="${typeof v === 'number' ? 'n' : ''}">${esc(v)}</td>`)).join('')}</tr>`).join('')}</table>`;
    if (kind === 'print') { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; document.body.append(f); f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close(); ctx.toast(`Choose “Save as PDF” to keep ${b}.pdf`, { type: 'info' }); setTimeout(() => { try { f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 2000); }, 250); return; }
    name = `${b}.html`; blob = html;
  }
  ctx.download(name, blob, 'text/plain'); ctx.toast(`Saved ${name}`);
}

function mountView(d, el, ctx) {
  d.opt = loadOpt(); let si = 0; let sel = { r: 1, c: 0, r2: 1, c2: 0 }; let viewSort = null, filter = '', editing = null;
  const undo = [], redo = [];
  el.classList.add('tb');
  el.innerHTML = `<div class="tb-top"></div><div class="tb-gridwrap" tabindex="0" aria-label="Sheet"><table class="tb-grid"></table></div><div class="tb-tabs" role="tablist" aria-label="Sheets"></div>`;
  const top = el.querySelector('.tb-top'), wrap = el.querySelector('.tb-gridwrap'), table = el.querySelector('.tb-grid'), tabs = el.querySelector('.tb-tabs');
  let zoom = 1;
  const sh = () => d.wb.sheets[si];
  // values with formulas evaluated (per render)
  let cache = new Map();
  function value(s, r, c, stack = new Set()) {
    const key = `${d.wb.sheets.indexOf(s)}:${r}:${c}`; if (cache.has(key)) return cache.get(key);
    const raw = s.rows[r]?.[c] ?? ''; let v;
    if (typeof raw === 'string' && raw.startsWith('=')) {
      if (stack.has(key)) return '#CIRC!'; stack.add(key);
      try { v = evaluate(raw.slice(1), (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); return value(s, +m[2] - 1, colIdx(m[1]), stack); }, (rg) => { const [a, b2] = rg.split(':'); const p = (x) => { const m = /^([A-Z]+)(\d+)$/.exec(x); return [+m[2] - 1, colIdx(m[1])]; }; const [r1, c1] = p(a), [r2, c2] = p(b2); const out = []; for (let i = Math.min(r1, r2); i <= Math.max(r1, r2); i++) for (let j = Math.min(c1, c2); j <= Math.max(c1, c2); j++) out.push(value(s, i, j, stack)); return out; }); if (typeof v === 'number' && !isFinite(v)) v = '#NUM!'; }
      catch (e) { v = e.code || '#ERROR!'; }
      stack.delete(key);
    } else v = raw !== '' && !isNaN(+raw) && /^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(raw.trim()) && !/^0\d/.test(raw.trim()) ? +raw : raw;
    cache.set(key, v); return v;
  }
  const values = (s) => { cache = new Map(); return s.rows.map((r, i) => Array.from({ length: dims(s).cols }, (_, j) => value(s, i, j))); };
  const nfmt = (v, fmt) => {
    const loc = d.opt.comma ? 'de-DE' : 'en-US';
    if (typeof v !== 'number') return v === true ? 'TRUE' : v === false ? 'FALSE' : String(v ?? '');
    switch (fmt) {
      case 'number': return v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'integer': return Math.round(v).toLocaleString(loc);
      case 'eur': return v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
      case 'usd': return '$' + v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percent': return (v * 100).toLocaleString(loc, { maximumFractionDigits: 1 }) + ' %';
      case 'scientific': return v.toExponential(2).toUpperCase().replace('E+', 'E+');
      case 'date': { const dt = new Date(Math.round((v - 25569) * 864e5)); return isNaN(dt) ? String(v) : dt.toISOString().slice(0, 10); }
      case 'time': { const m = Math.round((v % 1) * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
      default: { const s = String(+v.toPrecision(12)); return d.opt.comma ? s.replace('.', ',') : s; }
    }
  };
  function snapshot() { return JSON.stringify(d.wb.sheets); }
  function commit(prev) { undo.push(prev); if (undo.length > 60) undo.shift(); redo.length = 0; changed(); }
  function changed() { d.draft = snapshot(); ctx.setDirty(d, true); ctx.saveDraft(d); render(); ctx.refresh('status insp'); }
  function doUndo(stack, other) { const s = stack.pop(); if (!s) return; other.push(snapshot()); d.wb.sheets = JSON.parse(s); si = Math.min(si, d.wb.sheets.length - 1); d.draft = snapshot(); ctx.setDirty(d, true); ctx.saveDraft(d); render(); ctx.refresh('status insp'); }
  function setCell(r, c, v) { const s = sh(); while (s.rows.length <= r) s.rows.push([]); const row = s.rows[r]; while (row.length <= c) row.push(''); row[c] = v; }
  const norm = () => ({ r1: Math.min(sel.r, sel.r2), r2: Math.max(sel.r, sel.r2), c1: Math.min(sel.c, sel.c2), c2: Math.max(sel.c, sel.c2) });
  // rows shown (view sort / filter apply in View mode only; Edit always shows sheet order)
  function shownRows(vals) {
    const hdr = d.opt.header ? 1 : 0; let idx = vals.map((_, i) => i).slice(hdr);
    if (filter) { const q = filter.toLowerCase(); idx = idx.filter((i) => vals[i].some((v) => String(v ?? '').toLowerCase().includes(q))); }
    if (viewSort && d.mode === 'view') { const { c, dir } = viewSort; idx.sort((a, b) => { const x = vals[a][c], y = vals[b][c]; if (x === '' || x == null) return 1; if (y === '' || y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de')) * dir; }); }
    return hdr ? [0, ...idx] : idx;
  }
  function renderTop() {
    const s = sh(); const z = dims(s); const { r1, c1 } = norm(); const raw = s.rows[r1]?.[c1] ?? '';
    const st = s.style[`${r1},${c1}`] || {};
    if (d.mode === 'edit') {
      top.innerHTML = `<div class="tb-tools" role="toolbar" aria-label="Edit">
        <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-a="undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z" ${undo.length ? '' : 'disabled'}>${ctx.icon('undo-2')}</button>
        <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-a="redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z" ${redo.length ? '' : 'disabled'}>${ctx.icon('redo-2')}</button><span class="fw-divider-v"></span>
        <button class="fw-iconbtn fw-iconbtn--sm tb-b" type="button" data-a="b" aria-label="Bold" aria-pressed="${!!st.b}" data-tip="Bold" data-tip-kbd="mod+b">B</button>
        <button class="fw-iconbtn fw-iconbtn--sm tb-i" type="button" data-a="i" aria-label="Italic" aria-pressed="${!!st.i}" data-tip="Italic" data-tip-kbd="mod+i">I</button>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="align" aria-haspopup="menu" data-tip="Alignment">${ctx.icon('text')}${ctx.icon('chevron-down', { size: 12 })}</button>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="fmt" aria-haspopup="menu" data-tip="Number format">${ctx.esc(FMTS.find((f) => f[0] === (st.fmt || 'general'))[1])}${ctx.icon('chevron-down', { size: 12 })}</button><span class="fw-divider-v"></span>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="ins" aria-haspopup="menu">${ctx.icon('plus')}Insert${ctx.icon('chevron-down', { size: 12 })}</button>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="del" aria-haspopup="menu">${ctx.icon('trash-2')}Delete${ctx.icon('chevron-down', { size: 12 })}</button>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="sum" data-tip="AutoSum below the selection">${ctx.icon('sigma')}Sum</button>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="sort" aria-haspopup="menu">${ctx.icon('arrow-down-up')}Sort${ctx.icon('chevron-down', { size: 12 })}</button>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-a="more" aria-haspopup="menu">More${ctx.icon('chevron-down', { size: 12 })}</button></div>
        <div class="tb-fbar"><span class="tb-ref">${ref(r1, c1)}</span><span class="tb-fx">fx</span><input class="fw-input tb-formula" type="text" spellcheck="false" aria-label="Cell ${ref(r1, c1)} contents" value="${ctx.esc(raw)}"></div>`;
      ctx.enhance(top);
      const fi = top.querySelector('.tb-formula');
      fi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const prev = snapshot(); setCell(r1, c1, fi.value); commit(prev); move(1, 0); wrap.focus(); } else if (e.key === 'Escape') { e.preventDefault(); fi.value = raw; wrap.focus(); } });
      top.querySelector('.tb-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) action(b.dataset.a, b); });
    } else {
      top.innerHTML = `<div class="tb-viewbar"><span class="db-meta">${ctx.nf(Math.max(0, z.rows - (d.opt.header ? 1 : 0)))} rows · ${z.cols} columns${/separated/.test(d.wb.kind) ? ' · ' + ctx.esc(d.wb.kind) : ''}${viewSort ? ` · sorted by ${ctx.esc(String(values(s)[0]?.[viewSort.c] || colName(viewSort.c)))} ${viewSort.dir > 0 ? '↑' : '↓'}` : ''}</span><span class="fw-spacer"></span>
        ${viewSort ? '<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-unsort>Original order</button>' : ''}
        <label class="fw-inputwrap db-filter">${ctx.icon('filter')}<input class="fw-input" type="search" placeholder="Filter rows" aria-label="Filter rows" value="${ctx.esc(filter)}"></label></div>`;
      const inp = top.querySelector('input'); let ft = 0;
      inp.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => { filter = inp.value; renderGrid(); }, 120); });
      top.querySelector('[data-unsort]')?.addEventListener('click', () => { viewSort = null; render(); });
    }
  }
  function renderGrid() {
    const s = sh(); const vals = values(s); const z = dims(s); const cols = Math.max(z.cols, d.mode === 'edit' ? z.cols + 2 : 0);
    const rows = shownRows(vals); const extra = d.mode === 'edit' ? 8 : 0;
    const { r1, r2, c1, c2 } = norm();
    const widths = Array.from({ length: cols }, (_, j) => s.widths[j] || Math.max(64, Math.min(280, 16 + 7.4 * Math.max(3, ...vals.slice(0, 200).map((r) => nfmt(r[j], s.style[`0,${j}`]?.fmt).length)))));
    const hdr = d.opt.header;
    let h = `<colgroup>${d.opt.headings ? '<col style="width:48px">' : ''}${widths.map((w) => `<col style="width:${Math.round(w)}px">`).join('')}</colgroup>`;
    if (d.opt.headings) h += `<thead><tr><th class="tb-corner"></th>${widths.map((_, j) => `<th class="tb-colh ${j >= c1 && j <= c2 ? 'is-on' : ''}" scope="col" data-col="${j}">${colName(j)}${d.mode === 'view' && viewSort?.c === j ? (viewSort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>`;
    h += '<tbody>';
    const limit = Math.min(rows.length, 2000);
    const rowsAll = [...rows.slice(0, limit), ...Array.from({ length: extra }, (_, k) => z.rows + k)];
    for (const i of rowsAll) {
      const isHdr = hdr && i === 0;
      h += `<tr class="${isHdr ? 'tb-hrow' : ''}">${d.opt.headings ? `<th class="tb-rowh ${i >= r1 && i <= r2 ? 'is-on' : ''}" scope="row">${i + 1}</th>` : ''}`;
      for (let j = 0; j < cols; j++) {
        const v = vals[i]?.[j]; const st = s.style[`${i},${j}`] || {}; const raw = s.rows[i]?.[j] ?? '';
        const isNum = typeof v === 'number'; const isErr = typeof v === 'string' && /^#[A-Z/0!?]+!?$/.test(v);
        const on = i >= r1 && i <= r2 && j >= c1 && j <= c2; const cur = i === r1 && j === c1;
        const cls = [isNum ? 'is-num' : '', isErr ? 'is-err' : '', st.b || isHdr ? 'is-b' : '', st.i ? 'is-i' : '', st.align ? 'al-' + st.align : '', on ? 'is-sel' : '', cur ? 'is-cur' : '', String(raw).startsWith('=') ? 'is-fx' : ''].filter(Boolean).join(' ');
        h += `<td data-r="${i}" data-c="${j}" class="${cls}">${ctx.esc(isHdr ? String(v ?? '') : nfmt(v, st.fmt))}</td>`;
      }
      h += '</tr>';
    }
    h += '</tbody>';
    table.innerHTML = h;
    table.classList.toggle('no-grid', !d.opt.grid); table.classList.toggle('is-freeze', !!(d.opt.freeze && hdr));
    if (rows.length > limit) wrap.insertAdjacentHTML('beforeend', '');
    el.dataset.empty = filter && rows.length <= (hdr ? 1 : 0) ? 'filter' : '';
    table.style.zoom = zoom;
  }
  function renderTabs() {
    tabs.innerHTML = d.wb.sheets.map((s, i) => `<button class="tb-tab" type="button" role="tab" aria-selected="${i === si}" data-i="${i}">${ctx.esc(s.name)}</button>`).join('') + (d.mode === 'edit' ? `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-addsheet aria-label="Add sheet" data-tip="Add sheet">${ctx.icon('plus')}</button>` : '');
    tabs.hidden = d.wb.sheets.length < 2 && d.mode !== 'edit';
  }
  function render() { renderTop(); renderGrid(); renderTabs(); }
  function move(dr, dc, extend = false) { const s = sh(); const z = dims(s); const r = Math.max(0, Math.min(z.rows + 7, (extend ? sel.r2 : sel.r) + dr)), c = Math.max(0, Math.min(z.cols + 1, (extend ? sel.c2 : sel.c) + dc)); if (extend) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c }; render(); ctx.refresh('status insp'); table.querySelector('.is-cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  function startEdit(initial) {
    if (d.mode !== 'edit') { ctx.setMode(d, 'edit'); }
    const td = table.querySelector(`td[data-r="${sel.r}"][data-c="${sel.c}"]`); if (!td) return;
    const raw = sh().rows[sel.r]?.[sel.c] ?? ''; const r = td.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const inp = ctx.h(`<input class="tb-cellinput" type="text" spellcheck="false" aria-label="Edit ${ref(sel.r, sel.c)}">`);
    inp.value = initial ?? raw; inp.style.cssText = `left:${r.left - wr.left + wrap.scrollLeft}px;top:${r.top - wr.top + wrap.scrollTop}px;width:${Math.max(r.width, 120)}px;height:${r.height}px`;
    wrap.append(inp); inp.focus(); if (initial == null) inp.select(); editing = inp;
    const done = (ok, dr = 1, dc = 0) => { if (editing !== inp) return; editing = null; const v = inp.value; inp.remove(); if (ok && v !== raw) { const prev = snapshot(); setCell(sel.r, sel.c, v); commit(prev); } wrap.focus({ preventScroll: true }); if (ok) move(dr, dc); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true, e.shiftKey ? -1 : 1, 0); } else if (e.key === 'Tab') { e.preventDefault(); done(true, 0, e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
    inp.addEventListener('blur', () => done(true, 0, 0));
  }
  function action(a, btn) {
    const s = sh(); const { r1, r2, c1, c2 } = norm(); const prev = snapshot();
    const styleAll = (fn) => { for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) { const k = `${i},${j}`; s.style[k] = fn({ ...(s.style[k] || {}) }); } commit(prev); };
    if (a === 'undo') return doUndo(undo, redo);
    if (a === 'redo') return doUndo(redo, undo);
    if (a === 'b' || a === 'i') { const on = !(s.style[`${r1},${c1}`]?.[a]); return styleAll((x) => ({ ...x, [a]: on })); }
    if (a === 'align') return ctx.menu(btn, [{ items: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(([v, l]) => ({ label: l, onSelect: () => styleAll((x) => ({ ...x, align: v })) })) }]);
    if (a === 'fmt') return ctx.menu(btn, [{ group: 'Number format', items: FMTS.map(([v, l, ex]) => ({ label: l, hint: ex, radio: true, checked: (s.style[`${r1},${c1}`]?.fmt || 'general') === v, onSelect: () => styleAll((x) => ({ ...x, fmt: v })) })) }]);
    if (a === 'ins') return ctx.menu(btn, [{ items: [
      { label: 'Row above', icon: 'arrow-up', onSelect: () => { s.rows.splice(r1, 0, []); shiftStyle(s, 'r', r1, 1); commit(prev); } },
      { label: 'Row below', icon: 'arrow-down', onSelect: () => { s.rows.splice(r2 + 1, 0, []); shiftStyle(s, 'r', r2 + 1, 1); commit(prev); } },
      { label: 'Column left', icon: 'arrow-left', onSelect: () => { for (const r of s.rows) if (r.length > c1) r.splice(c1, 0, ''); shiftStyle(s, 'c', c1, 1); commit(prev); } },
      { label: 'Column right', icon: 'arrow-right', onSelect: () => { for (const r of s.rows) if (r.length > c2 + 1) r.splice(c2 + 1, 0, ''); shiftStyle(s, 'c', c2 + 1, 1); commit(prev); } }] }]);
    if (a === 'del') return ctx.menu(btn, [{ items: [
      { label: r1 === r2 ? `Row ${r1 + 1}` : `Rows ${r1 + 1}–${r2 + 1}`, icon: 'trash-2', onSelect: () => { s.rows.splice(r1, r2 - r1 + 1); shiftStyle(s, 'r', r1, -(r2 - r1 + 1)); commit(prev); ctx.toast('Deleted', { type: 'neutral', action: { label: 'Undo', onClick: () => doUndo(undo, redo) } }); } },
      { label: c1 === c2 ? `Column ${colName(c1)}` : `Columns ${colName(c1)}–${colName(c2)}`, icon: 'trash-2', onSelect: () => { for (const r of s.rows) r.splice(c1, c2 - c1 + 1); shiftStyle(s, 'c', c1, -(c2 - c1 + 1)); commit(prev); ctx.toast('Deleted', { type: 'neutral', action: { label: 'Undo', onClick: () => doUndo(undo, redo) } }); } },
      { label: 'Clear contents', icon: 'eraser', kbd: 'backspace', onSelect: () => { for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) if (s.rows[i]) s.rows[i][j] = ''; commit(prev); } }] }]);
    if (a === 'sum') { const below = r2 + 1; setCell(below, c1, `=SUM(${ref(r1, c1)}:${ref(r2, c1)})`); for (let j = c1 + 1; j <= c2; j++) setCell(below, j, `=SUM(${ref(r1, j)}:${ref(r2, j)})`); commit(prev); sel = { r: below, c: c1, r2: below, c2: c1 }; render(); return; }
    if (a === 'sort') return ctx.menu(btn, [{ items: [['A → Z', 1], ['Z → A', -1]].map(([l, dir]) => ({ label: `Sort by ${colName(c1)} · ${l}`, icon: 'arrow-down-up', onSelect: () => { const vals = values(s); const h = d.opt.header ? 1 : 0; const idx = s.rows.map((_, i) => i).slice(h); idx.sort((x, y) => { const p = vals[x]?.[c1], q = vals[y]?.[c1]; return (typeof p === 'number' && typeof q === 'number' ? p - q : String(p ?? '').localeCompare(String(q ?? ''), 'de')) * dir; }); s.rows = [...s.rows.slice(0, h), ...idx.map((i) => s.rows[i])]; commit(prev); } })) }]);
    if (a === 'more') return ctx.menu(btn, [
      { group: 'Data', items: [
        { label: 'Find and replace…', icon: 'search', kbd: 'mod+f', onSelect: () => find() },
        { label: 'Remove duplicate rows', icon: 'list-checks', onSelect: () => dedupe() },
        { label: 'Freeze header row', checked: d.opt.freeze, onSelect: () => { d.opt.freeze = !d.opt.freeze; saveOpt(d.opt); render(); } },
        { label: 'Recalculate', icon: 'refresh-cw', onSelect: () => { render(); ctx.toast('Recalculated', { type: 'neutral' }); } }] },
      { group: 'Sheet', items: [
        { label: 'Rename sheet…', icon: 'pencil', onSelect: () => renameSheet() },
        { label: 'Duplicate sheet', icon: 'copy', onSelect: () => { const c = JSON.parse(JSON.stringify(s)); c.name = `${s.name} (2)`; d.wb.sheets.splice(si + 1, 0, c); si++; commit(prev); } },
        { label: 'Delete sheet', icon: 'trash-2', disabled: d.wb.sheets.length < 2, onSelect: () => { d.wb.sheets.splice(si, 1); si = Math.max(0, si - 1); commit(prev); ctx.toast('Sheet deleted', { type: 'neutral', action: { label: 'Undo', onClick: () => doUndo(undo, redo) } }); } }] },
      { group: 'Also in the full editor', items: ['Merge cells', 'Borders and fill colour', 'Text to columns', 'Conditional formatting', 'Data list (validation)', 'Chart', 'Sparklines', 'Pivot summary', 'Comments', 'Lock cells', 'Named ranges', 'Hyperlink, image, shape'].map((l) => ({ label: l, sub: '', onSelect: () => ctx.toast(`${l}: same as today’s sheet editor (not built in this mockup)`, { type: 'info' }) })) },
    ]);
  }
  function shiftStyle(s, axis, at, by) { const out = {}; for (const [k, v] of Object.entries(s.style)) { let [r, c] = k.split(',').map(Number); if (axis === 'r' && r >= at) r += by; if (axis === 'c' && c >= at) c += by; if (r >= 0 && c >= 0) out[`${r},${c}`] = v; } s.style = out; }
  function renameSheet() {
    const body = ctx.h(`<label class="fw-field"><span class="fw-field__label">Sheet name</span><input class="fw-input" value="${ctx.esc(sh().name)}"></label>`);
    ctx.openDialog({ title: 'Rename sheet', body, size: 380, actions: [{ label: 'Cancel', ghost: true }, { label: 'Rename', primary: true, onClick: () => { const prev = snapshot(); sh().name = body.querySelector('input').value.trim() || sh().name; commit(prev); } }] });
    setTimeout(() => body.querySelector('input').select(), 60);
  }
  function find() {
    const body = ctx.h(`<div class="fw-stack" style="--gap:12px"><label class="fw-field"><span class="fw-field__label">Find</span><input class="fw-input" id="tf-find" type="search"></label>
      <label class="fw-field"><span class="fw-field__label">Replace with</span><input class="fw-input" id="tf-rep"></label><label class="fw-check"><input type="checkbox" id="tf-case"> Match case</label><p class="fw-t-sm fw-muted" id="tf-n"></p></div>`);
    const count = () => { const q = body.querySelector('#tf-find').value; const cs = body.querySelector('#tf-case').checked; let n = 0; if (q) for (const r of sh().rows) for (const v of r) if ((cs ? String(v) : String(v).toLowerCase()).includes(cs ? q : q.toLowerCase())) n++; body.querySelector('#tf-n').textContent = q ? `${n} cell${n === 1 ? '' : 's'} in ${sh().name}` : ''; return n; };
    body.addEventListener('input', count);
    ctx.openDialog({ title: 'Find and replace', body, size: 420, actions: [
      { label: 'Find next', ghost: true, close: false, onClick: () => { const q = body.querySelector('#tf-find').value.toLowerCase(); if (!q) return false; const s = sh(); for (let k = 1; k <= s.rows.length * 64; k++) { const lin = sel.r * 64 + sel.c + k; const i = Math.floor(lin / 64) % Math.max(1, s.rows.length), j = lin % 64; if (String(s.rows[i]?.[j] ?? '').toLowerCase().includes(q)) { sel = { r: i, c: j, r2: i, c2: j }; render(); table.querySelector('.is-cur')?.scrollIntoView({ block: 'center' }); break; } } return false; } },
      { label: 'Replace all', primary: true, onClick: () => { const q = body.querySelector('#tf-find').value, rep = body.querySelector('#tf-rep').value, cs = body.querySelector('#tf-case').checked; if (!q) return; const prev = snapshot(); let n = 0; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); for (const r of sh().rows) r.forEach((v, j) => { const nv = String(v).replace(re, () => { n++; return rep; }); if (nv !== String(v)) r[j] = nv; }); if (n) { commit(prev); ctx.toast(`Replaced ${n} time${n === 1 ? '' : 's'}`, { action: { label: 'Undo', onClick: () => doUndo(undo, redo) } }); } else ctx.toast('Nothing to replace', { type: 'info' }); } }] });
    setTimeout(() => body.querySelector('#tf-find').focus(), 60);
  }
  function dedupe() { const s = sh(); const prev = snapshot(); const h = d.opt.header ? 1 : 0; const seen = new Set(); const keep = s.rows.filter((r, i) => { if (i < h) return true; const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; }); const n = s.rows.length - keep.length; if (!n) { ctx.toast('No duplicate rows', { type: 'info' }); return; } s.rows = keep; commit(prev); ctx.toast(`Removed ${n} duplicate row${n === 1 ? '' : 's'}`, { action: { label: 'Undo', onClick: () => doUndo(undo, redo) } }); }

  // pointer selection
  let dragSel = false;
  table.addEventListener('pointerdown', (e) => {
    const td = e.target.closest('td[data-r]'); const ch = e.target.closest('.tb-colh');
    if (ch) { const c = +ch.dataset.col; if (d.mode === 'view') { viewSort = viewSort?.c !== c ? { c, dir: 1 } : viewSort.dir > 0 ? { c, dir: -1 } : null; render(); return; } const z = dims(sh()); sel = { r: 0, c, r2: z.rows - 1, c2: c }; render(); ctx.refresh('status insp'); return; }
    if (!td) return; if (editing) editing.blur();
    const r = +td.dataset.r, c = +td.dataset.c;
    if (e.shiftKey) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c };
    dragSel = true; render(); ctx.refresh('status insp'); e.preventDefault(); setTimeout(() => wrap.focus({ preventScroll: true }), 0);
  });
  table.addEventListener('pointerover', (e) => { if (!dragSel) return; const td = e.target.closest('td[data-r]'); if (!td) return; sel.r2 = +td.dataset.r; sel.c2 = +td.dataset.c; render(); ctx.refresh('status insp'); });
  window.addEventListener('pointerup', () => { dragSel = false; });
  table.addEventListener('dblclick', (e) => { if (e.target.closest('td[data-r]')) startEdit(); });
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { si = +b.dataset.i; sel = { r: 1, c: 0, r2: 1, c2: 0 }; viewSort = null; render(); ctx.refresh('status insp'); return; } if (e.target.closest('[data-addsheet]')) { const prev = snapshot(); d.wb.sheets.push(makeSheet(`Sheet${d.wb.sheets.length + 1}`, [[]])); si = d.wb.sheets.length - 1; commit(prev); } });
  tabs.addEventListener('dblclick', (e) => { if (e.target.closest('[data-i]') && d.mode === 'edit') renameSheet(); });
  wrap.addEventListener('paste', (e) => {
    if (editing || d.mode !== 'edit') return; const t = e.clipboardData?.getData('text/plain'); if (!t) return; e.preventDefault();
    const prev = snapshot(); const rows = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
    rows.forEach((r, i) => r.forEach((v, j) => setCell(sel.r + i, sel.c + j, v))); commit(prev); sel.r2 = sel.r + rows.length - 1; sel.c2 = sel.c + Math.max(...rows.map((r) => r.length)) - 1; render(); ctx.toast(`Pasted ${rows.length} × ${Math.max(...rows.map((r) => r.length))} cells`, { type: 'neutral', action: { label: 'Undo', onClick: () => doUndo(undo, redo) } });
  });
  wrap.addEventListener('keydown', (e) => {
    if (editing) return; const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'x' && d.mode === 'edit') { const { r1, r2, c1, c2 } = norm(); const vals = values(sh()); const t = []; for (let i = r1; i <= r2; i++) t.push(vals[i]?.slice(c1, c2 + 1).map((v) => v ?? '').join('\t')); ctx.copyText(t.join('\n')); const prev = snapshot(); for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) if (sh().rows[i]) sh().rows[i][j] = ''; commit(prev); e.preventDefault(); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); move(...arrows[e.key], e.shiftKey); return; }
    if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
    if (mod && e.key.toLowerCase() === 'c') { const { r1, r2, c1, c2 } = norm(); const vals = values(sh()); const t = []; for (let i = r1; i <= r2; i++) t.push(vals[i]?.slice(c1, c2 + 1).map((v) => v ?? '').join('\t')); ctx.copyText(t.join('\n')); ctx.toast(`Copied ${(r2 - r1 + 1) * (c2 - c1 + 1)} cells`, { type: 'neutral' }); e.preventDefault(); return; }
    if (d.mode !== 'edit') { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(); } return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doUndo(redo, undo) : doUndo(undo, redo); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(redo, undo); return; }
    if (mod && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i')) { e.preventDefault(); action(e.key.toLowerCase()); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const { r1, r2, c1, c2 } = norm(); const prev = snapshot(); for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) if (sh().rows[i]) sh().rows[i][j] = ''; commit(prev); return; }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  });
  render();
  el.dataset.mode = d.mode;
  return {
    sheet: sh, values, render, find, dedupe, go: (i) => { si = i; render(); ctx.refresh('status insp'); },
    zoom: () => zoom * 100, isFit: () => zoom === 1, fit: () => { zoom = 1; table.style.zoom = 1; ctx.refresh('zoom'); }, setZoom: (p) => { zoom = Math.max(0.5, Math.min(2, p / 100)); table.style.zoom = zoom; ctx.refresh('zoom'); }, zoomBy: (f) => { zoom = Math.max(0.5, Math.min(2, Math.round(zoom * (f > 1 ? 1.1 : 1 / 1.1) * 10) / 10)); table.style.zoom = zoom; ctx.refresh('zoom'); },
    setMode: (m) => { el.dataset.mode = m; if (editing) editing.blur(); render(); ctx.refresh('status'); },
    step: (dir) => { si = (si + dir + d.wb.sheets.length) % d.wb.sheets.length; render(); },
    modKey: (e) => { if (e.key.toLowerCase() === 'f' && !e.shiftKey) { find(); return true; } return false; },
    selStats: () => { const { r1, r2, c1, c2 } = norm(); const vals = values(sh()); const ns = []; let count = 0; for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) { const v = vals[i]?.[j]; if (v !== '' && v != null) count++; if (typeof v === 'number') ns.push(v); } const f = (x) => (+x.toFixed(2)).toLocaleString(d.opt.comma ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 }); const n = ns.length; const sum = ns.reduce((a, b) => a + b, 0); return { range: r1 === r2 && c1 === c2 ? ref(r1, c1) : `${ref(r1, c1)}:${ref(r2, c2)}`, n, sum: f(sum), avg: n ? f(sum / n) : '—', count: ctx.nf(count), mm: n ? `${f(Math.min(...ns))} / ${f(Math.max(...ns))}` : '—' }; },
    toggleOriginal: () => { if (!d._mine) { d._mine = JSON.stringify(d.wb.sheets); d.wb.sheets = JSON.parse(d.origWb); } else { d.wb.sheets = JSON.parse(d._mine); d._mine = null; } si = Math.min(si, d.wb.sheets.length - 1); render(); return !!d._mine; },
    discardDraft: () => { d._mine = null; d.wb.sheets = JSON.parse(d.origWb); d.draft = null; undo.length = 0; si = 0; ctx.setDirty(d, false); ctx.saveDraft(d); render(); },
    setDraft: (t) => { d.wb.sheets = JSON.parse(t); changed(); },
    onShow: render,
  };
}
