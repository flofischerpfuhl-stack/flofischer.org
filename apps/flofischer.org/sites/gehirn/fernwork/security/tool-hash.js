// Hash Generator (+ preset "SHA-256 checksum"): text or files → MD5, SHA-1, SHA-256, SHA-384, SHA-512.
// "Expected checksum" takes what people copy (hex, sha256sum/BSD/PowerShell/certutil lines, SRI, whole SHA256SUMS files),
// detects the algorithm from the tag or length and shows a big Match / No match. Files stream through a Worker (hash-wasm)
// with progress; text uses Web Crypto (+ MD5 from hash-wasm).
import { openMenu } from '../kit/shell.js';
import { icon, esc, $, $$, enhance, toast, copyText, isCoarse, settings, seg, moreBtn, wireMore, pane, iconBtn, setBar, download, pickFile, fmtBytes, debounce, readClipboard, autoGrow } from './ui.js';
import { parseSums, describeSums, LEGACY } from './sums.js';
import { toHex, utf8Bytes } from './codec.js';

const ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
let api = {};
export const config = {
  accept: ['*'],
  commands: [
    { id: 'h-file', label: 'Hash a file', icon: 'file', syn: ['checksum file', 'open file'], run: () => api.pick?.() },
    { id: 'h-text', label: 'Hash text', icon: 'type', run: () => api.mode?.('text') },
    { id: 'h-expect', label: 'Paste expected checksum', icon: 'clipboard-paste', syn: ['verify', 'compare'], run: () => api.pasteExpected?.() },
  ],
};

export async function mount(root, { id, params }) {
  const S = settings('hash', { mode: 'text', eol: 'lf', nl: false, upper: false });
  if (id === 'sha256-checksum') S.mode = 'file';
  const st = { text: '', expected: '', parsed: { entries: [], bad: [] }, items: [], textHashes: null, textBytes: 0, run: 0 };
  let uid = 0, worker = null, busy = false; const queue = [];

  root.innerHTML = `
    <div class="sec-toolbar">
      ${seg('h-mode', 'What to hash', [['text', 'Text', 'type'], ['file', 'File', 'file']], S.mode)}
      <span class="fw-spacer"></span>${moreBtn('h-more')}
    </div>
    <div class="sec-more" id="h-more-panel" hidden>
      <div class="sec-more__row" data-only="text"><span class="sec-more__label">Line endings</span>${seg('h-eol', 'Line endings', [['lf', 'LF (macOS, Linux)'], ['crlf', 'CRLF (Windows)']], S.eol, { sm: true })}</div>
      <label class="fw-toggle" data-only="text"><input type="checkbox" id="h-nl" ${S.nl ? 'checked' : ''}>Add a trailing newline <span class="fw-faint">(like echo)</span></label>
      <label class="fw-toggle"><input type="checkbox" id="h-upper" ${S.upper ? 'checked' : ''}>Uppercase hex</label>
    </div>
    <div id="h-in"></div>
    <div class="sec-expect">
      <label class="sec-expect__label" for="h-exp">Expected checksum <span class="fw-faint">optional</span></label>
      <div class="sec-expect__box">
        <textarea class="fw-input fw-input--mono sec-expect__field" id="h-exp" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Paste the checksum from the download page"></textarea>
        <span class="sec-expect__actions">${iconBtn('h-exp-paste', 'clipboard-paste', 'Paste')}${iconBtn('h-exp-clear', 'x', 'Clear', 'hidden')}</span>
      </div>
      <div class="sec-expect__meta" id="h-exp-meta"></div>
    </div>
    <div id="h-verdict" aria-live="polite"></div>
    <div id="h-out"></div>`;
  enhance(root);
  const exp = $('#h-exp'); const growExp = autoGrow(exp, { max: 180 });
  wireMore($('#h-more'), $('#h-more-panel'));
  $('#h-mode').addEventListener('fw-change', (e) => setMode(e.detail.value));
  $('#h-eol').addEventListener('fw-change', (e) => { S.eol = e.detail.value; S.save(); hashText(); });
  $('#h-nl').onchange = (e) => { S.nl = e.target.checked; S.save(); hashText(); };
  $('#h-upper').onchange = (e) => { S.upper = e.target.checked; S.save(); renderAll(); };
  exp.addEventListener('input', () => { st.expected = exp.value; onExpected(); });
  $('#h-exp-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setExpected(t); };
  $('#h-exp-clear').onclick = () => { const old = st.expected; setExpected(''); exp.focus(); toast('Expected checksum cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setExpected(old) } }); };

  const hx = (v) => (S.upper ? v.toUpperCase() : v);

  // ───────── input ─────────
  function setMode(m) {
    S.mode = m; if (id !== 'sha256-checksum') S.save();
    $$('#h-mode .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m)));
    $$('[data-only="text"]', root).forEach((el) => { el.hidden = m !== 'text'; });
    renderInput(); renderAll();
    if (m === 'text' && !isCoarse()) $('#h-text')?.focus();
  }
  function renderInput() {
    const box = $('#h-in');
    if (S.mode === 'text') {
      box.innerHTML = pane({ label: 'Text', labelFor: 'h-text', actions: iconBtn('h-paste', 'clipboard-paste', 'Paste') + iconBtn('h-clear', 'x', 'Clear'),
        body: `<textarea class="sec-area fw-input--mono" id="h-text" rows="4" spellcheck="false" autocomplete="off" placeholder="Type or paste text">${esc(st.text)}</textarea>` });
      enhance(box);
      const ta = $('#h-text'); autoGrow(ta, { max: 360 });
      ta.addEventListener('input', () => { st.text = ta.value; schedule(); });
      $('#h-paste').onclick = async () => { const t = await readClipboard(); if (t != null) { ta.value = t; st.text = t; ta.dispatchEvent(new Event('input')); } };
      $('#h-clear').onclick = () => { const old = st.text; ta.value = ''; st.text = ''; ta.dispatchEvent(new Event('input')); ta.focus(); if (old) toast('Text cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { ta.value = old; ta.dispatchEvent(new Event('input')); } } }); };
      hashText();
      return;
    }
    const slim = st.items.length > 0;
    box.innerHTML = slim
      ? `<div class="fw-intake fw-intake--slim" data-intake aria-label="Add more files"><span class="fw-intake__icon">${icon('plus', { size: 18 })}</span><span class="fw-intake__title">Add files</span><span class="fw-intake__sub fw-hide-mobile">or drop a SHA256SUMS file</span></div>`
      : `<div class="fw-intake" data-intake aria-label="Choose files to hash">
          <span class="fw-intake__icon">${icon('fingerprint', { size: 22 })}</span>
          <span class="fw-intake__title"><span class="fw-pointer-copy">Drop files to hash</span><span class="fw-touch-copy">Choose files to hash</span></span>
          <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" data-pick>${icon('folder-open')}Choose files</button></span>
          <span class="fw-intake__sub">Any size, several at once. A SHA256SUMS file fills in the expected checksums.</span>
          <span class="fw-intake__samples"><a href="#" class="fw-chip fw-chip--sample" data-sample="./samples/fernwork-2.4.0.tar.gz">fernwork-2.4.0.tar.gz</a><a href="#" class="fw-chip fw-chip--sample" data-sample="./samples/SHA256SUMS|./samples/fernwork-2.4.0.tar.gz|./samples/fernwork-2.4.0-arm64.AppImage|./samples/fernwork-2.4.0-setup.exe">SHA256SUMS + 3 files</a></span>
        </div>`;
    enhance(box);
  }

  // ───────── text hashing ─────────
  let md5Ready = null;
  const loadMd5 = () => md5Ready ||= new Promise((ok, bad) => { const s = document.createElement('script'); s.src = './vendor/hash-wasm/md5.umd.min.js'; s.onload = ok; s.onerror = bad; document.head.append(s); });
  async function digest(algo, bytes) {
    if (algo === 'MD5') { await loadMd5(); return window.hashwasm.md5(bytes); }
    return toHex(new Uint8Array(await crypto.subtle.digest(algo, bytes)));
  }
  const textBytes = (nl = S.nl) => { let t = st.text.replace(/\r\n/g, '\n'); if (S.eol === 'crlf') t = t.replace(/\n/g, '\r\n'); if (nl) t += S.eol === 'crlf' ? '\r\n' : '\n'; return utf8Bytes(t); };
  const schedule = debounce(() => hashText(), 60);
  async function hashText() {
    if (S.mode !== 'text') return;
    const run = ++st.run;
    if (!st.text && !S.nl) { st.textHashes = null; st.alt = null; renderAll(); return; }
    const bytes = textBytes();
    const out = {}; for (const a of ALGOS) out[a] = await digest(a, bytes);
    // would it match with/without a trailing newline? (echo adds one; a common reason for "no match")
    const e = textEntry(); let alt = null;
    if (e && out[e.algo] !== e.hash && st.text) { const other = await digest(e.algo, textBytes(!S.nl)); if (other === e.hash) alt = !S.nl; }
    if (run !== st.run) return;
    st.textHashes = out; st.textBytes = bytes.length; st.alt = alt; renderAll();
  }
  const textEntry = () => { const E = st.parsed.entries; return E.length === 1 ? E[0] : E.length && !E.some((x) => x.name) ? E[0] : null; };

  // ───────── expected checksum ─────────
  function setExpected(v) { exp.value = v; st.expected = v; growExp(); onExpected(); }
  function onExpected() {
    st.parsed = parseSums(st.expected);
    const p = st.parsed; const meta = $('#h-exp-meta');
    $('#h-exp-clear').hidden = !st.expected; $('#h-exp-paste').hidden = !!st.expected;
    if (!st.expected.trim()) meta.innerHTML = '<span class="fw-faint">Hex, a sha256sum line or a whole SHA256SUMS file. The algorithm is detected.</span>';
    else if (!p.entries.length) {
      const compact = st.expected.replace(/[\s:]/g, '');
      const why = /^[0-9a-f]+$/i.test(compact) ? `${compact.length} hex characters isn’t a checksum length (MD5 32 · SHA-1 40 · SHA-256 64 · SHA-384 96 · SHA-512 128).` : 'That doesn’t look like a checksum. Paste the hex string, a sha256sum line or a SHA256SUMS file.';
      meta.innerHTML = `<span class="sec-err">${icon('circle-alert', { size: 14 })}${esc(why)}</span>`;
    } else {
      const legacy = [...new Set(p.entries.map((e) => e.algo))].filter((a) => LEGACY.has(a));
      meta.innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>${esc(describeSums(p))}</span></span>${p.bad.length ? `<span class="sec-warn">${p.bad.length} line${p.bad.length > 1 ? 's' : ''} ignored</span>` : ''}${legacy.length ? `<span class="sec-warn">${icon('triangle-alert', { size: 14 })}${esc(legacy.join(' and '))} spots broken downloads, not tampering. Prefer SHA-256.</span>` : ''}`;
    }
    for (const it of st.items) ensureAlgos(it);
    if (S.mode === 'text') hashText(); else renderAll();
  }

  // ───────── files ─────────
  const isSumsFile = (f) => f.size < 256 * 1024 && /(^|[._-])(sha\d*sums?|md5sums?|checksums?)(\.txt|\.asc)?$|\.(sha1|sha256|sha384|sha512|md5|sha256sum|md5sum)$/i.test(f.name);
  async function addFiles(files) {
    if (S.mode !== 'file') setMode('file');
    const rest = [];
    for (const f of files) {
      if (isSumsFile(f)) { const t = await f.text(); const n = parseSums(t).entries.length; if (n) { setExpected(st.expected.trim() ? st.expected.trim() + '\n' + t : t); toast(`${f.name}: ${n} checksum${n > 1 ? 's' : ''} filled in`, { type: 'info' }); continue; } }
      rest.push(f);
    }
    const wasEmpty = !st.items.length;
    for (const f of rest) { const it = { id: ++uid, file: f, name: f.name, size: f.size, hashes: {}, jobs: new Set(), status: 'queued', done: 0, speed: 0, ms: 0 }; st.items.push(it); ensureAlgos(it); }
    if (wasEmpty && rest.length) renderInput();
    renderAll();
  }
  const base = (n) => n.replace(/^.*[\\/]/, '');
  function entryFor(it) {
    const E = st.parsed.entries; if (!E.length) return null;
    const byName = E.find((e) => e.name && base(e.name) === it.name) || E.find((e) => e.name && base(e.name).toLowerCase() === it.name.toLowerCase());
    if (byName) return byName;
    const unnamed = E.filter((e) => !e.name);
    if (E.length === 1 && (unnamed.length === 1 || st.items.length === 1)) return E[0];
    if (unnamed.length === 1 && st.items.length === 1) return unnamed[0];
    return null;
  }
  function wanted(it) { const e = entryFor(it); return it.extra || !e ? ALGOS : [e.algo]; }
  function ensureAlgos(it) {
    const need = wanted(it).filter((a) => !it.hashes[a] && !it.jobs.has(a));
    if (!need.length) return;
    need.forEach((a) => it.jobs.add(a)); queue.push({ it, algos: need }); pump();
  }
  async function pump() {
    if (busy) return; const job = queue.shift(); if (!job) return;
    busy = true; const { it, algos } = job;
    if (it.removed) { busy = false; pump(); return; }
    it.status = 'hashing'; it.done = 0; it.speed = 0; renderAll();
    try {
      const res = await runWorker(it, algos);
      if (res === 'cancelled') { it.status = 'cancelled'; algos.forEach((a) => it.jobs.delete(a)); busy = false; renderAll(); pump(); return; }
      Object.assign(it.hashes, res.hashes); it.ms = res.ms; it.speed = it.size / Math.max(1, it.ms) * 1000; it.status = 'done';
    } catch (e) { it.status = 'error'; it.error = e.message; }
    algos.forEach((a) => it.jobs.delete(a));
    busy = false; renderAll(); pump();
  }
  function runWorker(it, algos) {
    worker ||= new Worker('./hash-worker.js');
    return new Promise((ok, bad) => {
      const on = ({ data }) => {
        if (data.id !== it.id) return;
        if (data.type === 'progress') { it.done = data.done; it.speed = data.done / Math.max(1, data.ms) * 1000; paintProgress(it); return; }
        worker.removeEventListener('message', on);
        if (data.type === 'done') ok(data); else if (data.type === 'cancelled') ok('cancelled'); else bad(new Error(data.message));
      };
      worker.addEventListener('message', on);
      it.cancel = () => worker.postMessage({ type: 'cancel', id: it.id });
      worker.postMessage({ type: 'hash', id: it.id, blob: it.file, algos });
    });
  }
  function verdictOf(it) {
    const e = entryFor(it); if (!e) return { kind: 'none' };
    const got = it.hashes[e.algo]; if (!got) return { kind: 'pending', e };
    return { kind: got === e.hash ? 'match' : 'mismatch', e, got };
  }
  const mbs = (bps) => `${bps >= 10485760 ? Math.round(bps / 1048576) : (bps / 1048576).toFixed(1)} MB/s`;
  const eta = (it) => { const left = (it.size - it.done) / Math.max(1, it.speed); return left < 1 ? 'under 1 s left' : `${Math.ceil(left)} s left`; };

  // ───────── rendering ─────────
  function renderAll() { renderVerdict(); renderOut(); renderBar(); }
  const row = (algo, hex, cls = '', extra = '') => `<div class="fw-vrow sec-hrow ${cls}"><span class="fw-vrow__label">${algo}${LEGACY.has(algo) ? ' <small>legacy</small>' : ''}</span><span class="fw-vrow__value">${esc(hx(hex))}</span>${extra || `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copy="${esc(hx(hex))}" aria-label="Copy ${algo}" data-tip="Copy ${algo}">${icon('copy')}</button>`}</div>`;
  function renderOut() {
    const out = $('#h-out');
    if (S.mode === 'text') {
      const H = st.textHashes;
      if (!H) { out.innerHTML = ''; return; }
      const e = textEntry();
      out.innerHTML = `<section class="sec-results" aria-label="Hashes"><div class="sec-results__head"><span>${fmtN(st.textBytes)} bytes · UTF-8${S.eol === 'crlf' ? ' · CRLF' : ''}${S.nl ? ' · trailing newline' : ''}</span></div>
        <div class="fw-rows">${ALGOS.map((a) => row(a, H[a], e && e.algo === a ? (H[a] === e.hash ? 'is-ok' : 'is-bad') : '')).join('')}</div></section>`;
      enhance(out); return;
    }
    const ghosts = st.parsed.entries.filter((e) => e.name && st.parsed.entries.length > 1 && !st.items.some((it) => entryFor(it) === e));
    if (!st.items.length && !ghosts.length) { out.innerHTML = ''; return; }
    const done = st.items.filter((it) => Object.keys(it.hashes).length);
    out.innerHTML = `<div class="sec-files__head"><span>${st.items.length} file${st.items.length === 1 ? '' : 's'}</span><span class="fw-spacer"></span>
        ${done.length ? `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="h-copylist">${icon('copy')}Copy list</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="h-dl">${icon('download')}${done.length > 1 ? 'Download SHA256SUMS' : 'Download .sha256'}</button>` : ''}</div>
      <div class="fw-items sec-files" role="list" aria-label="Files">${st.items.map(itemHtml).join('')}
      ${ghosts.map((e) => `<div class="fw-item sec-file is-ghost" role="listitem"><span class="fw-item__thumb fw-item__thumb--icon">${icon('file', { size: 18 })}</span><div class="fw-item__main"><span class="fw-item__name">${esc(e.name)}</span><span class="fw-item__meta">In your checksum list · add this file to check it</span></div><div class="fw-item__status"><span class="fw-badge">Waiting</span></div><div class="fw-item__actions"></div></div>`).join('')}</div>`;
    enhance(out);
    $('#h-copylist')?.addEventListener('click', (ev) => copyText(sumsText(), ev.currentTarget));
    $('#h-dl')?.addEventListener('click', () => { const one = done.length === 1; download(sumsText(), one ? `${done[0].name}.sha256` : 'SHA256SUMS'); });
    $$('[data-act]', out).forEach((b) => b.onclick = (ev) => itemAction(b.dataset.act, st.items.find((x) => x.id === +b.dataset.id), ev.currentTarget));
  }
  function itemHtml(it) {
    const v = verdictOf(it); const hashing = it.status === 'hashing'; const pct = it.size ? Math.round((it.done / it.size) * 100) : 0;
    const cls = v.kind === 'match' ? 'is-match' : v.kind === 'mismatch' || it.status === 'error' ? 'is-error' : '';
    const status = hashing ? `<span class="fw-ring" style="--value:${pct}"></span><span class="fw-num sec-pct">${pct} %</span>`
      : v.kind === 'match' ? `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Match</span>`
      : v.kind === 'mismatch' ? `<span class="fw-verdict fw-verdict--bad">${icon('circle-x')} No match</span>`
      : it.status === 'error' ? `<span class="fw-verdict fw-verdict--bad">${icon('circle-alert')} Couldn’t read</span>`
      : it.status === 'cancelled' ? '<span class="fw-badge">Stopped</span>'
      : it.status === 'queued' ? '<span class="fw-badge">Queued</span>' : '';
    const meta = hashing ? `${fmtBytes(it.size)} · <span class="fw-num" data-speed="${it.id}">${it.speed ? `${mbs(it.speed)} · ${eta(it)}` : 'starting…'}</span>`
      : it.ms ? `${fmtBytes(it.size)} · ${it.ms < 1000 ? Math.max(1, Math.round(it.ms)) + ' ms' : (it.ms / 1000).toFixed(1) + ' s'}` : fmtBytes(it.size);
    const shown = ALGOS.filter((a) => it.hashes[a]);
    const digests = shown.map((a) => {
      const ex = v.e && v.e.algo === a ? v.e.hash : null; const bad = ex && ex !== it.hashes[a];
      return row(a, it.hashes[a], ex ? (bad ? 'is-bad' : 'is-ok') : '') + (bad ? row('Expected', ex, 'is-expected', '<span></span>') : '');
    }).join('');
    const more = shown.length && shown.length < ALGOS.length && !it.jobs.size ? `<button class="fw-btn fw-btn--ghost fw-btn--sm sec-allalgos" type="button" data-act="all" data-id="${it.id}">${icon('plus')}MD5, SHA-1, SHA-384, SHA-512</button>` : '';
    return `<div class="fw-item sec-file ${cls}" role="listitem" data-item="${it.id}">
      <span class="fw-item__thumb fw-item__thumb--icon">${icon(v.kind === 'match' ? 'file-check' : 'file', { size: 18 })}</span>
      <div class="fw-item__main"><span class="fw-item__name">${esc(it.name)}</span><span class="fw-item__meta">${meta}</span></div>
      <div class="fw-item__status">${status}</div>
      <div class="fw-item__actions">${hashing ? `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="cancel" data-id="${it.id}" aria-label="Stop hashing ${esc(it.name)}" data-tip="Stop">${icon('x')}</button>` : `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="more" data-id="${it.id}" aria-label="More for ${esc(it.name)}" aria-haspopup="menu" data-tip="More">${icon('ellipsis')}</button>`}</div>
      ${digests || more ? `<div class="sec-file__digests"><div class="fw-rows">${digests}</div>${more}</div>` : ''}
      ${it.status === 'error' ? `<div class="sec-file__digests"><p class="sec-err">${icon('circle-alert', { size: 14 })}${esc(it.name)} couldn’t be read (${esc(it.error)}). If it’s on a network drive, copy it to this device and add it again.</p></div>` : ''}
      ${hashing ? `<div class="fw-item__progress" data-prog="${it.id}" style="width:${pct}%"></div>` : ''}
    </div>`;
  }
  function paintProgress(it) {
    const pct = it.size ? Math.round((it.done / it.size) * 100) : 0;
    const el = document.querySelector(`[data-item="${it.id}"]`); if (!el) return;
    el.querySelector('.fw-ring')?.style.setProperty('--value', pct);
    const p = el.querySelector('.sec-pct'); if (p) p.textContent = `${pct} %`;
    const sp = el.querySelector(`[data-speed="${it.id}"]`); if (sp) sp.textContent = `${mbs(it.speed)} · ${eta(it)}`;
    const bar = el.querySelector(`[data-prog="${it.id}"]`); if (bar) bar.style.width = pct + '%';
  }
  function itemAction(act, it, btn) {
    if (!it) return;
    if (act === 'cancel') { it.cancel?.(); return; }
    if (act === 'all') { it.extra = true; ensureAlgos(it); renderAll(); return; }
    const algo = entryFor(it)?.algo || 'SHA-256';
    openMenu(btn, [
      { label: `Copy ${algo.replace('-', '').toLowerCase()}sum line`, icon: 'copy', onSelect: () => it.hashes[algo] && copyText(`${hx(it.hashes[algo])}  ${it.name}`, null, { toastLabel: `${it.name} line` }) },
      ...(Object.keys(it.hashes).length < ALGOS.length ? [{ label: 'Compute all algorithms', icon: 'hash', onSelect: () => { it.extra = true; ensureAlgos(it); renderAll(); } }] : []),
      { label: 'Hash again', icon: 'refresh-cw', onSelect: () => { it.hashes = {}; it.status = 'queued'; ensureAlgos(it); renderAll(); } },
      { label: 'Remove', icon: 'trash-2', danger: true, onSelect: () => {
        const i = st.items.indexOf(it); it.removed = true; st.items.splice(i, 1); if (!st.items.length) renderInput(); renderAll();
        toast(`Removed ${it.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { it.removed = false; st.items.splice(i, 0, it); renderInput(); renderAll(); } } });
      } },
    ], { placement: 'bottom-end' });
  }
  function sumsText() {
    return st.items.filter((it) => Object.keys(it.hashes).length).map((it) => { const a = entryFor(it)?.algo || (it.hashes['SHA-256'] ? 'SHA-256' : Object.keys(it.hashes)[0]); return `${hx(it.hashes[a])}  ${it.name}`; }).join('\n') + '\n';
  }
  const banner = (tone, ic, title, text, meta = '', extra = '') => `<div class="sec-verdict is-${tone}" ${tone === 'bad' ? 'role="alert"' : 'role="status"'}>${icon(ic, { size: 32 })}<div class="sec-verdict__body"><div class="sec-verdict__title">${title}</div><div class="sec-verdict__text">${text}</div></div>${meta ? `<span class="sec-verdict__meta">${meta}</span>` : ''}${extra}</div>`;
  function renderVerdict() {
    const el = $('#h-verdict'); let html = '';
    const E = st.parsed.entries;
    if (S.mode === 'text') {
      const e = textEntry(); const H = st.textHashes;
      if (e && H) {
        if (H[e.algo] === e.hash) html = banner('ok', 'circle-check', 'Match', `This text hashes to the expected ${esc(e.algo)}.`, esc(e.algo));
        else html = banner('bad', 'circle-x', 'No match', st.alt != null ? `It matches ${st.alt ? '<b>with</b>' : '<b>without</b>'} a trailing newline${st.alt ? ' (echo adds one)' : ''}.` : 'Check spaces, line endings and the exact text.', esc(e.algo),
          st.alt != null ? `<button class="fw-btn" type="button" id="h-flipnl">${st.alt ? 'Add newline' : 'Remove newline'}</button>` : '');
      }
    } else {
      const vs = st.items.map((it) => ({ it, v: verdictOf(it) }));
      const cmp = vs.filter((x) => x.v.kind === 'match' || x.v.kind === 'mismatch');
      const bad = cmp.filter((x) => x.v.kind === 'mismatch'); const good = cmp.filter((x) => x.v.kind === 'match');
      const hashing = st.items.some((it) => it.status === 'hashing' || it.jobs.size);
      if (E.length && !st.items.length) {
        const e = E[0];
        html = banner('wait', 'fingerprint', E.length > 1 ? `${E.length} checksums ready` : `${esc(e.algo)} ready`, E.length > 1 ? 'Now add the files from the list to check them all at once.' : `Now add ${e.name ? `<b>${esc(e.name)}</b>` : 'the file'} to compare.`);
      } else if (bad.length && !hashing) {
        const one = bad.length === 1 && cmp.length === 1;
        html = banner('bad', 'circle-x', one ? 'No match' : `${good.length} of ${cmp.length} match`, one ? `<b>${esc(bad[0].it.name)}</b> is different from the published checksum. Download it again and don’t open this copy.` : `${bad.map((x) => `<b>${esc(x.it.name)}</b>`).join(', ')} ${bad.length > 1 ? 'are' : 'is'} different. Download ${bad.length > 1 ? 'them' : 'it'} again.`, esc(bad[0].v.e.algo));
      } else if (good.length && !hashing) {
        html = banner('ok', 'circle-check', good.length === 1 ? 'Match' : `All ${good.length} match`, good.length === 1 ? `<b>${esc(good[0].it.name)}</b> is identical to the published ${esc(good[0].v.e.algo)}.` : 'Every file is identical to its published checksum.', esc(good[0].v.e.algo));
      } else if (hashing && E.length) {
        html = banner('wait', 'loader-circle', 'Checking…', 'The verdict appears here.');
      }
    }
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; $('#h-flipnl')?.addEventListener('click', () => { S.nl = !S.nl; S.save(); $('#h-nl').checked = S.nl; hashText(); }); }
  }
  function renderBar() {
    if (S.mode === 'text') {
      const H = st.textHashes; if (!H) return setBar(null);
      const e = textEntry(); const a = e?.algo || 'SHA-256';
      return setBar({ line: e ? (H[a] === e.hash ? `Match · ${a}` : `No match · ${a}`) : `${a} · ${fmtN(st.textBytes)} bytes`, actions: [{ label: `Copy ${a}`, icon: 'copy', primary: true, onClick: (b) => copyText(hx(H[a]), b) }] });
    }
    if (!st.items.length) return setBar(null);
    const vs = st.items.map(verdictOf); const m = vs.filter((v) => v.kind === 'match').length, x = vs.filter((v) => v.kind === 'mismatch').length;
    const h = st.items.find((it) => it.status === 'hashing');
    setBar({ line: h ? `Hashing ${h.name}` : `${st.items.length} file${st.items.length > 1 ? 's' : ''}${m || x ? ` · ${m} match${x ? ` · ${x} different` : ''}` : ''}`,
      actions: [{ label: 'Copy list', icon: 'copy', primary: true, onClick: (b) => copyText(sumsText(), b) }] });
  }
  const fmtN = (n) => n.toLocaleString('en-US');

  api = {
    mode: setMode,
    pick: async () => { const f = await pickFile({ multiple: true }); if (f.length) addFiles(f); },
    pasteExpected: async () => { const t = await readClipboard(); if (t != null) setExpected(t); },
  };

  setMode(S.mode);
  const q = params.get('q') || params.get('expect');
  if (q) { if (parseSums(q).entries.length && !parseSums(q).bad.length) setExpected(q); else if (S.mode === 'text') { st.text = q; renderInput(); } }
  onExpected();

  return {
    onFiles: (files) => addFiles(files),
    onPasteText: (t) => {
      const p = parseSums(t);
      if (p.entries.length && !p.bad.length) { setExpected(t); return true; }
      if (S.mode !== 'text') setMode('text');
      st.text = t; renderInput(); return true;
    },
    state: st,
  };
}
