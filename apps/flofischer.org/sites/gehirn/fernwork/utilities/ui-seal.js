// Share ▸ Seal: encrypt a note on this device and share it as a link (key or ciphertext in the #fragment, never sent),
// and the "open" view that decrypts it. Real Web Crypto: AES-256-GCM, PBKDF2-SHA-256 600k (FWENC1).
import { $, $$, esc, icon, enhance, toast, navigate, openDialog, isTyping } from '../kit/shell.js';
import { seal, open as openSealed, extract, inspect, suggest, strength, ITER } from './lib/seal-crypto.js';
import { encode, drawQR } from './lib/qrlib.js';

const PUBLIC = 'fernwork.net/open';
export function mount(ctx) {
  const { root, hooks, params } = ctx;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let mode = /^#FWENC1/.test(location.hash) || params.get('mode') === 'open' || /FWENC1/.test(params.get('q') || '') ? 'open' : 'seal';
  const S = { msg: params.get('q') && !/FWENC1/.test(params.get('q')) ? params.get('q') : '', how: 'password', pw: '', result: null, busy: false, token: null, plain: null };

  const header = () => ctx.renderHeader({
    title: mode === 'open' ? 'Open sealed message' : undefined,
    lede: mode === 'open' ? 'Decrypted on this device. Nothing is sent anywhere.' : 'Encrypt a note on this device and share it as a link.',
    aside: `<div class="fw-seg" role="radiogroup" aria-label="Mode" id="sl-mode">
      <button class="fw-seg__opt" role="radio" type="button" data-value="seal" aria-checked="${mode === 'seal'}">${icon('lock', { size: 16 })}Seal</button>
      <button class="fw-seg__opt" role="radio" type="button" data-value="open" aria-checked="${mode === 'open'}">${icon('lock-open', { size: 16 })}Open</button></div>`,
  });
  header();
  $('#page-header').addEventListener('fw-change', (e) => { if (e.target.closest('#sl-mode')) { mode = e.detail.value; header(); render(); } });
  hooks.onPaste = (t) => { if (/FWENC1/.test(t)) { mode = 'open'; header(); render(); setOpenInput(t); return true; } if (mode === 'seal') { const m = $('#sl-msg'); if (m) { m.value = t; S.msg = t; m.dispatchEvent(new Event('input')); } return true; } return false; };

  // ── secret-safe copy: clipboard is cleared after 60 s ──
  let clearT = 0, tickT = 0;
  async function secretCopy(text, btn, what = 'Copied') {
    try { await navigator.clipboard.writeText(text); } catch { toast('Couldn’t copy. Select the text and copy it yourself.', { type: 'warning' }); return; }
    const old = btn.dataset.label || btn.innerHTML; btn.dataset.label = old; btn.classList.add('is-copied');
    let n = 60; const show = () => { btn.innerHTML = `${icon('check')}<span>${what} · clears in ${n} s</span>`; };
    show(); clearInterval(tickT); clearTimeout(clearT);
    tickT = setInterval(() => { n--; if (n <= 0) clearInterval(tickT); else if (btn.isConnected) show(); }, 1000);
    clearT = setTimeout(async () => { try { await navigator.clipboard.writeText(''); toast('Clipboard cleared', { type: 'neutral' }); } catch { /* page not focused */ } if (btn.isConnected) { btn.innerHTML = old; btn.classList.remove('is-copied'); } }, 60000);
  }
  window.addEventListener('pagehide', () => { S.plain = null; const p = $('#sl-plain'); if (p) p.textContent = ''; });

  root.addEventListener('keydown', (e) => { if (mode === 'seal' && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if ($('#sl-go') && !$('#sl-go').disabled) doSeal(); } });
  function render() { ctx.mbar.hide(); if (mode === 'seal') renderSeal(); else renderOpen(); }

  // ───────────── SEAL ─────────────
  function renderSeal() {
    root.innerHTML = `
    <div class="sl">
      <div class="fw-field">
        <label class="fw-field__label" for="sl-msg">Message</label>
        <textarea class="fw-textarea sl-msg" id="sl-msg" rows="4" placeholder="The secret: a Wi-Fi password, an IBAN, a door code…" spellcheck="false">${esc(S.msg)}</textarea>
        <span class="fw-field__hint" id="sl-count"></span>
      </div>
      <fieldset class="sl-how"><legend class="fw-field__label">Protect with</legend>
        <label class="sl-opt"><input type="radio" name="how" value="password" ${S.how === 'password' ? 'checked' : ''}><span class="sl-opt__body"><span class="sl-opt__title">${icon('key-round', { size: 16 })}Password</span><span class="sl-opt__text">They need the link and the password. Send the password another way.</span></span></label>
        <label class="sl-opt"><input type="radio" name="how" value="link" ${S.how === 'link' ? 'checked' : ''}><span class="sl-opt__body"><span class="sl-opt__title">${icon('link', { size: 16 })}Link only</span><span class="sl-opt__text">The key is inside the link. Quick, but anyone with the link can read it.</span></span></label>
      </fieldset>
      <div class="fw-field sl-pw" ${S.how === 'link' ? 'hidden' : ''}>
        <label class="fw-field__label" for="sl-pass">Password</label>
        <div class="fw-inputwrap fw-inputwrap--end sl-pwwrap"><input class="fw-input fw-input--mono" id="sl-pass" type="password" autocomplete="new-password" spellcheck="false" value="${esc(S.pw)}" placeholder="At least 4 words or 12 characters">
          <div class="fw-inputwrap__end"><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="sl-eye" aria-label="Show password" aria-pressed="false" data-tip="Show">${icon('eye')}</button></div></div>
        <div class="sl-meter" id="sl-meter"><span class="sl-meter__bars"><i></i><i></i><i></i><i></i></span><span class="sl-meter__label" id="sl-meter-l"></span>
          <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="sl-sugg">${icon('sparkles')}Suggest</button></div>
      </div>
      <div class="sl-go"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="sl-go" data-tip-kbd="mod+enter">${icon('lock')}<span>Seal message</span></button>
        <span class="fw-t-sm fw-muted">${icon('shield-check', { size: 14 })} Encrypted on this device · AES-256</span></div>
      <div id="sl-result" aria-live="polite"></div>
    </div>`;
    enhance(root);
    const msg = $('#sl-msg'), pw = $('#sl-pass');
    const upd = () => {
      S.msg = msg.value; S.pw = pw.value;
      $('#sl-count').textContent = S.msg ? `${[...S.msg].length} characters · stays on this device until you seal it` : 'Up to about 2,000 characters fit in a link that every app opens.';
      const st = strength(S.pw); const m = $('#sl-meter'); m.dataset.level = st.level;
      $('#sl-meter-l').textContent = S.pw ? `${st.label} · ~${st.bits} bits` : 'Use a passphrase: 4 random words are strong and easy to say on the phone.';
      $('#sl-go').disabled = !S.msg.trim() || (S.how === 'password' && st.level < 2);
      if (S.result) { $('#sl-result').innerHTML = ''; S.result = null; ctx.mbar.hide(); }
    };
    msg.addEventListener('input', upd); pw.addEventListener('input', upd);
    $$('input[name="how"]').forEach((r) => r.addEventListener('change', () => { S.how = r.value; $('.sl-pw').hidden = S.how === 'link'; upd(); }));
    $('#sl-eye').onclick = (e) => { const on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.innerHTML = icon(on ? 'eye-off' : 'eye'); };
    $('#sl-sugg').onclick = () => { pw.value = suggest(4); pw.type = 'text'; $('#sl-eye').setAttribute('aria-pressed', 'true'); $('#sl-eye').innerHTML = icon('eye-off'); upd(); };
    $('#sl-go').onclick = doSeal;
    upd();
    if (!coarse && !S.msg) msg.focus();
  }
  async function doSeal() {
    const b = $('#sl-go'); if (S.busy) return; S.busy = true; b.classList.add('is-busy'); b.disabled = true;
    const lbl = b.querySelector('span'); lbl.textContent = S.how === 'password' ? 'Strengthening the password…' : 'Sealing…';
    const t0 = performance.now();
    const r = await seal(S.msg, S.how === 'password' ? { password: S.pw } : { linkOnly: true });
    await new Promise((x) => setTimeout(x, Math.max(0, 450 - (performance.now() - t0))));
    S.busy = false; b.classList.remove('is-busy'); b.disabled = false; lbl.textContent = 'Seal again';
    const link = new URL(`./?leaf=seal#${r.token}`, location.href).href;
    S.result = { ...r, link, ms: Math.round(performance.now() - t0) };
    renderResult();
  }
  function renderResult() {
    const r = S.result; const shown = `${PUBLIC}#${r.token.slice(0, 22)}…${r.token.slice(-6)}`;
    $('#sl-result').innerHTML = `
      <section class="sl-res fw-card" aria-label="Sealed">
        <div class="sl-res__head"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Sealed</span><span class="fw-t-xs fw-faint">${r.linkOnly ? 'AES-256 · key in the link' : `AES-256 · ${(ITER / 1000).toFixed(0)}k password rounds`} · ${r.ms} ms · nothing uploaded</span></div>
        <div class="sl-link"><span class="sl-link__icon">${icon('link', { size: 16 })}</span><span class="sl-link__url fw-mono" title="${esc(r.link)}">${esc(shown)}</span></div>
        <div class="sl-res__actions">
          <button class="fw-btn fw-btn--primary" type="button" id="sl-copy">${icon('copy')}<span>Copy link</span></button>
          <button class="fw-btn" type="button" id="sl-qr">${icon('qr-code')}QR</button>
          <button class="fw-btn" type="button" id="sl-text">${icon('type')}<span>Copy as text</span></button>
          <a class="fw-btn fw-btn--ghost" href="${esc(r.link)}" target="_blank" rel="noopener">${icon('external-link')}Test it</a>
        </div>
        ${r.linkOnly ? `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">Anyone with this link can read the message. Send it only to the person it’s for.</div></div>`
          : `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('phone')}</span><div class="fw-alert__body">Send the password another way, e.g. say it on the phone. Link and password in the same chat are only as safe as that chat.</div></div>`}
        <ul class="sl-facts">
          <li>${icon('shield-check', { size: 14 })}<span>The part after <span class="fw-mono">#</span> never reaches a server, not even ours.</span></li>
          <li>${icon('info', { size: 14 })}<span>No expiry: there’s no server that could delete it. If the link leaks, change the secret.</span></li>
        </ul>
        <details class="sl-details"><summary>Technical details</summary><p class="fw-t-xs fw-muted">Format FWENC1 · AES-256-GCM, header authenticated · ${r.linkOnly ? 'random 256-bit key in the fragment' : `PBKDF2-SHA-256, ${ITER.toLocaleString('en')} rounds, 16-byte salt`} · 12-byte nonce. Opens in any Fernwork, also offline.</p><code class="sl-token">${esc(r.token)}</code></details>
      </section>`;
    enhance($('#sl-result'));
    const copyLink = (e) => (r.linkOnly ? secretCopy(r.link, e.currentTarget, 'Copied') : copyPlain(r.link, e.currentTarget));
    $('#sl-copy').onclick = copyLink;
    $('#sl-text').onclick = (e) => copyPlain(`Sealed message, made with Fernwork.\nOpen: ${r.link}\n\nOr paste this at ${PUBLIC}:\n${r.token}`, e.currentTarget);
    $('#sl-qr').onclick = () => showQR(r);
    const a = ctx.mbar.set({ line: 'Sealed', sub: r.linkOnly ? 'Key is in the link' : 'Send the password separately', actions: `<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="qr" aria-label="QR code" data-tip="QR">${icon('qr-code')}</button><button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy link</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = copyLink; a.querySelector('[data-a="qr"]').onclick = () => showQR(r);
    $('#sl-result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function copyPlain(t, b) { navigator.clipboard.writeText(t).then(() => { const o = b.innerHTML; b.innerHTML = `${icon('check')}<span>Copied</span>`; b.classList.add('is-copied'); setTimeout(() => { b.innerHTML = o; b.classList.remove('is-copied'); }, 1500); }); }
  function showQR(r) {
    let qr; try { qr = encode(r.link, 'M'); } catch { toast('Too long for a QR code. Share the link instead.', { type: 'warning' }); return; }
    const d = openDialog({ title: 'Scan to open', size: 420, body: `<div class="sl-qr"><canvas id="sl-qrc" role="img" aria-label="QR code of the sealed link"></canvas><p class="fw-t-sm fw-muted">${r.linkOnly ? 'Whoever scans this can read the message.' : 'They still need the password.'}</p><button class="fw-btn" type="button" id="sl-qr-open">${icon('qr-code')}Open in QR code</button></div>` });
    drawQR($('#sl-qrc', d.el), qr, { scale: Math.max(2, Math.floor(300 / (qr.size + 8))) });
    $('#sl-qr-open', d.el).onclick = () => navigate('qr-code', { query: { q: r.link } });
  }

  // ───────────── OPEN ─────────────
  function setOpenInput(t) { const i = $('#op-in'); if (i) { i.value = t; i.dispatchEvent(new Event('input')); } }
  function renderOpen() {
    const fromHash = /^#FWENC1/.test(location.hash) ? decodeURIComponent(location.hash.slice(1)) : '';
    const q = /FWENC1/.test(params.get('q') || '') ? params.get('q') : '';
    root.innerHTML = `
    <div class="sl">
      ${fromHash ? '' : `<div class="fw-field"><label class="fw-field__label" for="op-in">Sealed message or link</label>
        <textarea class="fw-textarea fw-textarea--mono sl-msg" id="op-in" rows="3" spellcheck="false" placeholder="Paste the link or the FWENC1… text, even with line breaks from an email"></textarea>
        <div class="fw-paste__meta" id="op-meta"></div></div>`}
      <section class="sl-open fw-card" id="op-card" hidden>
        <div class="sl-open__head"><span class="sl-open__seal">${icon('stamp', { size: 20 })}</span><div><p class="sl-open__title">Sealed message</p><p class="fw-t-sm fw-muted" id="op-info"></p></div></div>
        <div id="op-body"></div>
      </section>
    </div>`;
    enhance(root);
    const go = (raw) => {
      S.plain = null;
      const card = $('#op-card'), meta = $('#op-meta');
      if (!raw.trim()) { card.hidden = true; if (meta) meta.innerHTML = ''; return; }
      const ex = extract(raw);
      if (ex.error) {
        card.hidden = true;
        if (meta) meta.innerHTML = `<div class="fw-alert fw-alert--${ex.error === 'truncated' ? 'danger' : 'warning'}"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body">${ex.error === 'truncated' ? 'This sealed message is incomplete: the end is missing. Copy the whole text, including the last characters.' : 'No sealed message found. Sealed messages start with FWENC1, or come as a fernwork.net/open link.'}</div></div>`;
        return;
      }
      if (meta) meta.innerHTML = ex.fixes.length ? `<span class="fw-detect">${icon('wand', { size: 14 })}Fixed for you: ${esc(ex.fixes.join(', '))}</span>` : `<span class="fw-detect">${icon('scan', { size: 14 })}Detected: sealed message</span>`;
      const info = inspect(ex.token);
      if (info.error) { card.hidden = true; return; }
      S.token = ex.token; card.hidden = false;
      $('#op-info').textContent = `${info.linkOnly ? 'Key included in the link' : 'Protected with a password'} · ${info.bytes.toLocaleString('en')} bytes · AES-256`;
      if (info.linkOnly) {
        $('#op-body').innerHTML = `<p class="fw-t-sm">Anyone with this link can open it. Make sure nobody is looking at your screen.</p><div class="sl-go"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="op-go">${icon('eye')}<span>Show message</span></button></div>`;
      } else {
        $('#op-body').innerHTML = `<div class="fw-field"><label class="fw-field__label" for="op-pw">Password</label>
          <div class="fw-inputwrap fw-inputwrap--end"><input class="fw-input fw-input--mono" id="op-pw" type="password" autocomplete="off" spellcheck="false" placeholder="The password you were told"><div class="fw-inputwrap__end"><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="op-eye" aria-label="Show password" aria-pressed="false" data-tip="Show">${icon('eye')}</button></div></div>
          <div id="op-err"></div></div>
          <div class="sl-go"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="op-go">${icon('lock-open')}<span>Open</span></button></div>`;
        $('#op-eye').onclick = (e) => { const i = $('#op-pw'); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.innerHTML = icon(on ? 'eye-off' : 'eye'); };
        $('#op-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doOpen(); } });
        $('#op-pw').addEventListener('input', () => { $('#op-err').innerHTML = ''; $('#op-pw').removeAttribute('aria-invalid'); });
        if (!coarse || fromHash) setTimeout(() => $('#op-pw')?.focus(), 50);
      }
      enhance($('#op-body'));
      $('#op-go').onclick = doOpen;
    };
    async function doOpen() {
      const b = $('#op-go'); const pw = $('#op-pw')?.value;
      if ($('#op-pw') && !pw) { $('#op-pw').focus(); return; }
      b.classList.add('is-busy'); b.disabled = true; const l = b.querySelector('span'); const ol = l.textContent; l.textContent = 'Opening…';
      try {
        const text = await openSealed(S.token, pw);
        S.plain = text;
        $('#op-body').innerHTML = `
          <div class="sl-plain"><p class="sl-plain__text" id="sl-plain"></p></div>
          <div class="sl-res__actions">
            <button class="fw-btn fw-btn--primary" type="button" id="op-copy">${icon('copy')}<span>Copy</span></button>
            <button class="fw-btn fw-btn--ghost" type="button" id="op-wipe">${icon('eraser')}Wipe</button>
          </div>
          <p class="fw-t-xs fw-muted sl-wipe-note">${icon('shield-check', { size: 12 })} Shown only here. Leaving the page wipes it; copying clears the clipboard after 60 s.</p>`;
        $('#sl-plain').textContent = text; enhance($('#op-body'));
        $('#op-copy').onclick = (e) => secretCopy(text, e.currentTarget);
        $('#op-wipe').onclick = () => { S.plain = null; $('#sl-plain').textContent = ''; $('#op-body').innerHTML = `<p class="fw-t-sm fw-muted">${icon('check', { size: 14 })} Wiped from this page.</p>`; navigator.clipboard.writeText('').catch(() => {}); ctx.mbar.hide(); };
        $('#op-info').textContent = 'Opened on this device';
        const a = ctx.mbar.set({ line: 'Message opened', sub: 'Copy clears in 60 s', actions: `<button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy</span></button>` });
        a.querySelector('[data-a="copy"]').onclick = (e) => secretCopy(text, e.currentTarget);
      } catch (e) {
        b.classList.remove('is-busy'); b.disabled = false; l.textContent = ol;
        const err = e.message === 'password' ? 'Wrong password, or the message was changed. Passwords are case-sensitive.' : e.message === 'key' ? 'The key is missing from this link. Copy the whole link, including the end.' : 'This message is damaged: some characters are missing or changed. Ask for it again.';
        if ($('#op-err')) { $('#op-err').innerHTML = `<span class="fw-field__error">${icon('circle-alert', { size: 14 })}${esc(err)}</span>`; $('#op-pw').setAttribute('aria-invalid', 'true'); $('#op-pw').select(); }
        else toast(err, { type: 'danger' });
      }
    }
    if (fromHash) go(fromHash);
    else { const i = $('#op-in'); i.addEventListener('input', () => go(i.value)); if (q) { i.value = q; go(q); } else if (!coarse) i.focus(); }
  }

  window.addEventListener('hashchange', () => { if (/^#FWENC1/.test(location.hash)) { mode = 'open'; header(); render(); } });
  render();
}
