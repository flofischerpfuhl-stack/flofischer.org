// Textbench: one editor, many lenses (JSON · Compare · Regex · Stats · Transform). Fernwork One mockup, archetype A.
import {
  mountShell, icon, esc, $, $$, h, enhance, toast, openSheet, openMenu, openPopover, kbd, isMobile, isTyping, copyText,
  pushLayer, formatBytes, store, loadSamples, navigate, getLeaf, hrefFor,
} from '../kit/shell.js';
import * as E from './editor.js';
import { detectKind, pdfPasteScore, repairEdits, pathAt, offsetOfPath, fmtN, summarize as jsonSummary } from './json.js';
import { compare, unifiedPatch } from './diff.js';
import { parseRegex, explain, nestedQuantifier, saferPattern, RegexRunner } from './regex.js';
import { STEPS, PRESETS, ADDABLE, runRecipe, previewMarks, summaryLine, CASES } from './transform.js';
import { analyze, fmtTime, TARGETS, graphemes, words as countWords } from './stats.js';
import { xicon } from './xicons.js';

// ───────────────────────── setup ─────────────────────────
const params = new URLSearchParams(location.search);
const leafId = params.get('leaf') || 'textbench';
if (leafId === 'ascii-art') location.replace('ascii.html' + location.search);
const LENSES = [
  { id: 'json', label: 'JSON', icon: 'braces', leaf: 'format-json', key: '1' },
  { id: 'compare', label: 'Compare', icon: 'git-compare', leaf: 'compare-text', key: '2' },
  { id: 'regex', label: 'Regex', icon: 'regex', leaf: 'test-regex', key: '3' },
  { id: 'stats', label: 'Stats', icon: 'sigma', leaf: 'word-count', key: '4' },
  { id: 'transform', label: 'Transform', icon: 'replace', leaf: 'transform-text', key: '5' },
];
const LEAF_LENS = { 'format-json': 'json', 'compare-text': 'compare', 'test-regex': 'regex', 'word-count': 'stats', 'transform-text': 'transform' };
const KIND_LABEL = { json: 'JSON', md: 'Markdown', log: 'Log', text: 'Plain text' };
const TEXT_EXT = /\.(json|geojson|ndjson|md|markdown|txt|log|csv|tsv|ya?ml|xml|toml|ini|conf|cfg|env|srt|vtt|html?|css|js|ts|sql|diff|patch)$/i;
const S = {
  docs: [], active: -1, lens: LEAF_LENS[leafId] || 'stats', panel: true, keep: store.get('text-keep') === true,
  indent: 2, sortKeys: false, expanded: new Set(['$', '$.orders']),
  cmp: { a: null, b: null, mode: 'split', ignoreWs: false, ignoreCase: false, cur: -1 },
  rx: { src: '', flags: 'gm', replace: '', res: null, err: null, timeout: null, last: null },
  target: 'none', longOn: true, recipe: [], recipeLabel: '', applied: null,
};
const strCache = new WeakMap();
const textOf = (doc) => { let s = strCache.get(doc); if (s == null) { s = doc.toString(); strCache.set(doc, s); } return s; };
const cur = () => S.docs[S.active];
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bytesOf = (s) => (s.length > 2e6 ? Math.round(s.length * 1.0) : new TextEncoder().encode(s).length);

// workers
const jsonW = new Worker(new URL('./json-worker.js', import.meta.url), { type: 'module' });
let jseq = 0; const jwait = new Map();
jsonW.onmessage = (e) => { const r = jwait.get(e.data.id); if (r) { jwait.delete(e.data.id); r(e.data); } };
const jsonJob = (op, text, opts = {}) => new Promise((res) => { const id = ++jseq; jwait.set(id, res); jsonW.postMessage({ id, op, text, ...opts }); });
const rxRunner = new RegexRunner(new URL('./regex-worker.js', import.meta.url), 1000);

const shell = mountShell({
  leaf: leafId, archetype: 'workbench',
  // with names (drop/picker) check extensions; during a drag only MIME types are known
  accept: (s) => (s.names.length ? s.names.every((n) => TEXT_EXT.test(n)) : s.kinds.every((k) => k === 'text' || k === 'data' || k === 'unknown' || (k === 'doc' && /^(md|html)$/.test(s.ext)))),
  acceptLabel: 'Textbench',
  onFiles: (files, meta) => openFiles(files, meta),
  onPasteText: (t) => { if (!cur() || view.state.doc.length) newTab(); view.focus(); insertPasted(t); return true; },
  dropActions: (s, files) => s.kind === 'pdf' || s.kind === 'doc' ? [{ id: 'extract', label: 'Extract text into Textbench', sub: 'Text · editable, PDF line breaks fixed on request', icon: 'text-cursor', run: (f) => extractText(f) }]
    : s.kind === 'image' ? [{ id: 'ascii', label: 'Make ASCII art', sub: 'Text · ASCII art studio', icon: 'case-sensitive', run: (f) => navigate('ascii-art', { files: f }) }] : [],
  shortcuts: [
    { label: 'Format JSON', keys: 'shift+mod+f' }, { label: 'Run the lens action (Apply, Format…)', keys: 'mod+enter' },
    { label: 'Switch lens', keys: 'alt+1' }, { label: 'Next / previous change', keys: 'f7' }, { label: 'Toggle panel', keys: 'mod+\\' },
    { label: 'New tab', keys: 'alt+n' }, { label: 'Find in text', keys: 'mod+f' },
  ],
});
document.title = `${getLeaf(leafId)?.name || 'Textbench'} · Fernwork`;

// ───────────────────────── editor ─────────────────────────
const editorHandlers = E.domHandlersExt({
  paste(e) { const t = e.clipboardData?.getData('text/plain'); if (!t) return false; e.preventDefault(); insertPasted(t); return true; },
});
let view;
function makeDocState(text, kind) { return E.makeState(text, { kind, extra: [editorHandlers] }); }
function newDoc({ name, text = '', kind, origin = 'new' }) {
  kind = kind || detectKind(text, name);
  const d = { id: Math.random().toString(36).slice(2, 8), name, kind, origin, versions: [], json: null, bytes: 0 };
  d.state = makeDocState(text, kind);
  return d;
}
function addDoc(d, { activate = true } = {}) { S.docs.push(d); if (activate) switchTo(S.docs.length - 1); else renderTabs(); return d; }
function switchTo(i) {
  if (cur() && view) cur().state = view.state;
  S.active = i; view.setState(cur().state);
  S.rx.res = null; S.applied = null;
  if (S.lens === 'compare') {
    const id = cur().id; const inCmp = [S.cmp.a, S.cmp.b].some((x) => x?.doc === id || x?.version?.doc === id);
    if (!inCmp) { if (view.state.doc.length) { S.cmp.b = { doc: id }; S.cmp.a = null; } else S.lens = 'stats'; }
    $$('#lensseg .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.lens)));
  }
  onDocReplaced();
}
function newTab() { addDoc(newDoc({ name: `Untitled ${S.docs.filter((d) => d.origin === 'new').length + 1}` })); view.focus(); }
function closeTab(i) {
  const d = S.docs[i]; if (cur()) cur().state = view.state;
  const wasActive = i === S.active;
  S.docs.splice(i, 1);
  if (!S.docs.length) { S.docs.push(newDoc({ name: 'Untitled 1' })); }
  S.active = Math.min(wasActive ? i : S.active > i ? S.active - 1 : S.active, S.docs.length - 1);
  view.setState(cur().state); onDocReplaced();
  if (d.state.doc.length) toast(`Closed ${d.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { if (cur()) cur().state = view.state; S.docs.splice(i, 0, d); switchTo(i); } } });
}
function setKind(d, kind, size = view.state.doc.length) {
  d.kind = kind; $('#editor').classList.toggle('is-prose', kind === 'md' || kind === 'text');
  view.dispatch({ effects: [E.langConf.reconfigure(E.langExt(kind, size)), E.wrapConf.reconfigure(kind === 'json' || kind === 'log' ? [] : E.View.lineWrapping)] });
}
function insertPasted(text) {
  const d = cur(); const wasEmpty = view.state.doc.length === 0;
  if (wasEmpty) {
    const kind = detectKind(text);
    if (kind !== d.kind || text.length > 1e6) setKind(d, kind, text.length);
    if (d.origin === 'new') { d.name = kind === 'json' ? 'Pasted JSON' : kind === 'log' ? 'Pasted log' : 'Pasted text'; d.origin = 'paste'; }
  }
  view.dispatch({ ...view.state.replaceSelection(text), userEvent: 'input.paste', scrollIntoView: !wasEmpty });
  if (wasEmpty) { view.dispatch({ selection: { anchor: 0 }, effects: E.View.scrollIntoView(0) }); onDocReplaced(); offerDetection(text); }
}

const onUpdate = (v, trs) => {
  const changed = trs.some((t) => t.docChanged);
  const sel = trs.some((t) => t.selection);
  if (changed) {
    const d = cur(); d.dirty = true;
    if (view.state.doc.length === 0 || trs.some((t) => t.isUserEvent('input.paste'))) renderEmpty();
    scheduleLens(); scheduleSize(); schedulePersist();
    if (d.kind === 'json') scheduleValidate();
    renderTabs(); hideDetect(false);
  }
  if (changed || sel) { renderStatus(); schedulePath(); if (S.lens === 'stats') scheduleStatsSel(); }
  if (changed) renderUndo();
};

// ───────────────────────── DOM skeleton ─────────────────────────
const wb = $('#wb'); const wbMain = $('#wb-main'); const stage = $('#stage'); const panelEl = $('#panel');
view = E.createView($('#editor'), { state: makeDocState('', 'text'), onUpdate });
view.dom.addEventListener('keydown', (e) => {
  if (detect.open && e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); detect.accept(); }
}, true);

// ───────────────────────── frame bar ─────────────────────────
function renderFramebar() {
  $('#framebar').innerHTML = `
    <button class="fw-filechip fw-show-mobile" type="button" id="docchip" aria-haspopup="menu" aria-expanded="false"><span class="fw-filechip__thumb" id="docchip-ic"></span><span class="fw-filechip__name" id="docchip-name"></span>${icon('chevron-down', { size: 14 })}</button>
    <div class="tb-tabs fw-hide-compact" id="tabs" role="tablist" aria-label="Open texts"></div>
    <button class="fw-iconbtn fw-iconbtn--sm fw-hide-compact" type="button" id="newtab" aria-label="New text" data-tip="New text" data-tip-kbd="alt+n">${icon('plus')}</button>
    <span class="fw-divider-v fw-hide-compact"></span>
    <div class="fw-seg fw-seg--sm tb-lensseg fw-hide-compact" aria-label="Lens" id="lensseg">${LENSES.map((l) => `<button class="fw-seg__opt" type="button" data-value="${l.id}" aria-checked="${S.lens === l.id}" data-tip="${l.label} lens" data-tip-kbd="alt+${l.key}">${icon(l.icon, { size: 14 })}<span class="tb-lensseg__label">${l.label}</span></button>`).join('')}</div>
    <span class="fw-spacer"></span>
    <div class="fw-framebar__group">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z">${icon('undo-2')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm fw-hide-compact" type="button" id="redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z">${icon('redo-2')}</button></div>
    <span class="fw-divider-v fw-hide-compact"></span>
    <div class="fw-framebar__group fw-hide-compact">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-wrap" aria-label="Wrap lines" data-tip="Wrap lines" data-tip-kbd="alt+z" aria-pressed="false">${xicon('wrap-text')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="t-panel" aria-label="Toggle lens panel" data-tip="Lens panel" data-tip-kbd="mod+\\" aria-pressed="true">${icon('panel-right')}</button></div>
    <button class="fw-btn fw-btn--primary fw-btn--sm fw-hide-compact" type="button" id="primary"></button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="More" data-tip="More" id="more">${icon('ellipsis')}</button>`;
  enhance($('#framebar'));
  $('#lensseg').addEventListener('fw-change', (e) => setLens(e.detail.value));
  $('#newtab').onclick = newTab;
  $('#undo').onclick = () => { E.undo(view); view.focus(); };
  $('#redo').onclick = () => { E.redo(view); view.focus(); };
  $('#t-wrap').onclick = toggleWrap;
  $('#t-panel').onclick = () => { S.panel = !S.panel; layoutPanel(); };
  $('#primary').onclick = () => primaryAction()?.run();
  $('#more').onclick = (e) => openMore(e.currentTarget);
  $('#docchip').onclick = (e) => openMenu(e.currentTarget, [
    { group: 'Open texts', items: S.docs.map((d, i) => ({ label: d.name, sub: d.state.doc.length || i === S.active ? `${KIND_LABEL[d.kind]} · ${formatBytes(i === S.active ? view.state.doc.length : d.state.doc.length)}` : 'Empty', checked: i === S.active, onSelect: () => switchTo(i) })) },
    { group: '', items: [{ label: 'New text', icon: 'plus', onSelect: newTab }, { label: 'Open file…', icon: 'folder-open', onSelect: pickFiles }] }]);
}
function renderTabs() {
  const tabs = $('#tabs'); if (!tabs) return;
  tabs.innerHTML = S.docs.map((d, i) => `<div class="fw-doctab tb-tab" role="tab" tabindex="${i === S.active ? 0 : -1}" aria-selected="${i === S.active}" data-i="${i}" title="${esc(d.name)}">
      <span class="tb-tab__ic">${icon(d.kind === 'json' ? 'braces' : d.kind === 'log' ? 'list' : 'file-text', { size: 13 })}</span><span class="fw-doctab__name">${esc(d.name)}</span>
      ${d.json && d.json.ok === false ? '<span class="tb-tab__err" aria-label="Has an error"></span>' : d.dirty && d.origin === 'file' ? '<span class="fw-doctab__dirty" aria-label="Edited"></span>' : ''}
      <button class="tb-tab__x" type="button" aria-label="Close ${esc(d.name)}" data-close="${i}">${icon('x', { size: 12 })}</button></div>`).join('');
  $$('.tb-tab', tabs).forEach((t) => t.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) return; if (+t.dataset.i !== S.active) switchTo(+t.dataset.i); }));
  $$('[data-close]', tabs).forEach((b) => (b.onclick = () => closeTab(+b.dataset.close)));
  tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const d = cur(); if (d) { $('#docchip-name').textContent = d.name; $('#docchip-ic').innerHTML = icon(d.kind === 'json' ? 'braces' : 'file-text', { size: 13 }); }
}
function renderUndo() {
  const u = E.undoDepth(view.state), r = E.redoDepth(view.state);
  $('#undo').disabled = !u; $('#redo').disabled = !r;
}
function renderLensControls() {
  $$('#lensseg .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.lens)));
  $$('#lenschips .fw-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.lens === S.lens)));
  const p = primaryAction(); const b = $('#primary');
  if (p) { b.hidden = false; b.innerHTML = `${p.icon ? xicon(p.icon) : ''}<span>${esc(p.label)}</span>`; b.disabled = !!p.disabled; b.dataset.tip = p.tip || p.label; if (p.kbd) b.dataset.tipKbd = p.kbd; else delete b.dataset.tipKbd; } else b.hidden = true;
  const m = $('#m-primary'); if (m) { if (p) { m.hidden = false; m.innerHTML = `${p.icon ? xicon(p.icon) : ''}<span>${esc(p.mlabel || p.label)}</span>`; m.disabled = !!p.disabled; } else m.hidden = true; }
  $('#t-wrap').setAttribute('aria-pressed', String(isWrapped()));
}
function isWrapped() { return view.contentDOM.classList.contains('cm-lineWrapping'); }
function toggleWrap() { const on = !isWrapped(); view.dispatch({ effects: E.wrapConf.reconfigure(on ? E.View.lineWrapping : []) }); renderLensControls(); }
function openMore(anchor) {
  const d = cur();
  openMenu(anchor, [
    { group: '', items: [
      { label: 'New text', icon: 'plus', kbd: 'alt+n', onSelect: newTab },
      { label: 'Open file…', icon: 'folder-open', kbd: 'mod+o', onSelect: pickFiles },
      { label: `Save ${d?.name || ''}`, icon: 'download', kbd: 'mod+s', onSelect: saveFile },
      { label: 'Copy all text', icon: 'copy', onSelect: () => copyText(view.state.doc.toString(), null, { toastLabel: `${fmtN(view.state.doc.length)} characters` }) }] },
    { group: '', items: [
      { label: 'Wrap lines', icon: 'text', checked: isWrapped(), kbd: 'alt+z', onSelect: toggleWrap },
      { label: 'Clear text', icon: 'eraser', onSelect: clearDoc }] },
    { group: 'More text tools', items: [{ label: 'ASCII art', icon: 'case-sensitive', sub: 'Big letters and pictures from text', onSelect: () => (location.href = 'ascii.html') }] },
  ], { placement: 'bottom-end' });
}
function clearDoc() {
  const n = view.state.doc.length; if (!n) return;
  view.dispatch({ changes: { from: 0, to: n, insert: '' }, userEvent: 'delete.clear' });
  toast('Text cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { E.undo(view); onDocReplaced(); } } });
}

// ───────────────────────── lens switching + layout ─────────────────────────
function setLens(id, { sheet = false } = {}) {
  if (S.lens === id && !sheet) return;
  const prev = S.lens; S.lens = id;
  history.replaceState(null, '', `?leaf=${LENSES.find((l) => l.id === id).leaf}`);
  if (prev === 'regex' || prev === 'stats' || prev === 'transform') view.dispatch({ effects: [E.layerEffect('regex', []), E.layerEffect('stats', []), E.layerEffect('transform', [])] });
  layoutStage(); renderLensControls(); renderPanel(); renderStatus();
  if (id === 'regex') { runRegex(); if (!isMobile()) setTimeout(() => $('#rx-in')?.focus(), 30); }
  if (id === 'stats') applyStatsDecos();
  if (id === 'transform') applyTransformDecos();
  if (sheet) openLensSheet();
}
function layoutPanel() {
  const hasText = !!cur() && (view.state.doc.length > 0 || S.lens === 'compare');
  wbMain.classList.toggle('has-inspector', S.panel && hasText);
  $('#t-panel')?.setAttribute('aria-pressed', String(S.panel));
}
function layoutStage() {
  const cmpOn = S.lens === 'compare' && compareReady();
  stage.classList.toggle('is-compare', cmpOn);
  $('#editor').hidden = cmpOn;
  $('#diff').hidden = !cmpOn;
  $('#rxbar').hidden = S.lens !== 'regex' || !view.state.doc.length;
  $('#cmpbar').hidden = !cmpOn;
  if (cmpOn) renderCompare();
  layoutPanel(); renderEmpty();
}
function onDocReplaced() {
  $('#editor').classList.toggle('is-prose', cur().kind === 'md' || cur().kind === 'text');
  renderTabs(); renderUndo(); renderEmpty(); layoutStage(); renderLensControls(); renderPanel(); renderStatus(); scheduleSize(true); schedulePath();
  const d = cur();
  if (d.kind === 'json' && view.state.doc.length) scheduleValidate(true); else setJsonDecos(null);
  if (S.lens === 'regex') runRegex(); if (S.lens === 'stats') applyStatsDecos(); if (S.lens === 'transform') applyTransformDecos();
}
const scheduleLens = debounce(() => {
  if (S.lens === 'stats') { applyStatsDecos(); renderPanel(); }
  else if (S.lens === 'transform') { applyTransformDecos(); renderPanel(); }
  else if (S.lens === 'regex') runRegex();
  else if (S.lens === 'compare') { if (compareReady()) renderCompare(); renderPanel(); }
  renderLensControls();
}, 140);

// ───────────────────────── empty state ─────────────────────────
const EMPTY = {
  textbench: ['Paste text, drop a file, or start typing', 'One editor for any text. Lenses format JSON, compare versions, test patterns, count and clean up.'],
  'format-json': ['Paste JSON to format, validate and explore', 'Works with 10 MB API responses. Errors are underlined with a one-click repair.'],
  'compare-text': ['Drop two files or paste two versions', 'Side by side, word by word. Moved paragraphs are linked, not shown as delete + insert.'],
  'test-regex': ['Paste text to test a pattern on', 'Matches light up in your text, every group in its own colour. Runaway patterns stop after 1 s.'],
  'word-count': ['Paste or type text to count', 'Words, characters, sentences, reading time and targets like Meta 155.'],
  'transform-text': ['Paste text to clean up or convert', 'Fix PDF and Word pastes in one click: line breaks, hyphenation, invisible characters.'],
};
function renderEmpty() {
  const empty = !view.state.doc.length && !(S.lens === 'compare' && compareReady());
  const el = $('#empty');
  wb.classList.toggle('is-empty', empty);
  if (!empty) { el.hidden = true; return; }
  if (!el.hidden && el.dataset.leaf === leafId) return;
  const [title, lede] = EMPTY[leafId] || EMPTY.textbench;
  el.dataset.leaf = leafId; el.hidden = false;
  el.innerHTML = `<div class="tb-empty__card">
    <div class="tb-empty__icon">${icon(getLeaf(leafId)?.icon || 'text-cursor', { size: 22 })}</div>
    <h1 class="tb-empty__title">${esc(title)}</h1>
    <p class="tb-empty__lede">${esc(lede)}</p>
    <div class="tb-empty__actions">
      <button class="fw-btn fw-btn--primary" type="button" id="e-paste">${icon('clipboard-paste')}Paste<span class="fw-pointer-copy">${kbd('mod+v', 'fw-kbd--ghost')}</span></button>
      <button class="fw-btn" type="button" id="e-open">${icon('folder-open')}Open file</button>
    </div>
    <div class="tb-empty__samples"><span class="fw-label">Try a sample</span>
      <button class="fw-chip fw-chip--sample" type="button" data-sample="json">${icon('braces', { size: 14 })}API response 5 MB</button>
      <button class="fw-chip fw-chip--sample" type="button" data-sample="compare">${icon('git-compare', { size: 14 })}Two contract versions</button>
      <button class="fw-chip fw-chip--sample" type="button" data-sample="pdf">${icon('file-text', { size: 14 })}PDF paste</button>
      <button class="fw-chip fw-chip--sample" type="button" data-sample="log">${icon('list', { size: 14 })}Server log</button></div>
    <p class="tb-empty__detects">Recognises JSON · Markdown · logs · CSV · YAML · PDF pastes · two versions</p>
    <p class="fw-intake__privacy">${icon('lock', { size: 12 })} Stays in this tab. Nothing is kept unless you turn on “Keep on this device”.</p></div>`;
  $('#e-paste').onclick = async () => { try { const t = await navigator.clipboard.readText(); if (t) { view.focus(); insertPasted(t); return; } } catch { /* */ } view.focus(); toast(`Press ${kbd('mod+v')} to paste`, { type: 'info', html: true }); };
  $('#e-open').onclick = pickFiles;
  $$('[data-sample]', el).forEach((b) => (b.onclick = () => loadSample(b.dataset.sample)));
  el.onclick = (e) => { if (!e.target.closest('button,a')) view.focus(); };
}

// ───────────────────────── files ─────────────────────────
function pickFiles() { const i = h('<input type="file" multiple hidden>'); i.onchange = () => openFiles([...i.files], { source: 'picker' }); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); }
async function readText(f) {
  const buf = new Uint8Array(await f.slice(0, 8192).arrayBuffer());
  if (buf.includes(0)) return null; // binary: never read as text (audit T10)
  return f.text();
}
async function openFiles(files, { source, action } = {}) {
  const texts = [];
  for (const f of files) {
    const t = TEXT_EXT.test(f.name) || f.type.startsWith('text/') ? await readText(f) : null;
    if (t == null) { binaryNotice(f); continue; }
    texts.push({ f, t });
  }
  if (!texts.length) return;
  if (cur() && !view.state.doc.length && cur().origin === 'new') { S.docs.splice(S.active, 1); S.active = -1; }
  const docs = texts.map(({ f, t }) => newDoc({ name: f.name, text: t, origin: 'file' }));
  docs.forEach((d) => { d.bytes = 0; S.docs.push(d); });
  const last = S.docs.length - 1;
  if (docs.length === 2 || action === 'compare') {
    S.cmp.a = { doc: docs[0].id }; S.cmp.b = { doc: docs[1]?.id ?? docs[0].id }; S.cmp.cur = -1; S.lens = 'compare';
  } else if (docs[0].kind === 'json') S.lens = 'json';
  else if (S.lens === 'json' || S.lens === 'compare') S.lens = 'stats';
  history.replaceState(null, '', `?leaf=${LENSES.find((l) => l.id === S.lens).leaf}`);
  switchTo(last);
  $$('#lensseg .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.lens)));
  if (S.lens === 'compare') { layoutStage(); renderPanel(); renderStatus(); }
}
function binaryNotice(f) {
  const img = /\.(jpe?g|png|webp|heic|gif|avif)$/i.test(f.name);
  toast(`${esc(f.name)} isn’t text, so it wasn’t opened. ${img ? 'Make ASCII art from it?' : ''}`, { type: 'warning', html: true, action: img ? { label: 'ASCII art', onClick: () => navigate('ascii-art', { files: [f] }) } : undefined });
}
async function extractText(files) {
  const f = files[0];
  showProgress(`Extracting text from ${f.name}…`);
  const t = await (await fetch('samples/bericht-pdf-paste.txt')).text(); await sleep(700); hideProgress();
  if (cur() && !view.state.doc.length) { S.docs.splice(S.active, 1); S.active = -1; }
  S.docs.push(newDoc({ name: f.name.replace(/\.\w+$/, '.txt'), text: t, origin: 'file', kind: 'text' })); switchTo(S.docs.length - 1);
  offerDetection(t);
}
function saveFile() {
  const d = cur(); const blob = new Blob([view.state.doc.toString()], { type: 'text/plain' });
  const a = h(`<a download="${esc(/\.\w+$/.test(d.name) ? d.name : d.name + (d.kind === 'json' ? '.json' : '.txt'))}"></a>`); a.href = URL.createObjectURL(blob); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Saved ${a.download}`, { type: 'success' });
}
async function loadSample(kind) {
  if (kind === 'compare') { openFiles(await loadSamples('../text/samples/vertrag-v1.md|../text/samples/vertrag-v2.md'), { source: 'sample' }); return; }
  const file = { json: 'orders-api.json', pdf: 'bericht-pdf-paste.txt', log: 'anfragen.log', broken: 'orders-export.json' }[kind];
  const t = await (await fetch('samples/' + file)).text();
  if (kind === 'json' || kind === 'pdf') { if (!cur() || view.state.doc.length) newTab(); view.focus(); insertPasted(t); return; }
  openFiles([new File([t], file, { type: 'text/plain' })], { source: 'sample' });
}

// ───────────────────────── detection chip ("Looks like JSON. Format? ⏎") ─────────────────────────
const detect = { open: false, pop: null, accept: () => {} };
async function offerDetection(text) {
  const d = cur();
  if (d.kind === 'json') {
    const r = await jsonJob('validate', text);
    d.json = r.ok ? { ok: true, summary: r.summary } : { ok: false, error: r.error };
    renderTabs(); setJsonDecos(r.ok ? null : r.error); renderStatus();
    if (S.lens !== 'json') setLens('json'); else renderPanel();
    const minified = !text.slice(0, 4000).includes('\n');
    if (r.ok && minified) showDetect({ icon: 'braces', html: `Looks like JSON <span class="tb-detect__meta">${formatBytes(text.length)} · minified · ${esc(r.summary.label)}</span>`, action: 'Format', run: () => formatJson() });
    return;
  }
  const pdf = pdfPasteScore(text);
  if (pdf) {
    const bits = [pdf.hard && `${pdf.hard} hard line breaks`, pdf.hyph && `${pdf.hyph} hyphenations`, pdf.inv && `${pdf.inv} invisible characters`].filter(Boolean).slice(0, 2).join(' · ');
    showDetect({ icon: 'file-text', html: `Looks like a PDF paste <span class="tb-detect__meta">${esc(bits)}</span>`, action: 'Clean up', run: () => { usePreset('pdf'); if (S.lens !== 'transform') setLens('transform'); else renderPanel(); } });
  }
}
function showDetect({ icon: ic, html, action, run }) {
  const el = $('#detect');
  el.innerHTML = `<span class="tb-detect__icon">${icon(ic, { size: 16 })}</span><span class="tb-detect__text">${html}</span>
    <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="detect-go">${esc(action)}?<span class="fw-pointer-copy">${kbd('enter', 'tb-kbd-on')}</span></button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="detect-x" aria-label="Dismiss" data-tip="Not now" data-tip-kbd="esc">${icon('x')}</button>`;
  el.hidden = false; requestAnimationFrame(() => el.classList.add('is-in'));
  detect.open = true; detect.pop?.(); detect.pop = pushLayer(() => hideDetect(true), el);
  detect.accept = () => { hideDetect(true); run(); };
  $('#detect-go').onclick = detect.accept; $('#detect-x').onclick = () => hideDetect(true);
  if (isMobile()) { const m = $('#m-primary'); m.hidden = false; m.innerHTML = `${icon(ic)}<span>${esc(action)}</span>`; m.onclick = () => detect.accept(); }
}
function hideDetect(force) {
  if (!detect.open || (!force && Date.now() - (detect.t || 0) < 400)) return;
  detect.open = false; detect.pop?.(); detect.pop = null;
  const el = $('#detect'); el.classList.remove('is-in'); setTimeout(() => { if (!detect.open) el.hidden = true; }, 180);
  $('#m-primary').onclick = () => primaryAction()?.run(); renderLensControls();
}
function showProgress(label) { const p = $('#progress'); p.querySelector('.tb-progress__label').textContent = label; p.hidden = false; requestAnimationFrame(() => p.classList.add('is-in')); }
function hideProgress() { const p = $('#progress'); p.classList.remove('is-in'); setTimeout(() => (p.hidden = true), 200); }

// ───────────────────────── JSON lens ─────────────────────────
async function formatJson({ minify = false } = {}) {
  const d = cur(); const text = textOf(view.state.doc);
  showProgress(`${minify ? 'Minifying' : 'Formatting'} ${formatBytes(text.length)} in the background…`);
  const t0 = performance.now();
  const r = await jsonJob(minify ? 'minify' : 'format', text, { indent: S.indent, sort: S.sortKeys });
  const wait = 520 - (performance.now() - t0); if (wait > 0) await sleep(wait);
  hideProgress();
  if (!r.ok) { d.json = { ok: false, error: r.error }; setJsonDecos(r.error); renderPanel(); renderStatus(); return; }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: r.text }, selection: { anchor: 0 }, userEvent: 'input.format', effects: E.View.scrollIntoView(0, { y: 'start' }) });
  d.json = { ok: true, summary: r.summary, ms: r.ms };
  if (!minify) foldBig();
  renderPanel(); renderStatus();
}
function childOpens(text, open, from) {
  const close = open.get(from); const out = [];
  for (let i = from + 1; i < close; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) { i++; while (i < close && text.charCodeAt(i) !== 34) { if (text.charCodeAt(i) === 92) i++; i++; } continue; }
    if (c === 123 || c === 91) { out.push(i); i = open.get(i); }
  }
  return out;
}
function foldBig() {
  const doc = view.state.doc; const { open, text } = E.bracketIndex(doc);
  const root = text.search(/\S/); if (root < 0 || !open.has(root)) return;
  const effects = [];
  const lists = text[root] === '[' ? [root] : childOpens(text, open, root).filter((p) => text[p] === '[');
  for (const arr of lists) {
    const kids = childOpens(text, open, arr);
    if (kids.length < 40) continue;
    for (const k of kids) if (doc.lineAt(k).number !== doc.lineAt(open.get(k)).number) effects.push(E.foldEffect.of({ from: k + 1, to: open.get(k) }));
  }
  if (effects.length) view.dispatch({ effects });
}
function unfoldAt(pos) {
  const effects = [];
  E.foldedRanges(view.state).between(pos, pos + 1, (from, to) => { effects.push(E.unfoldEffect.of({ from, to })); });
  if (effects.length) view.dispatch({ effects });
}
function jumpTo(pos, { select = 0, flash = true } = {}) {
  unfoldAt(pos);
  view.dispatch({ selection: { anchor: pos, head: pos + select }, effects: [E.View.scrollIntoView(pos, { y: 'center' }), ...(flash ? [E.flash.of(pos)] : [])] });
  view.focus();
  setTimeout(() => view.dispatch({ effects: E.flash.of(null) }), 1400);
}
const scheduleValidate = debounce(async (now) => {
  const d = cur(); if (!d || d.kind !== 'json') return;
  const doc = view.state.doc; if (!doc.length) return;
  const r = await jsonJob('validate', textOf(doc));
  if (cur() !== d || view.state.doc !== doc) return;
  const was = d.json?.ok;
  d.json = r.ok ? { ok: true, summary: r.summary, ms: r.ms, fixes: d.json?.fixes } : { ok: false, error: r.error };
  if (!r.ok) { d.json.fixes = null; S.fixToast?.close(); S.fixToast = null; }
  setJsonDecos(r.ok ? null : r.error);
  renderTabs(); renderStatus(); if (S.lens === 'json' || was !== r.ok) renderPanel(); renderLensControls();
}, 220);
function setJsonDecos(err) {
  if (!err) { view.dispatch({ effects: [E.layerEffect('json', []), E.setErrorLine.of(null)] }); return; }
  const doc = view.state.doc; const pos = Math.min(err.pos, doc.length);
  const line = doc.lineAt(pos);
  const tokEnd = Math.min(line.to, pos + Math.max(1, (/^("[^"\n]*"|[\w.+-]+|.)/.exec(doc.sliceString(pos, line.to)) || [''])[0].length));
  const specs = [E.mark(pos, Math.max(tokEnd, pos + 1), 'tb-err-underline'), E.widget(line.to, err.message, 'tb-err-inline', 1, () => jumpTo(pos))];
  if (err.fix && typeof err.fix === 'object' && err.fix.insert) specs.push(E.widget(err.fix.from, err.fix.insert, 'tb-err-caret', 1));
  view.dispatch({ effects: [E.layerEffect('json', specs), E.setErrorLine.of(pos)] });
}
function repairJson() {
  const d = cur(); const text = textOf(view.state.doc);
  const r = repairEdits(text);
  if (r.full != null) { view.dispatch({ changes: { from: 0, to: text.length, insert: r.full }, userEvent: 'input.repair' }); d.json.fixes = [{ label: r.label }]; }
  else if (r.edits.length) {
    const lines = r.edits.map((e) => view.state.doc.lineAt(e.from).number);
    view.dispatch({ changes: r.edits.map(({ from, to, insert }) => ({ from, to, insert })), userEvent: 'input.repair', selection: { anchor: r.edits[0].from + r.edits[0].insert.length }, effects: [E.View.scrollIntoView(r.edits[0].from, { y: 'center' }), E.flash.of(r.edits[0].from)] });
    setTimeout(() => view.dispatch({ effects: E.flash.of(null) }), 1400);
    d.json.fixes = r.edits.map((e, k) => ({ label: e.label, line: lines[k] }));
  } else { toast('Couldn’t repair this automatically. Jump to the error to fix it by hand.', { type: 'warning' }); return; }
  const n = d.json.fixes.length;
  if (!panelVisible()) S.fixToast = toast(`${n} fix applied`.replace('fix', n === 1 ? 'fix' : 'fixes'), { type: 'success', action: { label: 'Undo', onClick: () => { E.undo(view); view.focus(); } } });
  view.focus();
}
let pathT = 0;
const schedulePath = () => { clearTimeout(pathT); pathT = setTimeout(computePath, 160); };
function computePath() {
  const d = cur(); if (!d || d.kind !== 'json' || !view.state.doc.length) { S.path = null; renderPathUI(); return; }
  let pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos); const lead = line.text.length - line.text.trimStart().length;
  if (line.text.trimStart().startsWith('"')) pos = line.from + lead + 1; // anywhere on a key line → that key
  S.path = pathAt(textOf(view.state.doc), pos); renderPathUI();
}
function renderPathUI() {
  const el = $('#st-path'); if (el) { el.hidden = !S.path || S.path === '$'; el.querySelector('code').textContent = S.path || ''; }
  const p = $('#json-path'); if (p) p.textContent = S.path || '$';
}
function jsonValue() {
  const doc = view.state.doc; const d = cur();
  if (d._tree?.doc === doc) return d._tree.v;
  try { const v = JSON.parse(textOf(doc)); d._tree = { doc, v }; return v; } catch { return undefined; }
}
function treeRows(v) {
  const rows = [];
  const preview = (x) => { if (Array.isArray(x)) return `[${fmtN(x.length)}]`; if (x && typeof x === 'object') { const k = Object.keys(x); const s = k.find((kk) => typeof x[kk] === 'string'); return `{${k.length}}${s ? ` · ${x[s]}` : ''}`; } return JSON.stringify(x); };
  const walk = (x, path, segs, key, depth) => {
    const isC = x && typeof x === 'object'; const open = S.expanded.has(path);
    rows.push({ path, segs, key, depth, isC, open, preview: preview(x), type: Array.isArray(x) ? 'arr' : isC ? 'obj' : typeof x });
    if (!isC || !open) return;
    if (Array.isArray(x)) {
      const show = x.length > 60 ? 3 : x.length;
      for (let i = 0; i < show; i++) walk(x[i], `${path}[${i}]`, [...segs, i], `[${i}]`, depth + 1);
      if (x.length > show) {
        // keep explicitly opened items visible (Go to)
        for (const p of S.expanded) { const m = new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&') + '\\[(\\d+)\\]$').exec(p); if (m && +m[1] >= show) walk(x[+m[1]], p, [...segs, +m[1]], `[${m[1]}]`, depth + 1); }
        rows.push({ more: true, path, segs, depth: depth + 1, total: x.length, shown: show });
      }
    } else for (const k of Object.keys(x).slice(0, 80)) walk(x[k], `${path}${/^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : `[${JSON.stringify(k)}]`}`, [...segs, k], k, depth + 1);
  };
  walk(v, '$', [], '$', 0);
  return rows;
}
function jsonPanel() {
  const d = cur(); const j = d.json;
  if (d.kind !== 'json') return `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('braces', { size: 14 })}JSON</div>
    <p class="tb-muted">This text isn’t JSON. Paste or open a .json file, or pick another lens.</p>
    <button class="fw-btn fw-btn--sm" type="button" data-act="json-sample">${icon('braces')}Try a 5 MB API response</button></section>`;
  if (!j) return `<section class="fw-insp-section"><div class="tb-checking">${icon('loader-circle', { size: 14, className: 'tb-spin' })} Checking JSON…</div></section>`;
  let html = '';
  if (!j.ok) {
    const e = j.error;
    html += `<section class="fw-insp-section"><div class="fw-alert fw-alert--danger tb-jsonerr" role="alert"><span class="fw-alert__icon">${icon('circle-alert', { size: 16 })}</span>
      <div class="fw-alert__body"><b>${esc(e.message)}</b><span class="tb-errpos">Line ${fmtN(e.line)}, column ${e.col}${e.hint ? ` · ${esc(e.hint)}` : ''}</span>
      <div class="fw-alert__actions"><button class="fw-btn" type="button" data-act="jump">${icon('corner-down-left')}Jump</button>
      ${e.fix ? `<button class="fw-btn" type="button" data-act="repair">${xicon('wand-sparkles')}Repair</button>` : ''}</div>
      <details><summary>Details</summary>${esc(e.raw)}</details></div></div></section>`;
  } else {
    const fx = j.fixes;
    html += `<section class="fw-insp-section"><div class="tb-valid">${icon('circle-check', { size: 16 })}<span><b>Valid JSON</b> · ${esc(j.summary.label)}</span></div>
      ${fx?.length ? `<div class="tb-fixnote">${xicon('wand-sparkles', { size: 14 })}<span>${fx.length} fix applied${fx[0].line ? `: ${esc(fx[0].label)} on line ${fmtN(fx[0].line)}` : `: ${esc(fx[0].label)}`}</span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-act="undo">Undo</button></div>` : ''}</section>`;
  }
  html += `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('link', { size: 14 })}Path at cursor</div>
    <div class="tb-path"><code id="json-path">${esc(S.path || '$')}</code><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="copy-path" aria-label="Copy path" data-tip="Copy path">${icon('copy')}</button></div></section>`;
  html += `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('sliders-horizontal', { size: 14 })}Format</div>
    <div class="tb-row"><span class="tb-row__label">Indent</span><div class="fw-seg fw-seg--sm" aria-label="Indent" id="indent">${[[2, '2'], [4, '4'], ['tab', 'Tab']].map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${v}" aria-checked="${String(S.indent) === String(v)}">${l}</button>`).join('')}</div></div>
    <label class="fw-toggle"><input type="checkbox" id="sortkeys" ${S.sortKeys ? 'checked' : ''}><span>Sort keys A→Z</span></label>
    <div class="tb-btnrow"><button class="fw-btn fw-btn--sm" type="button" data-act="format" ${j.ok ? '' : 'disabled'}>${icon('braces')}Format<span class="fw-pointer-copy">${kbd('shift+mod+f', 'fw-kbd--ghost')}</span></button>
      <button class="fw-btn fw-btn--sm" type="button" data-act="minify" ${j.ok ? '' : 'disabled'}>${icon('minimize-2')}Minify</button></div></section>`;
  if (j.ok) {
    const v = jsonValue();
    if (v !== undefined) {
      const rows = treeRows(v);
      html += `<section class="fw-insp-section tb-treesec"><div class="fw-insp-section__head">${xicon('list-tree', { size: 14 })}Tree</div><div class="tb-tree" role="tree" aria-label="JSON tree">${rows.map((r) => r.more
        ? `<div class="tb-tree__more" style="--d:${r.depth}"><span>${fmtN(r.total - r.shown)} more</span><label class="tb-goto">Go to <input class="fw-input tb-goto__in" type="number" min="0" max="${r.total - 1}" placeholder="index" data-path="${esc(r.path)}" data-segs='${esc(JSON.stringify(r.segs))}' aria-label="Go to index in ${esc(r.path)}"></label></div>`
        : `<div class="tb-tree__row" role="treeitem" ${r.isC ? `aria-expanded="${r.open}"` : ''} style="--d:${r.depth}">
            ${r.isC ? `<button class="tb-tree__tw" type="button" data-toggle="${esc(r.path)}" aria-label="${r.open ? 'Collapse' : 'Expand'} ${esc(r.key)}">${icon(r.open ? 'chevron-down' : 'chevron-right', { size: 13 })}</button>` : '<span class="tb-tree__tw"></span>'}
            <button class="tb-tree__node" type="button" data-goto='${esc(JSON.stringify(r.segs))}'><span class="tb-tree__key">${esc(r.key)}</span><span class="tb-tree__val tb-tree__val--${r.type}">${esc(String(r.preview).slice(0, 60))}</span></button></div>`).join('')}</div></section>`;
    }
    html += `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('arrow-left-right', { size: 14 })}Send to</div>
      <div class="tb-chiprow"><a class="fw-chip" href="${hrefFor('json-to-csv')}" data-leaf="json-to-csv">CSV</a><a class="fw-chip" href="${hrefFor('convert-data')}">YAML</a><button class="fw-chip" type="button" data-act="ts">TypeScript type</button><button class="fw-chip" type="button" data-act="cmp-clip">Compare with…</button></div></section>`;
  }
  return html;
}
function wireJsonPanel(root) {
  root.querySelector('#indent')?.addEventListener('fw-change', (e) => { S.indent = e.detail.value === 'tab' ? 'tab' : +e.detail.value; });
  const sk = root.querySelector('#sortkeys'); if (sk) sk.onchange = () => (S.sortKeys = sk.checked);
  $$('[data-toggle]', root).forEach((b) => (b.onclick = () => { const p = b.dataset.toggle; S.expanded.has(p) ? S.expanded.delete(p) : S.expanded.add(p); renderPanel(); }));
  $$('[data-goto]', root).forEach((b) => (b.onclick = () => gotoPath(JSON.parse(b.dataset.goto))));
  $$('.tb-goto__in', root).forEach((inp) => inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    const n = Math.max(0, Math.min(+inp.max, Math.round(+inp.value || 0))); const segs = [...JSON.parse(inp.dataset.segs), n];
    S.expanded.add(`${inp.dataset.path}[${n}]`); gotoPath(segs); renderPanel();
  }));
}
function gotoPath(segs) {
  const pos = offsetOfPath(textOf(view.state.doc), segs);
  if (pos < 0) return;
  jumpTo(pos);
}

// ───────────────────────── Compare lens ─────────────────────────
function sideOf(spec) {
  if (!spec) return null;
  if (spec.doc) { const i = S.docs.findIndex((d) => d.id === spec.doc); if (i < 0) return null; const d = S.docs[i]; return { name: d.name, text: textOf(i === S.active ? view.state.doc : d.state.doc), doc: d }; }
  if (spec.version) { const d = S.docs.find((x) => x.id === spec.version.doc); const v = d?.versions[spec.version.i]; return v ? { name: v.label, text: v.text } : null; }
  if (spec.text != null) return { name: spec.name, text: spec.text };
  return null;
}
function compareReady() { const a = sideOf(S.cmp.a), b = sideOf(S.cmp.b); return !!(a && b && b.text.length && a.text.length); }
function ensureCompareSides() {
  const d = cur(); if (!d) return;
  if (!S.cmp.b || !sideOf(S.cmp.b)) S.cmp.b = { doc: d.id };
  if (!S.cmp.a || !sideOf(S.cmp.a) || (S.cmp.a.doc && S.cmp.a.doc === S.cmp.b.doc)) {
    const other = S.docs.find((x) => x.id !== S.cmp.b.doc && x.state.doc.length);
    S.cmp.a = d.versions.length ? { version: { doc: d.id, i: d.versions.length - 1 } } : other ? { doc: other.id } : null;
  }
}
function sourceOptions(side) {
  const opts = [];
  S.docs.forEach((d) => opts.push({ label: d.name, sub: 'Open tab', spec: { doc: d.id } }));
  S.docs.forEach((d) => d.versions.forEach((v, i) => opts.push({ label: v.label, sub: `${d.name} · earlier version`, spec: { version: { doc: d.id, i } } })));
  opts.push({ label: 'Clipboard', sub: 'Paste the other version', spec: 'clip' });
  return opts;
}
function pickSource(side, anchor) {
  openMenu(anchor, sourceOptions(side).map((o) => ({ label: o.label, sub: o.sub, checked: JSON.stringify(o.spec) === JSON.stringify(S.cmp[side]), onSelect: async () => {
    if (o.spec === 'clip') { try { const t = await navigator.clipboard.readText(); S.cmp[side] = { text: t, name: 'Clipboard' }; } catch { toast('Clipboard not available here — paste into a new tab instead.', { type: 'warning' }); return; } }
    else S.cmp[side] = o.spec;
    S.cmp.cur = -1; layoutStage(); renderPanel(); renderStatus();
  } })));
}
function renderCompare() {
  const A = sideOf(S.cmp.a), B = sideOf(S.cmp.b); if (!A || !B) return;
  const mode = isMobile() ? 'unified' : S.cmp.mode;
  const r = compare(A.text, B.text, { ignoreWs: S.cmp.ignoreWs, ignoreCase: S.cmp.ignoreCase });
  S.cmpRes = r;
  if (S.cmp.cur >= r.hunks) S.cmp.cur = r.hunks - 1;
  // bar
  $('#cmpbar').innerHTML = `
    <button class="tb-src" type="button" id="src-a" aria-haspopup="menu"><span class="tb-src__tag tb-src__tag--a">A</span><span class="tb-src__name">${esc(A.name)}</span>${icon('chevron-down', { size: 13 })}</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="swap" aria-label="Swap A and B" data-tip="Swap">${icon('arrow-left-right')}</button>
    <button class="tb-src" type="button" id="src-b" aria-haspopup="menu"><span class="tb-src__tag tb-src__tag--b">B</span><span class="tb-src__name">${esc(B.name)}</span>${icon('chevron-down', { size: 13 })}</button>
    <span class="fw-spacer"></span>
    <div class="fw-seg fw-seg--sm fw-hide-compact" aria-label="View" id="cmpmode"><button class="fw-seg__opt" type="button" data-value="split" aria-checked="${mode === 'split'}">${xicon('columns-2', { size: 14 })}Side by side</button><button class="fw-seg__opt" type="button" data-value="unified" aria-checked="${mode === 'unified'}">${xicon('rows-2', { size: 14 })}Unified</button></div>
    <div class="tb-nav" role="group" aria-label="Changes">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="prevchg" aria-label="Previous change" data-tip="Previous change" data-tip-kbd="shift+f7" ${r.hunks ? '' : 'disabled'}>${icon('chevron-up')}</button>
      <span class="tb-nav__pos" id="chgpos">${r.hunks ? `${S.cmp.cur >= 0 ? S.cmp.cur + 1 : '–'} / ${r.hunks}` : '0'}</span>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="nextchg" aria-label="Next change" data-tip="Next change" data-tip-kbd="f7" ${r.hunks ? '' : 'disabled'}>${icon('chevron-down')}</button></div>`;
  enhance($('#cmpbar'));
  $('#src-a').onclick = (e) => pickSource('a', e.currentTarget); $('#src-b').onclick = (e) => pickSource('b', e.currentTarget);
  $('#swap').onclick = () => { [S.cmp.a, S.cmp.b] = [S.cmp.b, S.cmp.a]; renderCompare(); renderPanel(); };
  $('#cmpmode')?.addEventListener('fw-change', (e) => { S.cmp.mode = e.detail.value; renderCompare(); });
  $('#prevchg').onclick = () => stepChange(-1); $('#nextchg').onclick = () => stepChange(1);
  // body
  const piece = (t, k) => { if (k === 'eq') return esc(t); if (/\n/.test(t) && !/\S/.test(t)) return `<span class="tb-w-${k} tb-w-nl">↵</span>${k === 'del' ? '\n' : ''}`; return `<span class="tb-w-${k}">${esc(t).replace(/\n/g, '<span class="tb-w-nl">↵</span>\n')}</span>`; };
  const seg = (x) => (x.segs ? x.segs.map(([t, k]) => piece(t, k)).join('') : esc(x.text)) || '&#8203;';
  const moveChip = (row, side) => {
    if (!row.move?.first) return '';
    const from = row.move.side === 'from';
    return `<button class="tb-movechip" type="button" data-move="${row.move.id}" data-dir="${from ? 'to' : 'from'}">${xicon(from ? 'corner-down-right' : 'corner-up-left', { size: 13 })}${from ? `Moved to line ${row.move.other + 1}` : `Moved from line ${row.move.other + 1}`}</button>`;
  };
  let html = '';
  if (r.identical) html = `<div class="tb-identical">${icon('circle-check', { size: 28 })}<b>Identical</b><span>${esc(A.name)} and ${esc(B.name)} have the same text${S.cmp.ignoreWs ? ' (ignoring whitespace)' : ''}.</span></div>`;
  else if (mode === 'split') {
    html = `<div class="tb-diff__head"><span></span><span>${esc(A.name)}</span><span></span><span>${esc(B.name)}</span></div>` + r.rows.map((row, idx) => {
      if (row.k === 'fold') return `<button class="tb-d-fold" type="button" data-unfold="${idx}">${icon('chevrons-up-down', { size: 13 })}${row.hidden.length} unchanged lines</button>`;
      const mv = row.move ? ` is-moved` : '';
      const a = row.a ? `<span class="tb-d-n">${row.a.n}</span><div class="tb-d-t tb-d-a${row.k === 'del' ? ' is-del' : row.k === 'chg' ? ' is-chg' : ''}${mv}">${row.move?.side === 'from' ? moveChip(row) : ''}${seg(row.a)}</div>` : `<span class="tb-d-n"></span><div class="tb-d-t is-void"></div>`;
      const b = row.b ? `<span class="tb-d-n">${row.b.n}</span><div class="tb-d-t tb-d-b${row.k === 'ins' ? ' is-ins' : row.k === 'chg' ? ' is-chg' : ''}${mv}">${row.move?.side === 'to' ? moveChip(row) : ''}${seg(row.b)}</div>` : `<span class="tb-d-n"></span><div class="tb-d-t is-void"></div>`;
      return `<div class="tb-d-row k-${row.k}${mv}" ${row.hunk != null ? `data-hunk="${row.hunk}"` : ''} ${row.move ? `data-moveid="${row.move.id}" data-side="${row.move.side}"` : ''}>${a}${b}</div>`;
    }).join('');
  } else {
    html = r.rows.map((row, idx) => {
      if (row.k === 'fold') return `<button class="tb-d-fold" type="button" data-unfold="${idx}">${icon('chevrons-up-down', { size: 13 })}${row.hidden.length} unchanged lines</button>`;
      const mv = row.move ? ' is-moved' : '';
      const at = `${row.hunk != null ? `data-hunk="${row.hunk}"` : ''} ${row.move ? `data-moveid="${row.move.id}" data-side="${row.move.side}"` : ''}`;
      const line = (n1, n2, sign, cls, body, chip = '') => `<div class="tb-u-row ${cls}${mv}" ${at}><span class="tb-d-n">${n1 ?? ''}</span><span class="tb-d-n">${n2 ?? ''}</span><span class="tb-u-sign">${sign}</span><div class="tb-d-t">${chip}${body}</div></div>`;
      if (row.k === 'eq') return line(row.a.n, row.b.n, '', 'k-eq', esc(row.a.text) || '&#8203;');
      if (row.k === 'chg') return line(row.a.n, null, '−', 'k-del is-chg', seg(row.a)) + line(null, row.b.n, '+', 'k-ins is-chg', seg(row.b));
      if (row.k === 'del') return line(row.a.n, null, '−', 'k-del', seg(row.a), row.move?.side === 'from' ? moveChip(row) : '');
      return line(null, row.b.n, '+', 'k-ins', seg(row.b), row.move?.side === 'to' ? moveChip(row) : '');
    }).join('');
  }
  const body = $('#diffbody');
  const keep = body.scrollTop;
  body.className = `tb-diff__body is-${mode}${/\.(json|log|csv|ya?ml|xml)$/i.test(A.name + ' ' + B.name) ? ' is-mono' : ''}`;
  body.innerHTML = html; body.scrollTop = keep;
  $$('[data-unfold]', body).forEach((b) => (b.onclick = () => {
    const row = r.rows[+b.dataset.unfold];
    const frag = row.hidden.map((x) => mode === 'split' ? `<div class="tb-d-row k-eq"><span class="tb-d-n">${x.a.n}</span><div class="tb-d-t">${esc(x.a.text) || '&#8203;'}</div><span class="tb-d-n">${x.b.n}</span><div class="tb-d-t">${esc(x.b.text) || '&#8203;'}</div></div>`
      : `<div class="tb-u-row k-eq"><span class="tb-d-n">${x.a.n}</span><span class="tb-d-n">${x.b.n}</span><span class="tb-u-sign"></span><div class="tb-d-t">${esc(x.a.text) || '&#8203;'}</div></div>`).join('');
    b.outerHTML = frag;
  }));
  $$('[data-move]', body).forEach((b) => (b.onclick = () => {
    const target = body.querySelector(`[data-moveid="${b.dataset.move}"][data-side="${b.dataset.dir}"]`);
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); flashRows(body.querySelectorAll(`[data-moveid="${b.dataset.move}"][data-side="${b.dataset.dir}"]`)); }
  }));
  // minimap
  const total = r.rows.length || 1;
  $('#minimap').innerHTML = r.rows.map((row, i) => row.k === 'eq' || row.k === 'fold' ? '' : `<span class="tb-mm k-${row.move ? 'move' : row.k}" style="top:${(i / total) * 100}%;height:${Math.max(0.6, 100 / total)}%"></span>`).join('');
}
function flashRows(nodes) { nodes.forEach((n) => { n.classList.remove('is-flash'); void n.offsetWidth; n.classList.add('is-flash'); }); }
function stepChange(dir) {
  const r = S.cmpRes; if (!r?.hunks) return;
  S.cmp.cur = S.cmp.cur < 0 ? (dir > 0 ? 0 : r.hunks - 1) : (S.cmp.cur + dir + r.hunks) % r.hunks;
  const body = $('#diffbody'); const rows = body.querySelectorAll(`[data-hunk="${S.cmp.cur}"]`);
  rows[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); flashRows(rows);
  $('#chgpos').textContent = `${S.cmp.cur + 1} / ${r.hunks}`;
  $$('.tb-chg', panelHost()).forEach((x) => x.setAttribute('aria-current', String(+x.dataset.h === S.cmp.cur)));
}
function comparePanel() {
  ensureCompareSides();
  const A = sideOf(S.cmp.a), B = sideOf(S.cmp.b);
  if (!A || !B) return `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('git-compare', { size: 14 })}Compare</div>
    <p class="tb-muted">Compare <b>${esc(cur()?.name || 'this text')}</b> with another version.</p>
    <div class="tb-btnrow tb-btnrow--stack"><button class="fw-btn fw-btn--sm" type="button" data-act="cmp-clip">${icon('clipboard-paste')}Compare with clipboard</button>
    <button class="fw-btn fw-btn--sm" type="button" data-act="cmp-open">${icon('folder-open')}Open the other version…</button>
    <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-act="cmp-sample">${icon('git-compare')}Try two contract versions</button></div>
    <p class="tb-hint">Tip: drop two files at once to compare them.</p></section>`;
  const r = S.cmpRes || compare(A.text, B.text);
  const st = r.stats;
  const hunks = []; r.rows.forEach((row) => { if (row.hunk != null && !hunks[row.hunk]) hunks[row.hunk] = row; });
  return `<section class="fw-insp-section"><div class="tb-bignum"><b>${r.identical ? 'Identical' : `${r.hunks} ${r.hunks === 1 ? 'change' : 'changes'}`}</b></div>
      <div class="tb-legend"><span class="k-chg">${st.changed} changed</span><span class="k-ins">${st.added} added</span><span class="k-del">${st.removed} removed</span>${st.moved ? `<span class="k-move">${st.moved} moved</span>` : ''}</div></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('list', { size: 14 })}Changes</div>
      <div class="tb-chglist">${hunks.map((row, i) => { const x = row.b || row.a; const kind = row.move ? 'move' : row.k; const snip = (row.segs || x.segs || []).length ? x.segs.filter(([, k]) => k !== 'eq').map(([t]) => t).join(' … ') : x.text;
        return `<button class="tb-chg" type="button" data-h="${i}" aria-current="${i === S.cmp.cur}"><span class="tb-chg__k k-${kind}"></span><span class="tb-chg__ln">${row.b ? 'B' : 'A'} ${x.n}</span><span class="tb-chg__t">${esc((snip || '(blank line)').trim().slice(0, 70))}</span></button>`; }).join('')}</div></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('sliders-horizontal', { size: 14 })}Options</div>
      <label class="fw-toggle"><input type="checkbox" id="ign-ws" ${S.cmp.ignoreWs ? 'checked' : ''}><span>Ignore whitespace</span></label>
      <label class="fw-toggle"><input type="checkbox" id="ign-case" ${S.cmp.ignoreCase ? 'checked' : ''}><span>Ignore case</span></label></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('download', { size: 14 })}Export</div>
      <div class="tb-btnrow tb-btnrow--stack"><button class="fw-btn fw-btn--sm" type="button" data-act="patch">${icon('copy')}Copy patch</button>
      <button class="fw-btn fw-btn--sm" type="button" data-act="diff-dl">${icon('download')}Download .diff</button>
      <button class="fw-btn fw-btn--sm" type="button" data-act="diff-md">${icon('code-xml')}Copy as Markdown</button></div></section>`;
}
function wireComparePanel(root) {
  $$('.tb-chg', root).forEach((b) => (b.onclick = () => { S.cmp.cur = +b.dataset.h - 1; stepChange(1); if (isMobile()) closeLensSheet(); }));
  const iw = root.querySelector('#ign-ws'); if (iw) iw.onchange = () => { S.cmp.ignoreWs = iw.checked; renderCompare(); renderPanel(); };
  const ic = root.querySelector('#ign-case'); if (ic) ic.onchange = () => { S.cmp.ignoreCase = ic.checked; renderCompare(); renderPanel(); };
}
function patchText() { const A = sideOf(S.cmp.a), B = sideOf(S.cmp.b); return unifiedPatch(A.text, B.text, A.name, B.name); }

// ───────────────────────── Regex lens ─────────────────────────
const RX_FLAGS = [['g', 'Global: find all matches'], ['i', 'Ignore case'], ['m', 'Multiline: ^ and $ match at line breaks'], ['s', 'Dot matches line breaks'], ['u', 'Unicode'], ['y', 'Sticky: match only at lastIndex']];
function renderRxBar() {
  const bar = $('#rxbar');
  if (!bar.dataset.ready) {
    bar.dataset.ready = '1';
    bar.innerHTML = `<div class="tb-rx">
        <span class="tb-rx__slash" aria-hidden="true">/</span>
        <input class="tb-rx__in" id="rx-in" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Regular expression" placeholder="Type a pattern, e.g. (?<user>[\\w.+-]+)@(?<domain>[\\w.-]+)">
        <span class="tb-rx__slash" aria-hidden="true">/</span>
        <div class="tb-rx__flags" role="group" aria-label="Flags" data-roving="button">${RX_FLAGS.map(([f, t]) => `<button class="tb-flag" type="button" data-flag="${f}" aria-pressed="${S.rx.flags.includes(f)}" data-tip="${t}">${f}</button>`).join('')}</div>
        <span class="tb-rx__count" id="rx-count" aria-live="polite"></span></div>
      <div class="tb-rx__msg" id="rx-msg" hidden></div>`;
    enhance(bar);
    const inp = $('#rx-in'); inp.value = S.rx.src;
    inp.addEventListener('input', () => { S.rx.src = inp.value; runRegexSoon(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); } });
    $$('.tb-flag', bar).forEach((b) => (b.onclick = () => { const f = b.dataset.flag; S.rx.flags = S.rx.flags.includes(f) ? S.rx.flags.replace(f, '') : S.rx.flags + f; b.setAttribute('aria-pressed', String(S.rx.flags.includes(f))); runRegex(); }));
  }
}
const runRegexSoon = debounce(() => runRegex(), 110);
let rxErrT = 0;
async function runRegex() {
  renderRxBar();
  const src = S.rx.src; const count = $('#rx-count'); const msg = $('#rx-msg');
  clearTimeout(rxErrT);
  if (!src) { S.rx.res = null; S.rx.err = null; S.rx.timeout = null; S.rx.tree = null; count.textContent = ''; msg.hidden = true; view.dispatch({ effects: E.layerEffect('regex', []) }); $('#editor').classList.remove('is-stale'); renderPanel(); return; }
  let parsed;
  try { parsed = parseRegex(src); new RegExp(src, S.rx.flags); } catch (err) {
    // show syntax errors only once typing pauses; keep the last good highlights, dimmed
    $('#editor').classList.add('is-stale');
    rxErrT = setTimeout(() => { S.rx.err = err.message.replace(/^Invalid regular expression: /, ''); count.innerHTML = `<span class="tb-rx__bad">${icon('circle-alert', { size: 13 })}${esc(S.rx.err.replace(/^\/.*\/[a-z]*: /, ''))}</span>`; renderPanel(); }, 450);
    return;
  }
  S.rx.err = null; S.rx.tree = parsed.tree;
  const job = { source: src, flags: S.rx.flags, text: textOf(view.state.doc), replace: S.rx.replace || null };
  count.innerHTML = `<span class="tb-rx__busy">${icon('loader-circle', { size: 13, className: 'tb-spin' })}</span>`;
  try {
    const res = await rxRunner.run(job);
    S.rx.res = res; S.rx.timeout = null; msg.hidden = true; $('#editor').classList.remove('is-stale');
    count.textContent = res.total ? `${fmtN(res.total)} ${res.total === 1 ? 'match' : 'matches'} · ${res.ms < 1 ? '<1' : Math.round(res.ms)} ms` : 'No matches';
    applyRegexDecos(); renderPanel();
  } catch (e) {
    if (e.cancelled) return;
    if (e.timeout) { S.rx.timeout = { src, nested: nestedQuantifier(parsed.tree), safer: saferPattern(src) }; S.rx.res = null; view.dispatch({ effects: E.layerEffect('regex', []) }); count.innerHTML = `<span class="tb-rx__stop">${icon('hourglass', { size: 13 })}Stopped after 1 s</span>`; renderTimeout(); renderPanel(); }
    else if (e.error) { S.rx.err = e.error; count.textContent = e.error; }
  }
}
function renderTimeout() {
  const t = S.rx.timeout; const msg = $('#rx-msg');
  const line = (() => { const txt = textOf(view.state.doc); const ls = txt.split('\n'); const i = ls.findIndex((l) => /^[\w ]{25,}[^\w\s]/.test(l)); return i >= 0 ? i + 1 : null; })();
  msg.hidden = false;
  msg.innerHTML = `<div class="fw-alert fw-alert--warning tb-stop" role="status"><span class="fw-alert__icon">${icon('hourglass', { size: 16 })}</span><div class="fw-alert__body">
    <b>Stopped this pattern after 1 second. Your text and the page are fine.</b>
    <span>${t.nested ? `<code>${esc(t.nested)}</code> repeats a group that itself repeats, so ` : ''}${line ? `on line ${line} ` : ''}the engine would try billions of ways to split the words before giving up (catastrophic backtracking).</span>
    <div class="fw-alert__actions">${t.safer ? `<button class="fw-btn" type="button" id="rx-safer">${xicon('wand-sparkles')}Use <code>${esc(t.safer)}</code></button>` : ''}<button class="fw-btn fw-btn--ghost" type="button" id="rx-edit">Edit pattern</button></div></div></div>`;
  $('#rx-safer')?.addEventListener('click', () => { S.rx.src = t.safer; $('#rx-in').value = t.safer; runRegex(); });
  $('#rx-edit').onclick = () => $('#rx-in').focus();
}
function applyRegexDecos() {
  const res = S.rx.res; if (!res || S.lens !== 'regex') { view.dispatch({ effects: E.layerEffect('regex', []) }); return; }
  const specs = []; const len = view.state.doc.length;
  res.matches.forEach((m, i) => {
    if (m.e > m.s && m.e <= len) specs.push(E.mark(m.s, m.e, `tb-rx-m tb-rx-m${i % 2}`));
    m.groups.forEach((g, k) => { if (g.s >= 0 && g.e > g.s && g.e <= len) specs.push(E.mark(g.s, g.e, `tb-rx-g tb-rx-g${(k % 6) + 1}`)); });
  });
  view.dispatch({ effects: E.layerEffect('regex', specs) });
}
let rxCur = -1;
function stepMatch(dir) {
  const res = S.rx.res; if (!res?.matches.length) return;
  rxCur = (rxCur + dir + res.matches.length) % res.matches.length;
  const m = res.matches[rxCur]; view.dispatch({ selection: { anchor: m.s, head: m.e }, effects: E.View.scrollIntoView(m.s, { y: 'center' }) });
}
function regexPanel() {
  if (!view.state.doc.length) return `<section class="fw-insp-section"><p class="tb-muted">Paste some text first, then type a pattern above it.</p></section>`;
  let html = '';
  const tree = S.rx.tree;
  if (!S.rx.src) html += `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('regex', { size: 14 })}Pattern</div><p class="tb-muted">Type a pattern in the bar above the text. Matches light up as you type; every group gets its own colour.</p>
    <div class="tb-chiprow">${[['Emails', '(?<user>[\\w.+-]+)@(?<domain>[\\w.-]+)'], ['Dates', '\\d{4}-\\d\\d-\\d\\d'], ['Errors', '^.*\\bERROR\\b.*$'], ['URLs', 'https?://\\S+']].map(([l, p]) => `<button class="fw-chip" type="button" data-rx="${esc(p)}">${l}</button>`).join('')}</div></section>`;
  if (S.rx.timeout) html += `<section class="fw-insp-section"><div class="tb-stopnote">${icon('hourglass', { size: 14 })}<span>Runs in a background worker with a 1 s limit. The tab never freezes.</span></div></section>`;
  if (tree && !S.rx.err) {
    const rows = explain(tree, { multiline: S.rx.flags.includes('m') });
    html += `<section class="fw-insp-section"><div class="fw-insp-section__head">${xicon('list-tree', { size: 14 })}What it means</div><ol class="tb-explain">${rows.map((r) => `<li style="--d:${r.depth}" class="${r.isGroupHead ? 'is-group' : ''}">${r.group ? `<span class="tb-gdot tb-rx-g${((r.group - 1) % 6) + 1}"></span>` : '<span class="tb-gdot is-none"></span>'}<span class="tb-explain__t"><span class="tb-explain__l">${esc(r.label)}</span>${r.detail ? ` <span class="tb-explain__d">${esc(r.detail)}</span>` : ''}</span></li>`).join('')}</ol></section>`;
  }
  const res = S.rx.res;
  if (res) {
    html += `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('list', { size: 14 })}Matches<span class="tb-head-count">${fmtN(res.total)}</span></div><div class="tb-matches">${res.matches.slice(0, 200).map((m, i) => {
      const ln = view.state.doc.lineAt(Math.min(m.s, view.state.doc.length)).number;
      return `<button class="tb-match" type="button" data-m="${i}"><span class="tb-match__n">${ln}</span><span class="tb-match__v">${m.groups.length ? m.groups.map((g, k) => `<span class="tb-gchip tb-rx-g${(k % 6) + 1}">${esc(m.named[k] || k + 1)}<b>${esc(g.v ?? '–')}</b></span>`).join('') : esc(m.v)}</span></button>`; }).join('') || '<p class="tb-muted">No matches in this text.</p>'}</div></section>
      <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('replace', { size: 14 })}Replace</div>
      <input class="fw-input fw-input--mono" id="rx-rep" type="text" spellcheck="false" placeholder="e.g. $<user> at $<domain>" value="${esc(S.rx.replace)}" aria-label="Replace with">
      <div class="tb-btnrow"><button class="fw-btn fw-btn--sm" type="button" data-act="rx-apply" ${res.total && S.rx.replace ? '' : 'disabled'}>Replace ${fmtN(res.total)}</button><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-act="rx-copy" ${res.total ? '' : 'disabled'}>${icon('copy')}Copy matches</button></div></section>`;
  }
  return html;
}
function wireRegexPanel(root) {
  $$('[data-rx]', root).forEach((b) => (b.onclick = () => { S.rx.src = b.dataset.rx; $('#rx-in').value = S.rx.src; runRegex(); }));
  $$('.tb-match', root).forEach((b) => (b.onclick = () => { rxCur = +b.dataset.m - 1; stepMatch(1); if (isMobile()) closeLensSheet(); }));
  const rep = root.querySelector('#rx-rep'); if (rep) rep.addEventListener('input', debounce(() => { S.rx.replace = rep.value; const btn = root.querySelector('[data-act="rx-apply"]'); if (btn) btn.disabled = !(S.rx.res?.total && rep.value); }, 120));
}
function applyReplace() {
  const src = S.rx.src; const text = textOf(view.state.doc);
  let out; try { out = text.replace(new RegExp(src, S.rx.flags), S.rx.replace); } catch { return; }
  view.dispatch({ changes: { from: 0, to: text.length, insert: out }, userEvent: 'input.replace' });
  toast(`Replaced ${fmtN(S.rx.res.total)} matches`, { type: 'success', action: { label: 'Undo', onClick: () => E.undo(view) } });
}

// ───────────────────────── Stats lens ─────────────────────────
let statsCache = null;
function stats() {
  const doc = view.state.doc;
  if (statsCache?.doc === doc) return statsCache.a;
  const t = textOf(doc);
  const a = t.length > 1.5e6 ? { big: true, words: (t.match(/\S+/g) || []).length, chars: t.length, noSpace: t.replace(/\s/g, '').length, lines: doc.lines, bytes: t.length, sentences: 0, paragraphs: 0, readMin: 0, speakMin: 0, longSentences: [], top: [] } : analyze(t);
  statsCache = { doc, a }; return a;
}
function selText() { const s = view.state.selection.main; return s.empty ? '' : view.state.sliceDoc(s.from, s.to); }
function applyStatsDecos() {
  if (S.lens !== 'stats' || !S.longOn || !view.state.doc.length) { view.dispatch({ effects: E.layerEffect('stats', []) }); return; }
  const a = stats(); view.dispatch({ effects: E.layerEffect('stats', a.longSentences.map((s) => E.mark(s.from, s.to, 'tb-long', { title: `${s.words} words: consider splitting` }))) });
}
const scheduleStatsSel = debounce(() => { const el = $('#target-box', panelHost()); if (el) el.outerHTML = targetBox(); wireTarget(panelHost()); }, 60);
function targetBox() {
  const t = TARGETS.find((x) => x.id === S.target);
  const sel = selText(); const scope = sel ? 'Selection' : 'Whole text';
  const n = graphemes(sel || textOf(view.state.doc));
  if (!t || !t.max) return `<div id="target-box" class="tb-target tb-target--none"><p class="tb-muted">Pick a target to see how much room is left. Select text to measure just that part.</p></div>`;
  const pct = Math.min(100, (n / t.max) * 100); const over = n > t.max;
  return `<div id="target-box" class="tb-target ${over ? 'is-over' : 'is-ok'}">
    <span class="tb-ring" style="--value:${pct}" aria-hidden="true"><span>${over ? '!' : Math.round(pct) + '%'}</span></span>
    <div class="tb-target__txt"><b class="fw-num">${fmtN(n)} / ${t.max}</b><span>${over ? `${fmtN(n - t.max)} over` : `${t.max - n} left`} · ${scope}${t.sub ? ` · ${t.sub}` : ''}</span>
    ${over && !sel ? '<span class="tb-hint">Select a sentence to measure just that part.</span>' : ''}</div></div>`;
}
function wireTarget() { /* box is static */ }
function statsPanel() {
  if (!view.state.doc.length) return `<section class="fw-insp-section"><p class="tb-muted">Type or paste text to see counts.</p></section>`;
  const a = stats();
  const big = (l, v) => `<div class="tb-stat"><b class="fw-num">${v}</b><span>${l}</span></div>`;
  return `<section class="fw-insp-section"><div class="tb-stats">${big('Words', fmtN(a.words))}${big('Characters', fmtN(a.chars))}${big('Sentences', a.big ? '–' : fmtN(a.sentences))}${big('Paragraphs', a.big ? '–' : fmtN(a.paragraphs))}</div>
      <dl class="fw-insp-kv tb-kv"><dt>Without spaces</dt><dd>${fmtN(a.noSpace)}</dd><dt>Bytes (UTF-8)</dt><dd>${formatBytes(a.bytes)}</dd><dt>Lines</dt><dd>${fmtN(a.lines)}</dd>
      ${a.big ? '' : `<dt>Reading time</dt><dd>${fmtTime(a.readMin)}</dd><dt>Speaking time</dt><dd>${fmtTime(a.speakMin)}</dd>`}</dl></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${xicon('target', { size: 14 })}Target</div>
      <div class="tb-targets" role="radiogroup" aria-label="Length target" data-roving="button">${TARGETS.map((t) => `<button class="fw-chip" type="button" role="radio" data-target="${t.id}" aria-checked="${S.target === t.id}" aria-pressed="${S.target === t.id}">${esc(t.label)}</button>`).join('')}</div>
      ${targetBox()}</section>
    ${a.big ? '' : `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('book-open', { size: 14 })}Readability</div>
      <div class="tb-read"><div class="tb-read__bar"><span style="width:${a.readability}%"></span></div><div class="tb-read__txt"><b>${a.readability}</b> · ${a.readLabel} <span class="tb-muted">(${a.lang === 'de' ? 'Amstad, German' : 'Flesch, English'})</span></div></div>
      <label class="fw-toggle"><input type="checkbox" id="longon" ${S.longOn ? 'checked' : ''}><span>Highlight long sentences <span class="tb-muted">over 22 words · ${a.longSentences.length}</span></span></label>
      <div class="fw-insp-section__head tb-sub">Most used words</div><div class="tb-chiprow">${a.top.map(([w, n]) => `<span class="tb-word">${esc(w)}<b>${n}</b></span>`).join('')}</div></section>`}`;
}
function wireStatsPanel(root) {
  $$('[data-target]', root).forEach((b) => (b.onclick = () => { S.target = b.dataset.target; renderPanel(); }));
  const lo = root.querySelector('#longon'); if (lo) lo.onchange = () => { S.longOn = lo.checked; applyStatsDecos(); };
}

// ───────────────────────── Transform lens ─────────────────────────
function usePreset(id) { const p = PRESETS.find((x) => x.id === id); S.recipe = p.steps.map(([sid, on]) => ({ id: sid, on })); S.recipeLabel = p.label; S.applied = null; applyTransformDecos(); renderPanel(); renderLensControls(); }
let tfCache = null;
function recipeResult() {
  const doc = view.state.doc; const key = JSON.stringify(S.recipe);
  if (tfCache?.doc === doc && tfCache.key === key) return tfCache.r;
  const r = S.recipe.length && doc.length < 1.5e6 ? runRecipe(textOf(doc), S.recipe) : null;
  tfCache = { doc, key, r }; return r;
}
function applyTransformDecos() {
  if (S.lens !== 'transform' || !S.recipe.length || view.state.doc.length > 1.5e6) { view.dispatch({ effects: E.layerEffect('transform', []) }); return; }
  const marks = previewMarks(textOf(view.state.doc), S.recipe); const doc = view.state.doc;
  const specs = [];
  for (const m of marks) {
    if (m.kind === 'header') specs.push(E.mark(m.from, m.to, 'tb-tf-header'));
    else if (m.kind === 'join') specs.push(E.widget(m.from, '↵', 'tb-tf-join', 1));
    else if (m.kind === 'hyphen') specs.push(E.mark(m.from, m.to, 'tb-tf-del'), E.widget(m.to, '↵', 'tb-tf-join tb-tf-join--hy', 1));
    else if (m.kind === 'invisible') specs.push(E.mark(m.from, m.to, 'tb-tf-inv'));
    else specs.push(E.mark(m.from, m.to, 'tb-tf-lig'));
  }
  view.dispatch({ effects: E.layerEffect('transform', specs.filter((s) => s.from <= doc.length)) });
}
function transformPanel() {
  if (!view.state.doc.length) return `<section class="fw-insp-section"><p class="tb-muted">Paste text first. Presets fix PDF pastes, dedupe lists and more.</p></section>`;
  const r = recipeResult(); const sum = r ? summaryLine(r.results) : [];
  const ap = S.applied;
  return `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('layers', { size: 14 })}Presets</div>
      <div class="tb-chiprow">${PRESETS.map((p) => `<button class="fw-chip" type="button" data-preset="${p.id}" aria-pressed="${S.recipeLabel === p.label}">${esc(p.label)}</button>`).join('')}</div></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('case-sensitive', { size: 14 })}Change case <span class="tb-head-note">${view.state.selection.main.empty ? 'whole text' : 'selection'}</span></div>
      <div class="tb-chiprow">${Object.entries(CASES).map(([id, c]) => `<button class="fw-chip tb-casechip" type="button" data-case="${id}">${esc(c.label)}</button>`).join('')}</div></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('workflow', { size: 14 })}Recipe${S.recipeLabel ? ` <span class="tb-head-note">${esc(S.recipeLabel)}</span>` : ''}</div>
      ${S.recipe.length ? `<ol class="tb-recipe">${S.recipe.map((s, i) => { const res = r?.results[i]; const st = STEPS[s.id]; return `<li class="tb-step ${s.on ? '' : 'is-off'}"><span class="tb-step__grip" aria-hidden="true">${xicon('grip', { size: 14 })}</span>
          <label class="tb-step__on"><input type="checkbox" class="fw-check" data-step="${i}" ${s.on ? 'checked' : ''} aria-label="${esc(st.label)}"><span class="tb-step__n">${i + 1}</span><span class="tb-step__l">${esc(st.label)}</span></label>
          <span class="tb-step__c ${res?.count ? 'has' : ''}">${s.on ? (res?.count ? `${st.sign}${fmtN(res.count)}` : '0') : 'off'}</span>
          <button class="fw-iconbtn fw-iconbtn--sm tb-step__x" type="button" data-rm="${i}" aria-label="Remove step">${icon('x', { size: 13 })}</button></li>`; }).join('')}</ol>` : '<p class="tb-muted">Pick a preset or add steps. Nothing changes until you apply.</p>'}
      <button class="fw-btn fw-btn--ghost fw-btn--sm tb-addstep" type="button" id="addstep">${icon('plus')}Add step</button></section>
    <section class="fw-insp-section tb-applysec">${ap ? `<div class="tb-applied">${icon('circle-check', { size: 16 })}<div><b>Applied ${esc(ap.label)}</b><span>${esc(ap.sum)}</span></div></div>
        <div class="tb-btnrow"><button class="fw-btn fw-btn--sm" type="button" data-act="show-changes">${icon('git-compare')}Show changes</button><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-act="undo">Undo</button></div>`
      : `<div class="tb-preview"><span class="fw-label">Preview</span><b>${sum.length ? esc(sum.join(' · ')) : S.recipe.length ? 'Nothing to change' : '—'}</b></div>
        <button class="fw-btn fw-btn--primary fw-btn--block" type="button" data-act="apply" ${sum.length ? '' : 'disabled'}>Apply${S.recipe.length ? ` ${S.recipe.filter((s) => s.on).length} steps` : ''}<span class="fw-pointer-copy">${kbd('mod+enter', 'tb-kbd-on')}</span></button>`}</section>`;
}
function wireTransformPanel(root) {
  $$('[data-preset]', root).forEach((b) => (b.onclick = () => usePreset(b.dataset.preset)));
  $$('[data-step]', root).forEach((c) => (c.onchange = () => { S.recipe[+c.dataset.step].on = c.checked; S.applied = null; applyTransformDecos(); renderPanel(); }));
  $$('[data-rm]', root).forEach((b) => (b.onclick = () => { S.recipe.splice(+b.dataset.rm, 1); applyTransformDecos(); renderPanel(); }));
  $$('[data-case]', root).forEach((b) => (b.onclick = () => applyCase(b.dataset.case)));
  root.querySelector('#addstep')?.addEventListener('click', (e) => openMenu(e.currentTarget, ADDABLE.filter((id) => !S.recipe.some((s) => s.id === id)).map((id) => ({ label: STEPS[id].label, onSelect: () => { S.recipe.push({ id, on: true }); S.applied = null; applyTransformDecos(); renderPanel(); } }))));
}
function applyRecipe() {
  const r = recipeResult(); if (!r) return;
  const d = cur(); const before = textOf(view.state.doc);
  const sum = summaryLine(r.results).join(' · ');
  d.versions.push({ label: `Before “${S.recipeLabel || 'Transform'}”`, text: before, t: Date.now() });
  view.dispatch({ changes: { from: 0, to: before.length, insert: r.text }, userEvent: 'input.transform' });
  S.applied = { label: S.recipeLabel || `${S.recipe.filter((s) => s.on).length} steps`, sum };
  applyTransformDecos(); renderPanel(); renderLensControls();
  if (!panelVisible()) toast(`Cleaned up · ${sum}`, { type: 'success', action: { label: 'Undo', onClick: () => { E.undo(view); S.applied = null; renderPanel(); } } });
}
function applyCase(id) {
  const fn = CASES[id].fn; const sel = view.state.selection;
  const ranges = sel.ranges.every((r) => r.empty) ? [{ from: 0, to: view.state.doc.length }] : sel.ranges.filter((r) => !r.empty);
  view.dispatch({ changes: ranges.map((r) => ({ from: r.from, to: r.to, insert: fn(view.state.sliceDoc(r.from, r.to)) })), userEvent: 'input.case' });
  view.focus();
}
function showChanges() {
  const d = cur(); S.cmp.b = { doc: d.id }; S.cmp.a = { version: { doc: d.id, i: d.versions.length - 1 } }; S.cmp.cur = -1;
  setLens('compare');
}

// ───────────────────────── panel host (inspector / mobile sheet) ─────────────────────────
let sheet = null;
const panelVisible = () => !!sheet || (!isMobile() && S.panel);
const panelHost = () => (sheet ? sheet.body : panelEl);
function renderPanel() {
  const host = panelHost(); if (!host) return;
  const d = cur(); if (!d) return;
  const keep = host.scrollTop;
  const lens = S.lens;
  const html = lens === 'json' ? jsonPanel() : lens === 'compare' ? comparePanel() : lens === 'regex' ? regexPanel() : lens === 'stats' ? statsPanel() : transformPanel();
  const L = LENSES.find((l) => l.id === lens);
  host.innerHTML = (sheet ? '' : `<div class="tb-panelhead"><span class="tb-panelhead__ic">${icon(L.icon, { size: 15 })}</span><span>${L.label}</span><span class="tb-panelhead__doc">${esc(lens === 'compare' ? '' : d.name)}</span></div>`) + html;
  enhance(host);
  host.scrollTop = keep;
  if (lens === 'json') wireJsonPanel(host); if (lens === 'compare') wireComparePanel(host); if (lens === 'regex') wireRegexPanel(host); if (lens === 'stats') wireStatsPanel(host); if (lens === 'transform') wireTransformPanel(host);
  $$('[data-act]', host).forEach((b) => (b.onclick = () => act(b.dataset.act, b)));
}
function act(a, el) {
  switch (a) {
    case 'jump': jumpTo(cur().json.error.pos); if (isMobile()) closeLensSheet(); break;
    case 'repair': repairJson(); break;
    case 'undo': E.undo(view); S.applied = null; view.focus(); renderPanel(); break;
    case 'format': formatJson(); break;
    case 'minify': formatJson({ minify: true }); break;
    case 'copy-path': copyText(S.path || '$', el); break;
    case 'json-sample': loadSample('json'); break;
    case 'ts': toast('Mockup: generates a TypeScript type from the JSON shape', { type: 'info' }); break;
    case 'cmp-clip': case 'cmp-open': case 'cmp-sample':
      if (a === 'cmp-sample') loadSample('compare'); else if (a === 'cmp-open') pickFiles(); else { navigator.clipboard.readText().then((t) => { S.cmp.b = { doc: cur().id }; S.cmp.a = { text: t, name: 'Clipboard' }; setLens('compare'); layoutStage(); renderPanel(); }).catch(() => toast('Clipboard not available here.', { type: 'warning' })); }
      break;
    case 'patch': copyText(patchText(), el); break;
    case 'diff-dl': { const A = sideOf(S.cmp.a); const blob = new Blob([patchText()], { type: 'text/x-diff' }); const l = h(`<a download="${esc(A.name.replace(/\.\w+$/, ''))}.diff"></a>`); l.href = URL.createObjectURL(blob); l.click(); break; }
    case 'diff-md': copyText('```diff\n' + patchText() + '```\n', el); break;
    case 'rx-apply': applyReplace(); break;
    case 'rx-copy': copyText(S.rx.res.matches.map((m) => m.v).join('\n'), el); break;
    case 'apply': applyRecipe(); break;
    case 'show-changes': showChanges(); break;
  }
}
function primaryAction() {
  const d = cur(); if (!d || !view.state.doc.length) return null;
  switch (S.lens) {
    case 'json': if (d.kind !== 'json') return null; if (d.json && !d.json.ok) return d.json.error.fix ? { label: 'Repair', icon: 'wand-sparkles', run: repairJson } : { label: 'Jump to error', run: () => jumpTo(d.json.error.pos) };
      return { label: 'Format', icon: 'braces', kbd: 'shift+mod+f', run: () => formatJson(), disabled: !d.json?.ok };
    case 'compare': return compareReady() ? { label: 'Copy patch', icon: 'copy', run: () => copyText(patchText(), $('#primary')) } : null;
    case 'regex': return S.rx.res?.total ? { label: 'Copy matches', icon: 'copy', run: () => copyText(S.rx.res.matches.map((m) => m.v).join('\n'), $('#primary')) } : null;
    case 'transform': if (S.applied) return { label: 'Show changes', icon: 'git-compare', run: showChanges }; { const r = recipeResult(); const n = r ? summaryLine(r.results).length : 0; return { label: 'Apply', icon: 'check', kbd: 'mod+enter', mlabel: 'Apply', run: applyRecipe, disabled: !n }; }
    default: return { label: 'Save', icon: 'download', kbd: 'mod+s', run: saveFile };
  }
}

// mobile: lens chips row, status strip, sticky action bar, sheets
function renderMobileBits() {
  $('#lenschips').innerHTML = LENSES.map((l) => `<button class="fw-chip" type="button" data-lens="${l.id}" aria-pressed="${S.lens === l.id}">${icon(l.icon, { size: 14 })}${l.label}</button>`).join('');
  $$('#lenschips .fw-chip').forEach((c) => (c.onclick = () => setLens(c.dataset.lens, { sheet: true })));
  $('#m-paste').onclick = async () => { try { const t = await navigator.clipboard.readText(); if (t) { if (view.state.doc.length) newTab(); insertPasted(t); return; } } catch { /* */ } view.focus(); toast('Long-press in the text to paste', { type: 'info' }); };
  $('#m-open').onclick = pickFiles;
  $('#m-primary').onclick = () => primaryAction()?.run();
  $('#mstatus').onclick = () => { const err = cur()?.json?.ok === false; if (err) { jumpTo(cur().json.error.pos); return; } setLens(S.lens === 'compare' && compareReady() ? 'compare' : 'stats', { sheet: true }); };
}
function openLensSheet() {
  if (!isMobile() || !view.state.doc.length && S.lens !== 'compare') return;
  closeLensSheet(true);
  const L = LENSES.find((l) => l.id === S.lens);
  const s = openSheet({ title: L.label, height: 'peek', body: '<div class="tb-sheetbody"></div>', onClose: () => { if (sheet === s) sheet = null; } });
  s.body = s.el.querySelector('.tb-sheetbody'); sheet = s; s.el.classList.add('tb-sheet');
  renderPanel();
}
function closeLensSheet(silent) { if (sheet) { const s = sheet; sheet = null; s.close(); } }

// ───────────────────────── status bar ─────────────────────────
let sizeT = 0;
function scheduleSize(now) { clearTimeout(sizeT); sizeT = setTimeout(() => { const d = cur(); if (!d) return; d.bytes = bytesOf(textOf(view.state.doc)); renderStatus(); }, now ? 0 : 400); }
function renderStatus() {
  const d = cur(); if (!d) return;
  const st = view.state; const pos = st.selection.main.head; const line = st.doc.lineAt(Math.min(pos, st.doc.length));
  const sel = st.selection.main;
  const empty = !st.doc.length;
  let selInfo = '';
  if (!sel.empty) { const t = st.sliceDoc(sel.from, sel.to); selInfo = `<span class="fw-statusbar__item tb-st-sel">${fmtN(t.length > 2e5 ? (t.match(/\S+/g) || []).length : countWords(t))} words · ${fmtN(t.length > 2e5 ? t.length : graphemes(t))} chars selected</span>`; }
  const err = d.json && d.json.ok === false ? d.json.error : null;
  const kindLabel = S.lens === 'compare' && compareReady() ? 'Compare' : KIND_LABEL[d.kind];
  let html = `<span class="fw-statusbar__item tb-st-kind">${esc(kindLabel)}</span>`;
  if (S.lens === 'compare' && compareReady() && S.cmpRes) html += `<span class="fw-statusbar__item">${esc(sideOf(S.cmp.a).name)} → ${esc(sideOf(S.cmp.b).name)}</span><span class="fw-statusbar__item">${S.cmpRes.hunks} changes</span>`;
  else if (!empty) {
    html += `<span class="fw-statusbar__item">Ln ${fmtN(line.number)}, Col ${pos - line.from + 1}</span>${selInfo}<span class="fw-statusbar__item">${formatBytes(d.bytes || st.doc.length)}</span><span class="fw-statusbar__item">${fmtN(st.doc.lines)} ${st.doc.lines === 1 ? 'line' : 'lines'}</span>`;
    if (d.kind === 'json' && d.json?.ok) html += `<span class="fw-statusbar__item">${esc(d.json.summary.label)}</span>`;
    else if (d.kind !== 'json' && st.doc.length < 1.5e6) { const a = stats(); html += `<span class="fw-statusbar__item">${fmtN(a.words)} words</span>`; }
    if (err) html += `<button class="fw-statusbar__item tb-st-err" type="button" id="st-err">${icon('circle-alert', { size: 12 })}1 error · Ln ${fmtN(err.line)}</button>`;
    html += `<span class="fw-statusbar__item fw-hide-compact">UTF-8 · LF</span>`;
    if (d.kind === 'json') html += `<button class="fw-statusbar__item tb-st-path" type="button" id="st-path" data-tip="Copy path" ${!S.path || S.path === '$' ? 'hidden' : ''}><code>${esc(S.path || '')}</code></button>`;
  } else html += `<span class="fw-statusbar__item">Empty</span>`;
  html += `<button class="fw-statusbar__item fw-statusbar__save tb-save ${S.keep ? 'is-on' : ''}" type="button" id="st-save" aria-haspopup="dialog">${S.keep ? `<span class="fw-dotlive"></span>Saved on this device` : `${xicon('circle-dashed', { size: 12 })}Not saved · this tab only`}${icon('chevron-up', { size: 12 })}</button>`;
  $('#status').innerHTML = html;
  $('#st-err')?.addEventListener('click', () => jumpTo(err.pos));
  $('#st-path')?.addEventListener('click', (e) => copyText(S.path, null, { toastLabel: S.path }));
  $('#st-save').onclick = (e) => openSavePopover(e.currentTarget);
  // mobile strip
  const ms = $('#mstatus');
  if (err) ms.innerHTML = `<span class="tb-ms-err">${icon('circle-alert', { size: 14 })}Line ${fmtN(err.line)}: ${esc(err.message)}</span><span class="tb-ms-go">Fix</span>`;
  else if (empty) ms.innerHTML = `<span>${icon('lock', { size: 12 })} Stays in this tab</span>`;
  else if (S.lens === 'compare' && compareReady() && S.cmpRes) { const c = S.cmpRes.stats; ms.innerHTML = `<span>${S.cmpRes.hunks} changes · ${c.changed} changed · ${c.added} added · ${c.removed} removed${c.moved ? ` · ${c.moved} moved` : ''}</span><span class="tb-ms-go">List ${icon('chevron-up', { size: 14 })}</span>`; }
  else if (!sel.empty) ms.innerHTML = `<span>${selInfo.replace(/<[^>]+>/g, '')}</span><span class="tb-ms-go">${icon('chevron-up', { size: 14 })}</span>`;
  else if (d.kind === 'json' && d.json?.ok) ms.innerHTML = `<span>${icon('circle-check', { size: 14 })} Valid JSON · ${esc(d.json.summary.label)}</span><span class="tb-ms-go">${formatBytes(d.bytes || st.doc.length)}</span>`;
  else { const a = st.doc.length < 1.5e6 ? stats() : null; ms.innerHTML = `<span>${a ? `${fmtN(a.words)} words · ${fmtN(a.chars)} characters` : formatBytes(st.doc.length)}</span><span class="tb-ms-go">Stats ${icon('chevron-up', { size: 14 })}</span>`; }
}
function openSavePopover(anchor) {
  const total = S.docs.reduce((s, d, i) => s + (i === S.active ? view.state.doc.length : d.state.doc.length), 0);
  const body = h(`<div class="tb-savepop">
    <div class="tb-savepop__head">${xicon('hard-drive', { size: 18 })}<b>Keep text on this device</b></div>
    <p>${S.keep ? 'Your open texts are saved in this browser (IndexedDB) and come back next time. Nothing is uploaded.' : 'Right now your text lives only in this tab and is gone when you close it. Turn this on to keep drafts in this browser. Nothing is uploaded.'}</p>
    <label class="fw-toggle"><input type="checkbox" id="keep" ${S.keep ? 'checked' : ''}><span>Keep on this device</span></label>
    ${S.keep ? `<div class="tb-savepop__foot"><span>${S.docs.length} ${S.docs.length === 1 ? 'text' : 'texts'} · ${formatBytes(total)}</span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="clearsaved">${icon('trash-2')}Clear saved text</button></div>` : ''}</div>`);
  const p = openPopover(anchor, body, { placement: 'bottom-end', label: 'Saving', width: 320 });
  body.querySelector('#keep').onchange = (e) => { S.keep = e.target.checked; store.set('text-keep', S.keep); if (S.keep) persist(); else idbClear(); renderStatus(); p.close(); };
  body.querySelector('#clearsaved')?.addEventListener('click', () => { S.keep = false; store.set('text-keep', false); idbClear(); renderStatus(); p.close(); toast('Saved text cleared from this device', { type: 'neutral' }); });
}

// ───────────────────────── persistence (opt-in, IndexedDB) ─────────────────────────
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('fw-textbench', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function persist() {
  if (!S.keep) return;
  try { const db = await idb(); const tx = db.transaction('docs', 'readwrite'); tx.objectStore('docs').put(S.docs.map((d, i) => ({ name: d.name, kind: d.kind, origin: d.origin, text: (i === S.active ? view.state.doc : d.state.doc).toString() })), 'all'); } catch { /* storage blocked */ }
}
const schedulePersist = debounce(persist, 900);
async function idbClear() { try { const db = await idb(); db.transaction('docs', 'readwrite').objectStore('docs').delete('all'); } catch { /* */ } }
async function restore() {
  if (!S.keep) return false;
  try { const db = await idb(); const all = await new Promise((res) => { const r = db.transaction('docs').objectStore('docs').get('all'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    if (!all?.length) return false; all.forEach((x) => S.docs.push(newDoc(x))); switchTo(0); return true; } catch { return false; }
}

// ───────────────────────── keys ─────────────────────────
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); if (cur()?.kind === 'json') formatJson(); return; }
  if (mod && e.key === 'Enter') { const p = primaryAction(); if (p && !p.disabled) { e.preventDefault(); p.run(); } return; }
  if (mod && e.key === '\\') { e.preventDefault(); S.panel = !S.panel; layoutPanel(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); return; }
  if (e.altKey && !mod && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); setLens(LENSES[+e.code.slice(5) - 1].id); return; }
  if (e.altKey && !mod && e.code === 'KeyN') { e.preventDefault(); newTab(); return; }
  if (e.altKey && !mod && e.code === 'KeyZ') { e.preventDefault(); toggleWrap(); return; }
  if (e.key === 'F7' && S.lens === 'compare') { e.preventDefault(); stepChange(e.shiftKey ? -1 : 1); }
});
window.addEventListener('resize', debounce(() => { if (S.lens === 'compare' && compareReady()) renderCompare(); if (!isMobile()) closeLensSheet(); }, 150));
window.addEventListener('fw-theme-change', () => {});

// ───────────────────────── boot ─────────────────────────
renderFramebar(); renderMobileBits();
if (!(await restore())) { S.docs.push(newDoc({ name: 'Untitled 1' })); switchTo(0); }
const sample = params.get('sample');
if (sample) await loadSample(sample);
if (!isMobile() && !sample) view.focus();
window.tb = { S, get view() { return view; }, setLens, loadSample, formatJson, gotoPath, jumpTo, repairJson, usePreset, applyRecipe, renderPanel };
