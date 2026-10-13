// QR Code Reader. Drop / paste / choose an image, or scan with the camera. Finds several codes per image (worker:
// quick pass, full resolution, tiles, masking found codes) and shows each as a typed result card.
import { $, $$, esc, icon, enhance, copyText, toast, navigate, pushLayer } from '../kit/shell.js';
import { parse, filenameFor } from './lib/qrlib.js';
import { cleanLink } from './lib/rules.js';
import { download, isCoarse } from './ui.js';

const SAMPLE_IMAGES = [['wifi-card-photo.jpg', 'Photo of a Wi-Fi card'], ['flyer-3-codes.png', 'Flyer with 3 codes']];

export function mount(ctx) {
  const { root, hooks } = ctx;
  ctx.renderHeader({ lede: 'Read QR codes from a photo, a screenshot or your camera.' });
  let worker = null, reqId = 0; const pending = new Map();
  function decode(imgData, mode = 'image', onProgress, onPartial) {
    if (!worker) {
      worker = new Worker(new URL('./lib/qr-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; if (e.data.progress) { p.prog?.(e.data.progress); return; } if (e.data.partial) { p.part?.(e.data); return; } pending.delete(e.data.id); p.res(e.data); };
    }
    const id = ++reqId;
    return new Promise((res) => { pending.set(id, { res, prog: onProgress, part: onPartial }); worker.postMessage({ id, data: imgData.data, width: imgData.width, height: imgData.height, mode }, [imgData.data.buffer]); });
  }
  const R = { file: null, img: null, codes: [] };

  function renderRead() {
    root.innerHTML = `
    <div class="qr-read">
      <div class="fw-intake qr-intake ${R.file ? 'fw-intake--slim' : ''}" data-intake data-accept="image/*" data-multiple="false" id="qr-intake">
        <div class="fw-intake__icon">${icon('scan-line', { size: R.file ? 18 : 24 })}</div>
        <div class="fw-intake__title"><span class="fw-pointer-copy">${R.file ? 'Read another image' : 'Drop or paste an image with a QR code'}</span><span class="fw-touch-copy">${R.file ? 'Read another photo' : 'Scan a QR code'}</span></div>
        <div class="fw-intake__actions">
          <button class="fw-btn ${isCoarse() ? '' : 'fw-btn--primary'}" type="button" data-pick>${icon('image')}<span class="fw-pointer-copy">Choose image</span><span class="fw-touch-copy">Choose photo</span></button>
          <button class="fw-btn ${isCoarse() ? 'fw-btn--primary fw-btn--lg' : ''}" type="button" id="qr-cam-btn">${icon('camera')}Camera</button>
        </div>
        ${R.file ? '' : `<div class="fw-intake__samples"><span class="fw-t-xs fw-faint">Try:</span>${SAMPLE_IMAGES.map(([f, l]) => `<button type="button" class="fw-chip fw-chip--sample" data-sample-img="./samples/${f}">${esc(l)}</button>`).join('')}</div>`}
      </div>
      <div class="qr-read__out" id="qr-out" ${R.file ? '' : 'hidden'}>
        <div class="qr-results" id="qr-results" aria-live="polite"></div>
        <figure class="qr-shot" id="qr-shot"><div class="qr-shot__wrap"><div class="qr-shot__inner"><canvas id="qr-shot-c"></canvas><svg class="qr-shot__ov" id="qr-ov" aria-hidden="true" preserveAspectRatio="none"></svg></div></div><figcaption class="fw-t-xs fw-muted" id="qr-shot-cap"></figcaption></figure>
      </div>
    </div>`;
    enhance(root);
    $('#qr-cam-btn').addEventListener('click', (e) => { e.stopPropagation(); openCamera(); });
    $$('[data-sample-img]', root).forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation(); const url = b.dataset.sampleImg; const blob = await (await fetch(url)).blob();
      readFile(new File([blob], url.split('/').pop(), { type: blob.type }));
    }));
    if (R.file) showResults();
  }
  hooks.onFiles = (files) => { const img = [...files].find((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name)); if (img) readFile(img); else toast('That isn’t an image. Choose a photo or screenshot of a QR code.', { type: 'warning' }); };

  async function readFile(file) {
    R.file = file; R.codes = []; R.ms = 0;
    renderRead();
    $('#qr-results').innerHTML = `<div class="qr-busy"><span class="fw-spinner"></span><span id="qr-busy-t">Looking for codes…</span></div>`;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch {
      $('#qr-results').innerHTML = `<div class="fw-alert fw-alert--danger"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body"><span><strong>${esc(file.name)} couldn’t be opened.</strong> Try a PNG or JPG screenshot.</span></div></div>`; return;
    }
    const max = 3200, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
    R.img = c; R.w = w; R.h = h; drawShot();
    const t0 = performance.now();
    const out = await decode(g.getImageData(0, 0, w, h), 'image', (p) => { const t = $('#qr-busy-t'); if (t) t.textContent = p; },
      (part) => { if (R.file !== file) return; R.codes = part.codes; R.ms = Math.round(performance.now() - t0); R.more = true; showResults(); });
    if (R.file !== file) return;
    const changed = out.codes.length !== R.codes.length;
    R.codes = out.codes; R.more = false; if (!R.ms || changed) R.ms = Math.round(performance.now() - t0);
    if (changed || !out.codes.length) showResults(); else $('#qr-more')?.remove();
  }
  function drawShot() {
    const c = $('#qr-shot-c'); if (!c || !R.img) return;
    c.width = R.w; c.height = R.h; c.getContext('2d').drawImage(R.img, 0, 0);
    const box = Math.max(200, $('#qr-shot').clientWidth - 26), k = Math.min(box / R.w, (isCoarse() ? 360 : 520) / R.h, 1);
    c.style.width = `${Math.round(R.w * k)}px`; c.style.height = `${Math.round(R.h * k)}px`;
    $('#qr-ov').setAttribute('viewBox', `0 0 ${R.w} ${R.h}`);
    $('#qr-shot-cap').textContent = `${R.file.name} · ${R.img.width} × ${R.img.height}`;
  }
  function showResults() {
    drawShot();
    const res = $('#qr-results'); if (!res) return;
    const sw = Math.max(3, R.w / 260);
    $('#qr-ov').innerHTML = R.codes.map((cd, i) => {
      const L = cd.location; const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => `${p.x},${p.y}`).join(' ');
      return `<polygon points="${pts}" class="qr-poly" style="stroke-width:${sw}"/>${R.codes.length > 1 ? `<g class="qr-num"><circle cx="${L.topLeftCorner.x}" cy="${L.topLeftCorner.y}" r="${sw * 5}"/><text x="${L.topLeftCorner.x}" y="${L.topLeftCorner.y}" font-size="${sw * 6}" dy=".35em">${i + 1}</text></g>` : ''}`;
    }).join('');
    if (!R.codes.length) {
      res.innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><strong>No QR code found in ${esc(R.file.name)}.</strong>
        <ul class="qr-tips"><li>Crop closer to the code, or take the photo straight on.</li><li>Keep the whole code and its white border in the picture.</li></ul></div></div>`;
      ctx.mbar.hide(); return;
    }
    res.innerHTML = `<div class="qr-found"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} Found ${R.codes.length} code${R.codes.length > 1 ? 's' : ''}</span>${R.more ? '<span class="fw-t-xs fw-muted qr-more" id="qr-more"><span class="fw-spinner"></span>Looking for more…</span>' : ''}</div>
      ${R.codes.map((cd, i) => resultCard(cd.data, { n: R.codes.length > 1 ? i + 1 : 0 })).join('')}`;
    enhance(res); bindCards(res, R.codes.map((c) => c.data));
    const first = R.codes[0].data;
    const a = ctx.mbar.set({ line: R.codes.length > 1 ? `${R.codes.length} codes found` : summary(first), sub: R.file.name, actions: `<button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = (e) => copyText(first, e.currentTarget);
  }
  const summary = (text) => { const p = parse(text); return p.type === 'wifi' ? `Wi-Fi “${p.ssid}”` : p.type === 'link' ? 'Link' : p.type === 'contact' ? p.name : p.type === 'event' ? p.title : 'Text'; };

  // ── typed result cards (image results and camera sheet) ──
  function resultCard(text, { n = 0, compact = false } = {}) {
    const p = parse(text); const num = n ? `<span class="rc-n">${n}</span>` : '';
    const head = (ic, label) => `<div class="rc-head">${num}<span class="rc-icon">${icon(ic, { size: 16 })}</span><span class="rc-type">${label}</span></div>`;
    const btn = (a, label, ic, primary) => `<button type="button" class="fw-btn ${primary ? 'fw-btn--primary' : ''} fw-btn--sm" data-act="${a}">${ic ? icon(ic) : ''}<span>${label}</span></button>`;
    const raw = compact ? '' : `<details class="rc-raw"><summary>Raw text</summary><pre class="fw-mono">${esc(text)}</pre></details>`;
    switch (p.type) {
      case 'wifi': return `<article class="rc fw-card" data-type="wifi">${head('wifi', 'Wi-Fi network')}
        <p class="rc-big">${esc(p.ssid)}</p><p class="rc-sub">${p.sec === 'nopass' ? 'Open network, no password' : p.sec === 'WEP' ? 'WEP' : 'WPA / WPA2 / WPA3'}${p.hidden ? ' · hidden' : ''}</p>
        ${p.sec !== 'nopass' ? `<div class="rc-pass"><span class="rc-pass__label">Password</span><span class="rc-pass__val fw-mono">${esc(p.pass)}</span></div>` : ''}
        <div class="rc-actions">${p.sec !== 'nopass' ? btn('copy-pass', 'Copy password', 'copy', true) : ''}${btn('copy-text', 'Copy text', 'copy')}${compact ? '' : btn('edit', 'Edit in generator', 'pencil') + btn('card', 'Print card', 'printer')}</div>${raw}</article>`;
      case 'link': {
        const c = cleanLink(p.url); const host = c.ok ? c.host.replace(/^www\./, '') : p.url;
        const warns = c.ok ? c.notes.filter((x) => x.kind === 'warn') : [];
        const web = /^https?:\/\//i.test(p.url);
        return `<article class="rc fw-card" data-type="link">${head('link', 'Link')}
          <p class="rc-big rc-host">${esc(host)}</p><p class="rc-sub fw-mono rc-url">${esc(p.url)}</p>
          ${warns.map((w) => `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('shield-alert')}</span><div class="fw-alert__body">${esc(w.text)}</div></div>`).join('')}
          ${c.ok && c.removedCount ? `<div class="rc-clean"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} ${c.removedCount} tracker${c.removedCount > 1 ? 's' : ''} can be removed</span><span class="fw-mono rc-clean__url">${esc(c.url)}</span></div>` : ''}
          <div class="rc-actions">${web ? `<a class="fw-btn fw-btn--primary fw-btn--sm" href="${esc(c.ok ? c.url : p.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}<span>Open${c.ok && c.removedCount ? ' clean link' : ''}</span></a>` : ''}${btn('copy-text', 'Copy', 'copy')}${c.ok && c.removedCount && !compact ? `<a class="fw-btn fw-btn--ghost fw-btn--sm" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original</a>` : ''}</div></article>`;
      }
      case 'contact': return `<article class="rc fw-card" data-type="contact">${head('contact', 'Contact')}
        <p class="rc-big">${esc(p.name)}</p>${p.org || p.title ? `<p class="rc-sub">${esc([p.title, p.org].filter(Boolean).join(' · '))}</p>` : ''}
        <dl class="rc-kv">${p.tel ? `<dt>Phone</dt><dd class="fw-mono">${esc(p.tel)}</dd>` : ''}${p.email ? `<dt>Email</dt><dd>${esc(p.email)}</dd>` : ''}${p.web ? `<dt>Web</dt><dd class="fw-mono">${esc(p.web)}</dd>` : ''}</dl>
        <div class="rc-actions">${btn('vcf', 'Save contact (.vcf)', 'download', true)}${btn('copy-text', 'Copy text', 'copy')}</div>${raw}</article>`;
      case 'event': {
        const fmt = (d) => (d ? d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
        return `<article class="rc fw-card" data-type="event">${head('calendar', 'Event')}
        <p class="rc-big">${esc(p.title)}</p><p class="rc-sub">${esc(fmt(p.start))}${p.end ? ' – ' + esc(p.end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : ''}${p.where ? ' · ' + esc(p.where) : ''}</p>
        ${p.desc ? `<p class="rc-text">${esc(p.desc)}</p>` : ''}
        <div class="rc-actions">${btn('ics', 'Add to calendar (.ics)', 'calendar', true)}${btn('copy-text', 'Copy text', 'copy')}</div>${raw}</article>`;
      }
      case 'email': return `<article class="rc fw-card" data-type="email">${head('mail', 'Email')}<p class="rc-big">${esc(p.to)}</p>${p.subject ? `<p class="rc-sub">${esc(p.subject)}</p>` : ''}<div class="rc-actions"><a class="fw-btn fw-btn--primary fw-btn--sm" href="${esc(text)}">${icon('send')}<span>Write email</span></a>${btn('copy-text', 'Copy', 'copy')}</div>${raw}</article>`;
      case 'sms': return `<article class="rc fw-card" data-type="sms">${head('message-square', 'Text message')}<p class="rc-big fw-mono">${esc(p.tel)}</p>${p.body ? `<p class="rc-sub">${esc(p.body)}</p>` : ''}<div class="rc-actions"><a class="fw-btn fw-btn--primary fw-btn--sm" href="sms:${esc(p.tel)}${p.body ? '?body=' + encodeURIComponent(p.body) : ''}">${icon('send')}<span>Send SMS</span></a>${btn('copy-text', 'Copy', 'copy')}</div>${raw}</article>`;
      default: return `<article class="rc fw-card" data-type="text">${head('type', 'Text')}<p class="rc-text">${esc(text)}</p><div class="rc-actions">${btn('copy-text', 'Copy', 'copy', true)}</div></article>`;
    }
  }
  function bindCards(rootEl, texts) {
    $$('.rc', rootEl).forEach((card, i) => {
      const text = texts[i]; const p = parse(text);
      card.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const a = b.dataset.act;
        if (a === 'copy-pass') copyText(p.pass, b);
        if (a === 'copy-text') copyText(text, b);
        if (a === 'vcf') download(new Blob([text.replace(/\r?\n/g, '\r\n')], { type: 'text/vcard' }), `${filenameFor('contact', { first: p.name })}.vcf`);
        if (a === 'ics') download(new Blob([p.raw.replace(/\r?\n/g, '\r\n')], { type: 'text/calendar' }), `${filenameFor('event', { title: p.title })}.ics`);
        if (a === 'edit') navigate('qr-generator', { query: { q: text } });
        if (a === 'card') navigate('qr-generator', { query: { q: text, card: '1' } });
      });
    });
  }

  // ── camera: full-screen viewfinder, outline, result sheet (keeps scanning) ──
  let cam = null;
  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { toast('This browser has no camera access. Choose a photo instead.', { type: 'warning' }); return; }
    const el = document.createElement('div'); el.className = 'qr-cam'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Scan with camera');
    el.innerHTML = `<video class="qr-cam__video" playsinline muted autoplay></video>
      <svg class="qr-cam__ov" aria-hidden="true"><polygon class="qr-cam__poly" points=""/></svg>
      <div class="qr-cam__frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="qr-cam__top">
        <button class="qr-cam__btn" type="button" data-cam="close" aria-label="Stop camera">${icon('x', { size: 22 })}</button>
        <span class="qr-cam__title">Point at a QR code</span>
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
      if (a === 'photo') { closeCamera(); const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => i.files[0] && readFile(i.files[0]); i.click(); }
      if (a === 'flip') { cam.facing = cam.facing === 'environment' ? 'user' : 'environment'; start(); }
      if (a === 'torch') { const t = cam.stream?.getVideoTracks()[0]; const caps = t?.getCapabilities?.() || {}; if (!caps.torch) { toast('This camera has no flashlight', { type: 'info' }); return; } const on = b.getAttribute('aria-pressed') !== 'true'; t.applyConstraints({ advanced: [{ torch: on }] }); b.setAttribute('aria-pressed', String(on)); }
    });
    $('.qr-cam__sheet', el).addEventListener('click', (e) => { if (e.target.closest('.qr-cam__grab')) el.classList.toggle('sheet-min'); });
    async function start() {
      cam.stream?.getTracks().forEach((t) => t.stop());
      const st = $('[data-status]', el);
      try { cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cam.facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }); }
      catch {
        st.textContent = 'Camera not available';
        $('.qr-cam__res', el).innerHTML = `<div class="rc"><p class="rc-big">Allow the camera to scan</p><p class="rc-sub">Or read the code from a photo instead.</p><div class="rc-actions"><button class="fw-btn fw-btn--primary" type="button" data-cam="photo">${icon('image')}Choose photo</button></div></div>`;
        el.classList.add('has-sheet'); return;
      }
      const v = $('video', el); v.srcObject = cam.stream; await v.play().catch(() => {});
      st.textContent = 'Looking for a code…'; loop();
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
          if (cd) { outline(cd.location, k, v); if (cd.data !== cam.found) { cam.found = cd.data; hit(cd.data); } } else el.classList.remove('has-hit');
        });
      }
      cam.raf = requestAnimationFrame(loop);
    }
    let fadeT = 0;
    function outline(L, k, v) {
      const W = el.clientWidth, H = el.clientHeight, s = Math.max(W / v.videoWidth, H / v.videoHeight), ox = (W - v.videoWidth * s) / 2, oy = (H - v.videoHeight * s) / 2;
      const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => `${(p.x / k) * s + ox},${(p.y / k) * s + oy}`).join(' ');
      $('.qr-cam__ov', el).setAttribute('viewBox', `0 0 ${W} ${H}`);
      $('.qr-cam__poly', el).setAttribute('points', pts); el.classList.add('has-hit'); clearTimeout(fadeT); fadeT = setTimeout(() => el.classList.remove('has-hit'), 700);
    }
    function hit(text) {
      navigator.vibrate?.(30);
      $('[data-status]', el).textContent = summary(text);
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
  ctx.shell.setCommands?.([{ id: 'qr-cam', label: 'Scan with camera', icon: 'camera', run: openCamera }]);
  renderRead();
}
