// Color: Pick · Contrast · Palette in one workspace. The chips reorder the sections (same state, URL updates).
import { $, $$, esc, icon, enhance, copyText, toast, openDialog, openSheet, isTyping, store, hasLayers, mountIntake } from '../kit/shell.js';
import * as C from './lib/colorlib.js';

const BG_PRESETS = [['#ffffff', 'White'], ['#f4f4f5', 'Light grey'], ['#0b0b0c', 'Dark'], ['#000000', 'Black']];
const ORDER = { 'pick-color': ['pick', 'contrast', 'scale', 'palette'], contrast: ['contrast', 'pick', 'scale', 'palette'], palette: ['palette', 'scale', 'pick', 'contrast'] };
const LEDE = { 'pick-color': 'HEX, RGB, HSL and OKLCH. From your screen or any photo.', contrast: 'WCAG and APCA for any two colours, with a one-click fix.', palette: 'A full 50–950 scale and palettes that pass for colour-blind eyes too.' };

export function mount(ctx) {
  const { root, hooks, params } = ctx;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = () => matchMedia('(max-width: 640px)').matches;
  // ── state (URL hash: c=hex&p=hex-hex…&fg=&bg=&cvd=) ──
  const hp = new URLSearchParams(location.hash.slice(1));
  const fromQ = C.parse(params.get('q') || '');
  const start = fromQ || C.parse('#' + (hp.get('c') || '')) || C.parse(store.get('color:last') || '') || C.parse('#15803d');
  const S = {
    c: start, hsv: C.toHsv(start), a: start.a ?? 1,
    pair: { fg: C.parse('#' + (hp.get('fg') || '')) || { ...start }, bg: C.parse('#' + (hp.get('bg') || 'ffffff')), linked: !hp.get('fg') },
    pal: (hp.get('p') || '').split('-').map((x) => C.parse('#' + x)).filter(Boolean),
    locks: [true, false, false, false, false], harmony: 'analogous', cvd: hp.get('cvd') || 'none',
    saved: (() => { try { return JSON.parse(store.get('color:saved') || '[]'); } catch { return []; } })(),
  };
  if (S.pal.length !== 5) S.pal = C.harmony(S.c, S.harmony, seeded(7));
  function seeded(n) { let x = n * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); }
  const hex = (c) => C.hex(c, { alpha: false });
  const hexA = (c) => C.hex({ ...c, a: S.a });
  const textOn = (c) => (C.luminance(c) > 0.32 ? '#111111' : '#ffffff');

  ctx.renderHeader({ lede: LEDE[ctx.leaf.id], aside: `<button class="fw-btn fw-btn--sm" type="button" id="co-share">${icon('link')}<span>Share link</span></button>` });
  root.innerHTML = `
  <div class="co" id="co">
    <div class="co-input">
      <div class="fw-query fw-query--mono co-query"><span data-icon="pipette"></span>
        <label class="fw-sr" for="co-in">Colour</label>
        <input class="fw-query__input" id="co-in" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="#15803d, rgb(), hsl(), oklch() or a name">
      </div>
      <button class="fw-btn fw-btn--lg co-tool" type="button" id="co-eye" data-tip="Pick a colour anywhere on your screen" data-tip-kbd="i">${icon('pipette')}<span>Screen</span></button>
      <button class="fw-btn fw-btn--lg co-tool" type="button" id="co-img" data-tip="Pick from a photo or extract its palette">${icon('image')}<span>From image</span></button>
    </div>

    <section class="co-sec co-pick" data-sec="pick" aria-label="Pick">
      <div class="co-picker fw-card ut-desk-only" id="co-picker"></div>
      <div class="co-swatch-card fw-card">
        <div class="co-swatch" id="co-swatch"><div class="co-swatch__fill" id="co-fill"></div>
          <div class="co-swatch__meta"><span class="co-swatch__name" id="co-name"></span><span class="co-swatch__hex fw-mono" id="co-hex"></span></div>
          <button class="fw-iconbtn co-swatch__save" type="button" id="co-save" aria-label="Save colour" data-tip="Save on this device" aria-pressed="false">${icon('heart')}</button>
        </div>
        <div class="fw-rows co-rows" id="co-rows"></div>
        <div class="co-saved" id="co-saved"></div>
      </div>
    </section>

    <section class="co-sec co-contrast fw-card" data-sec="contrast" aria-labelledby="co-ct-t">
      <div class="co-sec__head"><h2 class="ut-sec-title" id="co-ct-t">Contrast</h2><span class="ut-hint" id="co-ct-link"></span></div>
      <div class="co-ct">
        <div class="co-ct__pair">
          <div class="co-pairrow"><span class="co-pairrow__label">Text</span>
            <label class="co-chipcolor" style="--c:${hex(S.pair.fg)}"><input type="color" id="co-fg-pick" aria-label="Text colour"><span></span></label>
            <input class="fw-input fw-input--mono co-pairin" id="co-fg" spellcheck="false" aria-label="Text colour value"></div>
          <button class="fw-iconbtn fw-iconbtn--sm co-swap" type="button" id="co-swap" aria-label="Swap text and background" data-tip="Swap (the picked colour stays)">${icon('arrow-up-down')}</button>
          <div class="co-pairrow"><span class="co-pairrow__label">Background</span>
            <label class="co-chipcolor" style="--c:${hex(S.pair.bg)}"><input type="color" id="co-bg-pick" aria-label="Background colour"><span></span></label>
            <input class="fw-input fw-input--mono co-pairin" id="co-bg" spellcheck="false" aria-label="Background colour value"></div>
          <div class="co-bgpre" role="group" aria-label="Background presets">${BG_PRESETS.map(([h, l]) => `<button type="button" class="co-bgchip" data-bg="${h}" style="--c:${h}" aria-label="On ${l}" data-tip="${l} ${h}"><span></span></button>`).join('')}</div>
        </div>
        <div class="co-ct__preview" id="co-preview">
          <p class="co-pv__big">Aa</p>
          <p class="co-pv__body">The quick brown fox jumps over the lazy dog. Body text at 16 px needs 4.5:1.</p>
          <p class="co-pv__small">Small print at 12 px, the hardest case.</p>
        </div>
        <div class="co-ct__score">
          <div class="co-ratio"><span class="co-ratio__v fw-num" id="co-ratio"></span><span class="co-ratio__l">contrast ratio</span></div>
          <div class="co-badges" id="co-badges"></div>
          <div class="co-apca" id="co-apca"></div>
          <div class="co-fix" id="co-fix"></div>
        </div>
      </div>
    </section>

    <section class="co-sec co-scale fw-card" data-sec="scale" aria-labelledby="co-sc-t">
      <div class="co-sec__head"><h2 class="ut-sec-title" id="co-sc-t">Scale <span class="ut-hint">OKLCH, 50–950, built around your colour</span></h2>
        <div class="co-exports" role="group" aria-label="Export scale">
          <button class="fw-btn fw-btn--sm" type="button" data-exp="css">CSS vars</button><button class="fw-btn fw-btn--sm" type="button" data-exp="tw">Tailwind</button><button class="fw-btn fw-btn--sm" type="button" data-exp="json">JSON</button><button class="fw-btn fw-btn--sm" type="button" data-exp="svg">${icon('download')}SVG</button>
        </div></div>
      <div class="co-steps" id="co-steps" role="list"></div>
    </section>

    <section class="co-sec co-palette fw-card" data-sec="palette" aria-labelledby="co-pl-t">
      <div class="co-sec__head"><h2 class="ut-sec-title" id="co-pl-t">Palette</h2>
        <div class="co-pltools">
          <label class="fw-sr" for="co-harm">Harmony</label><select class="fw-select co-select" id="co-harm">${Object.entries(C.HARMONIES).map(([k, v]) => `<option value="${k}" ${S.harmony === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <label class="fw-sr" for="co-cvd">Simulate</label><select class="fw-select co-select" id="co-cvd">${Object.entries(C.CVD_LABELS).map(([k, v]) => `<option value="${k}" ${S.cvd === k ? 'selected' : ''}>${k === 'none' ? 'Simulate: off' : v}</option>`).join('')}</select>
          <button class="fw-btn fw-btn--sm fw-btn--primary" type="button" id="co-gen" data-tip="New palette, locked colours stay" data-tip-kbd="space">${icon('shuffle')}<span>Generate</span><kbd class="fw-kbd co-kbd">Space</kbd></button>
        </div></div>
      <div class="co-pal" id="co-pal"></div>
      <p class="ut-hint co-cvdnote" id="co-cvdnote"></p>
    </section>
  </div>`;
  enhance(root);

  // ── picker (SV square + hue + alpha), mountable inline or in a sheet ──
  function mountPicker(host) {
    host.innerHTML = `<div class="cp">
      <div class="cp-sv" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100"><canvas class="cp-sv__c" width="320" height="220"></canvas><span class="cp-sv__thumb"></span></div>
      <label class="fw-sr">Hue</label><input class="cp-range cp-hue" type="range" min="0" max="360" step="1" aria-label="Hue">
      <label class="fw-sr">Opacity</label><input class="cp-range cp-alpha" type="range" min="0" max="100" step="1" aria-label="Opacity">
      <div class="cp-vals"><span class="fw-num" data-v="h"></span><span class="fw-num" data-v="a"></span></div></div>`;
    const sv = $('.cp-sv', host), cv = $('canvas', host), g = cv.getContext('2d'), th = $('.cp-sv__thumb', host), hue = $('.cp-hue', host), al = $('.cp-alpha', host);
    const draw = () => {
      const W = cv.width, H = cv.height;
      g.fillStyle = `hsl(${S.hsv.h} 100% 50%)`; g.fillRect(0, 0, W, H);
      let gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    const sync = () => {
      draw();
      th.style.left = `${S.hsv.s * 100}%`; th.style.top = `${(1 - S.hsv.v) * 100}%`; th.style.background = hex(S.c);
      hue.value = Math.round(S.hsv.h); al.value = Math.round(S.a * 100);
      al.style.setProperty('--c', hex(S.c));
      sv.setAttribute('aria-valuenow', Math.round(S.hsv.s * 100)); sv.setAttribute('aria-valuetext', `saturation ${Math.round(S.hsv.s * 100)}%, brightness ${Math.round(S.hsv.v * 100)}%`);
      hue.setAttribute('aria-valuetext', `${Math.round(S.hsv.h)} degrees`); al.setAttribute('aria-valuetext', `${Math.round(S.a * 100)} percent`);
      $('[data-v="h"]', host).textContent = `Hue ${Math.round(S.hsv.h)}°`; $('[data-v="a"]', host).textContent = `Opacity ${Math.round(S.a * 100)} %`;
    };
    const fromXY = (e) => { const r = sv.getBoundingClientRect(); S.hsv = { ...S.hsv, s: C.clamp((e.clientX - r.left) / r.width), v: 1 - C.clamp((e.clientY - r.top) / r.height) }; setFromHsv(); };
    sv.addEventListener('pointerdown', (e) => { sv.setPointerCapture(e.pointerId); fromXY(e); sv.focus({ preventScroll: true }); });
    sv.addEventListener('pointermove', (e) => { if (sv.hasPointerCapture(e.pointerId)) fromXY(e); });
    sv.addEventListener('keydown', (e) => {
      const st = e.shiftKey ? 0.1 : 0.01; const k = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st], Home: [-1, 0], End: [1, 0], PageUp: [0, 0.1], PageDown: [0, -0.1] }[e.key];
      if (!k) return; e.preventDefault(); S.hsv = { ...S.hsv, s: C.clamp(S.hsv.s + k[0]), v: C.clamp(S.hsv.v + k[1]) }; setFromHsv();
    });
    hue.addEventListener('input', () => { S.hsv = { ...S.hsv, h: +hue.value }; setFromHsv(); });
    al.addEventListener('input', () => { S.a = +al.value / 100; update({ from: 'alpha' }); });
    sync();
    return sync;
  }
  const pickers = [mountPicker($('#co-picker'))];
  function setFromHsv() { S.c = { ...C.fromHsv(S.hsv), a: S.a }; update({ from: 'picker' }); }

  // ── set colour from anywhere ──
  function setColor(c, { from = 'input', keepHue = false } = {}) {
    S.c = { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 }; S.a = S.c.a;
    const hsv = C.toHsv(S.c); if (keepHue || hsv.s === 0) hsv.h = S.hsv.h; S.hsv = hsv;
    update({ from });
  }
  let saveT = 0;
  function update({ from } = {}) {
    const f = C.formats({ ...S.c, a: S.a });
    if (from !== 'input' && document.activeElement !== $('#co-in')) $('#co-in').value = f.hex;
    if (from !== 'input') $('#co-in').removeAttribute('aria-invalid');
    pickers.forEach((p) => p());
    // swatch + rows
    $('#co-fill').style.background = hexA(S.c);
    $('#co-name').textContent = C.nameOf(S.c);
    $('#co-hex').textContent = f.hex;
    $('#co-swatch').style.setProperty('--on', textOn(S.c));
    const rows = [['HEX', f.hex], ['RGB', f.rgb], ['HSL', f.hsl], ['OKLCH', f.oklch]];
    $('#co-rows').innerHTML = rows.map(([l, v]) => `<div class="fw-vrow"><span class="fw-vrow__label">${l}</span><span class="fw-vrow__value">${esc(v)}</span>
      <button class="fw-btn fw-btn--sm co-copy" type="button" data-copy="${esc(v)}" aria-label="Copy ${l}">${icon('copy')}<span>Copy</span></button></div>`).join('');
    enhance($('#co-rows'));
    $('#co-save').setAttribute('aria-pressed', String(S.saved.includes(hex(S.c))));
    if (S.pair.linked) S.pair.fg = { ...S.c, a: 1 };
    renderContrast(); renderScale(); renderPalette(from === 'picker' || from === 'alpha' ? 'keep' : undefined);
    clearTimeout(saveT); saveT = setTimeout(saveState, 250);
    const a = ctx.mbar.set({ line: f.hex, sub: C.nameOf(S.c), actions: `<button class="fw-btn" type="button" data-a="adjust">${icon('sliders-horizontal')}<span>Adjust</span></button><button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = (e) => copyText(f.hex, e.currentTarget);
    a.querySelector('[data-a="adjust"]').onclick = openPickerSheet;
  }
  function saveState() {
    store.set('color:last', hex(S.c));
    const h = new URLSearchParams({ c: hex(S.c).slice(1), p: S.pal.map((x) => hex(x).slice(1)).join('-') });
    if (!S.pair.linked) h.set('fg', hex(S.pair.fg).slice(1));
    if (hex(S.pair.bg) !== '#ffffff') h.set('bg', hex(S.pair.bg).slice(1));
    if (S.cvd !== 'none') h.set('cvd', S.cvd);
    history.replaceState(history.state, '', `${location.pathname}${location.search.replace(/([?&])q=[^&]*&?/, '$1').replace(/[?&]$/, '')}#${h}`);
  }

  // ── contrast ──
  let lastPass = null;
  function renderContrast() {
    const fg = S.pair.fg, bg = S.pair.bg, r = C.wcag(fg, bg), lc = C.apca(fg, bg);
    if (document.activeElement !== $('#co-fg')) $('#co-fg').value = hex(fg);
    if (document.activeElement !== $('#co-bg')) $('#co-bg').value = hex(bg);
    $('#co-fg').closest('.co-pairrow').querySelector('.co-chipcolor').style.setProperty('--c', hex(fg));
    $('#co-bg').closest('.co-pairrow').querySelector('.co-chipcolor').style.setProperty('--c', hex(bg));
    $('#co-fg-pick').value = hex(fg); $('#co-bg-pick').value = hex(bg);
    $$('.co-bgchip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bg === hex(bg))));
    const pv = $('#co-preview'); pv.style.color = hex(fg); pv.style.background = hex(bg);
    $('#co-ratio').textContent = `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;
    const B = [['AA', 4.5, 'Body text'], ['AA Large', 3, '18 px bold / 24 px'], ['AAA', 7, 'Body text, enhanced'], ['AAA Large', 4.5, 'Large text, enhanced']];
    $('#co-badges').innerHTML = B.map(([n, t, d]) => { const ok = r >= t; return `<span class="co-badge ${ok ? 'is-ok' : 'is-bad'}" data-tip="${d} · needs ${t}:1">${icon(ok ? 'check' : 'x', { size: 14 })}${n}</span>`; }).join('');
    $('#co-apca').innerHTML = `<span class="co-apca__lc fw-num">APCA Lc ${Math.round(Math.abs(lc))}</span><span class="ut-hint">${C.apcaVerdict(lc)}</span>`;
    const pass = r >= 4.5;
    let fix = '';
    if (r < 7) {
      const aa = r < 4.5 ? C.fixContrast(fg, bg, 4.5) : null, aaa = C.fixContrast(fg, bg, 7);
      fix = `${aa ? `<button class="fw-btn fw-btn--primary fw-btn--sm co-fixbtn" type="button" data-fix="${hex(aa)}"><span class="co-dot" style="--c:${hex(aa)}"></span>Fix for AA · ${hex(aa)} · ${C.wcag(aa, bg).toFixed(1)}:1</button>` : ''}
        ${aaa ? `<button class="fw-btn fw-btn--sm co-fixbtn" type="button" data-fix="${hex(aaa)}"><span class="co-dot" style="--c:${hex(aaa)}"></span>AAA · ${hex(aaa)} · ${C.wcag(aaa, bg).toFixed(1)}:1</button>` : ''}`;
    }
    if (!S.pair.linked) fix += `<button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="co-usemain">${icon('pipette')}Use as picked colour</button><button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="co-relink">${icon('link')}Follow picked colour</button>`;
    $('#co-fix').innerHTML = fix;
    enhance($('#co-fix'));
    $('#co-ct-link').textContent = S.pair.linked ? 'Text follows the picked colour' : 'Text colour is separate from the picked colour';
    if (lastPass !== null && lastPass !== pass) $('#co-badges').classList.add('is-changed'); lastPass = pass;
    $$('[data-fix]').forEach((b) => b.addEventListener('click', () => { S.pair.fg = C.parse(b.dataset.fix); S.pair.linked = false; renderContrast(); saveState(); $('#co-badges').animate([{ transform: 'scale(1.04)' }, { transform: 'none' }], { duration: 240, easing: 'ease-out' }); }));
    $('#co-usemain')?.addEventListener('click', () => { S.pair.linked = true; setColor(S.pair.fg, { from: 'contrast' }); });
    $('#co-relink')?.addEventListener('click', () => { S.pair.linked = true; S.pair.fg = { ...S.c, a: 1 }; renderContrast(); saveState(); });
  }
  const pairIn = (which) => (e) => { const c = C.parse(e.target.value, { partial: e.type !== 'input' }); if (!c) { if (e.type !== 'input') e.target.setAttribute('aria-invalid', 'true'); return; } e.target.removeAttribute('aria-invalid'); S.pair[which] = c; if (which === 'fg') S.pair.linked = false; renderContrast(); saveState(); };
  ['input', 'change'].forEach((ev) => { $('#co-fg').addEventListener(ev, pairIn('fg')); $('#co-bg').addEventListener(ev, pairIn('bg')); });
  $('#co-fg-pick').addEventListener('input', (e) => { S.pair.fg = C.parse(e.target.value); S.pair.linked = false; renderContrast(); });
  $('#co-bg-pick').addEventListener('input', (e) => { S.pair.bg = C.parse(e.target.value); renderContrast(); });
  $$('.co-bgchip').forEach((b) => b.addEventListener('click', () => { S.pair.bg = C.parse(b.dataset.bg); renderContrast(); saveState(); }));
  $('#co-swap').onclick = () => { [S.pair.fg, S.pair.bg] = [S.pair.bg, S.pair.fg]; S.pair.linked = false; renderContrast(); saveState(); };

  // ── scale ──
  let scaleNow = [];
  function renderScale() {
    scaleNow = C.scale(S.c);
    $('#co-steps').innerHTML = scaleNow.map((s) => { const shown = C.simulate(s.c, S.cvd); const h = hex(s.c); return `<div class="co-step ${s.anchor ? 'is-anchor' : ''}" role="listitem" style="--c:${hex(shown)};--on:${textOn(shown)}">
      <button class="co-step__sw" type="button" data-pick="${h}" aria-label="${s.step}: ${h}${s.anchor ? ', your colour' : ''}. Select" data-tip="Select ${h}"><span class="co-step__n fw-num">${s.step}</span>${s.anchor ? `<span class="co-step__dot" aria-hidden="true"></span>` : ''}</button>
      <button class="co-step__copy fw-mono" type="button" data-copy="${h}" aria-label="Copy ${h}">${h.slice(1)}<span class="co-step__ci">${icon('copy', { size: 12 })}</span></button></div>`; }).join('');
    enhance($('#co-steps'));
  }
  $('#co-steps').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) setColor(C.parse(b.dataset.pick), { from: 'scale', keepHue: true }); });
  const scaleExport = (kind) => {
    const name = C.nameOf(S.c).replace(/^Near /, '').toLowerCase().replace(/[^a-z]+/g, '-');
    const pairs = scaleNow.map((s) => [s.step, hex(s.c)]);
    if (kind === 'css') return `:root {\n${pairs.map(([k, v]) => `  --${name}-${k}: ${v};`).join('\n')}\n}`;
    if (kind === 'tw') return `// tailwind.config.js → theme.extend.colors\n'${name}': {\n${pairs.map(([k, v]) => `  ${k}: '${v}',`).join('\n')}\n},`;
    if (kind === 'json') return JSON.stringify({ [name]: Object.fromEntries(pairs) }, null, 2);
    const w = 64; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * pairs.length}" height="96" font-family="Geist, sans-serif" font-size="11">${pairs.map(([k, v], i) => `<rect x="${i * w}" width="${w}" height="72" fill="${v}"/><text x="${i * w + 6}" y="88" fill="#333">${k} ${v}</text>`).join('')}</svg>`;
  };
  $$('[data-exp]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.exp; const txt = scaleExport(k);
    if (k === 'svg') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' })); a.download = `${C.nameOf(S.c).replace(/^Near /, '').toLowerCase().replace(/[^a-z]+/g, '-')}-scale.svg`; a.click(); toast(`Saved ${a.download}`, { type: 'success' }); return; }
    copyText(txt, b);
  }));

  // ── palette ──
  function renderPalette(keep) {
    if (keep !== 'keep') S.pal[0] = S.locks[0] ? { ...S.c, a: 1 } : S.pal[0];
    $('#co-pal').innerHTML = S.pal.map((c, i) => { const sh = C.simulate(c, S.cvd); const h = hex(c); return `<div class="co-pc ${S.locks[i] ? 'is-locked' : ''}" style="--c:${hex(sh)};--on:${textOn(sh)}">
      <button class="co-pc__fill" type="button" data-select="${i}" aria-label="Select ${h}"></button>
      <div class="co-pc__bar"><button class="co-pc__hex fw-mono" type="button" data-copy="${h}" aria-label="Copy ${h}">${h}<span>${icon('copy', { size: 12 })}</span></button>
      <button class="co-pc__lock" type="button" data-lock="${i}" aria-pressed="${S.locks[i]}" aria-label="${S.locks[i] ? 'Unlock' : 'Lock'} ${h}" data-tip="${S.locks[i] ? 'Locked: stays when you generate' : 'Lock to keep'}">${icon(S.locks[i] ? 'lock' : 'lock-open', { size: 16 })}</button></div>
      <span class="co-pc__name">${esc(i === 0 && S.locks[0] ? 'Your colour' : C.nameOf(c))}</span></div>`; }).join('');
    enhance($('#co-pal'));
    $('#co-cvdnote').textContent = S.cvd === 'none' ? 'Space generates a new palette. Locked colours stay.' : `Showing how ${C.CVD_LABELS[S.cvd].split(' (')[0].toLowerCase()} sees it (about ${{ protan: '1 in 100 men', deutan: '1 in 20 men', tritan: '1 in 10,000 people', achroma: '1 in 30,000 people' }[S.cvd]}). Values stay the real colours.`;
  }
  $('#co-pal').addEventListener('click', (e) => {
    const l = e.target.closest('[data-lock]'); if (l) { const i = +l.dataset.lock; S.locks[i] = !S.locks[i]; renderPalette('keep'); saveState(); $(`[data-lock="${i}"]`)?.focus(); return; }
    const s = e.target.closest('[data-select]'); if (s) setColor(S.pal[+s.dataset.select], { from: 'palette' });
  });
  function generate() {
    const base = S.locks[0] ? S.c : S.pal.find((_, i) => S.locks[i]) || S.c;
    const locked = S.pal.map((c, i) => (S.locks[i] ? c : null));
    S.pal = C.harmony(base, S.harmony, Math.random, locked);
    renderPalette('keep'); saveState();
    $$('.co-pc:not(.is-locked)').forEach((el, i) => el.animate([{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 30, easing: 'cubic-bezier(.2,.8,.2,1)' }));
  }
  $('#co-gen').onclick = generate;
  $('#co-harm').onchange = (e) => { S.harmony = e.target.value; generate(); };
  $('#co-cvd').onchange = (e) => { S.cvd = e.target.value; renderScale(); renderPalette('keep'); saveState(); };
  document.addEventListener('keydown', (e) => {
    if (isTyping() || hasLayers() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest?.('button, a, select, [role="slider"]')) { e.preventDefault(); generate(); }
    if (e.key.toLowerCase() === 'i' && !e.shiftKey) { e.preventDefault(); eyedrop(); }
  });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyText(hex(S.c), $('#co-rows .co-copy')); } });

  // ── input ──
  const inp = $('#co-in');
  inp.addEventListener('input', () => { const c = C.parse(inp.value, { partial: false }); if (c) { inp.removeAttribute('aria-invalid'); setColor(c, { from: 'input' }); } });
  const commit = () => { const c = C.parse(inp.value, { partial: true }); if (c) { inp.removeAttribute('aria-invalid'); setColor(c, { from: 'commit' }); inp.value = C.formats(S.c).hex; } else if (inp.value.trim()) inp.setAttribute('aria-invalid', 'true'); };
  inp.addEventListener('change', commit); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  hooks.onPaste = (t) => { const c = C.parse(t.trim()); if (!c) return false; inp.value = t.trim(); setColor(c, { from: 'paste' }); return true; };

  // ── save / saved list / share ──
  function renderSaved() {
    $('#co-saved').innerHTML = S.saved.length ? `<span class="ut-hint">Saved on this device</span>${S.saved.map((h) => `<button class="co-savedsw" type="button" data-pick="${h}" style="--c:${h}" aria-label="Use ${h}" data-tip="${h}"></button>`).join('')}<button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" id="co-clear">Clear</button>` : '';
    enhance($('#co-saved'));
    $('#co-clear')?.addEventListener('click', () => { const old = S.saved; S.saved = []; store.set('color:saved', '[]'); renderSaved(); update({ from: 'saved' }); toast('Saved colours cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { S.saved = old; store.set('color:saved', JSON.stringify(old)); renderSaved(); update({ from: 'saved' }); } } }); });
  }
  $('#co-saved').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) setColor(C.parse(b.dataset.pick), { from: 'saved' }); });
  $('#co-save').onclick = () => { const h = hex(S.c); S.saved = S.saved.includes(h) ? S.saved.filter((x) => x !== h) : [h, ...S.saved].slice(0, 12); store.set('color:saved', JSON.stringify(S.saved)); renderSaved(); $('#co-save').setAttribute('aria-pressed', String(S.saved.includes(h))); };
  $('#co-share').onclick = (e) => { saveState(); copyText(location.href, e.currentTarget); };

  // ── eyedropper + from image ──
  const hasEye = 'EyeDropper' in window;
  if (!hasEye) { $('#co-eye').disabled = true; $('#co-eye').dataset.tip = 'This browser can’t pick from the screen. Use From image.'; }
  async function eyedrop() { if (!hasEye) return; try { const r = await new window.EyeDropper().open(); setColor(C.parse(r.sRGBHex), { from: 'eye' }); toast(`Picked ${r.sRGBHex}`, { type: 'success' }); } catch { /* cancelled */ } }
  $('#co-eye').onclick = eyedrop;
  $('#co-img').onclick = () => fromImage();
  hooks.onFiles = (files) => { const f = [...files].find((x) => /^image\//.test(x.type)); if (f) fromImage(f); };
  async function fromImage(file) {
    const body = `<div class="fi">
      <div class="fi-stage" id="fi-stage">${file ? '' : `<div class="fw-intake fi-intake"><div class="fw-intake__icon">${icon('image')}</div><div class="fw-intake__title"><span class="fw-pointer-copy">Drop or paste a photo</span><span class="fw-touch-copy">Choose a photo</span></div><div class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>Choose image</button></div><div class="fw-intake__samples"><button type="button" class="fw-chip fw-chip--sample" data-sample="IMG_2043.jpg>ferns.jpg">Ferns photo</button><button type="button" class="fw-chip fw-chip--sample" data-sample="IMG_2041.jpg>lagoon.jpg">Lagoon photo</button></div></div>`}</div>
      <div class="fi-side"><div class="fi-loupe" id="fi-loupe" aria-hidden="true"><canvas width="120" height="120"></canvas></div>
        <p class="fw-t-sm fw-muted" id="fi-hint">${coarse ? 'Tap' : 'Click'} the photo to pick a colour.</p>
        <div class="fi-extract" id="fi-ex"></div></div></div>`;
    const d = openDialog({ title: 'Colour from image', body, size: 920, className: 'fi-dialog' });
    const load = async (f) => {
      const bmp = await createImageBitmap(f); const max = 1400, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.className = 'fi-img';
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
      $('#fi-stage', d.el).innerHTML = ''; $('#fi-stage', d.el).append(c);
      const lo = $('#fi-loupe canvas', d.el), lg = lo.getContext('2d'); lg.imageSmoothingEnabled = false;
      const at = (e) => { const r = c.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * c.width), Math.floor(((e.clientY - r.top) / r.height) * c.height)]; };
      const px = (x, y) => { const p = g.getImageData(C.clamp(x, 0, c.width - 1), C.clamp(y, 0, c.height - 1), 1, 1).data; return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: 1 }; };
      c.addEventListener('pointermove', (e) => { const [x, y] = at(e); lg.clearRect(0, 0, 120, 120); lg.drawImage(c, x - 7, y - 7, 15, 15, 0, 0, 120, 120); lg.strokeStyle = '#fff'; lg.lineWidth = 2; lg.strokeRect(56, 56, 8, 8); $('#fi-loupe', d.el).style.setProperty('--c', hex(px(x, y))); $('#fi-hint', d.el).innerHTML = `<span class="fw-mono">${hex(px(x, y))}</span> · ${coarse ? 'tap' : 'click'} to use`; });
      c.addEventListener('click', (e) => { const [x, y] = at(e); setColor(px(x, y), { from: 'image' }); d.close(); toast(`Picked ${hex(S.c)} from ${f.name}`, { type: 'success' }); });
      const pal = C.extract(g.getImageData(0, 0, c.width, c.height), 5);
      $('#fi-ex', d.el).innerHTML = `<p class="fw-t-sm" style="font-weight:600">Palette in this photo</p><div class="fi-pal">${pal.map((p) => `<button type="button" class="fi-sw" style="--c:${hex(p)}" data-c="${hex(p)}" aria-label="Use ${hex(p)}" data-tip="${hex(p)}"></button>`).join('')}</div>
        <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="fi-use">${icon('swatch-book')}Use as palette</button>`;
      enhance($('#fi-ex', d.el));
      $$('.fi-sw', d.el).forEach((b) => b.onclick = () => { setColor(C.parse(b.dataset.c), { from: 'image' }); d.close(); });
      $('#fi-use', d.el).onclick = () => { S.pal = pal.slice(0, 5); S.locks = [false, false, false, false, false]; setColor(pal[0], { from: 'image' }); S.pal = pal.slice(0, 5); renderPalette('keep'); saveState(); d.close(); $('[data-sec="palette"]').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Palette taken from the photo', { type: 'success' }); };
    };
    if (file) load(file);
    else mountIntake($('.fi-intake', d.el), { onFiles: (fs) => load(fs[0]), accept: 'image/*', multiple: false });
  }

  // ── mobile: picker in a sheet ──
  function openPickerSheet() {
    const sh = openSheet({ title: 'Adjust colour', height: 'peek', body: '<div id="co-sheetpick"></div>' });
    const sync = mountPicker($('#co-sheetpick', sh.el)); pickers.push(sync);
    sh.el.addEventListener('close', () => { const i = pickers.indexOf(sync); if (i > 0) pickers.splice(i, 1); });
  }

  // ── leaf switching: reorder sections, H1 + lede ──
  function applyLeaf(l) {
    ORDER[l.id].forEach((k, i) => { $(`[data-sec="${k}"]`).style.order = String(i + 1); });
    ctx.renderHeader({ leaf: l, lede: LEDE[l.id], aside: `<button class="fw-btn fw-btn--sm" type="button" id="co-share">${icon('link')}<span>Share link</span></button>` });
    $('#co-share').onclick = (e) => { saveState(); copyText(location.href, e.currentTarget); };
    $('#co').dataset.leaf = l.id;
  }
  hooks.switchLeaf = (l) => { applyLeaf(l); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  applyLeaf(ctx.leaf);
  renderSaved();
  inp.value = C.formats(S.c).hex;
  update({ from: 'init' });
  if (!coarse && params.get('q')) { /* arrived from ⌘K: keep focus calm */ } else if (!coarse) inp.focus({ preventScroll: true });
}
