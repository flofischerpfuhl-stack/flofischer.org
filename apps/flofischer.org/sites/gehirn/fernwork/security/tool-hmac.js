// HMAC / KDF: HMAC (live, with an optional check of a received signature via subtle.verify), PBKDF2 (explicit button —
// it is slow on purpose) and HKDF (live). All Web Crypto. Inputs are UTF-8 unless another encoding is chosen.
import { icon, esc, $, $$, enhance, toast, copyText, isCoarse, settings, seg, select, moreBtn, wireMore, pane, iconBtn, setBar, pwField, wireEyes, debounce, fmtN } from './ui.js';
import { b64encode, b64decode, toHex, parseHex, utf8Bytes } from './codec.js';

let api = {};
export const config = {
  commands: [
    { id: 'k-hmac', label: 'HMAC', icon: 'key-round', syn: ['sign', 'webhook signature'], run: () => api.mode?.('hmac') },
    { id: 'k-pbkdf2', label: 'PBKDF2 key derivation', icon: 'key-round', syn: ['derive key', 'kdf'], run: () => api.mode?.('pbkdf2') },
    { id: 'k-hkdf', label: 'HKDF key derivation', icon: 'key-round', run: () => api.mode?.('hkdf') },
  ],
};
const subtle = crypto.subtle;
const ENC = [['utf8', 'Text'], ['hex', 'Hex'], ['base64', 'Base64']];
const HASHES = [['SHA-256'], ['SHA-384'], ['SHA-512'], ['SHA-1', 'SHA-1 (legacy)']];
const bytesFrom = (s, enc, what) => {
  if (enc === 'hex') { if (!s.trim()) return new Uint8Array(); const b = parseHex(s); if (!b) throw new Error(`${what} isn’t valid hex.`); return b; }
  if (enc === 'base64') { if (!s.trim()) return new Uint8Array(); try { return b64decode(s); } catch { throw new Error(`${what} isn’t valid Base64.`); } }
  return utf8Bytes(s);
};
const encOut = (b, enc) => (enc === 'hex' ? toHex(b) : enc === 'base64' ? b64encode(b) : b64encode(b, { url: true }));

export async function mount(root) {
  const S = settings('hmac', { mode: 'hmac', hash: 'SHA-256', out: 'hex', msgEnc: 'utf8', keyEnc: 'utf8', saltEnc: 'utf8', ikmEnc: 'utf8', iter: 600000, bits: 256, hbits: 256 });
  const st = { msg: '', key: '', expect: '', pw: '', salt: '', ikm: '', hsalt: '', info: '', result: null, run: 0 };

  root.innerHTML = `
    <div class="sec-toolbar">
      ${seg('k-mode', 'Function', [['hmac', 'HMAC'], ['pbkdf2', 'PBKDF2'], ['hkdf', 'HKDF']], S.mode)}
      ${select('k-hash', 'Hash', HASHES, S.hash)}
      <span class="sec-sel"><span class="sec-sel__l">Output</span>${seg('k-outfmt', 'Output', [['hex', 'Hex'], ['base64', 'Base64'], ['base64url', 'Base64URL']], S.out, { sm: true })}</span>
      <span class="fw-spacer"></span>${moreBtn('k-more')}
    </div>
    <div class="sec-more" id="k-more-panel" hidden></div>
    <div class="sec-io">
      <section class="sec-pane sec-form" id="k-form"></section>
      ${pane({ id: 'k-res', label: 'Result', actions: `<button class="fw-btn fw-btn--primary fw-btn--sm sec-desk" type="button" id="k-copy" disabled>${icon('copy')}<span>Copy</span></button>`, body: '<div id="k-out" aria-live="polite"></div><div id="k-verdict" aria-live="polite"></div>' })}
    </div>`;
  enhance(root);
  wireMore($('#k-more'), $('#k-more-panel'));
  $('#k-mode').addEventListener('fw-change', (e) => setMode(e.detail.value));
  $('#k-hash').onchange = (e) => { S.hash = e.target.value; S.save(); invalidate(); };
  $('#k-outfmt').addEventListener('fw-change', (e) => { S.out = e.detail.value; S.save(); paint(); });
  $('#k-copy').onclick = (e) => st.result && copyText(encOut(st.result.bytes, S.out), e.currentTarget);

  function setMode(m) {
    S.mode = m; S.save(); st.result = null;
    $$('#k-mode .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m)));
    renderForm(); renderMore(); invalidate();
  }
  const field = (id, label, inner, hint = '') => `<div class="fw-field"><label class="fw-field__label" for="${id}">${label}</label>${inner}${hint ? `<span class="fw-field__hint" id="${id}-hint">${hint}</span>` : `<span class="fw-field__hint" id="${id}-hint" hidden></span>`}</div>`;
  const inp = (id, v, ph = '', extra = '') => `<input class="fw-input fw-input--mono" id="${id}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false" autocapitalize="off" ${extra}>`;
  const withRandom = (inner, id, label) => `<div class="sec-inline">${inner}<button class="fw-btn" type="button" id="${id}">${icon('dices')}${label}</button></div>`;
  const encTag = (enc) => (enc === 'utf8' ? '' : ` <span class="fw-badge">${enc === 'hex' ? 'Hex' : 'Base64'}</span>`);
  function renderForm() {
    const f = $('#k-form');
    if (S.mode === 'hmac') {
      f.innerHTML = `${field('k-msg', `Message${encTag(S.msgEnc)}`, `<textarea class="fw-textarea fw-input--mono sec-area--form" id="k-msg" rows="5" spellcheck="false" placeholder='{"order":"ORD-2026-08812","amount":129.90}'>${esc(st.msg)}</textarea>`)}
        ${field('k-key', `Secret key${encTag(S.keyEnc)}`, withRandom(inp('k-key', st.key, 'Shared secret'), 'k-rkey', 'Random'))}`;
    } else if (S.mode === 'pbkdf2') {
      f.innerHTML = `${pwField('k-pw', 'Password', { value: st.pw, autocomplete: 'off' })}
        ${field('k-salt', `Salt${encTag(S.saltEnc)}`, withRandom(inp('k-salt', st.salt, 'At least 16 random bytes'), 'k-rsalt', 'Random'))}
        <div class="sec-pair">${field('k-iter', 'Iterations', `<input class="fw-input fw-num" id="k-iter" type="number" min="1" max="10000000" value="${S.iter}" inputmode="numeric">`)}
        ${field('k-bits', 'Length (bits)', `<input class="fw-input fw-num" id="k-bits" type="number" min="8" max="4096" step="8" value="${S.bits}" inputmode="numeric">`)}</div>
        <div class="sec-actions"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="k-derive">${icon('key-round')}<span>Derive key</span></button><span class="fw-faint fw-t-sm" id="k-dmeta"></span></div>`;
    } else {
      f.innerHTML = `${field('k-ikm', `Input key material${encTag(S.ikmEnc)}`, inp('k-ikm', st.ikm, 'The secret you start from'))}
        ${field('k-hsalt', `Salt${encTag(S.saltEnc)}`, withRandom(inp('k-hsalt', st.hsalt, 'Optional'), 'k-rhsalt', 'Random'))}
        ${field('k-info', 'Context / info', inp('k-info', st.info, 'e.g. myapp 2026 encryption key'))}
        ${field('k-hbits', 'Length (bits)', `<input class="fw-input fw-num sec-narrow" id="k-hbits" type="number" min="8" max="4096" step="8" value="${S.hbits}" inputmode="numeric">`)}`;
    }
    enhance(f); wireEyes(f);
    const bind = (id, key, live = true) => $('#' + id)?.addEventListener('input', (e) => { st[key] = e.target.value; invalidate(live); });
    bind('k-msg', 'msg'); bind('k-key', 'key'); bind('k-pw', 'pw', false); bind('k-salt', 'salt', false); bind('k-ikm', 'ikm'); bind('k-hsalt', 'hsalt'); bind('k-info', 'info');
    $('#k-iter')?.addEventListener('input', (e) => { S.iter = Math.floor(+e.target.value) || 0; S.save(); iterHint(); invalidate(false); });
    $('#k-bits')?.addEventListener('input', (e) => { S.bits = +e.target.value || 0; S.save(); invalidate(false); });
    $('#k-hbits')?.addEventListener('input', (e) => { S.hbits = +e.target.value || 0; S.save(); invalidate(); });
    const rnd = (btn, key, inputId, encKey) => $('#' + btn)?.addEventListener('click', () => { S[encKey] = 'hex'; S.save(); st[key] = toHex(crypto.getRandomValues(new Uint8Array(32))); renderForm(); renderMore(); invalidate(S.mode !== 'pbkdf2'); toast('32 random bytes as hex', { type: 'info' }); });
    rnd('k-rkey', 'key', 'k-key', 'keyEnc'); rnd('k-rsalt', 'salt', 'k-salt', 'saltEnc'); rnd('k-rhsalt', 'hsalt', 'k-hsalt', 'saltEnc');
    $('#k-derive')?.addEventListener('click', () => derive());
    $('#k-pw')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') derive(); });
    iterHint();
    if (!isCoarse()) (f.querySelector('textarea,input'))?.focus();
  }
  function iterHint() {
    const h = $('#k-iter-hint'); if (!h) return; const n = S.iter;
    h.hidden = !(n < 100000 || n > 10000000);
    h.className = 'fw-field__hint sec-warn';
    h.textContent = n > 10000000 ? 'At most 10,000,000.' : `${fmtN(Math.max(0, n))} is weak: attackers can test passwords fast. Use 600,000 for SHA-256.`;
  }
  function renderMore() {
    const p = $('#k-more-panel');
    const encRow = (id, label, cur) => `<div class="sec-more__row"><span class="sec-more__label">${label}</span>${seg(id, label, ENC, cur, { sm: true })}</div>`;
    p.innerHTML = S.mode === 'hmac'
      ? `${encRow('k-msgenc', 'Message as', S.msgEnc)}${encRow('k-keyenc', 'Key as', S.keyEnc)}
         <div class="fw-field sec-more__wide"><label class="fw-field__label" for="k-exp">Compare with a signature you received</label>${inp('k-exp', st.expect, 'Hex or Base64, e.g. from an X-Signature header')}</div>`
      : S.mode === 'pbkdf2' ? encRow('k-saltenc', 'Salt as', S.saltEnc)
        : `${encRow('k-ikmenc', 'Key material as', S.ikmEnc)}${encRow('k-saltenc', 'Salt as', S.saltEnc)}`;
    enhance(p);
    for (const [sel, k] of [['#k-msgenc', 'msgEnc'], ['#k-keyenc', 'keyEnc'], ['#k-saltenc', 'saltEnc'], ['#k-ikmenc', 'ikmEnc']]) $(sel, p)?.addEventListener('fw-change', (e) => { S[k] = e.detail.value; S.save(); renderForm(); invalidate(S.mode !== 'pbkdf2'); });
    $('#k-exp', p)?.addEventListener('input', (e) => { st.expect = e.target.value; invalidate(); });
  }

  // ───────── compute ─────────
  const schedule = debounce(() => compute(), 60);
  function invalidate(live = true) {
    st.run++;
    if (S.mode === 'pbkdf2') { st.result = null; paint(); if (live === true && st.pw) { /* keep explicit: derive on button */ } return; }
    schedule();
  }
  async function compute() {
    const run = ++st.run;
    try {
      if (S.mode === 'hmac') {
        if (!st.msg && !st.key) { st.result = null; st.error = null; return paint(); }
        const msg = bytesFrom(st.msg, S.msgEnc, 'The message'); const keyB = bytesFrom(st.key, S.keyEnc, 'The key');
        const key = await subtle.importKey('raw', keyB.length ? keyB : new Uint8Array(1), { name: 'HMAC', hash: S.hash }, false, ['sign', 'verify']);
        const sig = new Uint8Array(await subtle.sign('HMAC', key, msg));
        let verdict = null;
        if (st.expect.trim()) {
          const t = st.expect.trim().replace(/^(sha\d+|v\d)=/i, '');
          let eb = parseHex(t); if (!eb || eb.length !== sig.length) { try { eb = b64decode(t); } catch { eb = null; } }
          verdict = eb ? (await subtle.verify('HMAC', key, eb, msg) ? 'ok' : 'bad') : 'unreadable';
        }
        if (run !== st.run) return;
        st.result = { bytes: sig, label: `HMAC-${S.hash}`, keyLen: keyB.length, verdict }; st.error = null;
      } else if (S.mode === 'hkdf') {
        if (!st.ikm) { st.result = null; st.error = null; return paint(); }
        checkBits(S.hbits);
        const ikm = bytesFrom(st.ikm, S.ikmEnc, 'The key material'); const salt = bytesFrom(st.hsalt, S.saltEnc, 'The salt');
        const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
        const bits = new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: S.hash, salt, info: utf8Bytes(st.info) }, base, S.hbits));
        if (run !== st.run) return;
        st.result = { bytes: bits, label: `HKDF-${S.hash} · ${S.hbits} bits` }; st.error = null;
      }
    } catch (e) { if (run !== st.run) return; st.result = null; st.error = e.message; }
    paint();
  }
  function checkBits(n) { if (!Number.isInteger(n) || n < 8 || n > 4096 || n % 8) throw new Error('Length must be a multiple of 8 between 8 and 4,096 bits.'); }
  async function derive() {
    const b = $('#k-derive'); if (!b || b.classList.contains('is-busy')) return;
    const run = ++st.run;
    try {
      if (!st.pw) { toast('Enter a password first', { type: 'info' }); $('#k-pw').focus(); return; }
      if (!Number.isInteger(S.iter) || S.iter < 1 || S.iter > 10000000) throw new Error('Iterations must be between 1 and 10,000,000.');
      checkBits(S.bits);
      b.classList.add('is-busy'); b.disabled = true; $('#k-dmeta').textContent = `${fmtN(S.iter)} rounds…`;
      const t0 = performance.now();
      const base = await subtle.importKey('raw', utf8Bytes(st.pw), 'PBKDF2', false, ['deriveBits']);
      const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: S.hash, salt: bytesFrom(st.salt, S.saltEnc, 'The salt'), iterations: S.iter }, base, S.bits));
      if (run !== st.run) return;
      st.result = { bytes: bits, label: `PBKDF2-${S.hash} · ${S.bits} bits`, ms: Math.round(performance.now() - t0) }; st.error = null;
      $('#k-dmeta').textContent = `${fmtN(S.iter)} rounds in ${st.result.ms} ms`;
    } catch (e) { st.result = null; st.error = e.message; $('#k-dmeta').textContent = ''; }
    finally { b.classList.remove('is-busy'); b.disabled = false; }
    paint();
  }
  function paint() {
    const out = $('#k-out'); const ver = $('#k-verdict'); const r = st.result;
    $('#k-res .sec-pane__label').textContent = r?.label || (S.mode === 'hmac' ? `HMAC-${S.hash}` : S.mode === 'pbkdf2' ? `PBKDF2-${S.hash}` : `HKDF-${S.hash}`);
    $('#k-copy').disabled = !r;
    const meta = $('#k-res .sec-pane__meta');
    if (st.error) { out.innerHTML = `<p class="sec-err">${icon('circle-alert', { size: 14 })}${esc(st.error)}</p>`; ver.innerHTML = ''; meta.textContent = ''; setBar(null); return; }
    if (!r) {
      out.innerHTML = `<div class="sec-placeholder">${S.mode === 'pbkdf2' ? 'Press Derive key. It takes a moment on purpose: that’s what makes guessing slow.' : S.mode === 'hmac' ? 'The signature appears here as you type.' : 'The derived key appears here as you type.'}</div>`;
      ver.innerHTML = ''; meta.textContent = ''; setBar(null); return;
    }
    const v = encOut(r.bytes, S.out);
    meta.textContent = `${r.bytes.length} bytes`;
    out.innerHTML = `<div class="sec-result fw-mono" id="k-value">${esc(v)}</div>${S.mode === 'hmac' && r.keyLen < 32 ? `<p class="fw-field__hint sec-warn">${r.keyLen ? `The key is ${r.keyLen} bytes. Use at least 32 random bytes.` : 'No key: anyone can make this signature.'}</p>` : ''}`;
    ver.innerHTML = r.verdict === 'ok' ? `<div class="sec-vres is-ok">${icon('shield-check', { size: 22 })}<div><b>Signature matches</b><p>This message was signed with this key (HMAC-${esc(S.hash)}).</p></div></div>`
      : r.verdict === 'bad' ? `<div class="sec-vres is-bad">${icon('circle-x', { size: 22 })}<div><b>Signature doesn’t match</b><p>Wrong key, a changed message or another hash. Whitespace in the message counts.</p></div></div>`
        : r.verdict === 'unreadable' ? `<div class="sec-vres is-warn">${icon('triangle-alert', { size: 22 })}<div><b>Can’t read that signature</b><p>Paste it as hex or Base64.</p></div></div>` : '';
    setBar({ line: r.label, sub: v.slice(0, 28) + '…', actions: [{ label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyText(v, b) }] });
  }

  api = { mode: setMode };
  setMode(S.mode);
  return { onPasteText: (t) => { if (S.mode === 'hmac') { st.msg = t; renderForm(); invalidate(); return true; } return false; } };
}
