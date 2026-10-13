// Developer · codecs. Pure functions over strings and bytes (no DOM except the inert HTML-entity decoder).
export const te = new TextEncoder();
export const utf8Bytes = (s) => te.encode(s);
/** Strict UTF-8 → string, or null if the bytes are not valid UTF-8. */
export function tryUtf8(bytes) { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; } }
/** Text a human would call "text": no NULs, almost no control characters. */
export function looksPrintable(text) {
  if (!text) return true;
  let bad = 0;
  for (const ch of text) { const c = ch.codePointAt(0); if (c === 0) return false; if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0x7f && c < 0xa0)) bad++; }
  return bad / text.length < 0.02;
}

// ───────────── Base64 / Base64URL ─────────────
/** Describe a Base64-ish string (standard or URL alphabet, padded or not); null when it can't be Base64. */
export function b64Info(s) {
  const t = String(s).replace(/\s+/g, '');
  if (!t) return null;
  const url = /[-_]/.test(t), std = /[+/]/.test(t);
  if (url && std) return null;
  if (!(url ? /^[A-Za-z0-9_-]+={0,2}$/ : /^[A-Za-z0-9+/]+={0,2}$/).test(t)) return null;
  const body = t.replace(/=+$/, '');
  if (body.length % 4 === 1) return null;
  if (t.includes('=') && t.length % 4 !== 0) return null;
  return { alphabet: url ? 'Base64URL' : 'Base64', padded: t.endsWith('='), clean: t, wrapped: /\s/.test(String(s).trim()) };
}
export function b64BadChar(s) {
  const t = String(s); const m = /[^A-Za-z0-9+/_\-=\s]/.exec(t);
  return m ? { ch: m[0], at: m.index + 1 } : null;
}
export function b64decode(s) {
  const info = b64Info(s);
  if (!info) { const bad = b64BadChar(s); throw new Error(bad ? `Not Base64: “${bad.ch}” at character ${bad.at}` : 'Not Base64: the length doesn’t work out'); }
  let t = info.clean.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  t += '='.repeat((4 - (t.length % 4)) % 4);
  const bin = atob(t); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64encode(bytes, { url = false, pad = !url } = {}) {
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  let s = btoa(bin);
  if (url) s = s.replace(/\+/g, '-').replace(/\//g, '_');
  if (!pad) s = s.replace(/=+$/, '');
  return s;
}

// ───────────── Hex ─────────────
/** Tolerant hex parser: "48 69", "0x48 0x69", "48:69", "\x48\x69", "4869". Returns bytes or null. */
export function parseHex(s) {
  let t = String(s).trim();
  if (!t) return null;
  t = t.replace(/0x/gi, '').replace(/\\x/gi, '').replace(/[\s:,\-]/g, '');
  if (!/^[0-9a-f]+$/i.test(t) || t.length % 2) return null;
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.substr(i * 2, 2), 16);
  return out;
}
export const toHex = (bytes, sep = '') => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(sep);
/** Looks like hex *bytes* written by a person (prefixes or separators), not a bare digest. */
export const looksHexBytes = (s) => /^(\s*(0x|\\x)?[0-9a-f]{2}[\s:,]*){2,}$/i.test(s) && /0x|\\x|[0-9a-f]{2}[\s:,]+[0-9a-f]{2}/i.test(s);

// ───────────── URL encoding ─────────────
/** Percent-decode to bytes (so broken UTF-8 isn't lost). `plus` = form encoding (+ means space). Throws with the position. */
export function urlDecodeBytes(s, { plus = false } = {}) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '%') {
      const hx = s.substr(i + 1, 2);
      if (!/^[0-9a-f]{2}$/i.test(hx)) throw new Error(`Invalid % sequence at character ${i + 1} (“${s.substr(i, 3)}”)`);
      out.push(parseInt(hx, 16)); i += 2;
    } else if (c === '+' && plus) out.push(32);
    else out.push(...te.encode(c));
  }
  return new Uint8Array(out);
}
export const urlEncode = (s) => encodeURIComponent(s);
export const hasPercent = (s) => /%[0-9a-f]{2}/i.test(s);

// ───────────── HTML entities ─────────────
/**
 * Decode entities ONLY. A <textarea>'s content is RCDATA: the parser turns entities into characters but never builds
 * elements, so `<img onerror=…>` stays plain text and nothing runs (this was SEC-02: the old decoder used a <div>).
 */
export function htmlDecode(s) { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }
export const htmlEncode = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hasEntities = (s) => /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/i.test(s);

// ───────────── gzip / deflate (real, via the browser's DecompressionStream) ─────────────
export async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function deflate(bytes, format = 'gzip') {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ───────────── file type sniffing (magic bytes) ─────────────
const MAGIC = [
  { sig: [0x89, 0x50, 0x4e, 0x47], type: 'PNG image', ext: 'png', mime: 'image/png', image: true },
  { sig: [0xff, 0xd8, 0xff], type: 'JPEG image', ext: 'jpg', mime: 'image/jpeg', image: true },
  { sig: [0x47, 0x49, 0x46, 0x38], type: 'GIF image', ext: 'gif', mime: 'image/gif', image: true },
  { sig: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50], type: 'WebP image', ext: 'webp', mime: 'image/webp', image: true },
  { sig: [0x25, 0x50, 0x44, 0x46], type: 'PDF document', ext: 'pdf', mime: 'application/pdf' },
  { sig: [0x50, 0x4b, 0x03, 0x04], type: 'ZIP archive', ext: 'zip', mime: 'application/zip' },
  { sig: [0x1f, 0x8b], type: 'gzip data', ext: 'gz', mime: 'application/gzip', gzip: true },
  { sig: [0x00, 0x61, 0x73, 0x6d], type: 'WebAssembly module', ext: 'wasm', mime: 'application/wasm' },
  { sig: [0x7f, 0x45, 0x4c, 0x46], type: 'ELF executable', ext: 'bin', mime: 'application/octet-stream' },
  { sig: [0x4d, 0x5a], type: 'Windows executable', ext: 'exe', mime: 'application/octet-stream' },
  { sig: [0x30, 0x82], type: 'DER (ASN.1) — likely a key or certificate', ext: 'der', mime: 'application/octet-stream' },
];
export function sniff(bytes) {
  for (const m of MAGIC) {
    if (m.sig.every((b, i) => bytes[i] === b) && (!m.at8 || m.at8.every((b, i) => bytes[8 + i] === b))) return m;
  }
  if (bytes[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(bytes[1])) return { type: 'zlib data', ext: 'zz', mime: 'application/octet-stream', zlib: true };
  return null;
}
export function pngSize(bytes) {
  if (bytes.length < 24) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
/** Classic hexdump lines: offset · 16 bytes · ASCII. */
export function hexdump(bytes, max = 256) {
  const lines = [];
  const n = Math.min(bytes.length, max);
  for (let o = 0; o < n; o += 16) {
    const row = bytes.subarray(o, Math.min(o + 16, n));
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0'));
    const left = hex.slice(0, 8).join(' '), right = hex.slice(8).join(' ');
    const ascii = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
    lines.push({ off: o.toString(16).padStart(8, '0'), hex: (left + (right ? '  ' + right : '')).padEnd(48, ' '), ascii });
  }
  return lines;
}
export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1; let v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
/** Group a hex digest in blocks of 4 for reading ("eda4 0279 …"). */
export const groupHex = (h, n = 4) => h.replace(new RegExp(`(.{${n}})(?=.)`, 'g'), '$1 ');

// ───────────── JSON ─────────────
export function tryJson(s) { const t = String(s).trim(); if (!/^[[{]/.test(t)) return undefined; try { return JSON.parse(t); } catch { return undefined; } }
/** Pretty JSON as escaped HTML with token classes (keys, strings, numbers, literals). */
export function jsonHtml(value, indent = 2) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return esc(JSON.stringify(value, null, indent)).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, lit, num) => str ? (colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`) : lit ? `<span class="j-lit">${lit}</span>` : `<span class="j-num">${num}</span>`);
}
