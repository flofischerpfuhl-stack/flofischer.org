// Developer ▸ Inspect: paste anything, it works out what it is and shows the answer. Everything runs locally.
import { icon, esc, $, $$, h, enhance, copyText, toast, openMenu, navigate, hrefFor, refreshLeafLinks, isCoarse, kbd } from '../kit/shell.js';
import * as C from './codec.js';
import { parseToken, parseKeys, verifyToken, signJwt, CLAIMS, TIME_CLAIMS } from './jwt.js';
import { parseSums, describeSums, LEGACY } from './sums.js';
import { KEYS, RSA_PUB_PEM, RSA_CERT_PEM, PNG_B64 } from './samples.js';
import { pasteBox, wirePaste, setBar, fmtWhen, fmtClock, relHuman, LOCAL_TZ } from './util.js';
import { uuidv7 } from './generate.js';

const S = { input: '', forced: null, manual: [], view: null, plus: true, vkey: '', secretEnc: 'utf8', result: null, file: null, run: 0 };
let ctx, field, box, samples = null;

// ───────────── steps (each is real: atob, DecompressionStream, an inert textarea…) ─────────────
const textOf = (v) => { if (v.text != null) return v.text; const t = C.tryUtf8(v.bytes); if (t == null) throw new Error('These bytes aren’t text (not valid UTF-8).'); return t; };
const bytesOf = (v) => v.bytes ?? C.utf8Bytes(v.text);
const STEPS = {
  'url-decode': { label: 'URL decode', dir: 'decode', run: (v) => ({ bytes: C.urlDecodeBytes(textOf(v), { plus: S.plus }) }) },
  'b64-decode': { label: 'Base64 decode', dir: 'decode', run: (v) => { const t = textOf(v); const i = C.b64Info(t); return { bytes: C.b64decode(t), note: i ? `${i.alphabet}${i.padded ? '' : ' · no padding'}${i.wrapped ? ' · line-wrapped' : ''}` : '' }; } },
  'hex-decode': { label: 'Hex decode', dir: 'decode', run: (v) => { const b = C.parseHex(textOf(v)); if (!b) throw new Error('Not hex: use pairs like 48 69, 0x48 or 48:69.'); return { bytes: b }; } },
  'html-decode': { label: 'HTML entities', dir: 'decode', run: (v) => ({ text: C.htmlDecode(textOf(v)) }) },
  'data-uri': { label: 'Data URI', dir: 'decode', run: (v) => {
    const m = /^data:([^,;]*)((?:;[^,;]*)*?)(;base64)?,(.*)$/is.exec(textOf(v).trim()); if (!m) throw new Error('Not a data: URI.');
    return { bytes: m[3] ? C.b64decode(decodeURIComponent(m[4])) : C.urlDecodeBytes(m[4]), mime: m[1] || 'text/plain', note: m[1] || 'text/plain' };
  } },
  gunzip: { label: 'Gunzip', dir: 'decode', run: async (v) => ({ bytes: await C.inflate(bytesOf(v), 'gzip') }) },
  inflate: { label: 'Inflate (zlib)', dir: 'decode', run: async (v) => ({ bytes: await C.inflate(bytesOf(v), 'deflate') }) },
  'b64-encode': { label: 'Base64 encode', dir: 'encode', run: (v) => ({ text: C.b64encode(bytesOf(v)) }) },
  'b64url-encode': { label: 'Base64URL encode', dir: 'encode', run: (v) => ({ text: C.b64encode(bytesOf(v), { url: true }) }) },
  'url-encode': { label: 'URL encode', dir: 'encode', run: (v) => ({ text: C.urlEncode(textOf(v)) }) },
  'hex-encode': { label: 'Hex encode', dir: 'encode', run: (v) => ({ text: C.toHex(bytesOf(v), ' ') }) },
  'html-encode': { label: 'HTML escape', dir: 'encode', run: (v) => ({ text: C.htmlEncode(textOf(v)) }) },
  gzip: { label: 'Gzip', dir: 'encode', run: async (v) => ({ bytes: await C.deflate(bytesOf(v)) }) },
};

// ───────────── recognisers ─────────────
function parseUuid(s) {
  const t = s.trim().replace(/^urn:uuid:/i, '').replace(/^[{"']|[}"']$/g, '');
  const hex = t.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  if (t.includes('-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  if (!t.includes('-') && s.trim() === hex && !/^\{|urn/i.test(s.trim())) {
    // 32 bare hex chars are more likely an MD5 checksum unless the version/variant nibbles fit a UUID
    if (!/^[0-9a-f]{12}[1-8][0-9a-f]{3}[89ab]/i.test(hex)) return null;
  }
  const h = hex.toLowerCase(); const canon = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const ver = parseInt(h[12], 16); const vn = parseInt(h[16], 16);
  const nil = /^0+$/.test(h), max = /^f+$/.test(h);
  const variant = vn < 8 ? 'NCS (legacy)' : vn < 12 ? 'RFC 9562' : vn < 14 ? 'Microsoft (legacy)' : 'Reserved';
  let time = null;
  if (!nil && !max) {
    if (ver === 7) time = Number(BigInt('0x' + h.slice(0, 12)));
    if (ver === 1) { const ts = (BigInt('0x' + h.slice(13, 16)) << 48n) | (BigInt('0x' + h.slice(8, 12)) << 32n) | BigInt('0x' + h.slice(0, 8)); time = Number(ts / 10000n) - 12219292800000; }
    if (ver === 6) { const ts = (BigInt('0x' + h.slice(0, 12)) << 12n) | BigInt('0x' + h.slice(13, 16)); time = Number(ts / 10000n) - 12219292800000; }
  }
  const verName = { 1: 'time-based (MAC)', 2: 'DCE security', 3: 'name-based (MD5)', 4: 'random', 5: 'name-based (SHA-1)', 6: 'time-ordered (v1 reordered)', 7: 'time-ordered (Unix ms)', 8: 'custom' }[ver] || 'unknown';
  return { canon, hex: h, ver, verName, variant, nil, max, time, form: s.trim() === canon ? 'canonical' : /^\{/.test(s.trim()) ? 'braces' : /^urn/i.test(s.trim()) ? 'URN' : !t.includes('-') ? 'no hyphens' : t === t.toUpperCase() ? 'uppercase' : 'other' };
}
function parseEpochish(s) {
  const t = s.trim(); if (!/^\d{9,19}(\.\d+)?$/.test(t)) return null;
  const n = t.split('.')[0].length; const unit = n <= 10 ? 's' : n <= 13 ? 'ms' : n <= 16 ? 'µs' : 'ns';
  const ms = unit === 's' ? parseFloat(t) * 1000 : unit === 'ms' ? +t : unit === 'µs' ? +t / 1000 : Number(BigInt(t.split('.')[0]) / 1000000n);
  const y = new Date(ms).getUTCFullYear(); if (y < 1990 || y > 2100) return null;
  return { ms, unit };
}
function looksB64(t) {
  const i = C.b64Info(t); if (!i) return false;
  const c = i.clean; if (c.length < 8) return false;
  if (/^[a-z]+$/i.test(c) || /^\d+$/.test(c)) return false;
  const strong = i.padded || /[+/_-]/.test(c) || (c.length % 4 === 0 && /[A-Z]/.test(c) && /[a-z]/.test(c) && /\d/.test(c));
  if (!strong) return false;
  try { const b = C.b64decode(c); const tx = C.tryUtf8(b); return (tx != null && C.looksPrintable(tx)) || !!C.sniff(b); } catch { return false; }
}

/** Decide the next automatic step, or a terminal, for a value. */
function auto(v, depth) {
  if (v.bytes) {
    const m = C.sniff(v.bytes);
    if (m?.gzip) return { step: 'gunzip' };
    if (m?.zlib) return { step: 'inflate' };
    const t = C.tryUtf8(v.bytes);
    if (t != null && C.looksPrintable(t) && !m) return { text: t };
    return { term: { type: 'binary', bytes: v.bytes, magic: m, mime: v.mime } };
  }
  const t = v.text.trim();
  if (!t) return { term: { type: 'text', text: v.text } };
  const tok = parseToken(t); if (tok) return { term: { type: 'jwt', tok } };
  const u = parseUuid(t); if (u) return { term: { type: 'uuid', u } };
  const sums = parseSums(t); if (sums.entries.length && !sums.bad.length) return { term: { type: 'checksum', sums } };
  if (/^FWENC1\.[\w-]+\.[\w-]+/.test(t.replace(/\s+/g, ''))) return { term: { type: 'sealed', text: t } };
  if (depth === 0) { const e = parseEpochish(t); if (e) return { term: { type: 'epoch', ...e } }; }
  const j = C.tryJson(t); if (j !== undefined) return { term: { type: 'json', value: j, text: t } };
  if (/^data:[\w.+-]*\/?[\w.+-]*[;,]/i.test(t)) return { step: 'data-uri' };
  if (C.hasPercent(t)) { try { C.urlDecodeBytes(t); return { step: 'url-decode' }; } catch { /* broken % → text */ } }
  if (C.hasEntities(t)) return { step: 'html-decode', last: true };
  if (C.looksHexBytes(t)) return { step: 'hex-decode' };
  if (looksB64(t)) return { step: 'b64-decode' };
  return { term: { type: 'text', text: v.text } };
}

async function analyze() {
  const stages = [{ label: 'Input', value: { text: S.input }, kind: 'input' }];
  let v = { text: S.input }; let term = null; let error = null; let lastAuto = false;
  const notes = [];
  const runStep = async (id, how) => {
    const st = STEPS[id];
    const out = await st.run(v);
    v = out;
    stages.push({ label: id === 'b64-decode' && out.note?.startsWith('Base64URL') ? 'Base64URL decode' : st.label, value: out, step: id, how, note: out.note });
  };
  try {
    // forced first interpretation ("Detected … · change")
    if (S.forced === 'text') term = { type: 'text', text: S.input };
    else if (S.forced) await runStep(S.forced, 'forced');
    for (let depth = 0; !term && depth < 7; depth++) {
      if (lastAuto) { term = { type: 'text', text: textOf(v) }; break; }
      const a = auto(v, S.forced ? depth + 1 : depth);
      if (a.term) term = a.term;
      else if (a.text != null) { v = { text: a.text }; depth--; if (stages.length > 1) stages.at(-1).asText = true; }
      else { await runStep(a.step, 'auto'); if (a.last) lastAuto = true; }
    }
    if (!term) term = v.bytes ? { type: 'binary', bytes: v.bytes, magic: C.sniff(v.bytes) } : { type: 'text', text: v.text };
  } catch (e) { error = e.message; term = { type: 'error' }; }
  // manual steps run on the terminal's value
  if (!error && S.manual.length) {
    v = term.type === 'binary' ? { bytes: term.bytes } : term.type === 'json' ? { text: term.text } : term.type === 'jwt' ? { text: term.tok.token } : term.type === 'text' ? { text: term.text } : { text: textOf(stages.at(-1).value) };
    try {
      for (const id of S.manual) await runStep(id, 'manual');
      const t = v.bytes ? C.tryUtf8(v.bytes) : v.text;
      term = v.bytes && (t == null || !C.looksPrintable(t)) ? { type: 'binary', bytes: v.bytes, magic: C.sniff(v.bytes) } : (() => { const j = C.tryJson(t); return j !== undefined && STEPS[S.manual.at(-1)].dir === 'decode' ? { type: 'json', value: j, text: t } : { type: 'text', text: t }; })();
    } catch (e) { error = e.message; term = { type: 'error' }; }
  }
  return { stages, term, error, notes };
}

// ───────────── samples (signed fresh, in this tab, with real keys) ─────────────
async function getSamples() {
  if (samples) return samples;
  const now = Math.floor(Date.now() / 1000);
  const rsa = { family: 'RSA', jwk: KEYS.rsaPriv }, ec = { family: 'EC', crv: 'P-256', jwk: KEYS.ecPriv };
  const claims = { iss: 'https://auth.example.com/', sub: 'auth0|6f1c9e2a7b40d1', aud: ['api.example.com', 'https://auth.example.com/userinfo'], iat: now - 60, nbf: now - 60, exp: now + 30 * 86400, auth_time: now - 74, azp: 'k3Xw9QeVd2LmP0aZ', scope: 'openid profile email read:invoices write:invoices', email: 'anna.berger@example.com', name: 'Anna Berger' };
  const jwt = await signJwt({ alg: 'RS256', typ: 'JWT', kid: '2026-10-key-1' }, claims, rsa);
  const forged = await signJwt({ alg: 'HS256', typ: 'JWT', kid: '2026-10-key-1' }, { ...claims, sub: 'attacker', roles: ['admin', 'superuser'], scope: 'openid profile email admin:*', email: 'attacker@evil.example', name: 'Not Anna', exp: now + 365 * 86400 }, { family: 'oct', raw: C.utf8Bytes(RSA_PUB_PEM) });
  const expired = await signJwt({ alg: 'ES256', typ: 'JWT', kid: 'ec-2026' }, { iss: 'https://id.example.org', sub: 'svc-backup', aud: 'storage.example.org', iat: now - 33 * 86400, exp: now - 3 * 86400 - 5 * 3600, scope: 'backup:write' }, ec);
  const notyet = await signJwt({ alg: 'RS256', typ: 'JWT', kid: '2026-10-key-1' }, { ...claims, nbf: now + 2 * 3600, exp: now + 26 * 3600 }, rsa);
  let cj = JSON.stringify({ user: 'anna', role: 'editor', theme: 'dark', cart: 3, exp: now + 86400 }); while (cj.length % 3 === 0) cj += ' ';
  const cookie = encodeURIComponent(btoa(cj));
  const gz = C.b64encode(await C.deflate(C.utf8Bytes('2026-10-13T08:15:02.114Z INFO  checkout  order=ORD-2026-08812 total=129.90 EUR\n2026-10-13T08:15:02.410Z WARN  payment   retry=1 provider=card reason="3DS timeout"\n2026-10-13T08:15:04.987Z INFO  payment   status=captured\n')));
  samples = [
    { group: 'Tokens', items: [
      { id: 'jwt', label: 'JWT · RS256', sub: 'Login token from auth.example.com', value: jwt, icon: 'key-round' },
      { id: 'jwks', label: 'JWKS for that token', sub: 'Public keys (2) to verify it', value: JSON.stringify({ keys: [KEYS.rsaOldPub, KEYS.rsaPub] }, null, 2), verify: true, icon: 'key-round' },
      { id: 'forged', label: 'Forged token', sub: 'HS256 signed with the public key', value: forged, icon: 'triangle-alert' },
      { id: 'expired', label: 'Expired token · ES256', sub: 'Expired 3 days ago', value: expired, icon: 'clock' },
      { id: 'notyet', label: 'Not-yet-valid token', sub: 'nbf in 2 hours', value: notyet, icon: 'clock' },
      { id: 'bearer', label: 'Authorization header', sub: 'Bearer prefix is removed', value: 'Authorization: Bearer ' + jwt, icon: 'key-round' },
      { id: 'cert', label: 'Certificate (PEM)', sub: 'X.509 for the RS256 key', value: RSA_CERT_PEM, verify: true, icon: 'shield-check' },
    ] },
    { group: 'Encodings', items: [
      { id: 'cookie', label: 'Cookie value', sub: 'URL → Base64 → JSON', value: cookie, icon: 'braces' },
      { id: 'png', label: 'Base64 image', sub: 'Decodes to a PNG', value: PNG_B64, icon: 'image' },
      { id: 'gzip', label: 'Gzipped log (Base64)', sub: 'Base64 → gunzip → text', value: gz, icon: 'file-text' },
      { id: 'query', label: 'URL-encoded query', sub: '+ means space', value: 'redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback%3Fstate%3Dq7%26lang%3Dde&scope=openid+profile+email&prompt=consent', icon: 'link' },
      { id: 'html', label: 'HTML entities with markup', sub: 'Decoded safely, never run', value: '&lt;img src=x onerror=&quot;alert(document.domain)&quot;&gt; Caf&eacute; &amp; Cr&egrave;me &#x1F33F;', icon: 'code-xml' },
      { id: 'hex', label: 'Hex bytes', sub: '0x48 0x65 …', value: '0x48 0x61 0x6c 0x6c 0x6f 0x2c 0x20 0x46 0x65 0x72 0x6e 0x77 0x6f 0x72 0x6b 0x20 0xf0 0x9f 0x8c 0xbf', icon: 'binary' },
    ] },
    { group: 'IDs and hashes', items: [
      { id: 'sum', label: 'sha256sum line', sub: 'A published checksum', value: 'deb786ad43b2f4ecc057789caad9c09addca20dd2bf70ce6a784910e9d191d33  fernwork-desktop-2.4.0.dmg', icon: 'fingerprint' },
      { id: 'uuid7', label: 'UUID v7', sub: 'With an embedded time', value: uuidv7(Date.now() - 2 * 3600e3 - 13 * 60e3), icon: 'hash' },
      { id: 'uuidb', label: 'UUID in braces', sub: 'Windows/registry form', value: '{0F8FAD5B-D9CB-469F-A165-70867728950E}', icon: 'hash' },
      { id: 'epoch', label: 'Unix timestamp', sub: 'Milliseconds', value: String(Date.now() + 9.5 * 3600e3 - (Date.now() % 1000) + 123), icon: 'calendar-clock' },
    ] },
  ];
  return samples;
}
export async function sampleValue(id) { for (const g of await getSamples()) for (const it of g.items) if (it.id === id) return it.value; return ''; }

// ───────────── render ─────────────
export async function mount(c) {
  ctx = c;
  ctx.renderHeader({});
  ctx.root.innerHTML = '';
  box = pasteBox({ id: 'ins-in', label: 'Anything to inspect', placeholder: 'Paste or drop anything: token, hash, Base64, URL, UUID, file…', extraActions: `<button class="fw-btn fw-btn--sm fw-btn--ghost sec-hide-coarse" type="button" id="ins-samples">${icon('chevron-down')}Samples</button>` });
  box.classList.add('ins-box');
  ctx.root.append(box);
  ctx.root.insertAdjacentHTML('beforeend', `<div id="ins-chain"></div><div id="ins-out" class="ins-out" aria-live="polite"></div>`);
  field = $('#ins-in');
  const sync = wirePaste(box, { set: (v) => set(v), label: 'a value', onClear: (old) => toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }) });
  field.addEventListener('input', () => { S.input = field.value; S.forced = null; S.manual = []; S.view = null; S.file = null; update(); });
  field.addEventListener('scroll', () => { box.querySelector('.sec-mirror').scrollTop = field.scrollTop; });
  $('#ins-samples').onclick = (e) => sampleMenu(e.currentTarget);
  S.sync = sync;
  ctx.hooks.onPaste = (t) => { set(t); return true; };
  ctx.hooks.onFiles = (files) => inspectFile(files[0]);
  setInterval(tickRel, 1000);
  const q = ctx.params.get('q') || (ctx.leaf.id === 'jwt-decoder' ? await sampleValue('jwt') : '');
  set(q);
  if (!isCoarse()) field.focus();
}
function set(v) { field.value = v; S.input = v; S.forced = null; S.manual = []; S.view = null; S.file = null; S.sync(); update(); }

async function sampleMenu(anchor) {
  const groups = await getSamples();
  openMenu(anchor, groups.map((g) => ({ group: g.group, items: g.items.map((it) => ({ label: it.label, sub: it.sub, icon: it.icon, onSelect: () => useSample(it) })) })), { placement: 'bottom-end' });
}
function useSample(it) {
  if (it.verify) { S.vkey = it.value; const k = $('#vkey'); if (k) { k.value = it.value; runVerify(); k.scrollIntoView({ block: 'nearest' }); } else toast('Paste a token first, then the key goes into Verify.', { type: 'info' }); return; }
  set(it.value);
}

function tickRel() { $$('[data-rel-ms]').forEach((el) => { el.textContent = relHuman(+el.dataset.relMs, { parts: +el.dataset.relParts || 1 }); }); }
const rel = (ms, parts = 1) => `<span data-rel-ms="${ms}" data-rel-parts="${parts}">${esc(relHuman(ms, { parts }))}</span>`;

async function update() {
  const run = ++S.run;
  const raw = S.input;
  paintMirror(null);
  if (S.file) return renderFile();
  if (!raw.trim()) { renderEmpty(); return; }
  const r = await analyze();
  if (run !== S.run) return;
  S.result = r;
  paintMirror(r.term.type === 'jwt' ? r.term.tok : null);
  renderMeta(r);
  renderChain(r);
  renderTerm(r);
}

function paintMirror(tok) {
  const m = box.querySelector('.sec-mirror');
  const raw = field.value;
  const mm = tok && /^(\s*(?:(?:authorization\s*:\s*)?bearer\s+)?)([\w-]+)\.([\w-]+)\.([\w-]*)(\s*)$/i.exec(raw);
  if (!mm) { m.innerHTML = ''; field.classList.remove('is-colored'); return; }
  m.innerHTML = `<span class="seg-pre">${esc(mm[1])}</span><span class="seg-h">${esc(mm[2])}</span><span class="seg-dot">.</span><span class="seg-p">${esc(mm[3])}</span><span class="seg-dot">.</span><span class="seg-s">${esc(mm[4])}</span>${esc(mm[5])}`;
  field.classList.add('is-colored');
  m.scrollTop = field.scrollTop;
}

function detectLabel(r) {
  const t = r.term; const steps = r.stages.slice(1).map((s) => s.label.replace(/ decode$/, ''));
  const end = { jwt: () => `JSON Web Token${t.tok.kind === 'jwe' ? ' (encrypted)' : ` · ${t.tok.header.alg || 'no alg'}`}`, uuid: () => (t.u.nil ? 'Nil UUID' : t.u.max ? 'Max UUID' : `UUID v${t.u.ver}`), checksum: () => (t.sums.entries.length > 1 ? `Checksum list · ${t.sums.entries.length} files` : `${t.sums.entries[0].algo} checksum`),
    sealed: () => 'Sealed message', epoch: () => `Unix time in ${t.unit}`, json: () => 'JSON', binary: () => (t.magic ? t.magic.type.replace(/ —.*/, '') : 'Binary data'), text: () => (steps.length ? 'Text' : 'Plain text'), error: () => 'Couldn’t decode' }[t.type]();
  return steps.length ? `${steps.join(' → ')} → ${end}` : end;
}
function renderMeta(r) {
  const meta = box.querySelector('.fw-paste__meta');
  const notes = r.term.type === 'jwt' ? r.term.tok.notes : [];
  meta.innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>Detected: ${esc(detectLabel(r))}</span><button type="button" id="ins-change" aria-haspopup="menu">change</button></span>
    ${notes.map((n) => `<span class="fw-badge">${icon('check', { size: 12 })}${esc(n)}</span>`).join('')}
    <span class="ins-privacy">${icon('lock', { size: 12 })} Decoded on this device · nothing is sent or saved</span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm sec-show-coarse" type="button" id="ins-samples-m">${icon('chevron-down')}Samples</button>`;
  $('#ins-change').onclick = (e) => openMenu(e.currentTarget, [
    { group: 'Read the input as', items: [
      { label: 'Auto-detect', checked: !S.forced, onSelect: () => { S.forced = null; S.manual = []; update(); } },
      { label: 'Plain text', checked: S.forced === 'text', onSelect: () => { S.forced = 'text'; S.manual = []; update(); } },
      { label: 'Base64 / Base64URL', checked: S.forced === 'b64-decode', onSelect: () => { S.forced = 'b64-decode'; S.manual = []; update(); } },
      { label: 'URL-encoded', checked: S.forced === 'url-decode', onSelect: () => { S.forced = 'url-decode'; S.manual = []; update(); } },
      { label: 'Hex bytes', checked: S.forced === 'hex-decode', onSelect: () => { S.forced = 'hex-decode'; S.manual = []; update(); } },
      { label: 'HTML entities', checked: S.forced === 'html-decode', onSelect: () => { S.forced = 'html-decode'; S.manual = []; update(); } },
    ] }], { placement: 'bottom-start' });
  $('#ins-samples-m').onclick = (e) => sampleMenu(e.currentTarget);
}
function metaEmpty() {
  const meta = box.querySelector('.fw-paste__meta');
  meta.innerHTML = `<span class="ins-privacy">${icon('lock', { size: 12 })} Decoded on this device · nothing is sent or saved</span>`;
}

function preview(v) {
  if (v.bytes) { const t = C.tryUtf8(v.bytes); return t != null && C.looksPrintable(t) ? `${t.length.toLocaleString('en-US')} chars` : `${C.fmtBytes(v.bytes.length)} binary`; }
  return `${v.text.length.toLocaleString('en-US')} chars`;
}
function renderChain(r) {
  const el = $('#ins-chain');
  const show = r.stages.length > 1 || ['text', 'json', 'binary'].includes(r.term.type);
  if (!show) { el.innerHTML = ''; return; }
  const parts = r.stages.map((s, i) => {
    const sel = S.view === i || (S.view == null && i === r.stages.length - 1 && r.stages.length > 1);
    const removable = i > 0;
    return `${i ? `<span class="ins-arrow" aria-hidden="true">${icon('arrow-right', { size: 14 })}</span>` : ''}
      <span class="ins-stage ${s.how === 'manual' ? 'is-manual' : ''} ${sel ? 'is-sel' : ''}" role="listitem">
        <button type="button" class="ins-stage__btn" data-stage="${i}" aria-pressed="${sel}"><span class="ins-stage__k">${esc(s.label)}</span><span class="ins-stage__v">${esc(s.note || preview(s.value))}</span></button>
        ${removable ? `<button type="button" class="ins-stage__x" data-rm="${i}" aria-label="Remove ${esc(s.label)}" data-tip="Remove step">${icon('x', { size: 12 })}</button>` : ''}
      </span>`;
  }).join('');
  el.innerHTML = `<div class="ins-chain" role="list" aria-label="Decoding steps">${parts}
    <button type="button" class="fw-btn fw-btn--ghost fw-btn--sm ins-add" id="ins-add">${icon('plus')}Step</button></div>
    ${r.stages.some((s) => s.step === 'url-decode') ? `<label class="fw-toggle ins-plus"><input type="checkbox" id="ins-plus" ${S.plus ? 'checked' : ''}>Treat + as space (form encoding)</label>` : ''}`;
  enhance(el);
  $$('[data-stage]', el).forEach((b) => b.onclick = () => { const i = +b.dataset.stage; S.view = i === r.stages.length - 1 ? null : i; renderChain(r); renderTerm(r); });
  $$('[data-rm]', el).forEach((b) => b.onclick = () => {
    const i = +b.dataset.rm; const s = r.stages[i];
    const firstManual = r.stages.length - S.manual.length;
    if (s.how === 'manual') S.manual.splice(i - firstManual, 1);
    else { S.forced = 'text'; S.manual = []; toast(`Showing the input as text · ${s.label} removed`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.forced = null; update(); } } }); }
    S.view = null; update();
  });
  $('#ins-add').onclick = (e) => openMenu(e.currentTarget, [
    { group: 'Decode', items: ['b64-decode', 'url-decode', 'hex-decode', 'html-decode', 'gunzip'].map((id) => ({ label: STEPS[id].label, onSelect: () => addStep(id) })) },
    { group: 'Encode', items: ['b64-encode', 'b64url-encode', 'url-encode', 'hex-encode', 'html-encode', 'gzip'].map((id) => ({ label: STEPS[id].label, onSelect: () => addStep(id) })) },
  ], { placement: 'bottom-start' });
  const plus = $('#ins-plus'); if (plus) plus.onchange = () => { S.plus = plus.checked; update(); };
}
function addStep(id) { S.manual.push(id); S.view = null; update(); }

// ───────────── terminal renderers ─────────────
function renderTerm(r) {
  const out = $('#ins-out');
  if (r.error) {
    out.innerHTML = `<div class="fw-alert fw-alert--danger"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body"><b>That step didn’t work.</b> ${esc(r.error)}<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" id="ins-undo-step">Remove the last step</button></div></div></div>`;
    $('#ins-undo-step').onclick = () => { if (S.manual.length) S.manual.pop(); else S.forced = 'text'; update(); };
    setBar(null); return;
  }
  if (S.view != null && S.view < r.stages.length - 1) return renderStage(r.stages[S.view], S.view, r);
  const t = r.term;
  ({ jwt: renderJwt, uuid: renderUuid, checksum: renderChecksum, sealed: renderSealed, epoch: renderEpoch, json: renderJson, binary: renderBinary, text: renderText }[t.type])(t, r);
  refreshLeafLinks(out);
}
function renderStage(s, i, r) {
  const out = $('#ins-out'); const v = s.value; const t = v.bytes ? C.tryUtf8(v.bytes) : v.text;
  const body = t != null && C.looksPrintable(t) ? `<pre class="ins-text">${esc(t)}</pre>` : hexdumpHtml(v.bytes, 512);
  out.innerHTML = `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('info')}</span><div class="fw-alert__body">Showing step ${i} of ${r.stages.length - 1}: the output of <b>${esc(s.label)}</b>. <a href="#" id="ins-back">Show the result</a></div></div>
    <div class="fw-output ins-outbox">${body}<button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" data-copy="${esc(t ?? C.toHex(v.bytes))}" aria-label="Copy step output" data-tip="Copy">${icon('copy')}</button></div>`;
  enhance(out);
  $('#ins-back').onclick = (e) => { e.preventDefault(); S.view = null; renderChain(r); renderTerm(r); };
}
function copyBtn(value, label = 'Copy', primary = false, id = '') {
  return `<button class="fw-btn ${primary ? 'fw-btn--primary' : ''}" type="button" ${id ? `id="${id}"` : ''} data-copy="${esc(value)}">${icon('copy')}<span>${esc(label)}</span></button>`;
}
function barCopy(line, value, label = 'Copy') { setBar({ line, actions: [{ label, icon: 'copy', primary: true, onClick: (b) => copyText(value, b) }] }); }

// JWT
function validity(p) {
  const now = Date.now(); const n = (x) => (typeof x === 'number' && isFinite(x) ? x * 1000 : null);
  const exp = n(p?.exp), nbf = n(p?.nbf), iat = n(p?.iat);
  if (nbf && nbf > now + 60e3) return { tone: 'warn', icon: 'clock', title: `Not valid until ${fmtClock(nbf)}`, rel: nbf, relPrefix: '', exp, nbf, iat };
  if (exp && exp <= now) return { tone: 'bad', icon: 'circle-x', title: 'Expired', rel: exp, exp, nbf, iat };
  if (exp) return { tone: 'ok', icon: 'clock', title: 'Not expired · expires', rel: exp, exp, nbf, iat, timeOk: true };
  return { tone: 'warn', icon: 'triangle-alert', title: 'Never expires · no “exp” claim', exp, nbf, iat };
}
function claimValue(k, v) {
  if (TIME_CLAIMS.has(k) && typeof v === 'number') {
    return `<span class="ins-claim__human">${esc(fmtWhen(v * 1000))} · ${rel(v * 1000)}</span><span class="ins-claim__raw fw-mono">${v}</span>`;
  }
  if ((k === 'scope' || k === 'scp') && typeof v === 'string') return `<span class="ins-scopes">${v.split(/\s+/).map((s) => `<span class="fw-badge ${/admin|\*/.test(s) ? 'fw-badge--danger' : ''}">${esc(s)}</span>`).join('')}</span>`;
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `<span class="ins-scopes">${v.map((s) => `<span class="fw-badge fw-badge--mono ${/admin|super/.test(s) ? 'fw-badge--danger' : ''}">${esc(s)}</span>`).join('')}</span>`;
  return `<span class="fw-mono ins-claim__v">${esc(typeof v === 'string' ? v : JSON.stringify(v))}</span>`;
}
function renderJwt(t) {
  const out = $('#ins-out'); const tok = t.tok;
  if (tok.kind === 'jwe') {
    out.innerHTML = `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('lock')}</span><div class="fw-alert__body"><b>Encrypted token (JWE).</b> Only the header is readable; the claims need the recipient’s private key, which never belongs in a browser tab.</div></div>
      <section class="fw-card ins-raw"><div class="ins-raw__head"><h3>Header</h3></div><pre class="ins-json">${C.jsonHtml(tok.header)}</pre></section>`;
    setBar(null); return;
  }
  const p = tok.payload || {}; const va = validity(tok.payload);
  const hb = [['JWS', ''], [tok.header.alg || 'no alg', tok.header.alg === 'none' || !tok.header.alg ? 'danger' : 'mono'], tok.header.kid ? [`kid ${tok.header.kid}`, 'mono'] : null, tok.header.typ ? [`typ ${tok.header.typ}`, ''] : null].filter(Boolean);
  const claimRows = Object.entries(p).map(([k, v]) => `<div class="ins-claim">
      <div class="ins-claim__k"><code>${esc(k)}</code>${CLAIMS[k] ? `<span>${esc(CLAIMS[k])}</span>` : ''}</div>
      <div class="ins-claim__val">${claimValue(k, v)}</div>
      <button class="fw-iconbtn fw-iconbtn--sm fw-copy" type="button" data-copy="${esc(typeof v === 'string' ? v : JSON.stringify(v))}" aria-label="Copy ${esc(k)}" data-tip="Copy">${icon('copy')}</button></div>`).join('');
  const relLine = va.rel ? ` ${rel(va.rel)}` : ''; S.va = va;
  out.innerHTML = `<div class="ins-jwt">
    <div class="ins-col">
      <section class="ins-validity is-${va.tone}">
        <div class="ins-validity__badges">${hb.map(([l, k]) => `<span class="fw-badge ${k ? 'fw-badge--' + k : ''}">${esc(l)}</span>`).join('')}</div>
        <div class="ins-validity__title" id="ins-vtitle">${icon(va.icon, { size: 24 })}<span>${esc(va.title)}${relLine}</span></div>
        <dl class="ins-validity__rows">
          ${va.exp ? `<dt>Expires</dt><dd>${esc(fmtWhen(va.exp, { weekday: true }))}</dd>` : ''}
          ${va.nbf && Math.abs(va.nbf - (va.iat || 0)) > 1000 ? `<dt>Valid from</dt><dd>${esc(fmtWhen(va.nbf))} · ${rel(va.nbf)}</dd>` : ''}
          ${va.iat ? `<dt>Issued</dt><dd>${rel(va.iat)} · ${esc(fmtWhen(va.iat))}</dd>` : ''}
          ${p.iss ? `<dt>By</dt><dd class="fw-mono">${esc(p.iss)}</dd>` : ''}
        </dl>
        <button class="ins-sigline" type="button" id="ins-sigline" data-state="unchecked">${icon('shield-check')}<span>Signature not checked · paste a key to verify</span>${icon('arrow-right', { size: 14 })}</button>
      </section>
      <section class="fw-card ins-claims">
        <div class="ins-claims__head"><h3>Claims</h3><span class="fw-faint fw-t-sm">${Object.keys(p).length} · times in ${esc(LOCAL_TZ.replace(/_/g, ' '))}</span><span class="fw-spacer"></span>${copyBtn(JSON.stringify(p, null, 2), 'Copy JSON', false, 'ins-copy-payload')}</div>
        <div class="ins-claims__list">${claimRows || '<p class="fw-muted fw-t-sm" style="padding:12px 16px">The payload isn’t JSON.</p>'}</div>
      </section>
      <details class="fw-card ins-raw">
        <summary><span>Header, payload and signature as JSON</span>${icon('chevron-down')}</summary>
        <div class="ins-raw__grid">
          <div><div class="ins-raw__label"><span class="ins-dot seg-h"></span>Header</div><div class="fw-output"><pre class="ins-json">${C.jsonHtml(tok.header)}</pre><button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" data-copy="${esc(JSON.stringify(tok.header, null, 2))}" aria-label="Copy header" data-tip="Copy">${icon('copy')}</button></div></div>
          <div><div class="ins-raw__label"><span class="ins-dot seg-p"></span>Payload</div><div class="fw-output"><pre class="ins-json">${tok.payload ? C.jsonHtml(tok.payload) : esc(tok.payloadText || '')}</pre><button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" data-copy="${esc(tok.payload ? JSON.stringify(tok.payload, null, 2) : tok.payloadText || '')}" aria-label="Copy payload" data-tip="Copy">${icon('copy')}</button></div></div>
          <div class="ins-raw__sig"><div class="ins-raw__label"><span class="ins-dot seg-s"></span>Signature · ${tok.sig.length} bytes</div><div class="fw-output"><pre class="ins-json fw-mono">${esc(tok.parts[2] || '(empty)')}</pre></div></div>
        </div>
      </details>
    </div>
    <aside class="fw-card ins-verify" id="ins-verify">
      <div class="ins-verify__head">${icon('key-round', { size: 18 })}<h2>Verify signature</h2></div>
      <p class="ins-verify__lede" id="vlede"></p>
      <div class="ins-keybox">
        <label class="fw-sr" for="vkey">Key for verification</label>
        <textarea class="fw-textarea fw-input--mono ins-keyfield" id="vkey" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
        <button class="fw-btn fw-btn--sm ins-keybox__paste" type="button" id="vpaste">${icon('clipboard-paste')}Paste</button>
      </div>
      <div id="vsecret"></div>
      <div id="vres" class="ins-vres-wrap" aria-live="polite"></div>
      <p class="ins-verify__foot">${icon('info', { size: 14 })}<span>The algorithm comes from the key, never from the token. Keys are never fetched: open <code>…/.well-known/jwks.json</code> and paste it. <a href="#" id="vsample">Try the sample JWKS</a></span></p>
    </aside>
  </div>`;
  enhance(out);
  const hs = String(tok.header.alg || '').startsWith('HS');
  $('#vlede').textContent = hs ? `${tok.header.alg} uses a shared secret. Paste it, or the issuer’s key if you expected RS/ES.` : 'Paste the issuer’s public key, certificate or JWKS.';
  const k = $('#vkey'); k.placeholder = hs ? 'Shared secret…' : '-----BEGIN PUBLIC KEY-----  or  {"keys": [ … ]}';
  k.value = S.vkey;
  k.addEventListener('input', () => { S.vkey = k.value; clearTimeout(S.vt); S.vt = setTimeout(runVerify, 120); });
  $('#vpaste').onclick = async () => { try { k.value = await navigator.clipboard.readText(); S.vkey = k.value; runVerify(); } catch { k.focus(); } };
  $('#vsample').onclick = async (e) => { e.preventDefault(); const g = await getSamples(); const it = g[0].items.find((x) => x.id === 'jwks'); useSample(it); };
  $('#ins-sigline').onclick = () => { k.focus(); k.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  runVerify();
  barCopy(`${tok.header.alg || ''} · ${va.title}${va.rel ? ' ' + relHuman(va.rel) : ''}`, JSON.stringify(p, null, 2), 'Copy claims');
}
async function runVerify() {
  const r = S.result; if (!r || r.term.type !== 'jwt') return;
  const tok = r.term.tok; const res = $('#vres'); const sig = $('#ins-sigline'); if (!res) return;
  const text = S.vkey.trim();
  const hs = String(tok.header.alg || '').startsWith('HS');
  const sec = $('#vsecret');
  if (!text) {
    res.innerHTML = `<div class="ins-vres is-empty">${icon('shield-check', { size: 18 })}<span>The result appears here, right next to the key.</span></div>`;
    setSig('unchecked', 'Signature not checked · paste a key to verify'); sec.innerHTML = ''; return;
  }
  const ks = await parseKeys(text, { secretEncoding: S.secretEnc });
  if (S.vkey.trim() !== text) return;
  sec.innerHTML = ks?.source === 'secret' && hs ? `<div class="fw-seg fw-seg--sm ins-enc" aria-label="Secret encoding">${['utf8', 'base64', 'hex'].map((e) => `<button class="fw-seg__opt" type="button" data-value="${e}" aria-checked="${S.secretEnc === e}">${{ utf8: 'Text (UTF-8)', base64: 'Base64', hex: 'Hex' }[e]}</button>`).join('')}</div>` : '';
  enhance(sec); sec.querySelector('.fw-seg')?.addEventListener('fw-change', (e) => { S.secretEnc = e.detail.value; runVerify(); });
  if (ks.error) { res.innerHTML = `<div class="ins-vres is-warn">${icon('triangle-alert', { size: 22 })}<div><b>Can’t use this as a key</b><p>${esc(ks.error)}</p></div></div>`; setSig('warn', 'Key not usable'); return; }
  const v = await verifyToken(tok, ks);
  if (S.vkey.trim() !== text) return;
  const tone = v.status === 'valid' ? 'ok' : 'bad';
  res.innerHTML = `${ks.warning ? `<div class="fw-alert fw-alert--warning ins-keywarn"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(ks.warning)}</div></div>` : ''}
    <div class="ins-vres is-${tone} ${v.confusion ? 'is-confusion' : ''}">${icon(v.status === 'valid' ? 'shield-check' : 'circle-x', { size: 26 })}<div><b>${esc(v.title)}</b><p>${esc(v.detail)}</p></div></div>
    <div class="ins-keyline">${icon('key-round', { size: 14 })}<span>${esc(ks.label)}${ks.cert?.notAfter ? ` · valid until ${esc(fmtWhen(ks.cert.notAfter, { zone: false }))}` : ''}</span></div>`;
  setSig(v.status, v.status === 'valid' ? `Signature valid · ${v.alg}${v.kid ? ' · ' + v.kid : ''}` : v.status === 'rejected' ? (v.confusion ? 'Rejected · algorithm confusion' : 'Rejected') : 'Signature invalid');
}
/** The headline combines time and signature: "Valid" only when both hold; a rejected signature overrides everything. */
function paintValidity(state) {
  const va = S.va; const card = $('.ins-validity'); const t = $('#ins-vtitle'); if (!va || !card || !t) return;
  let tone = va.tone, ic = va.icon, title = va.title, relOn = !!va.rel;
  if (state === 'invalid' || state === 'rejected') { tone = 'bad'; ic = 'circle-x'; title = 'Don’t trust this token'; relOn = false; }
  else if (state === 'valid' && va.timeOk) { tone = 'ok'; ic = 'circle-check'; title = 'Valid · expires'; }
  card.className = `ins-validity is-${tone}`;
  t.innerHTML = `${icon(ic, { size: 24 })}<span>${esc(title)}${relOn ? ' ' + rel(va.rel) : ''}</span>`;
}
function setSig(state, text) {
  paintValidity(state);
  const s = $('#ins-sigline'); if (!s) return;
  s.dataset.state = state;
  s.innerHTML = `${icon(state === 'valid' ? 'shield-check' : state === 'unchecked' ? 'shield-check' : state === 'warn' ? 'triangle-alert' : 'circle-x')}<span>${esc(text)}</span>${state === 'unchecked' ? icon('arrow-right', { size: 14 }) : ''}`;
}

// UUID
function renderUuid(t) {
  const u = t.u; const out = $('#ins-out');
  const forms = [['Canonical', u.canon], ['Uppercase', u.canon.toUpperCase()], ['No hyphens', u.hex], ['Braces', `{${u.canon}}`], ['URN', `urn:uuid:${u.canon}`], ['Base64URL (22 chars)', C.b64encode(C.parseHex(u.hex), { url: true })]];
  out.innerHTML = `<section class="fw-hero ins-hero">
      <span class="fw-hero__label">${u.nil ? 'Nil UUID · all zeros (RFC 9562)' : u.max ? 'Max UUID · all ones (RFC 9562)' : `UUID · ${esc(u.form)}`}</span>
      <div class="fw-hero__value fw-hero__value--mono ins-uuid">${esc(u.canon)}</div>
      <div class="ins-badges">${u.nil || u.max ? '' : `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Version ${u.ver} · ${esc(u.verName)}</span><span class="fw-badge">Variant ${esc(u.variant)}</span>`}</div>
      ${u.time != null ? `<div class="ins-uuid-time">${icon('calendar-clock', { size: 18 })}<span>Created <b>${esc(fmtWhen(u.time, { seconds: true, weekday: true }))}</b> · ${rel(u.time)}</span><a class="fw-btn fw-btn--sm fw-btn--ghost" data-leaf="time" data-query="q=${u.time}">Open in Time ${icon('arrow-right', { size: 14 })}</a></div>` : ''}
      <div class="fw-hero__actions">${copyBtn(u.canon, 'Copy', true)}<a class="fw-btn" data-leaf="uuid-generator">${icon('refresh-cw')}Generate more</a></div>
    </section>
    <div class="fw-rows">${forms.map(([l, v]) => vrow(l, v)).join('')}</div>`;
  enhance(out); barCopy(u.canon, u.canon);
}
const vrow = (l, v, sans = false) => `<div class="fw-vrow"><span class="fw-vrow__label">${esc(l)}</span><span class="fw-vrow__value ${sans ? 'fw-vrow__value--sans' : ''}">${esc(v)}</span><button class="fw-iconbtn fw-iconbtn--sm fw-copy" type="button" data-copy="${esc(v)}" aria-label="Copy ${esc(l)}" data-tip="Copy">${icon('copy')}</button></div>`;

// Checksum
function renderChecksum(t) {
  const out = $('#ins-out'); const p = t.sums; const e = p.entries[0];
  const many = p.entries.length > 1;
  out.innerHTML = `<section class="fw-hero ins-hero">
      <span class="fw-hero__label">${icon('fingerprint')} ${many ? `Checksum list · ${p.entries.length} files` : `Looks like a ${esc(e.algo)} checksum${e.name ? ` for <b class="ins-fname">${esc(e.name)}</b>` : ''}`}</span>
      ${many ? `<div class="ins-sumlist">${p.entries.map((x) => `<div><span class="fw-mono">${esc(x.hash.slice(0, 8))}…${esc(x.hash.slice(-4))}</span><span>${esc(x.name || '—')}</span><span class="fw-badge">${esc(x.algo)}</span></div>`).join('')}</div>`
        : `<div class="ins-digest fw-mono">${esc(C.groupHex(e.hash))}</div>`}
      ${LEGACY.has(e.algo) ? `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(e.algo)} is fine for spotting a broken download, not for proving nobody tampered with it.</div></div>` : ''}
      <div class="fw-hero__actions"><a class="fw-btn fw-btn--primary fw-btn--lg" id="ins-verify-file" data-leaf="checksum" data-query="q=${encodeURIComponent(S.input.trim())}">${icon('file-check')}Verify a file against it</a>${copyBtn(many ? S.input.trim() : e.hash, 'Copy')}</div>
    </section>
    <div class="fw-rows">${vrow('Algorithm', `${e.algo} · ${e.hash.length} hex characters`, true)}${vrow('Format', describeSums(p), true)}${many ? '' : vrow('As Base64', C.b64encode(C.parseHex(e.hash)))}</div>`;
  enhance(out);
  setBar({ line: `${e.algo}${e.name ? ' · ' + e.name : ''}`, actions: [{ label: 'Verify a file', icon: 'file-check', primary: true, onClick: () => navigate('checksum', { query: { q: S.input.trim() } }) }] });
}
function renderSealed() {
  const out = $('#ins-out');
  out.innerHTML = `<section class="fw-hero ins-hero"><span class="fw-hero__label">${icon('stamp')} Sealed message</span><p class="fw-t-md">This text was sealed with Fernwork. It opens with the password the sender gave you.</p>
    <div class="fw-hero__actions"><a class="fw-btn fw-btn--primary" data-leaf="seal" data-query="q=${encodeURIComponent(S.input.trim())}">${icon('lock')}Open in Seal</a></div></section>`;
  setBar(null);
}
function renderEpoch(t) {
  const out = $('#ins-out');
  out.innerHTML = `<section class="fw-hero ins-hero"><span class="fw-hero__label">${icon('calendar-clock')} Unix time in ${esc(t.unit)}</span>
    <div class="fw-hero__value ins-epoch">${esc(fmtWhen(t.ms, { seconds: true, weekday: true, zone: false }))}</div>
    <span class="fw-hero__sub">${esc(LOCAL_TZ.replace(/_/g, ' '))} · ${rel(t.ms, 2)}</span>
    <div class="fw-hero__actions">${copyBtn(new Date(t.ms).toISOString(), 'Copy ISO', true)}<a class="fw-btn" data-leaf="time" data-query="q=${encodeURIComponent(S.input.trim())}">${icon('calendar-clock')}Open in Time</a></div></section>`;
  enhance(out); barCopy(new Date(t.ms).toISOString(), new Date(t.ms).toISOString(), 'Copy ISO');
}
function renderJson(t) {
  const out = $('#ins-out'); const pretty = JSON.stringify(t.value, null, 2);
  const k = Array.isArray(t.value) ? `${t.value.length} items` : `${Object.keys(t.value).length} keys`;
  out.innerHTML = `<section class="fw-card ins-result">
      <div class="ins-result__head"><span class="fw-verdict fw-verdict--ok">${icon('braces')} JSON · ${esc(k)}</span><span class="fw-spacer"></span>${copyBtn(JSON.stringify(t.value), 'Copy minified')}${copyBtn(pretty, 'Copy', true)}</div>
      <pre class="ins-json ins-json--big">${C.jsonHtml(t.value)}</pre>
      <div class="ins-result__foot"><a href="#" data-leaf="format-json">${icon('braces')}Open in Textbench</a>${encodeChips()}</div>
    </section>`;
  enhance(out); wireEncode(); barCopy(`JSON · ${k}`, pretty);
}
function encodeChips() {
  return `<span class="ins-encode"><span class="fw-faint">Encode as</span>${[['b64-encode', 'Base64'], ['b64url-encode', 'Base64URL'], ['url-encode', 'URL'], ['hex-encode', 'Hex'], ['html-encode', 'HTML']].map(([id, l]) => `<button class="fw-chip" type="button" data-enc="${id}">${l}</button>`).join('')}</span>`;
}
function wireEncode() { $$('[data-enc]').forEach((b) => b.onclick = () => addStep(b.dataset.enc)); }
function renderText(t, r) {
  const out = $('#ins-out'); const text = t.text;
  const markup = /<\s*[a-z!/]/i.test(text) && r.stages.some((s) => s.step === 'html-decode');
  const lines = text.split('\n').length; const bytes = C.utf8Bytes(text).length;
  const decoded = r.stages.length > 1;
  out.innerHTML = `<section class="fw-card ins-result">
      <div class="ins-result__head"><span class="fw-verdict fw-verdict--ok">${icon(decoded ? 'circle-check' : 'text-cursor')} ${decoded ? 'Decoded text' : 'Text'}</span>
        <span class="fw-faint fw-t-sm ins-stats">${text.length.toLocaleString('en-US')} characters · ${C.fmtBytes(bytes)} UTF-8 · ${lines} line${lines > 1 ? 's' : ''}</span><span class="fw-spacer"></span>${copyBtn(text, 'Copy', true)}</div>
      ${markup ? `<div class="ins-safe">${icon('shield-check', { size: 16 })}<span>Contains HTML markup. It’s shown as text and never run.</span></div>` : ''}
      <pre class="ins-text">${esc(text)}</pre>
      <div class="ins-result__foot">${encodeChips()}</div>
    </section>`;
  enhance(out); wireEncode(); barCopy(text.slice(0, 60), text);
}
function hexdumpHtml(bytes, max = 256) {
  const lines = C.hexdump(bytes, max);
  return `<pre class="ins-hexdump">${lines.map((l) => `<span class="hd-off">${l.off}</span>  ${esc(l.hex)}  <span class="hd-asc">${esc(l.ascii)}</span>`).join('\n')}${bytes.length > max ? `\n<span class="hd-off">… ${(bytes.length - max).toLocaleString('en-US')} more bytes</span>` : ''}</pre>`;
}
let blobUrl = null;
async function renderBinary(t, r, name) {
  const out = $('#ins-out'); const b = t.bytes; const m = t.magic;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  const mime = m?.mime || t.mime || 'application/octet-stream';
  blobUrl = URL.createObjectURL(new Blob([b], { type: mime }));
  const fname = name || `decoded.${m?.ext || 'bin'}`;
  const dim = m?.ext === 'png' ? C.pngSize(b) : null;
  const sha = C.toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));
  out.innerHTML = `<section class="fw-card ins-result ins-bin">
      <div class="ins-bin__top">
        ${m?.image ? `<div class="ins-bin__preview"><img src="${blobUrl}" alt="Decoded image preview"></div>` : `<div class="ins-bin__preview ins-bin__preview--icon">${icon('file', { size: 28 })}</div>`}
        <div class="ins-bin__info">
          <span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Binary · ${esc(m ? m.type : 'unknown type')}</span>
          <div class="ins-bin__title">${esc(fname)}</div>
          <div class="fw-muted fw-t-sm">${C.fmtBytes(b.length)}${dim ? ` · ${dim.w} × ${dim.h} px` : ''}${r.stages.length > 1 ? ` · decoded from ${esc(r.stages.slice(1).map((s) => s.label.replace(/ decode$/, '')).join(' → '))}` : ''}</div>
          <div class="fw-hero__actions"><a class="fw-btn fw-btn--primary" href="${blobUrl}" download="${esc(fname)}" id="ins-dl">${icon('download')}Download ${esc(fname)}</a>${copyBtn(C.toHex(b.subarray(0, 4096)), 'Copy hex')}${copyBtn(C.b64encode(b), 'Copy Base64')}</div>
        </div>
      </div>
      <div class="ins-bin__label">First ${Math.min(256, b.length)} bytes</div>
      ${hexdumpHtml(b, 256)}
    </section>
    <div class="fw-rows">${vrow('SHA-256', sha)}${vrow('Size', `${b.length.toLocaleString('en-US')} bytes`, true)}${m ? vrow('Type', `${m.type} · ${m.mime}`, true) : ''}</div>`;
  enhance(out);
  setBar({ line: `${m ? m.type : 'Binary'} · ${C.fmtBytes(b.length)}`, actions: [{ label: 'Download', icon: 'download', primary: true, onClick: () => $('#ins-dl').click() }] });
}

// files dropped on Inspect: look inside without uploading
async function inspectFile(f) {
  if (!f) return;
  if (f.size < 512 * 1024 && /^(text\/|application\/(json|xml|x-pem-file))/.test(f.type || 'text/') ) {
    const t = await f.text(); if (C.looksPrintable(t)) { set(t); toast(`Opened ${f.name} as text`, { type: 'info' }); return; }
  }
  S.file = f; field.value = ''; S.input = ''; S.sync(); update();
}
async function renderFile() {
  const f = S.file; $('#ins-chain').innerHTML = ''; metaEmpty();
  const head = new Uint8Array(await f.slice(0, Math.min(f.size, 64 * 1024 * 1024)).arrayBuffer());
  await renderBinary({ bytes: head.length === f.size ? head : head.subarray(0, 4096), magic: C.sniff(head) }, { stages: [] }, f.name);
  if (head.length !== f.size) toast('Large file: showing the first bytes. Checksum hashes the whole file.', { type: 'info', action: { label: 'Checksum', onClick: () => navigate('checksum', { files: [f] }) } });
}

function renderEmpty() {
  metaEmpty(); $('#ins-chain').innerHTML = ''; setBar(null);
  const tiles = [
    ['jwt', 'key-round', 'JWT', 'Claims, expiry, verify'], ['sum', 'fingerprint', 'Checksum', 'Verify a download'], ['png', 'image', 'Base64 image', 'See and save it'],
    ['cookie', 'braces', 'Cookie value', 'URL → Base64 → JSON'], ['uuid7', 'hash', 'UUID v7', 'When was it made?'], ['html', 'code-xml', 'HTML entities', 'Decoded safely'],
  ];
  $('#ins-out').innerHTML = `<section class="ins-empty">
      <h2 class="ins-empty__title">Paste a value and see what it is.</h2>
      <p class="ins-empty__text">Tokens, checksums, Base64, URL encoding, hex, UUIDs, timestamps. <span class="fw-pointer-copy">Press ${kbd('mod+v')} anywhere on this page, or drop a file.</span></p>
      <div class="ins-tiles" role="list">${tiles.map(([id, ic, t, s]) => `<button class="ins-tile" type="button" data-sample-id="${id}" role="listitem"><span class="ins-tile__icon">${icon(ic, { size: 18 })}</span><span><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
    </section>`;
  $$('[data-sample-id]').forEach((b) => b.onclick = async () => { const g = await getSamples(); for (const gr of g) for (const it of gr.items) if (it.id === b.dataset.sampleId) set(it.value); });
}
