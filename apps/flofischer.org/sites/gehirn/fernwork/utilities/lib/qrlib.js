// QR helpers: encode (vendored qrcode 1.5.3), render (canvas / SVG, integer modules, logo), self-test (vendored jsQR),
// payload builders and parsers for typed codes (Wi-Fi, contact, event, email, SMS, link, text).
import QR from '../vendor/qrcode.mjs';
import jsQR from '../vendor/jsqr.mjs';

export const ECC = { standard: 'M', high: 'H' };
export const CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };
const enc = new TextEncoder();
export const byteLen = (s) => enc.encode(s).length;

/** encode(text, 'M'|'H') → { size, get(r,c), version, ecc, bytes } or throws { capacity } */
export function encode(text, ecc = 'M') {
  const bytes = byteLen(text);
  if (bytes > CAPACITY[ecc]) { const e = new Error('too long'); e.capacity = { bytes, max: CAPACITY[ecc], ecc }; throw e; }
  const q = QR.create(text || ' ', { errorCorrectionLevel: ecc });
  const n = q.modules.size;
  return { size: n, get: (r, c) => !!q.modules.get(r, c), version: q.version, ecc, bytes };
}

/** Logo box in modules (centered), sized to stay well inside H recovery (≈ 7 % of the area). */
export function logoBox(qr, frac = 0.22) {
  let s = Math.round(qr.size * frac); if ((qr.size - s) % 2) s++;
  const o = (qr.size - s) / 2; return { x: o, y: o, s };
}

/** Draw onto a canvas with an integer module scale. opts: { fg, bg, scale, margin, logo: HTMLImageElement|null, round } */
export function drawQR(canvas, qr, { fg = '#000', bg = '#fff', scale = 8, margin = 4, logo = null } = {}) {
  const n = qr.size, W = (n + margin * 2) * scale;
  if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.fillStyle = bg; g.fillRect(0, 0, W, W);
  g.fillStyle = fg;
  const lb = logo ? logoBox(qr) : null;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.get(r, c)) continue;
    if (lb && c >= lb.x && c < lb.x + lb.s && r >= lb.y && r < lb.y + lb.s) continue;
    g.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  }
  if (lb) {
    const x = (lb.x + margin) * scale, y = (lb.y + margin) * scale, s = lb.s * scale, pad = scale * 0.6;
    g.fillStyle = bg; roundRect(g, x, y, s, s, scale * 1.2); g.fill();
    g.drawImage(logo, x + pad, y + pad, s - pad * 2, s - pad * 2);
  }
  return W;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** SVG string (one path, crisp at any size). */
export function toSVG(qr, { fg = '#000', bg = '#fff', margin = 4, logoHref = null, sizeMm = null } = {}) {
  const n = qr.size, W = n + margin * 2; let d = '';
  const lb = logoHref ? logoBox(qr) : null;
  for (let r = 0; r < n; r++) {
    let run = 0;
    for (let c = 0; c <= n; c++) {
      const on = c < n && qr.get(r, c) && !(lb && c >= lb.x && c < lb.x + lb.s && r >= lb.y && r < lb.y + lb.s);
      if (on) run++;
      else if (run) { d += `M${c - run + margin} ${r + margin}h${run}v1h-${run}z`; run = 0; }
    }
  }
  const dim = sizeMm ? ` width="${sizeMm}mm" height="${sizeMm}mm"` : '';
  const logo = lb ? `<rect x="${lb.x + margin}" y="${lb.y + margin}" width="${lb.s}" height="${lb.s}" rx="1.2" fill="${bg}"/><image href="${logoHref}" x="${lb.x + margin + 0.6}" y="${lb.y + margin + 0.6}" width="${lb.s - 1.2}" height="${lb.s - 1.2}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}"${dim} shape-rendering="crispEdges"><rect width="${W}" height="${W}" fill="${bg}"/><path d="${d}" fill="${fg}"/>${logo}</svg>`;
}

/** Decode what we drew, like a strict phone scanner would (no inversion), then with inversion. */
export function selfTest(canvas, expected) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = g.getImageData(0, 0, canvas.width, canvas.height);
  const strict = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  if (strict && strict.data === expected) return { ok: true };
  const inv = jsQR(data, width, height, { inversionAttempts: 'onlyInvert' });
  if (inv && inv.data === expected) return { ok: false, inverted: true };
  return { ok: false };
}

// ── colour helpers for warnings ──────────────────────────────────────────────
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export function lum(hex) { const n = parseInt(hex.slice(1, 7), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); }
export function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// ── payloads ─────────────────────────────────────────────────────────────────
const wifiEsc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
const icsEsc = (s) => String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
const vEsc = (s) => String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
const pad = (n) => String(n).padStart(2, '0');
const icsUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

export const TYPES = [
  { id: 'link', label: 'Link', icon: 'link' },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
  { id: 'contact', label: 'Contact', icon: 'contact' },
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'email', label: 'Email', icon: 'mail' },
  { id: 'sms', label: 'SMS', icon: 'message-square' },
  { id: 'event', label: 'Event', icon: 'calendar' },
];

/** build(type, fields) → { text, error? } */
export function build(type, f) {
  switch (type) {
    case 'link': {
      let s = (f.url || '').trim(); if (!s) return { text: '', empty: true };
      let note = '';
      if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { s = 'https://' + s; note = 'Added https://'; }
      try { new URL(s); } catch { return { text: s, error: 'That doesn’t look like a link yet.' }; }
      return { text: s, note };
    }
    case 'wifi': {
      if (!f.ssid) return { text: '', empty: true };
      const t = f.sec === 'nopass' ? 'nopass' : f.sec || 'WPA';
      return { text: `WIFI:T:${t};S:${wifiEsc(f.ssid)};${t !== 'nopass' ? `P:${wifiEsc(f.pass || '')};` : ''}${f.hidden ? 'H:true;' : ''};` };
    }
    case 'contact': {
      if (!f.first && !f.last && !f.org) return { text: '', empty: true };
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(f.last || '')};${vEsc(f.first || '')};;;`, `FN:${vEsc([f.first, f.last].filter(Boolean).join(' ') || f.org)}`];
      if (f.org) L.push(`ORG:${vEsc(f.org)}`); if (f.title) L.push(`TITLE:${vEsc(f.title)}`);
      if (f.tel) L.push(`TEL;TYPE=CELL:${f.tel.replace(/[^\d+]/g, '')}`); if (f.email) L.push(`EMAIL:${f.email}`); if (f.web) L.push(`URL:${f.web}`);
      L.push('END:VCARD'); return { text: L.join('\n') };
    }
    case 'text': return f.text ? { text: f.text } : { text: '', empty: true };
    case 'email': {
      if (!f.to) return { text: '', empty: true };
      const q = [f.subject && `subject=${encodeURIComponent(f.subject)}`, f.body && `body=${encodeURIComponent(f.body)}`].filter(Boolean).join('&');
      return { text: `mailto:${f.to}${q ? '?' + q : ''}` };
    }
    case 'sms': {
      if (!f.tel) return { text: '', empty: true };
      const tel = f.tel.replace(/[^\d+]/g, '');
      return { text: `sms:${tel}${f.body ? `?body=${encodeURIComponent(f.body)}` : ''}` };
    }
    case 'event': {
      if (!f.title || !f.start) return { text: '', empty: true };
      const s = new Date(f.start), e = f.end ? new Date(f.end) : new Date(s.getTime() + 3600e3);
      if (isNaN(s)) return { text: '', error: 'Pick a start time.' };
      const L = ['BEGIN:VEVENT', `UID:${f.uid || 'fw-' + s.getTime().toString(36)}@fernwork.net`, `DTSTAMP:${icsUtc(new Date(f.stamp || Date.now()))}`, `DTSTART:${icsUtc(s)}`, `DTEND:${icsUtc(e)}`, `SUMMARY:${icsEsc(f.title)}`];
      if (f.where) L.push(`LOCATION:${icsEsc(f.where)}`);
      L.push('END:VEVENT'); return { text: L.join('\n') };
    }
  }
  return { text: '' };
}

const slug = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'code';
export function filenameFor(type, f) {
  switch (type) {
    case 'wifi': return `wifi-${slug(f.ssid)}`;
    case 'contact': return `contact-${slug([f.first, f.last].filter(Boolean).join('-') || f.org)}`;
    case 'link': { try { const u = new URL(/^\w+:/.test(f.url) ? f.url : 'https://' + f.url); return `qr-${slug(u.hostname.replace(/^www\./, ''))}`; } catch { return 'qr-link'; } }
    case 'email': return `email-${slug((f.to || '').split('@')[0])}`;
    case 'sms': return `sms-${slug(f.tel)}`;
    case 'event': return `event-${slug(f.title)}`;
    default: return `qr-${slug((f.text || '').split(/\s+/).slice(0, 3).join('-'))}`;
  }
}

// ── parse what a scanned code contains ───────────────────────────────────────
function wifiField(s, k) { const m = new RegExp(`(?:^|;|:)${k}:((?:\\\\.|[^;])*)`).exec(s); return m ? m[1].replace(/\\(.)/g, '$1') : ''; }
function unfold(s) { return s.replace(/\r?\n[ \t]/g, ''); }
function icsDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v || ''); if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  return z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}
export function parse(text) {
  const s = String(text || '');
  if (/^WIFI:/i.test(s)) return { type: 'wifi', ssid: wifiField(s, 'S'), pass: wifiField(s, 'P'), sec: wifiField(s, 'T') || 'nopass', hidden: /H:true/i.test(s) };
  if (/^BEGIN:VCARD/i.test(s)) {
    const t = unfold(s); const g = (k) => (new RegExp(`^${k}(?:;[^:]*)?:(.*)$`, 'im').exec(t)?.[1] || '').replace(/\\([,;\\])/g, '$1').replace(/\\n/g, '\n').trim();
    const n = g('N').split(';');
    return { type: 'contact', name: g('FN') || [n[1], n[0]].filter(Boolean).join(' '), org: g('ORG').replace(/;+$/, ''), title: g('TITLE'), tel: g('TEL'), email: g('EMAIL'), web: g('URL'), raw: s };
  }
  if (/BEGIN:VEVENT/i.test(s)) {
    const t = unfold(s); const g = (k) => (new RegExp(`^${k}(?:;[^:]*)?:(.*)$`, 'im').exec(t)?.[1] || '').replace(/\\([,;\\])/g, '$1').replace(/\\n/g, '\n').trim();
    return { type: 'event', title: g('SUMMARY'), where: g('LOCATION'), start: icsDate(g('DTSTART')), end: icsDate(g('DTEND')), raw: /BEGIN:VCALENDAR/i.test(s) ? s : `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Fernwork//QR//EN\n${s.trim()}\nEND:VCALENDAR` };
  }
  if (/^mailto:/i.test(s)) { const u = new URL(s); return { type: 'email', to: decodeURIComponent(u.pathname), subject: u.searchParams.get('subject') || '', body: u.searchParams.get('body') || '' }; }
  if (/^MATMSG:/i.test(s)) return { type: 'email', to: /TO:([^;]*)/.exec(s)?.[1] || '', subject: /SUB:([^;]*)/.exec(s)?.[1] || '', body: /BODY:([^;]*)/.exec(s)?.[1] || '' };
  if (/^(sms|smsto):/i.test(s)) { const m = /^(?:sms|smsto):([^?:]*)(?:[?:](?:body=)?(.*))?$/i.exec(s); return { type: 'sms', tel: m?.[1] || '', body: decodeURIComponent((m?.[2] || '').replace(/\+/g, '%20')) }; }
  if (/^tel:/i.test(s)) return { type: 'tel', tel: s.slice(4) };
  if (/^geo:/i.test(s)) { const [lat, lon] = s.slice(4).split(/[,?]/); return { type: 'geo', lat, lon }; }
  if (/^https?:\/\/\S+$/i.test(s) || /^www\.\S+$/i.test(s)) return { type: 'link', url: s };
  return { type: 'text', text: s };
}

export function download(blobOrUrl, name) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = name; document.body.append(a); a.click(); a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
