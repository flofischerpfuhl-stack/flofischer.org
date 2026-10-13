// ASCII art studio: Text → FIGlet font gallery (all 22 fonts live), Image → ASCII with ramps, dithering and themes.
import { mountShell, effectiveTheme, icon, esc, $, $$, h, enhance, toast, openSheet, openMenu, isMobile, copyText, formatBytes, loadSamples, kbd } from '../kit/shell.js';
import { xicon } from './xicons.js';

const FONTS = ['Standard', 'Slant', 'Big', 'Small', 'Doom', 'Shadow', 'Speed', 'Block', 'Banner', 'Roman', 'Ogre', 'Graffiti', 'Univers', 'Thin', 'Digital', 'Rectangles', 'Stop', 'Tombstone', 'Whimsy', 'Isometric1', '3-D', 'Ghost'];
const RAMPS = { simple: ' .:-=+*#%@', blocks: ' ░▒▓█', detailed: ' .\'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$', dots: ' ⠁⠃⠇⡇⣇⣧⣷⣿' };
const params = new URLSearchParams(location.search);
const S = { mode: params.get('mode') === 'image' ? 'image' : 'text', text: params.get('q') || 'Fernwork', font: 'Slant', tight: false, wrap: 80, query: '', theme: 'paper',
  img: null, cols: 96, ramp: 'simple', invert: false, dither: false, unsupported: {} };
const figlet = window.figlet;

mountShell({ leaf: 'ascii-art', archetype: 'workbench', accept: ['image'], acceptLabel: 'ASCII art', onFiles: (f) => loadImage(f[0]),
  onPasteText: (t) => { S.mode = 'text'; S.text = t.slice(0, 60); render(); return true; } });
document.title = 'ASCII art · Fernwork';
S.theme = effectiveTheme() === 'dark' ? 'dark' : 'paper';

// fonts: fetch the 22 vendored .flf files once
await Promise.all(FONTS.map(async (f) => { const t = await (await fetch(`vendor/figlet/fonts/${f}.flf`)).text(); figlet.parseFont(f, t); }));

function art(font, text = S.text) {
  try { return figlet.textSync(text || ' ', { font, horizontalLayout: S.tight ? 'fitted' : 'default', width: S.wrap, whitespaceBreak: true }).replace(/\s+$/gm, '').replace(/^\n+|\n+$/g, ''); } catch { return ''; }
}
function missing(font) {
  const out = []; for (const ch of new Set([...S.text])) { if (ch === ' ') continue; let a = ''; try { a = figlet.textSync(ch, { font }); } catch { /* */ } if (!a.trim()) out.push(ch); }
  return out;
}

// ───────── frame bar ─────────
function framebar() {
  $('#framebar').innerHTML = `
    <span class="as-title">${icon('case-sensitive', { size: 16 })}<span>ASCII art</span></span>
    <span class="fw-divider-v"></span>
    <div class="fw-seg fw-seg--sm" aria-label="Input" id="modeseg"><button class="fw-seg__opt" type="button" data-value="text" aria-checked="${S.mode === 'text'}">${icon('type', { size: 14 })}Text</button><button class="fw-seg__opt" type="button" data-value="image" aria-checked="${S.mode === 'image'}">${icon('image', { size: 14 })}Image</button></div>
    <span class="fw-spacer"></span>
    <a class="fw-btn fw-btn--ghost fw-btn--sm fw-hide-compact" href="index.html">${icon('text-cursor')}Textbench</a>
    <button class="fw-btn fw-btn--primary fw-btn--sm fw-hide-compact" type="button" id="copy">${icon('copy')}Copy</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="more" aria-label="Export options" data-tip="Export">${icon('ellipsis')}</button>`;
  enhance($('#framebar'));
  $('#modeseg').addEventListener('fw-change', (e) => { S.mode = e.detail.value; render(); });
  $('#copy').onclick = (e) => copyText(output(), e.currentTarget);
  $('#more').onclick = (e) => openMenu(e.currentTarget, exportItems(), { placement: 'bottom-end' });
}
function exportItems() {
  return [{ group: 'Copy', items: [{ label: 'Copy text', icon: 'copy', kbd: 'mod+c', onSelect: () => copyText(output(), null, { toastLabel: 'ASCII art' }) }, { label: 'Copy for Markdown', icon: 'code-xml', sub: 'Inside a ``` code block', onSelect: () => copyText('```\n' + output() + '\n```\n', null, { toastLabel: 'as Markdown' }) }] },
    { group: 'Download', items: [{ label: 'Text file (.txt)', icon: 'download', onSelect: () => download('txt') }, { label: 'Image (.png)', icon: 'image', sub: 'Uses the preview theme', onSelect: () => download('png') }, { label: 'Web page (.html)', icon: 'file-code', onSelect: () => download('html') }] }];
}
function output() { return S.mode === 'text' ? art(S.font) : S.imgArt || ''; }
function fileBase() { return S.mode === 'text' ? `${(S.text || 'ascii').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ascii'}-${S.font.toLowerCase()}` : `${(S.img?.name || 'image').replace(/\.\w+$/, '')}-ascii`; }
function download(kind) {
  const txt = output(); let blob;
  if (kind === 'txt') blob = new Blob([txt + '\n'], { type: 'text/plain' });
  else if (kind === 'html') blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(fileBase())}</title><pre style="font:12px/1.15 ui-monospace,Menlo,monospace">${esc(txt)}</pre>`], { type: 'text/html' });
  else { const c = renderPng(txt); c.toBlob((b) => save(b, 'png')); return; }
  save(blob, kind);
  function save(b, ext) { const a = h(`<a download="${fileBase()}.${ext}"></a>`); a.href = URL.createObjectURL(b); a.click(); toast(`Saved ${fileBase()}.${ext}`, { type: 'success' }); }
}
function renderPng(txt) {
  const lines = txt.split('\n'); const fs = 16, lh = Math.round(fs * 1.15), pad = 24;
  const c = document.createElement('canvas'); const ctx = c.getContext('2d'); ctx.font = `${fs}px "Geist Mono", monospace`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  c.width = Math.ceil(w + pad * 2); c.height = lines.length * lh + pad * 2;
  const th = THEMES[S.theme]; ctx.fillStyle = th.bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = `${fs}px "Geist Mono", monospace`; ctx.fillStyle = th.fg; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lh));
  return c;
}
const THEMES = { paper: { bg: '#ffffff', fg: '#111111', label: 'Paper' }, dark: { bg: '#121214', fg: '#ededed', label: 'Dark' }, terminal: { bg: '#07110b', fg: '#4ade80', label: 'Terminal' } };

// ───────── text mode ─────────
function renderText() {
  const stage = $('#stage');
  if (!stage.querySelector('.as-textui')) {
    stage.innerHTML = `<div class="as-textui">
      <div class="as-inputs">
        <label class="as-big"><span class="fw-sr">Your text</span><input class="as-big__in" id="txt" type="text" value="${esc(S.text)}" maxlength="60" spellcheck="false" autocomplete="off" placeholder="Type your text"></label>
        <label class="fw-inputwrap as-search"><span data-icon="search"></span><input class="fw-input" id="fsearch" type="search" placeholder="Filter ${FONTS.length} fonts" aria-label="Filter fonts"></label>
      </div>
      <div class="as-note" id="note" hidden></div>
      <div class="as-gallery" id="gallery" role="listbox" aria-label="Fonts"></div></div>`;
    enhance(stage);
    const inp = $('#txt');
    inp.addEventListener('input', () => { S.text = inp.value; S.unsupported = {}; renderGallery(); renderPanel(); });
    $('#fsearch').addEventListener('input', (e) => { S.query = e.target.value.toLowerCase(); renderGallery(); });
  }
  renderGallery();
}
function renderGallery() {
  const g = $('#gallery'); if (!g) return;
  const list = FONTS.filter((f) => f.toLowerCase().includes(S.query));
  g.innerHTML = list.map((f) => `<button class="as-card" type="button" role="option" aria-selected="${f === S.font}" data-font="${f}">
      <span class="as-card__head"><span class="as-card__name">${f}</span>${f === S.font ? `<span class="as-card__sel">${icon('check', { size: 13 })}Selected</span>` : ''}</span>
      <pre class="as-card__art" aria-hidden="true">${esc(art(f)) || '&nbsp;'}</pre></button>`).join('') || `<p class="tb-muted as-none">No font matches “${esc(S.query)}”.</p>`;
  $$('.as-card', g).forEach((c) => (c.onclick = () => { S.font = c.dataset.font; $$('.as-card', g).forEach((x) => { const on = x === c; x.setAttribute('aria-selected', on); const hd = x.querySelector('.as-card__head'); hd.querySelector('.as-card__sel')?.remove(); if (on) hd.insertAdjacentHTML('beforeend', `<span class="as-card__sel">${icon('check', { size: 13 })}Selected</span>`); }); renderPanel(); renderStatus(); if (isMobile()) mbar(); }));
  fitArts();
  const miss = missing(S.font); const note = $('#note');
  if (miss.length) { note.hidden = false; note.innerHTML = `${icon('info', { size: 14 })}<span>${miss.length} ${miss.length === 1 ? 'character isn’t' : 'characters aren’t'} in these fonts and will be left out: <b>${miss.map(esc).join(' ')}</b></span>`; } else note.hidden = true;
  renderStatus();
}
function fitArts(root = document) {
  $$('.as-card__art, .as-preview__art', root).forEach((pre) => {
    const cols = Math.max(1, ...pre.textContent.split('\n').map((l) => [...l].length));
    const avail = pre.clientWidth - 2; const fs = Math.max(4, Math.min(pre.classList.contains('as-preview__art') ? 15 : 12, avail / (cols * 0.6)));
    pre.style.fontSize = fs.toFixed(2) + 'px';
  });
}
new ResizeObserver(() => fitArts()).observe(document.body);

// ───────── image mode ─────────
function renderImage() {
  const stage = $('#stage');
  if (!S.img) {
    stage.innerHTML = `<div class="as-imgempty"><div class="fw-intake" data-intake data-accept="image/*" aria-label="Choose an image">
      <span class="fw-intake__icon">${icon('image', { size: 22 })}</span>
      <span class="fw-intake__title"><span class="fw-pointer-copy">Drop a photo to turn it into ASCII art</span><span class="fw-touch-copy">Choose a photo to turn into ASCII art</span></span>
      <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>${icon('folder-open')}Choose image</button></span>
      <span class="fw-intake__sub">JPG · PNG · WebP · HEIC <span class="fw-dot"></span><a href="#" data-sample="IMG_2043.jpg>ferns.jpg">Try the fern photo</a></span>
      <span class="fw-intake__privacy">${icon('lock', { size: 12 })} Converted on this device</span></div></div>`;
    enhance(stage); return;
  }
  stage.innerHTML = `<div class="as-imgui"><figure class="as-src"><img alt="${esc(S.img.name)}" src="${S.img.url}"><figcaption>${esc(S.img.name)} · ${S.img.w} × ${S.img.h}</figcaption></figure>
    <div class="as-out as-theme-${S.theme}"><pre class="as-preview__art" id="imgart"></pre></div></div>`;
  convert();
}
async function loadImage(file) {
  if (!file) return;
  if (/\.hei[cf]$/i.test(file.name)) { toast(`${file.name}: HEIC is decoded with the Images engine in the real build. Showing a JPG preview here.`, { type: 'info' }); }
  const url = URL.createObjectURL(file); const im = new Image(); im.src = url; await im.decode();
  S.img = { name: file.name, url, el: im, w: im.naturalWidth, h: im.naturalHeight, size: file.size }; S.mode = 'image'; render();
}
function convert() {
  const im = S.img?.el; if (!im) return;
  const cols = S.cols, rows = Math.max(1, Math.round(cols * (im.naturalHeight / im.naturalWidth) * 0.5));
  const c = document.createElement('canvas'); c.width = cols; c.height = rows; const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, cols, rows); const d = ctx.getImageData(0, 0, cols, rows).data;
  const L = new Float32Array(cols * rows); let lo = 255, hi = 0;
  for (let i = 0; i < cols * rows; i++) { const v = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; L[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const ramp = [...RAMPS[S.ramp]]; const n = ramp.length - 1; const span = Math.max(1, hi - lo);
  const darkBg = S.theme !== 'paper'; // ink = how much glyph a cell needs: dark pixels on paper, bright pixels on dark themes
  const ink = new Float32Array(cols * rows);
  for (let i = 0; i < ink.length; i++) { let v = (L[i] - lo) / span; if (!darkBg) v = 1 - v; if (S.invert) v = 1 - v; ink[i] = v; }
  let out = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x; const v = Math.max(0, Math.min(1, ink[i]));
      const q = Math.round(v * n);
      if (S.dither) {
        const err = v - q / n;
        if (x + 1 < cols) ink[i + 1] += err * 7 / 16;
        if (y + 1 < rows) { if (x > 0) ink[i + cols - 1] += err * 3 / 16; ink[i + cols] += err * 5 / 16; if (x + 1 < cols) ink[i + cols + 1] += err * 1 / 16; }
      }
      out += ramp[q];
    }
    out += '\n';
  }
  S.imgArt = out.replace(/\s+$/gm, '');
  const pre = $('#imgart'); if (pre) { pre.textContent = S.imgArt; fitArts($('#stage')); }
  renderStatus();
}

// ───────── panel ─────────
function panelHtml() {
  const themeSeg = `<div class="fw-seg fw-seg--sm" aria-label="Preview theme" id="theme">${Object.entries(THEMES).map(([k, t]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${S.theme === k}">${t.label}</button>`).join('')}</div>`;
  const exportSec = `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('download', { size: 14 })}Export</div>
    <button class="fw-btn fw-btn--primary fw-btn--block" type="button" data-x="copy">${icon('copy')}Copy</button>
    <div class="tb-btnrow"><button class="fw-btn fw-btn--sm" type="button" data-x="md">${icon('code-xml')}Copy for Markdown</button><button class="fw-btn fw-btn--sm" type="button" data-x="txt">${icon('download')}.txt</button><button class="fw-btn fw-btn--sm" type="button" data-x="png">${icon('image')}.png</button></div></section>`;
  if (S.mode === 'text') {
    const a = art(S.font); const cols = Math.max(0, ...a.split('\n').map((l) => [...l].length));
    return `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('eye', { size: 14 })}Preview<span class="tb-head-note">${S.font} · ${cols} columns</span></div>
        <div class="as-preview as-theme-${S.theme}"><pre class="as-preview__art">${esc(a)}</pre></div>${themeSeg}</section>
      <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('sliders-horizontal', { size: 14 })}Layout</div>
        <div class="fw-slider"><label class="fw-slider__label" for="wrap">Wrap at</label><output class="fw-slider__value"></output><input id="wrap" type="range" min="30" max="160" step="2" value="${S.wrap}" data-unit=" columns"></div>
        <label class="fw-toggle"><input type="checkbox" id="tight" ${S.tight ? 'checked' : ''}><span>Tight letter spacing</span></label></section>${exportSec}`;
  }
  if (!S.img) return `<section class="fw-insp-section"><p class="tb-muted">Choose or drop a photo. You’ll set the width, characters and theme here.</p></section>`;
  return `<section class="fw-insp-section"><div class="fw-insp-section__head">${icon('sliders-horizontal', { size: 14 })}Picture</div>
      <div class="fw-slider"><label class="fw-slider__label" for="cols">Width</label><output class="fw-slider__value"></output><input id="cols" type="range" min="40" max="200" step="4" value="${S.cols}" data-unit=" columns"></div>
      <div class="tb-row"><span class="tb-row__label">Characters</span></div>
      <div class="tb-chiprow" role="radiogroup" aria-label="Characters">${Object.keys(RAMPS).map((r) => `<button class="fw-chip" type="button" role="radio" data-ramp="${r}" aria-checked="${S.ramp === r}" aria-pressed="${S.ramp === r}">${r[0].toUpperCase() + r.slice(1)} <span class="as-ramp">${esc(RAMPS[r].length > 12 ? RAMPS[r].slice(0, 10) + '…' : RAMPS[r].trim())}</span></button>`).join('')}</div>
      <label class="fw-toggle"><input type="checkbox" id="dither" ${S.dither ? 'checked' : ''}><span>Dithering (finer shading)</span></label>
      <label class="fw-toggle"><input type="checkbox" id="invert" ${S.invert ? 'checked' : ''}><span>Invert</span></label></section>
    <section class="fw-insp-section"><div class="fw-insp-section__head">${icon('contrast', { size: 14 })}Theme</div>${themeSeg}</section>${exportSec}`;
}
let sheet = null;
function renderPanel(host = sheet?.body || $('#panel')) {
  host.innerHTML = panelHtml(); enhance(host); fitArts(host);
  host.querySelector('#theme')?.addEventListener('fw-change', (e) => { S.theme = e.detail.value; renderPanel(); if (S.mode === 'image') renderImage(); });
  const w = host.querySelector('#wrap'); if (w) w.addEventListener('input', () => { S.wrap = +w.value; renderGallery(); const pre = host.querySelector('.as-preview__art'); pre.textContent = art(S.font); fitArts(host); });
  const t = host.querySelector('#tight'); if (t) t.onchange = () => { S.tight = t.checked; renderGallery(); renderPanel(); };
  const c = host.querySelector('#cols'); if (c) c.addEventListener('input', () => { S.cols = +c.value; convert(); });
  $$('[data-ramp]', host).forEach((b) => (b.onclick = () => { S.ramp = b.dataset.ramp; renderPanel(); convert(); }));
  const di = host.querySelector('#dither'); if (di) di.onchange = () => { S.dither = di.checked; convert(); };
  const iv = host.querySelector('#invert'); if (iv) iv.onchange = () => { S.invert = iv.checked; convert(); };
  $$('[data-x]', host).forEach((b) => (b.onclick = () => { const x = b.dataset.x; if (x === 'copy') copyText(output(), b); else if (x === 'md') copyText('```\n' + output() + '\n```\n', b); else download(x); }));
}
function renderStatus() {
  const a = output(); const ls = a.split('\n');
  $('#status').innerHTML = `<span class="fw-statusbar__item tb-st-kind">${S.mode === 'text' ? 'FIGlet' : 'Image → ASCII'}</span>${S.mode === 'text' ? `<span class="fw-statusbar__item">${S.font}</span><span class="fw-statusbar__item">${FONTS.length} fonts</span>` : S.img ? `<span class="fw-statusbar__item">${esc(S.img.name)}</span><span class="fw-statusbar__item">${S.cols} columns</span>` : ''}
    <span class="fw-statusbar__item">${ls.length} lines × ${Math.max(0, ...ls.map((l) => [...l].length))} columns</span><span class="fw-statusbar__item fw-statusbar__save">${icon('lock', { size: 12 })} On this device</span>`;
}
function mbar() {
  $('#mbar').innerHTML = `<button class="fw-btn" type="button" id="m-opts">${icon('sliders-horizontal')}${S.mode === 'text' ? 'Options' : 'Adjust'}</button><span class="fw-spacer"></span>
    <button class="fw-btn fw-btn--primary" type="button" id="m-copy">${icon('copy')}Copy${S.mode === 'text' ? ` · ${S.font}` : ''}</button>`;
  $('#m-copy').onclick = (e) => copyText(output(), e.currentTarget);
  $('#m-opts').onclick = () => { sheet = openSheet({ title: S.mode === 'text' ? S.font : 'Adjust', height: 'peek', body: '<div class="as-sheet"></div>', onClose: () => (sheet = null) }); sheet.body = sheet.el.querySelector('.as-sheet'); renderPanel(sheet.body); };
}
function render() {
  $$('#modeseg .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.mode)));
  if (S.mode === 'text') renderText(); else renderImage();
  renderPanel(); renderStatus(); mbar();
}
framebar(); render();
if (params.get('mode') === 'image' && params.has('sample')) loadImage((await loadSamples('IMG_2043.jpg>ferns.jpg'))[0]);
window.as = { S, render };
