// Fernwork One · shell for the real site (ES module). See assets/kit/README.md.
//
// assets/nav.js calls mountShell() from initNav(); pages normally do not import this file directly. Tool code may
// import the helpers (toast, openDialog, openSheet, openPopover, openMenu, pushLayer, copyText, icon, …).
//
// Layout produced (keeps the legacy wrappers tool CSS depends on):
//   body.fw-shell
//     a.fw-skip
//     header.fw-appbar                     (app bar: brand · ToolSwitcher · ⌘K pill · Recent · theme · ⋯)
//     div.app-container.fw-body
//       nav.fw-rail                        (icon rail, flyouts, pinned-open state)
//       main.main-content.fw-main#main     (the page's own <main>)
import { icon, hydrateIcons } from './icons.js';
import { CATEGORIES, LEAVES, ACTIONS, ALIASES, canonicalId, leaf as getLeaf, category as getCat, toolsOf, presetsOf, chipOf, POPULAR, leafForLocation } from './registry.js';
import { fileKind, summarize, actionsFor, handoff, consumeHandoff, formatBytes, extOf, mimeFor } from './files.js';

export { icon, hydrateIcons, CATEGORIES, LEAVES, ACTIONS, ALIASES, canonicalId, getLeaf, getCat, toolsOf, presetsOf, chipOf, POPULAR, leafForLocation,
  fileKind, summarize, actionsFor, handoff, consumeHandoff, formatBytes, extOf, mimeFor };

// ─────────────────────────────── utilities ───────────────────────────────
/** Site root (assets/kit/ → ../../), so links work when the site is served from a sub-path. */
export const ROOT_URL = new URL('../../', import.meta.url);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Parse one HTML element from a string (trusted markup only; escape user strings with esc()). */
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';
const mq = (q) => matchMedia(q).matches;
export const isMobile = () => mq('(max-width: 767px)');
export const isCoarse = () => mq('(pointer: coarse)');
const reducedMotion = () => mq('(prefers-reduced-motion: reduce)');
const TEXT_INPUTS = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week)$/;
export function isTyping(el = document.activeElement) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && TEXT_INPUTS.test(el.type || 'text');
}
/** Render a keyboard shortcut ("mod+k", "shift+mod+z", "?") as <kbd> chips. */
export function kbd(keys, cls = '') {
  const map = { mod: MOD, shift: '⇧', alt: isMac ? '⌥' : 'Alt', enter: '⏎', esc: 'Esc', up: '↑', down: '↓', left: '←', right: '→', space: 'Space', tab: 'Tab' };
  const glyph = (k) => (k.toLowerCase() === 'enter' ? icon('corner-down-left', { size: 12 }) : map[k.toLowerCase()] || k.toUpperCase());
  return String(keys).split(' ').map((combo) => `<kbd class="fw-kbd ${cls}">${combo.split('+').map(glyph).join(isMac ? '' : '+')}</kbd>`).join(' ');
}

// ─────────────────────────────── storage (fw:*) ───────────────────────────────
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('fw:' + k); if (v == null) return d; try { return JSON.parse(v); } catch { return v; } } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fw:' + k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* blocked */ } },
  del(k) { try { localStorage.removeItem('fw:' + k); } catch { /* blocked */ } },
};

// ─────────────────────────────── recent (real visits only) ───────────────────────────────
/** Recently used tools, newest first: [{ leaf, t }]. Seeded once from today's `fernwork_recent` page list. */
export function getRecent() {
  let r = store.get('recent');
  if (!Array.isArray(r)) {
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem('fernwork_recent') || '[]'); } catch { legacy = []; }
    r = (Array.isArray(legacy) ? legacy : []).map((x) => {
      const l = x && typeof x.page === 'string' ? leafForLocation('tools/' + x.page) : null;
      return l ? { leaf: l.id, t: Number(x.time) || Date.now() } : null;
    }).filter(Boolean);
  }
  const seen = new Set();
  return r.map((x) => ({ ...x, leaf: canonicalId(x && x.leaf) })).filter((x) => x.leaf && !seen.has(x.leaf) && seen.add(x.leaf));
}
const recentChanged = () => { try { window.dispatchEvent(new CustomEvent('fw-recent-change')); } catch { /* old browsers */ } };
export function addRecent(entry) {
  if (!entry || !getLeaf(entry.leaf)) return;
  const id = canonicalId(entry.leaf);
  const r = getRecent().filter((x) => x.leaf !== id);
  r.unshift({ leaf: id, t: Date.now(), ...(entry.file ? { file: String(entry.file) } : {}), ...(entry.note ? { note: String(entry.note) } : {}) });
  store.set('recent', r.slice(0, 12));
  recentChanged();
}
/** Clears Recent; returns an undo function. */
/** Clears Recent (fires `fw-recent-change` on window, as do addRecent and the returned undo). */
export function clearRecent() { const old = getRecent(); store.set('recent', []); recentChanged(); return () => { store.set('recent', old); recentChanged(); }; }
export function shortAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.round(s / 60)} min`; if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d`; return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────── layers: one Escape stack + focus trap ───────────────────────────────
const layers = [];
/** Register a closable layer; Escape closes the top-most one first. Returns an unregister function. */
export function pushLayer(close, el = null) { const L = { close, el }; layers.push(L); return () => { const i = layers.indexOf(L); if (i >= 0) layers.splice(i, 1); }; }
export const hasLayers = () => layers.length > 0;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || !layers.length) return;
  const top = layers[layers.length - 1];
  // Native <dialog>s close via their own cancel event (the key's default action), but the key must not also reach
  // other page listeners (e.g. the storage notice): only the top-most layer reacts to one Escape.
  if (top.el && top.el.tagName === 'DIALOG') { e.stopPropagation(); return; }
  e.preventDefault(); e.stopPropagation(); top.close();
}, true);
// Modal kit layers (dialog, sheet, command bar) own the keyboard: a tool's window-level shortcuts (editor undo, tool
// letters, Ctrl+S/O/P …) must not act on the page behind them. Keys bubble only up to the modal; Escape keeps its
// layer handling above, Ctrl/Cmd+K still toggles the command bar. Window *capture* listeners run before any element
// sees the key, so file shortcuts that tools catch there are swallowed here (registered before tools mount).
const MOD_FILE_KEYS = new Set(['s', 'o', 'p']);
function topModal() {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const el = layers[i].el;
    if (el && el.tagName === 'DIALOG' && el.open && el.matches(':modal')) return el;
  }
  return null;
}
function isolateKeys(d) {
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') return;
    e.stopPropagation();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return;
  const modal = topModal(); if (!modal) return;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && MOD_FILE_KEYS.has(e.key.toLowerCase())) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // Focus outside the modal (e.g. on <body> after a backdrop press): nothing behind it may react.
  if (!modal.contains(e.target)) e.stopImmediatePropagation();
}, true);
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
export function focusables(root) { return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden],[inert]') && el.getClientRects().length); }
/** Keep Tab inside root. Returns release(). */
export function trapFocus(root) {
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const f = focusables(root); if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !root.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}
/** Roving tabindex for a composite widget (chip rows, toolbars, segmented controls): one tab stop, arrows move. */
export function roving(container, itemSel = 'a,button', { orientation = 'horizontal', onMove } = {}) {
  if (container._roving) return; container._roving = true;
  const items = () => $$(itemSel, container).filter((el) => !el.disabled && el.getClientRects().length);
  const current = () => items().find((el) => el.matches('[aria-current="page"],[aria-checked="true"],[aria-selected="true"],[aria-pressed="true"]')) || items()[0];
  const sync = (focusEl) => items().forEach((el) => { el.tabIndex = el === focusEl ? 0 : -1; });
  sync(current());
  container._rovingSync = () => sync(current());
  container.addEventListener('keydown', (e) => {
    const list = items(); const i = list.indexOf(document.activeElement); if (i < 0) return;
    const next = orientation === 'vertical' ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    let j = null;
    if (e.key in next) j = (i + next[e.key] + list.length) % list.length;
    else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = list.length - 1;
    if (j == null) return;
    e.preventDefault(); sync(list[j]); list[j].focus(); list[j].scrollIntoView({ block: 'nearest', inline: 'nearest' }); onMove?.(list[j]);
  });
  container.addEventListener('focusin', (e) => { if (items().includes(e.target)) sync(e.target); });
}

// ─────────────────────────────── top layer ───────────────────────────────
function toTop(el) { // popover="manual" puts el in the top layer, above open <dialog>s and any tool z-index
  if (!el.popover) el.popover = 'manual';
  try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { /* not connected / unsupported */ }
}
/**
 * Where a layer opened from `anchor` must live to take input: inside the anchor's modal <dialog> (everything outside
 * it is inert) or inside the element that is full screen (the rest of the page gets no input then); else <body>.
 */
function layerHost(anchor) {
  const dlg = anchor?.closest?.('dialog[open]'); if (dlg) return dlg;
  const fs = document.fullscreenElement;
  if (fs && (!anchor || fs.contains(anchor))) return fs;
  return document.body;
}

// ─────────────────────────────── tooltip ───────────────────────────────
let tipEl = null, tipTimer = 0, tipFor = null;
function initTooltips() {
  tipEl = h('<div class="fw-tooltip" role="tooltip" id="fw-tooltip"></div>');
  document.body.append(tipEl);
  const hide = () => { clearTimeout(tipTimer); tipFor = null; tipEl.classList.remove('is-on'); };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest?.('[data-tip]');
    if (t === tipFor) return;
    hide(); if (t) { tipFor = t; tipTimer = setTimeout(() => showTip(t), 450); }
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]'); hide();
    if (t && t.matches(':focus-visible')) { tipFor = t; showTip(t); }
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  window.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
}
function showTip(t) {
  if (!t.isConnected || t.closest('.is-rail-pinned .fw-rail') || t.getAttribute('aria-expanded') === 'true') return;
  tipEl.innerHTML = esc(t.dataset.tip) + (t.dataset.tipKbd ? ' ' + kbd(t.dataset.tipKbd) : '');
  const host = layerHost(t); if (tipEl.parentElement !== host) host.append(tipEl);
  toTop(tipEl);
  const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
  let x, y;
  if (t.dataset.tipPlace === 'right') { x = r.right + 10; y = r.top + r.height / 2 - ht / 2; }
  else { x = r.left + r.width / 2 - w / 2; y = r.bottom + 8; if (y + ht > innerHeight - 8) y = r.top - ht - 8; }
  x = Math.max(8, Math.min(innerWidth - w - 8, x));
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  requestAnimationFrame(() => tipEl.classList.add('is-on'));
}

// ─────────────────────────────── toast ───────────────────────────────
let toastRegion = null;
const TOAST_ICON = { success: 'circle-check', info: 'info', warning: 'triangle-alert', danger: 'circle-alert' };
/**
 * toast('Recent cleared', { type: 'success'|'info'|'warning'|'danger'|'neutral', action: { label: 'Undo', onClick }, duration })
 * Bottom-right (desktop) / bottom-centre (mobile), max 2 visible, always dismissible. Returns { close, el }.
 * Tools that already use assets/toast.js (showToast) keep it; both are styled alike.
 */
export function toast(message, { type = 'success', action, duration } = {}) {
  if (!toastRegion) { toastRegion = h('<section class="fw-toasts fw-ui" aria-live="polite" aria-label="Notifications"></section>'); document.body.append(toastRegion); }
  toTop(toastRegion);
  const same = [...toastRegion.children].find((t) => t._msg === message && !t.classList.contains('is-leaving'));
  if (same) { same._restart(); return { close: same._close, el: same }; }
  const el = h(`<div class="fw-toast fw-toast--${type}" role="${type === 'danger' ? 'alert' : 'status'}">
    ${TOAST_ICON[type] ? `<span class="fw-toast__icon">${icon(TOAST_ICON[type], { size: 18 })}</span>` : ''}
    <div class="fw-toast__msg"></div>
    ${action ? '<button class="fw-toast__action" type="button"></button>' : ''}
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss">${icon('x')}</button></div>`);
  el.querySelector('.fw-toast__msg').textContent = message;
  if (action) el.querySelector('.fw-toast__action').textContent = action.label;
  el._msg = message;
  let timer = 0; const ms = duration ?? (action ? 6000 : type === 'danger' ? 0 : 4000);
  const close = () => { if (el.classList.contains('is-leaving')) return; clearTimeout(timer); el.classList.add('is-leaving'); setTimeout(() => el.remove(), 200); };
  el._close = close;
  el._restart = () => { clearTimeout(timer); if (ms) timer = setTimeout(close, ms); };
  el.querySelector('[aria-label="Dismiss"]').onclick = close;
  if (action) el.querySelector('.fw-toast__action').onclick = () => { action.onClick?.(); close(); };
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', el._restart);
  toastRegion.append(el);
  const live = [...toastRegion.children].filter((t) => !t.classList.contains('is-leaving'));
  if (live.length > 2) live.slice(0, live.length - 2).forEach((t) => t._close());
  el._restart();
  return { close, el };
}

// ─────────────────────────────── copy ───────────────────────────────
/** Copy text; if el is given it shows inline "Copied ✓" for 1.5 s. */
export async function copyText(text, el, { toastLabel } = {}) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = h('<textarea style="position:fixed;opacity:0"></textarea>'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
  }
  // A blocked clipboard (permissions, an old browser) must not answer "Copied".
  if (!ok) { toast('Copying is blocked here. Select the text and copy it yourself.', { type: 'warning' }); return ok; }
  if (el) flashCopied(el);
  if (toastLabel) toast(`Copied ${toastLabel}`, { type: 'success' });
  return ok;
}
function flashCopied(el) {
  clearTimeout(el._copyT);
  if (el._copyOld == null) { el._copyOld = el.innerHTML; el._tipOld = el.dataset.tip; }
  if (el.classList.contains('fw-iconbtn')) { el.innerHTML = icon('check'); if (el._tipOld) el.dataset.tip = 'Copied'; }
  else { el.style.minWidth = el.offsetWidth + 'px'; el.innerHTML = `${icon('check')}<span>Copied</span>`; }
  el.classList.add('is-copied');
  el._copyT = setTimeout(() => { el.innerHTML = el._copyOld; el._copyOld = null; if (el._tipOld) el.dataset.tip = el._tipOld; el.classList.remove('is-copied'); el.style.minWidth = ''; }, 1500);
}

// ─────────────────────────────── theme (assets/theme.js, storage key `oo-theme`) ───────────────────────────────
/** 'system' | 'light' | 'dark' — the saved preference. */
export function getThemePref() { try { return window.OOTheme?.get() || localStorage.getItem('oo-theme') || 'system'; } catch { return 'system'; } }
/** 'light' | 'dark' — what is shown now. */
export function effectiveTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
/** setTheme('light' | 'dark' | 'system'). Fires `oo-theme-change` (document, via theme.js) and `fw-theme-change` (window). */
export function setTheme(mode) {
  const root = document.documentElement;
  root.classList.add('fw-no-transition');
  if (window.OOTheme) window.OOTheme.set(mode);
  else { try { localStorage.setItem('oo-theme', mode); } catch { /* blocked */ } root.setAttribute('data-theme', mode === 'system' ? (mq('(prefers-color-scheme: dark)') ? 'dark' : 'light') : mode); }
  syncThemeButtons();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('fw-no-transition')));
  window.dispatchEvent(new CustomEvent('fw-theme-change', { detail: { theme: effectiveTheme(), pref: mode } }));
}
export function toggleTheme() { setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'); }
function syncThemeButtons() {
  const dark = effectiveTheme() === 'dark';
  $$('[data-fw-theme-toggle]').forEach((b) => {
    b.innerHTML = icon(dark ? 'sun' : 'moon', { size: 18 });
    b.dataset.tip = dark ? 'Light theme' : 'Dark theme';
    b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

// ─────────────────────────────── dialog / sheet / popover / menu ───────────────────────────────
let uid = 0;
/**
 * Close a modal <dialog> at once — the page takes taps and keys again immediately — and play its exit animation on
 * an inert copy (a modal dialog that is still animating out keeps the whole page inert, so input right after closing
 * was lost). `ms` is how long the copy stays.
 */
function closeModal(d, ms) {
  if (d.open && !reducedMotion()) {
    const r = d.getBoundingClientRect();
    const scrim = h('<div class="fw-ghost-scrim" aria-hidden="true"></div>');
    const ghost = document.createElement('div');
    ghost.className = `${d.className} fw-ghost is-closing`;
    ghost.setAttribute('open', ''); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    ghost.innerHTML = d.innerHTML;
    // A picture only: no ids, links, roles or data hooks that page code (or a test) could find twice.
    ghost.querySelectorAll('*').forEach((el) => [...el.attributes].forEach((a) => {
      if (/^(id|name|for|href|role|tabindex|autofocus|contenteditable|data-.*|aria-.*)$/.test(a.name)) el.removeAttribute(a.name);
    }));
    Object.assign(ghost.style, { position: 'fixed', zIndex: '60030', pointerEvents: 'none', inset: 'auto', left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px', margin: '0', transform: d.style.transform });
    document.body.append(scrim, ghost);
    setTimeout(() => { scrim.remove(); ghost.remove(); }, ms);
  }
  d.close(); d.remove();
}
function fill(el, content) { if (content == null) return; if (typeof content === 'string') el.innerHTML = content; else el.append(content); }
/**
 * openDialog({ title, body, actions: [{ label, primary, danger, ghost, onClick, close = true }], size, sheetOnMobile = true,
 *              initialFocus, onClose }) → { el, close }. Native <dialog>, focus trap, Escape stack, focus return.
 */
export function openDialog({ title = '', body = '', actions = [], size, sheetOnMobile = true, initialFocus, onClose, className = '' } = {}) {
  const prev = document.activeElement; const id = 'fw-dlg-' + ++uid;
  const d = h(`<dialog class="fw-dialog fw-ui ${sheetOnMobile ? 'fw-dialog--sheet-mobile' : ''} ${className}" aria-labelledby="${id}">
    <div class="fw-dialog__head"><h2 class="fw-dialog__title" id="${id}"></h2>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="fw-dialog__body"></div>${actions.length ? '<div class="fw-dialog__foot"></div>' : ''}</dialog>`);
  d.querySelector('.fw-dialog__title').textContent = title;
  if (size) d.style.setProperty('--dlg-w', size + 'px');
  fill(d.querySelector('.fw-dialog__body'), body);
  let closed = false;
  const api = { el: d, close };
  actions.forEach((a) => {
    const b = h(`<button type="button" class="fw-btn ${a.primary ? 'fw-btn--primary' : a.danger ? 'fw-btn--danger' : a.ghost ? 'fw-btn--ghost' : ''}"></button>`);
    b.textContent = a.label;
    b.onclick = () => { a.onClick?.(api); if (a.close !== false) close(); };
    d.querySelector('.fw-dialog__foot').append(b);
  });
  d.querySelector('[data-close]').onclick = () => close();
  document.body.append(d); enhance(d); isolateKeys(d);
  d.showModal();
  const untrap = trapFocus(d); const pop = pushLayer(() => close(), d);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('mousedown', (e) => { d._downOnBackdrop = e.target === d; });
  d.addEventListener('click', (e) => { if (e.target === d && d._downOnBackdrop) close(); d._downOnBackdrop = false; });
  const f = (initialFocus && d.querySelector(initialFocus)) || d.querySelector('[autofocus]') || d.querySelector('.fw-dialog__foot .fw-btn--primary') || focusables(d.querySelector('.fw-dialog__body'))[0] || d.querySelector('[data-close]');
  f?.focus();
  function close() {
    if (closed) return; closed = true; pop(); untrap();
    closeModal(d, 170);
    if (prev?.isConnected) prev.focus({ preventScroll: true });
    onClose?.();
  }
  return api;
}

/** openSheet({ title, body, height: 'auto'|'peek'|'half'|'full', onClose }) → { el, close }. Bottom sheet; drag the grab handle down to close. */
export function openSheet({ title = '', body = '', height = 'auto', onClose, className = '', headExtra = '' } = {}) {
  const prev = document.activeElement; const id = 'fw-sheet-' + ++uid;
  const d = h(`<dialog class="fw-sheet fw-ui ${height !== 'auto' ? 'fw-sheet--' + height : ''} ${className}" aria-labelledby="${id}">
    <div class="fw-sheet__grab" aria-hidden="true"></div>
    <div class="fw-sheet__head"><h2 class="fw-sheet__title" id="${id}"></h2>${headExtra}
    <button class="fw-iconbtn" type="button" data-close aria-label="Close">${icon('x', { size: 18 })}</button></div>
    <div class="fw-sheet__body"></div></dialog>`);
  d.querySelector('.fw-sheet__title').textContent = title;
  fill(d.querySelector('.fw-sheet__body'), body);
  document.body.append(d); enhance(d); isolateKeys(d); d.showModal();
  let closed = false;
  const untrap = trapFocus(d); const pop = pushLayer(() => close(), d);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  d.querySelector('[data-close]').onclick = () => close();
  // Drag down to close: from the grab handle or anywhere on the head that is not a control (the 20 px handle alone
  // was hard to hit). A cancelled gesture (system swipe, lost capture) snaps the sheet back instead of leaving it.
  let y0 = null; let dragger = null;
  const endDrag = (e, commit) => {
    if (y0 == null) return;
    const dy = commit ? e.clientY - y0 : 0; y0 = null; dragger = null;
    d.style.transition = ''; d.style.transform = ''; if (dy > 80) close();
  };
  for (const el of [d.querySelector('.fw-sheet__grab'), d.querySelector('.fw-sheet__head')]) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button || e.target.closest('button, a, input, select, textarea, [contenteditable]')) return;
      y0 = e.clientY; dragger = el; el.setPointerCapture(e.pointerId); d.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => { if (y0 != null && dragger === el) d.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    el.addEventListener('pointerup', (e) => endDrag(e, true));
    el.addEventListener('pointercancel', (e) => endDrag(e, false));
    el.addEventListener('lostpointercapture', (e) => endDrag(e, false));
  }
  if (!isCoarse()) (focusables(d.querySelector('.fw-sheet__body'))[0] || d.querySelector('[data-close]')).focus();
  else d.querySelector('[data-close]').focus({ preventScroll: true });
  function close() {
    if (closed) return; closed = true; pop(); untrap();
    closeModal(d, 190);
    if (prev?.isConnected) prev.focus({ preventScroll: true });
    onClose?.();
  }
  return { el: d, close, get closed() { return closed; } };
}

function place(el, anchor, placement = 'bottom-start') {
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight;
  let top = r.bottom + 6;
  if (top + ht > innerHeight - 8 && r.top - 6 - ht > 8) { top = r.top - 6 - ht; el.style.setProperty('--origin', 'bottom left'); }
  let left = placement.endsWith('end') ? r.right - w : placement.endsWith('center') ? r.left + r.width / 2 - w / 2 : r.left;
  left = Math.max(8, Math.min(innerWidth - w - 8, left));
  el.style.top = Math.max(8, top) + 'px'; el.style.left = left + 'px';
}
// Entering or leaving full screen changes which part of the page takes input and puts the full-screen element above
// layers already shown: popovers and menus open at that moment close (as on an outside click).
const openPops = new Set();
document.addEventListener('fullscreenchange', () => { [...openPops].forEach((p) => p.close(false)); });
/** True while a popover/menu opened from this anchor is open. */
export const isOpenFor = (anchor) => !!(anchor && anchor._fwPop && !anchor._fwPop.closed);
/**
 * openPopover(anchor, content, { placement, className, onClose, focus = true, width, role, label }) → { el, close, reposition, closed }.
 * Non-modal, top layer. G4 behaviour: calling it again for the same anchor while open closes it (toggle); Escape,
 * an outside click or focus leaving close it; aria-expanded on the anchor stays in sync; focus returns to the anchor.
 */
export function openPopover(anchor, content, { placement = 'bottom-start', className = '', onClose, focus = true, width, role = 'dialog', label } = {}) {
  if (isOpenFor(anchor)) { anchor._fwPop.close(true); return anchor._fwPop; }
  const el = h(`<div class="fw-popover fw-ui ${className}" role="${role}"></div>`);
  if (label) el.setAttribute('aria-label', label);
  if (width) el.style.width = typeof width === 'number' ? width + 'px' : width;
  fill(el, content);
  // Inside a modal <dialog> everything outside it is inert: keep the popover in the anchor's dialog (still top layer).
  layerHost(anchor).append(el); enhance(el); toTop(el);
  place(el, anchor, placement);
  anchor.setAttribute('aria-expanded', 'true');
  const api = { el, close, reposition: () => place(el, anchor, placement), closed: false };
  anchor._fwPop = api; openPops.add(api);
  const pop = pushLayer(() => close(true), el);
  const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(false); };
  const onReflow = () => place(el, anchor, placement);
  const onFocusOut = () => setTimeout(() => { if (!api.closed && !el.contains(document.activeElement) && document.activeElement !== anchor && document.activeElement !== document.body) close(false); }, 0);
  setTimeout(() => { if (!api.closed) document.addEventListener('pointerdown', onDown, true); }, 0);
  window.addEventListener('resize', onReflow); el.addEventListener('focusout', onFocusOut);
  if (focus) (el.querySelector('[autofocus]') || focusables(el)[0])?.focus({ preventScroll: true });
  function close(returnFocus = true) {
    if (api.closed) return; api.closed = true; pop(); openPops.delete(api);
    document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', onReflow);
    anchor.setAttribute('aria-expanded', 'false');
    const had = el.contains(document.activeElement);
    el.classList.add('is-closing'); setTimeout(() => el.remove(), reducedMotion() ? 0 : 110);
    if (returnFocus && (had || document.activeElement === document.body)) anchor.focus({ preventScroll: true });
    onClose?.();
  }
  return api;
}

/**
 * openMenu(anchor, items, opts) — items: [{ label, icon, hint, kbd, checked, danger, sub, href, external, id, onSelect }] or
 * groups [{ group: 'Label', items: […] }]. role=menu, arrows, Home/End, typeahead, Enter/Space, Esc returns focus.
 * Toggles like openPopover (a second call for the same anchor closes it).
 */
export function openMenu(anchor, items, opts = {}) {
  if (isOpenFor(anchor)) { anchor._fwPop.close(true); return anchor._fwPop; }
  const groups = items[0] && 'group' in items[0] ? items : [{ items }];
  const menu = h('<div class="fw-menu" role="menu"></div>');
  if (opts.label) menu.setAttribute('aria-label', opts.label);
  const flat = [];
  groups.filter((g) => g.items.length).forEach((g) => {
    const wrap = h(`<div class="fw-menu__group" role="group">${g.group ? '<div class="fw-menu__label" aria-hidden="true"></div>' : ''}</div>`);
    if (g.group) { wrap.setAttribute('aria-label', g.group); wrap.querySelector('.fw-menu__label').textContent = g.group; }
    g.items.forEach((it) => {
      const role = it.checked === undefined ? 'menuitem' : 'menuitemradio';
      const tag = it.href ? 'a' : 'button';
      const b = h(`<${tag} ${tag === 'button' ? 'type="button"' : ''} class="fw-menu__item ${it.danger ? 'fw-menu__item--danger' : ''}" role="${role}" tabindex="-1">
        ${it.icon ? icon(it.icon) : ''}<span class="fw-menu__text"></span>
        ${it.kbd ? `<span class="fw-menu__hint">${kbd(it.kbd)}</span>` : it.hint ? '<span class="fw-menu__hint"></span>' : it.external ? `<span class="fw-menu__hint">${icon('external-link', { size: 14 })}</span>` : ''}
        ${it.checked !== undefined ? icon('check', { className: 'fw-menu__check' }) : ''}</${tag}>`);
      const text = b.querySelector('.fw-menu__text'); text.textContent = it.label;
      if (it.sub) { const s = document.createElement('span'); s.className = 'fw-menu__sub'; s.textContent = it.sub; text.append(s); }
      if (it.hint && !it.kbd) b.querySelector('.fw-menu__hint').textContent = it.hint;
      if (it.checked !== undefined) b.setAttribute('aria-checked', String(!!it.checked));
      if (it.id) b.id = it.id;
      if (it.href) { b.href = it.href; if (it.external) { b.target = '_blank'; b.rel = 'noopener'; } }
      b.addEventListener('click', (e) => { if (!it.href) e.preventDefault(); p.close(!it.href); it.onSelect?.(); });
      wrap.append(b); flat.push(b);
    });
    menu.append(wrap);
  });
  const p = openPopover(anchor, menu, { ...opts, role: 'presentation', focus: false });
  let ta = '', taT = 0;
  menu.addEventListener('keydown', (e) => {
    const i = flat.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); flat[(i + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); flat[0].focus(); } else if (e.key === 'End') { e.preventDefault(); flat.at(-1).focus(); }
    else if (e.key === 'Tab') p.close(false);
    else if (e.key === ' ' && document.activeElement?.tagName === 'A') { e.preventDefault(); document.activeElement.click(); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      clearTimeout(taT); ta += e.key.toLowerCase(); taT = setTimeout(() => { ta = ''; }, 600);
      flat.find((b) => b.textContent.trim().toLowerCase().startsWith(ta))?.focus();
    }
  });
  (flat.find((b) => b.getAttribute('aria-checked') === 'true') || flat[0])?.focus({ preventScroll: true });
  return p;
}

// ─────────────────────────────── routing ───────────────────────────────
const state = { opts: {}, leaf: null, cat: null, arch: 'instant', page: null };
const pageKey = (pathname) => (pathname || '').replace(/\.html$/, '').replace(/\/index$/, '/');
export const homeHref = () => new URL('./', ROOT_URL).href;
export const legalHref = (page) => new URL(`legal/${page}`, ROOT_URL).href;
/** Best href for a leaf: same-page sub-tools become a bare `#hash` (no reload; back/forward work). */
export function hrefFor(idOrLeaf) {
  const l = typeof idOrLeaf === 'string' ? getLeaf(idOrLeaf) : idOrLeaf;
  if (!l) return homeHref();
  const u = new URL(l.path, ROOT_URL);
  if (pageKey(u.pathname) === pageKey(location.pathname)) return u.hash || location.pathname + location.search;
  return u.pathname + u.hash;
}
/** Category landing (the page root, no #hash — the page opens its first or last-used tab, as today). */
export function catHref(catOrId) {
  const c = typeof catOrId === 'string' ? getCat(catOrId) : catOrId;
  if (!c) return homeHref();
  return new URL(`tools/${c.page}`, ROOT_URL).pathname;
}
/** Where a leaf's working tool lives (SEO landing cards hand files to the real tool). */
export function toolHrefFor(idOrLeaf) {
  const l = typeof idOrLeaf === 'string' ? getLeaf(idOrLeaf) : idOrLeaf;
  if (!l) return homeHref();
  if (l.open) { const u = new URL(l.open, ROOT_URL); return u.pathname + u.hash; }
  return hrefFor(l);
}
/** Re-point every [data-leaf] link (call after rendering your own leaf links). */
export function refreshLeafLinks(root = document) { $$('a[data-leaf]', root).forEach((a) => { a.href = hrefFor(a.dataset.leaf); }); }
/** navigate('heic-to-jpg', { newTab, files }) — files are handed to the next page via IndexedDB and fed into its file input. */
export async function navigate(id, { newTab, files, action } = {}) {
  const l = getLeaf(id); if (!l) return;
  if (files?.length) await handoff(files, { leaf: l.id, action });
  const href = files?.length ? toolHrefFor(l) : hrefFor(l);
  if (newTab) { window.open(href, '_blank', 'noopener'); return; }
  const u = new URL(href, location.href);
  if (pageKey(u.pathname) === pageKey(location.pathname) && u.hash) { location.hash = u.hash; showToolFromTop(); return; }
  location.href = u.href;
}
/**
 * A sub-tool picked from the switcher or the command bar on its own page only changes the #hash: show it from the
 * top like a page load (the old mobile menu did), instead of leaving the reader mid-page in the new tool.
 */
function showToolFromTop() { setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }), 0); }
const isSamePageHashLink = (a) => (a.getAttribute('href') || '').startsWith('#');

// ─────────────────────────────── search ───────────────────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9#%+]+/g, ' ').trim();
const STOP = new Set(['to', 'in', 'a', 'an', 'the', 'of', 'for', 'my', 'with', 'and', 'into', 'from', 'online', 'free', 'tool', 'app', 'how']);
let INDEX = null;
function indexEntry(e) {
  const it = e.item; const cat = it.cat ? getCat(it.cat) : null;
  return { ...e, name: norm(it.name), words: norm(it.name).split(' '), syn: (it.syn || []).map(norm), chip: norm(it.chip), cat: norm(cat?.label), desc: it.descInherited ? '' : norm(it.desc) };
}
function buildIndex() { INDEX = [...LEAVES.map((l) => ({ item: l, kind: 'leaf' })), ...ACTIONS.map((a) => ({ item: a, kind: 'action' }))].map(indexEntry); }
let pageCommands = [];
/** Page commands for ⌘K ("On this page"): [{ id, label, sub, icon, kbd, syn, run, searchOnly, hidden() }]. */
export function setCommands(list = []) { pageCommands = (list || []).map((c, i) => ({ id: c.id || 'cmd-' + i, name: c.label || c.name, kind: 'command', ...c })); }
const commandsNow = () => pageCommands.filter((c) => !c.hidden?.());
function isSubseq(q, s) { let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length; }
function scoreToken(t, e) {
  let b = 0;
  if (e.name === t) b = 100;
  for (const w of e.words) { if (w === t) b = Math.max(b, 90); else if (w.startsWith(t)) b = Math.max(b, 62 + 20 * t.length / w.length); }
  if (e.name.startsWith(t)) b = Math.max(b, 85);
  if (t.length >= 2 && e.name.includes(t)) b = Math.max(b, 45);
  for (const s of e.syn) {
    if (s === t) b = Math.max(b, 76);
    else if (s.split(' ').includes(t)) b = Math.max(b, 66);
    else if (s.startsWith(t)) b = Math.max(b, 56);
    else if (t.length >= 3 && s.includes(t)) b = Math.max(b, 36);
  }
  if (e.chip && e.chip === t) b = Math.max(b, 60);
  if (e.cat && e.cat.startsWith(t)) b = Math.max(b, 42);
  if (t.length >= 3 && e.desc.split(' ').includes(t)) b = Math.max(b, 24);
  if (t.length >= 3 && isSubseq(t, e.name.replace(/ /g, ''))) b = Math.max(b, 18);
  return b;
}
/** search('heic', { limit, kinds }) → [{ item, kind: 'leaf'|'action'|'command', score, marks }] — pure tool search. */
export function search(q, { limit = 8, kinds } = {}) {
  if (!INDEX) buildIndex();
  const nq = norm(q); if (!nq) return [];
  const toks = nq.split(' ');
  const res = [];
  for (const e of [...INDEX, ...commandsNow().map((c) => indexEntry({ item: c, kind: 'command' }))]) {
    if (kinds && !kinds.includes(e.kind)) continue;
    let sum = 0, n = 0, dead = false;
    for (const t of toks) { const s = scoreToken(t, e); if (!s) { if (STOP.has(t)) continue; dead = true; break; } sum += s; n++; }
    if (dead || !n) continue;
    const full = e.syn.includes(nq);
    let score = sum / n;
    if (e.name.startsWith(nq)) score += 40; else if (full) score += 30; else if (e.syn.some((s) => s.startsWith(nq))) score += 18;
    if (e.item.popular) score += 4; if (e.item.kind === 'tool') score += 3; if (e.kind === 'command') score += 6;
    if (e.item.searchOnly) score -= 8;
    res.push({ item: e.item, kind: e.kind, score, marks: marksFor(e.item.name, toks) });
  }
  res.sort((a, b) => b.score - a.score);
  const top = res[0]?.score || 0;
  return res.filter((r) => r.score >= top * 0.45).slice(0, limit);
}
function marksFor(name, toks) {
  const lower = name.toLowerCase(); const r = [];
  for (const t of toks) { if (STOP.has(t) && toks.length > 1) continue; const i = lower.indexOf(t); if (i >= 0) r.push([i, i + t.length]); }
  return r.sort((a, b) => a[0] - b[0]).reduce((acc, m) => { const l = acc.at(-1); if (l && m[0] <= l[1]) l[1] = Math.max(l[1], m[1]); else acc.push(m); return acc; }, []);
}
function markName(name, marks) {
  if (!marks?.length) return esc(name);
  let out = '', i = 0; for (const [a, b] of marks) { out += esc(name.slice(i, a)) + '<mark>' + esc(name.slice(a, b)) + '</mark>'; i = b; }
  return out + esc(name.slice(i));
}

// ─────────────────────────────── results list (command bar, home/404 search, switcher) ───────────────────────────────
const GROUP_OF = { leaf: 'Tools', action: 'Settings', command: 'On this page' };
function buildEntries(q) {
  const s = q.trim(); const out = [];
  if (!s) {
    commandsNow().filter((c) => !c.searchOnly).slice(0, 4).forEach((c) => out.push({ type: 'command', group: GROUP_OF.command, item: c }));
    const recent = getRecent().slice(0, 4);
    recent.forEach((r) => out.push({ type: 'recent', group: 'Recent', r, item: getLeaf(r.leaf) }));
    POPULAR.filter((id) => !recent.some((r) => r.leaf === id)).slice(0, 5).forEach((id) => out.push({ type: 'leaf', group: 'Popular', item: getLeaf(id) }));
    return out;
  }
  const found = search(s, { limit: 10 });
  const order = { command: 0, leaf: 1, action: 2 };
  found.sort((a, b) => (order[a.kind] - order[b.kind]) || (b.score - a.score));
  for (const r of found) out.push({ type: r.kind, group: GROUP_OF[r.kind], item: r.item, marks: r.marks });
  return out;
}
function leafMeta(l) {
  if (!l.cat) return 'Setting';
  const c = getCat(l.cat);
  const sub = l.kind === 'preset' ? chipOf(l).chip : toolsOf(l.cat).length > 1 ? l.chip : '';
  // Never repeat what the row already says ("PDF Tools · PDF Tools", "JSON Formatter — Text · JSON Formatter").
  const parts = [c.label, sub].filter((p, i, a) => p && a.indexOf(p) === i && p !== l.name);
  return parts.join(' · ');
}
/** createResults(listEl, { input, onDone }) → { render(q), select(i), activate(alt), onKey(e) } with listbox/option aria. */
export function createResults(listEl, { input, onDone = () => {} } = {}) {
  let entries = [], sel = 0, lastQ = '';
  const lid = listEl.id || (listEl.id = 'fw-list-' + ++uid);
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', 'Search results');
  function render(q) {
    lastQ = q; entries = buildEntries(q); sel = 0;
    let html = '', lastGroup = null;
    entries.forEach((e, i) => {
      const id = `${lid}-o${i}`;
      if (e.group !== lastGroup) { html += `<div class="fw-cmd__group" role="presentation">${esc(e.group)}</div>`; lastGroup = e.group; }
      const it = e.item; let name, meta;
      if (e.type === 'recent') { name = esc(it.name); meta = esc([leafMeta(it), shortAgo(e.r.t)].filter(Boolean).join(' · ')); }
      else if (e.type === 'action') { name = markName(it.name, e.marks); meta = it.kind === 'setting' ? 'Setting' : 'Action'; }
      else if (e.type === 'command') { name = markName(it.name, e.marks); meta = esc(it.sub || ''); }
      else { name = markName(it.name, e.marks); meta = esc(leafMeta(it)); }
      const dataAttr = e.type === 'command' ? `data-command-id="${esc(it.id)}"` : e.type === 'action' ? `data-action-id="${esc(it.id)}"` : `data-leaf-id="${esc(it.id)}"`;
      const right = e.type === 'command' && it.kbd ? kbd(it.kbd) : `${e.type === 'action' || e.type === 'command' ? 'Run' : 'Open'} ${kbd('enter')}`;
      html += `<div class="fw-cmd__item" role="option" id="${id}" data-idx="${i}" ${dataAttr}>
        <span class="fw-cmd__icon">${icon(it?.icon || 'arrow-right')}</span>
        <span class="fw-cmd__text"><span class="fw-cmd__name">${name}</span>${meta ? `<span class="fw-cmd__meta">${meta}</span>` : ''}</span>
        <span class="fw-cmd__enter">${right}</span></div>`;
    });
    if (!entries.length) html = `<div class="fw-cmd__empty"><strong>No tool called “${esc(q.trim())}”</strong>Try “compress pdf”, “json”, “heic” or “qr”.</div>`;
    listEl.innerHTML = html; select(0, false);
  }
  function select(i, scroll = true) {
    if (!entries.length) { input?.removeAttribute('aria-activedescendant'); return; }
    sel = (i + entries.length) % entries.length;
    $$('[role="option"]', listEl).forEach((o) => o.setAttribute('aria-selected', String(+o.dataset.idx === sel)));
    const o = $(`[data-idx="${sel}"]`, listEl);
    input?.setAttribute('aria-activedescendant', o.id);
    if (scroll) o.scrollIntoView({ block: 'nearest' });
  }
  function activate(alt = false) {
    const e = entries[sel]; if (!e) return;
    onDone();
    if (e.type === 'command') e.item.run?.();
    else if (e.type === 'action') runAction(e.item.id);
    else navigate(e.item.id, { newTab: alt });
  }
  let lastPt = '';
  listEl.addEventListener('pointermove', (ev) => {
    const k = ev.clientX + ',' + ev.clientY; if (k === lastPt) return; lastPt = k;
    const o = ev.target.closest('[data-idx]'); if (o && +o.dataset.idx !== sel) select(+o.dataset.idx, false);
  });
  listEl.addEventListener('click', (ev) => { const o = ev.target.closest('[data-idx]'); if (!o) return; select(+o.dataset.idx, false); activate(ev.metaKey || ev.ctrlKey); });
  function onKey(ev) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); select(sel + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); select(sel - 1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); activate(ev.metaKey || ev.ctrlKey); }
  }
  return { render, select, activate, onKey, get entries() { return entries; }, get query() { return lastQ; } };
}

/** Settings / shell actions from the command bar. */
export function runAction(id) {
  if (id === 'theme-dark') setTheme('dark');
  else if (id === 'theme-light') setTheme('light');
  else if (id === 'theme-system') setTheme('system');
  else if (id === 'shortcuts') openShortcuts();
  else if (id === 'go-home') location.href = homeHref();
  else if (id === 'clear-recent') { const undo = clearRecent(); toast('Recent tools cleared', { type: 'neutral', action: { label: 'Undo', onClick: undo } }); }
}

// ─────────────────────────────── command bar (⌘K) ───────────────────────────────
let cmd = null;
/** openCommandBar('heic') — pure tool search over tools, sub-tools, SEO pages (with synonyms), page commands, settings. */
export function openCommandBar(initial = '') {
  if (cmd) { if (initial) { cmd.input.value = initial; cmd.results.render(initial); } cmd.input.focus(); return cmd; }
  const prev = document.activeElement;
  const d = h(`<dialog class="fw-cmd fw-ui" aria-label="Search tools">
    <div class="fw-cmd__panel">
      <div class="fw-cmd__bar">${icon('search', { size: 18 })}
        <input class="fw-cmd__input" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="Search tools…" aria-label="Search tools">
        <span class="fw-hide-mobile">${kbd('esc', 'fw-kbd--ghost')}</span>
        <button class="fw-btn fw-btn--ghost fw-btn--sm fw-show-mobile" type="button" data-close>Cancel</button></div>
      <div class="fw-cmd__list"></div>
      <div class="fw-cmd__foot"><span>${kbd('up')}${kbd('down')} move</span><span>${kbd('enter')} open</span><span>${kbd('mod+enter')} new tab</span></div>
    </div></dialog>`);
  document.body.append(d);
  const input = d.querySelector('input'), list = d.querySelector('.fw-cmd__list');
  input.setAttribute('aria-controls', list.id = 'fw-cmd-list');
  const results = createResults(list, { input, onDone: () => close(true) });
  isolateKeys(d); d.showModal();
  const pop = pushLayer(() => close(), d); const untrap = trapFocus(d);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  d.querySelector('[data-close]').onclick = () => close();
  input.addEventListener('input', () => results.render(input.value));
  input.addEventListener('keydown', results.onKey);
  input.value = initial; results.render(initial); input.focus();
  let closed = false;
  $$('#fw-cmdpill, #fw-search-mobile').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  function close(navigating = false) {
    if (closed) return; closed = true; pop(); untrap(); cmd = null;
    $$('#fw-cmdpill, #fw-search-mobile').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    closeModal(d, 110);
    if (!navigating && prev?.isConnected) prev.focus({ preventScroll: true });
  }
  cmd = { el: d, input, results, close, get open() { return !closed; } };
  return cmd;
}
export const closeCommandBar = () => cmd?.close();

/**
 * attachSearch(inputEl, { anchor, showEmpty }) — inline results dropdown under any input (home, 404). Same engine as ⌘K.
 * showEmpty: focusing the empty field lists Recent + Popular tools.
 */
export function attachSearch(input, { anchor = input.closest('.fw-query') || input, showEmpty = false } = {}) {
  let pop = null, results = null;
  const open = () => {
    if (pop && !pop.closed) return;
    const room = innerHeight - anchor.getBoundingClientRect().bottom - 20;
    const list = h(`<div class="fw-cmd__list" style="max-height:${Math.max(220, Math.min(440, room))}px"></div>`);
    pop = openPopover(anchor, list, { focus: false, width: anchor.offsetWidth, className: 'fw-search-pop', label: 'Search results', onClose: () => { pop = null; input.setAttribute('aria-expanded', 'false'); } });
    input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', list.id = 'fw-search-list-' + ++uid);
    results = createResults(list, { input, onDone: () => pop?.close(false) });
  };
  const show = () => { if (!input.value.trim() && !showEmpty) { pop?.close(false); return; } open(); results.render(input.value); pop.reposition(); };
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  input.addEventListener('input', show);
  input.addEventListener('focus', () => { if (input.value.trim() || showEmpty) show(); });
  // Focus leaving both the field and its results closes the results (they never take focus themselves).
  input.addEventListener('blur', () => setTimeout(() => {
    const a = document.activeElement;
    if (pop && !pop.closed && a !== input && !pop.el.contains(a)) pop.close(false);
  }, 0));
  input.addEventListener('click', () => { if (!pop && (input.value.trim() || showEmpty)) show(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop && input.value) { e.preventDefault(); input.value = ''; return; }
    if (e.key === 'ArrowDown' && !pop) { open(); results.render(input.value); }
    if (pop) results.onKey(e);
  });
}

// ─────────────────────────────── catalog (home map, switcher) ───────────────────────────────
/** renderCatalog({ compact, current, max }) → HTML: every category with its sub-tools (single-tool categories list their SEO pages). */
export function renderCatalog({ compact = false, current, max = 15 } = {}) {
  return `<div class="fw-catalog ${compact ? 'fw-catalog--compact' : ''}">${CATEGORIES.map((c) => {
    const tools = toolsOf(c.id);
    const items = tools.length === 1 ? presetsOf(tools[0].id).map((p) => ({ l: p, label: p.name })) : tools.map((t) => ({ l: t, label: t.chip || t.name }));
    const lim = compact ? Math.min(max, 5) : max;
    const shown = items.length > lim ? items.slice(0, lim - 1) : items;
    const more = items.length - shown.length;
    const desc = !items.length && tools[0].desc ? `<p class="fw-catalog__desc">${esc(tools[0].desc)}</p>` : '';
    return `<section class="fw-catalog__cat" aria-labelledby="cat-${c.id}${compact ? '-c' : ''}">
      <a class="fw-catalog__head" id="cat-${c.id}${compact ? '-c' : ''}" href="${esc(catHref(c))}" data-cat="${c.id}"><span class="fw-catalog__icon">${icon(c.icon)}</span>${esc(c.label)}</a>
      ${desc}${shown.map(({ l, label }) => `<a class="fw-catalog__leaf" href="${esc(hrefFor(l))}" data-leaf="${l.id}" ${current === l.id ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
      ${more > 0 ? `<a class="fw-catalog__leaf fw-catalog__more" href="${esc(catHref(c))}">${more} more…</a>` : ''}
    </section>`;
  }).join('')}</div>`;
}

function openSwitcher(anchor) {
  if (isMobile()) { if (!anchor._fwSheet || anchor._fwSheet.closed) anchor._fwSheet = openSwitcherSheet(anchor); return; }
  const content = h(`<div>
    <div class="fw-switcher__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" type="text" placeholder="Find a tool…" aria-label="Find a tool" autocomplete="off"></div></div>
    <div class="fw-switcher__body">${renderCatalog({ current: chipOf(state.leaf)?.id })}</div>
    <div class="fw-switcher__results fw-cmd__list" hidden></div></div>`);
  const p = openPopover(anchor, content, { className: 'fw-switcher', label: 'All tools' });
  if (p.closed) return;
  // Picking a tool closes the switcher (same-page sub-tools only change the hash, so nothing reloads it away).
  content.addEventListener('click', (e) => { const a = e.target.closest('a[href]'); if (!a) return; p.close(false); if (isSamePageHashLink(a)) showToolFromTop(); });
  const input = content.querySelector('input'), body = content.querySelector('.fw-switcher__body'), list = content.querySelector('.fw-switcher__results');
  const results = createResults(list, { input, onDone: () => p.close(false) });
  input.addEventListener('input', () => { const q = input.value.trim(); body.hidden = !!q; list.hidden = !q; if (q) results.render(q); p.reposition(); });
  input.addEventListener('keydown', (e) => { if (!list.hidden) results.onKey(e); });
}
function openSwitcherSheet(trigger) {
  const curCat = state.cat?.id; const curTool = chipOf(state.leaf)?.id;
  const recent = getRecent().slice(0, 6);
  const body = h(`<div>
    <div class="fw-query fw-switcher-sheet__search">${icon('search', { size: 18 })}<input class="fw-query__input" type="text" placeholder="Search tools" aria-label="Search tools" autocomplete="off"></div>
    <div class="fw-ts-browse">
      ${recent.length ? `<div class="fw-tslist__group">Recent</div><div class="fw-recent-chips">${recent.map((r) => { const l = getLeaf(r.leaf); return `<a class="fw-chip" href="${esc(hrefFor(l))}" data-leaf="${l.id}">${icon(l.icon)}${esc(l.name)}</a>`; }).join('')}</div>` : ''}
      <div class="fw-tslist__group">All tools</div><div class="fw-tslist">${CATEGORIES.map((c) => { const tools = toolsOf(c.id);
        return tools.length === 1
          ? `<a class="fw-tslist__cat" href="${esc(catHref(c))}" data-leaf="${tools[0].id}" ${c.id === curCat ? 'aria-current="page"' : ''}><span class="fw-catalog__icon">${icon(c.icon)}</span>${esc(c.label)}</a>`
          : `<button class="fw-tslist__cat" type="button" aria-expanded="${c.id === curCat}" data-cat="${c.id}"><span class="fw-catalog__icon">${icon(c.icon)}</span>${esc(c.label)}${icon('chevron-right', { className: 'fw-tslist__chev' })}</button>
        <div class="fw-tslist__leaves">${tools.map((t) => `<a class="fw-tslist__leaf" href="${esc(hrefFor(t))}" data-leaf="${t.id}" ${curTool === t.id ? 'aria-current="page"' : ''}>${esc(t.chip || t.name)}</a>`).join('')}</div>`; }).join('')}</div>
    </div>
    <div class="fw-cmd__list fw-ts-results" hidden></div></div>`);
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const s = openSheet({ title: 'All tools', body, height: 'full', className: 'fw-switcher-sheet', onClose: () => trigger?.setAttribute('aria-expanded', 'false') });
  body.querySelectorAll('button.fw-tslist__cat').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'))));
  // Same-page sub-tool links only change the hash: close the sheet so the tool is visible.
  body.addEventListener('click', (e) => { const a = e.target.closest('a[href]'); if (!a) return; s.close(); if (isSamePageHashLink(a)) showToolFromTop(); });
  const input = body.querySelector('input'), browse = body.querySelector('.fw-ts-browse'), list = body.querySelector('.fw-ts-results');
  const results = createResults(list, { input, onDone: () => s.close() });
  input.addEventListener('input', () => { const q = input.value.trim(); browse.hidden = !!q; list.hidden = !q; if (q) results.render(q); });
  input.addEventListener('keydown', results.onKey);
  return s;
}

// ─────────────────────────────── shortcuts sheet ───────────────────────────────
const extraShortcuts = [];
/** Add rows to the "?" sheet: registerShortcuts([{ label, keys: 'mod+shift+e' }]). */
export function registerShortcuts(list = []) { extraShortcuts.push(...list); }
export function openShortcuts() {
  const rows = [['Search tools', 'mod+k'], ['Search tools (when not typing)', '/'], ['Keyboard shortcuts', '?'], ['Go home', 'g h'], ['Close the top layer', 'esc'],
    ...[...(state.opts.shortcuts || []), ...extraShortcuts].map((s) => [s.label, s.keys])];
  const list = (r) => `<div class="fw-shortcuts">${r.map(([l, k]) => `<div class="fw-shortcuts__row"><span>${esc(l)}</span><span class="fw-shortcuts__keys">${kbd(k)}</span></div>`).join('')}</div>`;
  return openDialog({ title: 'Keyboard shortcuts', size: 640, body: list(rows) });
}

// ─────────────────────────────── file chooser (home drop area) ───────────────────────────────
// Tool pages keep their own dropzones (today's behaviour). Only pages that pass `dropChooser: true` (home) get the
// full-window veil: a drop there opens a chooser of real tools, and the file is handed over to that tool's input.
const drag = { el: null, shown: false, timer: 0, sticky: false, actions: [], popLayer: null, files: null };
function dtFiles(dt) { return dt && [...(dt.types || [])].includes('Files'); }
function ensureVeil() {
  if (drag.el) return drag.el;
  drag.el = h('<div class="fw-veil fw-ui" role="presentation"></div>');
  document.body.append(drag.el); toTop(drag.el);
  drag.el.addEventListener('click', (e) => {
    const b = e.target.closest('.fw-veil__action'); if (b) { runVeilAction(b.dataset.action, drag.files); return; }
    if (drag.sticky && !e.target.closest('.fw-veil__panel')) hideVeil();
  });
  return drag.el;
}
function actionHtml(a, i) {
  return `<button class="fw-veil__action ${i === 0 ? 'is-default' : ''}" type="button" data-action="${esc(a.id)}" data-leaf="${esc(a.leaf)}">
    <span class="fw-veil__action-icon">${icon(a.icon || 'arrow-right', { size: 18 })}</span>
    <span class="fw-veil__action-text"><span class="fw-veil__action-name">${esc(a.label)}</span><span class="fw-veil__action-sub">${esc(a.sub || '')}</span></span>
    ${kbd('enter')}</button>`;
}
function renderVeil(files) {
  const el = ensureVeil();
  if (!files) {
    el.innerHTML = `<div class="fw-veil__direct"><div class="fw-veil__direct-icon">${icon('upload', { size: 28 })}</div>
      <div><div class="fw-veil__title">Drop to choose a tool</div></div></div>`;
    return;
  }
  const sum = summarize(files);
  drag.actions = actionsFor(files);
  const sub = [sum.names.length > 1 ? sum.names.slice(0, 2).join(', ') + (sum.n > 2 ? ` +${sum.n - 2}` : '') : '', formatBytes(sum.size)].filter(Boolean).join(' · ');
  el.innerHTML = `<div class="fw-veil__panel" role="dialog" aria-label="Choose a tool for ${esc(sum.label)}">
    <div class="fw-veil__head"><div class="fw-veil__files"><span>${icon(sum.icon || 'file', { size: 20 })}</span>${sum.n > 1 ? '<span></span>' : ''}${sum.n > 2 ? '<span></span>' : ''}</div>
      <div style="min-width:0"><div class="fw-veil__title fw-ellipsis">${esc(sum.kind === 'unknown' ? `Fernwork can’t open .${sum.ext || '?'} files` : sum.label)}</div><div class="fw-veil__sub fw-ellipsis">${esc(sub)}</div></div>
      <button class="fw-iconbtn fw-iconbtn--sm fw-veil__close" type="button" aria-label="Close">${icon('x')}</button></div>
    <div class="fw-veil__list" role="list">${drag.actions.map(actionHtml).join('')}</div></div>`;
  el.querySelector('.fw-veil__close').onclick = () => hideVeil();
}
function hideVeil({ restoreFocus = true } = {}) {
  clearTimeout(drag.timer);
  if (!drag.el) return;
  const el = drag.el; drag.el = null; drag.shown = false; drag.sticky = false;
  drag.popLayer?.(); drag.popLayer = null;
  const back = drag.returnFocus; drag.returnFocus = null;
  if (restoreFocus && back?.isConnected) back.focus({ preventScroll: true });
  document.documentElement.classList.remove('fw-dragging');
  el.classList.add('is-leaving'); setTimeout(() => el.remove(), reducedMotion() ? 0 : 180);
}
/** Show the tool chooser for files (home drop area, picker). `returnFocus`: element focused again when it closes. */
export function openChooser(files, { returnFocus } = {}) {
  const prev = document.activeElement;
  hideVeil({ restoreFocus: false });
  drag.returnFocus = returnFocus || (prev && prev !== document.body && prev !== document.documentElement && !prev.closest?.('.fw-veil') ? prev : null);
  drag.files = files; renderVeil(files);
  drag.el.classList.add('is-chooser');   // files are in hand: no dashed "drop here" frame (it read as a drop zone on phones)
  drag.shown = true; drag.sticky = true;
  drag.popLayer = pushLayer(() => hideVeil(), drag.el);
  const btns = $$('.fw-veil__action', drag.el); btns[0]?.focus();
  drag.el.addEventListener('keydown', (e) => {
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus(); }
    else if (e.key === 'Tab') { const f = focusables(drag.el); if (f.length && (e.shiftKey ? document.activeElement === f[0] : document.activeElement === f.at(-1))) { e.preventDefault(); (e.shiftKey ? f.at(-1) : f[0]).focus(); } }
  });
}
function runVeilAction(id, files) {
  const a = drag.actions.find((x) => x.id === id); hideVeil({ restoreFocus: !a }); if (!a) return;
  navigate(a.leaf, { files, action: id });
}
function initDropChooser() {
  const over = (e) => {
    if (!dtFiles(e.dataTransfer)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    if (!drag.shown) { renderVeil(null); drag.shown = true; document.documentElement.classList.add('fw-dragging'); }
    clearTimeout(drag.timer); drag.timer = setTimeout(hideVeil, 500);
  };
  window.addEventListener('dragenter', over);
  window.addEventListener('dragover', over);
  window.addEventListener('drop', (e) => {
    if (!dtFiles(e.dataTransfer)) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files]; hideVeil();
    if (files.length) setTimeout(() => openChooser(files), reducedMotion() ? 0 : 60);
  });
  document.addEventListener('paste', (e) => {
    if (isTyping(e.target) || hasLayers()) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); openChooser(files); }
  });
}

/**
 * Feed files handed over from another page (home chooser) into this page's tool: the visible file input of the active
 * tab gets them as if the user had picked them (same path as assets/file-paste.js). Waits up to 10 s for lazily
 * rendered tools.
 */
async function deliverHandoff() {
  const hd = await consumeHandoff(); if (!hd?.files?.length) return;
  const files = hd.files;
  // File inputs are normally hidden themselves (a "Load file" button opens them); only their container must be live.
  const visible = (el) => el.isConnected && !el.disabled && !el.parentElement?.closest('[hidden], .hidden') && !(el.closest('.tab-content') && !el.closest('.tab-content').classList.contains('active'));
  const matches = (input) => { const acc = (input.accept || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); if (!acc.length) return files; return files.filter((f) => acc.some((r) => r.startsWith('.') ? f.name.toLowerCase().endsWith(r) : r.endsWith('/*') ? (f.type || '').toLowerCase().startsWith(r.slice(0, -1)) : (f.type || '').toLowerCase() === r)); };
  const find = () => $$('main input[type="file"]').filter(visible).map((input) => ({ input, ok: matches(input) })).find((x) => x.ok.length);
  // G3: a labelled wait state while the tool loads (only shown when it takes longer than 150 ms).
  const name = files.length > 1 ? `${files.length} files` : files[0].name;
  let waiting = null;
  const waitTimer = setTimeout(() => { waiting = toast(`Opening ${name}…`, { type: 'info', duration: 0 }); }, 150);
  const stopWaiting = () => { clearTimeout(waitTimer); waiting?.close(); };
  try { await window.__ooServiceWorkerReady; } catch { /* no SW */ }
  const t0 = Date.now();
  let candidate = null;
  while (Date.now() - t0 < 10000) {
    const hit = find();
    // Tools render lazily and may replace their first input: deliver only to an input that stayed in place.
    if (hit && (hit.input !== candidate || document.readyState !== 'complete')) { candidate = hit.input; await new Promise((r) => setTimeout(r, 400)); continue; }
    if (hit) {
      const dt = new DataTransfer();
      (hit.input.multiple ? hit.ok : hit.ok.slice(0, 1)).forEach((f) => dt.items.add(f));
      hit.input.files = dt.files;
      stopWaiting();
      hit.input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  stopWaiting();
  toast(`Couldn’t hand ${files.length > 1 ? 'the files' : files[0].name} to this tool. Drop ${files.length > 1 ? 'them' : 'it'} here again.`, { type: 'warning' });
}

// ─────────────────────────────── FileIntake ───────────────────────────────
/** mountIntake(el, { onFiles, accept, multiple }) — a focusable file picker / drop area. `.fw-intake[data-intake]` is auto-wired. */
export function mountIntake(el, { onFiles = state.opts.onFiles, accept = el.dataset.accept || '', multiple = el.dataset.multiple !== 'false' } = {}) {
  if (el._intake) return; el._intake = true;
  if (!/^(BUTTON|LABEL|A)$/.test(el.tagName)) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
  const inp = h(`<input type="file" hidden ${multiple ? 'multiple' : ''}>`);
  if (accept) inp.accept = accept;
  el.append(inp);
  const pick = () => inp.click();
  el.addEventListener('click', (e) => { if (e.target.closest('a,[data-no-pick]') || e.target === inp) return; if (e.target.closest('button') && !e.target.closest('[data-pick]')) return; pick(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); pick(); } });
  inp.addEventListener('change', () => { const f = [...inp.files]; inp.value = ''; if (f.length) (onFiles || openChooser)(f, { source: 'picker', returnFocus: el }); });
  let depth = 0;
  el.addEventListener('dragenter', () => { depth++; el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('is-over'); } });
  el.addEventListener('drop', () => { depth = 0; el.classList.remove('is-over'); });
}

// ─────────────────────────────── enhance ───────────────────────────────
/** Wire kit behaviours inside root: icons, segmented controls, roving rows, copy buttons, sliders, intakes. */
export function enhance(root = document) {
  hydrateIcons(root);
  $$('.fw-seg', root).forEach((seg) => {
    if (seg._fw) return; seg._fw = true;
    if (!seg.getAttribute('role')) seg.setAttribute('role', 'radiogroup');
    const opts = $$('.fw-seg__opt', seg);
    opts.forEach((o) => { o.setAttribute('role', 'radio'); if (!o.hasAttribute('aria-checked')) o.setAttribute('aria-checked', 'false'); });
    const choose = (o) => { opts.forEach((x) => x.setAttribute('aria-checked', String(x === o))); seg.dispatchEvent(new CustomEvent('fw-change', { detail: { value: o.dataset.value ?? o.textContent.trim() }, bubbles: true })); };
    seg.addEventListener('click', (e) => { const o = e.target.closest('.fw-seg__opt'); if (o) choose(o); });
    roving(seg, '.fw-seg__opt', { onMove: choose });
  });
  $$('[data-roving]', root).forEach((c) => roving(c, c.dataset.roving || 'a,button', { orientation: c.dataset.orientation || 'horizontal' }));
  $$('[data-copy],[data-copy-target]', root).forEach((b) => {
    if (b._fwCopy) return; b._fwCopy = true;
    b.addEventListener('click', () => {
      const t = b.dataset.copyTarget ? $(b.dataset.copyTarget) : null;
      const text = b.dataset.copy || (t ? (t.value ?? t.textContent) : '');
      copyText(String(text).trim(), b);
    });
  });
  $$('.fw-slider input[type="range"]', root).forEach((r) => {
    if (r._fw) return; r._fw = true;
    const out = r.closest('.fw-slider').querySelector('.fw-slider__value');
    const upd = () => { const p = ((r.value - (r.min || 0)) / ((r.max || 100) - (r.min || 0))) * 100; r.style.setProperty('--p', p + '%'); if (out) out.textContent = `${r.value}${r.dataset.unit || ''}`; };
    r.addEventListener('input', upd); upd();
  });
  $$('.fw-intake[data-intake]', root).forEach((el) => mountIntake(el));
}

// ─────────────────────────────── page header ───────────────────────────────
/**
 * renderPageHeader(target, { leaf, title, lede, chips = true }) — the visible title of the current sub-tool, one line,
 * and the sub-tool chips (links that switch today's #hash tabs). Re-render on hash changes via setCurrentLeaf().
 * The title is a styled <p role="heading" aria-level="2">: each page keeps its static SEO <h1>.
 */
export function renderPageHeader(target, { leaf: l = state.leaf, title, lede, chips = true, compact = state.opts.compactHeader } = {}) {
  if (!target) return;
  const tools = l?.cat ? toolsOf(l.cat) : []; const cur = l ? chipOf(l) : null; const c = l?.cat ? getCat(l.cat) : null;
  target.classList.add('fw-page-header-host');
  target.innerHTML = `<div class="fw-page-header ${compact ? 'fw-page-header--compact' : ''}">
    <div class="fw-page-header__top"><div class="fw-page-header__titles"><p class="fw-h1" role="heading" aria-level="2" id="fw-page-title"></p>
      <p class="fw-lede"></p></div></div>
    ${chips && tools.length > 1 ? `<nav class="fw-subchips" aria-label="${esc(c.label)} tools" data-roving="a">${tools.map((t) => `<a class="fw-chip" href="${esc(hrefFor(t))}" data-leaf="${t.id}" ${cur?.id === t.id ? 'aria-current="page"' : ''}>${esc(t.chip)}</a>`).join('')}</nav>` : ''}
  </div>`;
  target.querySelector('.fw-h1').textContent = title || cur?.name || l?.name || '';
  const ledeEl = target.querySelector('.fw-lede'); const text = compact ? '' : lede ?? cur?.desc ?? '';
  if (text) ledeEl.textContent = text; else ledeEl.remove();
  enhance(target);
  revealActiveChip(target.querySelector('.fw-subchips'));
}
/** Scroll a chips row so its current chip is fully visible (centred when it has to move). */
function revealActiveChip(row) {
  const active = row?.querySelector('.fw-chip[aria-current]');
  if (!active || !row.clientWidth) return;
  const pad = parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0;
  const left = active.offsetLeft - row.scrollLeft; const right = left + active.offsetWidth;
  if (left >= pad && right <= row.clientWidth - pad) return;
  row.scrollLeft = Math.max(0, active.offsetLeft - row.clientWidth / 2 + active.offsetWidth / 2);
}

// ─────────────────────────────── app bar / rail ───────────────────────────────
function appBarHtml() {
  const c = state.cat;
  return `<header class="fw-appbar fw-ui">
    <div class="fw-appbar__start">
      <a class="fw-brand" href="${esc(homeHref())}" aria-label="Fernwork home"><span class="fw-brand__mark"><img src="${esc(new URL('assets/icons/favicon.svg', ROOT_URL).href)}" alt="" width="24" height="24" decoding="async"></span><span class="fw-brand__word">Fernwork</span></a>
      <span class="fw-crumb-sep" aria-hidden="true">/</span>
      <button class="fw-switcher-btn" type="button" id="fw-switcher" aria-haspopup="dialog" aria-expanded="false" aria-label="Switch tool" data-tip="All tools">
        <span class="fw-ellipsis fw-switcher-btn__label">${esc(c ? c.label : 'All tools')}</span>${icon('chevron-down', { size: 14 })}</button>
    </div>
    <div class="fw-appbar__center">
      <button class="fw-cmdpill" type="button" id="fw-cmdpill" aria-haspopup="dialog" aria-expanded="false" aria-label="Search tools (${MOD}K)">${icon('search')}<span class="fw-cmdpill__text">Search tools…</span>${kbd('mod+k')}</button>
    </div>
    <div class="fw-appbar__end">
      <button class="fw-iconbtn fw-hide-mobile" type="button" id="fw-recent" aria-label="Recent" data-tip="Recent" aria-haspopup="dialog" aria-expanded="false">${icon('history', { size: 18 })}</button>
      <button class="fw-iconbtn fw-hide-mobile" type="button" id="fw-theme-toggle" data-fw-theme-toggle></button>
      <button class="fw-iconbtn fw-show-mobile" type="button" id="fw-search-mobile" aria-label="Search tools" aria-haspopup="dialog" aria-expanded="false">${icon('search', { size: 20 })}</button>
      <button class="fw-iconbtn" type="button" id="fw-more" aria-label="Settings and more" data-tip="More" aria-haspopup="menu" aria-expanded="false">${icon('ellipsis', { size: 20 })}</button>
    </div></header>`;
}
function railHtml() {
  return `<nav class="fw-rail fw-ui" aria-label="Tools"><div class="fw-rail__group">
    ${CATEGORIES.map((c) => {
      const tools = toolsOf(c.id); const multi = tools.length > 1;
      return `<a class="fw-rail__item" href="${esc(catHref(c))}" data-cat="${c.id}" ${multi ? 'aria-haspopup="true" aria-expanded="false"' : `data-tip="${esc(c.label)}" data-tip-place="right"`}>
        ${icon(c.icon, { size: 20 })}<span class="fw-rail__name">${esc(c.label)}</span></a>
        ${multi ? `<div class="fw-rail__leaves">${tools.map((t) => `<a class="fw-rail__leaf" href="${esc(hrefFor(t))}" data-leaf="${t.id}">${esc(t.chip || t.name)}</a>`).join('')}</div>` : ''}`;
    }).join('')}</div>
    <div class="fw-rail__foot"><button class="fw-rail__item" type="button" id="fw-rail-pin" data-tip-place="right"></button></div></nav>`;
}
/** Mark the current category / sub-tool everywhere (rail, flyout, chips, switcher label). */
function syncCurrent() {
  const cat = state.cat?.id; const tool = chipOf(state.leaf)?.id;
  $$('.fw-rail__item[data-cat]').forEach((a) => {
    const on = a.dataset.cat === cat;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
  $$('.fw-rail__leaf, .fw-rail-flyout__leaf, .fw-subchips .fw-chip').forEach((a) => {
    if (a.dataset.leaf === tool) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $$('.fw-subchips').forEach((row) => { row._rovingSync?.(); revealActiveChip(row); });
  const label = $('.fw-switcher-btn__label'); if (label) label.textContent = state.cat ? state.cat.label : 'All tools';
}
let fly = null;
function closeFlyout(returnFocus = false) {
  if (!fly) return; clearTimeout(fly.t); fly.item.setAttribute('aria-expanded', 'false'); fly.pop();
  const { el, item } = fly; fly = null; el.remove();
  if (returnFocus) item.focus({ preventScroll: true });
}
const railPinned = () => document.body.classList.contains('is-rail-pinned') && !isMobile();
function openFlyout(item, focusFirst = false) {
  if (railPinned()) return;
  if (fly?.item === item) { clearTimeout(fly.t); if (focusFirst) $$('a', fly.el)[0]?.focus(); return; }
  closeFlyout();
  const c = getCat(item.dataset.cat); const curTool = chipOf(state.leaf)?.id;
  const el = h(`<div class="fw-popover fw-ui fw-rail-flyout" role="group" aria-label="${esc(c.label)}"><div class="fw-rail-flyout__title">${esc(c.label)}</div>
    ${toolsOf(c.id).map((t) => `<a class="fw-rail-flyout__leaf" href="${esc(hrefFor(t))}" data-leaf="${t.id}" ${curTool === t.id ? 'aria-current="page"' : ''}>${esc(t.chip || t.name)}</a>`).join('')}</div>`);
  document.body.append(el); toTop(el);
  const r = item.getBoundingClientRect();
  el.style.left = (r.right + 8) + 'px'; el.style.top = Math.max(8, Math.min(r.top - 6, innerHeight - el.offsetHeight - 8)) + 'px';
  item.setAttribute('aria-expanded', 'true');
  const pop = pushLayer(() => closeFlyout(true), el);
  fly = { el, item, pop, t: 0 };
  const later = () => { if (!fly) return; clearTimeout(fly.t); fly.t = setTimeout(() => { if (fly && !fly.el.contains(document.activeElement)) closeFlyout(); }, 220); };
  el.addEventListener('pointerenter', () => clearTimeout(fly?.t));
  el.addEventListener('pointerleave', later);
  item.addEventListener('pointerleave', later, { once: true });
  el.addEventListener('click', (e) => { if (e.target.closest('a')) closeFlyout(); });
  const links = $$('a', el);
  el.addEventListener('keydown', (e) => {
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); closeFlyout(true); }
    else if (e.key === 'Tab') closeFlyout();
  });
  if (focusFirst) (links.find((a) => a.getAttribute('aria-current')) || links[0]).focus();
}
function initRail() {
  $$('.fw-rail__item[aria-haspopup]').forEach((item) => {
    let t = 0;
    item.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; t = setTimeout(() => openFlyout(item), 120); });
    item.addEventListener('pointerleave', () => clearTimeout(t));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); openFlyout(item, true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { // arrows move between rail items
        const all = $$('.fw-rail__group > .fw-rail__item'); const i = all.indexOf(item);
        const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) { e.preventDefault(); closeFlyout(); n.focus(); }
      }
    });
  });
  document.addEventListener('pointerdown', (e) => { if (fly && !fly.el.contains(e.target) && !fly.item.contains(e.target)) closeFlyout(); }, true);
  $('.fw-rail')?.addEventListener('click', (e) => { // same-page leaf: hash change only
    const a = e.target.closest('a[data-leaf]'); if (a) closeFlyout();
  });
}
function syncPin() {
  const pinned = document.body.classList.contains('is-rail-pinned');
  const b = $('#fw-rail-pin'); if (!b) return;
  const label = pinned ? 'Collapse sidebar' : 'Pin sidebar open';
  b.innerHTML = `${icon(pinned ? 'panel-left-close' : 'panel-left-open', { size: 20 })}<span class="fw-rail__name">${label}</span>`;
  b.dataset.tip = label; b.setAttribute('aria-pressed', String(pinned));
  document.body.style.setProperty('--fw-rail-current', pinned ? 'var(--rail-w-open)' : 'var(--rail-w)');
}
function openRecentPopover(anchor) {
  if (isOpenFor(anchor)) { anchor._fwPop.close(true); return; }
  const r = getRecent();
  const content = h(`<div class="fw-recent-pop">
    <div class="fw-recent-pop__head"><span class="fw-menu__label">Recent</span>${r.length ? '<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-clear>Clear</button>' : ''}</div>
    <div class="fw-recent">${r.length ? r.slice(0, 8).map((x) => { const l = getLeaf(x.leaf); return `<a class="fw-recent__item" href="${esc(hrefFor(l))}" data-leaf="${l.id}"><span class="fw-recent__icon">${icon(l.icon)}</span><span class="fw-recent__main"><span class="fw-recent__title">${esc(l.name)}</span><span class="fw-recent__sub">${esc(leafMeta(l))}</span></span><span class="fw-recent__when">${shortAgo(x.t)}</span></a>`; }).join('') : '<div class="fw-empty fw-recent-pop__empty"><div class="fw-empty__text">Tools you use show up here.</div></div>'}</div></div>`);
  const p = openPopover(anchor, content, { placement: 'bottom-end', label: 'Recent' });
  content.querySelector('[data-clear]')?.addEventListener('click', () => { const undo = clearRecent(); p.close(); toast('Recent cleared', { type: 'neutral', action: { label: 'Undo', onClick: undo } }); });
  content.addEventListener('click', (e) => { if (e.target.closest('a[href]')) p.close(false); });
}

// ⋯ menu providers: page code (or nav.js) can add entries, e.g. the PDF workspace actions.
const moreProviders = [];
/** addMoreItems(() => [{ group, items: [...] }]) — evaluated each time the ⋯ menu opens. */
export function addMoreItems(fn) { moreProviders.push(fn); }
let installApi = null;
/** nav.js passes the install-prompt module ({ available(), trigger() }) so "Install as app" appears only when possible. */
export function setInstallApi(api) { installApi = api; }
function openMoreMenu(anchor) {
  if (isOpenFor(anchor)) { anchor._fwPop.close(true); return; }
  const pref = getThemePref(); const mobile = isMobile();
  const groups = [
    { group: 'Theme', items: [
      { label: 'System default', icon: 'monitor', checked: pref === 'system', onSelect: () => setTheme('system') },
      { label: 'Light', icon: 'sun', checked: pref === 'light', onSelect: () => setTheme('light') },
      { label: 'Dark', icon: 'moon', checked: pref === 'dark', onSelect: () => setTheme('dark') }] },
    { group: '', items: [
      ...(mobile ? [{ label: 'Recent and all tools', icon: 'history', onSelect: () => openSwitcherSheet($('#fw-switcher')) }] : []),
      ...(!isCoarse() ? [{ label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', onSelect: () => openShortcuts() }] : []),
      ...(installApi?.available() ? [{ label: 'Install as app', icon: 'download', id: 'oo-install-btn', onSelect: () => installApi.trigger() }] : []),
    ] },
    ...moreProviders.flatMap((fn) => { try { return fn() || []; } catch { return []; } }),
    { group: 'Digitize documents', items: [{ label: 'Try Paper2Form', icon: 'scan-text', href: 'https://paper2form.com/', external: true }] },
    { group: 'Legal', items: [
      { label: 'Imprint', icon: 'file', href: legalHref('imprint') },
      { label: 'Privacy policy', icon: 'shield', href: legalHref('privacy') },
      { label: 'Terms of service', icon: 'file-text', href: legalHref('tos') }] },
  ];
  openMenu(anchor, groups, { placement: 'bottom-end', label: 'Settings and more' });
}

// ─────────────────────────────── mount ───────────────────────────────
let mounted = false;
const WORKBENCH_CATS = new Set(['pdf', 'image-tools', 'canvas', 'viewers']);
/**
 * mountShell(opts) — once per page (assets/nav.js does it for every page).
 *   leaf         leaf id (registry) or leaf object; default: derived from the URL
 *   archetype    'home' | 'doc' | 'tool' (default) — home/doc: no rail
 *   pageHeader   selector/element to render the page header (title + sub-tool chips) into
 *   compactHeader  one-row header without the line under the title (workbench-like pages: Viewers, Calculator, Canvas)
 *   railOpen     override the default (open ≥ 1280 px unless collapsed; PDF/Image Tools/Canvas stay collapsed)
 *   dropChooser  true on home: the page-wide drop veil + tool chooser
 *   footer       true → legal links footer at the end of <main> (home)
 *   searchInput  selector that '/' focuses instead of opening the command bar
 *   commands     page commands for ⌘K;  shortcuts: [{ label, keys }] for the '?' sheet
 */
export function mountShell(opts = {}) {
  if (mounted) return api(); mounted = true;
  state.opts = opts;
  state.leaf = typeof opts.leaf === 'string' ? getLeaf(opts.leaf) : opts.leaf || null;
  state.cat = getCat(opts.category || state.leaf?.cat) || null;
  state.arch = opts.archetype || 'tool';
  const root = document.documentElement; root.classList.add('fw-arch-' + state.arch);
  const body = document.body;
  body.classList.add('fw-shell');
  if (state.cat) body.dataset.fwCat = state.cat.id;
  // Workbench categories (Viewers, Canvas, PDF/Image Tools): on phones the ToolSwitcher carries the sub-tools.
  body.classList.toggle('fw-workbench-cat', !!(state.cat && WORKBENCH_CATS.has(state.cat.id)));
  setCommands(opts.commands);
  const noRail = opts.rail === false || state.arch === 'home' || state.arch === 'doc';
  const workbench = state.cat && WORKBENCH_CATS.has(state.cat.id) && state.cat.id !== 'viewers';
  const pinPref = store.get('rail-pinned');
  const railOpen = opts.railOpen ?? (workbench ? false : pinPref == null ? matchMedia('(min-width: 1280px)').matches : pinPref === true);
  if (railOpen) body.classList.add('is-rail-pinned');
  if (noRail) body.classList.add('no-rail');

  let main = $('main'); if (!main) { main = document.createElement('main'); body.append(main); }
  if (!main.id) main.id = 'main';
  main.tabIndex = -1; main.classList.add('fw-main');
  let wrap = main.closest('.app-container');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'app-container'; main.before(wrap); wrap.append(main); }
  wrap.classList.add('fw-body');
  if (opts.footer) main.insertAdjacentHTML('beforeend', `<footer class="fw-footer fw-ui"><nav class="fw-footer__links" aria-label="Legal">
    <a href="${esc(legalHref('imprint'))}">Imprint</a><a href="${esc(legalHref('privacy'))}">Privacy</a><a href="${esc(legalHref('tos'))}">Terms</a></nav></footer>`);
  const skip = h(`<a class="fw-skip" href="#${esc(main.id)}">${state.arch === 'home' ? 'Skip to search' : 'Skip to tool'}</a>`);
  // Focus the tool without writing #main: the hash belongs to the page's sub-tool tabs.
  skip.addEventListener('click', (e) => {
    e.preventDefault();
    const target = (state.arch === 'home' && opts.searchInput && $(opts.searchInput)) || main;
    target.focus({ preventScroll: false });
  });
  wrap.before(skip);
  wrap.before(h(appBarHtml()));
  if (!noRail) wrap.prepend(h(railHtml()));
  syncPin(); syncThemeButtons(); syncCurrent();
  if (!noRail) initRail();

  $('#fw-cmdpill').onclick = () => (cmd ? cmd.close() : openCommandBar());
  $('#fw-search-mobile').onclick = () => (cmd ? cmd.close() : openCommandBar());
  $('#fw-switcher').onclick = (e) => openSwitcher(e.currentTarget);
  $('#fw-recent').onclick = (e) => openRecentPopover(e.currentTarget);
  $('#fw-more').onclick = (e) => openMoreMenu(e.currentTarget);
  $('#fw-theme-toggle').onclick = toggleTheme;
  $('#fw-rail-pin')?.addEventListener('click', () => { closeFlyout(); body.classList.toggle('is-rail-pinned'); store.set('rail-pinned', body.classList.contains('is-rail-pinned')); syncPin(); window.dispatchEvent(new Event('resize')); });
  document.addEventListener('oo-theme-change', syncThemeButtons);

  if (opts.pageHeader) { const t = typeof opts.pageHeader === 'string' ? $(opts.pageHeader) : opts.pageHeader; if (t) { state.headerEl = t; renderPageHeader(t); } }
  enhance(body.querySelector('.fw-appbar'));
  initTooltips(); initKeys();
  if (opts.dropChooser) initDropChooser();
  if (state.leaf && state.arch !== 'home') addRecent({ leaf: state.leaf.id });
  if (opts.handoff !== false) deliverHandoff();
  return api();
}
/** Called on #hash sub-tool changes (setupTabs): updates rail, chips, page header, switcher label and Recent. */
export function setCurrentLeaf(idOrLeaf, { recent = true } = {}) {
  const l = typeof idOrLeaf === 'string' ? getLeaf(idOrLeaf) : idOrLeaf;
  if (!l) return;
  state.leaf = l; state.cat = getCat(l.cat) || state.cat;
  syncCurrent();
  if (state.headerEl) {
    const t = state.headerEl.querySelector('#fw-page-title');
    if (t) {
      t.textContent = chipOf(l).name;
      const lede = state.headerEl.querySelector('.fw-lede');
      if (lede) lede.textContent = chipOf(l).desc || '';
    } else renderPageHeader(state.headerEl);
  }
  if (recent && mounted) addRecent({ leaf: l.id });
}
export const currentLeaf = () => state.leaf;
function api() {
  return { leaf: state.leaf, category: state.cat, archetype: state.arch, toast, openCommandBar, openDialog, openSheet, openPopover, openMenu, setTheme, navigate, hrefFor, openChooser, enhance, setCommands, setCurrentLeaf };
}
let gAt = 0;
function initKeys() {
  // Window bubble phase: runs after every tool's own document/element handlers, so a tool that handles a key
  // (preventDefault) wins — e.g. Excalidraw's Ctrl+K link and "?" help.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k.toLowerCase() === 'k') { e.preventDefault(); if (cmd) cmd.close(); else openCommandBar(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(document.activeElement) || hasLayers()) return;
    // Single-key shortcuts only where no tool owns the keyboard: focus on the page itself or on shell chrome.
    const a = document.activeElement;
    const free = !a || a === document.body || a === document.documentElement || a.closest?.('.fw-appbar, .fw-rail') || (a.id === 'main' && !WORKBENCH_CATS.has(state.cat?.id));
    if (!free || (WORKBENCH_CATS.has(state.cat?.id) && !a?.closest?.('.fw-appbar, .fw-rail'))) return;
    if (k === '/') { e.preventDefault(); const s = state.opts.searchInput && $(state.opts.searchInput); if (s) { s.focus(); s.select?.(); } else openCommandBar(); }
    else if (k === '?') { e.preventDefault(); openShortcuts(); }
    else if (k === 'g') gAt = Date.now();
    else if (k === 'h' && Date.now() - gAt < 900) location.href = homeHref();
  });
}
