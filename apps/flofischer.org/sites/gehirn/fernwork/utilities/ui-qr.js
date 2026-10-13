// Share ▸ QR code: Make (typed forms, sticky self-testing preview, style, print sizes, print card) and Read
// (drop/paste/choose/camera, several codes per image, typed result cards, full-screen viewfinder with result sheet).
import { $, $$, esc, icon, enhance, copyText, toast, navigate, openDialog, openMenu, pushLayer, isTyping, store } from '../kit/shell.js';
import { encode, drawQR, toSVG, selfTest, build, parse, filenameFor, TYPES, CAPACITY, ratio, lum, download } from './lib/qrlib.js';
import { drawCard, FORMATS } from './lib/card.js';
import { pdf, canvasJpeg } from './lib/pdf.js';
import { cleanLink } from './lib/rules.js';
import { suggest } from './lib/seal-crypto.js';

const PRESETS = [
  { id: 'black', label: 'Black', fg: '#111111', bg: '#ffffff' },
  { id: 'fern', label: 'Fern', fg: '#15803d', bg: '#ffffff' },
  { id: 'ink', label: 'Ink', fg: '#1e3a8a', bg: '#ffffff' },
  { id: 'plum', label: 'Plum', fg: '#6b21a8', bg: '#ffffff' },
  { id: 'rust', label: 'Rust', fg: '#9a3412', bg: '#fff7ed' },
  { id: 'inverted', label: 'Inverted', fg: '#ffffff', bg: '#111111' },
];
const SIZES = [2.5, 4, 8, 15];
const SAMPLE_IMAGES = [
  ['wifi-card-photo.jpg', 'Photo of a Wi-Fi card'],
  ['flyer-3-codes.png', 'Flyer with 3 codes'],
];

export function mount(ctx) {
  const { root, hooks, params, leaf } = ctx;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let mode = params.get('mode') === 'read' ? 'read' : 'make';
  const q = params.get('q') || '';
  const pre = q ? parse(q) : null;
  const S = {
    type: leaf.id === 'wifi-qr' ? 'wifi' : params.get('type') || (pre && pre.type !== 'text' && TYPES.some((t) => t.id === pre.type) ? pre.type : 'link'),
    f: {
      link: { url: pre?.type === 'link' ? pre.url : '' },
      wifi: { ssid: pre?.type === 'wifi' ? pre.ssid : '', pass: pre?.type === 'wifi' ? pre.pass : '', sec: pre?.type === 'wifi' ? (pre.sec === 'nopass' ? 'nopass' : pre.sec === 'WEP' ? 'WEP' : 'WPA') : 'WPA', hidden: false },
      contact: { first: '', last: '', tel: '', email: '', org: '', title: '', web: '' },
      text: { text: pre?.type === 'text' ? q : '' },
      email: { to: '', subject: '', body: '' },
      sms: { tel: '', body: '' },
      event: { title: '', start: '', end: '', where: '' },
    },
    preset: 'black', fg: '#111111', bg: '#ffffff', logo: null, logoName: '', ecc: 'M', eccAuto: true, size: 8,
    last: null, lastText: '', test: null,
  };
  if (pre?.type === 'contact') { const [first, ...rest] = (pre.name || '').split(' '); Object.assign(S.f.contact, { first, last: rest.join(' '), tel: pre.tel, email: pre.email, org: pre.org }); }
  if (pre?.type === 'link' && /^www\./.test(pre.url)) S.f.link.url = pre.url;

  const header = () => ctx.renderHeader({
    aside: `<div class="fw-seg" role="radiogroup" aria-label="Mode" id="qr-mode">
      <button class="fw-seg__opt" role="radio" type="button" data-value="make" aria-checked="${mode === 'make'}">${icon('qr-code', { size: 16 })}Make</button>
      <button class="fw-seg__opt" role="radio" type="button" data-value="read" aria-checked="${mode === 'read'}">${icon('scan-line', { size: 16 })}Read</button></div>`,
    lede: mode === 'read' ? 'Read any code from a photo, a screenshot or your camera.' : leaf.id === 'wifi-qr' ? 'Guests scan to join. The password never leaves this device.' : 'Links, Wi-Fi, contacts and events. Checked to scan before you print.',
  });
  header();
  $('#page-header').addEventListener('fw-change', (e) => { if (e.target.closest('#qr-mode')) setMode(e.detail.value); });
  function setMode(m) {
    if (m === mode) return; mode = m; const u = new URL(location.href);
    if (m === 'read') u.searchParams.set('mode', 'read'); else u.searchParams.delete('mode');
    history.replaceState(null, '', u); header(); renderMode();
  }
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); setMode(mode === 'make' ? 'read' : 'make'); }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 's' && mode === 'make') { e.preventDefault(); downloadPNG(); }
  });
  hooks.onFiles = (files) => { const img = [...files].find((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(f.name)); if (!img) return; if (mode !== 'read') setMode('read'); readFile(img); };
  hooks.onPaste = (t) => {
    if (mode === 'read') return false;
    const p = parse(t.trim()); if (p.type === 'link') { S.type = 'link'; S.f.link.url = t.trim(); } else if (p.type === 'wifi') { S.type = 'wifi'; Object.assign(S.f.wifi, { ssid: p.ssid, pass: p.pass, sec: p.sec === 'nopass' ? 'nopass' : 'WPA' }); } else { S.type = 'text'; S.f.text.text = t; }
    renderMake(); return true;
  };

  function renderMode() { ctx.mbar.hide(); if (mode === 'make') renderMake(); else renderRead(); }

  // ───────────────────────────── MAKE ─────────────────────────────
  const field = (k, label, { type = 'text', ph = '', mono = false, wide = false, auto = 'off', hint = '', end = '' } = {}) => `
    <div class="fw-field ${wide ? 'qr-f--wide' : ''}"><label class="fw-field__label" for="qf-${k}">${label}</label>
    ${end ? `<div class="fw-inputwrap fw-inputwrap--end">` : ''}<input class="fw-input ${mono ? 'fw-input--mono' : ''}" id="qf-${k}" data-k="${k}" type="${type}" placeholder="${esc(ph)}" autocomplete="${auto}" spellcheck="false" value="${esc(S.f[S.type][k] ?? '')}">${end ? `<div class="fw-inputwrap__end">${end}</div></div>` : ''}
    ${hint ? `<span class="fw-field__hint">${hint}</span>` : ''}</div>`;
  const area = (k, label, ph = '', rows = 3) => `<div class="fw-field qr-f--wide"><label class="fw-field__label" for="qf-${k}">${label}</label><textarea class="fw-textarea" id="qf-${k}" data-k="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(S.f[S.type][k] ?? '')}</textarea></div>`;
  function formHtml() {
    const f = S.f[S.type];
    switch (S.type) {
      case 'link': return `${field('url', 'Link', { type: 'url', ph: 'example.com/page', mono: true, wide: true, hint: '<span id="qr-linkhint">https:// is added for you.</span>' })}`;
      case 'wifi': return `${field('ssid', 'Network name', { ph: 'e.g. Fernwork-Gast', wide: true })}
        <div class="fw-field qr-f--wide"><span class="fw-field__label" id="qr-sec-l">Security</span>
          <div class="fw-seg" role="radiogroup" aria-labelledby="qr-sec-l" id="qr-sec">${[['WPA', 'WPA2 / WPA3'], ['WEP', 'WEP (old)'], ['nopass', 'None']].map(([v, l]) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${v}" aria-checked="${f.sec === v}">${l}</button>`).join('')}</div></div>
        ${f.sec !== 'nopass' ? field('pass', 'Password', { type: 'password', mono: true, wide: true, auto: 'new-password', end: `<button class="fw-iconbtn fw-iconbtn--sm" type="button" id="qr-eye" aria-label="Show password" data-tip="Show" aria-pressed="false">${icon('eye')}</button><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="qr-sugg" aria-label="Suggest a password" data-tip="Suggest a strong one">${icon('refresh-cw')}</button>` }) : ''}
        <label class="fw-toggle qr-f--wide"><input type="checkbox" id="qr-hidden" ${f.hidden ? 'checked' : ''}>Hidden network</label>
        <p class="qr-private qr-f--wide">${icon('lock', { size: 14 })}<span>Made on this device. Anyone who scans the code can read the password, so print it only where guests are welcome.</span></p>`;
      case 'contact': return `${field('first', 'First name', { auto: 'given-name' })}${field('last', 'Last name', { auto: 'family-name' })}${field('tel', 'Phone', { type: 'tel', auto: 'tel', mono: true })}${field('email', 'Email', { type: 'email', auto: 'email' })}${field('org', 'Company')}${field('title', 'Job title')}${field('web', 'Website', { type: 'url', mono: true, wide: true })}
        <p class="qr-private qr-f--wide">${icon('info', { size: 14 })}<span>Fewer fields make a simpler code that scans from further away.</span></p>`;
      case 'text': return area('text', 'Text', 'Anything: a note, a code, a poem', 5);
      case 'email': return `${field('to', 'To', { type: 'email', wide: true })}${field('subject', 'Subject', { wide: true })}${area('body', 'Message')}`;
      case 'sms': return `${field('tel', 'Phone number', { type: 'tel', mono: true, wide: true, hint: 'Spaces are removed for you.' })}${area('body', 'Message')}`;
      case 'event': return `${field('title', 'Event', { wide: true, ph: 'e.g. Autumn party' })}${field('start', 'Starts', { type: 'datetime-local' })}${field('end', 'Ends', { type: 'datetime-local' })}${field('where', 'Where', { wide: true })}
        <p class="qr-private qr-f--wide">${icon('info', { size: 14 })}<span>Times are stored in UTC, so phones in every time zone show the right hour.</span></p>`;
    }
    return '';
  }
  let rafId = 0;
  root.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (!k || mode !== 'make') return; S.f[S.type][k] = e.target.value; schedule(); });
  function renderMake() {
    root.innerHTML = `
    <div class="qr-make">
      <div class="qr-main">
      <section class="qr-form fw-card" aria-label="What goes in the code">
        <div class="qr-types" role="radiogroup" aria-label="Type" data-roving="button">
          ${TYPES.map((t) => `<button type="button" class="fw-chip qr-type" role="radio" data-type="${t.id}" aria-checked="${S.type === t.id}" ${S.type === t.id ? 'aria-pressed="true"' : ''}>${icon(t.icon, { size: 16 })}${t.label}</button>`).join('')}
        </div>
        <div class="qr-fields" id="qr-fields">${formHtml()}</div>
      </section>
        <section class="qr-style fw-card" aria-label="Style">
          <div class="qr-row"><span class="qr-row__label">Colour</span>
            <div class="qr-swatches" role="radiogroup" aria-label="Colour" data-roving="button">
              ${PRESETS.map((p) => `<button type="button" class="qr-sw" role="radio" data-preset="${p.id}" aria-checked="${S.preset === p.id}" aria-label="${p.label}" data-tip="${p.label}" style="--fg:${p.fg};--bg:${p.bg}"><span></span></button>`).join('')}
              <label class="qr-sw qr-sw--custom" data-tip="Custom colours" aria-checked="${S.preset === 'custom'}"><input type="color" id="qr-fg" value="${S.fg}" aria-label="Custom code colour"><span>${icon('pipette', { size: 14 })}</span></label>
            </div></div>
          <div class="qr-row"><span class="qr-row__label">Logo</span>
            <div class="qr-logo">${S.logo ? `<span class="qr-logo__chip"><img src="${S.logo.src}" alt="">${esc(S.logoName)}<button type="button" class="fw-chip__x" id="qr-logo-x" aria-label="Remove logo">${icon('x', { size: 12 })}</button></span>` : `<button type="button" class="fw-btn fw-btn--sm" id="qr-logo">${icon('plus')}Add logo</button>`}</div></div>
          <div class="qr-row"><span class="qr-row__label">Robustness</span>
            <div class="fw-seg fw-seg--sm" role="radiogroup" aria-label="Robustness" id="qr-ecc"><button class="fw-seg__opt" role="radio" type="button" data-value="M" aria-checked="${S.ecc === 'M'}">Standard</button><button class="fw-seg__opt" role="radio" type="button" data-value="H" aria-checked="${S.ecc === 'H'}">High</button></div>
            <span class="qr-row__hint" id="qr-ecc-hint">${S.ecc === 'H' ? (S.logo ? 'On for the logo' : 'Survives smudges') : '15 % can be damaged'}</span></div>
        </section>
      </div>
      <aside class="qr-side">
        <section class="qr-preview fw-card" aria-label="Preview">
          <div class="qr-stage" id="qr-stage"><canvas id="qr-canvas" width="296" height="296" aria-label="QR code preview" role="img"></canvas><div class="qr-stage__empty" id="qr-empty">${icon('qr-code', { size: 24 })}<span>Your code appears here</span></div></div>
          <div class="qr-pinfo">
            <div class="qr-caption" id="qr-caption"></div>
            <div class="qr-test" id="qr-test" aria-live="polite"></div>
            <div class="qr-cap" id="qr-cap"></div>
          </div>
        </section>
        <section class="qr-export fw-card" aria-label="Export">
          <div class="qr-row"><span class="qr-row__label">Print size</span>
            <div class="fw-seg fw-seg--sm" role="radiogroup" aria-label="Print size" id="qr-size">${SIZES.map((s) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${s}" aria-checked="${S.size === s}">${String(s).replace('.', ',')} cm</button>`).join('')}</div>
            <span class="qr-row__hint fw-num" id="qr-px"></span></div>
          <div class="qr-file"><span class="fw-mono fw-ellipsis" id="qr-fname"></span></div>
          <div class="qr-actions">
            <button type="button" class="fw-btn fw-btn--primary" id="qr-dl" data-tip="Download PNG" data-tip-kbd="mod+s">${icon('download')}<span>PNG</span></button>
            <button type="button" class="fw-btn" id="qr-svg">SVG</button>
            <button type="button" class="fw-btn" id="qr-copyimg" data-tip="Copy image">${icon('copy')}<span>Copy</span></button>
            <button type="button" class="fw-btn" id="qr-card" ${S.type === 'wifi' || S.type === 'contact' ? '' : 'hidden'}>${icon('printer')}<span>Print card</span></button>
          </div>
        </section>
      </aside>
    </div>`;
    enhance(root);
    bindMake();
    paint();
  }
  function bindMake() {
    $$('.qr-type', root).forEach((b) => b.addEventListener('click', () => { S.type = b.dataset.type; const u = new URL(location.href); u.searchParams.set('type', S.type); u.searchParams.delete('q'); history.replaceState(null, '', u); renderMake(); $(`.qr-type[data-type="${S.type}"]`)?.focus(); }));
    $('#qr-sec')?.addEventListener('fw-change', (e) => { S.f.wifi.sec = e.detail.value; $('#qr-fields').innerHTML = formHtml(); enhance($('#qr-fields')); bindFields(); schedule(); });
    $('#qr-ecc').addEventListener('fw-change', (e) => { S.ecc = e.detail.value; S.eccAuto = false; schedule(); });
    $('#qr-size').addEventListener('fw-change', (e) => { S.size = +e.detail.value; schedule(); });
    $$('.qr-sw[data-preset]').forEach((b) => b.addEventListener('click', () => { const p = PRESETS.find((x) => x.id === b.dataset.preset); S.preset = p.id; S.fg = p.fg; S.bg = p.bg; markPreset(); schedule(); }));
    $('#qr-fg').addEventListener('input', (e) => { S.preset = 'custom'; S.fg = e.target.value; S.bg = '#ffffff'; markPreset(); schedule(); });
    $('#qr-logo')?.addEventListener('click', (e) => openMenu(e.currentTarget, [
      { label: 'Fernwork mark', icon: 'image', hint: 'sample', onSelect: () => setLogo('../kit/img/logo.svg', 'fernwork.svg') },
      { label: 'Choose image…', icon: 'upload', onSelect: pickLogo },
    ]));
    $('#qr-logo-x')?.addEventListener('click', () => { S.logo = null; if (S.eccAuto) S.ecc = 'M'; renderMake(); });
    $('#qr-dl').onclick = downloadPNG;
    $('#qr-svg').onclick = () => { if (!S.last) return; download(new Blob([toSVG(S.last, { fg: S.fg, bg: S.bg, logoHref: S.logo ? S.logoData : null, sizeMm: S.size * 10 })], { type: 'image/svg+xml' }), fname('svg')); };
    $('#qr-copyimg').onclick = async (e) => {
      const b = e.currentTarget; const c = exportCanvas(); const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copiedFlash(b); } catch { toast('This browser can’t copy images. Use Download.', { type: 'warning' }); }
    };
    $('#qr-card').onclick = openPrintCard;
    bindFields();
  }
  function bindFields() {
    $('#qr-eye')?.addEventListener('click', (e) => { const i = $('#qf-pass'); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.innerHTML = icon(on ? 'eye-off' : 'eye'); });
    $('#qr-sugg')?.addEventListener('click', () => { const i = $('#qf-pass'); i.value = suggest(3); i.type = 'text'; S.f.wifi.pass = i.value; schedule(); });
    $('#qr-hidden')?.addEventListener('change', (e) => { S.f.wifi.hidden = e.target.checked; schedule(); });
  }
  const copiedFlash = (b) => { const old = b.innerHTML; b.innerHTML = `${icon('check')}<span>Copied</span>`; b.classList.add('is-copied'); setTimeout(() => { b.innerHTML = old; b.classList.remove('is-copied'); }, 1500); };
  function markPreset() { $$('.qr-sw').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset ? b.dataset.preset === S.preset : S.preset === 'custom'))); }
  function pickLogo() { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => { const f = i.files[0]; if (f) setLogo(URL.createObjectURL(f), f.name); }; i.click(); }
  async function setLogo(src, name) {
    const img = new Image(); img.src = src; await img.decode();
    S.logo = img; S.logoName = name;
    try { const b = await (await fetch(src)).blob(); S.logoData = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch { S.logoData = null; }
    const was = S.ecc; if (S.eccAuto || S.ecc === 'M') { S.ecc = 'H'; S.eccAuto = true; }
    renderMake();
    if (was !== 'H') { const hint = $('#qr-ecc-hint'); hint.classList.add('is-flash'); toast('Robustness set to High so the logo can’t break the code', { type: 'info' }); }
  }
  const fname = (ext) => `${filenameFor(S.type, S.f[S.type])}.${ext}`;
  function schedule() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(paint); }
  function paint() {
    const b = build(S.type, S.f[S.type]);
    const cv = $('#qr-canvas'); if (!cv) return;
    const stage = $('#qr-stage');
    let err = b.error || '';
    let qr = null;
    if (b.text && !b.error) { try { qr = encode(b.text, S.ecc); } catch (e) { if (e.capacity) err = `Too long for a QR code: ${e.capacity.bytes.toLocaleString('en')} of ${e.capacity.max.toLocaleString('en')} bytes at ${S.ecc === 'H' ? 'High' : 'Standard'} robustness. Shorten it${S.ecc === 'H' ? ' or switch to Standard' : ''}.`; } }
    if (qr) {
      // keep the canvas size stable: integer module scale inside a fixed CSS box
      const scale = Math.max(2, Math.floor(264 / (qr.size + 8)));
      drawQR(cv, qr, { fg: S.fg, bg: S.bg, scale, logo: S.logo });
      S.last = qr; S.lastText = b.text;
      S.test = selfTest(cv, b.text);
      stage.classList.remove('is-stale', 'is-empty');
    } else if (b.empty) { S.last = null; S.test = null; stage.classList.remove('is-stale'); stage.classList.add('is-empty'); }
    else if (S.last) stage.classList.add('is-stale');
    else stage.classList.add('is-empty');
    stage.style.setProperty('--qbg', S.bg);
    // caption + verdict
    const f = S.f[S.type];
    $('#qr-caption').innerHTML = !S.last ? '' : S.type === 'wifi' ? `<strong>Scan to join</strong><span class="fw-ellipsis">${esc(f.ssid)}</span>` : S.type === 'link' ? `<strong>Opens</strong><span class="fw-ellipsis fw-mono">${esc((() => { try { return new URL(b.text).hostname.replace(/^www\./, ''); } catch { return b.text; } })())}</span>` : S.type === 'contact' ? `<strong>Saves contact</strong><span class="fw-ellipsis">${esc([f.first, f.last].filter(Boolean).join(' ') || f.org)}</span>` : `<strong>${esc(TYPES.find((t) => t.id === S.type).label)}</strong>`;
    const warn = [];
    if (S.last) {
      const inv = lum(S.fg) > lum(S.bg); const cr = ratio(S.fg, S.bg);
      if (inv) warn.push(`<div class="fw-alert fw-alert--warning qr-warn"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">Light on dark: many phone scanners can’t read inverted codes.<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-fix="swap">Swap colours</button></div></div></div>`);
      else if (cr < 4) warn.push(`<div class="fw-alert fw-alert--warning qr-warn"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">Low contrast (${cr.toFixed(1)}:1): may not scan in dim light.<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-fix="dark">Use black</button></div></div></div>`);
    }
    const t = S.test;
    $('#qr-test').innerHTML = err ? `<div class="fw-alert fw-alert--${S.last ? 'warning' : 'danger'} qr-warn"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body">${esc(err)}${S.last ? '<span class="fw-faint">Showing the last good code.</span>' : ''}</div></div>`
      : !S.last ? `<span class="qr-test__idle">${icon('scan-line', { size: 16 })} We test-scan every code before you download it</span>`
        : t?.ok && !warn.length ? `<span class="fw-verdict fw-verdict--ok qr-verdict" data-ok>${icon('circle-check')} Scans correctly</span>`
          : t?.ok ? `<span class="fw-verdict fw-verdict--warn qr-verdict">${icon('triangle-alert')} Scans here, may fail on older phones</span>${warn.join('')}`
            : t?.inverted ? `<span class="fw-verdict fw-verdict--bad qr-verdict">${icon('circle-x')} Doesn’t scan on most phones</span>${warn.join('')}`
              : `<span class="fw-verdict fw-verdict--bad qr-verdict">${icon('circle-x')} Doesn’t scan</span><div class="fw-alert fw-alert--danger qr-warn"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body">${S.logo ? 'The logo covers too much. Robustness High helps, or remove the logo.' : 'Try more contrast or a shorter text.'}${S.logo && S.ecc !== 'H' ? '<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-fix="high">Use High</button></div>' : ''}</div></div>`;
    const bytes = S.last?.bytes || 0, max = CAPACITY[S.ecc];
    $('#qr-cap').innerHTML = S.last ? `<span class="fw-num">${bytes.toLocaleString('en')} bytes</span><span class="qr-meter" style="--v:${Math.max(2, Math.min(100, (bytes / max) * 100))}%"><span></span></span><span class="fw-num">version ${S.last.version} · ${S.last.size}×${S.last.size}</span>` : '';
    $$('[data-fix]', $('#qr-test')).forEach((x) => x.addEventListener('click', () => {
      if (x.dataset.fix === 'swap') { [S.fg, S.bg] = [S.bg, S.fg]; S.preset = PRESETS.find((p) => p.fg === S.fg && p.bg === S.bg)?.id || 'custom'; }
      if (x.dataset.fix === 'dark') { S.fg = '#111111'; S.bg = '#ffffff'; S.preset = 'black'; }
      if (x.dataset.fix === 'high') { S.ecc = 'H'; }
      renderMake();
    }));
    // export info
    const total = (S.last?.size || 25) + 8; const px = Math.round((S.size / 2.54) * 300); const mod = Math.max(1, Math.floor(px / total));
    $('#qr-px').textContent = `${(mod * total).toLocaleString('en')} px · 300 dpi`;
    $('#qr-fname').textContent = S.last ? fname('png') : '';
    ['#qr-dl', '#qr-svg', '#qr-copyimg', '#qr-card'].forEach((s) => { const el = $(s); if (el) el.disabled = !S.last; });
    $('#qr-ecc-hint').textContent = S.ecc === 'H' ? (S.logo ? 'Auto: on for the logo' : '30 % can be damaged') : '15 % can be damaged';
    $$('#qr-ecc .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.ecc)));
    // mobile action bar
    if (S.last) {
      const a = ctx.mbar.set({ line: t?.ok ? '✓ Scans correctly' : 'Check the warning', sub: fname('png'), actions: `${S.type === 'wifi' || S.type === 'contact' ? `<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="card" aria-label="Print card" data-tip="Print card">${icon('printer')}</button>` : ''}<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="share" aria-label="Share" data-tip="Share">${icon('share-2')}</button><button class="fw-btn fw-btn--primary" type="button" data-a="dl">${icon('download')}<span>Save</span></button>` });
      a.querySelector('[data-a="dl"]').onclick = downloadPNG; a.querySelector('[data-a="card"]')?.addEventListener('click', openPrintCard);
      a.querySelector('[data-a="share"]').onclick = async () => { const c = exportCanvas(); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const file = new File([blob], fname('png'), { type: 'image/png' }); if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {}); else downloadPNG(); };
    } else ctx.mbar.hide();
  }
  function exportCanvas() {
    const c = document.createElement('canvas'); const total = S.last.size + 8; const px = Math.round((S.size / 2.54) * 300);
    drawQR(c, S.last, { fg: S.fg, bg: S.bg, scale: Math.max(1, Math.floor(px / total)), logo: S.logo }); return c;
  }
  function downloadPNG() { if (!S.last) return; exportCanvas().toBlob((b) => { download(b, fname('png')); toast(`Saved ${fname('png')}`, { type: 'success' }); }, 'image/png'); }

  // ── print card ──
  function openPrintCard() {
    if (!S.last || !(S.type === 'wifi' || S.type === 'contact')) return;
    const C = { format: 'a6', showPass: true, caption: S.type === 'wifi' ? 'Scan to join our Wi-Fi' : 'Scan to save my contact' };
    const body = `<div class="pc">
      <div class="pc-stage"><canvas id="pc-canvas" aria-label="Card preview" role="img"></canvas></div>
      <div class="pc-opts">
        <div class="fw-field"><span class="fw-field__label" id="pc-fmt-l">Format</span>
          <div class="fw-seg" role="radiogroup" aria-labelledby="pc-fmt-l" id="pc-fmt">${Object.entries(FORMATS).map(([k, f]) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${k}" aria-checked="${C.format === k}">${f.label}</button>`).join('')}</div>
          <span class="fw-field__hint" id="pc-fmt-note">${FORMATS[C.format].note} · prints at 300 dpi</span></div>
        <div class="fw-field"><label class="fw-field__label" for="pc-cap">Headline</label><input class="fw-input" id="pc-cap" value="${esc(C.caption)}"></div>
        ${S.type === 'wifi' && S.f.wifi.sec !== 'nopass' ? `<label class="fw-toggle"><input type="checkbox" id="pc-pass" checked>Show the password in text</label><span class="fw-field__hint">For guests whose phone can’t scan.</span>` : ''}
        <div class="pc-file fw-mono" id="pc-file">${esc(fname('pdf'))}</div>
        <div class="pc-actions">
          <button class="fw-btn fw-btn--primary" type="button" id="pc-pdf">${icon('download')}<span>Download PDF</span></button>
          <button class="fw-btn" type="button" id="pc-png">PNG</button>
          <button class="fw-btn fw-btn--ghost" type="button" id="pc-print">${icon('printer')}Print</button>
        </div>
        <p class="qr-private">${icon('lock', { size: 14 })}<span>The card is drawn on this device. The PDF has a vector code, sharp at any size.</span></p>
      </div></div>`;
    const dlg = openDialog({ title: 'Print card', body, size: 860, className: 'pc-dialog' });
    const cv = $('#pc-canvas', dlg.el);
    let lastRects = null;
    const draw = () => { lastRects = drawCard(cv, { format: C.format, type: S.type, fields: S.f[S.type], qr: S.last, fg: S.fg, bg: S.bg, logo: S.logo, caption: C.caption, showPass: C.showPass }); cv.dataset.format = C.format; };
    document.fonts.ready.then(draw);
    $('#pc-fmt', dlg.el).addEventListener('fw-change', (e) => { C.format = e.detail.value; $('#pc-fmt-note', dlg.el).textContent = `${FORMATS[C.format].note} · prints at 300 dpi`; draw(); });
    $('#pc-cap', dlg.el).addEventListener('input', (e) => { C.caption = e.target.value; draw(); });
    $('#pc-pass', dlg.el)?.addEventListener('change', (e) => { C.showPass = e.target.checked; draw(); });
    $('#pc-png', dlg.el).onclick = () => cv.toBlob((b) => download(b, fname('png').replace(/\.png$/, '-card.png')), 'image/png');
    $('#pc-print', dlg.el).onclick = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<title>${esc(fname('pdf'))}</title><style>@page{size:${FORMATS[C.format].w}mm ${FORMATS[C.format].h}mm;margin:0}body{margin:0}img{width:100%;}</style><img src="${cv.toDataURL('image/png')}" onload="print()">`); w.document.close(); };
    $('#pc-pdf', dlg.el).onclick = async (e) => {
      const b = e.currentTarget; b.classList.add('is-busy');
      const jpeg = await canvasJpeg(cv, 0.93);
      const hex = S.fg.replace('#', ''); const fill = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const blob = pdf([{ w: lastRects.wPt, h: lastRects.hPt, jpeg, jpegW: cv.width, jpegH: cv.height, rects: lastRects.rects, fill }], { title: fname('pdf') });
      download(blob, fname('pdf')); b.classList.remove('is-busy');
      const old = b.innerHTML; b.innerHTML = `${icon('check')}<span>Saved ${esc(fname('pdf'))}</span>`; setTimeout(() => { b.innerHTML = old; }, 2200);
      toast(`Saved ${fname('pdf')} · ${(blob.size / 1024).toFixed(0)} KB`, { type: 'success' });
    };
  }

  // ───────────────────────────── READ ─────────────────────────────
  let worker = null, reqId = 0; const pending = new Map();
  function decode(imgData, mode = 'image', onProgress, onPartial) {
    if (!worker) { worker = new Worker(new URL('./lib/qr-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; if (e.data.progress) { p.prog?.(e.data.progress); return; } if (e.data.partial) { p.part?.(e.data); return; } pending.delete(e.data.id); p.res(e.data); }; }
    const id = ++reqId; return new Promise((res) => { pending.set(id, { res, prog: onProgress, part: onPartial }); worker.postMessage({ id, data: imgData.data, width: imgData.width, height: imgData.height, mode }, [imgData.data.buffer]); });
  }
  const R = { file: null, img: null, codes: [] };
  function renderRead() {
    root.innerHTML = `
    <div class="qr-read">
      <div class="qr-read__in">
        <div class="fw-intake qr-intake ${R.file ? 'fw-intake--slim' : ''}" data-intake data-accept="image/*" data-multiple="false" id="qr-intake">
          <div class="fw-intake__icon">${icon('scan-line', { size: R.file ? 18 : 24 })}</div>
          <div class="fw-intake__title"><span class="fw-pointer-copy">${R.file ? 'Read another image' : 'Drop a photo or screenshot of a code'}</span><span class="fw-touch-copy">${R.file ? 'Read another photo' : 'Scan a code'}</span></div>
          ${R.file ? '' : `<div class="fw-intake__sub fw-pointer-copy"><span>or paste it (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}V)</span><span class="fw-dot"></span><span>several codes at once</span><span class="fw-dot"></span><span>full resolution</span></div>`}
          <div class="fw-intake__actions">
            <button class="fw-btn ${coarse ? '' : 'fw-btn--primary'}" type="button" data-pick>${icon('image')}<span class="fw-pointer-copy">Choose image</span><span class="fw-touch-copy">Choose photo</span></button>
            <button class="fw-btn ${coarse ? 'fw-btn--primary fw-btn--lg' : ''}" type="button" id="qr-cam-btn" data-no-pick>${icon('camera')}Camera</button>
          </div>
          ${R.file ? '' : `<div class="fw-intake__samples"><span class="fw-t-xs fw-faint">Try:</span>${SAMPLE_IMAGES.map(([f, l]) => `<button type="button" class="fw-chip fw-chip--sample" data-sample="./samples/${f}">${esc(l)}</button>`).join('')}</div>
          <div class="fw-intake__privacy">${icon('lock', { size: 12 })} Read on this device. The image is never uploaded.</div>`}
        </div>
      </div>
      <div class="qr-read__out" id="qr-out" ${R.file ? '' : 'hidden'}>
        <figure class="qr-shot" id="qr-shot"><div class="qr-shot__wrap"><div style="position:relative;max-width:100%"><canvas id="qr-shot-c"></canvas><svg class="qr-shot__ov" id="qr-ov" aria-hidden="true" preserveAspectRatio="none"></svg></div></div><figcaption class="fw-t-xs fw-muted" id="qr-shot-cap"></figcaption></figure>
        <div class="qr-results" id="qr-results" aria-live="polite"></div>
      </div>
    </div>`;
    enhance(root);
    $('#qr-cam-btn').addEventListener('click', (e) => { e.stopPropagation(); openCamera(); });
    if (R.file) showResults();
  }
  async function readFile(file) {
    R.file = file; R.codes = [];
    if (!$('#qr-out')) renderRead(); else renderRead();
    const res = $('#qr-results');
    res.innerHTML = `<div class="qr-busy"><span class="fw-spinner"></span><span id="qr-busy-t">Looking for codes…</span></div>`;
    const bmp = await createImageBitmap(file);
    const max = 3200, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
    R.img = c; R.w = w; R.h = h;
    drawShot();
    const t0 = performance.now();
    const out = await decode(g.getImageData(0, 0, w, h), 'image', (p) => { const t = $('#qr-busy-t'); if (t) t.textContent = p; },
      (part) => { if (R.file !== file) return; R.codes = part.codes; R.ms = Math.round(performance.now() - t0); R.more = true; showResults(); });
    if (R.file !== file) return;
    const changed = out.codes.length !== R.codes.length;
    R.codes = out.codes; R.more = false; if (!R.ms || changed) R.ms = Math.round(performance.now() - t0); R.pass = out.pass;
    if (changed || !out.codes.length) showResults(); else $('#qr-more')?.remove();
  }
  function drawShot() {
    const c = $('#qr-shot-c'); if (!c || !R.img) return;
    c.width = R.w; c.height = R.h; c.getContext('2d').drawImage(R.img, 0, 0);
    const box = Math.max(200, $('#qr-shot').clientWidth - 26), k = Math.min(box / R.w, (coarse ? 420 : 560) / R.h, 1);
    c.style.width = `${Math.round(R.w * k)}px`; c.style.height = `${Math.round(R.h * k)}px`;
    $('#qr-ov').setAttribute('viewBox', `0 0 ${R.w} ${R.h}`);
    $('#qr-shot-cap').textContent = `${R.file.name} · ${R.img.width} × ${R.img.height}`;
  }
  function showResults() {
    drawShot();
    const res = $('#qr-results'); if (!res) return;
    const sw = Math.max(3, R.w / 260);
    $('#qr-ov').innerHTML = R.codes.map((cd, i) => { const L = cd.location; const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => `${p.x},${p.y}`).join(' ');
      return `<polygon points="${pts}" class="qr-poly" style="stroke-width:${sw}"/>${R.codes.length > 1 ? `<g class="qr-num"><circle cx="${L.topLeftCorner.x}" cy="${L.topLeftCorner.y}" r="${sw * 5}"/><text x="${L.topLeftCorner.x}" y="${L.topLeftCorner.y}" font-size="${sw * 6}" dy=".35em">${i + 1}</text></g>` : ''}`; }).join('');
    if (!R.codes.length) {
      res.innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><strong>No code found in ${esc(R.file.name)}.</strong> Tried full resolution, half size and tiles (${R.ms} ms).
        <ul class="qr-tips"><li>Crop closer to the code, or take the photo straight on.</li><li>Make sure the whole code, with its white border, is in the picture.</li><li>Blurry? Hold still or step back a little.</li></ul></div></div>`;
      return;
    }
    res.innerHTML = `<div class="qr-found"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Found ${R.codes.length} code${R.codes.length > 1 ? 's' : ''}</span><span class="fw-t-xs fw-faint">${R.ms} ms · on this device</span>${R.more ? `<span class="fw-t-xs fw-muted qr-more" id="qr-more"><span class="fw-spinner" style="--s:12px"></span>Looking for more…</span>` : ''}</div>
      ${R.codes.map((cd, i) => resultCard(cd.data, { n: R.codes.length > 1 ? i + 1 : 0 })).join('')}`;
    enhance(res); bindCards(res, R.codes.map((c) => c.data));
  }

  // ── typed result cards (shared by image results and the camera sheet) ──
  function resultCard(text, { n = 0, compact = false } = {}) {
    const p = parse(text); const num = n ? `<span class="rc-n">${n}</span>` : '';
    const head = (ic, label) => `<div class="rc-head">${num}<span class="rc-icon">${icon(ic, { size: 16 })}</span><span class="rc-type">${label}</span></div>`;
    const btn = (a, label, ic, primary) => `<button type="button" class="fw-btn ${primary ? 'fw-btn--primary' : ''} fw-btn--sm" data-act="${a}">${ic ? icon(ic) : ''}<span>${label}</span></button>`;
    if (/FWENC1\./.test(text)) return `<article class="rc fw-card" data-type="sealed">${head('stamp', 'Sealed message')}<p class="rc-big">Encrypted with Seal</p><div class="rc-actions">${btn('seal', 'Open in Seal', 'lock-open', true)}</div></article>`;
    switch (p.type) {
      case 'wifi': return `<article class="rc fw-card" data-type="wifi">${head('wifi', 'Wi-Fi network')}
        <p class="rc-big">${esc(p.ssid)}</p><p class="rc-sub">${p.sec === 'nopass' ? 'Open network, no password' : p.sec === 'WEP' ? 'WEP (old, insecure)' : 'WPA2 / WPA3'}${p.hidden ? ' · hidden' : ''}</p>
        ${p.sec !== 'nopass' ? `<div class="rc-pass"><span class="rc-pass__label">Password</span><span class="rc-pass__val fw-mono">${esc(p.pass)}</span></div>` : ''}
        <div class="rc-actions">${p.sec !== 'nopass' ? btn('copy-pass', 'Copy password', 'copy', true) : ''}${compact ? '' : btn('card', 'Make printable card', 'printer') + btn('edit', 'Edit in Make', 'pencil')}</div>
        ${compact ? '<p class="rc-note">Your phone’s camera app can join directly. Here: copy the password, then pick the network.</p>' : ''}</article>`;
      case 'link': {
        const c = cleanLink(p.url); const host = c.ok ? c.host.replace(/^www\./, '') : p.url;
        const warns = c.ok ? c.notes.filter((x) => x.kind === 'warn') : [];
        return `<article class="rc fw-card" data-type="link">${head('link', 'Link')}
          <p class="rc-big rc-host">${esc(host)}</p><p class="rc-sub fw-mono rc-url">${esc(p.url)}</p>
          ${warns.map((w) => `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('shield-alert')}</span><div class="fw-alert__body">${esc(w.text)}</div></div>`).join('')}
          ${c.ok && c.removedCount ? `<div class="rc-clean"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} ${c.removedCount} tracker${c.removedCount > 1 ? 's' : ''} removed</span><span class="fw-mono rc-clean__url">${esc(c.url)}</span></div>` : ''}
          <div class="rc-actions"><a class="fw-btn fw-btn--primary fw-btn--sm" href="${esc(c.ok ? c.url : p.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}<span>Open${c.ok && c.removedCount ? ' clean' : ''}</span></a>${btn('copy-link', 'Copy', 'copy')}${c.ok && c.removedCount && !compact ? `<a class="fw-btn fw-btn--ghost fw-btn--sm" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original</a>` : ''}</div>
          <span hidden data-clean="${esc(c.ok ? c.url : p.url)}"></span></article>`;
      }
      case 'contact': return `<article class="rc fw-card" data-type="contact">${head('contact', 'Contact')}
        <p class="rc-big">${esc(p.name)}</p>${p.org || p.title ? `<p class="rc-sub">${esc([p.title, p.org].filter(Boolean).join(' · '))}</p>` : ''}
        <dl class="rc-kv">${p.tel ? `<dt>Phone</dt><dd class="fw-mono">${esc(p.tel)}</dd>` : ''}${p.email ? `<dt>Email</dt><dd>${esc(p.email)}</dd>` : ''}${p.web ? `<dt>Web</dt><dd class="fw-mono">${esc(p.web)}</dd>` : ''}</dl>
        <div class="rc-actions">${btn('vcf', 'Save contact (.vcf)', 'download', true)}${btn('copy-text', 'Copy', 'copy')}</div></article>`;
      case 'event': {
        const fmt = (d) => d ? d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `<article class="rc fw-card" data-type="event">${head('calendar', 'Event')}
        <p class="rc-big">${esc(p.title)}</p><p class="rc-sub">${esc(fmt(p.start))}${p.end ? ' – ' + esc(p.end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : ''}${p.where ? ' · ' + esc(p.where) : ''}</p>
        <div class="rc-actions">${btn('ics', 'Add to calendar (.ics)', 'calendar', true)}${btn('copy-text', 'Copy', 'copy')}</div></article>`;
      }
      case 'email': return `<article class="rc fw-card" data-type="email">${head('mail', 'Email')}<p class="rc-big">${esc(p.to)}</p>${p.subject ? `<p class="rc-sub">${esc(p.subject)}</p>` : ''}<div class="rc-actions"><a class="fw-btn fw-btn--primary fw-btn--sm" href="${esc(text)}">${icon('send')}<span>Write email</span></a>${btn('copy-text', 'Copy', 'copy')}</div></article>`;
      case 'sms': return `<article class="rc fw-card" data-type="sms">${head('message-square', 'Text message')}<p class="rc-big fw-mono">${esc(p.tel)}</p>${p.body ? `<p class="rc-sub">${esc(p.body)}</p>` : ''}<div class="rc-actions"><a class="fw-btn fw-btn--primary fw-btn--sm" href="sms:${esc(p.tel)}${p.body ? '?body=' + encodeURIComponent(p.body) : ''}">${icon('send')}<span>Send SMS</span></a>${btn('copy-text', 'Copy', 'copy')}</div></article>`;
      default: return `<article class="rc fw-card" data-type="text">${head('type', 'Text')}<p class="rc-text">${esc(p.text || text)}</p><div class="rc-actions">${btn('copy-text', 'Copy', 'copy', true)}</div></article>`;
    }
  }
  function bindCards(rootEl, texts) {
    $$('.rc', rootEl).forEach((card, i) => {
      const text = texts[i]; const p = parse(text);
      card.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const a = b.dataset.act;
        if (a === 'copy-pass') { copyText(p.pass, b); }
        if (a === 'copy-link') copyText($('[data-clean]', card).dataset.clean, b);
        if (a === 'copy-text') copyText(text, b);
        if (a === 'vcf') { download(new Blob([text.replace(/\r?\n/g, '\r\n')], { type: 'text/vcard' }), `${filenameFor('contact', { first: p.name })}.vcf`); toast('Contact saved as .vcf', { type: 'success' }); }
        if (a === 'ics') { download(new Blob([p.raw.replace(/\r?\n/g, '\r\n')], { type: 'text/calendar' }), `${filenameFor('event', { title: p.title })}.ics`); toast('Event saved as .ics', { type: 'success' }); }
        if (a === 'seal') navigate('seal', { query: { q: text } });
        if (a === 'edit' || a === 'card') {
          S.type = 'wifi'; Object.assign(S.f.wifi, { ssid: p.ssid, pass: p.pass, sec: p.sec === 'nopass' ? 'nopass' : p.sec === 'WEP' ? 'WEP' : 'WPA', hidden: p.hidden });
          closeCamera(); setMode('make'); if (a === 'card') setTimeout(openPrintCard, 60);
        }
      });
    });
  }

  // ── camera: full-screen viewfinder, outline, result sheet (keeps scanning) ──
  let cam = null;
  async function openCamera() {
    const el = document.createElement('div'); el.className = 'qr-cam'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Scan with camera');
    el.innerHTML = `<video class="qr-cam__video" playsinline muted autoplay></video>
      <svg class="qr-cam__ov" aria-hidden="true"><polygon class="qr-cam__poly" points=""/></svg>
      <div class="qr-cam__frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="qr-cam__top">
        <button class="qr-cam__btn" type="button" data-cam="close" aria-label="Close camera">${icon('x', { size: 22 })}</button>
        <span class="qr-cam__title">Point at a code</span>
        <button class="qr-cam__btn" type="button" data-cam="torch" aria-label="Flashlight" aria-pressed="false">${icon('flashlight', { size: 20 })}</button>
        <button class="qr-cam__btn" type="button" data-cam="flip" aria-label="Switch camera">${icon('switch-camera', { size: 20 })}</button>
      </div>
      <div class="qr-cam__bottom">
        <span class="qr-cam__status" aria-live="polite"><span class="qr-cam__dot"></span><span data-status>Starting camera…</span></span>
        <button class="qr-cam__photo" type="button" data-cam="photo">${icon('image', { size: 18 })}From photo</button>
      </div>
      <section class="qr-cam__sheet" aria-live="polite" aria-label="Result"><div class="qr-cam__grab" aria-hidden="true"></div><div class="qr-cam__res"></div></section>`;
    document.body.append(el); document.body.classList.add('qr-cam-open');
    requestAnimationFrame(() => el.classList.add('is-on'));
    cam = { el, stream: null, found: '', facing: 'environment', raf: 0, busy: false, pop: pushLayer(() => closeCamera(), el) };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cam]'); if (!b) return;
      const a = b.dataset.cam;
      if (a === 'close') closeCamera();
      if (a === 'photo') { closeCamera(); const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => i.files[0] && hooks.onFiles([i.files[0]]); i.click(); }
      if (a === 'flip') { cam.facing = cam.facing === 'environment' ? 'user' : 'environment'; start(); }
      if (a === 'torch') { const t = cam.stream?.getVideoTracks()[0]; const caps = t?.getCapabilities?.() || {}; if (!caps.torch) { toast('This camera has no flashlight', { type: 'info' }); return; } const on = b.getAttribute('aria-pressed') !== 'true'; t.applyConstraints({ advanced: [{ torch: on }] }); b.setAttribute('aria-pressed', String(on)); }
    });
    $('.qr-cam__sheet', el).addEventListener('click', (e) => { if (e.target.closest('.qr-cam__grab')) el.classList.toggle('sheet-min'); });
    async function start() {
      cam.stream?.getTracks().forEach((t) => t.stop());
      const st = $('[data-status]', el);
      try {
        cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cam.facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      } catch (err) {
        st.textContent = 'Camera not available';
        $('.qr-cam__res', el).innerHTML = `<div class="rc rc--perm"><p class="rc-big">Allow the camera to scan</p><p class="rc-sub">The picture stays on this phone; nothing is recorded or uploaded. Or read a code from a photo instead.</p><div class="rc-actions"><button class="fw-btn fw-btn--primary" type="button" data-cam="photo">${icon('image')}Choose photo</button></div></div>`;
        el.classList.add('has-sheet'); return;
      }
      const v = $('video', el); v.srcObject = cam.stream; await v.play().catch(() => {});
      st.textContent = 'Looking for a code…';
      loop();
    }
    const work = document.createElement('canvas'); const wg = work.getContext('2d', { willReadFrequently: true });
    function loop() {
      if (!cam) return;
      const v = $('video', el);
      if (!cam.busy && v.videoWidth) {
        cam.busy = true;
        const k = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight)); work.width = Math.round(v.videoWidth * k); work.height = Math.round(v.videoHeight * k);
        wg.drawImage(v, 0, 0, work.width, work.height);
        decode(wg.getImageData(0, 0, work.width, work.height), 'frame').then((r) => {
          if (!cam) return; cam.busy = false;
          const cd = r.codes[0];
          if (cd) { outline(cd.location, k, v); if (cd.data !== cam.found) { cam.found = cd.data; hit(cd.data); } } else fadeOutline();
        });
      }
      cam.raf = requestAnimationFrame(loop);
    }
    let fadeT = 0;
    function outline(L, k, v) {
      // map frame coords → displayed (object-fit: cover)
      const W = el.clientWidth, H = el.clientHeight, s = Math.max(W / v.videoWidth, H / v.videoHeight), ox = (W - v.videoWidth * s) / 2, oy = (H - v.videoHeight * s) / 2;
      const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => `${(p.x / k) * s + ox},${(p.y / k) * s + oy}`).join(' ');
      $('.qr-cam__ov', el).setAttribute('viewBox', `0 0 ${W} ${H}`);
      $('.qr-cam__poly', el).setAttribute('points', pts); el.classList.add('has-hit'); clearTimeout(fadeT); fadeT = setTimeout(fadeOutline, 700);
    }
    function fadeOutline() { el.classList.remove('has-hit'); }
    function hit(text) {
      navigator.vibrate?.(30);
      const p = parse(text);
      $('[data-status]', el).textContent = p.type === 'wifi' ? `Wi-Fi “${p.ssid}”` : p.type === 'link' ? 'Link found' : 'Code found';
      const res = $('.qr-cam__res', el); res.innerHTML = resultCard(text, { compact: true }); enhance(res); bindCards(res, [text]);
      el.classList.remove('sheet-min'); el.classList.add('has-sheet');
    }
    start();
  }
  function closeCamera() {
    if (!cam) return; const c = cam; cam = null;
    cancelAnimationFrame(c.raf); c.stream?.getTracks().forEach((t) => t.stop()); c.pop();
    c.el.classList.remove('is-on'); document.body.classList.remove('qr-cam-open');
    setTimeout(() => c.el.remove(), 220);
  }

  renderMode();
  if (mode === 'make' && !coarse) $('.qr-fields .fw-input, .qr-fields .fw-textarea')?.focus();
}
