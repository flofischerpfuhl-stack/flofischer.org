// Convert mockup · shared pieces of the six sub-tools: page frame, target picker, "More options", the file queue
// (cards with progress and inline errors), the sticky download bar and the preset "Related" row.
import { mountShell, renderPageHeader, getLeaf, chipOf, presetsOf, icon, esc, h, $, $$, kbd, store, toast, enhance,
  openPopover, openMenu, openDialog, formatBytes, extOf, hrefFor, isMobile, loadSamples } from '../kit/shell.js';
import { makeZip } from './zip.js';

export { icon, esc, h, $, $$, kbd, store, toast, enhance, formatBytes, extOf, isMobile, openMenu, openDialog, openPopover, loadSamples };
export const A = './assets/';
export const base = (n) => n.replace(/\.[^.]+$/, '');
export const fmtClock = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
export const fmtDur = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ───────────────────────────── page frame ─────────────────────────────
/** Which sub-tool a leaf belongs to, plus the SEO preset (target and source) when the leaf is one. */
const TOOL_OF = { 'convert-images': 'images', 'convert-video': 'video', 'convert-audio': 'audio', 'convert-data': 'data', 'convert-tables': 'tables', 'convert-documents': 'documents' };
export const PRESETS = {
  'heic-to-jpg': { from: 'HEIC', to: 'jpg', noun: 'HEIC photos' }, 'png-to-jpg': { from: 'PNG', to: 'jpg', noun: 'PNG images' },
  'jpg-to-png': { from: 'JPG', to: 'png', noun: 'JPG images' }, 'webp-to-png': { from: 'WebP', to: 'png', noun: 'WebP images' },
  'png-to-webp': { from: 'PNG', to: 'webp', noun: 'PNG images' }, 'avif-to-png': { from: 'AVIF', to: 'png', noun: 'AVIF images' },
  'tiff-to-png': { from: 'TIFF', to: 'png', noun: 'TIFF images' },
  'mov-to-mp4': { from: 'MOV', to: 'mp4', noun: 'MOV videos' }, 'mkv-to-mp4': { from: 'MKV', to: 'mp4', noun: 'MKV videos' },
  'webm-to-mp4': { from: 'WebM', to: 'mp4', noun: 'WebM videos' }, 'mp4-to-gif': { from: 'MP4', to: 'gif', noun: 'videos' },
  'mp4-to-mp3': { from: 'MP4', to: 'mp3', noun: 'videos' }, 'wav-to-mp3': { from: 'WAV', to: 'mp3', noun: 'WAV files' },
  'flac-to-mp3': { from: 'FLAC', to: 'mp3', noun: 'FLAC files' }, 'm4a-to-mp3': { from: 'M4A', to: 'mp3', noun: 'M4A files' },
  'mp3-to-wav': { from: 'MP3', to: 'wav', noun: 'MP3 files' }, 'mp3-to-ogg': { from: 'MP3', to: 'ogg', noun: 'MP3 files' },
  'csv-to-json': { from: 'csv', to: 'json', noun: 'CSV' }, 'json-to-csv': { from: 'json', to: 'csv', noun: 'JSON' },
  'xlsx-to-csv': { from: 'XLSX', to: 'csv', noun: 'Excel files' }, 'csv-to-xlsx': { from: 'CSV', to: 'xlsx', noun: 'CSV files' },
  'ods-to-xlsx': { from: 'ODS', to: 'xlsx', noun: 'ODS files' }, 'xlsx-to-ods': { from: 'XLSX', to: 'ods', noun: 'Excel files' },
  'docx-to-pdf': { from: 'DOCX', to: 'pdf', noun: 'Word documents' }, 'odt-to-pdf': { from: 'ODT', to: 'pdf', noun: 'ODT documents' },
  'odt-to-docx': { from: 'ODT', to: 'docx', noun: 'ODT documents' }, 'rtf-to-pdf': { from: 'RTF', to: 'pdf', noun: 'RTF documents' },
  'markdown-to-pdf': { from: 'Markdown', to: 'pdf', noun: 'Markdown', text: 'md' }, 'html-to-pdf': { from: 'HTML', to: 'pdf', noun: 'HTML pages', text: 'html' },
  'docx-to-txt': { from: 'DOCX', to: 'txt', noun: 'Word documents' },
};

export function resolvePage() {
  const p = new URLSearchParams(location.search);
  const leaf = getLeaf(p.get('leaf') || '') || getLeaf('convert-images');
  const toolLeaf = chipOf(leaf);
  const tool = TOOL_OF[toolLeaf?.id] || 'images';
  const preset = leaf.kind === 'preset' && PRESETS[leaf.id] ? { id: leaf.id, name: leaf.name, ...PRESETS[leaf.id] } : null;
  return { leaf, toolLeaf: TOOL_OF[toolLeaf?.id] ? toolLeaf : getLeaf('convert-images'), tool, preset };
}

/** Mount the shell + page header. `lede` replaces the registry line for presets ("Any image works."). */
export function frame(ctx, { accept, acceptLabel, onFiles, onPasteText, lede, commands, shortcuts }) {
  const shell = mountShell({ leaf: ctx.leaf.id, archetype: 'queue', accept, acceptLabel: acceptLabel || ctx.leaf.name, onFiles, onPasteText, commands, shortcuts });
  document.title = `${ctx.leaf.name} · Fernwork`;
  renderPageHeader($('#cv-head'), { leaf: ctx.leaf, lede: lede ?? ctx.leaf.desc ?? ctx.toolLeaf.desc });
  return shell;
}

/** Below the tool on preset pages: related conversions (today's preset pages have the same chip row). */
export function renderRelated(ctx) {
  if (!ctx.preset) return;
  const same = presetsOf(ctx.toolLeaf.id).filter((l) => l.id !== ctx.leaf.id);
  const others = ['heic-to-jpg', 'mp4-to-mp3', 'docx-to-pdf', 'csv-to-json'].filter((id) => id !== ctx.leaf.id && !same.some((l) => l.id === id)).map(getLeaf);
  const list = [...same, ...others].slice(0, 9);
  $('#cv-below').innerHTML = `<section class="cv-related" aria-labelledby="cv-rel-h"><h2 class="cv-related__h" id="cv-rel-h">Related</h2>
    <div class="fw-chips">${list.map((l) => `<a class="fw-chip" href="${hrefFor(l)}" data-leaf="${l.id}">${esc(l.name)}</a>`).join('')}
    <a class="fw-chip" href="${hrefFor(ctx.toolLeaf)}" data-leaf="${ctx.toolLeaf.id}">All ${esc({ Images: 'image', Video: 'video', Audio: 'audio', Data: 'data', Tables: 'table', Documents: 'document' }[ctx.toolLeaf.chip] || '')} formats</a></div></section>`;
}

// ───────────────────────────── target picker (TargetChip + FormatPalette) ─────────────────────────────
/** groups: [{ label, items: [[id, label, why]] }]. Searchable, arrows + Enter, check on the current one. */
export function pickFormat(anchor, { groups, current, onPick, label = 'Choose a format', search = true }) {
  const uid = 'cv-pal-' + Date.now();
  const all = groups.flatMap((g) => g.items);
  const el = h(`<div class="cv-pal">
    ${search && all.length > 6 ? `<div class="fw-palette__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" placeholder="Find a format…" aria-label="Find a format" role="combobox" aria-expanded="true" aria-controls="${uid}" aria-autocomplete="list" autocomplete="off" spellcheck="false"></div></div>` : ''}
    <div class="cv-pal__list" role="listbox" id="${uid}" aria-label="${esc(label)}" tabindex="-1">${groups.map((g) => `<div class="fw-palette__group" role="group" ${g.label ? `aria-label="${esc(g.label)}"` : ''}>${g.label ? `<div class="fw-palette__label">${esc(g.label)}</div>` : ''}
      ${g.items.map(([id, name, why]) => `<button class="fw-palette__opt" type="button" role="option" tabindex="-1" id="${uid}-${id}" aria-selected="${id === current}" data-f="${esc(id)}" data-s="${esc(`${id} ${name} ${why || ''}`.toLowerCase())}"><span class="fw-palette__fmt">${esc(name)}</span><span class="fw-palette__why">${esc(why || '')}</span><span class="cv-pal__cur">${id === current ? icon('check', { size: 14 }) : ''}</span></button>`).join('')}</div>`).join('')}
      <div class="cv-pal__empty" hidden></div></div></div>`);
  const p = openPopover(anchor, el, { className: 'fw-palette cv-palette', label, placement: 'bottom-start', focus: false });
  const input = el.querySelector('input'); const opts = $$('.fw-palette__opt', el);
  let active = opts.find((o) => o.getAttribute('aria-selected') === 'true') || opts[0];
  const setActive = (o, scroll = true) => { opts.forEach((x) => x.classList.toggle('is-active', x === o)); active = o; if (o) { input?.setAttribute('aria-activedescendant', o.id); if (scroll) o.scrollIntoView({ block: 'nearest' }); } };
  setActive(active);
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase(); let first = null;
    opts.forEach((o) => { const hit = !q || o.dataset.s.includes(q); o.hidden = !hit; if (hit && !first) first = o; });
    $$('.fw-palette__group', el).forEach((g) => (g.hidden = !$$('.fw-palette__opt:not([hidden])', g).length));
    setActive(opts.find((o) => !o.hidden && o.dataset.f.toLowerCase().startsWith(q)) || first);
    const empty = el.querySelector('.cv-pal__empty'); empty.hidden = !!first;
    if (!first) empty.textContent = `No format called “${input.value.trim()}”.`;
  });
  const keys = (e) => {
    const vis = opts.filter((o) => !o.hidden); const i = vis.indexOf(active);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(vis[(i + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length]); if (!input) active?.focus(); }
    else if ((e.key === 'Enter' || (e.key === ' ' && !input)) && active) { e.preventDefault(); pick(active.dataset.f); }
  };
  (input || el).addEventListener('keydown', keys);
  opts.forEach((o) => { o.addEventListener('mousemove', () => active !== o && setActive(o, false)); o.addEventListener('click', () => pick(o.dataset.f)); });
  function pick(f) { p.close(); onPick(f); }
  if (input && !matchMedia('(pointer: coarse)').matches) input.focus(); else (active || opts[0])?.focus();
  return p;
}
export const targetBtn = (id, label, cls = '') => `<button class="fw-target fw-target--lg ${cls}" type="button" id="${id}" aria-haspopup="listbox" aria-expanded="false"><span data-l>${esc(label)}</span>${icon('chevron-down', { size: 14 })}</button>`;

// ───────────────────────────── More options (progressive disclosure) ─────────────────────────────
/** Wires `.cv-more` + `#cv-opts`. summary() → short text of non-default settings ("1920 px · 80 %"). */
export function moreOptions({ button, panel, render, summary }) {
  const paint = () => { const s = summary(); button.querySelector('.cv-more__sum').textContent = s ? `· ${s}` : ''; button.classList.toggle('has-custom', !!s); };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
    if (open) { render(panel); enhance(panel); requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
  });
  const api = { paint, refresh: () => { if (!panel.hidden) { render(panel); enhance(panel); } paint(); }, open: () => button.getAttribute('aria-expanded') !== 'true' && button.click() };
  paint();
  return api;
}
export const moreBtn = () => `<button class="fw-btn fw-btn--ghost cv-more" type="button" aria-expanded="false" aria-controls="cv-opts">${icon('sliders-horizontal')}<span class="xs-hide">More options</span><span class="xs-show" aria-hidden="true">Options</span><span class="cv-more__sum"></span>${icon('chevron-down', { size: 14 })}</button>`;
export const clearBtn = () => `<button class="fw-btn fw-btn--ghost fw-btn--sm cv-clear" type="button" id="cv-clear" hidden aria-label="Clear all files" data-tip="Clear all">${icon('trash-2')}<span class="cv-wide">Clear</span></button>`;
export const field = (label, control, { hint = '', cls = '', id = '' } = {}) => `<div class="fw-field cv-field ${cls}">${label ? `<label class="fw-field__label" ${id ? `for="${id}"` : ''}>${esc(label)}</label>` : ''}${control}${hint ? `<span class="fw-field__hint">${hint}</span>` : ''}</div>`;
export const select = (id, opts, value) => `<select class="fw-select" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
export const seg = (id, label, opts, value) => `<div class="fw-seg" id="${id}" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button class="fw-seg__opt" type="button" role="radio" data-value="${esc(v)}" aria-checked="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`;
export const toggle = (id, label, checked, hint = '') => `<label class="fw-toggle cv-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span>${esc(label)}${hint ? `<span class="cv-toggle__hint">${esc(hint)}</span>` : ''}</span></label>`;

// ───────────────────────────── downloads ─────────────────────────────
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function downloadMany(outs, zipStem) {
  if (outs.length === 1) { download(outs[0].blob, outs[0].name); return outs[0].name; }
  const zip = await makeZip(outs.map((o) => ({ name: o.name, blob: o.blob })));
  const name = `${zipStem}.zip`; download(zip, name); return name;
}

// ───────────────────────────── the queue ─────────────────────────────
/**
 * new Queue({ list, noun: ['image','images'], auto, parallel, thumb(it), meta(it), extraActions(it), menu(it, btn),
 *             work(it, { progress, signal }) → { blob, name, note? }, panel(it, el), onChange() })
 * Item: { id, file, name, ext, size, status: 'queued'|'ready'|'working'|'done'|'error'|'cancelled', p, out, err }
 */
export class Queue {
  constructor(o) { Object.assign(this, { auto: true, parallel: 3, items: [], seq: 0, deltas: true }, o); this.list.setAttribute('role', 'list'); }
  add(files, extra = {}) {
    const fresh = files.filter((f) => !this.items.some((x) => x.file === f || (x.file.name === f.name && x.file.size === f.size && x.file.lastModified === f.lastModified)));
    const added = fresh.map((file) => ({ id: ++this.seq, file, name: file.name, ext: extOf(file), size: file.size, status: this.auto ? 'queued' : 'ready', p: 0, run: 0, ...extra }));
    this.items.push(...added);
    added.forEach((it) => this.prepare?.(it));
    added.forEach((it, i) => this.mount(it, i));
    this.changed(); this.schedule();
    return added;
  }
  mount(it, i = 0) {
    it.el = h(`<div class="fw-item cv-item" role="listitem" data-id="${it.id}" style="animation-delay:${Math.min(i, 8) * 40}ms">
      <div class="fw-item__thumb"></div>
      <div class="fw-item__main"><span class="fw-item__name" title="${esc(it.name)}">${esc(it.name)}</span><span class="fw-item__meta"></span></div>
      <div class="fw-item__status" aria-live="polite"></div>
      <div class="fw-item__actions"></div>
      <div class="fw-item__progress" style="width:0"></div>
      <div class="cv-panel" hidden></div></div>`);
    this.list.append(it.el); this.render(it);
  }
  render(it) {
    if (!it.el) return;
    const el = it.el;
    el.classList.toggle('is-error', it.status === 'error');
    el.querySelector('.fw-item__thumb').className = 'fw-item__thumb' + (it.thumbUrl ? '' : ' fw-item__thumb--icon');
    el.querySelector('.fw-item__thumb').innerHTML = this.thumb(it);
    el.querySelector('.fw-item__meta').innerHTML = this.meta(it);
    this.paintStatus(it);
    const acts = [...(this.extraActions?.(it) || [])];
    if (it.status === 'done') acts.push(`<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="dl" aria-label="Download ${esc(it.out.name)}" data-tip="Download">${icon('download')}</button>`);
    acts.push(this.menu ? `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="menu" aria-label="More for ${esc(it.name)}" aria-haspopup="menu" aria-expanded="false" data-tip="More">${icon('ellipsis')}</button>`
      : `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="remove" aria-label="Remove ${esc(it.name)}" data-tip="Remove">${icon('x')}</button>`);
    const box = el.querySelector('.fw-item__actions'); box.innerHTML = acts.join('');
    box.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => this.act(it, b.dataset.act, b)));
    const panel = el.querySelector('.cv-panel');
    const err = it.status === 'error' ? this.errorHtml(it) : '';
    const custom = this.panel?.(it, panel);
    if (err) { panel.hidden = false; panel.innerHTML = err; panel.querySelectorAll('[data-err]').forEach((b) => (b.onclick = () => this.errAct(it, b.dataset.err))); }
    else if (custom === false || custom === undefined) { panel.hidden = true; panel.innerHTML = ''; }
    else panel.hidden = false;
    enhance(el);
  }
  errorHtml(it) {
    return `<div class="fw-alert fw-alert--danger cv-err" role="alert"><span class="fw-alert__icon">${icon('circle-alert', { size: 16 })}</span><div class="fw-alert__body">
      <span>${esc(it.err.msg)}${this.items.filter((x) => x.status !== 'error').length ? ' <span class="cv-err__fine">The other files are fine.</span>' : ''}</span>
      <div class="fw-alert__actions">${(it.err.actions || []).map(([k, l]) => `<button class="fw-btn fw-btn--sm" type="button" data-err="${k}">${esc(l)}</button>`).join('')}<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-err="remove">Remove</button></div>
      ${it.err.detail ? `<details><summary>Details</summary>${esc(it.err.detail)}</details>` : ''}</div></div>`;
  }
  errAct(it, k) { if (k === 'remove') this.remove(it); else if (k === 'retry') this.requeue(it); else this.onErrAction?.(it, k); }
  paintStatus(it) {
    const s = it.el.querySelector('.fw-item__status'); const bar = it.el.querySelector('.fw-item__progress');
    if (it.status === 'queued') s.innerHTML = '<span class="fw-faint">Waiting</span>';
    else if (it.status === 'ready') s.innerHTML = this.readyHtml?.(it) || '<span class="fw-faint">Ready</span>';
    else if (it.status === 'cancelled') s.innerHTML = '<span class="fw-faint">Cancelled</span>';
    else if (it.status === 'working') s.innerHTML = `<span class="fw-ring" style="--value:${Math.round(it.p)}"></span><span class="fw-num fw-muted cv-pct">${it.stage ? esc(it.stage) + ' ' : ''}${Math.round(it.p)} %</span>`;
    else if (it.status === 'error') s.innerHTML = `<span class="fw-badge fw-badge--danger">${icon('circle-alert', { size: 14 })}${esc(it.err.short || "Can't read")}</span>`;
    else if (it.status === 'done') {
      const pct = Math.round((1 - it.out.blob.size / it.size) * 100); const showPct = this.deltas && Math.abs(pct) >= 1 && isFinite(pct);
      s.innerHTML = `<span class="fw-delta">${icon('circle-check')}<span>${formatBytes(it.out.blob.size)}</span>${showPct ? (pct > 0 ? `<b>−${pct} %</b>` : `<b class="cv-up">+${-pct} %</b>`) : ''}</span>${it.out.note ? `<span class="cv-note" title="${esc(it.out.note)}">${icon('info', { size: 14 })}<span class="fw-sr">${esc(it.out.note)}</span></span>` : ''}`;
    }
    bar.style.transition = it.status === 'working' ? '' : 'none';
    bar.style.width = it.status === 'working' ? it.p + '%' : '0';
  }
  act(it, a, btn) {
    if (a === 'dl') download(it.out.blob, it.out.name);
    else if (a === 'remove') this.remove(it);
    else if (a === 'menu') this.menu(it, btn);
    else this.onAction?.(it, a, btn);
  }
  remove(it, { silent = false } = {}) {
    it.run++; it.status = 'removed';
    const idx = this.items.indexOf(it); this.items.splice(idx, 1); it.el.remove();
    if (!silent) toast(`Removed ${it.name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { this.items.splice(idx, 0, it); it.status = it.out ? 'done' : this.auto ? 'queued' : 'ready'; this.mount(it); this.reorder(); this.changed(); this.schedule(); } } });
    this.changed(); this.schedule();
  }
  reorder() { this.items.forEach((x) => this.list.append(x.el)); }
  clear() {
    const old = [...this.items]; this.items.forEach((x) => { x.run++; x.el.remove(); }); this.items = []; this.changed();
    toast(`Cleared ${plural(old.length, 'file', 'files')}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { old.forEach((x) => { x.status = x.out ? 'done' : this.auto ? 'queued' : 'ready'; this.items.push(x); this.mount(x); }); this.changed(); this.schedule(); } } });
  }
  /** Settings changed: re-convert (auto queues) or mark as needing a new run (media). */
  requeue(it) { it.run++; it.out = null; it.err = null; it.p = 0; it.status = this.auto ? 'queued' : 'ready'; this.render(it); this.changed(); this.schedule(); }
  requeueAll() { this.items.filter((x) => x.status !== 'error' || x.retryable).forEach((x) => { x.run++; x.out = null; x.err = null; x.p = 0; x.status = this.auto ? 'queued' : 'ready'; this.render(x); }); this.changed(); this.schedule(); }
  runAll() { this.items.filter((x) => ['ready', 'cancelled', 'done'].includes(x.status)).forEach((x) => { x.status = 'queued'; x.out = null; x.p = 0; this.render(x); }); this.forced = true; this.changed(); this.schedule(); }
  cancelAll() { this.items.filter((x) => ['queued', 'working'].includes(x.status)).forEach((x) => { x.run++; x.status = 'cancelled'; x.p = 0; this.render(x); }); this.changed(); }
  get busy() { return this.items.some((x) => x.status === 'working' || x.status === 'queued'); }
  schedule() {
    const working = this.items.filter((x) => x.status === 'working').length;
    const next = this.items.filter((x) => x.status === 'queued').slice(0, Math.max(0, this.parallel - working));
    next.forEach((it) => this.start(it));
  }
  async start(it) {
    it.status = 'working'; it.p = 0; it.stage = ''; const run = ++it.run; this.render(it); this.changed();
    const progress = (p, stage) => { if (run !== it.run) return; it.p = Math.max(it.p, Math.min(99, p)); if (stage !== undefined) it.stage = stage; this.paintStatus(it); this.tick(); };
    try {
      const out = await this.work(it, { progress, alive: () => run === it.run });
      if (run !== it.run) return;
      it.out = out; it.status = 'done'; it.p = 100;
    } catch (e) {
      if (run !== it.run) return;
      if (e?.idle) { it.status = 'ready'; it.p = 0; this.render(it); this.changed(); this.schedule(); return; }
      it.status = 'error'; it.err = e.human ? e : { msg: `Couldn't convert ${it.name}: ${String(e.message || e)}`, short: 'Failed', actions: [['retry', 'Try again']], detail: String(e.stack || e).slice(0, 400) };
    }
    this.render(it); this.changed(); this.schedule();
    if (!this.busy) this.onBatchDone?.();
  }
  tick() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.onProgress?.(); }); }
  changed() { this.onChange?.(); }
  stats() {
    const its = this.items; const done = its.filter((x) => x.status === 'done');
    return { n: its.length, done, working: its.filter((x) => x.status === 'working' || x.status === 'queued'), errors: its.filter((x) => x.status === 'error'),
      inB: done.reduce((s, x) => s + x.size, 0), outB: done.reduce((s, x) => s + x.out.blob.size, 0) };
  }
}
/** A human error to throw from work(): new HumanError("Couldn't read this: …", { short, actions, detail }) */
export class HumanError extends Error { constructor(msg, o = {}) { super(msg); Object.assign(this, { human: true, msg, short: "Can't read", actions: [] }, o); } }

/** Describe a file that failed to decode, in plain words ("it's 21 bytes of text, not a photo"). */
export async function describeBroken(file, noun) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const text = head.length && [...head].every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
  const what = file.size < 1024 ? `${file.size} bytes` : formatBytes(file.size);
  return text ? `Couldn't read this: it's ${what} of text, not ${noun}.` : `Couldn't read this ${noun}: the file looks damaged or incomplete (${what}).`;
}

// ───────────────────────────── sticky download bar ─────────────────────────────
/** Shown only while there is something to download. */
export function stickyBar(q, { zipStem, noun = ['file', 'files'], onClearShown } = {}) {
  const wrap = $('#cv-ab'); const line = $('#ab-line'); const sub = $('#ab-sub'); const btn = $('#ab-primary');
  btn.onclick = async () => {
    const { done } = q.stats(); if (!done.length) return;
    btn.classList.add('is-busy');
    const name = await downloadMany(done.map((x) => x.out), zipStem(done));
    btn.classList.remove('is-busy');
    if (done.length > 1) toast(`Saved ${name}`, { type: 'success', duration: 2600 });
  };
  const paint = () => {
    const s = q.stats();
    wrap.hidden = !s.done.length; document.body.classList.toggle('cv-has-bar', !!s.done.length);
    if (!s.done.length) return;
    const saved = s.inB - s.outB;
    line.innerHTML = `<span class="xs-hide">${plural(s.done.length, noun[0], noun[1])} converted</span><span class="xs-show">${s.done.length} converted</span>`;
    const bits = [q.deltas ? `${formatBytes(s.inB)} → ${formatBytes(s.outB)}${saved > 0 && s.inB ? ` (−${Math.round((saved / s.inB) * 100)} %)` : ''}` : formatBytes(s.outB)];
    if (s.working.length) bits.push(`${s.working.length} still converting`);
    if (s.errors.length) bits.push(`${s.errors.length} can't be converted`);
    sub.textContent = bits.join(' · ');
    btn.querySelector('[data-l]').textContent = s.done.length === 1 ? 'Download' : `Download all`;
    btn.title = s.done.length === 1 ? s.done[0].out.name : `${s.done.length} files as one ZIP`;
  };
  return paint;
}
export const stickyHtml = () => `<div class="fw-page fw-actionbar-wrap cv-abwrap" id="cv-ab" hidden>
  <div class="fw-actionbar" role="region" aria-label="Downloads">
    <div class="fw-actionbar__summary"><span class="fw-actionbar__line" id="ab-line"></span><span class="fw-actionbar__sub" id="ab-sub"></span></div>
    <div class="fw-actionbar__actions"><button class="fw-btn fw-btn--primary" type="button" id="ab-primary">${icon('download')}<span data-l>Download all</span><span class="fw-hide-mobile cv-kbd">${kbd('mod+s')}</span></button></div>
  </div></div>`;

/** Files intake (empty state) and the slim "Add more" row once files exist. */
export function intakeHtml({ icon: ic, title, touch, sub = '', accept = '', samples = '', extraBtn = '' }) {
  return `<div class="fw-intake cv-intake" data-intake ${accept ? `data-accept="${esc(accept)}"` : ''} aria-label="${esc(touch)}, or drop them here">
    <span class="fw-intake__icon">${icon(ic, { size: 22 })}</span>
    <span class="fw-intake__title"><span class="fw-pointer-copy">${esc(title)}</span><span class="fw-touch-copy">${esc(touch)}</span></span>
    <span class="fw-intake__actions"><button class="fw-btn fw-btn--primary" type="button" data-pick>${icon('folder-open')}Choose files</button>${extraBtn}</span>
    <span class="fw-intake__sub">${sub ? `<span>${sub}</span>` : ''}${samples ? `<a href="#" data-sample="${esc(samples)}">Try a sample</a>` : ''}</span></div>`;
}
export const slimIntakeHtml = (label, accept = '') => `<div class="fw-intake fw-intake--slim cv-add" data-intake ${accept ? `data-accept="${esc(accept)}"` : ''} aria-label="${esc(label)}">
  <span class="fw-intake__icon">${icon('plus', { size: 18 })}</span><span class="fw-intake__title">${esc(label)}</span>
  <span class="fw-intake__sub fw-pointer-copy">or drop them anywhere</span></div>`;
