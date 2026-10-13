// Timestamp engine: zones (Intl, every IANA zone), DST-aware wall time → instant, and a parser for the formats people
// paste (Unix s/ms/µs/ns told apart by length, ISO 8601, RFC 2822, HTTP, Apache/nginx, syslog, `date`, Excel serial,
// German day.month.year, "now", "tomorrow 9am", "in 3 days"). Pure functions, no DOM.

export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const ALL_ZONES = (() => {
  let z = []; try { z = Intl.supportedValuesOf('timeZone'); } catch { /* old browser */ }
  if (!z.length) z = ['Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];
  return [...new Set(['UTC', LOCAL_TZ, ...z])];
})();

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
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}
/** Wall time in a zone → { ms, candidates, gap }. Two candidates: the time happens twice (clocks go back). gap: it never happens. */
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
export function zoneAbbr(tz, ms) {
  for (const loc of ['en-US', 'en-GB', 'en-IN', 'en-AU']) {
    try {
      const n = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value;
      if (n && !/^(GMT|UTC)/.test(n)) return n;
    } catch { /* */ }
  }
  if (tz === 'Asia/Tokyo') return 'JST';
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  return fmtOffsetShort(offsetMin(tz, ms));
}
export const cityOf = (tz) => (tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace(/_/g, ' '));

const UNITS = [['year', 365.25 * 864e5], ['month', 30.44 * 864e5], ['day', 864e5], ['hour', 3600e3], ['minute', 60e3], ['second', 1e3]];
/** "in 30 days", "3 days ago"; parts=2 → "in 9 hours 30 minutes". */
export function relHuman(ms, { now = Date.now(), parts = 1 } = {}) {
  let d = ms - now; const fut = d > 0; d = Math.abs(d);
  if (d < 1500) return 'just now';
  const out = [];
  for (const [u, len] of UNITS) {
    if (out.length >= parts) break;
    if (u === 'month' && !out.length && d < 45 * 864e5) continue;
    if (d >= len || (u === 'second' && !out.length)) {
      const n = out.length === parts - 1 ? Math.round(d / len) : Math.floor(d / len);
      if (n > 0) { out.push(`${n.toLocaleString('en-US')} ${u}${n > 1 ? 's' : ''}`); d -= n * len; }
    } else if (out.length) break;
  }
  return fut ? `in ${out.join(' ')}` : `${out.join(' ')} ago`;
}

// ───────────── parsing ─────────────
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export const MONN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ABBR = { UTC: 0, GMT: 0, UT: 0, Z: 0, WET: 0, WEST: 60, BST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180, IST: 330, SGT: 480, HKT: 480, CST: -360, CDT: -300, EST: -300, EDT: -240, MST: -420, MDT: -360, PST: -480, PDT: -420, AKST: -540, AKDT: -480, HST: -600, JST: 540, KST: 540, AEST: 600, AEDT: 660, NZST: 720, NZDT: 780 };
export const EPOCH_UNITS = { s: 'seconds', ms: 'milliseconds', 'µs': 'microseconds', ns: 'nanoseconds' };
const daysIn = (y, mo) => [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
const validWall = ({ y, mo, d, hh = 0, mi = 0, s = 0 }) => mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo) && hh <= 23 && mi <= 59 && s <= 59;

const offFrom = (z) => {
  if (z == null || z === '') return null; z = z.trim();
  if (/^z$/i.test(z)) return 0;
  const up = z.toUpperCase(); if (ABBR[up] != null) return ABBR[up];
  const m = /^(?:UTC|GMT)?([+-−])(\d{1,2}):?(\d{2})?$/i.exec(z); if (m) return (m[1] === '+' ? 1 : -1) * (+m[2] * 60 + +(m[3] || 0));
  return null;
};

/**
 * parseTime(text, { zone, unit, pick }) → result | { error, why } | null
 * zone: how to read dates without a zone. unit: force an epoch unit. pick: 0/1 for a time that happens twice.
 * result: { ms, kind, epoch?, unit?, auto?, zoneGiven, off?, wall?, cands?, gap?, sub?, warn?, fixUnit? }
 */
export function parseTime(raw, { zone = LOCAL_TZ, unit = null, pick = 0 } = {}) {
  const t = String(raw || '').trim(); if (!t) return null;
  const fromWall = (w, off, kind, extra = {}) => {
    if (!validWall(w)) return { error: true, why: `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')} ${w.hh != null ? `${String(w.hh).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}` : ''} is not a real date or time.`.replace(/\s+is/, ' is') };
    const frac = w.frac || '';
    const fracMs = frac ? +(frac + '000').slice(0, 3) : 0;
    const sub = frac.length > 3 ? frac.slice(3) : '';
    const { y, mo, d, hh = 0, mi = 0, s = 0 } = w;
    if (off != null) return { ms: Date.UTC(y, mo - 1, d, hh, mi, s) + fracMs - off * 60000, kind, zoneGiven: true, off, sub, prec: frac ? frac.length : null, ...extra };
    const r = wallToInstant(zone, y, mo, d, hh, mi, s, fracMs);
    return { ms: r.candidates.length > 1 ? r.candidates[pick] ?? r.candidates[0] : r.ms, kind, zoneGiven: false, wall: { y, mo, d, hh, mi, s }, cands: r.candidates, gap: r.gap, sub, prec: frac ? frac.length : null, ...extra };
  };
  let m;
  // Unix epoch (8–19 digits): unit by length unless forced
  if ((m = /^(-?\d+)(?:\.(\d+))?$/.exec(t)) && m[1].replace('-', '').length >= 8 && m[1].replace('-', '').length <= 19) {
    const intLen = m[1].replace('-', '').length;
    const auto = intLen <= 10 ? 's' : intLen <= 13 ? 'ms' : intLen <= 16 ? 'µs' : 'ns';
    const u = unit || auto;
    const big = BigInt(m[1]); let ms, sub = '';
    if (u === 's') { ms = Number(big) * 1000 + (m[2] ? Math.round(+('0.' + m[2]) * 1000) : 0); sub = m[2] && m[2].length > 3 ? m[2].slice(3) : ''; }
    else if (u === 'ms') ms = Number(big) + (m[2] ? +('0.' + m[2]) : 0);
    else if (u === 'µs') { ms = Number(big / 1000n); sub = String(big % 1000n).padStart(3, '0'); }
    else { ms = Number(big / 1000000n); sub = String(big % 1000000n).padStart(6, '0'); }
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return { error: true, why: 'That number is outside the supported date range.' };
    const y = new Date(ms).getUTCFullYear();
    const warn = (y > 2200 || y < 1970) && u !== auto ? `That’s the year ${y.toLocaleString('en-US')}. With ${intLen} digits this looks like ${EPOCH_UNITS[auto]}.` : null;
    return { ms, kind: `Unix ${EPOCH_UNITS[u]}`, epoch: true, unit: u, auto, zoneGiven: true, off: 0, sub, warn, fixUnit: warn ? auto : null };
  }
  // short numbers: seconds since 1970 too (e.g. 0, 86400) when explicitly asked, else Excel serial for 5 digits
  if ((m = /^(\d{5})(?:\.(\d+))?$/.exec(t)) && !unit) {
    const days = +t; const whole = Math.floor(days); const p = new Date(Date.UTC(1899, 11, 30) + whole * 864e5);
    const secs = Math.round((days - whole) * 86400);
    return fromWall({ y: p.getUTCFullYear(), mo: p.getUTCMonth() + 1, d: p.getUTCDate(), hh: Math.floor(secs / 3600), mi: Math.floor(secs / 60) % 60, s: secs % 60 }, null, 'Excel serial date');
  }
  if ((m = /^-?\d{1,7}$/.exec(t))) return { ms: +t * ({ s: 1000, ms: 1, 'µs': 0.001, ns: 1e-6 }[unit || 's']), kind: `Unix ${EPOCH_UNITS[unit || 's']}`, epoch: true, unit: unit || 's', auto: 's', zoneGiven: true, off: 0, sub: '' };
  // words
  const s = t.toLowerCase(); const now = Date.now();
  if (s === 'now') return { ms: now, kind: 'Now', zoneGiven: true, natural: true };
  const U = { s: 1e3, m: 60e3, h: 3600e3, d: 864e5, w: 6048e5 };
  const uk = (u) => (u.startsWith('w') ? 'w' : u.startsWith('d') ? 'd' : u.startsWith('h') ? 'h' : u.startsWith('m') ? 'm' : 's');
  if ((m = /^in\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)$/.exec(s))) return { ms: now + +m[1] * U[uk(m[2])], kind: 'Relative time', zoneGiven: true, natural: true };
  if ((m = /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\s+ago$/.exec(s))) return { ms: now - +m[1] * U[uk(m[2])], kind: 'Relative time', zoneGiven: true, natural: true };
  if ((m = /^(today|tomorrow|yesterday)(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/.exec(s))) {
    const base = partsIn(zone, now + { today: 0, tomorrow: 864e5, yesterday: -864e5 }[m[1]]);
    let hh = m[2] ? +m[2] : 0; if (m[4] === 'pm' && hh < 12) hh += 12; if (m[4] === 'am' && hh === 12) hh = 0;
    return fromWall({ y: base.y, mo: base.mo, d: base.d, hh, mi: +(m[3] || 0) }, null, 'Plain words', { natural: true });
  }
  // ISO 8601 and friends
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:([T\s])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-−]\d{2}(?::?\d{2})?|UTC|GMT|[A-Z]{3,4})?$/i.exec(t))) {
    const off = offFrom(m[9]); const dateOnly = !m[5];
    const kind = dateOnly ? 'ISO date (midnight)' : m[4] === ' ' ? 'Date and time' : 'ISO 8601';
    return fromWall({ y: +m[1], mo: +m[2], d: +m[3], hh: +(m[5] || 0), mi: +(m[6] || 0), s: +(m[7] || 0), frac: m[8] || '' }, off, kind, { zoneText: m[9] });
  }
  if ((m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/i.exec(t))) return fromWall({ y: +m[1], mo: +m[2], d: +m[3], hh: +m[4], mi: +m[5], s: +m[6] }, offFrom(m[7]), 'ISO 8601 basic', { zoneText: m[7] });
  if ((m = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([a-z]{1,5}|[+-]\d{4})?$/i.exec(t)) && MON[m[2].toLowerCase()]) {
    return fromWall({ y: +m[3], mo: MON[m[2].toLowerCase()], d: +m[1], hh: +m[4], mi: +m[5], s: +(m[6] || 0) }, offFrom(m[7]), /GMT$/i.test(t) ? 'HTTP date' : 'RFC 2822', { zoneText: m[7] });
  }
  if ((m = /(\d{2})\/([a-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})/i.exec(t)) && MON[m[2].toLowerCase()]) {
    return fromWall({ y: +m[3], mo: MON[m[2].toLowerCase()], d: +m[1], hh: +m[4], mi: +m[5], s: +m[6] }, offFrom(m[7]), 'Apache / nginx log time', { zoneText: m[7] });
  }
  if ((m = /^(?:mon|tue|wed|thu|fri|sat|sun)\s+([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(?:([a-z]{2,5})\s+)?(\d{4})$/i.exec(t)) && MON[m[1].toLowerCase()]) {
    return fromWall({ y: +m[7], mo: MON[m[1].toLowerCase()], d: +m[2], hh: +m[3], mi: +m[4], s: +m[5] }, offFrom(m[6]), 'Unix `date` output', { zoneText: m[6] });
  }
  if ((m = /^([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\b/i.exec(t)) && MON[m[1].toLowerCase()]) {
    const y = partsIn(zone, now).y; const mo = MON[m[1].toLowerCase()];
    const r = fromWall({ y, mo, d: +m[2], hh: +m[3], mi: +m[4], s: +m[5], frac: m[6] || '' }, null, 'Syslog time (this year)');
    if (r.ms > now + 2 * 864e5) return fromWall({ y: y - 1, mo, d: +m[2], hh: +m[3], mi: +m[4], s: +m[5], frac: m[6] || '' }, null, 'Syslog time (last year)');
    return r;
  }
  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t))) return fromWall({ y: +m[3], mo: +m[2], d: +m[1], hh: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) }, null, 'Day.month.year');
  return { error: true };
}

/** Find one timestamp inside a log line → { ms, match, idx } */
export function findInLine(line, opts) {
  const pats = [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?/, /\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s*[+-]\d{4}/, /^[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?/, /\b1[6-9]\d{8}(?:\d{3})?\b/];
  for (const re of pats) { const m = re.exec(line); if (m) { const r = parseTime(m[0], opts); if (r && !r.error) return { ...r, match: m[0], idx: m.index }; } }
  return null;
}

// ───────────── formatting ─────────────
export const pad = (n, w = 2) => String(n).padStart(w, '0');
export function isoIn(ms, tz) { const p = partsIn(tz, ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${p.ms ? '.' + pad(p.ms, 3) : ''}${fmtOffset(offsetMin(tz, ms)).replace('−', '-')}`; }
export function rfc2822(ms, tz) { const p = partsIn(tz, ms); return `${p.wd}, ${pad(p.d)} ${MONN[p.mo - 1]} ${p.y} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} ${fmtOffset(offsetMin(tz, ms), { colon: false }).replace('−', '-')}`; }
/** datetime-local value (YYYY-MM-DDTHH:MM:SS) of instant ms in zone tz */
export function localInputValue(ms, tz) { const p = partsIn(tz, ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`; }
export function isoWeek(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d)); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3);
  const fy = dt.getUTCFullYear(); const f = new Date(Date.UTC(fy, 0, 4));
  return { wy: fy, w: 1 + Math.round(((dt - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7) };
}
export const dayOfYear = (y, mo, d) => Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
