// JSON Formatter: input → live formatted (or minified) output. Validation is live with a wavy underline, a gutter dot
// and an inline label at the error; Repair fixes common mistakes as one undoable edit. Formatting is lossless and runs
// in a Worker (big files get a progress line, big arrays come out folded).
import { repairEdits, pathAt } from './json.js';
import {
  E, $, $$, esc, icon, enhance, toast, openMenu, copyText, kbd, isMobile, settings, keeper, pane, inputActions, outputActions, editor, textOf, setText,
  emptyHint, pickFile, readFileText, readClipboard, download, fetchSample, moreOptions, moreBtn, mobileBar, debounce, fmtN, bytes,
} from './ui.js';

let api = {};
export const config = {
  commands: [
    { id: 'json-format', label: 'Format JSON', icon: 'braces', kbd: 'mod+enter', run: () => api.setMode?.('pretty') },
    { id: 'json-minify', label: 'Minify JSON', icon: 'minimize-2', run: () => api.setMode?.('minify') },
    { id: 'json-copy', label: 'Copy output', icon: 'copy', run: () => api.copy?.() },
    { id: 'json-dl', label: 'Download .json', icon: 'download', kbd: 'mod+s', run: () => api.save?.() },
  ],
};

const SMALL = `{"order":"ORD-2026-00412","created":"2026-10-13T09:24:00Z","customer":{"name":"Lena Hartmann","email":"lena@example.com","vip":true},"items":[{"sku":"FERN-01","qty":2,"price":19.90},{"sku":"MOSS-07","qty":1,"price":4.5}],"trackingId":90071992547409931,"note":null}`;
const BROKEN = `{
  "order": "ORD-2026-00412",
  "customer": {
    "name": "Lena Hartmann",
    "email": "lena@example.com"
  }
  "items": [
    { "sku": "FERN-01", "qty": 2 },
    { "sku": "MOSS-07", "qty": 1 },
  ]
}`;

export async function mount(root, { params }) {
  const S = settings('json', { mode: 'pretty', indent: '2', sort: false });
  root.innerHTML = `
    <div class="tx-bar">
      <div class="fw-seg" aria-label="Output" id="j-mode"><button class="fw-seg__opt" type="button" data-value="pretty" aria-checked="${S.mode === 'pretty'}">${icon('braces')}Format</button><button class="fw-seg__opt" type="button" data-value="minify" aria-checked="${S.mode === 'minify'}">${icon('minimize-2')}Minify</button></div>
      <label class="tx-bar__label" for="j-indent" id="j-indent-l">Indent</label>
      <select class="fw-select" id="j-indent"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select>
      <span class="fw-spacer"></span>${moreBtn()}
    </div>
    <div class="tx-grid2">
      ${pane({ id: 'j-in', title: 'Input', actions: inputActions('j-in') })}
      ${pane({ id: 'j-out', title: 'Output', actions: outputActions('j-out') })}
    </div>`;
  enhance(root);
  $('#j-indent').value = S.indent;
  const inP = $('#j-in'), outP = $('#j-out');
  const inMeta = inP.querySelector('[data-meta]'), outMeta = outP.querySelector('[data-meta]');

  let lastErr = null, good = '', jobId = 0, summary = null;
  const input = editor(inP, { kind: 'json', hint: '', onChange: () => { syncEmpty(); keep.save(); errDecos(null); schedule(); }, onCursor: (v) => schedulePath(v) });
  const output = editor(outP, { kind: 'json', readOnly: true, onCursor: (v) => schedulePath(v) });
  const keep = keeper('json', { get: () => textOf(input), set: (t) => setText(input, t) });
  const syncEmpty = emptyHint(inP, input, {
    title: 'Paste or type JSON, or drop a .json file',
    onPaste: async () => { const t = await readClipboard(); if (t != null) setText(input, t); input.focus(); },
    onOpen: () => openFile(),
    samples: [
      { label: 'Order', run: () => setText(input, SMALL) },
      { label: 'Broken JSON', run: () => setText(input, BROKEN) },
      { label: '5 MB API response', run: async () => { busy('Loading 5 MB sample…'); setText(input, await fetchSample('samples/orders-api.json')); } },
    ],
  });

  // ── worker ──
  let worker = new Worker(new URL('./json-worker.js', import.meta.url), { type: 'module' });
  function job(msg) {
    return new Promise((res) => { const id = ++jobId; worker.onmessage = (e) => { if (e.data.id === id) res(e.data); }; worker.postMessage({ id, ...msg }); });
  }
  const progress = h2(`<div class="tx-progress" hidden><div class="fw-progress fw-progress--indeterminate fw-progress--thin"><div class="fw-progress__track"><div class="fw-progress__bar"></div></div></div><span class="tx-progress__label"></span></div>`);
  outP.querySelector('[data-body]').append(progress);
  function busy(label) { progress.hidden = !label; if (label) progress.querySelector('.tx-progress__label').textContent = label; }

  async function run() {
    const text = textOf(input);
    if (!text.trim()) { setOut(''); inMeta.textContent = ''; inMeta.className = 'tx-pane__meta'; outMeta.textContent = ''; alertOff(); summary = null; bar(); return; }
    const big = text.length > 1.5e6;
    if (big) busy(`${S.mode === 'minify' ? 'Minifying' : 'Formatting'} ${bytes(text.length)}…`);
    const myId = jobId + 1;
    const r = await job({ op: S.mode === 'minify' ? 'minify' : 'format', text, indent: S.indent, sort: S.sort });
    if (r.id !== jobId || myId !== r.id) return; // stale
    busy('');
    if (r.ok) {
      lastErr = null; summary = r.summary; alertOff(); errDecos(null);
      inMeta.className = 'tx-pane__meta is-ok'; inMeta.innerHTML = `${icon('circle-check', { size: 14 })}<span>Valid JSON · <b>${esc(r.summary.label)}</b></span>`;
      setOut(r.text); good = r.text;
      outP.classList.remove('is-stale');
      const lines = output.state.doc.lines;
      outMeta.textContent = `${fmtN(lines)} ${lines === 1 ? 'line' : 'lines'} · ${bytes(new Blob([r.text]).size)}`;
      if (lines > 400 && S.mode !== 'minify') foldBig(output);
    } else {
      lastErr = r.error; summary = null; errDecos(r.error);
      inMeta.className = 'tx-pane__meta is-bad'; inMeta.innerHTML = `${icon('circle-alert', { size: 14 })}<span>Line ${fmtN(r.error.line)}, column ${fmtN(r.error.col)}</span>`;
      outP.classList.toggle('is-stale', !!good); alertOn(r.error);
    }
    bar();
  }
  const schedule = debounce(run, 220);
  function setOut(t) {
    output.setState(E.makeState(t, { kind: 'json', readOnly: true, wrap: false }));
    output.setExtraPos('');
  }

  // ── error UI ──
  function errDecos(err) {
    if (!err) { input.dispatch({ effects: [E.layerEffect('json', []), E.setErrorLine.of(null)] }); return; }
    const doc = input.state.doc; const pos = Math.min(err.pos, doc.length); const line = doc.lineAt(pos);
    const tokEnd = Math.min(line.to, pos + Math.max(1, (/^("[^"\n]*"|[\w.+-]+|.)/.exec(doc.sliceString(pos, line.to)) || [''])[0].length));
    const specs = [E.mark(pos, Math.max(tokEnd, pos + 1), 'tb-err-underline'), E.widget(line.to, err.message, 'tb-err-inline', 1, () => jump(pos))];
    if (err.fix && typeof err.fix === 'object' && err.fix.insert) specs.push(E.widget(err.fix.from, err.fix.insert, 'tb-err-caret', 1));
    if (pos <= doc.length && tokEnd <= doc.length) input.dispatch({ effects: [E.layerEffect('json', specs), E.setErrorLine.of(pos)] });
  }
  let alertEl = null;
  function alertOn(err) {
    alertOff();
    alertEl = h2(`<div class="fw-alert fw-alert--danger tx-alert" role="alert"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body">
      <div><b>${esc(err.message)}</b> <span class="tx-alert__pos">· line ${fmtN(err.line)}, column ${fmtN(err.col)}</span></div>${err.hint ? `<div class="tx-alert__pos">${esc(err.hint)}</div>` : ''}
      <div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-a="jump">${icon('corner-down-left')}Show in input</button>${err.fix ? `<button class="fw-btn fw-btn--sm fw-btn--primary" type="button" data-a="repair">${icon('wrench')}Repair</button>` : ''}</div></div></div>`);
    outP.querySelector('[data-body]').append(alertEl);
    alertEl.querySelector('[data-a="jump"]').onclick = () => jump(err.pos);
    alertEl.querySelector('[data-a="repair"]')?.addEventListener('click', repair);
  }
  function alertOff() { alertEl?.remove(); alertEl = null; }
  function jump(pos) {
    pos = Math.min(pos, input.state.doc.length);
    input.dispatch({ selection: { anchor: pos }, effects: [E.View.scrollIntoView(pos, { y: 'center' }), E.flash.of(pos)] });
    input.focus(); setTimeout(() => input.dispatch({ effects: E.flash.of(null) }), 1400);
  }
  function repair() {
    const text = textOf(input); const r = repairEdits(text);
    let label;
    if (r.full != null) { input.dispatch({ changes: { from: 0, to: text.length, insert: r.full }, userEvent: 'input.repair' }); label = r.label; }
    else if (r.edits.length) {
      input.dispatch({ changes: r.edits.map(({ from, to, insert }) => ({ from, to, insert })), userEvent: 'input.repair', selection: { anchor: r.edits[0].from + r.edits[0].insert.length }, effects: [E.View.scrollIntoView(r.edits[0].from, { y: 'center' }), E.flash.of(r.edits[0].from)] });
      setTimeout(() => input.dispatch({ effects: E.flash.of(null) }), 1400);
      label = r.edits.length === 1 ? r.edits[0].label : `${r.edits.length} fixes: ${[...new Set(r.edits.map((e) => e.label.toLowerCase()))].join(', ')}`;
    } else { toast('Couldn’t repair this automatically. Use “Show in input” to fix it by hand.', { type: 'warning' }); return; }
    toast(label, { type: 'success', action: { label: 'Undo', onClick: () => { E.undo(input); input.focus(); } } });
    run();
  }

  // ── path at cursor (live working info in the cursor line) ──
  let pathT = 0;
  function schedulePath(v) {
    clearTimeout(pathT);
    pathT = setTimeout(() => {
      const doc = v.state.doc; if (!doc.length || doc.length > 12e6 || (v === input && lastErr)) { v.setExtraPos(''); return; }
      let pos = v.state.selection.main.head; const line = doc.lineAt(pos); const lead = line.text.length - line.text.trimStart().length;
      if (line.text.trimStart().startsWith('"')) pos = line.from + lead + 1;
      const p = pathAt(doc.toString(), pos); v.setExtraPos(p && p !== '$' ? esc(p) : '');
    }, 150);
  }

  // ── folding of big arrays (one line per item) ──
  function foldBig(view) {
    const doc = view.state.doc; const { open, text } = E.bracketIndex(doc);
    const rootAt = text.search(/\S/); if (rootAt < 0 || !open.has(rootAt)) return;
    const kidsOf = (from) => { const out = []; const close = open.get(from); for (let i = from + 1; i < close; i++) { const c = text.charCodeAt(i); if (c === 34) { i++; while (i < close && text.charCodeAt(i) !== 34) { if (text.charCodeAt(i) === 92) i++; i++; } continue; } if (c === 123 || c === 91) { out.push(i); i = open.get(i); } } return out; };
    const lists = text[rootAt] === '[' ? [rootAt] : kidsOf(rootAt).filter((p) => text[p] === '[');
    const effects = [];
    for (const arr of lists) { const kids = kidsOf(arr); if (kids.length < 40) continue; for (const k of kids) if (doc.lineAt(k).number !== doc.lineAt(open.get(k)).number) effects.push(E.foldEffect.of({ from: k + 1, to: open.get(k) })); }
    if (effects.length) view.dispatch({ effects });
  }

  // ── actions ──
  const outText = () => textOf(output);
  const fileName = () => (S.mode === 'minify' ? 'minified.json' : 'formatted.json');
  function copy(btn) { if (!outText()) { toast('Nothing to copy yet — paste some JSON first.', { type: 'info' }); return; } copyText(outText(), btn, { toastLabel: S.mode === 'minify' ? 'minified JSON' : 'formatted JSON' }); }
  function save() { const t = outText() || textOf(input); if (!t) return; download(t, fileName(), 'application/json'); }
  async function openFile() { const f = await pickFile('.json,.geojson,application/json,text/plain'); if (f) await load(f); }
  async function load(f) { if (f.size > 1.5e6) busy(`Reading ${f.name}…`); const t = await readFileText(f); if (t != null) setText(input, t); }
  $('#j-in-open').onclick = openFile;
  $('#j-in-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setText(input, t); input.focus(); };
  $('#j-in-clear').onclick = () => { const old = textOf(input); if (!old) return; setText(input, ''); keep.clear(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(input, old) } }); input.focus(); };
  $('#j-out-copy').onclick = (e) => copy(e.currentTarget);
  $('#j-out-dl').onclick = save;
  $('#j-out-more').onclick = (e) => openMenu(e.currentTarget, [
    { label: 'Use output as input', icon: 'arrow-left-right', onSelect: () => { const t = outText(); if (t) setText(input, t); } },
    { label: `Download ${fileName()}`, icon: 'download', kbd: 'mod+s', onSelect: save },
  ], { placement: 'bottom-end' });
  const setMode = (m) => { S.mode = m; S.save(); $$('#j-mode .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m))); syncIndent(); run(); };
  $('#j-mode').addEventListener('fw-change', (e) => setMode(e.detail.value));
  function syncIndent() { const off = S.mode === 'minify'; $('#j-indent').hidden = off; $('#j-indent-l').hidden = off; }
  syncIndent();
  $('#j-indent').onchange = (e) => { S.indent = e.target.value; S.save(); run(); };
  $('#more-opts').onclick = (e) => moreOptions(e.currentTarget, {
    html: `<label class="fw-toggle"><input type="checkbox" id="j-sort" ${S.sort ? 'checked' : ''}><span>Sort keys A → Z<span class="tx-opt-sub">Nested objects too</span></span></label><hr>${keep.toggleHtml()}`,
    wire: (el) => { el.querySelector('#j-sort').onchange = (ev) => { S.sort = ev.target.checked; S.save(); run(); }; keep.wire(el); input.refreshPos(); },
  });
  root.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 'Enter') { e.preventDefault(); schedule.cancel(); run(); }
    else if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); }
  });

  // ── mobile: primary action in thumb reach ──
  function bar() {
    const line = lastErr ? `<span style="color:var(--danger)">${icon('circle-alert', { size: 14 })} Line ${fmtN(lastErr.line)}: ${esc(lastErr.message)}</span>` : summary ? `${icon('circle-check', { size: 14 })} Valid · ${esc(summary.label)}` : '<span class="fw-faint">Paste JSON to format it</span>';
    const b = mobileBar(root, { line, actions: lastErr && lastErr.fix ? `<button class="fw-btn" type="button" id="m-fix">${icon('wrench')}Repair</button>` : `<button class="fw-btn fw-btn--primary" type="button" id="m-copy" ${summary ? '' : 'disabled'}>${icon('copy')}Copy</button>` });
    b.querySelector('#m-copy')?.addEventListener('click', (e) => copy(e.currentTarget));
    b.querySelector('#m-fix')?.addEventListener('click', repair);
  }
  bar();

  api = { setMode, copy: () => copy($('#j-out-copy')), save };
  if (!keep.restore() && params.get('sample')) {
    const s = params.get('sample');
    if (s === 'broken') setText(input, BROKEN); else if (s === 'big') { busy('Loading 5 MB sample…'); setText(input, await fetchSample('samples/orders-api.json')); } else setText(input, SMALL);
  }
  if (params.get('q')) setText(input, params.get('q'));
  if (!matchMedia('(pointer: coarse)').matches) input.focus();
  return {
    input, output, run,
    onFiles: async (files) => { const f = files[0]; if (f) await load(f); },
    onPasteText: (t) => { setText(input, t); input.focus(); return true; },
  };
}
function h2(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
