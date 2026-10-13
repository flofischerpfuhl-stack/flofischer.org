// Convert mockup · Table Converter (today's "Tables" tab): XLSX, XLS, ODS, CSV, TSV, JSON, NDJSON in → XLSX, ODS, CSV,
// TSV, JSON, NDJSON, HTML table out. Converts on drop. Workbooks with several sheets get a sheet choice on the card when
// the target holds one sheet (CSV, TSV, JSON, NDJSON); XLSX, ODS and HTML keep every sheet. More options: "Read files as".
import { frame, renderRelated, pickFormat, targetBtn, moreBtn, clearBtn, moreOptions, field, select, Queue, HumanError, describeBroken,
  stickyBar, stickyHtml, intakeHtml, slimIntakeHtml, base, plural, icon, esc, $, store, toast, enhance, formatBytes, A } from './common.js';
import { readXlsx, readOds, writeXlsx, writeOds } from './officeio.js';
import { parseDelimited, detectDelimiter } from './dataconv.js';
import { makeZip } from './zip.js';

const FORMATS = [
  { label: 'Spreadsheet', items: [['xlsx', 'XLSX', 'Excel, keeps every sheet'], ['ods', 'ODS', 'LibreOffice Calc, keeps every sheet']] },
  { label: 'One sheet', items: [['csv', 'CSV', 'Opens anywhere'], ['tsv', 'TSV', 'Tab-separated'], ['json', 'JSON', 'One object per row'], ['ndjson', 'NDJSON', 'One JSON object per line']] },
  { label: 'Web', items: [['html', 'HTML table', 'For web pages and email']] },
];
const NAME = Object.fromEntries(FORMATS.flatMap((g) => g.items.map(([id, n]) => [id, n])));
const MULTI = new Set(['xlsx', 'ods', 'html']);
const READ_AS = [['auto', 'Auto-detect (from the file name)'], ['xlsx', 'XLSX'], ['xls', 'XLS'], ['ods', 'ODS'], ['csv', 'CSV'], ['tsv', 'TSV'], ['json', 'JSON'], ['ndjson', 'NDJSON / JSONL']];
const ACCEPT = '.xlsx,.xls,.ods,.csv,.tsv,.json,.ndjson,.jsonl';
const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', ndjson: 'application/x-ndjson', html: 'text/html' };

export function init(ctx) {
  let target = ctx.preset?.to || store.get('cv-target-tables') || 'csv';
  let picked = !!(ctx.preset || store.get('cv-target-tables'));
  const o = { readAs: 'auto' };

  $('#cv-tool').innerHTML = `
    <div class="cv-bar"><span class="cv-bar__label"><span class="xs-hide">Convert to</span><span class="xs-show">To</span></span>${targetBtn('cv-target', NAME[target])}<span class="cv-bar__hint" id="cv-hint"></span>
      ${moreBtn()}<span class="fw-spacer"></span>${clearBtn()}</div>
    <div class="cv-opts" id="cv-opts" hidden></div>
    <div id="cv-intake">${intakeHtml({ icon: 'sheet', title: ctx.preset ? `Drop ${ctx.preset.noun} here` : 'Drop spreadsheets here', touch: ctx.preset ? `Choose ${ctx.preset.noun}` : 'Choose spreadsheets',
      sub: ctx.preset ? 'Any spreadsheet works' : 'XLSX, XLS, ODS, CSV, TSV, JSON, NDJSON', accept: ACCEPT,
      samples: ctx.preset && /^(csv)/.test(ctx.preset.id) ? `${A}customers.csv` : `${A}budget-2026.xlsx|${A}customers.csv` })}</div>
    <div class="fw-items cv-items" id="cv-items" aria-label="Spreadsheets" hidden></div>
    <div id="cv-add" hidden>${slimIntakeHtml('Add more spreadsheets', ACCEPT)}</div>`;
  $('#main').insertAdjacentHTML('beforeend', stickyHtml());
  frame(ctx, { accept: ['sheet', 'data'], onFiles: (f) => add(f), lede: ctx.preset ? `Convert ${ctx.preset.noun} to ${NAME[ctx.preset.to]}. Any spreadsheet works.` : undefined,
    commands: [{ id: 'dl', label: 'Download all converted tables', icon: 'download', kbd: 'mod+s', run: () => $('#ab-primary').click() }] });
  enhance($('#cv-tool'));
  renderRelated(ctx);

  const fmtOf = (it) => { const e = o.readAs !== 'auto' ? o.readAs : it.ext === 'jsonl' ? 'ndjson' : it.ext; return e; };
  const q = new Queue({
    list: $('#cv-items'), parallel: 2, deltas: false,
    thumb: (it) => icon(it.status === 'error' ? 'file-question' : 'file-spreadsheet', { size: 20 }),
    meta: (it) => {
      const parts = [`<span>${formatBytes(it.size)}</span>`];
      if (it.wb) parts.push(`<span>${it.wb.sheets.length > 1 ? `${it.wb.sheets.length} sheets` : `${Math.max(0, (it.wb.sheets[0]?.rows.length || 1) - 1)} rows`}</span>`);
      if (it.status !== 'error') parts.push(`<span>${esc(fmtOf(it).toUpperCase())} → ${esc(NAME[target])}</span>`);
      return parts.join('<span aria-hidden="true">·</span>');
    },
    panel: (it, el) => {
      if (it.status === 'error' || !it.wb || it.wb.sheets.length < 2 || MULTI.has(target)) return false;
      el.innerHTML = `<div class="cv-sheet"><label for="sh-${it.id}">${esc(NAME[target])} holds one sheet:</label>
        <select class="fw-select" id="sh-${it.id}">${it.wb.sheets.map((s, i) => `<option value="${i}" ${String(it.sheet) === String(i) ? 'selected' : ''}>${esc(s.name)} · ${Math.max(0, s.rows.length - 1)} rows</option>`).join('')}
        <option value="all" ${it.sheet === 'all' ? 'selected' : ''}>All sheets · one file each (ZIP)</option></select></div>`;
      el.querySelector('select').onchange = (e) => { it.sheet = e.target.value === 'all' ? 'all' : +e.target.value; q.requeue(it); };
      return true;
    },
    work: async (it, { progress, alive }) => {
      progress(10, '');
      if (!it.wb) it.wb = await read(it);
      q.render(it);
      if (!alive()) return null;
      progress(55, '');
      await new Promise((r) => setTimeout(r, 300 + Math.min(900, it.size / 40)));
      const sheets = it.wb.sheets;
      if (MULTI.has(target)) {
        const blob = target === 'xlsx' ? await writeXlsx(it.wb) : target === 'ods' ? await writeOds(it.wb) : new Blob([htmlTables(sheets)], { type: MIME.html });
        return { blob, name: `${base(it.name)}.${target}`, note: sheets.length > 1 ? `All ${sheets.length} sheets kept.` : '' };
      }
      if (it.sheet === 'all' && sheets.length > 1) {
        const zip = await makeZip(sheets.map((s) => ({ name: `${base(it.name)}-${s.name}.${target}`, blob: writeOne(s.rows) })));
        return { blob: zip, name: `${base(it.name)}-sheets.zip`, note: `${sheets.length} sheets, one ${NAME[target]} each.` };
      }
      const s = sheets[it.sheet || 0];
      return { blob: writeOne(s.rows), name: sheets.length > 1 ? `${base(it.name)}-${s.name}.${target}` : `${base(it.name)}.${target}`, note: sheets.length > 1 ? `Sheet “${s.name}” of ${sheets.length}.` : '' };
    },
    onChange: () => paint(),
  });
  const paintBar = stickyBar(q, { noun: ['spreadsheet', 'spreadsheets'], zipStem: (done) => (done.length > 1 ? 'converted-tables' : base(done[0].name)) });

  async function read(it) {
    const f = fmtOf(it);
    try {
      if (f === 'xlsx') return await readXlsx(it.file);
      if (f === 'ods') return await readOds(it.file);
      if (f === 'csv' || f === 'tsv') { const t = await text(it.file); return { sheets: [{ name: 'Sheet1', rows: parseDelimited(t, f === 'tsv' ? '\t' : detectDelimiter(t) || ',') }] }; }
      if (f === 'json' || f === 'ndjson') {
        const t = await text(it.file); const v = f === 'json' ? JSON.parse(t) : t.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
        const arr = Array.isArray(v) ? v : [v]; const keys = [...new Set(arr.flatMap((x) => (x && typeof x === 'object' ? Object.keys(x) : ['value'])))];
        return { sheets: [{ name: 'Sheet1', rows: [keys, ...arr.map((x) => keys.map((k) => { const c = x && typeof x === 'object' ? x[k] : x; return c == null ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c); }))] }] };
      }
      if (f === 'xls') throw new HumanError('Old .xls files are read by SheetJS in the real build; this mockup reads XLSX, ODS, CSV, TSV and JSON.', { short: 'Not in mockup' });
      throw new HumanError(`Can't read .${f} as a table. Pick the format under More options → Read files as.`, { short: "Can't read" });
    } catch (e) {
      if (e.human) throw e;
      throw new HumanError(await describeBroken(it.file, `a ${f.toUpperCase()} spreadsheet`), { detail: String(e.message || e), actions: [] });
    }
  }
  const text = async (file) => { const b = await file.arrayBuffer(); try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); } };
  function writeOne(rows) {
    if (target === 'csv' || target === 'tsv') { const d = target === 'tsv' ? '\t' : ','; const c = (v) => { const s = String(v ?? ''); return s.includes(d) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return new Blob([rows.map((r) => r.map(c).join(d)).join('\n') + '\n'], { type: MIME[target] }); }
    const [head = [], ...body] = rows; const num = (v) => (/^-?\d+(\.\d+)?$/.test(String(v)) && !/^-?0\d/.test(String(v)) ? Number(v) : v ?? '');
    const recs = body.map((r) => Object.fromEntries(head.map((k, i) => [k || `Column ${i + 1}`, num(r[i])])));
    return new Blob([target === 'json' ? JSON.stringify(recs, null, 2) + '\n' : recs.map((x) => JSON.stringify(x)).join('\n') + '\n'], { type: MIME[target] });
  }
  const xe = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const htmlTables = (sheets) => `<!doctype html>\n<html><head><meta charset="utf-8"><title>Tables</title></head><body>\n${sheets.map((s) => `<h2>${xe(s.name)}</h2>\n<table border="1">\n${s.rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${xe(c)}</td>` : `<th>${xe(c)}</th>`)).join('')}</tr>`).join('\n')}\n</table>`).join('\n')}\n</body></html>\n`;

  function add(files) {
    const ok = files.filter((f) => /\.(xlsx|xls|ods|csv|tsv|json|ndjson|jsonl)$/i.test(f.name));
    if (ok.length < files.length) toast(`${plural(files.length - ok.length, 'file', 'files')} skipped: not a spreadsheet`, { type: 'warning' });
    if (!ok.length) return;
    if (!picked && !q.items.length) {
      const toSheet = ok.every((f) => /\.(csv|tsv|json|ndjson|jsonl)$/i.test(f.name));
      target = toSheet ? 'xlsx' : 'csv'; $('#cv-hint').textContent = toSheet ? 'suggested · numbers stay numbers in Excel' : ''; paintTarget(false);
    }
    q.add(ok, { sheet: 0 });
    $('#cv-intake').hidden = true; $('#cv-items').hidden = false; $('#cv-add').hidden = false;
  }
  function paintTarget(requeue = true) { $('#cv-target [data-l]').textContent = NAME[target]; if (requeue) q.items.forEach((it) => it.status !== 'error' && q.requeue(it)); }
  $('#cv-target').onclick = (e) => pickFormat(e.currentTarget, { groups: FORMATS, current: target, onPick: (f) => { if (f === target) return; target = f; picked = true; $('#cv-hint').textContent = ''; store.set('cv-target-tables', f); paintTarget(); } });
  $('#cv-clear').onclick = () => q.clear();
  const more = moreOptions({
    button: $('.cv-more'), panel: $('#cv-opts'),
    summary: () => (o.readAs !== 'auto' ? `read as ${o.readAs.toUpperCase()}` : ''),
    render: (p) => {
      p.innerHTML = `<div class="cv-opts__grid"><div class="cv-opts__group">${field('Read files as', select('o-read', READ_AS, o.readAs), { id: 'o-read', hint: 'Only needed when a file has the wrong extension.' })}</div></div>`;
      p.querySelector('#o-read').onchange = (e) => { o.readAs = e.target.value; more.paint(); q.items.forEach((it) => { it.wb = null; q.requeue(it); }); };
    },
  });
  function paint() {
    const n = q.items.length; $('#cv-clear').hidden = !n;
    if (!n) { $('#cv-intake').hidden = false; $('#cv-items').hidden = true; $('#cv-add').hidden = true; }
    paintBar();
  }
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('#cv-ab').hidden) { e.preventDefault(); $('#ab-primary').click(); } });
  paint();
}
