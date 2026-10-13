// Shared building blocks for the eight Text tools: panes, the CodeMirror editor with a cursor line, file open/save,
// "More options" (popover on desktop, sheet on phones), the quiet opt-in "Keep text on this device", and the mobile
// action bar. Everything else comes from the kit.
import { $, $$, h, esc, icon, enhance, toast, openPopover, openSheet, openMenu, copyText, store, isMobile, kbd } from '../kit/shell.js';
import * as E from './editor.js';
import { xicon } from './xicons.js';
export { E, xicon };

export const fmtN = (n) => new Intl.NumberFormat('en-US').format(n);
export const isCoarse = () => matchMedia('(pointer: coarse)').matches;
export function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; }
export function bytes(n) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; }

// ───────── remembered settings (never content) ─────────
export function settings(tool, defaults) {
  const s = { ...defaults, ...(store.get(`text:${tool}`) || {}) };
  Object.defineProperty(s, 'save', { value: () => store.set(`text:${tool}`, Object.fromEntries(Object.keys(defaults).map((k) => [k, s[k]]))) });
  return s;
}

// ───────── opt-in content saving ("Keep text on this device") ─────────
const KEEP = 'text:keep';
export const keepOn = () => store.get(KEEP) === true;
export function keeper(tool, { get, set }) {
  const key = `text:draft:${tool}`;
  const save = debounce(() => { if (!keepOn()) return; try { const v = get(); const s = JSON.stringify(v); if (s.length < 2e6) localStorage.setItem('fw:' + key, s); } catch { /* quota */ } }, 400);
  return {
    restore() { if (!keepOn()) return false; try { const v = JSON.parse(localStorage.getItem('fw:' + key) || 'null'); if (v != null) { set(v); return true; } } catch { /* */ } return false; },
    save,
    clear() { try { localStorage.removeItem('fw:' + key); } catch { /* */ } },
    toggleHtml: () => `<label class="fw-toggle tx-keep"><input type="checkbox" data-keep ${keepOn() ? 'checked' : ''}><span>Keep text on this device<span class="tx-opt-sub">Saved in this browser until you clear it</span></span></label>`,
    menuItem: () => ({ label: 'Keep text on this device', checked: keepOn(), onSelect: () => { const on = !keepOn(); store.set(KEEP, on); if (on) { save(); toast('Text is kept on this device', { type: 'neutral' }); } else { clearAllDrafts(); toast('Saved text cleared', { type: 'neutral' }); } } }),
    wire(root) {
      const cb = root.querySelector('[data-keep]'); if (!cb) return;
      cb.onchange = () => { store.set(KEEP, cb.checked); if (cb.checked) { save(); toast('Text is kept on this device', { type: 'neutral' }); } else { clearAllDrafts(); toast('Saved text cleared', { type: 'neutral' }); } };
    },
  };
}
function clearAllDrafts() { try { Object.keys(localStorage).filter((k) => k.startsWith('fw:text:draft:')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } }

// ───────── panes ─────────
/** pane({ id, title, meta, actions }) → HTML. actions = raw HTML (icon buttons) placed at the right of the head. */
export function pane({ id, title, actions = '', cls = '', body = '', foot = true }) {
  return `<section class="tx-pane ${cls}" id="${id}" aria-label="${esc(title)}">
    <header class="tx-pane__head"><h2 class="tx-pane__title">${esc(title)}</h2><span class="tx-pane__meta" data-meta aria-live="polite"></span><span class="fw-spacer"></span><div class="tx-pane__actions">${actions}</div></header>
    <div class="tx-pane__body" data-body>${body}</div>
    ${foot ? '<div class="tx-pane__pos" data-pos aria-hidden="true"></div>' : ''}</section>`;
}
export const iconBtn = (id, ic, label, extra = '') => `<button class="fw-iconbtn fw-iconbtn--sm" type="button" id="${id}" aria-label="${esc(label)}" data-tip="${esc(label)}" ${extra}>${icon(ic)}</button>`;
export const inputActions = (p) => `${iconBtn(p + '-open', 'folder-open', 'Open file', 'data-tip-kbd="mod+o"')}${iconBtn(p + '-paste', 'clipboard-paste', 'Paste')}${iconBtn(p + '-clear', 'x', 'Clear')}`;
export const outputActions = (p, { copyLabel = 'Copy' } = {}) => `${iconBtn(p + '-dl', 'download', 'Download', 'data-tip-kbd="mod+s"')}${iconBtn(p + '-more', 'ellipsis', 'More')}<button class="fw-btn fw-btn--primary fw-btn--sm tx-desk" type="button" id="${p}-copy">${icon('copy')}<span>${esc(copyLabel)}</span></button>`;

// ───────── editor ─────────
/**
 * editor(parent, { doc, kind, readOnly, numbers, wrap, prose, hint, onChange(view), onCursor(view) }) → view
 * The pane's [data-pos] line shows Ln/Col and selection (live working info) plus an optional extra (JSON path).
 */
export function editor(paneEl, o = {}) {
  const host = paneEl.querySelector('[data-body]'); const posEl = paneEl.querySelector('[data-pos]');
  const wrapEl = h(`<div class="tx-editor ${o.prose ? 'is-prose' : ''} ${o.readOnly ? 'is-readonly' : ''}"></div>`); host.append(wrapEl);
  let view;
  const state = () => E.makeState(o.doc || '', { kind: o.kind || 'text', wrap: o.wrap, numbers: o.numbers !== false, readOnly: !!o.readOnly, hint: o.hint || '', extra: o.extra || [] });
  view = E.createView(wrapEl, {
    state: state(),
    onUpdate(v, trs) {
      if (trs.some((t) => t.docChanged)) o.onChange?.(v, trs);
      if (trs.some((t) => t.selection || t.docChanged)) { o.onCursor?.(v); pos(); }
    },
  });
  view.paneEl = paneEl;
  view.setExtraPos = (html) => { view._extra = html; pos(); };
  function pos() {
    if (!posEl) return;
    const s = view.state; const m = s.selection.main; const line = s.doc.lineAt(m.head);
    const sel = m.empty ? '' : ` · ${fmtN(m.to - m.from)} selected`;
    posEl.innerHTML = s.doc.length ? `<span>Ln ${fmtN(line.number)}, Col ${fmtN(m.head - line.from + 1)}${sel}</span>${view._extra ? `<span class="tx-pos__extra">${view._extra}</span>` : ''}${keepOn() && !o.readOnly ? `<span class="tx-pos__keep" title="Kept on this device">${icon('hard-drive', { size: 12 })}Kept</span>` : ''}` : '';
  }
  view.refreshPos = pos;
  return view;
}
export const textOf = (view) => view.state.doc.toString();
/** Replace the whole document as one undoable change. */
export function setText(view, text, { kind, scrollTop = true } = {}) {
  if (kind) view.dispatch({ effects: E.langConf.reconfigure(E.langExt(kind, text.length)) });
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 }, userEvent: 'input.replace', scrollIntoView: scrollTop });
}
export function setReadOnlyText(view, text, kind) {
  view.setState(E.makeState(text, { kind, numbers: true, readOnly: true, wrap: kind !== 'json' }));
}

// ───────── empty-state overlay inside an input pane ─────────
export function emptyHint(paneEl, view, { title, samples = [], onPaste, onOpen }) {
  const el = h(`<div class="tx-empty"><div class="tx-empty__card">
      <span class="tx-empty__title"><span class="fw-pointer-copy">${esc(title)}</span><span class="fw-touch-copy">${esc(title.replace(/^Paste or type/, 'Type or paste').replace(/, or drop.*$/, ''))}</span></span>
      <span class="tx-empty__actions"><button class="fw-btn fw-btn--sm" type="button" data-e="paste">${icon('clipboard-paste')}Paste</button><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-e="open">${icon('folder-open')}Open file</button></span>
      ${samples.length ? `<span class="tx-empty__samples"><span class="fw-faint">Try</span>${samples.map((s, i) => `<button class="fw-chip fw-chip--sample" type="button" data-s="${i}">${esc(s.label)}</button>`).join('')}</span>` : ''}
    </div></div>`);
  paneEl.querySelector('[data-body]').append(el);
  el.querySelector('[data-e="paste"]').onclick = onPaste; el.querySelector('[data-e="open"]').onclick = onOpen;
  $$('[data-s]', el).forEach((b) => (b.onclick = () => samples[+b.dataset.s].run()));
  const sync = () => { el.hidden = view.state.doc.length > 0; };
  sync(); return sync;
}

// ───────── files ─────────
export function pickFile(accept = '') {
  return new Promise((res) => {
    const i = h(`<input type="file" hidden accept="${esc(accept)}">`); document.body.append(i);
    i.onchange = () => { res(i.files[0] || null); i.remove(); }; i.click();
  });
}
export async function readFileText(file) {
  if (file.size > 60 * 1048576) { toast(`${file.name} is ${bytes(file.size)} — too big for the text tools (60 MB max).`, { type: 'warning' }); return null; }
  return await file.text();
}
export async function readClipboard() {
  try { return await navigator.clipboard.readText(); } catch { toast(`Press ${kbd('mod+v')} to paste`, { type: 'info', html: true }); return null; }
}
export function download(text, name, type = 'text/plain') {
  const a = h(`<a download="${esc(name)}"></a>`); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(`Saved ${name}`, { type: 'success' });
}
export function downloadBlob(blob, name) { const a = h(`<a download="${esc(name)}"></a>`); a.href = URL.createObjectURL(blob); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(`Saved ${name}`, { type: 'success' }); }
export async function fetchSample(path) { return await (await fetch(path)).text(); }

// ───────── More options ─────────
/** moreOptions(anchor, { title, html, wire(root) }) — popover (≥ 641 px) or bottom sheet (phones). */
export function moreOptions(anchor, { title = 'More options', html, wire }) {
  if (isMobile()) { const s = openSheet({ title, body: `<div class="tx-opts">${html}</div>`, height: 'auto' }); wire?.(s.el); return s; }
  const p = openPopover(anchor, `<div class="tx-opts"><div class="tx-opts__title">${esc(title)}</div>${html}</div>`, { placement: 'bottom-end', className: 'tx-optspop', width: 320, label: title });
  wire?.(p.el); return p;
}
export const moreBtn = (id = 'more-opts', label = 'More options') => `<button class="fw-btn fw-btn--ghost fw-btn--sm tx-morebtn" type="button" id="${id}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(label)}">${icon('sliders-horizontal')}<span>${esc(label)}</span></button>`;

// ───────── mobile action bar (primary action within thumb reach; desktop has it in the output pane) ─────────
export function mobileBar(root, { line = '', actions = '' } = {}) {
  let bar = root.querySelector('.tx-mbar');
  if (!bar) { bar = h(`<div class="fw-actionbar-wrap tx-mbar"><div class="fw-actionbar"><div class="fw-actionbar__summary"><span class="fw-actionbar__line" data-line></span></div><div class="fw-actionbar__actions" data-acts></div></div></div>`); root.append(bar); }
  bar.querySelector('[data-line]').innerHTML = line; const acts = bar.querySelector('[data-acts]'); if (actions != null) { acts.innerHTML = actions; enhance(acts); }
  return bar;
}

export { $, $$, h, esc, icon, enhance, toast, openMenu, copyText, store, isMobile, kbd };
