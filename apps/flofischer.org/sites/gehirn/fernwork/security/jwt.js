// Developer · JWT: parse, key material (JWK, JWKS, PEM, certificate, PKCS#1, private key), verify and sign with Web Crypto.
// Security rule (SEC-01): the algorithm family comes from the KEY, never from the token header. A public key is never
// used as an HMAC secret, so HS256-signed-with-the-public-key forgeries ("algorithm confusion") are rejected.
import { b64decode, b64encode, tryUtf8, utf8Bytes, parseHex, toHex } from './codec.js';

const subtle = crypto.subtle;
const b64u = (bytes) => b64encode(bytes, { url: true });
const b64uJson = (o) => b64u(utf8Bytes(JSON.stringify(o)));

// ───────────── parse ─────────────
export function parseToken(raw) {
  let s = String(raw).trim(); const notes = [];
  const bearer = /^(?:authorization\s*:\s*)?bearer\s+/i.exec(s);
  if (bearer) { s = s.slice(bearer[0].length).trim(); notes.push(`Removed “${bearer[0].trim()}” prefix`); }
  if (/^["'].*["']$/.test(s)) { s = s.slice(1, -1); notes.push('Removed quotes'); }
  if (/\s/.test(s)) { s = s.replace(/\s+/g, ''); notes.push('Joined a wrapped token'); }
  const parts = s.split('.');
  if (parts.length !== 3 && parts.length !== 5) return null;
  if (!parts.slice(0, 2).every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  let header;
  try { header = JSON.parse(tryUtf8(b64decode(parts[0])) ?? ''); } catch { return null; }
  if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
  if (parts.length === 5) return { kind: 'jwe', token: s, parts, header, notes };
  let payloadText = null, payload = null;
  try { payloadText = tryUtf8(b64decode(parts[1])); payload = JSON.parse(payloadText); } catch { /* not JSON: keep text */ }
  let sig = new Uint8Array();
  try { sig = parts[2] ? b64decode(parts[2]) : sig; } catch { /* malformed signature, verify will fail */ }
  return { kind: 'jws', token: s, parts, header, payload, payloadText, sig, signingInput: utf8Bytes(parts[0] + '.' + parts[1]), notes };
}
export const isJwtLike = (s) => !!parseToken(s);

// ───────────── tiny DER reader/writer ─────────────
function derAt(b, p) {
  const tag = b[p]; let len = b[p + 1], hdr = 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p + 2 + i]; hdr = 2 + n; }
  return { tag, start: p, body: p + hdr, end: p + hdr + len };
}
function derKids(b, node) { const out = []; let p = node.body; while (p < node.end) { const c = derAt(b, p); out.push(c); p = c.end; } return out; }
function derLen(n) { if (n < 128) return [n]; const a = []; while (n) { a.unshift(n & 255); n >>= 8; } return [0x80 | a.length, ...a]; }
const derTLV = (tag, body) => new Uint8Array([tag, ...derLen(body.length), ...body]);
const OID = { rsa: '2a864886f70d010101', ec: '2a8648ce3d0201', ed25519: '2b6570', p256: '2a8648ce3d030107', p384: '2b81040022', p521: '2b81040023', cn: '550403' };
const CURVE = { [OID.p256]: 'P-256', [OID.p384]: 'P-384', [OID.p521]: 'P-521' };

function pemBlocks(text) {
  return [...String(text).matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)].map((m) => ({ label: m[1], der: b64decode(m[2].replace(/\s+/g, '')) }));
}
function spkiInfo(spki) {
  const root = derAt(spki, 0); const [algId] = derKids(spki, root); const ak = derKids(spki, algId);
  const oid = toHex(spki.subarray(ak[0].body, ak[0].end));
  const param = ak[1] && ak[1].tag === 0x06 ? toHex(spki.subarray(ak[1].body, ak[1].end)) : null;
  if (oid === OID.rsa) return { family: 'RSA' };
  if (oid === OID.ec) return { family: 'EC', crv: CURVE[param] || 'unknown curve' };
  if (oid === OID.ed25519) return { family: 'OKP', crv: 'Ed25519' };
  return { family: 'unknown' };
}
function derTime(b, n) {
  const s = new TextDecoder().decode(b.subarray(n.body, n.end));
  const m = n.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null; let y = +m[1]; if (n.tag === 0x17) y += y < 50 ? 2000 : 1900;
  return Date.UTC(y, m[2] - 1, m[3], m[4], m[5], m[6]);
}
function certInfo(der) {
  const root = derAt(der, 0); const [tbs] = derKids(der, root); const k = derKids(der, tbs);
  const i = k[0].tag === 0xa0 ? 1 : 0;
  const validity = derKids(der, k[i + 3]); const subject = k[i + 4]; const spkiNode = k[i + 5];
  let cn = '';
  (function walk(n) { const kids = derKids(der, n); for (let j = 0; j < kids.length; j++) {
    const c = kids[j];
    if (c.tag === 0x06 && toHex(der.subarray(c.body, c.end)) === OID.cn && kids[j + 1]) cn = new TextDecoder().decode(der.subarray(kids[j + 1].body, kids[j + 1].end));
    else if (c.tag === 0x30 || c.tag === 0x31) walk(c);
  } })(subject);
  return { spki: der.slice(spkiNode.start, spkiNode.end), cn, notBefore: derTime(der, validity[0]), notAfter: derTime(der, validity[1]) };
}

// ───────────── key material ─────────────
/**
 * parseKeys(text) → { keys: [key], source, label, warning? } | { error } | null (empty).
 * key: { family: 'RSA'|'EC'|'OKP'|'oct', crv?, jwk?, spki?, raw?, kid?, alg? }
 */
export async function parseKeys(text, { secretEncoding = 'utf8' } = {}) {
  const t = String(text || '').trim(); if (!t) return null;
  if (t.startsWith('{')) {
    let j; try { j = JSON.parse(t); } catch { return { error: 'This looks like JSON but doesn’t parse. Paste the whole JWKS or JWK.' }; }
    if (Array.isArray(j.keys)) {
      const keys = j.keys.map(jwkKey).filter(Boolean);
      if (!keys.length) return { error: 'This JWKS has no usable keys.' };
      return { keys, source: 'JWKS', label: `JWKS · ${keys.length} key${keys.length > 1 ? 's' : ''}` };
    }
    if (j.kty) { const k = jwkKey(j); if (!k) return { error: 'Unsupported JWK.' }; const pub = stripPrivate(j); return { keys: [jwkKey(pub)], source: 'JWK', label: `JWK · ${k.family}${k.kid ? ' · ' + k.kid : ''}`, warning: pub !== j ? 'This JWK contains a private key. Only its public part was used; never paste private keys into websites.' : '' }; }
    return { error: 'JSON without “keys” or “kty”. Paste the JWKS (…/.well-known/jwks.json) or one JWK.' };
  }
  if (t.includes('-----BEGIN')) {
    const blocks = pemBlocks(t); if (!blocks.length) return { error: 'The PEM block looks cut off. Paste it from BEGIN to END.' };
    const b = blocks[0];
    if (b.label === 'PUBLIC KEY') { const i = spkiInfo(b.der); return { keys: [{ ...i, spki: b.der }], source: 'PEM', label: `PEM public key · ${i.family}${i.crv ? ' ' + i.crv : ''}` }; }
    if (b.label === 'RSA PUBLIC KEY') {
      const algId = derTLV(0x30, [...derTLV(0x06, parseHex(OID.rsa)), 0x05, 0x00]);
      const spki = derTLV(0x30, [...algId, ...derTLV(0x03, [0, ...b.der])]);
      return { keys: [{ family: 'RSA', spki }], source: 'PEM', label: 'PEM RSA public key (PKCS#1)' };
    }
    if (b.label === 'CERTIFICATE') {
      const c = certInfo(b.der); const i = spkiInfo(c.spki);
      return { keys: [{ ...i, spki: c.spki }], source: 'certificate', label: `Certificate${c.cn ? ' · ' + c.cn : ''} · ${i.family}`, cert: c };
    }
    if (b.label === 'PRIVATE KEY') {
      const pub = await publicFromPkcs8(b.der);
      if (!pub) return { error: 'This private key type isn’t supported. Paste the public key instead.' };
      return { keys: [pub], source: 'private key', label: `Private key (public part used) · ${pub.family}`, warning: 'That’s a private key. Fernwork used only its public part and kept nothing, but never paste private keys into websites.' };
    }
    return { error: `“${b.label}” isn’t a key Fernwork can verify with. Paste a PUBLIC KEY, CERTIFICATE or a JWKS.` };
  }
  // anything else: a shared secret (only valid for HS* tokens)
  let raw = utf8Bytes(t);
  if (secretEncoding === 'base64') { try { raw = b64decode(t); } catch { return { error: 'The secret isn’t valid Base64.' }; } }
  if (secretEncoding === 'hex') { raw = parseHex(t); if (!raw) return { error: 'The secret isn’t valid hex.' }; }
  return { keys: [{ family: 'oct', raw }], source: 'secret', label: `Shared secret · ${raw.length} bytes` };
}
function jwkKey(j) {
  if (!j || !j.kty) return null;
  const family = j.kty === 'RSA' ? 'RSA' : j.kty === 'EC' ? 'EC' : j.kty === 'OKP' ? 'OKP' : j.kty === 'oct' ? 'oct' : null;
  if (!family) return null;
  return { family, crv: j.crv, jwk: j, kid: j.kid, alg: j.alg, raw: family === 'oct' && j.k ? b64decode(j.k) : undefined };
}
function stripPrivate(j) {
  if (!('d' in j)) return j;
  const { d, p, q, dp, dq, qi, ...pub } = j; return pub;
}
async function publicFromPkcs8(der) {
  const root = derAt(der, 0); const k = derKids(der, root); const ak = derKids(der, k[1]);
  const oid = toHex(der.subarray(ak[0].body, ak[0].end));
  try {
    if (oid === OID.rsa) { const key = await subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']); const j = stripPrivate(await subtle.exportKey('jwk', key)); delete j.key_ops; delete j.alg; return { family: 'RSA', jwk: j }; }
    if (oid === OID.ec) {
      const crv = CURVE[toHex(der.subarray(ak[1].body, ak[1].end))];
      const key = await subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: crv }, true, ['sign']); const j = stripPrivate(await subtle.exportKey('jwk', key)); delete j.key_ops; return { family: 'EC', crv, jwk: j };
    }
  } catch { /* fallthrough */ }
  return null;
}

// ───────────── algorithms ─────────────
const BITS = (alg) => +alg.slice(2) || 256;
export function algsFor(key) {
  if (key.alg) return [key.alg];
  if (key.family === 'RSA') return ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'];
  if (key.family === 'EC') return { 'P-256': ['ES256'], 'P-384': ['ES384'], 'P-521': ['ES512'] }[key.crv] || [];
  if (key.family === 'OKP') return ['EdDSA', 'Ed25519'];
  if (key.family === 'oct') return ['HS256', 'HS384', 'HS512'];
  return [];
}
const FAMILY_NAME = { RSA: 'an RSA public key', EC: 'an EC public key', OKP: 'an Ed25519 public key', oct: 'a shared secret' };
function params(alg, key) {
  const hash = `SHA-${BITS(alg)}`;
  if (alg.startsWith('RS')) return { imp: { name: 'RSASSA-PKCS1-v1_5', hash }, ver: { name: 'RSASSA-PKCS1-v1_5' } };
  if (alg.startsWith('PS')) return { imp: { name: 'RSA-PSS', hash }, ver: { name: 'RSA-PSS', saltLength: BITS(alg) / 8 } };
  if (alg.startsWith('ES')) return { imp: { name: 'ECDSA', namedCurve: key.crv || { 256: 'P-256', 384: 'P-384', 512: 'P-521' }[BITS(alg)] }, ver: { name: 'ECDSA', hash } };
  if (alg === 'EdDSA' || alg === 'Ed25519') return { imp: { name: 'Ed25519' }, ver: { name: 'Ed25519' } };
  if (alg.startsWith('HS')) return { imp: { name: 'HMAC', hash }, ver: { name: 'HMAC' } };
  return null;
}
async function importFor(alg, key, usage = 'verify') {
  const p = params(alg, key); if (!p) throw new Error('Unsupported algorithm ' + alg);
  if (key.family === 'oct') return { k: await subtle.importKey('raw', key.raw, p.imp, false, [usage]), p };
  if (key.jwk) { const { alg: _a, use: _u, key_ops: _k, kid: _i, ...j } = key.jwk; return { k: await subtle.importKey('jwk', { ...j, ext: true }, p.imp, false, [usage]), p }; }
  return { k: await subtle.importKey('spki', key.spki, p.imp, false, [usage]), p };
}

/**
 * verifyToken(tok, keyset) → { status: 'valid'|'invalid'|'rejected', title, detail, kid?, alg }
 */
export async function verifyToken(tok, ks) {
  const alg = String(tok.header.alg || '');
  if (!alg || alg.toLowerCase() === 'none') return { status: 'rejected', alg, title: 'Rejected: unsigned token (alg “none”)', detail: 'Anyone can write a token like this. Never accept it.' };
  let cands = ks.keys;
  const kid = tok.header.kid;
  const kids = cands.map((k) => k.kid).filter(Boolean);
  if (kid && kids.length) {
    const m = cands.filter((k) => k.kid === kid);
    if (!m.length) return { status: 'invalid', alg, title: `No key with kid “${kid}” in this ${ks.source}`, detail: `It has ${kids.map((x) => `“${x}”`).join(', ')}. The issuer may have rotated keys: paste its current JWKS.` };
    cands = m;
  }
  const fitting = cands.filter((k) => algsFor(k).includes(alg));
  if (!fitting.length) {
    const k = cands[0];
    if (alg.startsWith('HS') && k.family !== 'oct') {
      return { status: 'rejected', alg, confusion: true, title: `Rejected: token claims ${alg}, but the key is ${k.family === 'RSA' ? 'RSA' : k.family}`, detail: `A forger can sign ${alg} using the public key as the HMAC secret (algorithm confusion). Fernwork takes the algorithm from the key, so ${FAMILY_NAME[k.family]} only verifies ${algsFor(k)[0]}${algsFor(k).length > 1 ? '…' : ''}.` };
    }
    if (k.family === 'oct') return { status: 'rejected', alg, title: `${alg} needs the issuer’s public key`, detail: 'This doesn’t look like a key: paste a PEM public key, a certificate, a JWK or the JWKS.' };
    return { status: 'rejected', alg, title: `Wrong kind of key for ${alg}`, detail: `The token says ${alg}, but this is ${FAMILY_NAME[k.family]}${k.crv ? ' (' + k.crv + ')' : ''} for ${algsFor(k).join(', ')}.` };
  }
  for (const k of fitting) {
    try {
      const { k: key, p } = await importFor(alg, k);
      if (await subtle.verify(p.ver, key, tok.sig, tok.signingInput)) {
        return { status: 'valid', alg, kid: k.kid, title: 'Signature valid', detail: [alg, k.kid ? `kid ${k.kid}` : '', ks.source === 'JWKS' ? `matched 1 of ${ks.keys.length} keys` : ks.label].filter(Boolean).join(' · ') };
      }
    } catch (e) { return { status: 'invalid', alg, title: 'Couldn’t use this key', detail: e.message }; }
  }
  return { status: 'invalid', alg, title: 'Signature invalid', detail: 'The token was changed after signing, or a different key signed it. Don’t trust its claims.' };
}

// ───────────── signing (samples, Keys & HMAC) ─────────────
export async function signJwt(header, payload, key) {
  const input = b64uJson(header) + '.' + b64uJson(payload);
  const alg = header.alg; const p = params(alg, key);
  let k;
  if (key.family === 'oct') k = await subtle.importKey('raw', key.raw, p.imp, false, ['sign']);
  else { const { alg: _a, use: _u, key_ops: _k, kid: _i, ...j } = key.jwk; k = await subtle.importKey('jwk', { ...j, ext: true }, p.imp, false, ['sign']); }
  const sig = new Uint8Array(await subtle.sign(p.ver, k, utf8Bytes(input)));
  return input + '.' + b64u(sig);
}

// ───────────── claims ─────────────
export const CLAIMS = {
  iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued', jti: 'Token ID', auth_time: 'Signed in',
  azp: 'Authorized party', scope: 'Scopes', scp: 'Scopes', roles: 'Roles', email: 'Email', email_verified: 'Email verified', name: 'Name',
  nonce: 'Nonce', sid: 'Session', client_id: 'Client', amr: 'Sign-in methods', acr: 'Assurance', updated_at: 'Profile updated', typ: 'Type', kid: 'Key ID', alg: 'Algorithm',
};
export const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time', 'updated_at']);
