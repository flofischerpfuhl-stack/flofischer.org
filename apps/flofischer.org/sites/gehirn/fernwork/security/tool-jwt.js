// JWT Decoder: paste a token → expiry in plain words, header and payload (time claims annotated), signature check.
// Verify with a shared secret, JWK, JWKS (picked by kid), PEM public key, X.509 certificate or PKCS#1 — real Web Crypto.
// The algorithm comes from the KEY, never from the token, so "HS256 signed with the public key" forgeries are rejected.
import { openMenu } from '../kit/shell.js';
import { icon, esc, $, $$, h, enhance, toast, copyText, isCoarse, seg, iconBtn, setBar, readClipboard, fmtWhen, relHuman, LOCAL_TZ, settings } from './ui.js';
import { b64decode, tryUtf8, utf8Bytes } from './codec.js';
import { parseToken, parseKeys, verifyToken, signJwt, TIME_CLAIMS } from './jwt.js';
import { KEYS, RSA_PUB_PEM, RSA_CERT_PEM } from './samples.js';

let api = {};
export const config = {
  accept: ['text', 'data'],
  commands: [
    { id: 'j-sample', label: 'Load a sample token', icon: 'key-round', run: () => api.samples?.() },
    { id: 'j-verify', label: 'Verify the signature', icon: 'shield-check', syn: ['jwks', 'public key'], run: () => api.verify?.() },
  ],
};

// ───────── samples: signed fresh in this tab with throwaway keys, so "expires in 30 days" is always true ─────────
let SAMPLES = null;
async function samples() {
  if (SAMPLES) return SAMPLES;
  const now = Math.floor(Date.now() / 1000);
  const rsa = { family: 'RSA', jwk: KEYS.rsaPriv }, ec = { family: 'EC', crv: 'P-256', jwk: KEYS.ecPriv };
  const claims = { iss: 'https://auth.example.com/', sub: 'auth0|6f1c9e2a7b40d1', aud: 'api.example.com', iat: now - 60, nbf: now - 60, exp: now + 30 * 86400, scope: 'openid profile email read:invoices', email: 'anna.berger@example.com', name: 'Anna Berger' };
  const jwt = await signJwt({ alg: 'RS256', typ: 'JWT', kid: '2026-10-key-1' }, claims, rsa);
  const forged = await signJwt({ alg: 'HS256', typ: 'JWT', kid: '2026-10-key-1' }, { ...claims, sub: 'attacker', scope: 'openid admin:*', email: 'attacker@evil.example', name: 'Not Anna', exp: now + 365 * 86400 }, { family: 'oct', raw: utf8Bytes(RSA_PUB_PEM) });
  const expired = await signJwt({ alg: 'ES256', typ: 'JWT', kid: 'ec-2026' }, { iss: 'https://id.example.org', sub: 'svc-backup', aud: 'storage.example.org', iat: now - 33 * 86400, exp: now - 3 * 86400 - 5 * 3600, scope: 'backup:write' }, ec);
  const hs = await signJwt({ alg: 'HS256', typ: 'JWT' }, { sub: '1234567890', name: 'Lena Hartmann', role: 'editor', iat: now - 300, exp: now + 3600 }, { family: 'oct', raw: utf8Bytes('fernwork-demo-secret') });
  SAMPLES = [
    { group: 'Tokens', items: [
      { id: 'jwt', label: 'Login token · RS256', sub: 'Valid for 30 days', value: jwt, icon: 'key-round' },
      { id: 'hs', label: 'Session token · HS256', sub: 'Secret: fernwork-demo-secret', value: hs, icon: 'key-round', key: 'fernwork-demo-secret' },
      { id: 'expired', label: 'Expired token · ES256', sub: 'Expired 3 days ago', value: expired, icon: 'clock' },
      { id: 'forged', label: 'Forged token', sub: 'HS256 signed with the public key', value: forged, icon: 'triangle-alert' },
      { id: 'bearer', label: 'Authorization header', sub: 'The Bearer prefix is removed', value: 'Authorization: Bearer ' + jwt, icon: 'key-round' },
    ] },
    { group: 'Keys to verify with', items: [
      { id: 'jwks', label: 'JWKS (3 keys)', sub: 'From …/.well-known/jwks.json', value: JSON.stringify({ keys: [KEYS.rsaOldPub, KEYS.rsaPub, KEYS.ecPub] }, null, 2), isKey: true, icon: 'key-round' },
      { id: 'pem', label: 'Public key (PEM)', sub: 'RSA, for the RS256 tokens', value: RSA_PUB_PEM, isKey: true, icon: 'key-round' },
      { id: 'cert', label: 'Certificate (PEM)', sub: 'X.509 for the RS256 key', value: RSA_CERT_PEM, isKey: true, icon: 'shield-check' },
    ] },
  ];
  return SAMPLES;
}

/** Why isn't this a JWT? (parseToken only says yes/no) */
function diagnose(raw) {
  let s = raw.trim().replace(/^(?:authorization\s*:\s*)?bearer\s+/i, '').replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  const parts = s.split('.');
  if (parts.length !== 3 && parts.length !== 5) return `A JWT has three parts separated by dots (header.payload.signature); this has ${parts.length}.`;
  const bad = parts.slice(0, 2).findIndex((p) => !/^[A-Za-z0-9_-]+$/.test(p));
  if (bad >= 0) return `The ${bad ? 'payload' : 'header'} isn’t Base64URL (only A–Z, a–z, 0–9, - and _).`;
  try { JSON.parse(tryUtf8(b64decode(parts[0])) ?? ''); } catch { return 'The header doesn’t decode to JSON. The token may be cut off or not a JWT.'; }
  return 'This doesn’t decode as a JWT.';
}

// JSON with token colours, and time claims annotated with a readable date as a trailing comment
function jsonLines(obj, annotate) {
  const e = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return JSON.stringify(obj, null, 2).split('\n').map((line) => {
    let html = e(line).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (m, str, colon, lit, num) => (str ? (colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`) : lit ? `<span class="j-lit">${lit}</span>` : `<span class="j-num">${num}</span>`));
    const m = annotate && /^ {2}"([a-z_]+)": (\d{9,11}),?$/.exec(line);
    if (m && TIME_CLAIMS.has(m[1])) { const ms = +m[2] * 1000; html += `  <span class="j-note">${esc(fmtWhen(ms, { zone: false }))} · <span data-rel-ms="${ms}">${esc(relHuman(ms))}</span></span>`; }
    return html;
  }).join('\n');
}

export async function mount(root, { params }) {
  const S = settings('jwt', { secretEnc: 'utf8' });
  const st = { raw: '', tok: null, key: '', sampleKey: null, verify: null, run: 0 };

  root.innerHTML = `
    <div class="fw-paste sec-paste">
      <div class="fw-paste__box">
        <label class="fw-sr" for="j-in">JSON Web Token</label>
        <div class="sec-mirror" aria-hidden="true"></div>
        <textarea class="fw-paste__field" id="j-in" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Paste a token: eyJhbGciOi…"></textarea>
        <div class="fw-paste__actions"><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="j-samples" aria-haspopup="menu">${icon('chevron-down')}Samples</button><button class="fw-btn fw-btn--sm sec-paste-btn" type="button" id="j-paste">${icon('clipboard-paste')}Paste</button>${iconBtn('j-clear', 'x', 'Clear', 'hidden')}</div>
      </div>
      <button class="fw-btn fw-btn--lg fw-btn--block sec-bigpaste" type="button" id="j-bigpaste">${icon('clipboard-paste', { size: 20 })}Paste token</button>
      <div class="fw-paste__meta" id="j-meta"></div>
    </div>
    <div id="j-out" aria-live="polite"></div>`;
  enhance(root);
  const field = $('#j-in'); const box = $('.sec-paste', root);
  const fit = () => { field.style.height = 'auto'; field.style.height = Math.min(isCoarse() ? 176 : 200, field.scrollHeight + 2) + 'px'; };
  field.addEventListener('input', () => { st.raw = field.value; fit(); update(); });
  field.addEventListener('scroll', () => { box.querySelector('.sec-mirror').scrollTop = field.scrollTop; });
  const paste = async () => { const t = await readClipboard(); if (t != null) setToken(t); };
  $('#j-paste').onclick = paste; $('#j-bigpaste').onclick = paste;
  $('#j-clear').onclick = () => { const old = st.raw; setToken(''); field.focus(); toast('Token cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setToken(old) } }); };
  $('#j-samples').onclick = (e) => sampleMenu(e.currentTarget);
  setInterval(() => $$('[data-rel-ms]').forEach((el) => { el.textContent = relHuman(+el.dataset.relMs); }), 1000);

  function setToken(v) { field.value = v; st.raw = v; fit(); update(); }
  async function sampleMenu(anchor) {
    const g = await samples();
    openMenu(anchor, g.map((x) => ({ group: x.group, items: x.items.map((it) => ({ label: it.label, sub: it.sub, icon: it.icon, onSelect: () => useSample(it) })) })), { placement: 'bottom-end' });
  }
  function useSample(it) {
    if (it.isKey) { if (!st.tok) { toast('Load a token first, then the key goes into Verify', { type: 'info' }); return; } setKey(it.value); return; }
    st.sampleKey = it.key || null; st.key = ''; setToken(it.value);
  }

  // ───────── decode ─────────
  function paintMirror(tok) {
    const m = box.querySelector('.sec-mirror');
    const mm = tok && tok.kind === 'jws' && /^(\s*(?:(?:authorization\s*:\s*)?bearer\s+)?)([\w-]+)\.([\w-]+)\.([\w-]*)(\s*)$/i.exec(field.value);
    if (!mm) { m.innerHTML = ''; field.classList.remove('is-colored'); return; }
    m.innerHTML = `<span class="seg-pre">${esc(mm[1])}</span><span class="seg-h">${esc(mm[2])}</span><span class="seg-dot">.</span><span class="seg-p">${esc(mm[3])}</span><span class="seg-dot">.</span><span class="seg-s">${esc(mm[4])}</span>${esc(mm[5])}`;
    field.classList.add('is-colored'); m.scrollTop = field.scrollTop;
  }
  function update() {
    const has = !!st.raw.trim();
    $('#j-clear').hidden = !has; $('#j-paste').hidden = has; box.classList.toggle('has-value', has);
    const meta = $('#j-meta'); const out = $('#j-out');
    if (!has) { st.tok = null; paintMirror(null); meta.innerHTML = '<span class="fw-faint">Header, payload and expiry appear as soon as you paste.</span> <button type="button" class="sec-link" id="j-try">Try a sample</button>'; $('#j-try').onclick = async () => useSample((await samples())[0].items[0]); out.innerHTML = ''; setBar(null); return; }
    const tok = parseToken(st.raw); st.tok = tok; paintMirror(tok);
    if (!tok) { meta.innerHTML = `<span class="sec-err">${icon('circle-alert', { size: 14 })}${esc(diagnose(st.raw))}</span>`; out.innerHTML = ''; setBar(null); return; }
    meta.innerHTML = `<span class="sec-legend"><span><i class="seg-h">●</i>Header</span><span><i class="seg-p">●</i>Payload</span><span><i class="seg-s">●</i>Signature</span></span>${tok.notes.map((n) => `<span class="fw-badge">${icon('check', { size: 12 })}${esc(n)}</span>`).join('')}`;
    render();
  }
  function validity(p) {
    const now = Date.now(); const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x * 1000 : null);
    if (p && 'exp' in p && n(p.exp) == null) return { tone: 'bad', icon: 'circle-alert', title: 'Invalid “exp” claim · expected a number of seconds' };
    const exp = n(p?.exp), nbf = n(p?.nbf), iat = n(p?.iat);
    if (nbf && nbf > now + 60e3) return { tone: 'warn', icon: 'clock', title: 'Not valid yet · valid', rel: nbf, exp, nbf, iat };
    if (exp && exp <= now) return { tone: 'bad', icon: 'circle-x', title: 'Expired', rel: exp, exp, nbf, iat };
    if (exp) return { tone: 'ok', icon: 'clock', title: 'Not expired · expires', rel: exp, exp, nbf, iat, timeOk: true };
    return { tone: 'warn', icon: 'triangle-alert', title: 'Never expires · no “exp” claim', exp, nbf, iat };
  }
  const rel = (ms) => `<span data-rel-ms="${ms}">${esc(relHuman(ms))}</span>`;
  function render() {
    const out = $('#j-out'); const tok = st.tok;
    if (tok.kind === 'jwe') {
      out.innerHTML = `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('lock')}</span><div class="fw-alert__body"><b>Encrypted token (JWE).</b> Only the header is readable. The claims need the recipient’s private key.</div></div>
        <section class="sec-pane"><div class="sec-pane__head"><span class="sec-pane__label">Header</span></div><pre class="sec-json">${jsonLines(tok.header)}</pre></section>`;
      setBar(null); return;
    }
    const p = tok.payload; const va = validity(p); st.va = va;
    const alg = String(tok.header.alg || ''); const unsigned = !alg || alg.toLowerCase() === 'none' || !tok.parts[2];
    const badges = [[alg || 'no alg', unsigned ? 'danger' : 'mono'], tok.header.kid ? [`kid ${tok.header.kid}`, 'mono'] : null, tok.header.typ ? [tok.header.typ, ''] : null].filter(Boolean);
    const pj = p ? JSON.stringify(p, null, 2) : tok.payloadText || '';
    out.innerHTML = `<div class="sec-jwt">
      <div class="sec-jwt__main">
        <section class="sec-status is-${va.tone}" id="j-status">
          <div class="sec-status__title" id="j-title"></div>
          <div class="sec-status__badges">${badges.map(([l, k]) => `<span class="fw-badge ${k ? 'fw-badge--' + k : ''}">${esc(l)}</span>`).join('')}</div>
          <dl class="sec-status__rows">
            ${va.exp ? `<dt>Expires</dt><dd>${esc(fmtWhen(va.exp, { weekday: true }))}</dd>` : ''}
            ${va.nbf && Math.abs(va.nbf - (va.iat || 0)) > 1000 ? `<dt>Valid from</dt><dd>${esc(fmtWhen(va.nbf))}</dd>` : ''}
            ${va.iat ? `<dt>Issued</dt><dd>${esc(fmtWhen(va.iat))} · ${rel(va.iat)}</dd>` : ''}
            ${p?.iss ? `<dt>Issuer</dt><dd class="fw-mono">${esc(String(p.iss))}</dd>` : ''}
          </dl>
          <button class="sec-sigline" type="button" id="j-sigline"></button>
        </section>
        <section class="sec-pane"><div class="sec-pane__head"><span class="sec-pane__label"><i class="seg-p">●</i> Payload</span><span class="sec-pane__meta">times in ${esc(LOCAL_TZ.replace(/_/g, ' '))}</span><span class="fw-spacer"></span><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="j-copyp">${icon('copy')}<span>Copy JSON</span></button></div>
          <pre class="sec-json" id="j-payload">${p ? jsonLines(p, true) : esc(tok.payloadText || '(not JSON)')}</pre></section>
        <section class="sec-pane"><div class="sec-pane__head"><span class="sec-pane__label"><i class="seg-h">●</i> Header</span><span class="fw-spacer"></span><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="j-copyh">${icon('copy')}<span>Copy JSON</span></button></div>
          <pre class="sec-json">${jsonLines(tok.header)}</pre>
          <div class="sec-sig"><span class="sec-sig__l"><i class="seg-s">●</i> Signature · ${tok.sig.length} bytes</span><code class="fw-mono">${esc(tok.parts[2] || '(none)')}</code></div></section>
      </div>
      <aside class="sec-pane sec-verify" id="j-verify">
        <div class="sec-pane__head"><label class="sec-pane__label" for="j-key">${icon('key-round', { size: 16 })} Verify signature</label></div>
        <div class="sec-pane__body">
          <p class="fw-t-sm fw-muted" id="j-vlede"></p>
          <div class="sec-keybox"><textarea class="fw-textarea fw-input--mono sec-keyfield" id="j-key" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
            <button class="fw-btn fw-btn--sm sec-keybox__paste" type="button" id="j-kpaste">${icon('clipboard-paste')}Paste</button></div>
          <div id="j-enc"></div>
          <div id="j-vres" aria-live="polite"></div>
          <p class="sec-verify__foot fw-t-xs fw-faint">The algorithm comes from the key, never from the token. Keys are never fetched: open the issuer’s <code>…/.well-known/jwks.json</code> and paste it.${st.sampleKey || tok.header.kid ? ` <button type="button" class="sec-link" id="j-ksample">${st.sampleKey ? 'Use the sample secret' : 'Use the sample JWKS'}</button>` : ''}</p>
        </div>
      </aside>
    </div>`;
    enhance(out);
    const hs = alg.startsWith('HS');
    $('#j-vlede').textContent = unsigned ? 'This token has no signature. Anyone could have written it.' : hs ? `${alg} uses a shared secret. Paste it (or the issuer’s public key if you expected RS/ES).` : 'Paste the issuer’s public key, certificate, JWK or JWKS.';
    const k = $('#j-key'); k.placeholder = hs ? 'Shared secret' : '-----BEGIN PUBLIC KEY-----  or  {"keys": [ … ]}'; k.value = st.key;
    k.addEventListener('input', () => { st.key = k.value; clearTimeout(st.vt); st.vt = setTimeout(runVerify, 120); });
    $('#j-kpaste').onclick = async () => { const t = await readClipboard(); if (t != null) setKey(t); };
    $('#j-ksample')?.addEventListener('click', async () => setKey(st.sampleKey || (await samples())[1].items[0].value));
    $('#j-copyp').onclick = (e) => copyText(pj, e.currentTarget);
    $('#j-copyh').onclick = (e) => copyText(JSON.stringify(tok.header, null, 2), e.currentTarget);
    $('#j-sigline').onclick = () => { k.focus(); k.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    runVerify();
  }
  function setKey(v) { st.key = v; const k = $('#j-key'); if (k) { k.value = v; runVerify(); if (isCoarse()) k.scrollIntoView({ block: 'nearest' }); } }
  async function runVerify() {
    const tok = st.tok; if (!tok || tok.kind !== 'jws') return;
    const run = ++st.run; const res = $('#j-vres'); const text = st.key.trim();
    const hs = String(tok.header.alg || '').startsWith('HS');
    const enc = $('#j-enc');
    if (!text) { enc.innerHTML = ''; res.innerHTML = ''; return paintStatus('unchecked'); }
    const ks = await parseKeys(text, { secretEncoding: S.secretEnc });
    if (run !== st.run) return;
    enc.innerHTML = ks?.source === 'secret' && hs ? `<div class="sec-more__row"><span class="sec-more__label">Secret as</span>${seg('j-secenc', 'Secret encoding', [['utf8', 'Text (UTF-8)'], ['base64', 'Base64 / Base64URL'], ['hex', 'Hex']], S.secretEnc, { sm: true })}</div>` : '';
    enhance(enc); $('#j-secenc', enc)?.addEventListener('fw-change', (e) => { S.secretEnc = e.detail.value; S.save(); runVerify(); });
    if (ks.error) { res.innerHTML = `<div class="sec-vres is-warn">${icon('triangle-alert', { size: 22 })}<div><b>Can’t use this as a key</b><p>${esc(ks.error)}</p></div></div>`; return paintStatus('warn'); }
    const v = await verifyToken(tok, ks);
    if (run !== st.run) return;
    const tone = v.status === 'valid' ? 'ok' : 'bad';
    res.innerHTML = `${ks.warning ? `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(ks.warning)}</div></div>` : ''}
      <div class="sec-vres is-${tone} ${v.confusion ? 'is-confusion' : ''}">${icon(v.status === 'valid' ? 'shield-check' : 'circle-x', { size: 24 })}<div><b>${esc(v.title)}</b><p>${esc(v.detail)}</p></div></div>
      <p class="sec-keyline">${icon('key-round', { size: 14 })}<span>${esc(ks.label)}${ks.cert?.notAfter ? ` · valid until ${esc(fmtWhen(ks.cert.notAfter, { zone: false }))}` : ''}</span></p>`;
    paintStatus(v.status, v);
  }
  /** The headline combines time and signature: "Valid" only when both hold; a failed signature overrides everything. */
  function paintStatus(state, v) {
    const va = st.va; const card = $('#j-status'); const t = $('#j-title'); const sig = $('#j-sigline'); if (!va || !card) return;
    const alg = String(st.tok.header.alg || ''); const unsigned = !alg || alg.toLowerCase() === 'none' || !st.tok.parts[2];
    let tone = va.tone, ic = va.icon, title = va.title, relOn = !!va.rel;
    if (state === 'invalid' || state === 'rejected') { tone = 'bad'; ic = 'circle-x'; title = 'Don’t trust this token'; relOn = false; }
    else if (state === 'valid' && va.timeOk) { tone = 'ok'; ic = 'circle-check'; title = 'Valid · signature checked · expires'; }
    if (unsigned && state === 'unchecked') { tone = 'bad'; ic = 'circle-x'; title = 'Unsigned token · anyone could have written it'; relOn = false; }
    card.className = `sec-status is-${tone}${state === 'unchecked' && !unsigned ? ' is-unchecked' : ''}`;
    t.innerHTML = `${icon(ic, { size: 26 })}<span>${esc(title)}${relOn ? ' ' + `<span data-rel-ms="${va.rel}">${esc(relHuman(va.rel))}</span>` : ''}</span>`;
    const txt = state === 'valid' ? `Signature valid · ${v.alg}${v.kid ? ' · ' + v.kid : ''}` : state === 'rejected' ? (v?.confusion ? 'Signature rejected · algorithm confusion' : 'Signature rejected') : state === 'invalid' ? 'Signature invalid' : state === 'warn' ? 'Key not usable' : unsigned ? 'No signature to check' : 'Signature not checked yet · paste a key';
    sig.dataset.state = state;
    sig.innerHTML = `${icon(state === 'valid' ? 'shield-check' : state === 'unchecked' ? 'shield-check' : state === 'warn' ? 'triangle-alert' : 'circle-x', { size: 16 })}<span>${esc(txt)}</span>${state === 'unchecked' && !unsigned ? icon('arrow-right', { size: 14 }) : ''}`;
    const p = st.tok.payload;
    setBar({ line: `${alg || 'JWT'} · ${title}${relOn ? ' ' + relHuman(va.rel) : ''}`, actions: [{ label: 'Verify', icon: 'shield-check', iconOnly: true, onClick: () => api.verify() }, { label: 'Copy payload', icon: 'copy', primary: true, onClick: (b) => copyText(p ? JSON.stringify(p, null, 2) : st.tok.payloadText || '', b) }] });
  }

  api = { samples: () => sampleMenu($('#j-samples')), verify: () => { const k = $('#j-key'); if (k) { k.focus(); k.scrollIntoView({ block: 'center' }); } else toast('Paste a token first', { type: 'info' }); } };
  const q = params.get('q'); setToken(q || '');
  if (!isCoarse() && !q) field.focus();
  return {
    onPasteText: (t) => { if (st.tok && /BEGIN|"kty"|"keys"/.test(t)) { setKey(t); return true; } st.sampleKey = null; setToken(t); return true; },
    onFiles: async (files) => { const f = files[0]; if (f && f.size < 1024 * 1024) { const t = (await f.text()).trim(); if (st.tok && /BEGIN|"kty"|"keys"/.test(t)) setKey(t); else setToken(t); } },
  };
}
