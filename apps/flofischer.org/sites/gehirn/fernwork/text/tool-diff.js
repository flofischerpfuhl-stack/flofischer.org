// Text Diff: Original + Changed → Compare. The diff runs in a Worker (line diff, word-level colours, moved blocks,
// reflowed paragraphs) and stays live after the first compare. Side by side or unified; export as patch/.diff/Markdown.
import {
  $, $$, esc, icon, enhance, toast, openMenu, copyText, isMobile, settings, keeper, pane, iconBtn, editor, textOf, setText,
  emptyHint, pickFile, readFileText, readClipboard, download, fetchSample, moreOptions, moreBtn, mobileBar, debounce, fmtN, xicon,
} from './ui.js';

let api = {};
export const config = {
  commands: [
    { id: 'diff-compare', label: 'Compare texts', icon: 'git-compare', kbd: 'mod+enter', run: () => api.compare?.() },
    { id: 'diff-swap', label: 'Swap original and changed', icon: 'arrow-left-right', run: () => api.swap?.() },
    { id: 'diff-patch', label: 'Copy diff as patch', icon: 'copy', run: () => api.copyPatch?.() },
    { id: 'diff-sample', label: 'Load two sample versions', icon: 'files', searchOnly: true, run: () => api.sample?.() },
  ],
};

export async function mount(root, { params }) {
  const S = settings('diff', { view: 'split', ignoreWs: false, ignoreCase: false, collapse: true });
  root.innerHTML = `
    <div class="tx-bar">
      <button class="fw-btn fw-btn--primary" type="button" id="d-go" data-tip="Compare" data-tip-kbd="mod+enter">${icon('git-compare')}Compare</button>
      <button class="fw-btn fw-btn--ghost" type="button" id="d-swap">${icon('arrow-left-right')}Swap</button>
      <span class="fw-spacer"></span>${moreBtn()}
    </div>
    <div class="tx-grid2 tx-diffin">
      ${pane({ id: 'd-a', title: 'Original', actions: `${iconBtn('d-a-open', 'folder-open', 'Open file')}${iconBtn('d-a-paste', 'clipboard-paste', 'Paste')}${iconBtn('d-a-clear', 'x', 'Clear')}` })}
      ${pane({ id: 'd-b', title: 'Changed', actions: `${iconBtn('d-b-open', 'folder-open', 'Open file')}${iconBtn('d-b-paste', 'clipboard-paste', 'Paste')}${iconBtn('d-b-clear', 'x', 'Clear')}` })}
    </div>
    <section class="tx-result" id="d-res" hidden aria-label="Differences">
      <div class="tx-result__head" id="d-head"></div>
      <div class="tb-diff__body" id="d-body"></div>
    </section>`;
  enhance(root);
  const aP = $('#d-a'), bP = $('#d-b');
  const names = { a: 'Original', b: 'Changed' };
  let live = false, res = null, patch = '', cur = -1, jobId = 0;
  const onChange = () => { sync(); keep.save(); if (live) schedule(); };
  const A = editor(aP, { kind: 'text', wrap: true, onChange });
  const B = editor(bP, { kind: 'text', wrap: true, onChange });
  const keep = keeper('diff', { get: () => ({ a: textOf(A), b: textOf(B) }), set: (v) => { setText(A, v.a || ''); setText(B, v.b || ''); } });
  const sample = async () => { names.a = 'vertrag-v1.md'; names.b = 'vertrag-v2.md'; setText(A, await fetchSample('samples/vertrag-v1.md')); setText(B, await fetchSample('samples/vertrag-v2.md')); compareNow(); };
  const syncA = emptyHint(aP, A, { title: 'Paste or type the original text', onPaste: () => pasteInto(A), onOpen: () => openInto('a'), samples: [{ label: 'Two contract versions', run: sample }] });
  const syncB = emptyHint(bP, B, { title: 'Paste or type the changed text', onPaste: () => pasteInto(B), onOpen: () => openInto('b') });
  function sync() { syncA(); syncB(); bar(); }

  // ── worker (stale jobs are cancelled by restarting it) ──
  let worker = null, busy = false;
  function job(msg) {
    if (busy && worker) { worker.terminate(); worker = null; }
    if (!worker) worker = new Worker(new URL('./diff-worker.js', import.meta.url), { type: 'module' });
    const id = ++jobId; busy = true;
    return new Promise((resolve) => { worker.onmessage = (e) => { if (e.data.id === id) { busy = false; resolve(e.data); } }; worker.postMessage({ id, ...msg }); });
  }
  async function compareNow({ scroll = true } = {}) {
    const a = textOf(A), b = textOf(B);
    if (!a && !b) { toast('Paste the original and the changed text first.', { type: 'info' }); return; }
    live = true;
    const r = await job({ a, b, ignoreWs: S.ignoreWs, ignoreCase: S.ignoreCase, context: S.collapse ? 3 : 1e9, nameA: names.a, nameB: names.b });
    if (r.id !== jobId) return;
    res = r.r; patch = r.patch; if (cur >= res.hunks) cur = res.hunks - 1;
    render();
    if (scroll) $('#d-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
    bar();
  }
  const schedule = debounce(() => compareNow({ scroll: false }), 300);

  // ── render ──
  function render() {
    const r = res; const sec = $('#d-res'); sec.hidden = false;
    const mode = isMobile() ? 'unified' : S.view; const st = r.stats;
    $('#d-head').innerHTML = `
      <span class="tx-result__title">${r.identical ? 'No differences' : `${fmtN(r.hunks)} ${r.hunks === 1 ? 'change' : 'changes'}`}</span>
      ${r.identical ? '' : `<span class="tb-legend"><span class="k-chg">${st.changed} changed</span><span class="k-ins">${st.added} added</span><span class="k-del">${st.removed} removed</span>${st.moved ? `<span class="k-move">${st.moved} moved</span>` : ''}</span>`}
      <span class="fw-spacer"></span>
      ${r.identical ? '' : `<div class="tb-nav" role="group" aria-label="Changes"><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="d-prev" aria-label="Previous change" data-tip="Previous change" data-tip-kbd="shift+f7">${icon('chevron-up')}</button><span class="tb-nav__pos" id="d-pos">${cur >= 0 ? cur + 1 : '–'} / ${r.hunks}</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="d-next" aria-label="Next change" data-tip="Next change" data-tip-kbd="f7">${icon('chevron-down')}</button></div>`}
      <div class="fw-seg fw-seg--sm tx-desk" aria-label="View" id="d-view"><button class="fw-seg__opt" type="button" data-value="split" aria-checked="${mode === 'split'}">${xicon('columns-2', { size: 14 })}Side by side</button><button class="fw-seg__opt" type="button" data-value="unified" aria-checked="${mode === 'unified'}">${xicon('rows-2', { size: 14 })}Unified</button></div>
      <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="d-export" aria-label="Copy or download the diff" data-tip="Copy or download">${icon('download')}</button>`;
    enhance($('#d-head'));
    $('#d-view').addEventListener('fw-change', (e) => { S.view = e.detail.value; S.save(); render(); });
    $('#d-prev')?.addEventListener('click', () => step(-1)); $('#d-next')?.addEventListener('click', () => step(1));
    $('#d-export').onclick = (e) => exportMenu(e.currentTarget);
    const piece = (t, k) => { if (k === 'eq') return esc(t); if (/\n/.test(t) && !/\S/.test(t)) return `<span class="tb-w-${k} tb-w-nl">↵</span>${k === 'del' ? '\n' : ''}`; return `<span class="tb-w-${k}">${esc(t).replace(/\n/g, '<span class="tb-w-nl">↵</span>\n')}</span>`; };
    const seg = (x) => (x.segs ? x.segs.map(([t, k]) => piece(t, k)).join('') : esc(x.text)) || '&#8203;';
    const moveChip = (row) => { if (!row.move?.first) return ''; const from = row.move.side === 'from';
      return `<button class="tb-movechip" type="button" data-move="${row.move.id}" data-dir="${from ? 'to' : 'from'}">${xicon(from ? 'corner-down-right' : 'corner-up-left', { size: 13 })}${from ? `Moved to line ${row.move.other + 1}` : `Moved from line ${row.move.other + 1}`}</button>`; };
    const fold = (row, idx) => `<button class="tb-d-fold" type="button" data-unfold="${idx}">${icon('chevrons-up-down', { size: 13 })}${fmtN(row.hidden.length)} unchanged lines</button>`;
    let html = '';
    if (r.identical) html = `<div class="tb-identical">${icon('circle-check', { size: 28 })}<b>The texts are identical</b><span>${S.ignoreWs || S.ignoreCase ? `Ignoring ${[S.ignoreWs && 'whitespace', S.ignoreCase && 'case'].filter(Boolean).join(' and ')}.` : 'Every line matches.'}</span></div>`;
    else if (mode === 'split') {
      html = `<div class="tb-diff__head"><span></span><span>${esc(names.a)}</span><span></span><span>${esc(names.b)}</span></div>` + r.rows.map((row, idx) => {
        if (row.k === 'fold') return fold(row, idx);
        const mv = row.move ? ' is-moved' : '';
        const a = row.a ? `<span class="tb-d-n">${row.a.n}</span><div class="tb-d-t tb-d-a${row.k === 'del' ? ' is-del' : row.k === 'chg' ? ' is-chg' : ''}${mv}">${row.move?.side === 'from' ? moveChip(row) : ''}${seg(row.a)}</div>` : `<span class="tb-d-n"></span><div class="tb-d-t is-void"></div>`;
        const b = row.b ? `<span class="tb-d-n">${row.b.n}</span><div class="tb-d-t tb-d-b${row.k === 'ins' ? ' is-ins' : row.k === 'chg' ? ' is-chg' : ''}${mv}">${row.move?.side === 'to' ? moveChip(row) : ''}${seg(row.b)}</div>` : `<span class="tb-d-n"></span><div class="tb-d-t is-void"></div>`;
        return `<div class="tb-d-row k-${row.k}${mv}" ${row.hunk != null ? `data-hunk="${row.hunk}"` : ''} ${row.move ? `data-moveid="${row.move.id}" data-side="${row.move.side}"` : ''}>${a}${b}</div>`;
      }).join('');
    } else {
      html = r.rows.map((row, idx) => {
        if (row.k === 'fold') return fold(row, idx);
        const mv = row.move ? ' is-moved' : '';
        const at = `${row.hunk != null ? `data-hunk="${row.hunk}"` : ''} ${row.move ? `data-moveid="${row.move.id}" data-side="${row.move.side}"` : ''}`;
        const line = (n1, n2, sign, cls, body, chip = '') => `<div class="tb-u-row ${cls}${mv}" ${at}><span class="tb-d-n">${n1 ?? ''}</span><span class="tb-d-n">${n2 ?? ''}</span><span class="tb-u-sign">${sign}</span><div class="tb-d-t">${chip}${body}</div></div>`;
        if (row.k === 'eq') return line(row.a.n, row.b.n, '', 'k-eq', esc(row.a.text) || '&#8203;');
        if (row.k === 'chg') return line(row.a.n, null, '−', 'k-del is-chg', seg(row.a)) + line(null, row.b.n, '+', 'k-ins is-chg', seg(row.b));
        if (row.k === 'del') return line(row.a.n, null, '−', 'k-del', seg(row.a), row.move?.side === 'from' ? moveChip(row) : '');
        return line(null, row.b.n, '+', 'k-ins', seg(row.b), row.move?.side === 'to' ? moveChip(row) : '');
      }).join('');
    }
    const body = $('#d-body');
    body.className = `tb-diff__body is-${mode}${/\.(json|log|csv|ya?ml|xml|js|ts|py)$/i.test(names.a + ' ' + names.b) || looksCode() ? ' is-mono' : ''}`;
    body.innerHTML = html;
    $$('[data-unfold]', body).forEach((b) => (b.onclick = () => {
      const row = r.rows[+b.dataset.unfold];
      b.outerHTML = row.hidden.map((x) => mode === 'split' ? `<div class="tb-d-row k-eq"><span class="tb-d-n">${x.a.n}</span><div class="tb-d-t">${esc(x.a.text) || '&#8203;'}</div><span class="tb-d-n">${x.b.n}</span><div class="tb-d-t">${esc(x.b.text) || '&#8203;'}</div></div>`
        : `<div class="tb-u-row k-eq"><span class="tb-d-n">${x.a.n}</span><span class="tb-d-n">${x.b.n}</span><span class="tb-u-sign"></span><div class="tb-d-t">${esc(x.a.text) || '&#8203;'}</div></div>`).join('');
    }));
    $$('[data-move]', body).forEach((b) => (b.onclick = () => {
      const t = body.querySelectorAll(`[data-moveid="${b.dataset.move}"][data-side="${b.dataset.dir}"]`);
      if (t[0]) { t[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(t); }
    }));
  }
  const looksCode = () => /^\s*[{[<]|;\s*$|^\s*(def|function|const|import|class) /m.test(textOf(A).slice(0, 2000));
  function flash(nodes) { nodes.forEach((n) => { n.classList.remove('is-flash'); void n.offsetWidth; n.classList.add('is-flash'); }); }
  function step(dir) {
    if (!res?.hunks) return;
    cur = cur < 0 ? (dir > 0 ? 0 : res.hunks - 1) : (cur + dir + res.hunks) % res.hunks;
    const rows = $('#d-body').querySelectorAll(`[data-hunk="${cur}"]`);
    rows[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(rows);
    const p = $('#d-pos'); if (p) p.textContent = `${cur + 1} / ${res.hunks}`; bar();
  }
  function markdown() { return '```diff\n' + patch + '```\n'; }
  function plain() { return $('#d-body').innerText; }
  function exportMenu(anchor) {
    openMenu(anchor, [
      { group: 'Copy', items: [{ label: 'Copy as patch', icon: 'copy', sub: 'Unified diff, works with git apply', onSelect: () => copyText(patch, null, { toastLabel: 'patch' }) }, { label: 'Copy as Markdown', icon: 'code-xml', onSelect: () => copyText(markdown(), null, { toastLabel: 'diff as Markdown' }) }, { label: 'Copy as text', icon: 'text', sub: 'What you see', onSelect: () => copyText(plain(), null, { toastLabel: 'diff' }) }] },
      { group: 'Download', items: [{ label: 'Download .diff', icon: 'download', kbd: 'mod+s', onSelect: () => download(patch, 'changes.diff', 'text/x-diff') }, { label: 'Download .txt', icon: 'file-text', onSelect: () => download(plain(), 'text-diff.txt') }] },
    ], { placement: 'bottom-end' });
  }

  // ── inputs ──
  async function pasteInto(v) { const t = await readClipboard(); if (t != null) setText(v, t); v.focus(); }
  async function openInto(side) { const f = await pickFile('text/*,.txt,.md,.json,.csv,.log,.xml,.yml,.yaml,.js,.ts,.py,.html,.css'); if (f) await loadInto(side, f); }
  async function loadInto(side, f) { const t = await readFileText(f); if (t == null) return; names[side] = f.name; setTitle(); setText(side === 'a' ? A : B, t); if (textOf(A) && textOf(B)) compareNow(); }
  function setTitle() { aP.querySelector('.tx-pane__title').textContent = names.a === 'Original' ? 'Original' : `Original · ${names.a}`; bP.querySelector('.tx-pane__title').textContent = names.b === 'Changed' ? 'Changed' : `Changed · ${names.b}`; }
  const clear = (side) => { const v = side === 'a' ? A : B; const old = textOf(v); if (!old) return; setText(v, ''); names[side] = side === 'a' ? 'Original' : 'Changed'; setTitle(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(v, old) } }); };
  $('#d-a-open').onclick = () => openInto('a'); $('#d-b-open').onclick = () => openInto('b');
  $('#d-a-paste').onclick = () => pasteInto(A); $('#d-b-paste').onclick = () => pasteInto(B);
  $('#d-a-clear').onclick = () => clear('a'); $('#d-b-clear').onclick = () => clear('b');
  $('#d-go').onclick = () => compareNow();
  function swap() { const a = textOf(A), b = textOf(B); [names.a, names.b] = [names.b === 'Changed' ? 'Original' : names.b, names.a === 'Original' ? 'Changed' : names.a]; setTitle(); setText(A, b); setText(B, a); if (live) compareNow({ scroll: false }); }
  $('#d-swap').onclick = swap;
  $('#more-opts').onclick = (e) => moreOptions(e.currentTarget, {
    html: `<label class="fw-toggle"><input type="checkbox" id="o-ws" ${S.ignoreWs ? 'checked' : ''}><span>Ignore whitespace</span></label>
      <label class="fw-toggle"><input type="checkbox" id="o-case" ${S.ignoreCase ? 'checked' : ''}><span>Ignore case</span></label>
      <label class="fw-toggle"><input type="checkbox" id="o-col" ${S.collapse ? 'checked' : ''}><span>Collapse unchanged lines<span class="tx-opt-sub">Keeps 3 lines of context around each change</span></span></label>
      <div class="fw-field tx-mob"><span class="fw-field__label">View</span><span class="fw-faint fw-t-sm">Phones always show the unified view.</span></div><hr>${keep.toggleHtml()}`,
    wire: (el) => {
      const on = (id, k) => (el.querySelector(id).onchange = (ev) => { S[k] = ev.target.checked; S.save(); if (live) compareNow({ scroll: false }); });
      on('#o-ws', 'ignoreWs'); on('#o-case', 'ignoreCase'); on('#o-col', 'collapse'); keep.wire(el);
    },
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'F7') { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 'Enter') { e.preventDefault(); compareNow(); }
    else if (e.key.toLowerCase() === 's' && patch) { e.preventDefault(); download(patch, 'changes.diff', 'text/x-diff'); }
  });
  function bar() {
    const has = textOf(A) && textOf(B);
    const line = res && live ? (res.identical ? `${icon('circle-check', { size: 14 })} Identical` : `${fmtN(res.hunks)} ${res.hunks === 1 ? 'change' : 'changes'}${cur >= 0 ? ` · ${cur + 1} of ${res.hunks}` : ''}`) : '<span class="fw-faint">Add both texts</span>';
    const acts = res && live && !res.identical ? `<button class="fw-iconbtn" type="button" id="m-prev" aria-label="Previous change">${icon('chevron-up')}</button><button class="fw-btn fw-btn--primary" type="button" id="m-next">${icon('chevron-down')}Next change</button>`
      : `<button class="fw-btn fw-btn--primary" type="button" id="m-go" ${has ? '' : 'disabled'}>${icon('git-compare')}Compare</button>`;
    const b = mobileBar(root, { line, actions: acts });
    b.querySelector('#m-go')?.addEventListener('click', () => compareNow());
    b.querySelector('#m-next')?.addEventListener('click', () => step(1));
    b.querySelector('#m-prev')?.addEventListener('click', () => step(-1));
  }
  bar();
  addEventListener('resize', debounce(() => { if (res) render(); }, 200));

  api = { compare: compareNow, swap, copyPatch: () => (patch ? copyText(patch, null, { toastLabel: 'patch' }) : toast('Compare first.', { type: 'info' })), sample };
  // handoff from Text Cleanup ("Compare before / after")
  let hand = null; try { hand = JSON.parse(sessionStorage.getItem('fw:text:diff-handoff') || 'null'); sessionStorage.removeItem('fw:text:diff-handoff'); } catch { /* */ }
  if (hand) { names.a = hand.nameA || 'Before'; names.b = hand.nameB || 'After'; setTitle(); setText(A, hand.a); setText(B, hand.b); compareNow({ scroll: false }); }
  else if (keep.restore()) { if (textOf(A) && textOf(B)) compareNow({ scroll: false }); }
  else if (params.get('sample')) await sample();
  if (!hand && !params.get('sample') && !matchMedia('(pointer: coarse)').matches) A.focus();
  return {
    A, B,
    onFiles: async (files) => {
      const t = [...files].slice(0, 2);
      if (t.length === 2) { names.a = t[0].name; names.b = t[1].name; setTitle(); const [x, y] = await Promise.all(t.map((f) => readFileText(f))); setText(A, x ?? ''); setText(B, y ?? ''); compareNow(); return; }
      await loadInto(!textOf(A) ? 'a' : 'b', t[0]);
    },
    onPasteText: (t) => { const v = !textOf(A) ? A : B; setText(v, t); v.focus(); if (textOf(A) && textOf(B)) compareNow(); return true; },
  };
}
