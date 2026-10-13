// Fernboard diagram blocks: real Mermaid (vendored, same-origin), Fernwork theme variables from the tokens,
// a serial render queue, plain-words error messages with one-click fixes, and a light code editor
// (line numbers, highlighting, error underline + gutter dot, Tab indents, native undo).
import mermaid from './vendor/mermaid/mermaid.esm.js';
import { esc } from './scene.js';

const THEME = {
  light: {
    darkMode: false, background: '#ffffff', fontFamily: 'Geist, system-ui, sans-serif', fontSize: '15px',
    primaryColor: '#ecfdf3', primaryBorderColor: '#7dd3a0', primaryTextColor: '#111111', secondaryColor: '#eff6ff', secondaryBorderColor: '#bfdbfe',
    tertiaryColor: '#fafafa', tertiaryBorderColor: '#d4d4d8', lineColor: '#52525b', textColor: '#111111', mainBkg: '#ecfdf3', nodeBorder: '#7dd3a0',
    edgeLabelBackground: '#ffffff', clusterBkg: '#fafafa', clusterBorder: '#d4d4d8', titleColor: '#111111',
    actorBkg: '#ecfdf3', actorBorder: '#7dd3a0', actorTextColor: '#111111', actorLineColor: '#a1a1aa', signalColor: '#3f3f46', signalTextColor: '#111111',
    labelBoxBkgColor: '#ecfdf3', labelBoxBorderColor: '#7dd3a0', labelTextColor: '#111111', loopTextColor: '#111111', activationBkgColor: '#dcfce7', activationBorderColor: '#7dd3a0',
    noteBkgColor: '#fffbeb', noteBorderColor: '#fcd34d', noteTextColor: '#111111', sequenceNumberColor: '#ffffff',
    // pie / quadrant: the colour-blind-safe series palette (DESIGN.md), so slices are distinguishable
    pie1: '#86efac', pie2: '#93c5fd', pie3: '#fdba74', pie4: '#c4b5fd', pie5: '#fca5a5', pie6: '#5eead4', pieStrokeColor: '#ffffff', pieOuterStrokeColor: '#d4d4d8', pieSectionTextColor: '#111111',
  },
  dark: {
    darkMode: true, background: '#18181b', fontFamily: 'Geist, system-ui, sans-serif', fontSize: '15px',
    primaryColor: '#11291b', primaryBorderColor: '#2f7a4c', primaryTextColor: '#ededed', secondaryColor: '#14233d', secondaryBorderColor: '#2b4f8a',
    tertiaryColor: '#1d1d21', tertiaryBorderColor: '#3a3a3f', lineColor: '#b4b4bb', textColor: '#ededed', mainBkg: '#11291b', nodeBorder: '#2f7a4c',
    edgeLabelBackground: '#18181b', clusterBkg: '#1d1d21', clusterBorder: '#3a3a3f', titleColor: '#ededed',
    actorBkg: '#11291b', actorBorder: '#2f7a4c', actorTextColor: '#ededed', actorLineColor: '#5a5a62', signalColor: '#d4d4d8', signalTextColor: '#ededed',
    labelBoxBkgColor: '#11291b', labelBoxBorderColor: '#2f7a4c', labelTextColor: '#ededed', loopTextColor: '#ededed', activationBkgColor: '#1a3a26', activationBorderColor: '#2f7a4c',
    noteBkgColor: '#3a300d', noteBorderColor: '#7a6420', noteTextColor: '#fdf6d8', sequenceNumberColor: '#111113',
    pie1: '#2f7a4c', pie2: '#2b4f8a', pie3: '#9a4a12', pie4: '#5b3f9e', pie5: '#8f2d2d', pie6: '#1d6b63', pieStrokeColor: '#18181b', pieOuterStrokeColor: '#3a3a3f', pieSectionTextColor: '#ededed',
  },
};
let current = null, chain = Promise.resolve(), n = 0;
function init(theme) {
  if (current === theme) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: THEME[theme], fontFamily: 'Geist, system-ui, sans-serif',
    flowchart: { htmlLabels: false, curve: 'basis', padding: 14, nodeSpacing: 46, rankSpacing: 52 }, sequence: { mirrorActors: false, actorMargin: 64, boxMargin: 8, messageMargin: 34, useMaxWidth: false },
    gantt: { useMaxWidth: false }, mindmap: { useMaxWidth: false }, htmlLabels: false });
  current = theme;
}
export function kindOf(code) {
  const first = (String(code).split('\n').find((l) => l.trim() && !l.trim().startsWith('%%')) || '').trim();
  const k = first.split(/\s+/)[0];
  return { sequenceDiagram: 'Sequence', flowchart: 'Flowchart', graph: 'Flowchart', classDiagram: 'Class', stateDiagram: 'State', 'stateDiagram-v2': 'State', erDiagram: 'Entity', gantt: 'Gantt', pie: 'Pie', journey: 'Journey', timeline: 'Timeline', mindmap: 'Mind map', gitGraph: 'Git', quadrantChart: 'Quadrant' }[k] || 'Diagram';
}
/** Render Mermaid code → { svg, ms } or throw { human } (serialised: Mermaid is not re-entrant). */
export function render(code, theme = 'light') {
  const job = chain.then(async () => {
    init(theme);
    const t0 = performance.now();
    try { await mermaid.parse(code); }
    catch (err) { throw Object.assign(new Error('parse'), { human: humanize(code, err) }); }
    const id = `fwm${++n}`;
    try {
      const { svg } = await mermaid.render(id, code);
      return { svg: tidySvg(svg), ms: Math.round(performance.now() - t0) };
    } catch (err) { document.getElementById('d' + id)?.remove(); throw Object.assign(new Error('render'), { human: humanize(code, err) }); }
  });
  chain = job.catch(() => {});
  return job;
}
function tidySvg(svg) { return svg.replace(/<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\sstyle="[^"]*"/, '')}>`).replace(/edgeLabel rect\{opacity:0\.5;/g, 'edgeLabel rect{opacity:1;'); }

// ───────────────────────── errors in plain words ─────────────────────────
const ARROW = /(-{1,2}>>|-{1,2}>|-{1,2}x|-{1,2}\)|<<-{1,2}>>)/;
/** → { line (1-based), text (html), fix: { line, value, label } | null, raw } */
export function humanize(code, err) {
  const lines = String(code).split('\n');
  const raw = String(err?.message || err || '').trim();
  const kind = kindOf(code);
  const first = lines.findIndex((l) => l.trim());
  const ln = (i) => i + 1;
  // 1 · missing diagram type
  if (kind === 'Diagram') return { line: ln(Math.max(0, first)), text: 'Start with a diagram type on the first line, like <code>flowchart LR</code> or <code>sequenceDiagram</code>.', fix: null, raw };
  // 2 · sequence message without a colon
  if (kind === 'Sequence') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)([\w.-]+)\s*(-{1,2}>>|-{1,2}>|-{1,2}x|-{1,2}\))\s*([+-]?[\w.-]+)(\s+)(?!:)(\S.*)$/);
      if (m && !lines[i].includes(':')) {
        const fixed = `${m[1]}${m[2]}${m[3]}${m[4]}: ${m[6]}`;
        return { line: ln(i), col: lines[i].indexOf(m[4]) + m[4].length, text: `Add a colon after <code>${esc(m[4])}</code> to start the message text.`, fix: { line: ln(i), value: fixed, label: `Use ${fixed.trim()}`, code: fixed.trim() }, raw };
      }
    }
  }
  // 3 · unbalanced brackets (flowchart node shapes)
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].replace(/"[^"]*"/g, '""').replace(/\|[^|]*\|/g, '||');
    const pairs = { '[': ']', '(': ')', '{': '}' }; const st = [];
    for (const ch of L) { if (pairs[ch]) st.push(ch); else if (Object.values(pairs).includes(ch)) { if (st.length && pairs[st.at(-1)] === ch) st.pop(); } }
    if (st.length) {
      const close = st.map((c) => pairs[c]).reverse().join('');
      const word = (lines[i].trim().split(/\s+/).find((w) => /[[({]/.test(w) && !w.includes(close)) || lines[i].trim());
      return { line: ln(i), text: `<code>${esc(word)}</code> is missing a closing <code>${esc(close)}</code>.`, fix: { line: ln(i), value: lines[i].replace(/\s*$/, '') + close, label: `Add ${close}` }, raw };
    }
  }
  // 4 · arrow pointing nowhere
  for (let i = 0; i < lines.length; i++) if (ARROW.test(lines[i]) && /(-->|->>|-->>)\s*$/.test(lines[i])) return { line: ln(i), text: 'This arrow doesn’t point anywhere yet. Add the name it should point to.', fix: null, raw };
  const m = raw.match(/line (\d+)/i);
  const line = Math.min(lines.length, Math.max(1, m ? +m[1] : (err?.hash?.loc?.first_line || lines.length)));
  return { line, text: 'Mermaid couldn’t read this line. Check the arrow and the brackets.', fix: null, raw };
}

// ───────────────────────── highlighting ─────────────────────────
const KW = /\b(sequenceDiagram|flowchart|graph|participant|actor|as|loop|alt|else|opt|par|and|end|note|over|left of|right of|activate|deactivate|autonumber|subgraph|classDef|class|style|linkStyle|direction|TD|TB|LR|RL|BT|gantt|section|title|dateFormat|pie|stateDiagram-v2|stateDiagram|classDiagram|erDiagram|journey|timeline|mindmap)\b/g;
function hlLine(s) {
  if (/^\s*%%/.test(s)) return `<span class="tk-c">${esc(s)}</span>`;
  let out = '', last = 0;
  const re = /("[^"]*")|(-{1,2}>>|-{1,2}>|-{1,2}x|-{1,2}\)|-{3}|==>|-\.->|<<-{1,2}>>)|(\|[^|]*\|)|(:.*$)|([[\](){}])/g;
  let m;
  const kw = (t) => esc(t).replace(KW, '<span class="tk-k">$1</span>');
  while ((m = re.exec(s))) {
    out += kw(s.slice(last, m.index));
    const cls = m[1] ? 'tk-s' : m[2] ? 'tk-a' : m[3] ? 'tk-s' : m[4] ? 'tk-m' : 'tk-b';
    out += `<span class="${cls}">${esc(m[0])}</span>`; last = m.index + m[0].length;
  }
  return out + kw(s.slice(last));
}

// ───────────────────────── editor ─────────────────────────
/** new CodeEditor(el, { value, onChange(value), label }) — textarea over a highlighted <pre>; .setError(e|null) */
export class CodeEditor {
  constructor(el, { value = '', onChange, label = 'Diagram code' } = {}) {
    this.el = el; this.onChange = onChange; this.err = null;
    el.classList.add('ce');
    el.innerHTML = `<div class="ce__scroll"><div class="ce__gutter" aria-hidden="true"></div><div class="ce__code"><pre class="ce__hl" aria-hidden="true"></pre><textarea class="ce__ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="${esc(label)}"></textarea></div></div>`;
    this.ta = el.querySelector('.ce__ta'); this.hl = el.querySelector('.ce__hl'); this.gut = el.querySelector('.ce__gutter');
    this.ta.value = value;
    this.ta.addEventListener('input', () => { this.paint(); this.onChange?.(this.ta.value); });
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (this.escaped) { this.escaped = false; return; } // Esc then Tab leaves the editor
        e.preventDefault();
        if (e.shiftKey) { const s = this.ta.selectionStart, ls = this.ta.value.lastIndexOf('\n', s - 1) + 1; if (this.ta.value.slice(ls, ls + 2) === '  ') { this.ta.setSelectionRange(ls, ls + 2); document.execCommand('delete'); } }
        else document.execCommand('insertText', false, '  ');
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const s = this.ta.selectionStart, ls = this.ta.value.lastIndexOf('\n', s - 1) + 1, ind = this.ta.value.slice(ls).match(/^\s*/)[0];
        e.preventDefault(); document.execCommand('insertText', false, '\n' + ind);
      }
      this.escaped = e.key === 'Escape' ? !this.escaped : false;
    });
    this.paint();
  }
  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.paint(); }
  focus(end = true) { this.ta.focus({ preventScroll: true }); if (end) { const l = this.ta.value.length; this.ta.setSelectionRange(l, l); } }
  /** Insert text at the cursor as one undoable edit (snippets never replace the source). */
  insert(text) { this.ta.focus(); document.execCommand('insertText', false, text); }
  replaceLine(line, value) {
    const lines = this.ta.value.split('\n'); let s = 0; for (let i = 0; i < line - 1; i++) s += lines[i].length + 1;
    this.ta.focus(); this.ta.setSelectionRange(s, s + lines[line - 1].length); document.execCommand('insertText', false, value);
  }
  setError(err) { this.err = err; this.paint(); }
  paint() {
    const lines = this.ta.value.split('\n'), e = this.err;
    this.hl.innerHTML = lines.map((l, i) => {
      if (e && e.line === i + 1) {
        const lead = l.match(/^\s*/)[0];
        return `${esc(lead)}<span class="ce-err">${hlLine(l.slice(lead.length)) || '&nbsp;'}</span><span class="ce-lens">  ← ${e.short || 'fix this line'}</span>`;
      }
      return hlLine(l);
    }).join('\n') + '\n';
    this.gut.innerHTML = lines.map((_, i) => `<span class="${e && e.line === i + 1 ? 'is-err' : ''}">${i + 1}</span>`).join('');
    const cols = Math.max(...lines.map((l) => l.length)) + (e ? 34 : 4);
    this.ta.style.height = `calc(${lines.length + 1} * var(--ce-lh))`; this.ta.style.width = `max(100%, ${cols}ch)`;
    this.hl.style.width = this.ta.style.width;
  }
}
