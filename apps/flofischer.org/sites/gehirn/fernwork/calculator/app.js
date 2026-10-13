// Calc Paper · Fernwork Calculator mockup (archetype A, Workbench).
// A notebook where every line evaluates live (results in a right gutter) + a split graph pane.
import {
  mountShell, $, $$, esc, h, icon, kbd, toast, openMenu, openDialog, openPopover, copyText, store, isMobile, isCoarse,
  isTyping, hasLayers, pushLayer, enhance, navigate, effectiveTheme,
} from '../kit/shell.js';
import { ICONS } from '../kit/icons.js';
import { evaluateSheet, lex, pretty, fmtNumber } from './engine.js';
import { Graph } from './graph.js';

// ── extra Lucide icons (ISC), registered at runtime; listed under "Kit additions" ──
Object.assign(ICONS, {
  'chart-spline': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7"/>',
  'table-2': '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>',
  'notebook': '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/>',
  'delete': '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>',
  'wand-sparkles': '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  'crosshair': '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  'radical': '<path d="M3 12h3l3 8 4-16h8"/>',
});

// ── state ──
const params = new URLSearchParams(location.search);
if (/^(de|en)$/.test(params.get('fmt') || '')) store.set('calc:numfmt', params.get('fmt'));
const DEFAULT_FMT = store.get('calc:numfmt') || (/^de/i.test(navigator.language) ? 'de' : 'en');
const uid = () => Math.random().toString(36).slice(2, 9);
const H = 3600e3;
function seedSheets() {
  const t = Date.now();
  return [
    { id: 'scratch', name: 'Scratch', updated: t - 0.2 * H, lines: ['price = 1.200', 'vat = 19%', 'price * (1 + vat)', '5 km in mi', 'f(x) = x^3/10 - x', 'g(x) = sin(x)', 'f(2,5)', 'sin(pi/6', ''] },
    { id: 'budget', name: 'Flat budget', updated: t - 26 * H, lines: ['# Monthly flat costs', 'rent = 1.150', 'power = 64,50', 'internet = 39,99', 'sum', 'Per person: line5 / 2', '', 'Deposit: 3 * rent', '19% of 1.200'] },
    { id: 'physics', name: 'Physics homework', updated: t - 3 * 24 * H, angle: 'deg', lines: ['# Projectile, 12 m/s at 35°', 'v = 12', 'k = 35', 'flight = 2 * v * sin(k) / 9,81', 'range = v^2 * sin(2 * k) / 9,81', 'h(x) = tan(k) * x - 9,81 * x^2 / (2 * v^2 * cos(k)^2)', 'asin(0,5)'] },
    { id: 'kitchen', name: 'Kitchen', updated: t - 6 * 24 * H, lines: ['250 g in oz', '180 °C in °F', '3 cups in ml', '2 h + 30 min in min', '1,5 * 400 g'] },
  ].map((s) => ({ angle: 'rad', fmt: DEFAULT_FMT, view: null, colors: {}, hidden: {}, graph: 'auto', gw: 48, table: false, ...s }));
}
let sheets = store.get('calc:sheets');
if (!Array.isArray(sheets) || !sheets.length || params.has('reset')) sheets = seedSheets();
let sheet = sheets.find((s) => s.id === (params.get('sheet') || store.get('calc:current'))) || sheets[0];

// handoffs: ?q= (command bar "Open in Calculator", Units "Calculate with this") and #paper= share links
const q = params.get('q');
if (q) {
  const empty = sheets.find((s) => s.name.startsWith('Untitled') && !s.lines.some((l) => l.trim()));
  sheet = empty || newSheetObj();
  sheet.lines = [q.trim(), ''];
  if (!empty) sheets.unshift(sheet);
}
if (location.hash.startsWith('#paper=')) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7).replace(/-/g, '+').replace(/_/g, '/')))));
    sheet = { ...newSheetObj(), name: data.n || 'Shared sheet', lines: data.l || [''], angle: data.a || 'rad', fmt: data.f || DEFAULT_FMT };
    sheets.unshift(sheet);
    setTimeout(() => toast(`Opened “${sheet.name}” from a link · now in your sheets`, { type: 'info' }), 600);
  } catch { /* bad link: ignore */ }
}
if (params.has('leaf') && params.get('leaf') === 'percentage' && !q) {
  sheet = sheets.find((s) => s.id === 'percent') || { ...newSheetObj(), id: 'percent', name: 'Percentages', lines: ['19% of 1.200', '1.200 + 19%', '1.428 - 19%', '50 / 200 * 100', ''] };
  if (!sheets.includes(sheet)) sheets.unshift(sheet);
}
if (q || location.hash || params.has('leaf') || params.has('sheet') || params.has('reset') || params.has('fmt')) history.replaceState(null, '', location.pathname);
function newSheetObj() {
  let n = 1; while (sheets.some((s) => s.name === `Untitled ${n}`)) n++;
  return { id: uid(), name: n === 1 && !sheets.some((s) => s.name === 'Untitled') ? 'Untitled' : `Untitled ${n}`, lines: [''], angle: 'rad', fmt: store.get('calc:numfmt') || DEFAULT_FMT, view: null, colors: {}, hidden: {}, graph: 'auto', gw: 48, table: false, updated: Date.now() };
}

let active = Math.max(0, sheet.lines.length - 1);
let ev = null;                 // last evaluation
let traceX = null;             // graph trace → paper gutter
let typingAt = 0;              // errors wait until you pause
let padTab = 'n';              // mobile keypad tab
const mobile = () => isMobile();

// ── shell ──
const shell = mountShell({
  leaf: 'calculator', archetype: 'workbench',
  accept: ['text'], acceptLabel: 'Calc Paper',
  onFiles: async (files) => { const t = await files[0].text(); importText(t, files[0].name.replace(/\.\w+$/, '')); },
  onPasteText: (t) => { insertAtCaret(t); return true; },
  shortcuts: [
    { label: 'New line (split at cursor)', keys: 'enter' }, { label: 'Copy this line’s result', keys: 'mod+enter' },
    { label: 'Copy “line = result”', keys: 'shift+mod+c' }, { label: 'Apply quick fix', keys: 'mod+.' },
    { label: 'Duplicate line', keys: 'mod+d' }, { label: 'Show or hide the graph', keys: 'mod+g' },
    { label: 'Export graph as PNG', keys: 'mod+s' }, { label: 'Graph: pan / zoom / fit', keys: '← → + − F' },
  ],
  recent: { note: sheet.name },
});
document.title = 'Calculator · Fernwork';

// ── layout ──
$('#main').innerHTML = `
<div class="fw-workbench cp" id="wb">
  <div class="fw-framebar cp-framebar" role="toolbar" aria-label="Sheet" id="framebar"></div>
  <div class="fw-wb-main" id="wb-main">
    <div class="fw-stage cp-stage" id="stage">
      <div class="cp-split" id="split">
        <section class="cp-paper" id="paper" aria-label="Calc Paper">
          <div class="cp-lines" id="lines"></div>
          <div class="cp-ghosts" id="ghosts" hidden></div>
        </section>
        <div class="cp-resizer" id="resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize graph" aria-valuemin="25" aria-valuemax="75"></div>
        <section class="cp-graphpane" id="graphpane" aria-label="Graph">
          <div class="cp-gbar" id="gbar"></div>
          <div class="cp-gwrap" id="gwrap">
            <div class="cp-g" id="graph"></div>
            <div class="fw-zoom cp-zoom" role="group" aria-label="Zoom">
              <button class="fw-iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="-" data-z="-1">${icon('minus')}</button>
              <button class="fw-zoom__pct" type="button" id="zpct" aria-label="Zoom level">100 %</button>
              <button class="fw-iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+" data-z="1">${icon('plus')}</button>
              <span class="fw-divider-v"></span>
              <button class="cp-fit" type="button" id="zfit" data-tip="Fit all curves" data-tip-kbd="f">Fit</button>
            </div>
          </div>
          <div class="cp-sliders" id="sliders" hidden></div>
          <div class="cp-table" id="table" hidden></div>
        </section>
      </div>
    </div>
  </div>
  <div class="fw-statusbar" id="status"></div>
  <div class="cp-pad" id="pad"></div>
</div>`;

const graph = new Graph($('#graph'), {
  fmt: sheet.fmt, angle: sheet.angle,
  onView: (v) => { sheet.view = v; $('#zpct').textContent = `${graph.zoomPct()} %`; saveSoon(); if (sheet.table) renderTable(); },
  onTrace: (t) => { traceX = t ? t.x : null; paintTrace(); },
});
graph.setView(sheet.view);

// ── evaluation + rendering ──
function evaluate() {
  ev = evaluateSheet(sheet.lines, { angle: sheet.angle, fmt: sheet.fmt });
  // colours: stable per plot key, first free series slot
  const keys = ev.plots.map((p) => p.key).concat(ev.results.filter((r) => r.plot).map((r) => r.plot.key));
  const used = new Set(keys.filter((k) => k in sheet.colors).map((k) => sheet.colors[k]));
  for (const k of keys) if (!(k in sheet.colors)) { let i = 0; while (used.has(i)) i++; sheet.colors[k] = i % 8; used.add(i); }
  for (const r of ev.results) if (r.plot) { r.plot.color = seriesColor(sheet.colors[r.plot.key]); r.plot.hidden = !!sheet.hidden[r.plot.key]; r.plot.text = pretty(sheet.lines[r.plot.line]); }
  return ev;
}
const seriesColor = (i) => getComputedStyle(document.documentElement).getPropertyValue(`--series-${(i % 8) + 1}`).trim();

function rowHtml(i) {
  return `<div class="cp-line" data-i="${i}">
    <div class="cp-gut"><span class="cp-num">${i + 1}</span></div>
    <div class="cp-edit"><div class="cp-hl" aria-hidden="true"><div class="cp-hl__in"></div></div>
      <input class="cp-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="enter" aria-label="Line ${i + 1}"></div>
    <div class="cp-res"></div>
    <div class="cp-notes"></div></div>`;
}
function syncRows() {
  const box = $('#lines');
  while (box.children.length < sheet.lines.length) box.insertAdjacentHTML('beforeend', rowHtml(box.children.length));
  while (box.children.length > sheet.lines.length) box.lastElementChild.remove();
  [...box.children].forEach((row, i) => {
    const inp = row.querySelector('.cp-input');
    if (inp.value !== sheet.lines[i]) inp.value = sheet.lines[i];
    inp.inputMode = mobile() && padTab !== 'abc' ? 'none' : 'text';
  });
}
function render() {
  evaluate();
  syncRows();
  const rows = $$('#lines .cp-line');
  rows.forEach((row, i) => paintRow(row, i));
  renderGhosts(); renderGraphSide(); renderStatus(); renderDisplay();
}
function paintRow(row, i) {
  const r = ev.results[i], src = sheet.lines[i];
  const isActive = i === active;
  row.classList.toggle('is-active', isActive);
  row.className = row.className.replace(/\bcp-line--\w+/g, '').trim() + ` cp-line--${r.kind}`;
  const quiet = isActive && Date.now() - typingAt < 650; // don't shout while the user is mid-typing
  const showErr = r.kind === 'error' && !quiet && !(isActive && r.error?.typing);
  // gutter: number or swatch
  const gut = row.querySelector('.cp-gut');
  if (r.plot) {
    const hid = !!sheet.hidden[r.plot.key];
    const want = `sw:${r.plot.key}:${hid}:${r.plot.color}`;
    if (gut.dataset.k !== want) {
      gut.dataset.k = want;
      gut.innerHTML = `<button class="cp-swatch ${hid ? 'is-off' : ''}" type="button" style="--c:${r.plot.color}" aria-pressed="${!hid}" aria-label="${hid ? 'Show' : 'Hide'} ${esc(r.plot.label)} on the graph" data-tip="${hid ? 'Show on graph' : 'Hide on graph'}" data-key="${esc(r.plot.key)}"></button>`;
    }
  } else if (gut.dataset.k !== 'n' + i) { gut.dataset.k = 'n' + i; gut.innerHTML = `<span class="cp-num">${i + 1}</span>`; }
  // highlight overlay
  const inp = row.querySelector('.cp-input');
  const ph = isActive && !src ? (mobile() ? 'Tap keys to calculate' : 'Type a calculation…') : '';
  if (inp.placeholder !== ph) inp.placeholder = ph;
  inp.tabIndex = isActive ? 0 : -1; // one tab stop for the paper; ↑/↓ move between lines
  const inner = row.querySelector('.cp-hl__in');
  inner.innerHTML = highlight(src, r, showErr, isActive ? caretPos(row) : -1);
  // result gutter
  const res = row.querySelector('.cp-res');
  let html = '';
  if (r.kind === 'plot') html = `<span class="cp-fnres" data-trace>${traceHtml(r)}</span>`;
  else if (r.kind === 'error' && r.error?.preview) html = `<span class="cp-val cp-val--preview" title="Value once the bracket is closed">${esc(r.error.preview)}</span>`;
  else if (r.kind === 'error') html = showErr ? `<span class="cp-errdot" aria-hidden="true">${icon('circle-alert', { size: 14 })}</span>` : '';
  else if (r.text && r.kind !== 'fn') {
    const ref = r.name || `line${i + 1}`;
    html = `<button class="fw-iconbtn fw-iconbtn--sm cp-copy" type="button" aria-label="Copy ${esc(r.copy)}" data-tip="Copy" data-tip-kbd="mod+enter" data-i="${i}">${icon('copy')}</button>
      <button class="cp-val ${r.units ? 'cp-val--unit' : ''}" type="button" data-i="${i}" data-ref="${esc(ref)}" aria-label="${esc(r.copy)}. Insert ${esc(ref)} into the current line"${!isCoarse() ? ` data-tip="Click to use as ${esc(ref)}"` : ''}>${r.units ? `${esc(r.num)}<small>${esc(r.unit)}</small>` : esc(r.text)}</button>`;
  } else if (r.kind === 'fn') html = `<span class="cp-fnres">ƒ</span>`;
  if (res.dataset.h !== html) {
    const was = res.querySelector('.cp-val')?.textContent;
    res.innerHTML = html; res.dataset.h = html;
    const now = res.querySelector('.cp-val');
    if (now && was !== now.textContent && !was) now.classList.add('is-new');
  }
  res.querySelectorAll('button').forEach((b) => { b.tabIndex = isActive ? 0 : -1; });
  const swb = gut.querySelector('button'); if (swb) swb.tabIndex = isActive ? 0 : -1;
  // notes: error (with quick fix), locale echo, slider hint
  const notes = [];
  if (showErr) {
    const e = r.error, soft = e.soft;
    notes.push(`<div class="cp-note cp-note--${soft ? 'warn' : 'err'}" role="status">${icon(soft ? 'triangle-alert' : 'circle-alert', { size: 14 })}
      <span class="cp-note__msg">${esc(e.msg)}</span>${e.detail ? `<span class="cp-note__detail">${esc(e.detail)}</span>` : ''}
      ${e.fix ? `<button class="cp-fix" type="button" data-fix="${i}">${icon('wand-sparkles', { size: 14 })}${esc(e.fix.label)}${isActive && !isCoarse() ? `<span class="cp-fix__kbd">${kbd('mod+.')}</span>` : ''}</button>` : ''}
      ${e.raw ? `<details class="cp-note__raw"><summary>Details</summary><code>${esc(e.raw)}</code></details>` : ''}</div>`);
  }
  if (r.echo && r.kind !== 'error') notes.push(`<div class="cp-note cp-note--echo">${icon('languages', { size: 14 })}<span>Read as <code>${esc(r.echo)}</code></span><button class="cp-link" type="button" data-fmt>${sheet.fmt === 'de' ? 'German numbers' : 'English numbers'}</button></div>`);
  if (r.hint && !quiet) notes.push(`<div class="cp-note cp-note--hint">${icon('sliders-horizontal', { size: 14 })}<span class="cp-note__msg">${esc(r.hint.msg)}</span><button class="cp-fix" type="button" data-hint="${i}">${icon('plus', { size: 14 })}${esc(r.hint.fix.label)}</button></div>`);
  const nb = row.querySelector('.cp-notes');
  const nh = notes.join('');
  if (nb.dataset.h !== nh) { nb.innerHTML = nh; nb.dataset.h = nh; }
}
function traceHtml(r) {
  if (r.plot.free.length) return `<span class="cp-muted">needs ${esc(r.plot.free[0])}</span>`;
  if (traceX == null || sheet.hidden[r.plot.key]) return `<span class="cp-muted">${sheet.hidden[r.plot.key] ? 'hidden' : 'on graph'}</span>`;
  const p = ev.plots.find((x) => x.key === r.plot.key);
  const y = p ? p.f(traceX) : NaN;
  return `<span class="cp-muted">${r.plot.name === 'y' ? 'y' : `${esc(r.plot.name)}(${graph.num(traceX, 2)})`} =</span> <b>${graph.num(y, 4)}</b>`;
}
function paintTrace() { $$('#lines .cp-line').forEach((row, i) => { const r = ev.results[i]; if (r?.kind === 'plot') { const el = row.querySelector('[data-trace]'); if (el) el.innerHTML = traceHtml(r); } }); }

function highlight(src, r, showErr, caret) {
  const L = lex(src, ev.known);
  const cls = new Array(src.length).fill(''); const ch = {};
  for (const t of L.toks) for (let k = t.s; k < t.e; k++) cls[k] = t.c;
  for (const t of L.toks) if (t.ch && t.ch !== src[t.s]) ch[t.s] = t.ch;
  const err = new Array(src.length).fill('');
  if (showErr && r.error?.at) for (let k = r.error.at[0]; k < Math.min(src.length, r.error.at[1]); k++) err[k] = r.error.soft ? 'w' : 'e';
  // matching bracket at the caret
  const match = new Set();
  if (caret >= 0) {
    for (const k of [caret - 1, caret]) {
      if (src[k] === '(' || src[k] === ')') {
        const dir = src[k] === '(' ? 1 : -1; let d = 0;
        for (let j = k; j >= 0 && j < src.length; j += dir) { if (src[j] === '(') d += dir > 0 ? 1 : -1; if (src[j] === ')') d += dir > 0 ? -1 : 1; if (d === 0) { match.add(k); match.add(j); break; } }
        break;
      }
    }
  }
  let out = '', i = 0;
  while (i < src.length) {
    let j = i + 1;
    const key = (k) => `${cls[k]}|${err[k]}|${match.has(k)}|${ch[k] ? k : ''}`;
    while (j < src.length && key(j) === key(i) && !ch[j] && !ch[i]) j++;
    const text = ch[i] ? ch[i] : src.slice(i, j);
    const c = [cls[i] && `t-${cls[i]}`, err[i] === 'w' && 'is-warn', err[i] === 'e' && 'is-err', match.has(i) && 'is-match'].filter(Boolean).join(' ');
    out += c ? `<span class="${c}">${esc(text)}</span>` : esc(text);
    i = j;
  }
  if (showErr && r.error?.soft && r.error.fix?.apply?.startsWith(src.replace(/\s*$/, ''))) out += `<span class="cp-ghostclose">${esc(r.error.fix.apply.slice(src.replace(/\s*$/, '').length))}</span>`;
  return out || '&#8203;';
}
const caretPos = (row) => { const inp = row.querySelector('.cp-input'); return document.activeElement === inp ? inp.selectionStart : -1; };

function renderGhosts() {
  const g = $('#ghosts');
  const filled = sheet.lines.filter((l) => l.trim()).length;
  const show = filled < 3;
  g.hidden = !show;
  if (!show || g.dataset.on) return;
  g.dataset.on = '1';
  const ex = sheet.fmt === 'de' ? ['2^10 * 3', '19% of 1.200', '5 km in mi', 'f(x) = x^2 - 2', '180 °C in °F'] : ['2^10 * 3', '19% of 1,200', '5 km in mi', 'f(x) = x^2 - 2', '180 °C in °F'];
  g.innerHTML = `<span class="cp-ghosts__label">Try</span>${ex.map((e) => `<button class="fw-chip cp-ghost" type="button" data-ex="${esc(e)}">${esc(pretty(e))}</button>`).join('')}`;
}
$('#ghosts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ex]'); if (!b) return;
  remember('struct');
  const empty = sheet.lines.findIndex((l, i) => !l.trim() && i >= active) ;
  let at = empty >= 0 ? empty : sheet.lines.length;
  if (at === sheet.lines.length) sheet.lines.push('');
  sheet.lines[at] = b.dataset.ex;
  if (at === sheet.lines.length - 1) sheet.lines.push('');
  active = at + 1; changed(); focusLine(active, 0);
});

// ── graph side: legend, sliders, table ──
function renderGraphSide() {
  const plots = ev.results.filter((r) => r.plot).map((r) => r.plot);
  const drawable = ev.plots;
  const want = sheet.graph === 'on' || (sheet.graph === 'auto' && plots.length > 0);
  const split = $('#split');
  if (split.classList.contains('has-graph') !== want) {
    split.classList.toggle('has-graph', want);
    if (want && !sheet.view) setTimeout(() => graph.fit(false), 260);
  }
  split.style.setProperty('--gw', `${sheet.gw}%`);
  $('#t-graph')?.setAttribute('aria-pressed', String(want));
  graph.setFmt(sheet.fmt); graph.setAngle(sheet.angle);
  graph.setPlots(drawable.map((p) => ({ ...p, f: p.f })));
  // legend
  const gb = $('#gbar');
  const lh = plots.map((p) => `<button class="cp-legend" type="button" aria-pressed="${!sheet.hidden[p.key]}" data-key="${esc(p.key)}" style="--c:${p.color}" data-tip="${sheet.hidden[p.key] ? 'Show' : 'Hide'}"><i></i><span>${esc(p.text)}</span></button>`).join('');
  const html = `<div class="cp-legends" role="group" aria-label="Curves">${lh || '<span class="cp-muted cp-t-sm">No curves yet</span>'}</div>
    ${sheet.angle === 'deg' ? '<span class="fw-badge cp-degbadge" data-tip="sin, cos and tan read degrees">Trig in degrees</span>' : ''}
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-table" aria-pressed="${!!sheet.table}" aria-label="Value table" data-tip="Value table">${icon('table-2')}</button>`;
  if (gb.dataset.h !== html) { gb.innerHTML = html; gb.dataset.h = html; }
  // sliders
  const sl = $('#sliders');
  sl.hidden = !ev.sliders.length;
  const ids = ev.sliders.map((s) => s.name).join(',');
  if (sl.dataset.ids !== ids) {
    sl.dataset.ids = ids;
    sl.innerHTML = ev.sliders.map((s) => {
      const span = Math.max(5, Math.ceil(Math.abs(s.value) * 2));
      return `<div class="fw-slider cp-slider" data-name="${esc(s.name)}"><label class="fw-slider__label" for="sl-${esc(s.name)}"><span class="cp-mono">${esc(s.name)}</span></label><output class="fw-slider__value cp-mono"></output>
        <input id="sl-${esc(s.name)}" type="range" min="${-span}" max="${span}" step="0.1" value="${s.value}" data-line="${s.line}"></div>`;
    }).join('');
  }
  $$('.cp-slider', sl).forEach((d) => {
    const s = ev.sliders.find((x) => x.name === d.dataset.name); if (!s) return;
    const inp = d.querySelector('input'); inp.dataset.line = s.line;
    if (document.activeElement !== inp) inp.value = s.value;
    d.querySelector('output').textContent = fmtNumber(+inp.value, sheet.fmt);
    inp.style.setProperty('--p', `${((inp.value - inp.min) / (inp.max - inp.min)) * 100}%`);
  });
  if (sheet.table) renderTable(); else $('#table').hidden = true;
}
$('#gbar').addEventListener('click', (e) => {
  const l = e.target.closest('.cp-legend'); if (l) return toggleHidden(l.dataset.key);
  if (e.target.closest('#t-table')) { sheet.table = !sheet.table; save(); render(); }
});
$('#sliders').addEventListener('input', (e) => {
  const inp = e.target.closest('input[type=range]'); if (!inp) return;
  const line = +inp.dataset.line, name = inp.closest('.cp-slider').dataset.name;
  if (!inp._rem) { remember('struct'); inp._rem = true; }
  const v = Math.round(+inp.value * 10) / 10;
  sheet.lines[line] = `${name} = ${fmtNumber(v, sheet.fmt).replace(/[.,](?=\d{3})/g, '')}`;
  changed({ fast: true });
});
$('#sliders').addEventListener('change', (e) => { const inp = e.target.closest('input'); if (inp) inp._rem = false; });
function toggleHidden(key) {
  sheet.hidden[key] = !sheet.hidden[key]; if (!sheet.hidden[key]) delete sheet.hidden[key];
  save(); render();
}

function renderTable() {
  const t = $('#table'); t.hidden = false;
  const vis = ev.plots.filter((p) => !p.hidden);
  if (!vis.length) { t.innerHTML = `<div class="cp-table__empty cp-muted">Plot a function to see its values.</div>`; return; }
  const v = graph.getView();
  const r = v ? graph.range() : { x0: -5, x1: 5 };
  const step = sheet.tstep || niceStep((r.x1 - r.x0) / 20);
  const start = Math.ceil(((r.x0 + r.x1) / 2 - step * 10) / step) * step;
  const xs = Array.from({ length: 21 }, (_, i) => +(start + i * step).toPrecision(12));
  const n = (x) => graph.num(x, 4);
  t.innerHTML = `<div class="cp-table__bar"><span class="cp-table__title">Values</span>
      <label class="cp-table__step">Step <input class="fw-input fw-input--mono" id="tstep" inputmode="decimal" value="${esc(n(step))}" aria-label="Step"></label>
      <span class="fw-spacer"></span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="tcsv">${icon('copy')}Copy CSV</button></div>
    <div class="fw-table-wrap cp-table__wrap"><table class="fw-table"><thead><tr><th class="is-num">x</th>${vis.map((p) => `<th class="is-num"><i class="cp-dot" style="--c:${p.color}"></i>${esc(p.label)}</th>`).join('')}</tr></thead>
    <tbody>${xs.map((x) => `<tr data-x="${x}"><td class="is-num is-mono">${n(x)}</td>${vis.map((p) => `<td class="is-num is-mono">${n(p.f(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  t.querySelector('#tstep').onchange = (e) => { const s = parseFloat(e.target.value.replace(',', '.')); sheet.tstep = s > 0 ? s : null; save(); renderTable(); };
  t.querySelector('#tcsv').onclick = (e) => copyText(['x,' + vis.map((p) => p.label).join(','), ...xs.map((x) => [x, ...vis.map((p) => +p.f(x).toPrecision(10))].join(','))].join('\n'), e.currentTarget, { toastLabel: `${xs.length} rows as CSV` });
  t.querySelectorAll('tbody tr').forEach((tr) => {
    tr.onpointerenter = () => { graph.markX = +tr.dataset.x; graph.render(); };
    tr.onpointerleave = () => { graph.markX = null; graph.render(); };
  });
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); for (const k of [1, 2, 5]) if (k * p >= raw) return k * p; return 10 * p; }

// resizer
(() => {
  const rz = $('#resizer'); let drag = null;
  rz.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, w: $('#split').getBoundingClientRect().width, gw: sheet.gw }; rz.setPointerCapture(e.pointerId); document.body.classList.add('cp-resizing'); });
  rz.addEventListener('pointermove', (e) => { if (!drag) return; sheet.gw = Math.max(25, Math.min(72, drag.gw - ((e.clientX - drag.x) / drag.w) * 100)); $('#split').style.setProperty('--gw', `${sheet.gw}%`); rz.setAttribute('aria-valuenow', Math.round(sheet.gw)); });
  rz.addEventListener('pointerup', () => { drag = null; document.body.classList.remove('cp-resizing'); save(); });
  rz.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); sheet.gw = Math.max(25, Math.min(72, sheet.gw + (e.key === 'ArrowLeft' ? 4 : -4))); $('#split').style.setProperty('--gw', `${sheet.gw}%`); save(); } });
})();
$$('.cp-zoom [data-z]').forEach((b) => (b.onclick = () => { graph.userView = true; graph.zoomBy(+b.dataset.z > 0 ? 1.25 : 0.8); }));
$('#zpct').onclick = () => { graph.userView = true; graph.fit(); };
$('#zfit').onclick = () => { graph.userView = true; graph.fit(); };

// ── frame bar ──
function framebar() {
  $('#framebar').innerHTML = `
    <button class="fw-filechip cp-sheetchip" type="button" id="sheetchip" aria-haspopup="menu" aria-expanded="false" data-tip="Sheets">
      <span class="fw-filechip__thumb">${icon('notebook', { size: 14 })}</span><span class="fw-filechip__name" id="sheetname">${esc(sheet.name)}</span>${icon('chevron-down', { size: 14 })}</button>
    <span class="fw-divider-v fw-hide-compact"></span>
    <div class="fw-seg fw-seg--sm cp-angle" aria-label="Angle unit" id="angle">
      <button class="fw-seg__opt" type="button" aria-checked="${sheet.angle === 'rad'}" data-value="rad" data-tip="Radians, for paper and graph">RAD</button>
      <button class="fw-seg__opt" type="button" aria-checked="${sheet.angle === 'deg'}" data-value="deg" data-tip="Degrees, for paper and graph">DEG</button></div>
    <button class="cp-fmtchip fw-hide-compact" type="button" id="fmtchip" aria-haspopup="menu" data-tip="Number format">${sheet.fmt === 'de' ? '1.234,5' : '1,234.5'}${icon('chevron-down', { size: 12 })}</button>
    <span class="fw-spacer"></span>
    <div class="fw-framebar__group fw-hide-compact">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z">${icon('undo-2')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z">${icon('redo-2')}</button></div>
    <span class="fw-divider-v fw-hide-compact"></span>
    <button class="fw-iconbtn fw-iconbtn--sm cp-graphbtn" type="button" id="t-graph" aria-pressed="false" aria-label="Graph" data-tip="Graph" data-tip-kbd="mod+g">${icon('chart-spline')}</button>
    <button class="fw-btn fw-btn--primary fw-btn--sm fw-hide-compact" type="button" id="cp-export" aria-haspopup="menu">${icon('download')}Export${icon('chevron-down', { size: 14 })}</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cp-more" aria-label="More" data-tip="More">${icon('ellipsis')}</button>`;
  enhance($('#framebar'));
  $('#angle').addEventListener('fw-change', (e) => setAngle(e.detail.value));
  $('#sheetchip').onclick = (e) => sheetMenu(e.currentTarget);
  $('#fmtchip').onclick = (e) => fmtMenu(e.currentTarget);
  $('#undo').onclick = () => undoStep(); $('#redo').onclick = () => redoStep();
  $('#t-graph').onclick = () => toggleGraph();
  $('#cp-export').onclick = (e) => exportMenu(e.currentTarget);
  $('#cp-more').onclick = (e) => moreMenu(e.currentTarget);
}
function setAngle(a) {
  if (sheet.angle === a) return;
  sheet.angle = a; save();
  $$('#angle .fw-seg__opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === a)));
  $$('.cp-mangle .fw-seg__opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === a)));
  render();
  toast(a === 'deg' ? 'Degrees: sin(90) = 1, on paper and graph' : 'Radians: sin(pi/2) = 1, on paper and graph', { type: 'info', duration: 2200 });
}
function toggleGraph(force) {
  if (mobile()) return openMobileGraph();
  const on = $('#split').classList.contains('has-graph');
  sheet.graph = force ?? (on ? 'off' : 'on'); save(); render();
}
function sheetMenu(anchor) {
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const count = (s) => s.lines.filter((l) => l.trim()).length;
  openMenu(anchor, [
    { group: 'Sheets · saved on this device', items: sheets.slice().sort((a, b) => b.updated - a.updated).map((s) => ({ label: s.name, sub: `${count(s)} line${count(s) === 1 ? '' : 's'} · ${ago(s.updated)}`, checked: s === sheet, onSelect: () => switchSheet(s) })) },
    { items: [
      { label: 'New sheet', icon: 'file-plus', kbd: 'alt+n', onSelect: () => newSheet() },
      { label: 'Rename…', icon: 'pencil', onSelect: () => renameSheet() },
      { label: 'Duplicate', icon: 'copy', onSelect: () => { const c = JSON.parse(JSON.stringify(sheet)); c.id = uid(); c.name = sheet.name + ' copy'; c.updated = Date.now(); sheets.unshift(c); switchSheet(c); toast(`Duplicated as “${c.name}”`); } },
      { label: 'Delete sheet', icon: 'trash-2', danger: true, onSelect: () => deleteSheet() },
    ] },
  ], { placement: 'bottom-start' });
}
function switchSheet(s) {
  if (s === sheet) return;
  sheet.view = graph.getView(); save();
  sheet = s; active = Math.max(0, sheet.lines.length - 1); undo.length = 0; redo.length = 0;
  store.set('calc:current', sheet.id);
  $('#sheetname').textContent = sheet.name;
  $$('#angle .fw-seg__opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === sheet.angle)));
  $('#fmtchip').innerHTML = `${sheet.fmt === 'de' ? '1.234,5' : '1,234.5'}${icon('chevron-down', { size: 12 })}`;
  $('#lines').innerHTML = ''; $('#ghosts').dataset.on = ''; $('#sliders').dataset.ids = '';
  graph.pins = []; graph.setView(sheet.view);
  render(); focusLine(active);
}
function newSheet() { const s = newSheetObj(); sheets.unshift(s); switchSheet(s); }
function renameSheet() {
  const d = openDialog({ title: 'Rename sheet', size: 400, body: `<div class="fw-field"><label class="fw-field__label" for="rn">Name</label><input class="fw-input" id="rn" value="${esc(sheet.name)}" autofocus></div>`,
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Rename', primary: true, onClick: () => { const v = $('#rn').value.trim(); if (v) { sheet.name = v; $('#sheetname').textContent = v; save(); } } }], initialFocus: '#rn' });
  d.el.querySelector('#rn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); d.el.querySelector('.fw-btn--primary').click(); } });
}
function deleteSheet() {
  const old = sheet, idx = sheets.indexOf(old);
  sheets.splice(idx, 1); if (!sheets.length) sheets.push(newSheetObj());
  switchSheet(sheets[0]);
  toast(`Deleted “${old.name}”`, { type: 'neutral', action: { label: 'Undo', onClick: () => { sheets.splice(idx, 0, old); switchSheet(old); } } });
}
function fmtMenu(anchor) {
  openMenu(anchor, [{ group: 'Number format', items: [
    { label: 'German · 1.234,5', sub: '1.000 means one thousand', checked: sheet.fmt === 'de', onSelect: () => setFmt('de') },
    { label: 'English · 1,234.5', sub: '1.000 means one', checked: sheet.fmt === 'en', onSelect: () => setFmt('en') },
  ] }], { placement: 'bottom-start' });
}
function setFmt(f) {
  sheet.fmt = f; store.set('calc:numfmt', f); save();
  $('#fmtchip').innerHTML = `${f === 'de' ? '1.234,5' : '1,234.5'}${icon('chevron-down', { size: 12 })}`;
  $('#ghosts').dataset.on = ''; render(); renderPad();
}
function exportMenu(anchor) {
  const base = slug(sheet.name);
  const hasPlot = ev.plots.length > 0;
  openMenu(anchor, [
    { group: 'Graph', items: [
      { label: 'PNG image', icon: 'image', hint: '2×', onSelect: () => exportPNG() },
      { label: 'SVG vector', icon: 'file-code', onSelect: () => exportSVG() },
      { label: 'Copy image', icon: 'copy', onSelect: () => copyImage() },
    ].map((x) => (hasPlot ? x : { ...x, sub: 'Plot a function first', onSelect: () => toast('Nothing on the graph yet. Add a line with x, like f(x) = x^2', { type: 'info' }) })) },
    { group: 'Sheet', items: [
      { label: 'Copy link', icon: 'link', sub: 'The sheet travels inside the link', onSelect: () => copyLink() },
      { label: `${base}.txt`, icon: 'file-text', sub: 'Lines with results', onSelect: () => download(`${base}.txt`, new Blob([sheetText()], { type: 'text/plain' })) },
      { label: 'Markdown table', icon: 'hash', onSelect: () => copyText(sheetMd(), null, { toastLabel: 'sheet as Markdown' }) },
    ] },
  ], { placement: 'bottom-end' });
}
function moreMenu(anchor) {
  const r = ev.results[active];
  openMenu(anchor, [
    { items: [
      ...(mobile() ? [{ label: 'Export…', icon: 'download', onSelect: () => exportMenu(anchor) }, { label: sheet.fmt === 'de' ? 'Numbers: German 1.234,5' : 'Numbers: English 1,234.5', icon: 'languages', onSelect: () => setFmt(sheet.fmt === 'de' ? 'en' : 'de') }] : []),
      { label: 'Open this line in Units', icon: 'ruler', sub: r?.units ? sheet.lines[active] : 'For lines like “5 km in mi”', onSelect: () => { if (r?.units) navigate('units', { query: { q: sheet.lines[active] } }); else toast('This line has no unit conversion', { type: 'info' }); } },
      { label: 'Duplicate line', icon: 'copy', kbd: 'mod+d', onSelect: () => duplicateLine() },
      { label: 'Clear sheet', icon: 'eraser', onSelect: () => clearSheet() },
      { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', onSelect: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) },
    ] },
  ], { placement: 'bottom-end' });
}
function clearSheet() {
  remember('struct'); const old = sheet.lines.slice();
  sheet.lines = ['']; active = 0; changed(); focusLine(0);
  toast('Sheet cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { sheet.lines = old; active = old.length - 1; changed(); } } });
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet';
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
function exportPNG() {
  const c = graph.toCanvas(2);
  c.toBlob((b) => { download(`${slug(sheet.name)}-graph.png`, b); toast(`Saved ${slug(sheet.name)}-graph.png · ${c.width} × ${c.height}`); }, 'image/png');
}
function exportSVG() { download(`${slug(sheet.name)}-graph.svg`, new Blob([graph.toSVG()], { type: 'image/svg+xml' })); toast(`Saved ${slug(sheet.name)}-graph.svg · vector`); }
async function copyImage() {
  const c = graph.toCanvas(2);
  try { const b = await new Promise((r) => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Copied the graph as an image'); }
  catch { toast('Your browser blocked image copy. Use PNG instead.', { type: 'warning' }); }
}
function copyLink() {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify({ n: sheet.name, l: sheet.lines, a: sheet.angle, f: sheet.fmt })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = `${location.origin}${location.pathname}#paper=${data}`;
  copyText(url, null);
  toast('Link copied · opens this sheet, nothing is uploaded', { type: 'success' });
}
function sheetText() { return sheet.lines.map((l, i) => { const r = ev.results[i]; return r?.text && r.kind !== 'plot' ? `${l}  = ${r.text}` : l; }).join('\n'); }
function sheetMd() { return `| # | Line | Result |\n|---|---|---|\n` + sheet.lines.map((l, i) => l.trim() ? `| ${i + 1} | \`${l.replace(/\|/g, '\\|')}\` | ${ev.results[i]?.text || ''} |` : '').filter(Boolean).join('\n'); }
function importText(t, name) {
  const s = { ...newSheetObj(), name: name || 'Imported', lines: t.split(/\r?\n/).map((l) => l.replace(/\s+=\s+[^=]*$/, '')).slice(0, 500) };
  sheets.unshift(s); switchSheet(s); toast(`Opened ${s.lines.length} lines as “${s.name}”`);
}

// ── status bar ──
function renderStatus() {
  const vals = ev.results.filter((r) => r.value != null).length, nplots = ev.plots.length, errs = ev.results.filter((r, i) => r.kind === 'error' && !(i === active && Date.now() - typingAt < 650)).length;
  $('#status').innerHTML = `<span class="fw-statusbar__item">Line ${active + 1} of ${sheet.lines.length}</span>
    <span class="fw-statusbar__item">${vals} result${vals === 1 ? '' : 's'}</span>
    ${nplots ? `<span class="fw-statusbar__item">${icon('chart-spline', { size: 12 })}${nplots} curve${nplots === 1 ? '' : 's'}</span>` : ''}
    ${errs ? `<button class="fw-statusbar__item cp-st-err" type="button" id="st-err">${icon('circle-alert', { size: 12 })}${errs} to fix</button>` : ''}
    <span class="fw-statusbar__item">${sheet.angle.toUpperCase()}</span>
    <span class="fw-statusbar__item">${sheet.fmt === 'de' ? 'German numbers' : 'English numbers'}</span>
    <span class="fw-statusbar__item fw-statusbar__save"><span class="fw-dotlive"></span>Saved on this device</span>`;
  $('#st-err')?.addEventListener('click', () => { const i = ev.results.findIndex((r) => r.kind === 'error'); if (i >= 0) focusLine(i); });
}

// ── persistence ──
let saveT = 0;
function save() { sheet.updated = Date.now(); try { store.set('calc:sheets', sheets); store.set('calc:current', sheet.id); } catch { /* quota */ } }
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }

// ── undo (one stack for typing, keypad, fixes, sliders, line ops) ──
const undo = [], redo = []; let lastKind = '', lastAt = 0, lastLine = -1;
const snap = () => ({ lines: sheet.lines.slice(), active, caret: curInput()?.selectionStart ?? 0 });
function remember(kind) {
  const now = Date.now();
  if (kind === 'type' && lastKind === 'type' && now - lastAt < 900 && lastLine === active) { lastAt = now; return; }
  undo.push(snap()); if (undo.length > 300) undo.shift(); redo.length = 0; lastKind = kind; lastAt = now; lastLine = active;
}
function restore(s) { sheet.lines = s.lines.slice(); active = Math.min(s.active, sheet.lines.length - 1); changed(); focusLine(active, s.caret); }
function undoStep() { const s = undo.pop(); if (!s) return; redo.push(snap()); lastKind = ''; restore(s); }
function redoStep() { const s = redo.pop(); if (!s) return; undo.push(snap()); lastKind = ''; restore(s); }

// ── editing ──
const rowEl = (i) => $(`#lines .cp-line[data-i="${i}"]`) || $$('#lines .cp-line')[i];
const curInput = () => $$('#lines .cp-input')[active];
let raf = 0;
function changed({ fast } = {}) {
  saveSoon();
  if (fast) { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); return; }
  render();
}
function focusLine(i, caret) {
  active = Math.max(0, Math.min(i, sheet.lines.length - 1));
  syncRows();
  const inp = $$('#lines .cp-input')[active]; if (!inp) return;
  inp.inputMode = mobile() && padTab !== 'abc' ? 'none' : 'text';
  inp.focus({ preventScroll: true });
  const c = caret == null ? inp.value.length : Math.min(caret, inp.value.length);
  inp.setSelectionRange(c, c);
  inp.closest('.cp-line').scrollIntoView({ block: 'nearest' });
  $$('#lines .cp-line').forEach((r, k) => paintRow(r, k));
  renderStatus(); renderDisplay();
}
function syncScroll(inp) { const hl = inp.parentElement.querySelector('.cp-hl__in'); hl.style.transform = `translateX(${-inp.scrollLeft}px)`; }

const lines = $('#lines');
lines.addEventListener('beforeinput', (e) => { if (e.target.matches('.cp-input')) remember('type'); });
lines.addEventListener('input', (e) => {
  const inp = e.target.closest('.cp-input'); if (!inp) return;
  const i = +inp.closest('.cp-line').dataset.i;
  active = i; sheet.lines[i] = inp.value; typingAt = Date.now();
  changed(); syncScroll(inp);
  clearTimeout(lines._t); lines._t = setTimeout(() => { $$('#lines .cp-line').forEach((r, k) => paintRow(r, k)); renderStatus(); renderDisplay(); }, 700);
});
lines.addEventListener('focusin', (e) => {
  const inp = e.target.closest('.cp-input'); if (!inp) return;
  const i = +inp.closest('.cp-line').dataset.i;
  if (i !== active) { active = i; $$('#lines .cp-line').forEach((r, k) => paintRow(r, k)); renderStatus(); renderDisplay(); }
});
document.addEventListener('selectionchange', () => {
  const inp = document.activeElement; if (!inp?.matches?.('.cp-input')) return;
  syncScroll(inp);
  const row = inp.closest('.cp-line'); const i = +row.dataset.i;
  if (ev?.results[i]) row.querySelector('.cp-hl__in').innerHTML = highlight(sheet.lines[i], ev.results[i], ev.results[i].kind === 'error' && Date.now() - typingAt >= 650, inp.selectionStart);
});
lines.addEventListener('keydown', (e) => {
  const inp = e.target.closest('.cp-input'); if (!inp) return;
  const i = +inp.closest('.cp-line').dataset.i; const mod = e.metaKey || e.ctrlKey;
  const s = inp.selectionStart, end = inp.selectionEnd;
  if (e.key === 'Enter' && mod) { e.preventDefault(); copyResult(i, rowEl(i)?.querySelector('.cp-val')); return; }
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); splitLine(i, s, end); return; }
  if (e.key === 'Backspace' && s === 0 && end === 0 && i > 0 && !mod) {
    e.preventDefault(); remember('struct');
    const prev = sheet.lines[i - 1]; sheet.lines[i - 1] = prev + sheet.lines[i]; sheet.lines.splice(i, 1);
    changed(); focusLine(i - 1, prev.length); return;
  }
  if (e.key === 'Delete' && s === inp.value.length && end === s && i < sheet.lines.length - 1) {
    e.preventDefault(); remember('struct');
    sheet.lines[i] += sheet.lines[i + 1]; sheet.lines.splice(i + 1, 1); changed(); focusLine(i, s); return;
  }
  if (e.key === 'ArrowUp' && !mod && !e.shiftKey && i > 0) { e.preventDefault(); focusLine(i - 1, s); return; }
  if (e.key === 'ArrowDown' && !mod && !e.shiftKey) { e.preventDefault(); if (i < sheet.lines.length - 1) focusLine(i + 1, s); return; }
  if (mod && e.key === '.') { e.preventDefault(); applyFix(i); return; }
  if (mod && (e.key === 'd' || e.key === 'D') && !e.shiftKey) { e.preventDefault(); duplicateLine(); return; }
  if (mod && e.shiftKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); const r = ev.results[i]; if (r?.copy) copyText(`${sheet.lines[i]} = ${r.copy}`, null, { toastLabel: `${pretty(sheet.lines[i])} = ${r.copy}` }); return; }
  if (mod && !e.shiftKey && (e.key === 'c' || e.key === 'C') && s === end) { const r = ev.results[i]; if (r?.copy) { e.preventDefault(); copyResult(i); } return; }
  if (e.key === 'Escape') { /* never deletes; leave the line alone */ }
});
lines.addEventListener('scroll', (e) => { if (e.target.matches?.('.cp-input')) syncScroll(e.target); }, true);
function splitLine(i, s, end) {
  remember('struct');
  const v = sheet.lines[i];
  sheet.lines[i] = v.slice(0, s); sheet.lines.splice(i + 1, 0, v.slice(end));
  changed(); focusLine(i + 1, 0);
  rowEl(i + 1)?.classList.add('is-born');
}
function duplicateLine() { remember('struct'); sheet.lines.splice(active + 1, 0, sheet.lines[active]); changed(); focusLine(active + 1); }
function insertAtCaret(text) {
  const inp = curInput(); if (!inp) return;
  if (document.activeElement !== inp) { inp.focus({ preventScroll: true }); }
  remember('type');
  if (!document.execCommand('insertText', false, text)) { const s = inp.selectionStart; inp.setRangeText(text, s, inp.selectionEnd, 'end'); inp.dispatchEvent(new Event('input', { bubbles: true })); }
}
function applyFix(i) {
  const r = ev.results[i];
  if (r?.error?.fix) {
    const fx = r.error.fix; remember('struct');
    if (fx.apply != null) { sheet.lines[i] = fx.apply; typingAt = 0; changed(); focusLine(i); flashRow(i); }
    else if (fx.kind === 'define') { sheet.lines.splice(i, 0, `${fx.name} = `); active = i; changed(); focusLine(i); }
    return true;
  }
  if (r?.hint?.fix) { addSlider(i, r.hint.fix.name); return true; }
  return false;
}
function addSlider(i, name) {
  remember('struct');
  sheet.lines.splice(i, 0, `${name} = 1`); typingAt = 0;
  changed(); focusLine(i + 1);
  setTimeout(() => $(`.cp-slider[data-name="${name}"]`)?.classList.add('is-born'), 30);
}
function flashRow(i) { const r = rowEl(i); if (!r) return; r.classList.remove('is-fixed'); void r.offsetWidth; r.classList.add('is-fixed'); }
function copyResult(i, el) {
  const r = ev.results[i]; if (!r?.copy) return;
  copyText(r.copy, null);
  const v = el || rowEl(i)?.querySelector('.cp-val');
  if (v) { v.classList.remove('is-flash'); void v.offsetWidth; v.classList.add('is-flash'); }
  const cb = rowEl(i)?.querySelector('.cp-copy');
  if (cb) { cb.innerHTML = icon('check'); cb.classList.add('is-copied'); setTimeout(() => { cb.innerHTML = icon('copy'); cb.classList.remove('is-copied'); }, 1500); }
  toast(`Copied ${r.copy}`, { duration: mobile() ? 1500 : 2000 });
}
// results: click inserts a reference (desktop), tap copies (touch); ⧉ copies; notes: fixes
lines.addEventListener('pointerdown', (e) => { if (e.target.closest('.cp-val, .cp-copy, .cp-fix, .cp-swatch, .cp-link') && !isCoarse()) e.preventDefault(); });
lines.addEventListener('click', (e) => {
  const cp = e.target.closest('.cp-copy'); if (cp) return copyResult(+cp.dataset.i);
  const val = e.target.closest('.cp-val:not(.cp-val--preview)');
  if (val) {
    const i = +val.dataset.i;
    if (isCoarse() || i === active) return copyResult(i, val);
    const ref = val.dataset.ref; const cur = sheet.lines[active] || '';
    const inp = curInput(); const pos = document.activeElement === inp ? inp.selectionStart : cur.length;
    const before = cur.slice(0, pos);
    focusLine(active, pos);
    insertAtCaret((before && !/[\s(]$/.test(before) ? ' ' : '') + ref);
    return;
  }
  const fx = e.target.closest('[data-fix]'); if (fx) return applyFix(+fx.dataset.fix);
  const hn = e.target.closest('[data-hint]'); if (hn) { const i = +hn.dataset.hint; return addSlider(i, ev.results[i].hint.fix.name); }
  const sw = e.target.closest('.cp-swatch'); if (sw) return toggleHidden(sw.dataset.key);
  if (e.target.closest('[data-fmt]')) return fmtMenu(e.target.closest('[data-fmt]'));
  const row = e.target.closest('.cp-line');
  if (row && !e.target.closest('input, button, details')) focusLine(+row.dataset.i);
});
$('#paper').addEventListener('click', (e) => { if (e.target.id === 'paper' || e.target.id === 'lines') focusLine(sheet.lines.length - 1); });

// global keys: typing anywhere goes to the current line; ⌘Z/⌘G/⌘S/⌥N
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const inPaper = !!document.activeElement?.closest?.('.cp-paper') || document.activeElement === document.body || document.activeElement?.id === 'main';
  if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z') && inPaper && !hasLayers()) { e.preventDefault(); e.shiftKey ? redoStep() : undoStep(); return; }
  if (mod && !e.shiftKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); toggleGraph(); return; }
  if (mod && !e.shiftKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (ev.plots.length) exportPNG(); else download(`${slug(sheet.name)}.txt`, new Blob([sheetText()], { type: 'text/plain' })); return; }
  if (e.altKey && !mod && e.code === 'KeyN') { e.preventDefault(); newSheet(); return; }
  if (mod || e.altKey || hasLayers() || isTyping()) return;
  if (document.activeElement?.closest?.('.cp-g, .cp-graphpane, .fw-appbar, .fw-rail, .cp-mgraph')) return;
  if (e.key.length === 1 && e.key !== '/' && e.key !== '?') { focusLine(active); }
});

// ── mobile: keypad sheet with the live line above it ──
const PAD = {
  n: [['(', '('], [')', ')'], ['%', '%'], ['÷', ' ÷ ', 'op'], ['7'], ['8'], ['9'], ['×', ' × ', 'op'], ['4'], ['5'], ['6'], ['−', ' − ', 'op'], ['1'], ['2'], ['3'], ['+', ' + ', 'op'], ['0'], ['dec'], ['bksp'], ['=', 'enter', 'eq']],
  f: [['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['√', '√'], ['asin', 'asin('], ['acos', 'acos('], ['atan', 'atan('], ['x²', '^2'], ['ln', 'ln('], ['log', 'log10('], ['eˣ', 'e^'], ['xʸ', '^'], ['π', 'pi'], ['e', 'e'], ['x', 'x'], ['!', '!'], ['f(x) =', 'f(x) = ', 'wide2'], ['bksp'], ['=', 'enter', 'eq']],
  u: [['km', ' km'], ['mi', ' mi'], ['m', ' m'], ['ft', ' ft'], ['kg', ' kg'], ['lb', ' lb'], ['g', ' g'], ['oz', ' oz'], ['°C', ' °C'], ['°F', ' °F'], ['h', ' h'], ['min', ' min'], ['L', ' L'], ['cup', ' cups'], ['%', '%'], ['in →', ' in ', 'op'], ['0'], ['dec'], ['bksp'], ['=', 'enter', 'eq']],
};
function renderPad() {
  const pad = $('#pad');
  const dec = sheet.fmt === 'de' ? ',' : '.';
  const keys = PAD[padTab] || PAD.n;
  pad.innerHTML = `
    <div class="cp-display" id="display"></div>
    <div class="cp-padtabs" role="tablist" aria-label="Keypad">
      ${[['n', '123'], ['f', 'ƒx'], ['abc', 'abc'], ['u', 'units']].map(([k, l]) => `<button class="cp-padtab" type="button" role="tab" aria-selected="${padTab === k}" data-tab="${k}">${l}</button>`).join('')}
      <button class="cp-padtab cp-padtab--icon" type="button" data-act="graph" aria-label="Graph">${icon('chart-spline', { size: 18 })}</button>
    </div>
    ${padTab === 'abc' ? `<div class="cp-abc"><p>Typing with your keyboard.</p><button class="fw-btn fw-btn--subtle" type="button" data-tab="n">${icon('calculator')}Back to keypad</button></div>` :
    `<div class="cp-keys" role="group" aria-label="Keys" data-roving="a">${keys.map(([lab, ins, kind]) => {
      if (lab === 'dec') return `<button class="cp-key" type="button" data-ins="${dec}" aria-label="Decimal separator">${dec}</button>`;
      if (lab === 'bksp') return `<button class="cp-key cp-key--fn" type="button" data-act="bksp" aria-label="Delete, hold to clear the line">${icon('delete', { size: 22 })}</button>`;
      const insert = ins ?? lab;
      return `<button class="cp-key ${kind === 'op' ? 'cp-key--op' : ''} ${kind === 'eq' ? 'cp-key--eq' : ''} ${/^[a-zƒ√π°!]|^x|^e/i.test(lab) && kind !== 'op' && kind !== 'eq' ? 'cp-key--fn' : ''}" type="button" ${insert === 'enter' ? 'data-act="enter"' : `data-ins="${esc(insert)}"`} data-key="${esc(lab)}" aria-label="${esc(lab)}">${esc(lab)}</button>`;
    }).join('')}</div>`}`;
  enhance(pad);
  renderDisplay();
}
function renderDisplay() {
  const d = $('#display'); if (!d || !ev) return;
  let i = active, r = ev.results[i], src = sheet.lines[i] || '', committed = false;
  if (!src.trim() && i > 0 && ev.results[i - 1]?.copy) { i = i - 1; r = ev.results[i]; src = sheet.lines[i]; committed = true; }
  const val = r?.kind === 'error' ? (r.error.preview ? r.error.preview : '') : r?.kind === 'plot' ? '' : r?.text || '';
  const msg = r?.kind === 'error' && !r.error.typing && Date.now() - typingAt > 650 ? r.error.msg : r?.kind === 'plot' ? 'on the graph' : '';
  d.innerHTML = `<div class="cp-display__expr"><span class="cp-display__ln">${i + 1}</span><span class="cp-display__src">${esc(pretty(src)) || '&nbsp;'}${committed ? ' =' : ''}</span></div>
    <button class="cp-display__res ${committed ? 'is-committed' : ''} ${r?.kind === 'error' ? 'is-err' : ''}" type="button" ${val ? '' : 'disabled'} aria-label="${val ? `Copy ${esc(val)}` : 'No result yet'}">
      ${msg ? `<span class="cp-display__msg">${esc(msg)}</span>` : ''}<span class="cp-display__val ${val ? '' : 'cp-muted'}">${val ? `${committed ? '' : '= '}${esc(val)}` : msg ? '' : '0'}</span>${val ? icon('copy', { size: 16 }) : ''}</button>`;
  d.querySelector('.cp-display__res').onclick = () => copyResult(i);
}
let holdT = 0, held = false;
$('#pad').addEventListener('pointerdown', (e) => {
  const k = e.target.closest('.cp-key, .cp-padtab, [data-tab], .cp-display__res'); if (!k) return;
  if (k.closest('.cp-keys') || k.classList.contains('cp-padtab')) e.preventDefault(); // keep the caret in the line
  if (k.dataset.act === 'bksp') { held = false; holdT = setTimeout(() => { held = true; clearLine(); }, 550); }
  k.classList.add('is-down');
});
$('#pad').addEventListener('pointerup', (e) => { clearTimeout(holdT); $$('.cp-key.is-down, .cp-padtab.is-down', $('#pad')).forEach((k) => k.classList.remove('is-down')); });
$('#pad').addEventListener('pointercancel', () => clearTimeout(holdT));
$('#pad').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { padTab = t.dataset.tab; renderPad(); focusLine(active); if (padTab === 'abc') toast('Your keyboard is up · tap 123 to come back', { type: 'info', duration: 1800 }); return; }
  const k = e.target.closest('.cp-key, [data-act]'); if (!k) return;
  const act = k.dataset.act;
  if (act === 'graph') return openMobileGraph();
  if (document.activeElement !== curInput()) focusLine(active);
  if (act === 'bksp') { if (held) return; const inp = curInput(); remember('type'); if (inp.selectionStart === 0 && inp.selectionEnd === 0 && active > 0) { const prev = sheet.lines[active - 1]; sheet.lines[active - 1] = prev + sheet.lines[active]; sheet.lines.splice(active, 1); changed(); focusLine(active - 1, prev.length); } else document.execCommand('delete'); return; }
  if (act === 'enter') { const inp = curInput(); splitLine(active, inp.value.length, inp.value.length); return; }
  if (k.dataset.ins != null) {
    let ins = k.dataset.ins;
    const inp = curInput(); const before = inp.value.slice(0, inp.selectionStart);
    if (ins === '(' || ins === ')') { /* as typed */ }
    if (/^ /.test(ins) && /\s$/.test(before)) ins = ins.trimStart();
    insertAtCaret(ins);
  }
});
function clearLine() {
  const old = sheet.lines[active]; if (!old) return;
  remember('struct'); sheet.lines[active] = ''; changed(); focusLine(active);
  if (navigator.vibrate) navigator.vibrate(10);
  toast('Line cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { sheet.lines[active] = old; changed(); focusLine(active); } } });
}

// mobile graph: full screen, canvas first, expressions in a bottom sheet
let mg = null;
function openMobileGraph() {
  if (mg) return;
  const el = h(`<div class="cp-mgraph" role="dialog" aria-modal="true" aria-label="Graph">
    <div class="cp-mgraph__bar">
      <button class="fw-btn fw-btn--subtle cp-mgraph__done" type="button" id="mg-done">${icon('chevron-left')}Paper</button>
      <span class="cp-mgraph__title">${esc(sheet.name)}</span>
      <div class="fw-seg fw-seg--sm cp-mangle" aria-label="Angle unit"><button class="fw-seg__opt" type="button" aria-checked="${sheet.angle === 'rad'}" data-value="rad">RAD</button><button class="fw-seg__opt" type="button" aria-checked="${sheet.angle === 'deg'}" data-value="deg">DEG</button></div>
      <button class="fw-iconbtn" type="button" id="mg-export" aria-label="Export" aria-haspopup="menu">${icon('download')}</button>
    </div>
    <div class="cp-mgraph__stage" id="mg-stage"></div>
    <div class="cp-msheet" id="mg-sheet" data-h="peek">
      <button class="cp-msheet__grab" type="button" aria-label="Resize the list"><span></span></button>
      <div class="cp-msheet__body" id="mg-body"></div>
    </div></div>`);
  document.body.append(el);
  enhance(el);
  $$('.fw-toast [aria-label="Dismiss"]').forEach((b) => b.click());
  const host = $('#gwrap'); const stage = el.querySelector('#mg-stage');
  stage.append(...host.children); // move graph + zoom HUD
  mg = { el, host, pop: pushLayer(() => closeMobileGraph(), el) };
  el.querySelector('#mg-done').onclick = () => closeMobileGraph();
  el.querySelector('#mg-export').onclick = (e) => exportMenu(e.currentTarget);
  el.querySelector('.cp-mangle').addEventListener('fw-change', (e) => setAngle(e.detail.value));
  // sheet grab: tap toggles peek ↔ half, drag down closes to a slim strip
  const sh = el.querySelector('#mg-sheet'), grab = el.querySelector('.cp-msheet__grab'); let y0 = null;
  grab.addEventListener('click', () => { sh.dataset.h = sh.dataset.h === 'peek' ? 'half' : 'peek'; });
  grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy > 40) sh.dataset.h = sh.dataset.h === 'half' ? 'peek' : 'min'; else if (dy < -40) sh.dataset.h = sh.dataset.h === 'min' ? 'peek' : 'half'; });
  renderMobileSheet();
  requestAnimationFrame(() => {
    el.classList.add('is-open');
    graph.padBottom = sh.getBoundingClientRect().height; graph.resize();
    if (!graph.userView) graph.fit(false);
    setToastOffset();
  });
}
function renderMobileSheet() {
  if (!mg) return;
  const body = mg.el.querySelector('#mg-body');
  const plots = ev.results.filter((r) => r.plot).map((r) => r.plot);
  body.innerHTML = `<div class="cp-mlist">${plots.map((p) => `<div class="cp-mrow"><span class="cp-mrow__sw" style="--c:${p.color}"></span><span class="cp-mrow__expr">${esc(p.text)}</span>
      <button class="fw-iconbtn cp-mrow__eye" type="button" aria-pressed="${!sheet.hidden[p.key]}" aria-label="${sheet.hidden[p.key] ? 'Show' : 'Hide'} ${esc(p.label)}" data-key="${esc(p.key)}">${icon(sheet.hidden[p.key] ? 'eye-off' : 'eye', { size: 20 })}</button></div>`).join('') || '<p class="cp-muted">No curves yet. Lines with x appear here.</p>'}</div>
    ${ev.sliders.length ? `<div class="cp-msliders">${ev.sliders.map((s) => `<div class="fw-slider cp-slider" data-name="${esc(s.name)}"><label class="fw-slider__label"><span class="cp-mono">${esc(s.name)}</span></label><output class="fw-slider__value cp-mono">${fmtNumber(s.value, sheet.fmt)}</output><input type="range" min="-5" max="5" step="0.1" value="${s.value}" data-line="${s.line}" aria-label="${esc(s.name)}"></div>`).join('')}</div>` : ''}
    <button class="fw-btn fw-btn--ghost fw-btn--block cp-madd" type="button" id="mg-add">${icon('plus')}Add function</button>`;
  body.querySelectorAll('.cp-mrow__eye').forEach((b) => (b.onclick = () => { toggleHidden(b.dataset.key); renderMobileSheet(); }));
  body.querySelectorAll('input[type=range]').forEach((inp) => (inp.oninput = () => { const v = Math.round(+inp.value * 10) / 10; sheet.lines[+inp.dataset.line] = `${inp.closest('.cp-slider').dataset.name} = ${fmtNumber(v, sheet.fmt)}`; inp.closest('.cp-slider').querySelector('output').textContent = fmtNumber(v, sheet.fmt); changed({ fast: true }); }));
  body.querySelector('#mg-add').onclick = () => { closeMobileGraph(); remember('struct'); const used = new Set(ev.results.filter((r) => r.plot).map((r) => r.plot.name)); const n = 'fghpqr'.split('').find((c) => !used.has(c)) || 'h'; const at = sheet.lines[sheet.lines.length - 1].trim() ? sheet.lines.push('') - 1 : sheet.lines.length - 1; sheet.lines[at] = `${n}(x) = `; changed(); focusLine(at); };
}
function closeMobileGraph() {
  if (!mg) return;
  const { el, host, pop } = mg; mg = null; pop();
  el.classList.remove('is-open');
  host.append(...el.querySelector('#mg-stage').children);
  setTimeout(() => el.remove(), 200);
  graph.padBottom = 0; graph.resize(); setToastOffset();
  focusLine(active);
}

// ── theme: recolour curves and the canvas ──
window.addEventListener('fw-theme-change', () => { const go = () => { graph.readTheme(); render(); }; setTimeout(go, 30); setTimeout(go, 320); });
matchMedia('(max-width: 767px)').addEventListener('change', () => { if (!mobile() && mg) closeMobileGraph(); syncRows(); render(); });

// toasts sit right above the keypad (or the graph's list) on phones
function setToastOffset() {
  const root = document.documentElement;
  if (!mobile()) { root.style.removeProperty('--toast-offset'); return; }
  const el = mg ? mg.el.querySelector('#mg-sheet') : $('#pad');
  root.style.setProperty('--toast-offset', `${Math.round(el?.getBoundingClientRect().height || 60) + 4}px`);
}
new ResizeObserver(() => setToastOffset()).observe($('#pad'));

// ── boot ──
framebar(); renderPad(); render();
store.set('calc:current', sheet.id); save();
if (!isCoarse()) focusLine(active); else requestAnimationFrame(() => rowEl(active)?.scrollIntoView({ block: 'end' }));
window.__calc = { get sheet() { return sheet; }, get ev() { return ev; }, graph, focusLine, render };
