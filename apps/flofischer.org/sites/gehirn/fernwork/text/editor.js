// Textbench editor: CodeMirror 6 (vendored, same-origin) with Fernwork tokens, a JSON bracket fold service that stays
// fast on 8 MB documents, light highlighters for Markdown/log, and named decoration layers that lenses own.
import {
  EditorState, StateField, StateEffect, Compartment, RangeSetBuilder, EditorSelection,
  EditorView, Decoration, ViewPlugin, WidgetType, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, gutter, GutterMarker, highlightSpecialChars, defaultKeymap, history, historyKeymap, indentWithTab,
  codeFolding, foldGutter, foldKeymap, foldService, foldEffect, unfoldEffect, foldedRanges, syntaxHighlighting, HighlightStyle,
  bracketMatching, json, searchKeymap, highlightSelectionMatches, search, tags, undo, redo, undoDepth, redoDepth, placeholder,
} from './vendor/codemirror-6.bundle.js';

export { EditorState, EditorView, EditorSelection, Decoration, WidgetType, RangeSetBuilder, foldEffect, unfoldEffect, foldedRanges, undo, redo, undoDepth, redoDepth };

const fmt = new Intl.NumberFormat('en-US');

// ───────── JSON bracket index (one linear pass, cached per immutable doc) ─────────
const bracketCache = new WeakMap();
export function bracketIndex(doc) {
  let idx = bracketCache.get(doc);
  if (idx) return idx;
  const text = doc.toString();
  const open = new Map(); const stack = []; let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) stack.push(i);
    else if (c === 125 || c === 93) { const o = stack.pop(); if (o != null) open.set(o, i); }
  }
  idx = { open, text };
  bracketCache.set(doc, idx);
  return idx;
}
/** count direct children of the container opening at `from` */
const childCache = new WeakMap();
export function childCount(doc, from) {
  let m = childCache.get(doc); if (!m) { m = new Map(); childCache.set(doc, m); }
  if (m.has(from)) return m.get(from);
  const { open, text } = bracketIndex(doc); const to = open.get(from); if (to == null) return 0;
  let n = 0, depth = 0, inStr = false, any = false;
  for (let i = from + 1; i < to; i++) {
    const c = text.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) { inStr = true; any = true; continue; }
    if (c === 123 || c === 91) { depth++; any = true; continue; }
    if (c === 125 || c === 93) { depth--; continue; }
    if (c === 44 && depth === 0) n++;
    else if (c > 32) any = true;
  }
  const r = any ? n + 1 : 0; m.set(from, r); return r;
}
const jsonFold = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.sliceString(lineStart, lineEnd);
  const t = line.trimEnd(); const last = t[t.length - 1];
  if (last !== '{' && last !== '[') return null;
  const at = lineStart + t.length - 1;
  const close = bracketIndex(state.doc).open.get(at);
  if (close == null || state.doc.lineAt(close).number === state.doc.lineAt(at).number) return null;
  return { from: at + 1, to: close };
});
class FoldWidget extends WidgetType {
  constructor(label) { super(); this.label = label; }
  eq(o) { return o.label === this.label; }
  toDOM() { const s = document.createElement('span'); s.className = 'tb-fold'; s.textContent = this.label; s.title = 'Unfold'; return s; }
}
const folding = codeFolding({
  preparePlaceholder(state, range) {
    const open = state.doc.sliceString(range.from - 1, range.from);
    const n = childCount(state.doc, range.from - 1);
    if (open === '[') return `${fmt.format(n)} ${n === 1 ? 'item' : 'items'}`;
    // object: show the first key/value as a preview
    const peek = state.doc.sliceString(range.from, Math.min(range.to, range.from + 200)).replace(/\s+/g, ' ').trim();
    const m = /^"([^"]+)":\s*("[^"]*"|[\d.\-eE]+|true|false|null)/.exec(peek);
    return m ? `${m[1]}: ${m[2]} … ${n} keys` : `${n} keys`;
  },
  placeholderDOM(view, onclick, prepared) {
    const s = document.createElement('span'); s.className = 'tb-fold'; s.textContent = prepared; s.title = 'Unfold'; s.onclick = onclick; return s;
  },
});

// ───────── light highlighters (Markdown, log) as view plugins over the visible ranges ─────────
function regexHighlighter(rules) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
    build(view) {
      const b = new RangeSetBuilder();
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const marks = [];
          for (const [re, cls, grp = 0] of rules) {
            re.lastIndex = 0; let m; const txt = line.text.length > 20000 ? line.text.slice(0, 20000) : line.text;
            while ((m = re.exec(txt))) {
              if (!m[0].length) { re.lastIndex++; continue; }
              const s = m.index + (grp ? m[0].indexOf(m[grp]) : 0); const len = grp ? m[grp].length : m[0].length;
              marks.push([line.from + s, line.from + s + len, cls]);
              if (!re.global) break;
            }
          }
          marks.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
          let end = -1;
          for (const [a, z, cls] of marks) { if (a < end) continue; b.add(a, z, Decoration.mark({ class: cls })); end = z; }
          pos = line.to + 1;
        }
      }
      return b.finish();
    }
  }, { decorations: (v) => v.decorations });
}
const mdHighlight = regexHighlighter([
  [/^#{1,6} .*$/g, 'tb-md-h'], [/\*\*[^*]+\*\*/g, 'tb-md-b'], [/^\s*[-*] /g, 'tb-md-li'], [/^\s*\d+\. /g, 'tb-md-li'], [/„[^“]*“/g, 'tb-md-q'],
]);
const logHighlight = regexHighlighter([
  [/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/g, 'tb-log-ts'], [/\bINFO\b/g, 'tb-log-info'], [/\bWARN\b/g, 'tb-log-warn'], [/\bERROR\b/g, 'tb-log-err'],
  [/\b(form|from|subj)=/g, 'tb-log-key'], [/"[^"]*"/g, 'tb-log-str'],
]);
// big JSON (> 1 MB): highlight only the visible lines instead of a full background parse of the document
const jsonLite = regexHighlighter([
  [/"(?:[^"\\]|\\.)*"(?=\s*:)/g, 'tb-j-key'], [/:\s*("(?:[^"\\]|\\.)*")/g, 'tb-j-str', 1], [/(?<=[\[,]\s*)"(?:[^"\\]|\\.)*"/g, 'tb-j-str'],
  [/-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, 'tb-j-num'], [/\b(?:true|false|null)\b/g, 'tb-j-atom'], [/[{}\[\],:]/g, 'tb-j-punc'],
]);
const jsonStyle = HighlightStyle.define([
  { tag: tags.propertyName, class: 'tb-j-key' },
  { tag: tags.string, class: 'tb-j-str' },
  { tag: tags.number, class: 'tb-j-num' },
  { tag: [tags.bool, tags.null], class: 'tb-j-atom' },
  { tag: [tags.separator, tags.squareBracket, tags.brace, tags.punctuation], class: 'tb-j-punc' },
]);

// ───────── named decoration layers (lenses own one each) ─────────
export const setLayer = StateEffect.define();
const layers = StateField.define({
  create: () => ({}),
  update(val, tr) {
    let next = val;
    if (tr.docChanged) { next = {}; for (const k in val) next[k] = val[k].map(tr.changes); }
    for (const e of tr.effects) if (e.is(setLayer)) next = { ...next, [e.value.name]: e.value.decos || Decoration.none };
    return next;
  },
  provide: (f) => EditorView.decorations.computeN([f], (s) => Object.values(s.field(f))),
});
/** Replace a named layer: setDecos(view, 'regex', [[from, to, { class }], [pos, widget]…]) */
export function layerEffect(name, specs) {
  const b = []; for (const s of specs) b.push(s);
  b.sort((a, c) => a.from - c.from || (a.startSide ?? 0) - (c.startSide ?? 0));
  return setLayer.of({ name, decos: Decoration.set(b.map((r) => r), true) });
}
export const mark = (from, to, cls, attrs) => Decoration.mark({ class: cls, attributes: attrs }).range(from, to);
export const lineDeco = (pos, cls) => Decoration.line({ class: cls }).range(pos);
export class LabelWidget extends WidgetType {
  constructor(text, cls, onClick) { super(); this.text = text; this.cls = cls; this.onClick = onClick; }
  eq(o) { return o.text === this.text && o.cls === this.cls; }
  toDOM() { const s = document.createElement('span'); s.className = this.cls; s.textContent = this.text; if (this.onClick) { s.onmousedown = (e) => { e.preventDefault(); this.onClick(e); }; s.style.cursor = 'pointer'; } return s; }
  ignoreEvent() { return !this.onClick; }
}
export const widget = (pos, text, cls, side = 1, onClick) => Decoration.widget({ widget: new LabelWidget(text, cls, onClick), side }).range(pos);

// error gutter marker
class DotMarker extends GutterMarker { toDOM() { const s = document.createElement('span'); s.className = 'tb-gutter-err'; s.title = 'Error on this line'; return s; } }
export const setErrorLine = StateEffect.define();
const errorLine = StateField.define({
  create: () => null,
  update(v, tr) { for (const e of tr.effects) if (e.is(setErrorLine)) return e.value; return v != null && tr.docChanged ? tr.changes.mapPos(v) : v; },
});
const errGutter = gutter({
  class: 'tb-gutter-lint',
  lineMarker(view, line) { const p = view.state.field(errorLine); return p != null && p >= line.from && p <= line.to ? new DotMarker() : null; },
  lineMarkerChange: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setErrorLine))) || u.docChanged,
  initialSpacer: () => new DotMarker(),
});

// flash a line (Jump to …)
export const flash = StateEffect.define();
const flashField = StateField.define({
  create: () => Decoration.none,
  update(v, tr) {
    v = v.map(tr.changes);
    for (const e of tr.effects) if (e.is(flash)) v = e.value == null ? Decoration.none : Decoration.set([Decoration.line({ class: 'tb-flash' }).range(tr.state.doc.lineAt(e.value).from)]);
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ───────── state factory ─────────
export const langConf = new Compartment();
export const wrapConf = new Compartment();
export const roConf = new Compartment();
export function langExt(kind, size = 0) {
  if (kind === 'json') return [...(size > 1e6 ? [jsonLite] : [json(), syntaxHighlighting(jsonStyle)]), jsonFold, foldGutter({ markerDOM: (open) => { const s = document.createElement('span'); s.className = 'tb-foldmark' + (open ? '' : ' is-closed'); s.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'; return s; } })];
  if (kind === 'md') return [mdHighlight];
  if (kind === 'log') return [logHighlight];
  return [];
}
export function makeState(doc, { kind = 'text', wrap = kind !== 'json' && kind !== 'log', numbers = true, readOnly = false, hint = '', extra = [] } = {}) {
  return EditorState.create({
    doc,
    extensions: [
      numbers ? [lineNumbers({ formatNumber: (n) => fmt.format(n) }), errGutter, highlightActiveLineGutter()] : [],
      readOnly ? [EditorState.readOnly.of(true)] : [],
      highlightSpecialChars({ addSpecialChars: /[\u00a0\u00ad\u200b-\u200d\u2060\ufeff]/, render: specialChar }),
      history(),
      folding,
      drawSelection(),
      numbers ? highlightActiveLine() : [],
      bracketMatching(),
      highlightSelectionMatches(),
      search({ top: true }),
      langConf.of(langExt(kind, doc.length)),
      wrapConf.of(wrap ? EditorView.lineWrapping : []),
      roConf.of([]),
      layers, errorLine, flashField,
      EditorState.tabSize.of(2),
      placeholder(hint),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap, indentWithTab]),
      ...extra,
    ],
  });
}
// invisible characters become visible, named chips (NBSP, ZWSP, SHY…)
const SPECIAL = { 0xa0: ['·', 'No-break space'], 0xad: ['-', 'Soft hyphen'], 0x200b: ['|', 'Zero-width space'], 0x200c: ['|', 'Zero-width non-joiner'], 0x200d: ['|', 'Zero-width joiner'], 0x2060: ['|', 'Word joiner'], 0xfeff: ['⁂', 'Byte order mark'] };
function specialChar(code, desc, placeholderText) {
  const s = document.createElement('span');
  const [g, name] = SPECIAL[code] || [placeholderText, desc];
  s.className = 'tb-invisible'; s.textContent = g; s.title = `${name} (U+${code.toString(16).toUpperCase().padStart(4, '0')})`;
  return s;
}

export function createView(parent, { state, onUpdate, domHandlers = {} }) {
  return new EditorView({
    parent, state,
    dispatchTransactions(trs, view) { view.update(trs); onUpdate?.(view, trs); },
    extensions: [],
  });
}
export const domHandlersExt = (h) => EditorView.domEventHandlers(h);
export { keymap, EditorView as View };
