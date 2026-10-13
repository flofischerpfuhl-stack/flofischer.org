// Text Cleanup: pick one action, see the cleaned text live with a count of what changed. "Fix PDF/Word paste" is the
// round-1 recipe (page headers, hyphenation, hard wraps, invisible characters, ligatures); the other actions are
// today's: Find & replace, Sort lines, Remove duplicate lines, Clean whitespace, Add line numbers.
import { STEPS, runRecipe, PRESETS } from './transform.js';
const SHORT = { headers: ['header', 'headers'], hyphen: ['hyphen', 'hyphens'], join: ['line break', 'line breaks'], invisible: ['invisible', 'invisibles'], ligatures: ['ligature', 'ligatures'], quotes: ['quote', 'quotes'] };
const summaryLine = (results) => results.filter((r) => r.count).map((r) => `${STEPS[r.id].sign}${r.count} ${SHORT[r.id][r.count === 1 ? 0 : 1]}`);
import {
  $, $$, esc, icon, enhance, toast, openMenu, copyText, settings, keeper, pane, inputActions, outputActions, editor, textOf, setText,
  emptyHint, pickFile, readFileText, readClipboard, download, fetchSample, moreOptions, moreBtn, mobileBar, debounce, fmtN,
} from './ui.js';
import { hrefFor as kitHref } from '../kit/shell.js';

let api = {};
const ACTIONS = [['pdf', 'Fix PDF/Word paste'], ['replace', 'Find & replace'], ['sort', 'Sort lines'], ['dedupe', 'Remove duplicate lines'], ['whitespace', 'Clean whitespace'], ['number', 'Add line numbers']];
export const config = {
  commands: ACTIONS.map(([k, l]) => ({ id: 'clean-' + k, label: l, icon: 'eraser', run: () => api.pick?.(k) })),
};
const PDF_STEPS = PRESETS.find((p) => p.id === 'pdf').steps.map(([id]) => id);

// today's line tools (text-tools-core.js), unchanged behaviour
function findAndReplace(text, search, rep, { useRegex, caseSensitive, replaceAll }) {
  if (!search) return { text, count: 0 };
  const re = new RegExp(useRegex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), `${replaceAll ? 'g' : ''}${caseSensitive ? '' : 'i'}u`);
  const all = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || [];
  const out = useRegex ? text.replace(re, rep) : text.replace(re, () => rep);
  return { text: out, count: replaceAll ? all.length : Math.min(1, all.length) };
}
function sortLines(text, { descending, natural, caseSensitive }) {
  const col = new Intl.Collator(undefined, { numeric: natural, sensitivity: caseSensitive ? 'variant' : 'base' });
  const ls = text.replace(/\r\n?/g, '\n').split('\n'); const before = ls.slice();
  ls.sort((a, b) => col.compare(a, b) * (descending ? -1 : 1));
  return { text: ls.join('\n'), count: ls.filter((l, i) => l !== before[i]).length, lines: ls.length };
}
function dedupe(text, { caseSensitive, trim, removeEmpty }) {
  const seen = new Set(); let n = 0;
  const out = text.replace(/\r\n?/g, '\n').split('\n').filter((line) => {
    const c = trim ? line.trim() : line;
    if (removeEmpty && !c) { n++; return false; }
    const k = caseSensitive ? c : c.toLocaleLowerCase();
    if (seen.has(k)) { n++; return false; } seen.add(k); return true;
  }).map((l) => (trim ? l.trim() : l));
  return { text: out.join('\n'), count: n };
}
function whitespace(text, { trimLines, collapseSpaces, removeEmpty, collapseBlank }) {
  let changed = 0;
  let ls = text.replace(/\r\n?/g, '\n').split('\n').map((l) => { let c = l; if (collapseSpaces) c = c.replace(/[\t ]+/g, ' '); if (trimLines) c = c.trim(); if (c !== l) changed++; return c; });
  const n0 = ls.length;
  if (removeEmpty) ls = ls.filter(Boolean);
  let out = ls.join('\n');
  if (collapseBlank && !removeEmpty) out = out.replace(/\n{3,}/g, '\n\n');
  return { text: out, count: changed, removed: n0 - out.split('\n').length };
}
function numberLines(text, { start, separator }) {
  const ls = text.replace(/\r\n?/g, '\n').split('\n'); const first = Number.isFinite(+start) ? +start : 1;
  const w = String(first + Math.max(0, ls.length - 1)).length;
  return { text: ls.map((l, i) => `${String(first + i).padStart(w, '0')}${separator}${l}`).join('\n'), count: ls.length };
}

export async function mount(root, { params }) {
  const S = settings('cleanup', { action: 'pdf', pdf: { headers: true, hyphen: true, join: true, invisible: true, ligatures: true, quotes: false },
    find: '', rep: '', matchCase: false, regex: false, all: true, desc: false, natural: true, caseSensitive: false, trim: true, removeEmpty: false, collapse: true, collapseBlank: false, start: 1, sep: '. ' });
  root.innerHTML = `
    <div class="tx-choices" role="radiogroup" aria-label="Action" id="cl-acts" data-roving="button">${ACTIONS.map(([k, l]) => `<button class="fw-chip" type="button" role="radio" data-act="${k}" aria-checked="${S.action === k}">${esc(l)}</button>`).join('')}</div>
    <div class="tx-bar"><div class="tx-actopts" id="cl-opts"></div><span class="fw-spacer"></span><span id="cl-morewrap">${moreBtn()}</span></div>
    <div class="tx-grid2">
      ${pane({ id: 'cl-in', title: 'Input', actions: inputActions('cl-in') })}
      ${pane({ id: 'cl-out', title: 'Output', actions: outputActions('cl-out') })}
    </div>`;
  enhance(root);
  const inP = $('#cl-in'), outP = $('#cl-out'); const outMeta = outP.querySelector('[data-meta]');
  const I = editor(inP, { kind: 'text', wrap: true, onChange: () => { sync(); keep.save(); schedule(); } });
  const O = editor(outP, { kind: 'text', wrap: true, readOnly: true });
  const keep = keeper('cleanup', { get: () => textOf(I), set: (t) => setText(I, t) });
  const sync = emptyHint(inP, I, { title: 'Paste text or a list to clean up', onPaste: async () => { const t = await readClipboard(); if (t != null) setText(I, t); I.focus(); }, onOpen: () => openFile(),
    samples: [{ label: 'Text copied from a PDF', run: async () => { pick('pdf'); setText(I, await fetchSample('samples/bericht-pdf-paste.txt')); } }, { label: 'List with duplicates', run: () => { pick('dedupe'); setText(I, 'Kassel\nBaunatal\nkassel\nFuldabrück\n\nBaunatal\nLohfelden\nKassel '); } }] });

  let err = '', last = { count: 0 };
  function run() {
    const t = textOf(I); err = '';
    if (!t) { O.dispatch({ changes: { from: 0, to: O.state.doc.length, insert: '' } }); outMeta.textContent = ''; bar(); return; }
    let r;
    try {
      switch (S.action) {
        case 'pdf': { const rr = runRecipe(t, PDF_STEPS.map((id) => ({ id, on: !!S.pdf[id] }))); r = { text: rr.text, summary: summaryLine(rr.results) }; break; }
        case 'replace': { const x = findAndReplace(t, S.find, S.rep, { useRegex: S.regex, caseSensitive: S.matchCase, replaceAll: S.all }); r = { text: x.text, summary: [S.find ? `${fmtN(x.count)} ${x.count === 1 ? 'replacement' : 'replacements'}` : 'Type what to find'] }; break; }
        case 'sort': { const x = sortLines(t, { descending: S.desc, natural: S.natural, caseSensitive: S.caseSensitive }); r = { text: x.text, summary: [`${fmtN(x.lines)} lines sorted ${S.desc ? 'Z → A' : 'A → Z'}`] }; break; }
        case 'dedupe': { const x = dedupe(t, { caseSensitive: S.caseSensitive, trim: S.trim, removeEmpty: S.removeEmpty }); r = { text: x.text, summary: [x.count ? `−${fmtN(x.count)} ${x.count === 1 ? 'line' : 'lines'}` : 'No duplicates'] }; break; }
        case 'whitespace': { const x = whitespace(t, { trimLines: S.trim, collapseSpaces: S.collapse, removeEmpty: S.removeEmpty, collapseBlank: S.collapseBlank }); r = { text: x.text, summary: [`${fmtN(x.count)} ${x.count === 1 ? 'line' : 'lines'} cleaned`, ...(x.removed ? [`−${fmtN(x.removed)} empty`] : [])] }; break; }
        case 'number': { const x = numberLines(t, { start: S.start, separator: S.sep }); r = { text: x.text, summary: [`${fmtN(x.count)} lines numbered`] }; break; }
      }
    } catch (e) { err = e.message.replace(/^Invalid regular expression: /, ''); r = { text: t, summary: [] }; }
    last = r;
    O.dispatch({ changes: { from: 0, to: O.state.doc.length, insert: r.text } });
    outMeta.className = 'tx-pane__meta tx-changes';
    outMeta.title = r.summary.join(' · ');
    outMeta.innerHTML = err ? `<span style="color:var(--danger)">${icon('circle-alert', { size: 14 })} ${esc(err)}</span>` : r.summary.length ? r.summary.map((x) => `<b>${esc(x)}</b>`).join(' · ') : (r.text === t ? 'No changes' : '');
    bar();
  }
  const schedule = debounce(run, 100);

  // ── options per action (only what that action needs) ──
  const chk = (k, label, extra = '') => `<label class="fw-check"><input type="checkbox" data-k="${k}" ${S[k] ? 'checked' : ''} ${extra}><span>${esc(label)}</span></label>`;
  function opts() {
    const a = S.action; let html = '', more = '';
    if (a === 'pdf') { html = `<span class="tx-actopts__desc">Removes page headers, rejoins hyphenated words and broken lines, fixes invisible characters.</span>`;
      more = `<div class="fw-field"><span class="fw-field__label">Steps</span>${PDF_STEPS.map((id) => `<label class="fw-toggle"><input type="checkbox" data-step="${id}" ${S.pdf[id] ? 'checked' : ''}><span>${esc(STEPS[id].label)}</span></label>`).join('')}</div>`; }
    if (a === 'replace') html = `<input class="fw-input tx-find" id="cl-find" placeholder="Find" aria-label="Find" value="${esc(S.find)}" spellcheck="false"><input class="fw-input tx-find" id="cl-rep" placeholder="Replace with" aria-label="Replace with" value="${esc(S.rep)}" spellcheck="false">${chk('matchCase', 'Match case')}${chk('regex', 'Regular expression')}${chk('all', 'Replace all')}`;
    if (a === 'sort') { html = `<div class="fw-seg fw-seg--sm" aria-label="Order" id="cl-order"><button class="fw-seg__opt" type="button" data-value="asc" aria-checked="${!S.desc}">A → Z</button><button class="fw-seg__opt" type="button" data-value="desc" aria-checked="${S.desc}">Z → A</button></div>${chk('natural', 'Natural numbers (2 before 10)')}`; more = `${toggle('caseSensitive', 'Case sensitive', 'Upper and lower case sort apart')}`; }
    if (a === 'dedupe') { html = `<span class="tx-actopts__desc">Keeps the first of each line.</span>${chk('trim', 'Trim lines')}`; more = `${toggle('caseSensitive', 'Case sensitive', '“Kassel” and “kassel” count as different')}${toggle('removeEmpty', 'Remove empty lines')}`; }
    if (a === 'whitespace') { html = `${chk('trim', 'Trim lines')}${chk('collapse', 'Collapse spaces')}${chk('removeEmpty', 'Remove empty lines')}`; more = `${toggle('collapseBlank', 'Collapse blank lines', 'Keeps one empty line between paragraphs')}`; }
    if (a === 'number') html = `<label class="tx-inlinefield">Start at<input class="fw-input tx-num" type="number" id="cl-start" value="${esc(S.start)}"></label><label class="tx-inlinefield">Separator<input class="fw-input tx-num fw-input--mono" id="cl-sep" value="${esc(S.sep)}"></label>`;
    $('#cl-opts').innerHTML = html; enhance($('#cl-opts'));
    moreHtml = more;
    $$('#cl-opts [data-k]').forEach((c) => (c.onchange = () => { S[c.dataset.k] = c.checked; S.save(); run(); }));
    $('#cl-order')?.addEventListener('fw-change', (e) => { S.desc = e.detail.value === 'desc'; S.save(); run(); });
    const inp = (id, k, num) => { const el = $(id); if (el) el.oninput = () => { S[k] = num ? +el.value : el.value; S.save(); schedule(); }; };
    inp('#cl-find', 'find'); inp('#cl-rep', 'rep'); inp('#cl-start', 'start', true); inp('#cl-sep', 'sep');
  }
  const toggle = (k, label, sub = '') => `<label class="fw-toggle"><input type="checkbox" data-k="${k}" ${S[k] ? 'checked' : ''}><span>${esc(label)}${sub ? `<span class="tx-opt-sub">${esc(sub)}</span>` : ''}</span></label>`;
  let moreHtml = '';
  $('#more-opts').onclick = (e) => moreOptions(e.currentTarget, {
    html: `${moreHtml}${moreHtml ? '<hr>' : ''}${keep.toggleHtml()}`,
    wire: (el) => {
      $$('[data-step]', el).forEach((c) => (c.onchange = () => { S.pdf = { ...S.pdf, [c.dataset.step]: c.checked }; S.save(); run(); }));
      $$('[data-k]', el).forEach((c) => (c.onchange = () => { S[c.dataset.k] = c.checked; S.save(); run(); }));
      keep.wire(el);
    },
  });
  function pick(k) { S.action = k; S.save(); $$('[data-act]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.act === k))); opts(); run(); if (k === 'replace') $('#cl-find')?.focus(); }
  $('#cl-acts').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) pick(b.dataset.act); });

  // ── actions ──
  const outText = () => textOf(O);
  const copy = (btn) => { if (!outText()) { toast('Nothing to copy yet.', { type: 'info' }); return; } copyText(outText(), btn, { toastLabel: 'cleaned text' }); };
  const save = () => { const t = outText() || textOf(I); if (t) download(t, 'cleaned-text.txt'); };
  async function openFile() { const f = await pickFile('text/*,.txt,.md,.csv,.log,.json'); if (f) { const t = await readFileText(f); if (t != null) setText(I, t); } }
  $('#cl-in-open').onclick = openFile;
  $('#cl-in-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setText(I, t); I.focus(); };
  $('#cl-in-clear').onclick = () => { const old = textOf(I); if (!old) return; setText(I, ''); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(I, old) } }); I.focus(); };
  $('#cl-out-copy').onclick = (e) => copy(e.currentTarget);
  $('#cl-out-dl').onclick = save;
  function useAsInput() { const t = outText(); if (!t) return; const old = textOf(I); setText(I, t); toast('Output is now the input', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(I, old) } }); }
  function compareBA() {
    try { sessionStorage.setItem('fw:text:diff-handoff', JSON.stringify({ a: textOf(I), b: outText(), nameA: 'Before cleanup', nameB: 'After cleanup' })); } catch { /* */ }
    location.href = kitHref('text-diff');
  }
  $('#cl-out-more').onclick = (e) => openMenu(e.currentTarget, [
    { label: 'Use output as input', icon: 'arrow-left-right', sub: 'Run another action on it', onSelect: useAsInput },
    { label: 'Compare before / after', icon: 'git-compare', sub: 'Opens Text Diff', onSelect: compareBA },
    { label: 'Download .txt', icon: 'download', kbd: 'mod+s', onSelect: save },
  ], { placement: 'bottom-end' });
  root.addEventListener('keydown', (e) => { if (!(e.metaKey || e.ctrlKey)) return; if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); } if (e.key === 'Enter') { e.preventDefault(); run(); } });
  function bar() {
    const has = !!textOf(I);
    const b = mobileBar(root, { line: has ? outMeta.innerHTML : '<span class="fw-faint">Paste text to clean up</span>', actions: `<button class="fw-btn fw-btn--primary" type="button" id="m-copy" ${has ? '' : 'disabled'}>${icon('copy')}Copy</button>` });
    b.querySelector('#m-copy').onclick = (e) => copy(e.currentTarget);
  }
  api = { pick };
  opts();
  if (params.get('action') && ACTIONS.some(([k]) => k === params.get('action'))) pick(params.get('action'));
  if (!keep.restore() && params.get('sample')) await $$('.tx-empty [data-s]')[params.get('sample') === 'list' ? 1 : 0]?.click();
  if (params.get('q')) setText(I, params.get('q'));
  run();
  if (!matchMedia('(pointer: coarse)').matches) I.focus();
  return { I, O, onFiles: async (f) => { const t = await readFileText(f[0]); if (t != null) setText(I, t); }, onPasteText: (t) => { setText(I, t); I.focus(); return true; } };
}
