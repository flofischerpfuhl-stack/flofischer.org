// Developer · shared helpers: dates/zones, relative time, secret copy with clipboard wipe, mobile bar, paste box.
import { icon, esc, $, h, toast, copyText, isCoarse, kbd, enhance } from '../kit/shell.js';

export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';

// ───────────── zones ─────────────
const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) dtfCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }));
  return dtfCache.get(tz);
}
/** Wall-clock parts of instant `ms` in zone `tz`. */
export function partsIn(tz, ms) {
  const o = {}; for (const p of dtf(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday, ms: ((ms % 1000) + 1000) % 1000 };
}
/** UTC offset of `tz` at instant `ms`, in minutes (Berlin summer → 120). */
export function offsetMin(tz, ms) {
  const p = partsIn(tz, ms);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - (Math.floor(ms / 1000) * 1000)) / 60000);
}
/**
 * Wall time in a zone → instant(s). Returns { ms, candidates: [ms…], gap: bool }.
 * Two candidates = the time occurs twice (DST ends); gap = it never occurs (DST starts) and we move forward.
 */
export function wallToInstant(tz, y, mo, d, hh = 0, mi = 0, s = 0, frac = 0) {
  const guess = Date.UTC(y, mo - 1, d, hh, mi, s) + frac;
  const offs = [...new Set([offsetMin(tz, guess - 14 * 3600e3), offsetMin(tz, guess), offsetMin(tz, guess + 14 * 3600e3)])];
  const cands = [];
  for (const o of offs) {
    const c = guess - o * 60000; const p = partsIn(tz, c);
    if (p.y === y && p.mo === mo && p.d === d && p.h === hh && p.mi === mi && p.s === s && !cands.includes(c)) cands.push(c);
  }
  cands.sort((a, b) => a - b);
  if (cands.length) return { ms: cands[0], candidates: cands, gap: false };
  return { ms: guess - offsetMin(tz, guess - 14 * 3600e3) * 60000, candidates: [], gap: true };
}
export const fmtOffset = (min, { colon = true } = {}) => {
  const sgn = min < 0 ? '−' : '+'; const a = Math.abs(min);
  return `${sgn}${String(Math.floor(a / 60)).padStart(2, '0')}${colon ? ':' : ''}${String(a % 60).padStart(2, '0')}`;
};
export const fmtOffsetShort = (min) => { if (!min) return 'UTC'; const sgn = min < 0 ? '−' : '+'; const a = Math.abs(min); return `UTC${sgn}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`; };
/** Zone abbreviation where one is common (CEST, EDT, BST, JST…), else UTC±h. */
export function zoneAbbr(tz, ms) {
  for (const loc of ['en-US', 'en-GB', 'en-IN', 'en-AU', 'ja-JP-u-ca-gregory']) {
    try {
      const n = new Intl.DateTimeFormat(loc === 'ja-JP-u-ca-gregory' ? 'en-US' : loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value;
      if (n && !/^(GMT|UTC)/.test(n)) return n;
    } catch { /* */ }
  }
  if (tz === 'Asia/Tokyo') return 'JST';
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  return fmtOffsetShort(offsetMin(tz, ms));
}
export const cityOf = (tz) => (tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace(/_/g, ' '));

// ───────────── formatting ─────────────
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** "11 Nov 2026, 22:46" in zone (default local) + optional "(UTC+1)". */
export function fmtWhen(ms, { tz = LOCAL_TZ, seconds = false, zone = true, weekday = false } = {}) {
  const p = partsIn(tz, ms);
  return `${weekday ? p.wd + ' ' : ''}${p.d} ${MON[p.mo - 1]} ${p.y}, ${pad(p.h)}:${pad(p.mi)}${seconds ? ':' + pad(p.s) : ''}${zone ? ` (${fmtOffsetShort(offsetMin(tz, ms))})` : ''}`;
}
export const fmtClock = (ms, tz = LOCAL_TZ, sec = false) => { const p = partsIn(tz, ms); return `${pad(p.h)}:${pad(p.mi)}${sec ? ':' + pad(p.s) : ''}`; };
const UNITS = [['year', 365.25 * 864e5], ['month', 30.44 * 864e5], ['day', 864e5], ['hour', 3600e3], ['minute', 60e3], ['second', 1e3]];
/** "in 30 days", "3 days ago", "1 min ago"; parts=2 → "in 9 hours 30 minutes". */
export function relHuman(ms, { now = Date.now(), parts = 1, short = false } = {}) {
  let d = ms - now; const fut = d > 0; d = Math.abs(d);
  if (d < 1500) return 'just now';
  if (d < 45e3 && parts === 1) return fut ? 'in a few seconds' : 'a few seconds ago';
  const out = [];
  for (const [u, len] of UNITS) {
    if (out.length >= parts) break;
    if (u === 'month' && !out.length && d < 45 * 864e5) continue;
    if (d >= len || (u === 'second' && !out.length)) {
      const n = out.length === parts - 1 ? Math.round(d / len) : Math.floor(d / len);
      if (n > 0) { out.push(`${n.toLocaleString('en-US')} ${short ? { year: 'y', month: 'mo', week: 'w', day: 'd', hour: 'h', minute: 'min', second: 's' }[u] : u + (n > 1 ? 's' : '')}`); d -= n * len; }
    } else if (out.length) break;
  }
  const s = out.join(' ');
  return fut ? `in ${s}` : `${s} ago`;
}
/** Seconds → "centuries", "3 hours", … for crack-time estimates. */
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
  return 'longer than the universe exists';
}

// ───────────── secret copy: "Copied · clears in 60 s" ─────────────
let wipe = null;
/** Copy a secret, show a live countdown on the button and wipe the clipboard after `seconds` (if it still holds it). */
export async function copySecret(text, btn, { seconds = 60, label = 'Copy' } = {}) {
  try { await navigator.clipboard.writeText(text); } catch { await copyText(text); }
  if (wipe) wipe.cancel();
  let left = seconds; const end = Date.now() + seconds * 1000;
  const paint = () => { if (!btn?.isConnected) return; btn.classList.add('is-copied'); btn.innerHTML = `${icon('check')}<span>Copied · clears in ${left} s</span>`; };
  const restore = () => { if (!btn?.isConnected) return; btn.classList.remove('is-copied'); btn.innerHTML = `${icon('copy')}<span>${esc(label)}</span>`; };
  paint();
  const t = setInterval(async () => {
    left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); paint();
    if (left <= 0) {
      clearInterval(t); wipe = null;
      try { const cur = await navigator.clipboard.readText(); if (cur === text) await navigator.clipboard.writeText(''); } catch { /* no permission: best effort */ }
      if (btn?.isConnected) { btn.innerHTML = `${icon('shield-check')}<span>Clipboard cleared</span>`; setTimeout(restore, 2000); }
    }
  }, 250);
  wipe = { cancel: () => { clearInterval(t); restore(); }, text };
  return true;
}
addEventListener('pagehide', () => { if (wipe) { try { navigator.clipboard.writeText(''); } catch { /* */ } } });
/** Re-label a copy button that was replaced (e.g. after re-render) so the countdown continues on the new node. */
export const secretPending = () => wipe?.text;

// ───────────── mobile sticky bar (one per page) ─────────────
/** setBar({ line, sub, actions: [{ id, label, icon, primary, onClick, iconOnly, tip }] }) or setBar(null). */
export function setBar(spec) {
  const wrap = $('#mbar');
  if (!spec) { wrap.hidden = true; document.body.style.removeProperty('--toast-offset'); return; }
  wrap.hidden = false; document.body.style.setProperty('--toast-offset', '72px');
  $('#mbar-line').textContent = spec.line || ''; $('#mbar-sub').textContent = spec.sub || ''; $('#mbar-sub').hidden = !spec.sub;
  const acts = $('#mbar-actions'); acts.innerHTML = '';
  for (const a of spec.actions || []) {
    const b = h(`<button class="${a.iconOnly ? 'fw-iconbtn fw-iconbtn--outline sec-mbar__icon' : `fw-btn ${a.primary ? 'fw-btn--primary' : ''} fw-btn--lg`}" type="button" ${a.id ? `id="${a.id}"` : ''} ${a.iconOnly ? `aria-label="${esc(a.label)}"` : ''}>${icon(a.icon || 'copy', { size: a.iconOnly ? 20 : 16 })}${a.iconOnly ? '' : `<span>${esc(a.label)}</span>`}</button>`);
    b.onclick = (e) => a.onClick(e.currentTarget);
    acts.append(b);
  }
}

// ───────────── paste box (kit PasteIntake + big touch Paste button) ─────────────
/**
 * pasteBox({ id, label, placeholder, rows, mono, sample }) → element. Desktop: small Paste/Clear inside the box.
 * Touch: a big full-width Paste button under the box (thumb reach), because typing tokens on a phone is hopeless.
 */
export function pasteBox({ id, label, placeholder = '', mono = true, cls = '', extraActions = '' }) {
  const el = h(`<div class="fw-paste sec-paste ${cls}">
    <div class="fw-paste__box">
      <label class="fw-sr" for="${id}">${esc(label)}</label>
      <div class="sec-mirror" aria-hidden="true"></div>
      <textarea class="fw-paste__field ${mono ? '' : 'sec-sans'}" id="${id}" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="${esc(placeholder)}"></textarea>
      <div class="fw-paste__actions">
        ${extraActions}
        <button class="fw-btn fw-btn--sm sec-paste-btn" type="button" data-paste><span data-icon="clipboard-paste"></span>Paste</button>
        <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-clear aria-label="Clear" data-tip="Clear" hidden><span data-icon="x"></span></button>
      </div>
    </div>
    <button class="fw-btn fw-btn--lg fw-btn--block sec-bigpaste" type="button" data-bigpaste><span data-icon="clipboard-paste" data-size="20"></span>Paste</button>
    <div class="fw-paste__meta"></div>
  </div>`);
  enhance(el);
  return el;
}
/** Wire paste/clear for a pasteBox. `set(v)` must update the field and re-render. */
export function wirePaste(el, { set, onClear, label = 'text' }) {
  const ta = el.querySelector('textarea');
  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) set(t, { pasted: true }); else toast('The clipboard is empty', { type: 'info' }); }
    catch { ta.focus(); toast(`Press ${kbd('mod+v').replace(/<[^>]+>/g, '')} to paste ${label}`, { type: 'info' }); }
  };
  el.querySelector('[data-paste]').onclick = paste;
  el.querySelector('[data-bigpaste]').onclick = paste;
  el.querySelector('[data-clear]').onclick = () => { const old = ta.value; set(''); ta.focus(); onClear?.(old); };
  const sync = () => {
    const has = !!ta.value.trim();
    el.querySelector('[data-clear]').hidden = !has;
    el.querySelector('[data-paste]').hidden = has;
    el.classList.toggle('has-value', has);
  };
  ta.addEventListener('input', sync);
  return sync;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { isCoarse };
