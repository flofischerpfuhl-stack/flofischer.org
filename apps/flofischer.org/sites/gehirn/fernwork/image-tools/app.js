// Fernwork One · Images · "Lightbox" workspace (archetype A · Workbench).
// One stage, a filmstrip of every open photo, one panel with modes Edit · Markup · Inspect · Export,
// a non-destructive recipe (History), a live export bar with a real size estimate and a Photos-style phone layout.
import './icons-extra.js';
import { mountShell, icon, esc, $, $$, h, enhance, formatBytes, toast, openSheet, openMenu, openDialog, kbd, loadSamples, isMobile, isTyping, pushLayer, store, hasLayers, roving, hrefFor } from '../kit/shell.js';
import * as E from './engine.js';

// ───────────────────────── constants ─────────────────────────
export const PHOTOS = ['IMG_4101.jpg', 'IMG_4102.jpg', 'IMG_4103.HEIC', 'IMG_4104.jpg', 'IMG_4105.jpg', 'IMG_4106.jpg', 'cafe-croissant.jpg', 'IMG_4108.jpg', 'dog-in-the-park.jpg', 'IMG_4110.jpg', 'Sommerurlaub 2026 – Steg am Morgen (Kopie 3).jpg'];
const spec = (names) => names.map((n) => `./photos/${n}>${n}`).join('|');
const CUTOUTS = { 'dog-in-the-park.jpg': 'assets/dog-in-the-park.cutout.png', 'IMG_4110.jpg': 'assets/IMG_4110.cutout.png' };
const MODES = [{ id: 'edit', label: 'Edit', leaf: 'image-edit', icon: 'sliders-horizontal' }, { id: 'markup', label: 'Markup', leaf: 'image-markup', icon: 'pencil' },
  { id: 'inspect', label: 'Inspect', leaf: 'image-inspect', icon: 'scan' }, { id: 'export', label: 'Export', leaf: 'image-export', icon: 'download' }];
const LEAF_INIT = { 'image-edit': { mode: 'edit' }, 'image-markup': { mode: 'markup' }, 'image-inspect': { mode: 'inspect' }, 'image-export': { mode: 'export' },
  'compress-image': { mode: 'export', preset: 'web' }, 'resize-image': { mode: 'export', preset: 'web' }, 'crop-image': { mode: 'edit', crop: true },
  'remove-background': { mode: 'edit', bg: true }, 'image-metadata': { mode: 'inspect' }, 'image-ocr': { mode: 'inspect', ocr: true }, 'blur-image': { mode: 'markup', tool: 'blur' } };
const FMT = { original: 'Original', jpeg: 'JPEG', webp: 'WebP', avif: 'AVIF', png: 'PNG' };
const EXT = { jpeg: 'jpg', webp: 'webp', avif: 'avif', png: 'png' };
const FMT_HINT = { original: 'Keeps the original file when nothing changed — zero loss.', jpeg: 'Opens everywhere. No transparency.', webp: 'About 30 % smaller than JPEG at the same look. Keeps transparency.',
  avif: 'Smallest files, slower to save. Supported by all current browsers.', png: 'Lossless and keeps transparency. Big for photos.' };
const PRESETS = [
  { id: 'web', label: 'Web 1920', icon: 'globe', set: { format: 'webp', quality: 80, size: 'longest', longest: 1920, max: false, box: null }, suffix: 'web' },
  { id: 'email', label: 'Email 1280', icon: 'file-text', set: { format: 'jpeg', quality: 82, size: 'longest', longest: 1280, max: false, box: null }, suffix: 'email' },
  { id: 'insta', label: 'Instagram 4:5', icon: 'image', set: { format: 'jpeg', quality: 90, size: 'original', max: false, box: { w: 1080, h: 1350, fit: 'crop' } }, suffix: 'instagram' },
  { id: 'shop', label: 'Shop · white 2000', icon: 'package', set: { format: 'jpeg', quality: 90, size: 'original', max: false, box: { w: 2000, h: 2000, fit: 'pad', bg: '#ffffff' } }, suffix: 'shop' },
  { id: 'favicon', label: 'Favicon pack', icon: 'globe', set: {}, suffix: 'favicon' },
  { id: 'max500', label: 'Max 500 kB', icon: 'shrink', set: { max: true, maxKB: 500 }, suffix: 'small' },
];
const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#111111'];
const SIZES = { s: 0.005, m: 0.009, l: 0.016 }, TSIZES = { s: 0.045, m: 0.07, l: 0.1 };
const TOOLS = [{ id: 'pen', label: 'Pen', icon: 'pencil', key: 'b' }, { id: 'arrow', label: 'Arrow', icon: 'move-up-right', key: 'a' }, { id: 'rect', label: 'Box', icon: 'square', key: 'u' },
  { id: 'text', label: 'Text', icon: 'type', key: 't' }, { id: 'blur', label: 'Blur', icon: 'grid-3x3', key: 'r' }];
const ASPECTS = [{ id: 'free', label: 'Free' }, { id: 'original', label: 'Original' }, { id: '1:1', label: 'Square', r: 1 }, { id: '4:5', label: '4:5', r: 4 / 5 }, { id: '3:2', label: '3:2', r: 3 / 2 }, { id: '16:9', label: '16:9', r: 16 / 9 }];
const FILL_LABEL = { transparent: 'Transparent', white: 'White', color: 'Color', blur: 'Blur' };

// ───────────────────────── state ─────────────────────────
const params = new URLSearchParams(location.search);
const leafId = LEAF_INIT[params.get('leaf')] ? params.get('leaf') : 'image-edit';
const init = LEAF_INIT[leafId];
const S = {
  docs: [], failed: [], active: -1, mode: init.mode, zoom: 'fit', pan: { x: 0, y: 0 }, compare: false, split: 0.5, splitOn: true,
  tool: init.tool || 'pen', color: '#ef4444', size: 'm', cropping: null, refine: null, panel: true, view: null,
  exp: { preset: null, format: 'webp', quality: 80, max: false, maxKB: 500, size: 'original', longest: 1920, box: null, meta: 'location', scope: 'this', name: '' },
  est: null, estGen: 0, estPending: false, batch: null, bgJob: null, mtab: 'adjust', mparam: 'light', colorFmt: 'hex', opened: null, fav: null,
  modelReady: store.get('img-model') === true && !params.has('fresh'), ocrReady: false, space: false, init,
};
if (init.preset) Object.assign(S.exp, PRESETS.find((p) => p.id === init.preset).set, { preset: init.preset });
let uid = 0;
const doc = () => S.docs[S.active] && !S.docs[S.active].loading ? S.docs[S.active] : null;
const ready = () => S.docs.filter((d) => !d.loading);
const sel = () => ready().filter((d) => d.sel);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stage = $('#stage'), view = $('#view'), cv = $('#cv'), cvOld = $('#cv-old'), after = $('#after'), wb = $('#wb');

mountShell({
  leaf: leafId, archetype: 'workbench', accept: ['image'], acceptLabel: 'Images', onFiles: (f, o) => openFiles(f, o),
  shortcuts: [{ label: 'Compare with original (hold)', keys: '\\' }, { label: 'Previous / next photo', keys: '← →' }, { label: 'Save image', keys: 'mod+s' },
    { label: 'Arrow · Blur area (Markup)', keys: 'a r' }, { label: 'Toggle panel', keys: 'mod+.' }, { label: 'Fit · 100 %', keys: 'mod+0 mod+1' }],
});

// ───────────────────────── intake ─────────────────────────
async function openFiles(files, { source } = {}) {
  const first = S.docs.length, slots = files.map((f) => ({ id: ++uid, loading: true, name: f.name, file: f }));
  S.docs.push(...slots);
  if (S.active < 0 || !doc()) S.active = first;
  S.opened = { n: 0, failed: 0, t: Date.now() };
  renderAll();
  await Promise.all(slots.map(async (slot, k) => {
    await wait(k * 70); // decode in order-ish; each thumb appears as soon as it is ready
    try {
      const d = await decodeFile(slot.file);
      Object.assign(slot, d, { loading: false }); S.opened.n++;
    } catch (err) {
      S.docs.splice(S.docs.indexOf(slot), 1); S.failed.push({ id: slot.id, name: slot.name, reason: err.reason || 'Couldn’t read this file.' }); S.opened.failed++;
    }
    if (S.active >= S.docs.length || S.docs[S.active]?.loading === undefined) S.active = Math.min(S.active, S.docs.length - 1);
    renderDock();
    if (doc() === slot) { renderAll(); afterOpen(); }
  }));
  if (!doc()) { const i = S.docs.findIndex((d) => !d.loading); S.active = i; }
  renderAll(); afterOpen();
  S.opened.done = true; renderDock();
}
function afterOpen() {
  const d = doc(); if (!d || d._initDone) return; d._initDone = true;
  if (S.init.bg && CUTOUTS[d.name]) { S.init.bg = false; setTimeout(removeBg, 400); }
  if (S.init.ocr) { S.init.ocr = false; setTimeout(findText, 300); }
  if (S.init.crop) { S.init.crop = false; startCrop(); }
}
async function decodeFile(f) {
  const buf = await f.arrayBuffer();
  if (buf.byteLength < 100) throw { reason: `Only ${buf.byteLength} bytes — not a photo.` };
  let bmp;
  try { bmp = await createImageBitmap(new Blob([buf])); } catch { throw { reason: 'Damaged or not an image — it couldn’t be decoded.' }; }
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const kind = /^hei[cf]$/.test(ext) ? 'HEIC' : ext === 'png' ? 'PNG' : ext === 'webp' ? 'WebP' : /^jpe?g$/.test(ext) ? 'JPEG' : ext.toUpperCase();
  const exif = E.readExif(buf);
  const d = { id: ++uid, file: f, name: f.name, ext, kind, bytes: f.size, w: bmp.width, h: bmp.height, bmp, exif, info: E.humanExif(exif), recipe: [], redo: [], sel: false };
  d.thumb = thumbOf(d);
  return d;
}
function thumbOf(d) {
  const c = E.render(d, { maxDim: 220 });
  return E.hasAlpha(d) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.84);
}
const thumbQ = new Set(); let thumbT = 0;
function queueThumb(d) { thumbQ.add(d); clearTimeout(thumbT); thumbT = setTimeout(() => { thumbQ.forEach((x) => { x.thumb = thumbOf(x); const im = $(`.lb-thumb[data-id="${x.id}"] img`); if (im) im.src = x.thumb; }); thumbQ.clear(); const fc = $('#filechip img'); if (fc && doc()) fc.src = doc().thumb; }, 350); }

// ───────────────────────── recipe ops ─────────────────────────
function stepLabel(s) {
  switch (s.type) {
    case 'adjust': return `${E.ADJ_LABEL[s.key]} ${s.value > 0 ? '+' : s.value < 0 ? '−' : ''}${Math.abs(s.value)}`;
    case 'auto': return 'Auto enhance';
    case 'rotate': return s.deg > 0 ? 'Rotate right' : 'Rotate left';
    case 'flip': return 'Flip horizontal';
    case 'straighten': return `Straighten ${s.deg > 0 ? '+' : ''}${s.deg.toFixed(1)}°`;
    case 'crop': return `Crop · ${ASPECTS.find((a) => a.id === s.aspect)?.label || 'Free'}`;
    case 'bg': return `Remove background · ${FILL_LABEL[s.fill]}${s.shadow ? ' + shadow' : ''}`;
    case 'refine': return `Refine edge · ${s.mode === 'erase' ? 'erase' : 'restore'}`;
    case 'mark': { const k = s.shape.kind; return k === 'text' ? `Text “${s.shape.text}”` : { pen: 'Pen stroke', arrow: 'Arrow', rect: 'Box', blur: 'Blur area' }[k]; }
  }
  return s.type;
}
function stepIcon(s) {
  return { adjust: E.ADJ_ICON[s.key], auto: 'sparkles', rotate: s.deg > 0 ? 'rotate-cw' : 'rotate-ccw', flip: 'flip-horizontal', straighten: 'ruler', crop: 'crop', bg: 'scissors', refine: 'brush',
    mark: { pen: 'pencil', arrow: 'move-up-right', rect: 'square', text: 'type', blur: 'grid-3x3' }[s.shape?.kind] }[s.type] || 'circle-check';
}
function pushStep(step, d = doc(), { fast = false } = {}) {
  if (!d) return;
  Object.assign(step, { id: ++uid, on: true, t: Date.now() });
  d.recipe.push(step); d.redo = [];
  changed(d, { fast });
  return step;
}
function changed(d = doc(), { fast = false, panel = false } = {}) {
  if (!d) return;
  if (d === doc()) schedule(fast);
  updateHistory(); updateUndo(); queueThumb(d); queueEstimate(fast ? 260 : 140); updateFrameMeta();
  if (panel) renderPanel(); else if (S.mode === 'edit' && !S.cropping) refreshSliders();
  $(`.lb-thumb[data-id="${d.id}"]`)?.classList.toggle('is-edited', d.recipe.some((s) => s.on));
}
function undo() {
  if (S.cropping) return cancelCrop();
  const d = doc(); if (!d || !d.recipe.length) return;
  const s = d.recipe.pop(); d.redo.push(s); afterStructural(d);
}
function redo() { const d = doc(); if (!d || !d.redo.length) return; d.recipe.push(d.redo.pop()); afterStructural(d); }
function afterStructural(d) { S.adjSess = null; changed(d); if (['edit', 'markup'].includes(S.mode)) { renderPanel(); } renderMobilePanel(); }
function toggleStep(id) { const d = doc(); const s = d?.recipe.find((x) => x.id === id); if (!s) return; s.on = !s.on; changed(d); if (S.mode === 'edit' || S.mode === 'markup') refreshSliders(); }
function deleteStep(id) {
  const d = doc(); const i = d.recipe.findIndex((x) => x.id === id); if (i < 0) return;
  const [s] = d.recipe.splice(i, 1); afterStructural(d);
  toast(`Removed “${stepLabel(s)}”`, { type: 'neutral', action: { label: 'Undo', onClick: () => { d.recipe.splice(i, 0, s); afterStructural(d); } } });
}
function resetAll() {
  const d = doc(); if (!d?.recipe.length) return;
  const old = d.recipe; d.recipe = []; d.redo = []; afterStructural(d);
  toast(`Back to the original · ${old.length} edit${old.length > 1 ? 's' : ''} removed`, { type: 'neutral', action: { label: 'Undo', onClick: () => { d.recipe = old; afterStructural(d); } } });
}
// Adjustments coalesce while you drag one control, so History stays readable.
function setAdjust(key, value, { live = true } = {}) {
  const d = doc(); if (!d) return;
  value = Math.round(value);
  const last = d.recipe.at(-1);
  if (last && last.type === 'adjust' && last.key === key && (S.adjSess === last || Date.now() - last.t < 1200)) { last.value = value; last.t = Date.now(); }
  else {
    if (E.effective(d).adj[key] === value) return;
    S.adjSess = pushStep({ type: 'adjust', key, value }, d, { fast: live });
    return;
  }
  changed(d, { fast: live });
}
function autoEnhance() {
  const d = doc(); if (!d) return;
  const v = E.autoValues(E.render(d, { maxDim: 400, skip: (s) => s.type === 'adjust' || s.type === 'auto' }));
  pushStep({ type: 'auto', values: v }); refreshSliders(); renderMobilePanel();
}

// ───────────────────────── stage: layout, zoom, render ─────────────────────────
function stageDoc() {
  const d = doc(); if (!d) return null;
  if (S.cropping) return { ...d, recipe: [...d.recipe.filter((s) => s.type !== 'crop' && s.type !== 'straighten'), { type: 'straighten', deg: S.cropping.straighten, on: true }] };
  return d;
}
function frame() {
  const d = stageDoc(); if (!d) return null;
  const x = S.exp;
  if (S.mode === 'export' && x.box && S.est?.plan?.box) return { ow: x.box.w, oh: x.box.h, boxed: true };
  const g = E.geometry(d, E.effective(d), { noCrop: !!S.cropping });
  return { ow: g.ow, oh: g.oh, g };
}
function layout() {
  const f = frame(); if (!f) return;
  const st = stage.getBoundingClientRect();
  const mob = isMobile(), padX = mob ? 12 : st.width < 720 ? 24 : 48, padY = mob ? 12 : st.width < 720 ? 24 : 40;
  const fit = Math.min((st.width - padX * 2) / f.ow, (st.height - padY * 2) / f.oh, 2);
  const z = S.zoom === 'fit' ? fit : S.zoom;
  const dw = f.ow * z, dh = f.oh * z;
  const mx = Math.max(0, (dw - st.width) / 2 + padX), my = Math.max(0, (dh - st.height) / 2 + padY);
  S.pan.x = clamp(S.pan.x, -mx, mx); S.pan.y = clamp(S.pan.y, -my, my);
  if (S.zoom === 'fit') S.pan = { x: 0, y: 0 };
  const left = (st.width - dw) / 2 + S.pan.x + (S.swipeDx || 0), top = (st.height - dh) / 2 + S.pan.y;
  view.style.width = dw + 'px'; view.style.height = dh + 'px';
  view.style.transform = `translate(${left}px, ${top}px)`;
  S.view = { z, fit, dw, dh, ow: f.ow, oh: f.oh, left, top, sw: st.width, sh: st.height, boxed: f.boxed };
  $('#draft').setAttribute('viewBox', `0 0 ${f.ow} ${f.oh}`);
  const pct = $('#zoom-pct'); if (pct) pct.textContent = Math.round(z * 100) + ' %';
  placeSplit();
}
let rq = 0, hqT = 0;
function schedule(fast = false) {
  cancelAnimationFrame(rq); rq = requestAnimationFrame(() => paint(fast));
  clearTimeout(hqT); if (fast) hqT = setTimeout(() => paint(false), 240);
}
function paint(fast) {
  const d = stageDoc(); if (!d) return;
  layout();
  const v = S.view;
  const before = S.compare || (S.mode === 'export' && !v.boxed);
  const scale = clamp((v.dw * devicePixelRatio) / v.ow, 0.02, 1) * (fast ? 0.55 : 1);
  const r = E.render(d, { scale, noCrop: !!S.cropping, noMarks: !!S.cropping, skip: before ? (s) => !E.isGeo(s) : null, ghost: !!S.refine });
  if (cv.width !== r.width || cv.height !== r.height) { cv.width = r.width; cv.height = r.height; }
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(r, 0, 0);
  S.geo = r._geo;
  view.classList.toggle('has-alpha', E.hasAlpha(d) && !before || !!S.refine);
  cv.hidden = !!v.boxed && S.mode === 'export';
  overlays();
}
function crossfade() { // keep the previous frame on top and fade it out (background removal reveal)
  cvOld.width = cv.width; cvOld.height = cv.height; cvOld.getContext('2d').drawImage(cv, 0, 0);
  cvOld.classList.remove('is-fading'); cvOld.hidden = false; void cvOld.offsetWidth;
  cvOld.classList.add('is-fading'); setTimeout(() => { cvOld.hidden = true; cvOld.classList.remove('is-fading'); }, 900);
}
function setZoom(nz, ax, ay) {
  const v = S.view; if (!v) return;
  if (nz === 'fit') { S.zoom = 'fit'; S.pan = { x: 0, y: 0 }; schedule(); return; }
  nz = clamp(nz, Math.min(v.fit, 0.1), 8);
  ax ??= v.sw / 2; ay ??= v.sh / 2;
  const px = (ax - v.left) / v.z, py = (ay - v.top) / v.z;
  S.zoom = nz;
  S.pan.x = ax - px * nz - (v.sw - v.ow * nz) / 2; S.pan.y = ay - py * nz - (v.sh - v.oh * nz) / 2;
  layout(); schedule(true);
}
const ZSTEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8];
function zoomStep(dir) { const z = S.view.z; const n = dir > 0 ? ZSTEPS.find((s) => s > z * 1.01) || 8 : [...ZSTEPS].reverse().find((s) => s < z * 0.99) || 0.1; setZoom(n); }
new ResizeObserver(() => { if (doc()) schedule(); }).observe(stage);

// ───────────────────────── overlays (OCR words, crop, split, labels) ─────────────────────────
function overlays() { renderOcr(); renderCropBox(); placeSplit(); renderHud(); }
function renderHud() {
  const d = doc(); const hud = $('#hud'); if (!d) { hud.innerHTML = ''; return; }
  const exp = S.mode === 'export';
  const est = S.est && S.est.docId === d.id ? S.est : null;
  hud.innerHTML = `
    ${exp && S.splitOn && !S.view?.boxed ? `<div class="lb-label lb-label--l"><b>Original</b> · ${esc(d.kind)} · ${formatBytes(d.bytes)}</div>
      <div class="lb-label lb-label--r" id="label-after"><b>${esc(est ? (est.plan.passthrough ? 'Original bytes' : `${FMT[est.plan.format]}${est.plan.format === 'png' ? '' : ' ' + est.quality}`) : '…')}</b> · ${est ? formatBytes(est.bytes) : 'estimating'}</div>` : ''}
    ${exp && S.view?.boxed ? `<div class="lb-label lb-label--l"><b>Preview</b> · ${S.exp.box.w} × ${S.exp.box.h}</div>` : ''}
    ${S.compare ? `<div class="lb-label lb-label--c">${icon('circle-half', { size: 14 })} Original</div>` : ''}
    <div class="fw-zoom" role="group" aria-label="Zoom">
      <button class="fw-iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="-" data-z="-1">${icon('minus')}</button>
      <button class="fw-zoom__pct" type="button" id="zoom-pct" aria-label="Zoom level · click to fit or show 100 %" data-tip="Fit · 100 %" data-tip-kbd="f">${Math.round((S.view?.z || 1) * 100)} %</button>
      <button class="fw-iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+" data-z="1">${icon('plus')}</button></div>`;
  $$('[data-z]', hud).forEach((b) => (b.onclick = () => zoomStep(+b.dataset.z)));
  $('#zoom-pct').onclick = () => (S.zoom === 'fit' ? setZoom(1) : setZoom('fit'));
}
function placeSplit() {
  const sp = $('#split'), v = S.view, on = S.mode === 'export' && S.splitOn && doc() && v && !v.boxed && S.est?.url;
  sp.hidden = !on; after.hidden = !(S.mode === 'export' && S.est?.url && doc() && S.est.docId === doc().id);
  if (!v) return;
  if (on) {
    const x = S.split * v.sw; sp.style.transform = `translateX(${x}px)`;
    const f = clamp((x - v.left) / v.dw, 0, 1) * 100; after.style.clipPath = `inset(0 0 0 ${f}%)`;
  } else after.style.clipPath = 'none';
}
function initSplit() {
  const sp = $('#split');
  sp.innerHTML = `<div class="lb-split__line"></div><button class="lb-split__knob" type="button" role="slider" aria-label="Before / after split" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${icon('chevrons-left-right', { size: 18 })}</button>`;
  const knob = sp.querySelector('button');
  const move = (x) => { S.split = clamp(x / S.view.sw, 0.02, 0.98); knob.setAttribute('aria-valuenow', Math.round(S.split * 100)); placeSplit(); };
  sp.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); sp.setPointerCapture(e.pointerId); sp.classList.add('is-drag');
    const r = stage.getBoundingClientRect();
    const mv = (ev) => move(ev.clientX - r.left);
    const up = () => { sp.classList.remove('is-drag'); sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up);
  });
  knob.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); move((S.split + (e.key === 'ArrowLeft' ? -0.05 : 0.05)) * S.view.sw); } });
}

// OCR word boxes mapped through the recipe geometry (they follow crops and rotations)
let ocrDrag = null;
function renderOcr() {
  const el = $('#ocr'), d = doc();
  const on = d && S.mode === 'inspect' && d.ocr && typeof d.ocr === 'object' && d.ocrOn && !S.compare;
  el.hidden = !on; if (!on) { el.innerHTML = ''; return; }
  const g = E.geometry(d, E.effective(d));
  let n = 0;
  el.innerHTML = d.ocr.lines.map((ln, li) => ln.words.map((w, wi) => {
    const [x, y, ww, hh] = w.b; const pts = [[x, y], [x + ww, y], [x, y + hh], [x + ww, y + hh]].map(([a, b]) => g.m.transformPoint(new DOMPoint(a, b)));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const L = Math.min(...xs) / g.ow * 100, T = Math.min(...ys) / g.oh * 100, W = (Math.max(...xs) - Math.min(...xs)) / g.ow * 100, H = (Math.max(...ys) - Math.min(...ys)) / g.oh * 100;
    return `<button class="lb-word" type="button" data-l="${li}" data-k="${n++}" style="left:${L}%;top:${T}%;width:${W}%;height:${H}%;--d:${n * 18}ms" aria-label="Copy “${esc(w.t)}”">${esc(w.t)}</button>`;
  }).join('')).join('');
}
function initOcr() {
  const el = $('#ocr');
  const words = () => $$('.lb-word', el);
  const text = (a, b) => { const ws = words().slice(Math.min(a, b), Math.max(a, b) + 1); let out = '', last = null; ws.forEach((w) => { out += (last == null ? '' : last !== w.dataset.l ? '\n' : ' ') + w.textContent; last = w.dataset.l; }); return out; };
  el.addEventListener('pointerdown', (e) => { const w = e.target.closest('.lb-word'); if (!w) return; e.stopPropagation(); ocrDrag = { a: +w.dataset.k, b: +w.dataset.k }; mark(); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!ocrDrag) { const w = e.target.closest('.lb-word'); syncLine(w ? +w.dataset.l : null); return; }
    const t = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList?.contains('lb-word')); if (t) { ocrDrag.b = +t.dataset.k; mark(); }
  });
  el.addEventListener('pointerleave', () => !ocrDrag && syncLine(null));
  el.addEventListener('pointerup', async () => {
    if (!ocrDrag) return; const { a, b } = ocrDrag; ocrDrag = null;
    const t = text(a, b); await navigator.clipboard.writeText(t).catch(() => {});
    const w = words()[b]; bubble(w, `Copied “${t.length > 28 ? t.slice(0, 26) + '…' : t.replace(/\n/g, ' · ')}”`);
    setTimeout(() => words().forEach((x) => x.classList.remove('is-sel')), 900);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const w = e.target.closest('.lb-word'); if (!w) return; e.preventDefault(); navigator.clipboard.writeText(w.textContent).catch(() => {}); bubble(w, `Copied “${w.textContent}”`); } });
  function mark() { const lo = Math.min(ocrDrag.a, ocrDrag.b), hi = Math.max(ocrDrag.a, ocrDrag.b); words().forEach((w) => w.classList.toggle('is-sel', +w.dataset.k >= lo && +w.dataset.k <= hi)); }
}
function syncLine(li) {
  $$('.lb-word').forEach((w) => w.classList.toggle('is-hot', li != null && +w.dataset.l === li));
  $$('.lb-lines__row').forEach((r) => r.classList.toggle('is-hot', li != null && +r.dataset.l === li));
}
function bubble(anchor, text) {
  $$('.lb-bubble').forEach((b) => b.remove());
  const r = anchor.getBoundingClientRect(), s = stage.getBoundingClientRect();
  const b = h(`<div class="lb-bubble" role="status">${icon('check', { size: 14 })}<span></span></div>`); b.querySelector('span').textContent = text;
  stage.append(b);
  const x = clamp(r.left + r.width / 2 - s.left, 90, s.width - 90), y = r.top - s.top - 8;
  b.style.left = x + 'px'; b.style.top = Math.max(36, y) + 'px';
  setTimeout(() => b.classList.add('is-out'), 1500); setTimeout(() => b.remove(), 1800);
}

// ───────────────────────── stage pointer: pan, swipe, draw, refine ─────────────────────────
function normPt(e) { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
stage.addEventListener('pointerdown', (e) => {
  if (!doc() || e.button > 0) return;
  if (e.target.closest('.fw-zoom,.lb-split,.lb-crop,.lb-word,.lb-holdcmp,.lb-textin,.lb-empty,.lb-bubble')) return;
  const d = doc();
  if (S.refine && e.target.closest('#view')) return refineStroke(e);
  if (S.mode === 'markup' && e.target.closest('#view') && !S.space) return S.tool === 'text' ? placeText(e) : drawMark(e);
  // pan when zoomed in, swipe between photos on touch when fitted
  const zoomed = S.view && (S.view.dw > S.view.sw - 8 || S.view.dh > S.view.sh - 8);
  const x0 = e.clientX, y0 = e.clientY, p0 = { ...S.pan };
  stage.setPointerCapture(e.pointerId);
  let moved = false;
  const swipe = !zoomed && (e.pointerType === 'touch' || isMobile());
  const mv = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0; if (Math.hypot(dx, dy) > 4) moved = true;
    if (zoomed || S.space) { S.pan = { x: p0.x + dx, y: p0.y + dy }; if (S.zoom === 'fit') S.zoom = S.view.z; layout(); stage.classList.add('is-panning'); }
    else if (swipe) { S.swipeDx = dx * 0.9; layout(); }
  };
  const up = (ev) => {
    stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up);
    stage.classList.remove('is-panning');
    if (swipe && !zoomed) {
      const dx = ev.clientX - x0; const dir = dx < -60 ? 1 : dx > 60 ? -1 : 0;
      if (dir && go(S.active + dir, { swipe: dir })) return;
      S.swipeDx = 0; view.classList.add('is-settling'); layout(); setTimeout(() => view.classList.remove('is-settling'), 260);
    }
    if (zoomed && moved) schedule();
  };
  stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
});
stage.addEventListener('wheel', (e) => {
  if (!doc()) return; e.preventDefault();
  const r = stage.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) setZoom(S.view.z * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
  else if (S.view.dw > S.view.sw || S.view.dh > S.view.sh) { if (S.zoom === 'fit') S.zoom = S.view.z; S.pan.x -= e.deltaX; S.pan.y -= e.deltaY; layout(); clearTimeout(hqT); hqT = setTimeout(() => paint(false), 200); }
}, { passive: false });
stage.addEventListener('dblclick', (e) => { if (!doc() || S.mode === 'markup' || S.cropping || e.target.closest('.fw-zoom,.lb-split')) return; const r = stage.getBoundingClientRect(); S.zoom === 'fit' ? setZoom(1, e.clientX - r.left, e.clientY - r.top) : setZoom('fit'); });

function drawMark(e) {
  e.preventDefault();
  const d = doc(), ow = S.view.ow, oh = S.view.oh, md = Math.min(ow, oh);
  const svg = $('#draft'), lw = Math.max(2, md * SIZES[S.size]);
  const p0 = normPt(e), pts = [p0];
  stage.setPointerCapture(e.pointerId);
  const col = S.color;
  const draw = (b) => {
    const A = { x: p0.x * ow, y: p0.y * oh }, B = { x: b.x * ow, y: b.y * oh };
    if (S.tool === 'pen') svg.innerHTML = `<polyline points="${pts.map((p) => `${p.x * ow},${p.y * oh}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (S.tool === 'rect') svg.innerHTML = `<rect x="${Math.min(A.x, B.x)}" y="${Math.min(A.y, B.y)}" width="${Math.abs(B.x - A.x)}" height="${Math.abs(B.y - A.y)}" rx="${lw * 1.5}" fill="none" stroke="${col}" stroke-width="${lw}"/>`;
    else if (S.tool === 'blur') svg.innerHTML = `<rect x="${Math.min(A.x, B.x)}" y="${Math.min(A.y, B.y)}" width="${Math.abs(B.x - A.x)}" height="${Math.abs(B.y - A.y)}" fill="rgba(127,127,127,.35)" stroke="#fff" stroke-width="${md * 0.004}" stroke-dasharray="${md * 0.012}"/>`;
    else if (S.tool === 'arrow') { const ang = Math.atan2(B.y - A.y, B.x - A.x), hl = lw * 4.2; svg.innerHTML = `<line x1="${A.x}" y1="${A.y}" x2="${B.x - Math.cos(ang) * hl * 0.6}" y2="${B.y - Math.sin(ang) * hl * 0.6}" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"/><polygon fill="${col}" points="${B.x},${B.y} ${B.x - hl * Math.cos(ang - 0.45)},${B.y - hl * Math.sin(ang - 0.45)} ${B.x - hl * Math.cos(ang + 0.45)},${B.y - hl * Math.sin(ang + 0.45)}"/>`; }
  };
  let last = p0;
  const mv = (ev) => { const p = normPt(ev); if (S.tool === 'pen') { if (Math.hypot(p.x - pts.at(-1).x, p.y - pts.at(-1).y) > 0.003) pts.push(p); } last = p; draw(p); };
  const up = () => {
    stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up);
    svg.innerHTML = '';
    const tiny = Math.hypot(last.x - p0.x, last.y - p0.y) < 0.01;
    if (S.tool === 'pen' ? pts.length < 2 : tiny) return;
    const shape = S.tool === 'pen' ? { kind: 'pen', pts } : { kind: S.tool, a: p0, b: last };
    pushStep({ type: 'mark', shape: { ...shape, color: col, size: SIZES[S.size] } }, d);
    renderPanel();
  };
  stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up);
}
function placeText(e) {
  e.preventDefault();
  $$('.lb-textin').forEach((x) => x.remove());
  const p = normPt(e), d = doc(), md = Math.min(S.view.ow, S.view.oh);
  const fs = md * TSIZES[S.size] * S.view.z;
  const inp = h(`<input class="lb-textin" type="text" aria-label="Text on the photo" placeholder="Type…" spellcheck="false">`);
  Object.assign(inp.style, { left: p.x * 100 + '%', top: p.y * 100 + '%', fontSize: fs + 'px', color: S.color });
  view.append(inp); inp.focus(); setTimeout(() => inp.focus(), 0);
  let done = false;
  const pop = pushLayer(() => finish(false), inp);
  function finish(ok) {
    if (done) return; done = true; pop();
    const t = inp.value.trim(); inp.remove();
    if (ok && t) { pushStep({ type: 'mark', shape: { kind: 'text', a: p, text: t, color: S.color, fsize: TSIZES[S.size] } }, d); renderPanel(); }
    stage.focus({ preventScroll: true, focusVisible: false });
  }
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } });
  inp.addEventListener('blur', () => finish(true));
}

// ───────────────────────── crop ─────────────────────────
function startCrop() {
  const d = doc(); if (!d || S.cropping) return;
  if (S.mode !== 'edit') setMode('edit');
  const e = E.effective(d);
  S.cropping = { rect: e.crop ? { ...e.crop } : { x: 0, y: 0, w: 1, h: 1 }, aspect: e.aspect || 'free', straighten: e.straighten, orig: { crop: e.crop, straighten: e.straighten } };
  S.cropPop = pushLayer(() => cancelCrop());
  S.zoom = 'fit'; schedule(); renderPanel(); renderMobilePanel(); renderFramebar();
}
function cancelCrop() { if (!S.cropping) return; S.cropping = null; S.cropPop?.(); schedule(); renderPanel(); renderMobilePanel(); renderFramebar(); }
function commitCrop() {
  const c = S.cropping, d = doc(); if (!c || !d) return;
  S.cropping = null; S.cropPop?.();
  const r = c.rect, full = r.x < 0.001 && r.y < 0.001 && r.w > 0.999 && r.h > 0.999;
  if (Math.abs(c.straighten - (c.orig.straighten || 0)) > 0.05) pushStep({ type: 'straighten', deg: +c.straighten.toFixed(1) }, d);
  const same = c.orig.crop ? ['x', 'y', 'w', 'h'].every((k) => Math.abs(c.orig.crop[k] - r[k]) < 0.001) : full;
  if (!same) pushStep({ type: 'crop', rect: { ...r }, aspect: c.aspect }, d);
  schedule(); renderPanel(); renderMobilePanel(); renderFramebar();
}
function setAspect(id) {
  const c = S.cropping; if (!c) return; c.aspect = id;
  const a = ASPECTS.find((x) => x.id === id); const f = frame();
  let ratio = a.r || (id === 'original' ? E.effective(doc()).rot % 180 ? doc().h / doc().w : doc().w / doc().h : null);
  if (ratio) { // largest centred rect of that ratio inside the frame
    const fr = f.ow / f.oh; let w = 1, hh = 1;
    if (ratio > fr) hh = fr / ratio; else w = ratio / fr;
    const cx = c.rect.x + c.rect.w / 2, cy = c.rect.y + c.rect.h / 2;
    c.rect = { w, h: hh, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - hh / 2, 0, 1 - hh) };
  }
  renderCropBox(); syncCropUi();
}
function renderCropBox() {
  const el = $('#crop'), c = S.cropping;
  el.hidden = !c; view.classList.toggle('is-cropping', !!c); if (!c) return;
  if (!el.firstChild) {
    el.innerHTML = `<div class="lb-crop__grid"></div>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((k) => `<span class="lb-crop__h lb-crop__h--${k}" data-h="${k}"></span>`).join('')}`;
    el.addEventListener('pointerdown', cropDrag);
  }
  Object.assign(el.style, { left: c.rect.x * 100 + '%', top: c.rect.y * 100 + '%', width: c.rect.w * 100 + '%', height: c.rect.h * 100 + '%' });
}
function cropDrag(e) {
  e.preventDefault(); e.stopPropagation();
  const c = S.cropping, hnd = e.target.dataset.h || 'move', r0 = { ...c.rect }, p0 = normPt(e);
  const a = ASPECTS.find((x) => x.id === c.aspect); const f = frame();
  const ratio = a?.r ? a.r * f.oh / f.ow : c.aspect === 'original' ? r0.w / r0.h : null; // in normalized units
  const el = $('#crop'); el.setPointerCapture(e.pointerId); el.classList.add('is-drag');
  const mv = (ev) => {
    const p = normPt(ev), dx = p.x - p0.x, dy = p.y - p0.y; let { x, y, w, h: hh } = r0;
    if (hnd === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - hh); }
    else {
      if (hnd.includes('w')) { x = clamp(r0.x + dx, 0, r0.x + r0.w - 0.05); w = r0.x + r0.w - x; }
      if (hnd.includes('e')) w = clamp(r0.w + dx, 0.05, 1 - r0.x);
      if (hnd.includes('n')) { y = clamp(r0.y + dy, 0, r0.y + r0.h - 0.05); hh = r0.y + r0.h - y; }
      if (hnd.includes('s')) hh = clamp(r0.h + dy, 0.05, 1 - r0.y);
      if (ratio) { if (hnd === 'n' || hnd === 's') w = hh * ratio; else hh = w / ratio; if (x + w > 1) { w = 1 - x; hh = w / ratio; } if (y + hh > 1) { hh = 1 - y; w = hh * ratio; } if (hnd.includes('n')) y = r0.y + r0.h - hh; if (hnd.includes('w')) x = r0.x + r0.w - w; }
    }
    c.rect = { x, y, w, h: hh }; renderCropBox();
  };
  const up = () => { el.classList.remove('is-drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
}
function setStraighten(v) { if (!S.cropping) return; S.cropping.straighten = clamp(v, -15, 15); schedule(true); const o = $('#straighten-val'); if (o) o.textContent = `${S.cropping.straighten.toFixed(1)}°`; }
function rotate(deg) { const d = doc(); if (!d) return; const wasCrop = !!S.cropping; if (wasCrop) S.cropping.rect = { x: 0, y: 0, w: 1, h: 1 }; pushStep({ type: 'rotate', deg }, d); if (wasCrop) schedule(); }
function flip() { const d = doc(); if (d) pushStep({ type: 'flip' }, d); }
function syncCropUi() { $$('[data-aspect]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aspect === S.cropping?.aspect))); }

// ───────────────────────── background removal ─────────────────────────
async function removeBg() {
  const d = doc(); if (!d || S.bgJob || E.effective(d).bg) return;
  if (S.mode !== 'edit' && !isMobile()) setMode('edit');
  if (!CUTOUTS[d.name]) { S.bgJob = { phase: 'unavailable', docId: d.id }; renderBgBlock(); return; }
  const job = S.bgJob = { phase: S.modelReady ? 'run' : 'model', got: 0, docId: d.id, cancel: false };
  renderBgBlock(); renderMobilePanel();
  const cut = fetch(CUTOUTS[d.name]).then((r) => r.blob()).then((b) => createImageBitmap(b));
  if (!S.modelReady) {
    const total = 88, t0 = performance.now(), dur = 1800;
    while (true) {
      await wait(60); if (job.cancel) { S.bgJob = null; renderBgBlock(); return; }
      const k = Math.min(1, (performance.now() - t0) / dur); job.got = total * (1 - Math.pow(1 - k, 1.6)); updateBgProgress();
      if (k >= 1) break;
    }
    S.modelReady = true; store.set('img-model', true);
    job.phase = 'run'; renderBgBlock();
  }
  $('#scan').hidden = false;
  const [bmp] = await Promise.all([cut, wait(1000)]);
  $('#scan').hidden = true;
  if (job.cancel) { S.bgJob = null; renderBgBlock(); return; }
  d.cutout = bmp; S.bgJob = null;
  if (d === doc()) crossfade();
  pushStep({ type: 'bg', fill: 'transparent', shadow: false }, d);
  if (S.exp.format === 'jpeg') { S.exp.format = 'webp'; S.exp.preset = null; S.fmtNote = 'Switched to WebP to keep the transparency.'; }
  renderPanel(); renderMobilePanel();
}
function setFill(fill) {
  const d = doc(), s = E.effective(d).bg; if (!s) return;
  s.fill = fill; if (fill === 'color' && !s.color) s.color = '#dbeafe';
  S.fmtNote = fill === 'transparent' ? (S.exp.format === 'jpeg' ? '' : `${FMT[S.exp.format]} keeps the transparency.`) : `Flattened onto ${fill === 'blur' ? 'the blurred photo' : fill === 'white' ? 'white' : 'colour'} — no transparency needed.`;
  changed(d); renderBgBlock();
}
function updateBgProgress() {
  const j = S.bgJob; if (!j) return;
  $$('.lb-bgprog').forEach((el) => { el.querySelector('.fw-ring').style.setProperty('--value', Math.round(j.got / 88 * 100)); el.querySelector('.lb-bgprog__mb').textContent = `${Math.round(j.got)} of 88 MB`; });
}
function refineStroke(e) {
  e.preventDefault();
  const d = doc(), g = S.geo; if (!g) return;
  const inv = g.m.inverse(); const v = S.view;
  const r = (S.refine.r / v.z) / g.cover; // brush radius in source px
  const toSrc = (ev) => { const p = normPt(ev); const q = inv.transformPoint(new DOMPoint(p.x * g.ow, p.y * g.oh)); return { x: q.x, y: q.y }; };
  const step = pushStep({ type: 'refine', mode: S.refine.mode, r, pts: [toSrc(e)] }, d, { fast: true });
  stage.setPointerCapture(e.pointerId);
  const mv = (ev) => { const p = toSrc(ev), l = step.pts.at(-1); const dist = Math.hypot(p.x - l.x, p.y - l.y); const n = Math.ceil(dist / (r * 0.4)); for (let i = 1; i <= n; i++) step.pts.push({ x: l.x + (p.x - l.x) * i / n, y: l.y + (p.y - l.y) * i / n }); schedule(true); };
  const up = () => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); changed(d); };
  stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up);
}
function toggleRefine(on = !S.refine) {
  S.refine = on ? { mode: 'erase', r: 22 } : null;
  if (on) S.refinePop = pushLayer(() => toggleRefine(false)); else S.refinePop?.();
  stage.classList.toggle('is-refining', !!S.refine); $('#brush').hidden = !S.refine;
  schedule(); renderBgBlock();
}
stage.addEventListener('pointermove', (e) => { if (!S.refine) return; const b = $('#brush'), r = stage.getBoundingClientRect(); b.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`; b.style.width = b.style.height = S.refine.r * 2 + 'px'; b.dataset.mode = S.refine.mode; });

// ───────────────────────── OCR (pre-made result, real interaction) ─────────────────────────
let OCR_DATA = null;
async function findText() {
  const d = doc(); if (!d || d.ocr === 'loading') return;
  if (S.mode !== 'inspect' && !isMobile()) setMode('inspect');
  if (d.ocr && typeof d.ocr === 'object') { d.ocrOn = !d.ocrOn; renderOcr(); renderPanel(); renderMobilePanel(); return; }
  d.ocr = 'loading'; d.ocrPhase = S.ocrReady ? 'read' : 'engine'; renderPanel(); renderMobilePanel();
  OCR_DATA ||= await fetch('assets/ocr.json').then((r) => r.json()).catch(() => ({}));
  if (!S.ocrReady) { await wait(650); S.ocrReady = true; d.ocrPhase = 'read'; renderPanel(); renderMobilePanel(); }
  $('#scan').hidden = false; await wait(850); $('#scan').hidden = true;
  const data = OCR_DATA[d.name];
  d.ocr = data ? data : 'none'; d.ocrOn = !!data;
  renderOcr(); renderPanel(); renderMobilePanel();
}

// ───────────────────────── export ─────────────────────────
function baseName(d) { return d.name.replace(/\.[^.]+$/, ''); }
function suffix() { const p = PRESETS.find((x) => x.id === S.exp.preset); return p ? p.suffix : S.exp.size === 'longest' ? `${S.exp.longest}` : 'edited'; }
function planFor(d) {
  const x = S.exp, e = E.effective(d), g = E.geometry(d, e);
  const edited = d.recipe.some((s) => s.on);
  let format = x.format, note = '';
  if (format === 'original') { format = d.kind === 'PNG' ? 'png' : d.kind === 'WebP' ? 'webp' : 'jpeg'; if (d.kind === 'HEIC') note = 'HEIC can’t be written by browsers, so this saves a JPEG.'; }
  const alpha = E.hasAlpha(d) && !x.box;
  if (alpha && format === 'jpeg') { format = 'webp'; note = 'JPEG can’t keep transparency, so this saves WebP.'; }
  let W = g.ow, H = g.oh, box = null;
  if (x.box) { box = x.box; W = box.w; H = box.h; }
  else if (x.size === 'longest' && Math.max(g.ow, g.oh) > x.longest) { const k = x.longest / Math.max(g.ow, g.oh); W = Math.round(g.ow * k); H = Math.round(g.oh * k); }
  const small = x.size === 'longest' && !box && Math.max(g.ow, g.oh) <= x.longest;
  const passthrough = x.format === 'original' && !edited && W === g.ow && H === g.oh && d.kind !== 'HEIC';
  const quality = format === 'png' ? 100 : x.format === 'original' ? 92 : x.quality;
  const renderScale = box ? Math.min(1, Math.max(box.w / g.ow, box.h / g.oh) * 1.02) : Math.min(1, (W / g.ow) * 1.02);
  return { format, quality, W, H, box, passthrough, renderScale, alpha, note, small, edited, ow: g.ow, oh: g.oh, name: S.exp.nameFor?.[d.id] || `${baseName(d)}-${suffix()}.${EXT[format]}` };
}
function boxed(src, box) {
  const c = document.createElement('canvas'); c.width = box.w; c.height = box.h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  if (box.bg) { x.fillStyle = box.bg; x.fillRect(0, 0, box.w, box.h); }
  const k = box.fit === 'crop' ? Math.max(box.w / src.width, box.h / src.height) : Math.min(box.w / src.width, box.h / src.height) * 0.9;
  const w = src.width * k, hh = src.height * k; x.drawImage(src, (box.w - w) / 2, (box.h - hh) / 2, w, hh);
  return c;
}
async function exportOne(d) {
  const p = planFor(d);
  if (p.passthrough) return { blob: d.file, bytes: d.bytes, quality: null, plan: p, docId: d.id };
  let c = E.render(d, { scale: p.renderScale });
  if (p.box) c = boxed(c, p.box);
  const r = await E.encode(c, { format: p.format, quality: p.quality, width: p.W, height: p.H, target: S.exp.max && p.format !== 'png' ? S.exp.maxKB * 1024 * (p.format === 'avif' ? 1 / 0.78 : 1) : null, flatten: p.box?.bg || (p.format === 'jpeg' ? '#ffffff' : null) });
  return { ...r, plan: p, docId: d.id };
}
let estT = 0;
function queueEstimate(delay = 140) {
  if (!doc()) return; clearTimeout(estT); S.estPending = true; updateEstimateUI();
  estT = setTimeout(runEstimate, delay);
}
async function runEstimate() {
  const d = doc(); if (!d) return;
  const gen = ++S.estGen;
  try {
    const r = await exportOne(d);
    if (gen !== S.estGen) return;
    if (S.est?.url) URL.revokeObjectURL(S.est.url);
    r.url = URL.createObjectURL(r.blob);
    S.est = r; S.estPending = false;
    if (S.mode === 'export') { after.src = r.url; if (!!S.view?.boxed !== !!r.plan.box) schedule(); }
    updateEstimateUI(); placeSplit(); renderHud();
  } catch (err) { console.error(err); S.estPending = false; updateEstimateUI(); }
}
const pctDelta = (a, b) => { const p = Math.round((b / a - 1) * 100); return `${p <= 0 ? '−' : '+'}${Math.abs(p)} %`; };
function estLine(d, est) {
  if (!est) return { fmt: '…', size: 'Estimating…' };
  const p = est.plan;
  const fmt = p.passthrough ? `${d.kind} · original bytes` : `${FMT[p.format]}${p.format === 'png' ? '' : ` · ${est.quality} %`} · ${p.W} × ${p.H}`;
  return { fmt, size: est.bytes, delta: pctDelta(d.bytes, est.bytes), down: est.bytes <= d.bytes };
}
function updateEstimateUI() {
  const d = doc(); if (!d) return;
  const est = S.est && S.est.docId === d.id ? S.est : null;
  const L = estLine(d, est);
  const scopeN = scopeDocs().length;
  // dock
  const sum = $('#exp-sum');
  if (sum && !S.batch) {
    sum.classList.toggle('is-pending', S.estPending);
    sum.innerHTML = scopeN > 1
      ? `<span class="lb-expbar__fmt">${scopeN} photos · ${esc(est ? FMT[est.plan.format] : FMT[S.exp.format])}${S.exp.format === 'png' ? '' : ` · ${S.exp.quality} %`}${S.exp.box ? ` · ${S.exp.box.w} × ${S.exp.box.h}` : S.exp.size === 'longest' ? ` · max ${S.exp.longest} px` : ''}</span><span class="lb-expbar__size">This one: ${est ? `<b>${formatBytes(est.bytes)}</b>` : '…'}</span>`
      : `<span class="lb-expbar__fmt">${esc(L.fmt)}</span><span class="lb-expbar__size">${est ? `<span class="lb-was">${formatBytes(d.bytes)}</span> ${icon('arrow-right', { size: 12 })} <b>${formatBytes(est.bytes)}</b> <span class="lb-delta ${L.down ? '' : 'is-up'}">${L.delta}</span>` : 'Estimating…'}</span>`;
  }
  const save = $('#save');
  if (save && !S.batch) save.innerHTML = `${icon('download')}<span>${scopeN > 1 ? `Save ${scopeN} · ZIP` : `Save${est ? ` · ${formatBytes(est.bytes)}` : ''}`}</span>`;
  // panel result
  const res = $('#exp-result');
  if (res) {
    res.classList.toggle('is-pending', S.estPending);
    res.innerHTML = est ? `<div class="lb-result__bars"><span style="--w:100%"></span><span class="is-new" style="--w:${clamp(est.bytes / d.bytes * 100, 1.5, 100)}%"></span></div>
      <div class="lb-result__nums"><span>${formatBytes(d.bytes)}</span>${icon('arrow-right', { size: 14 })}<b>${formatBytes(est.bytes)}</b><span class="lb-delta ${L.down ? '' : 'is-up'}">${L.delta}</span></div>
      <div class="lb-result__sub">${esc(est.plan.passthrough ? 'Unchanged — saves the original bytes, no re-encode.' : `${est.plan.W} × ${est.plan.H} px${S.exp.max ? ` · quality ${est.quality} fits ${S.exp.maxKB} kB` : ''}${est.plan.small ? ' · already smaller than the limit' : ''}`)}</div>` : '<div class="lb-result__sub">Estimating…</div>';
    const q = $('#q-auto'); if (q && S.exp.max && est) q.textContent = `auto ${est.quality}`;
    const nm = $('#exp-name'); if (nm && document.activeElement !== nm) nm.value = est?.plan.name || planFor(d).name;
    const note = $('#fmt-note'); if (note) { const n = est?.plan.note || S.fmtNote || ''; note.textContent = n; note.hidden = !n; }
  }
  // mobile
  $$('.lb-mexport').forEach((b) => (b.innerHTML = `${icon('download')}<span>Export${est ? ` · ${formatBytes(est.bytes)}` : ''}</span>`));
  const mest = $('#m-est'); if (mest) mest.innerHTML = est ? `${esc(L.fmt)} · <b>${formatBytes(est.bytes)}</b> <span class="lb-delta">${L.delta}</span>` : 'Estimating…';
  const msave = $('#m-save'); if (msave) msave.innerHTML = `${icon('download')}<span>Save image${est ? ` · ${formatBytes(est.bytes)}` : ''}</span>`;
  const lab = $('#label-after'); if (lab && est) lab.innerHTML = `<b>${esc(est.plan.passthrough ? 'Original bytes' : `${FMT[est.plan.format]}${est.plan.format === 'png' ? '' : ' ' + est.quality}`)}</b> · ${formatBytes(est.bytes)}`;
}
function scopeDocs() { const d = doc(); if (!d) return []; return S.exp.scope === 'all' ? ready() : S.exp.scope === 'selected' && sel().length ? [...new Set([d, ...sel()])] : [d]; }
function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (S.exp.preset === id) { S.exp.preset = null; if (id === 'favicon') S.fav = null; renderPanel(); queueEstimate(); return; }
  if (id === 'favicon') { S.exp.preset = 'favicon'; renderPanel(); buildFavicons(); return; }
  S.fav = null;
  Object.assign(S.exp, p.set, { preset: id });
  if (S.exp.box) { S.splitOn = false; } else S.splitOn = true;
  S.fmtNote = '';
  renderPanel(); schedule(); queueEstimate(60); renderDock();
}
function setExp(patch, { keepPreset = false } = {}) {
  Object.assign(S.exp, patch); if (!keepPreset) { S.exp.preset = null; S.fav = null; if (!('box' in patch)) S.exp.box = null; }
  S.splitOn = !S.exp.box; S.fmtNote = '';
  queueEstimate(); syncExportPanel(); renderDock();
}
async function save() {
  const list = scopeDocs(); if (!list.length) return;
  if (S.exp.preset === 'favicon') return saveFavicons();
  if (list.length > 1) return saveBatch(list);
  const d = list[0], btn = $('#save');
  btn?.classList.add('is-busy');
  const fresh = S.est && S.est.docId === d.id && !S.estPending ? S.est : await exportOne(d);
  const name = ($('#exp-name')?.value || fresh.plan.name).trim();
  E.download(fresh.blob, name);
  btn?.classList.remove('is-busy');
  const sum = $('#exp-sum'); if (sum) { sum.innerHTML = `<span class="lb-expbar__fmt lb-ok">${icon('circle-check', { size: 14 })} Saved ${esc(name)}</span><span class="lb-expbar__size">${formatBytes(fresh.bytes)} · in your Downloads</span>`; setTimeout(updateEstimateUI, 3500); }
}
async function saveBatch(list) {
  const B = S.batch = { list, done: 0, inB: 0, outB: 0, cancel: false, t0: performance.now() };
  list.forEach((d) => (d.job = { p: 0.02 })); renderDock(); updateBatchUI();
  const files = [], names = new Set();
  for (const d of list) {
    if (B.cancel) break;
    d.job = { p: 0.08 }; updateThumbJob(d);
    const t0 = performance.now();
    const tick = setInterval(() => { d.job.p = Math.min(0.88, d.job.p + 0.07); updateThumbJob(d); }, 45);
    const r = await exportOne(d);
    await wait(Math.max(0, 150 - (performance.now() - t0)));
    clearInterval(tick);
    let name = r.plan.name; let n = 2; while (names.has(name)) name = r.plan.name.replace(/(\.\w+)$/, `-${n++}$1`); names.add(name);
    files.push({ name, data: r.blob });
    d.job = { p: 1, done: true, bytes: r.bytes }; B.done++; B.inB += d.bytes; B.outB += r.bytes;
    updateThumbJob(d); updateBatchUI();
  }
  if (B.cancel) {
    toast(`Stopped after ${B.done} of ${list.length} — nothing was saved`, { type: 'neutral' });
  } else {
    const z = await E.zip(files);
    E.download(z, `photos-${suffix()}.zip`);
    toast(`${list.length} saved · ${formatBytes(B.inB)} → ${formatBytes(B.outB)}`, { type: 'success' });
  }
  S.batch = null; updateBatchUI(); renderDock();
  setTimeout(() => { list.forEach((d) => { if (d.job?.done || B.cancel) d.job = null; }); renderDock(); }, 4000);
}
function updateThumbJob(d) {
  const t = $(`.lb-thumb[data-id="${d.id}"]`); if (!t) return;
  let j = t.querySelector('.lb-job'); if (!j) { j = h('<span class="lb-job"></span>'); t.append(j); }
  j.className = 'lb-job' + (d.job?.done ? ' is-done' : '');
  j.innerHTML = d.job?.done ? `<span class="lb-job__ok">${icon('check', { size: 14 })}</span><span class="lb-job__b">${formatBytes(d.job.bytes)}</span>` : `<span class="fw-ring lb-job__ring" style="--value:${Math.round((d.job?.p || 0) * 100)}"></span>`;
}
function updateBatchUI() {
  const B = S.batch, sum = $('#exp-sum'), sv = $('#save'); if (!sum) return;
  if (!B) { updateEstimateUI(); return; }
  const left = B.list.length - B.done, per = B.done ? (performance.now() - B.t0) / B.done : 400;
  sum.innerHTML = `<span class="lb-expbar__fmt">Saving ${Math.min(B.done + 1, B.list.length)} of ${B.list.length} · ~${Math.max(1, Math.round(left * per / 1000))} s</span>
    <span class="lb-expbar__size">${B.done ? `${formatBytes(B.inB)} → <b>${formatBytes(B.outB)}</b>` : 'Each photo uses its own edits'}</span>
    <div class="fw-progress fw-progress--thin lb-expbar__prog"><div class="fw-progress__track"><div class="fw-progress__bar" style="--value:${B.done / B.list.length * 100}%"></div></div></div>`;
  if (sv) { sv.innerHTML = `${icon('x')}<span>Cancel</span>`; sv.classList.remove('fw-btn--primary'); }
}

// Favicon pack: real PNGs, a real .ico (PNG-in-ICO), manifest and the <link> snippet.
async function buildFavicons() {
  const d = doc(); if (!d) return;
  S.fav = { loading: true }; renderPanel();
  const src = E.render(d, { maxDim: 1024 });
  const s = Math.min(src.width, src.height), sq = document.createElement('canvas'); sq.width = sq.height = 512;
  const alpha = E.hasAlpha(d);
  if (alpha) { const k = 512 * 0.9 / Math.max(src.width, src.height); sq.getContext('2d').drawImage(src, (512 - src.width * k) / 2, (512 - src.height * k) / 2, src.width * k, src.height * k); }
  else sq.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, 512, 512);
  const sizes = [16, 32, 48, 180, 192, 512], blobs = {};
  for (const n of sizes) blobs[n] = (await E.encode(sq, { format: 'png', width: n, height: n })).blob;
  const icoB = await E.ico([16, 32, 48].map((n) => ({ size: n, png: blobs[n] })));
  const manifest = JSON.stringify({ name: 'My site', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2);
  const files = [{ name: 'favicon.ico', data: icoB, note: '16 · 32 · 48' }, { name: 'apple-touch-icon.png', data: blobs[180], note: '180 × 180' }, { name: 'icon-192.png', data: blobs[192], note: '192 × 192' }, { name: 'icon-512.png', data: blobs[512], note: '512 × 512' }, { name: 'site.webmanifest', data: new Blob([manifest], { type: 'application/manifest+json' }), note: 'Web app manifest' }];
  const urls = { 16: URL.createObjectURL(blobs[32]), 180: URL.createObjectURL(blobs[180]) };
  if (S.exp.preset !== 'favicon') return;
  S.fav = { files, urls, total: files.reduce((a, f) => a + f.data.size, 0), alpha };
  renderPanel();
}
async function saveFavicons() { if (!S.fav?.files) return; E.download(await E.zip(S.fav.files), 'favicon-pack.zip'); const sum = $('#exp-sum'); if (sum) sum.innerHTML = `<span class="lb-expbar__fmt lb-ok">${icon('circle-check', { size: 14 })} Saved favicon-pack.zip</span><span class="lb-expbar__size">${S.fav.files.length} files · ${formatBytes(S.fav.total)}</span>`; }

// Apply the look (light & colour) of this photo to the selected ones.
async function applyToSelected() {
  const d = doc(), targets = sel().filter((x) => x !== d); if (!targets.length) return;
  const look = d.recipe.filter((s) => s.on && (s.type === 'adjust' || s.type === 'auto'));
  const backup = targets.map((t) => [t, t.recipe.slice()]);
  for (const t of targets) { t.job = { p: 0.1 }; updateThumbJob(t); }
  for (const t of targets) {
    const tick = setInterval(() => { t.job.p = Math.min(0.9, t.job.p + 0.12); updateThumbJob(t); }, 40);
    t.recipe.push(...look.map((s) => ({ ...s, id: ++uid, t: 0 }))); t.redo = [];
    t.thumb = thumbOf(t); const im = $(`.lb-thumb[data-id="${t.id}"] img`); if (im) im.src = t.thumb;
    await wait(220); clearInterval(tick);
    t.job = { p: 1, done: true, bytes: 0, applied: true }; updateThumbJob(t);
    $(`.lb-thumb[data-id="${t.id}"]`)?.classList.add('is-edited');
  }
  setTimeout(() => { targets.forEach((t) => (t.job = null)); renderDock(); }, 1400);
  toast(`Applied ${look.length} edit${look.length > 1 ? 's' : ''} to ${targets.length} photo${targets.length > 1 ? 's' : ''}`, { type: 'success', action: { label: 'Undo', onClick: () => { backup.forEach(([t, r]) => { t.recipe = r; t.thumb = thumbOf(t); }); renderDock(); } } });
}

// ───────────────────────── navigation & modes ─────────────────────────
function go(i, { swipe = 0 } = {}) {
  const list = S.docs; if (i < 0 || i >= list.length || list[i].loading) return false;
  if (S.cropping) commitCrop(); if (S.refine) toggleRefine(false);
  const prev = S.active; S.active = i; S.zoom = 'fit'; S.pan = { x: 0, y: 0 }; S.est = null;
  if (swipe) { S.swipeDx = swipe * (S.view?.sw || 400) * 0.6; layout(); view.classList.add('is-settling'); }
  renderAll(); afterOpen();
  if (swipe) { requestAnimationFrame(() => { S.swipeDx = 0; layout(); setTimeout(() => view.classList.remove('is-settling'), 280); }); }
  return prev !== i;
}
function setMode(m) {
  if (S.mode === m) return;
  if (S.cropping) commitCrop(); if (S.refine) toggleRefine(false);
  S.mode = m; wb.dataset.mode = m;
  const l = MODES.find((x) => x.id === m);
  history.replaceState(null, '', `?leaf=${l.leaf}${params.has('demo') ? '&demo=' + params.get('demo') : ''}`);
  document.title = `${{ edit: 'Edit image', markup: 'Mark up image', inspect: 'Inspect image', export: 'Export image' }[m]} · Fernwork`;
  if (m === 'export') { S.splitOn = !S.exp.box; if (S.est?.url) after.src = S.est.url; }
  $$('#mode-seg .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m)));
  renderPanel(); schedule(); renderHud(); queueEstimate(30);
  if (m === 'inspect') ensurePalette();
}
function closeDoc(d = doc()) {
  if (!d) return; const i = S.docs.indexOf(d);
  S.docs.splice(i, 1); S.active = Math.min(i, S.docs.length - 1); S.est = null;
  renderAll();
  toast(`Closed ${d.name}${d.recipe.length ? ` · ${d.recipe.length} edits kept for Undo` : ''}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.docs.splice(i, 0, d); S.active = i; renderAll(); } } });
}
function closeAll() {
  const old = S.docs.slice(), oldF = S.failed.slice(); S.docs = []; S.failed = []; S.active = -1; renderAll();
  toast(`Closed ${old.length} photos`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.docs = old; S.failed = oldF; S.active = 0; renderAll(); } } });
}
function pickFiles() { const i = h('<input type="file" multiple accept="image/*,.heic,.heif" hidden>'); i.onchange = () => { if (i.files.length) openFiles([...i.files], { source: 'picker' }); i.remove(); }; document.body.append(i); i.click(); }

// ───────────────────────── rendering: frame bar ─────────────────────────
function renderFramebar() {
  const d = doc(), fb = $('#framebar');
  const n = ready().length;
  if (!d) {
    fb.innerHTML = `<span class="lb-fb-title">${icon('images', { size: 16 })}<span>Images</span></span><span class="fw-spacer"></span>
      <button class="fw-btn fw-btn--sm" type="button" id="fb-open">${icon('folder-open')}Open photos</button>`;
    $('#fb-open').onclick = pickFiles; return;
  }
  const inf = d.info;
  fb.innerHTML = `
    <button class="fw-filechip" type="button" id="filechip" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(d.name)} · ${S.active + 1} of ${n} · switch photo">
      <span class="fw-filechip__thumb"><img alt="" src="${d.thumb}"></span>
      <span class="fw-filechip__name">${esc(d.name)}</span><span class="lb-fb-count fw-show-mobile">${S.active + 1}/${n}</span>${icon('chevron-down', { size: 14 })}</button>
    <span class="lb-fb-meta" id="fb-meta"></span>
    <span class="fw-divider-v fw-hide-compact"></span>
    <div class="fw-seg fw-seg--sm fw-hide-compact" aria-label="Mode" id="mode-seg">${MODES.map((m) => `<button class="fw-seg__opt" type="button" aria-checked="${m.id === S.mode}" data-value="${m.id}">${m.label}</button>`).join('')}</div>
    <span class="fw-spacer"></span>
    <div class="fw-framebar__group">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z">${icon('undo-2')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z">${icon('redo-2')}</button></div>
    <span class="fw-divider-v fw-hide-compact"></span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm fw-hide-compact lb-cmpbtn" type="button" id="cmp" aria-label="Compare with the original (hold)" data-tip="${S.mode === 'export' ? 'Toggle split view' : 'Hold to see the original'}" data-tip-kbd="\\">${icon('circle-half')}<span class="lb-hide-narrow">Compare</span></button>
    <button class="fw-iconbtn fw-iconbtn--sm fw-hide-compact" type="button" id="t-panel" aria-label="Toggle panel" data-tip="Panel" data-tip-kbd="mod+." aria-pressed="${S.panel}">${icon('panel-right')}</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="fb-more" aria-label="More" data-tip="More">${icon('ellipsis')}</button>`;
  enhance(fb);
  $('#mode-seg').addEventListener('fw-change', (e) => setMode(e.detail.value));
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $('#t-panel').onclick = () => togglePanel();
  const cmp = $('#cmp');
  if (S.mode === 'export') cmp.onclick = () => { S.splitOn = !S.splitOn; placeSplit(); renderHud(); };
  else holdCompare(cmp);
  $('#filechip').onclick = (e) => (isMobile() ? openPhotoSheet() : openMenu(e.currentTarget, [
    { group: `${n} open photo${n > 1 ? 's' : ''}`, items: ready().map((x) => ({ label: x.name, sub: `${x.w} × ${x.h} · ${formatBytes(x.bytes)}${x.recipe.length ? ' · edited' : ''}`, checked: x === d, onSelect: () => go(S.docs.indexOf(x)) })) },
    { items: [{ label: 'Close this photo', icon: 'x', kbd: 'backspace', onSelect: () => closeDoc() }] }]));
  $('#fb-more').onclick = (e) => openMenu(e.currentTarget, [
    { label: 'Open photos…', icon: 'folder-open', kbd: 'mod+o', onSelect: pickFiles },
    { label: 'Select all photos', icon: 'list-checks', onSelect: () => { ready().forEach((x) => (x.sel = true)); renderDock(); renderPanel(); } },
    { label: 'Reset all edits', icon: 'rotate-ccw', onSelect: resetAll },
    { label: 'Close all', icon: 'x', onSelect: closeAll },
    { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', onSelect: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) }], { placement: 'bottom-end' });
  updateFrameMeta(); updateUndo();
}
function updateFrameMeta() {
  const d = doc(), m = $('#fb-meta'); if (!d || !m) return;
  const g = E.geometry(d, E.effective(d));
  const loc = d.info?.location && S.exp.meta !== 'keep';
  m.innerHTML = `<span class="fw-hide-compact">${g.ow} × ${g.oh}</span><span class="lb-dot fw-hide-compact"></span><span class="fw-hide-compact">${esc(d.kind)}</span><span class="lb-dot fw-hide-compact"></span><span class="fw-hide-compact">${formatBytes(d.bytes)}</span>
    ${d.info?.location ? `<button class="lb-locchip ${loc ? '' : 'is-kept'}" type="button" id="locchip" data-tip="${loc ? 'Removed when you export' : 'Kept when you export'}">${icon('map-pin', { size: 13 })}<span>Location</span></button>` : ''}`;
  const lc = $('#locchip'); if (lc) { lc.setAttribute('aria-label', `Location included · ${loc ? 'removed' : 'kept'} when you export`); lc.onclick = () => (isMobile() ? setMtab('inspect') : setMode('inspect')); }
}
function updateUndo() { const d = doc(); const u = $('#undo'), r = $('#redo'); if (u) u.disabled = !d?.recipe.length && !S.cropping; if (r) r.disabled = !d?.redo.length; }
function holdCompare(el) {
  if (!el) return;
  const on = (e) => { e.preventDefault(); S.compare = true; schedule(); renderHud(); el.setAttribute('aria-pressed', 'true'); };
  const off = () => { if (!S.compare) return; S.compare = false; schedule(); renderHud(); el.setAttribute('aria-pressed', 'false'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
  el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { if (!S.compare) on(e); } });
  el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') off(); });
}
function togglePanel(v = !S.panel) { S.panel = v; $('#lb-main').classList.toggle('has-inspector', v); $('#t-panel')?.setAttribute('aria-pressed', String(v)); setTimeout(() => schedule(), 260); }

// ───────────────────────── rendering: dock (filmstrip + export bar) ─────────────────────────
function renderDock() {
  const dock = $('#dock'), d = doc();
  if (!S.docs.length && !S.failed.length) { dock.innerHTML = ''; return; }
  const nSel = sel().length;
  const o = S.opened;
  dock.innerHTML = `
    <div class="lb-strip" role="listbox" aria-label="Open photos" aria-multiselectable="true" id="strip">
      ${S.docs.map((x, i) => x.loading ? `<div class="lb-thumb is-loading" style="--ar:1.4"><span class="fw-skel"></span></div>`
        : `<button class="lb-thumb ${x.recipe.some((s) => s.on) ? 'is-edited' : ''}" type="button" role="option" data-i="${i}" data-id="${x.id}" aria-selected="${!!x.sel}" aria-current="${i === S.active}" style="--ar:${(x.w / x.h).toFixed(3)}" aria-label="${esc(x.name)}${x.sel ? ', selected' : ''}" title="${esc(x.name)}">
          <img alt="" src="${x.thumb}" draggable="false">${x.kind === 'HEIC' ? '<span class="lb-thumb__badge">HEIC</span>' : ''}<span class="lb-thumb__dot" aria-hidden="true"></span><span class="lb-thumb__check" aria-hidden="true">${icon('check', { size: 12 })}</span></button>`).join('')}
      ${S.failed.map((f) => `<div class="lb-thumb lb-thumb--error" role="note" data-fid="${f.id}">${icon('triangle-alert', { size: 16 })}<span class="lb-thumb__err"><b>${esc(f.name)}</b><span>${esc(f.reason)}</span></span><button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss ${esc(f.name)}" data-dismiss="${f.id}">${icon('x')}</button></div>`).join('')}
      <button class="lb-add" type="button" id="add" aria-label="Add photos" data-tip="Add photos" data-tip-kbd="mod+o">${icon('plus', { size: 18 })}<span>Add</span></button>
    </div>
    <div class="lb-dock__mid">
      ${o && (o.failed || Date.now() - o.t < 5000) ? `<span class="lb-opened ${o.failed ? 'has-fail' : ''}">${icon(o.failed ? 'triangle-alert' : 'circle-check', { size: 14 })}${o.n} opened${o.failed ? ` · ${o.failed} couldn’t be read` : ''}</span>` : ''}
      ${nSel ? `<span class="lb-selinfo">${nSel} selected <button class="lb-link" type="button" id="sel-clear">Clear</button></span>` : `<span class="lb-selhint">${kbd('mod')}-click to select several</span>`}
    </div>
    <div class="lb-expbar">
      <button class="lb-expbar__sum" type="button" id="exp-sum" aria-label="Export settings" data-tip="Export settings" data-tip-kbd="e"></button>
      <button class="fw-btn fw-btn--primary lb-save" type="button" id="save" ${d ? '' : 'disabled'} data-tip="Save" data-tip-kbd="mod+s"></button>
    </div>`;
  enhance(dock);
  $$('.lb-thumb[data-i]', dock).forEach((b) => (b.onclick = (e) => thumbClick(e, +b.dataset.i)));
  $$('[data-dismiss]', dock).forEach((b) => (b.onclick = () => { S.failed = S.failed.filter((f) => f.id !== +b.dataset.dismiss); if (S.opened) S.opened.failed = S.failed.length; renderDock(); }));
  $('#add').onclick = pickFiles;
  $('#sel-clear') && ($('#sel-clear').onclick = () => { S.docs.forEach((x) => (x.sel = false)); renderDock(); renderPanel(); });
  $('#exp-sum').onclick = () => setMode('export');
  $('#save').onclick = () => (S.batch ? (S.batch.cancel = true) : save());
  roving($('#strip'), '.lb-thumb[data-i]', { orientation: 'horizontal' });
  S.docs.forEach((x) => x.job && updateThumbJob(x));
  const st = $('#strip'), cur = st.querySelector('.lb-thumb[aria-current="true"]');
  if (cur) st.scrollLeft = Math.max(0, cur.offsetLeft - st.clientWidth / 2 + cur.offsetWidth / 2);
  if (S.batch) updateBatchUI(); else updateEstimateUI();
}
function thumbClick(e, i) {
  const x = S.docs[i]; if (!x || x.loading) return;
  if (e.metaKey || e.ctrlKey) { x.sel = !x.sel; if (x.sel && doc() && !doc().sel && doc() !== x) doc().sel = true; renderDock(); renderPanel(); return; }
  if (e.shiftKey && S.active >= 0) { const [a, b] = [Math.min(S.active, i), Math.max(S.active, i)]; S.docs.forEach((y, k) => (y.sel = k >= a && k <= b)); renderDock(); renderPanel(); return; }
  go(i);
}

// ───────────────────────── rendering: panel per mode ─────────────────────────
function renderPanel() {
  const p = $('#panel'), d = doc();
  if (!d) { p.innerHTML = `<div class="fw-insp-section"><p class="fw-t-sm fw-muted">Open photos to edit, mark up, inspect and export them.</p></div>`; return; }
  if (S.cropping) p.innerHTML = cropPanel();
  else p.innerHTML = { edit: editPanel, markup: markupPanel, inspect: inspectPanel, export: exportPanel }[S.mode](d);
  enhance(p); wirePanel(p, d);
}
function sliderHtml(k, d) {
  const v = E.effective(d).adj[k];
  return `<div class="fw-slider lb-adj" data-k="${k}"><label class="fw-slider__label" for="adj-${k}">${icon(E.ADJ_ICON[k], { size: 14 })}${E.ADJ_LABEL[k]}</label><output class="fw-slider__value" for="adj-${k}"></output>
    <input id="adj-${k}" type="range" min="-100" max="100" value="${v}" data-adj="${k}" aria-describedby="adj-hint"></div>`;
}
function editPanel(d) {
  const e = E.effective(d), nSel = sel().filter((x) => x !== d).length;
  return `
  <section class="fw-insp-section lb-sec-bg" id="bg-block">${bgBlock(d)}</section>
  <section class="fw-insp-section">
    <div class="lb-quick" role="toolbar" aria-label="Quick edits" data-roving="button">
      <button class="lb-qbtn" type="button" id="q-crop" data-tip="Crop & straighten" data-tip-kbd="c">${icon('crop', { size: 18 })}<span>Crop</span></button>
      <button class="lb-qbtn" type="button" id="q-rot" data-tip="Rotate right">${icon('rotate-cw', { size: 18 })}<span>Rotate</span></button>
      <button class="lb-qbtn" type="button" id="q-flip" data-tip="Flip horizontal">${icon('flip-horizontal', { size: 18 })}<span>Flip</span></button>
      <button class="lb-qbtn" type="button" id="q-auto" data-tip="Auto enhance from the histogram">${icon('sparkles', { size: 18 })}<span>Auto</span></button>
    </div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Light & color <span class="fw-spacer"></span><span class="fw-faint lb-hint" id="adj-hint">Double-click to reset</span></div>
    ${E.ADJ_KEYS.map((k) => sliderHtml(k, d)).join('')}
  </section>
  <section class="fw-insp-section lb-history">
    <div class="fw-insp-section__head">History <span class="fw-badge" id="hist-n">${d.recipe.length}</span><span class="fw-spacer"></span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="reset" ${d.recipe.length ? '' : 'disabled'}>Reset</button></div>
    <ol class="lb-hist" id="hist"></ol>
    ${nSel ? `<button class="fw-btn fw-btn--subtle fw-btn--block" type="button" id="apply-sel">${icon('images')}Apply light & color to ${nSel} selected</button>`
      : `<p class="lb-tip">${icon('images', { size: 14 })}<span>${kbd('mod')}-click photos in the strip to give them the same look.</span></p>`}
  </section>`;
}
function bgBlock(d) {
  const e = E.effective(d), j = S.bgJob && S.bgJob.docId === d.id ? S.bgJob : null;
  if (j?.phase === 'model') return `<div class="lb-bgprog" role="status"><span class="fw-ring" style="--value:${Math.round(j.got / 88 * 100)}"></span>
      <div class="lb-bgprog__text"><b>Downloading cut-out model</b><span><span class="lb-bgprog__mb">${Math.round(j.got)} of 88 MB</span> · once, then offline</span></div>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="bg-cancel" aria-label="Cancel download" data-tip="Cancel">${icon('x')}</button></div>`;
  if (j?.phase === 'run') return `<div class="lb-bgprog" role="status"><span class="fw-spinner"></span><div class="lb-bgprog__text"><b>Finding the subject…</b><span>On this device · nothing is uploaded</span></div></div>`;
  if (j?.phase === 'unavailable') return `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('info')}</span><div class="fw-alert__body">In this mockup the cut-out is pre-rendered for the dog photos. The real tool runs the model on any photo.
      <div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" id="bg-dog">Show with the dog</button></div></div></div>`;
  if (!e.bg) return `<button class="fw-btn fw-btn--lg fw-btn--block lb-bgbtn" type="button" id="bg-go">${icon('scissors', { size: 18 })}Remove background</button>
      <p class="lb-sub">${S.modelReady ? 'Model ready · works offline' : 'One-time 88 MB download, then offline'}</p>`;
  const fill = e.bg.fill;
  return `<div class="lb-bgcard">
    <div class="lb-bgcard__head">${icon('circle-check', { size: 16 })}<b>Background removed</b><span class="fw-badge">On device</span></div>
    <div class="lb-bgcard__row">
      <button class="fw-btn fw-btn--sm" type="button" id="bg-cmp" aria-label="Hold to compare with the original">${icon('circle-half')}Compare</button>
      <button class="fw-btn fw-btn--sm" type="button" id="bg-refine" aria-pressed="${!!S.refine}">${icon('brush')}${S.refine ? 'Done refining' : 'Refine edge'}</button></div>
    ${S.refine ? `<div class="lb-refine">
      <div class="fw-seg fw-seg--sm" aria-label="Brush" id="refine-mode"><button class="fw-seg__opt" type="button" data-value="erase" aria-checked="${S.refine.mode === 'erase'}">${icon('eraser', { size: 14 })} Erase</button><button class="fw-seg__opt" type="button" data-value="restore" aria-checked="${S.refine.mode === 'restore'}">${icon('brush', { size: 14 })} Restore</button></div>
      <div class="fw-slider"><label class="fw-slider__label" for="brush-r">Brush</label><output class="fw-slider__value"></output><input id="brush-r" type="range" min="6" max="60" value="${S.refine.r}" data-unit=" px"></div>
      <p class="lb-sub">Paint over leftovers like grass. Faint areas show what was removed.</p></div>` : ''}
    <div class="lb-field-label">Fill</div>
    <div class="fw-seg lb-seg-full" aria-label="Background fill" id="bg-fill">${Object.entries(FILL_LABEL).map(([k, l]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${k === fill}">${l}</button>`).join('')}</div>
    ${fill === 'color' ? `<div class="lb-swatches" role="radiogroup" aria-label="Fill colour">${['#dbeafe', '#fde68a', '#fecdd3', '#d1fae5', '#e9d5ff', '#111827'].map((c) => `<button class="lb-sw" type="button" role="radio" aria-checked="${e.bg.color === c}" style="--c:${c}" data-fillc="${c}" aria-label="${c}"></button>`).join('')}</div>` : ''}
    <label class="lb-togrow"><span>Soft shadow</span><span class="fw-toggle"><input type="checkbox" id="bg-shadow" ${e.bg.shadow ? 'checked' : ''}></span></label>
  </div>`;
}
function renderBgBlock() { const el = $('#bg-block'); const d = doc(); if (el && d && S.mode === 'edit' && !S.cropping) { el.innerHTML = bgBlock(d); enhance(el); wireBg(el); } renderMobilePanel(); }
function wireBg(root) {
  root.querySelector('#bg-go')?.addEventListener('click', removeBg);
  root.querySelector('#bg-cancel')?.addEventListener('click', () => { if (S.bgJob) S.bgJob.cancel = true; });
  root.querySelector('#bg-dog')?.addEventListener('click', () => { S.bgJob = null; const i = S.docs.findIndex((x) => x.name === 'dog-in-the-park.jpg'); if (i >= 0) { go(i); setTimeout(removeBg, 300); } else loadSamples(spec(['dog-in-the-park.jpg'])).then((f) => openFiles(f).then(() => { go(S.docs.length - 1); setTimeout(removeBg, 300); })); });
  holdCompare(root.querySelector('#bg-cmp'));
  root.querySelector('#bg-refine')?.addEventListener('click', () => toggleRefine());
  root.querySelector('#refine-mode')?.addEventListener('fw-change', (e) => { S.refine.mode = e.detail.value; });
  root.querySelector('#brush-r')?.addEventListener('input', (e) => { S.refine.r = +e.target.value; });
  root.querySelector('#bg-fill')?.addEventListener('fw-change', (e) => setFill(e.detail.value));
  root.querySelectorAll('[data-fillc]').forEach((b) => (b.onclick = () => { E.effective(doc()).bg.color = b.dataset.fillc; changed(); renderBgBlock(); }));
  root.querySelector('#bg-shadow')?.addEventListener('change', (e) => { E.effective(doc()).bg.shadow = e.target.checked; changed(); updateHistory(); });
}
function cropPanel() {
  const c = S.cropping;
  return `<section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('crop', { size: 14 })} Crop & straighten</div>
    <div class="lb-aspects" role="group" aria-label="Aspect ratio">${ASPECTS.map((a) => `<button class="fw-chip" type="button" data-aspect="${a.id}" aria-pressed="${c.aspect === a.id}">${a.label}</button>`).join('')}</div>
    <div class="fw-slider"><label class="fw-slider__label" for="straighten">Straighten</label><output class="fw-slider__value" id="straighten-val">${c.straighten.toFixed(1)}°</output>
      <input id="straighten" type="range" min="-15" max="15" step="0.1" value="${c.straighten}"></div>
    <div class="lb-quick lb-quick--3">
      <button class="lb-qbtn" type="button" id="c-rotl">${icon('rotate-ccw', { size: 18 })}<span>Left</span></button>
      <button class="lb-qbtn" type="button" id="c-rotr">${icon('rotate-cw', { size: 18 })}<span>Right</span></button>
      <button class="lb-qbtn" type="button" id="c-flip">${icon('flip-horizontal', { size: 18 })}<span>Flip</span></button></div>
    <div class="lb-actions"><button class="fw-btn" type="button" id="c-cancel">Cancel</button><button class="fw-btn fw-btn--primary" type="button" id="c-done">${icon('check')}Done ${kbd('enter', 'fw-kbd--on-accent')}</button></div>
  </section>`;
}
function markupPanel(d) {
  const marks = d.recipe.filter((s) => s.type === 'mark');
  return `<section class="fw-insp-section">
    <div class="fw-insp-section__head">Tools</div>
    <div class="lb-tools" role="toolbar" aria-label="Markup tools" id="tools">${TOOLS.map((t) => `<button class="lb-qbtn" type="button" data-tool="${t.id}" aria-pressed="${S.tool === t.id}" data-tip="${t.label}" data-tip-kbd="${t.key}">${icon(t.icon, { size: 18 })}<span>${t.label}</span></button>`).join('')}</div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Style</div>
    <div class="lb-swatches" role="radiogroup" aria-label="Colour">${COLORS.map((c) => `<button class="lb-sw" type="button" role="radio" aria-checked="${S.color === c}" style="--c:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="fw-seg lb-seg-full" aria-label="Size" id="msize">${['s', 'm', 'l'].map((k) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${S.size === k}">${{ s: 'Thin', m: 'Medium', l: 'Bold' }[k]}</button>`).join('')}</div>
    ${S.tool === 'blur' ? `<p class="lb-sub">${icon('shield-check', { size: 14 })} Blur pixelates for real in the export — nothing hides underneath.</p>` : ''}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Layers <span class="fw-badge">${marks.length}</span></div>
    ${marks.length ? `<ol class="lb-hist">${[...marks].reverse().map((s) => histRow(s)).join('')}</ol>` : `<div class="lb-emptynote">${icon('pencil', { size: 16 })}<span>Draw on the photo. Every mark stays editable until you export.</span></div>`}
  </section>`;
}
function inspectPanel(d) {
  const inf = d.info || {}, mp = (d.w * d.h / 1e6).toFixed(1);
  const loc = inf.location, removing = S.exp.meta !== 'keep';
  const pal = d.palette;
  const o = d.ocr;
  return `<section class="fw-insp-section">
    <div class="lb-facts"><b>${d.w} × ${d.h}</b><span>${mp} MP · ${esc(d.kind)} · ${formatBytes(d.bytes)}${d.kind === 'HEIC' ? ' · decoded on this device' : ''}</span></div>
  </section>
  <section class="fw-insp-section">
    ${loc ? `<div class="lb-loc ${removing ? '' : 'is-kept'}">
      <div class="lb-loc__map" aria-hidden="true">${mapSvg(loc)}</div>
      <div class="lb-loc__body"><div class="lb-loc__title">${icon('map-pin', { size: 14 })}Location included</div>
        <div class="lb-loc__place">${esc(inf.place || 'Unknown place')}</div><div class="lb-loc__coord">${E.fmtCoord(loc)}</div></div>
      <label class="lb-togrow lb-loc__tog"><span>Remove when exporting</span><span class="fw-toggle"><input type="checkbox" id="loc-remove" ${removing ? 'checked' : ''}></span></label>
    </div>` : `<div class="fw-banner fw-banner--ok"><span class="fw-banner__icon">${icon('shield-check')}</span><span class="fw-banner__text">No location in this photo</span></div>`}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('camera', { size: 14 })} Camera</div>
    ${inf.camera ? `<dl class="fw-insp-kv lb-kv">
      <dt>Camera</dt><dd>${esc(inf.camera)}</dd>${inf.lens ? `<dt>Lens</dt><dd>${esc(inf.lens)}</dd>` : ''}${inf.exposure ? `<dt>Exposure</dt><dd>${esc(inf.exposure)}</dd>` : ''}${inf.taken ? `<dt>Taken</dt><dd>${esc(inf.taken)}</dd>` : ''}
      <dt>Edits</dt><dd>${d.recipe.length ? `${d.recipe.length} · original kept` : 'None'}</dd></dl>
      <button class="lb-link" type="button" id="exif-all">All ${inf.count} metadata fields</button>` : `<p class="fw-t-sm fw-muted">No camera data in this file.</p>`}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('palette', { size: 14 })} Colors <span class="fw-spacer"></span>
      <div class="fw-seg fw-seg--sm" aria-label="Colour format" id="colfmt">${['hex', 'rgb', 'hsl'].map((f) => `<button class="fw-seg__opt" type="button" data-value="${f}" aria-checked="${S.colorFmt === f}">${f.toUpperCase()}</button>`).join('')}</div></div>
    <div class="lb-palette" id="palette">${pal ? pal.map((c, i) => `<button class="lb-pal" type="button" style="--c:${c.hex}" data-col="${i}" aria-label="Copy ${colStr(c)}"><span class="lb-pal__chip"></span><span class="lb-pal__val">${colStr(c)}</span></button>`).join('') : '<span class="fw-skel" style="height:56px;width:100%"></span>'}</div>
    <div class="lb-row2"><button class="fw-btn fw-btn--sm" type="button" id="pal-css">${icon('braces')}Copy as CSS variables</button><a class="fw-btn fw-btn--ghost fw-btn--sm" href="${hrefFor('pick-color')}" data-leaf="pick-color">Open in Color ${icon('arrow-up-right', { size: 14 })}</a></div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('scan-text', { size: 14 })} Text in the photo</div>
    ${o === 'loading' ? `<div class="lb-bgprog" role="status"><span class="fw-spinner"></span><div class="lb-bgprog__text"><b>${d.ocrPhase === 'engine' ? 'Loading the text engine' : 'Reading text…'}</b><span>${d.ocrPhase === 'engine' ? '4.2 MB · once, then offline' : 'On this device'}</span></div></div>`
      : o === 'none' ? `<p class="fw-t-sm fw-muted">No text found in this photo.</p>`
      : o ? `<div class="lb-ocrhead"><span>${o.lines.length} lines · ${o.lines.reduce((a, l) => a + l.words.length, 0)} words · ${esc(o.lang)}</span>
          <label class="lb-togrow lb-togrow--inline"><span>Boxes</span><span class="fw-toggle"><input type="checkbox" id="ocr-on" ${d.ocrOn ? 'checked' : ''}></span></label></div>
        <p class="lb-sub">Click a word on the photo to copy it, drag across words for a line.</p>
        <ol class="lb-lines" id="lines">${o.lines.map((l, i) => `<li><button class="lb-lines__row" type="button" data-l="${i}"><span>${esc(l.words.map((w) => w.t).join(' '))}</span>${icon('copy', { size: 14 })}</button></li>`).join('')}</ol>
        <button class="fw-btn fw-btn--sm fw-btn--block" type="button" id="ocr-all">${icon('copy')}Copy all text</button>`
      : `<button class="fw-btn fw-btn--block" type="button" id="ocr-go">${icon('scan-text')}Find text</button><p class="lb-sub">Menus, signs, receipts · runs on this device</p>`}
  </section>`;
}
function colStr(c) { return S.colorFmt === 'hex' ? c.hex : S.colorFmt === 'rgb' ? `rgb(${c.rgb.join(' ')})` : E.toHsl(c.rgb); }
function mapSvg(loc) { // stylised mini map (no tiles, no network): graticule + pin at the real position on a world grid
  const x = (loc.lon + 180) / 360 * 100, y = (90 - loc.lat) / 180 * 100;
  return `<svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice"><defs><pattern id="g" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-width=".3" opacity=".35"/></pattern></defs>
    <rect width="100" height="60" fill="url(#g)"/><g transform="translate(${50 - x * 0.5 * 2} ${30 - y * 0.6})"><circle cx="${x}" cy="${y * 0.6 + 0}" r="9" fill="currentColor" opacity=".12"/></g>
    <circle cx="50" cy="30" r="10" fill="currentColor" opacity=".14"/><circle cx="50" cy="30" r="3.2" fill="currentColor"/><circle cx="50" cy="30" r="1.3" fill="var(--surface-1)"/></svg>`;
}
function exportPanel(d) {
  const x = S.exp, n = ready().length, nSel = sel().length;
  if (x.preset === 'favicon') return favPanel(d);
  return `<section class="fw-insp-section">
    <div class="fw-insp-section__head">Presets</div>
    <div class="lb-presets" role="group" aria-label="Presets">${PRESETS.map((p) => `<button class="fw-chip" type="button" data-preset="${p.id}" aria-pressed="${x.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Format</div>
    <div class="fw-seg lb-seg-full" aria-label="Format" id="fmt">${Object.entries(FMT).map(([k, l]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${x.format === k}">${l}</button>`).join('')}</div>
    <p class="lb-sub" id="fmt-hint">${esc(FMT_HINT[x.format])}</p>
    <p class="lb-note" id="fmt-note" hidden></p>
    <div class="fw-slider" id="q-wrap" ${x.format === 'png' || x.format === 'original' ? 'hidden' : ''}><label class="fw-slider__label" for="quality">Quality</label><output class="fw-slider__value" id="q-auto"></output>
      <input id="quality" type="range" min="1" max="100" value="${x.quality}" data-unit=" %" ${x.max ? 'disabled' : ''}></div>
    <label class="lb-togrow" ${x.format === 'png' || x.format === 'original' ? 'hidden' : ''} id="max-row"><span>Max file size</span>
      <span class="lb-inline"><span class="fw-inputwrap lb-kb" ${x.max ? '' : 'hidden'}><input class="fw-input fw-input--mono" type="number" id="max-kb" value="${x.maxKB}" min="10" step="10" aria-label="Maximum size in kB"><span class="fw-inputwrap__end">kB</span></span>
      <span class="fw-toggle"><input type="checkbox" id="max-on" ${x.max ? 'checked' : ''}></span></span></label>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Size</div>
    ${x.box ? `<p class="fw-t-sm">${x.box.w} × ${x.box.h} px · ${x.box.fit === 'crop' ? 'cropped from the centre' : 'fitted on white'} <button class="lb-link" type="button" id="box-clear">Use photo size</button></p>`
      : `<div class="lb-sizerow"><div class="fw-seg fw-seg--sm" aria-label="Size" id="sizemode"><button class="fw-seg__opt" type="button" data-value="original" aria-checked="${x.size === 'original'}">Original</button><button class="fw-seg__opt" type="button" data-value="longest" aria-checked="${x.size === 'longest'}">Longest side</button></div>
      <span class="fw-inputwrap lb-px" ${x.size === 'longest' ? '' : 'hidden'}><input class="fw-input fw-input--mono" type="number" id="longest" value="${x.longest}" min="16" max="8000" step="10" aria-label="Longest side in pixels"><span class="fw-inputwrap__end">px</span></span></div>`}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Metadata</div>
    <div class="lb-radios" role="radiogroup" aria-label="Metadata" id="meta">
      ${[['location', 'Remove location', d.info?.location ? 'Recommended — this photo has GPS' : 'Keeps camera and date'], ['all', 'Remove all', 'No camera, date or location'], ['keep', 'Keep all', d.info?.location ? 'Includes where it was taken' : 'As in the original']].map(([v, l, s]) => `<label class="lb-radio"><input type="radio" name="meta" value="${v}" ${x.meta === v ? 'checked' : ''}><span><b>${l}</b><small>${s}</small></span></label>`).join('')}
    </div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Apply to</div>
    <div class="fw-seg lb-seg-full" aria-label="Apply to" id="scope"><button class="fw-seg__opt" type="button" data-value="this" aria-checked="${x.scope === 'this'}">This photo</button><button class="fw-seg__opt" type="button" data-value="selected" aria-checked="${x.scope === 'selected'}" ${nSel ? '' : 'disabled'}>Selected${nSel ? ` (${nSel})` : ''}</button><button class="fw-seg__opt" type="button" data-value="all" aria-checked="${x.scope === 'all'}">All ${n}</button></div>
    <div class="fw-field lb-name" ${x.scope === 'this' ? '' : 'hidden'}><label class="fw-field__label" for="exp-name">File name</label><input class="fw-input" id="exp-name" type="text" spellcheck="false" autocomplete="off"></div>
  </section>
  <section class="fw-insp-section lb-result" id="exp-result" aria-live="polite"></section>`;
}
function favPanel(d) {
  const f = S.fav;
  return `<section class="fw-insp-section">
    <div class="fw-insp-section__head">Presets</div>
    <div class="lb-presets" role="group" aria-label="Presets">${PRESETS.map((p) => `<button class="fw-chip" type="button" data-preset="${p.id}" aria-pressed="${S.exp.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Preview</div>
    ${!f || f.loading ? '<span class="fw-skel" style="height:120px"></span>' : `<div class="lb-favprev">
      <div class="lb-tab"><img alt="" src="${f.urls[16]}" width="16" height="16"><span>My site</span>${icon('x', { size: 12 })}</div>
      <div class="lb-home"><img alt="" src="${f.urls[180]}"><span>My site</span></div></div>
      <p class="lb-sub">${f.alpha ? 'Cut-out centred on transparency.' : 'Square from the centre — move it with Crop first if needed.'}</p>`}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Files <span class="fw-badge">${f?.files ? formatBytes(f.total) : '…'}</span></div>
    ${f?.files ? `<ul class="lb-files">${f.files.map((x) => `<li>${icon(x.name.endsWith('manifest') ? 'braces' : 'image', { size: 14 })}<span class="fw-mono">${x.name}</span><small>${x.note} · ${formatBytes(x.data.size)}</small></li>`).join('')}</ul>
    <div class="fw-field"><label class="fw-field__label">Paste into &lt;head&gt;</label>
      <pre class="lb-snippet" id="fav-snip">&lt;link rel="icon" href="/favicon.ico" sizes="48x48"&gt;
&lt;link rel="apple-touch-icon" href="/apple-touch-icon.png"&gt;
&lt;link rel="manifest" href="/site.webmanifest"&gt;</pre>
      <button class="fw-btn fw-btn--sm" type="button" data-copy-target="#fav-snip">${icon('copy')}Copy snippet</button></div>` : ''}
  </section>`;
}
function histRow(s) {
  return `<li class="lb-hist__row ${s.on ? '' : 'is-off'}" data-id="${s.id}">
    <button class="lb-hist__tog" type="button" aria-pressed="${s.on}" aria-label="${s.on ? 'Turn off' : 'Turn on'} ${esc(stepLabel(s))}" data-tog="${s.id}">${icon(s.on ? 'eye' : 'eye-off', { size: 15 })}</button>
    <span class="lb-hist__icon">${icon(stepIcon(s), { size: 14 })}</span><span class="lb-hist__label">${esc(stepLabel(s))}</span>
    <button class="lb-hist__del fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Remove ${esc(stepLabel(s))}" data-del="${s.id}">${icon('x', { size: 14 })}</button></li>`;
}
function updateHistory() {
  const d = doc(), ol = $('#hist'); if (!d) return;
  if (ol) {
    ol.innerHTML = `<li class="lb-hist__row lb-hist__row--orig"><span class="lb-hist__icon">${icon('image', { size: 14 })}</span><span class="lb-hist__label">Original · ${esc(d.kind)} ${d.w} × ${d.h}</span></li>` + d.recipe.map(histRow).join('');
    const n = $('#hist-n'); if (n) n.textContent = d.recipe.length;
    const r = $('#reset'); if (r) r.disabled = !d.recipe.length;
    ol.scrollTop = ol.scrollHeight;
  }
}
function refreshSliders() {
  const d = doc(); if (!d) return; const a = E.effective(d).adj;
  $$('[data-adj]').forEach((r) => { if (document.activeElement === r && S.adjSess) return; r.value = a[r.dataset.adj]; r.dispatchEvent(new Event('input-sync')); const out = r.closest('.fw-slider').querySelector('output'); const p = ((r.value - r.min) / (r.max - r.min)) * 100; r.style.setProperty('--p', p + '%'); out.textContent = r.value; });
}
function wirePanel(p, d) {
  // Edit
  p.querySelector('#q-crop')?.addEventListener('click', startCrop);
  p.querySelector('#q-rot')?.addEventListener('click', () => rotate(90));
  p.querySelector('#q-flip')?.addEventListener('click', flip);
  p.querySelector('#q-auto')?.addEventListener('click', autoEnhance);
  $$('[data-adj]', p).forEach((r) => {
    r.addEventListener('pointerdown', () => (S.adjSess = null));
    r.addEventListener('input', () => setAdjust(r.dataset.adj, +r.value));
    r.addEventListener('change', () => { S.adjSess = null; changed(doc()); });
    r.closest('.fw-slider').querySelector('label').addEventListener('dblclick', () => { S.adjSess = null; setAdjust(r.dataset.adj, 0, { live: false }); refreshSliders(); });
  });
  p.querySelector('#reset')?.addEventListener('click', resetAll);
  p.querySelector('#apply-sel')?.addEventListener('click', applyToSelected);
  p.addEventListener('click', (e) => { const t = e.target.closest('[data-tog]'); if (t) { toggleStep(+t.dataset.tog); return; } const x = e.target.closest('[data-del]'); if (x) deleteStep(+x.dataset.del); });
  if (p.querySelector('#bg-block')) wireBg(p.querySelector('#bg-block'));
  updateHistory();
  // Crop
  $$('[data-aspect]', p).forEach((b) => (b.onclick = () => setAspect(b.dataset.aspect)));
  p.querySelector('#straighten')?.addEventListener('input', (e) => setStraighten(+e.target.value));
  p.querySelector('#c-rotl')?.addEventListener('click', () => rotate(-90));
  p.querySelector('#c-rotr')?.addEventListener('click', () => rotate(90));
  p.querySelector('#c-flip')?.addEventListener('click', flip);
  p.querySelector('#c-cancel')?.addEventListener('click', cancelCrop);
  p.querySelector('#c-done')?.addEventListener('click', commitCrop);
  // Markup
  $$('[data-tool]', p).forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  if (p.querySelector('#tools')) roving(p.querySelector('#tools'), '[data-tool]');
  $$('[data-color]', p).forEach((b) => (b.onclick = () => { S.color = b.dataset.color; $$('[data-color]', p).forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
  p.querySelector('#msize')?.addEventListener('fw-change', (e) => (S.size = e.detail.value));
  // Inspect
  p.querySelector('#loc-remove')?.addEventListener('change', (e) => { S.exp.meta = e.target.checked ? 'location' : 'keep'; p.querySelector('.lb-loc')?.classList.toggle('is-kept', !e.target.checked); updateFrameMeta(); });
  p.querySelector('#exif-all')?.addEventListener('click', () => exifDialog(d));
  p.querySelector('#colfmt')?.addEventListener('fw-change', (e) => { S.colorFmt = e.detail.value; renderPanel(); });
  $$('[data-col]', p).forEach((b) => (b.onclick = async () => { const c = d.palette[+b.dataset.col], v = colStr(c); await navigator.clipboard.writeText(v).catch(() => {}); const lab = b.querySelector('.lb-pal__val'); lab.textContent = 'Copied'; b.classList.add('is-copied'); setTimeout(() => { lab.textContent = colStr(c); b.classList.remove('is-copied'); }, 1400); }));
  p.querySelector('#pal-css')?.addEventListener('click', async (e) => { const css = `:root {\n${d.palette.map((c, i) => `  --color-${i + 1}: ${colStr(c)};`).join('\n')}\n}`; await navigator.clipboard.writeText(css).catch(() => {}); flash(e.currentTarget, 'Copied 6 variables'); });
  p.querySelector('#ocr-go')?.addEventListener('click', findText);
  p.querySelector('#ocr-on')?.addEventListener('change', (e) => { d.ocrOn = e.target.checked; renderOcr(); });
  $$('.lb-lines__row', p).forEach((b) => {
    b.onmouseenter = () => syncLine(+b.dataset.l); b.onmouseleave = () => syncLine(null);
    b.onclick = async () => { const t = d.ocr.lines[+b.dataset.l].words.map((w) => w.t).join(' '); await navigator.clipboard.writeText(t).catch(() => {}); flash(b, 'Copied'); };
  });
  p.querySelector('#ocr-all')?.addEventListener('click', async (e) => { await navigator.clipboard.writeText(d.ocr.lines.map((l) => l.words.map((w) => w.t).join(' ')).join('\n')).catch(() => {}); flash(e.currentTarget, `Copied ${d.ocr.lines.length} lines`); });
  if (S.mode === 'inspect') ensurePalette();
  // Export
  $$('[data-preset]', p).forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));
  p.querySelector('#fmt')?.addEventListener('fw-change', (e) => setExp({ format: e.detail.value }));
  const q = p.querySelector('#quality'); if (q) { q.addEventListener('input', () => { S.exp.quality = +q.value; S.exp.preset = null; $$('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', 'false')); queueEstimate(120); }); }
  p.querySelector('#max-on')?.addEventListener('change', (e) => setExp({ max: e.target.checked }, { keepPreset: false }));
  p.querySelector('#max-kb')?.addEventListener('input', (e) => { S.exp.maxKB = Math.max(10, +e.target.value || 10); S.exp.preset = null; queueEstimate(300); });
  p.querySelector('#sizemode')?.addEventListener('fw-change', (e) => setExp({ size: e.detail.value }));
  p.querySelector('#longest')?.addEventListener('input', (e) => { S.exp.longest = clamp(+e.target.value || 16, 16, 8000); S.exp.preset = null; queueEstimate(300); });
  p.querySelector('#box-clear')?.addEventListener('click', () => setExp({ box: null }));
  $$('input[name="meta"]', p).forEach((r) => r.addEventListener('change', () => { S.exp.meta = r.value; updateFrameMeta(); }));
  p.querySelector('#scope')?.addEventListener('fw-change', (e) => { S.exp.scope = e.detail.value; p.querySelector('.lb-name').hidden = S.exp.scope !== 'this'; updateEstimateUI(); });
  p.querySelector('#exp-name')?.addEventListener('input', (e) => { (S.exp.nameFor ||= {})[d.id] = e.target.value; });
  if (S.mode === 'export') updateEstimateUI();
}
function syncExportPanel() { if (S.mode === 'export' && !S.cropping) { const sc = $('#panel').scrollTop; renderPanel(); $('#panel').scrollTop = sc; } }
function flash(el, text) { if (!el) return; const old = el.innerHTML; el.style.minWidth = el.offsetWidth + 'px'; el.innerHTML = `${icon('check')}<span>${esc(text)}</span>`; el.classList.add('is-copied'); setTimeout(() => { el.innerHTML = old; el.classList.remove('is-copied'); el.style.minWidth = ''; }, 1400); }
function setTool(t) { S.tool = t; if (S.mode !== 'markup') setMode('markup'); else { $$('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t))); renderPanel(); } stage.dataset.tool = t; renderMobilePanel(); }
function ensurePalette() {
  const d = doc(); if (!d || d.palette) return;
  setTimeout(() => { if (d.palette) return; d.palette = E.palette(E.render(d, { maxDim: 240 }), 6); if (doc() === d && S.mode === 'inspect') { const sc = $('#panel').scrollTop; renderPanel(); $('#panel').scrollTop = sc; } renderMobilePanel(); }, 30);
}
function exifDialog(d) {
  const t = d.exif?.tags || {}, g = d.exif?.gps || {};
  const rows = Object.entries({ ...t }).map(([k, v]) => [k.replace(/([a-z])([A-Z])/g, '$1 $2'), Array.isArray(v) ? v.map((x) => +(+x).toFixed(4)).join(', ') : typeof v === 'number' ? +v.toFixed(6) : v]);
  if (d.info?.location) rows.push(['GPS position', E.fmtCoord(d.info.location)], ['GPS altitude', `${Math.round(d.info.location.alt || 0)} m`]);
  openDialog({ title: `Metadata · ${d.name}`, size: 560, body: `<div class="fw-table-wrap"><table class="fw-table"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="is-mono">${esc(String(v))}</td></tr>`).join('')}</tbody></table></div>
    <p class="fw-t-sm fw-muted" style="margin-top:12px">${d.exif?.count || 0} fields in the file. Showing the ones that matter; the export removes ${S.exp.meta === 'keep' ? 'nothing' : S.exp.meta === 'all' ? 'all of them' : 'the location'}.</p>`, actions: [{ label: 'Done', primary: true, close: true }] });
}

// ───────────────────────── mobile (Photos-style) ─────────────────────────
function renderMobileBar() {
  const mb = $('#mbar'), d = doc();
  if (!d) { mb.innerHTML = ''; return; }
  mb.innerHTML = `<div class="lb-mpanel" id="mpanel"></div>
    <div class="lb-mtabs" role="tablist" aria-label="Edit tools">${[['adjust', 'Adjust', 'sliders-horizontal'], ['crop', 'Crop', 'crop'], ['markup', 'Markup', 'pencil'], ['inspect', 'Inspect', 'scan']].map(([id, l, ic]) => `<button class="lb-mtab" type="button" role="tab" aria-selected="${S.mtab === id}" data-mtab="${id}">${icon(ic, { size: 20 })}<span>${l}</span></button>`).join('')}</div>
    <div class="lb-mfoot"><button class="fw-btn fw-btn--primary fw-btn--lg fw-btn--block lb-mexport" type="button" id="m-export"></button></div>`;
  $$('[data-mtab]', mb).forEach((b) => (b.onclick = () => setMtab(b.dataset.mtab)));
  $('#m-export').onclick = openMobileExport;
  renderMobilePanel(); updateEstimateUI();
}
function setMtab(t) {
  if (S.mtab === 'crop' && t !== 'crop') commitCrop();
  S.mtab = t; $$('[data-mtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mtab === t)));
  if (t === 'crop') startCrop();
  const m = { adjust: 'edit', crop: 'edit', markup: 'markup', inspect: 'inspect' }[t];
  if (S.mode !== m) { S.mode = m; wb.dataset.mode = m; schedule(); }
  if (t === 'inspect') ensurePalette();
  renderMobilePanel();
}
function renderMobilePanel() {
  const mp = $('#mpanel'), d = doc(); if (!mp || !d || !isMobile()) return;
  const e = E.effective(d);
  if (S.mtab === 'adjust') {
    const j = S.bgJob && S.bgJob.docId === d.id ? S.bgJob : null;
    mp.innerHTML = `<div class="lb-params" role="radiogroup" aria-label="Adjustment">
        ${E.ADJ_KEYS.map((k) => `<button class="lb-param" type="button" role="radio" aria-checked="${S.mparam === k}" data-param="${k}" style="--v:${Math.abs(e.adj[k])}"><span class="lb-param__ring">${icon(E.ADJ_ICON[k], { size: 18 })}</span><span>${E.ADJ_LABEL[k]}</span></button>`).join('')}
        <button class="lb-param" type="button" id="m-auto"><span class="lb-param__ring">${icon('sparkles', { size: 18 })}</span><span>Auto</span></button>
        <button class="lb-param ${e.bg ? 'is-on' : ''}" type="button" id="m-bg"><span class="lb-param__ring">${j ? `<span class="fw-ring" style="--value:${Math.round((j.got || 0) / 88 * 100)}"></span>` : icon('scissors', { size: 18 })}</span><span>${e.bg ? 'Cut out' : 'Remove bg'}</span></button>
      </div>
      ${dialHtml('adj', e.adj[S.mparam], -100, 100, E.ADJ_LABEL[S.mparam])}`;
    $$('[data-param]', mp).forEach((b) => (b.onclick = () => { S.mparam = b.dataset.param; renderMobilePanel(); }));
    $('#m-auto').onclick = autoEnhance;
    $('#m-bg').onclick = () => (e.bg ? setFill(e.bg.fill === 'transparent' ? 'white' : 'transparent') : removeBg());
    wireDial(mp.querySelector('.lb-dial'), (v, live) => { setAdjust(S.mparam, v, { live }); const pr = $(`[data-param="${S.mparam}"]`); pr?.style.setProperty('--v', Math.abs(v)); }, () => { S.adjSess = null; changed(doc()); });
  } else if (S.mtab === 'crop') {
    const c = S.cropping || { aspect: 'free', straighten: 0 };
    mp.innerHTML = `<div class="lb-chiprow" role="group" aria-label="Aspect ratio">${ASPECTS.map((a) => `<button class="fw-chip" type="button" data-aspect="${a.id}" aria-pressed="${c.aspect === a.id}">${a.label}</button>`).join('')}</div>
      <div class="lb-mcrop"><button class="fw-iconbtn" type="button" aria-label="Rotate left" id="mc-rot">${icon('rotate-ccw', { size: 20 })}</button>
        ${dialHtml('str', c.straighten, -15, 15, 'Straighten', 0.1)}
        <button class="fw-iconbtn" type="button" aria-label="Flip" id="mc-flip">${icon('flip-horizontal', { size: 20 })}</button></div>`;
    $$('[data-aspect]', mp).forEach((b) => (b.onclick = () => setAspect(b.dataset.aspect)));
    $('#mc-rot').onclick = () => rotate(-90); $('#mc-flip').onclick = flip;
    wireDial(mp.querySelector('.lb-dial'), (v) => setStraighten(v), () => {});
  } else if (S.mtab === 'markup') {
    mp.innerHTML = `<div class="lb-mtools" role="toolbar" aria-label="Markup tools">${TOOLS.map((t) => `<button class="lb-param" type="button" data-tool="${t.id}" aria-pressed="${S.tool === t.id}"><span class="lb-param__ring">${icon(t.icon, { size: 18 })}</span><span>${t.label}</span></button>`).join('')}</div>
      <div class="lb-swatches lb-swatches--m" role="radiogroup" aria-label="Colour">${COLORS.map((c) => `<button class="lb-sw" type="button" role="radio" aria-checked="${S.color === c}" style="--c:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}</div>`;
    $$('[data-tool]', mp).forEach((b) => (b.onclick = () => { S.tool = b.dataset.tool; renderMobilePanel(); }));
    $$('[data-color]', mp).forEach((b) => (b.onclick = () => { S.color = b.dataset.color; renderMobilePanel(); }));
  } else if (S.mtab === 'inspect') {
    const inf = d.info || {};
    mp.innerHTML = `<div class="lb-minspect">
      <div class="lb-facts lb-facts--m"><b>${d.w} × ${d.h}</b><span>${(d.w * d.h / 1e6).toFixed(1)} MP · ${esc(d.kind)} · ${formatBytes(d.bytes)}${inf.camera ? ' · ' + esc(inf.camera) : ''}</span></div>
      ${inf.location ? `<label class="lb-togrow lb-mloc"><span>${icon('map-pin', { size: 14 })} ${esc(inf.place || 'Location')} · remove on export</span><span class="fw-toggle"><input type="checkbox" id="m-loc" ${S.exp.meta !== 'keep' ? 'checked' : ''}></span></label>` : ''}
      <div class="lb-palette lb-palette--m">${(d.palette || []).map((c, i) => `<button class="lb-pal" type="button" style="--c:${c.hex}" data-col="${i}" aria-label="Copy ${c.hex}"><span class="lb-pal__chip"></span><span class="lb-pal__val">${c.hex}</span></button>`).join('')}</div>
      <button class="fw-btn fw-btn--block" type="button" id="m-ocr">${icon('scan-text')}${d.ocr === 'loading' ? 'Reading text…' : d.ocr && typeof d.ocr === 'object' ? (d.ocrOn ? 'Hide text boxes' : 'Show text boxes') : d.ocr === 'none' ? 'No text found' : 'Find text'}</button></div>`;
    $('#m-loc')?.addEventListener('change', (ev) => { S.exp.meta = ev.target.checked ? 'location' : 'keep'; });
    $('#m-ocr').onclick = findText;
    $$('[data-col]', mp).forEach((b) => (b.onclick = async () => { const c = d.palette[+b.dataset.col]; await navigator.clipboard.writeText(c.hex).catch(() => {}); const l = b.querySelector('.lb-pal__val'); l.textContent = 'Copied'; b.classList.add('is-copied'); setTimeout(() => { l.textContent = c.hex; b.classList.remove('is-copied'); }, 1300); }));
  }
}
function dialHtml(id, v, min, max, label, step = 1) {
  return `<div class="lb-dial" tabindex="0" role="slider" aria-label="${esc(label)}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${v}" data-min="${min}" data-max="${max}" data-step="${step}" data-v="${v}">
    <div class="lb-dial__val"><span>${esc(label)}</span><b>${fmtDial(v, step)}</b></div>
    <div class="lb-dial__win"><div class="lb-dial__track"></div><div class="lb-dial__needle"></div></div></div>`;
}
const fmtDial = (v, step) => (step < 1 ? `${v > 0 ? '+' : ''}${(+v).toFixed(1)}°` : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`);
function wireDial(el, onChange, onEnd) {
  if (!el) return;
  const min = +el.dataset.min, max = +el.dataset.max, step = +el.dataset.step, PX = step < 1 ? 60 : 3.2; // px per unit (degrees use 6 px per 0.1)
  const unitPx = step < 1 ? 60 : 3.2;
  const tr = el.querySelector('.lb-dial__track'), b = el.querySelector('.lb-dial__val b');
  let v = +el.dataset.v;
  const place = () => { tr.style.transform = `translateX(${-(v - min) * unitPx}px)`; tr.style.width = (max - min) * unitPx + 'px'; b.textContent = fmtDial(v, step); el.setAttribute('aria-valuenow', v); el.classList.toggle('is-zero', Math.abs(v) < step / 2); };
  tr.style.setProperty('--tick', (step < 1 ? unitPx : unitPx * 5) + 'px'); tr.style.setProperty('--major', (step < 1 ? unitPx * 5 : unitPx * 25) + 'px');
  place();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('is-drag');
    const x0 = e.clientX, v0 = v; let stuck = 0;
    const mv = (ev) => {
      let nv = clamp(v0 - (ev.clientX - x0) / unitPx, min, max); nv = Math.round(nv / step) * step;
      if (Math.abs(nv) < step * 2.5 && Math.abs(v0) > step * 2.5 && stuck < 6) { nv = 0; stuck++; } // gentle detent at zero
      if (nv !== v) { v = +nv.toFixed(2); place(); onChange(v, true); }
    };
    const up = () => { el.classList.remove('is-drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); onEnd(v); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
  el.addEventListener('keydown', (e) => { const dlt = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0; if (!dlt) return; e.preventDefault(); v = clamp(+(v + dlt * step * (e.shiftKey ? 10 : 1)).toFixed(2), min, max); place(); onChange(v, false); onEnd(v); });
}
function openMobileExport() {
  if (S.cropping || S.mtab === 'crop') setMtab('adjust');
  const x = S.exp;
  const sh = openSheet({ title: 'Export', height: 'peek', className: 'lb-msheet', body: `
    <div class="lb-chiprow lb-chiprow--sheet" role="group" aria-label="Presets">${PRESETS.filter((p) => p.id !== 'favicon').map((p) => `<button class="fw-chip" type="button" data-mpreset="${p.id}" aria-pressed="${x.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>
    <div class="fw-seg lb-seg-full" aria-label="Format" id="m-fmt">${['jpeg', 'webp', 'avif', 'png'].map((k) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${x.format === k}">${FMT[k]}</button>`).join('')}</div>
    <div class="fw-slider"><label class="fw-slider__label" for="m-q">Quality</label><output class="fw-slider__value"></output><input id="m-q" type="range" min="1" max="100" value="${x.quality}" data-unit=" %"></div>
    <p class="lb-mest" id="m-est" aria-live="polite"></p>
    <button class="fw-btn fw-btn--primary fw-btn--lg fw-btn--block" type="button" id="m-save"></button>`, onClose: () => updateEstimateUI() });
  const el = sh.el;
  el.querySelector('#m-fmt').addEventListener('fw-change', (e) => { S.exp.format = e.detail.value; S.exp.preset = null; $$('[data-mpreset]', el).forEach((b) => b.setAttribute('aria-pressed', 'false')); queueEstimate(); });
  el.querySelector('#m-q').addEventListener('input', (e) => { S.exp.quality = +e.target.value; S.exp.preset = null; queueEstimate(150); });
  $$('[data-mpreset]', el).forEach((b) => (b.onclick = () => { Object.assign(S.exp, PRESETS.find((p) => p.id === b.dataset.mpreset).set, { preset: b.dataset.mpreset }); $$('[data-mpreset]', el).forEach((y) => y.setAttribute('aria-pressed', String(y === b))); $$('#m-fmt .fw-seg__opt', el).forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === S.exp.format))); const q = el.querySelector('#m-q'); q.value = S.exp.quality; q.dispatchEvent(new Event('input')); }));
  el.querySelector('#m-save').onclick = async (e) => { const btn = e.currentTarget; btn.classList.add('is-busy'); const r = S.est && !S.estPending ? S.est : await exportOne(doc()); E.download(r.blob, r.plan.name); btn.classList.remove('is-busy'); flash(btn, `Saved ${r.plan.name}`); };
  updateEstimateUI();
}
function openPhotoSheet() {
  const sh = openSheet({ title: `${ready().length} photos`, height: 'half', body: `<div class="lb-mgrid">${S.docs.map((x, i) => x.loading ? '' : `<button class="lb-mgrid__item" type="button" data-gi="${i}" aria-current="${i === S.active}" aria-label="${esc(x.name)}"><img alt="" src="${x.thumb}"></button>`).join('')}</div>
    ${S.failed.length ? `<p class="lb-sub" style="margin-top:12px">${icon('triangle-alert', { size: 14 })} ${S.failed.map((f) => `${esc(f.name)}: ${esc(f.reason)}`).join(' · ')}</p>` : ''}
    <button class="fw-btn fw-btn--block" type="button" id="m-add" style="margin-top:12px">${icon('plus')}Add photos</button>` });
  $$('[data-gi]', sh.el).forEach((b) => (b.onclick = () => { sh.close(); go(+b.dataset.gi); }));
  sh.el.querySelector('#m-add').onclick = () => { sh.close(); pickFiles(); };
}

// ───────────────────────── empty state ─────────────────────────
function renderEmpty() {
  const em = $('#empty'), empty = !S.docs.length;
  wb.classList.toggle('is-empty', empty); em.hidden = !empty;
  if (!empty) { em.innerHTML = ''; return; }
  em.innerHTML = `<div class="lb-empty__inner">
    <div class="fw-intake lb-intake" data-intake data-accept="image/*,.heic,.heif" aria-label="Open photos">
      <span class="fw-intake__icon">${icon('images', { size: 24 })}</span>
      <span class="fw-intake__title"><span class="fw-pointer-copy">Drop photos to start</span><span class="fw-touch-copy">Choose photos to start</span></span>
      <span class="lb-intake__lede">Edit, mark up, read and shrink a whole shoot at once.</span>
      <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>${icon('folder-open')}Choose photos</button></span>
      <span class="fw-intake__sub"><span class="fw-pointer-copy">${kbd('mod+o')} open · ${kbd('mod+v')} paste</span><span class="fw-dot fw-pointer-copy"></span><a href="#" data-sample="${esc(spec(PHOTOS))}">Try the sample shoot</a></span>
      <span class="fw-intake__privacy">${icon('lock', { size: 12 })} Opened on this device · never uploaded</span>
    </div>
    <div class="lb-tasks" role="group" aria-label="Start with a job">
      <button class="fw-chip fw-chip--sample" type="button" data-task="compress">${icon('shrink', { size: 14 })}Compress for web</button>
      <button class="fw-chip fw-chip--sample" type="button" data-task="bg">${icon('scissors', { size: 14 })}Remove background</button>
      <button class="fw-chip fw-chip--sample" type="button" data-task="ocr">${icon('scan-text', { size: 14 })}Read text in a photo</button>
    </div></div>`;
  enhance(em);
  $$('[data-task]', em).forEach((b) => (b.onclick = async () => {
    const t = b.dataset.task;
    if (t === 'compress') { Object.assign(S.exp, PRESETS[0].set, { preset: 'web' }); await openFiles(await loadSamples(spec(PHOTOS)), { source: 'sample' }); setMode('export'); }
    if (t === 'bg') { S.init.bg = true; await openFiles(await loadSamples(spec(['dog-in-the-park.jpg'])), { source: 'sample' }); }
    if (t === 'ocr') { S.init.ocr = true; setMode('inspect'); await openFiles(await loadSamples(spec(['cafe-croissant.jpg'])), { source: 'sample' }); }
  }));
}

// ───────────────────────── render all ─────────────────────────
function renderAll() {
  renderEmpty(); renderFramebar(); renderDock(); renderPanel(); renderMobileBar();
  if (doc()) { schedule(); queueEstimate(60); } else { cv.width = cv.height = 0; $('#hud').innerHTML = ''; $('#ocr').hidden = true; after.hidden = true; $('#split').hidden = true; }
  wb.dataset.mode = S.mode;
}

// ───────────────────────── keyboard ─────────────────────────
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey, k = e.key;
  if (mod && !e.altKey) {
    const kk = k.toLowerCase();
    if (kk === 'z' && !isTyping()) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (kk === 'y' && !isTyping()) { e.preventDefault(); redo(); return; }
    if (kk === 's') { e.preventDefault(); save(); return; }
    if (kk === 'o') { e.preventDefault(); pickFiles(); return; }
    if (kk === '.') { e.preventDefault(); togglePanel(); return; }
    if (kk === '0' && doc()) { e.preventDefault(); setZoom('fit'); return; }
    if (kk === '1' && doc()) { e.preventDefault(); setZoom(1); return; }
    return; // never treat ⌘C/⌘P/⌘T as tool letters
  }
  if (e.altKey || isTyping() || hasLayers() && k !== 'Enter' && k !== '\\' || !doc()) { if (k === 'Enter' && S.cropping && !isTyping()) { e.preventDefault(); commitCrop(); } return; }
  if (e.target.closest?.('.fw-cmd,.fw-popover,dialog')) return;
  if (k === 'Enter' && S.cropping) { e.preventDefault(); commitCrop(); return; }
  if (k === '\\') { e.preventDefault(); if (S.mode === 'export') { S.splitOn = !S.splitOn; placeSplit(); renderHud(); } else if (!e.repeat) { S.compare = true; schedule(); renderHud(); } return; }
  if (k === 'ArrowRight' || k === 'ArrowLeft') { if (e.target.closest('input,[role=slider],.lb-strip,.fw-seg,[role=toolbar],[role=radiogroup]')) return; e.preventDefault(); go(S.active + (k === 'ArrowRight' ? 1 : -1)); return; }
  if (k === ' ' && e.target === stage) { e.preventDefault(); S.space = true; stage.classList.add('is-hand'); return; }
  const low = k.toLowerCase();
  const map = { e: () => setMode('export'), c: () => startCrop(), v: () => setMode('edit'), f: () => setZoom('fit'), 1: () => setZoom(1), '+': () => zoomStep(1), '=': () => zoomStep(1), '-': () => zoomStep(-1), backspace: () => (e.target === stage || e.target === document.body) && closeDoc(), delete: () => (e.target === stage || e.target === document.body) && closeDoc() };
  TOOLS.forEach((t) => (map[t.key] = () => setTool(t.id)));
  if (map[low]) { e.preventDefault(); map[low](); }
});
document.addEventListener('keyup', (e) => {
  if (e.key === '\\' && S.compare) { S.compare = false; schedule(); renderHud(); }
  if (e.key === ' ') { S.space = false; stage.classList.remove('is-hand'); }
});

// ───────────────────────── command bar: page commands ("resize 1200", "webp", "remove bg") ─────────────────────────
// Kit addition candidate: mountShell({ commands: (q) => [...] }). Until then a tiny shim injects rows into the kit palette.
function pageCommands(q) {
  const d = doc(); const t = q.trim().toLowerCase(); if (!d || !t) return [];
  const out = []; let m;
  if ((m = t.match(/^(?:resize|size|scale|width|longest)\s*(?:to\s*)?(\d{2,5})?\s*(?:px)?$/))) {
    const nums = m[1] ? [+m[1]] : [1920, 1280, 1080];
    nums.forEach((n) => out.push({ label: `Resize to ${n} px`, sub: 'Longest side · applies on export', icon: 'scaling', run: () => { setExp({ size: 'longest', longest: n, box: null }); flashExportBar(); } }));
  } else if ((m = t.match(/^(\d{2,5})\s*px$/))) out.push({ label: `Resize to ${m[1]} px`, sub: 'Longest side · applies on export', icon: 'scaling', run: () => { setExp({ size: 'longest', longest: +m[1], box: null }); flashExportBar(); } });
  const f = t.match(/^(?:save as |export as |to |as )?(webp|jpe?g|png|avif)$/); if (f) { const k = f[1].startsWith('jp') ? 'jpeg' : f[1]; out.push({ label: `Export as ${FMT[k]}`, sub: FMT_HINT[k], icon: 'image-down', run: () => { setExp({ format: k }); flashExportBar(); } }); }
  if (/^(remove (the )?b(ack)?g(round)?|cut ?out|bg|no background)/.test(t) || 'remove background'.startsWith(t) && t.length > 3) out.push({ label: 'Remove background', sub: 'This photo · on device', icon: 'scissors', run: removeBg });
  if (/^(find |read |copy )?text|^ocr/.test(t)) out.push({ label: 'Find text in this photo', sub: 'Click words to copy', icon: 'scan-text', run: findText });
  if (/^crop/.test(t)) out.push({ label: 'Crop & straighten', sub: 'C', icon: 'crop', run: startCrop });
  if (/^rotate/.test(t)) out.push({ label: 'Rotate right', sub: 'Adds a step to History', icon: 'rotate-cw', run: () => rotate(90) });
  if (/^(auto|enhance)/.test(t)) out.push({ label: 'Auto enhance', sub: 'From the histogram', icon: 'sparkles', run: autoEnhance });
  if (/^(gps|location|privacy|strip)/.test(t)) out.push({ label: 'Remove location on export', sub: 'Keeps camera and date', icon: 'map-pin', run: () => { S.exp.meta = 'location'; updateFrameMeta(); } });
  PRESETS.forEach((p) => { if (t.length > 2 && p.label.toLowerCase().startsWith(t)) out.push({ label: `Preset · ${p.label}`, sub: 'Export', icon: 'download', run: () => { setMode('export'); applyPreset(p.id); } }); });
  if (/^(save|export) all/.test(t)) out.push({ label: `Save all ${ready().length} photos`, sub: 'ZIP · current export settings', icon: 'file-archive', run: () => { S.exp.scope = 'all'; save(); } });
  return out.slice(0, 4);
}
function flashExportBar() { const s = $('#exp-sum'); if (!s) return; s.classList.remove('is-flash'); void s.offsetWidth; s.classList.add('is-flash'); }
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.('dialog.fw-cmd')) hookCmd(n);
}).observe(document.body, { childList: true });
function hookCmd(dlg) {
  const input = dlg.querySelector('.fw-cmd__input'), list = dlg.querySelector('.fw-cmd__list');
  let cmds = [], pageSel = null;
  const inject = () => {
    list.querySelectorAll('.lb-pagecmd,.lb-pagecmd-g').forEach((x) => x.remove());
    cmds = pageCommands(input.value); pageSel = cmds.length ? 0 : null;
    if (!cmds.length) return;
    const frag = document.createDocumentFragment();
    frag.append(h(`<div class="fw-cmd__group lb-pagecmd-g" role="presentation">This photo · ${esc(doc().name)}</div>`));
    cmds.forEach((c, i) => {
      const row = h(`<div class="fw-cmd__item lb-pagecmd" role="option" id="lb-pc-${i}" data-pc="${i}"><span class="fw-cmd__icon">${icon(c.icon)}</span><span class="fw-cmd__text"><span class="fw-cmd__name">${esc(c.label)}</span><span class="fw-cmd__meta">${esc(c.sub)}</span></span><span class="fw-cmd__enter">Run ${kbd('enter')}</span></div>`);
      row.addEventListener('click', () => run(i)); row.addEventListener('pointermove', () => mark(i));
      frag.append(row);
    });
    list.querySelector('.fw-cmd__empty')?.remove();
    list.prepend(frag); mark(0);
  };
  const mark = (i) => { pageSel = i; list.querySelectorAll('[role=option]').forEach((o) => o.setAttribute('aria-selected', String(o.dataset.pc === String(i)))); if (i != null) input.setAttribute('aria-activedescendant', `lb-pc-${i}`); };
  const run = (i) => { const c = cmds[i]; dlg.dispatchEvent(new Event('cancel', { cancelable: true })); setTimeout(() => c.run(), 60); };
  input.addEventListener('input', inject);
  input.addEventListener('keydown', (e) => {
    if (pageSel == null) { if (e.key === 'ArrowUp' && cmds.length && list.querySelector('.fw-cmd__item:not(.lb-pagecmd)[aria-selected="true"],.fw-cmd__answer[aria-selected="true"]') === list.querySelector('[data-idx="0"]')) { e.preventDefault(); e.stopImmediatePropagation(); mark(cmds.length - 1); } return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); run(pageSel); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); if (pageSel < cmds.length - 1) mark(pageSel + 1); else { pageSel = null; list.querySelectorAll('.lb-pagecmd').forEach((o) => o.setAttribute('aria-selected', 'false')); const f = list.querySelector('[data-idx="0"]'); if (f) { f.setAttribute('aria-selected', 'true'); input.setAttribute('aria-activedescendant', f.id); } } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); if (pageSel > 0) mark(pageSel - 1); }
  }, true);
  inject();
}

// ───────────────────────── boot ─────────────────────────
initSplit(); initOcr();
$('#m-compare').innerHTML = icon('circle-half', { size: 20 }); holdCompare($('#m-compare'));
wb.dataset.mode = S.mode;
renderAll();
matchMedia('(max-width: 767px)').addEventListener('change', () => { renderAll(); });
window.addEventListener('fw-theme-change', () => doc() && schedule());
if (params.has('demo')) {
  const names = params.get('demo') === 'one' ? ['cafe-croissant.jpg'] : PHOTOS;
  loadSamples(spec(names)).then((f) => openFiles(f, { source: 'sample' })).then(() => {
    const pick = params.get('doc'); if (pick) { const i = S.docs.findIndex((d) => d.name.startsWith(pick)); if (i >= 0) go(i); }
    if (params.get('preset')) applyPreset(params.get('preset'));
    window.__lbReady = true;
  });
} else window.__lbReady = true;
window.__lb = { S, go, setMode, removeBg, findText, applyPreset, setAdjust };
