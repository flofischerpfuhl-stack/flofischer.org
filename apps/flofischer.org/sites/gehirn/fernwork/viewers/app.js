// Viewers · one page per format (today's eleven viewers), all in the same viewer frame:
// frame bar (file chip · mode switch · panel toggles · Export ▾ · ⋯), optional left list, stage with zoom HUD,
// optional inspector, status bar only for live working info, staged progress and inline error card inside the stage.
// The page's format plugin (formats/*.js) brings the canvas, panels and exports; the frame owns everything else.
import { mountShell, getLeaf, chipOf, canonicalId, renderPageHeader, icon, esc, $, h, enhance, formatBytes, extOf, toast,
  openSheet, openPopover, openDialog, kbd, loadSamples, isMobile, isTyping, hasLayers, pushLayer, shortAgo, effectiveTheme,
  copyText, setCommands } from '../kit/shell.js';
import './icons-extra.js';
import * as store from './store.js';
import { VIEWERS } from './formats/index.js';

const params = new URLSearchParams(location.search);
const L = getLeaf(canonicalId(params.get('leaf') || '') || 'viewer-markdown') || getLeaf('viewer-markdown');
const TOOL = chipOf(L);                              // the viewer (presets like csv-viewer land on viewer-table)
const V = VIEWERS[TOOL.id];
const F = V.fmt;
const KEY = TOOL.id;                                 // one stored file per viewer (today: each viewer restores its last file)
const S = { d: null, list: true, insp: false, prev: null };
const wb = $('#wb'), wbMain = $('#wb-main'), docEl = $('#doc');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extsOk = (name) => V.exts.includes(extOf({ name }));

mountShell({
  leaf: L.id, archetype: 'workbench',
  accept: (sum) => (sum.names.length ? sum.names.every((n) => extsOk(n) || F.acceptsAdd?.(n)) : sum.kinds.every((k) => V.kinds.includes(k))),
  acceptLabel: TOOL.name,
  onFiles: (files, { source } = {}) => onFiles(files, source),
  shortcuts: [{ label: 'Open file', keys: 'mod+o' }, { label: 'Save original', keys: 'mod+s' }, { label: 'Export menu', keys: 'e' },
    { label: 'Fit', keys: 'f' }, { label: '100 %', keys: '1' }, ...(F.modes || []).filter((m) => m.key).map((m) => ({ label: m.label, keys: m.key })),
    ...(F.keys || []), { label: 'Toggle inspector', keys: 'mod+.' }],
});
document.title = `${L.name} · Fernwork`;

// ───────────────────────── helpers handed to formats ─────────────────────────
const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) scripts.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); }));
  return scripts.get(src);
}
function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h(`<a download="${esc(name)}" hidden></a>`); a.href = URL.createObjectURL(blob); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const nf = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const baseName = (n) => n.replace(/\.[^.]+$/, '');
export const kv = (rows) => `<dl class="fw-insp-kv ov-kv">${rows.filter(Boolean).map(([k, v, cls]) => `<dt>${esc(k)}</dt><dd class="${cls || ''}">${v}</dd>`).join('')}</dl>`;
export const ctx = {
  h, esc, icon, kbd, enhance, toast, openSheet, openPopover, openDialog, pushLayer, copyText, download, loadScript, nf, today, baseName, kv,
  isMobile, theme: effectiveTheme, sleep, formatBytes,
  refresh: (parts) => refresh(parts),
  isActive: (d) => d === S.d,
  setDirty: (d, v) => setDirty(d, v), saveDraft: (d) => saveDraft(d),
  setMode: (d, m) => setMode(d, m),
  pickFiles: (opts) => pickFiles(opts),
  exportMenu: (anchor) => openExport(anchor),
  menu: (...a) => menu(...a),
  showInsp: () => { if (!S.insp && !isMobile()) { S.insp = true; refresh('frame insp'); requestAnimationFrame(() => S.d?.ctl?.onResize?.()); } },
  infoSheet: (d, b, f) => infoSheet(d, b, f),
  listSheet: (d, b) => listSheet(d, b),
  updateCommands: () => updateCommands(),
};

// ───────────────────────── open / load ─────────────────────────
function makeDoc(file, extra = {}) {
  return { file, name: file.name, size: file.size, ext: extOf(file), fmt: F, state: 'idle', mode: F.defaultMode?.(file) || F.modes?.[0]?.id, el: null, ctl: null, data: null, err: null, dirty: false, sel: null, ...extra };
}
async function onFiles(files, source) {
  files = [...files]; if (!files.length) return;
  const d = S.d;
  if (d?.state === 'ready' && F.addFiles && files.every((f) => F.acceptsAdd?.(f.name) || (F.addsSameKind && extsOk(f.name)))) { F.addFiles(d, files, ctx); return; }
  const main = files.find((f) => extsOk(f.name)) || files[0];
  const extras = files.filter((f) => f !== main);
  await open(main, { source, extras });
}
async function open(file, { source, extras = [], restore = null } = {}) {
  const prev = S.d;
  if (prev) { prev.cancelled = true; prev.ctl?.destroy?.(); }
  const d = makeDoc(file, restore || {});
  if (restore?.mode && !F.modes?.some((m) => m.id === restore.mode)) d.mode = F.modes?.[0]?.id;
  d.extras = extras; S.d = d; S.prev = prev && prev.state === 'ready' ? prev : null;
  docEl.replaceChildren();
  render();
  if (!restore) store.put(KEY, { name: file.name, type: file.type, size: file.size, blob: file, mode: d.mode, draft: null, at: Date.now() });
  await load(d);
  if (extras.length && d.state === 'ready' && F.addFiles && !F.usesExtras) F.addFiles(d, extras, ctx);
  if (source === 'drop' && prev?.state === 'ready' && d.state === 'ready') toast(`Opened ${file.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => reopen(prev) } });
}
function reopen(old) {
  S.d?.ctl?.destroy?.(); old.state = 'idle'; old.ctl = null; old.cancelled = false; S.d = old; docEl.replaceChildren(); render();
  store.put(KEY, { name: old.name, type: old.file.type, size: old.size, blob: old.file, mode: old.mode, draft: old.draft ?? null, at: Date.now() });
  load(old);
}
async function load(d) {
  d.state = 'loading'; d.err = null;
  const steps = F.steps(d, ctx);
  d.progress = steps.map((s) => ({ label: s.label, state: 'todo', pct: 0 }));
  const card = renderProgress(d);
  refresh();
  try {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], p = d.progress[i];
      if (s.engine && ENGINES.has(s.engine)) { p.state = 'done'; p.label = s.cached || s.label; updateProgress(d, card); continue; }
      p.state = 'doing'; updateProgress(d, card);
      await runStep(d, s, p, card);
      if (d.cancelled) return;
      p.state = 'done'; p.pct = 100; if (s.engine) ENGINES.add(s.engine); updateProgress(d, card);
    }
    if (d.cancelled) return;
    d.state = 'ready';
    mountDoc(d);
    card.classList.add('is-done'); setTimeout(() => card.remove(), 260);
  } catch (err) {
    if (d.cancelled) return;
    console.info('[viewer] could not read', d.name, err);
    d.state = 'error'; d.err = err.human ? err : humanError(d, err);
    card.remove(); renderError(d);
  }
  refresh(); updateCommands();
}
const ENGINES = new Set();
async function runStep(d, s, p, card) {
  const fast = params.has('fast');
  const ms = fast ? 0 : (s.ms ?? 300); const t0 = performance.now(); let realDone = !s.run, realPct = 0;
  const work = s.run ? Promise.resolve().then(() => s.run((v) => { realPct = v; })).then((v) => { realDone = true; return v; }) : null;
  await new Promise((resolve, reject) => {
    work?.catch(reject);
    const tick = () => {
      if (d.cancelled) return resolve();
      const tp = ms ? Math.min(1, (performance.now() - t0) / ms) : 1;
      p.pct = Math.round(Math.max(realPct, tp * (realDone ? 100 : 92)));
      updateProgress(d, card);
      if (tp >= 1 && realDone) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  if (work) await work;
}
function renderProgress(d) {
  const card = h(`<div class="ov-progress" role="status" aria-live="polite"><div class="ov-progress__card">
      <div class="ov-progress__head"><span class="ov-fmticon">${icon(V.icon || TOOL.icon, { size: 18 })}</span>
        <div class="ov-progress__titles"><div class="ov-progress__name">${esc(d.name)}</div><div class="ov-progress__sub">${esc(V.kindLabel)} · ${formatBytes(d.size)}</div></div></div>
      <ol class="ov-steps"></ol>
      <div class="ov-progress__foot"><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-cancel>Cancel</button></div></div></div>`);
  card.querySelector('[data-cancel]').onclick = () => { d.cancelled = true; closeFile({ silent: true }); toast(`Stopped opening ${d.name}`, { type: 'neutral' }); };
  docEl.append(card); updateProgress(d, card);
  return card;
}
function updateProgress(d, card) {
  card.querySelector('.ov-steps').innerHTML = d.progress.map((p) => `<li class="ov-step is-${p.state}"><span class="ov-step__icon">${p.state === 'done' ? icon('check', { size: 14 }) : p.state === 'doing' ? '<span class="fw-spinner"></span>' : '<span class="ov-step__dot"></span>'}</span>
    <span class="ov-step__label">${esc(p.label)}</span>${p.state === 'doing' ? `<span class="ov-step__pct">${p.pct} %</span><span class="fw-progress__track ov-step__bar"><span class="fw-progress__bar" style="--value:${p.pct}%"></span></span>` : ''}</li>`).join('');
}
function humanError(d, err) {
  return { human: true, title: `${d.name} couldn’t be opened`, why: `It doesn’t look like a valid ${V.kindLabel.toLowerCase()} (${formatBytes(d.size)}).`, details: String(err?.message || err) };
}
function renderError(d) {
  const e = d.err; const wrong = !extsOk(d.name) && e.route;
  const card = h(`<div class="ov-error" role="alert"><div class="ov-error__card">
      <span class="ov-error__icon">${icon('file-x', { size: 22 })}</span>
      <h2 class="ov-error__title">${esc(e.title)}</h2>
      <p class="ov-error__why">${esc(e.why)}</p>
      <div class="ov-error__actions">
        ${e.route ? `<a class="fw-btn fw-btn--primary" href="?leaf=${esc(e.route.leaf)}" id="err-route">${icon('arrow-right')}${esc(e.route.label)}</a>` : ''}
        <button class="fw-btn ${e.route ? '' : 'fw-btn--primary'}" type="button" data-pick>${icon('folder-open')}Choose another file</button>
        ${S.prev ? `<button class="fw-btn fw-btn--ghost" type="button" data-back>${icon('arrow-left')}Back to ${esc(S.prev.name)}</button>` : ''}
        <button class="fw-btn fw-btn--ghost" type="button" data-text>${icon('file-text')}Show raw contents</button>
      </div>
      <details class="ov-error__details"><summary>Details</summary><code>${esc(e.details || '')}</code></details></div></div>`);
  card.querySelector('[data-pick]').onclick = () => pickFiles();
  card.querySelector('[data-text]').onclick = () => rawView(d, card);
  card.querySelector('[data-back]')?.addEventListener('click', () => reopen(S.prev));
  if (wrong && e.route) card.querySelector('#err-route').addEventListener('click', (ev) => { ev.preventDefault(); goWithFile(e.route.leaf, d.file); });
  else card.querySelector('#err-route')?.addEventListener('click', (ev) => { ev.preventDefault(); goWithFile(e.route.leaf, d.file); });
  docEl.querySelectorAll('.ov-error').forEach((x) => x.remove());
  docEl.append(card);
}
async function goWithFile(leaf, file) { const { navigate } = await import('../kit/shell.js'); navigate(leaf, { files: [file] }); }
async function rawView(d, card) {
  const bytes = new Uint8Array(await d.file.slice(0, 64 * 1024).arrayBuffer());
  let bin = 0; for (let i = 0; i < Math.min(bytes.length, 4096); i++) { const c = bytes[i]; if (c === 0 || (c < 9) || (c > 13 && c < 32)) bin++; }
  const body = bin > 8 || !bytes.length
    ? `<pre class="vw-raw vw-raw--hex">${hexDump(bytes.slice(0, 1024))}</pre>`
    : `<pre class="vw-raw">${esc(new TextDecoder().decode(bytes).slice(0, 20000))}</pre>`;
  card.querySelector('.ov-error__card').insertAdjacentHTML('beforeend', `<div class="vw-rawwrap"><div class="fw-label">${bin > 8 || !bytes.length ? 'First bytes (hex)' : 'Text contents'}</div>${body}</div>`);
  card.querySelector('[data-text]').disabled = true;
}
function hexDump(b) {
  if (!b.length) return 'This file is empty (0 bytes).';
  let s = ''; for (let o = 0; o < b.length; o += 16) { const row = [...b.slice(o, o + 16)]; s += o.toString(16).padStart(6, '0') + '  ' + row.map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(48) + '  ' + esc(row.map((x) => (x > 31 && x < 127 ? String.fromCharCode(x) : '·')).join('')) + '\n'; }
  return s;
}
function mountDoc(d) {
  docEl.querySelectorAll('.ov-view').forEach((x) => x.remove());
  const view = h(`<div class="ov-view" data-mode="${d.mode || ''}"></div>`);
  docEl.prepend(view); d.el = docEl;
  d.ctl = F.mount(d, view, ctx) || {};
  d.listEl = F.list ? F.list(d, ctx) : null;
  S.list = F.listOpen?.(d) ?? !!d.listEl;
  S.insp = !isMobile() && innerWidth > 1100 && !!F.inspOpen?.(d);
  if (d.restoredDraft) showDraftPill(d);
  if (!isMobile() && innerWidth <= 1100) S.list = S.list && !!F.listOnTablet;
}

// ───────────────────────── close / drafts ─────────────────────────
function closeFile({ silent = false } = {}) {
  const d = S.d; if (!d) return;
  d.cancelled = true; d.ctl?.destroy?.();
  S.d = null; docEl.replaceChildren(); store.del(KEY);
  render(); updateCommands();
  if (!silent && d.state === 'ready') toast(`Closed ${d.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => reopen(d) } });
}
function requestClose() {
  const d = S.d; if (!d) return;
  if (!d.dirty) return closeFile();
  openDialog({
    title: `Close ${d.name}?`, size: 440,
    body: `<p class="fw-t-sm fw-muted">You changed this file. Export it now, or discard your changes.</p>`,
    actions: [
      { label: 'Discard changes', ghost: true, onClick: () => closeFile() },
      { label: 'Cancel', ghost: true },
      { label: 'Export…', primary: true, onClick: () => { saveOriginal(d); } },
    ],
  });
}
function setDirty(d, dirty) { if (d.dirty === dirty) return; d.dirty = dirty; refresh('frame'); }
let draftT = 0;
function saveDraft(d) {
  clearTimeout(draftT);
  draftT = setTimeout(() => store.patch(KEY, { draft: d.draft ?? null, draftAt: Date.now() }), 400);
}
function showDraftPill(d) {
  const r = d.restoredDraft; const pill = h(`<div class="ov-draftpill" role="status">
    <span class="ov-draftpill__dot"></span><span><strong>Your edits are back</strong> · from ${esc(shortAgo(r.at) === 'now' ? 'just now' : shortAgo(r.at) + ' ago')}</span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-orig>Show original</button>
    <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-discard>Discard edits</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss" data-x>${icon('x')}</button></div>`);
  pill.querySelector('[data-x]').onclick = () => pill.remove();
  pill.querySelector('[data-orig]').onclick = (e) => { const on = d.ctl.toggleOriginal?.(); e.currentTarget.textContent = on ? 'Show my edits' : 'Show original'; };
  pill.querySelector('[data-discard]').onclick = () => { const old = d.draft; d.ctl.discardDraft?.(); pill.remove(); store.patch(KEY, { draft: null }); toast('Edits discarded', { type: 'neutral', action: { label: 'Undo', onClick: () => d.ctl.setDraft?.(old) } }); };
  docEl.append(pill);
  d.restoredDraft = null;
}
window.addEventListener('beforeunload', () => { clearTimeout(draftT); if (S.d?.dirty) store.patch(KEY, { draft: S.d.draft ?? null, draftAt: Date.now() }); });

// ───────────────────────── rendering ─────────────────────────
function render() {
  const d = S.d;
  wb.classList.toggle('is-empty', !d);
  renderEmpty(); refresh();
}
function refresh(parts = 'all') {
  const all = parts === 'all', has = (p) => all || parts.includes(p);
  const d = S.d;
  if (has('frame')) renderFrame();
  if (has('list') || has('frame')) renderList();
  if (has('insp') || has('frame')) renderInspector();
  if (has('status') || has('frame')) renderStatus();
  if (has('zoom') || has('frame')) renderZoom();
  if (has('bottom') || has('frame')) renderBottombar();
  $('#stage').dataset.fmt = d?.state === 'ready' ? F.id : '';
}
const fmtIcon = (d) => d.state === 'loading' ? '<span class="fw-spinner ov-mini-spin"></span>' : d.state === 'error' ? `<span class="ov-tab__err">${icon('circle-alert', { size: 14 })}</span>` : icon(V.icon || TOOL.icon, { size: 14 });
function renderFrame() {
  const d = S.d; const fb = $('#framebar');
  if (!d) { fb.innerHTML = ''; return; }
  const focusId = fb.contains(document.activeElement) ? document.activeElement.id : null;
  const ready = d.state === 'ready';
  const ms = ready ? (F.modes || []).filter((m) => !(isMobile() && m.desktopOnly)) : []; const modes = ms.length > 1 ? ms : null;
  const hasList = ready && !!d.listEl;
  const hasInsp = ready && !!F.inspector;
  fb.innerHTML = `
    <h1 class="fw-sr">${esc(L.name)}</h1>
    <button class="fw-filechip vw-filechip" type="button" id="filechip" aria-haspopup="menu" aria-expanded="false" data-tip="${esc(d.name)} · ${formatBytes(d.size)}">
      <span class="fw-filechip__thumb">${fmtIcon(d)}</span><span class="fw-filechip__name">${esc(d.name)}</span>${d.dirty ? '<span class="fw-doctab__dirty" role="img" aria-label="Edited"></span>' : ''}${icon('chevron-down', { size: 14 })}</button>
    ${modes ? `<span class="fw-divider-v fw-hide-compact"></span><div class="fw-seg fw-seg--sm vw-modes" aria-label="Mode" id="modes">${modes.map((m) => `<button class="fw-seg__opt" type="button" aria-checked="${m.id === d.mode}" data-value="${m.id}" aria-label="${esc(m.label)}" ${m.key ? `data-tip="${esc(m.tip || m.label)}" data-tip-kbd="${m.key}"` : m.tip ? `data-tip="${esc(m.tip)}"` : ''}>${m.icon ? icon(m.icon, { size: 14 }) : ''}<span class="vw-modes__label">${esc(m.label)}</span></button>`).join('')}</div>` : ''}
    <span class="fw-spacer"></span>
    ${ready && F.bar ? `<div class="fw-framebar__group fw-hide-compact vw-bar">${F.bar(d, ctx)}</div>` : ''}
    ${hasList || hasInsp ? `<div class="fw-framebar__group fw-hide-compact">
      ${hasList ? `<button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-list" aria-label="${esc(F.listLabel || 'List')}" data-tip="${esc(F.listLabel || 'List')}" aria-pressed="${S.list}">${icon('panel-left')}</button>` : ''}
      ${hasInsp ? `<button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-insp" aria-label="Details" data-tip="Details" data-tip-kbd="mod+." aria-pressed="${S.insp}">${icon('panel-right')}</button>` : ''}</div>` : ''}
    <button class="fw-btn fw-btn--primary fw-btn--sm ov-export" type="button" id="export" aria-haspopup="menu" aria-expanded="false" ${ready ? '' : 'disabled'}>${icon('download')}<span class="ov-export__label">Export</span>${icon('chevron-down', { size: 14 })}</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="more" aria-label="More options" data-tip="More options" aria-haspopup="menu" aria-expanded="false">${icon('ellipsis')}</button>`;
  enhance(fb);
  $('#filechip').onclick = (e) => openFileMenu(e.currentTarget);
  $('#modes')?.addEventListener('fw-change', (e) => setMode(d, e.detail.value));
  $('#t-list')?.addEventListener('click', () => { S.list = !S.list; refresh('frame'); requestAnimationFrame(() => d.ctl?.onResize?.()); });
  $('#t-insp')?.addEventListener('click', () => toggleInspector());
  $('#export').onclick = (e) => openExport(e.currentTarget);
  $('#more').onclick = (e) => openMore(e.currentTarget);
  F.bindBar?.(d, fb, ctx);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
function toggleInspector() { if (!S.d || S.d.state !== 'ready') return; S.insp = !S.insp; refresh('frame'); requestAnimationFrame(() => S.d?.ctl?.onResize?.()); }
function setMode(d, m) {
  if (!d || d.mode === m) return; d.mode = m;
  d.el?.querySelector('.ov-view')?.setAttribute('data-mode', m);
  d.ctl?.setMode?.(m); store.patch(KEY, { mode: m }); refresh(); updateCommands();
}
function renderList() {
  const d = S.d; const list = $('#list');
  const show = !!(d && d.state === 'ready' && d.listEl && S.list);
  wbMain.classList.toggle('has-list', show);
  wbMain.dataset.listw = F.listWidth || '';
  if (!show) { if (list.firstElementChild && list.firstElementChild !== d?.listEl) list.replaceChildren(); else if (!d?.listEl) list.replaceChildren(); return; }
  if (list.firstElementChild !== d.listEl) list.replaceChildren(d.listEl);
  F.updateList?.(d, ctx);
}
function renderInspector() {
  const d = S.d; const el = $('#inspector');
  const show = !!(d && d.state === 'ready' && S.insp && F.inspector);
  wbMain.classList.toggle('has-inspector', show);
  if (!show) { el.replaceChildren(); return; }
  const focusId = el.contains(document.activeElement) ? document.activeElement.id : null; const st = el.scrollTop;
  const s = F.inspector(d, ctx);
  const sec = (id, label, ic, body) => body ? `<section class="fw-insp-section ov-insp-section" id="insp-${id}" aria-labelledby="insp-${id}-h"><div class="fw-insp-section__head" id="insp-${id}-h">${icon(ic, { size: 14 })}${esc(label)}</div>${body}</section>` : '';
  el.innerHTML = `<div class="vw-insphead"><span>Details</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="insp-x" aria-label="Close details" data-tip="Close" data-tip-kbd="mod+.">${icon('x')}</button></div>`
    + sec('selection', s.selectionLabel || 'Selection', F.selIcon || 'mouse-pointer-2', s.selection)
    + sec('measure', s.measureLabel || F.measureLabel || 'Measurements', F.measureIcon || 'ruler', s.measure)
    + sec('info', s.infoLabel || 'File', 'info', s.info)
    + (s.extra || '');
  enhance(el); F.bindInspector?.(d, el, ctx);
  $('#insp-x').onclick = () => toggleInspector();
  el.scrollTop = st;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
function renderStatus() {
  const d = S.d; const el = $('#status');
  const items = d?.state === 'ready' && F.status ? F.status(d, ctx) : null;
  wb.classList.toggle('no-status', !items?.length);
  el.innerHTML = items?.length ? items.map((x) => `<span class="fw-statusbar__item">${x}</span>`).join('') : '';
}
function renderZoom() {
  const d = S.d; const z = $('#zoom'); const c = d?.state === 'ready' ? d.ctl : null;
  if (!c?.zoom || c.noZoom?.()) { z.hidden = true; return; }
  z.hidden = false;
  const pct = c.zoom(); const fit = c.isFit?.();
  z.innerHTML = `<button class="fw-iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="-" data-z="-1">${icon('minus')}</button>
    <button class="fw-zoom__pct" type="button" aria-label="Zoom ${Math.round(pct)} %, click to ${fit ? 'show at 100 %' : 'fit'}" data-tip="${fit ? 'Fitted · click for 100 %' : 'Fit'}" data-tip-kbd="${fit ? '1' : 'f'}" data-z="0">${c.zoomLabel?.() || `${Math.round(pct)} %`}</button>
    <button class="fw-iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+" data-z="1">${icon('plus')}</button>
    <span class="ov-zoom__sep"></span><button class="fw-iconbtn ${fit ? 'is-on' : ''}" type="button" aria-label="Fit" aria-pressed="${!!fit}" data-tip="Fit" data-tip-kbd="f" data-z="fit">${icon('maximize')}</button>`;
  z.onclick = (e) => { const b = e.target.closest('[data-z]'); if (!b) return; const v = b.dataset.z; if (v === 'fit') c.fit(); else if (v === '0') (fit ? c.setZoom(100) : c.fit()); else c.zoomBy(v === '1' ? 1.25 : 0.8); renderZoom(); renderStatus(); };
}
function renderBottombar() {
  const d = S.d; const bb = $('#bottombar');
  if (!d || d.state !== 'ready') { bb.innerHTML = ''; return; }
  const slots = F.mobileSlots?.(d, ctx) || [{ id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }];
  bb.style.setProperty('--slots', slots.length);
  bb.innerHTML = slots.map((s) => `<button class="fw-bottombar__btn" type="button" data-slot="${s.id}" ${s.pressed != null ? `aria-pressed="${!!s.pressed}"` : 'aria-expanded="false"'}>${icon(s.icon)}${esc(s.label)}</button>`).join('');
  bb.onclick = (e) => {
    const b = e.target.closest('[data-slot]'); if (!b) return; const id = b.dataset.slot; const s = slots.find((x) => x.id === id);
    if (s?.run) { s.run(d, ctx, b); return; }
    if (id === 'list') return listSheet(d, b);
    if (id === 'info' || id === 'measure') return infoSheet(d, b, id);
    if (id === 'export') return exportSheet(d, b);
    if (id === 'more') return openMore(b);
  };
}
function listSheet(d, b) {
  if (!d.listEl) return;
  b?.setAttribute('aria-expanded', 'true');
  const holder = h('<div class="ov-sheetlist"></div>'); holder.append(d.listEl);
  openSheet({ title: F.listLabel, height: 'peek', body: holder, onClose: () => { b?.setAttribute('aria-expanded', 'false'); refresh('list'); } });
}
function infoSheet(d, b, focus = 'info') {
  b?.setAttribute('aria-expanded', 'true');
  const s = F.inspector(d, ctx);
  const part = (label, body, id = '') => body ? `<div class="ov-sheetinsp__sec" ${id ? `id="${id}"` : ''}><div class="fw-label">${esc(label)}</div>${body}</div>` : '';
  const body = h(`<div class="ov-sheetinsp">${part(s.selectionLabel || 'Selection', s.selection)}${part(s.measureLabel || F.measureLabel || 'Measurements', s.measure, 'sheet-measure')}${part(s.infoLabel || 'File', s.info)}${s.extra || ''}</div>`);
  const sh = openSheet({ title: 'Details', height: 'half', body, onClose: () => b?.setAttribute('aria-expanded', 'false') });
  enhance(body); F.bindInspector?.(d, body, ctx);
  if (focus === 'measure') body.querySelector('#sheet-measure')?.scrollIntoView({ block: 'start' });
  return sh;
}

// ───────────────────────── empty state = page header + intake ─────────────────────────
function renderEmpty() {
  const el = $('#empty');
  if (S.d) { el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  const sample = V.samples?.[L.id] || V.sample;
  el.innerHTML = `<div class="vw-empty__inner"><div id="page-header"></div>
    <div class="fw-intake vw-intake" data-intake data-accept="${esc(V.exts.map((x) => '.' + x).join(',') + (V.acceptExtra || ''))}" data-multiple="${V.multiple ? 'true' : 'false'}" aria-label="Open a file: choose or drop">
      <span class="fw-intake__icon">${icon(V.icon || TOOL.icon, { size: 22 })}</span>
      <span class="fw-intake__title"><span class="fw-pointer-copy">${esc(V.dropTitle)}</span><span class="fw-touch-copy">${esc(V.tapTitle || V.dropTitle.replace(/^Drop/, 'Open'))}</span></span>
      <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick id="empty-open">${icon('folder-open')}Choose file</button>
        ${sample ? `<button class="fw-btn" type="button" data-no-pick id="empty-sample">${icon(sample.icon || 'sparkles')}${esc(sample.label)}</button>` : ''}
        ${V.newDoc ? `<button class="fw-btn fw-btn--ghost" type="button" data-no-pick id="empty-new">${icon('plus')}${esc(V.newDoc.label)}</button>` : ''}</span>
      <span class="fw-intake__sub">${esc(V.reads)}</span>
    </div></div>`;
  renderPageHeader(el.querySelector('#page-header'), { leaf: L, lede: V.lede || L.desc });
  enhance(el);
  el.querySelector('#empty-sample')?.addEventListener('click', async (e) => { e.stopPropagation(); e.currentTarget.classList.add('is-busy'); const files = await loadSamples(sample.files.map((f) => './samples/' + f).join('|')); onFiles(files, 'sample'); });
  el.querySelector('#empty-new')?.addEventListener('click', (e) => { e.stopPropagation(); const f = V.newDoc.make(); open(f, { source: 'new' }).then(() => V.newDoc.after?.(S.d, ctx)); });
}

// ───────────────────────── menus ─────────────────────────
function menu(anchor, groups, opts = {}) {
  const el = h(`<div class="fw-menu ov-menu" role="menu">${opts.file ? `<div class="fw-export__file" aria-live="polite">${icon('file', { size: 12 })}<span>Saves as</span><code id="exp-file">${esc(opts.file)}</code></div>` : ''}</div>`);
  const flat = [];
  groups.forEach((g) => {
    const items = (g.items || []).filter(Boolean); if (!items.length && !g.html) return;
    const wrap = h(`<div class="fw-menu__group" role="group" ${g.group ? `aria-label="${esc(g.group)}"` : ''}>${g.group ? `<div class="fw-menu__label" aria-hidden="true">${esc(g.group)}</div>` : ''}</div>`);
    if (g.html) { const x = h(g.html); wrap.append(x); g.bind?.(x, () => p.close(true)); }
    items.forEach((it) => {
      const role = it.checked === undefined ? 'menuitem' : it.radio ? 'menuitemradio' : 'menuitemcheckbox';
      const b = h(`<button type="button" class="fw-menu__item ${it.danger ? 'fw-menu__item--danger' : ''}" role="${role}" tabindex="-1" ${it.checked !== undefined ? `aria-checked="${!!it.checked}"` : ''} ${it.disabled ? 'disabled' : ''} ${it.id ? `data-id="${esc(it.id)}"` : ''}>
        ${it.icon ? icon(it.icon) : it.checked !== undefined ? '<span class="ov-menu__spacer"></span>' : ''}<span class="ov-menu__text">${esc(it.label)}${it.sub ? `<span class="fw-menu__sub">${esc(it.sub)}</span>` : ''}</span>
        ${it.kbd ? `<span class="fw-menu__hint">${kbd(it.kbd)}</span>` : it.hint ? `<span class="fw-menu__hint">${esc(it.hint)}</span>` : ''}${it.checked !== undefined ? icon('check', { className: 'fw-menu__check' }) : ''}${it.submenu ? icon('chevron-right', { size: 14 }) : ''}</button>`);
      b.onclick = () => { if (it.keepOpen) { it.onSelect?.(b); return; } p.close(true); it.onSelect?.(anchor); };
      const show = () => { const c = el.querySelector('#exp-file'); if (c && it.file) c.textContent = it.file; };
      b.addEventListener('pointerenter', show); b.addEventListener('focus', show);
      wrap.append(b); if (!it.disabled) flat.push(b);
    });
    el.append(wrap);
  });
  const p = openPopover(anchor, el, { placement: opts.placement || 'bottom-start', role: 'presentation', focus: false, className: opts.className || '' });
  el.addEventListener('keydown', (e) => {
    const i = flat.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); flat[(i + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); flat[0].focus(); } else if (e.key === 'End') { e.preventDefault(); flat.at(-1).focus(); }
    else if (e.key === 'Tab') p.close(false);
  });
  flat[0]?.focus({ preventScroll: true });
  return p;
}
function exportGroups(d) {
  const g = F.exports(d, ctx);
  const lbl = d.dirty ? `${d.ext.toUpperCase()} with your edits` : `Original ${d.ext.toUpperCase()}`;
  const orig = F.noOriginal ? null : { group: 'Original', items: [{ id: 'original', label: lbl, icon: 'download', file: d.name, kbd: 'mod+s', onSelect: () => saveOriginal(d) }] };
  return [orig, ...g].filter((x) => x && x.items.filter(Boolean).length);
}
function saveOriginal(d) {
  if (F.saveOriginal) return F.saveOriginal(d, ctx);
  download(d.name, d.file); toast(`Saved ${d.name} · ${formatBytes(d.size)}`);
}
function openExport(anchor) {
  const d = S.d; if (!d || d.state !== 'ready') return;
  if (isMobile()) return exportSheet(d, anchor);
  const groups = exportGroups(d);
  return menu(anchor, groups, { file: groups[0].items[0].file, placement: 'bottom-end', className: 'ov-exportmenu' });
}
function exportSheet(d, b) {
  b?.setAttribute?.('aria-expanded', 'true');
  const groups = exportGroups(d);
  const body = h(`<div class="ov-exportsheet">${groups.map((g, gi) => `<div class="ov-exportsheet__group"><div class="fw-label">${esc(g.group)}</div>${g.items.filter(Boolean).map((it, i) => `<button class="ov-exportsheet__item" type="button" data-g="${gi}" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${icon(it.icon || 'download')}<span class="ov-exportsheet__text"><span>${esc(it.label)}</span><code>${esc(it.file || it.sub || '')}</code></span></button>`).join('')}</div>`).join('')}</div>`);
  const sh = openSheet({ title: 'Export', height: 'half', body, onClose: () => b?.setAttribute?.('aria-expanded', 'false') });
  body.onclick = (e) => { const x = e.target.closest('[data-g]'); if (!x) return; const it = groups[+x.dataset.g].items.filter(Boolean)[+x.dataset.i]; sh.close(); setTimeout(() => it.onSelect?.(), 200); };
}
function openFileMenu(anchor) {
  const d = S.d; if (!d) return;
  menu(anchor, [
    { group: `${d.name} · ${formatBytes(d.size)}`, items: [
      { label: 'Open another file…', icon: 'folder-open', kbd: 'mod+o', onSelect: () => pickFiles() },
      ...(d.state === 'ready' ? (F.fileMenu?.(d, ctx) || []) : []),
    ] },
    { items: [{ label: 'Close file', icon: 'x', onSelect: requestClose }] },
  ]);
}
function openMore(anchor) {
  const d = S.d;
  const groups = d?.state === 'ready' ? (F.options?.(d, ctx) || []) : [];
  menu(anchor, [...groups,
    { items: [
      ...(isMobile() && d?.state === 'ready' && F.modes?.length > 1 ? [] : []),
      { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', onSelect: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) }] },
  ], { placement: 'bottom-end', className: 'vw-optmenu' });
}
function pickFiles({ add = false } = {}) {
  const i = h(`<input type="file" ${V.multiple || add ? 'multiple' : ''} hidden>`);
  i.accept = add && F.addAccept ? F.addAccept : V.exts.map((x) => '.' + x).join(',') + (V.acceptExtra || '');
  i.onchange = () => { const files = [...i.files]; if (add && S.d && F.addFiles) F.addFiles(S.d, files, ctx); else onFiles(files, 'picker'); i.remove(); };
  document.body.append(i); i.click();
}

// ───────────────────────── keyboard (scoped to this viewer; never inside inputs) ─────────────────────────
document.addEventListener('keydown', (e) => {
  const d = S.d; const k = e.key; const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey) {
    const kk = k.toLowerCase();
    if (kk === 'o') { e.preventDefault(); pickFiles(); return; }
    if (kk === 's' && d?.state === 'ready') { e.preventDefault(); saveOriginal(d); return; }
    if (kk === '.') { e.preventDefault(); toggleInspector(); return; }
    if (kk === 'e' && e.shiftKey && d?.state === 'ready') { e.preventDefault(); openExport($('#export')); return; }
    if (d?.state !== 'ready' || isTyping()) return;
    if (d.ctl.modKey?.(e) === true) { e.preventDefault(); return; }
    if (kk === '0' && d.ctl.fit) { e.preventDefault(); d.ctl.fit(); refresh('zoom status'); return; }
    if ((kk === '=' || kk === '+' || kk === '-') && d.ctl.zoomBy) { e.preventDefault(); d.ctl.zoomBy(kk === '-' ? 0.8 : 1.25); refresh('zoom status'); return; }
    return;
  }
  if (e.altKey || !d || d.state !== 'ready' || isTyping() || hasLayers() || e.defaultPrevented) return;
  if (e.target.closest?.('.fw-popover,dialog,input,select,textarea,[contenteditable="true"],.fw-appbar,.fw-rail')) return;
  if (d.ctl.key?.(e) === true) { e.preventDefault(); return; }
  const low = k.toLowerCase();
  const mode = F.modes?.find((m) => m.key === low);
  if (mode) { e.preventDefault(); setMode(d, mode.id); return; }
  if (low === 'f' && d.ctl.fit) { e.preventDefault(); d.ctl.fit(); refresh('zoom status'); }
  else if (k === '1' && d.ctl.setZoom) { e.preventDefault(); d.ctl.setZoom(100); refresh('zoom status'); }
  else if ((k === '+' || k === '=') && d.ctl.zoomBy) { e.preventDefault(); d.ctl.zoomBy(1.25); refresh('zoom status'); }
  else if (k === '-' && d.ctl.zoomBy) { e.preventDefault(); d.ctl.zoomBy(0.8); refresh('zoom status'); }
  else if ((k === '[' || k === ']') && d.ctl.step) { e.preventDefault(); d.ctl.step(k === ']' ? 1 : -1); }
  else if (low === 'e') { e.preventDefault(); openExport($('#export')); }
});

// ───────────────────────── ⌘K: page commands (kit setCommands) ─────────────────────────
function updateCommands() {
  const d = S.d; const ready = d?.state === 'ready';
  const base = [
    { id: 'open', label: `Open a ${V.kindShort || 'file'}…`, sub: TOOL.name, icon: 'folder-open', kbd: 'mod+o', run: () => pickFiles() },
    ...(!ready && (V.samples?.[L.id] || V.sample) ? [{ id: 'sample', label: (V.samples?.[L.id] || V.sample).label, sub: 'Sample file', icon: 'sparkles', run: () => $('#empty-sample')?.click() }] : []),
  ];
  const own = ready ? (F.commands?.(d, ctx) || []) : [];
  const tail = ready ? [
    { id: 'export', label: 'Export…', sub: d.name, icon: 'download', kbd: 'e', run: () => openExport($('#export')) },
    ...(F.inspector ? [{ id: 'insp', label: S.insp ? 'Hide details' : 'Show details', icon: 'panel-right', kbd: 'mod+.', run: toggleInspector, searchOnly: true }] : []),
    { id: 'close', label: `Close ${d.name}`, icon: 'x', run: requestClose, searchOnly: true },
  ] : [];
  setCommands([...own, ...base, ...tail]);
}

// ───────────────────────── boot ─────────────────────────
window.addEventListener('fw-theme-change', () => S.d?.ctl?.onTheme?.());
matchMedia('(max-width: 767px)').addEventListener('change', () => refresh());
window.addEventListener('resize', () => S.d?.ctl?.onResize?.());
(async () => {
  if (params.has('fresh')) await store.clear();
  render(); updateCommands();
  if (params.has('sample')) {
    const sample = V.samples?.[L.id] || V.sample;
    const files = await loadSamples(sample.files.map((f) => './samples/' + f).join('|'));
    await onFiles(files, 'sample');
  } else {
    const r = await store.get(KEY);
    if (r?.blob && !S.d) {
      const file = new File([r.blob], r.name, { type: r.type || '' });
      const extra = { mode: r.mode };
      if (r.draft != null) Object.assign(extra, { draft: r.draft, dirty: true, restoredDraft: { at: r.draftAt || Date.now() } });
      await open(file, { restore: extra });
    }
  }
  window.__vwReady = true;
})();
window.__vw = { S, setMode: (m) => setMode(S.d, m), openExport: () => openExport($('#export')), ctx, refresh, openSamples: async (list, source = 'drop') => onFiles(await loadSamples(list.map((f) => './samples/' + f).join('|')), source) };
