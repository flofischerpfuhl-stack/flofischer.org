// Word Count: type or paste → live counts (grapheme-correct, DE/EN sentence rules). Select text to count only the
// selection. Optional limit (Meta 155, Post 280, SMS 160, Title 60, custom) and more stats on demand.
import { analyze, fmtTime } from './stats.js';
import { runRecipe, PRESETS } from './transform.js';
import {
  E, $, $$, esc, icon, enhance, toast, openMenu, copyText, settings, keeper, pane, iconBtn, inputActions, editor, textOf, setText,
  emptyHint, pickFile, readFileText, readClipboard, download, fetchSample, mobileBar, debounce, fmtN,
} from './ui.js';

let api = {};
export const config = {
  commands: [
    { id: 'wc-copy', label: 'Copy text', icon: 'copy', run: () => api.copy?.() },
    { id: 'wc-limit', label: 'Set a character limit', icon: 'ruler', run: () => api.limit?.() },
  ],
};
const LIMITS = [
  { id: 'none', label: 'No limit' }, { id: 'meta', label: 'Meta description · 155 characters', max: 155, unit: 'chars' },
  { id: 'post', label: 'Post on X · 280 characters', max: 280, unit: 'chars' }, { id: 'sms', label: 'SMS · 160 characters', max: 160, unit: 'chars' },
  { id: 'title', label: 'Page title · 60 characters', max: 60, unit: 'chars' }, { id: 'custom', label: 'Custom…' },
];

export async function mount(root, { params }) {
  const S = settings('count', { limit: 'none', customMax: 500, customUnit: 'words', long: false });
  root.innerHTML = `
    <div class="tx-strip" id="wc-strip" aria-hidden="true"></div>
    <div class="tx-count">
      ${pane({ id: 'wc-in', title: 'Text', foot: false, actions: inputActions('wc-in') + iconBtn('wc-more', 'ellipsis', 'More') })}
      <aside class="tx-stats" aria-label="Counts" aria-live="polite">
        <span class="tx-stats__scope" id="wc-scope" hidden>${icon('text-cursor', { size: 13 })}Selection</span>
        <div class="tx-stats__grid" id="wc-grid"></div>
        <div class="tx-limit">
          <div class="tx-limit__row"><label class="fw-sr" for="wc-lim">Limit</label><select class="fw-select" id="wc-lim">${LIMITS.map((l) => `<option value="${l.id}">${esc(l.label)}</option>`).join('')}</select></div>
          <div class="tx-limit__row" id="wc-custom" hidden><input class="fw-input" type="number" min="1" id="wc-cmax" aria-label="Limit"><select class="fw-select" id="wc-cunit" aria-label="Unit"><option value="words">words</option><option value="chars">characters</option></select></div>
          <div class="tx-meter" id="wc-meter" hidden><div class="tx-meter__track"><div class="tx-meter__bar"></div></div><span class="tx-meter__txt"></span></div>
        </div>
        <details class="tx-morestats" id="wc-moredet"><summary>${icon('chevron-right', { size: 14 })}More stats</summary><dl class="tx-kv" id="wc-kv"></dl><div class="tx-top" id="wc-top"></div></details>
      </aside>
    </div>`;
  enhance(root);
  const P = $('#wc-in');
  const T = editor(P, { kind: 'text', prose: true, numbers: false, wrap: true, onChange: () => { sync(); keep.save(); schedule(); }, onCursor: () => scheduleSel() });
  const keep = keeper('count', { get: () => textOf(T), set: (t) => setText(T, t) });
  const sync = emptyHint(P, T, { title: 'Start typing or paste your text', onPaste: async () => { const t = await readClipboard(); if (t != null) setText(T, t); T.focus(); }, onOpen: () => openFile(),
    samples: [{ label: 'Project report', run: async () => setText(T, runRecipe(await fetchSample('samples/bericht-pdf-paste.txt'), PRESETS[0].steps.map(([id, on]) => ({ id, on }))).text) }] });
  $('#wc-lim').value = S.limit; $('#wc-cmax').value = S.customMax; $('#wc-cunit').value = S.customUnit;

  let st = null, scope = 'all';
  function compute() {
    const m = T.state.selection.main; const sel = !m.empty && m.to - m.from > 1;
    const text = sel ? T.state.sliceDoc(m.from, m.to) : textOf(T);
    scope = sel ? 'sel' : 'all';
    st = analyze(text);
    render();
    longMarks();
  }
  const schedule = debounce(compute, 120);
  let lastSel = false;
  const scheduleSel = debounce(() => { const m = T.state.selection.main; const sel = !m.empty && m.to - m.from > 1; if (sel || lastSel) compute(); lastSel = sel; }, 60);
  function render() {
    $('#wc-scope').hidden = scope !== 'sel';
    const tiles = [['Words', fmtN(st.words), true], ['Characters', fmtN(st.chars)], ['Characters (no spaces)', fmtN(st.noSpace)], ['Sentences', fmtN(st.sentences)], ['Paragraphs', fmtN(st.paragraphs)], ['Reading time', st.words ? fmtTime(st.readMin) : '0 min']];
    $('#wc-grid').innerHTML = tiles.map(([l, v, big]) => `<div class="tx-stat ${big ? 'tx-stat--big' : ''}"><span class="tx-stat__v">${v}</span><span class="tx-stat__l">${l}</span></div>`).join('');
    $('#wc-strip').innerHTML = `<span><b>${fmtN(st.words)}</b> words</span><span><b>${fmtN(st.chars)}</b> characters</span><span><b>${st.words ? fmtTime(st.readMin) : '0 min'}</b> read</span>`;
    $('#wc-kv').innerHTML = [['Speaking time', st.words ? fmtTime(st.speakMin) : '0 min'], ['Lines', fmtN(st.lines)], ['Size (UTF-8)', `${fmtN(st.bytes)} bytes`], ['Average sentence', st.sentences ? `${st.avgSentence.toFixed(1)} words` : '–'],
      ['Readability', st.words > 30 ? `${st.readLabel} (${st.readability})` : '–'], ['Long sentences', `${st.longSentences.length} <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="wc-long" aria-pressed="${S.long}" ${st.longSentences.length ? '' : 'hidden'}>${S.long ? 'Hide' : 'Highlight'}</button>`]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('#wc-long')?.addEventListener('click', () => { S.long = !S.long; S.save(); render(); longMarks(); });
    $('#wc-top').innerHTML = st.top.length ? st.top.map(([w, n]) => `<span>${esc(w)} · ${n}</span>`).join('') : '';
    meter();
    bar();
  }
  function limitDef() { if (S.limit === 'custom') return { max: +S.customMax || 0, unit: S.customUnit }; return LIMITS.find((l) => l.id === S.limit); }
  function meter() {
    const L = limitDef(); const m = $('#wc-meter'); $('#wc-custom').hidden = S.limit !== 'custom';
    if (!L?.max) { m.hidden = true; return; }
    const n = L.unit === 'words' ? st.words : st.chars; const left = L.max - n;
    m.hidden = false; m.classList.toggle('is-over', left < 0);
    m.querySelector('.tx-meter__bar').style.setProperty('--p', Math.min(100, (n / L.max) * 100) + '%');
    m.querySelector('.tx-meter__txt').textContent = `${fmtN(n)} / ${fmtN(L.max)} · ${left >= 0 ? `${fmtN(left)} left` : `${fmtN(-left)} over`}`;
  }
  function longMarks() {
    const specs = [];
    if (S.long && scope === 'all' && st) for (const s of st.longSentences) specs.push(E.mark(s.from, s.to, 'tb-long', { title: `${s.words} words` }));
    try { T.dispatch({ effects: E.layerEffect('long', specs) }); } catch { /* */ }
  }
  $('#wc-lim').onchange = (e) => { S.limit = e.target.value; S.save(); meter(); if (S.limit === 'custom') $('#wc-cmax').focus(); };
  $('#wc-cmax').oninput = (e) => { S.customMax = +e.target.value; S.save(); meter(); };
  $('#wc-cunit').onchange = (e) => { S.customUnit = e.target.value; S.save(); meter(); };

  async function openFile() { const f = await pickFile('text/*,.txt,.md,.json,.csv,.log,.html'); if (f) { const t = await readFileText(f); if (t != null) setText(T, t); } }
  $('#wc-in-open').onclick = openFile;
  $('#wc-in-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setText(T, t); T.focus(); };
  $('#wc-in-clear').onclick = () => { const old = textOf(T); if (!old) return; setText(T, ''); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(T, old) } }); T.focus(); };
  const copy = (btn) => copyText(textOf(T), btn, { toastLabel: 'text' });
  const save = () => { if (textOf(T)) download(textOf(T), 'text.txt'); };
  $('#wc-more').onclick = (e) => openMenu(e.currentTarget, [
    { group: '', items: [{ label: 'Copy text', icon: 'copy', onSelect: () => copy(null) }, { label: 'Download .txt', icon: 'download', kbd: 'mod+s', onSelect: save }] },
    { group: 'Privacy', items: [keep.menuItem()] },
  ], { placement: 'bottom-end' });
  root.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  function bar() { /* counts are the result; no action bar needed */ }

  api = { copy: () => copy(null), limit: () => { $('#wc-lim').focus(); } };
  if (!keep.restore() && params.get('sample')) await $$('.tx-empty [data-s]')[0]?.click();
  if (params.get('q')) setText(T, params.get('q'));
  compute();
  if (!matchMedia('(pointer: coarse)').matches) T.focus();
  return { T, onFiles: async (f) => { const t = await readFileText(f[0]); if (t != null) setText(T, t); }, onPasteText: (t) => { setText(T, t); T.focus(); return true; } };
}
