// Open · universal viewer ("Lens" frame). One frame for every format: document tabs, mode switch, zoom HUD, Export ▾,
// left list, inspector (Info · Selection · Measure), status line, mobile bottom bar + sheets, ⌘K page commands.
// Formats plug in canvas + panels (formats/*.js). The frame owns chrome, zoom, keys, progress, errors and persistence.
import { mountShell, icon, esc, $, $$, h, enhance, formatBytes, extOf, toast, openSheet, openPopover, openDialog, kbd,
  loadSamples, isMobile, isTyping, hasLayers, pushLayer, shortAgo, effectiveTheme, copyText, focusables } from '../kit/shell.js';
import './icons-extra.js';
import * as store from './store.js';
import { FORMATS, formatFor, TEXT } from './formats/index.js';

const params = new URLSearchParams(location.search);
const S = { docs: [], active: null, list: true, insp: innerWidth > 1100, recents: [], ready: false }; // tablets start with the inspector closed so the stage keeps room
const ENGINES = new Set();
const wb = $('#wb'), wbMain = $('#wb-main'), docsEl = $('#docs');
const doc = () => S.docs.find((d) => d.id === S.active) || null;
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAMPLES = [
  { file: 'grundriss.dxf', label: 'Floor plan', icon: 'box', sub: 'DXF drawing' },
  { file: 'kunden.sqlite', label: 'Customer database', icon: 'database', sub: 'SQLite' },
  { file: 'status.pptx', label: 'Status deck', icon: 'presentation', sub: 'PowerPoint' },
  { file: 'flansch.stl', label: '3D part', icon: 'cylinder', sub: 'STL mesh' },
  { file: 'projektbericht.md', label: 'Report', icon: 'file-text', sub: 'Markdown' },
];

mountShell({
  leaf: params.get('leaf') || 'open-file', archetype: 'workbench', accept: ['*'], acceptLabel: 'Open · each file gets its own tab',
  onFiles: (files, { source } = {}) => openFiles(files, { source }),
  shortcuts: [{ label: 'Open files', keys: 'mod+o' }, { label: 'Save original', keys: 'mod+s' }, { label: 'Export menu', keys: 'e' },
    { label: 'Fit to window', keys: 'f' }, { label: '100 %', keys: '1' }, { label: 'Measure', keys: 'm' }, { label: 'Select', keys: 'v' },
    { label: 'Pan', keys: 'h' }, { label: 'Previous / next page, slide, table', keys: '[' }, { label: 'Toggle inspector', keys: 'mod+.' }],
});
document.title = 'Open file · Fernwork';

// ───────────────────────── helpers given to formats ─────────────────────────
const loadedScripts = new Map();
function loadScript(src) {
  if (!loadedScripts.has(src)) loadedScripts.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); }));
  return loadedScripts.get(src);
}
function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h(`<a download="${esc(name)}" hidden></a>`); a.href = URL.createObjectURL(blob); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const nf = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const baseName = (n) => n.replace(/\.[^.]+$/, '');
// Escape stack shim. Kit gap: shell.js keeps a layer stack but nothing pops it on Escape (only native <dialog>s close).
// Kit addition: one capture-phase Escape listener in shell.js that closes layers.at(-1). Until then: this one listener.
const myLayers = [];
function layer(close) { const un = pushLayer(close); const L = { close, remove: () => { un(); const i = myLayers.indexOf(L); if (i >= 0) myLayers.splice(i, 1); } }; myLayers.push(L); return L.remove; }
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
  const pops = [...document.querySelectorAll('.fw-popover:not(.is-closing)')];
  if (pops.length) { e.preventDefault(); const anchor = [...document.querySelectorAll('[aria-expanded="true"]')].pop(); document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); anchor?.focus({ preventScroll: true }); return; }
  const L = myLayers.at(-1); if (L) { e.preventDefault(); L.remove(); L.close(); }
});
export const ctx = {
  h, esc, icon, kbd, enhance, toast, openSheet, openPopover, openDialog, pushLayer: layer, copyText, download, loadScript, nf, today, baseName,
  isMobile, theme: effectiveTheme, sleep,
  refresh: (parts) => refresh(parts),
  isActive: (d) => d.id === S.active,
  setDirty, saveDraft: (d) => saveDraft(d),
  setMode: (d, m) => setMode(d, m),
  openAs: (d, fmtId) => reopenAs(d, fmtId),
  pickFiles: () => pickFiles(),
  exportMenu: (anchor) => openExport(anchor),
};

// ───────────────────────── open / load ─────────────────────────
function makeDoc(file, extra = {}) {
  const fmt = formatFor(file);
  return { id: uid(), file, name: file.name, size: file.size, ext: extOf(file), fmt, state: 'idle', mode: fmt.modes?.[0]?.id, el: null, listEl: null, ctl: null, data: null, err: null, dirty: false, sel: null, ...extra };
}
async function openFiles(files, { source, activate = true } = {}) {
  if (!files?.length) return;
  const added = [...files].map((f) => makeDoc(f));
  S.docs.push(...added);
  if (activate) S.active = added[0].id;
  render();
  added.forEach((d) => store.putFile({ id: d.id, name: d.name, type: d.file.type, size: d.size, blob: d.file, addedAt: Date.now() }));
  persistSession(); addRecents(added);
  if (source === 'drop' && added.length > 1) toast(`Opening ${added.length} files`, { type: 'info', duration: 1600 });
  added.forEach((d, i) => setTimeout(() => load(d), i * 140));
  return added;
}
function ensureEl(d) {
  if (d.el) return d.el;
  d.el = h(`<section class="ov-doc" id="doc-${d.id}" role="tabpanel" aria-labelledby="tab-${d.id}" data-fmt="${d.fmt.id}"></section>`);
  d.el.hidden = d.id !== S.active;
  docsEl.append(d.el);
  return d.el;
}
async function load(d) {
  if (!S.docs.includes(d) || d.state === 'loading' || d.state === 'ready') return;
  ensureEl(d);
  d.state = 'loading'; d.err = null; d.cancelled = false;
  d.el.dataset.fmt = d.fmt.id;
  const steps = d.fmt.steps(d, ctx);
  d.progress = steps.map((s) => ({ label: s.label, state: 'todo', pct: 0 }));
  const card = renderProgress(d);
  refresh('frame status');
  const t0 = performance.now();
  try {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], p = d.progress[i];
      if (s.engine && ENGINES.has(s.engine)) { p.state = 'done'; p.label = s.cached || s.label; updateProgress(d, card); continue; }
      p.state = 'doing'; updateProgress(d, card);
      await runStep(d, s, p, card);
      if (d.cancelled) return;
      p.state = 'done'; p.pct = 100; if (s.engine) ENGINES.add(s.engine); updateProgress(d, card);
    }
    d.loadMs = performance.now() - t0;
    d.state = 'ready';
    mountDoc(d);
    card.classList.add('is-done'); setTimeout(() => card.remove(), 260);
  } catch (err) {
    if (d.cancelled) return;
    console.info('[open] could not read', d.name, err);
    d.state = 'error'; d.err = err.human ? err : humanError(d, err);
    card.remove(); renderError(d);
  }
  refresh();
}
async function runStep(d, s, p, card) {
  const ms = s.ms ?? 300; const t0 = performance.now(); let realDone = !s.run, realPct = 0;
  const work = s.run ? Promise.resolve(s.run((v) => { realPct = v; })).then((v) => { realDone = true; return v; }) : null;
  await new Promise((resolve, reject) => {
    work?.catch(reject);
    const tick = () => {
      if (d.cancelled) return resolve();
      const tp = Math.min(1, (performance.now() - t0) / ms);
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
  const card = h(`<div class="ov-progress" role="status" aria-live="polite">
    <div class="ov-progress__card">
      <div class="ov-progress__head"><span class="ov-fmticon" data-fmt="${d.fmt.id}">${icon(d.fmt.icon, { size: 18 })}</span>
        <div class="ov-progress__titles"><div class="ov-progress__name">${esc(d.name)}</div><div class="ov-progress__sub">${esc(d.fmt.label)} · ${formatBytes(d.size)}</div></div></div>
      <ol class="ov-steps"></ol>
      <div class="ov-progress__foot"><span class="ov-progress__note">${icon('lock', { size: 12 })} Opened on this device</span>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-cancel>Cancel</button></div>
    </div></div>`);
  card.querySelector('[data-cancel]').onclick = () => { d.cancelled = true; closeDoc(d, { silent: true }); toast(`Stopped opening ${d.name}`, { type: 'neutral' }); };
  d.el.append(card); updateProgress(d, card);
  return card;
}
function updateProgress(d, card) {
  const ol = card.querySelector('.ov-steps');
  ol.innerHTML = d.progress.map((p) => `<li class="ov-step is-${p.state}"><span class="ov-step__icon">${p.state === 'done' ? icon('check', { size: 14 }) : p.state === 'doing' ? '<span class="fw-spinner"></span>' : '<span class="ov-step__dot"></span>'}</span>
    <span class="ov-step__label">${esc(p.label)}</span>${p.state === 'doing' ? `<span class="ov-step__pct">${p.pct} %</span>` : ''}
    ${p.state === 'doing' ? `<span class="fw-progress__track ov-step__bar"><span class="fw-progress__bar" style="--value:${p.pct}%"></span></span>` : ''}</li>`).join('');
  const tab = $(`#tab-${d.id} .fw-ring`); if (tab) tab.style.setProperty('--value', overall(d));
}
const overall = (d) => !d.progress ? 0 : Math.round(d.progress.reduce((s, p) => s + (p.state === 'done' ? 100 : p.pct), 0) / d.progress.length);
function humanError(d, err) {
  return { human: true, title: `${d.name} couldn’t be opened`, why: `It doesn’t look like a valid ${d.fmt.label.toLowerCase()} file (${formatBytes(d.size)}).`, details: String(err?.message || err), alt: ['text', 'hex'] };
}
function renderError(d) {
  const e = d.err;
  const alts = (e.alt || ['text', 'hex']).map((id) => FORMATS.find((f) => f.id === id)).filter(Boolean);
  const card = h(`<div class="ov-error" role="alert">
    <div class="ov-error__card">
      <span class="ov-error__icon">${icon('file-x', { size: 22 })}</span>
      <h2 class="ov-error__title">${esc(e.title)}</h2>
      <p class="ov-error__why">${esc(e.why)}</p>
      <div class="ov-error__actions">
        ${alts[0] ? `<button class="fw-btn fw-btn--primary" type="button" data-as="${alts[0].id}" id="err-open-as">${icon(alts[0].icon)}Open as ${esc(alts[0].asLabel || alts[0].label)}</button>` : ''}
        ${alts.length > 1 ? `<button class="fw-btn" type="button" data-more aria-haspopup="menu" aria-expanded="false">Open as…${icon('chevron-down', { size: 14 })}</button>` : ''}
        <button class="fw-btn fw-btn--ghost" type="button" data-pick>${icon('folder-open')}Choose another file</button>
      </div>
      <details class="ov-error__details"><summary>Details</summary><code>${esc(e.details || '')}</code></details>
    </div></div>`);
  card.querySelector('[data-as]')?.addEventListener('click', (ev) => reopenAs(d, ev.currentTarget.dataset.as));
  card.querySelector('[data-more]')?.addEventListener('click', (ev) => menu(ev.currentTarget, [{ items: FORMATS.filter((f) => f.id !== d.fmt.id && !f.hidden).map((f) => ({ label: f.asLabel || f.label, icon: f.icon, sub: f.exts?.slice(0, 3).map((x) => '.' + x).join(' '), onSelect: () => reopenAs(d, f.id) })) }]));
  card.querySelector('[data-pick]').onclick = () => pickFiles();
  d.el.querySelectorAll('.ov-error').forEach((x) => x.remove());
  d.el.append(card);
}
function reopenAs(d, fmtId) {
  const f = FORMATS.find((x) => x.id === fmtId); if (!f) return;
  d.ctl?.destroy?.(); d.ctl = null; d.el.innerHTML = ''; d.listEl = null; d.data = null; d.sel = null;
  d.fmt = f; d.mode = f.modes?.[0]?.id; d.asOverride = f.id; d.state = 'idle';
  load(d);
}
function mountDoc(d) {
  d.el.querySelectorAll('.ov-view').forEach((x) => x.remove());
  const view = h(`<div class="ov-view" data-mode="${d.mode || ''}"></div>`);
  d.el.prepend(view);
  d.ctl = d.fmt.mount(d, view, ctx) || {};
  d.listEl = d.fmt.list ? d.fmt.list(d, ctx) : null;
  if (d.restoredDraft) showDraftPill(d);
}

// ───────────────────────── tabs / close / session ─────────────────────────
function activate(id) {
  const d = S.docs.find((x) => x.id === id); if (!d) return;
  S.active = id;
  for (const x of S.docs) if (x.el) x.el.hidden = x.id !== id;
  if (d.state === 'idle') load(d);
  render(); persistSession();
  requestAnimationFrame(() => { d.ctl?.onShow?.(); refresh('zoom status'); });
}
function cycle(dir) { if (S.docs.length < 2) return; const i = S.docs.indexOf(doc()); activate(S.docs[(i + dir + S.docs.length) % S.docs.length].id); }
function closeDoc(d, { silent = false, keepDraft = false } = {}) {
  const i = S.docs.indexOf(d); if (i < 0) return;
  const was = { d, i };
  S.docs.splice(i, 1); d.cancelled = true;
  d.el?.remove(); d.ctl?.destroy?.();
  if (S.active === d.id) S.active = S.docs[Math.min(i, S.docs.length - 1)]?.id || null;
  if (S.active) { const a = doc(); if (a.el) a.el.hidden = false; if (a.state === 'idle') load(a); }
  if (!keepDraft) store.patchFile(d.id, { draft: null });
  render(); persistSession();
  if (!silent) toast(`Closed ${d.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.docs.splice(was.i, 0, d); d.el = null; d.ctl = null; d.listEl = null; d.state = 'idle'; d.cancelled = false; activate(d.id); } } });
}
function requestClose(d) {
  if (!d.dirty) return closeDoc(d);
  openDialog({
    title: `Close ${d.name}?`, size: 440,
    body: `<p class="fw-t-sm fw-muted">You changed this file. The draft is saved on this device, so you can keep it for later or export the edited version now.</p>`,
    actions: [
      { label: 'Discard draft', ghost: true, onClick: () => { closeDoc(d, { silent: true }); toast(`Discarded changes to ${d.name}`, { type: 'neutral' }); } },
      { label: 'Export…', onClick: () => { d.fmt.saveOriginal?.(d, ctx); closeDoc(d, { silent: true, keepDraft: true }); } },
      { label: 'Keep draft', primary: true, onClick: () => { closeDoc(d, { silent: true, keepDraft: true }); toast(`Draft of ${d.name} kept in Recent`, { type: 'success' }); } },
    ],
  });
}
let persistT = 0;
function persistSession() {
  clearTimeout(persistT);
  persistT = setTimeout(() => store.setMeta('session', { order: S.docs.map((d) => d.id), active: S.active, modes: Object.fromEntries(S.docs.map((d) => [d.id, d.mode])) }), 150);
}
function setDirty(d, dirty) { if (d.dirty === dirty) return; d.dirty = dirty; refresh('frame status'); }
let draftT = 0;
function saveDraft(d) {
  clearTimeout(draftT); d.saving = true; refresh('status');
  draftT = setTimeout(async () => { await store.patchFile(d.id, { draft: d.draft, draftAt: Date.now() }); d.saving = false; d.savedAt = Date.now(); refresh('status'); }, 450);
}
function showDraftPill(d) {
  const r = d.restoredDraft; const pill = h(`<div class="ov-draftpill" role="status">
    <span class="ov-draftpill__dot"></span><span><strong>Draft restored</strong> · your edits from ${esc(shortAgo(r.at) === 'now' ? 'just now' : shortAgo(r.at) + ' ago')}</span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-orig>Show original</button>
    <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-discard>Discard draft</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss" data-x>${icon('x')}</button></div>`);
  pill.querySelector('[data-x]').onclick = () => pill.remove();
  pill.querySelector('[data-orig]').onclick = (e) => { const on = d.ctl.toggleOriginal?.(); e.currentTarget.textContent = on ? 'Show draft' : 'Show original'; };
  pill.querySelector('[data-discard]').onclick = () => { const old = d.draft; d.ctl.discardDraft?.(); pill.remove(); store.patchFile(d.id, { draft: null }); toast('Draft discarded', { type: 'neutral', action: { label: 'Undo', onClick: () => { d.ctl.setText?.(old); } } }); };
  d.el.append(pill);
  d.restoredDraft = null;
}
async function restoreSession() {
  const ses = await store.getMeta('session');
  if (!ses?.order?.length) return false;
  const recs = (await Promise.all(ses.order.map((id) => store.getFile(id)))).filter(Boolean);
  if (!recs.length) return false;
  for (const r of recs) {
    const file = new File([r.blob], r.name, { type: r.type || '' });
    const d = makeDoc(file, { id: r.id });
    if (ses.modes?.[r.id] && d.fmt.modes?.some((m) => m.id === ses.modes[r.id])) d.mode = ses.modes[r.id];
    if (r.draft != null) { d.draft = r.draft; d.dirty = true; d.restoredDraft = { at: r.draftAt || Date.now() }; }
    S.docs.push(d);
  }
  S.active = S.docs.some((d) => d.id === ses.active) ? ses.active : S.docs[0].id;
  render();
  load(doc());
  return true;
}

// ───────────────────────── recents ─────────────────────────
async function loadRecents() {
  let r = await store.getMeta('recents');
  if (!r) { // first visit: what this browser opened before (sample-backed so they open)
    const now = Date.now();
    r = [
      { name: 'eg-lindenstrasse-14.dxf', sample: 'grundriss.dxf', size: 8359, t: now - 2 * 3600e3 },
      { name: 'auftraege-2025.sqlite', sample: 'kunden.sqlite', size: 405504, t: now - 26 * 3600e3 },
      { name: 'kickoff-bauamt.pptx', sample: 'status.pptx', size: 15000, t: now - 3 * 86400e3 },
      { name: 'notizen-baustelle.md', sample: 'projektbericht.md', size: 1587, t: now - 6 * 86400e3 },
    ];
    store.setMeta('recents', r);
  }
  S.recents = r;
}
function addRecents(ds) {
  const now = Date.now();
  const add = ds.map((d) => ({ name: d.name, size: d.size, id: d.id, t: now }));
  S.recents = [...add, ...S.recents.filter((x) => !add.some((a) => a.name === x.name))].slice(0, 8);
  store.setMeta('recents', S.recents);
}
async function openRecent(r) {
  if (r.id) { const rec = await store.getFile(r.id); if (rec) { openFiles([new File([rec.blob], rec.name, { type: rec.type || '' })], { source: 'recent' }); return; } }
  if (r.sample) { const [f] = await loadSamples(`./samples/${r.sample}>${r.name}`); openFiles([f], { source: 'recent' }); return; }
  toast(`${r.name} is no longer on this device`, { type: 'warning' });
}
function removeRecent(r) {
  const old = S.recents; S.recents = S.recents.filter((x) => x !== r); store.setMeta('recents', S.recents); renderEmpty();
  toast(`Removed ${r.name} from this device`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.recents = old; store.setMeta('recents', old); renderEmpty(); } } });
}

// ───────────────────────── rendering ─────────────────────────
function render() { wb.classList.toggle('is-empty', !S.docs.length); renderEmpty(); refresh(); }
function markStage() { const d = doc(); const st = $('#stage'); if (d?.state === 'ready') st.dataset.fmt = d.fmt.id; else delete st.dataset.fmt; }
function refresh(parts = 'all') {
  const all = parts === 'all', has = (p) => all || parts.includes(p);
  markStage();
  if (has('frame')) renderFrame();
  if (has('list')) renderList();
  if (has('insp')) renderInspector();
  if (has('status')) renderStatus();
  if (has('zoom') || has('frame')) renderZoom();
  if (has('bottom') || has('frame')) renderBottombar();
}
const fmtIcon = (d) => d.state === 'loading' ? `<span class="fw-ring" style="--value:${overall(d)}"></span>` : d.state === 'error' ? `<span class="ov-tab__err">${icon('circle-alert', { size: 14 })}</span>` : `<span class="ov-fmticon ov-fmticon--sm" data-fmt="${d.fmt.id}">${icon(d.fmt.icon, { size: 14 })}</span>`;
function renderFrame() {
  const d = doc(); const fb = $('#framebar');
  const focusId = fb.contains(document.activeElement) ? document.activeElement.id : null;
  const modes = d && d.state === 'ready' && d.fmt.modes?.length > 1 ? d.fmt.modes : null;
  fb.innerHTML = `
    <div class="ov-tabs" role="tablist" aria-label="Open files" id="tabs">${S.docs.map((x) => `
      <div class="ov-tab fw-doctab" role="tab" id="tab-${x.id}" data-id="${x.id}" aria-selected="${x.id === S.active}" aria-controls="doc-${x.id}" tabindex="${x.id === S.active ? 0 : -1}" title="${esc(x.name)} · ${formatBytes(x.size)}">
        ${fmtIcon(x)}<span class="fw-doctab__name">${esc(x.name)}</span>${x.dirty ? '<span class="fw-doctab__dirty" aria-label="Unsaved draft" role="img"></span>' : ''}
        <button class="ov-tab__x" type="button" tabindex="-1" aria-label="Close ${esc(x.name)}" data-close="${x.id}">${icon('x', { size: 14 })}</button></div>`).join('')}
    </div>
    <button class="fw-filechip ov-filechip" type="button" id="filechip" aria-haspopup="menu" aria-expanded="false" ${d ? '' : 'hidden'}>
      ${d ? fmtIcon(d) : ''}<span class="fw-filechip__name">${d ? esc(d.name) : ''}</span>${d?.dirty ? '<span class="fw-doctab__dirty"></span>' : ''}${S.docs.length > 1 ? `<span class="ov-count">${S.docs.length}</span>` : ''}${icon('chevron-down', { size: 14 })}</button>
    ${d ? `<button class="fw-iconbtn fw-iconbtn--sm ov-add" type="button" id="add" aria-label="Open files" data-tip="Open files" data-tip-kbd="mod+o">${icon('plus')}</button>` : `<button class="fw-btn fw-btn--ghost fw-btn--sm ov-add" type="button" id="add">${icon('folder-open')}Open files</button><span class="ov-fbnote fw-hide-compact">Drop files anywhere on this page</span>`}
    ${modes ? `<span class="fw-divider-v fw-hide-compact"></span><div class="fw-seg fw-seg--sm fw-hide-compact ov-modes" aria-label="Mode" id="modes">${modes.map((m) => `<button class="fw-seg__opt" type="button" aria-checked="${m.id === d.mode}" data-value="${m.id}" ${m.key ? `data-tip="${esc(m.label)}" data-tip-kbd="${m.key}"` : ''}>${m.icon ? icon(m.icon, { size: 14 }) : ''}${esc(m.label)}</button>`).join('')}</div>` : ''}
    <span class="fw-spacer"></span>
    <div class="fw-framebar__group fw-hide-compact">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-list" aria-label="Toggle ${esc(d?.fmt.listLabel || 'list')}" data-tip="${esc(d?.fmt.listLabel || 'List')}" aria-pressed="${S.list && !!d?.listEl}" ${d?.listEl ? '' : 'disabled'}>${icon('panel-left')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-insp" aria-label="Toggle inspector" data-tip="Inspector" data-tip-kbd="mod+." aria-pressed="${S.insp && !!d}" ${d ? '' : 'disabled'}>${icon('panel-right')}</button></div>
    <button class="fw-btn fw-btn--primary fw-btn--sm ov-export" type="button" id="export" aria-haspopup="menu" aria-expanded="false" ${d?.state === 'ready' ? '' : 'disabled'}>${icon('download')}<span class="ov-export__label">Export</span>${icon('chevron-down', { size: 14 })}</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="more" aria-label="More" data-tip="More" aria-haspopup="menu" aria-expanded="false">${icon('ellipsis')}</button>`;
  enhance(fb);
  const tabs = $('#tabs');
  tabs.addEventListener('click', (e) => { const x = e.target.closest('[data-close]'); if (x) { e.stopPropagation(); requestClose(S.docs.find((d2) => d2.id === x.dataset.close)); return; } const t = e.target.closest('.ov-tab'); if (t) activate(t.dataset.id); });
  tabs.addEventListener('auxclick', (e) => { const t = e.target.closest('.ov-tab'); if (t && e.button === 1) requestClose(S.docs.find((d2) => d2.id === t.dataset.id)); });
  tabs.addEventListener('keydown', (e) => {
    const t = e.target.closest('.ov-tab'); if (!t) return; const i = S.docs.findIndex((x) => x.id === t.dataset.id);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = S.docs[(i + (e.key === 'ArrowRight' ? 1 : -1) + S.docs.length) % S.docs.length]; activate(n.id); $(`#tab-${n.id}`)?.focus(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); requestClose(S.docs[i]); }
  });
  $(`#tab-${S.active}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#filechip').onclick = (e) => openDocSwitcher(e.currentTarget);
  $('#add').onclick = () => pickFiles();
  $('#modes')?.addEventListener('fw-change', (e) => setMode(d, e.detail.value));
  $('#t-list').onclick = () => { S.list = !S.list; refresh('frame list'); };
  $('#t-insp').onclick = () => toggleInspector();
  $('#export').onclick = (e) => openExport(e.currentTarget);
  $('#more').onclick = (e) => openMore(e.currentTarget);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
function toggleInspector() { S.insp = !S.insp; refresh('frame insp'); }
function setMode(d, m) {
  if (!d || d.mode === m) return; d.mode = m;
  d.el?.querySelector('.ov-view')?.setAttribute('data-mode', m);
  d.ctl?.setMode?.(m); persistSession(); refresh();
}
function renderList() {
  const d = doc(); const list = $('#list');
  const show = !!(d && d.listEl && S.list && d.state === 'ready');
  wbMain.classList.toggle('has-list', show);
  if (!show) { list.replaceChildren(); return; }
  if (list.firstElementChild !== d.listEl) list.replaceChildren(d.listEl);
  d.fmt.updateList?.(d, ctx);
}
function inspSections(d) {
  if (d.state === 'error') return { info: kv([['File', d.name], ['Size', formatBytes(d.size)], ['Type', `.${d.ext || '?'} (couldn’t be read)`]]), selection: null, measure: null };
  if (d.state !== 'ready') return { info: `<div class="ov-skel"><span class="fw-skel"></span><span class="fw-skel"></span><span class="fw-skel"></span></div>`, selection: null, measure: null };
  return d.fmt.inspector(d, ctx);
}
export const kv = (rows) => `<dl class="fw-insp-kv ov-kv">${rows.filter(Boolean).map(([k, v, cls]) => `<dt>${esc(k)}</dt><dd class="${cls || ''}">${v}</dd>`).join('')}</dl>`;
ctx.kv = kv;
function renderInspector() {
  const d = doc(); const el = $('#inspector');
  const show = !!(d && S.insp);
  wbMain.classList.toggle('has-inspector', show);
  if (!show) { el.replaceChildren(); return; }
  const focusId = el.contains(document.activeElement) ? document.activeElement.id : null; const st = el.scrollTop;
  const s = inspSections(d);
  const sec = (id, label, ic, body, empty) => `<section class="fw-insp-section ov-insp-section" id="insp-${id}" aria-labelledby="insp-${id}-h"><div class="fw-insp-section__head" id="insp-${id}-h">${icon(ic, { size: 14 })}${label}${s[id + 'Aside'] || ''}</div>${body || `<p class="ov-hint">${empty}</p>`}</section>`;
  if (d.state !== 'ready') { el.innerHTML = sec('info', 'Info', 'info', s.info, ''); return; }
  el.innerHTML = sec('info', 'Info', 'info', s.info, '') + sec('selection', 'Selection', d.fmt.selIcon || 'mouse-pointer-2', s.selection, d.fmt.selHint || 'Click something to see its details.') + sec('measure', d.fmt.measureLabel || 'Measure', d.fmt.measureIcon || 'ruler', s.measure, d.fmt.measureHint || 'Nothing to measure here.');
  enhance(el); d.fmt.bindInspector?.(d, el, ctx);
  el.scrollTop = st;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
function renderStatus() {
  const d = doc(); const el = $('#status');
  if (!d) { el.innerHTML = `<span class="fw-statusbar__item">No file open</span><span class="fw-statusbar__item">Drop files anywhere · ${kbd('mod+o')} open</span><span class="fw-statusbar__item fw-statusbar__save">${icon('lock', { size: 12 })} On this device · 0 uploads</span>`; return; }
  const items = d.state === 'ready' ? d.fmt.status(d, ctx) : d.state === 'loading' ? [`Opening ${esc(d.name)}…`] : d.state === 'error' ? ['Couldn’t read this file'] : [esc(d.name)];
  const save = d.dirty ? (d.saving ? '<span class="fw-spinner ov-mini-spin"></span>Saving draft…' : `<span class="fw-dotlive"></span>Draft saved on this device${d.savedAt ? ' · ' + new Date(d.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}`) : `${icon('lock', { size: 12 })} On this device`;
  el.innerHTML = items.map((x) => `<span class="fw-statusbar__item">${x}</span>`).join('') + `<span class="fw-statusbar__item">${S.docs.indexOf(d) + 1} of ${S.docs.length}</span><span class="fw-statusbar__item fw-statusbar__save">${save}</span>`;
}
function renderZoom() {
  const d = doc(); const z = $('#zoom'); const c = d?.state === 'ready' ? d.ctl : null;
  if (!c?.zoom) { z.hidden = true; return; }
  z.hidden = false;
  const pct = c.zoom(); const fit = c.isFit?.();
  z.innerHTML = `<button class="fw-iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="-" data-z="-1">${icon('minus')}</button>
    <button class="fw-zoom__pct" type="button" aria-label="Zoom ${pct} %, click to fit" data-tip="${fit ? 'Fitted · click for 100 %' : 'Fit to window'}" data-tip-kbd="${fit ? '1' : 'f'}" data-z="0">${Math.round(pct)} %</button>
    <button class="fw-iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+" data-z="1">${icon('plus')}</button>
    <span class="ov-zoom__sep"></span><button class="fw-iconbtn ${fit ? 'is-on' : ''}" type="button" aria-label="Fit to window" aria-pressed="${!!fit}" data-tip="Fit" data-tip-kbd="f" data-z="fit">${icon('maximize')}</button>`;
  z.onclick = (e) => { const b = e.target.closest('[data-z]'); if (!b) return; const v = b.dataset.z; if (v === 'fit') c.fit(); else if (v === '0') (fit ? c.setZoom(100) : c.fit()); else c.zoomBy(v === '1' ? 1.25 : 0.8); renderZoom(); renderStatus(); };
}
function renderBottombar() {
  const d = doc(); const bb = $('#bottombar');
  if (!d || d.state !== 'ready') { bb.innerHTML = [['folder-open', 'Open', 'open'], ['history', 'Recent', 'recent'], ['info', 'Info', 'info'], ['download', 'Export', 'export']].map(([ic, l, id]) => `<button class="fw-bottombar__btn" type="button" data-slot="${id}" ${d || id === 'open' || id === 'recent' ? '' : 'disabled'}>${icon(ic)}${l}</button>`).join(''); bindSlots(bb, d); return; }
  const slots = d.fmt.mobileSlots?.(d, ctx) || [{ id: 'list', label: d.fmt.listLabel || 'List', icon: d.fmt.listIcon || 'list' }, { id: 'measure', label: 'Measure', icon: 'ruler' }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }];
  bb.innerHTML = slots.map((s) => `<button class="fw-bottombar__btn" type="button" data-slot="${s.id}" ${s.pressed != null ? `aria-pressed="${!!s.pressed}"` : 'aria-expanded="false"'}>${icon(s.icon)}${esc(s.label)}</button>`).join('');
  bindSlots(bb, d, slots);
}
function bindSlots(bb, d, slots = []) {
  bb.onclick = (e) => {
    const b = e.target.closest('[data-slot]'); if (!b || b.disabled) return; const id = b.dataset.slot; const s = slots.find((x) => x.id === id);
    if (s?.run) { s.run(d, ctx, b); return; }
    if (id === 'open') return pickFiles();
    if (id === 'recent') return openDocSwitcher(b);
    if (id === 'list') return listSheet(d, b);
    if (id === 'info' || id === 'measure') return infoSheet(d, b, id);
    if (id === 'export') return exportSheet(d, b);
  };
}
function listSheet(d, b) {
  if (!d.listEl) return;
  b.setAttribute('aria-expanded', 'true');
  const holder = h('<div class="ov-sheetlist"></div>'); holder.append(d.listEl);
  openSheet({ title: d.fmt.listLabel, height: 'peek', body: holder, onClose: () => { b.setAttribute('aria-expanded', 'false'); refresh('list'); } });
}
ctx.listSheet = listSheet;
function infoSheet(d, b, focus = 'info') {
  b?.setAttribute('aria-expanded', 'true');
  const s = inspSections(d);
  const body = h(`<div class="ov-sheetinsp">${s.info ? `<div class="ov-sheetinsp__sec"><div class="fw-label">Info</div>${s.info}</div>` : ''}${s.selection ? `<div class="ov-sheetinsp__sec"><div class="fw-label">Selection</div>${s.selection}</div>` : ''}${s.measure ? `<div class="ov-sheetinsp__sec" id="sheet-measure"><div class="fw-label">${esc(d.fmt.measureLabel || 'Measure')}</div>${s.measure}</div>` : ''}</div>`);
  const sh = openSheet({ title: 'Info', height: 'half', body, onClose: () => b?.setAttribute('aria-expanded', 'false') });
  d.fmt.bindInspector?.(d, body, ctx);
  if (focus === 'measure') body.querySelector('#sheet-measure')?.scrollIntoView({ block: 'start' });
  return sh;
}
ctx.infoSheet = infoSheet;

// ───────────────────────── empty state ─────────────────────────
function renderEmpty() {
  const el = $('#empty');
  if (S.docs.length) { el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  const kinds = [['box', 'Drawings', 'DXF · DWG · IFC'], ['database', 'Databases', 'SQLite · Parquet · CSV'], ['presentation', 'Slides', 'PPTX · ODP'], ['cylinder', '3D', 'STL · OBJ · PLY'], ['file-text', 'Documents', 'Markdown · DOCX · TXT'], ['file-spreadsheet', 'Sheets', 'XLSX · CSV']];
  el.innerHTML = `<div class="ov-empty__inner">
    <div class="fw-intake ov-intake" data-intake aria-label="Open files: choose or drop files">
      <span class="fw-intake__icon">${icon('folder-open', { size: 22 })}</span>
      <span class="fw-intake__title"><span class="fw-pointer-copy">Drop files to open</span><span class="fw-touch-copy">Open any file</span></span>
      <span class="ov-intake__lede">Drawings, databases, slides, 3D models and documents. Several at once open as tabs.</span>
      <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick id="empty-open">${icon('folder-open')}Choose files</button>
        <button class="fw-btn" type="button" data-no-pick id="empty-new">${icon('file-pen')}New note</button></span>
      <span class="fw-intake__sub fw-pointer-copy">${kbd('mod+o')} open<span class="fw-dot"></span>${kbd('mod+v')} paste a file<span class="fw-dot"></span>drop anywhere on the page</span>
      <span class="ov-kinds">${kinds.map(([ic, l, x]) => `<span class="ov-kind" title="${esc(x)}">${icon(ic, { size: 14 })}<span>${l}</span></span>`).join('')}</span>
      <span class="fw-intake__privacy">${icon('lock', { size: 12 })} Opened on this device. Nothing is uploaded.</span>
    </div>
    <div class="ov-samples" role="group" aria-label="Try a sample"><span class="ov-samples__label">Try a sample</span>
      ${SAMPLES.map((s) => `<button class="fw-chip fw-chip--sample" type="button" data-sample-file="${s.file}">${icon(s.icon, { size: 14 })}${esc(s.label)}</button>`).join('')}
      <button class="fw-chip fw-chip--sample" type="button" data-sample-file="*">${icon('files', { size: 14 })}All five</button></div>
    ${S.recents.length ? `<section class="ov-recents" aria-labelledby="rec-h"><div class="ov-recents__head"><h2 class="ov-recents__title" id="rec-h">Recent on this device</h2><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="rec-clear">Clear all</button></div>
      <div class="ov-recents__list">${S.recents.map((r, i) => { const f = formatFor({ name: r.name }); return `<div class="ov-recent"><button class="ov-recent__open" type="button" data-rec="${i}"><span class="ov-fmticon" data-fmt="${f.id}">${icon(f.icon, { size: 16 })}</span><span class="ov-recent__main"><span class="ov-recent__name">${esc(r.name)}</span><span class="ov-recent__sub">${esc(f.label)} · ${formatBytes(r.size || 0)}</span></span><span class="ov-recent__when">${esc(shortAgo(r.t))}</span></button><button class="fw-iconbtn fw-iconbtn--sm ov-recent__x" type="button" aria-label="Remove ${esc(r.name)} from this device" data-tip="Remove from this device" data-recx="${i}">${icon('x')}</button></div>`; }).join('')}</div></section>` : ''}
  </div>`;
  enhance(el);
  el.querySelectorAll('[data-sample-file]').forEach((b) => b.addEventListener('click', async () => {
    const f = b.dataset.sampleFile; b.classList.add('is-busy');
    const files = await loadSamples(f === '*' ? SAMPLES.map((s) => './samples/' + s.file).join('|') : './samples/' + f);
    openFiles(files, { source: 'sample' });
  }));
  el.querySelector('#empty-new').onclick = () => openFiles([new File([`# Untitled note\n\n`], 'Untitled note.md', { type: 'text/markdown' })]).then((ds) => { const d = ds?.[0]; if (d) d.mode = 'source'; });
  el.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => openRecent(S.recents[+b.dataset.rec])));
  el.querySelectorAll('[data-recx]').forEach((b) => (b.onclick = () => removeRecent(S.recents[+b.dataset.recx])));
  el.querySelector('#rec-clear')?.addEventListener('click', () => { const old = S.recents; S.recents = []; store.setMeta('recents', []); renderEmpty(); toast('Recent files cleared from this device', { type: 'neutral', action: { label: 'Undo', onClick: () => { S.recents = old; store.setMeta('recents', old); renderEmpty(); } } }); });
}

// ───────────────────────── menus ─────────────────────────
function menu(anchor, groups, opts = {}) {
  // ExportMenu-shaped menu with an optional live filename row (.fw-export__file). Kit addition candidate.
  const el = h(`<div class="fw-menu ov-menu" role="menu">${opts.file ? `<div class="fw-export__file" aria-live="polite">${icon('file', { size: 12 })}<span>Saves as</span><code id="exp-file">${esc(opts.file)}</code></div>` : ''}</div>`);
  const flat = [];
  groups.forEach((g) => {
    if (!g.items.length) return;
    const wrap = h(`<div class="fw-menu__group" role="group" ${g.group ? `aria-label="${esc(g.group)}"` : ''}>${g.group ? `<div class="fw-menu__label" aria-hidden="true">${esc(g.group)}</div>` : ''}</div>`);
    g.items.forEach((it) => {
      const b = h(`<button type="button" class="fw-menu__item ${it.danger ? 'fw-menu__item--danger' : ''}" role="${it.checked === undefined ? 'menuitem' : 'menuitemradio'}" tabindex="-1" ${it.checked !== undefined ? `aria-checked="${!!it.checked}"` : ''} ${it.disabled ? 'disabled' : ''} ${it.id ? `data-id="${esc(it.id)}"` : ''}>
        ${it.icon ? icon(it.icon) : ''}<span class="ov-menu__text">${esc(it.label)}${it.sub ? `<span class="fw-menu__sub">${esc(it.sub)}</span>` : ''}</span>
        ${it.kbd ? `<span class="fw-menu__hint">${kbd(it.kbd)}</span>` : it.hint ? `<span class="fw-menu__hint">${esc(it.hint)}</span>` : ''}${it.checked !== undefined ? icon('check', { className: 'fw-menu__check' }) : ''}</button>`);
      b.onclick = () => { p.close(true); it.onSelect?.(); };
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
ctx.menu = menu;
function exportGroups(d) {
  const g = d.fmt.exports(d, ctx);
  const orig = { group: 'Original', items: [{ id: 'original', label: d.dirty ? `${d.ext.toUpperCase()} with your edits` : `Original ${d.ext.toUpperCase()}`, icon: 'download', file: d.name, kbd: 'mod+s', onSelect: () => saveOriginal(d) }] };
  return [orig, ...g.filter((x) => x.items.length)];
}
function saveOriginal(d) {
  if (d.fmt.saveOriginal) return d.fmt.saveOriginal(d, ctx);
  download(d.name, d.file); toast(`Saved ${d.name} · ${formatBytes(d.size)}`);
}
function openExport(anchor) {
  const d = doc(); if (!d || d.state !== 'ready') return;
  const groups = exportGroups(d);
  return menu(anchor, groups, { file: groups[0].items[0].file, placement: 'bottom-end', className: 'ov-exportmenu' });
}
function exportSheet(d, b) {
  b?.setAttribute('aria-expanded', 'true');
  const groups = exportGroups(d);
  const body = h(`<div class="ov-exportsheet">${groups.map((g) => `<div class="ov-exportsheet__group"><div class="fw-label">${esc(g.group)}</div>${g.items.map((it, i) => `<button class="ov-exportsheet__item" type="button" data-g="${esc(g.group)}" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${icon(it.icon || 'download')}<span class="ov-exportsheet__text"><span>${esc(it.label)}</span><code>${esc(it.file || it.sub || '')}</code></span></button>`).join('')}</div>`).join('')}</div>`);
  const sh = openSheet({ title: 'Export', height: 'half', body, onClose: () => b?.setAttribute('aria-expanded', 'false') });
  body.onclick = (e) => { const x = e.target.closest('[data-g]'); if (!x) return; const it = groups.find((g) => g.group === x.dataset.g).items[+x.dataset.i]; sh.close(); setTimeout(() => it.onSelect?.(), 200); };
}
function openDocSwitcher(anchor) {
  if (isMobile()) {
    const body = h(`<div class="ov-switch">${S.docs.map((x) => `<button class="ov-switch__item" type="button" data-id="${x.id}" aria-current="${x.id === S.active}">${fmtIcon(x)}<span class="ov-switch__main"><span class="ov-switch__name">${esc(x.name)}</span><span class="ov-switch__sub">${esc(x.fmt.label)} · ${formatBytes(x.size)}${x.dirty ? ' · draft' : ''}</span></span>${x.id === S.active ? icon('check') : ''}</button>`).join('')}
      <button class="fw-btn fw-btn--block" type="button" data-open>${icon('folder-open')}Open files</button></div>`);
    const sh = openSheet({ title: S.docs.length ? `Open files · ${S.docs.length}` : 'Open', height: 'half', body });
    body.onclick = (e) => { const it = e.target.closest('[data-id]'); if (it) { sh.close(); activate(it.dataset.id); } if (e.target.closest('[data-open]')) { sh.close(); pickFiles(); } };
    return;
  }
  menu(anchor, [{ group: 'Open files', items: S.docs.map((x) => ({ label: x.name, sub: `${x.fmt.label} · ${formatBytes(x.size)}`, icon: x.fmt.icon, checked: x.id === S.active, onSelect: () => activate(x.id) })) },
    { group: '', items: [{ label: 'Open files…', icon: 'folder-open', kbd: 'mod+o', onSelect: pickFiles }] }]);
}
function openMore(anchor) {
  const d = doc();
  const alts = d ? FORMATS.filter((f) => f.id !== d.fmt.id && !f.hidden) : [];
  menu(anchor, [
    { group: '', items: [{ label: 'Open files…', icon: 'folder-open', kbd: 'mod+o', onSelect: pickFiles },
      ...(d ? [{ label: 'Open as…', icon: 'replace', sub: `Now: ${d.fmt.label}`, onSelect: () => menu(anchor, [{ group: `Open ${d.name} as`, items: alts.map((f) => ({ label: f.asLabel || f.label, icon: f.icon, onSelect: () => reopenAs(d, f.id) })) }], { placement: 'bottom-end' }) }] : [])] },
    { group: '', items: [...(d ? [{ label: 'Close tab', icon: 'x', onSelect: () => requestClose(d) }] : []), ...(S.docs.length > 1 ? [{ label: 'Close all', icon: 'x', onSelect: closeAll }] : []),
      { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', onSelect: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) }] },
  ], { placement: 'bottom-end' });
}
function closeAll() {
  const old = [...S.docs]; const act = S.active;
  for (const d of old) { d.el?.remove(); d.ctl?.destroy?.(); }
  S.docs = []; S.active = null; render(); persistSession();
  toast(`Closed ${old.length} files`, { type: 'neutral', action: { label: 'Undo', onClick: () => { for (const d of old) { d.el = null; d.ctl = null; d.listEl = null; d.state = 'idle'; } S.docs = old; activate(act); } } });
}
function pickFiles() {
  const i = h('<input type="file" multiple hidden>');
  i.onchange = () => { openFiles([...i.files], { source: 'picker' }); i.remove(); };
  document.body.append(i); i.click();
}

// ───────────────────────── keyboard (scoped to the frame; never inside inputs) ─────────────────────────
document.addEventListener('keydown', (e) => {
  const d = doc(); const k = e.key; const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey) {
    const kk = k.toLowerCase();
    if (kk === 'o') { e.preventDefault(); pickFiles(); return; }
    if (kk === 's' && d?.state === 'ready') { e.preventDefault(); saveOriginal(d); return; }
    if (kk === '.') { e.preventDefault(); toggleInspector(); return; }
    if (kk === 'e' && e.shiftKey && d) { e.preventDefault(); openExport($('#export')); return; }
    if ((kk === '0') && d?.ctl?.fit && !isTyping()) { e.preventDefault(); d.ctl.fit(); refresh('zoom status'); return; }
    if ((kk === '=' || kk === '+' || kk === '-') && d?.ctl?.zoomBy && !isTyping()) { e.preventDefault(); d.ctl.zoomBy(kk === '-' ? 0.8 : 1.25); refresh('zoom status'); return; }
    return;
  }
  if (e.altKey || !d || d.state !== 'ready' || isTyping() || hasLayers() || e.defaultPrevented) return;
  if (e.target.closest?.('.fw-popover,dialog,input,select,textarea,[contenteditable="true"]')) return;
  if (e.target.closest?.('.ov-tabs') && /^(Arrow|Delete|Backspace|Home|End)/.test(k)) return;
  if (d.ctl.key?.(e) === true) { e.preventDefault(); return; }
  const low = k.toLowerCase();
  const mode = d.fmt.modes?.find((m) => m.key === low);
  if (mode) { e.preventDefault(); setMode(d, mode.id); return; }
  if (low === 'f' && d.ctl.fit) { e.preventDefault(); d.ctl.fit(); refresh('zoom status'); }
  else if (k === '1' && d.ctl.setZoom) { e.preventDefault(); d.ctl.setZoom(100); refresh('zoom status'); }
  else if ((k === '+' || k === '=') && d.ctl.zoomBy) { e.preventDefault(); d.ctl.zoomBy(1.25); refresh('zoom status'); }
  else if (k === '-' && d.ctl.zoomBy) { e.preventDefault(); d.ctl.zoomBy(0.8); refresh('zoom status'); }
  else if ((k === '[' || k === ']') && d.ctl.step) { e.preventDefault(); d.ctl.step(k === ']' ? 1 : -1); }
  else if (low === 'e') { e.preventDefault(); openExport($('#export')); }
});

// ───────────────────────── command bar: page commands for the open file ─────────────────────────
// Kit addition candidate: mountShell({ commands: (q) => [...] }). Until then rows are injected into the kit palette.
function pageCommands(q) {
  const d = doc(); const t = q.trim().toLowerCase(); if (!d || !t) return [];
  const out = d.state === 'ready' ? (d.fmt.commands?.(d, t, ctx) || []) : [];
  const add = (re, c) => { if (re.test(t)) out.push(c); };
  add(/^(fit|zoom)/, { label: 'Fit to window', sub: 'F', icon: 'maximize', run: () => { d.ctl?.fit?.(); refresh('zoom status'); } });
  add(/^(export|save|download)/, { label: `Save original · ${d.name}`, sub: kbd('mod+s').replace(/<[^>]+>/g, ''), icon: 'download', run: () => saveOriginal(d) });
  add(/^(open as|as text|text|hex)/, { label: `Open ${d.name} as text`, sub: 'See the raw contents', icon: 'file-text', run: () => reopenAs(d, 'text') });
  add(/^(close|tab)/, { label: `Close ${d.name}`, sub: 'Undo available', icon: 'x', run: () => requestClose(d) });
  add(/^(next|tab|switch)/, { label: 'Next tab', sub: S.docs[(S.docs.indexOf(d) + 1) % S.docs.length].name, icon: 'arrow-right', run: () => cycle(1) });
  add(/^(insp|panel|info)/, { label: S.insp ? 'Hide inspector' : 'Show inspector', sub: '⌘.', icon: 'panel-right', run: toggleInspector });
  return out.slice(0, 5);
}
new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.('dialog.fw-cmd')) hookCmd(n); }).observe(document.body, { childList: true });
function hookCmd(dlg) {
  const input = dlg.querySelector('.fw-cmd__input'), list = dlg.querySelector('.fw-cmd__list');
  let cmds = [], sel = null;
  const inject = () => {
    list.querySelectorAll('.ov-pc,.ov-pc-g').forEach((x) => x.remove());
    cmds = pageCommands(input.value); sel = cmds.length ? 0 : null;
    if (!cmds.length) return;
    const frag = document.createDocumentFragment();
    frag.append(h(`<div class="fw-cmd__group ov-pc-g" role="presentation">This file · ${esc(doc().name)}</div>`));
    cmds.forEach((c, i) => {
      const row = h(`<div class="fw-cmd__item ov-pc" role="option" id="ov-pc-${i}" data-pc="${i}"><span class="fw-cmd__icon">${icon(c.icon)}</span><span class="fw-cmd__text"><span class="fw-cmd__name">${esc(c.label)}</span><span class="fw-cmd__meta">${esc(c.sub || '')}</span></span><span class="fw-cmd__enter">Run ${kbd('enter')}</span></div>`);
      row.addEventListener('click', () => run(i)); row.addEventListener('pointermove', () => mark(i));
      frag.append(row);
    });
    list.querySelector('.fw-cmd__empty')?.remove();
    list.prepend(frag); mark(0);
  };
  const mark = (i) => { sel = i; list.querySelectorAll('[role=option]').forEach((o) => o.setAttribute('aria-selected', String(o.dataset.pc === String(i)))); if (i != null) input.setAttribute('aria-activedescendant', `ov-pc-${i}`); };
  const run = (i) => { const c = cmds[i]; dlg.dispatchEvent(new Event('cancel', { cancelable: true })); setTimeout(() => c.run(), 60); };
  input.addEventListener('input', inject);
  input.addEventListener('keydown', (e) => {
    if (sel == null) { if (e.key === 'ArrowUp' && cmds.length && list.querySelector('[data-idx="0"][aria-selected="true"]')) { e.preventDefault(); e.stopImmediatePropagation(); mark(cmds.length - 1); } return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); run(sel); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); if (sel < cmds.length - 1) mark(sel + 1); else { sel = null; list.querySelectorAll('.ov-pc').forEach((o) => o.setAttribute('aria-selected', 'false')); const f = list.querySelector('[data-idx="0"]'); if (f) { f.setAttribute('aria-selected', 'true'); input.setAttribute('aria-activedescendant', f.id); } } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); if (sel > 0) mark(sel - 1); }
  }, true);
  inject();
}

// ───────────────────────── boot ─────────────────────────
window.addEventListener('fw-theme-change', () => { for (const d of S.docs) d.ctl?.onTheme?.(); });
matchMedia('(max-width: 767px)').addEventListener('change', () => refresh());
window.addEventListener('resize', () => { const d = doc(); d?.ctl?.onResize?.(); });
(async () => {
  if (params.has('fresh')) await store.clearAll();
  await loadRecents();
  render();
  const open = params.get('open');
  if (open) {
    await store.setMeta('session', null);
    const names = open.split(',').filter(Boolean);
    const files = await loadSamples(names.map((n) => './samples/' + n).join('|'));
    await openFiles(files, { source: 'sample' });
    const pick = params.get('tab'); if (pick) { const t = S.docs.find((d) => d.name.startsWith(pick)); if (t) activate(t.id); }
  } else await restoreSession();
  S.ready = true; window.__ovReady = true;
})();
window.__ov = { S, doc, activate, setMode: (m) => setMode(doc(), m), openExport: () => openExport($('#export')), ENGINES };
