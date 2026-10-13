// QR Code Generator (+ Wi-Fi QR code preset). Type chips → fields → live preview that test-scans itself.
// Colours, size, error correction, logo and the encoded text sit behind "More options". Wi-Fi/contact: print card.
import { $, $$, esc, icon, enhance, toast, openDialog, openMenu, store } from '../kit/shell.js';
import { encode, drawQR, toSVG, selfTest, build, parse, filenameFor, TYPES, CAPACITY, ECC_LABEL, ratio, lum } from './lib/qrlib.js';
import { drawCard, FORMATS } from './lib/card.js';
import { pdf, canvasJpeg } from './lib/pdf.js';
import { moreHtml, wireMore, remember, download, isCoarse } from './ui.js';

const PRESETS = [
  { id: 'black', label: 'Black', fg: '#000000', bg: '#ffffff' },
  { id: 'fern', label: 'Fern green', fg: '#15803d', bg: '#ffffff' },
  { id: 'ink', label: 'Ink blue', fg: '#1e3a8a', bg: '#ffffff' },
  { id: 'plum', label: 'Plum', fg: '#6b21a8', bg: '#ffffff' },
  { id: 'rust', label: 'Rust on cream', fg: '#9a3412', bg: '#fff7ed' },
];
const EMPTY = {
  link: { url: '' }, text: { text: '' }, wifi: { ssid: '', pass: '', sec: 'WPA', hidden: false },
  contact: { first: '', last: '', org: '', tel: '', email: '', web: '' }, email: { to: '', subject: '', body: '' },
  sms: { tel: '', body: '' }, event: { title: '', start: '', end: '', where: '', desc: '' },
};
const ORDER = ['link', 'text', 'wifi', 'contact', 'email', 'sms', 'event'];

export function mount(ctx) {
  const { root, hooks, params, leaf } = ctx;
  const mem = remember('qr');
  const saved = mem.load();
  const q = params.get('q') || '';
  const pre = q ? parse(q) : null;
  const S = {
    type: 'link', f: JSON.parse(JSON.stringify(EMPTY)),
    fg: '#000000', bg: '#ffffff', preset: 'black', ecc: 'M', eccAuto: true, px: 320, logo: null, logoName: '', logoData: null, showPayload: false,
    last: null, lastText: '', test: null, err: '',
    ...(store.get('util:qr:style') || {}),
  };
  if (saved) { S.type = saved.type || S.type; for (const k of ORDER) Object.assign(S.f[k], saved.f?.[k] || {}); }
  if (leaf.id === 'wifi-qr') S.type = 'wifi';
  else if (params.get('type') && EMPTY[params.get('type')]) S.type = params.get('type');
  if (pre) {
    if (pre.type === 'link') { S.type = 'link'; S.f.link.url = pre.url; }
    else if (pre.type === 'wifi') { S.type = 'wifi'; Object.assign(S.f.wifi, { ssid: pre.ssid, pass: pre.pass, sec: pre.sec === 'nopass' ? 'nopass' : pre.sec === 'WEP' ? 'WEP' : 'WPA', hidden: pre.hidden }); }
    else if (pre.type === 'contact') { const [first, ...rest] = (pre.name || '').split(' '); Object.assign(S.f.contact, { first, last: rest.join(' '), tel: pre.tel, email: pre.email, org: pre.org, web: pre.web }); S.type = 'contact'; }
    else { S.type = 'text'; S.f.text.text = q; }
  }
  const persist = () => {
    store.set('util:qr:style', { fg: S.fg, bg: S.bg, preset: S.preset, ecc: S.ecc, eccAuto: S.eccAuto, px: S.px, showPayload: S.showPayload });
    const f = JSON.parse(JSON.stringify(S.f)); f.wifi.pass = ''; mem.save({ type: S.type, f });
  };

  ctx.renderHeader({ lede: leaf.id === 'wifi-qr' ? 'Guests scan the code to join your Wi-Fi.' : 'Links, text, Wi-Fi, contacts, email, SMS and events.' });

  // ── fields ──
  const field = (k, label, { type = 'text', ph = '', mono = false, wide = false, auto = 'off', hint = '', end = '' } = {}) => `
    <div class="fw-field ${wide ? 'qr-f--wide' : ''}"><label class="fw-field__label" for="qf-${k}">${label}</label>
    ${end ? '<div class="fw-inputwrap fw-inputwrap--end">' : ''}<input class="fw-input ${mono ? 'fw-input--mono' : ''}" id="qf-${k}" data-k="${k}" type="${type}" placeholder="${esc(ph)}" autocomplete="${auto}" spellcheck="false" value="${esc(S.f[S.type][k] ?? '')}" ${type === 'datetime-local' ? 'step="60"' : ''}>${end ? `<div class="fw-inputwrap__end">${end}</div></div>` : ''}
    ${hint ? `<span class="fw-field__hint">${hint}</span>` : ''}</div>`;
  const area = (k, label, ph = '', rows = 3) => `<div class="fw-field qr-f--wide"><label class="fw-field__label" for="qf-${k}">${label}</label><textarea class="fw-textarea" id="qf-${k}" data-k="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(S.f[S.type][k] ?? '')}</textarea></div>`;
  function formHtml() {
    const f = S.f[S.type];
    switch (S.type) {
      case 'link': return field('url', 'Link', { type: 'url', ph: 'example.com/page', mono: true, wide: true });
      case 'text': return area('text', 'Text', 'Any text', 4);
      case 'wifi': return `${field('ssid', 'Network name', { ph: 'e.g. Cafe-Guest', wide: true })}
        <div class="fw-field qr-f--wide"><span class="fw-field__label" id="qr-sec-l">Security</span>
          <div class="fw-seg" role="radiogroup" aria-labelledby="qr-sec-l" id="qr-sec">${[['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'None']].map(([v, l]) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${v}" aria-checked="${f.sec === v}">${l}</button>`).join('')}</div></div>
        ${f.sec !== 'nopass' ? field('pass', 'Password', { type: 'password', mono: true, wide: true, auto: 'new-password', hint: 'Anyone who scans the code can read the password.', end: `<button class="fw-iconbtn fw-iconbtn--sm" type="button" id="qr-eye" aria-label="Show password" data-tip="Show" aria-pressed="false">${icon('eye')}</button>` }) : ''}
        <label class="fw-toggle qr-f--wide"><input type="checkbox" id="qr-hidden" ${f.hidden ? 'checked' : ''}><span>Hidden network</span></label>`;
      case 'contact': return `${field('first', 'First name', { auto: 'given-name' })}${field('last', 'Last name', { auto: 'family-name' })}${field('org', 'Organization', { wide: true })}${field('tel', 'Phone', { type: 'tel', auto: 'tel', mono: true })}${field('email', 'Email', { type: 'email', auto: 'email' })}${field('web', 'Website', { type: 'url', mono: true, wide: true })}`;
      case 'email': return `${field('to', 'To', { type: 'email', wide: true })}${field('subject', 'Subject', { wide: true })}${area('body', 'Message')}`;
      case 'sms': return `${field('tel', 'Phone number', { type: 'tel', mono: true, wide: true })}${area('body', 'Message')}`;
      case 'event': return `${field('title', 'Title', { wide: true })}${field('start', 'Start', { type: 'datetime-local' })}${field('end', 'End', { type: 'datetime-local' })}${field('where', 'Location', { wide: true })}${area('desc', 'Description', '', 2)}`;
    }
    return '';
  }
  const moreBody = () => `
    <div class="qr-opt"><span class="qr-opt__label">Colours</span>
      <div class="qr-opt__body"><div class="qr-swatches" role="radiogroup" aria-label="Colour preset" data-roving="button">
        ${PRESETS.map((p) => `<button type="button" class="qr-sw" role="radio" data-preset="${p.id}" aria-checked="${S.preset === p.id}" aria-label="${p.label}" data-tip="${p.label}" style="--fg:${p.fg};--bg:${p.bg}"><span></span></button>`).join('')}</div>
        <label class="qr-color"><input type="color" id="qr-fg" value="${S.fg}"><span>Code</span></label>
        <label class="qr-color"><input type="color" id="qr-bg" value="${S.bg}"><span>Background</span></label></div></div>
    <div class="qr-opt"><label class="qr-opt__label" for="qr-px">Size</label>
      <div class="qr-opt__body qr-size"><input type="range" class="ut-range" id="qr-px" min="128" max="1024" step="32" value="${S.px}"><output class="fw-num" id="qr-px-v" for="qr-px"></output></div></div>
    <div class="qr-opt"><span class="qr-opt__label" id="qr-ecc-l">Error correction</span>
      <div class="qr-opt__body"><div class="fw-seg fw-seg--sm" role="radiogroup" aria-labelledby="qr-ecc-l" id="qr-ecc">${['L', 'M', 'Q', 'H'].map((v) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${v}" aria-checked="${S.ecc === v}" data-tip="${ECC_LABEL[v]} can be damaged">${v}</button>`).join('')}</div>
        <span class="ut-hint" id="qr-ecc-hint"></span></div></div>
    <div class="qr-opt"><span class="qr-opt__label">Logo</span>
      <div class="qr-opt__body" id="qr-logo-slot"></div></div>
    <div class="qr-opt qr-opt--col"><label class="fw-toggle"><input type="checkbox" id="qr-showpl" ${S.showPayload ? 'checked' : ''}><span>Show encoded text</span></label>
      <textarea class="fw-textarea fw-textarea--mono qr-payload" id="qr-payload" rows="4" readonly aria-label="Encoded text" ${S.showPayload ? '' : 'hidden'}></textarea></div>
    <div class="qr-opt qr-opt--col">${mem.html()}</div>`;

  root.innerHTML = `
  <div class="qr-make">
    <section class="qr-form fw-card" aria-label="What goes in the code">
      <div class="qr-types" role="radiogroup" aria-label="Content type" data-roving="button">
        ${ORDER.map((id) => { const t = TYPES.find((x) => x.id === id); return `<button type="button" class="fw-chip qr-type" role="radio" data-type="${id}" aria-checked="${S.type === id}">${icon(t.icon, { size: 16 })}${t.label}</button>`; }).join('')}
      </div>
      <div class="qr-fields" id="qr-fields">${formHtml()}</div>
      ${moreHtml('qr-more', moreBody())}
    </section>
    <aside class="qr-side" aria-label="Preview and download">
      <section class="qr-preview fw-card">
        <div class="qr-stage" id="qr-stage"><canvas id="qr-canvas" width="264" height="264" aria-label="QR code preview" role="img"></canvas><div class="qr-stage__empty" id="qr-empty">${icon('qr-code', { size: 24 })}<span>Your code appears here</span></div></div>
        <div class="qr-pinfo">
          <div class="qr-test" id="qr-test" aria-live="polite"></div>
          <div class="qr-cap fw-num" id="qr-cap"></div>
        </div>
        <div class="qr-actions">
          <button type="button" class="fw-btn fw-btn--primary" id="qr-dl" data-tip="Download PNG" data-tip-kbd="mod+s">${icon('download')}<span>PNG</span></button>
          <button type="button" class="fw-btn" id="qr-svg">${icon('download')}<span>SVG</span></button>
          <button type="button" class="fw-btn" id="qr-copyimg">${icon('copy')}<span>Copy</span></button>
          <button type="button" class="fw-btn" id="qr-card" hidden>${icon('printer')}<span>Print card</span></button>
        </div>
      </section>
    </aside>
  </div>`;
  enhance(root);
  wireMore(root, { key: 'util:qr:more' });
  mem.wire(root, () => { const f = JSON.parse(JSON.stringify(S.f)); f.wifi.pass = ''; return { type: S.type, f }; });

  // ── events ──
  root.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (!k) return; S.f[S.type][k] = e.target.value; schedule(); });
  $$('.qr-type', root).forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));
  function setType(t) {
    S.type = t; $$('.qr-type', root).forEach((x) => x.setAttribute('aria-checked', String(x.dataset.type === t)));
    renderFields(); schedule();
  }
  function renderFields() {
    $('#qr-fields').innerHTML = formHtml(); enhance($('#qr-fields'));
    $('#qr-sec')?.addEventListener('fw-change', (e) => { S.f.wifi.sec = e.detail.value; renderFields(); schedule(); });
    $('#qr-eye')?.addEventListener('click', (e) => { const i = $('#qf-pass'); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.innerHTML = icon(on ? 'eye-off' : 'eye'); });
    $('#qr-hidden')?.addEventListener('change', (e) => { S.f.wifi.hidden = e.target.checked; schedule(); });
  }
  renderFields();
  $$('.qr-sw[data-preset]').forEach((b) => b.addEventListener('click', () => { const p = PRESETS.find((x) => x.id === b.dataset.preset); Object.assign(S, { preset: p.id, fg: p.fg, bg: p.bg }); syncStyle(); schedule(); }));
  $('#qr-fg').addEventListener('input', (e) => { S.fg = e.target.value; S.preset = 'custom'; syncStyle(); schedule(); });
  $('#qr-bg').addEventListener('input', (e) => { S.bg = e.target.value; S.preset = 'custom'; syncStyle(); schedule(); });
  $('#qr-px').addEventListener('input', (e) => { S.px = +e.target.value; schedule(); });
  $('#qr-ecc').addEventListener('fw-change', (e) => { S.ecc = e.detail.value; S.eccAuto = false; schedule(); });
  $('#qr-showpl').addEventListener('change', (e) => { S.showPayload = e.target.checked; $('#qr-payload').hidden = !S.showPayload; schedule(); });
  function syncStyle() {
    $$('.qr-sw').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === S.preset)));
    $('#qr-fg').value = S.fg; $('#qr-bg').value = S.bg;
    $$('#qr-ecc .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.ecc)));
  }
  function renderLogo() {
    $('#qr-logo-slot').innerHTML = S.logo
      ? `<span class="qr-logo__chip"><img src="${esc(S.logo.src)}" alt="">${esc(S.logoName)}<button type="button" class="fw-chip__x" id="qr-logo-x" aria-label="Remove logo">${icon('x', { size: 12 })}</button></span>`
      : `<button type="button" class="fw-btn fw-btn--sm" id="qr-logo">${icon('plus')}Add logo</button>`;
    $('#qr-logo')?.addEventListener('click', (e) => openMenu(e.currentTarget, [
      { label: 'Fernwork mark', icon: 'image', hint: 'sample', onSelect: () => setLogo('../kit/img/logo.svg', 'fernwork.svg') },
      { label: 'Choose image…', icon: 'upload', onSelect: pickLogo },
    ]));
    $('#qr-logo-x')?.addEventListener('click', () => { S.logo = null; S.logoData = null; if (S.eccAuto) S.ecc = 'M'; syncStyle(); renderLogo(); schedule(); });
  }
  renderLogo();
  function pickLogo() { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => { const f = i.files[0]; if (f) setLogo(URL.createObjectURL(f), f.name); }; i.click(); }
  async function setLogo(src, name) {
    const img = new Image(); img.src = src; await img.decode();
    S.logo = img; S.logoName = name;
    try { const b = await (await fetch(src)).blob(); S.logoData = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch { S.logoData = null; }
    if (S.ecc !== 'H') { S.ecc = 'H'; S.eccAuto = true; toast('Error correction set to H so the logo can’t break the code', { type: 'info' }); }
    syncStyle(); renderLogo(); schedule();
  }

  // ── render ──
  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }
  const fname = (ext) => `${filenameFor(S.type, S.f[S.type])}.${ext}`;
  function paint() {
    const f = S.f[S.type];
    let b = build(S.type, f);
    if (S.type === 'wifi' && f.ssid && f.sec !== 'nopass' && !f.pass) b = { text: '', error: 'Enter the Wi-Fi password, or set Security to None.' };
    const cv = $('#qr-canvas'); const stage = $('#qr-stage');
    let err = b.error || ''; let qr = null;
    if (b.text && !b.error) { try { qr = encode(b.text, S.ecc); } catch (e) { if (e.capacity) err = `Too long for a QR code: ${e.capacity.bytes.toLocaleString('en-US')} of ${e.capacity.max.toLocaleString('en-US')} bytes at error correction ${S.ecc}.${S.ecc !== 'L' ? ' Shorten it or choose a lower level.' : ' Shorten it.'}`; } }
    const tooSmall = qr && Math.floor(S.px / (qr.size + 8)) < 1;
    if (tooSmall) err = `${S.px} px is too small for this much content. Use at least ${qr.size + 8} px.`;
    if (qr && !tooSmall) {
      const scale = Math.max(2, Math.floor(264 / (qr.size + 8)));
      drawQR(cv, qr, { fg: S.fg, bg: S.bg, scale, logo: S.logo });
      S.last = qr; S.lastText = b.text; S.test = selfTest(cv, b.text);
      stage.classList.remove('is-stale', 'is-empty');
    } else if (b.empty) { S.last = null; S.test = null; stage.classList.remove('is-stale'); stage.classList.add('is-empty'); }
    else if (S.last) stage.classList.add('is-stale');
    else stage.classList.add('is-empty');
    stage.style.setProperty('--qbg', S.bg);
    // verdict
    const warn = [];
    if (S.last && !err) {
      if (lum(S.fg) > lum(S.bg)) warn.push(['Light code on a dark background: many phone scanners can’t read inverted codes.', 'swap', 'Swap colours']);
      else if (ratio(S.fg, S.bg) < 4) warn.push([`Low contrast (${ratio(S.fg, S.bg).toFixed(1)}:1): may not scan in dim light.`, 'dark', 'Use black']);
    }
    const alert = (kind, text, fix) => `<div class="fw-alert fw-alert--${kind} qr-warn"><span class="fw-alert__icon">${icon(kind === 'danger' ? 'circle-alert' : 'triangle-alert')}</span><div class="fw-alert__body">${esc(text)}${fix ? `<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" data-fix="${fix[0]}">${fix[1]}</button></div>` : ''}</div></div>`;
    const t = S.test;
    $('#qr-test').innerHTML = err ? alert(S.last ? 'warning' : 'danger', err + (S.last ? ' Showing the last good code.' : ''))
      : !S.last ? ''
        : t?.ok && !warn.length ? `<span class="fw-verdict fw-verdict--ok qr-verdict" data-ok>${icon('circle-check')} Scans correctly</span>`
          : t?.ok ? `<span class="fw-verdict fw-verdict--warn qr-verdict">${icon('triangle-alert')} Scans here, may fail on some phones</span>${warn.map((w) => alert('warning', w[0], [w[1], w[2]])).join('')}`
            : `<span class="fw-verdict fw-verdict--bad qr-verdict">${icon('circle-x')} Doesn’t scan</span>${warn.length ? warn.map((w) => alert('warning', w[0], [w[1], w[2]])).join('') : alert('danger', S.logo ? 'The logo covers too much. Use error correction H or remove the logo.' : 'Try more contrast or less content.', S.logo && S.ecc !== 'H' ? ['high', 'Use H'] : null)}`;
    $$('[data-fix]', $('#qr-test')).forEach((x) => x.addEventListener('click', () => {
      if (x.dataset.fix === 'swap') [S.fg, S.bg] = [S.bg, S.fg];
      if (x.dataset.fix === 'dark') { S.fg = '#000000'; S.bg = '#ffffff'; }
      if (x.dataset.fix === 'high') S.ecc = 'H';
      S.preset = PRESETS.find((p) => p.fg === S.fg && p.bg === S.bg)?.id || 'custom'; syncStyle(); schedule();
    }));
    $('#qr-cap').textContent = S.last ? `${S.last.bytes.toLocaleString('en-US')} bytes · ${S.px} × ${S.px} px · EC ${S.ecc}` : '';
    // options readouts
    $('#qr-px-v').textContent = `${S.px} × ${S.px} px · ${(S.px / 300 * 2.54).toFixed(1)} cm at 300 dpi`;
    $('#qr-ecc-hint').textContent = `${ECC_LABEL[S.ecc]} can be damaged${S.logo && S.ecc === 'H' ? ' · needed for the logo' : ''}`;
    $('#qr-payload').value = b.text || '';
    $('#qr-card').hidden = !(S.type === 'wifi' || S.type === 'contact');
    ['#qr-dl', '#qr-svg', '#qr-copyimg', '#qr-card'].forEach((s) => { $(s).disabled = !S.last; });
    persist();
    if (S.last) {
      const a = ctx.mbar.set({ line: t?.ok && !warn.length ? '✓ Scans correctly' : 'Check the warning', sub: fname('png'), actions: `${!$('#qr-card').hidden ? `<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="card" aria-label="Print card" data-tip="Print card">${icon('printer')}</button>` : ''}<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="share" aria-label="Share" data-tip="Share">${icon('share-2')}</button><button class="fw-btn fw-btn--primary" type="button" data-a="dl">${icon('download')}<span>PNG</span></button>` });
      a.querySelector('[data-a="dl"]').onclick = downloadPNG; a.querySelector('[data-a="card"]')?.addEventListener('click', openPrintCard);
      a.querySelector('[data-a="share"]').onclick = async () => { const blob = await new Promise((r) => exportCanvas().toBlob(r, 'image/png')); const file = new File([blob], fname('png'), { type: 'image/png' }); if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {}); else downloadPNG(); };
    } else ctx.mbar.hide();
  }
  function exportCanvas() {
    const tmp = document.createElement('canvas'); const total = S.last.size + 8;
    drawQR(tmp, S.last, { fg: S.fg, bg: S.bg, scale: Math.max(1, Math.floor(S.px / total)), logo: S.logo });
    const c = document.createElement('canvas'); c.width = c.height = S.px; const g = c.getContext('2d');
    g.fillStyle = S.bg; g.fillRect(0, 0, S.px, S.px); g.imageSmoothingEnabled = false;
    const o = Math.floor((S.px - tmp.width) / 2); g.drawImage(tmp, o, o); return c;
  }
  function downloadPNG() { if (!S.last) return; exportCanvas().toBlob((b) => download(b, fname('png')), 'image/png'); }
  function downloadSVG() { if (!S.last) return; download(new Blob([toSVG(S.last, { fg: S.fg, bg: S.bg, logoHref: S.logo ? S.logoData : null, px: S.px })], { type: 'image/svg+xml' }), fname('svg')); }
  async function copyImage(btn) {
    if (!S.last) return;
    const blob = await new Promise((r) => exportCanvas().toBlob(r, 'image/png'));
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      if (btn) { const old = btn.innerHTML; btn.innerHTML = `${icon('check')}<span>Copied</span>`; btn.classList.add('is-copied'); setTimeout(() => { btn.innerHTML = old; btn.classList.remove('is-copied'); }, 1500); }
    } catch { toast('This browser can’t copy images. Use Download.', { type: 'warning' }); }
  }
  $('#qr-dl').onclick = downloadPNG;
  $('#qr-svg').onclick = downloadSVG;
  $('#qr-copyimg').onclick = (e) => copyImage(e.currentTarget);
  $('#qr-card').onclick = openPrintCard;
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); downloadPNG(); } });
  ctx.shell.setCommands?.([
    { id: 'qr-png', label: 'Download PNG', icon: 'download', kbd: 'mod+s', run: downloadPNG },
    { id: 'qr-svg', label: 'Download SVG', icon: 'download', run: downloadSVG },
    { id: 'qr-copy', label: 'Copy QR code image', icon: 'copy', run: () => copyImage() },
    { id: 'qr-card', label: 'Print card', icon: 'printer', run: openPrintCard, hidden: () => !(S.type === 'wifi' || S.type === 'contact') },
  ]);
  hooks.onPaste = (t) => {
    const p = parse(t.trim());
    if (p.type === 'link') { S.f.link.url = t.trim(); setType('link'); }
    else if (p.type === 'wifi') { Object.assign(S.f.wifi, { ssid: p.ssid, pass: p.pass, sec: p.sec === 'nopass' ? 'nopass' : 'WPA' }); setType('wifi'); }
    else { S.f.text.text = t; setType('text'); }
    return true;
  };

  // ── print card (Wi-Fi / contact) ──
  function openPrintCard() {
    if (!S.last || !(S.type === 'wifi' || S.type === 'contact')) return;
    const C = { format: 'a6', showPass: true, caption: S.type === 'wifi' ? 'Scan to join our Wi-Fi' : 'Scan to save my contact' };
    const body = `<div class="pc">
      <div class="pc-stage"><canvas id="pc-canvas" aria-label="Card preview" role="img"></canvas></div>
      <div class="pc-opts">
        <div class="fw-field"><span class="fw-field__label" id="pc-fmt-l">Format</span>
          <div class="fw-seg" role="radiogroup" aria-labelledby="pc-fmt-l" id="pc-fmt">${Object.entries(FORMATS).map(([k, f]) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${k}" aria-checked="${C.format === k}">${f.label}</button>`).join('')}</div>
          <span class="fw-field__hint" id="pc-fmt-note">${FORMATS[C.format].note}</span></div>
        <div class="fw-field"><label class="fw-field__label" for="pc-cap">Headline</label><input class="fw-input" id="pc-cap" value="${esc(C.caption)}"></div>
        ${S.type === 'wifi' && S.f.wifi.sec !== 'nopass' ? '<label class="fw-toggle"><input type="checkbox" id="pc-pass" checked><span>Print the password as text</span></label>' : ''}
        <div class="pc-actions">
          <button class="fw-btn fw-btn--primary" type="button" id="pc-pdf">${icon('download')}<span>Download PDF</span></button>
          <button class="fw-btn" type="button" id="pc-png">PNG</button>
          <button class="fw-btn fw-btn--ghost" type="button" id="pc-print">${icon('printer')}Print</button>
        </div>
      </div></div>`;
    const dlg = openDialog({ title: 'Print card', body, size: 860, className: 'pc-dialog' });
    const cv = $('#pc-canvas', dlg.el); let rects = null;
    const draw = () => { rects = drawCard(cv, { format: C.format, type: S.type, fields: S.f[S.type], qr: S.last, fg: S.fg, bg: S.bg, logo: S.logo, caption: C.caption, showPass: C.showPass }); };
    document.fonts.ready.then(draw);
    $('#pc-fmt', dlg.el).addEventListener('fw-change', (e) => { C.format = e.detail.value; $('#pc-fmt-note', dlg.el).textContent = FORMATS[C.format].note; draw(); });
    $('#pc-cap', dlg.el).addEventListener('input', (e) => { C.caption = e.target.value; draw(); });
    $('#pc-pass', dlg.el)?.addEventListener('change', (e) => { C.showPass = e.target.checked; draw(); });
    $('#pc-png', dlg.el).onclick = () => cv.toBlob((b) => download(b, fname('png').replace(/\.png$/, '-card.png')), 'image/png');
    $('#pc-print', dlg.el).onclick = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<title>${esc(fname('pdf'))}</title><style>@page{size:${FORMATS[C.format].w}mm ${FORMATS[C.format].h}mm;margin:0}body{margin:0}img{width:100%;}</style><img src="${cv.toDataURL('image/png')}" onload="print()">`); w.document.close(); };
    $('#pc-pdf', dlg.el).onclick = async (e) => {
      const b = e.currentTarget; b.classList.add('is-busy');
      const jpeg = await canvasJpeg(cv, 0.93);
      const hex = S.fg.replace('#', ''); const fill = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const blob = pdf([{ w: rects.wPt, h: rects.hPt, jpeg, jpegW: cv.width, jpegH: cv.height, rects: rects.rects, fill }], { title: fname('pdf') });
      download(blob, fname('pdf')); b.classList.remove('is-busy');
    };
  }
  if (params.get('card') === '1') setTimeout(() => { if (S.last) openPrintCard(); }, 200);

  syncStyle(); paint();
  if (!isCoarse() && !q) $('.qr-fields .fw-input, .qr-fields .fw-textarea')?.focus();
}
