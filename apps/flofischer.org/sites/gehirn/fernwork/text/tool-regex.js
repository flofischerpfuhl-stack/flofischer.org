// Regex Tester: pattern + flags → matches light up in the test text, each capture group in its own colour.
// Result tabs: Matches · Replace · List · Explain. Patterns run in a Worker with a 1 s limit (catastrophic
// backtracking stops calmly instead of freezing the tab).
import { parseRegex, explain, nestedQuantifier, saferPattern, RegexRunner } from './regex.js';
import {
  E, $, $$, esc, icon, enhance, toast, openMenu, copyText, isMobile, settings, keeper, pane, iconBtn, inputActions, editor, textOf, setText,
  emptyHint, pickFile, readFileText, readClipboard, download, fetchSample, moreOptions, moreBtn, mobileBar, debounce, fmtN,
} from './ui.js';

let api = {};
export const config = {
  commands: [
    { id: 'rx-replace', label: 'Replace with regex', icon: 'replace', run: () => api.tab?.('replace') },
    { id: 'rx-list', label: 'Extract all matches', icon: 'list', run: () => api.tab?.('list') },
    { id: 'rx-explain', label: 'Explain this pattern', icon: 'circle-help', run: () => api.tab?.('explain') },
    { id: 'rx-sample', label: 'Load sample log', icon: 'file-text', searchOnly: true, run: () => api.sample?.() },
  ],
};
const FLAGS = [['g', 'global', 'Find all matches, not just the first'], ['i', 'ignore case', 'Case-insensitive'], ['m', 'multiline', '^ and $ match at line breaks'], ['s', 'dotAll', '. also matches line breaks'], ['u', 'unicode', 'Unicode mode'],
  ['v', 'unicode sets', 'Unicode sets (replaces u)'], ['y', 'sticky', 'Match only at lastIndex'], ['d', 'indices', 'Return start/end of groups']];
const MAIN_FLAGS = 'gimsu';
const SAMPLE_PATTERN = String.raw`from=(?<user>[\w.+-]+)@(?<domain>[\w-]+(?:\.[\w-]+)+)`;

export async function mount(root, { params }) {
  const S = settings('regex', { flags: 'gu', tab: 'matches', replace: '$<user> at $<domain>' });
  const supported = (f) => { try { new RegExp('', f); return true; } catch { return false; } };
  root.innerHTML = `
    <div class="fw-stack" style="--gap:8px">
      <div class="tx-bar">
        <label class="tx-rx" id="rx-box" style="flex:1;min-width:min(100%,320px)"><span class="tx-rx__slash" aria-hidden="true">/</span><span class="fw-sr">Pattern</span>
          <input class="tx-rx__in" id="rx-pat" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Type a pattern, e.g. \\d{3}-\\d{4}">
          <span class="tx-rx__flags" aria-hidden="true"><span class="tx-rx__slash tx-rx__slash--end">/</span><span class="tx-rx__flagtxt" id="rx-flagtxt"></span></span></label>
        <div class="tx-flags" role="group" aria-label="Flags" id="rx-flags">${[...MAIN_FLAGS].map((f) => flagBtn(f)).join('')}</div>
        ${moreBtn()}
      </div>
      <div class="tx-fielderr" id="rx-err" hidden role="alert"></div>
    </div>
    <div class="tx-grid2">
      ${pane({ id: 'rx-in', title: 'Test text', actions: inputActions('rx-in') })}
      ${pane({ id: 'rx-out', title: '', foot: false, actions: `${iconBtn('rx-dl', 'download', 'Download', 'data-tip-kbd="mod+s"')}${iconBtn('rx-more', 'ellipsis', 'More')}<button class="fw-btn fw-btn--primary fw-btn--sm tx-desk" type="button" id="rx-copy">${icon('copy')}<span>Copy</span></button>` })}
    </div>`;
  function flagBtn(f) { const [, name, tip] = FLAGS.find((x) => x[0] === f); return `<button class="tx-flag" type="button" data-flag="${f}" aria-pressed="${S.flags.includes(f)}" aria-label="${f} — ${name}" data-tip="${esc(f + ' · ' + tip)}" ${supported(f) ? '' : 'disabled'}>${f}</button>`; }
  // tabs live in the result pane head
  const outP = $('#rx-out'); const head = outP.querySelector('.tx-pane__head');
  head.querySelector('.tx-pane__title').outerHTML = `<div class="tx-tabs fw-tabs" role="tablist" id="rx-tabs">${[['matches', 'Matches'], ['replace', 'Replace'], ['list', 'List'], ['explain', 'Explain']].map(([k, l]) => `<button class="fw-tab" role="tab" type="button" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}</div>`;
  head.querySelector('[data-meta]').remove();
  enhance(root);
  const inP = $('#rx-in'); const inMeta = inP.querySelector('[data-meta]'); const outBody = outP.querySelector('[data-body]');
  const pat = $('#rx-pat');
  const runner = new RegexRunner(new URL('./regex-worker.js', import.meta.url), 1000);
  let res = null, err = null, timeout = null, groupsN = 0, tree = null;

  const T = editor(inP, { kind: 'text', wrap: true, onChange: () => { sync(); keep.save(); schedule(); } });
  const keep = keeper('regex', { get: () => ({ p: pat.value, t: textOf(T) }), set: (v) => { pat.value = v.p || ''; setText(T, v.t || ''); } });
  const sample = async () => { pat.value = SAMPLE_PATTERN; S.flags = 'gu'; syncFlags(); setText(T, await fetchSample('samples/anfragen.log')); run(); };
  const sync = emptyHint(inP, T, { title: 'Paste or type the text to search', onPaste: async () => { const t = await readClipboard(); if (t != null) setText(T, t); }, onOpen: () => openFile(), samples: [{ label: 'Emails in a log', run: sample }] });

  // ── run ──
  async function run() {
    const src = pat.value; const text = textOf(T); const flags = S.flags;
    $('#rx-flagtxt').textContent = flags;
    err = null; timeout = null; tree = null; groupsN = 0;
    if (src) { try { const p = parseRegex(src); tree = p.tree; groupsN = p.groups; } catch { /* the engine decides */ } try { new RegExp(src, flags); } catch (e) { err = humanError(e.message); } }
    $('#rx-err').hidden = !err; $('#rx-err').innerHTML = err ? `${icon('circle-alert', { size: 14 })}<span>${esc(err)}</span>` : '';
    $('#rx-box').classList.toggle('is-bad', !!err);
    if (!src || err || !text) { res = null; decorate(); render(); return; }
    try {
      res = await runner.run({ source: src, flags, text, limit: 1000, replace: S.replace });
    } catch (e) {
      if (e.cancelled) return;
      if (e.timeout) { timeout = e; res = null; } else if (e.error) { err = humanError(e.error); res = null; }
    }
    decorate(); render();
  }
  const schedule = debounce(run, 120);
  function humanError(m) {
    m = m.replace(/^Invalid regular expression: \/.*\/[a-z]*: /, '');
    const map = { 'Unterminated group': 'A ( has no matching )', 'Unmatched \')\'': 'A ) has no matching (', 'Nothing to repeat': 'A *, + or ? has nothing before it to repeat', 'Unterminated character class': 'A [ has no matching ]', 'Invalid named capture referenced': 'This name isn’t defined as a group', 'Lone quantifier brackets': 'A { or } needs escaping as \\{ or \\}' };
    for (const k in map) if (m.startsWith(k)) return `${map[k]} (${m})`;
    return m;
  }
  function decorate() {
    const specs = [];
    if (res?.matches?.length) {
      res.matches.forEach((m, i) => {
        if (m.e > m.s) specs.push(E.mark(m.s, m.e, `tb-rx-m tb-rx-m${i % 2}`));
        m.groups.forEach((g, gi) => { if (g.s >= 0 && g.e > g.s) specs.push(E.mark(g.s, g.e, `tb-rx-g tb-rx-g${(gi % 6) + 1}`)); });
      });
    }
    try { T.dispatch({ effects: E.layerEffect('rx', specs) }); } catch { /* text changed under us; next run fixes it */ }
    inMeta.className = 'tx-pane__meta';
    inMeta.innerHTML = timeout ? `<span style="color:var(--warning)">${icon('timer', { size: 14 })} Stopped after 1 s</span>`
      : res ? `${res.total > 1000 ? '1,000+' : fmtN(res.total)} ${res.total === 1 ? 'match' : 'matches'}${groupsN ? ` · ${groupsN} ${groupsN === 1 ? 'group' : 'groups'}` : ''}` : '';
  }

  // ── result tabs ──
  let sub = null;
  function render() {
    $$('#rx-tabs .fw-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === S.tab)));
    sub?.destroy?.(); sub = null; outBody.innerHTML = '';
    if (timeout) { outBody.innerHTML = timeoutHtml(); wireTimeout(); bar(); return; }
    const tab = S.tab;
    if (tab === 'explain') { outBody.innerHTML = `<div class="tx-list tx-explain">${explainHtml()}</div>`; bar(); return; }
    if (!res) { outBody.innerHTML = `<div class="tx-empty-note">${!pat.value ? 'Type a pattern to see matches.' : err ? 'Fix the pattern to see matches.' : 'Add some text to search.'}</div>`; bar(); return; }
    if (tab === 'matches') {
      outBody.innerHTML = res.matches.length ? `<div class="tx-list" id="rx-list">${res.matches.map((m, i) => `<div class="tx-match" data-i="${i}" role="button" tabindex="0"><span class="tx-match__n">${i + 1}</span><span class="tx-match__v">${esc(m.v) || '<span class="fw-faint">(empty)</span>'}</span><span class="tx-match__at">@ ${fmtN(m.s)}</span>
        ${m.groups.length ? `<span class="tx-match__groups">${m.groups.map((g, gi) => `<span class="tx-grp tx-g${(gi % 6) + 1}"><span class="tx-grp__k">${esc(m.named[gi] ?? gi + 1)}</span>${g.v == null ? '<span class="fw-faint">–</span>' : esc(g.v)}</span>`).join('')}</span>` : ''}</div>`).join('')}
        ${res.total > res.matches.length ? `<div class="tx-more-note">${fmtN(res.total)} matches · showing the first 1,000</div>` : ''}</div>` : `<div class="tx-empty-note">No matches.</div>`;
      $$('.tx-match', outBody).forEach((r) => (r.onclick = r.onkeydown = (e) => { if (e.type === 'keydown' && e.key !== 'Enter') return; const m = res.matches[+r.dataset.i]; T.dispatch({ selection: { anchor: m.s, head: m.e }, effects: E.View.scrollIntoView(m.s, { y: 'center' }) }); T.focus(); }));
    } else if (tab === 'replace') {
      outBody.innerHTML = `<div class="tx-subbody"><div class="tx-replace"><label class="fw-sr" for="rx-rep">Replace with</label><input class="fw-input fw-input--mono" id="rx-rep" placeholder="Replace with… ($1, $<name>, $&)" spellcheck="false" value="${esc(S.replace)}"></div><div class="tx-subed" data-sb></div></div>`;
      const host = outBody.querySelector('[data-sb]');
      const fake = { querySelector: (s) => (s === '[data-body]' ? host : null) };
      sub = editor(fake, { doc: res.replaced ?? '', readOnly: true, wrap: true });
      const rep = $('#rx-rep'); rep.oninput = debounce(() => { S.replace = rep.value; S.save(); run(); }, 120);
    } else if (tab === 'list') {
      outBody.innerHTML = `<div class="tx-subbody"><div class="tx-subed" data-sb></div></div>`;
      const host = outBody.querySelector('[data-sb]');
      sub = editor({ querySelector: (s) => (s === '[data-body]' ? host : null) }, { doc: res.matches.map((m) => m.v).join('\n'), readOnly: true, wrap: false });
    }
    bar();
  }
  function explainHtml() {
    if (!pat.value) return `<div class="tx-empty-note">Type a pattern and it’s explained here, step by step.</div>`;
    if (!tree) return `<div class="tx-empty-note">${esc(err || 'This pattern uses syntax the explainer doesn’t know yet.')}</div>`;
    const rows = explain(tree, { multiline: S.flags.includes('m') });
    return rows.map((r) => `<div class="tx-ex ${r.isGroupHead ? 'is-group' : ''} ${r.group ? `tx-g${((r.group - 1) % 6) + 1}` : ''}" style="--d:${r.depth}">${r.src ? `<code class="tx-ex__src">${esc(r.src)}</code>` : ''}<span class="tx-ex__label">${esc(r.label)}</span>${r.detail ? `<span class="tx-ex__detail">${esc(r.detail)}</span>` : ''}</div>`).join('');
  }
  function timeoutHtml() {
    const nest = tree ? nestedQuantifier(tree) : null; const safer = saferPattern(pat.value);
    return `<div class="fw-alert fw-alert--warning tx-alert" role="alert"><span class="fw-alert__icon">${icon('timer')}</span><div class="fw-alert__body">
      <div><b>Stopped this pattern after 1 second.</b> Your text and the page are fine.</div>
      <div class="tx-alert__pos">${nest ? `<code class="fw-mono">${esc(nest)}</code> repeats something that itself repeats, so the engine tries millions of ways to match.` : 'The pattern takes too long on this text.'}</div>
      ${safer ? `<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm fw-btn--primary" type="button" id="rx-safer">${icon('wrench')}Use <code class="fw-mono">${esc(safer)}</code></button></div>` : ''}</div></div>`;
  }
  function wireTimeout() { $('#rx-safer')?.addEventListener('click', () => { pat.value = saferPattern(pat.value); run(); }); }

  // ── output actions per tab ──
  const outText = () => (S.tab === 'replace' ? res?.replaced ?? '' : S.tab === 'explain' ? $$('.tx-ex', outBody).map((r) => `${'  '.repeat(+r.style.getPropertyValue('--d') || 0)}${r.innerText.replace(/\n/g, ' ')}`).join('\n') : res ? res.matches.map((m) => m.v).join('\n') : '');
  function copy(btn) { const t = outText(); if (!t) { toast('Nothing to copy yet.', { type: 'info' }); return; } copyText(t, btn, { toastLabel: S.tab === 'replace' ? 'replaced text' : S.tab === 'explain' ? 'explanation' : `${fmtN(res.matches.length)} matches` }); }
  function save() { const t = outText(); if (t) download(t, S.tab === 'replace' ? 'regex-result.txt' : 'regex-matches.txt'); }
  $('#rx-copy').onclick = (e) => copy(e.currentTarget);
  $('#rx-dl').onclick = save;
  $('#rx-more').onclick = (e) => openMenu(e.currentTarget, [
    { label: 'Use replaced text as test text', icon: 'arrow-left-right', onSelect: () => { if (res?.replaced != null) setText(T, res.replaced); else { S.tab = 'replace'; run(); } } },
    { label: 'Copy pattern as /…/flags', icon: 'regex', onSelect: () => copyText(`/${pat.value}/${S.flags}`, null, { toastLabel: 'pattern' }) },
    { label: 'Download .txt', icon: 'download', kbd: 'mod+s', onSelect: save },
  ], { placement: 'bottom-end' });
  $('#rx-tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (!t) return; setTab(t.dataset.tab); });
  function setTab(t) { S.tab = t; S.save(); render(); }

  // ── flags ──
  function syncFlags() { $$('[data-flag]').forEach((b) => b.setAttribute('aria-pressed', String(S.flags.includes(b.dataset.flag)))); $('#rx-flagtxt').textContent = S.flags; }
  function toggleFlag(f) {
    let fl = S.flags.includes(f) ? S.flags.replace(f, '') : S.flags + f;
    if (f === 'u' && fl.includes('u')) fl = fl.replace('v', ''); if (f === 'v' && fl.includes('v')) fl = fl.replace('u', '');
    S.flags = 'dgimsuvy'.split('').filter((x) => fl.includes(x)).join(''); S.save(); syncFlags(); run();
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-flag]'); if (b && root.contains(b)) toggleFlag(b.dataset.flag); });
  $('#more-opts').onclick = (e) => moreOptions(e.currentTarget, {
    html: `<div class="fw-field"><span class="fw-field__label">More flags</span>${FLAGS.filter(([f]) => !MAIN_FLAGS.includes(f)).map(([f, n, tip]) => `<label class="fw-toggle"><input type="checkbox" data-xflag="${f}" ${S.flags.includes(f) ? 'checked' : ''} ${supported(f) ? '' : 'disabled'}><span><code class="fw-mono">${f}</code> ${esc(n)}<span class="tx-opt-sub">${esc(tip)}${supported(f) ? '' : ' · not supported by this browser'}</span></span></label>`).join('')}</div><hr>${keep.toggleHtml()}`,
    wire: (el) => { $$('[data-xflag]', el).forEach((c) => (c.onchange = () => { toggleFlag(c.dataset.xflag); $$('[data-xflag]', el).forEach((x) => (x.checked = S.flags.includes(x.dataset.xflag))); })); keep.wire(el); },
  });
  pat.addEventListener('input', () => { keep.save(); schedule(); });

  async function openFile() { const f = await pickFile('text/*,.txt,.md,.json,.csv,.log'); if (f) { const t = await readFileText(f); if (t != null) setText(T, t); } }
  $('#rx-in-open').onclick = openFile;
  $('#rx-in-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setText(T, t); };
  $('#rx-in-clear').onclick = () => { const old = textOf(T); if (!old) return; setText(T, ''); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => setText(T, old) } }); };
  root.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } });

  function bar() {
    const line = timeout ? `${icon('timer', { size: 14 })} Stopped after 1 s` : err ? `<span style="color:var(--danger)">${esc(err)}</span>` : res ? `${res.total > 1000 ? '1,000+' : fmtN(res.total)} ${res.total === 1 ? 'match' : 'matches'}` : '<span class="fw-faint">Type a pattern</span>';
    const b = mobileBar(root, { line, actions: `<button class="fw-btn fw-btn--primary" type="button" id="m-copy" ${res ? '' : 'disabled'}>${icon('copy')}Copy ${S.tab === 'replace' ? 'result' : S.tab === 'explain' ? '' : 'matches'}</button>` });
    b.querySelector('#m-copy').onclick = (e) => copy(e.currentTarget);
  }
  api = { tab: setTab, sample };
  syncFlags();
  if (!keep.restore()) { if (params.get('sample')) await sample(); }
  if (params.get('q')) pat.value = params.get('q');
  if (params.get('pattern')) pat.value = params.get('pattern');
  if (params.get('tab')) S.tab = params.get('tab');
  run();
  if (!matchMedia('(pointer: coarse)').matches) pat.focus();
  return {
    T, pat, run,
    onFiles: async (files) => { const t = await readFileText(files[0]); if (t != null) setText(T, t); },
    onPasteText: (t) => { setText(T, t); return true; },
  };
}
