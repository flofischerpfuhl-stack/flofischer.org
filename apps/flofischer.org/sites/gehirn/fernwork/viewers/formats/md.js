// Viewers · Markdown. Bundled marked + DOMPurify + highlight.js (same origin, loaded on first use). Preview · Split ·
// Source, synced scrolling, outline, linked images added from disk, preview zoom, edits kept on this device (dirty dot).
import { isMobile } from '../../kit/shell.js';

const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();

export default {
  id: 'md', label: 'Markdown', icon: 'file-code',
  listLabel: 'Outline', listIcon: 'list-tree', listOpen: () => false,
  modes: [{ id: 'preview', label: 'Preview', icon: 'eye', key: 'p', tip: 'Preview' }, { id: 'split', label: 'Split', icon: 'columns-2', tip: 'Source and preview', desktopOnly: true }, { id: 'source', label: 'Source', icon: 'code-xml', tip: 'Source only' }],
  defaultMode: () => (isMobile() ? 'preview' : 'split'),
  steps(d, ctx) {
    return [
      { label: 'Loading Markdown engine (bundled · 190 KB)', cached: 'Markdown engine ready', engine: 'md', ms: 340, run: () => Promise.all(['vendor/marked-16.4.2.umd.js', 'vendor/dompurify-3.4.15.min.js', 'vendor/highlight-11.9.0.min.js'].map(ctx.loadScript)) },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 160, run: async () => { d.orig = await d.file.text(); d.text = d.draft ?? d.orig; d.assets = d.assets || new Map(); d.sync = true; } },
      { label: 'Rendering preview', ms: 160 },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  saveOriginal(d, ctx) { ctx.download(d.name, d.text, 'text/markdown'); ctx.toast(d.dirty ? `Saved ${d.name} with your edits` : `Saved ${d.name}`); },
  list(d, ctx) {
    const el = ctx.h(`<div class="ov-listpanel"><div class="ov-listhead"><span class="ov-listhead__title">Outline</span><span class="ov-listhead__count"></span></div><nav class="md-outline" aria-label="Outline"></nav></div>`);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (b) d.ctl.goHeading(+b.dataset.h); });
    d._list = el; fillOutline(d, ctx); return el;
  },
  updateList(d, ctx) { fillOutline(d, ctx); },
  acceptsAdd: (name) => IMG.includes(extOf(name)),
  addAccept: 'image/*',
  addFiles(d, files, ctx) {
    const imgs = files.filter((f) => IMG.includes(extOf(f.name)));
    for (const f of imgs) d.assets.set(f.name.toLowerCase(), URL.createObjectURL(f));
    d.ctl.rerender(); ctx.refresh('insp');
    const miss = d.ctl.missing();
    ctx.toast(`Added ${imgs.length} image${imgs.length === 1 ? '' : 's'}${miss.length ? ` · ${miss.length} still missing` : ''}`, { type: miss.length ? 'info' : 'success' });
  },
  fileMenu(d, ctx) { return [{ label: 'Add linked images…', icon: 'image', sub: 'For images the file links to', onSelect: () => ctx.pickFiles({ add: true }) }]; },
  options(d, ctx) {
    return [{ group: 'View', items: [
      { label: 'Sync scroll', sub: 'Source and preview move together', checked: d.sync, onSelect: () => { d.sync = !d.sync; } },
      { label: 'Add linked images…', icon: 'image', onSelect: () => ctx.pickFiles({ add: true }) },
    ] }];
  },
  inspector(d, ctx) {
    const t = d.text; const words = (t.replace(/```[\s\S]*?```/g, '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    const tasks = t.match(/^\s*[-*] \[( |x)\]/gim) || []; const done = tasks.filter((x) => /\[x\]/i.test(x)).length;
    const miss = d.ctl?.missing?.() || [];
    const info = ctx.kv([
      ['Words', `<strong>${ctx.nf(words)}</strong> · ≈ ${Math.max(1, Math.round(words / 220))} min read`],
      ['Characters', ctx.nf(t.length)], ['Lines', ctx.nf(t.split('\n').length)],
      ['Headings', ctx.nf((t.match(/^#{1,6} /gm) || []).length)], ['Tables', ctx.nf((t.match(/^\|?\s*:?-{3,}/gm) || []).length)],
      ['Links', ctx.nf((t.match(/\]\(/g) || []).length)], tasks.length ? ['Tasks', `${done} of ${tasks.length} done`] : null,
      miss.length ? ['Images', `<span class="ov-warnline">${ctx.icon('triangle-alert', { size: 14 })}${miss.length} not added</span><button class="fw-btn fw-btn--sm" type="button" id="md-add-img">${ctx.icon('image')}Add images</button>`] : null,
    ]);
    return { info, infoLabel: 'Text' };
  },
  bindInspector(d, root, ctx) { root.querySelector('#md-add-img')?.addEventListener('click', () => ctx.pickFiles({ add: true })); },
  status(d, ctx) {
    if (d.mode === 'preview' || !d.cursor) return null;
    const s = d.cursor; return [`Ln ${s.line}, Col ${s.col}`, s.selLen ? `${ctx.nf(s.selLen)} selected` : `${ctx.nf(d.text.split('\n').length)} lines`];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name);
    return [
      { group: 'Document', items: [
        { label: 'HTML page', sub: 'Standalone, styles included', icon: 'code-xml', file: `${b}.html`, onSelect: () => { const name = `${b}.html`; ctx.download(name, htmlPage(d), 'text/html'); ctx.toast(`Saved ${name}`); } },
        { label: 'PDF', sub: 'Print-ready, A4', icon: 'file-text', file: `${b}.pdf`, onSelect: () => printPDF(d, ctx) },
        { label: 'Plain text', sub: 'Without Markdown marks', icon: 'type', file: `${b}.txt`, onSelect: () => { const name = `${b}.txt`; ctx.download(name, d.ctl.plain(), 'text/plain'); ctx.toast(`Saved ${name}`); } }] },
      { group: 'Copy', items: [
        { label: 'Copy HTML', sub: 'The rendered HTML code', icon: 'copy', file: 'Clipboard', onSelect: () => { ctx.copyText(cleanHtml(d)); ctx.toast('Copied HTML'); } },
        { label: 'Copy as rich text', sub: 'Paste into mail or Word', icon: 'copy', file: 'Clipboard', onSelect: async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([cleanHtml(d)], { type: 'text/html' }), 'text/plain': new Blob([d.text], { type: 'text/plain' }) })]); } catch { await ctx.copyText(d.text); } ctx.toast('Copied as rich text'); } }] },
    ];
  },
  commands(d, ctx) {
    const out = this.modes.map((m) => ({ id: 'mode-' + m.id, label: `${m.label} mode`, sub: 'Markdown', icon: m.icon, run: () => ctx.setMode(d, m.id) }));
    out.push({ id: 'add-img', label: 'Add linked images…', icon: 'image', run: () => ctx.pickFiles({ add: true }) });
    (d.heads || []).forEach((hd, i) => out.push({ id: 'h' + i, label: `Go to “${hd.text}”`, sub: `Heading · line ${hd.line}`, icon: 'heading', searchOnly: true, run: () => d.ctl.goHeading(i) }));
    return out;
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Outline', icon: 'list-tree' }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'Options', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
function fillOutline(d, ctx) {
  const el = d._list; if (!el) return;
  const heads = d.heads || [];
  el.querySelector('.ov-listhead__count').textContent = heads.length;
  el.querySelector('.md-outline').innerHTML = heads.length ? heads.map((hd, i) => `<button class="md-oitem md-oitem--${hd.level}" type="button" data-h="${i}" aria-current="${i === d.curHead}">${ctx.esc(hd.text)}</button>`).join('') : '<p class="ov-hint">No headings yet. Lines starting with # appear here.</p>';
}
function headsOf(text) { const out = []; text.split('\n').forEach((l, i) => { const m = /^(#{1,3})\s+(.+?)\s*#*$/.exec(l); if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, ''), line: i + 1 }); }); return out; }
function render(text, d) {
  const raw = window.marked.parse(text, { gfm: true, breaks: true });
  const html = window.DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  const t = document.createElement('template'); t.innerHTML = html;
  t.content.querySelectorAll('table').forEach((tb) => { const w = document.createElement('div'); w.className = 'md-tablewrap'; tb.replaceWith(w); w.append(tb); });
  t.content.querySelectorAll('pre code').forEach((c) => { try { window.hljs.highlightElement(c); } catch { /* unknown language */ } const lang = (/language-(\w+)/.exec(c.className) || [])[1]; c.parentElement.dataset.lang = lang || ''; });
  t.content.querySelectorAll('li > input[type=checkbox]').forEach((x) => { x.closest('li').classList.add('md-task'); x.closest('ul,ol')?.classList.add('md-tasks'); x.setAttribute('aria-label', x.checked ? 'Done' : 'Open'); });
  t.content.querySelectorAll('a[href]').forEach((a) => { if (/^https?:/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } });
  const missing = [];
  t.content.querySelectorAll('img').forEach((im) => {
    const src = im.getAttribute('src') || '';
    if (/^(data:|blob:)/.test(src)) return;
    const key = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || '').toLowerCase();
    const url = d.assets.get(key);
    if (url) { im.src = url; return; }
    missing.push(key || src);
    const s = document.createElement('span'); s.className = 'md-imgmissing'; s.textContent = `Image “${im.getAttribute('alt') || key}” · add ${key} to show it`; im.replaceWith(s);
  });
  d._missing = missing;
  return t.content;
}
function mountView(d, el, ctx) {
  el.classList.add('md');
  el.innerHTML = `<div class="md-src"><div class="md-gutter" aria-hidden="true"></div><textarea class="md-editor" spellcheck="false" wrap="off" aria-label="Markdown source of ${ctx.esc(d.name)}"></textarea></div>
    <div class="md-prev" tabindex="0" aria-label="Preview"><div class="md-stale" hidden>Showing the last good preview</div><article class="md-article"></article></div>`;
  const ta = el.querySelector('textarea'), gut = el.querySelector('.md-gutter'), prev = el.querySelector('.md-prev'), art = el.querySelector('.md-article');
  let scale = 1, showOrig = false, rt = 0, lock = 0;
  art.lang = /[äöüß]|\b(und|der|die|das)\b/i.test(d.orig) ? 'de' : 'en';
  ta.value = d.text;
  function lines() { const n = ta.value.split('\n').length; if (gut.childElementCount !== n) gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  function update() {
    try { art.replaceChildren(render(showOrig ? d.orig : d.text, d)); el.querySelector('.md-stale').hidden = true; } catch { el.querySelector('.md-stale').hidden = false; }
    art.querySelectorAll('pre').forEach((pre) => { const b = ctx.h(`<button class="fw-iconbtn fw-iconbtn--sm md-copy" type="button" aria-label="Copy code" data-tip="Copy">${ctx.icon('copy')}</button>`); b.onclick = () => ctx.copyText(pre.querySelector('code').textContent, b); pre.append(b); });
    d.heads = headsOf(showOrig ? d.orig : d.text); fillOutline(d, ctx);
  }
  ta.addEventListener('input', () => {
    d.text = ta.value; lines();
    const dirty = d.text !== d.orig; d.draft = dirty ? d.text : null; ctx.setDirty(d, dirty); ctx.saveDraft(d);
    clearTimeout(rt); rt = setTimeout(() => { update(); ctx.refresh('insp status'); }, 120);
  });
  const caret = () => { const v = ta.value.slice(0, ta.selectionStart); const line = v.split('\n').length; d.cursor = { line, col: ta.selectionStart - v.lastIndexOf('\n'), selLen: ta.selectionEnd - ta.selectionStart }; const hi = (d.heads || []).filter((hd) => hd.line <= line).length - 1; if (hi !== d.curHead) { d.curHead = hi; fillOutline(d, ctx); } ctx.refresh('status'); };
  ta.addEventListener('keyup', caret); ta.addEventListener('click', caret); ta.addEventListener('focus', caret);
  const ratio = (x) => x.scrollTop / Math.max(1, x.scrollHeight - x.clientHeight);
  ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; if (d.sync && d.mode === 'split' && lock !== 2) { lock = 1; prev.scrollTop = ratio(ta) * (prev.scrollHeight - prev.clientHeight); requestAnimationFrame(() => { lock = 0; }); } });
  prev.addEventListener('scroll', () => {
    if (d.sync && d.mode === 'split' && lock !== 1) { lock = 2; ta.scrollTop = ratio(prev) * (ta.scrollHeight - ta.clientHeight); requestAnimationFrame(() => { lock = 0; }); }
    const hs = [...art.querySelectorAll('h1,h2,h3')]; const top = prev.getBoundingClientRect().top + 24; let i = -1; hs.forEach((x, k) => { if (x.getBoundingClientRect().top <= top) i = k; }); if (i !== d.curHead) { d.curHead = i; fillOutline(d, ctx); }
  });
  lines(); update();
  el.dataset.mode = d.mode;
  const setScale = (s) => { scale = Math.max(0.6, Math.min(2, s)); art.style.setProperty('--md-scale', scale); ctx.refresh('zoom'); };
  const setText = (t) => { d.text = t; ta.value = t; lines(); update(); const dirty = t !== d.orig; d.draft = dirty ? t : null; ctx.setDirty(d, dirty); ctx.saveDraft(d); ctx.refresh('insp status'); };
  return {
    zoom: () => scale * 100, isFit: () => scale === 1, fit: () => setScale(1), setZoom: (p) => setScale(p / 100), zoomBy: (f) => setScale(Math.round(scale * (f > 1 ? 1.1 : 1 / 1.1) * 10) / 10),
    noZoom: () => d.mode === 'source',
    setMode: (m) => { el.dataset.mode = m; if (m !== 'preview' && !ctx.isMobile()) setTimeout(() => ta.focus({ preventScroll: true }), 30); ctx.refresh('status zoom'); },
    goHeading: (i) => { const hd = d.heads[i]; if (!hd) return; d.curHead = i; fillOutline(d, ctx); if (d.mode !== 'source') art.querySelectorAll('h1,h2,h3')[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (d.mode !== 'preview') { const pos = ta.value.split('\n').slice(0, hd.line - 1).join('\n').length + 1; ta.focus({ preventScroll: true }); ta.setSelectionRange(pos, pos); ta.scrollTop = Math.max(0, (hd.line - 3) * 22); } },
    toggleOriginal: () => { showOrig = !showOrig; update(); return showOrig; },
    discardDraft: () => { showOrig = false; setText(d.orig); },
    setDraft: (t) => setText(t),
    rerender: update, missing: () => d._missing || [],
    html: () => art.innerHTML, plain: () => art.innerText,
    destroy: () => clearTimeout(rt),
  };
}
const PAGE_CSS = 'body{font:16px/1.6 system-ui,sans-serif;color:#111;max-width:46rem;margin:2rem auto;padding:0 1rem}h1,h2,h3{line-height:1.25}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}pre{background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto}blockquote{border-left:3px solid #15803d;margin:0;padding-left:1rem;color:#444}img{max-width:100%}';
function cleanHtml(d) { const t = document.createElement('div'); t.innerHTML = d.ctl.html(); t.querySelectorAll('.md-copy').forEach((x) => x.remove()); return t.innerHTML; }
function htmlPage(d) { const title = (d.heads?.[0]?.text || d.name).replace(/[<>&]/g, ''); return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><style>${PAGE_CSS}</style>${cleanHtml(d)}</html>`; }
function printPDF(d, ctx) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; document.body.append(f);
  const doc = f.contentDocument; doc.open(); doc.write(`<!doctype html><style>@page{size:A4;margin:18mm}${PAGE_CSS}</style>`); doc.close();
  const t = doc.createElement('div'); t.innerHTML = cleanHtml(d); doc.body.append(t); doc.title = ctx.baseName(d.name);
  ctx.toast(`Choose “Save as PDF” to keep ${ctx.baseName(d.name)}.pdf`, { type: 'info' });
  setTimeout(() => { try { f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 2000); }, 250);
}
