// Case Converter: pick a style, the output updates as you type. Keeps punctuation, line breaks, acronyms (NASA) and
// mixed-case words (iPhone); code styles work per line and split camelCase boundaries (userId → user_id).
import { CASES } from './transform.js';
import {
  $, $$, esc, icon, enhance, toast, openMenu, copyText, settings, keeper, pane, inputActions, outputActions, editor, textOf, setText,
  emptyHint, pickFile, readFileText, readClipboard, download, moreOptions, mobileBar, debounce, fmtN,
} from './ui.js';

let api = {};
const ORDER = ['upper', 'lower', 'title', 'sentence', 'camel', 'pascal', 'snake', 'kebab'];
export const config = {
  commands: ORDER.map((k) => ({ id: 'case-' + k, label: `Convert to ${CASES[k].label}`, icon: 'case-sensitive', searchOnly: k !== 'title' && k !== 'upper', run: () => api.pick?.(k) })),
};
const SAMPLE = 'the quick brown fox jumps over the lazy dog. NASA and the iPhone both turned 2026 in this sentence!\nuser account id\nXMLHttpRequest response body';

export async function mount(root, { params }) {
  const S = settings('case', { style: 'title' });
  root.innerHTML = `
    <div class="tx-choices tx-choices--mono" role="radiogroup" aria-label="Case style" id="c-styles" data-roving="button">${ORDER.map((k) => `<button class="fw-chip" type="button" role="radio" data-style="${k}" aria-checked="${S.style === k}">${esc(CASES[k].label)}</button>`).join('')}</div>
    <div class="tx-grid2">
      ${pane({ id: 'c-in', title: 'Input', foot: false, actions: inputActions('c-in') })}
      ${pane({ id: 'c-out', title: 'Output', foot: false, actions: outputActions('c-out') })}
    </div>`;
  enhance(root);
  const inP = $('#c-in'), outP = $('#c-out');
  const I = editor(inP, { kind: 'text', prose: true, numbers: false, wrap: true, onChange: () => { sync(); keep.save(); schedule(); } });
  const O = editor(outP, { kind: 'text', prose: true, numbers: false, wrap: true, readOnly: true });
  const keep = keeper('case', { get: () => textOf(I), set: (t) => setText(I, t) });
  const sync = emptyHint(inP, I, { title: 'Paste or type the text to convert', onPaste: async () => { const t = await readClipboard(); if (t != null) setText(I, t); I.focus(); }, onOpen: () => openFile(), samples: [{ label: 'Mixed text', run: () => setText(I, SAMPLE) }] });

  function convert() {
    const t = textOf(I); const out = t ? CASES[S.style].fn(t) : '';
    O.dispatch({ changes: { from: 0, to: O.state.doc.length, insert: out } });
    outP.querySelector('[data-meta]').textContent = t ? CASES[S.style].label : '';
    bar();
  }
  const schedule = debounce(convert, 60);
  function pick(k) { S.style = k; S.save(); $$('[data-style]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === k))); convert(); }
  $('#c-styles').addEventListener('click', (e) => { const b = e.target.closest('[data-style]'); if (b) pick(b.dataset.style); });

  const outText = () => textOf(O);
  const copy = (btn) => { if (!outText()) { toast('Nothing to copy yet.', { type: 'info' }); return; } copyText(outText(), btn, { toastLabel: CASES[S.style].label }); };
  const save = () => { const t = outText() || textOf(I); if (t) download(t, 'converted-text.txt'); };
  async function openFile() { const f = await pickFile('text/*,.txt,.md,.csv,.log'); if (f) { const t = await readFileText(f); if (t != null) setText(I, t); } }
  $('#c-in-open').onclick = openFile;
  $('#c-in-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setText(I, t); I.focus(); };
  $('#c-in-clear').onclick = () => { const old = textOf(I); if (!old) return; setText(I, ''); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(I, old) } }); I.focus(); };
  $('#c-out-copy').onclick = (e) => copy(e.currentTarget);
  $('#c-out-dl').onclick = save;
  $('#c-out-more').onclick = (e) => openMenu(e.currentTarget, [
    { group: '', items: [{ label: 'Use output as input', icon: 'arrow-left-right', onSelect: () => { if (outText()) setText(I, outText()); } }, { label: 'Download .txt', icon: 'download', kbd: 'mod+s', onSelect: save }] },
    { group: 'Privacy', items: [keep.menuItem()] },
  ], { placement: 'bottom-end' });
  root.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  function bar() {
    const b = mobileBar(root, { line: textOf(I) ? esc(CASES[S.style].label) : '<span class="fw-faint">Type or paste text</span>', actions: `<button class="fw-btn fw-btn--primary" type="button" id="m-copy" ${textOf(I) ? '' : 'disabled'}>${icon('copy')}Copy</button>` });
    b.querySelector('#m-copy').onclick = (e) => copy(e.currentTarget);
  }
  api = { pick };
  if (!keep.restore()) { if (params.get('sample')) setText(I, SAMPLE); }
  if (params.get('q')) setText(I, params.get('q'));
  if (params.get('style') && CASES[params.get('style')]) pick(params.get('style'));
  convert();
  if (!matchMedia('(pointer: coarse)').matches) I.focus();
  return { I, O, onFiles: async (f) => { const t = await readFileText(f[0]); if (t != null) setText(I, t); }, onPasteText: (t) => { setText(I, t); I.focus(); return true; } };
}
