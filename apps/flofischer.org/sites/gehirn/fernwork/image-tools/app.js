// Fernwork One · Image Tools (archetype A · Workbench), revision 1.
// One image per view on an infinite pan/zoom canvas; images switch only via the filmstrip at the bottom.
// Panel modes Edit · Markup · Inspect · Export; a non-destructive recipe with undo/redo; a live export bar;
// session persistence in IndexedDB; phone layout with mode tabs and an expandable options panel.
import './icons-extra.js';
import { mountShell, icon, esc, $, $$, h, enhance, formatBytes, toast, openMenu, openDialog, kbd, loadSamples, isMobile, isTyping, pushLayer, store, hasLayers, roving, getLeaf } from '../kit/shell.js';
import * as E from './engine.js';
import { saveDocs, loadDocs, clearDocs } from './persist.js';

// ───────────────────────── constants ─────────────────────────
export const PHOTOS = ['IMG_4101.jpg', 'IMG_4102.jpg', 'IMG_4103.HEIC', 'IMG_4104.jpg', 'IMG_4105.jpg', 'IMG_4106.jpg', 'cafe-croissant.jpg', 'IMG_4108.jpg', 'dog-in-the-park.jpg', 'IMG_4110.jpg', 'Sommerurlaub 2026 – Steg am Morgen (Kopie 3).jpg', 'IMG_4112.jpg'];
const spec = (names) => names.map((n) => `./photos/${n}>${n}`).join('|');
const CUTOUTS = { 'dog-in-the-park.jpg': 'assets/dog-in-the-park.cutout.png', 'IMG_4110.jpg': 'assets/IMG_4110.cutout.png' };
const MODES = [{ id: 'edit', label: 'Edit' }, { id: 'markup', label: 'Markup' }, { id: 'inspect', label: 'Inspect' }, { id: 'export', label: 'Export' }];
const LEAF_INIT = {
  'image-tools': {}, 'compress-image': { mode: 'export', exp: { format: 'webp', quality: 80 } }, 'resize-image': { mode: 'export', exp: { size: 'longest', value: 1920 } },
  'crop-image': { mode: 'edit', crop: true }, 'remove-background': { mode: 'edit', bg: true }, 'annotate-image': { mode: 'markup', tool: 'shape' },
  'blur-image': { mode: 'markup', tool: 'blur' }, 'image-metadata': { mode: 'inspect' },
  // round-1 ids keep working
  'image-edit': { mode: 'edit' }, 'image-markup': { mode: 'markup' }, 'image-inspect': { mode: 'inspect' }, 'image-export': { mode: 'export' }, 'image-ocr': { mode: 'inspect', ocr: true },
};
const LEDE = {
  'image-tools': 'Crop, resize, adjust, annotate, compress and export images.', 'compress-image': 'Make images smaller and see the size before you save.',
  'resize-image': 'Resize one image or a whole batch.', 'crop-image': 'Crop, rotate, flip and straighten.', 'remove-background': 'Cut out the subject, then save it transparent or on a new background.',
  'annotate-image': 'Draw, add text, arrows and shapes.', 'blur-image': 'Pixelate faces, plates and private details.', 'image-metadata': 'See and remove EXIF data, camera details and location.',
};
const FMT = { original: 'Original', jpeg: 'JPEG', webp: 'WebP', avif: 'AVIF', png: 'PNG' };
const EXT = { jpeg: 'jpg', webp: 'webp', avif: 'avif', png: 'png' };
const FMT_HINT = { original: 'Same format as the file. Unchanged images keep their original bytes.', jpeg: 'Opens everywhere. No transparency.', webp: 'Smaller than JPEG. Keeps transparency.',
  avif: 'Smallest files. Slower to save.', png: 'Lossless. Keeps transparency. Large for photos.' };
const PRESETS = [
  { id: 'web', label: 'Web 1920', set: { format: 'webp', quality: 80, size: 'longest', value: 1920, max: false, box: null }, suffix: 'web' },
  { id: 'email', label: 'Email 1280', set: { format: 'jpeg', quality: 82, size: 'longest', value: 1280, max: false, box: null }, suffix: 'email' },
  { id: 'insta', label: 'Instagram 4:5', set: { format: 'jpeg', quality: 90, size: 'original', max: false, box: { w: 1080, h: 1350, fit: 'crop' } }, suffix: 'instagram' },
  { id: 'shop', label: 'Shop · white 2000', set: { format: 'jpeg', quality: 90, size: 'original', max: false, box: { w: 2000, h: 2000, fit: 'pad', bg: '#ffffff' } }, suffix: 'shop' },
  { id: 'max500', label: 'Max 500 kB', set: { max: true, maxKB: 500 }, suffix: 'small' },
  { id: 'favicon', label: 'Favicons', set: {}, suffix: 'favicon' },
];
const SIZE_MODES = [['original', 'Original size'], ['longest', 'Longest side'], ['width', 'Width'], ['height', 'Height'], ['percent', 'Percent'], ['box', 'Fit in box'], ['exact', 'Exact size']];
const SIZE_PRESETS = { longest: [3840, 2560, 1920, 1280, 800], width: [3840, 2560, 1920, 1280, 800], height: [2160, 1440, 1080, 720, 600], percent: [75, 50, 33, 25] };
const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#111111'];
const TOOLS = [
  { id: 'move', label: 'Move', icon: 'mouse-pointer', key: 'v' }, { id: 'brush', label: 'Brush', icon: 'brush', key: 'b' }, { id: 'pencil', label: 'Pencil', icon: 'pencil', key: 'p' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'x' }, { id: 'fill', label: 'Fill', icon: 'paint-bucket', key: 'g' }, { id: 'pick', label: 'Pick', icon: 'pipette', key: 'i' },
  { id: 'text', label: 'Text', icon: 'type', key: 't' }, { id: 'shape', label: 'Shape', icon: 'shapes', key: 'u' }, { id: 'blur', label: 'Blur', icon: 'grid-3x3', key: 'r' },
];
const SHAPES = [['rect', 'Rectangle', 'square'], ['ellipse', 'Ellipse', 'circle'], ['line', 'Line', 'line-diag'], ['arrow', 'Arrow', 'move-up-right']];
const KIND_LABEL = { brush: 'Brush stroke', pencil: 'Pencil line', eraser: 'Eraser', fill: 'Fill', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', blur: 'Blur area' };
const KIND_ICON = { brush: 'brush', pencil: 'pencil', eraser: 'eraser', fill: 'paint-bucket', text: 'type', rect: 'square', ellipse: 'circle', line: 'line-diag', arrow: 'move-up-right', blur: 'grid-3x3' };
const ASPECTS = [{ id: 'free', label: 'Free' }, { id: 'original', label: 'Original' }, { id: '1:1', label: '1:1', r: 1 }, { id: '4:3', label: '4:3', r: 4 / 3 }, { id: '3:2', label: '3:2', r: 3 / 2 },
  { id: '16:9', label: '16:9', r: 16 / 9 }, { id: '4:5', label: '4:5', r: 4 / 5 }, { id: '9:16', label: '9:16', r: 9 / 16 }];
const FILL_LABEL = { transparent: 'Transparent', white: 'White', color: 'Color', blur: 'Blur' };
const OCR_LANGS = [['eng', 'English'], ['deu', 'Deutsch'], ['fra', 'Français'], ['spa', 'Español'], ['ita', 'Italiano'], ['por', 'Português']];
const OCR_LAYOUTS = [['3', 'Auto'], ['6', 'Single block'], ['4', 'Single column'], ['11', 'Sparse text'], ['7', 'Single line'], ['8', 'Single word']];
const MTABS = [['adjust', 'Adjust', 'sliders-horizontal'], ['crop', 'Crop', 'crop'], ['markup', 'Markup', 'pencil'], ['inspect', 'Inspect', 'scan'], ['export', 'Export', 'download']];

// ───────────────────────── state ─────────────────────────
const params = new URLSearchParams(location.search);
const leafId = LEAF_INIT[params.get('leaf')] ? params.get('leaf') : 'image-tools';
const init = { ...LEAF_INIT[leafId] };
const canonLeaf = getLeaf(leafId)?.aliasOf || leafId;
const S = {
  docs: [], failed: [], active: -1, mode: params.get('mode') || init.mode || 'edit',
  view: { z: 1, x: 0, y: 0, fit: true, ow: 0, oh: 0 }, compare: false, split: 0.5, splitOn: true,
  tool: init.tool || 'brush', selMark: null, picking: false, picked: [], space: false,
  st: { color: '#ef4444', size: 12, pencil: 2, eraser: 28, opacity: 100, tol: 32, shape: leafId === 'annotate-image' ? 'arrow' : 'rect', width: 6, fillOn: false, fill: '#ffffff',
    font: E.FONTS[0][0], weight: 700, fsize: 0, outline: '#000000', outlineW: 0, align: 'left', boxW: 0, cell: 24 },
  cropping: null, refine: null, panel: true,
  exp: { preset: null, format: 'webp', quality: 80, max: false, maxKB: 500, size: 'original', value: 1920, boxW: 1920, boxH: 1080, exactW: 1600, exactH: 1200, lock: true, noUp: true, box: null, meta: 'location', scope: 'this' },
  est: null, estGen: 0, estPending: false, batch: null, bgJob: null, fav: null,
  mtab: { edit: 'adjust', markup: 'markup', inspect: 'inspect', export: 'export' }[params.get('mode') || init.mode || 'edit'] || 'adjust', mfull: false, mparam: 'brightness',
  colorFmt: 'hex', ocr: { lang: 'eng', layout: '3', spaces: false, overlay: 'words' },
  modelReady: store.get('img-model') === true && !params.has('fresh'), ocrReady: false, init,
};
if (init.exp) Object.assign(S.exp, init.exp);
let uid = 0;
const doc = () => S.docs[S.active] && !S.docs[S.active].loading ? S.docs[S.active] : null;
const ready = () => S.docs.filter((d) => !d.loading);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stage = $('#stage'), view = $('#view'), cv = $('#cv'), cvOld = $('#cv-old'), after = $('#after'), wb = $('#wb');
const mob = () => isMobile();

mountShell({
  leaf: canonLeaf, archetype: 'workbench', accept: ['image'], acceptLabel: 'Image Tools', onFiles: (f, o) => openFiles(f, o),
  shortcuts: [{ label: 'Pan', keys: 'space' }, { label: 'Fit · 100 %', keys: 'f 1' }, { label: 'Zoom in / out', keys: '+ -' }, { label: 'Compare with original (hold)', keys: '\\' },
    { label: 'Crop · Export', keys: 'c e' }, { label: 'Move · Brush · Pencil · Eraser', keys: 'v b p x' }, { label: 'Fill · Pick · Text · Shape · Blur', keys: 'g i t u r' },
    { label: 'Delete selected mark', keys: 'delete' }, { label: 'Save image', keys: 'mod+s' }, { label: 'Open images', keys: 'mod+o' }, { label: 'Toggle panel', keys: 'mod+.' }],
  commands: [
    { id: 'img-bg', label: 'Remove background', icon: 'scissors', syn: ['cut out', 'bg', 'transparent'], run: () => removeBg(), hidden: () => !doc() },
    { id: 'img-crop', label: 'Crop and rotate', icon: 'crop', kbd: 'c', syn: ['straighten', 'rotate', 'flip'], run: () => startCrop(), hidden: () => !doc() },
    { id: 'img-ocr', label: 'Find text in image', icon: 'scan-text', syn: ['ocr', 'read text', 'copy text'], run: () => findText(), hidden: () => !doc() },
    { id: 'img-auto', label: 'Auto enhance', icon: 'sparkles', run: () => autoEnhance(), hidden: () => !doc() },
    { id: 'img-webp', label: 'Export as WebP', icon: 'download', syn: ['webp'], searchOnly: true, run: () => { setMode('export'); setExp({ format: 'webp' }); }, hidden: () => !doc() },
    { id: 'img-jpeg', label: 'Export as JPEG', icon: 'download', syn: ['jpg', 'jpeg'], searchOnly: true, run: () => { setMode('export'); setExp({ format: 'jpeg' }); }, hidden: () => !doc() },
    { id: 'img-png', label: 'Export as PNG', icon: 'download', syn: ['png'], searchOnly: true, run: () => { setMode('export'); setExp({ format: 'png' }); }, hidden: () => !doc() },
    { id: 'img-resize', label: 'Resize to 1920 px', icon: 'scaling', syn: ['resize', 'scale', 'smaller'], searchOnly: true, run: () => { setMode('export'); setExp({ size: 'longest', value: 1920 }); }, hidden: () => !doc() },
    { id: 'img-strip', label: 'Remove all metadata on export', icon: 'shield-check', syn: ['exif', 'strip', 'gps', 'location'], searchOnly: true, run: () => { S.exp.meta = 'all'; afterExpChange(); }, hidden: () => !doc() },
    { id: 'img-fav', label: 'Favicon pack', icon: 'globe', syn: ['favicon', 'ico', 'icon'], searchOnly: true, run: () => { setMode('export'); applyPreset('favicon'); }, hidden: () => !doc() },
    { id: 'img-zip', label: 'Save all images as ZIP', icon: 'file-archive', syn: ['download all', 'zip', 'batch'], searchOnly: true, run: () => { S.exp.scope = 'all'; save(); }, hidden: () => ready().length < 2 },
    { id: 'img-full', label: 'Full screen', icon: 'maximize', syn: ['fullscreen'], searchOnly: true, run: () => toggleFull() },
  ],
});

// ───────────────────────── intake ─────────────────────────
async function openFiles(files, { source, restore } = {}) {
  const first = S.docs.length, slots = files.map((f, k) => ({ id: restore?.[k]?.id || ++uid, loading: true, name: f.name, file: f }));
  S.docs.push(...slots);
  if (S.active < 0 || !doc()) S.active = first;
  renderAll();
  await Promise.all(slots.map(async (slot, k) => {
    await wait(k * 50);
    try {
      const d = await decodeFile(slot.file);
      Object.assign(slot, d, { id: slot.id, loading: false });
      const r = restore?.[k];
      if (r) { slot.recipe = r.recipe || []; slot.undo = r.undo || []; slot.redo = r.redo || []; if (slot.recipe.some((s) => s.type === 'bg')) await loadCutout(slot); slot.thumb = thumbOf(slot); }
    } catch (err) {
      S.docs.splice(S.docs.indexOf(slot), 1); S.failed.push({ id: slot.id, name: slot.name, reason: err.reason || 'Couldn’t read this file.' });
    }
    if (S.active >= S.docs.length) S.active = S.docs.length - 1;
    renderDock();
    if (doc() === slot) { renderAll(); fitView(); afterOpen(); }
  }));
  if (!doc()) { const i = S.docs.findIndex((d) => !d.loading); S.active = i; }
  renderAll(); afterOpen(); saveSoon();
}
function afterOpen() {
  const d = doc(); if (!d || d._initDone) return; d._initDone = true;
  if (S.init.bg && CUTOUTS[d.name]) { S.init.bg = false; setTimeout(removeBg, 400); }
  if (S.init.ocr) { S.init.ocr = false; setTimeout(findText, 300); }
  if (S.init.crop) { S.init.crop = false; startCrop(); }
}
async function decodeFile(f) {
  const buf = await f.arrayBuffer();
  if (buf.byteLength < 100) throw { reason: `Only ${buf.byteLength} bytes — not an image.` };
  let bmp;
  try { bmp = await createImageBitmap(new Blob([buf])); } catch { throw { reason: 'Damaged or not an image.' }; }
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const kind = /^hei[cf]$/.test(ext) ? 'HEIC' : ext === 'png' ? 'PNG' : ext === 'webp' ? 'WebP' : /^jpe?g$/.test(ext) ? 'JPEG' : ext === 'avif' ? 'AVIF' : ext.toUpperCase();
  const exif = E.readExif(buf);
  const d = { id: ++uid, file: f, buf, name: f.name, ext, kind, bytes: f.size, w: bmp.width, h: bmp.height, bmp, exif, info: E.humanExif(exif), recipe: [], undo: [], redo: [], alpha: kind === 'PNG' || kind === 'WebP' };
  d.thumb = thumbOf(d);
  return d;
}
async function loadCutout(d) { if (d.cutout || !CUTOUTS[d.name]) return; d.cutout = await fetch(CUTOUTS[d.name]).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null); }
function thumbOf(d) { const c = E.render(d, { maxDim: 200 }); return E.hasAlpha(d) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.84); }
const thumbQ = new Set(); let thumbT = 0;
function queueThumb(d) { thumbQ.add(d); clearTimeout(thumbT); thumbT = setTimeout(() => { thumbQ.forEach((x) => { x.thumb = thumbOf(x); const im = $(`.lb-thumb[data-id="${x.id}"] img`); if (im) im.src = x.thumb; }); thumbQ.clear(); }, 350); }

// ───────────────────────── persistence ─────────────────────────
let saveT = 0;
function saveSoon() { if (S.noPersist) return; clearTimeout(saveT); saveT = setTimeout(() => saveDocs(ready(), Math.max(0, ready().indexOf(doc()))), 600); }

// ───────────────────────── recipe + undo (snapshots) ─────────────────────────
function snap(d, key) {
  const now = Date.now();
  if (key && d._k === key && now - d._t < 1500) { d._t = now; return; }
  d.undo.push(JSON.stringify(d.recipe)); if (d.undo.length > 100) d.undo.shift();
  d.redo = []; d._k = key; d._t = now;
}
function stepLabel(s) {
  switch (s.type) {
    case 'adjust': { const a = E.ADJ_BY[s.key]; return `${a.label} ${s.value > 0 && a.min < 0 ? '+' : s.value < 0 ? '−' : ''}${Math.abs(s.value)}`; }
    case 'auto': return 'Auto enhance';
    case 'rotate': return s.deg > 0 ? 'Rotate right' : 'Rotate left';
    case 'flip': return s.axis === 'v' ? 'Flip vertical' : 'Flip horizontal';
    case 'straighten': return `Straighten ${s.deg > 0 ? '+' : ''}${s.deg.toFixed(1)}°`;
    case 'crop': return `Crop · ${ASPECTS.find((a) => a.id === s.aspect)?.label || 'Free'}`;
    case 'bg': return `Remove background · ${FILL_LABEL[s.fill]}${s.shadow ? ' + shadow' : ''}`;
    case 'refine': return `Refine edge · ${s.mode === 'erase' ? 'erase' : 'restore'}`;
    case 'opacity': return `Image opacity ${s.value} %`;
    case 'mark': return markName(s);
  }
  return s.type;
}
function markName(s) { return s.name || (s.shape.kind === 'text' ? `Text “${s.shape.text.slice(0, 24)}”` : KIND_LABEL[s.shape.kind]); }
function stepIcon(s) {
  return { adjust: E.ADJ_BY[s.key]?.icon, auto: 'sparkles', rotate: s.deg > 0 ? 'rotate-cw' : 'rotate-ccw', flip: s.axis === 'v' ? 'flip-vertical' : 'flip-horizontal', straighten: 'ruler', crop: 'crop', bg: 'scissors', refine: 'brush',
    opacity: 'layers', mark: KIND_ICON[s.shape?.kind] }[s.type] || 'circle-check';
}
function pushStep(step, d = doc(), { fast = false, key } = {}) {
  if (!d) return;
  snap(d, key);
  Object.assign(step, { id: ++uid, on: true });
  d.recipe.push(step);
  changed(d, { fast });
  return step;
}
function changed(d = doc(), { fast = false } = {}) {
  if (!d) return;
  if (d === doc()) { syncFrame(); schedule(fast); }
  updateHistory(); updateUndo(); queueThumb(d); queueEstimate(fast ? 260 : 140); updateFrameMeta(); saveSoon();
  $(`.lb-thumb[data-id="${d.id}"]`)?.classList.toggle('is-edited', d.recipe.some((s) => s.on));
}
function restoreRecipe(d, json) { d.recipe = JSON.parse(json); for (const s of d.recipe) uid = Math.max(uid, s.id || 0); }
function undo() {
  if (S.cropping) return cancelCrop();
  const d = doc(); if (!d || !d.undo.length) return;
  d.redo.push(JSON.stringify(d.recipe)); restoreRecipe(d, d.undo.pop()); d._k = null; afterStructural(d);
}
function redo() { const d = doc(); if (!d || !d.redo.length) return; d.undo.push(JSON.stringify(d.recipe)); restoreRecipe(d, d.redo.pop()); d._k = null; afterStructural(d); }
function afterStructural(d) {
  if (S.selMark && !d.recipe.some((s) => s.id === S.selMark)) S.selMark = null;
  changed(d); renderPanel(); renderMobilePanel();
}
function toggleStep(id) { const d = doc(), s = d?.recipe.find((x) => x.id === id); if (!s) return; snap(d); s.on = !s.on; changed(d); refreshPanelBits(); }
function deleteStep(id) {
  const d = doc(), i = d.recipe.findIndex((x) => x.id === id); if (i < 0) return;
  snap(d); const [s] = d.recipe.splice(i, 1); afterStructural(d);
  toast(`Removed “${stepLabel(s)}”`, { type: 'neutral', action: { label: 'Undo', onClick: undo } });
}
function resetAll() {
  const d = doc(); if (!d?.recipe.length) return;
  snap(d); const n = d.recipe.length; d.recipe = []; S.selMark = null; afterStructural(d);
  toast(`Back to the original · ${n} edit${n > 1 ? 's' : ''} removed`, { type: 'neutral', action: { label: 'Undo', onClick: undo } });
}
function setAdjust(key, value, { live = true } = {}) {
  const d = doc(); if (!d) return;
  value = Math.round(value);
  const last = d.recipe.at(-1);
  if (last && last.type === 'adjust' && last.key === key && d._k === 'adj:' + key && Date.now() - d._t < 1500) { last.value = value; d._t = Date.now(); changed(d, { fast: live }); return; }
  if (E.effective(d).adj[key] === value) return;
  pushStep({ type: 'adjust', key, value }, d, { fast: live, key: 'adj:' + key });
}
function autoEnhance() {
  const d = doc(); if (!d) return;
  const v = E.autoValues(E.render(d, { maxDim: 400, skip: (s) => s.type === 'adjust' || s.type === 'auto' }));
  pushStep({ type: 'auto', values: v }); refreshPanelBits(); renderMobilePanel();
}
function rotate(deg) { const d = doc(); if (!d) return; if (S.cropping) S.cropping.rect = { x: 0, y: 0, w: 1, h: 1 }; pushStep({ type: 'rotate', deg }, d); }
function flip(axis = 'h') { const d = doc(); if (d) pushStep({ type: 'flip', axis }, d); }

// ───────────────────────── stage: infinite canvas (pan / zoom) ─────────────────────────
function stageDoc() {
  const d = doc(); if (!d) return null;
  if (S.cropping) return { ...d, recipe: [...d.recipe.filter((s) => s.type !== 'crop' && s.type !== 'straighten'), { type: 'straighten', deg: S.cropping.straighten, on: true }] };
  return d;
}
function frame() {
  const d = stageDoc(); if (!d) return null;
  if (S.mode === 'export' && S.exp.box && S.est?.plan?.box && !S.cropping) return { ow: S.exp.box.w, oh: S.exp.box.h, boxed: true };
  const g = E.geometry(d, E.effective(d), { noCrop: !!S.cropping });
  return { ow: g.ow, oh: g.oh, g };
}
const stageRect = () => stage.getBoundingClientRect();
function fitView() {
  const f = frame(); if (!f) return;
  const st = stageRect(), pad = mob() ? 12 : st.width < 720 ? 24 : 48;
  const z = Math.min((st.width - pad * 2) / f.ow, (st.height - pad * 2) / f.oh, 2);
  Object.assign(S.view, { z, x: (st.width - f.ow * z) / 2, y: (st.height - f.oh * z) / 2, fit: true, ow: f.ow, oh: f.oh });
  applyView(); schedule();
}
/** Keep the image centre where it was when the output size changes (crop, rotate). */
function syncFrame() {
  const f = frame(); if (!f) return;
  const v = S.view;
  if (v.ow === f.ow && v.oh === f.oh) return;
  if (v.fit || !v.ow) { v.ow = f.ow; v.oh = f.oh; fitView(); return; }
  const cx = v.x + v.ow * v.z / 2, cy = v.y + v.oh * v.z / 2;
  Object.assign(v, { ow: f.ow, oh: f.oh, x: cx - f.ow * v.z / 2, y: cy - f.oh * v.z / 2 });
  applyView();
}
function applyView() {
  const v = S.view; if (!v.ow) return;
  view.style.width = v.ow * v.z + 'px'; view.style.height = v.oh * v.z + 'px';
  view.style.transform = `translate(${v.x}px, ${v.y}px)`;
  view.classList.toggle('is-pixel', v.z * devicePixelRatio > 2.5);
  let gsz = 24 * v.z; while (gsz < 14) gsz *= 2; while (gsz >= 28) gsz /= 2;
  stage.style.backgroundSize = `${gsz}px ${gsz}px`; stage.style.backgroundPosition = `${v.x}px ${v.y}px`;
  $$('.lb-zoompct').forEach((el) => (el.textContent = Math.round(v.z * 100) + ' %'));
  $$('[data-zoom="fit"]').forEach((b) => b.setAttribute('aria-pressed', String(v.fit)));
  $('#draft').setAttribute('viewBox', `0 0 ${v.ow} ${v.oh}`);
  placeSplit(); placeSel();
}
function setZoom(nz, ax, ay) {
  const v = S.view; if (!v.ow) return;
  if (nz === 'fit') return fitView();
  const st = stageRect();
  nz = clamp(nz, 0.02, 16);
  ax ??= st.width / 2; ay ??= st.height / 2;
  const px = (ax - v.x) / v.z, py = (ay - v.y) / v.z;
  Object.assign(v, { z: nz, x: ax - px * nz, y: ay - py * nz, fit: false });
  applyView(); schedule(true);
}
function panBy(dx, dy) { const v = S.view; v.x += dx; v.y += dy; v.fit = false; applyView(); }
const ZSTEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
function zoomStep(dir) { const z = S.view.z; const n = dir > 0 ? ZSTEPS.find((s) => s > z * 1.01) || 16 : [...ZSTEPS].reverse().find((s) => s < z * 0.99) || 0.05; setZoom(n); }
new ResizeObserver(() => { if (!doc()) return; if (S.view.fit) fitView(); else applyView(); }).observe(stage);

let rq = 0, hqT = 0;
function schedule(fast = false) {
  cancelAnimationFrame(rq); rq = requestAnimationFrame(() => paint(fast));
  clearTimeout(hqT); if (fast) hqT = setTimeout(() => paint(false), 220);
}
function paint(fast) {
  const d = stageDoc(); if (!d) return;
  const f = frame(); if (f.ow !== S.view.ow || f.oh !== S.view.oh) syncFrame();
  const v = S.view;
  const before = S.compare || (S.mode === 'export' && !f.boxed);
  const scale = clamp((v.ow * v.z * devicePixelRatio) / v.ow, 0.02, 1) * (fast ? 0.6 : 1);
  const r = E.render(d, { scale, noCrop: !!S.cropping, noMarks: !!S.cropping, skip: before ? (s) => !E.isGeo(s) : null, ghost: !!S.refine, hide: S.editingText });
  if (cv.width !== r.width || cv.height !== r.height) { cv.width = r.width; cv.height = r.height; }
  const x = cv.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(r, 0, 0);
  S.geo = r._geo;
  view.classList.toggle('has-alpha', E.hasAlpha(d) && !before || !!S.refine);
  cv.hidden = !!f.boxed && S.mode === 'export';
  overlays();
}
function crossfade() {
  cvOld.width = cv.width; cvOld.height = cv.height; cvOld.getContext('2d').drawImage(cv, 0, 0);
  cvOld.classList.remove('is-fading'); cvOld.hidden = false; void cvOld.offsetWidth;
  cvOld.classList.add('is-fading'); setTimeout(() => { cvOld.hidden = true; cvOld.classList.remove('is-fading'); }, 900);
}

// ───────────────────────── overlays: HUD, split, OCR, selection, crop ─────────────────────────
function overlays() { renderOcr(); renderCropBox(); placeSplit(); renderHud(); placeSel(); }
function renderHud() {
  const d = doc(), hud = $('#hud'); if (!d) { hud.innerHTML = ''; return; }
  const exp = S.mode === 'export', est = S.est && S.est.docId === d.id ? S.est : null, boxed = S.mode === 'export' && !!S.exp.box && !!S.est?.plan?.box;
  hud.innerHTML = `
    ${exp && S.splitOn && !boxed && S.exp.preset !== 'favicon' ? `<div class="lb-label lb-label--l"><b>Original</b> · ${formatBytes(d.bytes)}</div>
      <div class="lb-label lb-label--r" id="label-after"><b>${esc(est ? (est.plan.passthrough ? 'Unchanged' : `${FMT[est.plan.format]}${est.plan.format === 'png' ? '' : ' ' + est.quality}`) : '…')}</b> · ${est ? formatBytes(est.bytes) : '…'}</div>` : ''}
    ${S.compare ? `<div class="lb-label lb-label--c">Original</div>` : ''}
    <div class="fw-zoom lb-zoom" role="group" aria-label="Zoom">
      <button class="fw-iconbtn" type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="-" data-z="-1">${icon('minus')}</button>
      <span class="fw-zoom__pct lb-zoompct" aria-live="off">${Math.round(S.view.z * 100)} %</span>
      <button class="fw-iconbtn" type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+" data-z="1">${icon('plus')}</button>
      <span class="lb-zoom__sep" aria-hidden="true"></span>
      <button class="lb-zoombtn" type="button" data-zoom="fit" aria-pressed="${S.view.fit}" data-tip="Fit to screen" data-tip-kbd="f">Fit</button>
      <button class="lb-zoombtn" type="button" data-zoom="100" data-tip="Actual pixels" data-tip-kbd="1">100 %</button></div>`;
  $$('[data-z]', hud).forEach((b) => (b.onclick = () => zoomStep(+b.dataset.z)));
  $('[data-zoom="fit"]', hud).onclick = () => setZoom('fit');
  $('[data-zoom="100"]', hud).onclick = () => setZoom(1);
}
function placeSplit() {
  const sp = $('#split'), v = S.view, d = doc();
  const boxed = S.mode === 'export' && !!S.exp.box && !!S.est?.plan?.box;
  const on = S.mode === 'export' && S.splitOn && S.exp.preset !== 'favicon' && d && v.ow && !boxed && S.est?.url && S.est.docId === d.id && !S.cropping;
  sp.hidden = !on; after.hidden = !(S.mode === 'export' && S.est?.url && d && S.est.docId === d.id && !S.cropping);
  if (on) {
    const st = stageRect(), x = S.split * st.width; sp.style.transform = `translateX(${x}px)`;
    const f = clamp((x - v.x) / (v.ow * v.z), 0, 1) * 100; after.style.clipPath = `inset(0 0 0 ${f}%)`;
  } else after.style.clipPath = 'none';
}
function initSplit() {
  const sp = $('#split');
  sp.innerHTML = `<div class="lb-split__line"></div><button class="lb-split__knob" type="button" role="slider" aria-label="Before / after split" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${icon('chevrons-left-right', { size: 18 })}</button>`;
  const knob = sp.querySelector('button');
  const move = (x) => { S.split = clamp(x / stageRect().width, 0.02, 0.98); knob.setAttribute('aria-valuenow', Math.round(S.split * 100)); placeSplit(); };
  sp.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); sp.setPointerCapture(e.pointerId); sp.classList.add('is-drag');
    const r = stageRect(); const mv = (ev) => move(ev.clientX - r.left);
    const up = () => { sp.classList.remove('is-drag'); sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up);
  });
  knob.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); move((S.split + (e.key === 'ArrowLeft' ? -0.05 : 0.05)) * stageRect().width); } });
}

// OCR boxes (words / lines / blocks) mapped through the recipe geometry, so they follow crops and rotations
function ocrBoxes(d) {
  const o = d.ocr, lines = o.lines.map((l, li) => ({ li, words: l.words, b: union(l.words.map((w) => w.b)) }));
  if (S.ocr.overlay === 'words') return lines.flatMap((l) => l.words.map((w) => ({ t: w.t, b: w.b, l: l.li })));
  if (S.ocr.overlay === 'lines') return lines.map((l) => ({ t: lineText(l.words), b: l.b, l: l.li }));
  const blocks = []; let cur = null;
  for (const l of lines) { if (cur && l.b[1] - (cur.b[1] + cur.b[3]) < l.b[3] * 1.2) { cur.ls.push(l); cur.b = union([cur.b, l.b]); } else blocks.push(cur = { ls: [l], b: l.b }); }
  return blocks.map((bk) => ({ t: bk.ls.map((l) => lineText(l.words)).join('\n'), b: bk.b, l: bk.ls[0].li }));
}
function union(bs) { const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])), x1 = Math.max(...bs.map((b) => b[0] + b[2])), y1 = Math.max(...bs.map((b) => b[1] + b[3])); return [x0, y0, x1 - x0, y1 - y0]; }
function lineText(words) {
  if (!S.ocr.spaces) return words.map((w) => w.t).join(' ');
  const avg = words.reduce((a, w) => a + w.b[2] / Math.max(1, w.t.length), 0) / words.length;
  return words.map((w, i) => (i ? ' '.repeat(clamp(Math.round((w.b[0] - words[i - 1].b[0] - words[i - 1].b[2]) / avg), 1, 12)) : '') + w.t).join('');
}
function renderOcr() {
  const el = $('#ocr'), d = doc();
  const on = d && S.mode === 'inspect' && d.ocr && typeof d.ocr === 'object' && S.ocr.overlay !== 'off' && !S.compare && !S.cropping;
  el.hidden = !on; if (!on) { el.innerHTML = ''; return; }
  const g = E.geometry(d, E.effective(d));
  el.innerHTML = ocrBoxes(d).map((w, n) => {
    const [x, y, ww, hh] = w.b; const pts = [[x, y], [x + ww, y], [x, y + hh], [x + ww, y + hh]].map(([a, b]) => g.m.transformPoint(new DOMPoint(a, b)));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const L = Math.min(...xs) / g.ow * 100, T = Math.min(...ys) / g.oh * 100, W = (Math.max(...xs) - Math.min(...xs)) / g.ow * 100, H = (Math.max(...ys) - Math.min(...ys)) / g.oh * 100;
    return `<button class="lb-word" type="button" data-l="${w.l}" data-k="${n}" style="left:${L}%;top:${T}%;width:${W}%;height:${H}%;--d:${n * 14}ms" aria-label="Copy “${esc(w.t)}”" data-t="${esc(w.t)}"></button>`;
  }).join('');
}
function initOcr() {
  const el = $('#ocr'); let drag = null;
  const words = () => $$('.lb-word', el);
  const text = (a, b) => { const ws = words().slice(Math.min(a, b), Math.max(a, b) + 1); let out = '', last = null; ws.forEach((w) => { out += (last == null ? '' : last !== w.dataset.l ? '\n' : ' ') + w.dataset.t; last = w.dataset.l; }); return out; };
  const mark = () => { const lo = Math.min(drag.a, drag.b), hi = Math.max(drag.a, drag.b); words().forEach((w) => w.classList.toggle('is-sel', +w.dataset.k >= lo && +w.dataset.k <= hi)); };
  el.addEventListener('pointerdown', (e) => { const w = e.target.closest('.lb-word'); if (!w) return; e.stopPropagation(); drag = { a: +w.dataset.k, b: +w.dataset.k }; mark(); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!drag) { const w = e.target.closest('.lb-word'); syncLine(w ? +w.dataset.l : null); return; }
    const t = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList?.contains('lb-word')); if (t) { drag.b = +t.dataset.k; mark(); }
  });
  el.addEventListener('pointerleave', () => !drag && syncLine(null));
  el.addEventListener('pointerup', async () => {
    if (!drag) return; const { a, b } = drag; drag = null;
    const t = text(a, b); await navigator.clipboard.writeText(t).catch(() => {});
    bubble(words()[b], `Copied “${t.length > 28 ? t.slice(0, 26) + '…' : t.replace(/\n/g, ' · ')}”`);
    setTimeout(() => words().forEach((x) => x.classList.remove('is-sel')), 900);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const w = e.target.closest('.lb-word'); if (!w) return; e.preventDefault(); navigator.clipboard.writeText(w.dataset.t).catch(() => {}); bubble(w, `Copied “${w.dataset.t}”`); } });
}
function syncLine(li) {
  $$('.lb-word').forEach((w) => w.classList.toggle('is-hot', li != null && +w.dataset.l === li));
  $$('.lb-lines__row').forEach((r) => r.classList.toggle('is-hot', li != null && +r.dataset.l === li));
}
function bubble(anchor, text, at) {
  $$('.lb-bubble').forEach((b) => b.remove());
  const s = stageRect(), r = at ? { left: at.x, top: at.y, width: 0 } : anchor.getBoundingClientRect();
  const b = h(`<div class="lb-bubble" role="status">${icon('check', { size: 14 })}<span></span></div>`); b.querySelector('span').textContent = text;
  stage.append(b);
  b.style.left = clamp(r.left + r.width / 2 - s.left, 90, s.width - 90) + 'px'; b.style.top = Math.max(36, r.top - s.top - 8) + 'px';
  setTimeout(() => b.classList.add('is-out'), 1500); setTimeout(() => b.remove(), 1800);
}
/** Selection box for the selected mark (Markup). */
function selMark(d = doc()) { return d && S.selMark ? d.recipe.find((s) => s.id === S.selMark && s.type === 'mark') : null; }
function placeSel() {
  const el = $('#selbox'), d = doc(), sm = selMark(d), g = S.geo;
  const m = sm && E.effective(d).marks.find((x) => x.id === sm.id);
  const on = sm && m && S.mode === 'markup' && !S.cropping && g && !S.editingText && !S.compare;
  el.hidden = !on; if (!on) return;
  const b = E.markBounds(m.shape, g), p = E.toOut({ x: b.x, y: b.y }, g), q = E.toOut({ x: b.x + b.w, y: b.y + b.h }, g);
  Object.assign(el.style, { left: p.x * 100 + '%', top: p.y * 100 + '%', width: (q.x - p.x) * 100 + '%', height: (q.y - p.y) * 100 + '%' });
}

// ───────────────────────── stage pointer: pan, pinch, draw, move, pick, refine ─────────────────────────
const ptrs = new Map(); let gest = null;
const outPt = (e) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
const framePt = (e) => E.toFrame(outPt(e), S.geo);
const onImage = (e) => { const p = outPt(e); return p.x >= 0 && p.y >= 0 && p.x <= 1 && p.y <= 1; };
const drawTool = () => S.mode === 'markup' && !S.cropping && !S.compare;
stage.addEventListener('pointerdown', (e) => {
  if (!doc() || e.button === 2) return;
  if (e.target.closest('.fw-zoom,.lb-split,.lb-crop,.lb-word,.lb-holdcmp,.lb-textin,.lb-empty,.lb-bubble')) return;
  stage.classList.add('is-pointer'); stage.focus({ preventScroll: true });
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { gest?.cancel?.(); gest = pinchGesture(); return; }
  if (ptrs.size > 2) return;
  try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  gest = pickGesture(e);
});
stage.addEventListener('pointermove', (e) => {
  if (S.refine) { const b = $('#brush'), r = stageRect(); b.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`; b.style.width = b.style.height = S.refine.r * 2 + 'px'; b.dataset.mode = S.refine.mode; }
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  gest?.move?.(e);
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gest?.pinch) { if (!ptrs.size) gest = null; return; }
  const g = gest; gest = null; g?.end?.(e);
};
stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', (e) => { gest?.cancel?.(); gest = null; ptrs.delete(e.pointerId); });

function pickGesture(e) {
  const d = doc();
  if (e.button === 1 || S.space) return panGesture(e);
  if (S.refine && onImage(e)) return refineGesture(e);
  if (S.mode === 'inspect' && S.picking && onImage(e)) return tapGesture(e, () => pickColor(e));
  if (drawTool()) {
    const t = S.tool;
    if (t === 'move' || t === 'text') { const hit = hitMark(e); if (hit) return t === 'text' && hit.shape.kind === 'text' ? tapGesture(e, () => editText(hit)) : moveGesture(e, hit); }
    if (!onImage(e) && t !== 'shape' && t !== 'blur') return panGesture(e);
    if (t === 'move') { if (S.selMark) { S.selMark = null; placeSel(); renderPanel(); renderMobilePanel(); } return panGesture(e); }
    if (t === 'pick') return tapGesture(e, () => pickColor(e));
    if (t === 'fill') return tapGesture(e, () => addMark({ kind: 'fill', a: framePt(e), color: S.st.color, tol: S.st.tol, opacity: S.st.opacity }));
    if (t === 'text') return tapGesture(e, () => placeText(e));
    return drawGesture(e, d);
  }
  return panGesture(e);
}
function panGesture(e) {
  let lx = e.clientX, ly = e.clientY, moved = false;
  return {
    move(ev) { const dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; if (dx || dy) { moved = true; stage.classList.add('is-panning'); panBy(dx, dy); } },
    end() { stage.classList.remove('is-panning'); },
    cancel() { stage.classList.remove('is-panning'); },
  };
}
function tapGesture(e, fn) { const x0 = e.clientX, y0 = e.clientY; let far = false; return { move(ev) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) far = true; }, end() { if (!far) fn(); } }; }
function pinchGesture() {
  const [a, b] = [...ptrs.values()]; const st = stageRect();
  let d0 = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m0 = { x: (a.x + b.x) / 2 - st.left, y: (a.y + b.y) / 2 - st.top };
  const v0 = { ...S.view };
  return {
    pinch: true,
    move() {
      const [p, q] = [...ptrs.values()]; if (!q) return;
      const dd = Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), m = { x: (p.x + q.x) / 2 - st.left, y: (p.y + q.y) / 2 - st.top };
      const z = clamp(v0.z * dd / d0, 0.02, 16), ix = (m0.x - v0.x) / v0.z, iy = (m0.y - v0.y) / v0.z;
      Object.assign(S.view, { z, x: m.x - ix * z, y: m.y - iy * z, fit: false }); applyView(); schedule(true);
    },
  };
}
function hitMark(e) {
  const d = doc(), g = S.geo; if (!d || !g) return null;
  const p = framePt(e), tolx = 8 / (S.view.z * g.fw), toly = 8 / (S.view.z * g.fh);
  const marks = E.effective(d).marks.slice().reverse();
  for (const m of marks) { const b = E.markBounds(m.shape, g); if (p.x >= b.x - tolx && p.x <= b.x + b.w + tolx && p.y >= b.y - toly && p.y <= b.y + b.h + toly) return d.recipe.find((s) => s.id === m.id); }
  return null;
}
function moveGesture(e, m) {
  const d = doc(), p0 = framePt(e), s0 = m.shape; let moved = false;
  if (S.selMark !== m.id) { S.selMark = m.id; renderPanel(); renderMobilePanel(); }
  placeSel();
  return {
    move(ev) {
      const p = framePt(ev), dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      if (!moved) { snap(d); moved = true; }
      m.shape = E.moveShape(s0, dx, dy); schedule(true); placeSel();
    },
    end() { if (moved) changed(d); },
    cancel() { if (moved) { m.shape = s0; changed(d); } },
  };
}
function drawGesture(e, d) {
  e.preventDefault();
  const svg = $('#draft'), g = S.geo, v = S.view, t = S.tool, st = S.st;
  const toO = (p) => E.toOut(p, g), O = (p) => { const q = toO(p); return [q.x * v.ow, q.y * v.oh]; };
  const p0 = framePt(e), pts = [p0]; let last = p0;
  const k = t === 'shape' ? st.shape : t;
  const width = { brush: st.size, pencil: st.pencil, eraser: st.eraser }[t];
  const draw = () => {
    const [ax, ay] = O(p0), [bx, by] = O(last);
    if (t === 'brush' || t === 'pencil' || t === 'eraser') svg.innerHTML = `<polyline points="${pts.map((p) => O(p).join(',')).join(' ')}" fill="none" stroke="${t === 'eraser' ? 'rgba(255,255,255,.75)' : st.color}" stroke-opacity="${st.opacity / 100}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${t === 'eraser' ? 'stroke-dasharray="1 0"' : ''}/>`;
    else if (k === 'rect') svg.innerHTML = `<rect x="${Math.min(ax, bx)}" y="${Math.min(ay, by)}" width="${Math.abs(bx - ax)}" height="${Math.abs(by - ay)}" fill="${st.fillOn ? st.fill : 'none'}" stroke="${st.color}" stroke-width="${st.width}" opacity="${st.opacity / 100}"/>`;
    else if (k === 'ellipse') svg.innerHTML = `<ellipse cx="${(ax + bx) / 2}" cy="${(ay + by) / 2}" rx="${Math.abs(bx - ax) / 2}" ry="${Math.abs(by - ay) / 2}" fill="${st.fillOn ? st.fill : 'none'}" stroke="${st.color}" stroke-width="${st.width}" opacity="${st.opacity / 100}"/>`;
    else if (k === 'line' || k === 'arrow') svg.innerHTML = `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="round" opacity="${st.opacity / 100}"/>${k === 'arrow' ? `<circle cx="${bx}" cy="${by}" r="${Math.max(st.width * 1.6, 5)}" fill="${st.color}"/>` : ''}`;
    else if (k === 'blur') svg.innerHTML = `<rect x="${Math.min(ax, bx)}" y="${Math.min(ay, by)}" width="${Math.abs(bx - ax)}" height="${Math.abs(by - ay)}" fill="rgba(127,127,127,.35)" stroke="#fff" stroke-width="${2 / v.z}" stroke-dasharray="${6 / v.z}"/>`;
  };
  return {
    move(ev) { const p = framePt(ev); if (t === 'brush' || t === 'pencil' || t === 'eraser') { const l = pts.at(-1); if (Math.hypot((p.x - l.x) * g.fw, (p.y - l.y) * g.fh) > 1.5 / v.z) pts.push(p); } last = p; draw(); },
    end() {
      svg.innerHTML = '';
      const tiny = Math.hypot((last.x - p0.x) * g.fw, (last.y - p0.y) * g.fh) * v.z < 4;
      if (t === 'brush' || t === 'pencil' || t === 'eraser') addMark({ kind: t, pts, color: st.color, size: width, opacity: st.opacity }, { select: false });
      else if (!tiny) addMark(k === 'blur' ? { kind: 'blur', a: p0, b: last, cell: st.cell } : { kind: k, a: p0, b: last, color: st.color, width: st.width, fill: (k === 'rect' || k === 'ellipse') && st.fillOn ? st.fill : null, opacity: st.opacity });
    },
    cancel() { svg.innerHTML = ''; },
  };
}
function addMark(shape, { select = true } = {}) {
  const d = doc(); if (!d) return;
  const s = pushStep({ type: 'mark', shape }, d);
  if (select && shape.kind !== 'fill') S.selMark = s.id;
  renderPanel(); renderMobilePanel();
  return s;
}
function pickColor(e) {
  const p = outPt(e), x = cv.getContext('2d', { willReadFrequently: true });
  const px = clamp(Math.floor(p.x * cv.width), 0, cv.width - 1), py = clamp(Math.floor(p.y * cv.height), 0, cv.height - 1);
  const [r, g, b] = x.getImageData(px, py, 1, 1).data, hex = E.rgbHex([r, g, b]);
  S.st.color = hex; S.picked = [{ hex, rgb: [r, g, b] }, ...S.picked.filter((c) => c.hex !== hex)].slice(0, 8);
  bubble(null, `Picked ${hex}`, { x: e.clientX, y: e.clientY });
  renderPanel(); renderMobilePanel();
}
function refineGesture(e) {
  e.preventDefault();
  const d = doc(), g = S.geo; if (!g) return null;
  const inv = g.m.inverse(), v = S.view, r = (S.refine.r / v.z) / g.cover;
  const toSrc = (ev) => { const p = outPt(ev); const q = inv.transformPoint(new DOMPoint(p.x * g.ow, p.y * g.oh)); return { x: q.x, y: q.y }; };
  const step = pushStep({ type: 'refine', mode: S.refine.mode, r, pts: [toSrc(e)] }, d, { fast: true });
  return {
    move(ev) { const p = toSrc(ev), l = step.pts.at(-1); const n = Math.ceil(Math.hypot(p.x - l.x, p.y - l.y) / (r * 0.4)); for (let i = 1; i <= n; i++) step.pts.push({ x: l.x + (p.x - l.x) * i / n, y: l.y + (p.y - l.y) * i / n }); schedule(true); },
    end() { changed(d); },
  };
}
stage.addEventListener('wheel', (e) => {
  if (!doc()) return; e.preventDefault();
  const r = stageRect(), ax = e.clientX - r.left, ay = e.clientY - r.top;
  const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)));
  if (e.shiftKey) panBy(-e.deltaY, 0);
  else if (trackpadPan) panBy(-e.deltaX, -e.deltaY);
  else setZoom(S.view.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), ax, ay);
}, { passive: false });
stage.addEventListener('dblclick', (e) => {
  if (!doc() || S.cropping || e.target.closest('.fw-zoom,.lb-split,.lb-word')) return;
  if (S.mode === 'markup') { const m = hitMark(e); if (m?.shape.kind === 'text') editText(m); return; }
  const r = stageRect(); S.view.fit ? setZoom(1, e.clientX - r.left, e.clientY - r.top) : setZoom('fit');
});

// Text: type straight onto the image; double-click / Text tool on existing text edits it
function textInput(p, s, onDone) {
  $$('.lb-textin').forEach((x) => x.remove());
  const v = S.view, g = S.geo, q = E.toOut(p, g);
  const inp = h(`<textarea class="lb-textin" rows="1" aria-label="Text on the image" placeholder="Type…" spellcheck="false"></textarea>`);
  inp.value = s.text || '';
  const fs = s.fsize * v.z;
  Object.assign(inp.style, { left: q.x * 100 + '%', top: q.y * 100 + '%', fontSize: fs + 'px', lineHeight: '1.2', color: s.color, fontFamily: s.font, fontWeight: s.weight, textAlign: s.align,
    translate: s.align === 'center' ? '-50% 0' : s.align === 'right' ? '-100% 0' : '0 0', WebkitTextStroke: s.outlineW ? `${Math.max(1, s.outlineW * v.z)}px ${s.outline}` : '' });
  const grow = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; inp.style.width = 'auto'; inp.style.width = Math.max(fs * 3, inp.scrollWidth + 8) + 'px'; };
  view.append(inp); grow(); inp.addEventListener('input', grow);
  inp.focus({ preventScroll: true }); inp.select(); setTimeout(() => { if (document.activeElement !== inp) inp.focus({ preventScroll: true }); }, 0);
  let done = false; const pop = pushLayer(() => finish(false), inp);
  function finish(ok) {
    if (done) return; done = true; pop();
    const t = inp.value.replace(/\s+$/, ''); inp.remove();
    onDone(ok ? t : null); stage.focus({ preventScroll: true });
  }
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); } });
  inp.addEventListener('blur', () => finish(true));
}
function textStyle() { const d = doc(), g = S.geo; return { color: S.st.color, font: S.st.font, weight: S.st.weight, fsize: S.st.fsize || Math.round(Math.min(g.fw, g.fh) * 0.07), outline: S.st.outline, outlineW: S.st.outlineW, align: S.st.align, w: S.st.boxW, opacity: S.st.opacity }; }
function placeText(e) {
  const p = framePt(e), s = textStyle();
  if (!S.st.fsize) S.st.fsize = s.fsize;
  textInput(p, s, (t) => { if (t) addMark({ kind: 'text', a: p, text: t, ...s }); });
}
function editText(m) {
  S.selMark = m.id; S.editingText = m.id; schedule(); placeSel();
  textInput(m.shape.a, m.shape, (t) => {
    S.editingText = null; const d = doc();
    if (t != null && t !== m.shape.text) { snap(d); if (t) m.shape = { ...m.shape, text: t }; else d.recipe.splice(d.recipe.indexOf(m), 1); changed(d); renderPanel(); }
    else schedule();
    placeSel();
  });
}

// ───────────────────────── crop ─────────────────────────
function startCrop() {
  const d = doc(); if (!d || S.cropping) return;
  if (S.mode !== 'edit') setMode('edit');
  if (mob() && S.mtab !== 'crop') { S.mtab = 'crop'; S.mfull = false; }
  const e = E.effective(d);
  S.cropping = { rect: e.crop ? { ...e.crop } : { x: 0, y: 0, w: 1, h: 1 }, aspect: e.aspect || 'free', straighten: e.straighten, orig: { crop: e.crop, straighten: e.straighten } };
  S.cropPop = pushLayer(() => cancelCrop());
  S.view.fit = true; syncFrame(); fitView(); renderPanel(); renderMobileBar(); renderFramebar();
}
function cancelCrop() { if (!S.cropping) return; S.cropping = null; S.cropPop?.(); S.view.fit = true; syncFrame(); fitView(); renderPanel(); renderMobileBar(); renderFramebar(); }
function commitCrop() {
  const c = S.cropping, d = doc(); if (!c || !d) return;
  S.cropping = null; S.cropPop?.();
  const r = c.rect, full = r.x < 0.001 && r.y < 0.001 && r.w > 0.999 && r.h > 0.999;
  if (Math.abs(c.straighten - (c.orig.straighten || 0)) > 0.05) pushStep({ type: 'straighten', deg: +c.straighten.toFixed(1) }, d);
  const same = c.orig.crop ? ['x', 'y', 'w', 'h'].every((k) => Math.abs(c.orig.crop[k] - r[k]) < 0.001) : full;
  if (!same) pushStep({ type: 'crop', rect: { ...r }, aspect: c.aspect }, d);
  S.view.fit = true; syncFrame(); fitView(); renderPanel(); renderMobileBar(); renderFramebar();
}
function resetCrop() { const c = S.cropping; if (!c) return; c.rect = { x: 0, y: 0, w: 1, h: 1 }; c.aspect = 'free'; c.straighten = 0; schedule(); renderPanel(); renderMobilePanel(); }
function setAspect(id) {
  const c = S.cropping; if (!c) return; c.aspect = id;
  const a = ASPECTS.find((x) => x.id === id), f = frame(), d = doc();
  const ratio = a.r || (id === 'original' ? (E.effective(d).rot % 180 ? d.h / d.w : d.w / d.h) : null);
  if (ratio) {
    const fr = f.ow / f.oh; let w = 1, hh = 1;
    if (ratio > fr) hh = fr / ratio; else w = ratio / fr;
    const cx = c.rect.x + c.rect.w / 2, cy = c.rect.y + c.rect.h / 2;
    c.rect = { w, h: hh, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - hh / 2, 0, 1 - hh) };
  }
  renderCropBox(); $$('[data-aspect]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aspect === id)));
}
function renderCropBox() {
  const el = $('#crop'), c = S.cropping;
  el.hidden = !c; view.classList.toggle('is-cropping', !!c); if (!c) return;
  if (!el.firstChild) {
    el.innerHTML = `<div class="lb-crop__grid"></div>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((k) => `<span class="lb-crop__h lb-crop__h--${k}" data-h="${k}"></span>`).join('')}`;
    el.addEventListener('pointerdown', cropDrag);
  }
  Object.assign(el.style, { left: c.rect.x * 100 + '%', top: c.rect.y * 100 + '%', width: c.rect.w * 100 + '%', height: c.rect.h * 100 + '%' });
  const f = frame(); $$('.lb-cropsize').forEach((o) => (o.textContent = `${Math.round(c.rect.w * f.ow)} × ${Math.round(c.rect.h * f.oh)} px`));
}
function cropDrag(e) {
  e.preventDefault(); e.stopPropagation();
  const c = S.cropping, hnd = e.target.dataset.h || 'move', r0 = { ...c.rect }, p0 = outPt(e);
  const a = ASPECTS.find((x) => x.id === c.aspect), f = frame();
  const ratio = a?.r ? a.r * f.oh / f.ow : c.aspect === 'original' ? r0.w / r0.h : null;
  const el = $('#crop'); el.setPointerCapture(e.pointerId); el.classList.add('is-drag');
  const mv = (ev) => {
    const p = outPt(ev), dx = p.x - p0.x, dy = p.y - p0.y; let { x, y, w, h: hh } = r0;
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
function setStraighten(v) { if (!S.cropping) return; S.cropping.straighten = clamp(v, -45, 45); schedule(true); $$('.lb-strval').forEach((o) => (o.textContent = `${S.cropping.straighten.toFixed(1)}°`)); }

// ───────────────────────── background removal (pre-rendered result, real interaction) ─────────────────────────
async function removeBg() {
  const d = doc(); if (!d || S.bgJob || E.effective(d).bg) return;
  if (S.mode !== 'edit') setMode('edit');
  if (!CUTOUTS[d.name]) { S.bgJob = { phase: 'unavailable', docId: d.id }; renderBgBlock(); return; }
  const job = S.bgJob = { phase: S.modelReady ? 'run' : 'model', got: 0, docId: d.id, cancel: false };
  renderBgBlock();
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
  if (S.exp.format === 'jpeg' || S.exp.format === 'original') { S.exp.format = 'webp'; S.exp.preset = null; S.fmtNote = 'Switched to WebP to keep the transparency.'; }
  renderPanel(); renderMobilePanel();
}
function bgStep() { const d = doc(); const e = d && E.effective(d); return e?.bg ? d.recipe.find((s) => s.id === e.bg.id) : null; }
function setFill(fill) {
  const d = doc(), s = bgStep(); if (!s) return;
  snap(d, 'bgfill'); s.fill = fill; if (fill === 'color' && !s.color) s.color = '#dbeafe';
  S.fmtNote = fill === 'transparent' && S.exp.format === 'jpeg' ? 'JPEG can’t keep transparency.' : '';
  changed(d); renderBgBlock();
}
function updateBgProgress() {
  const j = S.bgJob; if (!j) return;
  $$('.lb-bgprog').forEach((el) => { el.querySelector('.fw-ring')?.style.setProperty('--value', Math.round(j.got / 88 * 100)); const mb = el.querySelector('.lb-bgprog__mb'); if (mb) mb.textContent = `${Math.round(j.got)} of 88 MB`; });
  $$('#m-bg .fw-ring').forEach((r) => r.style.setProperty('--value', Math.round(j.got / 88 * 100)));
}
function toggleRefine(on = !S.refine) {
  S.refine = on ? { mode: 'erase', r: 22 } : null;
  if (on) S.refinePop = pushLayer(() => toggleRefine(false)); else S.refinePop?.();
  stage.classList.toggle('is-refining', !!S.refine); $('#brush').hidden = !S.refine;
  schedule(); renderBgBlock();
}

// ───────────────────────── OCR (pre-made result, real interaction) ─────────────────────────
let OCR_DATA = null;
async function findText({ again = false } = {}) {
  const d = doc(); if (!d || d.ocr === 'loading') return;
  if (S.mode !== 'inspect') setMode('inspect');
  if (d.ocr && !again) return;
  d.ocr = 'loading'; d.ocrPhase = S.ocrReady ? 'read' : 'engine'; renderPanel(); renderMobilePanel();
  OCR_DATA ||= await fetch('assets/ocr.json').then((r) => r.json()).catch(() => ({}));
  if (!S.ocrReady) { await wait(650); S.ocrReady = true; d.ocrPhase = 'read'; renderPanel(); renderMobilePanel(); }
  $('#scan').hidden = false; await wait(850); $('#scan').hidden = true;
  const data = OCR_DATA[d.name];
  d.ocr = data ? data : 'none';
  if (data && S.ocr.overlay === 'off') S.ocr.overlay = 'words';
  renderOcr(); renderPanel(); renderMobilePanel();
}
const ocrText = (d) => d.ocr.lines.map((l) => lineText(l.words)).join('\n');
const ocrConf = (d) => { const ws = d.ocr.lines.flatMap((l) => l.words); return Math.round(ws.reduce((a, w) => a + (w.c || 0.9), 0) / ws.length * 100); };

// ───────────────────────── export ─────────────────────────
function baseName(d) { return d.name.replace(/\.[^.]+$/, ''); }
function planFor(d) {
  const x = S.exp, e = E.effective(d), g = E.geometry(d, e);
  const edited = d.recipe.some((s) => s.on);
  let format = x.format, note = '';
  if (format === 'original') { format = d.kind === 'PNG' ? 'png' : d.kind === 'WebP' ? 'webp' : 'jpeg'; if (d.kind === 'HEIC') note = 'Browsers can’t write HEIC, so this saves a JPEG.'; }
  const alpha = E.hasAlpha(d) && !(x.box?.bg);
  if (alpha && format === 'jpeg' && E.effective(d).bg) { format = 'webp'; note = 'JPEG can’t keep transparency, so this saves WebP.'; }
  let W = g.ow, H = g.oh, box = null, k = null;
  if (x.box) { box = x.box; W = box.w; H = box.h; }
  else {
    const v = Math.max(1, +x.value || 1);
    if (x.size === 'longest') k = v / Math.max(g.ow, g.oh);
    else if (x.size === 'width') k = v / g.ow;
    else if (x.size === 'height') k = v / g.oh;
    else if (x.size === 'percent') k = v / 100;
    else if (x.size === 'box') k = Math.min(x.boxW / g.ow, x.boxH / g.oh);
    else if (x.size === 'exact') { W = Math.max(1, Math.round(x.exactW)); H = x.lock ? Math.max(1, Math.round(x.exactW * g.oh / g.ow)) : Math.max(1, Math.round(x.exactH)); }
    if (k) { if (x.noUp && k > 1 && x.size !== 'percent') k = 1; W = Math.max(1, Math.round(g.ow * k)); H = Math.max(1, Math.round(g.oh * k)); }
  }
  const resized = W !== g.ow || H !== g.oh;
  const passthrough = x.format === 'original' && !edited && !resized && d.kind !== 'HEIC' && !x.max;
  const quality = format === 'png' ? 100 : x.format === 'original' ? 92 : x.quality;
  const renderScale = box ? Math.min(1, Math.max(box.w / g.ow, box.h / g.oh) * 1.02) : Math.min(1, Math.max(W / g.ow, H / g.oh) * 1.02);
  const p = PRESETS.find((y) => y.id === x.preset);
  const suffix = p ? `-${p.suffix}` : resized ? `-${W}x${H}` : edited ? '-edited' : '';
  const metaNote = x.meta === 'keep' && format !== 'jpeg' && d.exif ? `${FMT[format]} files are saved without metadata.` : '';
  return { format, quality, W, H, box, passthrough, renderScale, alpha, note, metaNote, edited, ow: g.ow, oh: g.oh, name: S.exp.nameFor?.[d.id] || `${baseName(d)}${suffix}.${EXT[format]}` };
}
function boxed(src, box) {
  const c = E.mk(box.w, box.h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  if (box.bg) { x.fillStyle = box.bg; x.fillRect(0, 0, box.w, box.h); }
  const k = box.fit === 'crop' ? Math.max(box.w / src.width, box.h / src.height) : Math.min(box.w / src.width, box.h / src.height) * 0.9;
  const w = src.width * k, hh = src.height * k; x.drawImage(src, (box.w - w) / 2, (box.h - hh) / 2, w, hh);
  return c;
}
async function exportOne(d) {
  const p = planFor(d);
  if (p.passthrough) {
    const blob = p.format === 'jpeg' ? await E.jpegMeta(d.file, S.exp.meta) : d.file;
    return { blob, bytes: blob.size, quality: null, plan: p, docId: d.id };
  }
  let c = E.render(d, { scale: p.renderScale });
  if (p.box) c = boxed(c, p.box);
  const r = await E.encode(c, { format: p.format, quality: p.quality, width: p.W, height: p.H, target: S.exp.max && p.format !== 'png' ? S.exp.maxKB * 1024 * (p.format === 'avif' ? 1 / 0.78 : 1) : null, flatten: p.box?.bg || (p.format === 'jpeg' ? '#ffffff' : null) });
  if (p.format === 'jpeg' && S.exp.meta !== 'all') { r.blob = await E.addMeta(r.blob, d.buf, S.exp.meta); r.bytes = r.blob.size; }
  return { ...r, plan: p, docId: d.id };
}
let estT = 0;
function queueEstimate(delay = 140) { if (!doc()) return; clearTimeout(estT); S.estPending = true; updateEstimateUI(); estT = setTimeout(runEstimate, delay); }
async function runEstimate() {
  const d = doc(); if (!d) return;
  const gen = ++S.estGen;
  try {
    const r = await exportOne(d);
    if (gen !== S.estGen) return;
    if (S.est?.url) URL.revokeObjectURL(S.est.url);
    r.url = URL.createObjectURL(r.blob);
    const wasBoxed = !!S.est?.plan?.box;
    S.est = r; S.estPending = false;
    if (S.mode === 'export') { after.src = r.url; if (wasBoxed !== !!r.plan.box) { syncFrame(); schedule(); } }
    updateEstimateUI(); placeSplit(); renderHud();
  } catch (err) { console.error(err); S.estPending = false; updateEstimateUI(); }
}
const pctDelta = (a, b) => { const p = Math.round((b / a - 1) * 100); return `${p <= 0 ? '−' : '+'}${Math.abs(p)} %`; };
function scopeDocs() { const d = doc(); if (!d) return []; return S.exp.scope === 'all' ? ready() : [d]; }
function estParts() {
  const d = doc(), est = S.est && S.est.docId === d?.id ? S.est : null, n = scopeDocs().length;
  if (!d) return null;
  const p = est?.plan || planFor(d);
  const fmt = p.passthrough ? `${d.kind} · unchanged` : `${FMT[p.format]}${p.format === 'png' ? '' : ` · ${est ? est.quality : S.exp.quality} %`} · ${p.W} × ${p.H}`;
  return { d, est, n, fmt, size: est ? est.bytes : null, delta: est ? pctDelta(d.bytes, est.bytes) : '', down: est ? est.bytes <= d.bytes : true };
}
function updateEstimateUI() {
  const P = estParts(); if (!P) return;
  const { d, est, n } = P;
  const sum = $('#exp-sum');
  if (S.exp.preset === 'favicon') {
    const f = S.fav, txt = f?.files ? `${f.files.length} files · ${formatBytes(f.total)}` : '…';
    if (sum) sum.innerHTML = `<span class="lb-expbar__fmt">Favicons</span><span class="lb-expbar__size"><b>${txt}</b></span>`;
    $$('.lb-mest').forEach((m) => (m.innerHTML = `<span>Favicons</span><span><b>${txt}</b></span>`));
    $$('.lb-savebtn').forEach((b) => (b.innerHTML = `${icon('download')}<span>Save ZIP</span>`));
    return;
  }
  if (sum && !S.batch) {
    sum.classList.toggle('is-pending', S.estPending);
    sum.innerHTML = `<span class="lb-expbar__fmt">${n > 1 ? `${n} images · ` : ''}${esc(P.fmt)}</span>
      <span class="lb-expbar__size">${est ? `<span class="lb-was">${formatBytes(d.bytes)}</span>${icon('arrow-right', { size: 12 })}<b>${formatBytes(est.bytes)}</b><span class="lb-delta ${P.down ? '' : 'is-up'}">${P.delta}</span>` : '…'}</span>`;
  }
  const label = n > 1 ? `Save ${n} · ZIP` : 'Save';
  $$('.lb-savebtn').forEach((b) => { if (!S.batch) b.innerHTML = `${icon('download')}<span>${label}</span>`; });
  $$('.lb-mest').forEach((m) => (m.innerHTML = est ? `<span>${esc(P.fmt)}</span><span><b>${formatBytes(est.bytes)}</b> <span class="lb-delta ${P.down ? '' : 'is-up'}">${P.delta}</span></span>` : '<span>…</span>'));
  const q = $('#q-auto'); if (q && S.exp.max && est) q.textContent = `auto ${est.quality}`;
  const nm = $('#exp-name'); if (nm && document.activeElement !== nm) nm.value = est?.plan.name || planFor(d).name;
  const note = $('#fmt-note'); if (note) { const t = [est?.plan.note || S.fmtNote || '', est?.plan.metaNote || ''].filter(Boolean).join(' '); note.textContent = t; note.hidden = !t; }
  const lab = $('#label-after'); if (lab && est) lab.innerHTML = `<b>${esc(est.plan.passthrough ? 'Unchanged' : `${FMT[est.plan.format]}${est.plan.format === 'png' ? '' : ' ' + est.quality}`)}</b> · ${formatBytes(est.bytes)}`;
}
function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (S.exp.preset === id) { S.exp.preset = null; S.exp.box = null; S.fav = null; afterExpChange(); return; }
  if (id === 'favicon') { S.exp.preset = 'favicon'; renderPanel(); renderMobilePanel(); placeSplit(); renderHud(); updateEstimateUI(); buildFavicons(); return; }
  S.fav = null; S.exp.box = null;
  Object.assign(S.exp, p.set, { preset: id });
  S.splitOn = !S.exp.box; S.fmtNote = '';
  afterExpChange();
}
function setExp(patch, { keepPreset = false } = {}) {
  Object.assign(S.exp, patch); if (!keepPreset) { S.exp.preset = null; S.fav = null; if (!('box' in patch)) S.exp.box = null; }
  S.splitOn = !S.exp.box; S.fmtNote = '';
  afterExpChange();
}
function afterExpChange() { queueEstimate(60); if (S.mode === 'export') { const sc = panelScroll(); renderPanel(); panelScroll(sc); } renderMobilePanel(); syncFrame(); schedule(); }
function panelScroll(v) { const p = mob() ? $('#mfull') : $('#panel'); if (!p) return 0; if (v != null) p.scrollTop = v; return p.scrollTop; }
async function save() {
  const list = scopeDocs(); if (!list.length) return;
  if (S.exp.preset === 'favicon') return saveFavicons();
  if (list.length > 1) return saveBatch(list);
  const d = list[0], btns = $$('.lb-savebtn');
  btns.forEach((b) => b.classList.add('is-busy'));
  const fresh = S.est && S.est.docId === d.id && !S.estPending ? S.est : await exportOne(d);
  const name = ($('#exp-name')?.value || fresh.plan.name).trim();
  E.download(fresh.blob, name);
  btns.forEach((b) => b.classList.remove('is-busy'));
  const sum = $('#exp-sum'); if (sum) { sum.innerHTML = `<span class="lb-expbar__fmt lb-ok">${icon('circle-check', { size: 14 })} Saved</span><span class="lb-expbar__size">${esc(name)} · ${formatBytes(fresh.bytes)}</span>`; setTimeout(updateEstimateUI, 3000); }
  $$('.lb-mest').forEach((m) => (m.innerHTML = `<span class="lb-ok">${icon('circle-check', { size: 14 })} Saved ${esc(name)}</span>`));
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
  if (B.cancel) toast(`Stopped after ${B.done} of ${list.length}. Nothing was saved.`, { type: 'neutral' });
  else { E.download(await E.zip(files), `images-${list.length}.zip`); toast(`${list.length} saved · ${formatBytes(B.inB)} → ${formatBytes(B.outB)}`, { type: 'success' }); }
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
  const B = S.batch, sum = $('#exp-sum');
  if (!B) { updateEstimateUI(); return; }
  const left = B.list.length - B.done, per = B.done ? (performance.now() - B.t0) / B.done : 400;
  if (sum) sum.innerHTML = `<span class="lb-expbar__fmt">Saving ${Math.min(B.done + 1, B.list.length)} of ${B.list.length} · ~${Math.max(1, Math.round(left * per / 1000))} s</span>
    <span class="lb-expbar__size">${B.done ? `${formatBytes(B.inB)} → <b>${formatBytes(B.outB)}</b>` : '…'}</span>
    <div class="fw-progress fw-progress--thin lb-expbar__prog"><div class="fw-progress__track"><div class="fw-progress__bar" style="--value:${B.done / B.list.length * 100}%"></div></div></div>`;
  $$('.lb-savebtn').forEach((b) => (b.innerHTML = `${icon('x')}<span>Cancel</span>`));
}
async function saveWithoutMeta() {
  const d = doc(); if (!d) return;
  const keep = { ...S.exp }; Object.assign(S.exp, { format: 'original', meta: 'all', size: 'original', box: null, max: false, preset: null });
  const r = await exportOne(d); Object.assign(S.exp, keep);
  const name = `${baseName(d)}-no-metadata.${EXT[r.plan.format]}`; E.download(r.blob, name);
  toast(`Saved ${name} · ${r.plan.passthrough ? 'same pixels, metadata removed' : 're-encoded without metadata'}`, { type: 'success' });
}

// Favicon pack: today's 9 PNG sizes + a real .ico (16/32/48), apple-touch-icon, manifest and the <link> snippet.
async function buildFavicons() {
  const d = doc(); if (!d) return;
  S.fav = { loading: true }; renderPanel();
  const src = E.render(d, { maxDim: 1024 }), s = Math.min(src.width, src.height), sq = E.mk(512, 512), alpha = E.hasAlpha(d);
  if (alpha) { const k = 512 * 0.9 / Math.max(src.width, src.height); sq.getContext('2d').drawImage(src, (512 - src.width * k) / 2, (512 - src.height * k) / 2, src.width * k, src.height * k); }
  else sq.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, 512, 512);
  const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512], blobs = {};
  for (const n of sizes) blobs[n] = (await E.encode(sq, { format: 'png', width: n, height: n })).blob;
  const icoB = await E.ico([16, 32, 48].map((n) => ({ size: n, png: blobs[n] })));
  const manifest = JSON.stringify({ name: 'My site', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2);
  const files = [{ name: 'favicon.ico', data: icoB }, ...sizes.map((n) => ({ name: n === 180 ? 'apple-touch-icon.png' : n === 192 || n === 512 ? `icon-${n}.png` : `favicon-${n}x${n}.png`, data: blobs[n] })),
    { name: 'site.webmanifest', data: new Blob([manifest], { type: 'application/manifest+json' }) }];
  if (S.exp.preset !== 'favicon') return;
  S.fav = { files, urls: { 32: URL.createObjectURL(blobs[32]), 180: URL.createObjectURL(blobs[180]) }, total: files.reduce((a, f) => a + f.data.size, 0), alpha };
  renderPanel(); renderMobilePanel(); updateEstimateUI(); placeSplit(); renderHud();
}
async function saveFavicons() { if (!S.fav?.files) return; E.download(await E.zip(S.fav.files), 'favicons.zip'); toast(`Saved favicons.zip · ${S.fav.files.length} files`, { type: 'success' }); }

// ───────────────────────── navigation & modes (images switch only via the filmstrip) ─────────────────────────
function go(i) {
  const list = S.docs; if (i < 0 || i >= list.length || list[i].loading || i === S.active) return false;
  if (S.cropping) commitCrop(); if (S.refine) toggleRefine(false);
  S.active = i; S.est = null; S.selMark = null; S.picking = false; S.view.ow = 0;
  renderAll(); fitView(); afterOpen(); saveSoon();
  return true;
}
function setMode(m) {
  if (S.mode === m) return;
  if (S.cropping) commitCrop(); if (S.refine) toggleRefine(false);
  S.mode = m; wb.dataset.mode = m; S.picking = false;
  const q = new URLSearchParams(location.search); q.set('mode', m); history.replaceState(null, '', '?' + q.toString());
  if (m === 'export') { S.splitOn = !S.exp.box; if (S.est?.url) after.src = S.est.url; }
  if (mob()) { const t = { edit: 'adjust', markup: 'markup', inspect: 'inspect', export: 'export' }[m]; if (S.mtab !== t && !(m === 'edit' && S.mtab === 'crop')) S.mtab = t; }
  $$('#mode-seg .fw-seg__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === m)));
  syncFrame(); renderPanel(); renderMobileBar(); schedule(); renderHud(); queueEstimate(30);
  if (m === 'inspect') ensurePalette();
}
function setTool(t) {
  S.tool = t; stage.dataset.tool = t;
  if (S.mode !== 'markup') setMode('markup');
  const sm = selMark(); if (sm && t !== 'move' && !compatible(sm.shape.kind, t)) S.selMark = null;
  renderPanel(); renderMobilePanel(); placeSel();
}
const compatible = (kind, tool) => tool === 'move' || kind === tool || (tool === 'shape' && ['rect', 'ellipse', 'line', 'arrow'].includes(kind));
function closeDoc(d = doc()) {
  if (!d) return; const i = S.docs.indexOf(d);
  S.docs.splice(i, 1); S.active = Math.min(Math.max(0, S.active > i ? S.active - 1 : S.active), S.docs.length - 1); S.est = null; S.view.ow = 0; S.selMark = null;
  renderAll(); if (doc()) fitView(); saveSoon();
  toast(`Closed ${d.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.docs.splice(i, 0, d); S.active = i; S.view.ow = 0; renderAll(); fitView(); saveSoon(); } } });
}
function closeAll() {
  const old = S.docs.slice(), oldF = S.failed.slice(); S.docs = []; S.failed = []; S.active = -1; renderAll(); saveSoon();
  toast(`Closed ${old.length} image${old.length > 1 ? 's' : ''}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.docs = old; S.failed = oldF; S.active = 0; S.view.ow = 0; renderAll(); fitView(); saveSoon(); } } });
}
function pickFiles() { const i = h('<input type="file" multiple accept="image/*,.heic,.heif" hidden>'); i.onchange = () => { if (i.files.length) openFiles([...i.files], { source: 'picker' }); i.remove(); }; document.body.append(i); i.click(); }
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }

// ───────────────────────── frame bar ─────────────────────────
function renderFramebar() {
  const d = doc(), fb = $('#framebar');
  if (!d) { fb.innerHTML = ''; return; }
  fb.innerHTML = `
    <span class="lb-file" id="filechip"><span class="lb-file__name">${esc(d.name)}</span><span class="lb-file__meta" id="fb-meta"></span></span>
    <span class="fw-divider-v fw-hide-compact"></span>
    <div class="fw-seg fw-seg--sm fw-hide-compact" aria-label="Mode" id="mode-seg">${MODES.map((m) => `<button class="fw-seg__opt" type="button" aria-checked="${m.id === S.mode}" data-value="${m.id}">${m.label}</button>`).join('')}</div>
    <span class="fw-spacer"></span>
    <div class="fw-framebar__group">
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z">${icon('undo-2')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z">${icon('redo-2')}</button></div>
    <span class="fw-divider-v fw-hide-compact"></span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm fw-hide-compact lb-cmpbtn" type="button" id="cmp" aria-label="${S.mode === 'export' ? 'Before / after split' : 'Hold to compare with the original'}" data-tip="${S.mode === 'export' ? 'Before / after split' : 'Hold to see the original'}" data-tip-kbd="\\">${icon('circle-half')}<span class="lb-hide-narrow">Compare</span></button>
    <button class="fw-iconbtn fw-iconbtn--sm fw-hide-compact" type="button" id="t-panel" aria-label="Toggle panel" data-tip="Panel" data-tip-kbd="mod+." aria-pressed="${S.panel}">${icon('panel-right')}</button>
    <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="fb-more" aria-label="More" data-tip="More">${icon('ellipsis')}</button>`;
  enhance(fb);
  $('#mode-seg').addEventListener('fw-change', (e) => setMode(e.detail.value));
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $('#t-panel').onclick = () => togglePanel();
  const cmp = $('#cmp');
  if (S.mode === 'export') { cmp.setAttribute('aria-pressed', String(S.splitOn)); cmp.onclick = () => { S.splitOn = !S.splitOn; cmp.setAttribute('aria-pressed', String(S.splitOn)); placeSplit(); renderHud(); }; }
  else holdCompare(cmp);
  $('#fb-more').onclick = (e) => openMenu(e.currentTarget, [
    { items: [{ label: 'Open images…', icon: 'folder-open', kbd: 'mod+o', onSelect: pickFiles }, { label: 'Close this image', icon: 'x', onSelect: () => closeDoc() }, { label: `Close all (${ready().length})`, icon: 'x', onSelect: closeAll }] },
    { items: [{ label: 'Reset all edits', icon: 'rotate-ccw', onSelect: resetAll }, { label: document.fullscreenElement ? 'Exit full screen' : 'Full screen', icon: document.fullscreenElement ? 'minimize' : 'maximize', onSelect: toggleFull }] },
  ], { placement: 'bottom-end' });
  updateFrameMeta(); updateUndo();
}
function updateFrameMeta() {
  const d = doc(), m = $('#fb-meta'); if (!d || !m) return;
  const g = E.geometry(d, E.effective(d));
  m.textContent = `${g.ow} × ${g.oh}`;
}
function updateUndo() { const d = doc(); const u = $('#undo'), r = $('#redo'); if (u) u.disabled = !d?.undo.length && !S.cropping; if (r) r.disabled = !d?.redo.length; }
function holdCompare(el) {
  if (!el) return;
  const on = (e) => { e.preventDefault(); S.compare = true; schedule(); renderHud(); el.setAttribute('aria-pressed', 'true'); };
  const off = () => { if (!S.compare) return; S.compare = false; schedule(); renderHud(); el.setAttribute('aria-pressed', 'false'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
  el.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !S.compare) on(e); });
  el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') off(); });
}
function togglePanel(v = !S.panel) { S.panel = v; $('#lb-main').classList.toggle('has-inspector', v); $('#t-panel')?.setAttribute('aria-pressed', String(v)); }

// ───────────────────────── dock: filmstrip (the only image switcher) + export bar ─────────────────────────
function renderDock() {
  const dock = $('#dock'), d = doc();
  if (!S.docs.length && !S.failed.length) { dock.innerHTML = ''; return; }
  dock.innerHTML = `
    <div class="lb-strip" role="listbox" aria-label="Open images" id="strip">
      ${S.docs.map((x, i) => x.loading ? `<div class="lb-thumb is-loading" style="--ar:1.4"><span class="fw-skel"></span></div>`
        : `<div class="lb-thumbwrap"><button class="lb-thumb ${x.recipe.some((s) => s.on) ? 'is-edited' : ''}" type="button" role="option" data-i="${i}" data-id="${x.id}" aria-selected="${i === S.active}" style="--ar:${(x.w / x.h).toFixed(3)}" aria-label="${esc(x.name)}" title="${esc(x.name)}">
          <img alt="" src="${x.thumb}" draggable="false">${x.kind === 'HEIC' ? '<span class="lb-thumb__badge">HEIC</span>' : ''}<span class="lb-thumb__dot" aria-hidden="true"></span></button>
          <button class="lb-thumb__x" type="button" data-close="${i}" aria-label="Close ${esc(x.name)}" tabindex="-1">${icon('x', { size: 12 })}</button></div>`).join('')}
      ${S.failed.map((f) => `<div class="lb-thumb lb-thumb--error" role="note" data-fid="${f.id}">${icon('triangle-alert', { size: 16 })}<span class="lb-thumb__err"><b>${esc(f.name)}</b><span>${esc(f.reason)}</span></span><button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss ${esc(f.name)}" data-dismiss="${f.id}">${icon('x')}</button></div>`).join('')}
      <button class="lb-add" type="button" id="add" aria-label="Add images" data-tip="Add images" data-tip-kbd="mod+o">${icon('plus', { size: 18 })}</button>
    </div>
    <div class="lb-expbar">
      <button class="lb-expbar__sum" type="button" id="exp-sum" aria-label="Export settings" data-tip="Export settings" data-tip-kbd="e"></button>
      <button class="fw-btn fw-btn--primary lb-save lb-savebtn" type="button" id="save" ${d ? '' : 'disabled'} data-tip="Save" data-tip-kbd="mod+s"></button>
    </div>`;
  enhance(dock);
  $$('.lb-thumb[data-i]', dock).forEach((b) => { b.onclick = () => go(+b.dataset.i); b.onkeydown = (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); closeDoc(S.docs[+b.dataset.i]); } }; });
  $$('[data-close]', dock).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); closeDoc(S.docs[+b.dataset.close]); }));
  $$('[data-dismiss]', dock).forEach((b) => (b.onclick = () => { S.failed = S.failed.filter((f) => f.id !== +b.dataset.dismiss); renderDock(); }));
  $('#add').onclick = pickFiles;
  $('#exp-sum').onclick = () => setMode('export');
  $('#save').onclick = () => (S.batch ? (S.batch.cancel = true) : save());
  roving($('#strip'), '.lb-thumb[data-i]', { orientation: 'horizontal' });
  S.docs.forEach((x) => x.job && updateThumbJob(x));
  const st = $('#strip'), cur = st.querySelector('.lb-thumb[aria-selected="true"]');
  if (cur) st.scrollLeft = Math.max(0, cur.parentElement.offsetLeft - st.clientWidth / 2 + cur.offsetWidth / 2);
  if (S.batch) updateBatchUI(); else updateEstimateUI();
}

// ───────────────────────── panel per mode (desktop inspector, and the phone's options panel) ─────────────────────────
function panelRoot() { return mob() ? (S.mfull ? $('#mfull') : null) : $('#panel'); }
function renderPanel() {
  if (mob()) $('#panel').innerHTML = '';
  const p = panelRoot(), d = doc(); if (!p) return;
  if (!d) { p.innerHTML = ''; return; }
  if (S.cropping) p.innerHTML = cropPanel();
  else p.innerHTML = { edit: editPanel, markup: markupPanel, inspect: inspectPanel, export: exportPanel }[S.mode](d);
  enhance(p); wirePanel(p, d);
}
function refreshPanelBits() { refreshSliders(); updateHistory(); }
function sliderHtml(a, d) {
  const v = E.effective(d).adj[a.key];
  return `<div class="fw-slider lb-adj ${a.min < 0 ? 'is-bi' : ''}" data-k="${a.key}"><label class="fw-slider__label" for="adj-${a.key}">${icon(a.icon, { size: 14 })}${a.label}</label><output class="fw-slider__value" for="adj-${a.key}"></output>
    <input id="adj-${a.key}" type="range" min="${a.min}" max="${a.max}" value="${v}" data-adj="${a.key}" ${a.unit ? `data-unit="${a.unit}"` : ''}></div>`;
}
function editPanel(d) {
  return `
  <section class="fw-insp-section lb-sec-bg" id="bg-block">${bgBlock(d)}</section>
  <section class="fw-insp-section">
    <div class="lb-quick" role="toolbar" aria-label="Crop and rotate" data-roving="button">
      <button class="lb-qbtn" type="button" id="q-crop" data-tip="Crop and straighten" data-tip-kbd="c">${icon('crop', { size: 18 })}<span>Crop</span></button>
      <button class="lb-qbtn" type="button" id="q-rotl" data-tip="Rotate left">${icon('rotate-ccw', { size: 18 })}<span>Left</span></button>
      <button class="lb-qbtn" type="button" id="q-rotr" data-tip="Rotate right">${icon('rotate-cw', { size: 18 })}<span>Right</span></button>
      <button class="lb-qbtn" type="button" id="q-fliph" data-tip="Flip horizontal">${icon('flip-horizontal', { size: 18 })}<span>Flip H</span></button>
      <button class="lb-qbtn" type="button" id="q-flipv" data-tip="Flip vertical">${icon('flip-vertical', { size: 18 })}<span>Flip V</span></button>
    </div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Adjust <span class="fw-spacer"></span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="q-auto">${icon('sparkles', { size: 14 })}Auto</button></div>
    ${E.ADJ.filter((a) => !a.more).map((a) => sliderHtml(a, d)).join('')}
    <details class="lb-more" ${E.ADJ.some((a) => a.more && E.effective(d).adj[a.key]) ? 'open' : ''}><summary>More options</summary><div class="lb-more__body">${E.ADJ.filter((a) => a.more).map((a) => sliderHtml(a, d)).join('')}</div></details>
  </section>
  <section class="fw-insp-section lb-history">
    <div class="fw-insp-section__head">History <span class="fw-badge" id="hist-n">${d.recipe.length}</span><span class="fw-spacer"></span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="reset" ${d.recipe.length ? '' : 'disabled'}>Reset</button></div>
    <ol class="lb-hist" id="hist"></ol>
  </section>`;
}
function bgBlock(d) {
  const e = E.effective(d), j = S.bgJob && S.bgJob.docId === d.id ? S.bgJob : null;
  if (j?.phase === 'model') return `<div class="lb-bgprog" role="status"><span class="fw-ring" style="--value:${Math.round(j.got / 88 * 100)}"></span>
      <div class="lb-bgprog__text"><b>Downloading model</b><span class="lb-bgprog__mb">${Math.round(j.got)} of 88 MB</span></div>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="bg-cancel" aria-label="Cancel" data-tip="Cancel">${icon('x')}</button></div>`;
  if (j?.phase === 'run') return `<div class="lb-bgprog" role="status"><span class="fw-spinner"></span><div class="lb-bgprog__text"><b>Finding the subject…</b></div>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="bg-cancel" aria-label="Cancel" data-tip="Cancel">${icon('x')}</button></div>`;
  if (j?.phase === 'unavailable') return `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('info')}</span><div class="fw-alert__body">This mockup only has cut-outs for the dog photos.
      <div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" id="bg-dog">Show with the dog</button></div></div></div>`;
  if (!e.bg) return `<button class="fw-btn fw-btn--block lb-bgbtn" type="button" id="bg-go">${icon('scissors', { size: 16 })}Remove background</button>
      ${S.modelReady ? '' : '<p class="lb-sub">First use downloads an 88 MB model.</p>'}`;
  const fill = e.bg.fill;
  return `<div class="lb-bgcard">
    <div class="lb-bgcard__head">${icon('circle-check', { size: 16 })}<b>Background removed</b></div>
    <div class="lb-bgcard__row">
      <button class="fw-btn fw-btn--sm" type="button" id="bg-cmp" aria-label="Hold to compare with the original">${icon('circle-half')}Compare</button>
      <button class="fw-btn fw-btn--sm" type="button" id="bg-refine" aria-pressed="${!!S.refine}">${icon('brush')}${S.refine ? 'Done' : 'Refine edge'}</button></div>
    ${S.refine ? `<div class="lb-refine">
      <div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Brush" id="refine-mode"><button class="fw-seg__opt" type="button" data-value="erase" aria-checked="${S.refine.mode === 'erase'}">Erase</button><button class="fw-seg__opt" type="button" data-value="restore" aria-checked="${S.refine.mode === 'restore'}">Restore</button></div>
      <div class="fw-slider"><label class="fw-slider__label" for="brush-r">Brush</label><output class="fw-slider__value"></output><input id="brush-r" type="range" min="6" max="60" value="${S.refine.r}" data-unit=" px"></div></div>` : ''}
    <div class="lb-field-label">Fill</div>
    <div class="lb-aspects" role="group" aria-label="Background fill" id="bg-fill">${Object.entries(FILL_LABEL).map(([k, l]) => `<button class="fw-chip" type="button" data-fill="${k}" aria-pressed="${k === fill}">${l}</button>`).join('')}</div>
    ${fill === 'color' ? `<div class="lb-swatches" role="radiogroup" aria-label="Fill colour">${['#dbeafe', '#fde68a', '#fecdd3', '#d1fae5', '#e9d5ff', '#111827'].map((c) => `<button class="lb-sw" type="button" role="radio" aria-checked="${e.bg.color === c}" style="--c:${c}" data-fillc="${c}" aria-label="${c}"></button>`).join('')}</div>` : ''}
    <label class="lb-togrow"><span>Soft shadow</span><span class="fw-toggle"><input type="checkbox" id="bg-shadow" ${e.bg.shadow ? 'checked' : ''}></span></label>
  </div>`;
}
function renderBgBlock() { const el = $('#bg-block'), d = doc(); if (el && d && S.mode === 'edit' && !S.cropping) { el.innerHTML = bgBlock(d); enhance(el); wireBg(el); } renderMobilePanel(); }
function wireBg(root) {
  root.querySelector('#bg-go')?.addEventListener('click', removeBg);
  root.querySelector('#bg-cancel')?.addEventListener('click', () => { if (S.bgJob) S.bgJob.cancel = true; });
  root.querySelector('#bg-dog')?.addEventListener('click', () => { S.bgJob = null; const i = S.docs.findIndex((x) => x.name === 'dog-in-the-park.jpg'); if (i >= 0) { go(i); setTimeout(removeBg, 300); } else loadSamples(spec(['dog-in-the-park.jpg'])).then((f) => openFiles(f).then(() => { go(S.docs.length - 1); setTimeout(removeBg, 300); })); });
  holdCompare(root.querySelector('#bg-cmp'));
  root.querySelector('#bg-refine')?.addEventListener('click', () => toggleRefine());
  root.querySelector('#refine-mode')?.addEventListener('fw-change', (e) => { S.refine.mode = e.detail.value; });
  root.querySelector('#brush-r')?.addEventListener('input', (e) => { S.refine.r = +e.target.value; });
  root.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => setFill(b.dataset.fill)));
  root.querySelectorAll('[data-fillc]').forEach((b) => (b.onclick = () => { const s = bgStep(); snap(doc(), 'bgc'); s.color = b.dataset.fillc; changed(); renderBgBlock(); }));
  root.querySelector('#bg-shadow')?.addEventListener('change', (e) => { const s = bgStep(); snap(doc()); s.shadow = e.target.checked; changed(); });
}
function cropPanel() {
  const c = S.cropping, f = frame();
  return `<section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('crop', { size: 14 })} Crop and straighten <span class="fw-spacer"></span><span class="lb-cropsize fw-muted">${Math.round(c.rect.w * f.ow)} × ${Math.round(c.rect.h * f.oh)} px</span></div>
    <div class="lb-aspects" role="group" aria-label="Aspect ratio">${ASPECTS.map((a) => `<button class="fw-chip" type="button" data-aspect="${a.id}" aria-pressed="${c.aspect === a.id}">${a.label}</button>`).join('')}</div>
    <div class="fw-slider"><label class="fw-slider__label" for="straighten">Straighten</label><output class="fw-slider__value lb-strval">${c.straighten.toFixed(1)}°</output>
      <input id="straighten" type="range" min="-45" max="45" step="0.1" value="${c.straighten}"></div>
    <div class="lb-quick lb-quick--4">
      <button class="lb-qbtn" type="button" id="c-rotl">${icon('rotate-ccw', { size: 18 })}<span>Left</span></button>
      <button class="lb-qbtn" type="button" id="c-rotr">${icon('rotate-cw', { size: 18 })}<span>Right</span></button>
      <button class="lb-qbtn" type="button" id="c-fliph">${icon('flip-horizontal', { size: 18 })}<span>Flip H</span></button>
      <button class="lb-qbtn" type="button" id="c-flipv">${icon('flip-vertical', { size: 18 })}<span>Flip V</span></button></div>
    <div class="lb-actions"><button class="fw-btn fw-btn--ghost" type="button" id="c-reset">Reset</button><span class="fw-spacer"></span><button class="fw-btn" type="button" id="c-cancel">Cancel</button><button class="fw-btn fw-btn--primary" type="button" id="c-done">${icon('check')}Done</button></div>
  </section>`;
}
// Markup: tools, options for the tool or the selected mark, layers
function colorRow(id, val) {
  return `<div class="lb-colors" role="radiogroup" aria-label="Colour" data-colorrow="${id}">${COLORS.map((c) => `<button class="lb-sw" type="button" role="radio" aria-checked="${val === c}" style="--c:${c}" data-c="${c}" aria-label="${c}"></button>`).join('')}
    <label class="lb-sw lb-sw--custom" data-tip="Custom colour" style="--c:${COLORS.includes(val) ? 'transparent' : val}" aria-checked="${!COLORS.includes(val)}"><input type="color" value="${val}" aria-label="Custom colour" data-c-custom></label></div>`;
}
const range = (id, label, min, max, val, unit = ' px', step = 1) => `<div class="fw-slider"><label class="fw-slider__label" for="${id}">${label}</label><output class="fw-slider__value"></output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit}"></div>`;
function markupPanel(d) {
  const sm = selMark(d), sh = sm?.shape, t = S.tool, st = S.st;
  const kind = sh ? sh.kind : t === 'shape' ? st.shape : t;
  const v = (k, dflt) => (sh && sh[k] !== undefined ? sh[k] : dflt);
  const isShape = ['rect', 'ellipse', 'line', 'arrow'].includes(kind);
  let opts = '';
  if (sh || t !== 'move') {
    if (kind === 'pick') opts = `<p class="lb-sub">Click the image to pick a colour. It becomes your drawing colour.</p>${pickedRow()}`;
    else {
      if (isShape) opts += `<div class="fw-seg lb-seg-full" aria-label="Shape" id="shape-kind">${SHAPES.map(([k, l, ic]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${kind === k}" aria-label="${l}" data-tip="${l}">${icon(ic, { size: 16 })}</button>`).join('')}</div>`;
      if (kind !== 'eraser' && kind !== 'blur') opts += `<div class="lb-field-label">${isShape ? 'Stroke' : 'Colour'}</div>${colorRow('color', v('color', st.color))}`;
      if (kind === 'brush') opts += range('o-size', 'Size', 1, 120, v('size', st.size));
      if (kind === 'pencil') opts += range('o-size', 'Size', 1, 12, v('size', st.pencil));
      if (kind === 'eraser') opts += range('o-size', 'Size', 2, 200, v('size', st.eraser));
      if (kind === 'fill') opts += range('o-tol', 'Tolerance', 0, 128, v('tol', st.tol), '');
      if (isShape) {
        opts += range('o-width', 'Line width', 0, 40, v('width', st.width));
        if (kind === 'rect' || kind === 'ellipse') { const fill = sh ? sh.fill : st.fillOn ? st.fill : null; opts += `<label class="lb-togrow"><span>Fill</span><span class="lb-inline">${fill ? `<label class="lb-sw lb-sw--custom" style="--c:${fill}"><input type="color" value="${fill}" id="o-fillc" aria-label="Fill colour"></label>` : ''}<span class="fw-toggle"><input type="checkbox" id="o-fill" ${fill ? 'checked' : ''}></span></span></label>`; }
      }
      if (kind === 'blur') opts += range('o-cell', 'Block size', 6, 64, v('cell', st.cell));
      if (kind === 'text') {
        const g = S.geo, fs = v('fsize', st.fsize || Math.round(Math.min(g?.fw || 1000, g?.fh || 1000) * 0.07));
        if (sh) opts += `<div class="fw-field"><label class="fw-field__label" for="o-text">Text</label><textarea class="fw-textarea lb-textfield" id="o-text" rows="2">${esc(sh.text)}</textarea></div>`;
        opts += `<div class="lb-grid2"><div class="fw-field"><label class="fw-field__label" for="o-font">Font</label><select class="fw-select" id="o-font">${E.FONTS.map(([f, l]) => `<option value='${esc(f)}' ${v('font', st.font) === f ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fw-field"><label class="fw-field__label" for="o-fsize">Size</label><span class="fw-inputwrap"><input class="fw-input fw-input--mono" type="number" id="o-fsize" min="4" max="2000" value="${fs}"><span class="fw-inputwrap__end">px</span></span></div></div>
          <div class="lb-grid2"><div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Weight" id="o-weight">${[[400, 'Regular'], [700, 'Bold'], [900, 'Black']].map(([w, l]) => `<button class="fw-seg__opt" type="button" data-value="${w}" aria-checked="${+v('weight', st.weight) === w}">${l}</button>`).join('')}</div>
          <div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Align" id="o-align">${['left', 'center', 'right'].map((a) => `<button class="fw-seg__opt" type="button" data-value="${a}" aria-checked="${v('align', st.align) === a}" aria-label="Align ${a}">${icon('align-' + a, { size: 15 })}</button>`).join('')}</div></div>
          <label class="lb-togrow"><span>Outline</span><span class="lb-inline"><label class="lb-sw lb-sw--custom" style="--c:${v('outline', st.outline)}"><input type="color" value="${v('outline', st.outline)}" id="o-outc" aria-label="Outline colour"></label>
            <span class="fw-inputwrap lb-num"><input class="fw-input fw-input--mono" type="number" id="o-outw" min="0" max="60" value="${v('outlineW', st.outlineW)}" aria-label="Outline width"><span class="fw-inputwrap__end">px</span></span></span></label>
          ${range('o-boxw', 'Box width', 0, 100, Math.round(v('w', st.boxW) * 100), ' %')}`;
      }
      if (kind !== 'blur') opts += range('o-op', kind === 'eraser' ? 'Strength' : 'Opacity', 5, 100, v('opacity', st.opacity), ' %');
    }
  } else opts = `<p class="lb-sub">Click a mark to select it. Drag empty space to pan.</p>`;
  const marks = d.recipe.filter((s) => s.type === 'mark');
  const imgOp = E.effective(d).opacity;
  return `<section class="fw-insp-section">
    <div class="lb-tools" role="toolbar" aria-label="Markup tools" id="tools">${TOOLS.map((x) => `<button class="lb-qbtn" type="button" data-tool="${x.id}" aria-pressed="${S.tool === x.id}" data-tip="${x.label}" data-tip-kbd="${x.key}">${icon(x.icon, { size: 18 })}<span>${x.label}</span></button>`).join('')}</div>
  </section>
  <section class="fw-insp-section lb-opts">
    <div class="fw-insp-section__head">${sh ? `${icon(KIND_ICON[sh.kind], { size: 14 })} ${esc(markName(sm))}` : TOOLS.find((x) => x.id === t).label}</div>
    ${opts}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Layers <span class="fw-badge">${marks.length + 1}</span></div>
    <ol class="lb-layers" id="layers">${[...marks].reverse().map((s) => `<li class="lb-layer ${s.id === S.selMark ? 'is-sel' : ''} ${s.on ? '' : 'is-off'}" data-lid="${s.id}">
        <button class="lb-hist__tog" type="button" aria-pressed="${s.on}" aria-label="${s.on ? 'Hide' : 'Show'} ${esc(markName(s))}" data-tog="${s.id}">${icon(s.on ? 'eye' : 'eye-off', { size: 15 })}</button>
        <button class="lb-layer__name" type="button" data-pick="${s.id}">${icon(KIND_ICON[s.shape.kind], { size: 14 })}<span>${esc(markName(s))}</span></button></li>`).join('')}
      <li class="lb-layer lb-layer--img"><span class="lb-hist__icon">${icon('image', { size: 14 })}</span><span class="lb-layer__label">Image</span><span class="fw-muted lb-layer__op">${imgOp} %</span></li></ol>
    ${sm ? `<div class="lb-layerbar">
      <div class="fw-field"><label class="fw-field__label" for="l-name">Name</label><input class="fw-input" id="l-name" value="${esc(markName(sm))}" spellcheck="false"></div>
      <div class="lb-btnrow" role="group" aria-label="Layer">
        <button class="fw-btn fw-btn--sm" type="button" id="l-up" aria-label="Bring forward" data-tip="Bring forward">${icon('arrow-up', { size: 14 })}Front</button>
        <button class="fw-btn fw-btn--sm" type="button" id="l-down" aria-label="Send backward" data-tip="Send backward">${icon('arrow-down', { size: 14 })}Back</button>
        <button class="fw-btn fw-btn--sm" type="button" id="l-dup">${icon('copy', { size: 14 })}Duplicate</button>
        <button class="fw-btn fw-btn--sm fw-btn--danger" type="button" id="l-del" data-tip="Delete" data-tip-kbd="delete">${icon('trash-2', { size: 14 })}Delete</button></div></div>`
      : `<details class="lb-more"><summary>Image layer</summary><div class="lb-more__body">${range('l-imgop', 'Image opacity', 0, 100, imgOp, ' %')}</div></details>`}
  </section>`;
}
function pickedRow() {
  if (!S.picked.length) return '';
  return `<div class="lb-picked">${S.picked.map((c) => `<button class="lb-pickc" type="button" style="--c:${c.hex}" data-copy="${c.hex}" aria-label="Copy ${c.hex}"><span class="lb-pickc__sw"></span><span class="fw-mono">${c.hex}</span>${icon('copy', { size: 13 })}</button>`).join('')}</div>`;
}
function inspectPanel(d) {
  const inf = d.info || {}, mp = (d.w * d.h / 1e6).toFixed(1), loc = inf.location, pal = d.palette, o = d.ocr;
  const ocrOpts = `<details class="lb-more"><summary>More options</summary><div class="lb-more__body">
      <div class="lb-grid2"><div class="fw-field"><label class="fw-field__label" for="ocr-lang">Language</label><select class="fw-select" id="ocr-lang">${OCR_LANGS.map(([k, l]) => `<option value="${k}" ${S.ocr.lang === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="fw-field"><label class="fw-field__label" for="ocr-layout">Layout</label><select class="fw-select" id="ocr-layout">${OCR_LAYOUTS.map(([k, l]) => `<option value="${k}" ${S.ocr.layout === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label class="lb-togrow"><span>Preserve spacing</span><span class="fw-toggle"><input type="checkbox" id="ocr-spaces" ${S.ocr.spaces ? 'checked' : ''}></span></label>
      ${o && typeof o === 'object' || o === 'none' ? `<button class="fw-btn fw-btn--sm" type="button" id="ocr-again">${icon('rotate-cw', { size: 14 })}Read again</button>` : ''}</div></details>`;
  return `<section class="fw-insp-section">
    <div class="lb-facts"><b>${d.w} × ${d.h}</b><span>${mp} MP · ${esc(d.kind)} · ${formatBytes(d.bytes)}</span></div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('camera', { size: 14 })} Metadata</div>
    ${inf.camera || loc ? `<dl class="fw-insp-kv lb-kv">
      ${inf.camera ? `<dt>Camera</dt><dd>${esc(inf.camera)}</dd>` : ''}${inf.lens ? `<dt>Lens</dt><dd>${esc(inf.lens)}</dd>` : ''}${inf.exposure ? `<dt>Exposure</dt><dd>${esc(inf.exposure)}</dd>` : ''}${inf.taken ? `<dt>Taken</dt><dd>${esc(inf.taken)}</dd>` : ''}
      ${loc ? `<dt>Location</dt><dd class="lb-locdd">${icon('map-pin', { size: 13 })}<span>${esc(inf.place || 'Unknown place')}<small class="fw-mono">${E.fmtCoord(loc)}</small></span></dd>` : ''}</dl>
      <button class="lb-link" type="button" id="exif-all">All ${inf.count} fields</button>` : `<p class="fw-t-sm fw-muted">No metadata in this file.</p>`}
    ${d.exif ? `<div class="lb-field-label">On export</div>
    <div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Metadata on export" id="meta-i">${[['location', 'No location'], ['all', 'Strip all'], ['keep', 'Keep all']].map(([k, l]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${S.exp.meta === k}">${l}</button>`).join('')}</div>
    <button class="fw-btn fw-btn--sm" type="button" id="strip-now">${icon('download', { size: 14 })}Save copy without metadata</button>` : ''}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('palette', { size: 14 })} Colors <span class="fw-spacer"></span>
      <div class="fw-seg fw-seg--sm" aria-label="Colour format" id="colfmt">${['hex', 'rgb', 'hsl'].map((f) => `<button class="fw-seg__opt" type="button" data-value="${f}" aria-checked="${S.colorFmt === f}">${f.toUpperCase()}</button>`).join('')}</div></div>
    <div class="lb-palette" id="palette">${pal ? pal.map((c, i) => `<button class="lb-pal" type="button" style="--c:${c.hex}" data-col="${i}" aria-label="Copy ${colStr(c)}"><span class="lb-pal__chip"></span><span class="lb-pal__val">${colStr(c)}</span></button>`).join('') : '<span class="fw-skel" style="height:56px;width:100%"></span>'}</div>
    <div class="lb-row2"><button class="fw-btn fw-btn--sm" type="button" id="pal-css">${icon('braces')}Copy as CSS</button>
      <button class="fw-btn fw-btn--sm" type="button" id="pick-on" aria-pressed="${S.picking}">${icon('pipette')}${S.picking ? 'Picking…' : 'Pick from image'}</button></div>
    ${pickedRow()}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">${icon('scan-text', { size: 14 })} Text (OCR)</div>
    ${o === 'loading' ? `<div class="lb-bgprog" role="status"><span class="fw-spinner"></span><div class="lb-bgprog__text"><b>${d.ocrPhase === 'engine' ? 'Loading text engine' : 'Reading text…'}</b>${d.ocrPhase === 'engine' ? '<span>4.2 MB</span>' : ''}</div></div>`
      : o === 'none' ? `<p class="fw-t-sm fw-muted">No text found.</p>${ocrOpts}`
      : o ? `<div class="lb-ocrhead"><span>${o.lines.length} lines · ${o.lines.reduce((a, l) => a + l.words.length, 0)} words · ${ocrConf(d)} % confidence</span></div>
        <div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Boxes" id="ocr-ov">${['off', 'words', 'lines', 'blocks'].map((k) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${S.ocr.overlay === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
        <ol class="lb-lines" id="lines">${o.lines.map((l, i) => `<li><button class="lb-lines__row" type="button" data-l="${i}"><span>${esc(lineText(l.words))}</span>${icon('copy', { size: 14 })}</button></li>`).join('')}</ol>
        <div class="lb-row2"><button class="fw-btn fw-btn--sm" type="button" id="ocr-all">${icon('copy')}Copy all</button><button class="fw-btn fw-btn--sm" type="button" id="ocr-txt">${icon('download')}Download .txt</button></div>${ocrOpts}`
      : `<button class="fw-btn fw-btn--block" type="button" id="ocr-go">${icon('scan-text')}Find text</button>${ocrOpts}`}
  </section>`;
}
function colStr(c) { return S.colorFmt === 'hex' ? c.hex : S.colorFmt === 'rgb' ? `rgb(${c.rgb.join(' ')})` : E.toHsl(c.rgb); }
function exportPanel(d) {
  const x = S.exp, n = ready().length;
  if (x.preset === 'favicon') return favPanel(d);
  const lossy = x.format !== 'png' && x.format !== 'original';
  const sizeCtl = () => {
    if (x.box) return `<p class="fw-t-sm">${x.box.w} × ${x.box.h} px · ${x.box.fit === 'crop' ? 'cropped from the centre' : 'fitted on white'} <button class="lb-link" type="button" id="box-clear">Use image size</button></p>`;
    const num = (id, val, unit, lab) => `<span class="fw-inputwrap lb-num"><input class="fw-input fw-input--mono" type="number" id="${id}" value="${val}" min="1" max="20000" aria-label="${lab}"><span class="fw-inputwrap__end">${unit}</span></span>`;
    let s = `<select class="fw-select" id="size-mode" aria-label="Size">${SIZE_MODES.map(([k, l]) => `<option value="${k}" ${x.size === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    if (['longest', 'width', 'height', 'percent'].includes(x.size)) s += `<div class="lb-sizerow">${num('size-v', x.value, x.size === 'percent' ? '%' : 'px', 'Size')}${SIZE_PRESETS[x.size].map((p) => `<button class="fw-chip" type="button" data-sizep="${p}" aria-pressed="${+x.value === p}">${p}</button>`).join('')}</div>`;
    if (x.size === 'box') s += `<div class="lb-sizerow">${num('box-w', x.boxW, 'px', 'Box width')}<span class="fw-muted">×</span>${num('box-h', x.boxH, 'px', 'Box height')}</div>`;
    if (x.size === 'exact') { const g = E.geometry(d, E.effective(d)), eh = x.lock ? Math.round(x.exactW * g.oh / g.ow) : x.exactH; s += `<div class="lb-sizerow">${num('ex-w', x.exactW, 'px', 'Width')}<button class="fw-iconbtn fw-iconbtn--sm" type="button" id="ex-lock" aria-pressed="${x.lock}" aria-label="Keep aspect ratio" data-tip="Keep aspect ratio">${icon(x.lock ? 'link' : 'link-2', { size: 15 })}</button>${num('ex-h', eh, 'px', 'Height')}</div>`; }
    if (!['original', 'percent', 'exact'].includes(x.size)) s += `<label class="lb-check"><input type="checkbox" id="no-up" ${x.noUp ? 'checked' : ''}><span>Don’t enlarge smaller images</span></label>`;
    return s;
  };
  return `<section class="fw-insp-section">
    <div class="lb-presets" role="group" aria-label="Presets">${PRESETS.map((p) => `<button class="fw-chip" type="button" data-preset="${p.id}" aria-pressed="${x.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Format</div>
    <div class="fw-seg lb-seg-full" aria-label="Format" id="fmt">${Object.entries(FMT).map(([k, l]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${x.format === k}">${l}</button>`).join('')}</div>
    <p class="lb-sub" id="fmt-hint">${esc(FMT_HINT[x.format])}</p>
    <p class="lb-note" id="fmt-note" hidden></p>
    ${lossy ? `<div class="fw-slider" id="q-wrap"><label class="fw-slider__label" for="quality">Quality</label><output class="fw-slider__value" id="q-auto"></output>
      <input id="quality" type="range" min="1" max="100" value="${x.quality}" data-unit=" %" ${x.max ? 'disabled' : ''}></div>
    <label class="lb-togrow" id="max-row"><span>Max file size</span>
      <span class="lb-inline"><span class="fw-inputwrap lb-num" ${x.max ? '' : 'hidden'}><input class="fw-input fw-input--mono" type="number" id="max-kb" value="${x.maxKB}" min="10" step="10" aria-label="Maximum size in kB"><span class="fw-inputwrap__end">kB</span></span>
      <span class="fw-toggle"><input type="checkbox" id="max-on" ${x.max ? 'checked' : ''}></span></span></label>` : ''}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Size</div>
    ${sizeCtl()}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Metadata</div>
    <div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Metadata" id="meta">${[['location', 'No location'], ['all', 'Strip all'], ['keep', 'Keep all']].map(([k, l]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${x.meta === k}">${l}</button>`).join('')}</div>
  </section>
  <section class="fw-insp-section">
    ${n > 1 ? `<div class="fw-seg fw-seg--sm lb-seg-full" aria-label="Apply to" id="scope"><button class="fw-seg__opt" type="button" data-value="this" aria-checked="${x.scope === 'this'}">This image</button><button class="fw-seg__opt" type="button" data-value="all" aria-checked="${x.scope === 'all'}">All ${n} images</button></div>` : ''}
    <div class="fw-field lb-name" ${x.scope === 'this' || n < 2 ? '' : 'hidden'}><label class="fw-field__label" for="exp-name">File name</label><input class="fw-input" id="exp-name" type="text" spellcheck="false" autocomplete="off"></div>
    ${mob() ? `<p class="lb-mest" aria-live="polite"></p><button class="fw-btn fw-btn--primary fw-btn--lg fw-btn--block lb-savebtn" type="button"></button>` : ''}
  </section>`;
}
function favPanel(d) {
  const f = S.fav;
  return `<section class="fw-insp-section">
    <div class="lb-presets" role="group" aria-label="Presets">${PRESETS.map((p) => `<button class="fw-chip" type="button" data-preset="${p.id}" aria-pressed="${S.exp.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Preview</div>
    ${!f || f.loading ? '<span class="fw-skel" style="height:96px"></span>' : `<div class="lb-favprev">
      <div class="lb-tab"><img alt="" src="${f.urls[32]}" width="16" height="16"><span>My site</span>${icon('x', { size: 12 })}</div>
      <div class="lb-home"><img alt="" src="${f.urls[180]}"><span>My site</span></div></div>`}
  </section>
  <section class="fw-insp-section">
    <div class="fw-insp-section__head">Files <span class="fw-badge">${f?.files ? `${f.files.length} · ${formatBytes(f.total)}` : '…'}</span></div>
    ${f?.files ? `<ul class="lb-files">${f.files.map((x) => `<li><span class="fw-mono">${x.name}</span><small>${formatBytes(x.data.size)}</small></li>`).join('')}</ul>
    <div class="fw-field"><label class="fw-field__label">Paste into &lt;head&gt;</label>
      <pre class="lb-snippet" id="fav-snip">&lt;link rel="icon" href="/favicon.ico" sizes="48x48"&gt;
&lt;link rel="icon" href="/favicon-32x32.png" type="image/png"&gt;
&lt;link rel="apple-touch-icon" href="/apple-touch-icon.png"&gt;
&lt;link rel="manifest" href="/site.webmanifest"&gt;</pre>
      <button class="fw-btn fw-btn--sm" type="button" data-copy-target="#fav-snip">${icon('copy')}Copy snippet</button></div>` : ''}
    ${mob() ? `<button class="fw-btn fw-btn--primary fw-btn--lg fw-btn--block" type="button" id="fav-save">${icon('download')}Save favicons.zip</button>` : ''}
  </section>`;
}
function histRow(s) {
  return `<li class="lb-hist__row ${s.on ? '' : 'is-off'}" data-id="${s.id}">
    <button class="lb-hist__tog" type="button" aria-pressed="${s.on}" aria-label="${s.on ? 'Turn off' : 'Turn on'} ${esc(stepLabel(s))}" data-tog="${s.id}">${icon(s.on ? 'eye' : 'eye-off', { size: 15 })}</button>
    <span class="lb-hist__icon">${icon(stepIcon(s), { size: 14 })}</span><span class="lb-hist__label">${esc(stepLabel(s))}</span>
    <button class="lb-hist__del fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Remove ${esc(stepLabel(s))}" data-del="${s.id}">${icon('x', { size: 14 })}</button></li>`;
}
function updateHistory() {
  const d = doc(), ol = $('#hist'); if (!d || !ol) return;
  ol.innerHTML = `<li class="lb-hist__row lb-hist__row--orig"><span class="lb-hist__icon">${icon('image', { size: 14 })}</span><span class="lb-hist__label">Original · ${esc(d.kind)} ${d.w} × ${d.h}</span></li>` + d.recipe.map(histRow).join('');
  const n = $('#hist-n'); if (n) n.textContent = d.recipe.length;
  const r = $('#reset'); if (r) r.disabled = !d.recipe.length;
  ol.scrollTop = ol.scrollHeight;
}
function refreshSliders() {
  const d = doc(); if (!d) return; const a = E.effective(d).adj;
  $$('[data-adj]').forEach((r) => { if (document.activeElement === r) return; r.value = a[r.dataset.adj]; r.dispatchEvent(new Event('input-sync')); const out = r.closest('.fw-slider').querySelector('output'); r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%'); if (out) out.textContent = r.value + (r.dataset.unit || ''); });
}
/** Edit a style value: updates the default for new marks and the selected mark (one undo step per control). */
function setStyle(key, val, markKey = key) {
  const st = S.st, sm = selMark();
  if (key === 'size') { const k = { brush: 'size', pencil: 'pencil', eraser: 'eraser' }[sm ? sm.shape.kind : S.tool]; if (k) st[k] = val; }
  else st[key] = val;
  if (sm && markKey && (sm.shape[markKey] !== undefined || markKey === 'w')) { const d = doc(); snap(d, `style:${sm.id}:${markKey}`); sm.shape = { ...sm.shape, [markKey]: val }; changed(d, { fast: true }); placeSel(); }
}
function wirePanel(p, d) {
  const on = (sel, ev, fn) => p.querySelector(sel)?.addEventListener(ev, fn);
  // Edit
  on('#q-crop', 'click', startCrop); on('#q-rotl', 'click', () => rotate(-90)); on('#q-rotr', 'click', () => rotate(90)); on('#q-fliph', 'click', () => flip('h')); on('#q-flipv', 'click', () => flip('v'));
  on('#q-auto', 'click', autoEnhance);
  $$('[data-adj]', p).forEach((r) => {
    r.addEventListener('input', () => setAdjust(r.dataset.adj, +r.value));
    r.addEventListener('change', () => { changed(doc()); });
    r.closest('.fw-slider').querySelector('label').addEventListener('dblclick', () => { setAdjust(r.dataset.adj, 0, { live: false }); refreshSliders(); });
  });
  on('#reset', 'click', resetAll);
  if (!p._wired) { p._wired = true; p.addEventListener('click', (e) => { const t = e.target.closest('[data-tog]'); if (t) { toggleStep(+t.dataset.tog); if (S.mode === 'markup') renderPanel(); return; } const x = e.target.closest('[data-del]'); if (x) deleteStep(+x.dataset.del); }); }
  if (p.querySelector('#bg-block')) wireBg(p.querySelector('#bg-block'));
  updateHistory();
  // Crop
  $$('[data-aspect]', p).forEach((b) => (b.onclick = () => setAspect(b.dataset.aspect)));
  on('#straighten', 'input', (e) => setStraighten(+e.target.value));
  on('#c-rotl', 'click', () => rotate(-90)); on('#c-rotr', 'click', () => rotate(90)); on('#c-fliph', 'click', () => flip('h')); on('#c-flipv', 'click', () => flip('v'));
  on('#c-reset', 'click', resetCrop); on('#c-cancel', 'click', cancelCrop); on('#c-done', 'click', commitCrop);
  // Markup
  $$('[data-tool]', p).forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  if (p.querySelector('#tools')) roving(p.querySelector('#tools'), '[data-tool]');
  $$('[data-colorrow] [data-c]', p).forEach((b) => (b.onclick = () => { setStyle('color', b.dataset.c); renderPanel(); }));
  on('[data-c-custom]', 'input', (e) => setStyle('color', e.target.value)); on('[data-c-custom]', 'change', () => renderPanel());
  on('#shape-kind', 'fw-change', (e) => { S.st.shape = e.detail.value; const sm = selMark(); if (sm && ['rect', 'ellipse', 'line', 'arrow'].includes(sm.shape.kind)) { snap(d); sm.shape = { ...sm.shape, kind: e.detail.value }; changed(d); } renderPanel(); });
  on('#o-size', 'input', (e) => setStyle('size', +e.target.value, 'size'));
  on('#o-tol', 'input', (e) => setStyle('tol', +e.target.value));
  on('#o-width', 'input', (e) => setStyle('width', +e.target.value));
  on('#o-cell', 'input', (e) => setStyle('cell', +e.target.value));
  on('#o-op', 'input', (e) => setStyle('opacity', +e.target.value));
  const fillMark = (val, key) => { const sm = selMark(); if (sm && ['rect', 'ellipse'].includes(sm.shape.kind)) { snap(d, key); sm.shape = { ...sm.shape, fill: val }; changed(d, { fast: true }); } };
  on('#o-fill', 'change', (e) => { S.st.fillOn = e.target.checked; fillMark(e.target.checked ? S.st.fill : null); renderPanel(); });
  on('#o-fillc', 'input', (e) => { S.st.fill = e.target.value; S.st.fillOn = true; fillMark(e.target.value, 'fillc'); e.target.parentElement.style.setProperty('--c', e.target.value); });
  on('#o-text', 'input', (e) => { const sm = selMark(); if (!sm) return; snap(d, 'text:' + sm.id); sm.shape = { ...sm.shape, text: e.target.value }; changed(d, { fast: true }); placeSel(); });
  on('#o-font', 'change', (e) => setStyle('font', e.target.value));
  on('#o-fsize', 'input', (e) => { const v = clamp(+e.target.value || 4, 4, 2000); setStyle('fsize', v); });
  on('#o-weight', 'fw-change', (e) => setStyle('weight', +e.detail.value));
  on('#o-align', 'fw-change', (e) => setStyle('align', e.detail.value));
  on('#o-outc', 'input', (e) => { setStyle('outline', e.target.value); e.target.parentElement.style.setProperty('--c', e.target.value); if (!(+$('#o-outw', p)?.value)) { $('#o-outw', p).value = 3; setStyle('outlineW', 3); } });
  on('#o-outw', 'input', (e) => setStyle('outlineW', clamp(+e.target.value || 0, 0, 60)));
  on('#o-boxw', 'input', (e) => setStyle('boxW', +e.target.value / 100, 'w'));
  $$('[data-pick]', p).forEach((b) => (b.onclick = () => { S.selMark = +b.dataset.pick; if (S.tool !== 'move' && !compatible(selMark().shape.kind, S.tool)) S.tool = 'move'; renderPanel(); placeSel(); }));
  on('#l-name', 'input', (e) => { const sm = selMark(); if (!sm) return; snap(d, 'name:' + sm.id); sm.name = e.target.value; updateHistory(); saveSoon(); const row = p.querySelector(`[data-pick="${sm.id}"] span`); if (row) row.textContent = e.target.value; });
  const moveLayer = (dir) => { const sm = selMark(); if (!sm) return; const marks = d.recipe.filter((s) => s.type === 'mark'), k = marks.indexOf(sm), other = marks[k + dir]; if (!other) return; snap(d); const i = d.recipe.indexOf(sm), j = d.recipe.indexOf(other); d.recipe[i] = other; d.recipe[j] = sm; changed(d); renderPanel(); };
  on('#l-up', 'click', () => moveLayer(1)); on('#l-down', 'click', () => moveLayer(-1));
  on('#l-dup', 'click', () => { const sm = selMark(); if (!sm) return; const s = addMark(E.moveShape(sm.shape, 0.02, 0.02)); if (sm.name) s.name = sm.name + ' copy'; });
  on('#l-del', 'click', () => deleteSelected());
  on('#l-imgop', 'input', (e) => { const v = +e.target.value, last = d.recipe.at(-1); if (last?.type === 'opacity' && d._k === 'imgop') { last.value = v; d._t = Date.now(); changed(d, { fast: true }); } else pushStep({ type: 'opacity', value: v }, d, { fast: true, key: 'imgop' }); });
  // Inspect
  on('#exif-all', 'click', () => exifDialog(d));
  on('#meta-i', 'fw-change', (e) => { S.exp.meta = e.detail.value; queueEstimate(); });
  on('#strip-now', 'click', saveWithoutMeta);
  on('#colfmt', 'fw-change', (e) => { S.colorFmt = e.detail.value; renderPanel(); });
  $$('[data-col]', p).forEach((b) => (b.onclick = async () => { const c = d.palette[+b.dataset.col], v = colStr(c); await navigator.clipboard.writeText(v).catch(() => {}); const lab = b.querySelector('.lb-pal__val'); lab.textContent = 'Copied'; b.classList.add('is-copied'); setTimeout(() => { lab.textContent = colStr(c); b.classList.remove('is-copied'); }, 1400); }));
  on('#pal-css', 'click', async (e) => { const css = `:root {\n${d.palette.map((c, i) => `  --color-${i + 1}: ${colStr(c)};`).join('\n')}\n}`; await navigator.clipboard.writeText(css).catch(() => {}); flash(e.currentTarget, 'Copied'); });
  on('#pick-on', 'click', () => { S.picking = !S.picking; stage.classList.toggle('is-picking', S.picking); renderPanel(); renderMobilePanel(); });
  on('#ocr-go', 'click', () => findText());
  on('#ocr-again', 'click', () => findText({ again: true }));
  on('#ocr-ov', 'fw-change', (e) => { S.ocr.overlay = e.detail.value; renderOcr(); });
  on('#ocr-lang', 'change', (e) => (S.ocr.lang = e.target.value)); on('#ocr-layout', 'change', (e) => (S.ocr.layout = e.target.value));
  on('#ocr-spaces', 'change', (e) => { S.ocr.spaces = e.target.checked; renderPanel(); });
  $$('.lb-lines__row', p).forEach((b) => {
    b.onmouseenter = () => syncLine(+b.dataset.l); b.onmouseleave = () => syncLine(null);
    b.onclick = async () => { await navigator.clipboard.writeText(lineText(d.ocr.lines[+b.dataset.l].words)).catch(() => {}); flash(b, 'Copied'); };
  });
  on('#ocr-all', 'click', async (e) => { await navigator.clipboard.writeText(ocrText(d)).catch(() => {}); flash(e.currentTarget, `Copied ${d.ocr.lines.length} lines`); });
  on('#ocr-txt', 'click', () => E.download(new Blob([ocrText(d)], { type: 'text/plain;charset=utf-8' }), `${baseName(d)}.txt`));
  if (S.mode === 'inspect') ensurePalette();
  // Export
  $$('[data-preset]', p).forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));
  on('#fmt', 'fw-change', (e) => setExp({ format: e.detail.value }, { keepPreset: false }));
  const q = p.querySelector('#quality'); if (q) q.addEventListener('input', () => { S.exp.quality = +q.value; S.exp.preset = null; $$('[data-preset]', p).forEach((b) => b.setAttribute('aria-pressed', 'false')); queueEstimate(120); });
  on('#max-on', 'change', (e) => setExp({ max: e.target.checked }));
  on('#max-kb', 'input', (e) => { S.exp.maxKB = Math.max(10, +e.target.value || 10); S.exp.preset = null; queueEstimate(300); });
  on('#size-mode', 'change', (e) => setExp({ size: e.target.value, value: { longest: 1920, width: 1920, height: 1080, percent: 50 }[e.target.value] ?? S.exp.value }));
  on('#size-v', 'input', (e) => { S.exp.value = Math.max(1, +e.target.value || 1); S.exp.preset = null; $$('[data-sizep]', p).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.sizep === S.exp.value))); queueEstimate(300); });
  $$('[data-sizep]', p).forEach((b) => (b.onclick = () => setExp({ value: +b.dataset.sizep })));
  on('#box-w', 'input', (e) => { S.exp.boxW = Math.max(1, +e.target.value || 1); queueEstimate(300); }); on('#box-h', 'input', (e) => { S.exp.boxH = Math.max(1, +e.target.value || 1); queueEstimate(300); });
  on('#ex-w', 'input', (e) => { S.exp.exactW = Math.max(1, +e.target.value || 1); if (S.exp.lock) { const g = E.geometry(d, E.effective(d)); $('#ex-h', p).value = Math.round(S.exp.exactW * g.oh / g.ow); } queueEstimate(300); });
  on('#ex-h', 'input', (e) => { S.exp.exactH = Math.max(1, +e.target.value || 1); if (S.exp.lock) { const g = E.geometry(d, E.effective(d)); S.exp.exactW = Math.round(S.exp.exactH * g.ow / g.oh); $('#ex-w', p).value = S.exp.exactW; } queueEstimate(300); });
  on('#ex-lock', 'click', () => { const g = E.geometry(d, E.effective(d)); S.exp.exactH = Math.round(S.exp.exactW * g.oh / g.ow); setExp({ lock: !S.exp.lock }); });
  on('#no-up', 'change', (e) => setExp({ noUp: e.target.checked }));
  on('#box-clear', 'click', () => setExp({ box: null }));
  on('#meta', 'fw-change', (e) => { S.exp.meta = e.detail.value; queueEstimate(); });
  on('#scope', 'fw-change', (e) => { S.exp.scope = e.detail.value; const nm = p.querySelector('.lb-name'); if (nm) nm.hidden = S.exp.scope !== 'this'; updateEstimateUI(); });
  on('#exp-name', 'input', (e) => { (S.exp.nameFor ||= {})[d.id] = e.target.value; });
  $$('.lb-savebtn', p).forEach((b) => (b.onclick = () => (S.batch ? (S.batch.cancel = true) : save())));
  on('#fav-save', 'click', saveFavicons);
  if (S.mode === 'export') updateEstimateUI();
}
function deleteSelected() {
  const d = doc(), sm = selMark(); if (!sm) return;
  snap(d); d.recipe.splice(d.recipe.indexOf(sm), 1); S.selMark = null; changed(d); renderPanel(); renderMobilePanel();
  toast(`Deleted ${markName(sm)}`, { type: 'neutral', action: { label: 'Undo', onClick: undo } });
}
function flash(el, text) { if (!el) return; const old = el.innerHTML; el.style.minWidth = el.offsetWidth + 'px'; el.innerHTML = `${icon('check')}<span>${esc(text)}</span>`; el.classList.add('is-copied'); setTimeout(() => { el.innerHTML = old; el.classList.remove('is-copied'); el.style.minWidth = ''; }, 1400); }
function ensurePalette() {
  const d = doc(); if (!d || d.palette) return;
  setTimeout(() => { if (d.palette) return; d.palette = E.palette(E.render(d, { maxDim: 240 }), 6); if (doc() === d && S.mode === 'inspect') { const sc = panelScroll(); renderPanel(); panelScroll(sc); } renderMobilePanel(); }, 30);
}
function exifDialog(d) {
  const t = d.exif?.tags || {};
  const rows = Object.entries({ ...t }).map(([k, v]) => [k.replace(/([a-z])([A-Z])/g, '$1 $2'), Array.isArray(v) ? v.map((x) => +(+x).toFixed(4)).join(', ') : typeof v === 'number' ? +v.toFixed(6) : v]);
  if (d.info?.location) rows.push(['GPS position', E.fmtCoord(d.info.location)], ['GPS altitude', `${Math.round(d.info.location.alt || 0)} m`]);
  openDialog({ title: `Metadata · ${d.name}`, size: 560, body: `<div class="fw-table-wrap"><table class="fw-table"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="is-mono">${esc(String(v))}</td></tr>`).join('')}</tbody></table></div>`, actions: [{ label: 'Done', primary: true, close: true }] });
}

// ───────────────────────── phone: mode tabs + quick controls + expandable options ─────────────────────────
function renderMobileBar() {
  const mb = $('#mbar'), d = doc();
  if (!d || !mob()) { mb.innerHTML = ''; return; }
  mb.innerHTML = `<div class="lb-mpanel ${S.mfull ? 'is-full' : ''}" id="mpanel"></div>
    <div class="lb-mtabs" role="tablist" aria-label="Tools">${MTABS.map(([id, l, ic]) => `<button class="lb-mtab" type="button" role="tab" aria-selected="${S.mtab === id}" data-mtab="${id}">${icon(ic, { size: 20 })}<span>${l}</span></button>`).join('')}</div>`;
  $$('[data-mtab]', mb).forEach((b) => (b.onclick = () => setMtab(b.dataset.mtab)));
  renderMobilePanel();
}
function setMtab(t) {
  if (S.mtab === t) { S.mfull = !S.mfull; renderMobileBar(); return; }
  if (S.mtab === 'crop' && t !== 'crop') commitCrop();
  S.mtab = t; S.mfull = false;
  const m = { adjust: 'edit', crop: 'edit', markup: 'markup', inspect: 'inspect', export: 'export' }[t];
  if (S.mode !== m) setMode(m);
  if (t === 'crop') startCrop();
  renderMobileBar();
}
function renderMobilePanel() {
  const mp = $('#mpanel'), d = doc(); if (!mp || !d || !mob()) return;
  const title = { adjust: 'Adjust', crop: 'Crop', markup: TOOLS.find((x) => x.id === S.tool).label, inspect: 'Inspect', export: 'Export' }[S.mtab];
  const head = `<div class="lb-mhead"><span class="lb-mhead__title">${esc(title)}</span><span class="fw-spacer"></span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm lb-mmore" type="button" id="m-more" aria-expanded="${S.mfull}">${S.mfull ? 'Less' : 'All options'}${icon(S.mfull ? 'chevron-down' : 'chevron-up', { size: 14 })}</button></div>`;
  mp.classList.toggle('is-full', S.mfull);
  if (S.mfull) {
    mp.innerHTML = head + `<div class="lb-mfull" id="mfull"></div>`;
    $('#m-more').onclick = () => { S.mfull = false; renderMobileBar(); };
    renderPanel(); return;
  }
  const e = E.effective(d);
  let body = '';
  if (S.mtab === 'adjust') {
    const j = S.bgJob && S.bgJob.docId === d.id ? S.bgJob : null;
    const a = E.ADJ_BY[S.mparam];
    body = `<div class="lb-params" role="radiogroup" aria-label="Adjustment">
        <button class="lb-param ${e.bg ? 'is-on' : ''}" type="button" id="m-bg"><span class="lb-param__ring">${j && j.phase !== 'unavailable' ? `<span class="fw-ring" style="--value:${Math.round((j.got || 0) / 88 * 100)}"></span>` : icon('scissors', { size: 18 })}</span><span>${e.bg ? 'Cut out' : 'Remove bg'}</span></button>
        <button class="lb-param" type="button" id="m-auto"><span class="lb-param__ring">${icon('sparkles', { size: 18 })}</span><span>Auto</span></button>
        ${E.ADJ.map((x) => `<button class="lb-param" type="button" role="radio" aria-checked="${S.mparam === x.key}" data-param="${x.key}" style="--v:${Math.abs(e.adj[x.key]) / Math.max(Math.abs(x.min), x.max) * 100}"><span class="lb-param__ring">${icon(x.icon, { size: 18 })}</span><span>${x.label}</span></button>`).join('')}
      </div>
      ${dialHtml('adj', e.adj[S.mparam], a.min, a.max, a.label)}`;
  } else if (S.mtab === 'crop') {
    const c = S.cropping || { aspect: 'free', straighten: 0 };
    body = `<div class="lb-chiprow" role="group" aria-label="Aspect ratio">${ASPECTS.map((x) => `<button class="fw-chip" type="button" data-aspect="${x.id}" aria-pressed="${c.aspect === x.id}">${x.label}</button>`).join('')}</div>
      <div class="lb-mcrop"><button class="fw-iconbtn" type="button" aria-label="Rotate left" id="mc-rot">${icon('rotate-ccw', { size: 20 })}</button>
        ${dialHtml('str', c.straighten, -45, 45, 'Straighten', 0.1)}
        <button class="fw-iconbtn" type="button" aria-label="Flip horizontal" id="mc-flip">${icon('flip-horizontal', { size: 20 })}</button>
        <button class="fw-iconbtn lb-mdone" type="button" aria-label="Done" id="mc-done">${icon('check', { size: 20 })}</button></div>`;
  } else if (S.mtab === 'markup') {
    const sm = selMark(d);
    body = `<div class="lb-mtools" role="toolbar" aria-label="Markup tools">${TOOLS.map((x) => `<button class="lb-param" type="button" data-tool="${x.id}" aria-pressed="${S.tool === x.id}"><span class="lb-param__ring">${icon(x.icon, { size: 18 })}</span><span>${x.label}</span></button>`).join('')}</div>
      <div class="lb-mstyle">${sm ? `<button class="fw-btn fw-btn--sm fw-btn--danger" type="button" id="m-del" aria-label="Delete selected">${icon('trash-2', { size: 14 })}</button>` : ''}
        ${COLORS.map((c) => `<button class="lb-sw" type="button" role="radio" aria-checked="${(sm?.shape.color || S.st.color) === c}" style="--c:${c}" data-mc="${c}" aria-label="${c}"></button>`).join('')}</div>`;
  } else if (S.mtab === 'inspect') {
    const inf = d.info || {};
    body = `<div class="lb-minspect">
      <div class="lb-facts lb-facts--m"><b>${d.w} × ${d.h}</b><span>${esc(d.kind)} · ${formatBytes(d.bytes)}${inf.camera ? ' · ' + esc(inf.camera) : ''}${inf.location ? ` · ${icon('map-pin', { size: 12 })} ${esc(inf.place || 'Location')}` : ''}</span></div>
      <div class="lb-palette lb-palette--m">${(d.palette || []).map((c, i) => `<button class="lb-pal" type="button" style="--c:${c.hex}" data-mcol="${i}" aria-label="Copy ${c.hex}"><span class="lb-pal__chip"></span></button>`).join('')}</div>
      <button class="fw-btn fw-btn--block" type="button" id="m-ocr">${icon('scan-text')}${d.ocr === 'loading' ? 'Reading text…' : d.ocr && typeof d.ocr === 'object' ? 'Text found · All options' : d.ocr === 'none' ? 'No text found' : 'Find text'}</button></div>`;
  } else if (S.mtab === 'export') {
    body = `<div class="lb-mexp"><div class="lb-chiprow lb-chiprow--flush" role="group" aria-label="Presets">${PRESETS.map((p) => `<button class="fw-chip" type="button" data-mpreset="${p.id}" aria-pressed="${S.exp.preset === p.id}">${esc(p.label)}</button>`).join('')}</div>
      <p class="lb-mest" aria-live="polite"></p>
      <button class="fw-btn fw-btn--primary fw-btn--lg fw-btn--block lb-savebtn" type="button" id="m-save"></button></div>`;
  }
  mp.innerHTML = head + `<div class="lb-mquick">${body}</div>`;
  enhance(mp);
  $('#m-more').onclick = () => { S.mfull = true; renderMobileBar(); };
  if (S.mtab === 'adjust') {
    $$('[data-param]', mp).forEach((b) => (b.onclick = () => { S.mparam = b.dataset.param; renderMobilePanel(); }));
    $('#m-auto').onclick = autoEnhance;
    $('#m-bg').onclick = () => (e.bg ? (S.mfull = true, renderMobileBar()) : removeBg());
    wireDial(mp.querySelector('.lb-dial'), (v, live) => { setAdjust(S.mparam, v, { live }); const pr = $(`[data-param="${S.mparam}"]`); const a = E.ADJ_BY[S.mparam]; pr?.style.setProperty('--v', Math.abs(v) / Math.max(Math.abs(a.min), a.max) * 100); }, () => changed(doc()));
  } else if (S.mtab === 'crop') {
    $$('[data-aspect]', mp).forEach((b) => (b.onclick = () => setAspect(b.dataset.aspect)));
    $('#mc-rot').onclick = () => rotate(-90); $('#mc-flip').onclick = () => flip('h'); $('#mc-done').onclick = () => { commitCrop(); setMtab('adjust'); };
    wireDial(mp.querySelector('.lb-dial'), (v) => setStraighten(v), () => {});
  } else if (S.mtab === 'markup') {
    $$('[data-tool]', mp).forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
    $$('[data-mc]', mp).forEach((b) => (b.onclick = () => { setStyle('color', b.dataset.mc); renderMobilePanel(); }));
    $('#m-del')?.addEventListener('click', deleteSelected);
  } else if (S.mtab === 'inspect') {
    ensurePalette();
    $('#m-ocr').onclick = () => (d.ocr && typeof d.ocr === 'object' ? (S.mfull = true, renderMobileBar()) : findText());
    $$('[data-mcol]', mp).forEach((b) => (b.onclick = async () => { const c = d.palette[+b.dataset.mcol]; await navigator.clipboard.writeText(c.hex).catch(() => {}); b.classList.add('is-copied'); bubble(b, `Copied ${c.hex}`); setTimeout(() => b.classList.remove('is-copied'), 1300); }));
  } else if (S.mtab === 'export') {
    $$('[data-mpreset]', mp).forEach((b) => (b.onclick = () => { applyPreset(b.dataset.mpreset); if (b.dataset.mpreset === 'favicon') { S.mfull = true; renderMobileBar(); } }));
    $('#m-save').onclick = () => (S.batch ? (S.batch.cancel = true) : save());
    updateEstimateUI();
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
  const min = +el.dataset.min, max = +el.dataset.max, step = +el.dataset.step, unitPx = step < 1 ? 60 : (max - min) > 50 ? 3.2 : 12;
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
      if (min < 0 && Math.abs(nv) < step * 2.5 && Math.abs(v0) > step * 2.5 && stuck < 6) { nv = 0; stuck++; }
      if (nv !== v) { v = +nv.toFixed(2); place(); onChange(v, true); }
    };
    const up = () => { el.classList.remove('is-drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); onEnd(v); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
  el.addEventListener('keydown', (e) => { const dlt = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0; if (!dlt) return; e.preventDefault(); v = clamp(+(v + dlt * step * (e.shiftKey ? 10 : 1)).toFixed(2), min, max); place(); onChange(v, false); onEnd(v); });
}

// ───────────────────────── empty state (page header + intake) ─────────────────────────
function renderEmpty() {
  const em = $('#empty'), empty = !S.docs.length;
  wb.classList.toggle('is-empty', empty); em.hidden = !empty;
  if (!empty) { em.innerHTML = ''; return; }
  const leaf = getLeaf(canonLeaf);
  em.innerHTML = `<div class="lb-empty__inner">
    <header class="lb-empty__head"><h1 class="fw-h1">${esc(leaf?.name || 'Image Tools')}</h1><p class="fw-lede">${esc(LEDE[canonLeaf] || LEDE['image-tools'])}</p></header>
    <div class="fw-intake lb-intake" data-intake data-accept="image/*,.heic,.heif" aria-label="Open images">
      <span class="fw-intake__icon">${icon('images', { size: 24 })}</span>
      <span class="fw-intake__title fw-pointer-copy">Drop images here</span>
      <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>${icon('folder-open')}Choose images</button></span>
      <span class="fw-intake__sub"><span class="fw-pointer-copy">${kbd('mod+v')} paste</span><span class="fw-dot fw-pointer-copy"></span><a href="#" data-sample="${esc(spec(sampleFor(canonLeaf)))}">Try sample images</a></span>
    </div></div>`;
  enhance(em);
}
function sampleFor(id) { return id === 'remove-background' ? ['dog-in-the-park.jpg', 'IMG_4110.jpg'] : id === 'image-metadata' ? ['IMG_4101.jpg', 'IMG_4105.jpg', 'cafe-croissant.jpg'] : id === 'blur-image' || id === 'annotate-image' ? ['cafe-croissant.jpg', 'IMG_4102.jpg'] : PHOTOS; }

// ───────────────────────── render all ─────────────────────────
function renderAll() {
  renderEmpty(); renderFramebar(); renderDock(); renderPanel(); renderMobileBar();
  stage.dataset.tool = S.tool; wb.dataset.mode = S.mode;
  if (doc()) { syncFrame(); schedule(); queueEstimate(60); } else { cv.width = cv.height = 0; $('#hud').innerHTML = ''; $('#ocr').hidden = true; after.hidden = true; $('#split').hidden = true; $('#selbox').hidden = true; }
}

// ───────────────────────── keyboard ─────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') stage.classList.remove('is-pointer');
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
    return;
  }
  if (k === 'Enter' && S.cropping && !isTyping()) { e.preventDefault(); commitCrop(); return; }
  if (e.altKey || isTyping() || (hasLayers() && k !== '\\') || !doc()) return;
  if (e.target.closest?.('.fw-cmd,.fw-popover,dialog,.lb-strip')) return;
  if (k === '\\') { e.preventDefault(); if (S.mode === 'export') { S.splitOn = !S.splitOn; placeSplit(); renderHud(); } else if (!e.repeat) { S.compare = true; schedule(); renderHud(); } return; }
  if (k.startsWith('Arrow') && !e.target.closest('input,select,[role=slider],.fw-seg,[role=toolbar],[role=radiogroup],[role=listbox]')) {
    e.preventDefault(); const s = e.shiftKey ? 120 : 40;
    const sm = selMark(); if (sm && S.mode === 'markup') { const d = doc(), g = S.geo, px = (e.shiftKey ? 10 : 1) / g.fw, py = (e.shiftKey ? 10 : 1) / g.fh; snap(d, 'nudge:' + sm.id); sm.shape = E.moveShape(sm.shape, k === 'ArrowLeft' ? -px : k === 'ArrowRight' ? px : 0, k === 'ArrowUp' ? -py : k === 'ArrowDown' ? py : 0); changed(d, { fast: true }); placeSel(); return; }
    panBy(k === 'ArrowLeft' ? s : k === 'ArrowRight' ? -s : 0, k === 'ArrowUp' ? s : k === 'ArrowDown' ? -s : 0); return;
  }
  if (k === ' ' && (e.target === stage || e.target === document.body)) { e.preventDefault(); S.space = true; stage.classList.add('is-hand'); return; }
  if ((k === 'Delete' || k === 'Backspace') && selMark() && S.mode === 'markup') { e.preventDefault(); deleteSelected(); return; }
  if (k === 'Escape' && S.selMark) { S.selMark = null; placeSel(); renderPanel(); return; }
  const low = k.toLowerCase();
  const map = { e: () => setMode('export'), c: () => startCrop(), f: () => setZoom('fit'), 1: () => setZoom(1), '+': () => zoomStep(1), '=': () => zoomStep(1), '-': () => zoomStep(-1) };
  TOOLS.forEach((t) => (map[t.key] = () => setTool(t.id)));
  map.a = () => { S.st.shape = 'arrow'; setTool('shape'); };
  if (map[low]) { e.preventDefault(); map[low](); }
});
document.addEventListener('keyup', (e) => {
  if (e.key === '\\' && S.compare) { S.compare = false; schedule(); renderHud(); }
  if (e.key === ' ') { S.space = false; stage.classList.remove('is-hand'); }
});

// ───────────────────────── boot ─────────────────────────
initSplit(); initOcr();
$('#m-compare').innerHTML = icon('circle-half', { size: 20 }); holdCompare($('#m-compare'));
wb.dataset.mode = S.mode;
renderAll();
matchMedia('(max-width: 767px)').addEventListener('change', () => { S.mfull = false; renderAll(); if (doc()) fitView(); });
window.addEventListener('fw-theme-change', () => doc() && schedule());
document.addEventListener('fullscreenchange', () => doc() && setTimeout(fitView, 60));
(async () => {
  if (params.has('demo')) {
    const names = params.get('demo') === 'one' ? ['cafe-croissant.jpg'] : PHOTOS;
    await openFiles(await loadSamples(spec(names)), { source: 'sample' });
    const pick = params.get('doc'); if (pick) { const i = S.docs.findIndex((d) => d.name.startsWith(pick)); if (i >= 0) go(i); }
    if (params.get('preset')) applyPreset(params.get('preset'));
  } else if (!params.has('fresh')) {
    const { docs, active } = await loadDocs();
    if (docs.length) {
      for (const r of docs) { uid = Math.max(uid, r.id); for (const s of r.recipe || []) uid = Math.max(uid, s.id || 0); }
      await openFiles(docs.map((r) => r.file), { source: 'restore', restore: docs });
      if (active > 0) go(active);
    }
  } else { S.noPersist = false; clearDocs(); }
  window.__lbReady = true;
})();
window.__lb = { S, go, setMode, setTool, removeBg, findText, applyPreset, setAdjust, setZoom, fitView, startCrop, commitCrop, rotate, save, doc, exportOne, planFor };
