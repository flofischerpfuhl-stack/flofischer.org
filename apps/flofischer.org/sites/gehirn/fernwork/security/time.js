// Developer ▸ Time: paste any timestamp (epoch s/ms/µs/ns, ISO variants, RFC 2822, HTTP, Apache, syslog, `date`, Excel,
// "tomorrow 9am") and see it in your zone, every format and around the world. DST cases are explained, never guessed.
import { icon, esc, $, $$, h, enhance, copyText, toast, openMenu, openPopover, store, isTyping, hasLayers, kbd } from '../kit/shell.js';
import { pasteBox, wirePaste, setBar, LOCAL_TZ, partsIn, offsetMin, wallToInstant, fmtOffset, fmtOffsetShort, zoneAbbr, cityOf, relHuman, isCoarse } from './util.js';

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ABBR = { UTC: 0, GMT: 0, UT: 0, Z: 0, WET: 0, WEST: 60, BST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180, IST: 330, SGT: 480, HKT: 480, CST: -360, CDT: -300, EST: -300, EDT: -240, MST: -420, MDT: -360, PST: -480, PDT: -420, AKST: -540, AKDT: -480, HST: -600, JST: 540, KST: 540, AEST: 600, AEDT: 660, NZST: 720, NZDT: 780 };
export const ZONES = ['UTC', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Vienna', 'Europe/Madrid', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/Mexico_City', 'America/New_York', 'America/Toronto', 'America/Sao_Paulo', 'America/Buenos_Aires'];

const S = { input: '', unit: null, zone: store.get('dev:time-zone') || LOCAL_TZ, zones: store.get('dev:zones') || [LOCAL_TZ, 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'], shift: 0, pick: 0, res: null };
let ctx, field, box;

// ───────────── parsing ─────────────
const offFrom = (z) => {
  if (z == null || z === '') return null; z = z.trim();
  if (/^z$/i.test(z)) return 0;
  const up = z.toUpperCase(); if (ABBR[up] != null) return ABBR[up];
  const m = /^(?:UTC|GMT)?([+-−])(\d{1,2}):?(\d{2})?$/i.exec(z); if (m) return (m[1] === '+' ? 1 : -1) * (+m[2] * 60 + +(m[3] || 0));
  return null;
};
function fromWall({ y, mo, d, hh = 0, mi = 0, s = 0, frac = '' }, off, kind, extra = {}) {
  const fracMs = frac ? +(frac + '000').slice(0, 3) : 0;
  const sub = frac.length > 3 ? frac.slice(3) : '';
  if (off != null) return { ms: Date.UTC(y, mo - 1, d, hh, mi, s) + fracMs - off * 60000, kind, zoneGiven: true, off, sub, prec: frac ? frac.length : null, ...extra };
  const w = wallToInstant(S.zone, y, mo, d, hh, mi, s, fracMs);
  return { ms: w.candidates.length > 1 ? w.candidates[S.pick] ?? w.candidates[0] : w.ms, kind, zoneGiven: false, wall: { y, mo, d, hh, mi, s }, cands: w.candidates, gap: w.gap, sub, prec: frac ? frac.length : null, ...extra };
}
const EPOCH_UNITS = { s: 'seconds', ms: 'milliseconds', 'µs': 'microseconds', ns: 'nanoseconds' };
function parseEpoch(t) {
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(t); if (!m) return null;
  const intLen = m[1].replace('-', '').length; if (intLen < 8 || intLen > 19) return null;
  const auto = intLen <= 10 ? 's' : intLen <= 13 ? 'ms' : intLen <= 16 ? 'µs' : 'ns';
  const unit = S.unit || auto;
  const big = BigInt(m[1]); let ms, sub = '';
  if (unit === 's') { ms = Number(big) * 1000 + (m[2] ? Math.round(+('0.' + m[2]) * 1000) : 0); sub = m[2] && m[2].length > 3 ? m[2].slice(3) : ''; }
  else if (unit === 'ms') ms = Number(big) + (m[2] ? +('0.' + m[2]) : 0);
  else if (unit === 'µs') { ms = Number(big / 1000n); sub = String(big % 1000n).padStart(3, '0'); }
  else { ms = Number(big / 1000000n); sub = String(big % 1000000n).padStart(6, '0'); }
  const y = new Date(ms).getUTCFullYear();
  const warn = (y > 2200 || y < 1970) && unit !== auto ? `That’s the year ${y.toLocaleString('en-US')}. With ${intLen} digits this looks like ${EPOCH_UNITS[auto]}.` : null;
  return { ms, kind: `Unix ${EPOCH_UNITS[unit]}`, epoch: true, unit, auto, zoneGiven: true, off: 0, utcInput: true, sub, warn, fixUnit: warn ? auto : null };
}
function natural(t) {
  const s = t.toLowerCase().trim(); const now = Date.now();
  if (s === 'now') return { ms: now, kind: 'Now', zoneGiven: true, natural: true };
  let m = /^in\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)$/.exec(s) || null;
  const U = { s: 1e3, m: 60e3, h: 3600e3, d: 864e5, w: 6048e5 };
  const uk = (u) => (u.startsWith('w') ? 'w' : u.startsWith('d') ? 'd' : u.startsWith('h') ? 'h' : u.startsWith('m') ? 'm' : 's');
  if (m) return { ms: now + +m[1] * U[uk(m[2])], kind: 'Relative time', zoneGiven: true, natural: true };
  m = /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\s+ago$/.exec(s);
  if (m) return { ms: now - +m[1] * U[uk(m[2])], kind: 'Relative time', zoneGiven: true, natural: true };
  m = /^(today|tomorrow|yesterday)(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/.exec(s);
  if (m) {
    const base = partsIn(S.zone, now + { today: 0, tomorrow: 864e5, yesterday: -864e5 }[m[1]]);
    let hh = m[2] ? +m[2] : 0; if (m[4] === 'pm' && hh < 12) hh += 12; if (m[4] === 'am' && hh === 12) hh = 0;
    return fromWall({ y: base.y, mo: base.mo, d: base.d, hh, mi: +(m[3] || 0) }, null, 'Plain words', { natural: true });
  }
  return null;
}
export function parseTime(raw) {
  const t = raw.trim(); if (!t) return null;
  let m;
  const ep = parseEpoch(t); if (ep) return ep;
  if ((m = /^(\d{5})(?:\.(\d+))?$/.exec(t))) { // Excel serial day (1900 system)
    const days = +t; const whole = Math.floor(days); const base = Date.UTC(1899, 11, 30) + whole * 864e5; const p = new Date(base);
    const secs = Math.round((days - whole) * 86400);
    return fromWall({ y: p.getUTCFullYear(), mo: p.getUTCMonth() + 1, d: p.getUTCDate(), hh: Math.floor(secs / 3600), mi: Math.floor(secs / 60) % 60, s: secs % 60 }, null, 'Excel serial date');
  }
  const nat = natural(t); if (nat) return nat;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:([T\s])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-−]\d{2}(?::?\d{2})?|UTC|GMT|[A-Z]{3,4})?$/i.exec(t))) {
    const off = offFrom(m[9]); const dateOnly = !m[5];
    const kind = dateOnly ? 'ISO date (no time → midnight)' : m[4] === ' ' ? `ISO-style date and time${m[8] && t.includes(',') ? ' (comma fraction)' : ''}` : 'ISO 8601';
    return fromWall({ y: +m[1], mo: +m[2], d: +m[3], hh: +(m[5] || 0), mi: +(m[6] || 0), s: +(m[7] || 0), frac: m[8] || '' }, off, kind, { zoneText: m[9] });
  }
  if ((m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/i.exec(t))) return fromWall({ y: +m[1], mo: +m[2], d: +m[3], hh: +m[4], mi: +m[5], s: +m[6] }, offFrom(m[7]), 'ISO 8601 basic', { zoneText: m[7] });
  if ((m = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([a-z]{1,5}|[+-]\d{4})?$/i.exec(t)) && MON[m[2].toLowerCase()]) {
    return fromWall({ y: +m[3], mo: MON[m[2].toLowerCase()], d: +m[1], hh: +m[4], mi: +m[5], s: +(m[6] || 0) }, offFrom(m[7]), /GMT$/i.test(t) ? 'HTTP date' : 'RFC 2822 date', { zoneText: m[7] });
  }
  if ((m = /(\d{2})\/([a-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})/i.exec(t)) && MON[m[2].toLowerCase()]) {
    return fromWall({ y: +m[3], mo: MON[m[2].toLowerCase()], d: +m[1], hh: +m[4], mi: +m[5], s: +m[6] }, offFrom(m[7]), 'Apache / nginx log time', { zoneText: m[7] });
  }
  if ((m = /^(?:mon|tue|wed|thu|fri|sat|sun)\s+([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(?:([a-z]{2,5})\s+)?(\d{4})$/i.exec(t)) && MON[m[1].toLowerCase()]) {
    return fromWall({ y: +m[7], mo: MON[m[1].toLowerCase()], d: +m[2], hh: +m[3], mi: +m[4], s: +m[5] }, offFrom(m[6]), 'Unix `date` output', { zoneText: m[6] });
  }
  if ((m = /^([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\b/i.exec(t)) && MON[m[1].toLowerCase()]) {
    const now = partsIn(S.zone, Date.now()); let y = now.y;
    const r = fromWall({ y, mo: MON[m[1].toLowerCase()], d: +m[2], hh: +m[3], mi: +m[4], s: +m[5], frac: m[6] || '' }, null, 'Syslog time (no year → this year)');
    if (r.ms > Date.now() + 2 * 864e5) return fromWall({ y: y - 1, mo: MON[m[1].toLowerCase()], d: +m[2], hh: +m[3], mi: +m[4], s: +m[5], frac: m[6] || '' }, null, 'Syslog time (no year → last year)');
    return r;
  }
  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t))) return fromWall({ y: +m[3], mo: +m[2], d: +m[1], hh: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) }, null, 'German date (day.month.year)');
  const js = Date.parse(t); if (!isNaN(js)) return { ms: js, kind: 'Date text', zoneGiven: /z|gmt|utc|[+-]\d{2}:?\d{2}/i.test(t) };
  return { error: true };
}
/** Find one timestamp inside a log line → { ms, match, idx } */
function findInLine(line) {
  const pats = [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?/, /\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s*[+-]\d{4}/, /^[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?/, /\b1[6-9]\d{8}(?:\d{3})?\b/];
  for (const re of pats) { const m = re.exec(line); if (m) { const r = parseTime(m[0]); if (r && !r.error) return { ...r, match: m[0], idx: m.index }; } }
  return null;
}

// ───────────── formatting ─────────────
const pad = (n, w = 2) => String(n).padStart(w, '0');
function isoLocal(ms, tz) { const p = partsIn(tz, ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${p.ms ? '.' + pad(p.ms, 3) : ''}${fmtOffset(offsetMin(tz, ms)).replace('−', '-')}`; }
function rfc2822(ms, tz) { const p = partsIn(tz, ms); return `${p.wd}, ${p.d} ${MONN[p.mo - 1]} ${p.y} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} ${fmtOffset(offsetMin(tz, ms), { colon: false }).replace('−', '-')}`; }
function isoWeek(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d)); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3);
  const fy = dt.getUTCFullYear(); const f = new Date(Date.UTC(fy, 0, 4)); return { wy: fy, w: 1 + Math.round(((dt - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7) };
}
const dayOfYear = (y, mo, d) => Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;

// ───────────── mount ─────────────
export async function mount(c) {
  ctx = c;
  ctx.renderHeader({ aside: `<span class="tm-now" id="tm-now" aria-live="off"></span>` });
  box = pasteBox({ id: 'tm-in', label: 'Timestamp or date', placeholder: 'Paste a timestamp or date: 1791879300, 2026-10-13 08:15, a log line…', extraActions: `<button class="fw-btn fw-btn--sm" type="button" id="tm-nowbtn" data-tip="Current time" data-tip-kbd="n">${icon('clock')}Now</button>` });
  box.classList.add('tm-box');
  box.querySelector('[data-bigpaste]').insertAdjacentHTML('afterend', `<button class="fw-btn fw-btn--lg sec-bignow" type="button" id="tm-nowbig">${icon('clock', { size: 20 })}Now</button>`);
  ctx.root.append(box);
  ctx.root.insertAdjacentHTML('beforeend', `<div id="tm-alert"></div><div id="tm-out" class="tm-out"></div>`);
  field = $('#tm-in');
  S.sync = wirePaste(box, { set: (v) => set(v), label: 'a timestamp', onClear: (old) => toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }) });
  field.addEventListener('input', () => { S.input = field.value; S.unit = null; S.pick = 0; S.shift = 0; update(); });
  $('#tm-nowbtn').onclick = () => set(String(Date.now()));
  $('#tm-nowbig').onclick = () => set(String(Date.now()));
  ctx.hooks.onPaste = (t) => { set(t); return true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping() && !hasLayers()) { e.preventDefault(); set(String(Date.now())); } });
  setInterval(tick, 1000); tick();
  const hash = location.hash.slice(1);
  set(ctx.params.get('q') || (/^\d{9,19}$/.test(hash) ? hash : ''));
  if (!isCoarse()) field.focus();
}
function set(v) { field.value = v; S.input = v; S.unit = null; S.pick = 0; S.shift = 0; S.sync(); update(); }
function tick() {
  const n = Date.now(); const el = $('#tm-now');
  if (el) el.innerHTML = `${icon('clock', { size: 14 })}<span>Now <b class="fw-num">${partsIn(LOCAL_TZ, n).h.toString().padStart(2, '0')}:${pad(partsIn(LOCAL_TZ, n).mi)}:${pad(partsIn(LOCAL_TZ, n).s)}</b> ${esc(zoneAbbr(LOCAL_TZ, n))}</span>`;
  $$('[data-rel]').forEach((e) => { e.textContent = relHuman(+e.dataset.rel, { parts: 2 }); });
}

function update() {
  const raw = S.input;
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length >= 2) return renderLog(lines);
  const r = raw.trim() ? parseTime(raw) : null;
  S.res = r;
  renderMeta(r);
  if (!r) return renderEmpty();
  if (r.error) return renderError();
  if (r.epoch) try { history.replaceState(null, '', `${location.pathname}${location.search}#${raw.trim()}`); } catch { /* */ }
  render(r);
}

function renderMeta(r) {
  const meta = box.querySelector('.fw-paste__meta');
  if (!r || r.error) { meta.innerHTML = `<span class="ins-privacy">${icon('lock', { size: 12 })} Read on this device</span>`; return; }
  const zoneChip = r.zoneGiven
    ? (r.epoch ? `<span class="tm-zone is-given">${icon('globe', { size: 14 })}Unix time is always UTC</span>` : r.natural ? '' : `<span class="tm-zone is-given">${icon('globe', { size: 14 })}Zone in input: ${esc(r.zoneText && !/^[+-−]/.test(r.zoneText) ? r.zoneText.toUpperCase() + ' · ' : '')}${esc(fmtOffset(r.off ?? 0))}</span>`)
    : `<span class="tm-zone is-assumed">${icon('globe', { size: 14 })}No zone → read as <b>${esc(cityOf(S.zone))}</b><button type="button" id="tm-zonebtn" aria-haspopup="dialog">change</button></span>`;
  meta.innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>Detected: ${esc(r.kind)}</span>${r.epoch ? '<button type="button" id="tm-unit" aria-haspopup="menu">change</button>' : ''}</span>${zoneChip}`;
  $('#tm-unit')?.addEventListener('click', (e) => openMenu(e.currentTarget, [{ group: 'Read the number as', items: ['s', 'ms', 'µs', 'ns'].map((u) => ({ label: `Unix ${EPOCH_UNITS[u]}`, hint: u === r.auto ? 'by length' : '', checked: (S.unit || r.auto) === u, onSelect: () => { S.unit = u; update(); } })) }]));
  $('#tm-zonebtn')?.addEventListener('click', (e) => zonePicker(e.currentTarget, (tz) => { S.zone = tz; store.set('dev:time-zone', tz); update(); }, 'Read dates without a zone as'));
}

function zonePicker(anchor, onPick, title) {
  const now = Date.now();
  const content = h(`<div class="tm-picker"><div class="tm-picker__title">${esc(title)}</div><div class="fw-inputwrap"><span data-icon="search"></span><input class="fw-input" placeholder="City or zone" aria-label="Search zones" autofocus></div><div class="tm-picker__list" role="listbox"></div></div>`);
  const list = content.querySelector('.tm-picker__list'); const inp = content.querySelector('input');
  const draw = () => {
    const q = inp.value.toLowerCase();
    list.innerHTML = ZONES.filter((z) => !q || z.toLowerCase().replace(/_/g, ' ').includes(q) || zoneAbbr(z, now).toLowerCase() === q)
      .map((z) => `<button type="button" class="tm-picker__opt" role="option" data-tz="${esc(z)}"><span>${esc(cityOf(z))}</span><span class="fw-faint fw-t-xs">${esc(z.split('/')[0])}</span><span class="fw-mono fw-t-sm">${esc(fmtOffsetShort(offsetMin(z, now)))}</span></button>`).join('') || '<div class="fw-faint fw-t-sm" style="padding:8px">No match</div>';
  };
  draw(); inp.addEventListener('input', draw);
  const p = openPopover(anchor, content, { placement: 'bottom-start', width: 300, label: title });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-tz]'); if (b) { p.close(); onPick(b.dataset.tz); } });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('[data-tz]')?.click(); });
}

function rowsFor(ms, r) {
  const p = partsIn(LOCAL_TZ, ms); const wk = isoWeek(p.y, p.mo, p.d);
  const s = Math.floor(ms / 1000);
  const rows = [
    ['Unix seconds', String(s)], ['Unix milliseconds', String(Math.floor(ms))],
    r.sub ? ['Unix nanoseconds', `${Math.floor(ms)}${(r.sub + '000000').slice(0, 6)}`] : null,
    ['ISO 8601 UTC', new Date(ms).toISOString().replace('.000Z', 'Z')],
    [`ISO 8601 local`, isoLocal(ms, LOCAL_TZ)],
    ['RFC 2822', rfc2822(ms, LOCAL_TZ)],
    ['HTTP date', new Date(ms).toUTCString()],
    ['Week · day', `${wk.wy}-W${pad(wk.w)} · ${DAYN[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]} · day ${dayOfYear(p.y, p.mo, p.d)}`, true],
  ].filter(Boolean);
  return rows;
}
function render(r) {
  const ms = r.ms; const tz = LOCAL_TZ; const p = partsIn(tz, ms); const off = offsetMin(tz, ms);
  // DST / plausibility alerts next to the cause
  const al = $('#tm-alert');
  if (r.warn) al.innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(r.warn)}<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" id="tm-fix">Read as ${esc(EPOCH_UNITS[r.fixUnit])}</button></div></div></div>`;
  else if (r.cands?.length > 1) {
    const [a, b] = r.cands; const w = r.wall;
    al.innerHTML = `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('clock')}</span><div class="fw-alert__body"><b>${pad(w.hh)}:${pad(w.mi)} happens twice in ${esc(cityOf(S.zone))} on ${w.d} ${MONN[w.mo - 1]} ${w.y}</b>: clocks go back from ${esc(zoneAbbr(S.zone, a))} to ${esc(zoneAbbr(S.zone, b))}. Which one?
      <div class="fw-alert__actions"><div class="fw-seg fw-seg--sm" id="tm-pick" aria-label="Which occurrence">${[a, b].map((c, i) => `<button class="fw-seg__opt" type="button" data-value="${i}" aria-checked="${S.pick === i}">${i ? 'Second' : 'First'} · ${esc(zoneAbbr(S.zone, c))} ${esc(fmtOffset(offsetMin(S.zone, c)))}</button>`).join('')}</div></div></div></div>`;
  } else if (r.gap) {
    const w = r.wall; al.innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><b>${pad(w.hh)}:${pad(w.mi)} doesn’t exist in ${esc(cityOf(S.zone))} on ${w.d} ${MONN[w.mo - 1]} ${w.y}</b>: clocks jump forward an hour. Read as ${esc(partsIn(S.zone, ms).h)}:${pad(partsIn(S.zone, ms).mi)} ${esc(zoneAbbr(S.zone, ms))}.</div></div>`;
  } else al.innerHTML = '';
  enhance(al);
  $('#tm-fix')?.addEventListener('click', () => { S.unit = r.fixUnit; update(); });
  $('#tm-pick')?.addEventListener('fw-change', (e) => { S.pick = +e.detail.value; update(); });

  const copyMain = r.epoch ? isoLocal(ms, tz) : String(Math.floor(ms / 1000));
  const copyLabel = r.epoch ? 'Copy ISO' : 'Copy Unix';
  const frac = r.sub ? `.${pad(Math.floor(ms % 1000), 3)}${r.sub}` : (ms % 1000 || r.prec || (r.epoch && r.unit !== 's')) ? `.${pad(Math.floor(ms % 1000), 3)}` : '';
  const readAs = !r.zoneGiven && S.zone !== tz ? `<span class="tm-readas">Read as ${esc(cityOf(S.zone))} time (${esc(zoneAbbr(S.zone, ms))}) = ${pad(partsIn(S.zone, ms).h)}:${pad(partsIn(S.zone, ms).mi)} there</span>` : '';
  const rows = rowsFor(ms, r);
  $('#tm-out').innerHTML = `<section class="fw-hero tm-hero">
      <span class="fw-hero__label">${DAYN[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]} ${p.d} ${MONN[p.mo - 1]} ${p.y}</span>
      <div class="fw-hero__value tm-clock">${pad(p.h)}:${pad(p.mi)}<span class="tm-sec">:${pad(p.s)}${esc(frac)}</span></div>
      <div class="tm-zoneline"><span class="fw-badge fw-badge--accent">${icon('globe', { size: 12 })}${esc(LOCAL_TZ.replace(/_/g, ' '))}</span><span>${esc(zoneAbbr(tz, ms))} · UTC${esc(fmtOffset(off))}</span><span class="tm-rel" data-rel="${ms}">${esc(relHuman(ms, { parts: 2 }))}</span></div>
      ${readAs}
      <div class="fw-hero__actions i-desktop-actions"><button class="fw-btn fw-btn--primary" type="button" id="tm-copy" data-copy="${esc(copyMain)}">${icon('copy')}<span>${copyLabel}</span></button>
        <button class="fw-btn" type="button" data-copy="${esc(r.epoch ? new Date(ms).toISOString() : String(Math.floor(ms)))}">${icon('copy')}<span>${r.epoch ? 'Copy UTC' : 'Copy ms'}</span></button>
        <button class="fw-btn fw-btn--ghost" type="button" id="tm-share">${icon('link')}<span>Copy link</span></button></div>
    </section>
    <div class="fw-rows tm-rows">${rows.map(([l, v, sans]) => `<div class="fw-vrow ${r.epoch && l.toLowerCase().includes(EPOCH_UNITS[r.unit]) ? 'is-input' : ''}"><span class="fw-vrow__label">${esc(l)}</span><span class="fw-vrow__value ${sans ? 'fw-vrow__value--sans' : ''}">${esc(v)}</span><button class="fw-iconbtn fw-iconbtn--sm fw-copy" type="button" data-copy="${esc(v)}" aria-label="Copy ${esc(l)}" data-tip="Copy">${icon('copy')}</button></div>`).join('')}</div>
    ${zonesHtml(ms)}`;
  enhance($('#tm-out'));
  $('#tm-share').onclick = (e) => copyText(`${location.origin}${location.pathname}?leaf=time#${Math.floor(ms / 1000)}`, e.currentTarget);
  wireZones(ms);
  setBar({ line: isoLocal(ms, tz), sub: relHuman(ms, { parts: 2 }), actions: [{ label: copyLabel, icon: 'copy', primary: true, onClick: (b) => copyText(copyMain, b) }] });
}

// ───────────── zones + meeting slider ─────────────
function stripHtml(tz, at) {
  const p = partsIn(tz, at); const pos = ((p.h + p.mi / 60) / 24) * 100;
  return `<div class="tm-strip" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<span class="${i < 6 || i >= 22 ? 'n' : i < 8 || i >= 18 ? 'e' : 'w'}"></span>`).join('')}<i style="left:${pos}%"></i></div>`;
}
function zonesHtml(ms) {
  const at = ms + S.shift * 60e3;
  const base = partsIn(LOCAL_TZ, at);
  const rows = S.zones.map((tz) => {
    const p = partsIn(tz, at); const dd = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(base.y, base.mo - 1, base.d)) / 864e5);
    const work = p.h >= 8 && p.h < 18;
    return `<div class="tm-zrow ${tz === LOCAL_TZ ? 'is-you' : ''}" data-tz="${esc(tz)}">
      <div class="tm-zrow__city"><b>${esc(cityOf(tz))}</b><span>${esc(zoneAbbr(tz, at))} · ${esc(fmtOffsetShort(offsetMin(tz, at)))}${tz === LOCAL_TZ ? ' · you' : ''}</span></div>
      <div class="tm-zrow__time fw-num">${pad(p.h)}:${pad(p.mi)}${dd ? `<small>${dd > 0 ? '+' : '−'}${Math.abs(dd)} day</small>` : ''}</div>
      ${stripHtml(tz, at)}
      <span class="tm-zrow__state ${work ? 'is-work' : ''}">${work ? 'Working hours' : p.h < 6 || p.h >= 22 ? 'Night' : p.h < 8 ? 'Early' : 'Evening'}</span>
      ${tz === LOCAL_TZ ? '<span class="tm-zrow__x"></span>' : `<button class="fw-iconbtn fw-iconbtn--sm tm-zrow__x" type="button" data-rmz="${esc(tz)}" aria-label="Remove ${esc(cityOf(tz))}" data-tip="Remove">${icon('x')}</button>`}
    </div>`;
  }).join('');
  const sh = S.shift; const shTxt = sh ? `${sh > 0 ? '+' : '−'}${Math.floor(Math.abs(sh) / 60)} h${Math.abs(sh) % 60 ? ' ' + (Math.abs(sh) % 60) + ' min' : ''}` : 'At the time above';
  return `<section class="fw-card tm-zones" id="tm-zones">
    <div class="tm-zones__head"><h2>Around the world</h2><span class="fw-spacer"></span><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="tm-addz">${icon('plus')}Add city</button></div>
    <div class="tm-zones__rows">${rows}</div>
    <div class="tm-plan">
      <label class="tm-plan__label" for="tm-shift">${icon('hand', { size: 14 })}<span>Drag to plan a meeting</span><b id="tm-shift-v">${esc(shTxt)}</b></label>
      <input type="range" class="gen-range tm-range" id="tm-shift" min="-1440" max="1440" step="15" value="${sh}" style="--p:${((sh + 1440) / 2880) * 100}%" aria-valuetext="${esc(shTxt)}">
      <div class="tm-plan__ticks" aria-hidden="true"><span>−24 h</span><span>−12 h</span><span>input</span><span>+12 h</span><span>+24 h</span></div>
      ${sh ? `<button class="fw-btn fw-btn--sm" type="button" id="tm-shift-reset">${icon('rotate-ccw')}Back to input</button>` : ''}
    </div>
  </section>`;
}
function wireZones(ms) {
  const r = $('#tm-shift');
  r.addEventListener('input', () => {
    S.shift = +r.value; r.style.setProperty('--p', ((S.shift + 1440) / 2880) * 100 + '%');
    const sec = $('#tm-zones'); const next = h(zonesHtml(ms)); sec.querySelector('.tm-zones__rows').replaceWith(next.querySelector('.tm-zones__rows'));
    const sh = S.shift; $('#tm-shift-v').textContent = sh ? `${sh > 0 ? '+' : '−'}${Math.floor(Math.abs(sh) / 60)} h${Math.abs(sh) % 60 ? ' ' + (Math.abs(sh) % 60) + ' min' : ''}` : 'At the time above';
    enhance(sec); wireRm(ms);
  });
  r.addEventListener('change', () => { const sec = $('#tm-zones'); sec.replaceWith(h(zonesHtml(ms))); enhance($('#tm-zones')); wireZones(ms); });
  $('#tm-shift-reset')?.addEventListener('click', () => { S.shift = 0; $('#tm-zones').replaceWith(h(zonesHtml(ms))); enhance($('#tm-zones')); wireZones(ms); });
  $('#tm-addz').onclick = (e) => zonePicker(e.currentTarget, (tz) => { if (!S.zones.includes(tz)) S.zones.push(tz); store.set('dev:zones', S.zones); $('#tm-zones').replaceWith(h(zonesHtml(ms))); enhance($('#tm-zones')); wireZones(ms); }, 'Add a city');
  wireRm(ms);
}
function wireRm(ms) {
  $$('[data-rmz]').forEach((b) => b.onclick = () => {
    const tz = b.dataset.rmz; const old = [...S.zones]; S.zones = S.zones.filter((z) => z !== tz); store.set('dev:zones', S.zones);
    $('#tm-zones').replaceWith(h(zonesHtml(ms))); enhance($('#tm-zones')); wireZones(ms);
    toast(`Removed ${cityOf(tz)}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.zones = old; store.set('dev:zones', old); update(); } } });
  });
}

// ───────────── log mode ─────────────
function renderLog(lines) {
  renderMeta(null); $('#tm-alert').innerHTML = '';
  const meta = box.querySelector('.fw-paste__meta');
  const found = lines.map((l) => ({ l, r: findInLine(l) }));
  const n = found.filter((x) => x.r).length;
  meta.innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>Detected: log with ${n} timestamp${n === 1 ? '' : 's'} in ${lines.length} lines</span></span>`;
  const first = found.find((x) => x.r)?.r.ms;
  let prev = null;
  $('#tm-out').innerHTML = `<section class="fw-card tm-log"><div class="tm-log__head"><h2>Each line in your time</h2><span class="fw-faint fw-t-sm">${esc(LOCAL_TZ.replace(/_/g, ' '))} · gaps between lines</span></div>
    <div class="tm-log__rows">${found.map(({ l, r }) => {
      if (!r) return `<div class="tm-logrow is-none"><span class="tm-logrow__when">—</span><code class="tm-logrow__line">${esc(l)}</code><span></span></div>`;
      const gap = prev != null ? r.ms - prev : null; prev = r.ms; const p = partsIn(LOCAL_TZ, r.ms);
      const hl = esc(l.slice(0, r.idx)) + `<mark>${esc(r.match)}</mark>` + esc(l.slice(r.idx + r.match.length));
      return `<div class="tm-logrow"><span class="tm-logrow__when fw-num">${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}.${pad(p.ms, 3)}</span><code class="tm-logrow__line">${hl}</code><span class="tm-logrow__gap fw-num ${gap > 2000 ? 'is-slow' : ''}">${gap == null ? 'start' : `+${gap >= 1000 ? (gap / 1000).toFixed(gap >= 10000 ? 1 : 3) + ' s' : Math.round(gap) + ' ms'}`}</span></div>`;
    }).join('')}</div>
    <div class="tm-log__foot fw-t-sm fw-muted">${first ? `First line ${esc(relHuman(first))} · ${prev && first ? `span ${((prev - first) / 1000).toFixed(3)} s` : ''}` : ''}</div></section>`;
  setBar(null);
}
function renderError() {
  $('#tm-alert').innerHTML = '';
  $('#tm-out').innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><b>Can’t read this as a time.</b> Try a Unix number (1791879300), an ISO date (2026-10-13 08:15), a log line, or words like “tomorrow 9am”.</div></div>`;
  setBar(null);
}
function renderEmpty() {
  $('#tm-alert').innerHTML = ''; setBar(null);
  const now = Date.now();
  const ex = [String(Math.floor(now / 1000)), String(now), '2026-10-25 02:30', '13/Oct/2026:08:15:00 +0200', 'Oct 13 08:15:02', 'Tue Oct 13 08:15:00 CEST 2026', 'tomorrow 9am', '46308.34375'];
  $('#tm-out').innerHTML = `<section class="ins-empty tm-empty"><h2 class="ins-empty__title">Paste any timestamp and see it in your time.</h2>
    <p class="ins-empty__text">Unix seconds, milliseconds, micro- and nanoseconds are told apart by length. Dates without a zone are read as ${esc(cityOf(S.zone))} time, and you can change that.</p>
    <div class="tm-examples">${ex.map((x) => `<button class="fw-chip fw-mono" type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div></section>
    ${zonesHtml(now)}`;
  enhance($('#tm-out'));
  $$('[data-ex]').forEach((b) => b.onclick = () => set(b.dataset.ex));
  wireZones(now);
}
