// FWENC1 — today's Text Encryption format, byte-compatible (tools/CRYPTO_FORMAT.md):
// FWENC1.<b64url(header JSON)>.<b64url(ciphertext||tag)>, AES-256-GCM, PBKDF2-HMAC-SHA-256 600,000 rounds, 16-byte salt,
// 12-byte nonce, "FWENC1.<header>" authenticated as AAD. Plus a tolerant reader that repairs what email/chat do to it.
const te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });
export const ITER = 600000;
const b64u = (b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('damaged'); const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };

async function deriveKey(password, salt, iter) {
  const m = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = { v: 1, kdf: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64u(salt), cipher: 'AES-256-GCM', iv: b64u(iv) };
  const h = b64u(te.encode(JSON.stringify(header)));
  const key = await deriveKey(password, salt, ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`FWENC1.${h}`), tagLength: 128 }, key, te.encode(text)));
  return `FWENC1.${h}.${b64u(ct)}`;
}

/**
 * Find the token in whatever was pasted and repair it: line breaks from email wrapping, "> " quote marks, spaces,
 * surrounding prose. Returns { token, fixes: [] } or { error: 'empty'|'format'|'truncated' }.
 */
export function extract(input) {
  const raw = String(input || ''); const fixes = [];
  let s = raw;
  if (/^\s*>/m.test(s)) { s = s.replace(/^[ \t]*>+[ \t]?/gm, ''); fixes.push('quote marks'); }
  const idx = s.search(/FWENC1/);
  if (idx < 0) return { error: raw.trim() ? 'format' : 'empty' };
  if (/\S/.test(s.slice(0, idx).replace(/[#:\s]+$/, ''))) fixes.push('text around it');
  const lines = s.slice(idx).split(/\r?\n/);
  const first = /^[A-Za-z0-9_.-]+/.exec(lines[0])[0];
  let tok = first; let prev = first.length; const full = first.length === lines[0].trimEnd().length;
  for (let i = 1; full && i < lines.length; i++) {
    const l = lines[i].trim(); if (!l || !/^[A-Za-z0-9_.-]+$/.test(l)) break;
    tok += l; if (i === 1) fixes.push('line breaks');
    if (l.length < prev - 1) break; prev = l.length;
  }
  const parts = tok.split('.').filter(Boolean);
  if (parts.length < 3) return { error: 'truncated', fixes };
  return { token: parts.slice(0, 3).join('.'), fixes };
}
/** Header check like today's parseEncryptedText (rejects unsafe parameters). */
export function inspect(token) {
  const p = token.split('.');
  let header; try { header = JSON.parse(td.decode(unb64u(p[1]))); } catch { return { error: 'damaged' }; }
  if (header?.v !== 1 || header.kdf !== 'PBKDF2' || header.hash !== 'SHA-256' || header.cipher !== 'AES-256-GCM' || !Number.isInteger(header.iter) || header.iter < ITER || header.iter > 1e7) return { error: 'unsafe', header };
  let salt, iv, ct; try { salt = unb64u(header.salt); iv = unb64u(header.iv); ct = unb64u(p[2]); } catch { return { error: 'damaged' }; }
  if (salt.length !== 16 || iv.length !== 12 || ct.length < 16) return { error: 'damaged' };
  return { header, salt, iv, ct, bytes: ct.length - 16 };
}
/** decrypt(token, password) → text; throws Error('password'|'damaged'|'unsafe'). */
export async function decrypt(token, password) {
  const info = inspect(token); if (info.error) throw new Error(info.error);
  const key = await deriveKey(password, info.salt, info.header.iter);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: info.iv, additionalData: te.encode(`FWENC1.${token.split('.')[1]}`), tagLength: 128 }, key, info.ct);
    return td.decode(pt);
  } catch { throw new Error('password'); }
}

// Strength (rough, honest): character classes or words.
export function strength(pw) {
  if (!pw) return { bits: 0, label: '', level: 0 };
  let bits; const words = pw.split(/[-\s_.]+/).filter(Boolean);
  if (words.length >= 3 && words.every((w) => /^[a-z]+$|^\d+$/i.test(w))) bits = words.reduce((a, w) => a + (/^\d+$/.test(w) ? 3.3 : 10), 0);
  else { let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^\w]/.test(pw)) pool += 33; bits = pw.length * Math.log2(Math.max(pool, 2)); if (/^(.)\1+$/.test(pw) || /password|1234|qwer/i.test(pw)) bits = Math.min(bits, 12); }
  const level = bits < 35 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
  return { bits: Math.round(bits), level, label: ['', 'Weak', 'Fair', 'Strong', 'Very strong'][level] };
}
