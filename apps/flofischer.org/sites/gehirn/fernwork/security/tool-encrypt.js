// Text Encryption: encrypt text with a password into an FWENC1 value (today's format, AES-256-GCM + PBKDF2 600k) and
// decrypt it again. Decrypt repairs what email and chat do to long values (line breaks, "> " quote marks, prose around).
import { openPopover } from '../kit/shell.js';
import { icon, esc, $, $$, enhance, toast, copyText, isCoarse, settings, seg, pane, iconBtn, setBar, pwField, wireEyes, readClipboard, autoGrow, copySecret, randInt, fmtN } from './ui.js';
import { encrypt, decrypt, extract, inspect, strength, ITER } from './fwenc.js';
import { WORDS } from './words.js';

let api = {};
export const config = {
  commands: [
    { id: 'x-enc', label: 'Encrypt text', icon: 'lock', run: () => api.mode?.('encrypt') },
    { id: 'x-dec', label: 'Decrypt text', icon: 'lock-open', syn: ['fwenc1'], run: () => api.mode?.('decrypt') },
  ],
};

export async function mount(root, { params }) {
  const S = settings('encrypt', { mode: 'encrypt' });
  const st = { plain: '', pw: '', pw2: '', token: '', cipher: '', dpw: '', out: null };
  const q = params.get('q') || '';
  if (/FWENC1/.test(q)) { S.mode = 'decrypt'; st.cipher = q; } else if (q) st.plain = q;

  root.innerHTML = `
    <div class="sec-toolbar">
      ${seg('x-mode', 'Mode', [['encrypt', 'Encrypt', 'lock'], ['decrypt', 'Decrypt', 'lock-open']], S.mode)}
      <span class="fw-spacer"></span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="x-about" aria-haspopup="dialog">${icon('info')}<span>About the format</span></button>
    </div>
    <div id="x-body" class="sec-narrowcol"></div>`;
  enhance(root);
  $('#x-mode').addEventListener('fw-change', (e) => setMode(e.detail.value));
  $('#x-about').onclick = (e) => openPopover(e.currentTarget, `<div class="sec-about"><b>FWENC1</b><p>AES-256-GCM with a 128-bit authentication tag. The key comes from your password via PBKDF2-HMAC-SHA-256 with ${fmtN(ITER)} rounds, a new random 16-byte salt and 12-byte nonce every time.</p><p class="fw-mono fw-t-xs">FWENC1.&lt;header&gt;.&lt;ciphertext + tag&gt;</p><p>The header is authenticated too, so a wrong password or any changed character fails instead of giving garbage.</p></div>`, { placement: 'bottom-end', width: 340 });

  function setMode(m) {
    S.mode = m; S.save();
    $$('#x-mode .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m)));
    m === 'encrypt' ? renderEncrypt() : renderDecrypt();
  }

  // ───────── encrypt ─────────
  function renderEncrypt() {
    const b = $('#x-body');
    b.innerHTML = `${pane({ label: 'Text', labelFor: 'x-plain', actions: iconBtn('x-paste', 'clipboard-paste', 'Paste') + iconBtn('x-clear', 'x', 'Clear'), body: `<textarea class="sec-area" id="x-plain" rows="5" spellcheck="false" placeholder="The secret: a Wi-Fi password, an IBAN, a note…">${esc(st.plain)}</textarea>` })}
      <div class="sec-pair">${pwField('x-pw', 'Password', { autocomplete: 'new-password', placeholder: 'At least 12 characters', value: st.pw })}${pwField('x-pw2', 'Confirm password', { autocomplete: 'new-password', value: st.pw2 })}</div>
      <div class="sec-meter" id="x-meter" data-level="0"><span class="sec-meter__bars"><i></i><i></i><i></i><i></i></span><span class="sec-meter__label" id="x-meter-l"></span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="x-sugg">${icon('sparkles')}Suggest a passphrase</button></div>
      <div id="x-err" aria-live="polite"></div>
      <div class="sec-actions"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="x-go">${icon('lock')}<span>Encrypt</span></button></div>
      <div id="x-res" aria-live="polite"></div>`;
    enhance(b); wireEyes(b);
    const ta = $('#x-plain'); autoGrow(ta, { max: 320 });
    const upd = () => {
      st.plain = ta.value; st.pw = $('#x-pw').value; st.pw2 = $('#x-pw2').value;
      const s = strength(st.pw); $('#x-meter').dataset.level = s.level;
      $('#x-meter-l').textContent = st.pw ? `${s.label} · ~${s.bits} bits${st.pw.length < 12 ? ` · ${12 - st.pw.length} more character${12 - st.pw.length > 1 ? 's' : ''} needed` : ''}` : 'Four random words are strong and easy to say on the phone.';
      $('#x-err').innerHTML = ''; ['x-pw', 'x-pw2'].forEach((i) => $('#' + i).removeAttribute('aria-invalid'));
      if (st.token) { st.token = ''; $('#x-res').innerHTML = ''; setBar(null); }
    };
    ['x-plain', 'x-pw', 'x-pw2'].forEach((i) => $('#' + i).addEventListener('input', upd));
    $('#x-paste').onclick = async () => { const t = await readClipboard(); if (t != null) { ta.value = t; ta.dispatchEvent(new Event('input')); } };
    $('#x-clear').onclick = () => { const old = ta.value; ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); if (old) toast('Text cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { ta.value = old; ta.dispatchEvent(new Event('input')); } } }); };
    $('#x-sugg').onclick = () => {
      const w = Array.from({ length: 4 }, () => WORDS[randInt(WORDS.length)]); const p = `${w.join('-')}-${randInt(90) + 10}`;
      for (const i of ['x-pw', 'x-pw2']) { const el = $('#' + i); el.value = p; el.type = 'text'; }
      $$('[data-eye]', b).forEach((e) => { e.setAttribute('aria-pressed', 'true'); e.innerHTML = icon('eye-off'); });
      upd();
    };
    $('#x-go').onclick = go;
    b.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); go(); } });
    upd();
    if (!isCoarse() && !st.plain) ta.focus();
  }
  async function go() {
    const btn = $('#x-go'); if (btn.classList.contains('is-busy')) return;
    const err = (msg, field) => { $('#x-err').innerHTML = `<p class="sec-err">${icon('circle-alert', { size: 14 })}${esc(msg)}</p>`; if (field) { $('#' + field).setAttribute('aria-invalid', 'true'); $('#' + field).focus(); } };
    if (!st.plain) return err('Type or paste the text to encrypt.', 'x-plain');
    if (st.pw.length < 12) return err('Use a password with at least 12 characters.', 'x-pw');
    if (st.pw !== st.pw2) return err('The passwords don’t match.', 'x-pw2');
    btn.classList.add('is-busy'); btn.disabled = true; btn.querySelector('span').textContent = 'Encrypting…';
    const t0 = performance.now();
    try { st.token = await encrypt(st.plain, st.pw); } catch (e) { err(e.message); }
    btn.classList.remove('is-busy'); btn.disabled = false; btn.querySelector('span').textContent = 'Encrypt again';
    if (!st.token) return;
    const ms = Math.round(performance.now() - t0);
    $('#x-res').innerHTML = pane({ label: 'Encrypted', actions: `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="x-check">${icon('lock-open')}Decrypt to check</button><button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="x-copy">${icon('copy')}<span>Copy</span></button>`,
      body: `<textarea class="sec-area sec-area--out fw-input--mono" id="x-token" rows="4" readonly spellcheck="false" aria-label="Encrypted value">${esc(st.token)}</textarea><p class="sec-foot fw-faint fw-t-sm">${fmtN(st.token.length)} characters · ${ms} ms · send the password another way</p>` });
    enhance($('#x-res'));
    autoGrow($('#x-token'), { max: 260 });
    $('#x-copy').onclick = (e) => copyText(st.token, e.currentTarget);
    $('#x-check').onclick = () => { st.cipher = st.token; st.dpw = ''; setMode('decrypt'); };
    setBar({ line: 'Encrypted · FWENC1', sub: `${fmtN(st.token.length)} characters`, actions: [{ label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyText(st.token, b) }] });
  }

  // ───────── decrypt ─────────
  function renderDecrypt() {
    const b = $('#x-body');
    b.innerHTML = `${pane({ label: 'Encrypted text', labelFor: 'x-cipher', actions: iconBtn('x-dpaste', 'clipboard-paste', 'Paste') + iconBtn('x-dclear', 'x', 'Clear'), body: `<textarea class="sec-area fw-input--mono" id="x-cipher" rows="4" spellcheck="false" autocapitalize="off" placeholder="FWENC1.… (line breaks from email are fine)">${esc(st.cipher)}</textarea>` })}
      <div class="sec-expect__meta" id="x-dmeta"></div>
      <div class="sec-pair">${pwField('x-dpw', 'Password', { autocomplete: 'current-password', value: st.dpw })}<span></span></div>
      <div id="x-derr" aria-live="polite"></div>
      <div class="sec-actions"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="x-dgo">${icon('lock-open')}<span>Decrypt</span></button></div>
      <div id="x-dres" aria-live="polite"></div>`;
    enhance(b); wireEyes(b);
    const ta = $('#x-cipher'); autoGrow(ta, { max: 260 });
    const upd = () => { st.cipher = ta.value; st.dpw = $('#x-dpw').value; meta(); $('#x-derr').innerHTML = ''; $('#x-dpw').removeAttribute('aria-invalid'); if (st.out != null) { st.out = null; $('#x-dres').innerHTML = ''; setBar(null); } };
    ta.addEventListener('input', upd); $('#x-dpw').addEventListener('input', upd);
    $('#x-dpw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dgo(); } });
    $('#x-dpaste').onclick = async () => { const t = await readClipboard(); if (t != null) { ta.value = t; ta.dispatchEvent(new Event('input')); $('#x-dpw').focus(); } };
    $('#x-dclear').onclick = () => { ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); };
    $('#x-dgo').onclick = dgo;
    meta();
    if (!isCoarse()) (st.cipher ? $('#x-dpw') : ta).focus();
  }
  function meta() {
    const m = $('#x-dmeta'); if (!m) return;
    if (!st.cipher.trim()) { m.innerHTML = ''; return; }
    const ex = extract(st.cipher);
    if (ex.error) { m.innerHTML = `<span class="sec-err">${icon('circle-alert', { size: 14 })}${ex.error === 'truncated' ? 'The end is missing. Copy the whole value, including the last characters.' : 'No encrypted value found. It starts with FWENC1.'}</span>`; return; }
    const info = inspect(ex.token);
    if (info.error) { m.innerHTML = `<span class="sec-err">${icon('circle-alert', { size: 14 })}${info.error === 'unsafe' ? 'This value uses unsupported or unsafe settings.' : 'This value is damaged: characters are missing or changed.'}</span>`; return; }
    m.innerHTML = ex.fixes.length ? `<span class="fw-detect">${icon('wand', { size: 14 })}<span>Fixed for you: ${esc(ex.fixes.join(', '))}</span></span>` : `<span class="fw-detect">${icon('scan', { size: 14 })}<span>FWENC1 · ${fmtN(info.bytes)} bytes of text inside</span></span>`;
  }
  async function dgo() {
    const btn = $('#x-dgo'); if (btn.classList.contains('is-busy')) return;
    const err = (msg) => { $('#x-derr').innerHTML = `<p class="sec-err">${icon('circle-alert', { size: 14 })}${esc(msg)}</p>`; };
    const ex = extract(st.cipher);
    if (ex.error) { err(ex.error === 'empty' ? 'Paste the encrypted text first.' : ex.error === 'truncated' ? 'The end of the value is missing.' : 'No FWENC1 value found.'); $('#x-cipher').focus(); return; }
    if (!st.dpw) { err('Enter the password.'); $('#x-dpw').focus(); return; }
    btn.classList.add('is-busy'); btn.disabled = true; btn.querySelector('span').textContent = 'Decrypting…';
    try {
      st.out = await decrypt(ex.token, st.dpw);
      $('#x-dres').innerHTML = pane({ label: 'Decrypted text', actions: `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="x-wipe">${icon('x')}Hide</button><button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="x-dcopy">${icon('copy')}<span>Copy</span></button>`, body: `<textarea class="sec-area sec-area--out" id="x-plainout" rows="3" readonly aria-label="Decrypted text"></textarea>` });
      enhance($('#x-dres'));
      const o = $('#x-plainout'); o.value = st.out; autoGrow(o, { max: 320 });
      $('#x-dcopy').onclick = (e) => copySecret(st.out, e.currentTarget);
      $('#x-wipe').onclick = () => { st.out = null; $('#x-dres').innerHTML = ''; setBar(null); };
      setBar({ line: 'Decrypted', sub: 'Copy clears the clipboard after 60 s', actions: [{ label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copySecret(st.out, b) }] });
    } catch (e) {
      err(e.message === 'password' ? 'Wrong password, or the value was changed. Passwords are case-sensitive.' : e.message === 'unsafe' ? 'This value uses unsupported or unsafe settings.' : 'This value is damaged: characters are missing or changed.');
      $('#x-dpw').setAttribute('aria-invalid', 'true'); $('#x-dpw').select();
    }
    btn.classList.remove('is-busy'); btn.disabled = false; btn.querySelector('span').textContent = 'Decrypt';
  }
  addEventListener('pagehide', () => { st.out = null; });

  api = { mode: setMode };
  setMode(S.mode);
  return {
    onPasteText: (t) => {
      if (/FWENC1/.test(t)) { st.cipher = t; setMode('decrypt'); return true; }
      if (S.mode === 'encrypt') { st.plain = t; renderEncrypt(); return true; }
      return false;
    },
  };
}
