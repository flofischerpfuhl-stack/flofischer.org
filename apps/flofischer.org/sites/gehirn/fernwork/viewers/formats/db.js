// Open · SQLite databases. Real header check (magic, page size, encoding, version); the table contents come from a
// pre-extracted result (samples/kunden.sqlite.json) standing in for the bundled SQLite engine (sql.js) of the real build.
// Tables + views with row counts, sortable/filterable grid, schema, a small SELECT runner, exports named after the table.
import { formatBytes } from '../../kit/shell.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details, alt: ['text', 'hex'] });
const isNum = (t) => /INT|REAL|NUM|FLOA|DOUB|DEC/i.test(t);

export default {
  id: 'db', label: 'Database', asLabel: 'Database (SQLite)', icon: 'database', exts: ['sqlite', 'sqlite3', 'db'],
  listLabel: 'Tables', listIcon: 'table', selIcon: 'list', selHint: 'Click a row to see all of its fields.',
  measureLabel: 'Column summary', measureIcon: 'sigma', measureHint: 'Sort by a number column to see its sum and range.',
  modes: [{ id: 'browse', label: 'Browse', icon: 'table' }, { id: 'schema', label: 'Schema', icon: 'list-tree' }, { id: 'query', label: 'Query', icon: 'code-xml' }],
  steps(d) {
    return [
      { label: 'Loading SQLite engine (bundled · 1.1 MB)', cached: 'SQLite engine ready', engine: 'sqlite', ms: 650 },
      { label: `Reading ${formatBytes(d.size)}`, ms: 320, run: async () => {
        const head = new Uint8Array(await d.file.slice(0, 100).arrayBuffer());
        const magic = new TextDecoder().decode(head.slice(0, 15));
        if (magic !== 'SQLite format 3') throw human(`${d.name} couldn’t be opened`, `It’s ${formatBytes(d.size)} and doesn’t start with the SQLite header, so it’s probably not a database, or it was cut off while copying.`, `Expected “SQLite format 3\\0” at byte 0, found ${JSON.stringify(magic.replace(/[^\x20-\x7e]/g, '·'))}.`);
        const dv = new DataView(head.buffer); const ps = dv.getUint16(16); const enc = dv.getUint32(56); const ver = dv.getUint32(96);
        d.hdr = { pageSize: ps === 1 ? 65536 : ps, pages: dv.getUint32(28), encoding: ['', 'UTF-8', 'UTF-16le', 'UTF-16be'][enc] || 'UTF-8', version: `${Math.floor(ver / 1e6)}.${Math.floor(ver / 1e3) % 1000}.${ver % 1000}` };
      } },
      { label: 'Listing tables, views and row counts', ms: 420, run: async () => {
        const r = await fetch('./samples/kunden.sqlite.json'); d.data = await r.json();
        d.data.tables.sort((a, b) => (a.type === b.type ? 0 : a.type === 'table' ? -1 : 1));
        d.cur = d.data.tables.find((t) => t.name === 'kunden')?.name || d.data.tables[0].name;
        d.st = {}; for (const t of d.data.tables) d.st[t.name] = { sort: null, filter: '', sel: null };
      } },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  list(d, ctx) { return tableList(d, ctx); },
  updateList(d) { d._listEl?.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.t === d.cur))); },
  inspector(d, ctx) {
    const T = cur(d), st = d.st[T.name], nT = d.data.tables.filter((t) => t.type === 'table').length, nV = d.data.tables.length - nT;
    const info = ctx.kv([['Type', 'SQLite database'], ['Engine', `SQLite ${d.hdr.version} · bundled`], ['Contents', `${nT} tables · ${nV} views`], ['Size', `${formatBytes(d.size)} · ${ctx.nf(d.hdr.pages)} pages of ${ctx.nf(d.hdr.pageSize)} bytes`], ['Text', d.hdr.encoding], ['Changes', 'Read-only · the file stays as it is']]);
    let selection = null;
    if (st.sel != null && view(d)[st.sel]) {
      const row = view(d)[st.sel];
      selection = `<div class="ov-seltitle">${ctx.icon('list', { size: 16 })}Row ${st.sel + 1} of ${ctx.nf(view(d).length)}</div>` + ctx.kv(T.columns.map((c, i) => [c.name, row[i] == null ? '<span class="ov-null">empty</span>' : ctx.esc(fmtCell(row[i], c)), isNum(c.type) ? 'ov-num' : ''])) + `<div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="row-copy">${ctx.icon('copy')}Copy as JSON</button></div>`;
    }
    let measure = null;
    const col = st.sort ? T.columns.findIndex((c) => c.name === st.sort.col) : -1;
    if (col >= 0) {
      const c = T.columns[col]; const vals = view(d).map((r) => r[col]).filter((v) => v != null);
      if (isNum(c.type) && vals.length) {
        const sum = vals.reduce((a, b) => a + b, 0); const dp = c.type === 'REAL' ? 2 : 0;
        measure = `<div class="ov-seltitle">${ctx.icon('sigma', { size: 16 })}${ctx.esc(c.name)}</div>` + ctx.kv([['Sum', `<strong>${ctx.nf(sum, dp)}</strong>`, 'ov-num'], ['Average', ctx.nf(sum / vals.length, 2), 'ov-num'], ['Lowest', ctx.nf(Math.min(...vals), dp), 'ov-num'], ['Highest', ctx.nf(Math.max(...vals), dp), 'ov-num'], ['Rows', `${ctx.nf(vals.length)}${vals.length < view(d).length ? ` · ${view(d).length - vals.length} empty` : ''}`]]);
      } else measure = `<div class="ov-seltitle">${ctx.icon('sigma', { size: 16 })}${ctx.esc(c.name)}</div>` + ctx.kv([['Distinct', ctx.nf(new Set(vals).size)], ['Empty', ctx.nf(view(d).length - vals.length)]]);
    }
    return { info, selection, measure };
  },
  bindInspector(d, root, ctx) {
    root.querySelector('#row-copy')?.addEventListener('click', (e) => { const T = cur(d); const r = view(d)[d.st[T.name].sel]; ctx.copyText(JSON.stringify(Object.fromEntries(T.columns.map((c, i) => [c.name, r[i]])), null, 2), e.currentTarget); });
  },
  status(d, ctx) {
    const T = cur(d), st = d.st[T.name]; const n = view(d).length;
    return [`<strong class="ov-strong">${ctx.esc(T.name)}</strong>`, `${ctx.nf(n)}${n !== T.count ? ` of ${ctx.nf(T.count)}` : ''} rows · ${T.columns.length} columns`, st.sort ? `Sorted by ${ctx.esc(st.sort.col)} ${st.sort.dir > 0 ? '↑' : '↓'}` : 'Unsorted', `SQLite ${d.hdr.version} · read-only`];
  },
  exports(d, ctx) {
    const T = cur(d); const n = view(d).length; const base = `${T.name}-${ctx.today()}`;
    return [{ group: 'Data', items: [
      { id: 'csv', label: 'Table as CSV', sub: `${ctx.nf(n)} rows · as sorted`, icon: 'file-spreadsheet', file: `${base}.csv`, onSelect: () => exportTable(d, ctx, 'csv') },
      { label: 'Table as JSON', sub: `${ctx.nf(n)} records`, icon: 'braces', file: `${base}.json`, onSelect: () => exportTable(d, ctx, 'json') },
      { label: 'SQL INSERT statements', sub: 'Paste into another database', icon: 'code-xml', file: `${base}.sql`, onSelect: () => exportTable(d, ctx, 'sql') },
      { label: 'Schema as SQL', sub: `${d.data.tables.length} CREATE statements`, icon: 'list-tree', file: `${ctx.baseName(d.name)}-schema.sql`, onSelect: () => { const s = d.data.tables.map((t) => t.sql + ';').join('\n\n'); const f = `${ctx.baseName(d.name)}-schema.sql`; ctx.download(f, s, 'text/plain'); ctx.toast(`Saved ${f}`); } }] }];
  },
  commands(d, t, ctx) {
    const out = []; let m; const T = cur(d);
    if ((m = t.match(/^(?:sort|order)(?: by)?\s*(.*)$/))) T.columns.filter((c) => !m[1] || c.name.includes(m[1].replace(/\s+/g, '_'))).slice(0, 4).forEach((c) => out.push({ label: `Sort ${T.name} by ${c.name}`, sub: isNum(c.type) ? 'Highest first' : 'A → Z', icon: 'arrow-up-down', run: () => { d.st[T.name].sort = { col: c.name, dir: isNum(c.type) ? -1 : 1 }; d.ctl.render(); ctx.refresh('insp status'); } }));
    if ((m = t.match(/^(?:open |show |table |view )?(.*)$/)) && m[1].length > 1) d.data.tables.filter((x) => x.name.includes(m[1]) && x.name !== T.name).slice(0, 3).forEach((x) => out.push({ label: `Open ${x.type} ${x.name}`, sub: `${ctx.nf(x.count)} rows`, icon: x.type === 'view' ? 'table-view' : 'table', run: () => select(d, ctx, x.name) }));
    if (/^(export|csv|save)/.test(t)) out.push({ label: `Export ${T.name} as CSV`, sub: `${T.name}-${ctx.today()}.csv`, icon: 'download', run: () => exportTable(d, ctx, 'csv') });
    if (/^(sql|query|select)/.test(t)) out.push({ label: 'Write a query', sub: 'SELECT … WHERE … ORDER BY', icon: 'code-xml', run: () => ctx.setMode(d, 'query') });
    return out;
  },
  mobileSlots() {
    return [{ id: 'list', label: 'Tables', icon: 'table' }, { id: 'filter', label: 'Filter', icon: 'filter', run: (d) => { d.el.querySelector('.db-filter input')?.focus(); } }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }];
  },
};
const cur = (d) => d.data.tables.find((t) => t.name === d.cur);
function view(d) { // filtered + sorted rows of the current table (cached)
  const T = cur(d), st = d.st[T.name]; const key = `${T.name}|${st.filter}|${st.sort?.col}|${st.sort?.dir}`;
  if (d._vk === key) return d._v;
  let rows = T.rows;
  if (st.filter) { const q = st.filter.toLowerCase(); rows = rows.filter((r) => r.some((v) => v != null && String(v).toLowerCase().includes(q))); }
  if (st.sort) { const i = T.columns.findIndex((c) => c.name === st.sort.col); const dir = st.sort.dir; rows = [...rows].sort((a, b) => (a[i] == null ? 1 : b[i] == null ? -1 : (a[i] < b[i] ? -1 : a[i] > b[i] ? 1 : 0) * dir)); }
  d._vk = key; d._v = rows; return rows;
}
function fmtCell(v, c) { if (v == null) return ''; if (typeof v === 'number' && c.type === 'REAL') return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: /hoehe|wert/.test(c.name) ? 3 : 2 }); if (typeof v === 'number' && !/id$|^id|plz/.test(c.name)) return v.toLocaleString('en-US'); return String(v); }
function select(d, ctx, name) { d.cur = name; d.ctl.render(); d.fmt.updateList(d); ctx.refresh('insp status frame'); }

function tableList(d, ctx) {
  const T = d.data.tables.filter((t) => t.type === 'table'), V = d.data.tables.filter((t) => t.type === 'view');
  const row = (t) => `<button class="ov-row" type="button" data-t="${ctx.esc(t.name)}" aria-current="${t.name === d.cur}"><span class="ov-row__icon">${ctx.icon(t.type === 'view' ? 'table-view' : 'table', { size: 16 })}</span><span class="ov-row__name">${ctx.esc(t.name)}</span><span class="ov-row__n">${ctx.nf(t.count)}</span></button>`;
  const el = ctx.h(`<div class="ov-listpanel" data-roving-v>
    <div class="ov-listhead"><span class="ov-listhead__title">Tables</span><span class="ov-listhead__count">${T.length}</span></div><div class="ov-rows">${T.map(row).join('')}</div>
    <div class="ov-listhead ov-listhead--sub"><span class="ov-listhead__title">Views</span><span class="ov-listhead__count">${V.length}</span></div><div class="ov-rows">${V.map(row).join('')}</div></div>`);
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) select(d, ctx, b.dataset.t); });
  el.addEventListener('keydown', (e) => { if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; const bs = [...el.querySelectorAll('[data-t]')]; const i = bs.indexOf(document.activeElement); if (i < 0) return; e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); });
  d._listEl = el; return el;
}

function mountView(d, el, ctx) {
  el.classList.add('db');
  el.innerHTML = `<div class="db-browse"></div><div class="db-schema"></div><div class="db-query"></div>`;
  const browse = el.querySelector('.db-browse'), schema = el.querySelector('.db-schema'), query = el.querySelector('.db-query');
  let shown = 0, io = null;
  function grid(T, rows, { sortable = true, st } = {}) {
    const sortCol = st?.sort?.col, dir = st?.sort?.dir;
    return `<div class="db-gridwrap" tabindex="0" aria-label="${ctx.esc(T.name)} rows"><table class="db-grid"><thead><tr><th class="db-rn" scope="col"><span class="fw-sr">Row</span></th>${T.columns.map((c) => `<th scope="col" class="${isNum(c.type) ? 'is-num' : ''}" ${sortable ? `aria-sort="${c.name === sortCol ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${sortable ? `<button type="button" class="db-sort" data-col="${ctx.esc(c.name)}">` : '<span class="db-sort">'}<span class="db-colname" title="${ctx.esc(c.name)} · ${ctx.esc(c.type)}">${ctx.esc(c.name)}</span>${c.name === sortCol ? ctx.icon(dir > 0 ? 'arrow-up' : 'arrow-down', { size: 14 }) : sortable ? `<span class="db-sorthint">${ctx.icon('arrow-up-down', { size: 14 })}</span>` : ''}${sortable ? '</button>' : '</span>'}</th>`).join('')}</tr></thead><tbody></tbody></table><div class="db-more" aria-hidden="true"></div></div>`;
  }
  function rowsHtml(T, rows, from, to, st) {
    let s = '';
    for (let i = from; i < Math.min(to, rows.length); i++) s += `<tr data-r="${i}" ${st?.sel === i ? 'aria-selected="true"' : ''}><td class="db-rn">${i + 1}</td>${T.columns.map((c, k) => { const v = rows[i][k]; return `<td class="${isNum(c.type) ? 'is-num' : ''}${v == null ? ' is-null' : ''}">${v == null ? 'empty' : ctx.esc(fmtCell(v, c))}</td>`; }).join('')}</tr>`;
    return s;
  }
  function renderBrowse() {
    const T = cur(d), st = d.st[T.name]; const rows = view(d);
    browse.innerHTML = `<div class="db-bar"><div class="db-title">${ctx.icon(T.type === 'view' ? 'table-view' : 'table', { size: 18 })}<h2>${ctx.esc(T.name)}</h2><span class="fw-badge">${T.type}</span></div>
      <span class="db-meta">${ctx.nf(rows.length)}${rows.length !== T.count ? ` of ${ctx.nf(T.count)}` : ''} rows · ${T.columns.length} columns</span><span class="fw-spacer"></span>
      <label class="fw-inputwrap db-filter">${ctx.icon('filter')}<input class="fw-input" type="search" placeholder="Filter rows" aria-label="Filter rows of ${ctx.esc(T.name)}" value="${ctx.esc(st.filter)}"></label></div>
      ${rows.length ? grid(T, rows, { st }) : `<div class="fw-empty db-noresult"><div class="fw-empty__icon">${ctx.icon('search-x')}</div><div class="fw-empty__title">No rows contain “${ctx.esc(st.filter)}”</div><button class="fw-btn fw-btn--sm" type="button" data-clearf>Clear filter</button></div>`}`;
    ctx.enhance(browse);
    const tb = browse.querySelector('tbody'); shown = 0;
    const more = () => { if (!tb || shown >= rows.length) return; tb.insertAdjacentHTML('beforeend', rowsHtml(T, rows, shown, shown + 150, st)); shown += 150; };
    more();
    io?.disconnect(); const sent = browse.querySelector('.db-more');
    if (sent) { io = new IntersectionObserver((es) => { if (es[0].isIntersecting) more(); }, { root: browse.querySelector('.db-gridwrap'), rootMargin: '400px' }); io.observe(sent); }
    const inp = browse.querySelector('.db-filter input'); let ft = 0;
    inp.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => { st.filter = inp.value; st.sel = null; const pos = inp.selectionStart; renderBrowse(); const ni = browse.querySelector('.db-filter input'); ni.focus(); ni.setSelectionRange(pos, pos); ctx.refresh('insp status'); }, 140); });
    browse.querySelector('[data-clearf]')?.addEventListener('click', () => { st.filter = ''; renderBrowse(); ctx.refresh('insp status'); });
    browse.querySelector('thead')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-col]'); if (!b) return; const c = T.columns.find((x) => x.name === b.dataset.col);
      const first = isNum(c.type) ? -1 : 1;
      st.sort = st.sort?.col !== c.name ? { col: c.name, dir: first } : st.sort.dir === first ? { col: c.name, dir: -first } : null;
      st.sel = null; renderBrowse(); browse.querySelector(`[data-col="${CSS.escape(c.name)}"]`)?.focus(); ctx.refresh('insp status');
    });
    tb?.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-r]'); if (!tr) return; st.sel = +tr.dataset.r; tb.querySelectorAll('[aria-selected]').forEach((x) => x.removeAttribute('aria-selected')); tr.setAttribute('aria-selected', 'true'); ctx.refresh('insp'); if (ctx.isMobile()) ctx.infoSheet(d, null); });
  }
  function renderSchema() {
    schema.innerHTML = `<div class="db-schemawrap">${d.data.tables.map((T) => `<section class="db-card ${T.name === d.cur ? 'is-cur' : ''}"><header class="db-card__head">${ctx.icon(T.type === 'view' ? 'table-view' : 'table', { size: 16 })}<h3>${ctx.esc(T.name)}</h3><span class="db-meta">${ctx.nf(T.count)} rows</span></header>
      <table class="db-cols"><tbody>${T.columns.map((c) => `<tr><td>${ctx.esc(c.name)}</td><td class="db-type">${ctx.esc(c.type)}</td><td>${T.pk?.includes(c.name) ? '<span class="fw-badge fw-badge--accent">key</span>' : ''}</td></tr>`).join('')}</tbody></table>
      <details class="db-sql"><summary>CREATE statement</summary><pre>${ctx.esc(T.sql)}</pre></details></section>`).join('')}</div>`;
  }
  let qState = { sql: `SELECT name, ort, umsatz_eur\nFROM kunden\nWHERE ort = 'Baunatal'\nORDER BY umsatz_eur DESC\nLIMIT 20`, res: null, err: null };
  function renderQuery() {
    query.innerHTML = `<div class="db-qbar"><label class="fw-field db-qfield"><span class="fw-field__label">SQL</span><textarea class="fw-textarea fw-input--mono db-sqlin" rows="5" spellcheck="false" aria-label="SQL query">${ctx.esc(qState.sql)}</textarea></label>
      <div class="db-qactions"><button class="fw-btn fw-btn--primary fw-btn--sm" type="button" data-run>${ctx.icon('play')}Run</button><span class="fw-t-xs fw-faint">${ctx.kbd('mod+enter')}</span></div></div>
      <div class="db-qres">${qState.err ? `<div class="fw-alert fw-alert--danger">${ctx.icon('circle-alert')}<div class="fw-alert__body"><strong>${ctx.esc(qState.err.title)}</strong><span>${ctx.esc(qState.err.hint)}</span></div></div>` : qState.res ? `<p class="db-meta">${ctx.nf(qState.res.rows.length)} rows · ${qState.res.ms.toFixed(1)} ms</p>` + grid(qState.res.T, qState.res.rows, { sortable: false }) : ''}</div>`;
    const ta = query.querySelector('textarea');
    const run = () => { qState.sql = ta.value; const t0 = performance.now(); try { const r = runSQL(d, ta.value); qState = { ...qState, res: { ...r, ms: performance.now() - t0 }, err: null }; } catch (e) { qState = { ...qState, err: e, res: null }; } renderQuery(); };
    query.querySelector('[data-run]').onclick = run;
    ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
    const tb = query.querySelector('tbody'); if (tb && qState.res) tb.innerHTML = rowsHtml(qState.res.T, qState.res.rows, 0, 500);
  }
  function render() { if (d.mode === 'schema') renderSchema(); else if (d.mode === 'query') { if (!qState.res && !qState.err) { try { const t0 = performance.now(); const r = runSQL(d, qState.sql); qState.res = { ...r, ms: performance.now() - t0 }; } catch { /* */ } } renderQuery(); } else renderBrowse(); el.dataset.mode = d.mode; }
  render();
  return {
    render, setMode: () => render(),
    step: (dir) => { const i = d.data.tables.findIndex((t) => t.name === d.cur); select(d, ctx, d.data.tables[(i + dir + d.data.tables.length) % d.data.tables.length].name); },
    destroy: () => io?.disconnect(),
  };
}

// Minimal SELECT runner for the mockup (the real build runs SQLite itself).
function runSQL(d, sql) {
  const s = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const m = /^select (.+?) from (\w+)(?: where (.+?))?(?: order by (\w+)(?: (asc|desc))?)?(?: limit (\d+))?$/i.exec(s);
  if (!m) throw { title: 'This preview runs simple SELECT queries', hint: 'Try: SELECT name, ort FROM kunden WHERE umsatz_eur > 5000 ORDER BY umsatz_eur DESC LIMIT 10' };
  const T = d.data.tables.find((t) => t.name.toLowerCase() === m[2].toLowerCase());
  if (!T) throw { title: `There is no table called “${m[2]}”`, hint: `Tables here: ${d.data.tables.map((t) => t.name).join(', ')}` };
  const idx = (n) => { const i = T.columns.findIndex((c) => c.name.toLowerCase() === n.toLowerCase()); if (i < 0) throw { title: `${T.name} has no column “${n}”`, hint: `Columns: ${T.columns.map((c) => c.name).join(', ')}` }; return i; };
  const cols = m[1].trim() === '*' ? T.columns.map((_, i) => i) : m[1].split(',').map((c) => idx(c.trim()));
  let rows = T.rows;
  if (m[3]) {
    const conds = m[3].split(/ and /i).map((c) => { const k = /^(\w+)\s*(=|!=|<>|<=|>=|<|>| like )\s*(.+)$/i.exec(c.trim()); if (!k) throw { title: `Can’t read the condition “${c.trim()}”`, hint: 'Use column = value, column > number or column LIKE \'%text%\'' }; let v = k[3].trim(); v = /^'.*'$/.test(v) ? v.slice(1, -1) : +v; return [idx(k[1]), k[2].trim().toLowerCase(), v]; });
    rows = rows.filter((r) => conds.every(([i, op, v]) => { const x = r[i]; if (op === 'like') return String(x ?? '').toLowerCase().includes(String(v).replace(/%/g, '').toLowerCase()); if (op === '=') return x == v; if (op === '!=' || op === '<>') return x != v; if (op === '<') return x < v; if (op === '>') return x > v; if (op === '<=') return x <= v; return x >= v; }));
  }
  if (m[4]) { const i = idx(m[4]); const dir = (m[5] || 'asc').toLowerCase() === 'desc' ? -1 : 1; rows = [...rows].sort((a, b) => (a[i] < b[i] ? -1 : a[i] > b[i] ? 1 : 0) * dir); }
  if (m[6]) rows = rows.slice(0, +m[6]);
  return { T: { name: 'result', columns: cols.map((i) => T.columns[i]) }, rows: rows.map((r) => cols.map((i) => r[i])) };
}
function exportTable(d, ctx, kind) {
  const T = cur(d); const rows = view(d); const base = `${T.name}-${ctx.today()}`; let s, type;
  if (kind === 'csv') { s = '﻿' + [T.columns.map((c) => c.name), ...rows].map((r) => r.map((v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n'); type = 'text/csv'; }
  else if (kind === 'json') { s = JSON.stringify(rows.map((r) => Object.fromEntries(T.columns.map((c, i) => [c.name, r[i]]))), null, 2); type = 'application/json'; }
  else { s = rows.map((r) => `INSERT INTO ${T.name} (${T.columns.map((c) => c.name).join(', ')}) VALUES (${r.map((v) => (v == null ? 'NULL' : typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`)).join(', ')});`).join('\n'); type = 'text/plain'; }
  const name = `${base}.${kind}`; ctx.download(name, s, type);
  ctx.toast(`Saved ${name} · ${ctx.nf(rows.length)} rows`);
}
