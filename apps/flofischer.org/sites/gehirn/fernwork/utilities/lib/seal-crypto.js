// Seal: FWENC1 (AES-256-GCM, PBKDF2-SHA-256 600k, header authenticated as AAD) — same format as Fernwork's
// Text Encryption today — plus a "link only" variant: random 256-bit key appended as a 4th part in the URL fragment.
const te = new TextEncoder(), td = new TextDecoder();
export const ITER = 600000;
export const b64u = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };

async function pwKey(password, salt, iter) {
  const m = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** seal(text, { password }) or seal(text, { linkOnly: true }) → { token, key? } */
export async function seal(text, { password, linkOnly = false } = {}) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let header, key, raw;
  if (linkOnly) {
    raw = crypto.getRandomValues(new Uint8Array(32));
    key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    header = { v: 1, kdf: 'none', key: 'fragment', cipher: 'AES-256-GCM', iv: b64u(iv) };
  } else {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await pwKey(password, salt, ITER);
    header = { v: 1, kdf: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64u(salt), cipher: 'AES-256-GCM', iv: b64u(iv) };
  }
  const h = b64u(te.encode(JSON.stringify(header)));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`FWENC1.${h}`), tagLength: 128 }, key, te.encode(text)));
  const token = `FWENC1.${h}.${b64u(ct)}`;
  return linkOnly ? { token: `${token}.${b64u(raw)}`, linkOnly: true } : { token, linkOnly: false };
}

/**
 * Tolerant extraction (SEC-06): strips line breaks, quote markers ("> "), spaces and surrounding prose; finds the token anywhere,
 * also inside a link's #fragment. Returns { token, cleaned: [what we fixed] } or { error }.
 */
export function extract(input) {
  const raw = String(input || '');
  const fixes = [];
  let s = raw;
  if (/\n\s*>/.test(s) || /^\s*>/.test(s)) { s = s.replace(/^[ \t]*>+[ \t]?/gm, ''); fixes.push('quote marks'); }
  const idx = s.search(/FWENC1/);
  if (idx < 0) return { error: raw.trim() ? 'format' : 'empty' };
  if (/\S/.test(s.slice(0, idx).replace(/https?:\/\/\S*#?$/, '').replace(/[#:\s]+$/, ''))) fixes.push('text around it');
  // join wrapped lines (email/chat wrap at a fixed width): a line continues the token only if the previous line ended
  // with token characters and was "full" (as long as the first one); prose after the token is never glued on.
  const lines = s.slice(idx).split(/\r?\n/);
  const first = /^[A-Za-z0-9_.-]+/.exec(lines[0])[0];
  let tok = first, prev = first.length, full = first.length === lines[0].trimEnd().length;
  for (let i = 1; full && i < lines.length; i++) {
    const l = lines[i].trim(); if (!l) break;
    if (!/^[A-Za-z0-9_.-]+$/.test(l)) break;
    tok += l; if (l.length < prev - 1) break; prev = l.length;
    if (i === 1) fixes.push('line breaks');
  }
  const parts = tok.split('.').filter(Boolean);
  if (parts.length < 3) return { error: 'truncated', fixes };
  return { token: parts.slice(0, 4).join('.'), fixes };
}

export function inspect(token) {
  const p = token.split('.');
  let header; try { header = JSON.parse(td.decode(unb64u(p[1]))); } catch { return { error: 'header' }; }
  return { header, linkOnly: header.kdf === 'none', hasKey: p.length >= 4, bytes: Math.max(0, unb64u(p[2]).length - 16) };
}

/** open(token, password?) → plaintext; throws Error('password') | Error('damaged') | Error('key') */
export async function open(token, password) {
  const p = token.split('.');
  const info = inspect(token); if (info.error) throw new Error('damaged');
  const { header } = info;
  const iv = unb64u(header.iv), ct = unb64u(p[2]);
  if (iv.length !== 12 || ct.length < 16) throw new Error('damaged');
  let key;
  if (header.kdf === 'none') { if (!p[3]) throw new Error('key'); key = await crypto.subtle.importKey('raw', unb64u(p[3]), 'AES-GCM', false, ['decrypt']); }
  else { if (header.iter < ITER || header.iter > 1e7) throw new Error('damaged'); key = await pwKey(password, unb64u(header.salt), header.iter); }
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`FWENC1.${p[1]}`), tagLength: 128 }, key, ct);
    return td.decode(pt);
  } catch { throw new Error(header.kdf === 'none' ? 'damaged' : 'password'); }
}

// Strength (rough, honest): entropy estimate from character classes or words.
const WORDS = ['amber', 'anchor', 'apple', 'arrow', 'autumn', 'badge', 'bamboo', 'basil', 'beacon', 'birch', 'bison', 'blossom', 'breeze', 'brook', 'cactus', 'canyon', 'cedar', 'cello', 'cherry', 'cinder', 'clover', 'cobalt', 'comet', 'copper', 'coral', 'cosmos', 'crane', 'crystal', 'dahlia', 'delta', 'dune', 'ember', 'falcon', 'fennel', 'fern', 'fjord', 'flint', 'garnet', 'ginger', 'glacier', 'harbor', 'hazel', 'heron', 'island', 'ivory', 'jasper', 'juniper', 'kayak', 'kettle', 'lagoon', 'lantern', 'lemon', 'lilac', 'linen', 'lotus', 'maple', 'marble', 'meadow', 'mango', 'meteor', 'mint', 'mosaic', 'nectar', 'nutmeg', 'oasis', 'olive', 'onyx', 'orbit', 'orchid', 'otter', 'paddle', 'pebble', 'pepper', 'pine', 'pixel', 'plum', 'prairie', 'quartz', 'quill', 'raven', 'reef', 'river', 'saffron', 'sage', 'salmon', 'sequoia', 'shadow', 'sierra', 'silver', 'sparrow', 'spruce', 'summit', 'tango', 'thistle', 'thunder', 'tide', 'timber', 'topaz', 'tulip', 'tundra', 'velvet', 'walnut', 'willow', 'zephyr'];
export function suggest(n = 4) {
  const r = crypto.getRandomValues(new Uint32Array(n + 1));
  return [...r.slice(0, n)].map((x) => WORDS[x % WORDS.length]).join('-') + '-' + (r[n] % 90 + 10);
}
export function strength(pw) {
  if (!pw) return { bits: 0, label: '', level: 0 };
  let bits;
  const words = pw.split(/[-\s_.]+/).filter(Boolean);
  if (words.length >= 3 && words.every((w) => /^[a-z]+$|^\d+$/.test(w))) bits = words.reduce((a, w) => a + (/^\d+$/.test(w) ? 6.6 : 12.9), 0); // real build: EFF long list (7,776 words)
  else { let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^\w]/.test(pw)) pool += 33; bits = pw.length * Math.log2(Math.max(pool, 2)); if (/^(.)\1+$/.test(pw) || /password|1234|qwer/i.test(pw)) bits = Math.min(bits, 12); }
  const level = bits < 35 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
  return { bits: Math.round(bits), level, label: ['', 'Weak', 'Fair', 'Strong', 'Very strong'][level] };
}
