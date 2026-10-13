// Developer ▸ Keys & HMAC: HMAC sign/verify, key pairs (PEM + JWK with RFC 7638 thumbprint), PBKDF2. All Web Crypto.
import { icon, esc, $, $$, h, enhance, copyText, toast, store } from '../kit/shell.js';
import { b64encode, b64decode, toHex, parseHex, utf8Bytes, groupHex } from './codec.js';
import { setBar, isCoarse } from './util.js';

const subtle = crypto.subtle;
const S = Object.assign({ tab: 'hmac', msg: '{"order":"ORD-2026-08812","amount":12990,"currency":"EUR"}', msgEnc: 'utf8', key: 'whsec_7Fq2Lx9aP0cRk3vT', keyEnc: 'utf8', algo: 'SHA-256', outEnc: 'hex', expect: '', kp: 'Ed25519', pw: '', salt: '', iter: 600000, dlen: 32 }, store.get('dev:keys') || {});
const save = () => store.set('dev:keys', { tab: S.tab, msgEnc: S.msgEnc, keyEnc: S.keyEnc, algo: S.algo, outEnc: S.outEnc, kp: S.kp, iter: S.iter, dlen: S.dlen });
let ctx;
const bytesFrom = (s, enc) => { if (enc === 'hex') { const b = parseHex(s); if (!b) throw new Error('Not valid hex'); return b; } if (enc === 'base64') return b64decode(s); return utf8Bytes(s); };
const encOut = (b, enc) => (enc === 'hex' ? toHex(b) : enc === 'base64' ? b64encode(b) : b64encode(b, { url: true }));
const seg = (id, label, opts, cur) => `<div class="fw-seg fw-seg--sm" id="${id}" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${esc(v)}" aria-checked="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const ENC = [['utf8', 'Text'], ['hex', 'Hex'], ['base64', 'Base64']];

export async function mount(c) {
  ctx = c;
  ctx.renderHeader({});
  ctx.root.innerHTML = `<div class="keys">${seg('k-tab', 'Tool', [['hmac', 'HMAC'], ['pair', 'Key pair'], ['kdf', 'Derive key']], S.tab)}<div id="k-body"></div></div>`;
  enhance(ctx.root);
  $('#k-tab').addEventListener('fw-change', (e) => { S.tab = e.detail.value; save(); render(); });
  ctx.hooks.onPaste = (t) => { if (S.tab === 'hmac') { S.msg = t; render(); return true; } return false; };
  render();
}
function render() { ({ hmac: renderHmac, pair: renderPair, kdf: renderKdf })[S.tab](); }

// ───────────── HMAC ─────────────
function renderHmac() {
  $('#k-body').innerHTML = `<div class="k-grid">
    <section class="fw-card k-card">
      <div class="k-field"><div class="k-field__head"><label for="k-msg">Message</label>${seg('k-msgenc', 'Message encoding', ENC, S.msgEnc)}</div>
        <textarea class="fw-textarea fw-input--mono" id="k-msg" rows="4" spellcheck="false">${esc(S.msg)}</textarea></div>
      <div class="k-field"><div class="k-field__head"><label for="k-key">Secret key</label>${seg('k-keyenc', 'Key encoding', ENC, S.keyEnc)}</div>
        <div class="k-keyrow"><input class="fw-input fw-input--mono" id="k-key" value="${esc(S.key)}" placeholder="Shared secret" autocomplete="off" spellcheck="false"><button class="fw-btn" type="button" id="k-suggest">${icon('refresh-cw')}Random 32 bytes</button></div>
        <div class="fw-field__hint" id="k-keyhint"></div></div>
      <div class="k-field"><div class="k-field__head"><span>Hash</span>${seg('k-algo', 'Hash', [['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512'], ['SHA-1', 'SHA-1']], S.algo)}</div></div>
    </section>
    <section class="fw-card k-card k-result">
      <div class="k-field__head"><h2>HMAC-${esc(S.algo)}</h2>${seg('k-outenc', 'Output encoding', [['hex', 'Hex'], ['base64', 'Base64'], ['base64url', 'Base64URL']], S.outEnc)}</div>
      <div class="fw-output k-out"><div class="fw-output__value" id="k-out"></div><button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" id="k-copy" aria-label="Copy signature" data-tip="Copy">${icon('copy')}</button></div>
      <div class="k-field"><label class="k-field__head" for="k-exp"><span>Check a signature you received</span><span class="fw-faint fw-t-xs">hex or Base64</span></label>
        <input class="fw-input fw-input--mono" id="k-exp" value="${esc(S.expect)}" placeholder="Paste the signature header value" autocomplete="off" spellcheck="false"></div>
      <div id="k-verdict" aria-live="polite"></div>
      <p class="k-note">${icon('lock', { size: 12 })}<span>Signed with Web Crypto on this device. The check uses <code>crypto.subtle.verify</code>, not a string compare.</span></p>
    </section></div>`;
  enhance($('#k-body'));
  const upd = () => hmac();
  $('#k-msg').addEventListener('input', (e) => { S.msg = e.target.value; upd(); });
  $('#k-key').addEventListener('input', (e) => { S.key = e.target.value; upd(); });
  $('#k-exp').addEventListener('input', (e) => { S.expect = e.target.value; upd(); });
  $('#k-suggest').onclick = () => { S.keyEnc = 'hex'; S.key = toHex(crypto.getRandomValues(new Uint8Array(32))); save(); renderHmac(); };
  for (const [id, f] of [['k-msgenc', 'msgEnc'], ['k-keyenc', 'keyEnc'], ['k-algo', 'algo'], ['k-outenc', 'outEnc']]) $('#' + id).addEventListener('fw-change', (e) => { S[f] = e.detail.value; save(); if (f === 'algo') renderHmac(); else upd(); });
  $('#k-copy').onclick = (e) => copyText($('#k-out').dataset.v || '', e.currentTarget);
  upd();
}
async function hmac() {
  const out = $('#k-out'); const ver = $('#k-verdict'); const hint = $('#k-keyhint');
  try {
    const msg = bytesFrom(S.msg, S.msgEnc); const keyB = bytesFrom(S.key, S.keyEnc);
    hint.textContent = S.key ? `${keyB.length} bytes${keyB.length < 32 && S.algo !== 'SHA-1' ? ' · short: use at least 32 random bytes' : ''}` : 'Empty key: anyone can make this signature';
    hint.classList.toggle('k-warn', !S.key || keyB.length < 32);
    const key = await subtle.importKey('raw', keyB.length ? keyB : new Uint8Array(1), { name: 'HMAC', hash: S.algo }, false, ['sign', 'verify']);
    const sig = new Uint8Array(await subtle.sign('HMAC', key, msg));
    const v = encOut(sig, S.outEnc); out.textContent = S.outEnc === 'hex' ? groupHex(v, 8) : v; out.dataset.v = v; out.parentElement.classList.remove('fw-output--empty');
    if (S.expect.trim()) {
      const t = S.expect.trim().replace(/^sha\d+=/i, '');
      let eb = parseHex(t); if (!eb || eb.length !== sig.length) { try { eb = b64decode(t); } catch { eb = null; } }
      const ok = eb && await subtle.verify('HMAC', key, eb, msg);
      ver.innerHTML = ok ? `<div class="ins-vres is-ok">${icon('shield-check', { size: 24 })}<div><b>Signature valid</b><p>This message was signed with this key (HMAC-${esc(S.algo)}).</p></div></div>`
        : `<div class="ins-vres is-bad">${icon('circle-x', { size: 24 })}<div><b>Signature doesn’t match</b><p>${eb ? 'Wrong key, a changed message, or a different hash. Whitespace in the message counts.' : 'That isn’t hex or Base64.'}</p></div></div>`;
    } else ver.innerHTML = '';
    setBar({ line: `HMAC-${S.algo}`, sub: v.slice(0, 24) + '…', actions: [{ label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyText(v, b) }] });
  } catch (e) { out.textContent = e.message; out.parentElement.classList.add('fw-output--empty'); ver.innerHTML = ''; }
}

// ───────────── key pair ─────────────
const KP = { Ed25519: { gen: { name: 'Ed25519' }, alg: 'EdDSA' }, 'P-256': { gen: { name: 'ECDSA', namedCurve: 'P-256' }, alg: 'ES256' }, RSA: { gen: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, alg: 'RS256' } };
const pem = (label, buf) => `-----BEGIN ${label}-----\n${b64encode(new Uint8Array(buf)).match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;
async function thumbprint(j) {
  const req = j.kty === 'RSA' ? { e: j.e, kty: j.kty, n: j.n } : j.kty === 'EC' ? { crv: j.crv, kty: j.kty, x: j.x, y: j.y } : { crv: j.crv, kty: j.kty, x: j.x };
  return b64encode(new Uint8Array(await subtle.digest('SHA-256', utf8Bytes(JSON.stringify(req)))), { url: true });
}
function renderPair() {
  $('#k-body').innerHTML = `<section class="fw-card k-card">
      <div class="k-field__head"><span>Type</span>${seg('k-kp', 'Key type', [['Ed25519', 'Ed25519'], ['P-256', 'ECDSA P-256'], ['RSA', 'RSA 2048']], S.kp)}<span class="fw-spacer"></span><button class="fw-btn fw-btn--primary" type="button" id="k-gen">${icon('key-round')}Make key pair</button></div>
      <p class="fw-t-sm fw-muted">The private key is created in this tab and never leaves it. Download it or copy it once, then close the tab.</p>
    </section><div id="k-pair"></div>`;
  enhance($('#k-body'));
  $('#k-kp').addEventListener('fw-change', (e) => { S.kp = e.detail.value; save(); });
  $('#k-gen').onclick = genPair;
}
async function genPair() {
  const b = $('#k-gen'); b.classList.add('is-busy'); b.disabled = true; const t0 = performance.now();
  try {
    const kp = await subtle.generateKey(KP[S.kp].gen, true, ['sign', 'verify']);
    const [spki, pkcs8, jwk] = await Promise.all([subtle.exportKey('spki', kp.publicKey), subtle.exportKey('pkcs8', kp.privateKey), subtle.exportKey('jwk', kp.publicKey)]);
    delete jwk.key_ops; delete jwk.ext; jwk.kid = await thumbprint(jwk); jwk.alg = KP[S.kp].alg; jwk.use = 'sig';
    const pub = pem('PUBLIC KEY', spki), priv = pem('PRIVATE KEY', pkcs8);
    const ms = Math.round(performance.now() - t0);
    $('#k-pair').innerHTML = `<div class="k-grid">
      <section class="fw-card k-card"><div class="k-field__head"><h2>Public key</h2><span class="fw-badge">${esc(KP[S.kp].alg)} · made in ${ms} ms</span></div>
        <div class="fw-output"><pre class="fw-output__value">${esc(pub)}</pre><button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" data-copy="${esc(pub)}" aria-label="Copy public key" data-tip="Copy">${icon('copy')}</button></div>
        <div class="k-field__head"><span>As JWKS (kid = RFC 7638 thumbprint)</span></div>
        <div class="fw-output"><pre class="fw-output__value">${esc(JSON.stringify({ keys: [jwk] }, null, 2))}</pre><button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" data-copy="${esc(JSON.stringify({ keys: [jwk] }, null, 2))}" aria-label="Copy JWKS" data-tip="Copy">${icon('copy')}</button></div></section>
      <section class="fw-card k-card"><div class="k-field__head"><h2>Private key</h2><span class="fw-badge fw-badge--warning">${icon('lock', { size: 12 })}Keep secret</span></div>
        <div class="fw-output k-secret is-hidden" id="k-priv"><pre class="fw-output__value">${esc(priv)}</pre><button class="fw-btn fw-btn--sm k-reveal" type="button" id="k-reveal">${icon('eye')}Show</button></div>
        <div class="k-actions"><button class="fw-btn" type="button" id="k-dl">${icon('download')}Download private.pem</button><button class="fw-btn fw-btn--ghost" type="button" data-copy="${esc(priv)}">${icon('copy')}Copy</button></div></section></div>`;
    enhance($('#k-pair'));
    $('#k-reveal').onclick = (e) => { const p = $('#k-priv'); p.classList.toggle('is-hidden'); e.currentTarget.innerHTML = p.classList.contains('is-hidden') ? `${icon('eye')}Show` : `${icon('eye-off')}Hide`; };
    $('#k-dl').onclick = () => { const a = h('<a download="private.pem"></a>'); a.href = URL.createObjectURL(new Blob([priv + '\n'], { type: 'application/x-pem-file' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
    setBar({ line: `${KP[S.kp].alg} key pair`, actions: [{ label: 'Copy public key', icon: 'copy', primary: true, onClick: (x) => copyText(pub, x) }] });
  } catch (e) { toast(`This browser can’t make ${S.kp} keys yet (${e.message}). Try ECDSA P-256.`, { type: 'warning' }); }
  b.classList.remove('is-busy'); b.disabled = false;
}

// ───────────── PBKDF2 ─────────────
function renderKdf() {
  $('#k-body').innerHTML = `<div class="k-grid"><section class="fw-card k-card">
      <div class="k-field"><label class="k-field__head" for="k-pw"><span>Password</span></label><input class="fw-input" id="k-pw" type="password" value="${esc(S.pw)}" autocomplete="off"></div>
      <div class="k-field"><div class="k-field__head"><label for="k-salt">Salt (hex)</label></div><div class="k-keyrow"><input class="fw-input fw-input--mono" id="k-salt" value="${esc(S.salt)}" placeholder="16 random bytes" spellcheck="false"><button class="fw-btn" type="button" id="k-rsalt">${icon('refresh-cw')}Random</button></div></div>
      <div class="k-field"><label class="k-field__head" for="k-iter"><span>Iterations</span><span class="fw-faint fw-t-xs">OWASP 2023: 600,000 for SHA-256</span></label><input class="fw-input fw-num" id="k-iter" type="number" min="1" value="${S.iter}"><div class="fw-field__hint" id="k-iterhint"></div></div>
      <div class="k-field"><label class="k-field__head" for="k-len"><span>Key length (bytes)</span></label><input class="fw-input fw-num" id="k-len" type="number" min="16" max="128" value="${S.dlen}"></div>
      <button class="fw-btn fw-btn--primary" type="button" id="k-derive">${icon('key-round')}Derive key</button>
    </section><section class="fw-card k-card k-result"><div class="k-field__head"><h2>Derived key · PBKDF2-SHA-256</h2></div><div class="fw-output fw-output--empty"><div class="fw-output__value" id="k-dk">Press Derive. It takes about half a second on purpose.</div><button class="fw-iconbtn fw-iconbtn--sm fw-output__copy" type="button" id="k-dkcopy" aria-label="Copy derived key" data-tip="Copy">${icon('copy')}</button></div><div class="fw-faint fw-t-sm" id="k-dkmeta"></div></section></div>`;
  enhance($('#k-body'));
  const hint = () => { const n = +$('#k-iter').value; $('#k-iterhint').textContent = n < 100000 ? `${n.toLocaleString('en-US')} iterations is weak: attackers can test passwords fast. Use 600,000.` : ''; $('#k-iterhint').classList.toggle('k-warn', n < 100000); };
  $('#k-iter').addEventListener('input', (e) => { S.iter = +e.target.value; save(); hint(); }); hint();
  $('#k-pw').addEventListener('input', (e) => { S.pw = e.target.value; });
  $('#k-salt').addEventListener('input', (e) => { S.salt = e.target.value; });
  $('#k-len').addEventListener('input', (e) => { S.dlen = +e.target.value; save(); });
  $('#k-rsalt').onclick = () => { S.salt = toHex(crypto.getRandomValues(new Uint8Array(16))); $('#k-salt').value = S.salt; };
  $('#k-derive').onclick = async (e) => {
    const b = e.currentTarget; b.classList.add('is-busy'); const t0 = performance.now();
    try {
      const salt = parseHex(S.salt || '') || utf8Bytes(S.salt || '');
      const base = await subtle.importKey('raw', utf8Bytes(S.pw), 'PBKDF2', false, ['deriveBits']);
      const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Math.max(1, S.iter) }, base, S.dlen * 8));
      const v = toHex(bits); $('#k-dk').textContent = groupHex(v, 8); $('#k-dk').parentElement.classList.remove('fw-output--empty'); $('#k-dkcopy').onclick = (x) => copyText(v, x.currentTarget);
      $('#k-dkmeta').textContent = `${S.dlen} bytes · ${S.iter.toLocaleString('en-US')} iterations · ${Math.round(performance.now() - t0)} ms`;
    } catch (err) { toast(err.message, { type: 'danger' }); }
    b.classList.remove('is-busy');
  };
  setBar(null);
}
