// Open · Markdown. Bundled marked + DOMPurify + highlight.js (same origin, loaded on first use). Preview · Split ·
// Source, outline, live preview that keeps the last good render, drafts autosaved on this device with a dirty dot.
import { formatBytes } from '../../kit/shell.js';

export default {
  id: 'md', label: 'Markdown', asLabel: 'Markdown', icon: 'file-text', exts: ['md', 'markdown'],
  listLabel: 'Outline', listIcon: 'list-tree', selIcon: 'text-cursor', selHint: 'Click in the text to see where you are.', measureLabel: 'Text', measureIcon: 'sigma',
  modes: [{ id: 'preview', label: 'Preview', icon: 'eye' }, { id: 'split', label: 'Split', icon: 'columns-2' }, { id: 'source', label: 'Source', icon: 'code-xml' }],
  steps(d, ctx) {
    return [
      { label: 'Loading Markdown engine (bundled · 190 KB)', cached: 'Markdown engine ready', engine: 'md', ms: 340, run: () => Promise.all(['vendor/marked-16.4.2.umd.js', 'vendor/dompurify-3.4.15.min.js', 'vendor/highlight-11.9.0.min.js'].map(ctx.loadScript)) },
      { label: `Reading ${formatBytes(d.size)}`, ms: 200, run: async () => { d.orig = await d.file.text(); d.text = d.draft ?? d.orig; } },
      { label: 'Rendering preview and outline', ms: 220 },
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
  inspector(d, ctx) {
    const t = d.text; const words = (t.replace(/```[\s\S]*?```/g, '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    const tasks = t.match(/^\s*[-*] \[( |x)\]/gim) || []; const done = tasks.filter((x) => /\[x\]/i.test(x)).length;
    const info = ctx.kv([['Type', 'Markdown · UTF-8'], ['Headings', ctx.nf((t.match(/^#{1,6} /gm) || []).length)], ['Tables', ctx.nf((t.match(/^\|?\s*:?-{3,}/gm) || []).length)], ['Code blocks', ctx.nf((t.match(/^```/gm) || []).length / 2)], ['Links', ctx.nf((t.match(/\]\(/g) || []).length)], tasks.length ? ['Tasks', `${done} of ${tasks.length} done`] : null, ['Draft', d.dirty ? `<span class="ov-okline">${ctx.icon('circle-check', { size: 14 })}Saved on this device</span><span class="ov-subline">Reload or close the tab: your edits stay.</span>` : 'No changes']]);
    const s = d.cursor; const sec = d.heads?.filter((h) => h.line <= (s?.line ?? 0)).at(-1);
    const selection = s ? ctx.kv([['Section', ctx.esc(sec?.text || 'Top of document')], ['Position', `Line ${s.line}, column ${s.col}`], s.selLen ? ['Selected', `${ctx.nf(s.selLen)} characters`] : null]) : null;
    const measure = ctx.kv([['Words', `<strong>${ctx.nf(words)}</strong>`], ['Reading time', `≈ ${Math.max(1, Math.round(words / 220))} min`], ['Characters', ctx.nf(t.length)], ['Lines', ctx.nf(t.split('\n').length)]]);
    return { info, selection, measure };
  },
  status(d, ctx) { const s = d.cursor; return ['Markdown', s ? `Ln ${s.line}, Col ${s.col}` : `${ctx.nf(d.text.split('\n').length)} lines`, 'UTF-8 · LF', d.dirty ? '<span class="ov-edited">Edited</span>' : 'Unchanged']; },
  exports(d, ctx) {
    const b = ctx.baseName(d.name);
    return [
      { group: 'Image', items: [{ label: 'PDF', sub: 'Print-ready, A4', icon: 'file-text', file: `${b}.pdf`, onSelect: () => printPDF(d, ctx) }] },
      { group: 'Data', items: [
        { label: 'HTML page', sub: 'Standalone, styles included', icon: 'code-xml', file: `${b}.html`, onSelect: () => { const name = `${b}.html`; ctx.download(name, htmlPage(d), 'text/html'); ctx.toast(`Saved ${name}`); } },
        { label: 'Plain text', sub: 'Without Markdown marks', icon: 'type', file: `${b}.txt`, onSelect: () => { const name = `${b}.txt`; ctx.download(name, d.ctl.plain(), 'text/plain'); ctx.toast(`Saved ${name}`); } },
        { label: 'Copy as rich text', sub: 'Paste into mail or Word', icon: 'copy', file: 'Clipboard', onSelect: async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([d.ctl.html()], { type: 'text/html' }), 'text/plain': new Blob([d.text], { type: 'text/plain' }) })]); } catch { await ctx.copyText(d.text); } ctx.toast('Copied as rich text'); } }] },
    ];
  },
  commands(d, t, ctx) {
    const out = [];
    for (const m of this.modes) if (m.id.startsWith(t) || (t.length > 2 && m.label.toLowerCase().startsWith(t))) out.push({ label: `${m.label} mode`, sub: 'Markdown', icon: m.icon, run: () => ctx.setMode(d, m.id) });
    (d.heads || []).forEach((h, i) => { if (t.length > 2 && h.text.toLowerCase().includes(t)) out.push({ label: `Go to “${h.text}”`, sub: `Heading · line ${h.line}`, icon: 'heading', run: () => d.ctl.goHeading(i) }); });
    if (/^(html|export)/.test(t)) out.push({ label: 'Save as HTML page', sub: `${ctx.baseName(d.name)}.html`, icon: 'code-xml', run: () => { ctx.download(`${ctx.baseName(d.name)}.html`, htmlPage(d), 'text/html'); ctx.toast(`Saved ${ctx.baseName(d.name)}.html`); } });
    return out.slice(0, 5);
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Outline', icon: 'list-tree' }, { id: 'edit', label: d.mode === 'source' ? 'Preview' : 'Edit', icon: d.mode === 'source' ? 'eye' : 'pencil', run: (doc, ctx) => ctx.setMode(doc, doc.mode === 'source' ? 'preview' : 'source') }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
function fillOutline(d, ctx) {
  const el = d._list; if (!el) return;
  const heads = d.heads || [];
  el.querySelector('.ov-listhead__count').textContent = heads.length;
  el.querySelector('.md-outline').innerHTML = heads.length ? heads.map((h, i) => `<button class="md-oitem md-oitem--${h.level}" type="button" data-h="${i}" aria-current="${i === d.curHead}">${ctx.esc(h.text)}</button>`).join('') : '<p class="ov-hint">No headings yet. Lines starting with # appear here.</p>';
}
function headsOf(text) { const out = []; text.split('\n').forEach((l, i) => { const m = /^(#{1,3})\s+(.+?)\s*#*$/.exec(l); if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, ''), line: i + 1 }); }); return out; }
function render(text) {
  const md = window.marked; const raw = md.parse(text, { gfm: true, breaks: false });
  const html = window.DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  const t = document.createElement('template'); t.innerHTML = html;
  t.content.querySelectorAll('table').forEach((tb) => { const w = document.createElement('div'); w.className = 'md-tablewrap'; tb.replaceWith(w); w.append(tb); });
  t.content.querySelectorAll('pre code').forEach((c) => { try { window.hljs.highlightElement(c); } catch { /* unknown language */ } const pre = c.parentElement; const lang = (/language-(\w+)/.exec(c.className) || [])[1]; pre.dataset.lang = lang || ''; });
  t.content.querySelectorAll('li > input[type=checkbox]').forEach((x) => { x.closest('li').classList.add('md-task'); x.closest('ul,ol')?.classList.add('md-tasks'); x.setAttribute('aria-label', x.checked ? 'Done' : 'Open'); });
  t.content.querySelectorAll('a[href]').forEach((a) => { if (/^https?:/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } });
  t.content.querySelectorAll('img').forEach((im) => { if (!/^(https?:|data:)/.test(im.getAttribute('src') || '')) { const s = document.createElement('span'); s.className = 'md-imgmissing'; s.textContent = `Image “${im.getAttribute('alt') || im.getAttribute('src')}” isn’t in this file`; im.replaceWith(s); } });
  return t.content;
}
function mountView(d, el, ctx) {
  el.classList.add('md');
  el.innerHTML = `<div class="md-src"><div class="md-gutter" aria-hidden="true"></div><textarea class="md-editor" spellcheck="false" wrap="off" aria-label="Markdown source of ${ctx.esc(d.name)}"></textarea></div>
    <div class="md-prev" tabindex="0" aria-label="Preview"><div class="md-stale" hidden>Showing the last good preview</div><article class="md-article"></article></div>`;
  const ta = el.querySelector('textarea'), gut = el.querySelector('.md-gutter'), prev = el.querySelector('.md-prev'), art = el.querySelector('.md-article');
  let scale = 1, showOrig = false, rt = 0;
  art.lang = /[äöüß]|\b(und|der|die|das)\b/i.test(d.orig) ? 'de' : 'en'; // correct hyphenation in narrow columns
  ta.value = d.text;
  function lines() { const n = ta.value.split('\n').length; if (gut.childElementCount !== n) gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  function update() {
    try { const frag = render(showOrig ? d.orig : d.text); art.replaceChildren(frag); el.querySelector('.md-stale').hidden = true; } catch (e) { el.querySelector('.md-stale').hidden = false; }
    art.querySelectorAll('pre').forEach((pre) => { if (pre.querySelector('.md-copy')) return; const b = ctx.h(`<button class="fw-iconbtn fw-iconbtn--sm md-copy" type="button" aria-label="Copy code" data-tip="Copy">${ctx.icon('copy')}</button>`); b.onclick = () => ctx.copyText(pre.querySelector('code').textContent, b); pre.append(b); });
    d.heads = headsOf(showOrig ? d.orig : d.text); fillOutline(d, ctx);
  }
  ta.addEventListener('input', () => {
    d.text = ta.value; lines();
    const dirty = d.text !== d.orig; d.draft = dirty ? d.text : null; ctx.setDirty(d, dirty); ctx.saveDraft(d);
    clearTimeout(rt); rt = setTimeout(() => { update(); ctx.refresh('insp status'); }, 120);
  });
  const caret = () => { const v = ta.value.slice(0, ta.selectionStart); const line = v.split('\n').length; d.cursor = { line, col: ta.selectionStart - v.lastIndexOf('\n'), selLen: ta.selectionEnd - ta.selectionStart }; const hi = (d.heads || []).filter((h) => h.line <= line).length - 1; if (hi !== d.curHead) { d.curHead = hi; fillOutline(d, ctx); } ctx.refresh('insp status'); };
  ta.addEventListener('keyup', caret); ta.addEventListener('click', caret);
  ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
  prev.addEventListener('scroll', () => { const hs = [...art.querySelectorAll('h1,h2,h3')]; const top = prev.getBoundingClientRect().top + 24; let i = -1; hs.forEach((h, k) => { if (h.getBoundingClientRect().top <= top) i = k; }); if (i !== d.curHead) { d.curHead = i; fillOutline(d, ctx); } });
  lines(); update();
  el.dataset.mode = d.mode;
  const setScale = (s) => { scale = Math.max(0.6, Math.min(2, s)); art.style.setProperty('--md-scale', scale); ctx.refresh('zoom'); };
  return {
    zoom: () => scale * 100, isFit: () => scale === 1, fit: () => setScale(1), setZoom: (p) => setScale(p / 100), zoomBy: (f) => setScale(Math.round(scale * (f > 1 ? 1.1 : 1 / 1.1) * 10) / 10),
    setMode: (m) => { el.dataset.mode = m; if (m !== 'preview') setTimeout(() => ta.focus({ preventScroll: true }), 30); },
    goHeading: (i) => { const h = d.heads[i]; if (!h) return; d.curHead = i; fillOutline(d, ctx); if (d.mode !== 'source') art.querySelectorAll('h1,h2,h3')[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (d.mode !== 'preview') { const pos = ta.value.split('\n').slice(0, h.line - 1).join('\n').length + 1; ta.focus(); ta.setSelectionRange(pos, pos); ta.scrollTop = Math.max(0, (h.line - 3) * 22); } },
    toggleOriginal: () => { showOrig = !showOrig; update(); return showOrig; },
    discardDraft: () => { d.text = d.orig; d.draft = null; ta.value = d.text; showOrig = false; lines(); update(); ctx.setDirty(d, false); ctx.refresh('insp status'); },
    setText: (t) => { d.text = t; d.draft = t; ta.value = t; lines(); update(); ctx.setDirty(d, t !== d.orig); ctx.saveDraft(d); },
    html: () => art.innerHTML, plain: () => art.innerText,
    editor: () => ta,
    destroy: () => clearTimeout(rt),
  };
}
const PAGE_CSS = 'body{font:16px/1.6 Geist,system-ui,sans-serif;color:#111;max-width:46rem;margin:2rem auto;padding:0 1rem}h1,h2,h3{line-height:1.25}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}pre{background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto}blockquote{border-left:3px solid #15803d;margin:0;padding-left:1rem;color:#444}';
function htmlPage(d) { const t = document.createElement('div'); t.innerHTML = d.ctl.html(); t.querySelectorAll('.md-copy').forEach((x) => x.remove()); const title = (d.heads?.[0]?.text || d.name).replace(/[<>&]/g, ''); return `<!doctype html><html lang="de"><meta charset="utf-8"><title>${title}</title><style>${PAGE_CSS}</style>${t.innerHTML}</html>`; }
function printPDF(d, ctx) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; document.body.append(f);
  const doc = f.contentDocument; doc.open(); doc.write(`<!doctype html><style>@page{size:A4;margin:18mm}${PAGE_CSS}</style>`); doc.close();
  const t = doc.createElement('div'); t.innerHTML = d.ctl.html(); t.querySelectorAll('.md-copy').forEach((x) => x.remove()); doc.body.append(t); doc.title = ctx.baseName(d.name);
  ctx.toast(`Choose “Save as PDF” to keep ${ctx.baseName(d.name)}.pdf`, { type: 'info' });
  setTimeout(() => { try { f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 2000); }, 250);
}
