// Fernwork One · shell (ES module). See README.md → "Kit API".
//   import { mountShell, toast, openDialog, … } from '../kit/shell.js';
//   mountShell({ category: 'convert', leaf: 'heic-to-jpg', archetype: 'queue', accept: ['image'], onFiles(files) { … } });
import { icon, hydrateIcons } from './icons.js';
import { GROUPS, CATEGORIES, LEAVES, ACTIONS, ALIASES, canonicalId, leaf as getLeaf, category as getCat, toolsOf, presetsOf, chipOf, POPULAR } from './registry.js';
import { fileKind, summarize, actionsFor, handoff, consumeHandoff, formatBytes, extOf, mimeFor, KIND_LABEL } from './files.js';
// Revision 1: the command bar is a pure tool search. Inline answers and paste detectors (eval.js) are no longer part of
// the shell; pages that need math/units/colour helpers import '../kit/eval.js' directly.

export { icon, hydrateIcons, GROUPS, CATEGORIES, LEAVES, ACTIONS, ALIASES, canonicalId, getLeaf, getCat, toolsOf, presetsOf, chipOf, POPULAR,
  fileKind, summarize, actionsFor, handoff, consumeHandoff, formatBytes, extOf, mimeFor };

// ─────────────────────────────── utilities ───────────────────────────────
const KIT_URL = new URL('./', import.meta.url);
const ROOT_URL = new URL('../', import.meta.url);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Parse one HTML element from a string. */
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────── storage (fw:*) ───────────────────────────────
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('fw:' + k); if (v == null) return d; try { return JSON.parse(v); } catch { return v; } } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fw:' + k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* blocked */ } },
  del(k) { try { localStorage.removeItem('fw:' + k); } catch { /* blocked */ } },
};

// ─────────────────────────────── recent ───────────────────────────────
const H = 3600e3;
const DEMO_RECENT = [
  { leaf: 'edit-pdf', file: 'lease-agreement-2026.pdf', ago: 2 * H },
  { leaf: 'json-formatter', file: 'package.json', ago: 5 * H },
  { leaf: 'lbs-to-kg', note: '165 lbs', ago: 26 * H },
  { leaf: 'wifi-qr', note: 'Wi-Fi “Guest”', ago: 3 * 24 * H },
  { leaf: 'compress-image', file: '12 photos', ago: 6 * 24 * H },
];
/** Recent tools/files, newest first: [{ leaf, file?, note?, t }]. Seeded with demo data in mockups. */
export function getRecent() {
  let r = store.get('recent');
  if (!Array.isArray(r)) r = DEMO_RECENT.map(({ ago, ...x }) => ({ ...x, t: Date.now() - ago }));
  // resolve round-1 ids (ALIASES) to today's leaves, drop unknown ones and duplicates
  const seen = new Set();
  return r.map((x) => ({ ...x, leaf: canonicalId(x.leaf) })).filter((x) => x.leaf && !seen.has(x.leaf) && seen.add(x.leaf));
}
export function addRecent(entry) {
  if (!entry || !getLeaf(entry.leaf)) return;
  entry = { ...entry, leaf: canonicalId(entry.leaf) };
  const r = getRecent().filter((x) => x.leaf !== entry.leaf);
  r.unshift({ ...entry, t: Date.now() });
  store.set('recent', r.slice(0, 12));
}
export function clearRecent() { const old = getRecent(); store.set('recent', []); return () => store.set('recent', old); }
export function shortAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.round(s / 60)} min`; if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d`; return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────── layers: Escape stack + focus trap ───────────────────────────────
const layers = [];
/** Register a layer that Escape should close (top-most first). Returns an unregister function. */
export function pushLayer(close, el = null) { const L = { close, el }; layers.push(L); return () => { const i = layers.indexOf(L); if (i >= 0) layers.splice(i, 1); }; }
export const hasLayers = () => layers.length > 0;
// One capture-phase Escape handler closes the top-most layer (native <dialog>s handle their own cancel event).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || !layers.length) return;
  const top = layers[layers.length - 1];
  if (top.el && top.el.tagName === 'DIALOG') return;
  e.preventDefault(); e.stopPropagation(); top.close();
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

// ─────────────────────────────── top-layer helper ───────────────────────────────
function toTop(el) { // popover="manual" puts el in the top layer, above open <dialog>s
  if (!el.popover) el.popover = 'manual';
  try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { /* not connected */ }
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
    hide(); if (t) { tipFor = t; tipTimer = setTimeout(() => showTip(t), 400); }
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
 * toast('Converted 12 photos · saved 11.8 MB', { type: 'success'|'info'|'warning'|'danger'|'neutral', action: { label: 'Undo', onClick }, duration })
 * Bottom-right (desktop) / bottom-centre (mobile), max 2 visible, always dismissible. Returns { close }.
 */
export function toast(message, { type = 'success', action, duration, html = false } = {}) {
  if (!toastRegion) { toastRegion = h('<section class="fw-toasts" aria-live="polite" aria-label="Notifications"></section>'); document.body.append(toastRegion); }
  toTop(toastRegion);
  const same = [...toastRegion.children].find((t) => t._msg === message && !t.classList.contains('is-leaving'));
  if (same) { same._restart(); return { close: same._close }; }
  const el = h(`<div class="fw-toast fw-toast--${type}" role="${type === 'danger' ? 'alert' : 'status'}">
    ${TOAST_ICON[type] ? `<span class="fw-toast__icon">${icon(TOAST_ICON[type], { size: 18 })}</span>` : ''}
    <div class="fw-toast__msg">${html ? message : esc(message)}</div>
    ${action ? `<button class="fw-toast__action" type="button">${esc(action.label)}</button>` : ''}
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss">${icon('x')}</button></div>`);
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
/** Copy text; if el is given it shows inline "Copied ✓" for 1.5 s (iconbtn → check icon). */
export async function copyText(text, el, { toastLabel } = {}) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = h('<textarea style="position:fixed;opacity:0"></textarea>'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
  }
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

// ─────────────────────────────── theme ───────────────────────────────
export function getThemePref() { try { return localStorage.getItem('fw:theme') || 'system'; } catch { return 'system'; } }
export function effectiveTheme() { const p = getThemePref(); return p === 'system' ? (mq('(prefers-color-scheme: dark)') ? 'dark' : 'light') : p; }
/** setTheme('light' | 'dark' | 'system'). Cross-fades via View Transitions when allowed; fires `fw-theme-change`. */
export function setTheme(mode) {
  const apply = () => {
    try { mode === 'system' ? localStorage.removeItem('fw:theme') : localStorage.setItem('fw:theme', mode); } catch { /* blocked */ }
    const root = document.documentElement;
    root.classList.add('fw-no-transition');
    if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    syncThemeButtons();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('fw-no-transition')));
  };
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(apply); else apply();
  const detail = { theme: mode === 'system' ? (mq('(prefers-color-scheme: dark)') ? 'dark' : 'light') : mode, pref: mode };
  window.dispatchEvent(new CustomEvent('fw-theme-change', { detail }));
  document.dispatchEvent(new CustomEvent('oo-theme-change', { detail }));
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
function fill(el, content) { if (content == null) return; if (typeof content === 'string') el.innerHTML = content; else el.append(content); }
/**
 * openDialog({ title, body, actions: [{ label, primary, danger, ghost, onClick, close = true }], size, sheetOnMobile = true,
 *              initialFocus, onClose }) → { el, close }. Native <dialog>, focus trap, Escape stack, focus return.
 * Below 600 px it becomes a bottom sheet (sheetOnMobile).
 */
export function openDialog({ title = '', body = '', actions = [], size, sheetOnMobile = true, initialFocus, onClose, className = '' } = {}) {
  const prev = document.activeElement; const id = 'fw-dlg-' + ++uid;
  const d = h(`<dialog class="fw-dialog ${sheetOnMobile ? 'fw-dialog--sheet-mobile' : ''} ${className}" aria-labelledby="${id}">
    <div class="fw-dialog__head"><h2 class="fw-dialog__title" id="${id}">${esc(title)}</h2>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="fw-dialog__body"></div>${actions.length ? '<div class="fw-dialog__foot"></div>' : ''}</dialog>`);
  if (size) d.style.setProperty('--dlg-w', size + 'px'); // a CSS var, so the mobile bottom-sheet width still wins
  fill(d.querySelector('.fw-dialog__body'), body);
  let closed = false;
  const api = { el: d, close };
  actions.forEach((a) => {
    const b = h(`<button type="button" class="fw-btn ${a.primary ? 'fw-btn--primary' : a.danger ? 'fw-btn--danger' : a.ghost ? 'fw-btn--ghost' : ''}">${esc(a.label)}</button>`);
    b.onclick = () => { a.onClick?.(api); if (a.close !== false) close(); };
    d.querySelector('.fw-dialog__foot').append(b);
  });
  d.querySelector('[data-close]').onclick = () => close();
  document.body.append(d); enhance(d);
  d.showModal();
  const untrap = trapFocus(d); const pop = pushLayer(() => close(), d);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('mousedown', (e) => { if (e.target === d) d._downOnBackdrop = true; });
  d.addEventListener('click', (e) => { if (e.target === d && d._downOnBackdrop) close(); d._downOnBackdrop = false; });
  const f = (initialFocus && d.querySelector(initialFocus)) || d.querySelector('[autofocus]') || d.querySelector('.fw-dialog__foot .fw-btn--primary') || focusables(d.querySelector('.fw-dialog__body'))[0] || d.querySelector('[data-close]');
  f?.focus();
  function close() {
    if (closed) return; closed = true; pop(); untrap(); d.classList.add('is-closing');
    setTimeout(() => { d.close(); d.remove(); if (prev?.isConnected) prev.focus({ preventScroll: true }); onClose?.(); }, reducedMotion() ? 0 : 170);
  }
  return api;
}

/** openSheet({ title, body, height: 'auto'|'peek'|'half'|'full', onClose }) → { el, close }. Bottom sheet with grab handle (drag down to close). */
export function openSheet({ title = '', body = '', height = 'auto', onClose, className = '', headExtra = '' } = {}) {
  const prev = document.activeElement; const id = 'fw-sheet-' + ++uid;
  const d = h(`<dialog class="fw-sheet ${height !== 'auto' ? 'fw-sheet--' + height : ''} ${className}" aria-labelledby="${id}">
    <div class="fw-sheet__grab" aria-hidden="true"></div>
    <div class="fw-sheet__head"><h2 class="fw-sheet__title" id="${id}">${esc(title)}</h2>${headExtra}
    <button class="fw-iconbtn" type="button" data-close aria-label="Close">${icon('x', { size: 18 })}</button></div>
    <div class="fw-sheet__body"></div></dialog>`);
  fill(d.querySelector('.fw-sheet__body'), body);
  document.body.append(d); enhance(d); d.showModal();
  let closed = false;
  const untrap = trapFocus(d); const pop = pushLayer(() => close(), d);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  d.querySelector('[data-close]').onclick = () => close();
  // drag to dismiss
  const grab = d.querySelector('.fw-sheet__grab'); let y0 = null;
  grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); d.style.transition = 'none'; });
  grab.addEventListener('pointermove', (e) => { if (y0 != null) d.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  grab.addEventListener('pointerup', (e) => { const dy = e.clientY - y0; y0 = null; d.style.transition = ''; d.style.transform = ''; if (dy > 80) close(); });
  if (!isCoarse()) (focusables(d.querySelector('.fw-sheet__body'))[0] || d.querySelector('[data-close]')).focus();
  else d.querySelector('[data-close]').focus({ preventScroll: true });
  function close() {
    if (closed) return; closed = true; pop(); untrap(); d.classList.add('is-closing');
    setTimeout(() => { d.close(); d.remove(); if (prev?.isConnected) prev.focus({ preventScroll: true }); onClose?.(); }, reducedMotion() ? 0 : 190);
  }
  return { el: d, close };
}

function place(el, anchor, placement = 'bottom-start') {
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight;
  let top = r.bottom + 6;
  if (top + ht > innerHeight - 8 && r.top - 6 - ht > 8) { top = r.top - 6 - ht; el.style.setProperty('--origin', 'bottom left'); }
  let left = placement.endsWith('end') ? r.right - w : placement.endsWith('center') ? r.left + r.width / 2 - w / 2 : r.left;
  left = Math.max(8, Math.min(innerWidth - w - 8, left));
  el.style.top = Math.max(8, top) + 'px'; el.style.left = left + 'px';
}
/**
 * openPopover(anchor, content, { placement: 'bottom-start'|'bottom-end'|'bottom-center', className, onClose, focus = true, width })
 * → { el, close }. Non-modal, top layer, closes on outside click / Escape / focus leaving; returns focus to anchor.
 */
export function openPopover(anchor, content, { placement = 'bottom-start', className = '', onClose, focus = true, width, role = 'dialog', label } = {}) {
  const el = h(`<div class="fw-popover ${className}" role="${role}" ${label ? `aria-label="${esc(label)}"` : ''}></div>`);
  if (width) el.style.width = typeof width === 'number' ? width + 'px' : width;
  fill(el, content); document.body.append(el); enhance(el); toTop(el);
  place(el, anchor, placement);
  anchor.setAttribute('aria-expanded', 'true');
  let closed = false;
  const pop = pushLayer(() => close(true), el);
  const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(false); };
  const onReflow = () => place(el, anchor, placement);
  const onFocusOut = () => setTimeout(() => { if (!closed && !el.contains(document.activeElement) && document.activeElement !== anchor && document.activeElement !== document.body) close(false); }, 0);
  setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
  window.addEventListener('resize', onReflow); el.addEventListener('focusout', onFocusOut);
  if (focus) (el.querySelector('[autofocus]') || focusables(el)[0])?.focus({ preventScroll: true });
  function close(returnFocus = true) {
    if (closed) return; closed = true; pop();
    document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', onReflow);
    anchor.setAttribute('aria-expanded', 'false');
    const had = el.contains(document.activeElement);
    el.classList.add('is-closing'); setTimeout(() => el.remove(), reducedMotion() ? 0 : 110);
    if (returnFocus && had) anchor.focus({ preventScroll: true });
    onClose?.();
  }
  return { el, close, reposition: onReflow };
}

/**
 * openMenu(anchor, items, opts) — items: [{ label, icon, hint, kbd, checked, danger, sub, onSelect }] or groups
 * [{ group: 'Label', items: […] }]. role=menu, arrows, Home/End, typeahead, Enter/Space, Esc returns focus.
 */
export function openMenu(anchor, items, opts = {}) {
  const groups = items[0] && 'group' in items[0] ? items : [{ items }];
  const menu = h('<div class="fw-menu" role="menu"></div>');
  const flat = [];
  groups.forEach((g) => {
    const wrap = h(`<div class="fw-menu__group" role="group" ${g.group ? `aria-label="${esc(g.group)}"` : ''}>${g.group ? `<div class="fw-menu__label" aria-hidden="true">${esc(g.group)}</div>` : ''}</div>`);
    g.items.forEach((it) => {
      const role = it.checked === undefined ? 'menuitem' : 'menuitemradio';
      const b = h(`<button type="button" class="fw-menu__item ${it.danger ? 'fw-menu__item--danger' : ''}" role="${role}" tabindex="-1" ${it.checked !== undefined ? `aria-checked="${!!it.checked}"` : ''}>
        ${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}${it.sub ? `<span class="fw-menu__sub">${esc(it.sub)}</span>` : ''}</span>
        ${it.kbd ? `<span class="fw-menu__hint">${kbd(it.kbd)}</span>` : it.hint ? `<span class="fw-menu__hint">${esc(it.hint)}</span>` : ''}
        ${it.checked !== undefined ? icon('check', { className: 'fw-menu__check' }) : ''}</button>`);
      b.onclick = () => { p.close(true); it.onSelect?.(); };
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
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      clearTimeout(taT); ta += e.key.toLowerCase(); taT = setTimeout(() => { ta = ''; }, 600);
      flat.find((b) => b.textContent.trim().toLowerCase().startsWith(ta))?.focus();
    }
  });
  (flat.find((b) => b.getAttribute('aria-checked') === 'true') || flat[0])?.focus();
  return p;
}

// ─────────────────────────────── routing ───────────────────────────────
const state = { opts: {}, leaf: null, cat: null, arch: 'home', routing: 'auto', routes: {}, areas: {} };
const ARCH_FILE = { workbench: 'workbench.html', queue: 'queue.html', instant: 'instant.html' };
export const homeHref = () => state.opts.home || new URL('shell/index.html', ROOT_URL).href;
function withQuery(href, query) {
  const u = new URL(href, location.href);
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') u.searchParams.set(k, v);
  return u.href;
}
/** Best href for a leaf right now (sync). Uses page `routes`, then an existing area mockup, else the shell skeleton. */
export function hrefFor(idOrLeaf, query = {}) {
  let l = typeof idOrLeaf === 'string' ? getLeaf(idOrLeaf) : idOrLeaf;
  if (!l) return homeHref();
  if (state.routes[l.id]) return withQuery(state.routes[l.id], query);
  if (l.aliasOf) { if (state.routes[l.aliasOf]) return withQuery(state.routes[l.aliasOf], query); l = getLeaf(l.aliasOf); }
  if (state.routing !== 'shell' && state.areas[l.area] === true) return withQuery(new URL(`${l.area}/`, ROOT_URL).href, { leaf: l.id, ...query });
  return withQuery(new URL(`shell/${ARCH_FILE[l.arch] || 'instant.html'}`, ROOT_URL).href, { leaf: l.id, ...query });
}
// All area mockups exist (a directory listing is not available when hosted, so no probing).
const KNOWN_AREAS = ['convert', 'image-tools', 'viewers', 'canvas', 'text', 'security', 'calculator', 'units', 'utilities'];
async function probeAreas() {
  if (state.routing === 'shell') return;
  state.areas = Object.fromEntries(KNOWN_AREAS.map((a) => [a, true])); refreshLeafLinks();
}
/** Re-point every [data-leaf] link (call after rendering your own leaf links). */
export function refreshLeafLinks(root = document) { $$('a[data-leaf]', root).forEach((a) => { a.href = hrefFor(a.dataset.leaf, a.dataset.query ? Object.fromEntries(new URLSearchParams(a.dataset.query)) : {}); }); }
/** navigate('heic-to-jpg', { query: { q }, newTab, files, action }) — files are handed off via IndexedDB (consumeHandoff()). */
export async function navigate(id, { query, newTab, files, action } = {}) {
  const l = getLeaf(id); if (!l) return;
  if (files?.length) await handoff(files, { leaf: id, action });
  const href = hrefFor(l, query);
  if (newTab) window.open(href, '_blank', 'noopener'); else location.href = href;
}

// ─────────────────────────────── search ───────────────────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9#%+]+/g, ' ').trim();
const STOP = new Set(['to', 'in', 'a', 'an', 'the', 'of', 'for', 'my', 'with', 'and', 'into', 'from', 'online', 'free', 'tool', 'app', 'how']);
let INDEX = null;
function indexEntry(e) {
  const it = e.item; const cat = it.cat ? getCat(it.cat) : null;
  return { ...e, name: norm(it.name), words: norm(it.name).split(' '), syn: (it.syn || []).map(norm), chip: norm(it.chip), cat: norm(cat?.label), desc: it.descInherited ? '' : norm(it.desc) };
}
function buildIndex() {
  INDEX = [...LEAVES.map((l) => ({ item: l, kind: 'leaf' })), ...ACTIONS.map((a) => ({ item: a, kind: 'action' }))].map(indexEntry);
}
/** Page commands (mountShell({ commands }) / setCommands()): [{ id, label, sub, icon, kbd, syn, run }]. */
let pageCommands = [];
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
/** search('heic', { limit, kinds }) → [{ item, kind: 'leaf'|'action'|'command', score, marks: [[start,end]] }] */
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
    let score = sum / n;
    if (e.name.startsWith(nq)) score += 40; else if (e.syn.some((s) => s.startsWith(nq))) score += 18;
    if (e.item.popular) score += 4; if (e.item.kind === 'tool') score += 3; if (e.kind === 'command') score += 6;
    res.push({ item: e.item, kind: e.kind, score, marks: marksFor(e.item.name, toks) });
  }
  res.sort((a, b) => b.score - a.score);
  const top = res[0]?.score || 0; // drop weak fuzzy noise ("heic" ⊂ "Fahrenheit…") when strong matches exist
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

// ─────────────────────────────── results list (command bar, home search, switcher) ───────────────────────────────
// Revision 1: pure tool search (owner decision). No inline answers, no paste detectors.
const GROUP_OF = { leaf: 'Tools', action: 'Settings', command: 'On this page' };
function buildEntries(q, { tools = true } = {}) {
  const s = q.trim(); const out = [];
  if (!s) {
    commandsNow().filter((c) => !c.searchOnly).slice(0, 4).forEach((c) => out.push({ type: 'command', group: GROUP_OF.command, item: c }));
    getRecent().slice(0, 4).forEach((r) => out.push({ type: 'recent', group: 'Recent', r, item: getLeaf(r.leaf) }));
    POPULAR.slice(0, 5).forEach((id) => out.push({ type: 'leaf', group: 'Popular', item: getLeaf(id) }));
    return out;
  }
  const found = tools ? search(s, { limit: 10 }) : [];
  const order = { command: 0, leaf: 1, action: 2 };
  found.sort((a, b) => (order[a.kind] - order[b.kind]) || (b.score - a.score));
  for (const r of found) out.push({ type: r.kind, group: GROUP_OF[r.kind], item: r.item, marks: r.marks });
  return out;
}
function leafMeta(l) {
  if (!l.cat) return 'Setting';
  const c = getCat(l.cat); const chip = chipOf(l);
  return l.kind === 'preset' ? `${c.label} · ${chip.chip}` : c.label;
}
/**
 * createResults(listEl, { input, onDone }) → { render(q), move(d), activate(alt) }.
 * Renders page commands, tools (incl. SEO presets), settings and recents with full keyboard + aria (listbox/option).
 */
export function createResults(listEl, { input, onDone = () => {}, tools = true } = {}) {
  let entries = [], sel = 0, lastQ = '';
  const lid = listEl.id || (listEl.id = 'fw-list-' + ++uid);
  listEl.setAttribute('role', 'listbox');
  function render(q) {
    lastQ = q; entries = buildEntries(q, { tools }); sel = 0;
    let html = '', lastGroup = null;
    entries.forEach((e, i) => {
      const id = `${lid}-o${i}`;
      const g = e.group;
      if (g !== lastGroup) { html += `<div class="fw-cmd__group" role="presentation">${esc(g)}</div>`; lastGroup = g; }
      const it = e.item; let name, meta;
      if (e.type === 'recent') { name = esc(it.name); meta = esc([e.r.file || e.r.note, shortAgo(e.r.t)].filter(Boolean).join(' · ')); }
      else if (e.type === 'action') { name = markName(it.name, e.marks); meta = it.kind === 'setting' ? 'Setting' : 'Action'; }
      else if (e.type === 'command') { name = markName(it.name, e.marks); meta = esc(it.sub || ''); }
      else { name = markName(it.name, e.marks); meta = esc(leafMeta(it)); }
      const dataAttr = e.type === 'command' ? `data-command-id="${esc(it.id)}"` : it?.id ? `data-leaf-id="${it.id}"` : '';
      const right = e.type === 'command' && it.kbd ? kbd(it.kbd) : `${e.type === 'action' || e.type === 'command' ? 'Run' : 'Open'} ${kbd('enter')}`;
      html += `<div class="fw-cmd__item" role="option" id="${id}" data-idx="${i}" ${dataAttr}>
        <span class="fw-cmd__icon">${icon(it?.icon || 'arrow-right')}</span>
        <span class="fw-cmd__text"><span class="fw-cmd__name">${name}</span>${meta ? `<span class="fw-cmd__meta">${meta}</span>` : ''}</span>
        <span class="fw-cmd__enter">${right}</span></div>`;
    });
    if (!entries.length) html = `<div class="fw-cmd__empty"><strong>No tool called “${esc(q.trim())}”</strong>Try “compress pdf”, “json”, “lbs to kg” or “qr”.</div>`;
    listEl.innerHTML = html; hydrateIcons(listEl); select(0, false);
  }
  function select(i, scroll = true) {
    if (!entries.length) { input?.removeAttribute('aria-activedescendant'); return; }
    sel = (i + entries.length) % entries.length;
    $$('[role="option"]', listEl).forEach((o) => o.setAttribute('aria-selected', String(+o.dataset.idx === sel)));
    const o = $(`[data-idx="${sel}"]`, listEl);
    input?.setAttribute('aria-activedescendant', o.id);
    if (scroll) o.scrollIntoView({ block: 'nearest' });
  }
  async function activate(alt = false) {
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
    else if (ev.key === 'Home' && ev.ctrlKey) { ev.preventDefault(); select(0); }
    else if (ev.key === 'End' && ev.ctrlKey) { ev.preventDefault(); select(entries.length - 1); }
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
  else if (id === 'install') toast('Use Install in your browser’s address bar.', { type: 'info' });
  else if (id === 'clear-recent') { const undo = clearRecent(); toast('Recent tools cleared', { type: 'neutral', action: { label: 'Undo', onClick: undo } }); }
}

// ─────────────────────────────── command bar ───────────────────────────────
let cmd = null;
/** openCommandBar('heic') — ⌘K / '/' palette: search over tools, sub-tools, SEO presets (synonyms), page commands, settings. */
export function openCommandBar(initial = '') {
  if (cmd) { if (initial) { cmd.input.value = initial; cmd.results.render(initial); } cmd.input.focus(); return cmd; }
  const prev = document.activeElement;
  const d = h(`<dialog class="fw-cmd" aria-label="Search tools">
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
  d.showModal();
  const pop = pushLayer(() => close(), d); const untrap = trapFocus(d);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  d.querySelector('[data-close]').onclick = () => close();
  input.addEventListener('input', () => results.render(input.value));
  input.addEventListener('keydown', results.onKey);
  input.value = initial; results.render(initial); input.focus();
  let closed = false;
  function close(navigating = false) {
    if (closed) return; closed = true; pop(); untrap(); d.classList.add('is-closing'); cmd = null;
    setTimeout(() => { d.close(); d.remove(); if (!navigating && prev?.isConnected) prev.focus({ preventScroll: true }); }, reducedMotion() ? 0 : 110);
  }
  cmd = { el: d, input, results, close, get open() { return !closed; } };
  return cmd;
}
export const closeCommandBar = () => cmd?.close();

/**
 * attachSearch(inputEl, { anchor }) — inline results dropdown under any input (home hero search, 404).
 * Same engine as the command bar (tool search).
 */
export function attachSearch(input, { anchor = input.closest('.fw-query') || input } = {}) {
  let pop = null, results = null;
  const open = () => {
    if (pop) return;
    const room = innerHeight - anchor.getBoundingClientRect().bottom - 20;
    const list = h(`<div class="fw-cmd__list" style="max-height:${Math.max(220, Math.min(440, room))}px"></div>`);
    pop = openPopover(anchor, list, { focus: false, width: anchor.offsetWidth, className: 'fw-search-pop', label: 'Search results', onClose: () => { pop = null; input.setAttribute('aria-expanded', 'false'); } });
    input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', list.id = 'fw-search-list');
    results = createResults(list, { input, onDone: () => pop?.close(false) });
  };
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  input.addEventListener('input', () => { if (!input.value.trim()) { pop?.close(false); return; } open(); results.render(input.value); pop.reposition(); });
  input.addEventListener('focus', () => { if (input.value.trim()) { open(); results.render(input.value); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop && input.value) { e.preventDefault(); input.value = ''; return; }
    if (e.key === 'ArrowDown' && !pop) { open(); results.render(input.value); }
    if (pop) results.onKey(e);
  });
}

// ─────────────────────────────── catalog (home map, switcher) ───────────────────────────────
/** renderCatalog({ group, compact }) → HTML string of category columns with their tools. */
/** Revision 1: one flat map in today's nav order; sub-tools by their sidebar label (chip). A category with a single
 *  tool (PDF Tools, Image Tools, Calculator, Canvas) lists its popular presets instead. `max` caps long lists. */
export function renderCatalog({ group, compact = false, current, max = 8 } = {}) {
  const cats = CATEGORIES.filter((c) => !group || !CATEGORIES.some((x) => x.group === group) || c.group === group);
  return `<div class="fw-catalog ${compact ? 'fw-catalog--compact' : ''}">${cats.map((c) => {
    const tools = toolsOf(c.id);
    const presets = tools.length === 1 ? presetsOf(tools[0].id).filter((p) => !p.pair) : [];
    const items = tools.length === 1 ? presets.map((p) => ({ l: p, label: p.name })) : tools.map((t) => ({ l: t, label: t.chip || t.name }));
    const lim = compact ? Math.min(max, 5) : max;
    const shown = items.length > lim ? items.slice(0, lim - 1) : items;
    const more = items.length - shown.length;
    return `<section class="fw-catalog__cat" aria-labelledby="cat-${c.id}${compact ? '-c' : ''}">
      <a class="fw-catalog__head" id="cat-${c.id}${compact ? '-c' : ''}" href="${hrefFor(tools[0])}" data-leaf="${tools[0].id}"><span class="fw-catalog__icon">${icon(c.icon)}</span>${esc(c.label)}</a>
      ${shown.map(({ l, label }) => `<a class="fw-catalog__leaf" href="${hrefFor(l)}" data-leaf="${l.id}" ${current === l.id ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
      ${more > 0 ? `<a class="fw-catalog__leaf fw-catalog__more" href="${hrefFor(tools[0])}" data-leaf="${tools[0].id}">${more} more…</a>` : ''}
    </section>`;
  }).join('')}</div>`;
}

function openSwitcher(anchor) {
  if (isMobile()) return openSwitcherSheet();
  const content = h(`<div>
    <div class="fw-switcher__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" type="text" placeholder="Find a tool…" aria-label="Find a tool" autocomplete="off"></div></div>
    <div class="fw-switcher__body">${renderCatalog({ current: chipOf(state.leaf)?.id, max: 15 })}</div>
    <div class="fw-switcher__results fw-cmd__list" hidden></div></div>`);
  const p = openPopover(anchor, content, { className: 'fw-switcher', label: 'All tools' });
  const input = content.querySelector('input'), body = content.querySelector('.fw-switcher__body'), list = content.querySelector('.fw-switcher__results');
  const results = createResults(list, { input, onDone: () => p.close(false), tools: true });
  input.addEventListener('input', () => { const q = input.value.trim(); body.hidden = !!q; list.hidden = !q; if (q) results.render(q); p.reposition(); });
  input.addEventListener('keydown', (e) => { if (!list.hidden) results.onKey(e); });
}
function openSwitcherSheet() {
  const curCat = state.cat?.id;
  const recent = getRecent().slice(0, 6);
  const body = h(`<div>
    <div class="fw-query" style="margin-bottom:12px">${icon('search', { size: 18 })}<input class="fw-query__input" type="text" placeholder="Search tools" aria-label="Search tools" autocomplete="off"></div>
    <div class="fw-ts-browse">
      ${recent.length ? `<div class="fw-tslist__group" style="padding-top:4px">Recent</div><div class="fw-recent-chips">${recent.map((r) => `<a class="fw-chip" href="${hrefFor(r.leaf)}" data-leaf="${r.leaf}">${icon(getLeaf(r.leaf).icon)}${esc(getLeaf(r.leaf).name)}</a>`).join('')}</div>` : ''}
      <div class="fw-tslist__group">All tools</div><div class="fw-tslist">${CATEGORIES.map((c) => { const tools = toolsOf(c.id);
        return tools.length === 1
          ? `<a class="fw-tslist__cat" href="${hrefFor(tools[0])}" data-leaf="${tools[0].id}" ${c.id === curCat ? 'aria-current="page"' : ''}><span class="fw-catalog__icon">${icon(c.icon)}</span>${esc(c.label)}</a>`
          : `<button class="fw-tslist__cat" type="button" aria-expanded="${c.id === curCat}"><span class="fw-catalog__icon">${icon(c.icon)}</span>${esc(c.label)}${icon('chevron-right')}</button>
        <div class="fw-tslist__leaves">${tools.map((t) => `<a class="fw-tslist__leaf" href="${hrefFor(t)}" data-leaf="${t.id}" ${chipOf(state.leaf || {})?.id === t.id ? 'aria-current="page"' : ''}>${esc(t.chip || t.name)}</a>`).join('')}</div>`; }).join('')}</div>
    </div>
    <div class="fw-cmd__list fw-ts-results" hidden style="margin:0 -8px"></div></div>`);
  const s = openSheet({ title: 'All tools', body, height: 'full', className: 'fw-switcher-sheet' });
  body.querySelectorAll('.fw-tslist__cat').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'))));
  const input = body.querySelector('input'), browse = body.querySelector('.fw-ts-browse'), list = body.querySelector('.fw-ts-results');
  const results = createResults(list, { input, onDone: () => s.close() });
  input.addEventListener('input', () => { const q = input.value.trim(); browse.hidden = !!q; list.hidden = !q; if (q) results.render(q); });
  input.addEventListener('keydown', results.onKey);
  return s;
}

// ─────────────────────────────── shortcuts sheet ───────────────────────────────
export function openShortcuts() {
  const rows = [
    ['Search tools', 'mod+k'], ['Focus search', '/'], ['Keyboard shortcuts', '?'], ['Go home', 'g h'],
    ['Open a file', 'mod+o'], ['Paste files or text', 'mod+v'], ['Export / download', 'mod+s'], ['Undo', 'mod+z'], ['Redo', 'shift+mod+z'], ['Close the top layer', 'esc'],
    ...(state.opts.shortcuts || []).map((s) => [s.label, s.keys]),
  ];
  const wb = [['Move / select', 'v'], ['Hand (hold Space)', 'h'], ['Crop', 'c'], ['Brush', 'b'], ['Text', 't'], ['Shape', 'u'], ['Pick colour', 'i'], ['Measure', 'm'], ['Export', 'e'], ['Fit', 'f'], ['100 %', '1']];
  const list = (r) => `<div class="fw-shortcuts">${r.map(([l, k]) => `<div class="fw-shortcuts__row"><span>${esc(l)}</span><span class="fw-shortcuts__keys">${kbd(k)}</span></div>`).join('')}</div>`;
  openDialog({ title: 'Keyboard shortcuts', size: 640, body: `<div class="fw-stack" style="--gap:20px"><div>${list(rows)}</div><div><div class="fw-section-title" style="margin-bottom:6px">In workbench tools (Image Tools, PDF Tools, Viewers, Canvas)</div>${list(wb)}</div></div>` });
}

// ─────────────────────────────── drop veil ───────────────────────────────
const drag = { el: null, mode: null, timer: 0, sticky: false, actions: [], popLayer: null, sig: '' };
function dtFiles(dt) { return dt && [...(dt.types || [])].includes('Files'); }
function dtItems(dt) { return [...(dt.items || [])].filter((i) => i.kind === 'file').map((i) => ({ type: i.type })); }
function accepts(sum) {
  const a = state.opts.accept; if (!state.opts.onFiles || !a) return false;
  if (typeof a === 'function') return !!a(sum);
  return sum.kinds.every((k) => a.includes(k) || a.includes('*'));
}
function veilActions(sum, files) {
  let acts = actionsFor(files);
  if (state.opts.dropActions) acts = [...state.opts.dropActions(sum, files), ...acts];
  return acts;
}
function actionHtml(a, i, isDefault) {
  return `<button class="fw-veil__action ${isDefault ? 'is-default' : ''}" type="button" data-action="${esc(a.id)}" data-idx="${i}">
    <span class="fw-veil__action-icon">${icon(a.icon || 'arrow-right', { size: 18 })}</span>
    <span class="fw-veil__action-text"><span class="fw-veil__action-name">${esc(a.label)}</span><span class="fw-veil__action-sub">${esc(a.sub || '')}</span></span>
    ${kbd('enter')}</button>`;
}
function ensureVeil() {
  if (drag.el) return drag.el;
  drag.el = h('<div class="fw-veil" role="presentation"></div>');
  document.body.append(drag.el); toTop(drag.el);
  drag.el.addEventListener('click', (e) => {
    const b = e.target.closest('.fw-veil__action'); if (b) { runVeilAction(b.dataset.action, drag.files); return; }
    if (drag.sticky && !e.target.closest('.fw-veil__panel')) hideVeil();
  });
  return drag.el;
}
function renderVeil(items, files = null) {
  const sum = summarize(files || items);
  const el = ensureVeil();
  const direct = !files && accepts(sum) || (files && drag.mode === 'direct');
  drag.mode = direct ? 'direct' : 'actions';
  drag.actions = veilActions(sum, files || items);
  const unknown = sum.kind === 'unknown';
  const sig = `${drag.mode}|${sum.label}|${!!files}`;
  if (sig === drag.sig) return; drag.sig = sig;
  el.classList.toggle('is-direct', direct);
  if (direct) {
    const target = state.leaf;
    const others = drag.actions.filter((a) => a.leaf !== target?.id && a.leaf !== chipOf(target || {})?.id).slice(0, 3);
    el.innerHTML = `<div class="fw-veil__direct"><div class="fw-veil__direct-icon">${icon('upload', { size: 28 })}</div>
      <div><div class="fw-veil__title">Drop to add ${esc(sum.label)}</div><div class="fw-veil__sub">to ${esc(state.opts.acceptLabel || target?.name || 'this tool')}</div></div></div>
      ${others.length ? `<div class="fw-veil__others">${others.map((a, i) => actionHtml(a, i, false)).join('')}</div>` : ''}`;
  } else {
    const n = sum.n;
    const title = unknown ? (files ? `Fernwork can’t read .${esc(sum.ext || '?')} yet` : 'Fernwork doesn’t know this file type yet') : esc(sum.label);
    const sub = files ? esc([sum.names.length > 1 ? sum.names.slice(0, 2).join(', ') + (n > 2 ? ` +${n - 2}` : '') : '', formatBytes(sum.size)].filter(Boolean).join(' · '))
      : unknown ? 'Drop it anyway to see what can help' : 'Drop on an action, or anywhere to choose';
    el.innerHTML = `<div class="fw-veil__panel" role="dialog" aria-label="What should Fernwork do with ${esc(sum.label)}?">
      <div class="fw-veil__head"><div class="fw-veil__files">${'<span>' + icon(sum.icon || 'file', { size: 20 }) + '</span>'}${n > 1 ? '<span></span>' : ''}${n > 2 ? '<span></span>' : ''}</div>
        <div style="min-width:0"><div class="fw-veil__title fw-ellipsis">${title}</div><div class="fw-veil__sub fw-ellipsis">${sub}</div></div></div>
      <div class="fw-veil__list" role="list">${drag.actions.map((a, i) => actionHtml(a, i, i === 0)).join('')}</div>
      ${unknown && files ? `<div class="fw-veil__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" type="text" placeholder="Search for a tool that can help…" aria-label="Search tools"></div></div>` : ''}</div>`;
  }
  hydrateIcons(el);
}
function showVeil(items) {
  if (drag.sticky) { drag.sticky = false; drag.popLayer?.(); drag.sig = ''; }
  renderVeil(items);
  if (!drag.shown) { drag.shown = true; drag.el.classList.remove('is-leaving'); document.documentElement.classList.add('fw-dragging'); }
}
function hideVeil() {
  clearTimeout(drag.timer);
  if (!drag.el) return;
  const el = drag.el; drag.el = null; drag.shown = false; drag.sticky = false; drag.sig = ''; drag.mode = null;
  drag.popLayer?.(); drag.popLayer = null;
  document.documentElement.classList.remove('fw-dragging');
  el.classList.add('is-leaving'); setTimeout(() => el.remove(), reducedMotion() ? 0 : 180);
}
/** Show the action chooser for files that arrived without a target (stray drop, paste, picker on home). */
export function openChooser(files) {
  drag.files = files; drag.mode = 'actions'; drag.sig = '';
  renderVeil(null, files);
  drag.shown = true; drag.sticky = true;
  drag.popLayer = pushLayer(() => hideVeil(), drag.el);
  const btns = $$('.fw-veil__action', drag.el); btns[0]?.focus();
  drag.el.addEventListener('keydown', (e) => {
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus(); }
  });
  const s = drag.el.querySelector('.fw-veil__search input');
  s?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const q = s.value; hideVeil(); openCommandBar(q); } });
}
function runVeilAction(id, files) {
  const a = drag.actions.find((x) => x.id === id); hideVeil(); if (!a) return;
  if (a.run) { a.run(files); return; }
  if (state.opts.onFiles && state.leaf && (a.leaf === state.leaf.id) ) { state.opts.onFiles(files, { source: 'drop', action: id }); return; }
  navigate(a.leaf, { files, action: id });
}
function initDrop() {
  const over = (e) => {
    if (!dtFiles(e.dataTransfer)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    if (!drag.shown || drag.sticky) showVeil(dtItems(e.dataTransfer));
    clearTimeout(drag.timer); drag.timer = setTimeout(hideVeil, 500);
    const t = e.target.closest?.('.fw-veil__action');
    $$('.fw-veil__action.is-target', drag.el).forEach((b) => b !== t && b.classList.remove('is-target'));
    t?.classList.add('is-target');
    drag.el?.classList.toggle('is-over-zone', !t);
  };
  window.addEventListener('dragenter', over, true);
  window.addEventListener('dragover', over, true);
  window.addEventListener('dragleave', (e) => {
    if (!drag.shown || drag.sticky) return;
    if (!e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) hideVeil();
  }, true);
  window.addEventListener('drop', (e) => {
    if (!dtFiles(e.dataTransfer)) return;
    e.preventDefault(); e.stopPropagation();
    const files = [...e.dataTransfer.files]; if (!files.length) { hideVeil(); return; }
    drag.files = files;
    const t = e.target.closest?.('.fw-veil__action');
    if (t) { runVeilAction(t.dataset.action, files); return; }
    if (drag.mode === 'direct' || (!drag.shown && accepts(summarize(files)))) { hideVeil(); state.opts.onFiles(files, { source: 'drop' }); return; }
    hideVeil(); setTimeout(() => openChooser(files), reducedMotion() ? 0 : 60);
  }, true);
  document.addEventListener('paste', (e) => {
    const cd = e.clipboardData; if (!cd) return;
    const files = [...cd.files];
    if (files.length) {
      e.preventDefault();
      if (accepts(summarize(files))) state.opts.onFiles(files, { source: 'paste' }); else openChooser(files);
      return;
    }
    if (isTyping(e.target) || hasLayers()) return;
    const text = cd.getData('text'); if (!text?.trim()) return;
    // Revision 1: only the page may take pasted text (onPasteText); the command bar no longer detects pasted values.
    if (state.opts.onPasteText?.(text) === true) e.preventDefault();
  });
}

// ─────────────────────────────── FileIntake ───────────────────────────────
/**
 * mountIntake(el, { onFiles, accept: 'image/*,.heic', multiple = true }) — makes any element a focusable file picker
 * (Enter/Space/click), with a drag-over counter for pages that disable the veil. [data-sample="url[>name]|…"] children
 * load real sample files. Called automatically for `.fw-intake[data-intake]` by enhance().
 */
export function mountIntake(el, { onFiles = state.opts.onFiles, accept = el.dataset.accept || '', multiple = el.dataset.multiple !== 'false' } = {}) {
  if (el._intake) return; el._intake = true;
  if (!/^(BUTTON|LABEL|A)$/.test(el.tagName)) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
  const inp = h(`<input type="file" hidden ${multiple ? 'multiple' : ''} ${accept ? `accept="${esc(accept)}"` : ''}>`);
  el.append(inp);
  const pick = () => inp.click();
  el.addEventListener('click', (e) => { if (e.target.closest('[data-sample],a,[data-no-pick]') || e.target === inp) return; if (e.target.closest('button') && !e.target.closest('[data-pick]')) return; pick(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); pick(); } });
  inp.addEventListener('change', () => { const f = [...inp.files]; inp.value = ''; if (f.length) (onFiles || openChooser)(f, { source: 'picker' }); });
  let depth = 0;
  el.addEventListener('dragenter', () => { depth++; el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('is-over'); } });
  el.addEventListener('drop', () => { depth = 0; el.classList.remove('is-over'); });
  $$('[data-sample]', el).forEach((b) => b.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); const f = await loadSamples(b.dataset.sample); (onFiles || openChooser)(f, { source: 'sample' }); }));
}
/** loadSamples('IMG_2041.jpg>IMG_2041.HEIC|report.docx') → File[] from kit/samples (rename with '>'). */
export async function loadSamples(spec) {
  return Promise.all(spec.split('|').map(async (s) => {
    const [src, as] = s.split('>');
    const url = /^(https?:|\/|\.)/.test(src) ? src : new URL('samples/' + src, KIT_URL).href;
    const b = await (await fetch(url)).blob();
    const name = as || src.split('/').pop();
    return new File([b], name, { type: mimeFor(extOf({ name })) || b.type });
  }));
}

// ─────────────────────────────── enhance ───────────────────────────────
/** Wire kit behaviours inside root: icons, segmented controls, roving rows, copy buttons, sliders, intakes, tooltips. */
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

// ─────────────────────────────── page header & footer ───────────────────────────────
/** renderPageHeader(target, { leaf, title, lede, chips = true, aside }) — H1 + one line + sub-tool chips. */
export function renderPageHeader(target, { leaf: l = state.leaf, title, lede, chips = true, aside = '' } = {}) {
  const tools = l?.cat ? toolsOf(l.cat) : []; const cur = l ? chipOf(l) : null; const c = l?.cat ? getCat(l.cat) : null;
  target.innerHTML = `<header class="fw-page-header">
    <div class="fw-page-header__top"><div class="fw-page-header__titles"><h1 class="fw-h1">${esc(title || l?.name || '')}</h1>
      ${(lede ?? l?.desc) ? `<p class="fw-lede">${esc(lede ?? l.desc)}</p>` : ''}</div>
      ${aside ? `<div class="fw-page-header__aside">${aside}</div>` : ''}</div>
    ${chips && tools.length > 1 ? `<nav class="fw-subchips" aria-label="${esc(c.label)} tools" data-roving="a">${tools.map((t) => `<a class="fw-chip" href="${hrefFor(t)}" data-leaf="${t.id}" ${cur?.id === t.id ? 'aria-current="page"' : ''}>${esc(t.chip)}</a>`).join('')}</nav>` : ''}
  </header>`;
  enhance(target);
  target.querySelector('.fw-chip[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function footerHtml(wide) {
  return `<footer class="fw-footer ${wide ? 'fw-footer--wide' : ''}">
    <nav class="fw-footer__links" aria-label="Legal"><a href="#">Imprint</a><a href="#">Privacy</a><a href="#">Terms</a></nav></footer>`;
}

// ─────────────────────────────── app bar / rail ───────────────────────────────
function appBarHtml() {
  const c = state.cat; const l = state.leaf;
  const label = c ? c.label : 'All tools';
  return `<header class="fw-appbar">
    <div class="fw-appbar__start">
      <a class="fw-brand" href="${homeHref()}" aria-label="Fernwork home"><span class="fw-brand__mark"><img src="${new URL('img/logo.svg', KIT_URL).href}" alt="" width="24" height="24"></span><span class="fw-brand__word">Fernwork</span></a>
      <span class="fw-crumb-sep" aria-hidden="true">/</span>
      <button class="fw-switcher-btn" type="button" id="fw-switcher" aria-haspopup="dialog" aria-expanded="false" data-tip="All tools">
        <span class="fw-ellipsis">${esc(label)}</span>${icon('chevron-down', { size: 14 })}</button>
    </div>
    <div class="fw-appbar__center">
      <button class="fw-cmdpill" type="button" id="fw-cmdpill" aria-label="Search tools (${MOD}K)">${icon('search')}<span class="fw-cmdpill__text">Search tools…</span>${kbd('mod+k')}</button>
    </div>
    <div class="fw-appbar__end">
      <button class="fw-iconbtn fw-hide-mobile" type="button" id="fw-recent" aria-label="Recent" data-tip="Recent" aria-haspopup="dialog" aria-expanded="false">${icon('history', { size: 18 })}</button>
      <button class="fw-iconbtn fw-hide-mobile" type="button" id="fw-theme-toggle" data-fw-theme-toggle></button>
      <button class="fw-iconbtn fw-show-mobile" type="button" id="fw-search-mobile" aria-label="Search">${icon('search', { size: 20 })}</button>
      <button class="fw-iconbtn" type="button" id="fw-more" aria-label="More" data-tip="More" aria-haspopup="menu" aria-expanded="false">${icon('ellipsis', { size: 20 })}</button>
    </div></header>`;
}
// Revision 1: one flat list in today's nav order. Open rail: the active category lists its sub-tools (today's sidebar
// labels). Collapsed rail: hovering or focusing a category with sub-tools opens a flyout listing them (→ / click).
function railHtml() {
  const cur = state.cat?.id; const curTool = chipOf(state.leaf)?.id;
  return `<nav class="fw-rail" aria-label="Tools"><div class="fw-rail__group">
    ${CATEGORIES.map((c) => {
      const tools = toolsOf(c.id); const multi = tools.length > 1;
      return `<a class="fw-rail__item ${c.id === cur ? 'is-active' : ''}" href="${hrefFor(tools[0])}" data-leaf="${tools[0].id}" data-cat="${c.id}" ${multi ? 'aria-haspopup="true" aria-expanded="false"' : `data-tip="${esc(c.label)}" data-tip-place="right"`} ${c.id === cur ? 'aria-current="true"' : ''} aria-label="${esc(c.label)}">
        ${icon(c.icon, { size: 20 })}<span class="fw-rail__name">${esc(c.label)}</span></a>
        ${multi ? `<div class="fw-rail__leaves">${tools.map((t) => `<a class="fw-rail__leaf" href="${hrefFor(t)}" data-leaf="${t.id}" ${curTool === t.id ? 'aria-current="page"' : ''}>${esc(t.chip || t.name)}</a>`).join('')}</div>` : ''}`;
    }).join('')}</div>
    <div class="fw-rail__foot"><button class="fw-rail__item" type="button" id="fw-rail-pin" data-tip-place="right"></button></div></nav>`;
}
// Flyout for the collapsed rail (also used on workbenches, where the rail never opens).
let fly = null;
function closeFlyout() { if (!fly) return; clearTimeout(fly.t); fly.item.setAttribute('aria-expanded', 'false'); fly.pop(); fly.el.remove(); fly = null; }
function openFlyout(item, focusFirst = false) {
  if (document.body.classList.contains('is-rail-pinned') && !document.documentElement.classList.contains('fw-arch-workbench')) return;
  if (fly?.item === item) { clearTimeout(fly.t); return; }
  closeFlyout();
  const c = getCat(item.dataset.cat); const curTool = chipOf(state.leaf)?.id;
  const el = h(`<div class="fw-popover fw-rail-flyout" role="group" aria-label="${esc(c.label)}"><div class="fw-rail-flyout__title">${esc(c.label)}</div>
    ${toolsOf(c.id).map((t) => `<a class="fw-rail-flyout__leaf" href="${hrefFor(t)}" data-leaf="${t.id}" ${curTool === t.id ? 'aria-current="page"' : ''}>${esc(t.chip || t.name)}</a>`).join('')}</div>`);
  document.body.append(el); toTop(el);
  const r = item.getBoundingClientRect();
  el.style.left = (r.right + 8) + 'px'; el.style.top = Math.max(8, Math.min(r.top - 6, innerHeight - el.offsetHeight - 8)) + 'px';
  item.setAttribute('aria-expanded', 'true');
  const pop = pushLayer(() => { item.focus(); closeFlyout(); }, el);
  fly = { el, item, pop, t: 0 };
  const later = () => { clearTimeout(fly?.t); if (fly) fly.t = setTimeout(closeFlyout, 220); };
  el.addEventListener('pointerenter', () => clearTimeout(fly?.t));
  el.addEventListener('pointerleave', later);
  item.addEventListener('pointerleave', later, { once: true });
  const links = $$('a', el);
  el.addEventListener('keydown', (e) => {
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); item.focus(); closeFlyout(); }
    else if (e.key === 'Tab') closeFlyout();
  });
  if (focusFirst) (links.find((a) => a.getAttribute('aria-current')) || links[0]).focus();
}
function initRailFlyouts() {
  $$('.fw-rail__item[aria-haspopup]').forEach((item) => {
    let t = 0;
    item.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; t = setTimeout(() => openFlyout(item), 120); });
    item.addEventListener('pointerleave', () => clearTimeout(t));
    item.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); openFlyout(item, true); } });
  });
  document.addEventListener('pointerdown', (e) => { if (fly && !fly.el.contains(e.target) && !fly.item.contains(e.target)) closeFlyout(); }, true);
}
function syncPin() {
  const pinned = document.body.classList.contains('is-rail-pinned');
  const b = $('#fw-rail-pin'); if (!b) return;
  b.innerHTML = `${icon(pinned ? 'panel-left-close' : 'panel-left-open', { size: 20 })}<span class="fw-rail__name">Collapse</span>`;
  b.dataset.tip = pinned ? 'Collapse sidebar' : 'Pin sidebar open'; b.setAttribute('aria-label', b.dataset.tip); b.setAttribute('aria-pressed', String(pinned));
}
function openRecentPopover(anchor) {
  const r = getRecent();
  const content = h(`<div style="width:340px">
    <div class="fw-menu__label" style="display:flex;align-items:center;padding:8px 10px 6px">Recent<button class="fw-btn fw-btn--ghost fw-btn--sm" style="margin-left:auto;height:24px" type="button" data-clear>Clear</button></div>
    <div class="fw-recent">${r.length ? r.slice(0, 8).map((x) => { const l = getLeaf(x.leaf); return `<a class="fw-recent__item" href="${hrefFor(l)}" data-leaf="${l.id}"><span class="fw-recent__icon">${icon(l.icon)}</span><span class="fw-recent__main"><span class="fw-recent__title">${esc(l.name)}</span>${x.file || x.note ? `<span class="fw-recent__sub">${esc(x.file || x.note)}</span>` : ''}</span><span class="fw-recent__when">${shortAgo(x.t)}</span></a>`; }).join('') : '<div class="fw-empty" style="padding:24px"><div class="fw-empty__text">Tools you use show up here.</div></div>'}</div></div>`);
  const p = openPopover(anchor, content, { placement: 'bottom-end', label: 'Recent' });
  content.querySelector('[data-clear]').onclick = () => { const undo = clearRecent(); p.close(); toast('Recent cleared', { type: 'neutral', action: { label: 'Undo', onClick: undo } }); };
}
/** ⋯ menu (all widths): theme (phones), shortcuts (desktop), install, and the legal links (REVIEW-1: legal lives here + home). */
function openMoreMenu(anchor) {
  const pref = getThemePref(); const mobile = isMobile();
  const legal = (label) => ({ label, onSelect: () => { location.href = (state.opts.legalBase || '#') + label.toLowerCase(); } });
  openMenu(anchor, [
    ...(mobile ? [{ group: 'Theme', items: [
      { label: 'Light', icon: 'sun', checked: pref === 'light', onSelect: () => setTheme('light') },
      { label: 'Dark', icon: 'moon', checked: pref === 'dark', onSelect: () => setTheme('dark') },
      { label: 'Match system', icon: 'monitor', checked: pref === 'system', onSelect: () => setTheme('system') }] }] : []),
    { group: '', items: [
      ...(mobile ? [{ label: 'Recent', icon: 'history', onSelect: () => openSwitcherSheet() }] : [{ label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', onSelect: () => openShortcuts() }]),
      { label: 'Install Fernwork', icon: 'download', onSelect: () => runAction('install') }] },
    { group: 'Legal', items: [legal('Imprint'), legal('Privacy'), legal('Terms')] },
  ], { placement: 'bottom-end' });
}

// ─────────────────────────────── mount ───────────────────────────────
let mounted = false;
/**
 * mountShell(opts) — call once per page, after <main id="main"> exists.
 *   category   category id (registry) — derived from leaf when omitted; null on home/404
 *   leaf       leaf id for this page (sets H1 data, rail state, Recent)
 *   archetype  'home' | 'workbench' | 'queue' | 'instant' | 'doc'
 *   accept     kinds this page takes directly, e.g. ['image'] or ['*'] or (summary) => bool
 *   acceptLabel  text for the direct-drop veil ("to HEIC to JPG")
 *   onFiles(files, { source })   files dropped / pasted / picked / handed off
 *   onPasteText(text) → true if the page handled a paste outside inputs (else the command bar opens)
 *   dropActions(summary, files) → extra veil actions [{ id, label, sub, icon, leaf | run(files) }]
 *   pageHeader  CSS selector or element to render the standard PageHeader into (optional)
 *   footer     default true except workbench;  wide: wider footer alignment (home)
 *   routing    'auto' (default: area mockups if they exist, else shell skeletons) | 'shell'
 *   routes     { leafId: href } overrides for links to your own pages
 *   searchInput  selector focused by '/' instead of opening the command bar (home)
 *   shortcuts  [{ label, keys: 'mod+shift+e' }] added to the '?' sheet
 *   handoff    true (default) → calls onFiles with files handed over from the previous page
 *   commands   [{ id, label, sub, icon, kbd, syn, run, searchOnly, hidden() }] page commands shown in ⌘K ("On this page")
 *   railOpen   override the default rail state (open on ≥1280 px unless the user collapsed it; workbenches stay collapsed)
 * Returns { leaf, category, toast, openCommandBar, setTheme, … }.
 */
export function mountShell(opts = {}) {
  if (mounted) return api(); mounted = true;
  state.opts = opts;
  state.leaf = opts.leaf ? getLeaf(opts.leaf) : null;
  state.cat = getCat(opts.category || state.leaf?.cat) || null;
  state.arch = opts.archetype || state.leaf?.arch || 'instant';
  state.routing = opts.routing || 'auto';
  state.routes = opts.routes || {};
  state.areas = Object.fromEntries(KNOWN_AREAS.map((a) => [a, true]));
  const root = document.documentElement; root.classList.add('fw-arch-' + state.arch);
  const body = document.body;
  body.classList.add('fw-shell');
  setCommands(opts.commands);
  const pinPref = store.get('rail-pinned');
  const railOpen = opts.railOpen ?? (pinPref == null ? matchMedia('(min-width: 1280px)').matches : pinPref === true);
  if (railOpen && state.arch !== 'workbench') body.classList.add('is-rail-pinned');
  if (opts.rail === false || state.arch === 'doc') body.classList.add('no-rail');
  if (state.leaf && !document.title) document.title = `${state.leaf.name} · Fernwork`;

  let main = $('main'); if (!main) { main = document.createElement('main'); body.append(main); }
  main.id = 'main'; main.tabIndex = -1; main.classList.add('fw-main');
  const wrap = h('<div class="fw-body"></div>');
  main.before(wrap); wrap.append(main);
  if (opts.footer === true || (opts.footer == null && state.arch === 'home')) wrap.insertAdjacentHTML('beforeend', footerHtml(opts.wide));
  wrap.before(h(`<a class="fw-skip" href="#main">${state.arch === 'home' ? 'Skip to search' : 'Skip to tool'}</a>`));
  wrap.before(h(appBarHtml()));
  if (!body.classList.contains('no-rail')) wrap.before(h(railHtml()));
  syncPin(); syncThemeButtons(); initRailFlyouts();

  $('#fw-cmdpill').onclick = () => openCommandBar();
  $('#fw-search-mobile').onclick = () => openCommandBar();
  $('#fw-switcher').onclick = (e) => { if (e.currentTarget.getAttribute('aria-expanded') === 'true') return; openSwitcher(e.currentTarget); };
  $('#fw-recent').onclick = (e) => { if (e.currentTarget.getAttribute('aria-expanded') !== 'true') openRecentPopover(e.currentTarget); };
  // (privacy chip removed: no marketing clutter in the app bar)
  $('#fw-more').onclick = (e) => { if (e.currentTarget.getAttribute('aria-expanded') !== 'true') openMoreMenu(e.currentTarget); };
  $('#fw-theme-toggle').onclick = toggleTheme;
  $('#fw-rail-pin')?.addEventListener('click', () => { closeFlyout(); body.classList.toggle('is-rail-pinned'); store.set('rail-pinned', body.classList.contains('is-rail-pinned')); syncPin(); });

  if (opts.pageHeader) { const t = typeof opts.pageHeader === 'string' ? $(opts.pageHeader) : opts.pageHeader; if (t) renderPageHeader(t); }
  enhance(document);
  initTooltips(); initDrop(); initKeys();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeButtons);

  if (state.leaf && state.arch !== 'home') addRecent({ leaf: state.leaf.id, ...(opts.recent || {}) });
  probeAreas();
  if (opts.onFiles && opts.handoff !== false) consumeHandoff().then((hd) => { if (hd?.files?.length) opts.onFiles(hd.files, { source: 'handoff', ...hd.meta }); });
  return api();
}
function api() {
  return { leaf: state.leaf, category: state.cat, archetype: state.arch, toast, openCommandBar, openDialog, openSheet, openPopover, openMenu, setTheme, navigate, hrefFor, openChooser, enhance, setCommands };
}
let gAt = 0;
function initKeys() {
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k.toLowerCase() === 'k') { e.preventDefault(); if (cmd) cmd.close(); else openCommandBar(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (isTyping(document.activeElement) || hasLayers()) return;
    if (k === '/') { e.preventDefault(); const s = state.opts.searchInput && $(state.opts.searchInput); if (s) { s.focus(); s.select?.(); } else openCommandBar(); }
    else if (k === '?') { e.preventDefault(); openShortcuts(); }
    else if (k === 'g') gAt = Date.now();
    else if (k === 'h' && Date.now() - gAt < 900) location.href = homeHref();
  });
}
