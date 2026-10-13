// Convert mockup · Image Converter (today's "Images" tab). Drop → every file converts right away with the shown target;
// More options = size, quality, max KB, transparency fill, keep photo info. Per file: format, size, compare, remove.
import { frame, renderRelated, pickFormat, targetBtn, moreBtn, clearBtn, moreOptions, field, select, toggle, Queue, HumanError, describeBroken,
  stickyBar, stickyHtml, intakeHtml, slimIntakeHtml, base, plural, icon, esc, h, $, $$, store, toast, enhance, formatBytes,
  openMenu, openDialog, openPopover, A } from './common.js';

const FORMATS = [
  { label: 'Everyday', items: [['jpg', 'JPG', 'Opens everywhere, small files'], ['png', 'PNG', 'Lossless, keeps transparency'], ['webp', 'WebP', 'Smaller than JPG, keeps transparency']] },
  { label: 'Smaller, newer apps', items: [['avif', 'AVIF', 'Smallest files'], ['jxl', 'JPEG XL', 'Sharp and small, few apps yet']] },
  { label: 'Special', items: [['gif', 'GIF', '256 colours, very old apps'], ['bmp', 'BMP', 'Uncompressed, legacy apps'], ['tiff', 'TIFF', 'Print and archive'], ['ico', 'ICO', 'Website icon, up to 256 px']] },
];
const NAME = Object.fromEntries(FORMATS.flatMap((g) => g.items.map(([id, n]) => [id, n])));
const EXT = { jpg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', jxl: 'jxl', gif: 'gif', bmp: 'bmp', tiff: 'tiff', ico: 'ico' };
const LOSSY = new Set(['jpg', 'webp', 'avif', 'jxl']); const MAXKB = new Set(['jpg', 'webp', 'avif']); const FILLS = new Set(['jpg', 'gif', 'bmp']);
const ACCEPT = '.jpg,.jpeg,.png,.webp,.avif,.bmp,.gif,.heic,.heif,.tif,.tiff,.ico,.jxl,.svg,image/*';
const SIZE_MODES = [['original', 'Original size'], ['long', 'Longest side'], ['width', 'Width'], ['height', 'Height'], ['percent', 'Percent'], ['fit', 'Fit in box']];
const PRESETS_PX = { long: [3840, 2560, 1920, 1280, 800], width: [3840, 2560, 1920, 1280, 800], height: [2160, 1440, 1080, 720, 600], percent: [75, 50, 33, 25] };
const DEF = { mode: 'original', value: 1920, boxW: 1920, boxH: 1080, noEnlarge: true, quality: 85, maxKB: '', matte: '#ffffff', keepMeta: false };

export function init(ctx) {
  const o = { ...DEF, ...(store.get('cv-img-opts') || {}) };
  let target = ctx.preset?.to || store.get('cv-target-images') || 'jpg';
  let picked = !!(ctx.preset || store.get('cv-target-images'));
  let hint = '';
  const saveOpts = () => store.set('cv-img-opts', o);

  $('#cv-tool').innerHTML = `
    <div class="cv-bar"><span class="cv-bar__label"><span class="xs-hide">Convert to</span><span class="xs-show">To</span></span>${targetBtn('cv-target', NAME[target])}<span class="cv-bar__hint" id="cv-hint"></span>
      ${moreBtn()}<span class="fw-spacer"></span>${clearBtn()}</div>
    <div class="cv-opts" id="cv-opts" hidden></div>
    <div id="cv-intake">${intakeHtml({ icon: 'image', title: ctx.preset ? `Drop ${ctx.preset.noun} here` : 'Drop images here', touch: ctx.preset ? `Choose ${ctx.preset.noun}` : 'Choose images',
      sub: ctx.preset ? 'Any image works' : 'HEIC, JPG, PNG, WebP, AVIF, TIFF, GIF, BMP, ICO, JPEG XL', accept: ACCEPT,
      samples: ctx.preset?.id === 'heic-to-jpg' ? sampleSpec(true) : sampleSpec(false) })}</div>
    <div class="fw-items cv-items" id="cv-items" aria-label="Images" hidden></div>
    <div id="cv-add" hidden>${slimIntakeHtml('Add more images', ACCEPT)}</div>`;
  $('#main').insertAdjacentHTML('beforeend', stickyHtml());
  frame(ctx, { accept: ['image'], onFiles: (f) => add(f), lede: ctx.preset ? `Convert ${ctx.preset.noun} to ${NAME[ctx.preset.to]}. Any image works.` : undefined,
    commands: [{ id: 'dl', label: 'Download all converted images', icon: 'download', kbd: 'mod+s', run: () => $('#ab-primary').click() }, { id: 'opts', label: 'More options', icon: 'sliders-horizontal', run: () => more.open() }] });
  enhance($('#cv-tool'));
  renderRelated(ctx);

  // ── worker pool (real decode/encode) ──
  const workers = Array.from({ length: 3 }, () => new Worker(new URL('./worker.js', import.meta.url)));
  const pending = new Map(); let jobSeq = 0; let wNext = 0;
  workers.forEach((w) => (w.onmessage = (e) => { const p = pending.get(e.data.id); pending.delete(e.data.id); e.data.ok ? p.res(e.data) : p.rej(new Error(e.data.error)); }));
  const job = (op, file, opts) => new Promise((res, rej) => { const id = ++jobSeq; pending.set(id, { res, rej }); workers[wNext++ % workers.length].postMessage({ id, op, file, opts }); });

  const q = new Queue({
    list: $('#cv-items'), parallel: 3, prepare: (it) => (it.probed = probe(it)),
    thumb: (it) => (it.thumbUrl ? `<img alt="" src="${it.thumbUrl}">` : it.status === 'error' ? icon('file-question', { size: 20 }) : '<span class="fw-skel cv-skel"></span>'),
    meta: (it) => {
      const t = it.target || target; const parts = [`<span>${formatBytes(it.size)}</span>`];
      if (it.dims) { const s = outSize(it); parts.push(`<span class="fw-num">${it.dims.w} × ${it.dims.h}${s && (s.w !== it.dims.w || s.h !== it.dims.h) ? ` → ${s.w} × ${s.h}` : ''}</span>`); }
      if (it.status !== 'error') parts.push(`<span class="${it.target ? 'cv-own' : ''}">${esc(it.ext.toUpperCase())} → ${esc(NAME[t])}${it.target ? ' <span class="fw-faint">(this file)</span>' : ''}</span>`);
      return parts.join('<span aria-hidden="true">·</span>');
    },
    menu: (it, btn) => openMenu(btn, [
      it.status === 'done' && { label: 'Compare before and after', icon: 'git-compare', onSelect: () => compare(it) },
      { label: 'Format for this file…', icon: 'shuffle', onSelect: () => pickFormat(btn, { groups: FORMATS, current: it.target || target, onPick: (f) => { it.target = f === target ? null : f; q.requeue(it); } }) },
      it.dims && { label: 'Size for this file…', icon: 'scaling', onSelect: () => sizeFor(it, btn) },
      { label: 'Remove', icon: 'trash-2', onSelect: () => q.remove(it) },
    ].filter(Boolean), { placement: 'bottom-end' }),
    work: async (it, { progress, alive }) => {
      await it.probed;
      if (it.bad) throw it.bad;
      const fmt = it.target || target; const s = outSize(it);
      const est = 250 + (s.w * s.h) / 22000; const t0 = performance.now();
      const timer = setInterval(() => progress(Math.min(92, ((performance.now() - t0) / est) * 92)), 60);
      try {
        const maxBytes = MAXKB.has(fmt) && +o.maxKB > 0 ? +o.maxKB * 1024 : 0;
        const r = await job('encode', it.file, { fmt, quality: LOSSY.has(fmt) ? o.quality : 100, w: s.w, h: s.h, matte: o.matte, maxBytes });
        if (!alive()) return null;
        const resized = s.w !== it.dims.w || s.h !== it.dims.h;
        const name = `${base(it.name)}${resized ? `-${r.w}x${r.h}` : ''}.${EXT[fmt]}`;
        const notes = [];
        if (it.alpha && FILLS.has(fmt)) notes.push(`${NAME[fmt]} has no transparency: see-through areas were filled with ${o.matte === '#ffffff' ? 'white' : o.matte}.`);
        if (maxBytes && !r.reached) notes.push(`Couldn't get under ${o.maxKB} KB even at the lowest quality.`);
        else if (maxBytes) notes.push(`Quality ${r.q} keeps it under ${o.maxKB} KB.`);
        return { blob: new Blob([r.blob], { type: r.blob.type }), name, note: notes.join(' ') };
      } finally { clearInterval(timer); }
    },
    onChange: () => paint(),
    onProgress: () => paintBar(),
  });
  const paintBar = stickyBar(q, { noun: ['image', 'images'], zipStem: (done) => (done.length > 1 ? `${base(done[0].name)}-and-${done.length - 1}-more` : base(done[0].name)) });

  function sampleSpec(heicOnly) {
    const photos = ['IMG_4031', 'IMG_4032', 'IMG_4033', 'IMG_4034', 'IMG_4036'].map((n) => `${A}${n}.jpg>${n}.HEIC`);
    return (heicOnly ? [...photos, `${A}IMG_4037.HEIC`] : [...photos.slice(0, 4), `${A}kestrel-logo.png`, `${A}IMG_4037.HEIC`]).join('|');
  }

  function add(files) {
    const imgs = files.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|bmp|gif|heic|heif|tiff?|ico|jxl|svg)$/i.test(f.name));
    if (imgs.length < files.length) toast(`${plural(files.length - imgs.length, 'file isn’t an image', 'files aren’t images')} · skipped`, { type: 'warning' });
    if (!imgs.length) return;
    if (!picked && !q.items.length) smartDefault(imgs);
    q.add(imgs);
    $('#cv-intake').hidden = true; $('#cv-items').hidden = false; $('#cv-add').hidden = false;
  }
  function smartDefault(files) {
    const exts = files.map((f) => f.name.split('.').pop().toLowerCase());
    const next = exts.every((e) => e === 'png') ? ['webp', 'keeps transparency, smaller'] : exts.every((e) => e === 'jpg' || e === 'jpeg') ? ['webp', 'about 30 % smaller than JPG'] : ['jpg', ''];
    target = next[0]; hint = next[1] ? `suggested · ${next[1]}` : ''; paintTarget();
  }
  async function probe(it) {
    try {
      const r = await job('probe', it.file);
      it.dims = { w: r.w, h: r.h }; it.alpha = r.alpha; it.thumbUrl = URL.createObjectURL(r.thumb); it.preview = r.preview;
    } catch {
      const heicReal = /^hei[cf]$/.test(it.ext) && it.size > 1024;
      it.bad = new HumanError(heicReal ? 'This mockup can’t decode real HEIC files yet (the real build ships a HEIC decoder). Try the sample photos.' : await describeBroken(it.file, 'an image'),
        { short: "Can't read", detail: `${it.name} · ${it.size} bytes · createImageBitmap failed` });
    }
    q.render(it);
  }
  function outSize(it, opt = o) {
    if (!it.dims) return null;
    if (it.size2) return it.size2;
    const { w, h } = it.dims; let k = 1;
    if (opt.mode === 'long') k = opt.value / Math.max(w, h);
    else if (opt.mode === 'width') k = opt.value / w;
    else if (opt.mode === 'height') k = opt.value / h;
    else if (opt.mode === 'percent') k = opt.value / 100;
    else if (opt.mode === 'fit') k = Math.min(opt.boxW / w, opt.boxH / h);
    if (!(k > 0)) k = 1;
    if (opt.noEnlarge) k = Math.min(1, k);
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  // ── target chip, hint, clear ──
  function paintTarget() { $('#cv-target [data-l]').textContent = NAME[target]; $('#cv-hint').textContent = hint; more.refresh(); }
  $('#cv-target').onclick = (e) => pickFormat(e.currentTarget, { groups: FORMATS, current: target, onPick: (f) => {
    if (f === target) return; target = f; picked = true; hint = ''; store.set('cv-target-images', f); paintTarget();
    q.items.forEach((it) => { if (!it.target) q.requeue(it); });
  } });
  $('#cv-clear').onclick = () => q.clear();
  function paint() {
    const n = q.items.length;
    $('#cv-clear').hidden = !n;
    if (!n) { $('#cv-intake').hidden = false; $('#cv-items').hidden = true; $('#cv-add').hidden = true; }
    paintBar();
  }

  // ── More options ──
  let rerun = 0;
  const changed = () => { saveOpts(); more.paint(); clearTimeout(rerun); rerun = setTimeout(() => q.items.forEach((it) => it.status !== 'error' && q.requeue(it)), 260); };
  const more = moreOptions({
    button: $('.cv-more'), panel: $('#cv-opts'),
    summary: () => {
      const s = [];
      if (o.mode === 'percent') s.push(`${o.value} %`); else if (o.mode === 'fit') s.push(`fit ${o.boxW}×${o.boxH}`); else if (o.mode !== 'original') s.push(`${o.mode === 'long' ? '' : o.mode + ' '}${o.value} px`);
      if (LOSSY.has(target) && o.quality !== 85) s.push(`quality ${o.quality}`);
      if (MAXKB.has(target) && +o.maxKB > 0) s.push(`≤ ${o.maxKB} KB`);
      if (FILLS.has(target) && o.matte !== '#ffffff') s.push(`fill ${o.matte}`);
      if (target === 'jpg' && o.keepMeta) s.push('photo info kept');
      return s.join(' · ');
    },
    render: (p) => {
      const unit = o.mode === 'percent' ? '%' : 'px';
      p.innerHTML = `<div class="cv-opts__grid">
        <div class="cv-opts__group"><span class="cv-opts__h">Size</span>
          <div class="cv-row">${select('o-mode', SIZE_MODES, o.mode)}
            ${o.mode === 'fit' ? `<span class="cv-inline"><input class="fw-input fw-num cv-num" id="o-bw" type="number" min="1" inputmode="numeric" value="${o.boxW}" aria-label="Box width"><span class="fw-faint">×</span><input class="fw-input fw-num cv-num" id="o-bh" type="number" min="1" inputmode="numeric" value="${o.boxH}" aria-label="Box height"><span class="fw-faint">px</span></span>`
              : o.mode !== 'original' ? `<span class="cv-inline"><input class="fw-input fw-num cv-num" id="o-val" type="number" min="1" inputmode="numeric" value="${o.value}" aria-label="${o.mode === 'percent' ? 'Percent' : 'Pixels'}"><span class="fw-faint">${unit}</span></span>` : ''}</div>
          ${PRESETS_PX[o.mode] ? `<div class="fw-chips cv-presets" role="group" aria-label="Common sizes">${PRESETS_PX[o.mode].map((v) => `<button class="fw-chip" type="button" data-v="${v}" aria-pressed="${+o.value === v}">${v}${o.mode === 'percent' ? ' %' : ''}</button>`).join('')}</div>` : ''}
          ${o.mode !== 'original' ? toggle('o-noenl', 'Don’t enlarge smaller images', o.noEnlarge) : ''}</div>
        ${LOSSY.has(target) ? `<div class="cv-opts__group"><div class="fw-slider"><label class="fw-slider__label" for="o-q">Quality</label><output class="fw-slider__value" for="o-q">${o.quality}</output><input type="range" id="o-q" min="1" max="100" value="${o.quality}"></div>
          ${MAXKB.has(target) ? field('Max file size', `<span class="cv-inline"><input class="fw-input fw-num cv-num" id="o-max" type="number" min="1" inputmode="numeric" placeholder="Off" value="${esc(o.maxKB)}"><span class="fw-faint">KB</span></span>`, { id: 'o-max', hint: 'Picks the best quality that fits. Overrides Quality.' }) : ''}</div>`
          : `<div class="cv-opts__group"><span class="cv-opts__h">Quality</span><span class="fw-muted cv-opts__note">${NAME[target]} is ${target === 'png' || target === 'tiff' || target === 'bmp' ? 'lossless' : 'fixed quality'}, nothing to set.</span></div>`}
        <div class="cv-opts__group">
          ${FILLS.has(target) ? field('Fill transparent areas with', `<span class="cv-inline"><input type="color" class="cv-color" id="o-matte" value="${o.matte}" aria-label="Fill colour"><span class="fw-mono fw-muted" id="o-matte-v">${o.matte}</span></span>`, { hint: `${NAME[target]} can’t store transparency.` }) : ''}
          ${target === 'jpg' ? toggle('o-meta', 'Keep photo info', o.keepMeta, 'Camera, date and colour profile (EXIF, ICC). Rotation is applied.') : ''}
          ${!FILLS.has(target) && target !== 'jpg' ? `<span class="fw-muted cv-opts__note">Transparency is kept in ${NAME[target]}.</span>` : ''}</div></div>`;
      const on = (id, ev, fn) => p.querySelector('#' + id)?.addEventListener(ev, fn);
      on('o-mode', 'change', (e) => { o.mode = e.target.value; o.value = o.mode === 'percent' ? 50 : o.mode === 'height' ? 1080 : 1920; more.refresh(); changed(); });
      on('o-val', 'input', (e) => { o.value = +e.target.value || o.value; changed(); p.querySelectorAll('.cv-presets .fw-chip').forEach((c) => c.setAttribute('aria-pressed', String(+c.dataset.v === +o.value))); });
      on('o-bw', 'input', (e) => { o.boxW = +e.target.value || o.boxW; changed(); });
      on('o-bh', 'input', (e) => { o.boxH = +e.target.value || o.boxH; changed(); });
      p.querySelectorAll('.cv-presets .fw-chip').forEach((c) => (c.onclick = () => { o.value = +c.dataset.v; more.refresh(); changed(); }));
      on('o-noenl', 'change', (e) => { o.noEnlarge = e.target.checked; changed(); });
      on('o-q', 'input', (e) => { o.quality = +e.target.value; more.paint(); });
      on('o-q', 'change', () => changed());
      on('o-max', 'input', (e) => { o.maxKB = e.target.value; changed(); });
      on('o-matte', 'input', (e) => { o.matte = e.target.value; p.querySelector('#o-matte-v').textContent = o.matte; changed(); });
      on('o-meta', 'change', (e) => { o.keepMeta = e.target.checked; changed(); });
    },
  });

  // ── per-file size (today's per-row W × H, aspect kept) ──
  function sizeFor(it, anchor) {
    const s = outSize(it);
    const el = h(`<div class="cv-sizepop"><div class="cv-sizepop__h">Size for ${esc(it.name)}</div>
      <div class="cv-inline"><input class="fw-input fw-num cv-num" type="number" min="1" value="${s.w}" aria-label="Width" data-k="w"><span class="fw-faint">×</span><input class="fw-input fw-num cv-num" type="number" min="1" value="${s.h}" aria-label="Height" data-k="h"><span class="fw-faint">px</span></div>
      <label class="fw-check cv-check"><input type="checkbox" checked data-lock> Keep proportions</label>
      <div class="cv-sizepop__foot"><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-reset>Use batch size</button><button class="fw-btn fw-btn--primary fw-btn--sm" type="button" data-ok>Apply</button></div></div>`);
    const p = openPopover(anchor, el, { placement: 'bottom-end', label: 'Size for this file' });
    const [iw, ih] = el.querySelectorAll('input[type=number]'); const lock = el.querySelector('[data-lock]'); const r = it.dims.h / it.dims.w;
    iw.oninput = () => { if (lock.checked) ih.value = Math.max(1, Math.round(+iw.value * r)); };
    ih.oninput = () => { if (lock.checked) iw.value = Math.max(1, Math.round(+ih.value / r)); };
    el.querySelector('[data-ok]').onclick = () => { it.size2 = { w: +iw.value || s.w, h: +ih.value || s.h }; p.close(); q.requeue(it); };
    el.querySelector('[data-reset]').onclick = () => { it.size2 = null; p.close(); q.requeue(it); };
  }

  // ── before / after compare (today's Before/After thumbnails, larger) ──
  function compare(it) {
    const pct = Math.round((1 - it.out.blob.size / it.size) * 100);
    const body = h(`<div class="cv-cmp-wrap"><div class="cv-cmp ${it.alpha ? 'cv-cmp--alpha' : ''}" style="--pos:50%">
      <img class="cv-cmp__img cv-cmp__a" alt="Before: ${esc(it.name)}" src="${URL.createObjectURL(it.preview || it.file)}">
      <img class="cv-cmp__img cv-cmp__b" alt="After: ${esc(it.out.name)}" src="${URL.createObjectURL(it.out.blob)}">
      <div class="cv-cmp__line" aria-hidden="true"></div>
      <div class="cv-cmp__handle" role="slider" tabindex="0" aria-label="Before and after divider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${icon('chevrons-up-down', { size: 16 })}</div>
      <span class="cv-cmp__tag cv-cmp__tag--a">Before · ${esc(it.ext.toUpperCase())} · ${formatBytes(it.size)}</span>
      <span class="cv-cmp__tag cv-cmp__tag--b">After · ${esc(NAME[it.target || target])} · ${formatBytes(it.out.blob.size)}</span></div>
      <p class="cv-cmp__verdict">${pct > 0 ? `${icon('circle-check', { size: 16 })}<span><b>−${pct} %</b> smaller</span>` : `${icon('info', { size: 16 })}<span><b>+${-pct} %</b> larger: ${esc(NAME[it.target || target])} stores more detail than the original</span>`}</p></div>`);
    openDialog({ title: `Compare · ${it.name}`, body, size: 960, className: 'cv-cmp-dialog', actions: [{ label: 'Close', ghost: true }, { label: 'Download', primary: true, onClick: () => $(`.cv-item[data-id="${it.id}"] [data-act="dl"]`)?.click() }] });
    const box = body.querySelector('.cv-cmp'); const hd = body.querySelector('.cv-cmp__handle');
    const set = (v) => { v = Math.max(0, Math.min(100, v)); box.style.setProperty('--pos', v + '%'); hd.setAttribute('aria-valuenow', Math.round(v)); };
    const fromX = (x) => { const r = box.getBoundingClientRect(); set(((x - r.left) / r.width) * 100); };
    box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); fromX(e.clientX); box.onpointermove = (ev) => fromX(ev.clientX); });
    box.addEventListener('pointerup', () => (box.onpointermove = null));
    hd.addEventListener('keydown', (e) => { const v = +hd.getAttribute('aria-valuenow'); if (e.key === 'ArrowLeft') { e.preventDefault(); set(v - (e.shiftKey ? 10 : 2)); } if (e.key === 'ArrowRight') { e.preventDefault(); set(v + (e.shiftKey ? 10 : 2)); } });
  }

  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('#cv-ab').hidden) { e.preventDefault(); $('#ab-primary').click(); } });
  paint();
}
