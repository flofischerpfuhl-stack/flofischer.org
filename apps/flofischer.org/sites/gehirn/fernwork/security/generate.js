// Developer ▸ Generate: one great password (1Password-style), passphrases, UUID v4/v7 in bulk. crypto.getRandomValues only.
import { icon, esc, $, $$, h, enhance, copyText, toast, store, isTyping, hasLayers, kbd } from '../kit/shell.js';
import { copySecret, setBar, humanDuration, isCoarse } from './util.js';
import { WORDS } from './words.js';

// ───────────── randomness ─────────────
const rnd32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
/** Unbiased integer in [0, n) by rejection sampling. */
export function randInt(n) { const lim = Math.floor(0x100000000 / n) * n; let x; do { x = rnd32(); } while (x >= lim); return x % n; }

// ───────────── UUIDs ─────────────
export const uuidv4 = () => crypto.randomUUID();
let lastMs = -1, seq = 0;
/** RFC 9562 UUIDv7. Within one millisecond a 12-bit counter in rand_a keeps IDs strictly increasing (method 1). */
export function uuidv7(at) {
  let ms = at ?? Date.now();
  if (at == null) {
    if (ms <= lastMs) { ms = lastMs; seq++; if (seq > 0xfff) { ms = ++lastMs; seq = randInt(0x400); } }
    else { seq = randInt(0x400); }
    lastMs = ms;
  } else seq = randInt(0x1000);
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = ms; for (let i = 5; i >= 0; i--) { b[i] = t % 256; t = Math.floor(t / 256); }
  b[6] = 0x70 | (seq >> 8); b[7] = seq & 0xff; b[8] = (b[8] & 0x3f) | 0x80;
  const hx = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hx.slice(0, 8)}-${hx.slice(8, 12)}-${hx.slice(12, 16)}-${hx.slice(16, 20)}-${hx.slice(20)}`;
}

// ───────────── passwords ─────────────
const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!#$%&*+-=?@^_~.:/' };
const LOOKALIKE = /[O0oIl1|]/g;
const PRESETS = {
  strong: { label: 'Strong', length: 20, upper: true, lower: true, digits: true, symbols: true, avoid: false },
  readable: { label: 'Readable', length: 16, upper: true, lower: true, digits: true, symbols: false, avoid: true },
  wifi: { label: 'Wi-Fi', length: 20, upper: false, lower: true, digits: true, symbols: false, avoid: true },
  pin: { label: 'PIN', length: 6, upper: false, lower: false, digits: true, symbols: false, avoid: false },
};
const PRESET_HINT = { strong: 'Everything, 20 characters', readable: 'No symbols or look-alikes, read aloud easily', wifi: 'Lowercase and digits, easy on a TV remote', pin: '6 digits' };
function pool(o) {
  const sets = ['upper', 'lower', 'digits', 'symbols'].filter((k) => o[k]).map((k) => {
    let s = SETS[k]; if (o.avoid) s = s.replace(LOOKALIKE, ''); if (o.exclude) s = [...s].filter((c) => !o.exclude.includes(c)).join(''); return s;
  }).filter(Boolean);
  return { sets, all: sets.join('') };
}
export function makePassword(o) {
  const { sets, all } = pool(o); if (!all) return '';
  for (let tries = 0; tries < 200; tries++) {
    let s = ''; for (let i = 0; i < o.length; i++) s += all[randInt(all.length)];
    // require one of each chosen set when the length allows (rejection keeps it unbiased among valid passwords)
    if (o.length < sets.length || sets.every((set) => [...s].some((c) => set.includes(c)))) return s;
  }
  return '';
}
const presetOf = (o) => Object.keys(PRESETS).find((k) => ['length', 'upper', 'lower', 'digits', 'symbols', 'avoid'].every((f) => PRESETS[k][f] === o[f]) && !o.exclude) || 'custom';
function strength(bits, mode) {
  const tiers = [[28, 'Weak', 'bad'], [50, 'Fair', 'warn'], [70, 'Good', 'ok'], [100, 'Strong', 'ok'], [Infinity, 'Very strong', 'ok']];
  const i = tiers.findIndex(([t]) => bits < t);
  const secs = Math.pow(2, bits - 1) / 1e10;
  return { level: i + 1, label: tiers[i][1], tone: tiers[i][2], bits: Math.round(bits), crack: humanDuration(secs), pinNote: mode === 'pin' };
}

// ───────────── passphrase ─────────────
function makePhrase(o) {
  const words = []; for (let i = 0; i < o.words; i++) { let w = WORDS[randInt(WORDS.length)]; if (o.cap) w = w[0].toUpperCase() + w.slice(1); words.push(w); }
  if (o.number) { const i = randInt(words.length); words[i] += randInt(10); }
  return { words, text: words.join(o.sep) };
}

// ───────────── state ─────────────
const DEF = { mode: 'password', pw: { ...PRESETS.strong, exclude: '', many: false }, ph: { words: 5, sep: '-', cap: false, number: false }, uu: { ver: 'v7', count: 1, fmt: 'lower' } };
const S = Object.assign(structuredClone(DEF), store.get('dev:gen') || {});
const save = () => store.set('dev:gen', { mode: S.mode, pw: S.pw, ph: S.ph, uu: S.uu });
let ctx, current = { text: '', list: [] };

export async function mount(c) {
  ctx = c;
  if (c.leaf.id === 'uuid-generator') S.mode = 'uuid';
  if (c.leaf.id === 'password-generator' && S.mode === 'uuid') S.mode = 'password';
  ctx.renderHeader({ aside: `<span class="gen-hint fw-hide-mobile sec-hide-coarse">${kbd('r')} new · ${kbd('mod+shift+c')} copy</span>` });
  ctx.root.innerHTML = `<div class="gen">
    <div class="fw-seg gen-modes" aria-label="What to generate">${[['password', 'Password'], ['phrase', 'Passphrase'], ['uuid', 'UUID']].map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${v}" aria-checked="${S.mode === v}">${l}</button>`).join('')}</div>
    <div id="gen-body"></div></div>`;
  enhance(ctx.root);
  $('.gen-modes').addEventListener('fw-change', (e) => { S.mode = e.detail.value; save(); render(); });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || isTyping() || hasLayers()) return;
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); regenerate(true); }
    if (e.key.toLowerCase() === 'c' && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); $('#gen-copy')?.click(); }
  });
  ctx.hooks.onPaste = () => false;
  render();
}

function render() {
  const b = $('#gen-body');
  if (S.mode === 'uuid') return renderUuid(b);
  const pw = S.mode === 'password';
  b.innerHTML = `<section class="gen-hero" aria-label="${pw ? 'Password' : 'Passphrase'}">
      <div class="gen-out" id="gen-out" aria-live="polite" aria-atomic="true"></div>
      <div class="gen-actions">
        <button class="fw-iconbtn fw-iconbtn--outline gen-regen" type="button" id="gen-regen" aria-label="New ${pw ? 'password' : 'passphrase'}" data-tip="New ${pw ? 'password' : 'passphrase'}" data-tip-kbd="r">${icon('refresh-cw', { size: 20 })}</button>
        <button class="fw-btn fw-btn--primary fw-btn--lg gen-copy" type="button" id="gen-copy">${icon('copy')}<span>Copy</span></button>
      </div>
      <div class="gen-strength" id="gen-strength"></div>
    </section>
    <section class="fw-card gen-controls" id="gen-controls">${pw ? pwControls() : phControls()}</section>
    <p class="gen-foot">${icon('lock', { size: 12 })} Made on this device with your browser’s secure random generator. Nothing is saved except your settings. Copied ${pw ? 'passwords' : 'passphrases'} are wiped from the clipboard after 60 s.</p>`;
  enhance(b);
  $('#gen-regen').onclick = () => regenerate(true);
  $('#gen-copy').onclick = (e) => copySecret(current.text, e.currentTarget);
  wireControls();
  regenerate(false);
}

function pwControls() {
  const o = S.pw; const p = presetOf(o); const pin = p === 'pin';
  return `<div class="gen-row gen-row--len">
      <span class="gen-label" id="len-l">Length</span>
      <div class="fw-stepper gen-stepper" role="group" aria-labelledby="len-l"><button class="fw-iconbtn" type="button" data-step="-1" aria-label="Shorter">${icon('minus')}</button><output id="len-v" class="fw-num">${o.length}</output><button class="fw-iconbtn" type="button" data-step="1" aria-label="Longer">${icon('plus')}</button></div>
      <input class="gen-range" type="range" id="len" min="${pin ? 4 : 8}" max="${pin ? 12 : 64}" value="${o.length}" aria-labelledby="len-l" style="--p:${((o.length - (pin ? 4 : 8)) / ((pin ? 12 : 64) - (pin ? 4 : 8))) * 100}%">
    </div>
    <div class="gen-row">
      <span class="gen-label">Characters</span>
      <div class="gen-sets" role="group" aria-label="Character sets">${[['upper', 'A–Z'], ['lower', 'a–z'], ['digits', '0–9'], ['symbols', '!#$']].map(([k, l]) => `<button class="fw-chip gen-set" type="button" data-set="${k}" aria-pressed="${o[k]}">${o[k] ? icon('check', { size: 14 }) : ''}${l}</button>`).join('')}</div>
      <label class="fw-toggle gen-toggle"><input type="checkbox" id="avoid" ${o.avoid ? 'checked' : ''}>Avoid look-alikes <span class="fw-mono fw-faint">0 O 1 l I</span></label>
    </div>
    <div class="gen-row">
      <span class="gen-label">Preset</span>
      <div class="gen-presets" role="group" aria-label="Presets">${Object.entries(PRESETS).map(([k, v]) => `<button class="fw-chip" type="button" data-preset="${k}" aria-pressed="${p === k}" data-tip="${esc(PRESET_HINT[k])}">${esc(v.label)}</button>`).join('')}${p === 'custom' ? '<span class="fw-chip is-active" aria-current="true">Custom</span>' : ''}</div>
      <span class="gen-remember fw-faint fw-t-xs">Settings remembered on this device</span>
    </div>
    <details class="gen-more" ${o.exclude || o.many ? 'open' : ''}><summary>${icon('chevron-right', { size: 14 })}More options</summary>
      <div class="gen-more__body">
        <label class="fw-field"><span class="fw-field__label">Never use these characters</span><input class="fw-input fw-input--mono" id="excl" value="${esc(o.exclude || '')}" placeholder="e.g. %&lt;&gt;" autocomplete="off" spellcheck="false"></label>
        <label class="fw-toggle gen-toggle"><input type="checkbox" id="many" ${o.many ? 'checked' : ''}>Show 5 more to pick from</label>
      </div>
    </details>
    <div id="gen-many"></div>`;
}
function phControls() {
  const o = S.ph;
  return `<div class="gen-row gen-row--len">
      <span class="gen-label" id="len-l">Words</span>
      <div class="fw-stepper gen-stepper" role="group" aria-labelledby="len-l"><button class="fw-iconbtn" type="button" data-step="-1" aria-label="Fewer words">${icon('minus')}</button><output id="len-v" class="fw-num">${o.words}</output><button class="fw-iconbtn" type="button" data-step="1" aria-label="More words">${icon('plus')}</button></div>
      <input class="gen-range" type="range" id="len" min="3" max="10" value="${o.words}" aria-labelledby="len-l" style="--p:${((o.words - 3) / 7) * 100}%">
    </div>
    <div class="gen-row"><span class="gen-label">Separator</span>
      <div class="fw-seg fw-seg--sm gen-sep" aria-label="Separator">${[['-', 'Hyphen -'], [' ', 'Space'], ['.', 'Dot .'], ['_', 'Underscore _']].map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${esc(v)}" aria-checked="${o.sep === v}">${esc(l)}</button>`).join('')}</div></div>
    <div class="gen-row"><span class="gen-label">Extras</span>
      <label class="fw-toggle gen-toggle"><input type="checkbox" id="cap" ${o.cap ? 'checked' : ''}>Capitalise words</label>
      <label class="fw-toggle gen-toggle"><input type="checkbox" id="num" ${o.number ? 'checked' : ''}>Add a digit</label>
      <span class="gen-remember fw-faint fw-t-xs">${WORDS.length.toLocaleString('en-US')}-word list · settings remembered</span></div>`;
}
function wireControls() {
  const pw = S.mode === 'password'; const o = pw ? S.pw : S.ph; const key = pw ? 'length' : 'words';
  const r = $('#len');
  const setLen = (n, live = true) => {
    n = Math.max(+r.min, Math.min(+r.max, n)); o[key] = n; $('#len-v').textContent = n; r.value = n;
    r.style.setProperty('--p', ((n - r.min) / (r.max - r.min)) * 100 + '%'); save(); if (pw) syncPresetChips(); if (live) regenerate(false);
  };
  r.addEventListener('input', () => setLen(+r.value));
  $$('[data-step]').forEach((b) => b.onclick = () => setLen(o[key] + +b.dataset.step));
  if (pw) {
    $$('[data-set]').forEach((b) => b.onclick = () => {
      const k = b.dataset.set; const on = !o[k];
      if (!on && ['upper', 'lower', 'digits', 'symbols'].filter((x) => o[x]).length === 1) { toast('Keep at least one kind of character', { type: 'info' }); return; }
      o[k] = on; save(); refreshControls();
    });
    $('#avoid').onchange = (e) => { o.avoid = e.target.checked; save(); syncPresetChips(); regenerate(false); };
    $$('[data-preset]').forEach((b) => b.onclick = () => { Object.assign(o, PRESETS[b.dataset.preset], { exclude: '' }); delete o.label; save(); refreshControls(); });
    $('#excl').addEventListener('input', (e) => { o.exclude = e.target.value; save(); syncPresetChips(); regenerate(false); });
    $('#many').onchange = (e) => { o.many = e.target.checked; save(); regenerate(false); };
  } else {
    $('.gen-sep').addEventListener('fw-change', (e) => { o.sep = e.detail.value; save(); regenerate(false); });
    $('#cap').onchange = (e) => { o.cap = e.target.checked; save(); regenerate(false); };
    $('#num').onchange = (e) => { o.number = e.target.checked; save(); regenerate(false); };
  }
}
function refreshControls() { const det = $('.gen-more')?.open; $('#gen-controls').innerHTML = pwControls(); if (det) $('.gen-more').open = true; enhance($('#gen-controls')); wireControls(); regenerate(false); }
function syncPresetChips() {
  const p = presetOf(S.pw);
  $$('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(p === b.dataset.preset)));
  const row = $('.gen-presets'); const cust = row.querySelector('.is-active');
  if (p === 'custom' && !cust) row.insertAdjacentHTML('beforeend', '<span class="fw-chip is-active" aria-current="true">Custom</span>');
  if (p !== 'custom' && cust) cust.remove();
  $$('[data-set]').forEach((b) => { const on = S.pw[b.dataset.set]; b.setAttribute('aria-pressed', String(on)); b.innerHTML = `${on ? icon('check', { size: 14 }) : ''}${b.textContent}`; });
}

function charHtml(s, group) {
  let out = ''; let i = 0;
  for (const c of s) {
    const k = /[A-Z]/.test(c) ? 'u' : /[a-z]/.test(c) ? 'l' : /\d/.test(c) ? 'd' : 's';
    if (group && i && i % group === 0) out += '<span class="gen-gap" aria-hidden="true"></span>';
    out += `<span class="c-${k}">${esc(c)}</span>`; i++;
  }
  return out;
}
let scrambleT = 0;
function regenerate(animate) {
  if (S.mode === 'uuid') return genUuids();
  const out = $('#gen-out'); if (!out) return;
  const pw = S.mode === 'password';
  let text, html, bits;
  if (pw) {
    const o = S.pw; text = makePassword(o); const P = pool(o).all.length; bits = o.length * Math.log2(Math.max(P, 1));
    const p = presetOf(o); const group = p === 'readable' || p === 'wifi' ? 4 : p === 'pin' ? 3 : 0;
    html = charHtml(text, group);
    out.classList.toggle('is-long', o.length > 28); out.classList.toggle('is-pin', p === 'pin');
  } else {
    const o = S.ph; const r = makePhrase(o); text = r.text; bits = o.words * Math.log2(WORDS.length) + (o.number ? Math.log2(10 * o.words) : 0);
    html = r.words.map((w) => `<span class="gen-word">${esc(w)}</span>`).join(`<span class="gen-sepch">${esc(o.sep === ' ' ? '·' : o.sep)}</span>`);
    out.classList.remove('is-long', 'is-pin');
  }
  current.text = text;
  const st = strength(bits, pw && presetOf(S.pw) === 'pin' ? 'pin' : '');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  clearInterval(scrambleT);
  if (animate && !reduce) {
    let n = 0; const chars = SETS.upper + SETS.lower + SETS.digits;
    scrambleT = setInterval(() => {
      if (++n > 5) { clearInterval(scrambleT); out.innerHTML = html; return; }
      out.innerHTML = charHtml([...text].map((c) => (/\w/.test(c) && Math.random() < 0.7 ? chars[randInt(chars.length)] : c)).join(''), 0);
    }, 34);
  } else out.innerHTML = html;
  out.setAttribute('aria-label', text);
  $('#gen-strength').innerHTML = `<div class="gen-bars is-${st.tone}" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= st.level ? 'on' : ''}"></span>`).join('')}</div>
    <span class="gen-strength__label is-${st.tone}">${esc(st.label)}</span><span class="gen-strength__sub">${st.bits} bits · ${st.pinNote ? 'only safe where wrong tries lock you out (phones, cards)' : `~${esc(st.crack)} to crack offline`}</span>`;
  const copyBtn = $('#gen-copy'); if (copyBtn && !copyBtn.classList.contains('is-copied')) copyBtn.innerHTML = `${icon('copy')}<span>Copy</span>`;
  if (pw && S.pw.many) {
    const list = Array.from({ length: 5 }, () => makePassword(S.pw));
    $('#gen-many').innerHTML = `<div class="gen-many">${list.map((p) => `<div class="gen-many__row"><span class="fw-mono">${charHtml(p, 0)}</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-secret="${esc(p)}" aria-label="Copy" data-tip="Copy">${icon('copy')}</button></div>`).join('')}</div>`;
    $$('[data-secret]').forEach((b) => b.onclick = () => copySecret(b.dataset.secret, null).then(() => toast('Copied · clears in 60 s', { type: 'success' })));
  } else if ($('#gen-many')) $('#gen-many').innerHTML = '';
  setBar({ line: `${st.label} · ${st.bits} bits`, sub: pw ? `${text.length} characters` : `${S.ph.words} words`, actions: [
    { label: 'New', icon: 'refresh-cw', iconOnly: true, onClick: () => regenerate(true) },
    { label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copySecret(current.text, b) }] });
}

// ───────────── UUID mode ─────────────
const FMT = [['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['nohyph', 'no hyphens'], ['braces', '{braces}'], ['quoted', '"quoted",'], ['json', 'JSON array']];
const COUNTS = [1, 10, 100, 10000];
function fmtOne(u, f) { return f === 'upper' ? u.toUpperCase() : f === 'nohyph' ? u.replace(/-/g, '') : f === 'braces' ? `{${u}}` : u; }
function lines() {
  const f = S.uu.fmt; const L = current.list; const n = L.length;
  if (f === 'json') return { n: n + 2, at: (i) => (i === 0 ? '[' : i === n + 1 ? ']' : `  "${L[i - 1]}"${i < n ? ',' : ''}`) };
  if (f === 'quoted') return { n, at: (i) => `"${L[i]}"${i < n - 1 ? ',' : ''}` };
  return { n, at: (i) => fmtOne(L[i], f) };
}
const allText = () => { const l = lines(); let s = ''; for (let i = 0; i < l.n; i++) s += l.at(i) + '\n'; return s; };
function renderUuid(b) {
  const o = S.uu;
  b.innerHTML = `<section class="fw-card gen-controls gen-uu-controls">
      <div class="gen-row"><span class="gen-label">Version</span>
        <div class="fw-seg fw-seg--sm" id="uu-ver" aria-label="UUID version"><button class="fw-seg__opt" type="button" data-value="v7" aria-checked="${o.ver === 'v7'}">v7 · time-ordered</button><button class="fw-seg__opt" type="button" data-value="v4" aria-checked="${o.ver === 'v4'}">v4 · random</button></div>
        <span class="fw-faint fw-t-sm gen-uu-why">${o.ver === 'v7' ? 'Sorts by creation time, good for database keys.' : '122 random bits, no time inside.'}</span></div>
      <div class="gen-row"><span class="gen-label" id="cnt-l">How many</span>
        <div class="gen-presets" role="group" aria-labelledby="cnt-l">${COUNTS.map((c) => `<button class="fw-chip" type="button" data-count="${c}" aria-pressed="${o.count === c}">${c.toLocaleString('en-US')}</button>`).join('')}</div>
        <label class="gen-count"><span class="fw-sr">Exact count</span><input class="fw-input fw-num" id="uu-count" type="number" min="1" max="100000" value="${o.count}" inputmode="numeric"></label>
        <span class="fw-faint fw-t-xs">up to 100,000</span></div>
      <div class="gen-row"><span class="gen-label">Format</span>
        <div class="gen-presets gen-fmt" role="group" aria-label="Format">${FMT.map(([v, l]) => `<button class="fw-chip fw-mono" type="button" data-fmt="${v}" aria-pressed="${o.fmt === v}">${esc(l)}</button>`).join('')}</div></div>
    </section>
    <div id="uu-out"></div>`;
  enhance(b);
  $('#uu-ver').addEventListener('fw-change', (e) => { o.ver = e.detail.value; save(); renderUuid(b); });
  $$('[data-count]').forEach((x) => x.onclick = () => { o.count = +x.dataset.count; save(); $('#uu-count').value = o.count; $$('[data-count]').forEach((y) => y.setAttribute('aria-pressed', String(y === x))); genUuids(); });
  $('#uu-count').addEventListener('input', (e) => { const n = Math.max(1, Math.min(100000, Math.floor(+e.target.value || 1))); o.count = n; save(); $$('[data-count]').forEach((y) => y.setAttribute('aria-pressed', String(+y.dataset.count === n))); clearTimeout(S.ct); S.ct = setTimeout(genUuids, 150); });
  $$('[data-fmt]').forEach((x) => x.onclick = () => { o.fmt = x.dataset.fmt; save(); $$('[data-fmt]').forEach((y) => y.setAttribute('aria-pressed', String(y === x))); paintUuids(); });
  genUuids();
}
function genUuids() {
  const o = S.uu; const t0 = performance.now();
  const L = new Array(o.count);
  for (let i = 0; i < o.count; i++) L[i] = o.ver === 'v7' ? uuidv7() : uuidv4();
  current.list = L; current.ms = performance.now() - t0;
  paintUuids();
}
function paintUuids() {
  const o = S.uu; const out = $('#uu-out'); if (!out) return;
  const one = current.list.length === 1;
  const fileExt = o.fmt === 'json' ? 'json' : 'txt';
  const text = one ? fmtOne(current.list[0], o.fmt === 'json' || o.fmt === 'quoted' ? 'lower' : o.fmt) : null;
  const size = one ? 0 : new Blob([allText()]).size;
  if (one) {
    out.innerHTML = `<section class="gen-hero gen-hero--uuid">
        <div class="gen-out gen-out--uuid fw-mono" id="gen-out">${esc(o.fmt === 'json' ? `["${current.list[0]}"]` : o.fmt === 'quoted' ? `"${current.list[0]}"` : text)}</div>
        <div class="gen-actions"><button class="fw-iconbtn fw-iconbtn--outline gen-regen" type="button" id="gen-regen" aria-label="New UUID" data-tip="New UUID" data-tip-kbd="r">${icon('refresh-cw', { size: 20 })}</button>
        <button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="gen-copy">${icon('copy')}<span>Copy</span></button></div>
        <div class="gen-strength"><span class="fw-badge">${o.ver === 'v7' ? `v7 · ${new Date().toLocaleTimeString('en-GB')}` : 'v4 · random'}</span><a class="fw-t-sm" href="./?leaf=inspect&q=${current.list[0]}">Inspect it ${icon('arrow-right', { size: 12 })}</a></div>
      </section>`;
  } else {
    out.innerHTML = `<section class="fw-card gen-list">
        <div class="gen-list__head"><div><b>${current.list.length.toLocaleString('en-US')} UUIDs</b> <span class="fw-faint">· ${o.ver}${o.ver === 'v7' ? ' · sorted by creation time' : ''} · ${(size / 1024).toFixed(size > 102400 ? 0 : 1)} KB · made in ${Math.max(1, Math.round(current.ms))} ms</span></div>
          <span class="fw-spacer"></span>
          <button class="fw-iconbtn gen-regen" type="button" id="gen-regen" aria-label="New UUIDs" data-tip="New UUIDs" data-tip-kbd="r">${icon('refresh-cw', { size: 18 })}</button>
          <button class="fw-btn" type="button" id="gen-copy">${icon('copy')}<span>Copy all</span></button>
          <button class="fw-btn fw-btn--primary" type="button" id="gen-dl">${icon('download')}<span>Download .${fileExt}</span></button></div>
        <div class="gen-vlist" id="gen-vlist" tabindex="0" role="region" aria-label="Generated UUIDs"><div class="gen-vlist__spacer"></div><div class="gen-vlist__rows"></div></div>
      </section>`;
    const vl = $('#gen-vlist'); const ls = lines(); const RH = 24;
    vl.querySelector('.gen-vlist__spacer').style.height = ls.n * RH + 'px';
    const draw = () => {
      const top = vl.scrollTop; const first = Math.max(0, Math.floor(top / RH) - 5); const last = Math.min(ls.n, first + Math.ceil(vl.clientHeight / RH) + 10);
      let html = ''; for (let i = first; i < last; i++) html += `<div class="gen-vlist__row" style="top:${i * RH}px"><span class="gen-vlist__n">${i + 1}</span>${esc(ls.at(i))}</div>`;
      vl.querySelector('.gen-vlist__rows').innerHTML = html;
    };
    vl.addEventListener('scroll', draw, { passive: true }); draw();
    $('#gen-dl').onclick = (e) => {
      const blob = new Blob([allText()], { type: o.fmt === 'json' ? 'application/json' : 'text/plain' });
      const a = h(`<a download="uuids-${o.ver}-${current.list.length}.${fileExt}"></a>`); a.href = URL.createObjectURL(blob); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      const btn = e.currentTarget; btn.innerHTML = `${icon('check')}<span>Saved uuids-${o.ver}-${current.list.length}.${fileExt}</span>`; btn.classList.add('is-copied');
      setTimeout(() => { btn.innerHTML = `${icon('download')}<span>Download .${fileExt}</span>`; btn.classList.remove('is-copied'); }, 2200);
    };
  }
  enhance(out);
  $('#gen-regen').onclick = () => genUuids();
  $('#gen-copy').onclick = (e) => copyText(one ? $('#gen-out').textContent : allText(), e.currentTarget);
  setBar({ line: one ? current.list[0] : `${current.list.length.toLocaleString('en-US')} UUIDs · ${o.ver}`, actions: [
    { label: 'New', icon: 'refresh-cw', iconOnly: true, onClick: () => genUuids() },
    one ? { label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyText($('#gen-out').textContent, b) } : { label: 'Download', icon: 'download', primary: true, onClick: () => $('#gen-dl').click() }] });
}
