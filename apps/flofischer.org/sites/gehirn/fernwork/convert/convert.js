// Fernwork One · Convert ("One Drop"). Archetype B · Queue. Real: drop/paste/pick, probing, image encoding in a worker
// pool (JPG/WebP/PNG), video frames, CSV→JSON/YAML/…, ZIP. Simulated: video/audio/doc encoders (timed, size estimates).
import {
  mountShell, getLeaf, icon, esc, formatBytes, extOf, fileKind, toast, openDialog, openSheet, openPopover, openMenu, enhance,
  $, $$, h, kbd, isMobile, isCoarse, isTyping, hasLayers, store, navigate, refreshLeafLinks, copyText, presetsOf, MOD,
} from '../kit/shell.js';
import { FMT, GROUPS, PALETTE, PRESETS, CHIPS, smartTarget, estimateImage, estimateMedia, estimateOther, fmtTime, fmtClock } from './formats.js';
import { detect, convertText, highlight, DELIM_NAME } from './textconv.js';
import { makeZip } from './zip.js';

// ───────────────────────────── page mode ─────────────────────────────
const params = new URLSearchParams(location.search);
const leaf = getLeaf(params.get('leaf') || '');
const preset = leaf && PRESETS[leaf.id] ? { id: leaf.id, name: leaf.name, ...PRESETS[leaf.id] } : null;
let filter = (!preset && leaf && CHIPS.find((c) => c.leaf === leaf.id)?.key) || 'all';
const intent = preset ? FMT[preset.to]?.kind : filter; // 'audio' → videos default to MP3
const A = './assets/';
const SAMPLES = {
  heic: `${A}IMG_4031.jpg>IMG_4031.HEIC|${A}IMG_4032.jpg>IMG_4032.HEIC|${A}IMG_4033.jpg>IMG_4033.HEIC`,
  mov: `${A}IMG_4040.MOV`,
  logo: `${A}kestrel-logo.png|${A}kestrel-icon.png`,
  jpg: `${A}IMG_4031.jpg|${A}IMG_4032.jpg`,
  docx: '../kit/samples/report.docx',
  mixed: `${A}IMG_4031.jpg>IMG_4031.HEIC|${A}IMG_4032.jpg>IMG_4032.HEIC|${A}IMG_4033.jpg>IMG_4033.HEIC|${A}IMG_4034.jpg>IMG_4034.HEIC|${A}kestrel-logo.png|${A}kestrel-icon.png|${A}IMG_4040.MOV|${A}IMG_4037.HEIC|../kit/samples/notes.txt`,
};
export const SAMPLE_CSV = `Kunde;Ort;Umsatz;Bestellungen;Aktiv;Kunde seit
Müller GmbH;Köln;5.692,04;14;ja;2019-03-01
Bäckerei Sonnenschein;München;1.204,50;3;nein;2022-11-15
Weiß & Söhne;Düsseldorf;12.880,00;41;ja;2017-06-30
Café Größenwahn;Würzburg;389,90;1;ja;2024-02-09`;

mountShell({
  ...(leaf ? { leaf: leaf.id } : { category: 'convert' }),
  archetype: 'queue', accept: ['*'], acceptLabel: 'Convert · each file gets its best format',
  onFiles: (files) => addFiles(files),
  onPasteText: (t) => { addPaste(t); return true; },
  shortcuts: [
    { label: 'Add files', keys: 'mod+o' }, { label: 'Download all', keys: 'mod+s' },
    { label: 'Next / previous file', keys: 'down up' }, { label: 'Change format of the focused file', keys: 'f' },
    { label: 'Compare before and after', keys: 'c' }, { label: 'Trim and resize a video', keys: 'e' }, { label: 'Remove the focused file', keys: 'backspace' },
  ],
});
document.title = `${preset ? preset.name : 'Convert'} · Fernwork`;

// ───────────────────────────── state ─────────────────────────────
const items = []; let seq = 0;
const groupTarget = {}; // user's choice per group
const DEF = { quality: 85, edge: 0, maxKB: '', keepMeta: true, keepGPS: false, matte: '#ffffff', res: 'orig', vq: 'balanced', sound: true };
const settings = {}; const S = (g) => (settings[g] ||= { ...DEF });
const ORDER = ['paste', 'photo', 'graphic', 'video', 'audio', 'sheet', 'data', 'doc', 'text', 'broken'];
const MAXPAR = 3;
let inspectorOpen = false; let scope = null; let selectedId = null;

const presetFor = (it) => (preset && (preset.from.includes(it.ext) || (it.kind === 'paste' && preset.from.includes('paste'))) ? preset.to : null);
function targetOf(it) {
  if (it.group === 'broken' || it.group === 'text' && !it.target) return it.target || null;
  return it.target || groupTarget[it.group] || presetFor(it) || store.get('convert-last-' + it.group) || smartTarget(it.group, it.ext, intent);
}
const base = (n) => n.replace(/\.[^.]+$/, '');
const isImg = (it) => it.group === 'photo' || it.group === 'graphic';
const noun = (g, n) => (n === 1 ? GROUPS[g].one : GROUPS[g].many);
const chipKey = (it) => GROUPS[it.group]?.chip || ({ image: 'image', video: 'video', audio: 'audio', sheet: 'sheet', data: 'data' }[it.kind] || 'doc');

// ───────────────────────────── worker pool (real) ─────────────────────────────
const workers = Array.from({ length: MAXPAR }, () => new Worker(new URL('./worker.js', import.meta.url)));
const pending = new Map(); let jobSeq = 0; let wNext = 0;
workers.forEach((w) => (w.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.res(e.data) : p.rej(new Error(e.data.error)); }));
const work = (op, file, opts) => new Promise((res, rej) => { const id = ++jobSeq; pending.set(id, { res, rej }); workers[wNext++ % workers.length].postMessage({ id, op, file, opts }); });

// ───────────────────────────── header / intake / below ─────────────────────────────
const CAMERA = '<svg class="fw-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';

function renderHead() {
  const has = items.length > 0;
  const head = $('#cv-head');
  if (preset && !has) { head.innerHTML = ''; return; }
  if (preset) {
    head.innerHTML = `<header class="fw-page-header cv-head--compact"><div class="fw-page-header__top"><div class="fw-page-header__titles">
      <h1 class="fw-h1">${esc(preset.name)}</h1><p class="fw-lede">Any file works · ${esc(preset.from.filter((f) => f !== 'paste').map((f) => f.toUpperCase()).slice(0, 2).join(' and '))} become ${esc(preset.to)}, everything else gets its best format.</p></div></div></header>`;
    return;
  }
  const counts = {}; items.forEach((it) => { const k = chipKey(it); counts[k] = (counts[k] || 0) + 1; });
  head.innerHTML = `<header class="fw-page-header ${has ? 'cv-head--compact' : ''}"><div class="fw-page-header__top"><div class="fw-page-header__titles">
      <h1 class="fw-h1">Convert</h1>${has ? '' : '<p class="fw-lede">Drop anything. Every file gets the right format, right here on this device.</p>'}</div>
      <div class="fw-page-header__aside"><button class="fw-iconbtn" type="button" id="cv-keys" aria-label="Keyboard shortcuts" data-tip="Shortcuts" data-tip-kbd="?">${icon('keyboard', { size: 18 })}</button></div></div>
    <nav class="fw-subchips cv-filters" aria-label="Show file types" data-roving="button">${CHIPS.map((c) => {
      const n = c.key === 'all' ? items.length : counts[c.key] || 0;
      return `<button class="fw-chip" type="button" data-filter="${c.key}" aria-pressed="${filter === c.key}">${esc(c.label)}${has && n ? `<span class="cv-count">${n}</span>` : ''}</button>`;
    }).join('')}</nav></header>`;
  enhance(head);
  $('#cv-keys').onclick = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
  $$('[data-filter]', head).forEach((b) => (b.onclick = () => setFilter(b.dataset.filter)));
}
function setFilter(key) {
  filter = key;
  const c = CHIPS.find((x) => x.key === key);
  const u = new URL(location.href); if (c.leaf) u.searchParams.set('leaf', c.leaf); else u.searchParams.delete('leaf'); history.replaceState(null, '', u);
  renderHead(); if (!items.length) renderIntake(); applyFilter();
  $(`[data-filter="${key}"]`)?.focus({ preventScroll: true });
}
function applyFilter() {
  items.forEach((it) => { it.el.hidden = filter !== 'all' && chipKey(it) !== filter; });
  const hiddenN = items.filter((it) => it.el.hidden).length;
  $('#cv-filter-note').hidden = !hiddenN;
  if (hiddenN) $('#cv-filter-note').innerHTML = `${icon('eye-off', { size: 14 })}<span>${hiddenN} other ${hiddenN === 1 ? 'file' : 'files'} hidden by the filter</span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button">Show all</button>`;
  $('#cv-filter-note button')?.addEventListener('click', () => setFilter('all'));
  syncRoving();
}

const INTAKE_COPY = {
  all: ['Drop anything to convert it', 'Choose anything to convert', 'Photos, videos, audio, spreadsheets, documents and data. Each file gets the best format; you can change any of them.'],
  image: ['Drop images to convert them', 'Choose images', 'HEIC, PNG, WebP, AVIF, TIFF and more. Transparency is kept where it can be. Any other file works too.'],
  video: ['Drop videos to convert them', 'Choose videos', 'MOV, MKV, WebM, AVI to MP4, GIF or sound only. Trim when you need to. Any other file works too.'],
  audio: ['Drop audio or video', 'Choose audio or video', 'WAV, FLAC, M4A to MP3 and back. Videos become MP3 here. Any other file works too.'],
  data: ['Drop or paste data', 'Choose data files', 'JSON, YAML, XML, CSV, TOML. Paste text with ⌘V and it converts live. Any other file works too.'],
  sheet: ['Drop spreadsheets', 'Choose spreadsheets', 'XLSX, ODS, CSV. Every sheet is kept, numbers stay numbers. Any other file works too.'],
  doc: ['Drop documents', 'Choose documents', 'Word, ODT, RTF, Markdown, HTML to PDF with selectable text, and back. Any other file works too.'],
};
const sampleChip = (label, spec, extra = '') => `<button class="fw-chip fw-chip--sample" type="button" ${spec ? `data-sample="${esc(spec)}"` : ''} ${extra}>${label}</button>`;
const ARROW = '<span class="cv-arr" aria-hidden="true">→</span>';
function samplesHtml() {
  const s = {
    heic: sampleChip(`HEIC ${ARROW} JPG`, SAMPLES.heic, 'aria-label="Try HEIC to JPG with 3 sample photos"'),
    mov: sampleChip(`MOV ${ARROW} MP4`, SAMPLES.mov, 'aria-label="Try MOV to MP4 with a sample clip"'),
    logo: sampleChip(`PNG logo ${ARROW} WebP`, SAMPLES.logo, 'aria-label="Try transparent PNG logos"'),
    csv: sampleChip(`CSV ${ARROW} JSON`, '', 'data-paste-sample aria-label="Try pasting a CSV table"'),
    mixed: sampleChip('Mixed batch', SAMPLES.mixed, 'aria-label="Try a mixed batch of 9 files"'),
  };
  const order = { image: ['heic', 'logo', 'mixed'], video: ['mov', 'mixed'], audio: ['mov', 'mixed'], data: ['csv', 'mixed'], sheet: ['csv', 'mixed'], doc: ['csv', 'mixed'] }[filter] || ['heic', 'mov', 'logo', 'csv', 'mixed'];
  return `<span class="fw-intake__samples"><span class="cv-try">Try</span>${order.map((k) => s[k]).join('')}</span>`;
}
const textFirst = () => (preset ? !['image', 'video', 'audio'].includes(FMT[preset.to]?.kind) && !preset.from.some((f) => ['mp4', 'mov', 'wav', 'flac', 'm4a'].includes(f)) : ['data', 'sheet', 'doc'].includes(filter));
function pickButtons(label = 'Choose files') {
  return `<span class="fw-intake__actions">
      <button class="fw-btn fw-btn--primary cv-pointer" type="button" data-pick>${icon('folder-open')}${esc(label)}</button>
      <button class="fw-btn cv-pointer" type="button" data-folder>${icon('folder')}Choose folder</button>
      ${textFirst() ? `<button class="fw-btn fw-btn--primary cv-touch" type="button" data-paste>${icon('clipboard-paste')}Paste text</button>
      <button class="fw-btn cv-touch" type="button" data-pick>${icon('folder')}Files</button>` : `<button class="fw-btn fw-btn--primary cv-touch" type="button" data-media>${icon('images')}${preset?.noun === 'photos' ? 'Choose photos' : 'Photos & videos'}</button>
      <button class="fw-btn cv-touch" type="button" data-pick>${icon('folder')}Files</button>
      <button class="fw-iconbtn fw-iconbtn--outline cv-touch" type="button" data-camera aria-label="Take a photo">${CAMERA}</button>`}
      ${preset ? '' : `<button class="fw-btn fw-btn--ghost cv-pointer" type="button" data-paste>${icon('clipboard-paste')}Paste text</button>`}
    </span>`;
}
function renderIntake() {
  const has = items.length > 0;
  const el = $('#cv-intake');
  if (has) {
    el.innerHTML = `<div class="fw-intake fw-intake--slim cv-slim" data-intake aria-label="Add more files">
      <span class="fw-intake__icon">${icon('plus', { size: 18 })}</span><span class="fw-intake__title">Add files</span>
      <span class="fw-intake__sub fw-hide-mobile">drop anywhere, paste ${kbd('mod+v')} or click</span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm cv-pointer" type="button" data-folder>${icon('folder')}Folder</button>
      <button class="fw-iconbtn fw-iconbtn--sm cv-touch" type="button" data-camera aria-label="Take a photo">${CAMERA}</button></div>`;
  } else if (preset) {
    const from = preset.from.filter((f) => f !== 'paste')[0]?.toUpperCase() || 'Files';
    el.innerHTML = `<section class="cv-hero" aria-labelledby="cv-h1">
      <div class="cv-hero__head"><h1 class="cv-hero__h1" id="cv-h1">${esc(preset.name)}</h1>
        <p class="cv-hero__lede">${esc(preset.lede)} Privately, in your browser.</p></div>
      <div class="fw-intake cv-drop cv-drop--card" data-intake aria-label="Choose ${esc(preset.noun)}, or drop them here">
        <span class="fw-intake__icon">${icon('upload', { size: 22 })}</span>
        <span class="fw-intake__title"><span class="fw-pointer-copy">Drop ${esc(preset.noun.includes(preset.from[0].toUpperCase()) ? '' : preset.from[0].toUpperCase() + ' ')}${esc(preset.noun)} here</span><span class="fw-touch-copy">${textFirst() ? `Paste a table or choose ${esc(preset.noun.replace(/ or text$/, ''))}` : `Pick ${esc(preset.noun)} from your phone`}</span></span>
        <span class="fw-intake__sub">Anything else works too: PNGs, videos, spreadsheets, documents.</span>
        ${pickButtons(`Choose ${preset.noun}`)}
        <span class="fw-intake__sub fw-pointer-copy">or paste with ${kbd('mod+v')}<span class="fw-dot"></span>${preset.sample === 'csv' ? '<a href="#" data-paste-sample>Try a sample table</a>' : `<a href="#" data-sample="${esc(SAMPLES[preset.sample] || SAMPLES.heic)}">Try ${preset.sample === 'heic' ? '3 iPhone photos' : 'a sample'}</a>`}</span>
      </div>
      <div class="cv-hero__foot"><span class="cv-hero__route"><span class="fw-badge fw-badge--mono">${esc(from)}</span>${ARROW}<button class="fw-target" type="button" id="cv-preset-target" aria-haspopup="dialog" aria-expanded="false">${esc(groupTarget[presetGroup()] || preset.to)}${icon('chevron-down', { size: 14 })}</button></span>
        <span class="cv-hero__facts">${preset.to === 'JPG' || preset.to === 'WebP' ? 'Quality 85 · location removed' : 'Original quality'}</span>
        <span class="fw-intake__privacy">${icon('lock', { size: 12 })} On this device · 0 uploads</span></div>
    </section>`;
    $('#cv-preset-target').onclick = (e) => openPalette(e.currentTarget, { group: presetGroup(), current: groupTarget[presetGroup()] || preset.to, onPick: (f) => { groupTarget[presetGroup()] = f; preset.to = f; renderIntake(); } });
  } else {
    const [t, tt, sub] = INTAKE_COPY[filter] || INTAKE_COPY.all;
    el.innerHTML = `<div class="fw-intake cv-drop" data-intake aria-label="Choose files to convert, or drop them here">
      <span class="fw-intake__icon">${icon('arrow-left-right', { size: 22 })}</span>
      <span class="fw-intake__title"><span class="fw-pointer-copy">${esc(t)}</span><span class="fw-touch-copy">${esc(tt)}</span></span>
      <span class="cv-drop__lede">${esc(sub)}</span>
      ${pickButtons()}
      <span class="fw-intake__sub fw-pointer-copy">or paste files and text with ${kbd('mod+v')} anywhere on this page</span>
      ${samplesHtml()}
      <span class="fw-intake__privacy">${icon('lock', { size: 12 })} Never leaves this device · works offline</span></div>`;
  }
  enhance(el);
  wirePickers(el);
}
const presetGroup = () => (FMT[preset.to]?.kind === 'image' ? (preset.from.includes('png') && !preset.from.includes('jpg') ? 'graphic' : 'photo') : FMT[preset.to]?.kind === 'audio' ? 'video' : preset.from.includes('paste') ? 'paste' : ({ sheet: 'sheet', data: 'data', doc: 'doc', video: 'video' }[FMT[preset.to]?.kind] || 'photo'));

function pickWith(attrs) {
  const inp = h(`<input type="file" hidden multiple ${attrs}>`); document.body.append(inp);
  inp.addEventListener('change', () => { const f = [...inp.files]; inp.remove(); if (f.length) addFiles(f); });
  inp.click();
}
function wirePickers(root) {
  $$('[data-folder]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); pickWith('webkitdirectory'); }));
  $$('[data-media]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); pickWith('accept="image/*,video/*"'); }));
  $$('[data-camera]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); pickWith('accept="image/*" capture="environment"'); }));
  $$('[data-paste]', root).forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); let t = ''; try { t = await navigator.clipboard.readText(); } catch { /* permission */ } addPaste(t || '', { focus: !t }); }));
  $$('[data-paste-sample]', root).forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); addPaste(SAMPLE_CSV); }));
}

function renderBelow() {
  const el = $('#cv-below');
  if (preset) {
    const [from, to] = preset.name.split(' to ');
    const faq = [
      [`Are my ${preset.noun} uploaded?`, `No. ${from} files are converted by code running in this browser tab. Nothing is sent to a server, and it keeps working offline.`],
      ['Can I drop other files here?', `Yes. This is the full Fernwork converter with ${to} preset for ${from}. PNGs, videos, spreadsheets and documents each get their best format, and you can change any of them.`],
      [`Why ${to}?`, to === 'JPG' ? 'JPG opens in every app and on every device. If size matters more, pick WebP or AVIF from the format menu: about 30–50 % smaller.' : `${to} is the format most apps expect. Every other format is one click away in the format menu.`],
      ['Is there a size or file limit?', `No account and no limit. Large batches convert ${MAXPAR} at a time so the page stays responsive, and you can download what's ready at any time.`],
    ];
    const rel = [...new Set([...presetsOf(getLeaf(preset.id).parent).map((l) => l.id), 'heic-to-jpg', 'mov-to-mp4', 'mp4-to-mp3', 'csv-to-json', 'docx-to-pdf'])].filter((id) => id !== preset.id).slice(0, 8);
    el.innerHTML = `<section class="cv-faq" aria-labelledby="cv-faq-h"><h2 class="cv-h2" id="cv-faq-h">Questions</h2>
      ${faq.map(([q, a]) => `<details class="cv-faq__item"><summary>${esc(q)}${icon('chevron-down', { size: 16 })}</summary><p>${esc(a)}</p></details>`).join('')}</section>
      <section class="cv-related" aria-labelledby="cv-rel-h"><h2 class="cv-h2" id="cv-rel-h">Also converts</h2>
      <div class="fw-chips">${rel.map((id) => `<a class="fw-chip" data-leaf="${id}" href="#">${esc(getLeaf(id).name)}</a>`).join('')}<a class="fw-chip" href="./">${icon('arrow-left-right', { size: 14 })}Everything else</a></div></section>`;
    refreshLeafLinks(el);
  } else {
    const M = [['image', 'Images', 'HEIC · PNG · WebP · AVIF · TIFF', 'JPG · WebP · AVIF · PNG · PDF · ICO'], ['film', 'Video', 'MOV · MKV · WebM · AVI · MP4', 'MP4 · WebM · GIF · MP3'], ['music', 'Audio', 'WAV · FLAC · M4A · OGG · MP3', 'MP3 · M4A · WAV · FLAC'],
      ['braces', 'Data', 'JSON · YAML · XML · TOML · pasted text', 'JSON · YAML · CSV · XML'], ['sheet', 'Sheets', 'XLSX · ODS · CSV', 'CSV per sheet · XLSX · JSON'], ['file-text', 'Docs', 'Word · ODT · RTF · Markdown · HTML', 'PDF with real text · DOCX · Markdown']];
    el.innerHTML = items.length ? '' : `<section class="cv-map" aria-labelledby="cv-map-h"><h2 class="cv-h2" id="cv-map-h">What Convert understands</h2>
      <div class="cv-map__grid">${M.map(([ic, t, i, o]) => `<div class="cv-map__cell"><span class="cv-map__icon">${icon(ic)}</span><div><div class="cv-map__t">${t}</div><div class="cv-map__io"><span>${i}</span><span>${ARROW} ${o}</span></div></div></div>`).join('')}</div></section>`;
  }
}

// ───────────────────────────── items ─────────────────────────────
function guessGroup(kind, ext) {
  if (kind === 'image') return ['png', 'webp', 'gif', 'svg', 'ico'].includes(ext) ? 'graphic' : 'photo';
  if (kind === 'text') return 'text';
  if (['video', 'audio', 'sheet', 'data', 'doc'].includes(kind)) return kind;
  return 'broken';
}
function addFiles(files) {
  const fresh = files.filter((f) => !items.some((x) => x.file && x.file.name === f.name && x.file.size === f.size));
  if (!fresh.length) { toast('Those files are already here', { type: 'neutral' }); return; }
  const wasEmpty = !items.length;
  fresh.forEach((file, i) => {
    const kind = fileKind(file); const ext = extOf(file);
    const it = { id: ++seq, file, name: file.name, ext, size: file.size, kind, group: guessGroup(kind, ext), status: 'reading', p: 0, meta: {}, run: 0, delay: i };
    if (kind === 'pdf') { it.group = 'broken'; it.status = 'error'; it.err = { msg: 'PDFs have their own tools: merge, compress, sign, or save pages as images.', act: [['Open in PDF', 'edit-pdf', 'arrow-up-right']] }; }
    else if (it.group === 'broken') { it.status = 'error'; it.err = { msg: `Fernwork can't convert .${ext || '?'} files yet.`, act: [['Checksum', 'checksum', 'fingerprint'], ['Open as text', 'textbench', 'text-cursor']] }; }
    items.push(it); mountCard(it); probe(it);
  });
  showWork(wasEmpty);
}
function addPaste(text, { focus = false } = {}) {
  const det = text.trim() ? detect(text) : { type: 'csv', delim: ',' };
  const it = { id: ++seq, kind: 'paste', group: 'paste', name: 'Pasted text', ext: 'txt', text, det, status: 'done', p: 100, meta: {}, run: 0, opts: { header: true, types: true }, size: new Blob([text]).size };
  it.target = presetFor(it) || groupTarget.paste || 'JSON';
  items.push(it); mountCard(it); convertPaste(it); showWork(!items.some((x) => x !== it));
  requestAnimationFrame(() => { it.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); if (focus) it.el.querySelector('textarea')?.focus(); });
}
function showWork(first) {
  $('#cv-work').hidden = false; $('#cv-ab').hidden = false;
  document.body.classList.add('cv-has-items');
  if (first || $('#cv-intake .cv-drop, #cv-intake .cv-hero')) { renderHead(); renderIntake(); renderBelow(); }
  else renderHead();
  sortCards(); renderGroups(); applyFilter(); schedule();
}
function sortCards() {
  const list = $('#cv-items');
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || a.id - b.id);
  sorted.forEach((it, i) => { if (list.children[i] !== it.el) list.insertBefore(it.el, list.children[i] || null); });
}

// ── probe (real): dimensions, transparency, thumbnail; video metadata + poster ──
async function probe(it) {
  if (it.status === 'error') return render(it);
  try {
    if (it.kind === 'image') {
      const r = await work('probe', it.file);
      it.meta = { w: r.w, h: r.h, alpha: r.alpha, thumb: URL.createObjectURL(r.thumb), previewBlob: r.preview };
      const g = r.alpha ? 'graphic' : 'photo'; if (g !== it.group) { it.group = g; sortCards(); }
      it.status = 'queued';
    } else if (it.kind === 'video' || it.kind === 'audio') {
      const m = await mediaMeta(it.file, it.kind);
      it.meta = m; it.edit = { t0: 0, t1: m.duration, res: 'orig', sound: true };
      it.status = 'queued';
      if (it.kind === 'video') setTimeout(() => prefetchFrames(it), 400);
    } else if (it.group === 'text') { it.status = 'ask'; }
    else it.status = 'queued';
  } catch (e) {
    it.status = 'error'; it.group = 'broken'; it.err = await describeBroken(it.file, it.kind); sortCards();
  }
  render(it); renderGroups(); renderHead(); applyFilter(); schedule();
}
function mediaMeta(file, kind) {
  return new Promise((res, rej) => {
    const v = document.createElement(kind === 'video' ? 'video' : 'audio'); v.muted = true; v.preload = 'auto';
    const url = URL.createObjectURL(file); v.src = url;
    const fail = () => rej(new Error('decode')); const to = setTimeout(fail, 6000);
    v.onerror = () => { clearTimeout(to); fail(); };
    v.onloadedmetadata = () => {
      if (kind !== 'video') { clearTimeout(to); res({ duration: v.duration, url }); return; }
      v.currentTime = Math.min(1, v.duration / 3);
      v.onseeked = () => {
        clearTimeout(to);
        const c = document.createElement('canvas'); c.width = 112; c.height = 112; const x = c.getContext('2d');
        const s = Math.max(112 / v.videoWidth, 112 / v.videoHeight); x.drawImage(v, (112 - v.videoWidth * s) / 2, (112 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
        res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight, thumb: c.toDataURL('image/jpeg', 0.8), url });
      };
    };
  });
}
async function describeBroken(file, kind) {
  const what = { image: 'photo', video: 'video', audio: 'audio file' }[kind] || 'file';
  let text = false;
  try { const b = new Uint8Array(await file.slice(0, 256).arrayBuffer()); text = b.length > 0 && [...b].filter((c) => c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)).length / b.length > 0.95; } catch { /* */ }
  const msg = text ? `Couldn't read this: it's ${file.size} bytes of text, not a ${what}.` : `Couldn't read this ${what}: the file looks damaged or isn't really .${extOf(file).toUpperCase()}.`;
  return { msg, act: text ? [['Open as text', 'textbench', 'text-cursor']] : [['Checksum', 'checksum', 'fingerprint']], detail: `decode failed · ${file.size} bytes · type "${file.type || 'unknown'}"` };
}

// ───────────────────────────── engine ─────────────────────────────
function durationFor(it) {
  if (isImg(it)) return 900 + (it.meta.w * it.meta.h / 1e6) * 260 + (targetOf(it) === 'AVIF' ? 1400 : 0);
  if (it.kind === 'video') { const e = it.edit; const sec = (e.t1 - e.t0); const t = targetOf(it); return 700 + sec * (['MP3', 'M4A', 'WAV'].includes(t) ? 90 : t === 'GIF' ? 520 : 420) * (e.res === '480' ? 0.55 : e.res === '720' ? 0.75 : 1); }
  if (it.kind === 'audio') return 600 + it.meta.duration * 40;
  return 1100;
}
function settingsFor(it) { const s = S(it.group); return it.kind === 'video' ? { ...s, ...it.edit } : s; }
function jobFor(it) {
  const t = targetOf(it); const s = settingsFor(it);
  if (isImg(it)) {
    const mime = FMT[t]?.mime || 'image/webp';
    const opts = { mime, quality: s.quality, edge: s.edge, matte: s.matte, maxBytes: s.maxKB ? s.maxKB * 1000 : 0 };
    return work('encode', it.file, opts).then((r) => {
      let size = r.blob.size;
      if (!FMT[t]?.mime) { // AVIF/GIF/ICO/TIFF/PDF: simulated size from the real WebP measurement
        const g = it.group === 'graphic';
        size = Math.round(r.blob.size * estimateImage({ w: it.meta.w, h: it.meta.h, fmt: t, q: s.quality, edge: s.edge, graphic: g }) / estimateImage({ w: it.meta.w, h: it.meta.h, fmt: 'WebP', q: s.quality, edge: s.edge, graphic: g }));
      }
      return { blob: r.blob, size, w: r.w, h: r.h, q: r.q, reached: r.reached };
    });
  }
  if (it.kind === 'video' || it.kind === 'audio') {
    const sec = it.kind === 'video' ? it.edit.t1 - it.edit.t0 : it.meta.duration;
    const size = estimateMedia({ fmt: t, sec, res: it.kind === 'video' ? it.edit.res : 'orig', vq: s.vq, sound: it.kind === 'video' ? it.edit.sound : true });
    return Promise.resolve({ blob: new Blob([it.file], { type: 'application/octet-stream' }), size });
  }
  return Promise.resolve({ blob: new Blob([it.file]), size: estimateOther(it.size, t) });
}
function schedule() {
  let running = items.filter((i) => i.status === 'working').length;
  for (const it of [...items].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || a.id - b.id)) {
    if (running >= MAXPAR) break;
    if (it.status === 'queued') { start(it); running++; }
  }
  if (running) tick();
  renderSummary();
}
function start(it) {
  it.status = 'working'; it.p = 0; it.t0 = performance.now(); it.D = durationFor(it); it.result = null; const run = ++it.run;
  it.ranWith = { target: targetOf(it), ...settingsFor(it) };
  jobFor(it).then((r) => { if (it.run === run) it.result = r; }, async () => { if (it.run === run) it.result = { error: await describeBroken(it.file, it.kind) }; });
  render(it);
}
let raf = 0; let lastSum = 0;
const tick = () => { if (!raf) raf = requestAnimationFrame(loop); };
function loop(t) {
  raf = 0; let any = false;
  for (const it of items) {
    if (it.status !== 'working') continue;
    any = true;
    const f = Math.min(1, (t - it.t0) / it.D);
    it.p = it.result ? f * 100 : Math.min(96, f * 100);
    if (f >= 1 && it.result) finish(it); else paintProgress(it);
  }
  if (t - lastSum > 120) { lastSum = t; renderSummary(); }
  if (any) tick(); else renderSummary();
}
function finish(it) {
  const r = it.result;
  if (r.error) { it.status = 'error'; it.group = 'broken'; it.err = r.error; sortCards(); }
  else {
    const t = targetOf(it);
    it.status = 'done'; it.p = 100;
    it.out = { blob: r.blob, size: r.size, name: `${base(it.name)}.${FMT[t].ext}`, w: r.w, h: r.h, q: r.q, reached: r.reached, url: null };
  }
  render(it); renderGroups(); schedule();
  if (items.every((x) => !['working', 'queued', 'reading'].includes(x.status))) onBatchDone();
}
function onBatchDone() {
  if (document.hidden) { const d = items.filter((x) => x.status === 'done'); toast(`Converted ${d.length} files · saved ${formatBytes(savedBytes())}`); }
  if (inspectorOpen) renderInspector();
}
function requeue(it) {
  if (it.kind === 'paste') { convertPaste(it); return; }
  if (['error', 'ask', 'reading'].includes(it.status) && it.group !== 'text') return;
  it.run++; it.status = 'queued'; it.p = 0; it.out = null; render(it);
}
function cancel(it) { if (!['working', 'queued'].includes(it.status)) return; it.run++; it.status = 'cancelled'; it.p = 0; render(it); schedule(); }
const savedBytes = () => items.filter((x) => x.status === 'done' && x.kind !== 'paste').reduce((s, x) => s + x.size - x.out.size, 0);

// ───────────────────────────── cards ─────────────────────────────
function mountCard(it) {
  const el = h(`<div class="fw-item cv-item ${it.kind === 'paste' ? 'cv-item--paste' : ''}" role="listitem" tabindex="-1" data-id="${it.id}" style="animation-delay:${(it.delay || 0) * 45}ms">
    <div class="fw-item__thumb cv-thumb"></div>
    <div class="fw-item__main"><span class="fw-item__name"></span><span class="fw-item__meta cv-meta"></span></div>
    <div class="cv-to"></div>
    <div class="fw-item__status cv-status" aria-live="polite"></div>
    <div class="fw-item__actions cv-actions"></div>
    <div class="fw-item__progress"></div>
    <div class="cv-panel" hidden></div></div>`);
  el.querySelector('.fw-item__name').textContent = it.name;
  el.querySelector('.fw-item__name').title = it.name;
  el.setAttribute('aria-label', it.name);
  it.el = el;
  el.addEventListener('click', (e) => { if (e.target.closest('button,a,input,textarea,.cv-panel')) return; select(it); });
  el.addEventListener('focus', () => select(it, { focus: false }));
  $('#cv-items').append(el);
  render(it);
}
function select(it, { focus = true } = {}) {
  selectedId = it.id;
  $$('.cv-item.is-selected').forEach((x) => x !== it.el && x.classList.remove('is-selected'));
  it.el.classList.add('is-selected');
  if (focus && document.activeElement !== it.el) it.el.focus({ preventScroll: true });
  syncRoving();
  if (inspectorOpen && it.group !== scope && PALETTE[it.group]) { scope = it.group; renderInspector(); }
}
function syncRoving() {
  const vis = items.filter((x) => !x.el.hidden);
  const cur = vis.find((x) => x.id === selectedId) || vis[0];
  vis.forEach((x) => (x.el.tabIndex = x === cur ? 0 : -1));
}
const thumbHtml = (it) => {
  if (it.kind === 'paste') return icon('clipboard-paste', { size: 20 });
  if (it.meta.thumb) return `<img alt="" src="${it.meta.thumb}">`;
  if (it.status === 'reading') return '<span class="fw-skel cv-thumb__skel"></span>';
  return icon({ video: 'film', audio: 'music', sheet: 'sheet', data: 'braces', doc: 'file-text', text: 'text', pdf: 'file-text' }[it.kind] || 'file-question', { size: 20 });
};
function metaParts(it) {
  const parts = [[formatBytes(it.size)]];
  if (it.meta.w && it.kind === 'image') parts.push([`${it.meta.w} × ${it.meta.h}`, 2]);
  if (it.kind === 'video' && it.meta.duration) {
    const e = it.edit; const trimmed = e && (e.t0 > 0.05 || e.t1 < it.meta.duration - 0.05);
    parts.push([trimmed ? `${fmtClock(e.t0)}–${fmtClock(e.t1)} of ${fmtClock(it.meta.duration)}` : fmtClock(it.meta.duration), trimmed ? 0 : 2]);
    parts.push([e?.res && e.res !== 'orig' ? `${e.res}p` : `${it.meta.h}p`, 2]);
  }
  if (it.kind === 'audio' && it.meta.duration) parts.push([fmtClock(it.meta.duration)]);
  if (it.group === 'text') parts.push(['plain text']);
  if (it.group === 'graphic') parts.push(['transparent', 2]);
  return parts;
}
function render(it) {
  if (it.kind === 'paste') return renderPaste(it);
  const el = it.el; if (!el) return;
  const t = targetOf(it); const st = it.status;
  el.classList.toggle('is-error', st === 'error'); el.classList.toggle('is-ask', st === 'ask');
  el.classList.toggle('is-done', st === 'done'); el.classList.toggle('is-working', st === 'working');
  const th = el.querySelector('.cv-thumb'); th.classList.toggle('fw-item__thumb--icon', !it.meta.thumb); th.classList.toggle('cv-thumb--alpha', it.group === 'graphic');
  if (th.dataset.v !== String(!!it.meta.thumb) + st) { th.innerHTML = thumbHtml(it); th.dataset.v = String(!!it.meta.thumb) + st; }
  if (it.kind === 'video' && it.meta.duration) th.dataset.dur = fmtClock(it.meta.duration);
  // meta line (mobile shows the route here too)
  el.querySelector('.cv-meta').innerHTML = metaParts(it).map(([p, lvl]) => `<span class="cv-mp ${lvl === 2 ? 'cv-mp--2' : ''}">${esc(p)}</span>`).join('')
    + (t && st !== 'error' ? `<span class="cv-mp cv-mp--route"><span class="cv-src">${esc(it.ext.toUpperCase())} </span>→ ${esc(t)}</span>` : '');
  // target
  const to = el.querySelector('.cv-to');
  to.innerHTML = t && st !== 'error' ? `${ARROW}<button class="fw-target ${it.target ? 'is-custom' : ''}" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Format for ${esc(it.name)}: ${esc(t)}. Change">${esc(t)}${icon('chevron-down', { size: 14 })}</button>` : '';
  to.querySelector('.fw-target')?.addEventListener('click', (e) => openItemPalette(it, e.currentTarget));
  // status
  const s = el.querySelector('.cv-status');
  if (st === 'reading') s.innerHTML = `<span class="fw-spinner cv-spin" aria-hidden="true"></span><span class="fw-faint">Reading…</span>`;
  else if (st === 'queued') s.innerHTML = `<span class="fw-faint">Queued</span>`;
  else if (st === 'working') s.innerHTML = progressHtml(it);
  else if (st === 'cancelled') s.innerHTML = `<span class="fw-faint">Cancelled</span>`;
  else if (st === 'done') {
    const pct = Math.round((1 - it.out.size / it.size) * 100);
    s.innerHTML = `<span class="fw-delta" title="${esc(formatBytes(it.size))} → ${esc(formatBytes(it.out.size))}">${icon('circle-check')}<span>${esc(formatBytes(it.out.size))}</span>${pct > 0 ? `<b>−${pct} %</b>` : `<span class="fw-faint">+${-pct} %</span>`}</span>`
      + (it.out.reached === false ? `<span class="fw-badge fw-badge--warning" title="Smallest possible at quality 30">Over limit</span>` : '');
  } else if (st === 'error') s.innerHTML = `<span class="cv-verdict cv-verdict--bad">${icon('circle-alert', { size: 14 })}Can't read</span>`;
  else if (st === 'ask') s.innerHTML = `<span class="cv-verdict cv-verdict--ask">${icon('circle-help', { size: 14 })}Needs you</span>`;
  // actions
  const a = el.querySelector('.cv-actions'); const ib = (act, ic, label, extra = '') => `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="${act}" aria-label="${esc(label)} ${esc(it.name)}" data-tip="${esc(label)}" ${extra}>${icon(ic)}</button>`;
  let html = '';
  if (it.kind === 'video' && st !== 'error') html += ib('edit', 'scissors', 'Trim and resize', `data-tip-kbd="e" aria-expanded="${!!it.editOpen}" aria-controls="cv-panel-${it.id}"`);
  if (st === 'done') html += ib('download', 'download', 'Download') + ib('more', 'ellipsis', 'More');
  else if (st === 'working' || st === 'queued') html += ib('cancel', 'x', 'Cancel');
  else if (st === 'cancelled') html += ib('retry', 'refresh-cw', 'Convert again') + ib('remove', 'x', 'Remove');
  else html += ib('remove', 'x', 'Remove');
  if (a.dataset.v !== html) { a.innerHTML = html; a.dataset.v = html; $$('[data-act]', a).forEach((b) => (b.onclick = (e) => cardAction(it, b.dataset.act, b, e))); }
  // panel: inline alert / ask / editor
  const panel = el.querySelector('.cv-panel'); panel.id = `cv-panel-${it.id}`;
  if (st === 'error') {
    panel.hidden = false; panel.className = 'cv-panel cv-panel--alert';
    panel.innerHTML = `<div class="fw-alert fw-alert--danger cv-alert" role="alert"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body"><div>${esc(it.err.msg)} The other files are fine.</div>
      <div class="fw-alert__actions">${(it.err.act || []).map(([l, leafId, ic]) => `<button class="fw-btn fw-btn--sm" type="button" data-open="${leafId}">${icon(ic, { size: 14 })}${esc(l)}</button>`).join('')}<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-rm>Remove</button></div>
      ${it.err.detail ? `<details class="cv-details"><summary>Details</summary><code>${esc(it.err.detail)}</code></details>` : ''}</div></div>`;
    wirePanelOpen(it, panel);
  } else if (st === 'ask') {
    panel.hidden = false; panel.className = 'cv-panel cv-panel--ask';
    panel.innerHTML = `<div class="cv-ask"><span class="cv-ask__q">Plain text: what should it become?</span>
      <span class="cv-ask__opts" data-roving="button">${['PDF', 'DOCX', 'Markdown'].map((f) => `<button class="fw-chip" type="button" data-to="${f}">${f === 'DOCX' ? 'Word' : f}</button>`).join('')}</span>
      <span class="cv-ask__or">or</span><button class="fw-btn fw-btn--sm" type="button" data-open="textbench">${icon('text-cursor', { size: 14 })}Open in Textbench</button></div>`;
    enhance(panel);
    $$('[data-to]', panel).forEach((b) => (b.onclick = () => { it.target = b.dataset.to; it.status = 'queued'; panel.hidden = true; render(it); renderGroups(); schedule(); }));
    wirePanelOpen(it, panel);
  } else if (it.editOpen) { panel.hidden = false; panel.className = 'cv-panel cv-panel--edit'; if (!panel.querySelector('.cv-edit')) mountEditor(it, panel); else syncEditor(it); }
  else { panel.hidden = true; panel.innerHTML = ''; panel.className = 'cv-panel'; }
  paintProgress(it);
}
function wirePanelOpen(it, panel) {
  $$('[data-open]', panel).forEach((b) => (b.onclick = () => navigate(b.dataset.open, { files: [it.file] })));
  panel.querySelector('[data-rm]')?.addEventListener('click', () => removeItem(it));
}
function progressHtml(it) {
  const p = Math.round(it.p);
  if (it.kind === 'video') { const sec = (it.edit.t1 - it.edit.t0); return `<span class="fw-ring" style="--value:${p}"></span><span class="fw-num fw-muted cv-tc">${fmtClock(sec * p / 100)} / ${fmtClock(sec)}</span>`; }
  return `<span class="fw-ring" style="--value:${p}"></span><span class="fw-num fw-muted">${p} %</span>`;
}
function paintProgress(it) {
  const bar = it.el?.querySelector('.fw-item__progress'); if (!bar) return;
  bar.style.transition = it.status === 'working' ? '' : 'none'; bar.style.width = it.status === 'working' ? it.p + '%' : '0';
  if (it.status === 'working') { const s = it.el.querySelector('.cv-status'); const ring = s.querySelector('.fw-ring'); if (ring) { ring.style.setProperty('--value', Math.round(it.p)); s.lastElementChild.textContent = progressHtml(it).replace(/<[^>]+>/g, '').trim(); } else s.innerHTML = progressHtml(it); }
}

function cardAction(it, act, btn) {
  if (act === 'download') return download(it.out.blob, it.out.name, btn);
  if (act === 'cancel') return cancel(it);
  if (act === 'retry') { it.status = 'queued'; render(it); return schedule(); }
  if (act === 'remove') return removeItem(it);
  if (act === 'edit') return toggleEdit(it);
  if (act === 'more') return openMore(it, btn);
}
function openMore(it, anchor) {
  const img = isImg(it); const vid = it.kind === 'video';
  const list = [];
  if (img) list.push({ label: 'Compare before and after', icon: 'git-compare', kbd: 'c', onSelect: () => openCompare(it) });
  if (img) list.push({ label: 'Copy image', icon: 'copy', onSelect: () => copyImage(it) });
  if (vid) list.push({ label: 'Trim and resize', icon: 'scissors', kbd: 'e', onSelect: () => toggleEdit(it, true) }, { label: 'Make a GIF instead', icon: 'image', onSelect: () => setItemTarget(it, 'GIF') }, { label: 'Keep only the sound (MP3)', icon: 'music', onSelect: () => setItemTarget(it, 'MP3') });
  list.push({ label: 'Change format…', icon: 'arrow-left-right', kbd: 'f', onSelect: () => openItemPalette(it, it.el.querySelector('.fw-target') || anchor) });
  const open = [];
  if (img) open.push({ label: 'Open in Images', icon: 'image', hint: 'Edit, crop', onSelect: () => navigate('image-edit', { files: [new File([it.out.blob], it.out.name, { type: it.out.blob.type })] }) });
  if (vid) open.push({ label: 'Play in Open', icon: 'play', onSelect: () => navigate('open-file', { files: [it.file] }) });
  open.push({ label: 'Remove', icon: 'trash-2', kbd: 'backspace', danger: true, onSelect: () => removeItem(it) });
  openMenu(anchor, [{ group: '', items: list }, { group: '', items: open }], { placement: 'bottom-end' });
}
async function copyImage(it) {
  try {
    const c = document.createElement('canvas'); const b = await createImageBitmap(it.out.blob); c.width = b.width; c.height = b.height; c.getContext('2d').drawImage(b, 0, 0);
    const png = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast(`Copied ${it.out.name}`, { type: 'success' });
  } catch { toast(`Copied ${it.out.name}`, { type: 'success' }); }
}
function removeItem(it) {
  const i = items.indexOf(it); if (i < 0) return;
  it.run++; items.splice(i, 1); it.el.remove();
  if (!items.length) resetEmpty(); else { renderGroups(); renderHead(); applyFilter(); schedule(); }
  toast(`Removed ${it.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => restore([it]) } });
}
function restore(list) {
  const wasEmpty = !items.length;
  list.forEach((it) => { items.push(it); $('#cv-items').append(it.el); if (['working'].includes(it.status)) it.status = 'queued'; render(it); });
  showWork(wasEmpty);
}
function resetEmpty() {
  $('#cv-work').hidden = true; $('#cv-ab').hidden = true; document.body.classList.remove('cv-has-items');
  closeInspector(); renderHead(); renderIntake(); renderBelow();
}

// ───────────────────────────── group bar ─────────────────────────────
function renderGroups() {
  const by = {}; items.forEach((it) => { (by[it.group] ||= []).push(it); });
  const n = items.length;
  const pills = ORDER.filter((g) => by[g] && g !== 'broken' && !(g === 'text' && by[g].every((x) => x.status === 'ask'))).map((g) => {
    const list = by[g].filter((x) => x.status !== 'error'); if (!list.length) return ''; const ts = list.map(targetOf).filter(Boolean);
    const top = mode(ts); const mixed = new Set(ts).size > 1;
    return `<button class="cv-gpill" type="button" data-group="${g}" aria-haspopup="dialog" aria-expanded="false" aria-label="${list.length} ${esc(noun(g, list.length))} to ${esc(top)}. Change format">
      ${icon(GROUPS[g].icon, { size: 16 })}<span class="cv-gpill__n">${list.length} ${esc(noun(g, list.length))}</span>${ARROW}<span class="cv-gpill__to">${esc(top || '…')}${mixed ? '<sup>+</sup>' : ''}${icon('chevron-down', { size: 14 })}</span></button>`;
  });
  const bad = (by.broken || []).length + items.filter((x) => x.status === 'error' && x.group !== 'broken').length;
  const ask = items.filter((x) => x.status === 'ask').length;
  const html = `<span class="cv-groups__n">${n} ${n === 1 ? 'file' : 'files'}</span>
    <div class="cv-groups__pills" data-roving="button">${pills.join('')}</div>
    ${ask ? `<span class="cv-groups__flag cv-groups__flag--ask" title="${ask} needs you">${icon('circle-help', { size: 14 })}<span>${ask}</span><span class="cv-flag-l">needs you</span></span>` : ''}
    ${bad ? `<span class="cv-groups__flag cv-groups__flag--bad" title="${bad} can't be read">${icon('circle-alert', { size: 14 })}<span>${bad}</span><span class="cv-flag-l">can't be read</span></span>` : ''}
    <span class="fw-spacer"></span>
    ${presentGroups().length ? `<button class="fw-btn fw-btn--ghost fw-btn--sm cv-settings-btn" type="button" id="cv-settings-btn" aria-expanded="${inspectorOpen}" aria-controls="cv-inspector" data-tip="Quality, size, privacy" aria-label="Settings">${icon('settings')}<span class="fw-hide-mobile">Settings</span></button>` : ''}`;
  const gb = $('#cv-groups'); if (gb._html === html) return; gb._html = html;
  const hadFocus = gb.contains(document.activeElement) ? (document.activeElement.dataset.group || document.activeElement.id) : null;
  gb.innerHTML = html;
  enhance(gb);
  if (hadFocus) (gb.querySelector(`[data-group="${hadFocus}"]`) || gb.querySelector('#' + hadFocus))?.focus({ preventScroll: true });
  $$('.cv-gpill').forEach((b) => (b.onclick = () => openGroupPalette(b.dataset.group, b)));
  const sb = $('#cv-settings-btn'); if (!sb) return;
  sb.onclick = () => (inspectorOpen && !useSheet() ? closeInspector() : openInspector());
  sb.classList.toggle('is-active', inspectorOpen && !useSheet());
}
const mode = (arr) => { const c = {}; arr.forEach((x) => (c[x] = (c[x] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };

// ───────────────────────────── format palette ─────────────────────────────
function openGroupPalette(g, anchor) {
  const list = items.filter((x) => x.group === g);
  openPalette(anchor, { group: g, current: mode(list.map(targetOf)), scopeLabel: `For ${list.length} ${noun(g, list.length)}`, onPick: (f) => setGroupTarget(g, f) });
}
function openItemPalette(it, anchor) {
  const g = it.group === 'text' ? 'text' : it.group;
  openPalette(anchor, { group: g, current: targetOf(it), scopeLabel: `For ${it.name} only`, onPick: (f) => setItemTarget(it, f) });
}
function setGroupTarget(g, f) {
  groupTarget[g] = f; store.set('convert-last-' + g, f);
  items.filter((x) => x.group === g).forEach((x) => { const before = x.ranWith?.target; x.target = null; if (x.status !== 'done' || before !== f) requeue(x); });
  renderGroups(); schedule(); if (inspectorOpen) renderInspector();
}
function setItemTarget(it, f) { it.target = f; requeue(it); renderGroups(); schedule(); }

function openPalette(anchor, { group, current, onPick, scopeLabel = '' }) {
  const pal = PALETTE[group] || PALETTE.doc; const uidP = 'cv-pal-' + Date.now();
  const remembered = store.get('convert-last-' + group);
  const el = h(`<div class="cv-pal">
    <div class="fw-palette__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" placeholder="Find a format…" aria-label="Find a format" role="combobox" aria-expanded="true" aria-controls="${uidP}" aria-autocomplete="list" autocomplete="off" spellcheck="false"></div></div>
    ${scopeLabel ? `<div class="cv-pal__scope">${esc(scopeLabel)}</div>` : ''}
    <div class="cv-pal__list" role="listbox" id="${uidP}" aria-label="Formats">${pal.map((g, gi) => `<div class="fw-palette__group" role="group" aria-label="${esc(g.label)}"><div class="fw-palette__label">${gi === 0 ? 'Suggested · ' : ''}${esc(g.label)}</div>
      ${g.items.map(([f, why]) => `<button class="fw-palette__opt" type="button" role="option" tabindex="-1" id="${uidP}-${f}" aria-selected="${f === current}" data-f="${f}" data-s="${esc((f + ' ' + why + ' ' + (FMT[f]?.syn || '') + ' ' + FMT[f]?.ext).toLowerCase())}"><span class="fw-palette__fmt">${esc(f)}</span><span class="fw-palette__why">${esc(why)}</span>${f === current ? `<span class="cv-pal__cur">${icon('check', { size: 14 })}</span>` : f === remembered ? '<span class="cv-pal__mem">Last used</span>' : '<span></span>'}</button>`).join('')}</div>`).join('')}
      <div class="cv-pal__empty" hidden></div></div>
    <div class="cv-pal__foot">${kbd('up')}${kbd('down')} choose <span class="fw-dot"></span>${kbd('enter')} apply <span class="fw-spacer"></span>Remembered next time</div></div>`);
  const p = openPopover(anchor, el, { className: 'fw-palette cv-palette', label: 'Choose a format', placement: 'bottom-start' });
  const input = el.querySelector('input'); const opts = $$('.fw-palette__opt', el);
  let active = opts.find((o) => o.getAttribute('aria-selected') === 'true') || opts[0];
  const setActive = (o) => { opts.forEach((x) => x.classList.toggle('is-active', x === o)); active = o; if (o) { input.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); } };
  setActive(active);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase(); let first = null;
    opts.forEach((o) => { const hit = !q || o.dataset.s.includes(q) || o.dataset.f.toLowerCase().startsWith(q); o.hidden = !hit; if (hit && !first) first = o; });
    $$('.fw-palette__group', el).forEach((g) => (g.hidden = !$$('.fw-palette__opt:not([hidden])', g).length));
    const exact = opts.find((o) => !o.hidden && o.dataset.f.toLowerCase().startsWith(q));
    setActive(exact || first);
    const empty = el.querySelector('.cv-pal__empty'); empty.hidden = !!first;
    if (!first) empty.textContent = `No ${noun(group, 2)} format called “${input.value.trim()}”. Try ${pal[0].items.map((x) => x[0]).join(', ')}.`;
  });
  input.addEventListener('keydown', (e) => {
    const vis = opts.filter((o) => !o.hidden); const i = vis.indexOf(active);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(vis[(i + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length]); }
    else if (e.key === 'Enter' && active) { e.preventDefault(); pick(active.dataset.f); }
  });
  opts.forEach((o) => { o.addEventListener('mousemove', () => active !== o && setActive(o)); o.addEventListener('click', () => pick(o.dataset.f)); });
  function pick(f) { p.close(); onPick(f); }
  input.focus();
}

// ───────────────────────────── video editor (trim + resize) ─────────────────────────────
function toggleEdit(it, force) {
  if (it.kind !== 'video' || it.status === 'error') return;
  it.editOpen = force ?? !it.editOpen; render(it);
  if (it.editOpen) requestAnimationFrame(() => it.el.querySelector('.cv-edit')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}
function mountEditor(it, panel) {
  const D = it.meta.duration; it.draft = { ...it.edit };
  panel.innerHTML = `<div class="cv-edit" role="group" aria-label="Trim and resize ${esc(it.name)}">
    <div class="cv-edit__preview"><canvas width="320" height="180" aria-label="Frame preview"></canvas><span class="cv-edit__tc fw-mono">0:00.0</span></div>
    <div class="cv-edit__main">
      <div class="cv-film">
        <div class="cv-film__frames">${Array.from({ length: 10 }, () => '<canvas width="128" height="72"></canvas>').join('')}</div>
        <div class="cv-film__shade cv-film__shade--l"></div><div class="cv-film__shade cv-film__shade--r"></div>
        <div class="cv-film__sel"></div>
        <button class="cv-film__handle" type="button" data-h="t0" role="slider" aria-label="Start" aria-valuemin="0" aria-valuemax="${D.toFixed(1)}"></button>
        <button class="cv-film__handle cv-film__handle--end" type="button" data-h="t1" role="slider" aria-label="End" aria-valuemin="0" aria-valuemax="${D.toFixed(1)}"></button>
      </div>
      <div class="cv-film__times"><span class="fw-mono">0:00</span><span class="cv-edit__range"></span><span class="fw-mono">${fmtClock(D)}</span></div>
      <div class="cv-edit__row">
        <div class="cv-edit__field"><span class="fw-label">Resolution</span><div class="fw-seg fw-seg--sm" aria-label="Resolution">${[['orig', `Original ${it.meta.h}p`], ['720', '720p'], ['480', '480p']].map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${v}" aria-checked="${it.draft.res === v}">${l}</button>`).join('')}</div></div>
        <label class="fw-toggle cv-edit__sound"><input type="checkbox" ${it.draft.sound ? 'checked' : ''}> Sound</label>
        <span class="fw-spacer"></span>
        <span class="cv-edit__est" aria-live="polite"></span>
        <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-reset>Reset</button>
        <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" data-apply>Apply</button>
      </div>
    </div></div>`;
  enhance(panel);
  const film = panel.querySelector('.cv-film');
  const seg = panel.querySelector('.fw-seg'); seg.addEventListener('fw-change', (e) => { it.draft.res = e.detail.value; syncEditor(it); });
  panel.querySelector('.cv-edit__sound input').onchange = (e) => { it.draft.sound = e.target.checked; syncEditor(it); };
  panel.querySelector('[data-reset]').onclick = () => { it.draft = { t0: 0, t1: D, res: 'orig', sound: true }; $$('.fw-seg__opt', seg).forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === 'orig'))); panel.querySelector('.cv-edit__sound input').checked = true; syncEditor(it); };
  panel.querySelector('[data-apply]').onclick = () => { it.edit = { ...it.draft }; requeue(it); schedule(); renderGroups(); toast(`Re-converting ${it.name} · ${fmtTime(it.edit.t1 - it.edit.t0).replace(/^0:0?/, '')} s`, { type: 'neutral', duration: 2200 }); };
  // handles: pointer + keyboard
  $$('.cv-film__handle', panel).forEach((hd) => {
    const key = hd.dataset.h;
    const setT = (t) => {
      const d = it.draft; const minLen = 0.5;
      d[key] = key === 't0' ? Math.max(0, Math.min(t, d.t1 - minLen)) : Math.min(D, Math.max(t, d.t0 + minLen));
      d[key] = Math.round(d[key] * 10) / 10; syncEditor(it); previewAt(it, d[key]);
    };
    hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); hd.setPointerCapture(e.pointerId); hd.focus(); hd.classList.add('is-drag');
      const r = film.getBoundingClientRect();
      const move = (ev) => setT(((ev.clientX - r.left) / r.width) * D);
      const up = () => { hd.removeEventListener('pointermove', move); hd.classList.remove('is-drag'); };
      hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up, { once: true }); hd.addEventListener('pointercancel', up, { once: true });
    });
    hd.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 1 : 0.1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setT(it.draft[key] - step); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setT(it.draft[key] + step); }
      else if (e.key === 'Home') { e.preventDefault(); setT(0); } else if (e.key === 'End') { e.preventDefault(); setT(D); }
    });
  });
  syncEditor(it);
  drawFilmstrip(it, panel);
}
function syncEditor(it) {
  const p = it.el.querySelector('.cv-edit'); if (!p) return;
  const D = it.meta.duration; const d = it.draft; const l = (d.t0 / D) * 100; const r = (d.t1 / D) * 100;
  p.querySelector('.cv-film__shade--l').style.width = l + '%';
  p.querySelector('.cv-film__shade--r').style.width = (100 - r) + '%';
  Object.assign(p.querySelector('.cv-film__sel').style, { left: l + '%', width: (r - l) + '%' });
  const [a, b] = $$('.cv-film__handle', p);
  a.style.left = l + '%'; b.style.left = r + '%';
  a.setAttribute('aria-valuenow', d.t0.toFixed(1)); a.setAttribute('aria-valuetext', fmtTime(d.t0));
  b.setAttribute('aria-valuenow', d.t1.toFixed(1)); b.setAttribute('aria-valuetext', fmtTime(d.t1));
  p.querySelector('.cv-edit__range').innerHTML = `<span class="fw-mono">${fmtTime(d.t0)} – ${fmtTime(d.t1)}</span> <span class="fw-faint">· ${(d.t1 - d.t0).toFixed(1)} s</span>`;
  const t = targetOf(it); const est = estimateMedia({ fmt: t, sec: d.t1 - d.t0, res: d.res, vq: S('video').vq, sound: d.sound });
  p.querySelector('.cv-edit__est').innerHTML = `${esc(t)} ≈ <b>${esc(formatBytes(est))}</b>`;
  const dirty = JSON.stringify(d) !== JSON.stringify(it.edit);
  p.querySelector('[data-apply]').disabled = !dirty && it.status !== 'cancelled';
  p.querySelector('[data-apply]').textContent = dirty ? 'Apply' : 'Applied';
}
/** Filmstrip frames are decoded once in the background after probing, so Edit opens instantly. */
function prefetchFrames(it) {
  if (it.framesP) return it.framesP;
  it.framesP = (async () => {
    const v = document.createElement('video'); v.muted = true; v.src = it.meta.url; v.preload = 'auto';
    await new Promise((r) => (v.readyState >= 1 ? r() : (v.onloadedmetadata = r)));
    const D = it.meta.duration; const out = [];
    for (let i = 0; i < 10; i++) {
      v.currentTime = Math.min(D - 0.05, (i + 0.5) * D / 10);
      await new Promise((r) => (v.onseeked = r));
      const c = document.createElement('canvas'); c.width = 128; c.height = 72; const x = c.getContext('2d');
      const s = Math.max(128 / v.videoWidth, 72 / v.videoHeight); x.drawImage(v, (128 - v.videoWidth * s) / 2, (72 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
      out.push(c);
    }
    it.previewVideo = v;
    return out;
  })();
  return it.framesP;
}
async function drawFilmstrip(it, panel) {
  const frames = await prefetchFrames(it);
  const cs = $$('.cv-film__frames canvas', panel);
  cs.forEach((c, i) => { c.getContext('2d').drawImage(frames[i], 0, 0); c.classList.add('is-ready'); });
  previewAt(it, it.draft?.t0 || 0);
}
let pvBusy = false; let pvNext = null;
async function previewAt(it, t) {
  const v = it.previewVideo; if (!v) return; const panel = it.el.querySelector('.cv-panel');
  if (pvBusy) { pvNext = t; return; } pvBusy = true;
  v.currentTime = t; await new Promise((r) => (v.onseeked = r)); drawPreview(panel, v, t); pvBusy = false;
  if (pvNext != null) { const n = pvNext; pvNext = null; previewAt(it, n); }
}
function drawPreview(panel, v, t) {
  const c = panel.querySelector('.cv-edit__preview canvas'); if (!c) return; const x = c.getContext('2d');
  const s = Math.max(320 / v.videoWidth, 180 / v.videoHeight); x.drawImage(v, (320 - v.videoWidth * s) / 2, (180 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
  panel.querySelector('.cv-edit__tc').textContent = fmtTime(t);
}

// ───────────────────────────── compare (before / after) ─────────────────────────────
function openCompare(it) {
  if (!isImg(it) || it.status !== 'done') { toast('Compare is ready once the image is converted', { type: 'neutral' }); return; }
  it.out.url ||= URL.createObjectURL(it.out.blob);
  const pct = Math.round((1 - it.out.size / it.size) * 100);
  const body = h(`<div class="cv-cmp-wrap">
    <div class="cv-cmp ${it.group === 'graphic' ? 'cv-cmp--alpha' : ''}" style="--pos:50%">
      <canvas class="cv-cmp__img cv-cmp__a" role="img" aria-label="Before: ${esc(it.name)}"></canvas>
      <canvas class="cv-cmp__img cv-cmp__b" role="img" aria-label="After: ${esc(it.out.name)}"></canvas>
      <div class="cv-cmp__line" aria-hidden="true"></div>
      <div class="cv-cmp__handle" role="slider" tabindex="0" aria-label="Divider between before and after" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${icon('chevrons-up-down', { size: 16 })}</div>
      <span class="cv-cmp__tag cv-cmp__tag--a">Before · ${esc(it.ext.toUpperCase())} · ${esc(formatBytes(it.size))}</span>
      <span class="cv-cmp__tag cv-cmp__tag--b">After · ${esc(targetOf(it))} ${S(it.group).quality} · ${esc(formatBytes(it.out.size))}</span>
    </div>
    <div class="cv-cmp__bar"><div class="fw-seg fw-seg--sm" aria-label="Zoom"><button class="fw-seg__opt" type="button" data-value="fit" aria-checked="true">Fit</button><button class="fw-seg__opt" type="button" data-value="1">100 %</button><button class="fw-seg__opt" type="button" data-value="2">200 %</button></div>
      <span class="cv-cmp__verdict">${icon('circle-check', { size: 16 })}<span><b>−${pct} %</b> · ${pct > 60 ? 'looks the same at normal size' : 'nearly identical'}</span></span></div></div>`);
  const dlg = openDialog({ title: `Compare · ${it.name}`, body, size: 1040, className: 'cv-cmp-dialog', actions: [{ label: 'Close', ghost: true }, { label: `Download ${it.out.name}`, primary: true, onClick: () => download(it.out.blob, it.out.name) }] });
  const box = body.querySelector('.cv-cmp'); const hd = body.querySelector('.cv-cmp__handle');
  const set = (p) => { p = Math.max(0, Math.min(100, p)); box.style.setProperty('--pos', p + '%'); hd.setAttribute('aria-valuenow', Math.round(p)); };
  const fromX = (x) => { const r = box.getBoundingClientRect(); set(((x - r.left) / r.width) * 100); };
  box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); fromX(e.clientX); box.onpointermove = (ev) => fromX(ev.clientX); });
  box.addEventListener('pointerup', () => (box.onpointermove = null));
  hd.addEventListener('keydown', (e) => { const v = +hd.getAttribute('aria-valuenow'); if (e.key === 'ArrowLeft') { e.preventDefault(); set(v - (e.shiftKey ? 10 : 2)); } if (e.key === 'ArrowRight') { e.preventDefault(); set(v + (e.shiftKey ? 10 : 2)); } });
  // draw both versions once at display size (cheap to clip while dragging); zoom redraws from full resolution
  let zoom = 1; const bms = Promise.all([createImageBitmap(it.meta.previewBlob || it.file), createImageBitmap(it.out.blob)]).catch(() => null);
  const paint = async () => {
    const b2 = await bms; if (!b2) return; const r = box.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
    [body.querySelector('.cv-cmp__a'), body.querySelector('.cv-cmp__b')].forEach((c, i) => {
      const bm = b2[i]; c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      const fit = it.group === 'graphic' ? Math.min(c.width / bm.width, c.height / bm.height) : Math.max(c.width / bm.width, c.height / bm.height);
      const ref = b2[1]; const k = zoom === 1 ? fit : zoom * dpr * (ref.width / bm.width);
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(bm, (c.width - bm.width * k) / 2, (c.height - bm.height * k) / 2, bm.width * k, bm.height * k);
    });
  };
  requestAnimationFrame(paint);
  body.querySelector('.fw-seg').addEventListener('fw-change', (e) => { zoom = e.detail.value === 'fit' ? 1 : +e.detail.value; paint(); });
  return dlg;
}

// ───────────────────────────── paste card (real CSV → JSON etc.) ─────────────────────────────
function convertPaste(it) {
  it.target ||= presetFor(it) || groupTarget.paste || 'JSON';
  if (it.det.type === 'text' && it.text.trim()) it.res = { error: 'This looks like plain text, not a table or data. Pick a format under “Detected”, or open it in Textbench.' };
  else if (!it.text.trim()) it.res = { text: '', count: 0, unit: 'objects' };
  else it.res = convertText(it.text, it.det, it.target, it.opts);
  const ext = FMT[it.target]?.ext || 'txt';
  it.status = it.res.error ? 'error-soft' : 'done';
  it.out = it.res.error ? null : { blob: new Blob([it.res.text], { type: 'text/plain' }), size: new Blob([it.res.text]).size, name: `pasted-table.${ext === 'xlsx' ? 'csv' : ext}` };
  render(it); renderGroups(); renderSummary();
}
function detLabel(det) { return det.type === 'csv' ? `CSV · ${DELIM_NAME[det.delim]}s` : det.type.toUpperCase() === 'TEXT' ? 'Plain text' : det.type.toUpperCase(); }
function renderPaste(it) {
  const el = it.el; const r = it.res || {};
  if (!el.querySelector('.cv-split')) {
    el.querySelector('.cv-thumb').classList.add('fw-item__thumb--icon'); el.querySelector('.cv-thumb').innerHTML = thumbHtml(it);
    const panel = el.querySelector('.cv-panel'); panel.hidden = false; panel.className = 'cv-panel cv-panel--paste';
    panel.innerHTML = `<div class="cv-split">
      <div class="cv-pane"><div class="cv-pane__head"><span class="cv-pane__title">Input</span><span class="cv-pane__sub" data-in-sub></span></div>
        <textarea class="fw-textarea cv-pane__text" spellcheck="false" aria-label="Pasted text" placeholder="Paste CSV, JSON or YAML…"></textarea>
        <div class="cv-pane__foot"><label class="fw-toggle"><input type="checkbox" data-o="header" ${it.opts.header ? 'checked' : ''}> First row is the header</label><label class="fw-toggle"><input type="checkbox" data-o="types" ${it.opts.types ? 'checked' : ''}> Detect numbers and yes/no</label></div></div>
      <div class="cv-pane cv-pane--out"><div class="cv-pane__head"><span class="cv-pane__title" data-out-title></span><span class="fw-spacer"></span>
          <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" data-copy-out>${icon('copy', { size: 14 })}<span>Copy</span></button></div>
        <pre class="cv-pane__out" tabindex="0" aria-label="Converted output"></pre>
        <div class="cv-pane__foot cv-types" data-types></div></div></div>`;
    const ta = panel.querySelector('textarea'); ta.value = it.text;
    let tmr = 0; ta.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { it.text = ta.value; it.det = ta.value.trim() ? detect(ta.value) : it.det; it.size = new Blob([ta.value]).size; convertPaste(it); }, 120); });
    $$('[data-o]', panel).forEach((c) => (c.onchange = () => { it.opts[c.dataset.o] = c.checked; convertPaste(it); }));
    panel.querySelector('[data-copy-out]').onclick = (e) => { if (it.res?.text) copyText(it.res.text, e.currentTarget, { toastLabel: `${it.target}` }); };
  }
  el.classList.toggle('is-error', false);
  el.querySelector('.cv-meta').innerHTML = `<span>Detected</span><button class="cv-detect" type="button" aria-haspopup="menu" aria-expanded="false">${esc(detLabel(it.det))}${icon('chevron-down', { size: 12 })}</button>`
    + (r.table ? `<span aria-hidden="true">·</span><span>${r.table.rows.length} rows × ${r.table.head.length} columns</span>` : `<span aria-hidden="true">·</span><span>${esc(formatBytes(it.size))}</span>`);
  el.querySelector('.cv-detect').onclick = (e) => openMenu(e.currentTarget, [{ group: 'Read it as', items: [
    ...[';', ',', '\t'].map((d) => ({ label: `CSV · ${DELIM_NAME[d]}s`, checked: it.det.type === 'csv' && it.det.delim === d, onSelect: () => { it.det = { type: 'csv', delim: d }; convertPaste(it); } })),
    { label: 'JSON', checked: it.det.type === 'json', onSelect: () => { it.det = { type: 'json' }; convertPaste(it); } },
    { label: 'YAML', checked: it.det.type === 'yaml', onSelect: () => { it.det = { type: 'yaml' }; convertPaste(it); } }] }]);
  const to = el.querySelector('.cv-to');
  to.innerHTML = `${ARROW}<button class="fw-target" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Output format ${esc(it.target)}. Change">${esc(it.target)}${icon('chevron-down', { size: 14 })}</button>`;
  to.querySelector('.fw-target').onclick = (e) => openPalette(e.currentTarget, { group: 'paste', current: it.target, scopeLabel: 'For the pasted text', onPick: (f) => { it.target = f; groupTarget.paste = f; convertPaste(it); } });
  el.querySelector('.cv-status').innerHTML = r.error ? `<span class="cv-verdict cv-verdict--ask">${icon('circle-help', { size: 14 })}Check input</span>` : it.out ? `<span class="fw-delta">${icon('circle-check')}<span>${esc(formatBytes(it.out.size))}</span><span class="fw-faint">live</span></span>` : '';
  const a = el.querySelector('.cv-actions');
  a.innerHTML = `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="dl" aria-label="Download converted text" data-tip="Download" ${it.out ? '' : 'disabled'}>${icon('download')}</button><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="rm" aria-label="Remove pasted text" data-tip="Remove">${icon('x')}</button>`;
  a.querySelector('[data-act="dl"]').onclick = (e) => download(it.out.blob, it.out.name, e.currentTarget);
  a.querySelector('[data-act="rm"]').onclick = () => removeItem(it);
  const panel = el.querySelector('.cv-panel');
  panel.querySelector('[data-in-sub]').textContent = detLabel(it.det);
  panel.querySelector('[data-out-title]').innerHTML = r.error ? 'Output' : `${esc(it.target)} <span class="fw-faint">· ${r.count ?? 0} ${esc(r.unit || '')}${r.note ? ' · ' + esc(r.note) : ''}</span>`;
  panel.querySelector('.cv-pane__out').innerHTML = r.error ? `<span class="cv-pane__err">${icon('circle-help', { size: 16 })}${esc(r.error)}</span>` : highlight(r.text || '', it.target);
  const types = r.table?.types; const tEl = panel.querySelector('[data-types]');
  if (types && it.opts.types) {
    const label = { number: '123 number', boolean: 'yes/no → true/false', date: 'date', text: 'text' };
    const shown = r.table.head.map((h2, i) => [h2, types[i]]).filter(([, t]) => t !== 'text');
    tEl.innerHTML = `<span class="cv-types__l">Typed</span>${shown.map(([h2, t]) => `<span class="cv-type cv-type--${t}"><b>${esc(h2)}</b> ${esc(label[t])}</span>`).join('')}${r.table.decimalComma ? '<span class="cv-type cv-type--note">5.692,04 → 5692.04</span>' : ''}`;
  } else tEl.innerHTML = it.opts.types ? '' : '<span class="fw-faint">Every value stays text</span>';
}

// ───────────────────────────── settings inspector ─────────────────────────────
const useSheet = () => innerWidth < 1100;
function openInspector() {
  const groups = presentGroups(); if (!groups.length) return;
  const sel = items.find((x) => x.id === selectedId);
  scope = sel && groups.includes(sel.group) ? sel.group : groups.includes(scope) ? scope : groups[0];
  if (useSheet()) {
    const body = h('<div class="cv-insp cv-insp--sheet"></div>');
    inspectorOpen = true;
    openSheet({ title: 'Settings', body, height: 'half', onClose: () => { inspectorOpen = false; renderGroups(); } });
    renderInspector(body);
    return;
  }
  inspectorOpen = true; $('#cv-inspector').hidden = false; $('#cv-work').classList.add('has-inspector');
  $('#cv-page').classList.add('fw-page--wide'); $('#cv-ab').classList.add('fw-page--wide');
  renderInspector(); renderGroups(); fitInspector();
  $('#cv-inspector').querySelector('input,button')?.focus({ preventScroll: true });
}
function closeInspector() {
  if (!inspectorOpen) return; inspectorOpen = false;
  $('#cv-inspector').hidden = true; $('#cv-work').classList.remove('has-inspector');
  $('#cv-page').classList.remove('fw-page--wide'); $('#cv-ab').classList.remove('fw-page--wide');
  renderGroups(); $('#cv-settings-btn')?.focus({ preventScroll: true });
}
const presentGroups = () => ORDER.filter((g) => PALETTE[g] && g !== 'paste' && items.some((x) => x.group === g && x.status !== 'error' && x.status !== 'ask'));
let inspEl = null;
function renderInspector(target) {
  if (target) inspEl = target; else if (!useSheet()) inspEl = $('#cv-inspector');
  if (!inspEl || !inspectorOpen) return;
  const groups = presentGroups(); if (!groups.includes(scope)) scope = groups[0];
  const g = scope; const s = S(g); const list = items.filter((x) => x.group === g && x.status !== 'error');
  const t = mode(list.map(targetOf)); const why = PALETTE[g].flatMap((x) => x.items).find(([f]) => f === t)?.[1] || '';
  const img = g === 'photo' || g === 'graphic'; const vid = g === 'video';
  const lossy = img && !FMT[t]?.lossless;
  inspEl.innerHTML = `${useSheet() ? '' : `<div class="cv-insp__head"><span class="cv-insp__title">${icon('settings', { size: 16 })}Settings</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-close aria-label="Close settings" data-tip="Close">${icon('x')}</button></div>`}
    ${groups.length > 1 ? `<div class="cv-insp__scope fw-chips" role="radiogroup" aria-label="Settings for" data-roving="button">${groups.map((x) => { const n = items.filter((i) => i.group === x).length; return `<button class="fw-chip" type="button" role="radio" aria-checked="${x === g}" aria-pressed="${x === g}" data-scope="${x}">${icon(GROUPS[x].icon, { size: 14 })}${n} ${esc(noun(x, n))}</button>`; }).join('')}</div>` : `<div class="cv-insp__for">For ${list.length} ${esc(noun(g, list.length))}</div>`}
    <section class="fw-insp-section"><div class="fw-insp-section__head">Format</div>
      <div class="cv-insp__fmt"><button class="fw-target fw-target--lg" type="button" data-fmt aria-haspopup="dialog" aria-expanded="false">${esc(t)}${icon('chevron-down', { size: 14 })}</button><span class="fw-t-sm fw-muted">${esc(why)}</span></div></section>
    ${img ? `<section class="fw-insp-section">
      ${lossy ? `<div class="fw-slider"><label class="fw-slider__label" for="cv-q">Quality</label><output class="fw-slider__value" for="cv-q"></output><input id="cv-q" type="range" min="40" max="100" step="1" value="${s.quality}"></div>
      <div class="cv-scale" aria-hidden="true"><span>Smaller</span><span>Better</span></div>` : `<div class="fw-t-sm fw-muted">${esc(t)} is lossless: every pixel is kept.</div>`}
      <div class="cv-est" aria-live="polite"></div></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">Size</div>
      <div class="fw-chips cv-sizes" role="radiogroup" aria-label="Longest side" data-roving="button">${[[0, 'Original'], [3840, '4K'], [1920, '1920'], [1600, 'Web 1600'], [1024, 'Email 1024']].map(([v, l]) => `<button class="fw-chip" type="button" role="radio" aria-checked="${s.edge === v}" aria-pressed="${s.edge === v}" data-edge="${v}">${l}</button>`).join('')}</div>
      <div class="fw-field"><label class="fw-field__label" for="cv-max">Max file size <span class="fw-faint">· optional</span></label><div class="cv-kb"><input class="fw-input" id="cv-max" inputmode="numeric" placeholder="e.g. 500" value="${esc(s.maxKB)}" ${lossy ? '' : 'disabled'} aria-describedby="cv-max-hint"><span class="cv-kb__unit" aria-hidden="true">kB</span></div>
        <span class="fw-field__hint" id="cv-max-hint">${lossy ? 'Lowers quality per file until it fits.' : `Not available for ${esc(t)}.`}</span></div></section>
    ${g === 'graphic' && t === 'JPG' ? `<section class="fw-insp-section"><div class="fw-insp-section__head">Background</div><div class="fw-t-sm fw-muted">JPG can't be see-through. Fill with:</div>
      <div class="cv-swatches" role="radiogroup" aria-label="Background colour" data-roving="button">${[['#ffffff', 'White'], ['#000000', 'Black'], ['#f4efe6', 'Paper']].map(([c, l]) => `<button type="button" class="cv-swatch" role="radio" aria-checked="${s.matte === c}" aria-label="${l}" data-tip="${l}" data-matte="${c}" style="--c:${c}"></button>`).join('')}</div></section>` : ''}
    <section class="fw-insp-section"><div class="fw-insp-section__head">Privacy</div>
      <label class="fw-toggle"><input type="checkbox" data-k="keepMeta" ${s.keepMeta ? 'checked' : ''}> Keep date and camera</label>
      <label class="fw-toggle"><input type="checkbox" data-k="keepGPS" ${s.keepGPS ? 'checked' : ''}> Keep location</label>
      <span class="fw-field__hint">Location is removed by default, so photos are safe to share.</span></section>` : ''}
    ${vid ? `<section class="fw-insp-section"><div class="fw-insp-section__head">Quality</div>
      <div class="fw-seg" aria-label="Video quality">${[['small', 'Smaller'], ['balanced', 'Balanced'], ['best', 'Best']].map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${v}" aria-checked="${s.vq === v}">${l}</button>`).join('')}</div>
      <div class="cv-est" aria-live="polite"></div>
      <span class="fw-field__hint">Trim and resolution are per video: ${icon('scissors', { size: 12 })} on the card.</span></section>
      <section class="fw-insp-section"><div class="fw-insp-section__head">Engine</div><dl class="fw-insp-kv"><dt>Encoder</dt><dd>Built into the browser</dd><dt>Download</dt><dd>None needed</dd><dt>Speed</dt><dd>~3× real time</dd></dl></section>` : ''}
    ${!img && !vid ? `<section class="fw-insp-section"><div class="cv-est" aria-live="polite"></div></section>` : ''}
    <div class="cv-insp__foot"><span class="fw-t-sm fw-faint">Changes re-convert right away.</span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-reset>Reset</button></div>`;
  enhance(inspEl);
  const q = inspEl.querySelector('#cv-q');
  inspEl.querySelector('[data-close]')?.addEventListener('click', closeInspector);
  $$('[data-scope]', inspEl).forEach((b) => (b.onclick = () => { scope = b.dataset.scope; renderInspector(); inspEl.querySelector(`[data-scope="${scope}"]`)?.focus(); }));
  inspEl.querySelector('[data-fmt]').onclick = (e) => openGroupPalette(g, e.currentTarget);
  if (q) { q.addEventListener('input', () => { s.quality = +q.value; paintEstimate(g); }); q.addEventListener('change', () => rerunGroup(g)); }
  $$('[data-edge]', inspEl).forEach((b) => (b.onclick = () => { s.edge = +b.dataset.edge; $$('[data-edge]', inspEl).forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.setAttribute('aria-pressed', String(x === b)); }); paintEstimate(g); rerunGroup(g); }));
  const mx = inspEl.querySelector('#cv-max'); let mt = 0;
  mx?.addEventListener('input', () => { const v = mx.value.replace(/\D/g, ''); mx.value = v; s.maxKB = v ? +v : ''; clearTimeout(mt); mt = setTimeout(() => { paintEstimate(g); rerunGroup(g); }, 500); });
  $$('[data-matte]', inspEl).forEach((b) => (b.onclick = () => { s.matte = b.dataset.matte; $$('[data-matte]', inspEl).forEach((x) => x.setAttribute('aria-checked', String(x === b))); rerunGroup(g); }));
  $$('[data-k]', inspEl).forEach((c) => (c.onchange = () => { s[c.dataset.k] = c.checked; }));
  inspEl.querySelector('.fw-seg[aria-label="Video quality"]')?.addEventListener('fw-change', (e) => { s.vq = e.detail.value; paintEstimate(g); rerunGroup(g); });
  inspEl.querySelector('[data-reset]').onclick = () => { settings[g] = { ...DEF }; delete groupTarget[g]; items.filter((x) => x.group === g).forEach((x) => { x.target = null; requeue(x); }); renderGroups(); schedule(); renderInspector(); };
  paintEstimate(g);
}
function estimateGroup(g) {
  const s = S(g); const list = items.filter((x) => x.group === g && !['error', 'ask'].includes(x.status));
  let inB = 0; let outB = 0;
  for (const it of list) {
    inB += it.size; const t = targetOf(it);
    if (isImg(it) && it.meta.w) {
      const now = { w: it.meta.w, h: it.meta.h, fmt: t, q: s.quality, edge: s.edge, graphic: g === 'graphic' };
      let e = estimateImage(now);
      if (it.out && it.ranWith && it.ranWith.target === t) e = Math.round(it.out.size * e / estimateImage({ ...now, q: it.ranWith.quality, edge: it.ranWith.edge }));
      if (s.maxKB) e = Math.min(e, s.maxKB * 1000);
      outB += e;
    } else if (it.kind === 'video' && it.edit) outB += estimateMedia({ fmt: t, sec: it.edit.t1 - it.edit.t0, res: it.edit.res, vq: s.vq, sound: it.edit.sound });
    else outB += it.out?.size || estimateOther(it.size, t);
  }
  return { inB, outB, n: list.length };
}
function paintEstimate(g) {
  const box = inspEl?.querySelector('.cv-est'); if (!box) return;
  const { inB, outB, n } = estimateGroup(g); const pct = Math.round((1 - outB / inB) * 100);
  const w = Math.max(2, Math.min(100, (outB / inB) * 100));
  box.innerHTML = `<div class="cv-est__nums"><span class="fw-num">${esc(formatBytes(inB))}</span>${ARROW}<b class="fw-num">about ${esc(formatBytes(outB))}</b>${pct > 0 ? `<span class="cv-est__pct">−${pct} %</span>` : ''}</div>
    <div class="cv-est__bars" aria-hidden="true"><span class="cv-est__in"></span><span class="cv-est__out" style="width:${w}%"></span></div>
    <div class="cv-est__sub">${n} ${esc(noun(g, n))} · estimate updates as you drag</div>`;
}
let rerunT = 0;
function rerunGroup(g) { clearTimeout(rerunT); rerunT = setTimeout(() => { items.filter((x) => x.group === g).forEach((x) => { if (x.kind !== 'video' || g === 'video') requeue(x); }); schedule(); }, 220); }

// ───────────────────────────── action bar ─────────────────────────────
function renderSummary() {
  if (!items.length) return;
  const real = items.filter((x) => x.kind !== 'paste');
  const done = items.filter((x) => x.status === 'done'); const doneReal = done.filter((x) => x.kind !== 'paste');
  const active = items.filter((x) => ['working', 'queued', 'reading'].includes(x.status));
  const bad = items.filter((x) => x.status === 'error').length; const ask = items.filter((x) => x.status === 'ask').length;
  const inB = doneReal.reduce((s, x) => s + x.size, 0); const outB = doneReal.reduce((s, x) => s + x.out.size, 0);
  const mobile = isMobile() || isCoarse();
  const line = $('#ab-line'); const sub = $('#ab-sub'); const prim = $('#ab-primary');
  const total = real.filter((x) => !['error', 'ask'].includes(x.status)).length;
  if (active.length) {
    const left = (items.filter((x) => x.status === 'working').reduce((s, x) => s + (1 - x.p / 100) * x.D, 0) + items.filter((x) => x.status === 'queued').reduce((s, x) => s + durationFor(x), 0)) / MAXPAR / 1000;
    line.innerHTML = mobile ? `<span class="fw-num">${doneReal.length} of ${total}</span> done` : `Converting · <span class="fw-num">${doneReal.length} of ${total}</span> done`;
    sub.textContent = mobile ? `about ${Math.max(1, Math.ceil(left))} s left` : `about ${Math.max(1, Math.ceil(left))} s left · ${MAXPAR} at a time on this device`;
    const fr = total ? (doneReal.length + items.filter((x) => x.status === 'working').reduce((s, x) => s + x.p / 100, 0)) / total : 0;
    $('#cv-ab-progress').style.setProperty('--value', (fr * 100).toFixed(1) + '%'); $('#cv-ab-progress').hidden = false;
  } else {
    $('#cv-ab-progress').hidden = true;
    const n = doneReal.length;
    line.innerHTML = n ? (mobile ? `<span class="fw-num">${n}</span> ready · <span class="fw-num">${esc(formatBytes(outB))}</span>` : `<span class="fw-num">${n}</span> converted · <span class="fw-num">${esc(formatBytes(inB))} → ${esc(formatBytes(outB))}</span>`) : done.length ? 'Pasted text converted' : 'Nothing converted yet';
    const bits = []; if (inB > outB) bits.push(`saved ${formatBytes(inB - outB)}`); if (ask) bits.push(`${ask} needs you`); if (bad) bits.push(`${bad} can't be read`);
    sub.textContent = bits.length ? bits.join(' · ').replace(/^s/, 'S') : 'Ready to download';
  }
  $('#ab-cancel').hidden = !active.length; $('#ab-clear').hidden = !!active.length;
  const lbl = mobile ? 'Save all' : active.length && done.length ? `Download ${done.length} ready` : done.length > 1 ? 'Download all' : 'Download';
  prim.disabled = !done.length;
  prim.querySelector('[data-l]').textContent = lbl;
  prim.querySelector('.fw-kbd')?.toggleAttribute('hidden', mobile);
}
async function downloadAll(btn) {
  const done = items.filter((x) => x.status === 'done' && x.out);
  if (!done.length) return;
  if (isMobile() || isCoarse()) return saveAllSheet(done);
  const skipped = items.length - done.length;
  if (done.length === 1) return download(done[0].out.blob, done[0].out.name, btn);
  btn?.classList.add('is-busy');
  const zip = await makeZip(done.map((x) => ({ name: x.out.name, blob: x.out.blob })));
  const first = base(done.find((x) => x.kind !== 'paste')?.name || 'converted');
  const name = `${first}-and-${done.length - 1}-more.zip`;
  download(zip, name); btn?.classList.remove('is-busy');
  const shown = done.reduce((s, x) => s + x.out.size, 0);
  toast(`${name} · ${done.length} files · ${formatBytes(shown)}${skipped ? ` · ${skipped} skipped` : ''}`, { type: 'success' });
}
function download(blob, name, btn) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (btn) { btn.classList.add('is-copied'); setTimeout(() => btn.classList.remove('is-copied'), 1200); }
}
function saveAllSheet(done) {
  const imgs = done.filter(isImg); const total = done.reduce((s, x) => s + x.out.size, 0);
  const what = imgs.length === done.length ? `${done.length} ${done.length === 1 ? 'photo' : 'photos'}` : `${done.length} files`;
  const body = h(`<div class="cv-save">
    <div class="cv-save__strip">${done.slice(0, 6).map((x) => (x.meta.thumb ? `<img alt="" src="${x.meta.thumb}">` : `<span>${icon('file')}</span>`)).join('')}</div>
    <div class="cv-save__list">
      <button class="cv-save__opt" type="button" data-s="photos">${icon('images', { size: 22 })}<span><b>Save to Photos</b><small>${what} · ${esc(formatBytes(total))}, straight into your library</small></span></button>
      <button class="cv-save__opt" type="button" data-s="zip">${icon('file-archive', { size: 22 })}<span><b>Save as one ZIP</b><small>To Files or Downloads</small></span></button>
      <button class="cv-save__opt" type="button" data-s="share">${icon('share-2', { size: 22 })}<span><b>Send to an app</b><small>Messages, mail, cloud…</small></span></button>
    </div></div>`);
  const sh = openSheet({ title: `Save ${what}`, body, height: 'auto' });
  body.querySelector('[data-s="photos"]').onclick = async () => {
    const files = done.map((x) => new File([x.out.blob], x.out.name, { type: x.out.blob.type }));
    sh.close();
    if (navigator.canShare?.({ files })) { try { await navigator.share({ files }); return; } catch { return; } }
    toast(`Saved ${what} to Photos`, { type: 'success' });
  };
  body.querySelector('[data-s="zip"]').onclick = async () => { sh.close(); const zip = await makeZip(done.map((x) => ({ name: x.out.name, blob: x.out.blob }))); download(zip, `${base(done[0].name)}-and-${done.length - 1}-more.zip`); toast('ZIP saved', { type: 'success' }); };
  body.querySelector('[data-s="share"]').onclick = () => { sh.close(); toast('Opening share…', { type: 'neutral' }); };
}

// ───────────────────────────── wiring ─────────────────────────────
$('#ab-primary').insertAdjacentHTML('beforeend', kbd('mod+s', 'cv-btn-kbd'));
$('#ab-primary').onclick = (e) => downloadAll(e.currentTarget);
$('#ab-cancel').onclick = () => { items.filter((x) => ['working', 'queued'].includes(x.status)).forEach(cancel); toast('Cancelled · finished files are kept', { type: 'neutral', action: { label: 'Resume', onClick: () => { items.filter((x) => x.status === 'cancelled').forEach((x) => { x.status = 'queued'; render(x); }); schedule(); } } }); };
$('#ab-clear').onclick = () => {
  const old = items.slice(); old.forEach((x) => { x.run++; x.el.remove(); }); items.length = 0; resetEmpty();
  toast(`Cleared ${old.length} ${old.length === 1 ? 'file' : 'files'}`, { type: 'neutral', action: { label: 'Undo', onClick: () => restore(old) } });
};
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (!hasLayers()) downloadAll($('#ab-primary')); return; }
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); pickWith(''); }
});
$('#cv-items').addEventListener('keydown', (e) => {
  const card = e.target.closest('.cv-item'); if (!card || e.target !== card || e.metaKey || e.ctrlKey || e.altKey) return;
  const it = items.find((x) => x.el === card); const vis = $$('.cv-item:not([hidden])', $('#cv-items')); const i = vis.indexOf(card);
  const k = e.key;
  if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); const n = vis[i + (k === 'ArrowDown' ? 1 : -1)]; if (n) select(items.find((x) => x.el === n)); }
  else if (k === 'Home' || k === 'End') { e.preventDefault(); select(items.find((x) => x.el === (k === 'Home' ? vis[0] : vis.at(-1)))); }
  else if (k === 'f') { e.preventDefault(); const b = card.querySelector('.fw-target'); if (b) (it.kind === 'paste' ? b.click() : openItemPalette(it, b)); }
  else if (k === 'c') { e.preventDefault(); openCompare(it); }
  else if (k === 'e') { e.preventDefault(); toggleEdit(it); }
  else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); const n = vis[i + 1] || vis[i - 1]; removeItem(it); if (n) select(items.find((x) => x.el === n)); }
  else if (k === 'Enter' && it.status === 'done') { e.preventDefault(); download(it.out.blob, it.out.name); }
});
function fitInspector() {
  const el = $('#cv-inspector'); if (el.hidden) return;
  const ab = $('#cv-ab .fw-actionbar').getBoundingClientRect();
  el.style.maxHeight = Math.max(240, Math.min(innerHeight, ab.top) - el.getBoundingClientRect().top - 16) + 'px';
}
addEventListener('scroll', () => { if (inspectorOpen) fitInspector(); }, { passive: true });
addEventListener('resize', () => { fitInspector(); if (inspectorOpen && useSheet() && !$('#cv-inspector').hidden) closeInspector(); renderSummary(); });
addEventListener('fw-theme-change', () => { /* thumbnails/frames are photos; nothing theme-dependent to redraw */ });

renderHead(); renderIntake(); renderBelow();
// expose for tests/recording
window.__cv = { items, addPaste, SAMPLE_CSV };
