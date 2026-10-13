// Developer ▸ Checksum (queue): drop files and/or paste the published checksum, in either order. The algorithm is detected
// from what you paste and only that one runs. Small files: Web Crypto digest(). Big files: streamed in a Worker with
// MB/s and ETA (Web Crypto can't stream). SHA256SUMS lists verify every file you drop; missing ones wait as ghost rows.
import { icon, esc, $, $$, h, enhance, copyText, toast, openMenu, kbd, loadSamples, isCoarse } from '../kit/shell.js';
import { parseSums, describeSums, LEGACY, ALG_BY_LEN } from './sums.js';
import { groupHex, fmtBytes, toHex, utf8Bytes } from './codec.js';
import { pasteBox, wirePaste, setBar } from './util.js';

const SUBTLE = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
const SMALL = 64 * 1024 * 1024;
const S = { mode: 'files', expected: '', parsed: { entries: [], bad: [] }, items: [], text: '', eol: 'lf', nl: false, showAll: false };
let ctx, expBox, worker, uid = 0;
const queue = [];

export async function mount(c) {
  ctx = c;
  ctx.renderHeader({ aside: `<div class="fw-seg fw-seg--sm" id="ck-mode" aria-label="What to hash"><button class="fw-seg__opt" type="button" data-value="files" aria-checked="true">${icon('files')}Files</button><button class="fw-seg__opt" type="button" data-value="text" aria-checked="false">${icon('type')}Text</button></div>` });
  $('#ck-mode').addEventListener('fw-change', (e) => { S.mode = e.detail.value; layout(); });
  ctx.root.innerHTML = `<div class="ck">
    <div class="ck-top">
      <div id="ck-left"></div>
      <section class="fw-card ck-expect" aria-labelledby="ck-exp-l">
        <div class="ck-expect__head"><h2 id="ck-exp-l">Expected checksum</h2><span class="fw-faint fw-t-sm">optional · paste before or after</span></div>
        <div id="ck-expbox"></div>
        <div id="ck-expwarn"></div>
      </section>
    </div>
    <div id="ck-verdict" aria-live="polite"></div>
    <div id="ck-work"></div>
  </div>`;
  expBox = pasteBox({ id: 'ck-exp', label: 'Expected checksum', placeholder: 'Paste the checksum from the download page, a sha256sum line or a SHA256SUMS file' });
  $('#ck-expbox').append(expBox);
  S.syncExp = wirePaste(expBox, { set: (v) => setExpected(v), label: 'a checksum', onClear: (old) => toast('Expected checksum cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setExpected(old) } }) });
  $('#ck-exp').addEventListener('input', (e) => { S.expected = e.target.value; onExpected(); });
  ctx.hooks.onFiles = (files) => addFiles(files);
  ctx.hooks.onPaste = (t) => { setExpected(t); return true; };
  const q = ctx.params.get('q') || ctx.params.get('expect');
  layout();
  if (q) setExpected(q); else onExpected();
}

function layout() {
  const left = $('#ck-left');
  if (S.mode === 'text') { left.innerHTML = textPane(); wireText(); $('#ck-work').hidden = true; refresh(); return; }
  $('#ck-work').hidden = false;
  renderIntake();
  refresh();
}
function renderIntake() {
  const slim = S.items.length > 0; const left = $('#ck-left'); $('.ck-top').classList.toggle('is-slim', slim);
  left.innerHTML = slim
    ? `<div class="fw-intake fw-intake--slim ck-intake" data-intake aria-label="Add more files"><span class="fw-intake__icon">${icon('plus', { size: 18 })}</span><span class="fw-intake__title">Add files</span><span class="fw-intake__sub fw-hide-mobile">or drop a SHA256SUMS file</span></div>`
    : `<div class="fw-intake ck-intake" data-intake aria-label="Choose files to hash, or drop them here">
        <span class="fw-intake__icon">${icon('fingerprint', { size: 22 })}</span>
        <span class="fw-intake__title"><span class="fw-pointer-copy">Drop files to check</span><span class="fw-touch-copy">Choose files to check</span></span>
        <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary fw-btn--lg" type="button" data-pick>${icon('folder-open')}Choose files</button></span>
        <span class="fw-intake__sub">any size · several at once · SHA256SUMS too</span>
        <span class="fw-intake__samples"><a href="#" class="fw-chip fw-chip--sample" data-sample="./samples/fernwork-desktop-2.4.0.dmg">6 MB download</a><a href="#" class="fw-chip fw-chip--sample" data-sample="./samples/SHA256SUMS|./samples/fernwork-2.4.0.tar.gz|./samples/fernwork-2.4.0-arm64.AppImage|./samples/fernwork-2.4.0-setup.exe">SHA256SUMS + 3 files</a></span>
        <span class="fw-intake__privacy">${icon('lock', { size: 12 })} Hashed on this device · nothing is uploaded</span></div>`;
  enhance(left);
}

// ───────────── expected checksum ─────────────
function setExpected(v) { const ta = $('#ck-exp'); ta.value = v; S.expected = v; S.syncExp(); onExpected(); }
function onExpected() {
  S.parsed = parseSums(S.expected);
  const meta = expBox.querySelector('.fw-paste__meta'); const p = S.parsed;
  const warn = $('#ck-expwarn');
  if (!S.expected.trim()) { meta.innerHTML = `<span class="fw-faint">The algorithm is detected from the length: MD5 · SHA-1 · SHA-256 · SHA-384 · SHA-512</span>`; warn.innerHTML = ''; }
  else if (!p.entries.length) {
    const compact = S.expected.replace(/[\s:]/g, '');
    const why = /^[0-9a-f]+$/i.test(compact) ? `${compact.length} hex characters isn’t a known checksum length (32, 40, 64, 96 or 128).` : 'That doesn’t look like a checksum. Paste the hex string, a sha256sum line or a SHA256SUMS file.';
    meta.innerHTML = `<span class="ck-bad">${icon('circle-alert', { size: 14 })}${esc(why)}</span>`; warn.innerHTML = '';
  } else {
    meta.innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>${esc(describeSums(p))}</span></span>${p.bad.length ? `<span class="ck-bad">${icon('triangle-alert', { size: 14 })}${p.bad.length} line${p.bad.length > 1 ? 's' : ''} ignored</span>` : ''}
      <span class="fw-faint">${[...new Set(p.entries.map((e) => e.algo))].length === 1 ? `only ${esc(p.entries[0].algo)} will run` : ''}</span>`;
    const legacy = [...new Set(p.entries.map((e) => e.algo))].filter((a) => LEGACY.has(a));
    warn.innerHTML = legacy.length ? `<div class="fw-alert fw-alert--warning ck-legacy"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(legacy.join(' and '))} is legacy: fine for spotting a broken download, not for proving nobody tampered with it. Prefer SHA-256 if the site offers it.</div></div>` : '';
  }
  for (const it of S.items) ensureAlgos(it);
  refresh();
}

// ───────────── files ─────────────
const isSumsFile = (f) => f.size < 256 * 1024 && /(^|[._-])(sha\d*sums?|md5sums?|checksums?)(\.txt|\.asc)?$|\.(sha1|sha256|sha384|sha512|md5|sha256sum|md5sum)$/i.test(f.name);
async function addFiles(files) {
  if (S.mode === 'text') { S.mode = 'files'; $('#ck-mode [data-value="files"]').click(); }
  const sums = files.filter(isSumsFile); const rest = files.filter((f) => !isSumsFile(f));
  for (const f of sums) {
    const t = await f.text();
    if (parseSums(t).entries.length) { setExpected(S.expected.trim() ? S.expected.trim() + '\n' + t : t); toast(`Loaded ${f.name} · ${parseSums(t).entries.length} checksums`, { type: 'info' }); }
    else rest.push(f);
  }
  for (const f of rest) {
    const it = { id: ++uid, file: f, name: f.name, size: f.size, hashes: {}, jobs: new Set(), status: 'queued', done: 0, speed: 0, ms: 0 };
    S.items.push(it); ensureAlgos(it);
  }
  if (rest.length) renderIntake();
  refresh();
}
function entryFor(it) {
  const E = S.parsed.entries; if (!E.length) return null;
  const byName = E.find((e) => e.name && e.name.replace(/^.*[\\/]/, '') === it.name) || E.find((e) => e.name && e.name.replace(/^.*[\\/]/, '').toLowerCase() === it.name.toLowerCase());
  if (byName) return byName;
  const unnamed = E.filter((e) => !e.name);
  if (E.length === 1 && (unnamed.length === 1 || S.items.length === 1)) return E[0];
  if (unnamed.length === 1 && S.items.length === 1) return unnamed[0];
  return null;
}
function wanted(it) { const e = entryFor(it); const w = new Set([e ? e.algo : (S.parsed.entries.length && !S.parsed.entries.some((x) => x.name) ? S.parsed.entries[0].algo : 'SHA-256')]); if (it.extra) ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'].forEach((a) => w.add(a)); return w; }
function ensureAlgos(it) {
  const need = [...wanted(it)].filter((a) => !it.hashes[a] && !it.jobs.has(a));
  if (!need.length) return;
  need.forEach((a) => it.jobs.add(a));
  queue.push({ it, algos: need }); pump();
}
let busy = false;
async function pump() {
  if (busy) return; const job = queue.shift(); if (!job) return;
  busy = true; const { it, algos } = job;
  if (it.removed) { busy = false; return pump(); }
  it.status = 'hashing'; it.done = 0; it.t0 = performance.now(); refresh();
  try {
    if (it.size <= SMALL && algos.every((a) => SUBTLE.has(a))) {
      const buf = await it.file.arrayBuffer();
      for (const a of algos) it.hashes[a] = toHex(new Uint8Array(await crypto.subtle.digest(a, buf)));
      it.ms = performance.now() - it.t0; it.engine = 'Web Crypto';
    } else {
      const res = await runWorker(it, algos);
      if (res === 'cancelled') { it.status = 'cancelled'; algos.forEach((a) => it.jobs.delete(a)); busy = false; refresh(); return pump(); }
      Object.assign(it.hashes, res.hashes); it.ms = res.ms; it.engine = 'streamed';
    }
    it.speed = it.size / Math.max(1, it.ms) * 1000; it.status = 'done';
  } catch (e) { it.status = 'error'; it.error = e.message; }
  algos.forEach((a) => it.jobs.delete(a));
  busy = false; refresh(); pump();
}
function runWorker(it, algos) {
  worker ||= new Worker('./hash-worker.js');
  return new Promise((ok, bad) => {
    const id = it.id;
    const on = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === 'progress') { it.done = data.done; it.speed = data.done / Math.max(1, data.ms) * 1000; paintProgress(it); }
      else { worker.removeEventListener('message', on); if (data.type === 'done') ok(data); else if (data.type === 'cancelled') ok('cancelled'); else bad(new Error(data.message)); }
    };
    worker.addEventListener('message', on);
    it.cancel = () => worker.postMessage({ type: 'cancel', id });
    worker.postMessage({ type: 'hash', id, blob: it.file, algos });
  });
}

// ───────────── verdicts ─────────────
function verdictOf(it) {
  const e = entryFor(it); if (!e) return { kind: 'none' };
  const got = it.hashes[e.algo]; if (!got) return { kind: 'pending', e };
  return { kind: got === e.hash ? 'match' : 'mismatch', e, got };
}
const eta = (it) => { const left = (it.size - it.done) / Math.max(1, it.speed); return left < 1 ? 'under 1 s left' : `${Math.ceil(left)} s left`; };
const mbs = (bps) => `${Math.round(bps / 1048576)} MB/s`;

function refresh() {
  if (S.mode === 'text') return refreshText();
  renderItems(); renderVerdict(); renderBar();
}
function digestHtml(hex, against) {
  const g = groupHex(hex).split(' ');
  if (!against) return g.join(' ');
  const a = groupHex(against).split(' ');
  const diff = g.filter((x, i) => x !== a[i]).length;
  if (diff > 4) return `<span class="ck-dg__alldiff">${g.join(' ')}</span>`; // a different file: every block differs
  return g.map((x, i) => (x === a[i] ? x : `<mark>${x}</mark>`)).join(' ');
}
function renderItems() {
  const w = $('#ck-work'); if (!w) return;
  const ghosts = S.parsed.entries.filter((e) => e.name && S.parsed.entries.length > 1 && !S.items.some((it) => entryFor(it) === e));
  if (!S.items.length && !ghosts.length) { w.innerHTML = ''; return; }
  w.innerHTML = `<div class="fw-items ck-items" role="list" aria-label="Files">
    ${S.items.map((it) => itemHtml(it)).join('')}
    ${ghosts.map((e) => `<div class="fw-item ck-item is-ghost" role="listitem"><span class="fw-item__thumb fw-item__thumb--icon">${icon('file', { size: 18 })}</span>
      <div class="fw-item__main"><span class="fw-item__name">${esc(e.name)}</span><span class="fw-item__meta">Listed in your checksums · drop this file to check it</span></div>
      <div class="fw-item__status"><span class="fw-badge">Waiting for file</span></div><div class="fw-item__actions"></div></div>`).join('')}
  </div>`;
  enhance(w);
  $$('[data-act]', w).forEach((b) => b.onclick = (e) => itemAction(b.dataset.act, S.items.find((x) => x.id === +b.dataset.id), e.currentTarget));
}
function itemHtml(it) {
  const v = verdictOf(it); const hashing = it.status === 'hashing'; const pct = it.size ? Math.round((it.done / it.size) * 100) : 0;
  const cls = v.kind === 'match' ? 'is-match' : v.kind === 'mismatch' ? 'is-error is-mismatch' : it.status === 'error' ? 'is-error' : '';
  const algos = Object.keys(it.hashes);
  const status = hashing
    ? (it.engine === 'streamed' || it.size > SMALL ? `<span class="fw-ring" style="--value:${pct}"></span><span class="fw-num ck-pct">${pct} %</span>` : `<span class="fw-spinner"></span><span class="fw-faint">Hashing</span>`)
    : v.kind === 'match' ? `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Match</span>`
    : v.kind === 'mismatch' ? `<span class="fw-verdict fw-verdict--bad">${icon('circle-x')} No match</span>`
    : it.status === 'error' ? `<span class="fw-verdict fw-verdict--bad">${icon('circle-alert')} Couldn’t read</span>`
    : it.status === 'cancelled' ? `<span class="fw-badge">Stopped</span>`
    : algos.length ? `<span class="fw-badge">${icon('check', { size: 12 })} ${S.parsed.entries.length ? 'Not in your list' : 'Computed'}</span>` : `<span class="fw-badge">Queued</span>`;
  const meta = hashing ? `${fmtBytes(it.size)} · ${esc([...it.jobs].join(', '))} · <span class="fw-num" data-speed="${it.id}">${it.speed ? `${mbs(it.speed)} · ${eta(it)}` : 'starting…'}</span>`
    : it.status === 'done' || algos.length ? `${fmtBytes(it.size)} · ${esc(algos.join(', '))} · ${it.ms < 1000 ? Math.max(1, Math.round(it.ms)) + ' ms' : (it.ms / 1000).toFixed(1) + ' s'} · ${mbs(it.speed)}` : fmtBytes(it.size);
  const order = ['SHA-256', 'SHA-512', 'SHA-384', 'SHA-1', 'MD5'];
  const digests = order.filter((a) => it.hashes[a]).map((a) => {
    const exp = v.e && v.e.algo === a ? v.e.hash : null; const bad = exp && exp !== it.hashes[a];
    return `<div class="ck-dg ${exp ? (bad ? 'is-bad' : 'is-ok') : ''}"><span class="ck-dg__algo">${a}${LEGACY.has(a) ? ' <small>legacy</small>' : ''}</span><code class="ck-dg__hex">${digestHtml(it.hashes[a], bad ? exp : null)}</code><button class="fw-iconbtn fw-iconbtn--sm fw-copy" type="button" data-copy="${it.hashes[a]}" aria-label="Copy ${a}" data-tip="Copy ${a}">${icon('copy')}</button></div>
      ${bad ? `<div class="ck-dg is-expected"><span class="ck-dg__algo">Expected</span><code class="ck-dg__hex">${digestHtml(exp, it.hashes[a])}</code><span></span></div>` : ''}`;
  }).join('');
  return `<div class="fw-item ck-item ${cls}" role="listitem" data-item="${it.id}">
    <span class="fw-item__thumb fw-item__thumb--icon">${icon(v.kind === 'match' ? 'file-check' : 'file', { size: 18 })}</span>
    <div class="fw-item__main"><span class="fw-item__name">${esc(it.name)}</span><span class="fw-item__meta">${meta}</span></div>
    <div class="fw-item__status">${status}</div>
    <div class="fw-item__actions">${hashing ? `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="cancel" data-id="${it.id}" aria-label="Stop hashing ${esc(it.name)}" data-tip="Stop">${icon('x')}</button>` : `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="more" data-id="${it.id}" aria-label="More for ${esc(it.name)}" aria-haspopup="menu" data-tip="More">${icon('ellipsis')}</button>`}</div>
    ${digests ? `<div class="ck-digests">${digests}</div>` : ''}
    ${it.status === 'error' ? `<div class="ck-digests"><div class="fw-alert fw-alert--danger"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body">${esc(it.name)} couldn’t be read (${esc(it.error)}). If it’s on a network drive, copy it locally and add it again.</div></div></div>` : ''}
    ${hashing ? `<div class="fw-item__progress" data-prog="${it.id}" style="width:${pct}%"></div>` : ''}
  </div>`;
}
function paintProgress(it) {
  const pct = it.size ? Math.round((it.done / it.size) * 100) : 0;
  const row = document.querySelector(`[data-item="${it.id}"]`); if (!row) return;
  const ring = row.querySelector('.fw-ring'); if (ring) ring.style.setProperty('--value', pct);
  const p = row.querySelector('.ck-pct'); if (p) p.textContent = `${pct} %`;
  const sp = row.querySelector(`[data-speed="${it.id}"]`); if (sp) sp.textContent = `${mbs(it.speed)} · ${eta(it)}`;
  const bar = row.querySelector(`[data-prog="${it.id}"]`); if (bar) bar.style.width = pct + '%';
  renderVerdict(); renderBar();
}
function itemAction(act, it, btn) {
  if (!it) return;
  if (act === 'cancel') { it.cancel?.(); return; }
  if (act === 'more') {
    const e = entryFor(it); const algo = e?.algo || 'SHA-256';
    openMenu(btn, [
      { label: it.extra ? 'All algorithms shown' : 'Also compute MD5, SHA-1, SHA-512', icon: 'hash', onSelect: () => { it.extra = true; ensureAlgos(it); refresh(); } },
      { label: `Copy as ${algo.replace('-', '').toLowerCase()}sum line`, icon: 'copy', onSelect: () => it.hashes[algo] && copyText(`${it.hashes[algo]}  ${it.name}`, null, { toastLabel: `${it.name} line` }) },
      { label: it.status === 'cancelled' ? 'Hash again' : 'Hash again (file changed?)', icon: 'refresh-cw', onSelect: () => { it.hashes = {}; ensureAlgos(it); } },
      { label: 'Remove', icon: 'trash-2', danger: true, onSelect: () => {
        const i = S.items.indexOf(it); it.removed = true; S.items.splice(i, 1); if (!S.items.length) renderIntake(); refresh();
        toast(`Removed ${it.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { it.removed = false; S.items.splice(i, 0, it); renderIntake(); refresh(); } } });
      } },
    ], { placement: 'bottom-end' });
  }
}

function renderVerdict() {
  const el = $('#ck-verdict'); if (!el) return;
  const E = S.parsed.entries; const items = S.items;
  const vs = items.map((it) => ({ it, v: verdictOf(it) }));
  const compared = vs.filter((x) => x.v.kind === 'match' || x.v.kind === 'mismatch');
  const bad = compared.filter((x) => x.v.kind === 'mismatch'); const good = compared.filter((x) => x.v.kind === 'match');
  const hashing = items.filter((it) => it.status === 'hashing' || it.jobs.size);
  const ghosts = E.filter((e) => e.name && E.length > 1 && !items.some((it) => entryFor(it) === e));
  let html = '';
  if (E.length && !items.length) {
    const e = E[0];
    html = `<div class="ck-verdict is-wait">${icon('fingerprint', { size: 28 })}<div><div class="ck-verdict__title">${E.length > 1 ? `${E.length} checksums ready` : `${esc(e.algo)} ready`}</div><div class="ck-verdict__text">${E.length > 1 ? 'Drop the files from the list to check them all at once.' : `Now drop ${e.name ? `<b>${esc(e.name)}</b>` : 'the file'} to compare. Only ${esc(e.algo)} will run.`}</div></div></div>`;
  } else if (bad.length && !hashing.length) {
    const one = bad.length === 1 && compared.length === 1;
    html = `<div class="ck-verdict is-bad" role="alert">${icon('circle-x', { size: 32 })}<div><div class="ck-verdict__title">${one ? 'No match' : `${good.length} of ${compared.length} match`}</div><div class="ck-verdict__text">${one ? `<b>${esc(bad[0].it.name)}</b> is different from the published checksum. Download it again and don’t open this copy.` : `${bad.map((x) => `<b>${esc(x.it.name)}</b>`).join(', ')} ${bad.length > 1 ? 'are' : 'is'} different. Download ${bad.length > 1 ? 'them' : 'it'} again.`}${ghosts.length ? ` ${ghosts.length} listed file${ghosts.length > 1 ? 's' : ''} not dropped yet.` : ''}</div></div><span class="ck-verdict__meta">${esc(bad[0].v.e.algo)}</span></div>`;
  } else if (good.length && !bad.length && !hashing.length) {
    const one = good.length === 1;
    const it = good[0].it;
    html = `<div class="ck-verdict is-ok" role="status">${icon('circle-check', { size: 32 })}<div><div class="ck-verdict__title">${one ? 'Match' : `All ${good.length} match`}</div><div class="ck-verdict__text">${one ? `<b>${esc(it.name)}</b> is identical to the published ${esc(good[0].v.e.algo)}.` : 'Every file is identical to its published checksum.'}${ghosts.length ? ` ${ghosts.length} listed file${ghosts.length > 1 ? 's' : ''} not dropped yet.` : ''}</div></div><span class="ck-verdict__meta">${esc(good[0].v.e.algo)} · ${fmtBytes(good.reduce((s, x) => s + x.it.size, 0))} in ${(good.reduce((s, x) => s + x.it.ms, 0) / 1000).toFixed(1)} s</span></div>`;
  } else if (hashing.length && E.length) {
    const tot = items.reduce((s, it) => s + it.size, 0); const done = items.reduce((s, it) => s + (it.status === 'hashing' ? it.done : it.jobs.size ? 0 : it.size), 0);
    html = `<div class="ck-verdict is-busy">${icon('loader-circle', { size: 28, className: 'ck-spin' })}<div><div class="ck-verdict__title">Checking…</div><div class="ck-verdict__text">${Math.round((done / Math.max(1, tot)) * 100)} % · the verdict appears here</div></div></div>`;
  } else if (items.length && !E.length && !hashing.length) {
    html = `<div class="ck-hint">${icon('info', { size: 16 })}<span>Computed ${items.length > 1 ? `SHA-256 for ${items.length} files` : 'SHA-256'}. Paste the published checksum above to compare, or copy the list below.</span></div>`;
  }
  if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
}
function sumsText() {
  return S.items.filter((it) => Object.keys(it.hashes).length).map((it) => { const a = entryFor(it)?.algo || (it.hashes['SHA-256'] ? 'SHA-256' : Object.keys(it.hashes)[0]); return `${it.hashes[a]}  ${it.name}`; }).join('\n') + '\n';
}
function renderBar() {
  if (!S.items.length) return setBar(null);
  const vs = S.items.map(verdictOf); const m = vs.filter((v) => v.kind === 'match').length, x = vs.filter((v) => v.kind === 'mismatch').length;
  const hashing = S.items.filter((it) => it.status === 'hashing');
  const tot = S.items.reduce((s, it) => s + it.size, 0);
  const line = hashing.length ? `Hashing ${S.items.indexOf(hashing[0]) + 1} of ${S.items.length}${hashing[0].speed ? ` · ${mbs(hashing[0].speed)} · ${eta(hashing[0])}` : ''}`
    : `${S.items.length} file${S.items.length > 1 ? 's' : ''}${m || x ? ` · ${m} match${x ? ` · ${x} different` : ''}` : ''}`;
  const n = S.items.length; const algo = entryFor(S.items[0])?.algo || 'SHA-256'; const ext = { 'SHA-256': 'sha256', 'SHA-512': 'sha512', 'SHA-1': 'sha1', MD5: 'md5', 'SHA-384': 'sha384' }[algo];
  setBar({ line, sub: `${fmtBytes(tot)} · ${algo} · nothing uploaded`, actions: [
    { label: 'Copy list', icon: 'copy', onClick: (b) => copyText(sumsText(), b) },
    { label: n > 1 ? `Download ${algo.replace('-', '')}SUMS` : `Download .${ext}`, icon: 'download', primary: true, onClick: () => {
      const a = h(`<a download="${n > 1 ? `${algo.replace('-', '')}SUMS` : `${S.items[0].name}.${ext}`}"></a>`); a.href = URL.createObjectURL(new Blob([sumsText()], { type: 'text/plain' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } }] });
}

// ───────────── text mode ─────────────
function textPane() {
  return `<section class="fw-card ck-textpane">
    <label class="ck-expect__head" for="ck-text"><h2>Text to hash</h2><span class="fw-faint fw-t-sm">exact bytes, UTF-8</span></label>
    <textarea class="fw-textarea fw-input--mono ck-textarea" id="ck-text" rows="5" spellcheck="false" placeholder="hello">${esc(S.text)}</textarea>
    <div class="ck-textopts">
      <div class="fw-seg fw-seg--sm" id="ck-eol" aria-label="Line endings"><button class="fw-seg__opt" type="button" data-value="lf" aria-checked="${S.eol === 'lf'}">LF (macOS, Linux)</button><button class="fw-seg__opt" type="button" data-value="crlf" aria-checked="${S.eol === 'crlf'}">CRLF (Windows)</button></div>
      <label class="fw-toggle gen-toggle"><input type="checkbox" id="ck-nl" ${S.nl ? 'checked' : ''}>Trailing newline <span class="fw-faint">(like echo)</span></label>
    </div>
    <div id="ck-textout"></div></section>`;
}
function wireText() {
  enhance($('#ck-left'));
  $('#ck-text').addEventListener('input', (e) => { S.text = e.target.value; refreshText(); });
  $('#ck-eol').addEventListener('fw-change', (e) => { S.eol = e.detail.value; refreshText(); });
  $('#ck-nl').onchange = (e) => { S.nl = e.target.checked; refreshText(); };
  if (!isCoarse()) $('#ck-text').focus();
}
let md5Ready = null;
const loadMd5 = () => md5Ready ||= new Promise((ok) => { const s = document.createElement('script'); s.src = './vendor/hash-wasm/md5.umd.min.js'; s.onload = ok; document.head.append(s); });
async function digestText(algo, bytes) {
  if (algo === 'MD5') { await loadMd5(); return window.hashwasm.md5(bytes); }
  return toHex(new Uint8Array(await crypto.subtle.digest(algo, bytes)));
}
async function refreshText() {
  const out = $('#ck-textout'); if (!out) return;
  let t = S.text.replace(/\r\n/g, '\n'); if (S.eol === 'crlf') t = t.replace(/\n/g, '\r\n'); if (S.nl) t += S.eol === 'crlf' ? '\r\n' : '\n';
  const bytes = utf8Bytes(t);
  const E = S.parsed.entries; const e = E.length === 1 || (E.length && !E[0].name) ? E[0] : null;
  const algos = S.showAll ? ['SHA-256', 'SHA-512', 'SHA-1', 'MD5'] : [e ? e.algo : 'SHA-256'];
  const res = {}; for (const a of algos) res[a] = await digestText(a, bytes);
  let verdict = '';
  if (e) {
    const got = res[e.algo] || await digestText(e.algo, bytes);
    if (got === e.hash) verdict = `<div class="ck-verdict is-ok">${icon('circle-check', { size: 28 })}<div><div class="ck-verdict__title">Match</div><div class="ck-verdict__text">This text hashes to the expected ${esc(e.algo)}.</div></div></div>`;
    else {
      const alt = utf8Bytes(S.nl ? t.replace(/\r?\n$/, '') : t + (S.eol === 'crlf' ? '\r\n' : '\n'));
      const altOk = (await digestText(e.algo, alt)) === e.hash;
      verdict = `<div class="ck-verdict is-bad">${icon('circle-x', { size: 28 })}<div><div class="ck-verdict__title">No match</div><div class="ck-verdict__text">${altOk ? `It matches ${S.nl ? '<b>without</b>' : '<b>with</b>'} a trailing newline${S.nl ? '' : ' (echo adds one)'}.` : 'Check spaces, line endings and the exact text.'}</div></div>${altOk ? `<button class="fw-btn" type="button" id="ck-flipnl">${S.nl ? 'Remove newline' : 'Add newline'}</button>` : ''}</div>`;
    }
  }
  out.innerHTML = `${verdict}<div class="fw-rows">${Object.entries(res).map(([a, v]) => `<div class="fw-vrow"><span class="fw-vrow__label">${a}${LEGACY.has(a) ? ' · legacy' : ''}</span><span class="fw-vrow__value">${groupHex(v)}</span><button class="fw-iconbtn fw-iconbtn--sm fw-copy" type="button" data-copy="${v}" aria-label="Copy ${a}" data-tip="Copy">${icon('copy')}</button></div>`).join('')}</div>
    <div class="ck-textfoot"><span class="fw-faint fw-t-sm">${bytes.length} bytes · Web Crypto${algos.includes('MD5') ? ' + MD5 (wasm)' : ''}</span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="ck-all">${S.showAll ? 'Fewer algorithms' : 'Show SHA-512, SHA-1, MD5'}</button></div>`;
  enhance(out);
  $('#ck-all').onclick = () => { S.showAll = !S.showAll; refreshText(); };
  $('#ck-flipnl')?.addEventListener('click', () => { S.nl = !S.nl; $('#ck-nl').checked = S.nl; refreshText(); });
  setBar(e ? null : { line: `${algos[0]} · ${bytes.length} bytes`, actions: [{ label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyText(res[algos[0]], b) }] });
}
