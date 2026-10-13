// Color Picker (+ Contrast checker preset). Picker page: one colour input (any CSS colour), SV/hue/opacity picker,
// every format with copy, sliders behind More options, tints & shades (OKLCH 50–950), harmonies, contrast on
// white/black/your background with Fix. Contrast checker page: text + background, WCAG 2 + APCA, Fix.
import { $, $$, esc, icon, enhance, copyText, toast, openDialog, openMenu, store, isTyping, hasLayers, mountIntake } from '../kit/shell.js';
import * as C from './lib/colorlib.js';
import { moreHtml, wireMore, download, isCoarse } from './ui.js';

const hex = (c) => C.hex(c, { alpha: false });
const textOn = (c) => (C.luminance(c) > 0.32 ? '#111111' : '#ffffff');
const BADGES = [['AA', 4.5, 'Normal text'], ['AA Large', 3, 'Large text (24 px, or 19 px bold)'], ['AAA', 7, 'Normal text, enhanced'], ['AAA Large', 4.5, 'Large text, enhanced']];
const ratioTxt = (r) => `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;
const badgesHtml = (r) => BADGES.map(([n, t, d]) => { const ok = r >= t; return `<span class="co-badge ${ok ? 'is-ok' : 'is-bad'}" data-tip="${d} · needs ${t}:1">${icon(ok ? 'check' : 'x', { size: 14 })}${n}</span>`; }).join('');
const swatchBtn = (c, label = '') => `<button type="button" class="co-sw" style="--c:${c}" data-col="${c}" aria-label="Use ${c}${label ? ' (' + label + ')' : ''}" data-tip="${c} · Shift+click to copy"></button>`;

export function mount(ctx) {
  if (ctx.leaf.id === 'contrast-checker') return mountContrast(ctx);
  const { root, hooks, params } = ctx;
  const hp = new URLSearchParams(location.hash.slice(1));
  const start = C.parseAny(params.get('q') || '') || C.parse('#' + (hp.get('c') || '')) || C.parse(store.get('util:color:last') || '') || C.parse('#1599b8');
  const S = { c: { ...start }, a: start.a ?? 1, hsv: C.toHsv(start), bg: C.parse('#' + (hp.get('bg') || '')) || C.parse(store.get('util:color:bg') || '') || C.parse('#ffffff') };
  ctx.renderHeader({ lede: 'HEX, RGB, HSL, HSV and OKLCH, with tints, harmonies and contrast.' });
  const hasEye = 'EyeDropper' in window;
  root.innerHTML = `
  <div class="co">
    <div class="co-input">
      <div class="fw-query fw-query--mono co-query"><span data-icon="pipette"></span>
        <label class="fw-sr" for="co-in">Colour</label>
        <input class="fw-query__input" id="co-in" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="#1599b8, rgb(), hsl(), oklch() or a name like steelblue">
      </div>
      ${hasEye ? `<button class="fw-btn fw-btn--lg co-tool" type="button" id="co-eye" data-tip="Pick a colour anywhere on your screen" data-tip-kbd="i">${icon('pipette')}<span>Screen</span></button>` : ''}
      <button class="fw-btn fw-btn--lg co-tool" type="button" id="co-img" data-tip="Pick a colour from a photo">${icon('image')}<span>From image</span></button>
    </div>
    <div id="co-msg"></div>
    <div class="co-main">
      <section class="fw-card co-picker" id="co-picker" aria-label="Picker"></section>
      <section class="fw-card co-values" aria-label="Values">
        <div class="co-swatch" id="co-swatch"><div class="co-swatch__fill" id="co-fill"></div>
          <div class="co-swatch__meta"><span class="co-swatch__name" id="co-name"></span><span class="co-swatch__hex fw-mono" id="co-hex"></span></div></div>
        <div class="fw-rows co-rows" id="co-rows"></div>
        ${moreHtml('co-more', `<div class="co-sliders" id="co-sliders"></div>`, { label: 'Sliders' })}
      </section>
    </div>
    <section class="fw-card co-sec" aria-labelledby="co-tint-t">
      <div class="co-sec__head"><h2 class="co-sec__title" id="co-tint-t">Tints &amp; shades</h2><span class="fw-spacer"></span>
        <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="co-export">${icon('download')}<span>Export</span>${icon('chevron-down', { size: 14 })}</button></div>
      <div class="co-steps" id="co-steps" role="list"></div>
      <h2 class="co-sec__title co-sec__title--sub">Harmonies</h2>
      <div class="co-harm" id="co-harm"></div>
    </section>
    <section class="fw-card co-sec" aria-labelledby="co-ct-t">
      <div class="co-sec__head"><h2 class="co-sec__title" id="co-ct-t">Contrast</h2><span class="fw-spacer"></span>
        <a class="fw-btn fw-btn--sm fw-btn--ghost" id="co-ctlink" href="./?leaf=contrast-checker">${icon('contrast')}<span>Contrast checker</span></a></div>
      <div class="co-ctbar">
        <span class="co-ctbar__label">Background</span>
        <label class="co-chipcolor" id="co-bg-chip"><input type="color" id="co-bg-pick" aria-label="Background colour"><span></span></label>
        <input class="fw-input fw-input--mono co-pairin" id="co-bg" spellcheck="false" aria-label="Background colour value">
        <button class="fw-btn fw-btn--sm" type="button" id="co-swap" data-tip="Use the background as the colour and the colour as background">${icon('arrow-left-right')}<span>Swap</span></button>
      </div>
      <div class="co-tiles" id="co-tiles"></div>
    </section>
  </div>`;
  enhance(root);
  wireMore(root, { key: 'util:color:sliders' });
  const inp = $('#co-in');

  // ── picker: SV square + hue + opacity ──
  $('#co-picker').innerHTML = `<div class="cp">
      <div class="cp-sv" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100"><canvas class="cp-sv__c" width="320" height="220"></canvas><span class="cp-sv__thumb"></span></div>
      <label class="cp-row"><span>Hue</span><input class="cp-range cp-hue" type="range" min="0" max="360" step="1" aria-label="Hue"><output class="fw-num" data-v="h"></output></label>
      <label class="cp-row"><span>Opacity</span><input class="cp-range cp-alpha" type="range" min="0" max="100" step="1" aria-label="Opacity"><output class="fw-num" data-v="a"></output></label>
    </div>`;
  const sv = $('.cp-sv'), cv = $('.cp-sv__c'), g = cv.getContext('2d'), th = $('.cp-sv__thumb'), hue = $('.cp-hue'), al = $('.cp-alpha');
  function drawPicker() {
    const W = cv.width, H = cv.height;
    g.fillStyle = `hsl(${S.hsv.h} 100% 50%)`; g.fillRect(0, 0, W, H);
    let gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    th.style.left = `${S.hsv.s * 100}%`; th.style.top = `${(1 - S.hsv.v) * 100}%`; th.style.background = hex(S.c);
    hue.value = Math.round(S.hsv.h); al.value = Math.round(S.a * 100); al.style.setProperty('--c', hex(S.c));
    sv.setAttribute('aria-valuenow', Math.round(S.hsv.s * 100)); sv.setAttribute('aria-valuetext', `saturation ${Math.round(S.hsv.s * 100)}%, brightness ${Math.round(S.hsv.v * 100)}%`);
    $('[data-v="h"]').textContent = `${Math.round(S.hsv.h)}°`; $('[data-v="a"]').textContent = `${Math.round(S.a * 100)} %`;
  }
  const fromXY = (e) => { const r = sv.getBoundingClientRect(); S.hsv = { ...S.hsv, s: C.clamp((e.clientX - r.left) / r.width), v: 1 - C.clamp((e.clientY - r.top) / r.height) }; fromHsv(); };
  sv.addEventListener('pointerdown', (e) => { sv.setPointerCapture(e.pointerId); fromXY(e); sv.focus({ preventScroll: true }); });
  sv.addEventListener('pointermove', (e) => { if (sv.hasPointerCapture(e.pointerId)) fromXY(e); });
  sv.addEventListener('keydown', (e) => {
    const st = e.shiftKey ? 0.1 : 0.01; const k = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
    if (!k) return; e.preventDefault(); S.hsv = { ...S.hsv, s: C.clamp(S.hsv.s + k[0]), v: C.clamp(S.hsv.v + k[1]) }; fromHsv();
  });
  hue.addEventListener('input', () => { S.hsv = { ...S.hsv, h: +hue.value }; fromHsv(); });
  al.addEventListener('input', () => { S.a = +al.value / 100; update('alpha'); });
  function fromHsv() { S.c = { ...C.fromHsv(S.hsv), a: S.a }; update('picker'); }
  function setColor(c, from = 'input') {
    S.c = { r: c.r, g: c.g, b: c.b }; if (c.a != null) S.a = c.a;
    const hsv = C.toHsv(S.c); if (hsv.s === 0 || hsv.v === 0) hsv.h = S.hsv.h; S.hsv = hsv;
    update(from);
  }

  // ── sliders (RGB + alpha, HSL) with exact number inputs ──
  const SL = [['r', 'R', 255], ['g', 'G', 255], ['b', 'B', 255], ['al', 'A', 100], ['h', 'H', 360], ['s', 'S', 100], ['l', 'L', 100]];
  $('#co-sliders').innerHTML = `<div class="co-slgroup"><span class="co-slgroup__t">RGB</span>${SL.slice(0, 4).map(slRow).join('')}</div><div class="co-slgroup"><span class="co-slgroup__t">HSL</span>${SL.slice(4).map(slRow).join('')}</div>`;
  function slRow([k, l, max]) { const name = { r: 'Red', g: 'Green', b: 'Blue', al: 'Alpha (%)', h: 'Hue', s: 'Saturation (%)', l: 'Lightness (%)' }[k]; return `<div class="co-sl"><span class="co-sl__l">${l}</span><input class="cp-range" type="range" min="0" max="${max}" step="1" data-sl="${k}" aria-label="${name}"><input class="fw-input fw-input--mono co-sl__n" type="number" min="0" max="${max}" data-sn="${k}" aria-label="${name} value"></div>`; }
  $('#co-sliders').addEventListener('input', (e) => {
    const k = e.target.dataset.sl || e.target.dataset.sn; if (!k) return;
    const v = Math.max(0, Math.min(+e.target.max, +e.target.value || 0));
    const R = C.rgb255(S.c), hs = C.toHsl(S.c);
    if ('rgb'.includes(k)) { const o = { r: R[0], g: R[1], b: R[2], [k]: v }; setColor({ r: o.r / 255, g: o.g / 255, b: o.b / 255 }, 'sl-' + k); }
    else if (k === 'al') { S.a = v / 100; update('sl-al'); }
    else { const o = { h: hs.h, s: hs.s * 100, l: hs.l * 100, [k]: v }; setColor(C.fromHsl({ h: o.h, s: o.s / 100, l: o.l / 100 }), 'sl-' + k); }
  });
  function syncSliders(from) {
    const R = C.rgb255(S.c), hs = C.toHsl(S.c);
    const v = { r: R[0], g: R[1], b: R[2], al: Math.round(S.a * 100), h: Math.round(hs.h), s: Math.round(hs.s * 100), l: Math.round(hs.l * 100) };
    for (const [k] of SL) { const r = $(`[data-sl="${k}"]`), n = $(`[data-sn="${k}"]`); r.value = v[k]; if (from !== 'sl-' + k || document.activeElement !== n) n.value = v[k]; }
  }

  // ── update everything ──
  let saveT = 0;
  function update(from) {
    const full = { ...S.c, a: S.a };
    const f = C.formats(full);
    if (from !== 'input') { inp.value = f.hex; inp.removeAttribute('aria-invalid'); }
    drawPicker(); syncSliders(from);
    $('#co-fill').style.background = C.hex(full); $('#co-swatch').style.setProperty('--on', textOn(S.c));
    $('#co-name').textContent = C.nameOf(S.c); $('#co-hex').textContent = f.hex;
    $('#co-rows').innerHTML = [['HEX', f.hex], ['RGB', f.rgb], ['HSL', f.hsl], ['HSV', f.hsv], ['OKLCH', f.oklch]].map(([l, v]) => `<div class="fw-vrow"><span class="fw-vrow__label">${l}</span><span class="fw-vrow__value">${esc(v)}</span>
      <button class="fw-btn fw-btn--sm co-copy" type="button" data-copy="${esc(v)}" aria-label="Copy ${l}">${icon('copy')}<span>Copy</span></button></div>`).join('');
    enhance($('#co-rows'));
    renderScale(); renderHarm(); renderContrast();
    $('#co-ctlink').href = `./?leaf=contrast-checker#fg=${hex(S.c).slice(1)}&bg=${hex(S.bg).slice(1)}`;
    clearTimeout(saveT); saveT = setTimeout(() => {
      store.set('util:color:last', f.hex); store.set('util:color:bg', hex(S.bg));
      const h = new URLSearchParams({ c: hex(S.c).slice(1) }); if (hex(S.bg) !== '#ffffff') h.set('bg', hex(S.bg).slice(1));
      history.replaceState(history.state, '', `${location.pathname}${location.search.replace(/([?&])q=[^&]*&?/, '$1').replace(/[?&]$/, '')}#${h}`);
    }, 250);
    const a = ctx.mbar.set({ line: f.hex, sub: C.nameOf(S.c), actions: `<button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy HEX</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = (e) => copyText(f.hex, e.currentTarget);
  }

  // ── tints & shades + harmonies ──
  let scaleNow = [];
  function renderScale() {
    scaleNow = C.scale(S.c);
    $('#co-steps').innerHTML = scaleNow.map((s) => { const h = hex(s.c); return `<div class="co-step ${s.anchor ? 'is-anchor' : ''}" role="listitem" style="--c:${h};--on:${textOn(s.c)}">
      <button class="co-step__sw" type="button" data-col="${h}" aria-label="${s.step}: ${h}${s.anchor ? ', your colour' : ''}" data-tip="Use ${h} · Shift+click to copy"><span class="co-step__n fw-num">${s.step}</span></button>
      <button class="co-step__copy fw-mono" type="button" data-copy="${h}" aria-label="Copy ${h}">${h.slice(1)}</button></div>`; }).join('');
    enhance($('#co-steps'));
  }
  const HARM = [['Complementary', [180]], ['Split complementary', [150, 210]], ['Analogous', [-30, 30]], ['Triadic', [120, 240]], ['Tetradic', [90, 180, 270]]];
  function renderHarm() {
    const o = C.toOklch(S.c);
    $('#co-harm').innerHTML = HARM.map(([name, offs]) => `<div class="co-hrow"><span class="co-hrow__l">${name}</span><div class="co-hrow__sw">${swatchBtn(hex(S.c), 'your colour')}${offs.map((d) => swatchBtn(hex(C.fromOklch({ l: o.l, c: o.c, h: (o.h + d + 360) % 360 })))).join('')}</div></div>`).join('');
    enhance($('#co-harm'));
  }
  const pickSwatch = (e) => {
    const b = e.target.closest('[data-col]'); if (!b) return;
    if (e.shiftKey) { copyText(b.dataset.col, b, { toastLabel: b.dataset.col }); return; }
    setColor(C.parse(b.dataset.col), 'swatch');
  };
  $('#co-steps').addEventListener('click', pickSwatch); $('#co-harm').addEventListener('click', pickSwatch);
  root.addEventListener('keydown', (e) => { const b = e.target.closest?.('[data-col]'); if (b && e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); copyText(b.dataset.col, b, { toastLabel: b.dataset.col }); } });
  $('#co-export').onclick = (e) => {
    const name = C.nameOf(S.c).replace(/^Near /, '').toLowerCase().replace(/[^a-z]+/g, '-');
    const pairs = scaleNow.map((s) => [s.step, hex(s.c)]);
    const out = {
      css: `:root {\n${pairs.map(([k, v]) => `  --${name}-${k}: ${v};`).join('\n')}\n}`,
      tw: `'${name}': {\n${pairs.map(([k, v]) => `  ${k}: '${v}',`).join('\n')}\n},`,
      json: JSON.stringify({ [name]: Object.fromEntries(pairs) }, null, 2),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${64 * pairs.length}" height="96" font-family="sans-serif" font-size="11">${pairs.map(([k, v], i) => `<rect x="${i * 64}" width="64" height="72" fill="${v}"/><text x="${i * 64 + 6}" y="88" fill="#333">${k} ${v}</text>`).join('')}</svg>`,
    };
    openMenu(e.currentTarget, [{ group: 'Copy', items: [
      { label: 'CSS variables', icon: 'code-xml', onSelect: () => copyText(out.css, null, { toastLabel: 'CSS variables' }) },
      { label: 'Tailwind colours', icon: 'braces', onSelect: () => copyText(out.tw, null, { toastLabel: 'Tailwind colours' }) },
      { label: 'JSON', icon: 'file-json', onSelect: () => copyText(out.json, null, { toastLabel: 'JSON' }) } ] },
    { group: 'Download', items: [{ label: `${name}-scale.svg`, icon: 'download', onSelect: () => download(new Blob([out.svg], { type: 'image/svg+xml' }), `${name}-scale.svg`) }] }]);
  };

  // ── contrast: your colour on your background / white / black ──
  function renderContrast() {
    const fg = S.c;
    if (document.activeElement !== $('#co-bg')) $('#co-bg').value = hex(S.bg);
    $('#co-bg-pick').value = hex(S.bg); $('#co-bg-chip').style.setProperty('--c', hex(S.bg));
    const pairs = [['On your background', S.bg, true], ['On white', C.parse('#ffffff')], ['On black', C.parse('#000000')]];
    $('#co-tiles').innerHTML = pairs.map(([label, bg, main]) => {
      const r = C.wcag(fg, bg); const lc = C.apca(fg, bg);
      const fix = main && r < 4.5 ? C.fixContrast(fg, bg, 4.5) : null;
      return `<div class="co-tile"><div class="co-tile__pv" style="background:${hex(bg)};color:${hex(fg)}"><span class="co-tile__aa">Aa</span><span>${esc(label)}</span></div>
        <div class="co-tile__score"><span class="co-tile__ratio fw-num">${ratioTxt(r)}</span><span class="ut-hint fw-num">APCA Lc ${Math.round(Math.abs(lc))}</span></div>
        <div class="co-badges">${badgesHtml(r)}</div>
        ${fix ? `<button class="fw-btn fw-btn--sm co-fixbtn" type="button" data-fix="${hex(fix)}"><span class="co-dot" style="--c:${hex(fix)}"></span>Fix for AA · ${hex(fix)}</button>` : ''}</div>`;
    }).join('');
    enhance($('#co-tiles'));
    $$('[data-fix]', $('#co-tiles')).forEach((b) => (b.onclick = () => setColor(C.parse(b.dataset.fix), 'fix')));
  }
  const bgIn = (e) => { const c = C.parseAny(e.target.value, { partial: e.type !== 'input' }); if (!c) { if (e.type !== 'input') e.target.setAttribute('aria-invalid', 'true'); return; } e.target.removeAttribute('aria-invalid'); if (e.type === 'change' && hex(c) === hex(S.bg)) return; S.bg = c; update('bg'); };
  ['input', 'change'].forEach((ev) => $('#co-bg').addEventListener(ev, bgIn));
  $('#co-bg-pick').addEventListener('input', (e) => { S.bg = C.parse(e.target.value); update('bg'); });
  $('#co-swap').onclick = () => { const old = { ...S.c }; const bg = S.bg; S.bg = old; setColor(bg, 'swap'); };

  // ── input ──
  const msg = (text, kind = 'warning') => { $('#co-msg').innerHTML = text ? `<div class="fw-alert fw-alert--${kind}"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(text)}</div></div>` : ''; };
  inp.addEventListener('input', () => { const c = C.parseAny(inp.value, { partial: false }); if (c) { inp.removeAttribute('aria-invalid'); msg(c.clipped ? 'This OKLCH colour is outside sRGB; it was mapped to the nearest colour screens can show.' : ''); setColor(c, 'input'); } });
  const commit = () => {
    const c = C.parseAny(inp.value, { partial: true });
    if (c) { inp.removeAttribute('aria-invalid'); if (C.hex(c) !== C.hex({ ...S.c, a: S.a })) setColor(c, 'commit'); }
    else if (inp.value.trim()) { inp.setAttribute('aria-invalid', 'true'); msg('That isn’t a colour. Try #1599b8, rgb(21 153 184), hsl(191 79% 40%), oklch(62% 0.1 216) or a name like steelblue.'); }
  };
  inp.addEventListener('change', commit); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  hooks.onPaste = (t) => { const c = C.parseAny(t.trim()); if (!c) return false; inp.value = t.trim(); setColor(c, 'paste'); return true; };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyText(hex(S.c), $('#co-rows .co-copy')); return; }
    if (isTyping() || hasLayers() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'i' && hasEye) { e.preventDefault(); eyedrop(); }
  });

  // ── eyedropper + from image ──
  async function eyedrop() { try { const r = await new window.EyeDropper().open(); setColor(C.parse(r.sRGBHex), 'eye'); } catch { /* cancelled */ } }
  $('#co-eye')?.addEventListener('click', eyedrop);
  $('#co-img').onclick = () => fromImage();
  hooks.onFiles = (files) => { const f = [...files].find((x) => /^image\//.test(x.type)); if (f) fromImage(f); };
  function fromImage(file) {
    const body = `<div class="fi">
      <div class="fi-stage" id="fi-stage">${file ? '' : `<div class="fw-intake fi-intake"><div class="fw-intake__icon">${icon('image')}</div><div class="fw-intake__title"><span class="fw-pointer-copy">Drop or paste a photo</span><span class="fw-touch-copy">Choose a photo</span></div><div class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>Choose image</button></div><div class="fw-intake__samples"><button type="button" class="fw-chip fw-chip--sample" data-sample="IMG_2043.jpg>ferns.jpg">Ferns photo</button><button type="button" class="fw-chip fw-chip--sample" data-sample="IMG_2041.jpg>lagoon.jpg">Lagoon photo</button></div></div>`}</div>
      <div class="fi-side"><div class="fi-loupe" id="fi-loupe" aria-hidden="true"><canvas width="120" height="120"></canvas></div>
        <p class="fw-t-sm fw-muted" id="fi-hint">${isCoarse() ? 'Tap' : 'Click'} the photo to pick a colour.</p>
        <div class="fi-extract" id="fi-ex"></div></div></div>`;
    const d = openDialog({ title: 'Colour from image', body, size: 920, className: 'fi-dialog' });
    const load = async (f) => {
      const bmp = await createImageBitmap(f); const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.className = 'fi-img';
      const gg = c.getContext('2d', { willReadFrequently: true }); gg.drawImage(bmp, 0, 0, c.width, c.height);
      $('#fi-stage', d.el).innerHTML = ''; $('#fi-stage', d.el).append(c);
      const lo = $('#fi-loupe canvas', d.el), lg = lo.getContext('2d'); lg.imageSmoothingEnabled = false;
      const at = (e) => { const r = c.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * c.width), Math.floor(((e.clientY - r.top) / r.height) * c.height)]; };
      const px = (x, y) => { const p = gg.getImageData(C.clamp(x, 0, c.width - 1), C.clamp(y, 0, c.height - 1), 1, 1).data; return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: 1 }; };
      c.addEventListener('pointermove', (e) => { const [x, y] = at(e); lg.clearRect(0, 0, 120, 120); lg.drawImage(c, x - 7, y - 7, 15, 15, 0, 0, 120, 120); lg.strokeStyle = '#fff'; lg.lineWidth = 2; lg.strokeRect(56, 56, 8, 8); $('#fi-loupe', d.el).style.setProperty('--c', hex(px(x, y))); $('#fi-hint', d.el).innerHTML = `<span class="fw-mono">${hex(px(x, y))}</span> · ${isCoarse() ? 'tap' : 'click'} to use`; });
      c.addEventListener('click', (e) => { const [x, y] = at(e); setColor(px(x, y), 'image'); d.close(); });
      const pal = C.extract(gg.getImageData(0, 0, c.width, c.height), 5);
      $('#fi-ex', d.el).innerHTML = `<p class="fw-t-sm fi-ex__t">Main colours</p><div class="fi-pal">${pal.map((p) => `<button type="button" class="fi-sw" style="--c:${hex(p)}" data-c="${hex(p)}" aria-label="Use ${hex(p)}" data-tip="${hex(p)}"></button>`).join('')}</div>`;
      enhance($('#fi-ex', d.el));
      $$('.fi-sw', d.el).forEach((b) => (b.onclick = () => { setColor(C.parse(b.dataset.c), 'image'); d.close(); }));
    };
    if (file) load(file); else mountIntake($('.fi-intake', d.el), { onFiles: (fs) => load(fs[0]), accept: 'image/*', multiple: false });
  }

  ctx.shell.setCommands?.([
    { id: 'co-copy', label: 'Copy HEX', icon: 'copy', kbd: 'mod+shift+c', run: () => copyText(hex(S.c), null, { toastLabel: hex(S.c) }) },
    ...(hasEye ? [{ id: 'co-eye', label: 'Pick from screen', icon: 'pipette', kbd: 'i', run: eyedrop }] : []),
    { id: 'co-img', label: 'Pick from image', icon: 'image', run: () => fromImage() },
  ]);
  inp.value = C.formats({ ...S.c, a: S.a }).hex;
  update('init');
  if (!isCoarse() && !params.get('q')) inp.focus({ preventScroll: true });
}

// ───────────────────────── Contrast checker (preset page) ─────────────────────────
function mountContrast(ctx) {
  const { root, hooks, params } = ctx;
  const hp = new URLSearchParams(location.hash.slice(1));
  const S = {
    fg: C.parseAny(params.get('q') || '') || C.parse('#' + (hp.get('fg') || '')) || C.parse(store.get('util:color:last') || '') || C.parse('#6b7280'),
    bg: C.parse('#' + (hp.get('bg') || '')) || C.parse('#ffffff'),
  };
  ctx.renderHeader({ lede: 'Check text and background colours against WCAG 2 and APCA.' });
  const pairRow = (k, label) => `<div class="cc-pair"><label class="cc-pair__label" for="cc-${k}">${label}</label>
    <div class="cc-pair__in"><label class="co-chipcolor co-chipcolor--lg" id="cc-${k}-chip"><input type="color" id="cc-${k}-pick" aria-label="${label} colour picker"><span></span></label>
    <input class="fw-input fw-input--mono" id="cc-${k}" spellcheck="false" autocomplete="off" aria-label="${label} colour"></div></div>`;
  root.innerHTML = `
  <div class="cc">
    <section class="fw-card cc-inputs" aria-label="Colours">
      ${pairRow('fg', 'Text')}
      <button class="fw-iconbtn fw-iconbtn--outline cc-swap" type="button" id="cc-swap" aria-label="Swap text and background" data-tip="Swap">${icon('arrow-left-right')}</button>
      ${pairRow('bg', 'Background')}
    </section>
    <div class="cc-main">
      <section class="cc-preview" id="cc-preview" aria-label="Preview">
        <p class="cc-pv__big">Large text 24 px</p>
        <p class="cc-pv__body">Normal text at 16 px needs a ratio of at least 4.5:1 to pass AA.</p>
        <p class="cc-pv__small">Small text at 12 px</p>
        <span class="cc-pv__ui"><span class="cc-pv__btn">Button</span>${icon('check', { size: 20 })}${icon('triangle-alert', { size: 20 })}</span>
      </section>
      <section class="fw-hero cc-score" aria-live="polite">
        <span class="fw-hero__label">Contrast ratio</span>
        <div class="fw-hero__value fw-num" id="cc-ratio"></div>
        <div class="co-badges co-badges--lg" id="cc-badges"></div>
        <div class="cc-apca" id="cc-apca"></div>
        <div class="cc-fix" id="cc-fix"></div>
        <div class="fw-hero__actions"><button class="fw-btn" type="button" id="cc-copy">${icon('copy')}<span>Copy colours</span></button></div>
      </section>
    </div>
  </div>`;
  enhance(root);
  function render(from) {
    const { fg, bg } = S; const r = C.wcag(fg, bg); const lc = C.apca(fg, bg);
    for (const k of ['fg', 'bg']) { if (from !== k) $(`#cc-${k}`).value = hex(S[k]); $(`#cc-${k}-pick`).value = hex(S[k]); $(`#cc-${k}-chip`).style.setProperty('--c', hex(S[k])); }
    const pv = $('#cc-preview'); pv.style.color = hex(fg); pv.style.background = hex(bg);
    $('#cc-ratio').textContent = ratioTxt(r);
    $('#cc-badges').innerHTML = badgesHtml(r); enhance($('#cc-badges'));
    $('#cc-apca').innerHTML = `<span class="fw-num cc-apca__lc">APCA Lc ${Math.round(Math.abs(lc))}</span><span class="ut-hint">${C.apcaVerdict(lc)}</span>`;
    const aa = r < 4.5 ? C.fixContrast(fg, bg, 4.5) : null, aaa = r < 7 ? C.fixContrast(fg, bg, 7) : null;
    $('#cc-fix').innerHTML = (aa ? `<button class="fw-btn fw-btn--primary fw-btn--sm" type="button" data-fix="${hex(aa)}"><span class="co-dot" style="--c:${hex(aa)}"></span>Fix for AA · ${hex(aa)}</button>` : '')
      + (aaa ? `<button class="fw-btn fw-btn--sm" type="button" data-fix="${hex(aaa)}"><span class="co-dot" style="--c:${hex(aaa)}"></span>Fix for AAA · ${hex(aaa)}</button>` : '');
    $$('[data-fix]', $('#cc-fix')).forEach((b) => (b.onclick = () => { S.fg = C.parse(b.dataset.fix); render(); }));
    store.set('util:color:last', hex(S.fg));
    history.replaceState(history.state, '', `${location.pathname}${location.search.replace(/([?&])q=[^&]*&?/, '$1').replace(/[?&]$/, '')}#fg=${hex(fg).slice(1)}&bg=${hex(bg).slice(1)}`);
    const a = ctx.mbar.set({ line: ratioTxt(r), sub: r >= 4.5 ? 'Passes AA for normal text' : r >= 3 ? 'Large text only (AA Large)' : 'Fails AA', actions: aa ? `<button class="fw-btn fw-btn--primary" type="button" data-a="fix">Fix for AA</button>` : '' });
    a.querySelector('[data-a="fix"]')?.addEventListener('click', () => { S.fg = aa; render(); });
  }
  for (const k of ['fg', 'bg']) {
    const el = $(`#cc-${k}`);
    const on = (e) => { const c = C.parseAny(el.value, { partial: e.type !== 'input' }); if (!c) { if (e.type !== 'input') el.setAttribute('aria-invalid', 'true'); return; } el.removeAttribute('aria-invalid'); if (e.type === 'change' && hex(c) === hex(S[k])) return; S[k] = c; render(e.type === 'input' ? k : null); };
    el.addEventListener('input', on); el.addEventListener('change', on);
    $(`#cc-${k}-pick`).addEventListener('input', (e) => { S[k] = C.parse(e.target.value); render(); });
  }
  $('#cc-swap').onclick = () => { [S.fg, S.bg] = [S.bg, S.fg]; render(); };
  $('#cc-copy').onclick = (e) => copyText(`color: ${hex(S.fg)};\nbackground: ${hex(S.bg)};`, e.currentTarget);
  hooks.onPaste = (t) => { const c = C.parseAny(t.trim()); if (!c) return false; S.fg = c; render(); return true; };
  render();
  if (!isCoarse()) $('#cc-fg').focus();
}
