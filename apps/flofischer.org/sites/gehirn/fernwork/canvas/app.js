// Fernboard · Canvas mockup (archetype A, floating chrome). Shelf of boards + full-bleed board with live
// Diagram (Mermaid) and Mind map blocks, Export sheet, History, Undo for everything.
import './icons-extra.js';
import { mountShell, toast, openDialog, openPopover, openMenu, icon, esc, $, $$, h, kbd, isTyping, hasLayers, pushLayer,
  isMobile, isCoarse, effectiveTheme, store, enhance, shortAgo, formatBytes, canonicalId } from '../kit/shell.js';
import * as S from './scene.js';
import * as MM from './mindmap.js';
import * as DG from './diagram.js';

const params = new URLSearchParams(location.search);
// Revision 1 leaves: fernboard (the shelf) · presets draw, mind-map, mermaid (old ?leaf=diagram → mermaid)
const LEAF = ((l) => (['draw', 'mind-map', 'mermaid'].includes(l) ? l : 'fernboard'))(canonicalId(params.get('leaf') || 'fernboard'));
const raf = (fn) => requestAnimationFrame(fn);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const theme = () => effectiveTheme();
const slug = (s) => String(s || 'board').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'board';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ───────────────────────── samples & templates ─────────────────────────
const SEQ = 'sequenceDiagram\n  participant U as You\n  participant A as App\n  participant S as Server\n  U->>A: Tap “Log in”\n  A->>S: POST /login\n  S-->>A: Session token';
const FLOW = 'flowchart LR\n  A[Cart] --> B{Signed in?}\n  B -->|Yes| C[Pay]\n  B -->|No| D[Log in]\n  D --> C\n  C --> E[(Order saved)]';
const GANTT = 'gantt\n  dateFormat YYYY-MM-DD\n  title Launch\n  section Build\n  Editor     :a1, 2026-10-01, 10d\n  Export     :a2, after a1, 6d\n  section Ship\n  Beta       :b1, after a2, 5d\n  Release    :milestone, after b1, 0d';
const LISBON = '# Trip to Lisbon\n- Travel\n  - Flight Fri 7:40\n  - Airport metro\n- Stay\n  - Alfama flat\n- Food\n  - Pastéis de nata\n  - Time Out Market\n- Sights\n  - Belém tower\n  - Tram 28';
const MM_NEW = '# Central idea';
// today's Mermaid templates (Class, State, ER, Pie, Timeline, Quadrant) as Insert items
const CLASS = 'classDiagram\n  class Customer {\n    +name: string\n  }\n  class Order {\n    +id: int\n    +total() float\n  }\n  Customer "1" --> "*" Order : places';
const STATE = 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review : submit\n  Review --> Published : approve\n  Review --> Draft : changes\n  Published --> [*]';
const ER = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : "ordered in"';
const PIE = 'pie title Time spent\n  "Build" : 45\n  "Review" : 25\n  "Meetings" : 30';
const TIMELINE = 'timeline\n  title Product history\n  2024 : Idea : Prototype\n  2025 : Beta\n  2026 : Launch';
const QUADRANT = 'quadrantChart\n  title Effort vs impact\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  quadrant-1 Plan it\n  quadrant-2 Do now\n  quadrant-3 Skip\n  quadrant-4 Later\n  Export: [0.3, 0.8]\n  Themes: [0.75, 0.6]\n  Icons: [0.2, 0.3]';
const DIAGRAMS = { flowchart: [FLOW, 'Flowchart', [560, 240]], sequence: [SEQ, 'Sequence', [500, 330]], gantt: [GANTT, 'Gantt chart', [620, 260]], class: [CLASS, 'Class diagram', [420, 300]],
  state: [STATE, 'State diagram', [420, 360]], er: [ER, 'ER diagram', [460, 320]], pie: [PIE, 'Pie chart', [420, 300]], timeline: [TIMELINE, 'Timeline', [560, 260]], quadrant: [QUADRANT, 'Quadrant chart', [440, 440]] };

function T(type, props) { return S.make(type, props); }
function arrowBetween(a, b, props = {}) { const el = T('arrow', { pts: [S.center(a), S.center(b)], start: a.id, end: b.id, ...props }); return el; }
const TEMPLATES = [
  { id: 'blank', name: 'Blank board', sub: 'Start from nothing', icon: 'square-plus', make: () => [] },
  { id: 'flowchart', name: 'Flowchart', sub: 'Steps and decisions', icon: 'workflow', leaf: 'mermaid', make: () => [T('diagram', { x: 0, y: 0, w: 620, h: 250, code: FLOW, title: 'Checkout flow' })] },
  { id: 'sequence', name: 'Sequence', sub: 'Who talks to whom', icon: 'arrow-left-right', leaf: 'mermaid', make: () => [T('diagram', { x: 0, y: 0, w: 520, h: 330, code: SEQ, title: 'Login flow' })] },
  { id: 'mindmap', name: 'Mind map', sub: 'Branch out by keyboard', icon: 'network', leaf: 'mind-map', make: () => [T('mindmap', { x: 0, y: 0, w: 640, h: 360, md: LISBON, title: 'Trip to Lisbon' })] },
  { id: 'retro', name: 'Retro', sub: 'Three columns of stickies', icon: 'sticky-note', make: () => retro() },
  { id: 'gantt', name: 'Gantt chart', sub: 'Tasks over time', icon: 'calendar-clock', leaf: 'mermaid', make: () => [T('diagram', { x: 0, y: 0, w: 640, h: 260, code: GANTT, title: 'Launch timeline' })] },
];
function retro() {
  const out = []; const cols = [['Went well', 'mint', ['Export sheet landed', 'Pairing on Fridays']], ['To improve', 'pink', ['Flaky e2e tests', 'Too many meetings']], ['Try next', 'sky', ['Demo every sprint']]];
  cols.forEach(([title, tone, notes], i) => {
    out.push(T('text', { x: i * 230, y: 0, text: title, font: 'l', w: 160, h: 36 }));
    notes.forEach((n, j) => out.push(T('sticky', { x: i * 230, y: 56 + j * 170, w: 200, h: 150, text: n, tone })));
  });
  return out;
}
function seedBoards() {
  const now = Date.now(), min = 60e3, day = 864e5;
  const a = T('rect', { x: 0, y: 40, w: 170, h: 78, label: 'Browser', color: 'blue', fill: 'tint' });
  const b = T('rect', { x: 300, y: 40, w: 170, h: 78, label: 'API', color: 'violet', fill: 'tint' });
  const c = T('ellipse', { x: 600, y: 30, w: 180, h: 98, label: 'Postgres', color: 'green', fill: 'hatch' });
  const st = T('sticky', { x: 150, y: 200, w: 210, h: 130, text: 'Keep payment keys server-side', tone: 'yellow' });
  const flow = T('diagram', { x: 460, y: 220, w: 520, h: 230, code: FLOW, title: 'Checkout flow' });
  const lis = T('mindmap', { x: 0, y: 0, w: 720, h: 400, md: LISBON, title: 'Trip to Lisbon' });
  const s1 = T('sticky', { x: 780, y: 20, w: 190, h: 140, text: 'Book Belém tickets online', tone: 'pink' });
  const login = T('diagram', { x: 0, y: 84, w: 560, h: 360, code: SEQ, title: 'Login flow' });
  const lt = T('text', { x: 0, y: 0, text: 'Login v2 · draft', font: 'l', w: 220, h: 36 });
  const ln = T('sticky', { x: 330, y: 440, w: 220, h: 120, text: 'Rate-limit after 5 tries?', tone: 'sky' });
  const boards = [
    { id: 'b-arch', name: 'Checkout architecture', created: now - 9 * day, updated: now - 2 * min, elements: [a, b, c, arrowBetween(a, b), arrowBetween(b, c), st, flow] },
    { id: 'b-lisbon', name: 'Trip to Lisbon', created: now - 20 * day, updated: now - day - 3 * 36e5, elements: [lis, s1] },
    { id: 'b-login', name: 'Login flow', created: now - 12 * day, updated: now - 3 * day, elements: [lt, login, ln] },
    { id: 'b-retro', name: 'Sprint 42 retro', created: now - 30 * day, updated: now - 8 * day, elements: retro() },
  ];
  for (const bd of boards) {
    S.updateBindings(bd.elements);
    bd.snaps = [
      { id: S.uid('s'), t: bd.updated - 47 * min, label: 'Auto-saved', els: bd.elements.slice(0, Math.max(1, bd.elements.length - 2)) },
      { id: S.uid('s'), t: bd.updated - 3 * 36e5, label: 'Checkpoint “first draft”', named: true, els: bd.elements.slice(0, Math.max(1, bd.elements.length - 3)) },
    ];
    store.set('canvas:b:' + bd.id, bd);
  }
  store.set('canvas:index', boards.map(({ id, name, created, updated }) => ({ id, name, created, updated })));
}

// ───────────────────────── persistence (one fw:* store; IndexedDB in the real build) ─────────────────────────
const IDX = 'canvas:index';
const index = () => store.get(IDX, []);
const loadBoard = (id) => store.get('canvas:b:' + id, null);
function writeBoard(bd) {
  store.set('canvas:b:' + bd.id, bd);
  const idx = index(); const i = idx.findIndex((x) => x.id === bd.id); const row = { id: bd.id, name: bd.name, created: bd.created, updated: bd.updated, trashed: bd.trashed || null };
  if (i >= 0) idx[i] = row; else idx.unshift(row); store.set(IDX, idx);
}
function newBoard(name, elements = []) {
  const taken = new Set(index().map((x) => x.name)); let nm = name, k = 2; while (taken.has(nm)) nm = `${name} ${k++}`;
  const bd = { id: S.uid('b-'), name: nm, created: Date.now(), updated: Date.now(), elements, snaps: [] };
  S.updateBindings(elements); writeBoard(bd); return bd;
}
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('fw-canvas') : null;

// ───────────────────────── block rendering cache ─────────────────────────
const svgCache = new Map(Object.entries(store.get('canvas:svg', {})));
const pending = new Set();
const ckey = (code, th) => th + '|' + code;
let cacheSaveT = 0;
function persistCache() { clearTimeout(cacheSaveT); cacheSaveT = setTimeout(() => { const e = [...svgCache.entries()].slice(-24); store.set('canvas:svg', Object.fromEntries(e)); }, 400); }
const mmCache = new Map();
/** Collapsed mind maps (today's "Collapse all") show the main branches only, each with a "+n" count. */
function collapseTree(root) {
  const count = (n) => n.children.reduce((a, c) => a + 1 + count(c), 0);
  return { ...root, children: root.children.map((c) => ({ ...c, text: count(c) ? `${c.text} +${count(c)}` : c.text, children: [] })) };
}
function mindSvg(md, collapsed = false) {
  const k = (collapsed ? 'c|' : '') + md;
  let s = mmCache.get(k);
  if (!s) { const root = MM.fromMarkdown(md); s = MM.staticSvg(collapsed ? collapseTree(root) : root).svg; mmCache.set(k, s); if (mmCache.size > 60) mmCache.delete(mmCache.keys().next().value); }
  return s;
}
const failed = new Set(), liveGood = new Map();
function queueRender(code, th) {
  const k = ckey(code, th); if (svgCache.has(k) || pending.has(k) || failed.has(k)) return;
  pending.add(k);
  DG.render(code, th).then((r) => { svgCache.set(k, r.svg); persistCache(); }).catch(() => failed.add(k)).finally(() => { pending.delete(k); repaintAll(); });
}
function blockCtx(th = theme()) {
  return {
    block(el) {
      if (el.type === 'mindmap') return { svg: mindSvg(el.md || MM_NEW, el.collapsed) };
      if (!el.code?.trim()) return null;
      const k = ckey(el.code, th);
      if (svgCache.has(k)) return { svg: svgCache.get(k) };
      queueRender(el.code, th);
      const lg = liveGood.get(el.id) || el.lastGood;
      if (lg && lg !== el.code) { const k2 = ckey(lg, th); if (svgCache.has(k2)) return { svg: svgCache.get(k2), stale: true }; queueRender(lg, th); }
      return failed.has(k) ? { error: true } : { loading: true };
    },
  };
}
async function ensureRendered(els, th) {
  const jobs = els.filter((e) => e.type === 'diagram' && e.code?.trim() && !svgCache.has(ckey(e.code, th))).map((e) => DG.render(e.code, th).then((r) => { svgCache.set(ckey(e.code, th), r.svg); }).catch(() => {}));
  await Promise.all(jobs); persistCache();
}
function svgAspect(svg) { const m = svg && svg.match(/viewBox="\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([\d.e]+)[\s,]+([\d.e]+)"/); return m ? [+m[3], +m[4]] : null; }
/** Size a block to its content's natural size (readable at 100 %), unless the user resized it by hand. */
function fitBlock(el, svg) {
  if (!svg || el.manual) return false;
  const a = svgAspect(svg); if (!a) return false;
  const [vw, vh] = a, pad = 28;
  let w = clamp(vw + pad, 300, 780), h = ((w - pad) * vh) / vw + pad;
  if (h > 560) { h = 560; w = ((h - pad) * vw) / vh + pad; }
  if (h < 120) h = 120;
  if (Math.abs(el.w - w) < 2 && Math.abs(el.h - h) < 2) return false;
  el.w = Math.round(w); el.h = Math.round(h); return true;
}
const blockSvg = (el, th = theme()) => (el.type === 'mindmap' ? mindSvg(el.md || MM_NEW, el.collapsed) : svgCache.get(ckey(el.code, th)));
async function fitAll(els, th = theme()) { await ensureRendered(els, th); let ch = false; for (const el of els) if (S.isBlock(el)) ch = fitBlock(el, blockSvg(el, th)) || ch; if (ch) S.updateBindings(els); return ch; }
let repaintT = 0;
function repaintAll() { cancelAnimationFrame(repaintT); repaintT = raf(() => { if (B.board) draw(); else renderShelfGrid(); }); }

// ───────────────────────── fonts for exports ─────────────────────────
let fontCss = null;
async function embeddedFonts() {
  if (fontCss != null) return fontCss;
  const files = [[400, 'geist-latin-400-normal'], [500, 'geist-latin-500-normal'], [600, 'geist-latin-600-normal']];
  const parts = await Promise.all(files.map(async ([w, n]) => {
    const buf = await (await fetch(`../kit/fonts/${n}.woff2`)).arrayBuffer();
    let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return `@font-face{font-family:Geist;font-weight:${w};src:url(data:font/woff2;base64,${btoa(bin)}) format("woff2")}`;
  }));
  fontCss = parts.join('');
  return fontCss;
}
const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
async function toCanvas(svg, w, h, scale) {
  const img = new Image(); img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  return c;
}

// ───────────────────────── shell ─────────────────────────
const onBoard = () => !!B.board && !B.focus;
mountShell({
  category: 'canvas', leaf: LEAF, archetype: 'workbench', accept: ['*'], acceptLabel: 'Fernboard',
  // page commands in ⌘K ("On this page"); ⌘K itself is pure tool search
  commands: [
    { id: 'cv-new', label: 'New board', icon: 'plus', kbd: 'n', syn: ['blank', 'whiteboard', 'board'], hidden: () => !!B.board, run: () => createFrom('blank') },
    { id: 'cv-insert', label: 'Insert diagram or mind map…', icon: 'square-plus', kbd: '/', syn: ['mermaid', 'flowchart', 'sequence', 'mind map', 'diagram', 'class', 'gantt'], hidden: () => !onBoard(), run: () => openInsert($('#cv-insert').offsetParent ? $('#cv-insert') : $('#m-insert')) },
    { id: 'cv-export', label: 'Export board…', icon: 'download', kbd: 'shift+mod+e', syn: ['png', 'svg', 'pdf', 'download', 'save'], hidden: () => !onBoard(), run: () => openExport() },
    { id: 'cv-history', label: 'History', icon: 'history', kbd: 'shift+mod+h', syn: ['versions', 'restore', 'undo'], hidden: () => !onBoard(), run: () => toggleHistory(true) },
    { id: 'cv-open', label: 'Open file as new board…', icon: 'folder-open', kbd: 'mod+o', syn: ['open', 'import', 'excalidraw', 'mmd', 'markdown'], run: () => pickFiles() },
    { id: 'cv-boards', label: 'All boards', icon: 'layout-template', syn: ['shelf', 'boards', 'list'], hidden: () => !B.board, run: () => showShelf({ push: true }) },
  ],
  onFiles: (files, { source } = {}) => onFiles(files, source),
  onPasteText: (t) => onPasteText(t),
  shortcuts: [
    { label: 'New board (shelf)', keys: 'n' }, { label: 'Select · Hand', keys: 'v' }, { label: 'Rectangle · Diamond · Ellipse', keys: 'r' },
    { label: 'Arrow · Line', keys: 'a' }, { label: 'Pen · Text · Sticky note', keys: 'p' }, { label: 'Insert diagram or mind map', keys: '/' },
    { label: 'Export', keys: 'shift+mod+e' }, { label: 'Copy as PNG', keys: 'shift+mod+c' }, { label: 'History', keys: 'shift+mod+h' },
    { label: 'Fit board · 100 %', keys: 'f' }, { label: 'Undo · Redo', keys: 'mod+z' },
  ],
});
const main = $('#main');
main.innerHTML = `<div class="cv" id="cv">
  <div class="cv-shelf" id="shelf" hidden></div>
  <div class="cv-board" id="boardview" hidden></div>
</div>`;
applyTheme();

// ───────────────────────── shelf ─────────────────────────
let shelfFilter = 'all';
function boardKinds(bd) { const t = new Set(bd.elements.map((e) => e.type)); return { diagram: t.has('diagram'), mindmap: t.has('mindmap'), sketch: [...t].some((x) => !['diagram', 'mindmap'].includes(x)) }; }
function thumbFor(els, { th = theme(), pad = 28 } = {}) {
  if (!els.length) return '';
  const { svg } = S.sceneSvg(els, { theme: th, background: 'board', padding: pad, ctx: blockCtx(th) });
  return svgUrl(svg);
}
function showShelf({ push = false } = {}) {
  closeFocus(false); B.board = null;
  if (push) history.pushState(null, '', location.pathname);
  $('#boardview').hidden = true; $('#shelf').hidden = false; document.title = 'Fernboard · Fernwork';
  document.documentElement.classList.remove('cv-on-board');
  const sh = $('#shelf');
  sh.innerHTML = `<div class="cv-shelf__in">
    <header class="cv-shelf__head">
      <div class="cv-shelf__titles"><h1 class="fw-h1">Fernboard</h1><p class="fw-lede">Draw, mind-map and diagram on one board.</p></div>
      <div class="cv-shelf__actions">
        <button class="fw-btn" type="button" id="sh-open">${icon('folder-open')}Open file…</button>
        <button class="fw-btn fw-btn--primary" type="button" id="sh-new">${icon('plus')}New board<kbd class="fw-kbd fw-kbd-hint cv-kbd-on-primary">N</kbd></button>
      </div>
    </header>
    <section class="cv-shelf__sec" aria-labelledby="tpl-h">
      <h2 class="cv-sec-title" id="tpl-h">Start something new</h2>
      <div class="cv-templates" id="templates">${TEMPLATES.map((t) => `<button class="cv-tpl" type="button" data-tpl="${t.id}">
        <span class="cv-tpl__prev" data-prev="${t.id}">${t.id === 'blank' ? `<span class="cv-tpl__plus">${icon('plus', { size: 22 })}</span>` : ''}</span>
        <span class="cv-tpl__meta"><span class="cv-tpl__name">${icon(t.icon)}${esc(t.name)}</span><span class="cv-tpl__sub">${esc(t.sub)}</span></span></button>`).join('')}</div>
    </section>
    <section class="cv-shelf__sec" aria-labelledby="boards-h">
      <div class="cv-shelf__bar"><h2 class="cv-sec-title" id="boards-h">Your boards</h2>
        <div class="fw-chips cv-filter" role="group" aria-label="Show">${[['all', 'All'], ['sketch', 'Draw'], ['mindmap', 'Mind Map'], ['diagram', 'Mermaid']].map(([v, l]) => `<button class="fw-chip" type="button" data-f="${v}" aria-pressed="${shelfFilter === v}">${l}</button>`).join('')}</div>
        <span class="fw-spacer"></span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="trash-btn" hidden></button></div>
      <div class="cv-grid" id="grid"></div>
    </section>
  </div>`;
  $('#sh-new').onclick = () => createFrom('blank');
  $('#sh-open').onclick = () => pickFiles();
  $('#trash-btn').onclick = (e) => trashPopover(e.currentTarget);
  $$('[data-tpl]', sh).forEach((b) => (b.onclick = () => createFrom(b.dataset.tpl)));
  $$('.cv-filter .fw-chip', sh).forEach((b) => (b.onclick = () => { shelfFilter = b.dataset.f; $$('.cv-filter .fw-chip', sh).forEach((x) => x.setAttribute('aria-pressed', x === b)); renderShelfGrid(); }));
  renderTemplates(); renderShelfGrid();
  ensureRendered(TEMPLATES.flatMap((t) => (t.cache ||= t.make())), theme()).then(() => { if (!B.board) renderTemplates(); });
}
function renderTemplates() {
  for (const t of TEMPLATES) {
    if (t.id === 'blank') continue;
    const els = (t.cache ||= t.make()); const el = $(`[data-prev="${t.id}"]`); if (!el) continue;
    el.innerHTML = `<img alt="" src="${thumbFor(els, { pad: 18 })}">`;
  }
}
function renderShelfGrid() {
  const grid = $('#grid'); if (!grid || B.board) return;
  const rows = index().filter((r) => !r.trashed).sort((a, b) => b.updated - a.updated);
  const boards = rows.map((r) => loadBoard(r.id)).filter(Boolean).filter((bd) => shelfFilter === 'all' || boardKinds(bd)[shelfFilter]);
  if (!boards.length) grid.innerHTML = `<div class="fw-empty cv-grid__empty"><div class="fw-empty__icon">${icon('layout-template')}</div><div class="fw-empty__title">No ${shelfFilter === 'all' ? 'boards' : esc({ sketch: 'drawings', mindmap: 'mind maps', diagram: 'Mermaid diagrams' }[shelfFilter])} yet</div><div class="fw-empty__text">Pick a template above or drop a file here.</div></div>`;
  else grid.innerHTML = boards.map((bd) => {
    const k = boardKinds(bd); const blocks = bd.elements.filter(S.isBlock).length;
    const meta = [shortAgo(bd.updated), blocks ? plural(blocks, 'block') : plural(bd.elements.length, 'object')].join(' · ');
    return `<article class="cv-card" data-id="${bd.id}">
      <a class="cv-card__link" href="?board=${bd.id}" aria-label="Open ${esc(bd.name)}"><span class="cv-card__thumb">${bd.elements.length ? `<img alt="" src="${thumbFor(bd.elements)}">` : `<span class="cv-card__blank">Empty board</span>`}</span></a>
      <div class="cv-card__meta"><div class="cv-card__text"><span class="cv-card__name">${esc(bd.name)}</span><span class="cv-card__sub">${esc(meta)}</span></div>
        <span class="cv-card__kinds" aria-hidden="true">${k.sketch ? icon('pen-line', { size: 14 }) : ''}${k.diagram ? icon('workflow', { size: 14 }) : ''}${k.mindmap ? icon('network', { size: 14 }) : ''}</span>
        <button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="More for ${esc(bd.name)}" data-tip="More" data-more="${bd.id}">${icon('ellipsis')}</button></div></article>`;
  }).join('');
  $$('.cv-card__link', grid).forEach((a) => (a.onclick = (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); openBoard(a.closest('.cv-card').dataset.id, { push: true }); }));
  $$('[data-more]', grid).forEach((b) => (b.onclick = () => boardMenu(b, b.dataset.more)));
  // Trash: only shown while it holds something (functional, not a status line)
  const trashed = index().filter((r) => r.trashed).length, tb = $('#trash-btn');
  tb.hidden = !trashed; tb.innerHTML = `${icon('trash-2')}Trash · ${trashed}`;
}
function boardMenu(anchor, id) {
  const bd = loadBoard(id);
  openMenu(anchor, [
    { label: 'Open', icon: 'arrow-up-right', onSelect: () => openBoard(id, { push: true }) },
    { label: 'Rename…', icon: 'pencil', onSelect: () => renameBoard(id) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => { const c = newBoard(`${bd.name} copy`, JSON.parse(JSON.stringify(bd.elements))); renderShelfGrid(); toast(`Duplicated as “${c.name}”`); } },
    { label: 'Export…', icon: 'download', kbd: 'shift+mod+e', onSelect: () => openExport({ board: bd }) },
    { label: 'Move to trash', icon: 'trash-2', danger: true, onSelect: () => trashBoard(id) },
  ], { placement: 'bottom-end' });
}
function renameBoard(id) {
  const bd = loadBoard(id);
  const d = openDialog({ title: 'Rename board', size: 400, body: `<div class="fw-field"><label class="fw-field__label" for="rn">Name</label><input class="fw-input" id="rn" value="${esc(bd.name)}"></div>`, initialFocus: '#rn',
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Rename', primary: true, onClick: () => { const v = $('#rn').value.trim(); if (v && v !== bd.name) { bd.name = v; writeBoard(bd); renderShelfGrid(); } } }] });
  d.el.querySelector('#rn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); d.el.querySelector('.fw-btn--primary').click(); } });
  setTimeout(() => d.el.querySelector('#rn')?.select(), 30);
}
function trashBoard(id) {
  const bd = loadBoard(id); bd.trashed = Date.now(); writeBoard(bd);
  if (B.board?.id === id) showShelf({ push: true }); else renderShelfGrid();
  toast(`Moved “${bd.name}” to Trash · kept 7 days`, { type: 'neutral', action: { label: 'Undo', onClick: () => { bd.trashed = null; writeBoard(bd); renderShelfGrid(); } } });
}
function trashPopover(anchor) {
  const rows = index().filter((r) => r.trashed);
  const p = openPopover(anchor, h(`<div class="cv-trash"><div class="fw-menu__label">Trash · deleted after 7 days</div>${rows.map((r) => `<div class="cv-trash__row"><span class="fw-ellipsis">${esc(r.name)}</span><span class="fw-faint fw-t-xs">${shortAgo(r.trashed)}</span><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-restore="${r.id}">Restore</button></div>`).join('')}</div>`), { placement: 'bottom-start', width: 340 });
  $$('[data-restore]', p.el).forEach((b) => (b.onclick = () => { const bd = loadBoard(b.dataset.restore); bd.trashed = null; writeBoard(bd); p.close(); renderShelfGrid(); toast(`Restored “${bd.name}”`); }));
}
function createFrom(tplId, { focusTitle = true, replace = false } = {}) {
  const t = TEMPLATES.find((x) => x.id === tplId) || TEMPLATES[0];
  const els = JSON.parse(JSON.stringify(t.cache || t.make())).map((e) => ({ ...e, id: S.uid(), seed: S.newSeed() }));
  const bd = newBoard(t.id === 'blank' ? 'Untitled board' : t.name, els);
  openBoard(bd.id, { push: !replace, fresh: true, focusTitle: focusTitle && t.id === 'blank' });
  if (t.id !== 'blank') { const blk = B.els.find(S.isBlock); if (blk) { B.sel = new Set([blk.id]); draw(); } }
}

// ───────────────────────── board state ─────────────────────────
const B = { board: null, els: [], sel: new Set(), tool: 'select', view: { x: 0, y: 0, z: 1 }, past: [], future: [], drag: null, editing: null,
  fresh: null, space: false, hover: null, preview: null, focus: null, penMode: true, nodes: new Map(), pop: null, histOpen: false };
window.__cv = B;
const TOOLS = [
  { id: 'select', key: 'V', icon: 'mouse-pointer-2', label: 'Select' }, { id: 'hand', key: 'H', icon: 'hand', label: 'Hand' },
  { sep: 1 },
  { id: 'rect', key: 'R', icon: 'square', label: 'Rectangle' }, { id: 'diamond', key: 'D', icon: 'diamond', label: 'Diamond' }, { id: 'ellipse', key: 'O', icon: 'circle', label: 'Ellipse' },
  { id: 'arrow', key: 'A', icon: 'move-up-right', label: 'Arrow' }, { id: 'line', key: 'L', icon: 'slash-line', label: 'Line' },
  { id: 'pen', key: 'P', icon: 'pen-line', label: 'Pen' }, { id: 'text', key: 'T', icon: 'type', label: 'Text' }, { id: 'sticky', key: 'S', icon: 'sticky-note', label: 'Sticky note' },
];
const KEYMAP = { v: 'select', h: 'hand', r: 'rect', d: 'diamond', o: 'ellipse', a: 'arrow', l: 'line', p: 'pen', b: 'pen', t: 'text', s: 'sticky' };
const style = { color: 'ink', fill: 'none', sw: 2, sloppy: 1, tone: 'yellow', font: 'm' };

function snapshot() { return JSON.stringify(B.els); }
function commit(before, { save: sv = true } = {}) { if (before === snapshot()) return; B.past.push(before); if (B.past.length > 200) B.past.shift(); B.future = []; if (sv) save(); syncUndo(); }
function change(fn) { const before = snapshot(); fn(); S.updateBindings(B.els); commit(before); draw(); }
function undo() { if (!B.past.length) return false; B.future.push(snapshot()); B.els = JSON.parse(B.past.pop()); pruneSel(); save(); draw(); syncUndo(); return true; }
function redo() { if (!B.future.length) return; B.past.push(snapshot()); B.els = JSON.parse(B.future.pop()); pruneSel(); save(); draw(); syncUndo(); }
function pruneSel() { const ids = new Set(B.els.map((e) => e.id)); B.sel = new Set([...B.sel].filter((i) => ids.has(i))); }
const byId = (id) => B.els.find((e) => e.id === id);
const selected = () => B.els.filter((e) => B.sel.has(e.id));

let saveT = 0, lastAuto = 0;
function save() {
  if (!B.board) return;
  setSaveState('saving');
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const bd = B.board; bd.elements = B.els; bd.updated = Date.now(); bd.view = B.view;
    if (B.els.length && Date.now() - lastAuto > 5 * 60e3 && B.past.length > 6) { lastAuto = Date.now(); addSnap('Auto-saved'); }
    writeBoard(bd); bc?.postMessage({ id: bd.id, t: bd.updated, from: tabId });
    setTimeout(() => setSaveState('saved'), 260);
  }, 320);
}
const tabId = S.uid('tab');
bc && (bc.onmessage = (e) => {
  if (!B.board || e.data.id !== B.board.id || e.data.from === tabId) return;
  if (B.editing || B.focus || B.drag) { toast('This board changed in another tab', { type: 'warning', action: { label: 'Reload', onClick: () => openBoard(B.board.id) } }); return; }
  const fresh = loadBoard(B.board.id); if (!fresh) return; B.els = fresh.elements; B.board = fresh; pruneSel(); draw(); setSaveState('saved', 'Synced from another tab');
});
function addSnap(label, els = B.els, extra = {}) {
  const bd = B.board; bd.snaps = [{ id: S.uid('s'), t: Date.now(), label, els: JSON.parse(JSON.stringify(els)), ...extra }, ...(bd.snaps || [])].slice(0, 30);
  if (B.histOpen) renderHistory();
}

// ───────────────────────── board view ─────────────────────────
function openBoard(id, { push = false, fresh = false, focusTitle = false } = {}) {
  const bd = loadBoard(id);
  if (!bd || bd.trashed) { toast('That board is in the Trash or gone', { type: 'warning' }); return showShelf({ push: true }); }
  if (push) history.pushState(null, '', `?board=${encodeURIComponent(id)}`);
  closeFocus(false);
  B.board = bd; B.els = bd.elements || []; B.sel = new Set(); B.past = []; B.future = []; B.tool = 'select'; B.fresh = null; B.preview = null; B.nodes = new Map();
  $('#shelf').hidden = true; const v = $('#boardview'); v.hidden = false;
  document.documentElement.classList.add('cv-on-board');
  document.title = `${bd.name} · Fernboard · Fernwork`;
  buildBoardView();
  if (bd.view && !fresh) B.view = { ...bd.view }; else fitView(false);
  draw(); syncUndo(); setSaveState('saved');
  if (focusTitle) setTimeout(() => { const t = $('#cv-title'); t.focus(); t.select(); }, 60);
  else $('#stage').focus({ preventScroll: true });
  if (isCoarse() && !store.get('canvas:pen-hint-dismissed')) $('#penhint').hidden = false;
}
function buildBoardView() {
  const v = $('#boardview');
  v.innerHTML = `
  <div class="cv-boardgrid ${B.histOpen ? 'has-history' : ''}" id="bgrid">
    <div class="cv-stagewrap">
      <div class="cv-stage" id="stage" tabindex="0" role="application" aria-roledescription="board" aria-label="${esc(B.board.name)} board. Press R for a rectangle, A for an arrow, slash to insert a diagram or mind map." >
        <svg class="cv-svg" id="svg" xmlns="http://www.w3.org/2000/svg">
          <defs>${S.hatchDefs()}<pattern id="cv-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="1.1" style="fill:var(--k-grid)"/></pattern></defs>
          <rect class="cv-paper" width="100%" height="100%" style="fill:var(--k-paper)"/>
          <rect class="cv-dots" width="100%" height="100%" fill="url(#cv-dots)"/>
          <g id="world"><g id="els"></g><g id="ovl"></g></g>
        </svg>
        <textarea class="cv-textedit" id="textedit" hidden spellcheck="false" aria-label="Edit text"></textarea>
        <div class="cv-hint" id="emptyhint" hidden><span class="cv-hint__title">An empty board</span><span class="cv-hint__keys cv-pointer">Press ${kbd('r')} for a box, ${kbd('a')} for an arrow, ${kbd('/')} for a diagram or mind map</span><span class="cv-hint__keys cv-touch">Draw with the pen, or tap ${icon('plus', { size: 14 })} to add a diagram or mind map</span></div>
        <div class="cv-previewbar" id="previewbar" hidden></div>
      </div>
      <div class="cv-chrome">
        <div class="cv-pill" id="docpill">
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cv-back" aria-label="All boards" data-tip="All boards">${icon('chevron-left')}</button>
          <span class="cv-pill__sep"></span>
          <input class="cv-title" id="cv-title" value="${esc(B.board.name)}" aria-label="Board name" spellcheck="false" autocomplete="off">
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cv-docmenu" aria-label="Board menu" data-tip="Board menu" aria-haspopup="menu">${icon('chevron-down')}</button>
          <span class="cv-save" id="cv-save" data-state="saved" role="status" aria-live="polite"></span>
        </div>
        <div class="cv-dock" id="dock" role="toolbar" aria-label="Tools">
          ${TOOLS.map((t) => (t.sep ? '<span class="cv-dock__sep"></span>' : `<button class="cv-tool" type="button" data-tool="${t.id}" aria-label="${t.label}" aria-pressed="false" data-tip="${t.label}" data-tip-kbd="${t.key.toLowerCase()}">${icon(t.icon, { size: 18 })}<span class="cv-tool__key" aria-hidden="true">${t.key}</span></button>`)).join('')}
          <span class="cv-dock__sep"></span>
          <button class="cv-tool cv-tool--insert" type="button" id="cv-insert" aria-label="Insert diagram or mind map" data-tip="Insert" data-tip-kbd="/" aria-haspopup="dialog">${icon('square-plus', { size: 18 })}<span class="cv-tool__lbl">Insert</span><kbd class="fw-kbd fw-kbd-hint">/</kbd></button>
        </div>
        <div class="cv-right">
          <button class="fw-iconbtn fw-iconbtn--outline cv-float" type="button" id="cv-hist" aria-label="History" data-tip="History" data-tip-kbd="shift+mod+h" aria-pressed="${B.histOpen}">${icon('history', { size: 18 })}</button>
          <button class="fw-btn fw-btn--primary cv-export-btn" type="button" id="cv-export" data-tip="Export or copy" data-tip-kbd="shift+mod+e">${icon('download')}<span class="fw-hide-mobile">Export</span></button>
        </div>
        <div class="cv-undo fw-hide-mobile">
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cv-undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z">${icon('undo-2')}</button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cv-redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z">${icon('redo-2')}</button>
        </div>
        <div class="fw-zoom cv-zoom" role="group" aria-label="Zoom">
          <button class="fw-iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="-" data-z="out">${icon('minus')}</button>
          <button class="fw-zoom__pct" type="button" id="cv-pct" aria-label="Zoom level, click to fit" data-tip="Fit board" data-tip-kbd="f">100 %</button>
          <button class="fw-iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+" data-z="in">${icon('plus')}</button>
        </div>
        <div class="cv-seltb" id="seltb" role="toolbar" aria-label="Selection" hidden></div>
        <div class="cv-penhint" id="penhint" hidden>${icon('pen-line', { size: 16 })}<span><b>Pen draws</b> · finger pans</span><button class="cv-penhint__toggle" type="button" id="penmode" aria-pressed="false">Finger draws too</button><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="penhint-x" aria-label="Dismiss">${icon('x')}</button></div>
      </div>
      <nav class="cv-mdock" id="mdock" aria-label="Tools">
        <button class="cv-mtool" type="button" id="m-undo" aria-label="Undo">${icon('undo-2', { size: 20 })}</button>
        <button class="cv-mtool" type="button" data-tool="select" aria-label="Select" aria-pressed="false">${icon('mouse-pointer-2', { size: 20 })}</button>
        <button class="cv-mtool" type="button" data-tool="pen" aria-label="Pen" aria-pressed="false">${icon('pen-line', { size: 20 })}</button>
        <button class="cv-mtool" type="button" id="m-shapes" aria-label="Shapes" aria-haspopup="menu" data-shapes>${icon('square', { size: 20 })}</button>
        <button class="cv-mtool" type="button" data-tool="text" aria-label="Text" aria-pressed="false">${icon('type', { size: 20 })}</button>
        <button class="cv-mtool cv-mtool--add" type="button" id="m-insert" aria-label="Insert diagram or mind map">${icon('plus', { size: 22 })}</button>
        <button class="cv-mtool" type="button" id="m-more" aria-label="More">${icon('ellipsis', { size: 20 })}</button>
      </nav>
    </div>
    <aside class="cv-history" id="history" aria-label="History"></aside>
  </div>
  <section class="cv-focus" id="focus" hidden aria-modal="false"></section>`;
  enhance(v);
  const stage = $('#stage');
  bindStage(stage);
  $('#cv-back').onclick = () => showShelf({ push: true });
  const title = $('#cv-title');
  const fitTitle = () => { title.style.width = Math.min(isMobile() ? 150 : 320, S.measure(title.value || ' ', 14, 500) + 18) + 'px'; };
  fitTitle();
  title.addEventListener('input', fitTitle);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } if (e.key === 'Escape') { title.value = B.board.name; title.blur(); } });
  title.addEventListener('blur', () => { const n = title.value.trim() || 'Untitled board'; title.value = n; fitTitle(); if (n !== B.board.name) { B.board.name = n; document.title = `${n} · Fernboard · Fernwork`; save(); } stage.focus({ preventScroll: true }); });
  $('#cv-docmenu').onclick = (e) => docMenu(e.currentTarget);
  $$('[data-tool]', v).forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('#cv-insert').onclick = (e) => openInsert(e.currentTarget);
  $('#m-insert').onclick = (e) => openInsert(e.currentTarget);
  $('#m-undo').onclick = () => undo();
  $('#m-shapes').onclick = (e) => openMenu(e.currentTarget, [['rect', 'Rectangle', 'square'], ['ellipse', 'Ellipse', 'circle'], ['diamond', 'Diamond', 'diamond'], ['arrow', 'Arrow', 'move-up-right'], ['line', 'Line', 'slash-line'], ['sticky', 'Sticky note', 'sticky-note']].map(([id, l, ic]) => ({ label: l, icon: ic, checked: B.tool === id, onSelect: () => setTool(id) })), { placement: 'bottom-center' });
  $('#m-more').onclick = (e) => docMenu(e.currentTarget);
  $('#cv-hist').onclick = () => toggleHistory();
  $('#cv-export').onclick = () => openExport();
  $('#cv-undo').onclick = () => undo(); $('#cv-redo').onclick = () => redo();
  $$('[data-z]', v).forEach((b) => (b.onclick = () => zoomBy(b.dataset.z === 'in' ? 1.25 : 0.8)));
  $('#cv-pct').onclick = () => fitView(true);
  $('#penmode').onclick = (e) => { B.penMode = !B.penMode; e.currentTarget.setAttribute('aria-pressed', !B.penMode); toast(B.penMode ? 'Pen draws · finger pans' : 'Finger draws too · two fingers pan', { type: 'info', duration: 2000 }); };
  $('#penhint-x').onclick = () => { $('#penhint').hidden = true; store.set('canvas:pen-hint-dismissed', true); };
  if (B.histOpen) renderHistory();
  applyTheme();
}
function setSaveState(state, note) {
  const el = $('#cv-save'); if (!el) return;
  el.dataset.state = state;
  const t = new Date(); el.dataset.tip = note || `Saved ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  el.innerHTML = state === 'saving' ? '<span class="cv-save__dot"></span><span class="cv-save__txt">Saving…</span>' : `${icon('check', { size: 14 })}<span class="cv-save__txt">${note ? 'Synced' : 'Saved'}</span>`;
}
function syncUndo() { const u = $('#cv-undo'), r = $('#cv-redo'); if (u) u.disabled = !B.past.length; if (r) r.disabled = !B.future.length; }
function setTool(t) {
  B.tool = t; B.fresh = null;
  $$('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t));
  const shapes = $('#m-shapes'); if (shapes) { const m = { rect: 'square', ellipse: 'circle', diamond: 'diamond', arrow: 'move-up-right', line: 'slash-line', sticky: 'sticky-note' }; shapes.setAttribute('aria-pressed', !!m[t]); shapes.innerHTML = icon(m[t] || 'square', { size: 20 }); }
  const st = $('#stage'); if (st) st.dataset.tool = t;
  if (t !== 'select') { B.sel.clear(); }
  draw();
}
function applyTheme() { $('#cv').style.cssText = S.themeVars(theme()); }
window.addEventListener('fw-theme-change', () => setTimeout(() => { applyTheme(); failed.clear(); B.nodes.forEach((n) => (n.key = null)); if (B.board) draw(); else { renderTemplates(); renderShelfGrid(); } if (B.focus?.type === 'diagram') B.focus.rerender?.(); if (B.histOpen) renderHistory(); ensureRendered(B.board ? B.els : TEMPLATES.flatMap((t) => t.cache || []), theme()).then(repaintAll); }, 30));

// ───────────────────────── view (pan/zoom) ─────────────────────────
function stageRect() { return $('#stage').getBoundingClientRect(); }
function toWorld(cx, cy) { const r = stageRect(), v = B.view; return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z]; }
function toScreen(x, y) { const v = B.view; return [x * v.z + v.x, y * v.z + v.y]; }
function zoomAt(sx, sy, z) { const v = B.view; z = clamp(z, 0.1, 4); B.view = { z, x: sx - ((sx - v.x) * z) / v.z, y: sy - ((sy - v.y) * z) / v.z }; draw(); persistView(); }
function zoomBy(m) { const r = stageRect(); zoomAt(r.width / 2, r.height / 2, B.view.z * m); }
let viewT = 0; function persistView() { clearTimeout(viewT); viewT = setTimeout(() => { if (B.board) { B.board.view = B.view; writeBoard(B.board); } }, 600); }
function fitTarget(els = B.els, { maxZ = 1 } = {}) {
  const r = stageRect(), b = S.unionBounds(els);
  if (!b) return { x: r.width / 2, y: r.height / 2, z: 1 };
  const top = isMobile() ? 70 : 76, bottom = isMobile() ? 86 : 70, side = isMobile() ? 20 : 64;
  const z = clamp(Math.min((r.width - side * 2) / b.w, (r.height - top - bottom) / b.h), 0.1, maxZ);
  return { z, x: r.width / 2 - (b.x + b.w / 2) * z, y: top + (r.height - top - bottom) / 2 - (b.y + b.h / 2) * z };
}
function fitView(animate = true, els) { const t = fitTarget(els); if (animate) animateView(t); else { B.view = t; draw(); } }
let animId = 0;
function animateView(to, ms = 420) {
  const from = { ...B.view }, t0 = performance.now(), id = ++animId;
  const step = (now) => { if (id !== animId) return; const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    B.view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e }; draw(); if (k < 1) raf(step); else persistView(); };
  raf(step);
}

// ───────────────────────── rendering ─────────────────────────
let drawQ = 0;
function draw() { if (drawQ) return; drawQ = raf(() => { drawQ = 0; paint(); }); }
function keyOf(el, th, ctx) { const { x, y, src, ...rest } = el; let bk = ''; if (S.isBlock(el)) { const b = ctx.block(el); bk = th + (b ? `${b.svg?.length || 0}:${b.loading ? 1 : 0}${b.error ? 1 : 0}${b.stale ? 1 : 0}` : '-'); } return JSON.stringify(S.isLinear(el) ? el : rest) + (src ? src.length : '') + bk; }
function paint() {
  if (!B.board || !$('#els')) return;
  const th = theme(), v = B.view, els = B.preview ? B.preview.els : B.els;
  $('#world').setAttribute('transform', `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${v.z.toFixed(4)})`);
  const pat = $('#cv-dots'); const gs = 24 * v.z < 12 ? 96 : 24 * v.z < 24 ? 48 : 24;
  pat.setAttribute('width', gs * v.z); pat.setAttribute('height', gs * v.z); pat.setAttribute('patternTransform', `translate(${(v.x % (gs * v.z)).toFixed(2)} ${(v.y % (gs * v.z)).toFixed(2)})`);
  const host = $('#els'), ctx = blockCtx(th), seen = new Set();
  let prev = null;
  for (const el of els) {
    seen.add(el.id);
    let n = B.nodes.get(el.id);
    if (!n) { n = { g: document.createElementNS('http://www.w3.org/2000/svg', 'g'), key: null }; n.g.dataset.id = el.id; B.nodes.set(el.id, n); }
    const k = keyOf(el, th, ctx);
    if (n.key !== k) { n.key = k; n.g.innerHTML = S.renderInner(el, ctx); n.g.dataset.type = el.type; }
    if (!S.isLinear(el)) n.g.setAttribute('transform', `translate(${el.x.toFixed(2)} ${el.y.toFixed(2)})`); else n.g.removeAttribute('transform');
    n.g.classList.toggle('is-editing', B.editing?.id === el.id);
    const want = prev ? prev.nextSibling : host.firstChild;
    if (want !== n.g) host.insertBefore(n.g, want);
    prev = n.g;
  }
  for (const [id, n] of B.nodes) if (!seen.has(id)) { n.g.remove(); B.nodes.delete(id); }
  paintOverlay();
  $('#emptyhint').hidden = !!els.length || !!B.drag;
  $('#cv-pct').textContent = `${Math.round(v.z * 100)} %`;
  positionSelTb();
}
function paintOverlay() {
  const o = $('#ovl'), z = B.view.z, sw = 1.5 / z; let s = '';
  const sel = B.preview ? [] : selected();
  if (B.hover && !B.sel.has(B.hover)) { const e = byId(B.hover); if (e) s += outline(e, 'cv-ovl-hover', sw); }
  if (B.drag?.bindTarget) { const e = byId(B.drag.bindTarget); if (e) s += outline(e, 'cv-ovl-bind', 2 / z, 6 / z); }
  for (const e of sel) s += outline(e, 'cv-ovl-sel', sw, 0, sel.length > 1);
  if (sel.length === 1) {
    const e = sel[0], hs = (isCoarse() ? 14 : 9) / z;
    if (S.isLinear(e)) for (const [i, p] of [[0, e.pts[0]], [1, e.pts.at(-1)]]) s += `<circle class="cv-handle" data-h="pt${i}" cx="${p[0]}" cy="${p[1]}" r="${hs / 1.6}" stroke-width="${sw}"/>`;
    else if (e.type !== 'text' && e.type !== 'pen') { const b = S.bounds(e); for (const [hx, hy, c] of [[b.x, b.y, 'nw'], [b.x + b.w, b.y, 'ne'], [b.x + b.w, b.y + b.h, 'se'], [b.x, b.y + b.h, 'sw']]) s += `<rect class="cv-handle" data-h="${c}" x="${hx - hs / 2}" y="${hy - hs / 2}" width="${hs}" height="${hs}" rx="${2 / z}" stroke-width="${sw}"/>`; }
  } else if (sel.length > 1) { const b = S.unionBounds(sel); s += `<rect class="cv-ovl-group" x="${b.x - 8 / z}" y="${b.y - 8 / z}" width="${b.w + 16 / z}" height="${b.h + 16 / z}" stroke-width="${sw}" stroke-dasharray="${5 / z} ${4 / z}" rx="${6 / z}"/>`; }
  if (B.drag?.type === 'marquee') { const m = B.drag; const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1); s += `<rect class="cv-marquee" x="${x}" y="${y}" width="${Math.abs(m.x1 - m.x0)}" height="${Math.abs(m.y1 - m.y0)}" stroke-width="${sw}"/>`; }
  if (B.fresh && B.sel.has(B.fresh) && !B.editing) {
    const e = byId(B.fresh); if (e) { const b = S.bounds(e); s += `<text class="cv-typehint" x="${b.x + b.w / 2}" y="${b.y + b.h + 22 / z}" font-size="${12 / z}" text-anchor="middle">Type to label · Esc to skip</text>`; }
  }
  o.innerHTML = s;
}
function outline(e, cls, sw, grow = 0, thin = false) {
  const g = grow + 5 / B.view.z;
  if (S.isLinear(e)) return `<path class="${cls}" d="M${e.pts.map((p) => p.join(' ')).join('L')}" stroke-width="${sw * (cls === 'cv-ovl-sel' ? 1 : 1)}" fill="none" opacity="${cls === 'cv-ovl-sel' ? 0.0 : 1}"/>` + (cls === 'cv-ovl-sel' ? `<path class="cv-ovl-sel" d="M${e.pts.map((p) => p.join(' ')).join('L')}" stroke-width="${8 / B.view.z}" fill="none" opacity=".18"/>` : '');
  const b = S.bounds(e), top = S.isBlock(e) ? 0 : 0;
  if (e.type === 'ellipse' && cls === 'cv-ovl-bind') return `<ellipse class="${cls}" cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2 + g}" ry="${b.h / 2 + g}" stroke-width="${sw}"/>`;
  return `<rect class="${cls}" x="${b.x - g}" y="${b.y - g - top}" width="${b.w + g * 2}" height="${b.h + g * 2 + top}" rx="${(S.isBlock(e) ? 14 : 4) / B.view.z + g / 2}" stroke-width="${sw}" ${thin ? 'opacity=".55"' : ''}/>`;
}

// ───────────────────────── pointer interaction ─────────────────────────
const pointers = new Map();
function bindStage(stage) {
  const svg = $('#svg');
  stage.addEventListener('pointerdown', (e) => onDown(e));
  stage.addEventListener('pointermove', (e) => onMove(e));
  stage.addEventListener('pointerup', (e) => onUp(e));
  stage.addEventListener('pointercancel', (e) => onUp(e, true));
  stage.addEventListener('dblclick', (e) => onDbl(e));
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stageRect(); if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, B.view.z * Math.exp(-e.deltaY * 0.0075)); else { B.view = { ...B.view, x: B.view.x - e.deltaX, y: B.view.y - e.deltaY }; draw(); persistView(); } }, { passive: false });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerleave', () => { if (B.hover) { B.hover = null; draw(); } });
}
function topHit(x, y) { const tol = 6 / B.view.z; for (let i = B.els.length - 1; i >= 0; i--) if (S.hit(B.els[i], x, y, tol)) return B.els[i]; return null; }
function handleAt(cx, cy) { const t = document.elementFromPoint(cx, cy); return t?.closest?.('.cv-handle')?.dataset.h || null; }
function onDown(e) {
  if (B.preview || e.target.closest('.cv-textedit')) return;
  if (e.pointerType === 'mouse') e.preventDefault(); // keep focus where we put it (text editor), no compat mousedown focus
  if (B.editing) commitText();
  const stage = $('#stage'); stage.setPointerCapture(e.pointerId); stage.focus({ preventScroll: true });
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  closePops();
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; B.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), c0: [(a.x + b.x) / 2, (a.y + b.y) / 2], v0: { ...B.view } }; removeDraftIfAny(); return; }
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  const fingerPans = e.pointerType === 'touch' && B.penMode && ['pen', 'rect', 'ellipse', 'diamond', 'arrow', 'line'].includes(B.tool);
  if (e.button === 1 || B.space || B.tool === 'hand' || fingerPans) { B.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...B.view } }; stage.classList.add('is-panning'); return; }
  if (e.button === 2) return;
  const before = snapshot();
  if (B.tool === 'select') {
    const hnd = handleAt(e.clientX, e.clientY);
    if (hnd && B.sel.size === 1) { const el = selected()[0]; B.drag = { type: hnd.startsWith('pt') ? 'endpoint' : 'resize', h: hnd, el, b0: S.bounds(el), before, x0: wx, y0: wy }; return; }
    const hitEl = topHit(wx, wy);
    if (hitEl) {
      if (e.shiftKey) { B.sel.has(hitEl.id) ? B.sel.delete(hitEl.id) : B.sel.add(hitEl.id); }
      else if (!B.sel.has(hitEl.id)) B.sel = new Set([hitEl.id]);
      if (B.fresh !== hitEl.id) B.fresh = null;
      B.drag = { type: 'move', x0: wx, y0: wy, lx: wx, ly: wy, before, moved: false };
    } else {
      if (!e.shiftKey) B.sel.clear(); B.fresh = null;
      B.drag = { type: 'marquee', x0: wx, y0: wy, x1: wx, y1: wy, base: new Set(B.sel) };
    }
    draw(); return;
  }
  B.sel.clear(); B.fresh = null;
  const st = { color: style.color, sw: style.sw, sloppy: style.sloppy };
  if (['rect', 'ellipse', 'diamond'].includes(B.tool)) {
    const el = S.make(B.tool, { ...st, fill: style.fill, x: wx, y: wy, w: 0, h: 0 }); B.els.push(el);
    B.drag = { type: 'create', el, x0: wx, y0: wy, before };
  } else if (B.tool === 'arrow' || B.tool === 'line') {
    const start = topHit(wx, wy); const ok = start && S.isBindable(start) ? start : null;
    const el = S.make(B.tool, { ...st, pts: [ok ? S.center(ok) : [wx, wy], [wx, wy]], start: ok?.id || null }); B.els.push(el);
    B.drag = { type: 'arrow', el, before, x0: wx, y0: wy };
  } else if (B.tool === 'pen') {
    const el = S.make('pen', { ...st, x: wx, y: wy, pts: [[0, 0]] }); B.els.push(el);
    B.drag = { type: 'pen', el, before };
  } else if (B.tool === 'text') {
    const el = S.make('text', { color: style.color, font: style.font, x: wx, y: wy - 14, text: '' }); B.els.push(el);
    setTool('select'); B.sel = new Set([el.id]); draw(); editText(el, { before }); return;
  } else if (B.tool === 'sticky') {
    const el = S.make('sticky', { tone: style.tone, x: wx - 90, y: wy - 75 }); B.els.push(el);
    setTool('select'); B.sel = new Set([el.id]); draw(); editText(el, { before }); return;
  }
  draw();
}
function removeDraftIfAny() { const d = B.drag; if (d && ['create', 'arrow', 'pen'].includes(d.type)) B.els = B.els.filter((x) => x !== d.el); }
function onMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { ...pointers.get(e.pointerId), x: e.clientX, y: e.clientY });
  const d = B.drag; const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (!d) {
    if (B.tool === 'select' && e.pointerType === 'mouse' && !B.preview) { const hv = topHit(wx, wy)?.id || null; const st = $('#stage'); st.classList.toggle('is-over', !!hv || !!handleAt(e.clientX, e.clientY)); if (hv !== B.hover) { B.hover = hv; draw(); } }
    return;
  }
  if (d.type === 'pinch') {
    const [a, b] = [...pointers.values()]; if (!b) return; const dist = Math.hypot(a.x - b.x, a.y - b.y), c = [(a.x + b.x) / 2, (a.y + b.y) / 2], r = stageRect();
    const z = clamp(d.v0.z * (dist / d.d0), 0.1, 4), cx = d.c0[0] - r.left, cy = d.c0[1] - r.top;
    B.view = { z, x: cx - ((cx - d.v0.x) * z) / d.v0.z + (c[0] - d.c0[0]), y: cy - ((cy - d.v0.y) * z) / d.v0.z + (c[1] - d.c0[1]) }; draw(); return;
  }
  if (d.type === 'pan') { B.view = { ...d.v0, x: d.v0.x + e.clientX - d.sx, y: d.v0.y + e.clientY - d.sy }; draw(); return; }
  if (d.type === 'move') {
    const dx = wx - d.lx, dy = wy - d.ly; if (!d.moved && Math.hypot(wx - d.x0, wy - d.y0) * B.view.z < 3) return;
    d.moved = true; d.lx = wx; d.ly = wy;
    for (const el of selected()) { if (S.isLinear(el) && (el.start || el.end) && !(B.sel.has(el.start) || B.sel.has(el.end))) { el.start = null; el.end = null; } S.moveBy(el, dx, dy); }
    S.updateBindings(B.els); B.fresh = null; draw(); return;
  }
  if (d.type === 'marquee') {
    d.x1 = wx; d.y1 = wy; const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), hh = Math.abs(d.y1 - d.y0);
    B.sel = new Set(d.base); for (const el of B.els) { const b = S.bounds(el); if (b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + hh) B.sel.add(el.id); }
    draw(); return;
  }
  if (d.type === 'create') {
    let w = wx - d.x0, hh = wy - d.y0; if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
    Object.assign(d.el, { x: Math.min(d.x0, d.x0 + w), y: Math.min(d.y0, d.y0 + hh), w: Math.abs(w), h: Math.abs(hh) }); draw(); return;
  }
  if (d.type === 'arrow') {
    const tgt = topHit(wx, wy); const ok = tgt && S.isBindable(tgt) && tgt.id !== d.el.start ? tgt : null;
    d.bindTarget = ok?.id || null;
    d.el.pts[d.el.pts.length - 1] = ok ? S.center(ok) : [wx, wy]; d.el.end = ok?.id || null;
    S.updateBindings([d.el, ...B.els.filter((x) => x.id === d.el.start || x.id === d.el.end)]);
    draw(); return;
  }
  if (d.type === 'endpoint') {
    const el = d.el, i = d.h === 'pt0' ? 0 : el.pts.length - 1, key = i === 0 ? 'start' : 'end', other = i === 0 ? el.end : el.start;
    const tgt = topHit(wx, wy); const ok = tgt && tgt !== el && S.isBindable(tgt) && tgt.id !== other ? tgt : null;
    d.bindTarget = ok?.id || null; el[key] = ok?.id || null; el.pts[i] = ok ? S.center(ok) : [wx, wy]; S.updateBindings(B.els); draw(); return;
  }
  if (d.type === 'pen') { const p = [wx - d.el.x, wy - d.el.y], l = d.el.pts.at(-1); if (Math.hypot(p[0] - l[0], p[1] - l[1]) * B.view.z > 1.5) { d.el.pts.push(p); draw(); } return; }
  if (d.type === 'resize') {
    const el = d.el, b = d.b0; let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    if (d.h.includes('w')) x1 = wx; if (d.h.includes('e')) x2 = wx; if (d.h.includes('n')) y1 = wy; if (d.h.includes('s')) y2 = wy;
    if (e.shiftKey || el.type === 'image') { const r = b.w / b.h; const w = Math.abs(x2 - x1); const nh = w / r; if (d.h.includes('n')) y1 = y2 - nh; else y2 = y1 + nh; }
    if (S.isBlock(el)) el.manual = true;
    const min = 24; Object.assign(el, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(min, Math.abs(x2 - x1)), h: Math.max(min, Math.abs(y2 - y1)) });
    S.updateBindings(B.els); draw();
  }
}
function onUp(e, cancel = false) {
  pointers.delete(e.pointerId);
  const d = B.drag; if (!d) return;
  if (d.type === 'pinch') { if (pointers.size < 2) { B.drag = null; persistView(); } return; }
  B.drag = null; $('#stage').classList.remove('is-panning');
  if (d.type === 'pan') { persistView(); return; }
  if (cancel) { removeDraftIfAny.call(null); draw(); return; }
  if (d.type === 'create') {
    const el = d.el;
    if (el.w < 8 && el.h < 8) { const def = { rect: [170, 80], ellipse: [150, 96], diamond: [150, 110] }[el.type]; Object.assign(el, { w: def[0], h: def[1], x: d.x0 - def[0] / 2, y: d.y0 - def[1] / 2 }); }
    B.sel = new Set([el.id]); B.fresh = el.id; setTool('select'); B.fresh = el.id; commit(d.before); draw(); return;
  }
  if (d.type === 'arrow') {
    const el = d.el; const a = el.pts[0], b = el.pts.at(-1);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 10 && !el.end) { B.els = B.els.filter((x) => x !== el); draw(); return; }
    S.updateBindings(B.els); B.sel = new Set([el.id]); setTool('select'); commit(d.before); draw();
    if (el.start && el.end) announce(`Arrow connects ${labelOf(byId(el.start))} to ${labelOf(byId(el.end))}`);
    return;
  }
  if (d.type === 'pen') { if (d.el.pts.length < 2) d.el.pts.push([0.5, 0.5]); commit(d.before); draw(); return; }
  if (d.type === 'move' || d.type === 'resize' || d.type === 'endpoint') { if (d.type === 'move' && !d.moved) { draw(); return; } commit(d.before); draw(); return; }
  draw();
}
const labelOf = (el) => (el ? el.label || el.text || el.title || el.type : 'nothing');
function announce(msg) { let r = $('#cv-live'); if (!r) { r = h('<div class="fw-sr" id="cv-live" aria-live="polite"></div>'); document.body.append(r); } r.textContent = msg; }
function onDbl(e) {
  if (B.preview) return;
  const [wx, wy] = toWorld(e.clientX, e.clientY); const el = topHit(wx, wy);
  if (!el) { const before = snapshot(); const t = S.make('text', { color: style.color, font: style.font, x: wx, y: wy - 14 }); B.els.push(t); B.sel = new Set([t.id]); draw(); editText(t, { before }); return; }
  if (S.isBlock(el)) return openFocus(el);
  if (['rect', 'ellipse', 'diamond', 'text', 'sticky'].includes(el.type)) editText(el, {});
}

// ───────────────────────── text editing (Esc commits, never destroys) ─────────────────────────
function editText(el, { initial, before = snapshot() } = {}) {
  const ta = $('#textedit'); B.editing = { id: el.id, before, el };
  const isLabel = ['rect', 'ellipse', 'diamond'].includes(el.type);
  ta.value = initial != null ? initial : isLabel ? el.label : el.text || '';
  ta.dataset.kind = isLabel ? 'label' : el.type;
  placeEditor(); ta.hidden = false; draw();
  ta.focus({ preventScroll: true });
  if (initial == null && ta.value) ta.select(); else ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.oninput = () => { if (isLabel) el.label = ta.value; else el.text = ta.value; if (el.type === 'text') { const L = S.textLayout(el); el.w = L.w; el.h = L.h; } placeEditor(); B.nodes.get(el.id) && (B.nodes.get(el.id).key = null); draw(); };
  ta.oninput();
  ta.onkeydown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && isLabel && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); commitText(); }
  };
  ta.onblur = () => setTimeout(() => { if (B.editing?.id === el.id && document.activeElement !== ta) commitText(); }, 0);
}
function placeEditor() {
  const ed = B.editing; if (!ed) return; const el = ed.el, ta = $('#textedit'), z = B.view.z, b = S.bounds(el);
  const [sx, sy] = toScreen(b.x, b.y);
  const isLabel = ta.dataset.kind === 'label', size = (el.type === 'sticky' ? 17 : S.FONT[el.font || 'm'] * (el.type === 'diamond' ? 0.9 : 1)) * z;
  Object.assign(ta.style, { fontSize: size + 'px', lineHeight: (el.type === 'text' ? 1.3 : 1.25) + '', color: el.type === 'sticky' ? 'var(--k-sticky-ink)' : `var(--k-${el.color})` });
  if (isLabel) { const w = (el.type === 'rect' ? b.w - 20 : b.w * 0.7) * z, lines = Math.max(1, (ta.value.match(/\n/g) || []).length + 1); Object.assign(ta.style, { left: sx + (b.w * z - w) / 2 + 'px', top: sy + (b.h * z) / 2 - (lines * size * 1.25) / 2 + 'px', width: w + 'px', height: lines * size * 1.25 + 4 + 'px', textAlign: 'center' }); }
  else if (el.type === 'sticky') Object.assign(ta.style, { left: sx + 14 * z + 'px', top: sy + 14 * z + 'px', width: (b.w - 28) * z + 'px', height: (b.h - 28) * z + 'px', textAlign: 'left' });
  else Object.assign(ta.style, { left: sx - 1 + 'px', top: sy + 'px', width: Math.max(60, b.w * z + size) + 'px', height: Math.max(size * 1.3, b.h * z) + 4 + 'px', textAlign: 'left' });
}
function commitText() {
  const ed = B.editing; if (!ed) return; B.editing = null;
  const ta = $('#textedit'); ta.hidden = true; ta.onblur = null;
  const el = byId(ed.id);
  if (el && el.type === 'text' && !el.text.trim()) B.els = B.els.filter((x) => x !== el);
  if (el && el.type === 'text') { const L = S.textLayout(el); el.w = L.w; el.h = L.h; }
  B.fresh = null; S.updateBindings(B.els); commit(ed.before); draw();
  $('#stage')?.focus({ preventScroll: true });
}

// ───────────────────────── selection toolbar ─────────────────────────
function positionSelTb() {
  const tb = $('#seltb'); if (!tb) return;
  const sel = B.preview || B.editing || B.drag?.type === 'create' || B.drag?.type === 'pen' ? [] : selected();
  if (!sel.length || B.focus) { tb.hidden = true; tb.dataset.sig = ''; return; }
  const sig = sel.map((e) => `${e.id}:${e.color}:${e.fill}:${e.sw}:${e.sloppy}:${e.tone}:${e.font}`).join('|');
  if (tb.dataset.sig !== sig) { tb.dataset.sig = sig; tb.innerHTML = selTbHtml(sel); bindSelTb(tb, sel); }
  tb.hidden = false;
  const b = S.unionBounds(sel), [x1, y1] = toScreen(b.x, b.y), [x2, y2] = toScreen(b.x + b.w, b.y + b.h), r = stageRect();
  const w = tb.offsetWidth, hh = tb.offsetHeight, top = 66, bottom = r.height - (isMobile() ? 84 : 60);
  const others = B.els.filter((e) => !B.sel.has(e.id)).map((e) => { const q = S.bounds(e), [a, c] = toScreen(q.x, q.y - (S.isBlock(e) ? 26 : 0)), [d, f] = toScreen(q.x + q.w, q.y + q.h); return [a, c, d, f]; });
  const cx = clamp((x1 + x2) / 2 - w / 2, 8, r.width - w - 8);
  const cands = [[cx, y1 - hh - 14], [cx, y2 + 14], [cx, y1 - hh - 14 - 64], [cx, y2 + 14 + 64]].map(([x, y]) => [x, clamp(y, top, bottom - hh)]);
  const cost = ([x, y], i) => others.reduce((a, [l, t, rr, bb]) => a + Math.max(0, Math.min(rr, x + w) - Math.max(l, x)) * Math.max(0, Math.min(bb, y + hh) - Math.max(t, y)), 0) + Math.max(0, Math.min(x2, x + w) - Math.max(x1, x)) * Math.max(0, Math.min(y2, y + hh) - Math.max(y1, y)) * 4 + i * 400;
  const best = cands.map((c, i) => [c, cost(c, i)]).sort((a, b2) => a[1] - b2[1])[0][0];
  tb.style.transform = `translate(${Math.round(best[0])}px, ${Math.round(best[1])}px)`;
}
function selTbHtml(sel) {
  const one = sel.length === 1 ? sel[0] : null;
  if (one && S.isBlock(one)) {
    const isFlow = one.type === 'diagram' && DG.kindOf(one.code) === 'Flowchart';
    return `<button class="fw-btn fw-btn--sm cv-tb-edit" type="button" data-act="edit">${icon(one.type === 'diagram' ? 'code-xml' : 'list-indent')}${one.type === 'diagram' ? 'Edit code' : 'Edit outline'}<kbd class="fw-kbd fw-kbd-hint">${icon('corner-down-left', { size: 12 })}</kbd></button>
      ${isFlow ? `<button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-act="convert" data-tip="Turn into editable shapes">${icon('shapes')}Convert to shapes</button>` : ''}
      <span class="cv-tb-sep"></span>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="copypng" aria-label="Copy block as PNG" data-tip="Copy as PNG" data-tip-kbd="shift+mod+c">${icon('copy')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="dup" aria-label="Duplicate" data-tip="Duplicate" data-tip-kbd="mod+d">${icon('layers')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="del" aria-label="Delete" data-tip="Delete" data-tip-kbd="⌫">${icon('trash-2')}</button>`;
  }
  const types = new Set(sel.map((e) => e.type));
  const closed = [...types].some((t) => ['rect', 'ellipse', 'diamond'].includes(t));
  const stroked = [...types].some((t) => ['rect', 'ellipse', 'diamond', 'arrow', 'line', 'pen'].includes(t));
  const col = sel[0].color, fill = sel.find((e) => ['rect', 'ellipse', 'diamond'].includes(e.type))?.fill, sw = sel[0].sw, sloppy = sel[0].sloppy;
  let s = '';
  if (types.size === 1 && types.has('sticky')) s += S.STICKY.map((t) => `<button class="cv-sw cv-sw--sticky" type="button" data-tone="${t}" style="--sw:var(--s-${t})" aria-label="${t} note" aria-pressed="${sel[0].tone === t}"></button>`).join('');
  else s += S.COLORS.map((c) => `<button class="cv-sw" type="button" data-color="${c}" style="--sw:var(--k-${c})" aria-label="${c === 'ink' ? 'Ink' : c[0].toUpperCase() + c.slice(1)}" data-tip="${c === 'ink' ? 'Ink' : c[0].toUpperCase() + c.slice(1)}" aria-pressed="${col === c}"></button>`).join('');
  if (closed) s += `<span class="cv-tb-sep"></span>` + [['none', 'No fill', 'square'], ['hatch', 'Hatched', 'paint-bucket'], ['tint', 'Tinted', 'droplet']].map(([v, l, ic]) => `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-fill="${v}" aria-label="${l}" data-tip="${l}" aria-pressed="${fill === v}">${icon(ic)}</button>`).join('');
  if (stroked) s += `<span class="cv-tb-sep"></span>` + [[1, 'Thin'], [2, 'Regular'], [3, 'Bold']].map(([v, l]) => `<button class="fw-iconbtn fw-iconbtn--sm cv-swbtn" type="button" data-sw="${v}" aria-label="${l} stroke" data-tip="${l}" aria-pressed="${sw === v}"><span style="height:${v === 1 ? 1.5 : v === 2 ? 2.5 : 4}px"></span></button>`).join('')
    + `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-sloppy aria-label="${sloppy ? 'Hand-drawn (switch to clean)' : 'Clean (switch to hand-drawn)'}" data-tip="${sloppy ? 'Hand-drawn' : 'Clean lines'}" aria-pressed="${!!sloppy}">${icon('spline')}</button>`;
  if (types.has('text') && types.size === 1) s += `<span class="cv-tb-sep"></span>` + ['s', 'm', 'l'].map((v) => `<button class="fw-iconbtn fw-iconbtn--sm cv-fontbtn" type="button" data-font="${v}" aria-label="${{ s: 'Small', m: 'Medium', l: 'Large' }[v]} text" aria-pressed="${sel[0].font === v}">${v.toUpperCase()}</button>`).join('');
  s += `<span class="cv-tb-sep"></span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="dup" aria-label="Duplicate" data-tip="Duplicate" data-tip-kbd="mod+d">${icon('layers')}</button><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="del" aria-label="Delete" data-tip="Delete" data-tip-kbd="⌫">${icon('trash-2')}</button>`;
  return s;
}
function bindSelTb(tb, sel) {
  const set = (fn) => change(() => { for (const el of selected()) fn(el); B.nodes.forEach((n) => (n.key = null)); });
  $$('[data-color]', tb).forEach((b) => (b.onclick = () => { style.color = b.dataset.color; set((el) => { el.color = b.dataset.color; if (['rect', 'ellipse', 'diamond'].includes(el.type) && el.fill === 'none' && el.color !== 'ink') el.fill = 'tint'; }); }));
  $$('[data-tone]', tb).forEach((b) => (b.onclick = () => { style.tone = b.dataset.tone; set((el) => { el.tone = b.dataset.tone; }); }));
  $$('[data-fill]', tb).forEach((b) => (b.onclick = () => { style.fill = b.dataset.fill; set((el) => { if (['rect', 'ellipse', 'diamond'].includes(el.type)) el.fill = b.dataset.fill; }); }));
  $$('[data-sw]', tb).forEach((b) => (b.onclick = () => { style.sw = +b.dataset.sw; set((el) => { el.sw = +b.dataset.sw; }); }));
  $$('[data-font]', tb).forEach((b) => (b.onclick = () => { style.font = b.dataset.font; set((el) => { el.font = b.dataset.font; const L = S.textLayout(el); el.w = L.w; el.h = L.h; }); }));
  $('[data-sloppy]', tb)?.addEventListener('click', () => { const v = selected()[0].sloppy ? 0 : 1; style.sloppy = v; set((el) => { el.sloppy = v; }); });
  $$('[data-act]', tb).forEach((b) => (b.onclick = () => runAct(b.dataset.act, b)));
}
function runAct(act, btn) {
  if (act === 'del') return deleteSel();
  if (act === 'dup') return duplicateSel();
  if (act === 'edit') return openFocus(selected()[0]);
  if (act === 'convert') return convertToShapes(selected()[0]);
  if (act === 'copypng') return quickCopy(selected(), btn);
}
function deleteSel() { if (!B.sel.size) return; const n = B.sel.size; change(() => { B.els = B.els.filter((e) => !B.sel.has(e.id)); B.sel.clear(); }); announce(`Deleted ${plural(n, 'object')}`); }
function duplicateSel() {
  const map = new Map(); const copies = selected().map((e) => { const c = JSON.parse(JSON.stringify(e)); c.id = S.uid(); c.seed = S.newSeed(); map.set(e.id, c.id); S.moveBy(c, 28, 28); return c; });
  for (const c of copies) if (S.isLinear(c)) { c.start = map.get(c.start) || null; c.end = map.get(c.end) || null; }
  change(() => { B.els.push(...copies); B.sel = new Set(copies.map((c) => c.id)); });
}

// ───────────────────────── keyboard (global while a board is open; no canvas click needed) ─────────────────────────
window.addEventListener('keydown', (e) => {
  if (!B.board || $('#boardview').hidden) { shelfKeys(e); return; }
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (B.focus) return focusKeys(e);
  if (e.key === 'Escape') {
    if (popOpen()) { closePops(); e.preventDefault(); return; }
    if (B.preview) { endPreview(); e.preventDefault(); return; }
    if (B.histOpen && !hasLayers()) { toggleHistory(false); e.preventDefault(); return; }
  }
  if (isTyping() || hasLayers() || document.querySelector('dialog[open]')) return;
  if (mod && e.shiftKey && k === 'e') { e.preventDefault(); return openExport(); }
  if (mod && e.shiftKey && k === 'c') { e.preventDefault(); return quickCopy(B.sel.size ? selected() : B.els); }
  if (mod && e.shiftKey && k === 'h') { e.preventDefault(); return toggleHistory(); }
  if (mod && k === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && k === 'y') { e.preventDefault(); return redo(); }
  if (mod && k === 'd') { e.preventDefault(); return duplicateSel(); }
  if (mod && k === 'a') { e.preventDefault(); B.sel = new Set(B.els.map((x) => x.id)); return draw(); }
  if (mod && k === 's') { e.preventDefault(); addSnap('Checkpoint', B.els, { named: true }); writeBoard(B.board); return toast('Saved automatically · checkpoint added to History', { type: 'success', action: { label: 'Open History', onClick: () => toggleHistory(true) } }); }
  if (mod && k === 'o') { e.preventDefault(); return pickFiles(); }
  if (mod || e.altKey) return;
  if (B.preview) return;
  const one = B.sel.size === 1 ? selected()[0] : null;
  if (B.fresh && one && one.id === B.fresh && e.key.length === 1 && /\S/.test(e.key)) { e.preventDefault(); editText(one, { initial: e.key, before: snapshot() }); return; }
  if (e.key === ' ') { if (!B.space) { B.space = true; $('#stage').classList.add('is-hand'); } e.preventDefault(); return; }
  if (e.key === 'Escape') { if (B.fresh) B.fresh = null; else if (B.sel.size) B.sel.clear(); else setTool('select'); e.preventDefault(); return draw(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSel(); }
  if (e.key === 'Enter' && one) { e.preventDefault(); if (S.isBlock(one)) return openFocus(one); if (['rect', 'ellipse', 'diamond', 'text', 'sticky'].includes(one.type)) return editText(one, {}); return; }
  if (e.key.startsWith('Arrow') && B.sel.size) { e.preventDefault(); const st = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0; return change(() => selected().forEach((el) => S.moveBy(el, dx, dy))); }
  if (e.key === '/') { e.preventDefault(); return openInsert($('#cv-insert').offsetParent ? $('#cv-insert') : $('#m-insert')); }
  if (k === 'e') { e.preventDefault(); return openExport(); }
  if (k === 'f') { e.preventDefault(); return fitView(true, B.sel.size ? selected() : undefined); }
  if (e.key === '1') { e.preventDefault(); const r = stageRect(); return zoomAt(r.width / 2, r.height / 2, 1); }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); return zoomBy(1.25); }
  if (e.key === '-') { e.preventDefault(); return zoomBy(0.8); }
  if (KEYMAP[k] && !e.shiftKey) { e.preventDefault(); setTool(KEYMAP[k]); flashTool(KEYMAP[k]); }
}, true);
window.addEventListener('keyup', (e) => { if (e.key === ' ' && B.space) { B.space = false; $('#stage')?.classList.remove('is-hand'); } });
function flashTool(t) { const b = $(`.cv-dock [data-tool="${t}"]`); if (!b) return; b.classList.remove('is-flash'); void b.offsetWidth; b.classList.add('is-flash'); }
function shelfKeys(e) {
  if ($('#shelf').hidden || isTyping() || hasLayers() || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); createFrom('blank'); }
}
const popOpen = () => !!(B.pop && B.pop.el.isConnected && !B.pop.el.classList.contains('is-closing'));
function closePops() { if (B.pop) { const p = B.pop; B.pop = null; p.close(false); } }

// ───────────────────────── insert menu ("/") ─────────────────────────
const INSERTS = [
  { id: 'flowchart', label: 'Flowchart', sub: 'Mermaid · steps and decisions', icon: 'workflow', kw: 'diagram mermaid flow chart process' },
  { id: 'sequence', label: 'Sequence diagram', sub: 'Mermaid · who talks to whom', icon: 'arrow-left-right', kw: 'diagram mermaid sequence uml api login' },
  { id: 'mindmap', label: 'Mind map', sub: 'Branch out by keyboard', icon: 'network', kw: 'mind map brainstorm outline tree ideas' },
  { id: 'class', label: 'Class diagram', sub: 'Mermaid', icon: 'boxes', kw: 'diagram mermaid class uml' },
  { id: 'state', label: 'State diagram', sub: 'Mermaid', icon: 'git-commit', kw: 'diagram mermaid state machine' },
  { id: 'er', label: 'ER diagram', sub: 'Mermaid · tables and relations', icon: 'database', kw: 'diagram mermaid entity relationship database er' },
  { id: 'gantt', label: 'Gantt chart', sub: 'Mermaid · tasks over time', icon: 'calendar-clock', kw: 'diagram mermaid gantt schedule plan' },
  { id: 'pie', label: 'Pie chart', sub: 'Mermaid', icon: 'contrast', kw: 'diagram mermaid pie chart' },
  { id: 'timeline', label: 'Timeline', sub: 'Mermaid', icon: 'activity', kw: 'diagram mermaid timeline history' },
  { id: 'quadrant', label: 'Quadrant chart', sub: 'Mermaid', icon: 'layout-grid', kw: 'diagram mermaid quadrant matrix priority' },
  { id: 'sticky', label: 'Sticky note', sub: 'S', icon: 'sticky-note', kw: 'note sticky post-it' },
  { id: 'text', label: 'Text', sub: 'T', icon: 'type', kw: 'text label heading' },
  { id: 'image', label: 'Image…', sub: 'From this device', icon: 'image', kw: 'image photo picture upload' },
];
function openInsert(anchor) {
  if (popOpen()) { closePops(); return; }
  const el = h(`<div class="cv-insert"><div class="cv-insert__search">${icon('search')}<input class="cv-insert__input" type="text" placeholder="Insert…" aria-label="Insert" autocomplete="off" spellcheck="false"></div><div class="cv-insert__list" role="listbox" aria-label="Blocks"></div><div class="cv-insert__foot">${kbd('up')}${kbd('down')} choose · ${kbd('enter')} insert</div></div>`);
  const list = el.querySelector('.cv-insert__list'), inp = el.querySelector('input'); let items = INSERTS, act = 0;
  const paint = () => { list.innerHTML = items.length ? items.map((it, i) => `<button class="cv-insert__item ${i === act ? 'is-active' : ''}" type="button" role="option" aria-selected="${i === act}" data-i="${i}"><span class="cv-insert__icon">${icon(it.icon, { size: 18 })}</span><span class="cv-insert__txt"><span class="cv-insert__label">${esc(it.label)}</span><span class="cv-insert__sub">${esc(it.sub)}</span></span></button>`).join('') : `<div class="cv-insert__none">Nothing matches. Try “diagram” or “map”.</div>`; $$('[data-i]', list).forEach((b) => (b.onclick = () => pick(items[+b.dataset.i]))); };
  const pick = (it) => { closePops(); insertBlock(it.id); };
  inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); items = INSERTS.filter((it) => !q || (it.label + ' ' + it.kw).toLowerCase().includes(q)); act = 0; paint(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[act]) pick(items[act]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePops(); $('#stage').focus({ preventScroll: true }); }
  });
  paint();
  const p = openPopover(anchor, el, { placement: isMobile() ? 'bottom-center' : 'bottom-center', width: 340, className: 'cv-insert-pop', label: 'Insert', onClose: () => { if (B.pop === p) B.pop = null; } });
  B.pop = p; setTimeout(() => inp.focus(), 0);
  if (isMobile()) { const r = anchor.getBoundingClientRect(); p.el.style.top = Math.max(60, r.top - p.el.offsetHeight - 8) + 'px'; }
}
function placeNew(w, hh) {
  const r = stageRect(), b = S.unionBounds(B.els), v = B.view;
  if (!b) { const cx = (r.width / 2 - v.x) / v.z, cy = (r.height / 2 - v.y) / v.z; return [cx - w / 2, cy - hh / 2]; }
  if (b.w > b.h * 1.5) return [b.x, b.y + b.h + 90];
  return [b.x + b.w + 100, b.y + 26];
}
function insertBlock(id, extra = {}) {
  if (id === 'sticky' || id === 'text') { setTool(id); toast(`Click where the ${id === 'sticky' ? 'note' : 'text'} should go`, { type: 'info', duration: 1800 }); return; }
  if (id === 'image') return pickFiles('image/*');
  const before = snapshot(); let el;
  if (id === 'mindmap') { const [x, y] = placeNew(560, 340); el = S.make('mindmap', { x, y, w: 560, h: 340, md: extra.md || MM_NEW, title: extra.title || 'Mind map' }); }
  else { const [code0, name, sz] = DIAGRAMS[id] || DIAGRAMS.flowchart; const code = extra.code || code0; const [x, y] = placeNew(...sz); el = S.make('diagram', { x, y, w: sz[0], h: sz[1], code, title: extra.title || name }); }
  B.els.push(el); B.sel = new Set([el.id]); commit(before);
  animateView(fitTarget([el], { maxZ: B.view.z }), 380);
  draw();
  if (!extra.noFocus) setTimeout(() => openFocus(el, { fresh: true }), 200);
  else fitAll([el]).then((ch) => { if (ch) { draw(); save(); } });
  return el;
}

// ───────────────────────── focus mode (diagram + mind map) ─────────────────────────
function openFocus(el, { fresh = false } = {}) {
  if (!el || !S.isBlock(el)) return;
  if (B.editing) commitText();
  closePops();
  const f = $('#focus'); const before = snapshot();
  B.focus = { id: el.id, type: el.type, before };
  B.sel = new Set([el.id]);
  f.hidden = false; f.className = `cv-focus cv-focus--${el.type}`;
  f.dataset.pane = 'code';
  const isD = el.type === 'diagram';
  f.innerHTML = `<div class="cv-focus__panel" role="dialog" aria-modal="true" aria-label="${isD ? 'Edit diagram' : 'Edit mind map'}">
    <header class="cv-focus__head">
      <button class="fw-btn fw-btn--ghost fw-btn--sm cv-focus__back" type="button" id="fx-back">${icon('chevron-left')}<span class="fw-hide-mobile">Board</span></button>
      <span class="cv-focus__icon">${icon(isD ? 'workflow' : 'network')}</span>
      <input class="cv-focus__title" id="fx-title" value="${esc(el.title)}" aria-label="Block name" spellcheck="false">
      <span class="fw-badge cv-focus__kind" id="fx-kind">${isD ? esc(DG.kindOf(el.code)) : 'Mind map'}</span>
      <span class="fw-spacer"></span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="fx-export" data-tip="Export this ${isD ? 'diagram' : 'mind map'}" data-tip-kbd="shift+mod+e">${icon('download')}<span class="fw-hide-mobile">Export</span></button>
      <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="fx-done">Done<kbd class="fw-kbd fw-kbd-hint cv-kbd-on-primary">${isMac() ? '⌘' : 'Ctrl'}${icon('corner-down-left', { size: 12 })}</kbd></button>
    </header>
    <div class="cv-focus__seg fw-show-mobile"><div class="fw-seg" role="radiogroup" aria-label="View"><button class="fw-seg__opt" type="button" role="radio" aria-checked="true" data-pane="code">${isD ? 'Code' : 'Outline'}</button><button class="fw-seg__opt" type="button" role="radio" aria-checked="false" data-pane="preview">${isD ? 'Preview' : 'Map'}</button></div></div>
    <div class="cv-focus__body">
      <div class="cv-focus__left">
        <div class="cv-focus__editor" id="fx-editor"></div>
        <div class="cv-focus__alert" id="fx-alert" hidden></div>
        <div class="cv-focus__tools" id="fx-tools"></div>
      </div>
      <div class="cv-focus__resizer fw-hide-mobile" id="fx-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize panes"></div>
      <div class="cv-focus__right">
        <div class="cv-prev" id="fx-prev"><div class="cv-prev__badge" id="fx-stale" hidden>${icon('history', { size: 14 })}Out of date · showing the last version that worked</div><div class="cv-prev__view" id="fx-view"></div>
          <div class="fw-zoom cv-prev__zoom"><button class="fw-iconbtn" type="button" aria-label="Zoom out" data-pz="out">${icon('minus')}</button><button class="fw-zoom__pct" type="button" id="fx-pct" aria-label="Fit preview">Fit</button><button class="fw-iconbtn" type="button" aria-label="Zoom in" data-pz="in">${icon('plus')}</button></div></div>
      </div>
    </div></div>`;
  enhance(f);
  $('#fx-back').onclick = () => closeFocus(true); $('#fx-done').onclick = () => closeFocus(true);
  $('#fx-export').onclick = () => { closeFocus(true); B.sel = new Set([el.id]); draw(); openExport(); };
  // resizable split (today's pane resizer), remembered
  const body = f.querySelector('.cv-focus__body'), rz = $('#fx-resizer');
  const setLeft = (px) => { const w = body.getBoundingClientRect().width; const v = clamp(px, 300, w - 320); body.style.setProperty('--fx-left', v + 'px'); return v; };
  if (store.get('canvas:fx-left')) setLeft(store.get('canvas:fx-left'));
  rz.addEventListener('pointerdown', (e) => { rz.setPointerCapture(e.pointerId); const x0 = body.getBoundingClientRect().left; const mv = (ev) => setLeft(ev.clientX - x0); const up = (ev) => { store.set('canvas:fx-left', setLeft(ev.clientX - x0)); rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); B.focus?.fitPreview?.(); }; rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); });
  rz.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); const cur = f.querySelector('.cv-focus__left').getBoundingClientRect().width; store.set('canvas:fx-left', setLeft(cur + (e.key === 'ArrowLeft' ? -24 : 24))); });
  const ft = $('#fx-title'); fitFT();
  ft.addEventListener('input', (e) => { el.title = e.target.value; el.titled = true; fitFT(); draw(); });
  $('#fx-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); B.focus.focusMain?.(); } });
  $$('.cv-focus__seg [data-pane]', f).forEach((b) => (b.onclick = () => { f.dataset.pane = b.dataset.pane; $$('.cv-focus__seg [data-pane]', f).forEach((x) => x.setAttribute('aria-checked', x === b)); if (b.dataset.pane === 'preview') B.focus.fitPreview?.(); }));
  if (isD) mountDiagramFocus(el, f, fresh); else mountMindFocus(el, f, fresh);
  f.querySelector('.cv-focus__panel').animate([{ opacity: 0, transform: 'scale(.985) translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  draw();
}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
function fitFT() { const ft = $('#fx-title'); if (ft && !isMobile()) ft.style.width = Math.min(360, S.measure(ft.value || ' ', 16, 600) + 22) + 'px'; }
function focusKeys(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); $('#fx-export')?.click(); return; }
  if ((e.key === 'Enter' && mod) || (e.key === 'Escape' && !hasLayers() && !$('#fx-editor .ce__ta:focus'))) { e.preventDefault(); closeFocus(true); return; }
  if (e.key === 'Escape' && $('#fx-editor .ce__ta:focus') && B.focus.escOnce) { e.preventDefault(); closeFocus(true); return; }
  if (e.key === 'Escape') B.focus.escOnce = true; else B.focus.escOnce = false;
}
function closeFocus(commitIt = true) {
  const fx = B.focus; if (!fx) return; B.focus = null;
  const f = $('#focus'); if (f) { f.hidden = true; f.innerHTML = ''; }
  const el = byId(fx.id);
  if (el && el.type === 'diagram' && liveGood.has(el.id)) { if (liveGood.get(el.id) === el.code) delete el.lastGood; else el.lastGood = liveGood.get(el.id); liveGood.delete(el.id); }
  if (commitIt) commit(fx.before);
  B.nodes.forEach((n) => (n.key = null));
  draw(); $('#stage')?.focus({ preventScroll: true });
  if (commitIt && B.board) setTimeout(() => animateView(fitTarget(B.els, { maxZ: 1 }), 520), 60);
}
function mountDiagramFocus(el, f, fresh) {
  const ed = new DG.CodeEditor($('#fx-editor'), { value: el.code, label: 'Mermaid code' });
  const view = $('#fx-view'), stale = $('#fx-stale'), alert = $('#fx-alert');
  let pz = { k: 1, x: 0, y: 0, fit: true }, t = 0, errT = 0, lastSvg = '';
  const applyPz = () => { const s = view.firstElementChild; if (s) s.style.transform = `translate(${pz.x}px, ${pz.y}px) scale(${pz.k})`; $('#fx-pct').textContent = pz.fit ? 'Fit' : `${Math.round(pz.k * 100)} %`; };
  const fitPreview = () => { const s = view.querySelector('svg'); if (!s) return; const vb = s.viewBox.baseVal, r = view.getBoundingClientRect(); if (!r.width || !vb?.width) return; const k = Math.min(1.6, (r.width - 48) / vb.width, (r.height - 48) / vb.height); pz = { k, x: (r.width - vb.width * k) / 2, y: (r.height - vb.height * k) / 2, fit: true }; s.style.width = vb.width + 'px'; s.style.height = vb.height + 'px'; applyPz(); };
  B.focus.fitPreview = () => setTimeout(fitPreview, 30);
  const show = (svg) => { if (svg !== lastSvg) { view.innerHTML = svg; lastSvg = svg; } stale.hidden = true; view.classList.remove('is-stale'); if (pz.fit) fitPreview(); else { const s = view.querySelector('svg'); const vb = s.viewBox.baseVal; s.style.width = vb.width + 'px'; s.style.height = vb.height + 'px'; applyPz(); } };
  const setErr = (hm) => {
    if (!hm) { ed.setError(null); alert.hidden = true; return; }
    const short = hm.fix && /colon/.test(hm.text) ? `missing “:” after ${esc((ed.value.split('\n')[hm.line - 1].match(/(-{1,2}>>|-{1,2}>|-{1,2}x)\s*([\w.-]+)/) || [])[2] || 'the name')}` : hm.fix ? `missing ${esc(hm.fix.label.replace(/^Add /, '“') + '”')}` : 'can’t read this line';
    ed.setError({ line: hm.line, short });
    alert.hidden = false;
    alert.innerHTML = `<div class="fw-alert fw-alert--danger"><span class="fw-alert__icon">${icon('circle-alert', { size: 16 })}</span><div class="fw-alert__body"><div><b>Line ${hm.line}</b> · ${hm.text}</div>
      <div class="fw-alert__actions">${hm.fix ? `<button class="fw-btn fw-btn--sm cv-fixbtn" type="button" id="fx-fix">${icon('wand-sparkles')}${hm.fix.code ? `Use <code>${esc(hm.fix.code)}</code>` : esc(hm.fix.label)}</button>` : ''}<button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="fx-jump">Go to line ${hm.line}</button></div>
      <details><summary>Details</summary><pre class="cv-raw">${esc(hm.raw)}</pre></details></div></div>`;
    $('#fx-fix')?.addEventListener('click', () => { ed.replaceLine(hm.fix.line, hm.fix.value); });
    $('#fx-jump').onclick = () => { const lines = ed.value.split('\n'); let s = 0; for (let i = 0; i < hm.line - 1; i++) s += lines[i].length + 1; ed.ta.focus(); ed.ta.setSelectionRange(s + lines[hm.line - 1].length, s + lines[hm.line - 1].length); };
  };
  const run = async (code, immediate) => {
    const th = theme();
    try {
      const r = await DG.render(code, th);
      if (ed.value !== code) return;
      svgCache.set(ckey(code, th), r.svg); persistCache();
      liveGood.set(el.id, code); clearTimeout(errT); setErr(null); show(r.svg);
      $('#fx-kind').textContent = DG.kindOf(code); if (fitBlock(el, r.svg)) S.updateBindings(B.els); B.nodes.get(el.id) && (B.nodes.get(el.id).key = null); draw();
    } catch (err) {
      if (ed.value !== code || !err.human) return;
      clearTimeout(errT);
      errT = setTimeout(() => { if (ed.value !== code) return; setErr(err.human); stale.hidden = !lastSvg; view.classList.toggle('is-stale', !!lastSvg); }, immediate ? 0 : 650);
    }
  };
  ed.onChange = (v) => { el.code = v; clearTimeout(t); t = setTimeout(() => run(v), 180); };
  B.focus.rerender = () => run(ed.value, true);
  const cached = svgCache.get(ckey(el.code, theme())); if (cached) { liveGood.set(el.id, el.code); setTimeout(() => show(cached), 0); }
  run(el.code, true);
  const kind = DG.kindOf(el.code);
  const SN = kind === 'Sequence' ? [['Message', '\n  A->>S: Message'], ['Reply', '\n  S-->>A: Reply'], ['Note', '\n  Note over A,S: Note'], ['Alt block', '\n  alt Success\n    S-->>A: OK\n  else Failure\n    S-->>A: Error\n  end']]
    : kind === 'Flowchart' ? [['Step', '\n  X[New step]'], ['Decision', '\n  Y{Question?}'], ['Link', '\n  A --> X'], ['Labelled link', '\n  Y -->|Yes| X']] : kind === 'Gantt' ? [['Task', '\n  Task :t9, after a1, 3d'], ['Section', '\n  section Next']] : [];
  $('#fx-tools').innerHTML = `${SN.length ? '<span class="cv-focus__tlabel">Insert</span>' : ''}${SN.map(([l], i) => `<button class="fw-chip fw-chip--sample" type="button" data-sn="${i}">${icon('plus', { size: 14 })}${l}</button>`).join('')}<span class="fw-spacer"></span><span class="cv-focus__hint cv-pointer">${kbd('tab')} indents · ${kbd('esc')} ${kbd('esc')} closes</span>`;
  $$('[data-sn]', f).forEach((b) => (b.onclick = () => { const ta = ed.ta; ta.focus(); const v = ta.value; if (ta.selectionStart === 0 && ta.selectionEnd === 0) ta.setSelectionRange(v.length, v.length); else { const e2 = v.indexOf('\n', ta.selectionEnd); const end = e2 < 0 ? v.length : e2; ta.setSelectionRange(end, end); } ed.insert(SN[+b.dataset.sn][1]); }));
  $$('[data-pz]', f).forEach((b) => (b.onclick = () => { const r = view.getBoundingClientRect(), m = b.dataset.pz === 'in' ? 1.25 : 0.8, cx = r.width / 2, cy = r.height / 2, k = clamp(pz.k * m, 0.2, 4); pz = { k, x: cx - ((cx - pz.x) * k) / pz.k, y: cy - ((cy - pz.y) * k) / pz.k, fit: false }; applyPz(); }));
  $('#fx-pct').onclick = () => fitPreview();
  let ps = null;
  view.addEventListener('pointerdown', (e) => { ps = { x: e.clientX, y: e.clientY, p: { ...pz } }; view.setPointerCapture(e.pointerId); view.classList.add('is-panning'); });
  view.addEventListener('pointermove', (e) => { if (!ps) return; pz = { ...ps.p, x: ps.p.x + e.clientX - ps.x, y: ps.p.y + e.clientY - ps.y, fit: false }; applyPz(); });
  view.addEventListener('pointerup', () => { ps = null; view.classList.remove('is-panning'); });
  view.addEventListener('wheel', (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) { const cx = e.clientX - r.left, cy = e.clientY - r.top, k = clamp(pz.k * Math.exp(-e.deltaY * 0.01), 0.2, 4); pz = { k, x: cx - ((cx - pz.x) * k) / pz.k, y: cy - ((cy - pz.y) * k) / pz.k, fit: false }; } else pz = { ...pz, x: pz.x - e.deltaX, y: pz.y - e.deltaY, fit: false }; applyPz(); }, { passive: false });
  B.focus.focusMain = () => ed.focus(true);
  setTimeout(() => ed.focus(true), 60);
  B.focus.editor = ed;
}
function mountMindFocus(el, f, fresh) {
  const root = MM.fromMarkdown(el.md || MM_NEW);
  const host = $('#fx-editor'); host.classList.add('cv-ol-host');
  const view = $('#fx-view'); view.innerHTML = '<svg class="mm-svg" xmlns="http://www.w3.org/2000/svg"></svg>';
  $('#fx-stale').remove();
  const mv = new MM.MapView(view.firstElementChild);
  mv.onView = (v) => { $('#fx-pct').textContent = mv.auto ? 'Fit' : `${Math.round(v.k * 100)} %`; };
  const shown = () => (el.collapsed ? collapseTree(root) : root);
  const sync = () => { el.md = MM.toMarkdown(root); if (!el.titled) { el.title = root.text || 'Mind map'; const ti = $('#fx-title'); if (ti && document.activeElement !== ti) { ti.value = el.title; fitFT(); } } if (fitBlock(el, mindSvg(el.md, el.collapsed))) S.updateBindings(B.els); mv.update(shown()); B.nodes.get(el.id) && (B.nodes.get(el.id).key = null); draw(); };
  // today's "Collapse all / Expand all": main branches only, on the map, the board and in exports
  const zoom = f.querySelector('.cv-prev__zoom');
  zoom.insertAdjacentHTML('afterbegin', `<button class="fw-iconbtn" type="button" id="fx-collapse" aria-pressed="${!!el.collapsed}">${icon(el.collapsed ? 'chevrons-up-down' : 'chevrons-down-up')}</button><span class="fw-divider-v"></span>`);
  const cb = $('#fx-collapse');
  const syncCb = () => { cb.setAttribute('aria-label', el.collapsed ? 'Expand all' : 'Collapse all'); cb.dataset.tip = el.collapsed ? 'Expand all' : 'Collapse all'; cb.innerHTML = icon(el.collapsed ? 'chevrons-up-down' : 'chevrons-down-up'); cb.setAttribute('aria-pressed', String(!!el.collapsed)); };
  syncCb();
  cb.onclick = () => { el.collapsed = !el.collapsed; if (!el.collapsed) delete el.collapsed; syncCb(); mv.auto = true; sync(); };
  const ol = new MM.Outliner(host, root, { onChange: () => sync(), onFocus: (id) => mv.setFocus(id) });
  mv.onNodeClick = (id) => { f.dataset.pane = 'code'; ol.focus(id); };
  $('#fx-tools').innerHTML = `<span class="cv-focus__hint">${kbd('enter')} new idea · ${kbd('tab')} branch · ${kbd('shift+tab')} out · ${kbd('alt+up')}${kbd('alt+down')} move</span>`;
  $('#fx-alert').hidden = true;
  B.focus.fitPreview = () => setTimeout(() => { mv.auto = true; mv.fit(false); }, 30);
  $$('[data-pz]', f).forEach((b) => (b.onclick = () => mv.zoomBy(b.dataset.pz === 'in' ? 1.25 : 0.8)));
  $('#fx-pct').onclick = () => { mv.auto = true; mv.fit(true); };
  setTimeout(() => { mv.update(shown()); mv.fit(false); sync(); }, 30);
  B.focus.focusMain = () => ol.focus(root.id);
  setTimeout(() => { const inp = host.querySelector('.ol-input'); inp?.focus(); if (fresh || root.text === 'Central idea') inp?.select(); }, 80);
  B.focus.outliner = ol;
}

// ───────────────────────── convert a flowchart block into shapes ─────────────────────────
function convertToShapes(el) {
  const svgStr = svgCache.get(ckey(el.code, theme())); if (!svgStr) return toast('Still rendering… try again in a second', { type: 'info' });
  const tmp = h(`<div style="position:absolute;left:-9999px;top:0;visibility:hidden">${svgStr}</div>`); document.body.append(tmp);
  const svg = tmp.querySelector('svg'), vb = svg.viewBox.baseVal;
  const k = Math.min((el.w - 28) / vb.width, (el.h - 28) / vb.height), ox = el.x + 14 + ((el.w - 28) - vb.width * k) / 2 - vb.x * k, oy = el.y + 14 + ((el.h - 28) - vb.height * k) / 2 - vb.y * k;
  const out = [], map = new Map();
  const ctm = (node) => { const m = node.getCTM(), s = svg.getCTM(); return s.inverse().multiply(m); };
  for (const g of svg.querySelectorAll('g.node')) {
    const shape = g.querySelector('rect, polygon, path, circle'); if (!shape) continue;
    const bb = shape.getBBox(), m = ctm(shape); const p1 = new DOMPoint(bb.x, bb.y).matrixTransform(m), p2 = new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m);
    const type = shape.tagName === 'polygon' ? 'diamond' : shape.tagName === 'path' ? 'ellipse' : 'rect';
    const id = (g.id.match(/flowchart-(.+?)-\d+$/) || [])[1];
    const s = S.make(type, { x: ox + p1.x * k, y: oy + p1.y * k, w: (p2.x - p1.x) * k, h: (p2.y - p1.y) * k, label: g.textContent.trim(), color: type === 'diamond' ? 'orange' : type === 'ellipse' ? 'green' : 'blue', fill: 'tint', sloppy: 1 });
    out.push(s); if (id) map.set(id, s);
  }
  for (const p of svg.querySelectorAll('path.flowchart-link, .edgePaths path')) {
    const m = (p.id || '').match(/L_(.+?)_(.+?)_\d+$/); if (!m) continue;
    const a = map.get(m[1]), b = map.get(m[2]); if (!a || !b) continue;
    out.push(S.make('arrow', { pts: [S.center(a), S.center(b)], start: a.id, end: b.id }));
  }
  tmp.remove();
  if (!out.length) return toast('This diagram type can’t be converted yet', { type: 'warning' });
  change(() => { const i = B.els.indexOf(el); B.els.splice(i, 1, ...out); B.sel = new Set(out.filter((x) => !S.isLinear(x)).map((x) => x.id)); });
  toast(`Converted to ${plural(out.length, 'shape')}`, { type: 'success', action: { label: 'Undo', onClick: undo } });
}

// ───────────────────────── board menu, clear, history ─────────────────────────
function docMenu(anchor) {
  const n = B.els.length;
  const p = openMenu(anchor, [
    { group: '', items: [
      { label: 'Rename', icon: 'pencil', onSelect: () => { const t = $('#cv-title'); t.focus(); t.select(); } },
      { label: 'Duplicate board', icon: 'copy', onSelect: () => { const c = newBoard(`${B.board.name} copy`, JSON.parse(JSON.stringify(B.els))); toast(`Duplicated as “${c.name}”`, { action: { label: 'Open', onClick: () => openBoard(c.id, { push: true }) } }); } },
      { label: 'History', icon: 'history', kbd: 'shift+mod+h', onSelect: () => toggleHistory(true) },
      { label: 'Export…', icon: 'download', kbd: 'shift+mod+e', onSelect: () => openExport() },
      { label: 'Open file as new board…', icon: 'file-input', kbd: 'mod+o', onSelect: () => pickFiles() },
    ] },
    { group: '', items: [
      { label: 'Clear board', icon: 'eraser', sub: n ? `Removes ${plural(n, 'object')} · you can undo` : 'The board is already empty', danger: true, onSelect: clearBoard },
      { label: 'Move to trash', icon: 'trash-2', danger: true, onSelect: () => trashBoard(B.board.id) },
    ] },
  ], { placement: 'bottom-start' });
  B.pop = p;
}
function clearBoard() {
  if (!B.els.length) return toast('The board is already empty', { type: 'info' });
  const n = B.els.length; addSnap('Before Clear board', B.els, { auto: true });
  change(() => { B.els = []; B.sel.clear(); });
  toast(`Board cleared · ${plural(n, 'object')} removed`, { type: 'neutral', duration: 8000, action: { label: 'Undo', onClick: () => { undo(); announce('Board restored'); } } });
}
function toggleHistory(force) {
  B.histOpen = force ?? !B.histOpen;
  $('#bgrid')?.classList.toggle('has-history', B.histOpen);
  $('#cv-hist')?.setAttribute('aria-pressed', B.histOpen);
  if (B.histOpen) renderHistory(); else endPreview();
  setTimeout(() => draw(), 260);
}
function renderHistory() {
  const el = $('#history'); if (!el || !B.board) return;
  const snaps = B.board.snaps || [];
  el.innerHTML = `<div class="cv-hist__head"><h2 class="cv-hist__title">History</h2><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="hist-x" aria-label="Close history" data-tip="Close" data-tip-kbd="esc">${icon('x')}</button></div>
    <div class="cv-hist__list" role="list">
      <button class="cv-hist__item" type="button" role="listitem" data-snap="now" aria-current="${!B.preview}"><span class="cv-hist__thumb">${B.els.length ? `<img alt="" src="${thumbFor(B.els, { pad: 20 })}">` : '<span class="cv-hist__empty">Empty</span>'}</span><span class="cv-hist__meta"><span class="cv-hist__label">Now</span><span class="cv-hist__time">${plural(B.els.length, 'object')}</span></span></button>
      ${snaps.map((s) => `<button class="cv-hist__item" type="button" role="listitem" data-snap="${s.id}" aria-current="${B.preview?.id === s.id}"><span class="cv-hist__thumb">${s.els.length ? `<img alt="" src="${thumbFor(s.els, { pad: 20 })}">` : '<span class="cv-hist__empty">Empty</span>'}</span><span class="cv-hist__meta"><span class="cv-hist__label">${s.named ? icon('bookmark-plus', { size: 13 }) : ''}${esc(s.label)}</span><span class="cv-hist__time">${new Date(s.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${shortAgo(s.t)}</span></span></button>`).join('')}
    </div>
    <div class="cv-hist__foot"><button class="fw-btn fw-btn--sm fw-btn--block" type="button" id="hist-cp">${icon('bookmark-plus')}Save a checkpoint<kbd class="fw-kbd fw-kbd-hint">${isMac() ? '⌘' : 'Ctrl'}S</kbd></button></div>`;
  $('#hist-x').onclick = () => toggleHistory(false);
  $('#hist-cp').onclick = () => { addSnap('Checkpoint', B.els, { named: true }); writeBoard(B.board); renderHistory(); toast('Checkpoint saved'); };
  $$('[data-snap]', el).forEach((b) => (b.onclick = () => (b.dataset.snap === 'now' ? endPreview() : startPreview(snaps.find((s) => s.id === b.dataset.snap)))));
}
function startPreview(s) {
  B.preview = s; B.sel.clear();
  const bar = $('#previewbar'); bar.hidden = false;
  bar.innerHTML = `${icon('history', { size: 16 })}<span>Viewing <b>${esc(s.label)}</b> · ${shortAgo(s.t)}</span><button class="fw-btn fw-btn--sm fw-btn--primary" type="button" id="pv-restore">Restore this version</button><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="pv-back">Back to now</button>`;
  $('#pv-restore').onclick = () => { const snap = s; endPreview(); addSnap('Before restore', B.els, { auto: true }); change(() => { B.els = JSON.parse(JSON.stringify(snap.els)); }); toast(`Restored “${snap.label}”`, { type: 'success', action: { label: 'Undo', onClick: undo } }); renderHistory(); };
  $('#pv-back').onclick = () => endPreview();
  $('#boardview').classList.add('is-preview'); B.nodes.forEach((n) => (n.key = null)); renderHistory(); draw();
}
function endPreview() { if (!B.preview) return; B.preview = null; $('#previewbar').hidden = true; $('#boardview').classList.remove('is-preview'); B.nodes.forEach((n) => (n.key = null)); if (B.histOpen) renderHistory(); draw(); }

// ───────────────────────── export sheet ─────────────────────────
const exp = store.get('canvas:export', { fmt: 'png', scale: 2, bg: 'board', th: 'shown', scope: 'board' });
async function buildExport(els, o) {
  const th = o.th === 'shown' ? theme() : o.th;
  await ensureRendered(els, th);
  const fc = await embeddedFonts();
  return S.sceneSvg(els, { theme: th, background: o.bg, padding: 32, ctx: blockCtx(th), fontCss: fc });
}
async function quickCopy(els, btn) {
  if (!els?.length) return toast('Nothing to copy yet', { type: 'info' });
  const o = { ...exp, fmt: 'png' }; const r = await buildExport(els, o);
  const c = await toCanvas(r.svg, r.w, r.h, o.scale);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast(`Copied as PNG · ${c.width} × ${c.height}`, { type: 'success' }); }
  catch { toast('Your browser blocked copying images. Use Download instead.', { type: 'warning' }); }
}
function openExport({ board } = {}) {
  closePops();
  const bd = board || B.board; if (!bd) return;
  const all = board ? bd.elements : B.els, sel = board ? [] : selected();
  if (!all.length) return toast('This board is empty. Draw something first.', { type: 'info' });
  const o = { ...exp, scope: sel.length ? 'selection' : 'board', name: slug(bd.name) };
  const blk = sel.length === 1 && S.isBlock(sel[0]) ? sel[0] : null;
  const fmts = [['png', 'PNG'], ['svg', 'SVG'], ['pdf', 'PDF'], ['json', 'Fernboard']].concat(blk ? [[blk.type === 'diagram' ? 'mmd' : 'md', blk.type === 'diagram' ? '.mmd' : '.md']] : []);
  if (!fmts.some(([v]) => v === o.fmt)) o.fmt = 'png';
  const seg = (name, label, opts, val) => `<div class="cv-x__row"><span class="cv-x__label" id="xl-${name}">${label}</span><div class="fw-seg fw-seg--sm" role="radiogroup" aria-labelledby="xl-${name}" data-x="${name}">${opts.map(([v, l, dis]) => `<button class="fw-seg__opt" type="button" role="radio" data-value="${v}" aria-checked="${String(v) === String(val)}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>`;
  const body = h(`<div class="cv-x">
    <div class="cv-x__prev" id="x-prev" data-bg="${o.bg}"><img id="x-img" alt="Export preview"><span class="cv-x__dims" id="x-dims"></span></div>
    <div class="cv-x__form">
      ${seg('scope', 'What', [['board', `Whole board · ${all.length}`], ['selection', `Selection · ${sel.length}`, !sel.length]], o.scope)}
      ${seg('fmt', 'Format', fmts, o.fmt)}
      <div data-only="png">${seg('scale', 'Scale', [[1, '1×'], [2, '2×'], [4, '4×']], o.scale)}</div>
      <div data-only="png svg pdf">${seg('bg', 'Background', [['board', 'Board'], ['white', 'White'], ['transparent', 'Transparent']], o.bg)}</div>
      <div data-only="png svg pdf">${seg('th', 'Theme', [['shown', 'As shown'], ['light', 'Light'], ['dark', 'Dark']], o.th)}</div>
      <div class="cv-x__row"><label class="cv-x__label" for="x-name">Name</label><div class="cv-x__name"><input class="fw-input" id="x-name" value="${esc(o.name)}" spellcheck="false"><span class="cv-x__ext" id="x-ext"></span></div></div>
    </div></div>`);
  const dlg = openDialog({ title: 'Export', body, size: 820, className: 'cv-x-dialog', initialFocus: '#x-copy',
    actions: [{ label: 'Copy as PNG', onClick: () => {}, close: false }, { label: 'Download', primary: true, onClick: () => {}, close: false }] });
  const [copyBtn, dlBtn] = $$('.fw-dialog__foot .fw-btn', dlg.el); copyBtn.id = 'x-copy'; dlBtn.id = 'x-download';
  // Copy follows the format: PNG image, SVG markup (today's Mermaid "Copy SVG"), or the block's code
  const copyLabel = () => (o.fmt === 'svg' ? 'Copy SVG' : o.fmt === 'mmd' || o.fmt === 'md' ? 'Copy code' : o.fmt === 'json' ? 'Copy board file' : 'Copy as PNG');
  const paintCopy = () => { copyBtn.innerHTML = `${icon('copy')}${copyLabel()}${o.fmt === 'png' || o.fmt === 'pdf' ? `<kbd class="fw-kbd fw-kbd-hint">${isMac() ? '⇧⌘C' : 'Ctrl+Shift+C'}</kbd>` : ''}`; };
  paintCopy(); dlBtn.innerHTML = `${icon('download')}Download`;
  copyBtn.focus();
  let cur = null, gen = 0;
  const els = () => (o.scope === 'selection' && sel.length ? sel : all);
  const ext = () => ({ png: '.png', svg: '.svg', pdf: '.pdf', json: '.fernboard', mmd: '.mmd', md: '.md' }[o.fmt]);
  const refresh = async () => {
    const my = ++gen; $$('[data-only]', body).forEach((d) => (d.hidden = !d.dataset.only.split(' ').includes(o.fmt)));
    $('#x-ext').textContent = ext(); $('#x-prev').dataset.bg = o.bg; paintCopy();
    const r = await buildExport(els(), o); if (my !== gen) return; cur = r;
    $('#x-img').src = svgUrl(r.svg);
    const W = Math.round(r.w * (o.fmt === 'png' ? o.scale : 1)), H = Math.round(r.h * (o.fmt === 'png' ? o.scale : 1));
    $('#x-dims').textContent = o.fmt === 'png' ? `${W} × ${H} px` : o.fmt === 'svg' || o.fmt === 'pdf' ? `${Math.round(r.w)} × ${Math.round(r.h)} pt · vector` : o.fmt === 'json' ? 'Editable board file' : 'Block source';
  };
  $$('[data-x]', body).forEach((s) => s.addEventListener('fw-change', (e) => { const v = e.detail.value; o[s.dataset.x] = s.dataset.x === 'scale' ? +v : v; Object.assign(exp, { fmt: o.fmt, scale: o.scale, bg: o.bg, th: o.th }); store.set('canvas:export', exp); refresh(); }));
  $('#x-name', body).addEventListener('input', (e) => { o.name = e.target.value; });
  copyBtn.onclick = async () => {
    if (o.fmt === 'svg' || o.fmt === 'mmd' || o.fmt === 'md' || o.fmt === 'json') {
      const r = cur || (await buildExport(els(), o));
      const text = o.fmt === 'svg' ? r.svg : o.fmt === 'json' ? JSON.stringify({ type: 'fernboard', version: 1, name: bd.name, elements: els() }, null, 2) : blk.type === 'diagram' ? blk.code : blk.md;
      try { await navigator.clipboard.writeText(text); flash(copyBtn, 'Copied'); toast(`Copied ${o.fmt === 'svg' ? 'SVG' : o.fmt === 'json' ? 'board file' : 'code'}`, { type: 'success' }); } catch { toast('Your browser blocked copying. Use Download instead.', { type: 'warning' }); }
      return;
    }
    copyBtn.classList.add('is-busy');
    try {
      const r = cur || (await buildExport(els(), o)); const c = await toCanvas(r.svg, r.w, r.h, o.scale);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      copyBtn.classList.remove('is-busy'); flash(copyBtn, 'Copied');
      toast(`Copied ${o.scope === 'selection' ? 'selection' : 'board'} as PNG · ${c.width} × ${c.height}`, { type: 'success' });
    } catch { copyBtn.classList.remove('is-busy'); toast('Your browser blocked copying images. Use Download instead.', { type: 'warning' }); }
  };
  dlBtn.onclick = async () => {
    dlBtn.classList.add('is-busy');
    const name = (o.name || slug(bd.name)).replace(/\.[a-z]+$/i, '') + ext();
    let blob;
    const r = cur || (await buildExport(els(), o));
    if (o.fmt === 'png') { const c = await toCanvas(r.svg, r.w, r.h, o.scale); blob = await new Promise((res) => c.toBlob(res, 'image/png')); }
    else if (o.fmt === 'svg') blob = new Blob([r.svg], { type: 'image/svg+xml' });
    else if (o.fmt === 'pdf') blob = await svgToPdf(r);
    else if (o.fmt === 'json') blob = new Blob([JSON.stringify({ type: 'fernboard', version: 1, name: bd.name, elements: els() }, null, 2)], { type: 'application/json' });
    else blob = new Blob([blk.type === 'diagram' ? blk.code : blk.md], { type: 'text/plain' });
    const a = h(`<a download="${esc(name)}" href="${URL.createObjectURL(blob)}"></a>`); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    dlBtn.classList.remove('is-busy'); flash(dlBtn, 'Saved');
    toast(`Saved ${name} · ${formatBytes(blob.size)}`, { type: 'success' });
  };
  refresh();
}
function flash(btn, txt) { const old = btn.innerHTML; btn.innerHTML = `${icon('check')}${txt}`; btn.classList.add('is-copied'); setTimeout(() => { btn.innerHTML = old; btn.classList.remove('is-copied'); }, 1500); }

// Minimal PDF writer: page sized to the content; the board is drawn from the same SVG (high-resolution
// image layer) plus an invisible text layer so words are selectable and searchable.
async function svgToPdf(r) {
  const scale = 3, c = await toCanvas(r.svg, r.w, r.h, scale);
  const jpg = atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
  const W = r.w.toFixed(2), H = r.h.toFixed(2);
  const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
  const push = (s) => { const b = typeof s === 'string' ? Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 255) : s; parts.push(b); len += b.length; };
  const obj = (n, s) => { offs[n] = len; push(`${n} 0 obj\n`); push(s); push('\nendobj\n'); };
  push('%PDF-1.4\n%âãÏÓ\n');
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  obj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  offs[5] = len; push(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream\nendobj\n');
  const x = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`);
  void enc; return new Blob(parts, { type: 'application/pdf' });
}

// ───────────────────────── files & paste ─────────────────────────
function pickFiles(accept = 'image/*,.excalidraw,.fernboard,.json,.mmd,.mermaid,.md,.txt') {
  const i = h(`<input type="file" multiple hidden accept="${accept}">`); i.onchange = () => onFiles([...i.files], 'picker'); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000);
}
const ext = (f) => (f.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
async function fileToEls(f) {
  const e = ext(f);
  if (f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e)) {
    const src = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    const img = new Image(); img.src = src; await img.decode().catch(() => {});
    const k = Math.min(1, 520 / (img.naturalWidth || 520), 400 / (img.naturalHeight || 400));
    return { kind: 'image', els: [S.make('image', { src, w: Math.round((img.naturalWidth || 400) * k), h: Math.round((img.naturalHeight || 300) * k) })] };
  }
  const text = await f.text();
  if (['mmd', 'mermaid'].includes(e)) return { kind: 'diagram', els: [S.make('diagram', { w: 560, h: 320, code: text.trim(), title: f.name.replace(/\.[^.]+$/, '') })] };
  if (e === 'md' || e === 'txt') return { kind: 'mindmap', els: [S.make('mindmap', { w: 600, h: 360, md: text, title: f.name.replace(/\.[^.]+$/, '') })] };
  if (['excalidraw', 'fernboard', 'json'].includes(e)) {
    let data; try { data = JSON.parse(text); } catch { return { error: `${f.name} isn’t a valid drawing (it may be cut off).` }; }
    if (data.type === 'fernboard') return { kind: 'board', els: data.elements };
    if (data.type === 'excalidraw') {
      const els = (data.elements || []).filter((x) => !x.isDeleted).map((x) => {
        const color = 'ink';
        if (['rectangle', 'ellipse', 'diamond'].includes(x.type)) return S.make(x.type === 'rectangle' ? 'rect' : x.type, { x: x.x, y: x.y, w: x.width, h: x.height, color });
        if (x.type === 'text') return S.make('text', { x: x.x, y: x.y, text: x.text, w: x.width, h: x.height });
        if (x.type === 'arrow' || x.type === 'line') return S.make(x.type, { pts: x.points.map(([a, b]) => [x.x + a, x.y + b]) });
        if (x.type === 'freedraw') return S.make('pen', { x: x.x, y: x.y, pts: x.points });
        return null;
      }).filter(Boolean);
      return { kind: 'board', els };
    }
    return { error: `${f.name} isn’t a drawing Fernwork knows.` };
  }
  return { error: `Canvas can’t open .${e || 'this file'} yet.` };
}
async function onFiles(files, source) {
  for (const f of files) {
    const r = await fileToEls(f);
    if (r.error) { toast(r.error, { type: 'danger', action: { label: 'Choose another file', onClick: () => pickFiles() } }); continue; }
    if (r.kind === 'diagram' || r.kind === 'mindmap') await fitAll(r.els);
    if (B.board && r.kind !== 'board') {
      const before = snapshot(); const el = r.els[0]; const [x, y] = placeNew(el.w, el.h); el.x = x; el.y = y;
      B.els.push(el); B.sel = new Set([el.id]); commit(before); animateView(fitTarget(B.els), 420);
      toast(`Added ${f.name} to the board`, { type: 'success', action: { label: 'Undo', onClick: undo } });
    } else {
      let x = 0; for (const el of r.els) { if (!S.isLinear(el) && el.type !== 'pen' && r.kind !== 'board') { el.x = x; el.y = 0; x += el.w + 60; } }
      const bd = newBoard(f.name.replace(/\.[^.]+$/, ''), r.els);
      openBoard(bd.id, { push: true, fresh: true });
      toast(`Opened ${f.name} as a new board`, { type: 'success' });
    }
  }
}
function onPasteText(t) {
  if (!B.board || B.focus) return false;
  const s = t.trim(); if (!s) return true;
  if (/^(sequenceDiagram|flowchart|graph\s|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|timeline)/.test(s)) { insertBlock('diagram', { code: s, title: DG.kindOf(s), noFocus: true }); toast('Pasted as a diagram block', { action: { label: 'Undo', onClick: undo } }); return true; }
  if (/^(\s*[-*+]\s.+\n){2,}/.test(s + '\n')) { const md = '# ' + (s.split('\n')[0].replace(/^\s*[-*+]\s/, '')) + '\n' + s.split('\n').slice(1).join('\n'); insertBlock('mindmap', { md, noFocus: true }); toast('Pasted as a mind map', { action: { label: 'Undo', onClick: undo } }); return true; }
  const before = snapshot(); const r = stageRect(); const [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  const el = S.make('text', { x, y, text: s.slice(0, 2000) }); const L = S.textLayout(el); el.w = L.w; el.h = L.h; B.els.push(el); B.sel = new Set([el.id]); commit(before); draw();
  return true;
}

// ───────────────────────── routing ─────────────────────────
// SEO presets land on exactly that tool: ?leaf=draw → a blank board, ?leaf=mind-map → the mind map editor,
// ?leaf=mermaid → the Mermaid editor. The board is remembered per preset, so coming back continues it.
function landPreset(leaf) {
  const tpl = { draw: 'blank', 'mind-map': 'mindmap', mermaid: 'flowchart' }[leaf];
  const key = 'canvas:preset:' + leaf, id = store.get(key), bd = id && loadBoard(id);
  if (bd && !bd.trashed) openBoard(id);
  else { createFrom(tpl, { focusTitle: false, replace: true }); store.set(key, B.board.id); }
  history.replaceState(null, '', `?board=${encodeURIComponent(B.board.id)}`);
  const blk = leaf !== 'draw' && B.els.find((e) => e.type === (leaf === 'mermaid' ? 'diagram' : 'mindmap'));
  if (blk) setTimeout(() => openFocus(blk), 120);
}
let landed = false;
function route() {
  const p = new URLSearchParams(location.search);
  if (p.get('board')) openBoard(p.get('board'));
  else if (p.get('new')) { history.replaceState(null, '', location.pathname); createFrom(p.get('new')); }
  else if (!landed && LEAF !== 'fernboard') { landed = true; landPreset(LEAF); }
  else showShelf();
}
window.addEventListener('popstate', route);
window.addEventListener('resize', () => { if (B.board) { draw(); placeEditor(); } });

// boot
await document.fonts.load('500 16px Geist'); await document.fonts.load('600 16px Geist');
if (!index().length || params.has('reset')) {
  Object.keys(localStorage).filter((k) => k.startsWith('fw:canvas:')).forEach((k) => localStorage.removeItem(k)); svgCache.clear(); seedBoards();
  for (const r of index()) { const bd = loadBoard(r.id); if (await fitAll(bd.elements)) store.set('canvas:b:' + bd.id, bd); }
  if (params.has('reset')) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]reset\b/, '').replace(/^&/, '?'));
}
for (const t of TEMPLATES) await fitAll((t.cache ||= t.make()));
route();
