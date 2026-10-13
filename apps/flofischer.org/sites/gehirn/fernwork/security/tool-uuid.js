// UUID Generator: v4 (random), v7 (time-ordered, monotonic within a millisecond) and v1 (time + random node), one or up to
// 100,000 at once (virtualised list, Copy all, Download .txt/.json), six output formats, and "Check a UUID".
import { icon, esc, $, $$, h, enhance, toast, copyText, isCoarse, settings, seg, moreBtn, wireMore, setBar, download, randInt, fmtWhen, relHuman, fmtN, debounce } from './ui.js';
import { b64encode, parseHex } from './codec.js';

let api = {};
export const config = {
  shortcuts: [{ label: 'New UUIDs', keys: 'r' }],
  commands: [
    { id: 'u-new', label: 'New UUIDs', icon: 'refresh-cw', kbd: 'r', run: () => api.regen?.() },
    { id: 'u-check', label: 'Check a UUID', icon: 'scan', syn: ['validate uuid', 'uuid version'], run: () => api.check?.() },
  ],
};

// ───────── generators ─────────
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const fmt = (hx) => `${hx.slice(0, 8)}-${hx.slice(8, 12)}-${hx.slice(12, 16)}-${hx.slice(16, 20)}-${hx.slice(20)}`;
export const uuidv4 = () => crypto.randomUUID();
let lastMs = -1, seq = 0;
/** RFC 9562 UUIDv7; a 12-bit counter in rand_a keeps IDs strictly increasing within one millisecond (method 1). */
export function uuidv7() {
  let ms = Date.now();
  if (ms <= lastMs) { ms = lastMs; seq++; if (seq > 0xfff) { ms = ++lastMs; seq = randInt(0x400); } } else seq = randInt(0x400);
  lastMs = ms;
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = ms; for (let i = 5; i >= 0; i--) { b[i] = t % 256; t = Math.floor(t / 256); }
  b[6] = 0x70 | (seq >> 8); b[7] = seq & 0xff; b[8] = (b[8] & 0x3f) | 0x80;
  return fmt(hex(b));
}
// v1: 60-bit count of 100 ns since 1582-10-15; random clock sequence and random node (multicast bit set, RFC 9562 §6.10)
const NODE = crypto.getRandomValues(new Uint8Array(6)); NODE[0] |= 0x01;
const CLOCKSEQ = (crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff) | 0x8000;
let lastTicks = 0n;
export function uuidv1() {
  let ticks = BigInt(Date.now()) * 10000n + 122192928000000000n;
  if (ticks <= lastTicks) ticks = lastTicks + 1n; lastTicks = ticks;
  const tl = ticks & 0xffffffffn, tm = (ticks >> 32n) & 0xffffn, th = ((ticks >> 48n) & 0x0fffn) | 0x1000n;
  return `${tl.toString(16).padStart(8, '0')}-${tm.toString(16).padStart(4, '0')}-${th.toString(16).padStart(4, '0')}-${CLOCKSEQ.toString(16).padStart(4, '0')}-${hex(NODE)}`;
}
const GEN = { v4: uuidv4, v7: uuidv7, v1: uuidv1 };

/** Read a UUID in any common form. → { canon, ver, verName, variant, rfc, nil, max, time, form } | { error } */
export function parseUuid(s) {
  const raw = s.trim(); const t = raw.replace(/^urn:uuid:/i, '').replace(/^[{"']|[}"',]+$/g, '');
  const hx = t.replace(/-/g, '');
  if (!/^[0-9a-f]*$/i.test(hx)) { const bad = /[^0-9a-f-]/i.exec(t); return { error: `“${bad[0]}” isn’t a hex digit. A UUID uses 0–9 and a–f.` }; }
  if (hx.length !== 32) return { error: `A UUID has 32 hex digits; this has ${hx.length}.` };
  if (t.includes('-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { error: 'The hyphens are in the wrong places. The form is 8-4-4-4-12.' };
  const h = hx.toLowerCase(); const canon = fmt(h);
  const ver = parseInt(h[12], 16); const vn = parseInt(h[16], 16);
  const nil = /^0+$/.test(h), max = /^f+$/.test(h);
  const variant = vn < 8 ? 'NCS (legacy)' : vn < 12 ? 'RFC 9562' : vn < 14 ? 'Microsoft (legacy)' : 'reserved';
  let time = null;
  if (!nil && !max && vn >= 8 && vn < 12) {
    if (ver === 7) time = Number(BigInt('0x' + h.slice(0, 12)));
    if (ver === 1) { const ts = (BigInt('0x' + h.slice(13, 16)) << 48n) | (BigInt('0x' + h.slice(8, 12)) << 32n) | BigInt('0x' + h.slice(0, 8)); time = Number(ts / 10000n) - 12219292800000; }
    if (ver === 6) { const ts = (BigInt('0x' + h.slice(0, 12)) << 12n) | BigInt('0x' + h.slice(13, 16)); time = Number(ts / 10000n) - 12219292800000; }
  }
  const verName = { 1: 'time-based', 2: 'DCE security', 3: 'name-based (MD5)', 4: 'random', 5: 'name-based (SHA-1)', 6: 'time-ordered (reordered v1)', 7: 'time-ordered', 8: 'custom' }[ver];
  const form = raw === canon ? 'canonical' : /^\{/.test(raw) ? 'braces' : /^urn/i.test(raw) ? 'URN' : !t.includes('-') ? 'no hyphens' : t === t.toUpperCase() ? 'uppercase' : 'other';
  return { canon, hex: h, ver, verName, variant, rfc: variant === 'RFC 9562' && !!verName, nil, max, time, form };
}

const FORMATS = [['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['nohyph', 'no hyphens'], ['braces', '{braces}'], ['quoted', '"quoted",'], ['json', 'JSON array']];
const fmtOne = (u, f) => (f === 'upper' ? u.toUpperCase() : f === 'nohyph' ? u.replace(/-/g, '') : f === 'braces' ? `{${u}}` : f === 'quoted' ? `"${u}"` : f === 'json' ? `["${u}"]` : u);

export async function mount(root, { params }) {
  const S = settings('uuid', { ver: 'v4', count: 1, fmt: 'lower' });
  const cur = { list: [], ms: 0 };

  root.innerHTML = `
    <div class="sec-toolbar">
      ${seg('u-ver', 'Version', [['v4', 'v4<span class="sec-long"> · random</span>'], ['v7', 'v7<span class="sec-long"> · time-ordered</span>'], ['v1', 'v1<span class="sec-long"> · time-based</span>']], S.ver, { raw: true })}
      <div class="sec-count"><label class="sec-sel__l" for="u-count">How many</label>
        <div class="fw-stepper sec-stepper"><button class="fw-iconbtn" type="button" data-step="-1" aria-label="Fewer">${icon('minus')}</button><input class="fw-num" id="u-count" type="number" min="1" max="100000" value="${S.count}" inputmode="numeric" aria-label="How many UUIDs"><button class="fw-iconbtn" type="button" data-step="1" aria-label="More">${icon('plus')}</button></div></div>
      <span class="fw-spacer"></span>${moreBtn('u-more')}
    </div>
    <div class="sec-more" id="u-more-panel" hidden>
      <div class="sec-more__row"><span class="sec-more__label">Format</span><div class="sec-chips" role="group" aria-label="Format">${FORMATS.map(([v, l]) => `<button class="fw-chip fw-mono" type="button" data-fmt="${v}" aria-pressed="${S.fmt === v}">${esc(l)}</button>`).join('')}</div></div>
      <span class="fw-faint fw-t-sm" id="u-why"></span>
    </div>
    <span class="fw-field__error" id="u-count-err" hidden></span>
    <div id="u-out"></div>
    <section class="sec-pane sec-check" aria-labelledby="u-check-l">
      <div class="sec-pane__head"><label class="sec-pane__label" id="u-check-l" for="u-check">Check a UUID</label></div>
      <div class="sec-pane__body"><input class="fw-input fw-input--mono" id="u-check" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, {…} or urn:uuid:…" autocomplete="off" spellcheck="false" autocapitalize="off">
      <div id="u-check-out" aria-live="polite"></div></div>
    </section>`;
  enhance(root);
  wireMore($('#u-more'), $('#u-more-panel'));
  const why = () => { $('#u-why').textContent = { v4: 'v4: 122 random bits, no time inside.', v7: 'v7: starts with the creation time in milliseconds, so it sorts by time. Good for database keys.', v1: 'v1: 100-ns timestamp plus a random node ID (no MAC address).' }[S.ver]; };
  $('#u-ver').addEventListener('fw-change', (e) => { S.ver = e.detail.value; S.save(); why(); gen(); });
  const countIn = $('#u-count');
  const setCount = (n, typed = false) => {
    const ok = Number.isInteger(n) && n >= 1 && n <= 100000;
    countIn.setAttribute('aria-invalid', String(!ok)); $('#u-count-err').hidden = ok; $('#u-count-err').textContent = 'Choose between 1 and 100,000.';
    if (!ok) return;
    S.count = n; S.save(); if (!typed) countIn.value = n; schedule();
  };
  countIn.addEventListener('input', () => setCount(Number(countIn.value), true));
  $$('[data-step]', root).forEach((b) => b.onclick = () => { const n = Number(countIn.value) || 1; const step = n >= 1000 ? 1000 : n >= 100 ? 100 : n >= 10 ? 10 : 1; setCount(Math.max(1, Math.min(100000, n + +b.dataset.step * step))); });
  $$('[data-fmt]', root).forEach((b) => b.onclick = () => { S.fmt = b.dataset.fmt; S.save(); $$('[data-fmt]', root).forEach((y) => y.setAttribute('aria-pressed', String(y === b))); paint(); });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'r') return;
    const a = document.activeElement; if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || document.querySelector('dialog[open],.fw-popover')) return;
    e.preventDefault(); gen();
  });
  const schedule = debounce(() => gen(), 120);

  function gen() {
    const t0 = performance.now(); const f = GEN[S.ver];
    cur.list = new Array(S.count); for (let i = 0; i < S.count; i++) cur.list[i] = f();
    cur.ms = performance.now() - t0; paint();
  }
  function lines() {
    const L = cur.list; const n = L.length; const f = S.fmt;
    if (f === 'json') return { n: n + 2, at: (i) => (i === 0 ? '[' : i === n + 1 ? ']' : `  "${L[i - 1]}"${i < n ? ',' : ''}`) };
    if (f === 'quoted') return { n, at: (i) => `"${L[i]}"${i < n - 1 ? ',' : ''}` };
    return { n, at: (i) => fmtOne(L[i], f) };
  }
  const allText = () => { const l = lines(); const a = new Array(l.n); for (let i = 0; i < l.n; i++) a[i] = l.at(i); return a.join('\n') + '\n'; };
  function paint() {
    const out = $('#u-out'); const one = cur.list.length === 1; const ext = S.fmt === 'json' ? 'json' : 'txt';
    if (one) {
      const v = fmtOne(cur.list[0], S.fmt === 'quoted' ? 'lower' : S.fmt);
      out.innerHTML = `<section class="sec-gen sec-gen--uuid" aria-label="UUID">
        <div class="sec-gen__out fw-mono" id="u-one">${esc(v)}</div>
        <div class="sec-gen__actions"><button class="fw-iconbtn fw-iconbtn--outline sec-gen__new" type="button" id="u-new" aria-label="New UUID" data-tip="New UUID" data-tip-kbd="r">${icon('refresh-cw', { size: 20 })}</button>
          <button class="fw-btn fw-btn--primary fw-btn--lg sec-gen__copy" type="button" id="u-copy">${icon('copy')}<span>Copy</span></button></div>
        <div class="sec-gen__strength"><span class="fw-badge">${S.ver}${S.ver !== 'v4' ? ` · ${esc(fmtWhen(Date.now(), { seconds: true, zone: false }))}` : ' · random'}</span></div></section>`;
      enhance(out);
      $('#u-copy').onclick = (e) => copyText(v, e.currentTarget);
      $('#u-new').onclick = () => gen();
      setBar({ line: v, actions: [{ label: 'New', icon: 'refresh-cw', iconOnly: true, onClick: () => gen() }, { label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyText(v, b) }] });
      return;
    }
    const size = new Blob([allText()]).size;
    out.innerHTML = `<section class="sec-pane sec-ulist">
        <div class="sec-pane__head"><span class="sec-pane__label">${fmtN(cur.list.length)} UUIDs</span><span class="sec-pane__meta">${S.ver}${S.ver === 'v7' ? ' · sorted by creation time' : ''} · ${size > 102400 ? Math.round(size / 1024) : (size / 1024).toFixed(1)} KB · ${Math.max(1, Math.round(cur.ms))} ms</span><span class="fw-spacer"></span>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="u-new" aria-label="New UUIDs" data-tip="New UUIDs" data-tip-kbd="r">${icon('refresh-cw')}</button>
          <button class="fw-btn fw-btn--sm" type="button" id="u-copy">${icon('copy')}<span>Copy all</span></button>
          <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="u-dl">${icon('download')}<span>Download .${ext}</span></button></div>
        <div class="sec-vlist" id="u-vlist" tabindex="0" role="region" aria-label="Generated UUIDs"><div class="sec-vlist__spacer"></div><div class="sec-vlist__rows"></div></div></section>`;
    enhance(out);
    const vl = $('#u-vlist'); const ls = lines(); const RH = 28;
    vl.querySelector('.sec-vlist__spacer').style.height = ls.n * RH + 'px';
    const draw = () => {
      const first = Math.max(0, Math.floor(vl.scrollTop / RH) - 5); const last = Math.min(ls.n, first + Math.ceil(vl.clientHeight / RH) + 10);
      let html = ''; for (let i = first; i < last; i++) html += `<div class="sec-vlist__row" style="top:${i * RH}px"><span class="sec-vlist__n">${i + 1}</span>${esc(ls.at(i))}</div>`;
      vl.querySelector('.sec-vlist__rows').innerHTML = html;
    };
    vl.addEventListener('scroll', draw, { passive: true }); draw();
    $('#u-new').onclick = () => gen();
    $('#u-copy').onclick = (e) => copyText(allText(), e.currentTarget, { toastLabel: `${fmtN(cur.list.length)} UUIDs` });
    $('#u-dl').onclick = () => download(allText(), `uuids-${S.ver}-${cur.list.length}.${ext}`, ext === 'json' ? 'application/json' : 'text/plain');
    setBar({ line: `${fmtN(cur.list.length)} UUIDs · ${S.ver}`, actions: [{ label: 'Copy all', icon: 'copy', onClick: (b) => copyText(allText(), b) }, { label: 'Download', icon: 'download', primary: true, onClick: () => $('#u-dl').click() }] });
  }

  // ───────── check ─────────
  const chk = $('#u-check');
  const vrow = (l, v) => `<div class="fw-vrow"><span class="fw-vrow__label">${esc(l)}</span><span class="fw-vrow__value">${esc(v)}</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copy="${esc(v)}" aria-label="Copy ${esc(l)}" data-tip="Copy">${icon('copy')}</button></div>`;
  function check() {
    const o = $('#u-check-out'); const v = chk.value;
    if (!v.trim()) { o.innerHTML = ''; return; }
    const u = parseUuid(v);
    if (u.error) { o.innerHTML = `<p class="sec-err">${icon('circle-x', { size: 14 })}Not a UUID. ${esc(u.error)}</p>`; return; }
    const head = u.nil ? 'Nil UUID (all zeros)' : u.max ? 'Max UUID (all ones)' : u.rfc ? `Valid UUID v${u.ver} · ${u.verName}` : `Not a standard UUID · variant ${u.variant}${u.verName ? '' : `, version ${u.ver}`}`;
    const ok = u.nil || u.max || u.rfc;
    o.innerHTML = `<div class="sec-checkres"><span class="fw-verdict ${ok ? 'fw-verdict--ok' : 'fw-verdict--bad'}">${icon(ok ? 'circle-check' : 'circle-alert')} ${esc(head)}</span>
      ${u.time != null ? `<span class="sec-checktime">${icon('clock', { size: 14 })}Created ${esc(fmtWhen(u.time, { seconds: true }))} · ${esc(relHuman(u.time))}</span>` : ''}
      ${u.form !== 'canonical' ? `<span class="fw-faint fw-t-sm">Written as ${esc(u.form)}</span>` : ''}</div>
      <div class="fw-rows">${vrow('Canonical', u.canon)}${vrow('Uppercase', u.canon.toUpperCase())}${vrow('No hyphens', u.hex)}${vrow('URN', `urn:uuid:${u.canon}`)}${vrow('Base64URL', b64encode(parseHex(u.hex), { url: true }))}</div>`;
    enhance(o);
  }
  chk.addEventListener('input', check);

  api = { regen: gen, check: () => { chk.focus(); chk.scrollIntoView({ block: 'center' }); } };
  why(); gen();
  const q = params.get('q'); if (q) { chk.value = q; check(); }
  return { onPasteText: (t) => { chk.value = t.trim(); check(); chk.scrollIntoView({ block: 'nearest' }); return true; } };
}
