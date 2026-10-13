// Image to ASCII: choose a picture → live ASCII art. Width and character set are up front; contrast, brightness,
// invert, dithering, colour (HTML) and background sit behind More options. Everything is today's feature set plus
// round-1 dithering and PNG export.
import {
  $, $$, esc, icon, enhance, toast, openMenu, copyText, settings, pane, iconBtn, outputActions, pickFile, download, downloadBlob,
  moreOptions, moreBtn, mobileBar, debounce, fmtN, bytes,
} from './ui.js';
import { loadSamples } from '../kit/shell.js';

let api = {};
export const config = {
  accept: ['image'],
  commands: [
    { id: 'ia-copy', label: 'Copy ASCII art', icon: 'copy', run: () => api.copy?.() },
    { id: 'ia-open', label: 'Choose an image', icon: 'image', run: () => api.open?.() },
  ],
};
const RAMPS = {
  detailed: ['Detailed', ' .`-_\':,;^=+/"|)\\<>)iv%xclrsz?jftLCJUYXZO0Qoahkbdpqwm*WMB8&#$@'],
  standard: ['Standard', ' .:-=+*#%@'], blocks: ['Blocks', ' ░▒▓█'], dots: ['Braille dots', ' ⠁⠃⠇⡇⣇⣧⣷⣿'],
  binary: ['Binary', ' @'], hearts: ['Hearts', ' ·:★♥❤'], hex: ['Hex 0–F', '0123456789ABCDEF'], custom: ['Custom…', ''],
};
const graphemes = (s) => (Intl.Segmenter ? [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment) : [...s]);

export async function mount(root, { params }) {
  const S = settings('img-ascii', { cols: 120, ramp: 'detailed', custom: ' .:-=+*#%@', contrast: 1, bright: 0, invert: false, dither: false, color: false, bg: 'dark' });
  root.innerHTML = `
    <div class="tx-img">
      <div class="tx-imgside">
        <div id="ia-src"></div>
        <div class="tx-settings" id="ia-set">
          <div class="fw-slider"><label class="fw-slider__label" for="ia-cols">Width</label><output class="fw-slider__value"></output><input id="ia-cols" type="range" min="20" max="400" step="2" value="${S.cols}" data-unit=" columns"></div>
          <div class="fw-field"><label class="fw-field__label" for="ia-ramp">Characters</label><select class="fw-select" id="ia-ramp">${Object.entries(RAMPS).map(([k, [l, r]]) => `<option value="${k}">${esc(l)}${r && k !== 'detailed' ? `  ${esc(r.trim().slice(0, 12))}` : ''}</option>`).join('')}</select>
            <input class="fw-input fw-input--mono" id="ia-custom" placeholder=" .:-=+*#%@" aria-label="Custom characters, dark to bright" value="${esc(S.custom)}" ${S.ramp === 'custom' ? '' : 'hidden'}></div>
          ${moreBtn()}
        </div>
      </div>
      <div class="tx-imgout">${pane({ id: 'ia-out', title: 'ASCII art', foot: false, actions: outputActions('ia-out') })}</div>
    </div>`;
  enhance(root);
  $('#ia-ramp').value = S.ramp;
  const outP = $('#ia-out'); const body = outP.querySelector('[data-body]'); const meta = outP.querySelector('[data-meta]');
  let img = null, art = { text: '', html: '' };

  function srcHtml() {
    if (!img) return `<div class="fw-intake" data-intake data-accept="image/*,.heic,.heif" data-multiple="false" aria-label="Choose an image">
      <span class="fw-intake__icon">${icon('image', { size: 22 })}</span>
      <span class="fw-intake__title"><span class="fw-pointer-copy">Drop an image</span><span class="fw-touch-copy">Choose an image</span></span>
      <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>${icon('folder-open')}Choose image</button></span>
      <span class="fw-intake__sub"><a href="#" data-sample="IMG_2043.jpg>ferns.jpg">Try a sample photo</a></span></div>`;
    return `<div class="tx-src"><img src="${img.url}" alt=""><div class="tx-src__main"><span class="tx-src__name">${esc(img.name)}</span><span class="tx-src__meta">${fmtN(img.w)} × ${fmtN(img.h)} · ${bytes(img.size)}</span></div>
      ${iconBtn('ia-change', 'refresh-cw', 'Choose another image')}${iconBtn('ia-remove', 'x', 'Remove image')}</div>`;
  }
  function renderSrc() {
    $('#ia-src').innerHTML = srcHtml(); enhance($('#ia-src'));
    $('#ia-change')?.addEventListener('click', open);
    $('#ia-remove')?.addEventListener('click', () => { const old = img; img = null; art = { text: '', html: '' }; renderSrc(); renderOut(); toast('Image removed', { type: 'neutral', action: { label: 'Undo', onClick: () => { img = old; renderSrc(); convert(); } } }); });
  }
  async function load(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(heic|heif|png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) { toast(`${file.name} isn’t an image.`, { type: 'warning' }); return; }
    const url = URL.createObjectURL(file); const el = new Image(); el.src = url;
    try { await el.decode(); } catch { toast(`${file.name} couldn’t be read as an image${/\.hei[cf]$/i.test(file.name) ? ' (HEIC is decoded by the Images engine in the real build)' : ''}.`, { type: 'danger' }); return; }
    img = { el, url, name: file.name, size: file.size, w: el.naturalWidth, h: el.naturalHeight }; renderSrc(); convert();
  }
  async function open() { const f = await pickFile('image/*,.heic,.heif'); if (f) load(f); }

  // ── conversion (today's mapping: luminance → contrast/brightness → ramp; optional dithering + colour) ──
  function convert() {
    if (!img) { renderOut(); return; }
    const cols = Math.max(20, Math.min(400, S.cols)); const rows = Math.max(1, Math.round((img.h / img.w) * cols * 0.5));
    const c = document.createElement('canvas'); c.width = cols; c.height = rows; const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img.el, 0, 0, cols, rows); const d = ctx.getImageData(0, 0, cols, rows).data;
    let ramp = graphemes(S.ramp === 'custom' ? (S.custom || ' .:-=+*#%@') : RAMPS[S.ramp][1]);
    if (S.bg === 'light') ramp = ramp.slice().reverse(); // dark ink on paper
    if (S.invert) ramp = ramp.slice().reverse();
    const n = ramp.length; const L = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) { let v = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; v = (v - 0.5) * S.contrast + 0.5 + S.bright; L[i] = Math.max(0, Math.min(1, v)); }
    let text = ''; const html = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x; const v = Math.max(0, Math.min(1, L[i]));
        const q = Math.min(n - 1, Math.floor(v * n));
        if (S.dither && n > 1) { const err = v - (q + 0.5) / n; if (x + 1 < cols) L[i + 1] += err * 7 / 16; if (y + 1 < rows) { if (x > 0) L[i + cols - 1] += err * 3 / 16; L[i + cols] += err * 5 / 16; if (x + 1 < cols) L[i + cols + 1] += err / 16; } }
        const ch = ramp[q]; text += ch;
        if (S.color) html.push(`<span style="color:rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})">${esc(ch)}</span>`);
      }
      text += '\n'; if (S.color) html.push('\n');
    }
    art = { text, html: S.color ? html.join('') : '', cols, rows };
    renderOut();
  }
  const schedule = debounce(convert, 40);
  function renderOut() {
    body.innerHTML = img ? `<pre class="tx-art tx-art--${S.bg}" id="ia-art"></pre>` : `<div class="tx-empty-note">Your ASCII art appears here.</div>`;
    meta.textContent = img ? `${art.cols} × ${art.rows} characters` : '';
    const pre = $('#ia-art'); if (pre) { if (art.html) pre.innerHTML = art.html; else pre.textContent = art.text; fitArt(); }
    bar();
  }
  function fitArt() { const pre = $('#ia-art'); if (!pre || !art.cols) return; const fs = Math.max(3, Math.min(14, (pre.clientWidth - 24) / (art.cols * 0.6))); pre.style.fontSize = fs.toFixed(2) + 'px'; }
  new ResizeObserver(debounce(fitArt, 50)).observe(body);

  // ── settings ──
  $('#ia-cols').addEventListener('input', (e) => { S.cols = +e.target.value; S.save(); schedule(); });
  $('#ia-ramp').onchange = (e) => { S.ramp = e.target.value; S.save(); $('#ia-custom').hidden = S.ramp !== 'custom'; if (S.ramp === 'custom') $('#ia-custom').focus(); convert(); };
  $('#ia-custom').oninput = (e) => { S.custom = e.target.value; S.save(); schedule(); };
  $('#more-opts').onclick = (e) => moreOptions(e.currentTarget, {
    html: `<div class="fw-slider"><label class="fw-slider__label" for="o-con">Contrast</label><output class="fw-slider__value"></output><input id="o-con" type="range" min="0.5" max="2.5" step="0.1" value="${S.contrast}" data-unit="×"></div>
      <div class="fw-slider"><label class="fw-slider__label" for="o-bri">Brightness</label><output class="fw-slider__value"></output><input id="o-bri" type="range" min="-0.5" max="0.5" step="0.05" value="${S.bright}"></div>
      <label class="fw-toggle"><input type="checkbox" id="o-inv" ${S.invert ? 'checked' : ''}><span>Invert</span></label>
      <label class="fw-toggle"><input type="checkbox" id="o-dit" ${S.dither ? 'checked' : ''}><span>Dithering<span class="tx-opt-sub">Finer shading with few characters</span></span></label>
      <label class="fw-toggle"><input type="checkbox" id="o-col" ${S.color ? 'checked' : ''}><span>Colour<span class="tx-opt-sub">Keeps the photo’s colours (HTML and PNG export)</span></span></label>
      <div class="fw-field"><span class="fw-field__label">Background</span><div class="fw-seg fw-seg--sm" aria-label="Background" id="o-bg"><button class="fw-seg__opt" type="button" data-value="dark" aria-checked="${S.bg === 'dark'}">Dark</button><button class="fw-seg__opt" type="button" data-value="light" aria-checked="${S.bg === 'light'}">Light</button></div></div>`,
    wire: (el) => {
      el.querySelector('#o-con').addEventListener('input', (ev) => { S.contrast = +ev.target.value; S.save(); schedule(); });
      el.querySelector('#o-bri').addEventListener('input', (ev) => { S.bright = +ev.target.value; S.save(); schedule(); });
      const t = (id, k) => (el.querySelector(id).onchange = (ev) => { S[k] = ev.target.checked; S.save(); convert(); });
      t('#o-inv', 'invert'); t('#o-dit', 'dither'); t('#o-col', 'color');
      el.querySelector('#o-bg').addEventListener('fw-change', (ev) => { S.bg = ev.detail.value; S.save(); convert(); });
    },
  });

  // ── export ──
  const base = () => `${(img?.name || 'image').replace(/\.\w+$/, '')}-ascii`;
  function copy(btn) { if (!art.text) { toast('Choose an image first.', { type: 'info' }); return; } copyText(art.text, btn, { toastLabel: 'ASCII art' }); }
  function htmlDoc() {
    const bg = S.bg === 'light' ? '#fff' : '#000', fg = S.bg === 'light' ? '#111' : '#eee';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ASCII art</title></head><body style="background:${bg};margin:0;"><pre style="font-family:monospace;line-height:1;white-space:pre;color:${fg};padding:8px;">${art.html || esc(art.text)}</pre></body></html>`;
  }
  function png() {
    const lines = art.text.split('\n'); const fs = 10, lh = 10, cw = 6; const c = document.createElement('canvas');
    c.width = art.cols * cw + 24; c.height = art.rows * lh + 24; const ctx = c.getContext('2d');
    ctx.fillStyle = S.bg === 'light' ? '#ffffff' : '#0f0f12'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = `${fs}px "Geist Mono", monospace`; ctx.textBaseline = 'top';
    const tmp = document.createElement('canvas'); tmp.width = art.cols; tmp.height = art.rows; const t2 = tmp.getContext('2d'); t2.drawImage(img.el, 0, 0, art.cols, art.rows); const px = t2.getImageData(0, 0, art.cols, art.rows).data;
    lines.forEach((l, y) => [...l].forEach((ch, x) => { const i = (y * art.cols + x) * 4; ctx.fillStyle = S.color ? `rgb(${px[i]},${px[i + 1]},${px[i + 2]})` : S.bg === 'light' ? '#111' : '#e5e5e5'; ctx.fillText(ch, 12 + x * cw, 12 + y * lh); }));
    c.toBlob((b) => downloadBlob(b, `${base()}.png`));
  }
  function exportMenu(anchor) {
    if (!art.text) { toast('Choose an image first.', { type: 'info' }); return; }
    openMenu(anchor, [
      { group: 'Copy', items: [{ label: 'Copy text', icon: 'copy', onSelect: () => copy(null) }, { label: 'Copy for Markdown', icon: 'code-xml', onSelect: () => copyText('```\n' + art.text + '```\n', null, { toastLabel: 'ASCII art as Markdown' }) }] },
      { group: 'Download', items: [{ label: 'Text file (.txt)', icon: 'file-text', onSelect: () => download(art.text, `${base()}.txt`) }, { label: `Web page (.html)${S.color ? ' · colour' : ''}`, icon: 'file-code', onSelect: () => download(htmlDoc(), `${base()}.html`, 'text/html') }, { label: 'Image (.png)', icon: 'image', onSelect: png }] },
    ], { placement: 'bottom-end' });
  }
  $('#ia-out-copy').onclick = (e) => copy(e.currentTarget);
  $('#ia-out-dl').onclick = (e) => exportMenu(e.currentTarget);
  $('#ia-out-more').onclick = (e) => exportMenu(e.currentTarget);
  root.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && art.text) { e.preventDefault(); download(art.text, `${base()}.txt`); } });
  function bar() {
    const b = mobileBar(root, { line: img ? `${art.cols} columns` : '<span class="fw-faint">Choose an image</span>', actions: img ? `<button class="fw-iconbtn" type="button" id="m-more" aria-label="Export">${icon('download')}</button><button class="fw-btn fw-btn--primary" type="button" id="m-copy">${icon('copy')}Copy</button>` : `<button class="fw-btn fw-btn--primary" type="button" id="m-open">${icon('image')}Choose image</button>` });
    b.querySelector('#m-copy')?.addEventListener('click', (e) => copy(e.currentTarget)); b.querySelector('#m-more')?.addEventListener('click', (e) => exportMenu(e.currentTarget)); b.querySelector('#m-open')?.addEventListener('click', open);
  }
  api = { copy: () => copy(null), open };
  renderSrc(); renderOut();
  if (params.get('sample')) load((await loadSamples('IMG_2043.jpg>ferns.jpg'))[0]);
  return { onFiles: (files) => load(files[0]) };
}
