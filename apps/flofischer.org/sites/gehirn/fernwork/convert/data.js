// Convert mockup · Data Converter (today's "Data" tab): paste or open → live output. From (auto-detect) ⇄ To; Copy and
// Download on the output. More options: CSV delimiter, file encoding, type inference, decimal separator (explicit, owner rule).
import { frame, renderRelated, pickFormat, targetBtn, moreBtn, moreOptions, field, select, seg, toggle, download,
  icon, esc, $, store, toast, enhance, formatBytes, kbd } from './common.js';
import { DATA_FORMATS, EXT, detectFormat, detectDelimiter, looksDecimalComma, parse, serialize, friendly, highlight, SAMPLES } from './dataconv.js';
import { copyText, navigate } from '../kit/shell.js';

const NAME = Object.fromEntries(DATA_FORMATS.map(([id, n]) => [id, n]));
const GROUPS = (auto) => [
  ...(auto ? [{ label: '', items: [['auto', 'Auto-detect', 'Recognise the format from the text']] }] : []),
  { label: 'Data', items: DATA_FORMATS.filter(([id]) => ['json', 'json5', 'yaml', 'toml', 'xml', 'ndjson'].includes(id)) },
  { label: 'Tables', items: DATA_FORMATS.filter(([id]) => ['csv', 'tsv'].includes(id)) },
];
const ENCODINGS = [['auto', 'Auto (UTF-8 / Windows-1252)'], ['utf-8', 'UTF-8'], ['windows-1252', 'Windows-1252'], ['iso-8859-1', 'ISO-8859-1']];
const DELIM_NAME = { ',': 'commas', ';': 'semicolons', '\t': 'tabs', '|': 'pipes' };
const DEF = { delimiter: 'auto', encoding: 'auto', inferTypes: true, decimalComma: false };

export function init(ctx) {
  const o = { ...DEF, ...(store.get('cv-data-opts') || {}) };
  let from = ctx.preset?.from || 'auto';
  let to = ctx.preset?.to || store.get('cv-target-data') || 'yaml';
  let fileBuf = null; let fileName = ''; let detected = null; let out = ''; let dismissedHint = false;

  $('#cv-tool').innerHTML = `
    <div class="cv-bar"><span class="cv-grp"><span class="cv-bar__label">From</span>${targetBtn('cv-from', fromLabel())}</span>
      <button class="fw-iconbtn cv-swap" type="button" id="cv-swap" aria-label="Swap: use the output as input" data-tip="Swap">${icon('arrow-left-right')}</button>
      <span class="cv-grp"><span class="cv-bar__label">To</span>${targetBtn('cv-target', NAME[to])}</span>
      ${moreBtn()}<span class="fw-spacer"></span></div>
    <div class="cv-opts" id="cv-opts" hidden></div>
    <div class="cv-data">
      <section class="cv-pane" id="pane-in" aria-label="Input">
        <header class="cv-pane__head"><span class="cv-pane__title">Input</span><span class="cv-pane__meta" id="in-meta"></span><span class="fw-spacer"></span>
          <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="in-open">${icon('folder-open')}<span class="cv-hide-xs">Open file</span></button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="in-clear" aria-label="Clear input" data-tip="Clear" hidden>${icon('x')}</button>
          <input type="file" id="in-file" hidden accept=".json,.json5,.yaml,.yml,.toml,.xml,.csv,.tsv,.ndjson,.jsonl,.txt,text/*"></header>
        <div id="in-alert"></div>
        <textarea class="cv-code" id="in" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Input data"></textarea>
        <div class="cv-pane__empty" id="in-empty"><span class="cv-pane__empty-title"><span class="fw-pointer-copy">Paste ${ctx.preset ? NAME[ctx.preset.from] : 'data'} or drop a file</span><span class="fw-touch-copy">Paste ${ctx.preset ? NAME[ctx.preset.from] : 'data'} or open a file</span></span>
          <span class="fw-intake__sub"><button class="fw-btn fw-btn--sm fw-touch-copy" type="button" id="in-paste">${icon('clipboard-paste')}Paste</button><span class="fw-pointer-copy">${kbd('mod+v')}</span><a href="#" id="in-sample">Try a sample</a></span></div>
      </section>
      <section class="cv-pane" id="pane-out" aria-label="Output">
        <header class="cv-pane__head"><span class="cv-pane__title">Output</span><span class="cv-pane__meta xs-hide" id="out-meta"></span><span class="fw-spacer"></span>
          <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="out-copy" disabled>${icon('copy')}<span class="xs-hide">Copy</span></button>
          <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="out-dl" disabled>${icon('download')}<span>Download</span></button></header>
        <pre class="cv-code cv-code--out" id="out" tabindex="0" aria-live="off" aria-label="Output data"></pre>
        <div class="cv-pane__out-empty" id="out-empty">The result appears here as you type.</div>
      </section>
    </div>`;
  frame(ctx, { accept: ['data', 'text', 'sheet'], acceptLabel: 'Data Converter', onFiles: (f) => openFile(f[0]),
    onPasteText: (t) => { if (document.activeElement === $('#in')) return false; setInput(t); return true; },
    lede: ctx.preset ? `Paste ${NAME[ctx.preset.from]} or open a file. ${NAME[ctx.preset.to]} appears as you type.` : undefined,
    commands: [{ id: 'swap', label: 'Swap input and output', icon: 'arrow-left-right', run: () => $('#cv-swap').click() }, { id: 'dl', label: 'Download output', icon: 'download', kbd: 'mod+s', run: () => $('#out-dl').click() }] });
  enhance($('#cv-tool'));
  renderRelated(ctx);

  const inEl = $('#in'); const outEl = $('#out');
  function fromLabel() { return from === 'auto' ? (detected ? `Auto · ${NAME[detected]}` : 'Auto-detect') : NAME[from]; }
  const setInput = (t, { name = '', keepFile = false } = {}) => { if (!keepFile) { fileBuf = null; fileName = name; } inEl.value = t; run(); };

  // ── convert (live, debounced) ──
  let timer = 0;
  inEl.addEventListener('input', () => { fileBuf = null; clearTimeout(timer); timer = setTimeout(run, 180); $('#in-empty').hidden = !!inEl.value; });
  function run() {
    const text = inEl.value; $('#in-empty').hidden = !!text; $('#in-clear').hidden = !text;
    const alert = $('#in-alert'); alert.innerHTML = '';
    detected = text.trim() ? (from === 'auto' ? (fileName && extFormat(fileName)) || detectFormat(text) : from) : null;
    $('#cv-from [data-l]').textContent = fromLabel();
    const src = detected;
    if (!src) { out = ''; outEl.innerHTML = ''; $('#out-empty').hidden = false; $('#in-meta').textContent = ''; $('#out-meta').textContent = ''; setOut(false); return; }
    const d = src === 'csv' ? (o.delimiter === 'auto' ? detectDelimiter(text) || ',' : { comma: ',', semicolon: ';', tab: '\t', pipe: '|' }[o.delimiter]) : null;
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
    $('#in-meta').textContent = `${NAME[src]}${d ? ` · ${DELIM_NAME[d]}` : ''} · ${lines} ${lines === 1 ? 'line' : 'lines'}`;
    try {
      const value = parse(text, src, o);
      out = serialize(value, to, { delimiter: o.delimiter === 'auto' ? 'comma' : o.delimiter });
      outEl.classList.remove('is-stale'); outEl.innerHTML = highlight(out, to); $('#out-empty').hidden = true;
      const n = Array.isArray(value) ? value.length : 1;
      $('#out-meta').textContent = `${NAME[to]} · ${Array.isArray(value) ? `${n} ${n === 1 ? 'item' : 'items'} · ` : ''}${formatBytes(new Blob([out]).size)}`;
      setOut(true);
      if (src === 'csv' || src === 'tsv') hintDecimal(text, alert);
    } catch (e) {
      const f = friendly(e, src);
      let where = '';
      if (f.pos != null) { const before = text.slice(0, f.pos); where = ` (line ${before.split('\n').length})`; }
      alert.innerHTML = `<div class="fw-alert fw-alert--danger" role="alert"><span class="fw-alert__icon">${icon('circle-alert', { size: 16 })}</span><div class="fw-alert__body"><span>${esc(f.msg + where)}</span>
        ${from !== 'auto' ? `<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-auto>Detect the format instead</button></div>` : ''}</div></div>`;
      alert.querySelector('[data-auto]')?.addEventListener('click', () => { from = 'auto'; run(); });
      outEl.classList.add('is-stale'); $('#out-meta').textContent = 'out of date'; setOut(false);
    }
  }
  function hintDecimal(text, alert) {
    if (o.decimalComma || dismissedHint || !o.inferTypes || !looksDecimalComma(text)) return;
    alert.innerHTML = `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('info', { size: 16 })}</span><div class="fw-alert__body"><span>Numbers like <b class="fw-mono">15.230,50</b> look like decimal commas. They stay text until you say so.</span>
      <div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-dc>Read 1.234,5 as numbers</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-no>Keep as text</button></div></div></div>`;
    alert.querySelector('[data-dc]').onclick = () => { o.decimalComma = true; save(); run(); more.refresh(); toast('Decimal comma on · remembered for next time', { type: 'neutral', duration: 2200 }); };
    alert.querySelector('[data-no]').onclick = () => { dismissedHint = true; alert.innerHTML = ''; };
  }
  const setOut = (ok) => { $('#out-copy').disabled = !ok; $('#out-dl').disabled = !ok; };
  const extFormat = (n) => { const e = n.split('.').pop().toLowerCase(); const m = { yml: 'yaml', jsonl: 'ndjson' }[e] || e; return NAME[m] ? m : null; };

  // ── files and encodings ──
  async function openFile(file) {
    if (!file) return;
    if (/\.(xlsx|xls|ods|numbers)$/i.test(file.name)) { toast(`${file.name} is a spreadsheet`, { type: 'neutral', action: { label: 'Open in Table Converter', onClick: () => navigate('convert-tables', { files: [file] }) } }); return; }
    fileBuf = await file.arrayBuffer(); fileName = file.name;
    if (from !== 'auto' && extFormat(file.name) && extFormat(file.name) !== from) from = 'auto';
    setInput(decode(fileBuf), { name: file.name, keepFile: true });
    toast(`Opened ${file.name}`, { type: 'neutral', duration: 1600 });
  }
  function decode(buf) {
    if (o.encoding !== 'auto') return new TextDecoder(o.encoding).decode(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
  }
  $('#in-open').onclick = () => $('#in-file').click();
  $('#in-file').onchange = (e) => { openFile(e.target.files[0]); e.target.value = ''; };
  $('#in-clear').onclick = () => { const old = inEl.value; setInput(''); toast('Input cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setInput(old) } }); };
  $('#in-sample').onclick = (e) => { e.preventDefault(); setInput(SAMPLES[from === 'auto' ? (ctx.preset?.from || 'csv') : from] || SAMPLES.csv); };
  $('#in-paste').onclick = async () => { try { setInput(await navigator.clipboard.readText()); } catch { inEl.focus(); toast('Long-press in the box to paste', { type: 'neutral' }); } };
  const pane = $('#pane-in');
  pane.addEventListener('dragover', (e) => { e.preventDefault(); pane.classList.add('is-over'); });
  pane.addEventListener('dragleave', () => pane.classList.remove('is-over'));
  pane.addEventListener('drop', () => pane.classList.remove('is-over'));

  // ── output actions, swap, pickers ──
  $('#out-copy').onclick = (e) => copyText(out, e.currentTarget, { toastLabel: `${NAME[to]} copied` });
  $('#out-dl').onclick = () => { if (!out) return; download(new Blob([out], { type: 'text/plain;charset=utf-8' }), `${(fileName || 'converted').replace(/\.[^.]+$/, '')}.${EXT[to]}`); };
  $('#cv-swap').onclick = () => {
    if (!out) { const f = from === 'auto' ? 'json' : from; from = to; to = f; paintPick(); run(); return; }
    const prevSrc = detected || 'json'; const t = out; from = to; to = prevSrc; fileName = ''; setInput(t); paintPick();
  };
  function paintPick() { $('#cv-from [data-l]').textContent = fromLabel(); $('#cv-target [data-l]').textContent = NAME[to]; }
  $('#cv-from').onclick = (e) => pickFormat(e.currentTarget, { groups: GROUPS(true), current: from, label: 'Input format', onPick: (f) => { from = f; paintPick(); run(); more.refresh(); } });
  $('#cv-target').onclick = (e) => pickFormat(e.currentTarget, { groups: GROUPS(false), current: to, label: 'Output format', onPick: (f) => { to = f; store.set('cv-target-data', f); paintPick(); run(); } });

  // ── More options ──
  const save = () => store.set('cv-data-opts', o);
  const more = moreOptions({
    button: $('.cv-more'), panel: $('#cv-opts'),
    summary: () => [o.delimiter !== 'auto' && `${o.delimiter}`, o.encoding !== 'auto' && o.encoding, !o.inferTypes && 'values as text', o.decimalComma && 'decimal comma'].filter(Boolean).join(' · '),
    render: (p) => {
      p.innerHTML = `<div class="cv-opts__grid">
        <div class="cv-opts__group">${field('CSV delimiter', select('o-delim', [['auto', 'Auto-detect'], ['comma', 'Comma'], ['semicolon', 'Semicolon'], ['tab', 'Tab'], ['pipe', 'Pipe']], o.delimiter), { id: 'o-delim' })}
          ${field('File encoding', select('o-enc', ENCODINGS, o.encoding), { id: 'o-enc', hint: 'For files with broken umlauts (ä shows as Ã¤).' })}</div>
        <div class="cv-opts__group">${toggle('o-infer', 'Detect numbers, true/false and null', o.inferTypes, 'Off: every value stays text.')}
          ${field('Decimal separator', seg('o-dec', 'Decimal separator', [['point', 'Point · 1,234.5'], ['comma', 'Comma · 1.234,5']], o.decimalComma ? 'comma' : 'point'))}</div></div>`;
      p.querySelector('#o-delim').onchange = (e) => { o.delimiter = e.target.value; save(); more.paint(); run(); };
      p.querySelector('#o-enc').onchange = (e) => { o.encoding = e.target.value; save(); more.paint(); if (fileBuf) setInput(decode(fileBuf), { name: fileName, keepFile: true }); };
      p.querySelector('#o-infer').onchange = (e) => { o.inferTypes = e.target.checked; save(); more.paint(); run(); };
      p.querySelector('#o-dec').addEventListener('fw-change', (e) => { o.decimalComma = e.detail.value === 'comma'; save(); more.paint(); run(); });
    },
  });
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && out) { e.preventDefault(); $('#out-dl').click(); } });
  if (!matchMedia('(pointer: coarse)').matches) inEl.focus({ preventScroll: true });
  run();
}
