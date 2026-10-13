// Security · shared UI helpers: toolbar pieces, "More options" disclosure, panes, secret copy with clipboard wipe,
// mobile action bar, downloads and the date helpers the JWT/UUID pages need.
import { icon, esc, $, $$, h, enhance, toast, copyText, kbd, isCoarse, store } from '../kit/shell.js';
import { ICONS } from '../kit/icons.js';

// Lucide icons the kit doesn't ship yet (ISC) — reported as kit additions.
Object.assign(ICONS, {
  dices: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" />',
  wand: '<path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8 19 13" /><path d="M15 9h.01" /><path d="M17.8 6.2 19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" />',
  'lock-open': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />',
});
export { icon, esc, $, $$, h, enhance, toast, copyText, kbd, isCoarse, store };

export const fmtN = (n) => new Intl.NumberFormat('en-US').format(n);
export function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; }

/** Remembered per-tool settings: S = settings('hash', { … }); S.x = 1; S.save(). Content is never stored. */
export function settings(tool, defaults) {
  const S = Object.assign(structuredClone(defaults), store.get('sec:' + tool) || {});
  Object.defineProperty(S, 'save', { value: () => { const o = {}; for (const k of Object.keys(defaults)) o[k] = S[k]; store.set('sec:' + tool, o); } });
  return S;
}

// ───────── toolbar ─────────
/** Segmented control markup (kit .fw-seg, emits fw-change). */
export const seg = (id, label, opts, cur, { sm = false, cls = '', raw = false } = {}) => `<div class="fw-seg ${sm ? 'fw-seg--sm' : ''} ${cls}" id="${id}" aria-label="${esc(label)}">${opts.map(([v, l, ic]) => `<button class="fw-seg__opt" type="button" data-value="${esc(v)}" aria-checked="${String(cur === v)}">${ic ? icon(ic) : ''}${raw ? l : esc(l)}</button>`).join('')}</div>`;
export const select = (id, label, opts, cur) => `<label class="sec-sel"><span class="sec-sel__l">${esc(label)}</span><select class="fw-select" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l ?? v)}</option>`).join('')}</select></label>`;
export const moreBtn = (id = 'more-btn') => `<button class="fw-btn fw-btn--ghost fw-btn--sm sec-morebtn" type="button" id="${id}" aria-expanded="false" aria-controls="${id}-panel">${icon('sliders-horizontal')}<span>More options</span></button>`;
/** Wire a More options button to its inline panel (pushes content down; no overlay, works the same on phones). */
export function wireMore(btn, panel, { open = false, onToggle } = {}) {
  const set = (on) => { panel.hidden = !on; btn.setAttribute('aria-expanded', String(on)); btn.classList.toggle('is-open', on); onToggle?.(on); };
  btn.onclick = () => set(panel.hidden);
  set(open);
  return set;
}
export const iconBtn = (id, ic, label, extra = '') => `<button class="fw-iconbtn fw-iconbtn--sm" type="button" ${id ? `id="${id}"` : ''} aria-label="${esc(label)}" data-tip="${esc(label)}" ${extra}>${icon(ic)}</button>`;
/** A card pane with a head row (label · actions) and a body. */
export const pane = ({ id, label, labelFor, actions = '', body = '', cls = '' }) => `<section class="sec-pane ${cls}" ${id ? `id="${id}"` : ''}>
  <div class="sec-pane__head">${labelFor ? `<label class="sec-pane__label" for="${labelFor}">${esc(label)}</label>` : `<span class="sec-pane__label">${esc(label)}</span>`}<span class="sec-pane__meta"></span><span class="fw-spacer"></span>${actions}</div>
  <div class="sec-pane__body">${body}</div></section>`;

// ───────── clipboard ─────────
export async function readClipboard() {
  try { const t = await navigator.clipboard.readText(); if (!t) toast('The clipboard is empty', { type: 'info' }); return t || null; }
  catch { toast(`Press ${isMacKey()}V to paste`, { type: 'info' }); return null; }
}
const isMacKey = () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+');

let wipe = null;
/** Copy a secret, show "Copied · clears in 60 s" on the button and wipe the clipboard afterwards (if it still holds it). */
export async function copySecret(text, btn, { seconds = 60, label } = {}) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); } catch { await copyText(text); }
  if (wipe) wipe.cancel();
  const orig = btn ? (btn.dataset.orig ||= btn.innerHTML) : '';
  const end = Date.now() + seconds * 1000;
  const paint = () => { if (!btn?.isConnected) return; const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); btn.classList.add('is-copied'); btn.innerHTML = `${icon('check')}<span>Copied · clears in ${left} s</span>`; };
  const restore = () => { if (!btn?.isConnected) return; btn.classList.remove('is-copied'); btn.innerHTML = label ? `${icon('copy')}<span>${esc(label)}</span>` : orig; };
  if (btn) paint(); else toast(`Copied · the clipboard clears in ${seconds} s`, { type: 'success' });
  const t = setInterval(async () => {
    paint();
    if (Date.now() >= end) {
      clearInterval(t); wipe = null;
      try { const cur = await navigator.clipboard.readText(); if (cur === text) await navigator.clipboard.writeText(''); } catch { /* no read permission: best effort */ }
      if (btn?.isConnected) { btn.innerHTML = `${icon('check')}<span>Clipboard cleared</span>`; setTimeout(restore, 1800); }
    }
  }, 250);
  wipe = { cancel: () => { clearInterval(t); restore(); }, text };
}
addEventListener('pagehide', () => { if (wipe) { try { navigator.clipboard.writeText(''); } catch { /* */ } } });

// ───────── mobile action bar (one per page, < 641 px) ─────────
/** setBar({ line, sub, actions: [{ label, icon, primary, iconOnly, onClick }] }) or setBar(null). */
export function setBar(spec) {
  const wrap = $('#mbar'); if (!wrap) return;
  if (!spec) { wrap.hidden = true; document.body.style.removeProperty('--toast-offset'); return; }
  wrap.hidden = false; document.body.style.setProperty('--toast-offset', '76px');
  $('#mbar-line').textContent = spec.line || ''; $('#mbar-sub').textContent = spec.sub || ''; $('#mbar-sub').hidden = !spec.sub;
  const acts = $('#mbar-actions'); acts.innerHTML = '';
  for (const a of spec.actions || []) {
    const b = h(`<button class="${a.iconOnly ? 'fw-iconbtn fw-iconbtn--outline sec-mbar__icon' : `fw-btn ${a.primary ? 'fw-btn--primary' : ''} fw-btn--lg`}" type="button" ${a.disabled ? 'disabled' : ''} ${a.iconOnly ? `aria-label="${esc(a.label)}"` : ''}>${icon(a.icon || 'copy', { size: a.iconOnly ? 20 : 16 })}${a.iconOnly ? '' : `<span>${esc(a.label)}</span>`}</button>`);
    b.onclick = (e) => a.onClick(e.currentTarget);
    acts.append(b);
  }
}

// ───────── files ─────────
export function download(data, name, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h(`<a download="${esc(name)}"></a>`); a.href = URL.createObjectURL(blob); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Saved ${name}`, { type: 'success' });
}
export function pickFile({ accept = '', multiple = false } = {}) {
  return new Promise((ok) => { const i = h(`<input type="file" ${multiple ? 'multiple' : ''} accept="${esc(accept)}" hidden>`); i.onchange = () => { ok([...i.files]); i.remove(); }; document.body.append(i); i.click(); });
}
export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1; let v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

/** Auto-grow a textarea between min and max rows. */
export function autoGrow(ta, { max = 320 } = {}) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(max, ta.scrollHeight + 2) + 'px'; };
  ta.addEventListener('input', fit); requestAnimationFrame(fit); return fit;
}
/** Password field with show/hide eye. */
export const pwField = (id, label, { placeholder = '', autocomplete = 'off', value = '' } = {}) => `<div class="fw-field"><label class="fw-field__label" for="${id}">${esc(label)}</label>
  <div class="fw-inputwrap sec-pw"><input class="fw-input" id="${id}" type="password" autocomplete="${autocomplete}" spellcheck="false" autocapitalize="off" placeholder="${esc(placeholder)}" value="${esc(value)}">
  <span class="fw-inputwrap__end"><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-eye="${id}" aria-label="Show password" aria-pressed="false" data-tip="Show">${icon('eye')}</button></span></div></div>`;
export function wireEyes(root) {
  $$('[data-eye]', root).forEach((b) => b.onclick = () => {
    const i = $('#' + b.dataset.eye); const on = i.type === 'password'; i.type = on ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Hide password' : 'Show password'); b.dataset.tip = on ? 'Hide' : 'Show'; b.innerHTML = icon(on ? 'eye-off' : 'eye');
  });
}

// ───────── dates (JWT claims, UUID times) ─────────
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
function parts(ms) {
  const o = {}; for (const p of new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }).formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
function offset(ms) { const o = parts(ms); return Math.round((Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - Math.floor(ms / 1000) * 1000) / 60000); }
const fmtOff = (m) => (m ? `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? ':' + pad(Math.abs(m) % 60) : ''}` : 'UTC');
/** "Wed 11 Nov 2026, 22:46 (UTC+1)" in the local zone. */
export function fmtWhen(ms, { seconds = false, weekday = false, zone = true } = {}) {
  const o = parts(ms);
  return `${weekday ? o.weekday + ' ' : ''}${+o.day} ${MON[+o.month - 1]} ${o.year}, ${pad(+o.hour % 24)}:${o.minute}${seconds ? ':' + o.second : ''}${zone ? ` (${fmtOff(offset(ms))})` : ''}`;
}
const UNITS = [['year', 365.25 * 864e5], ['month', 30.44 * 864e5], ['day', 864e5], ['hour', 3600e3], ['minute', 60e3], ['second', 1e3]];
/** "in 30 days", "3 days ago"; parts=2 → "in 9 hours 30 minutes". */
export function relHuman(ms, { now = Date.now(), parts: n = 1 } = {}) {
  let d = ms - now; const fut = d > 0; d = Math.abs(d);
  if (d < 1500) return 'just now';
  if (d < 45e3 && n === 1) return fut ? 'in a few seconds' : 'a few seconds ago';
  const out = [];
  for (const [u, len] of UNITS) {
    if (out.length >= n) break;
    if (u === 'month' && !out.length && d < 45 * 864e5) continue;
    if (d >= len || (u === 'second' && !out.length)) {
      const k = out.length === n - 1 ? Math.round(d / len) : Math.floor(d / len);
      if (k > 0) { out.push(`${k.toLocaleString('en-US')} ${u}${k > 1 ? 's' : ''}`); d -= k * len; }
    } else if (out.length) break;
  }
  return fut ? `in ${out.join(' ')}` : `${out.join(' ')} ago`;
}
/** Seconds → "3 hours", "centuries"… for crack-time estimates. */
export function humanDuration(sec) {
  if (sec < 1) return 'instantly';
  if (sec < 60) return `${Math.round(sec)} seconds`;
  if (sec < 3600) return `${Math.round(sec / 60)} minutes`;
  if (sec < 86400) return `${Math.round(sec / 3600)} hours`;
  if (sec < 31557600) return `${Math.round(sec / 86400)} days`;
  const y = sec / 31557600;
  if (y < 1000) return `${Math.round(y)} years`;
  if (y < 1e6) return `${Math.round(y / 1000)} thousand years`;
  if (y < 1e9) return `${Math.round(y / 1e6)} million years`;
  if (y < 1.4e10) return `${Math.round(y / 1e9)} billion years`;
  return 'longer than the universe has existed';
}
export const rnd32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
/** Unbiased integer in [0, n) by rejection sampling. */
export function randInt(n) { const lim = Math.floor(0x100000000 / n) * n; let x; do { x = rnd32(); } while (x >= lim); return x % n; }
export { kbd as kbdHtml };
