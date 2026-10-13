// Viewers · Document Viewer (Word, ODT, RTF, EPUB, HTML, Markdown, text). Page: DOCX keeps its layout with the bundled
// docx-preview renderer (as today); other formats show their text on A4 paper. Edit: a simplified editor on the same
// paper with a compact toolbar (styles, bold/italic/underline, lists, alignment, links, insert table/image/page break/
// contents, find & replace, word count). Exports DOCX, ODT, RTF, EPUB, HTML, Markdown, TXT and print/PDF.
import { readDocx, readOdt, readEpub, blocksFromHtml, blocksFromMarkdown, blocksFromRtf, blocksFromText, toHtml, toMarkdown, toText, toRtf, writeDocx, writeOdt, writeEpub } from './officeio.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();
const xe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function blocksToHtml(blocks) {
  let h = '', list = false;
  for (const b of blocks) {
    if (b.t === 'li' && !list) { h += '<ul>'; list = true; } else if (b.t !== 'li' && list) { h += '</ul>'; list = false; }
    if (b.t === 'h') h += `<h${Math.min(b.level, 4)}>${xe(b.text)}</h${Math.min(b.level, 4)}>`;
    else if (b.t === 'li') h += `<li>${xe(b.text)}</li>`;
    else if (b.t === 'code') h += `<pre>${xe(b.text)}</pre>`;
    else if (b.t === 'table') h += `<table>${b.rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${xe(c)}</td>` : `<th>${xe(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
    else h += `<p>${xe(b.text)}</p>`;
  }
  return h + (list ? '</ul>' : '');
}
const KIND = { docx: 'Word document', odt: 'OpenDocument text', rtf: 'Rich text', epub: 'E-book (EPUB)', html: 'Web page', htm: 'Web page', md: 'Markdown', txt: 'Plain text' };

export default {
  id: 'docs', label: 'Document', icon: 'file-text',
  listLabel: 'Outline', listIcon: 'list-tree', listOpen: () => false,
  modes: [{ id: 'page', label: 'Page', icon: 'file-text' }, { id: 'edit', label: 'Edit', icon: 'pencil' }],
  keys: [{ label: 'Bold / italic / underline', keys: 'mod+b' }, { label: 'Find & replace', keys: 'mod+f' }],
  steps(d, ctx) {
    const x = extOf(d.name);
    return [
      { label: x === 'docx' ? 'Loading page renderer (bundled · 170 KB)' : 'Loading document engine (bundled · 40 KB)', cached: 'Document engine ready', engine: 'docs-' + (x === 'docx' ? 'docx' : 'text'), ms: 320, run: () => (x === 'docx' ? ctx.loadScript('vendor/jszip-3.10.1.min.js').then(() => ctx.loadScript('vendor/docx-preview-0.3.6.min.js')) : null) },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 220, run: async () => {
        try {
          let blocks;
          if (x === 'docx') blocks = await readDocx(d.file);
          else if (x === 'odt') blocks = await readOdt(d.file);
          else if (x === 'epub') blocks = await readEpub(d.file);
          else if (x === 'rtf') blocks = blocksFromRtf(await d.file.text());
          else if (x === 'md') blocks = blocksFromMarkdown(await d.file.text());
          else if (x === 'html' || x === 'htm') { const t = await d.file.text(); blocks = blocksFromHtml(t); if (!blocks.length) blocks = [{ t: 'p', text: '' }]; d.rawHtml = /<h1>Untitled<\/h1><p><\/p>/.test(t) ? t : null; }
          else blocks = blocksFromText(await d.file.text());
          d.origHtml = d.rawHtml || blocksToHtml(blocks); d.html = d.draft ?? d.origHtml; d.kind = KIND[x] || 'Document';
        } catch (e) { throw human(`${d.name} couldn’t be opened`, x === 'docx' || x === 'odt' || x === 'epub' ? 'The document package is damaged or isn’t a document. It may have been renamed or only partly downloaded.' : 'The text couldn’t be read.', String(e.message || e)); }
      } },
      { label: x === 'docx' ? 'Laying out pages' : 'Preparing pages', ms: 260 },
    ];
  },
  defaultMode: (file) => (/\.docx$/i.test(file.name) ? 'page' : 'edit'),
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  saveOriginal(d, ctx) { if (!d.dirty) { ctx.download(d.name, d.file); ctx.toast(`Saved ${d.name}`); return; } exportAs(d, ctx, extOf(d.name) === 'docx' || !['odt', 'rtf', 'html', 'htm', 'md', 'txt', 'epub'].includes(extOf(d.name)) ? 'docx' : extOf(d.name)); },
  list(d, ctx) {
    const el = ctx.h('<div class="ov-listpanel"><div class="ov-listhead"><span class="ov-listhead__title">Outline</span><span class="ov-listhead__count"></span></div><nav class="md-outline" aria-label="Outline"></nav></div>');
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (b) d.ctl.goHeading(+b.dataset.h); });
    d._list = el; fillOutline(d, ctx); return el;
  },
  updateList(d, ctx) { fillOutline(d, ctx); },
  inspector(d, ctx) {
    const t = d.ctl?.text() || ''; const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    const info = ctx.kv([['Type', d.kind], ['Words', `<strong>${ctx.nf(words)}</strong> · ≈ ${Math.max(1, Math.round(words / 220))} min read`], ['Characters', ctx.nf(t.length)], ['Paragraphs', ctx.nf((d.ctl?.blocks() || []).length)], ['Headings', ctx.nf((d.heads || []).length)], ['Changes', d.dirty ? 'Edited · kept on this device' : 'None']]);
    return { info, infoLabel: 'Document' };
  },
  status(d, ctx) { if (d.mode !== 'edit') return null; const t = d.ctl?.text() || ''; const w = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length; const s = d.ctl?.selWords?.(); return [`${ctx.nf(w)} words`, s ? `${ctx.nf(s)} selected` : `${ctx.nf(t.length)} characters`, d.ctl?.blockName?.() || '']; },
  options(d, ctx) {
    return [{ group: 'View', items: [
      { label: 'Outline', sub: 'Headings in a side list', icon: 'list-tree', onSelect: () => document.querySelector('#t-list')?.click() },
      { label: 'Spell check', checked: d.spell !== false, onSelect: () => { d.spell = d.spell === false; d.ctl.applyView(); } },
      { label: 'Show paragraph marks', checked: !!d.marks, onSelect: () => { d.marks = !d.marks; d.ctl.applyView(); } },
      { label: 'Focus mode', sub: 'Hide the toolbar while writing', checked: !!d.focus, onSelect: () => { d.focus = !d.focus; d.ctl.applyView(); } },
    ] }, { group: 'Document', items: [
      { label: 'Word count…', icon: 'sigma', onSelect: () => d.ctl.wordCount() },
      { label: 'Find and replace…', icon: 'search', kbd: 'mod+f', onSelect: () => d.ctl.find() },
    ] }];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name);
    return [
      { group: 'Document', items: [
        { label: 'Word (.docx)', icon: 'file-text', file: `${b}.docx`, onSelect: () => exportAs(d, ctx, 'docx') },
        { label: 'OpenDocument (.odt)', icon: 'file-text', file: `${b}.odt`, onSelect: () => exportAs(d, ctx, 'odt') },
        { label: 'Rich text (.rtf)', icon: 'file-text', file: `${b}.rtf`, onSelect: () => exportAs(d, ctx, 'rtf') },
        { label: 'E-book (.epub)', icon: 'book-open', file: `${b}.epub`, onSelect: () => exportAs(d, ctx, 'epub') },
        { label: 'Print / PDF', sub: 'A4, as shown', icon: 'file-text', file: `${b}.pdf`, onSelect: () => exportAs(d, ctx, 'print') }] },
      { group: 'Text', items: [
        { label: 'HTML page', icon: 'code-xml', file: `${b}.html`, onSelect: () => exportAs(d, ctx, 'html') },
        { label: 'Markdown', icon: 'file-code', file: `${b}.md`, onSelect: () => exportAs(d, ctx, 'md') },
        { label: 'Plain text', icon: 'type', file: `${b}.txt`, onSelect: () => exportAs(d, ctx, 'txt') },
        { label: 'Document snapshot', sub: 'Your edits as they are · reopens here', icon: 'braces', file: `${b}.fernwork.html`, onSelect: () => { const name = `${b}.fernwork.html`; ctx.download(name, `<!doctype html><meta charset="utf-8"><meta name="generator" content="Fernwork snapshot">${d.ctl.html()}`, 'text/html'); ctx.toast(`Saved ${name}`); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'edit', label: 'Edit the document', icon: 'pencil', run: () => ctx.setMode(d, 'edit') },
      { id: 'find', label: 'Find and replace…', icon: 'search', kbd: 'mod+f', run: () => d.ctl.find() },
      { id: 'toc', label: 'Insert table of contents', icon: 'list-tree', searchOnly: true, run: () => { ctx.setMode(d, 'edit'); d.ctl.cmd('toc'); } },
      { id: 'wc', label: 'Word count', icon: 'sigma', searchOnly: true, run: () => d.ctl.wordCount() },
      { id: 'pdf', label: 'Print / save as PDF', icon: 'file-text', searchOnly: true, run: () => exportAs(d, ctx, 'print') },
      ...(d.heads || []).map((hd, i) => ({ id: 'h' + i, label: `Go to “${hd.text}”`, icon: 'heading', searchOnly: true, run: () => d.ctl.goHeading(i) })),
    ];
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Outline', icon: 'list-tree' }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'Options', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
function fillOutline(d, ctx) {
  const el = d._list; if (!el) return; const heads = d.heads || [];
  el.querySelector('.ov-listhead__count').textContent = heads.length;
  el.querySelector('.md-outline').innerHTML = heads.length ? heads.map((hd, i) => `<button class="md-oitem md-oitem--${hd.level}" type="button" data-h="${i}">${ctx.esc(hd.text)}</button>`).join('') : '<p class="ov-hint">No headings yet.</p>';
}
async function exportAs(d, ctx, kind) {
  const b = ctx.baseName(d.name); const blocks = d.ctl.blocks(); const title = d.heads?.[0]?.text || b;
  const save = async (name, data, type) => { const bl = await data; ctx.download(name, bl, type); ctx.toast(`Saved ${name}`); };
  if (kind === 'docx') return save(`${b}.docx`, writeDocx(blocks));
  if (kind === 'odt') return save(`${b}.odt`, writeOdt(blocks));
  if (kind === 'epub') return save(`${b}.epub`, writeEpub(blocks, title));
  if (kind === 'rtf') return save(`${b}.rtf`, toRtf(blocks), 'application/rtf');
  if (kind === 'md') return save(`${b}.md`, toMarkdown(blocks), 'text/markdown');
  if (kind === 'txt') return save(`${b}.txt`, toText(blocks), 'text/plain');
  if (kind === 'html' || kind === 'htm') return save(`${b}.html`, toHtml(blocks, title), 'text/html');
  if (kind === 'print') {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; document.body.append(f);
    const doc = f.contentDocument; doc.open(); doc.write('<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font:11pt/1.5 Calibri,Carlito,Arial,sans-serif;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}h1{font-size:20pt}h2{font-size:14pt}hr.dc-pagebreak{page-break-after:always;border:0}</style>'); doc.close();
    const t = doc.createElement('div'); t.innerHTML = d.mode === 'page' && d.el.querySelector('.dc-pages section') ? d.el.querySelector('.dc-pages').innerHTML : d.ctl.html(); doc.body.append(t); doc.title = b;
    ctx.toast(`Choose “Save as PDF” to keep ${b}.pdf`, { type: 'info' });
    setTimeout(() => { try { f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 2000); }, 300);
  }
}

function mountView(d, el, ctx) {
  const isDocx = extOf(d.name) === 'docx';
  el.classList.add('dc');
  el.innerHTML = `<div class="dc-tools" role="toolbar" aria-label="Formatting"></div>
    <div class="dc-scroll"><div class="dc-pages" aria-label="Pages"></div>
      <div class="dc-editwrap"><div class="dc-note" hidden>${ctx.icon('info', { size: 14 })}<span>Editing shows a simplified layout. Headers, footnotes and floating objects stay in the original.</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Dismiss">${ctx.icon('x')}</button></div>
        <article class="dc-paper" contenteditable="true" spellcheck="true" aria-label="Document text" lang="${/[äöüß]/i.test(d.html) ? 'de' : 'en'}"></article></div></div>`;
  const tools = el.querySelector('.dc-tools'), pages = el.querySelector('.dc-pages'), paper = el.querySelector('.dc-paper'), scroll = el.querySelector('.dc-scroll'), note = el.querySelector('.dc-note');
  let zoom = 1, fitZ = true, pagesDone = false, showOrig = false;
  paper.innerHTML = d.html;
  const heads = () => { d.heads = [...paper.querySelectorAll('h1,h2,h3')].map((h) => ({ level: +h.tagName[1], text: h.textContent.trim() })).filter((x) => x.text); fillOutline(d, ctx); };
  heads();
  async function renderPages() {
    if (pagesDone) return; pagesDone = true;
    if (isDocx && !d.dirty && window.docx?.renderAsync) {
      try { const styles = document.createElement('div'); pages.innerHTML = ''; pages.append(styles); const host = document.createElement('div'); pages.append(host); await window.docx.renderAsync(d.file, host, styles, { className: 'docx', inWrapper: false, ignoreWidth: false, breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, experimental: true, useBase64URL: true }); }
      catch (e) { pages.innerHTML = `<section class="dc-paper dc-paper--page">${paper.innerHTML}</section>`; ctx.toast('Page layout failed · showing the text instead', { type: 'warning' }); }
    } else pages.innerHTML = `<section class="dc-paper dc-paper--page">${paper.innerHTML}</section>`;
    layout();
  }
  function layout() {
    const target = d.mode === 'page' ? pages : paper; const w = (d.mode === 'page' ? pages.querySelector('section')?.offsetWidth : 794) || 794;
    if (fitZ) zoom = Math.min(1, Math.max(0.3, (scroll.clientWidth - (ctx.isMobile() ? 16 : 64)) / w));
    pages.style.zoom = zoom; el.querySelector('.dc-editwrap').style.zoom = zoom; ctx.refresh('zoom');
  }
  const BLOCKS = [['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['blockquote', 'Quote'], ['pre', 'Code block']];
  function renderTools() {
    tools.innerHTML = `<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-c="undo" aria-label="Undo" data-tip="Undo" data-tip-kbd="mod+z">${ctx.icon('undo-2')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-c="redo" aria-label="Redo" data-tip="Redo" data-tip-kbd="shift+mod+z">${ctx.icon('redo-2')}</button><span class="fw-divider-v"></span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm dc-style" type="button" data-c="style" aria-haspopup="menu"><span>Paragraph</span>${ctx.icon('chevron-down', { size: 12 })}</button><span class="fw-divider-v"></span>
      <button class="fw-iconbtn fw-iconbtn--sm tb-b" type="button" data-c="bold" aria-label="Bold" data-tip="Bold" data-tip-kbd="mod+b">B</button>
      <button class="fw-iconbtn fw-iconbtn--sm tb-i" type="button" data-c="italic" aria-label="Italic" data-tip="Italic" data-tip-kbd="mod+i">I</button>
      <button class="fw-iconbtn fw-iconbtn--sm dc-u" type="button" data-c="underline" aria-label="Underline" data-tip="Underline" data-tip-kbd="mod+u">U</button>
      <button class="fw-iconbtn fw-iconbtn--sm dc-s" type="button" data-c="strikeThrough" aria-label="Strikethrough" data-tip="Strikethrough">S</button><span class="fw-divider-v"></span>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-c="insertUnorderedList" aria-label="Bullet list" data-tip="Bullet list">${ctx.icon('list')}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-c="insertOrderedList" aria-label="Numbered list" data-tip="Numbered list">${ctx.icon('list-checks')}</button>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-c="align" aria-haspopup="menu" data-tip="Alignment">${ctx.icon('text')}${ctx.icon('chevron-down', { size: 12 })}</button>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-c="link" aria-label="Link" data-tip="Link" data-tip-kbd="mod+k">${ctx.icon('link')}</button><span class="fw-divider-v"></span>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-c="insert" aria-haspopup="menu">${ctx.icon('plus')}Insert${ctx.icon('chevron-down', { size: 12 })}</button>
      <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-c="more" aria-haspopup="menu">More${ctx.icon('chevron-down', { size: 12 })}</button>`;
    ctx.enhance(tools);
  }
  renderTools();
  const exec = (c, v = null) => { paper.focus({ preventScroll: true }); document.execCommand(c, false, v); changed(); };
  let saved = null; const keepSel = () => { const s = getSelection(); if (s.rangeCount && paper.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
  const restoreSel = () => { if (!saved) return; paper.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(saved); };
  document.addEventListener('selectionchange', () => { if (d.mode === 'edit' && paper.contains(getSelection().anchorNode)) { keepSel(); const b = blockName(); tools.querySelector('.dc-style span').textContent = b; ctx.refresh('status'); } });
  function blockName() { let n = getSelection().anchorNode; while (n && n !== paper && !(n.nodeType === 1 && /^(P|H[1-6]|BLOCKQUOTE|PRE|LI|TD|TH)$/.test(n.tagName))) n = n.parentNode; const t = n?.tagName?.toLowerCase(); return t === 'li' ? 'List' : t === 'td' || t === 'th' ? 'Table' : BLOCKS.find((x) => x[0] === t)?.[1] || 'Paragraph'; }
  function insertHtml(html) { restoreSel(); document.execCommand('insertHTML', false, html); changed(); }
  function cmd(c, btn) {
    if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'undo', 'redo', 'superscript', 'subscript', 'removeFormat', 'indent', 'outdent'].includes(c)) { restoreSel(); return exec(c); }
    if (c === 'style') return ctx.menu(btn, [{ group: 'Paragraph style', items: BLOCKS.map(([v, l]) => ({ label: l, onSelect: () => { restoreSel(); exec('formatBlock', v); heads(); } })) }]);
    if (c === 'align') return ctx.menu(btn, [{ items: [['justifyLeft', 'Left'], ['justifyCenter', 'Centre'], ['justifyRight', 'Right'], ['justifyFull', 'Justify']].map(([v, l]) => ({ label: l, onSelect: () => { restoreSel(); exec(v); } })) }]);
    if (c === 'link') { const body = ctx.h('<label class="fw-field"><span class="fw-field__label">Web address</span><input class="fw-input" type="url" placeholder="https://"></label>'); ctx.openDialog({ title: 'Link', body, size: 420, actions: [{ label: 'Cancel', ghost: true }, { label: 'Add link', primary: true, onClick: () => { const u = body.querySelector('input').value.trim(); if (/^https?:\/\//.test(u)) { restoreSel(); exec('createLink', u); } } }] }); setTimeout(() => body.querySelector('input').focus(), 60); return; }
    if (c === 'toc') { const hs = [...paper.querySelectorAll('h1,h2,h3')]; hs.forEach((h, i) => { h.id ||= `h-${i}`; }); insertHtml(`<nav class="dc-toc"><p><strong>Contents</strong></p><ol>${hs.map((h) => `<li><a href="#${h.id}">${xe(h.textContent)}</a></li>`).join('')}</ol></nav><p><br></p>`); return; }
    if (c === 'insert') return ctx.menu(btn, [{ items: [
      { label: 'Table', icon: 'sheet', sub: '3 × 3', onSelect: () => insertHtml('<table><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></table><p><br></p>') },
      { label: 'Image…', icon: 'image', onSelect: () => { const i = ctx.h('<input type="file" accept="image/*" hidden>'); i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => insertHtml(`<img src="${r.result}" alt="${xe(f.name)}">`); r.readAsDataURL(f); }; document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); } },
      { label: 'Page break', icon: 'minus', onSelect: () => insertHtml('<hr class="dc-pagebreak"><p><br></p>') },
      { label: 'Horizontal line', icon: 'minus', onSelect: () => { restoreSel(); exec('insertHorizontalRule'); } },
      { label: 'Table of contents', icon: 'list-tree', onSelect: () => cmd('toc') },
      { label: 'Checklist', icon: 'list-checks', onSelect: () => insertHtml('<ul class="dc-check"><li>☐ First item</li><li>☐ Second item</li></ul>') },
      { label: 'Symbol or emoji…', icon: 'type', onSelect: () => ctx.menu(btn, [{ items: ['€', '§', '°', '±', '×', '→', '✓', '–', '„“'].map((s) => ({ label: s, onSelect: () => insertHtml(s) })) }]) }] }]);
    if (c === 'more') return ctx.menu(btn, [
      { group: 'Text', items: [
        { label: 'Superscript', onSelect: () => cmd('superscript') }, { label: 'Subscript', onSelect: () => cmd('subscript') },
        { label: 'Indent more', icon: 'arrow-right', onSelect: () => cmd('indent') }, { label: 'Indent less', icon: 'arrow-left', onSelect: () => cmd('outdent') },
        { label: 'Highlight', icon: 'brush', onSelect: () => { restoreSel(); exec('hiliteColor', '#fde68a'); } },
        { label: 'Clear formatting', icon: 'eraser', onSelect: () => cmd('removeFormat') }] },
      { group: 'Document', items: [
        { label: 'Find and replace…', icon: 'search', kbd: 'mod+f', onSelect: () => find() },
        { label: 'Word count…', icon: 'sigma', onSelect: () => wordCount() }] },
      { group: 'Also in the full editor', items: ['Font and size', 'Text and highlight colour', 'Line spacing', 'Style presets (callout, note, drop cap)', 'Page size, orientation, columns', 'Header and footer', 'Watermark', 'Footnotes and endnotes', 'Citations and bibliography', 'Comments', 'Bookmarks and cross-references', 'Equation'].map((l) => ({ label: l, onSelect: () => ctx.toast(`${l}: same as today’s document editor (not built in this mockup)`, { type: 'info' }) })) },
    ]);
  }
  tools.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  tools.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) cmd(b.dataset.c, b); });
  let rt = 0;
  function changed() { clearTimeout(rt); rt = setTimeout(() => { d.html = paper.innerHTML; const dirty = d.html !== d.origHtml; d.draft = dirty ? d.html : null; ctx.setDirty(d, dirty); ctx.saveDraft(d); pagesDone = false; heads(); ctx.refresh('status insp'); }, 200); }
  paper.addEventListener('input', changed);
  paper.addEventListener('keydown', (e) => { const mod = e.metaKey || e.ctrlKey; if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); find(); } if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); cmd('link'); } });
  note.querySelector('button').onclick = () => { note.hidden = true; d.noteSeen = true; };
  function find() {
    const body = ctx.h(`<div class="fw-stack" style="--gap:12px"><label class="fw-field"><span class="fw-field__label">Find</span><input class="fw-input" id="df-f" type="search"></label><label class="fw-field"><span class="fw-field__label">Replace with</span><input class="fw-input" id="df-r"></label><label class="fw-check"><input type="checkbox" id="df-c"> Match case</label><p class="fw-t-sm fw-muted" id="df-n"></p></div>`);
    const re = () => { const q = body.querySelector('#df-f').value; return q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), body.querySelector('#df-c').checked ? 'g' : 'gi') : null; };
    body.addEventListener('input', () => { const r = re(); body.querySelector('#df-n').textContent = r ? `${(paper.textContent.match(r) || []).length} found` : ''; });
    ctx.openDialog({ title: 'Find and replace', body, size: 420, actions: [{ label: 'Cancel', ghost: true }, { label: 'Replace all', primary: true, onClick: () => { const r = re(); if (!r) return; if (d.mode !== 'edit') ctx.setMode(d, 'edit'); const rep = body.querySelector('#df-r').value; let n = 0; const w = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode); for (const t of nodes) { const v = t.nodeValue.replace(r, () => { n++; return rep; }); if (v !== t.nodeValue) t.nodeValue = v; } changed(); ctx.toast(n ? `Replaced ${n} time${n === 1 ? '' : 's'}` : 'Nothing found', { type: n ? 'success' : 'info' }); } }] });
    setTimeout(() => body.querySelector('#df-f').focus(), 60);
  }
  function wordCount() { const t = paper.innerText; const w = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length; ctx.openDialog({ title: 'Word count', size: 360, body: ctx.kv([['Words', ctx.nf(w)], ['Characters', ctx.nf(t.length)], ['Without spaces', ctx.nf(t.replace(/\s/g, '').length)], ['Paragraphs', ctx.nf(paper.querySelectorAll('p,li,h1,h2,h3,h4').length)], ['Pages (A4)', `≈ ${Math.max(1, Math.ceil(w / 400))}`], ['Reading time', `≈ ${Math.max(1, Math.round(w / 220))} min`]]), actions: [{ label: 'Done', primary: true }] }); }
  function applyView() { el.classList.toggle('dc-marks', !!d.marks); el.classList.toggle('dc-focus', !!d.focus); paper.spellcheck = d.spell !== false; }
  function setMode(m) {
    el.dataset.mode = m; paper.contentEditable = m === 'edit' ? 'true' : 'false';
    if (m === 'page') renderPages(); else { note.hidden = !isDocx || !!d.noteSeen; if (!ctx.isMobile()) setTimeout(() => paper.focus({ preventScroll: true }), 40); }
    requestAnimationFrame(layout); ctx.refresh('status zoom');
  }
  const ro = new ResizeObserver(() => { if (fitZ) layout(); }); ro.observe(scroll);
  applyView(); setMode(d.mode);
  return {
    zoom: () => zoom * 100, isFit: () => fitZ, fit: () => { fitZ = true; layout(); }, setZoom: (p) => { fitZ = false; zoom = p / 100; layout(); }, zoomBy: (f) => { fitZ = false; zoom = Math.max(0.3, Math.min(3, zoom * f)); layout(); },
    setMode, applyView, find, wordCount, cmd: (c) => cmd(c),
    modKey: (e) => { if (e.key.toLowerCase() === 'f') { find(); return true; } return false; },
    goHeading: (i) => { const target = d.mode === 'page' ? [...pages.querySelectorAll('h1,h2,h3,p[class*="Heading"],p[class*="Title"]')].find((x) => x.textContent.trim() === d.heads[i]?.text) : paper.querySelectorAll('h1,h2,h3')[i]; target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    text: () => paper.innerText || paper.textContent || '', html: () => paper.innerHTML, blocks: () => blocksFromHtml(`<body>${paper.innerHTML}</body>`),
    selWords: () => { const s = String(getSelection()); return s && paper.contains(getSelection().anchorNode) ? (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length : 0; }, blockName: () => (d.mode === 'edit' ? blockName() : ''),
    toggleOriginal: () => { showOrig = !showOrig; paper.innerHTML = showOrig ? d.origHtml : d.html; paper.contentEditable = showOrig ? 'false' : String(d.mode === 'edit'); return showOrig; },
    discardDraft: () => { paper.innerHTML = d.origHtml; d.html = d.origHtml; d.draft = null; showOrig = false; ctx.setDirty(d, false); ctx.saveDraft(d); pagesDone = false; heads(); if (d.mode === 'page') renderPages(); },
    setDraft: (t) => { paper.innerHTML = t; changed(); },
    onResize: layout, destroy: () => { ro.disconnect(); clearTimeout(rt); },
  };
}
