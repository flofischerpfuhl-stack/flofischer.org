// Convert mockup · Document Converter (today's "Documents" tab): Markdown, HTML, text, DOCX, ODT, RTF, EPUB in →
// PDF, DOCX, ODT, RTF, EPUB, HTML, Markdown, TXT out. Files or pasted text (today: "From" switched between a text box and
// a drop zone; here both are always there). Converts on drop; Preview on every card. More options: "Read files as".
import { frame, renderRelated, pickFormat, targetBtn, moreBtn, clearBtn, moreOptions, field, select, seg, Queue, HumanError, describeBroken,
  stickyBar, stickyHtml, intakeHtml, slimIntakeHtml, base, plural, icon, esc, h, $, store, toast, enhance, formatBytes, openDialog, A } from './common.js';
import { readDocx, readOdt, readEpub, blocksFromHtml, blocksFromMarkdown, blocksFromText, blocksFromRtf, toHtml, toMarkdown, toText, toRtf, writeDocx, writeOdt, writeEpub, writePdf } from './officeio.js';

const FORMATS = [
  { label: 'Documents', items: [['pdf', 'PDF', 'Looks the same everywhere'], ['docx', 'DOCX', 'Word, editable'], ['odt', 'ODT', 'LibreOffice Writer'], ['rtf', 'RTF', 'Any word processor'], ['epub', 'EPUB', 'E-book readers']] },
  { label: 'Plain', items: [['html', 'HTML', 'Web page'], ['md', 'Markdown', 'Headings, lists, tables'], ['txt', 'TXT', 'Just the words']] },
];
const NAME = Object.fromEntries(FORMATS.flatMap((g) => g.items.map(([id, n]) => [id, n])));
const FROM = [['auto', 'Auto-detect (from the file name)'], ['md', 'Markdown'], ['html', 'HTML'], ['txt', 'Plain text'], ['docx', 'Word (.docx)'], ['odt', 'OpenDocument (.odt)'], ['rtf', 'Rich Text (.rtf)'], ['epub', 'EPUB']];
const FROM_NAME = { md: 'Markdown', markdown: 'Markdown', html: 'HTML', htm: 'HTML', txt: 'Text', docx: 'DOCX', odt: 'ODT', rtf: 'RTF', epub: 'EPUB' };
const ACCEPT = '.md,.markdown,.html,.htm,.txt,.docx,.odt,.rtf,.epub';

export function init(ctx) {
  let target = ctx.preset?.to || store.get('cv-target-documents') || 'pdf';
  const o = { readAs: 'auto' };
  const textPreset = ctx.preset?.text;

  $('#cv-tool').innerHTML = `
    <div class="cv-bar"><span class="cv-bar__label"><span class="xs-hide">Convert to</span><span class="xs-show">To</span></span>${targetBtn('cv-target', NAME[target])}
      ${moreBtn()}<span class="fw-spacer"></span>${clearBtn()}</div>
    <div class="cv-opts" id="cv-opts" hidden></div>
    <div id="cv-intake">${intakeHtml({ icon: 'file-text', title: ctx.preset ? `Drop ${ctx.preset.noun} here` : 'Drop documents here', touch: ctx.preset ? `Choose ${ctx.preset.noun}` : 'Choose documents',
      sub: ctx.preset ? 'Any document works' : 'Word, ODT, RTF, EPUB, Markdown, HTML, text', accept: ACCEPT,
      extraBtn: `<button class="fw-btn" type="button" id="cv-paste-btn" data-no-pick>${icon('clipboard-paste')}Paste ${textPreset ? FROM_NAME[textPreset] : 'text'}</button>`,
      samples: textPreset ? `${A}release-notes.md` : `${A}project-brief.docx|${A}release-notes.md` })}</div>
    <div class="fw-items cv-items" id="cv-items" aria-label="Documents" hidden></div>
    <div id="cv-add" hidden>${slimIntakeHtml('Add more documents', ACCEPT)}</div>`;
  $('#main').insertAdjacentHTML('beforeend', stickyHtml());
  frame(ctx, { accept: ['doc', 'text'], onFiles: (f) => add(f), onPasteText: (t) => { addPaste(t); return true; },
    lede: ctx.preset ? `Convert ${ctx.preset.noun} to ${NAME[ctx.preset.to]}. Any document works.` : undefined,
    commands: [{ id: 'paste', label: 'Paste text to convert', icon: 'clipboard-paste', run: () => addPaste('') }, { id: 'dl', label: 'Download all converted documents', icon: 'download', kbd: 'mod+s', run: () => $('#ab-primary').click() }] });
  enhance($('#cv-tool'));
  renderRelated(ctx);
  $('#cv-paste-btn').addEventListener('click', (e) => { e.stopPropagation(); addPaste(''); });

  const srcOf = (it) => (it.pasted ? it.textFrom : o.readAs !== 'auto' ? o.readAs : { markdown: 'md', htm: 'html' }[it.ext] || it.ext);
  const q = new Queue({
    list: $('#cv-items'), parallel: 2, deltas: false,
    thumb: (it) => icon(it.status === 'error' ? 'file-question' : it.pasted ? 'clipboard-paste' : 'file-text', { size: 20 }),
    meta: (it) => {
      const parts = [`<span>${it.pasted ? `${it.text.length.toLocaleString('en-US')} characters` : formatBytes(it.size)}</span>`];
      if (it.status !== 'error') parts.push(`<span>${esc(FROM_NAME[srcOf(it)] || srcOf(it).toUpperCase())} → ${esc(NAME[target])}</span>`);
      return parts.join('<span aria-hidden="true">·</span>');
    },
    extraActions: (it) => (it.status === 'done' ? [`<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="preview" aria-label="Preview ${esc(it.out.name)}" data-tip="Preview">${icon('eye')}</button>`] : []),
    onAction: (it, a) => a === 'preview' && preview(it),
    panel: (it, el) => {
      if (!it.pasted) return false;
      if (!el.querySelector('.cv-paste')) {
        el.innerHTML = `<div class="cv-paste"><div class="cv-paste__top">${seg(`pf-${it.id}`, 'Pasted text is', [['md', 'Markdown'], ['html', 'HTML'], ['txt', 'Plain text']], it.textFrom)}</div>
          <textarea class="fw-textarea" aria-label="Text to convert" spellcheck="false" placeholder="Paste or type Markdown, HTML or plain text">${esc(it.text)}</textarea></div>`;
        enhance(el);
        const ta = el.querySelector('textarea'); let t = 0;
        ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { it.text = ta.value; if (!it.fromPicked) { it.textFrom = guess(ta.value); el.querySelectorAll('.fw-seg__opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === it.textFrom))); } it.size = new Blob([it.text]).size; q.requeue(it); }, 300); });
        el.querySelector('.fw-seg').addEventListener('fw-change', (e) => { it.textFrom = e.detail.value; it.fromPicked = true; q.requeue(it); });
        if (!it.text) requestAnimationFrame(() => ta.focus());
      }
      return true;
    },
    work: async (it, { progress, alive }) => {
      if (it.pasted && !it.text.trim()) throw { idle: true };
      progress(15, '');
      const blocks = await read(it);
      if (!alive()) return null;
      progress(60, '');
      await new Promise((r) => setTimeout(r, 350 + Math.min(900, it.size / 60)));
      it.blocks = blocks;
      const title = blocks.find((b) => b.t === 'h')?.text || base(it.name);
      const blob = await write(blocks, title);
      return { blob, name: `${base(it.name)}.${target}`, note: target === 'pdf' ? 'Text stays selectable.' : '' };
    },
    onChange: () => paint(),
  });
  const paintBar = stickyBar(q, { noun: ['document', 'documents'], zipStem: (done) => (done.length > 1 ? 'converted-documents' : base(done[0].name)) });
  const guess = (t) => (/^\s*</.test(t) ? 'html' : /(^|\n)(#{1,6} |[-*] |\d+\. |```|\|.*\|)/.test(t) || /\*\*|\[.+\]\(.+\)/.test(t) ? 'md' : 'txt');

  async function read(it) {
    const s = srcOf(it);
    try {
      if (it.pasted) return s === 'html' ? blocksFromHtml(it.text) : s === 'md' ? blocksFromMarkdown(it.text) : blocksFromText(it.text);
      if (s === 'docx') return await readDocx(it.file);
      if (s === 'odt') return await readOdt(it.file);
      if (s === 'epub') return await readEpub(it.file);
      const text = await it.file.text();
      if (s === 'md') return blocksFromMarkdown(text);
      if (s === 'html') return blocksFromHtml(text);
      if (s === 'rtf') { if (!/^\{\\rtf/.test(text)) throw new Error('missing RTF header'); return blocksFromRtf(text); }
      if (s === 'txt') return blocksFromText(text);
      throw new HumanError(`Can't read .${it.ext} as a document. Pick the format under More options → Read files as.`);
    } catch (e) {
      if (e.human) throw e;
      throw new HumanError(await describeBroken(it.file, `a ${FROM_NAME[s] || s.toUpperCase()} document`), { detail: String(e.message || e) });
    }
  }
  async function write(blocks, title) {
    switch (target) {
      case 'pdf': return writePdf(blocks);
      case 'docx': return writeDocx(blocks);
      case 'odt': return writeOdt(blocks);
      case 'epub': return writeEpub(blocks, title);
      case 'rtf': return new Blob([toRtf(blocks)], { type: 'application/rtf' });
      case 'html': return new Blob([toHtml(blocks, title)], { type: 'text/html' });
      case 'md': return new Blob([toMarkdown(blocks)], { type: 'text/markdown' });
      default: return new Blob([toText(blocks)], { type: 'text/plain' });
    }
  }
  function preview(it) {
    let body;
    if (target === 'md' || target === 'txt') body = h(`<div class="cv-preview"><pre class="cv-plain"></pre></div>`), it.out.blob.text().then((t) => (body.querySelector('pre').textContent = t));
    else body = h(`<div class="cv-preview"><article class="cv-paper">${toHtml(it.blocks).replace(/^[\s\S]*<body>\n?|<\/body>[\s\S]*$/g, '')}</article></div>`);
    openDialog({ title: `Preview · ${it.out.name}`, body, size: 820, actions: [{ label: 'Close', ghost: true }, { label: 'Download', primary: true, onClick: () => it.el.querySelector('[data-act="dl"]')?.click() }] });
  }

  function add(files) {
    const ok = files.filter((f) => new RegExp(`\\.(${ACCEPT.replace(/\./g, '').split(',').join('|')})$`, 'i').test(f.name));
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
    if (pdfs.length) toast(`PDFs are edited in PDF Tools`, { type: 'neutral' });
    else if (ok.length < files.length) toast(`${plural(files.length - ok.length, 'file', 'files')} skipped: not a document`, { type: 'warning' });
    if (!ok.length) return;
    q.add(ok); show();
  }
  function addPaste(text) {
    const n = q.items.filter((x) => x.pasted).length + 1;
    const file = new File([text], `Pasted text${n > 1 ? ' ' + n : ''}`, { type: 'text/plain' });
    const [it] = q.add([file], { pasted: true, text, textFrom: textPreset || (text ? guess(text) : 'md'), status: text ? 'queued' : 'ready' });
    if (it) { it.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    show();
  }
  const show = () => { $('#cv-intake').hidden = true; $('#cv-items').hidden = false; $('#cv-add').hidden = false; };
  $('#cv-target').onclick = (e) => pickFormat(e.currentTarget, { groups: FORMATS, current: target, onPick: (f) => { if (f === target) return; target = f; store.set('cv-target-documents', f); $('#cv-target [data-l]').textContent = NAME[f]; q.items.forEach((it) => (it.status !== 'error' || it.retryable) && q.requeue(it)); } });
  $('#cv-clear').onclick = () => q.clear();
  const more = moreOptions({
    button: $('.cv-more'), panel: $('#cv-opts'),
    summary: () => (o.readAs !== 'auto' ? `read as ${FROM.find((x) => x[0] === o.readAs)[1]}` : ''),
    render: (p) => {
      p.innerHTML = `<div class="cv-opts__grid"><div class="cv-opts__group">${field('Read files as', select('o-read', FROM, o.readAs), { id: 'o-read', hint: 'Only needed when a file has the wrong extension.' })}</div></div>`;
      p.querySelector('#o-read').onchange = (e) => { o.readAs = e.target.value; more.paint(); q.items.forEach((it) => !it.pasted && q.requeue(it)); };
    },
  });
  function paint() {
    const n = q.items.length; $('#cv-clear').hidden = !n;
    if (!n) { $('#cv-intake').hidden = false; $('#cv-items').hidden = true; $('#cv-add').hidden = true; }
    paintBar();
  }
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('#cv-ab').hidden) { e.preventDefault(); $('#ab-primary').click(); } });
  paint();
}
