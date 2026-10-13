// Password Generator: one big password (or passphrase), live as you change settings, R for a new one, Copy clears the
// clipboard after 60 s. Presets Strong · Readable · Maximum · PIN (Custom appears by itself). More options: characters to
// avoid and how many (1–20, with Copy all). crypto.getRandomValues with rejection sampling only.
import { icon, esc, $, $$, enhance, toast, copyText, isCoarse, settings, seg, moreBtn, wireMore, setBar, copySecret, humanDuration, randInt, kbd } from './ui.js';
import { isTyping, hasLayers } from '../kit/shell.js';
import { WORDS } from './words.js';

let api = {};
export const config = {
  shortcuts: [{ label: 'New password', keys: 'r' }, { label: 'Copy password', keys: 'mod+shift+c' }],
  commands: [
    { id: 'p-new', label: 'New password', icon: 'refresh-cw', kbd: 'r', run: () => api.regen?.() },
    { id: 'p-phrase', label: 'Passphrase', icon: 'type', syn: ['diceware', 'words'], run: () => api.mode?.('phrase') },
  ],
};

const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`' };
const LOOKALIKE = /[O0oIl1|`]/g;
const PRESETS = {
  strong: { label: 'Strong', length: 20, upper: true, lower: true, digits: true, symbols: true, avoid: false, hint: 'All characters, 20 long' },
  readable: { label: 'Readable', length: 16, upper: true, lower: true, digits: true, symbols: false, avoid: true, hint: 'No symbols or look-alikes, easy to read aloud' },
  maximum: { label: 'Maximum', length: 32, upper: true, lower: true, digits: true, symbols: true, avoid: false, hint: 'All characters, 32 long' },
  pin: { label: 'PIN', length: 6, upper: false, lower: false, digits: true, symbols: false, avoid: false, hint: '6 digits' },
};
const KEYS = ['length', 'upper', 'lower', 'digits', 'symbols', 'avoid'];
function pool(o) {
  const sets = ['upper', 'lower', 'digits', 'symbols'].filter((k) => o[k]).map((k) => {
    let s = SETS[k]; if (o.avoid) s = s.replace(LOOKALIKE, ''); if (o.exclude) s = [...s].filter((c) => !o.exclude.includes(c)).join(''); return s;
  }).filter(Boolean);
  return { sets, all: sets.join('') };
}
/** Uniform over all passwords that contain at least one of each chosen set (rejection keeps it unbiased). */
export function makePassword(o) {
  const { sets, all } = pool(o); if (!all) return '';
  for (let tries = 0; tries < 500; tries++) {
    let s = ''; for (let i = 0; i < o.length; i++) s += all[randInt(all.length)];
    if (o.length < sets.length || sets.every((set) => [...s].some((c) => set.includes(c)))) return s;
  }
  return '';
}
const presetOf = (o) => Object.keys(PRESETS).find((k) => KEYS.every((f) => PRESETS[k][f] === o[f]) && !o.exclude) || 'custom';
function strength(bits, pin) {
  const tiers = [[28, 'Weak', 'bad'], [50, 'Fair', 'warn'], [70, 'Good', 'ok'], [100, 'Strong', 'ok'], [Infinity, 'Very strong', 'ok']];
  const i = tiers.findIndex(([t]) => bits < t);
  return { level: i + 1, label: tiers[i][1], tone: tiers[i][2], bits: Math.round(bits), crack: humanDuration(Math.pow(2, bits - 1) / 1e10), pin };
}
function makePhrase(o) {
  const words = []; for (let i = 0; i < o.words; i++) { let w = WORDS[randInt(WORDS.length)]; if (o.cap) w = w[0].toUpperCase() + w.slice(1); words.push(w); }
  if (o.digit) { const i = randInt(words.length); words[i] += randInt(10); }
  return { words, text: words.join(o.sep) };
}

export async function mount(root) {
  const S = settings('password', { mode: 'password', pw: { ...PRESETS.strong, exclude: '' }, ph: { words: 5, sep: '-', cap: false, digit: false }, count: 1 });
  delete S.pw.label; delete S.pw.hint;
  const cur = { text: '', list: [] };

  root.innerHTML = `
    <div class="sec-toolbar">
      ${seg('p-mode', 'Generate', [['password', 'Password'], ['phrase', 'Passphrase']], S.mode)}
      <span class="fw-spacer"></span>
      <span class="sec-keyhint fw-hide-mobile">${kbd('r')} new · ${kbd('mod+shift+c')} copy</span>
    </div>
    <section class="sec-gen" aria-label="Result">
      <div class="sec-gen__out" id="p-out" aria-live="polite" aria-atomic="true"></div>
      <div class="sec-gen__actions">
        <button class="fw-iconbtn fw-iconbtn--outline sec-gen__new" type="button" id="p-new" aria-label="New" data-tip="New" data-tip-kbd="r">${icon('refresh-cw', { size: 20 })}</button>
        <button class="fw-btn fw-btn--primary fw-btn--lg sec-gen__copy" type="button" id="p-copy">${icon('copy')}<span>Copy</span></button>
      </div>
      <div class="sec-gen__strength" id="p-strength"></div>
    </section>
    <div id="p-list"></div>
    <section class="sec-pane sec-controls" aria-label="Settings"><div id="p-controls"></div>
      <div class="sec-crow sec-crow--more">${moreBtn('p-more')}</div>
      <div class="sec-more sec-more--inset" id="p-more-panel" hidden></div></section>`;
  enhance(root);
  wireMore($('#p-more'), $('#p-more-panel'));
  $('#p-mode').addEventListener('fw-change', (e) => { S.mode = e.detail.value; S.save(); renderControls(); renderMore(); regen(); });
  $('#p-new').onclick = () => regen(true);
  $('#p-copy').onclick = (e) => copySecret(cur.text, e.currentTarget, { label: 'Copy' });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || isTyping() || hasLayers()) return;
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); regen(true); }
    if (e.key.toLowerCase() === 'c' && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); $('#p-copy').click(); }
  });

  // ───────── controls ─────────
  const lenRow = (label, v, min, max, lessLabel, moreLabel) => `<div class="sec-crow sec-crow--len">
      <span class="sec-crow__label" id="p-len-l">${label}</span>
      <div class="fw-stepper sec-stepper" role="group" aria-labelledby="p-len-l"><button class="fw-iconbtn" type="button" data-step="-1" aria-label="${lessLabel}">${icon('minus')}</button><output id="p-len-v" class="fw-num">${v}</output><button class="fw-iconbtn" type="button" data-step="1" aria-label="${moreLabel}">${icon('plus')}</button></div>
      <input class="sec-range" type="range" id="p-len" min="${min}" max="${max}" value="${v}" aria-labelledby="p-len-l" style="--p:${((v - min) / (max - min)) * 100}%"></div>`;
  function renderControls() {
    const c = $('#p-controls');
    if (S.mode === 'password') {
      const o = S.pw; const p = presetOf(o);
      c.innerHTML = `${lenRow('Length', o.length, 4, 128, 'Shorter', 'Longer')}
        <div class="sec-crow"><span class="sec-crow__label">Characters</span>
          <div class="sec-chips" role="group" aria-label="Character sets">${[['upper', 'A–Z'], ['lower', 'a–z'], ['digits', '0–9'], ['symbols', '!@#$']].map(([k, l]) => `<button class="fw-chip sec-set" type="button" data-set="${k}" aria-pressed="${o[k]}">${o[k] ? icon('check', { size: 14 }) : ''}${l}</button>`).join('')}</div>
          <label class="fw-toggle"><input type="checkbox" id="p-avoid" ${o.avoid ? 'checked' : ''}>Avoid look-alikes <span class="fw-mono fw-faint">0 O 1 l I</span></label></div>
        <div class="sec-crow"><span class="sec-crow__label">Preset</span>
          <div class="sec-chips" role="group" aria-label="Presets">${Object.entries(PRESETS).map(([k, v]) => `<button class="fw-chip" type="button" data-preset="${k}" aria-pressed="${p === k}" data-tip="${esc(v.hint)}">${esc(v.label)}</button>`).join('')}<span class="fw-chip is-active sec-custom" aria-current="true" ${p === 'custom' ? '' : 'hidden'}>Custom</span></div></div>`;
    } else {
      const o = S.ph; const custom = !['-', ' ', '.', '_'].includes(o.sep);
      c.innerHTML = `${lenRow('Words', o.words, 3, 12, 'Fewer words', 'More words')}
        <div class="sec-crow"><span class="sec-crow__label">Separator</span>
          ${seg('p-sep', 'Separator', [['-', 'Hyphen'], [' ', 'Space'], ['.', 'Dot'], ['_', 'Underscore'], ['custom', 'Custom']], custom ? 'custom' : o.sep, { sm: true })}
          <input class="fw-input fw-input--mono sec-sepinput" id="p-sepc" maxlength="3" value="${esc(custom ? o.sep : '')}" aria-label="Custom separator (up to 3 characters)" placeholder="+" ${custom ? '' : 'hidden'}></div>
        <div class="sec-crow"><span class="sec-crow__label">Extras</span>
          <label class="fw-toggle"><input type="checkbox" id="p-cap" ${o.cap ? 'checked' : ''}>Capitalise words</label>
          <label class="fw-toggle"><input type="checkbox" id="p-digit" ${o.digit ? 'checked' : ''}>Add a digit</label></div>`;
    }
    enhance(c); wireControls();
  }
  function wireControls() {
    const pw = S.mode === 'password'; const o = pw ? S.pw : S.ph; const key = pw ? 'length' : 'words';
    const r = $('#p-len');
    const setLen = (n) => {
      n = Math.max(+r.min, Math.min(+r.max, n)); o[key] = n; $('#p-len-v').textContent = n; r.value = n;
      r.style.setProperty('--p', ((n - r.min) / (r.max - r.min)) * 100 + '%'); S.save(); if (pw) syncPreset(); regen();
    };
    r.addEventListener('input', () => setLen(+r.value));
    $$('[data-step]').forEach((b) => b.onclick = () => setLen(o[key] + +b.dataset.step));
    if (pw) {
      $$('[data-set]').forEach((b) => b.onclick = () => {
        const k = b.dataset.set;
        if (o[k] && ['upper', 'lower', 'digits', 'symbols'].filter((x) => o[x]).length === 1) { toast('Keep at least one kind of character', { type: 'info' }); return; }
        o[k] = !o[k]; S.save(); renderControls(); regen();
      });
      $('#p-avoid').onchange = (e) => { o.avoid = e.target.checked; S.save(); syncPreset(); regen(); };
      $$('[data-preset]').forEach((b) => b.onclick = () => { const { label, hint, ...p } = PRESETS[b.dataset.preset]; Object.assign(o, p, { exclude: '' }); S.save(); renderControls(); renderMore(); regen(true); });
    } else {
      $('#p-sep').addEventListener('fw-change', (e) => { const v = e.detail.value; $('#p-sepc').hidden = v !== 'custom'; if (v === 'custom') { o.sep = $('#p-sepc').value || '+'; $('#p-sepc').value = o.sep; $('#p-sepc').focus(); } else o.sep = v; S.save(); regen(); });
      $('#p-sepc').addEventListener('input', (e) => { o.sep = e.target.value; S.save(); regen(); });
      $('#p-cap').onchange = (e) => { o.cap = e.target.checked; S.save(); regen(); };
      $('#p-digit').onchange = (e) => { o.digit = e.target.checked; S.save(); regen(); };
    }
  }
  function syncPreset() {
    const p = presetOf(S.pw);
    $$('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(p === b.dataset.preset)));
    const c = $('.sec-custom'); if (c) c.hidden = p !== 'custom';
  }
  function renderMore() {
    const p = $('#p-more-panel');
    p.innerHTML = `${S.mode === 'password' ? `<div class="fw-field sec-more__field"><label class="fw-field__label" for="p-excl">Never use these characters</label><input class="fw-input fw-input--mono" id="p-excl" value="${esc(S.pw.exclude || '')}" placeholder="e.g. %&lt;&gt;" autocomplete="off" spellcheck="false"></div>` : `<span class="fw-faint fw-t-sm">${WORDS.length.toLocaleString('en-US')}-word list · about ${Math.log2(WORDS.length).toFixed(1)} bits per word</span>`}
      <div class="fw-field sec-more__field"><label class="fw-field__label" for="p-count">How many</label><input class="fw-input fw-num sec-narrow" id="p-count" type="number" min="1" max="20" value="${S.count}" inputmode="numeric"><span class="fw-field__hint" id="p-count-hint">1 to 20</span></div>`;
    $('#p-excl')?.addEventListener('input', (e) => { S.pw.exclude = e.target.value; S.save(); syncPreset(); regen(); });
    $('#p-count').addEventListener('input', (e) => {
      const n = Math.floor(+e.target.value); const ok = n >= 1 && n <= 20;
      e.target.setAttribute('aria-invalid', String(!ok)); $('#p-count-hint').className = ok ? 'fw-field__hint' : 'fw-field__error'; $('#p-count-hint').textContent = ok ? '1 to 20' : 'Choose 1 to 20';
      if (ok) { S.count = n; S.save(); regen(); }
    });
  }

  // ───────── output ─────────
  function charHtml(s, group) {
    let out = ''; let i = 0;
    for (const c of s) {
      const k = /[A-Z]/.test(c) ? 'u' : /[a-z]/.test(c) ? 'l' : /\d/.test(c) ? 'd' : 's';
      if (group && i && i % group === 0) out += '<span class="sec-gap" aria-hidden="true"></span>';
      out += `<span class="c-${k}">${esc(c)}</span>`; i++;
    }
    return out;
  }
  let scrambleT = 0;
  function one() {
    if (S.mode === 'password') return { text: makePassword(S.pw) };
    const r = makePhrase(S.ph); return { text: r.text, words: r.words };
  }
  function regen(animate = false) {
    const out = $('#p-out'); const pw = S.mode === 'password';
    const r = one(); cur.text = r.text;
    let html, bits;
    if (pw) {
      const o = S.pw; const P = pool(o).all.length; bits = o.length * Math.log2(Math.max(P, 1));
      const p = presetOf(o); html = charHtml(r.text, p === 'readable' ? 4 : p === 'pin' ? 3 : 0);
      out.classList.toggle('is-long', o.length > 28 && o.length <= 64); out.classList.toggle('is-xlong', o.length > 64); out.classList.toggle('is-pin', p === 'pin');
      if (!r.text) html = '<span class="fw-faint">No characters left to choose from. Allow more characters.</span>';
    } else {
      const o = S.ph; bits = o.words * Math.log2(WORDS.length) + (o.digit ? Math.log2(10 * o.words) : 0);
      html = r.words.map((w) => `<span class="sec-word">${esc(w)}</span>`).join(`<span class="sec-sepch">${esc(o.sep === ' ' ? '·' : o.sep)}</span>`);
      out.classList.remove('is-long', 'is-xlong', 'is-pin'); out.classList.toggle('is-long', o.words > 7);
    }
    const s = strength(bits, pw && presetOf(S.pw) === 'pin');
    clearInterval(scrambleT);
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches && r.text) {
      let n = 0; const chars = SETS.upper + SETS.lower + SETS.digits;
      scrambleT = setInterval(() => { if (++n > 5) { clearInterval(scrambleT); out.innerHTML = html; return; } out.innerHTML = charHtml([...r.text].map((c) => (/\w/.test(c) && Math.random() < 0.7 ? chars[randInt(chars.length)] : c)).join(''), 0); }, 34);
    } else out.innerHTML = html;
    out.setAttribute('aria-label', r.text);
    $('#p-strength').innerHTML = `<div class="sec-bars is-${s.tone}" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= s.level ? 'on' : ''}"></span>`).join('')}</div>
      <span class="sec-strength__label is-${s.tone}">${esc(s.label)}</span><span class="sec-strength__sub">${s.bits} bits · ${s.pin ? 'only safe where wrong tries lock you out (phones, cards)' : (/^longer/.test(s.crack) ? `would take ${esc(s.crack)} to crack` : `~${esc(s.crack)} to crack offline`)}</span>`;
    const copy = $('#p-copy'); if (!copy.classList.contains('is-copied')) copy.innerHTML = `${icon('copy')}<span>Copy</span>`;
    // more than one (today's "Number of results")
    const L = $('#p-list');
    if (S.count > 1) {
      cur.list = [r.text, ...Array.from({ length: S.count - 1 }, () => one().text)];
      L.innerHTML = `<section class="sec-pane sec-plist"><div class="sec-pane__head"><span class="sec-pane__label">${S.count} ${pw ? 'passwords' : 'passphrases'}</span><span class="fw-spacer"></span><button class="fw-btn fw-btn--sm" type="button" id="p-copyall">${icon('copy')}<span>Copy all</span></button></div>
        <ol class="sec-plist__rows">${cur.list.map((p, i) => `<li><span class="fw-mono">${pw ? charHtml(p, 0) : esc(p)}</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-secret="${i}" aria-label="Copy ${i + 1}" data-tip="Copy">${icon('copy')}</button></li>`).join('')}</ol></section>`;
      enhance(L);
      $$('[data-secret]', L).forEach((b) => b.onclick = () => copySecret(cur.list[+b.dataset.secret], null));
      $('#p-copyall').onclick = (e) => copySecret(cur.list.join('\n'), e.currentTarget, { label: 'Copy all' });
    } else { L.innerHTML = ''; cur.list = []; }
    setBar({ line: `${s.label} · ${s.bits} bits`, sub: pw ? `${r.text.length} characters` : `${S.ph.words} words`, actions: [
      { label: 'New', icon: 'refresh-cw', iconOnly: true, onClick: () => regen(true) },
      { label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copySecret(cur.text, b, { label: 'Copy' }) }] });
  }

  api = { regen: () => regen(true), mode: (m) => { S.mode = m; S.save(); $$('#p-mode .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m))); renderControls(); renderMore(); regen(); } };
  renderControls(); renderMore(); regen();
  return { onPasteText: () => false };
}
