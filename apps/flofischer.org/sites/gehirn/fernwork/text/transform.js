// Transform lens: chainable recipe steps (CyberChef-style) with live change counts and editor preview marks,
// plus case conversions that keep punctuation, line breaks, emoji and ALL-CAPS words (fixes audit T04/T05).

const lines = (t) => t.split('\n');
const isListLine = (l) => /^\s*([-*•–]|\d+[.)])\s+/.test(l);
const HEADER_RE = /^\s*[-–]\s*\d+\s*[-–]\s*$|\bSeite \d+( von \d+)?\b|\bPage \d+( of \d+)?\b/;
function headerLines(text) {
  const ls = lines(text); const seen = new Map();
  ls.forEach((l) => { const k = l.replace(/\d+/g, '#').trim(); if (k.length > 8) seen.set(k, (seen.get(k) || 0) + 1); });
  const out = new Set();
  ls.forEach((l, i) => { const k = l.replace(/\d+/g, '#').trim(); if (HEADER_RE.test(l) || (k.length > 8 && k.length < 90 && seen.get(k) >= 2 && /#/.test(k))) out.add(i); });
  return out;
}
const CONJ = /^(und|oder|bzw|sowie|and|or)\b/;
function joinable(ls, i, skip) {
  const a = ls[i], b = ls[i + 1];
  if (b == null || skip.has(i) || skip.has(i + 1)) return false;
  if (!a.trim() || !b.trim()) return false;
  if (isListLine(b) && (isListLine(a) || /:\s*$/.test(a) || !/^\s*\d+\.\s+\p{Lu}\p{Ll}+\s+\d{4}/u.test(b))) return false;
  if (a.trim().length < 45) return false; // headings, last lines of paragraphs
  if (/^#{1,6} /.test(a)) return false;
  return true;
}

export const STEPS = {
  headers: {
    label: 'Remove page headers & numbers', unit: ['header line', 'header lines'], sign: '−',
    run(t) { const h = headerLines(t); if (!h.size) return { text: t, count: 0 }; return { text: lines(t).filter((_, i) => !h.has(i)).join('\n'), count: h.size }; },
    marks(t) { const h = headerLines(t); const out = []; let pos = 0; lines(t).forEach((l, i) => { if (h.has(i)) out.push({ from: pos, to: pos + l.length, kind: 'header' }); pos += l.length + 1; }); return out; },
  },
  hyphen: {
    label: 'Rejoin words split by hyphens', unit: ['hyphen', 'hyphens'], sign: '−',
    run(t) { let n = 0; const s = t.replace(/([a-zäöüß])-\n(?=([a-zäöüß]+))/g, (m, a, w) => (CONJ.test(w) ? m : (n++, a))); return { text: s, count: n }; },
    marks(t) { const out = []; const re = /([a-zäöüß])-\n(?=([a-zäöüß]+))/g; let m; while ((m = re.exec(t))) if (!CONJ.test(m[2])) out.push({ from: m.index + 1, to: m.index + 2, kind: 'hyphen' }); return out; },
  },
  join: {
    label: 'Join hard-wrapped lines', unit: ['line break', 'line breaks'], sign: '−',
    run(t) { const ls = lines(t); const out = []; let n = 0; let acc = ls[0]; let prev = false; const skip = new Set();
      for (let i = 0; i < ls.length; i++) {
        if (i > 0) { if (prev) acc = acc.replace(/\s+$/, '') + ' ' + ls[i].replace(/^\s+/, ''); else { out.push(acc); acc = ls[i]; } }
        prev = joinable(ls, i, skip); if (prev) n++;
      }
      out.push(acc);
      return { text: out.join('\n'), count: n }; },
    marks(t, skip = new Set()) { const ls = lines(t); const out = []; let pos = 0; ls.forEach((l, i) => { if (joinable(ls, i, skip)) out.push({ from: pos + l.length, to: pos + l.length + 1, kind: 'join' }); pos += l.length + 1; }); return out; },
  },
  invisible: {
    label: 'Normalize spaces & invisible characters', unit: ['invisible character', 'invisible characters'], sign: '−',
    run(t) { let n = 0; const s = t.replace(/[  ]/g, () => (n++, ' ')).replace(/[­​-‍⁠﻿]/g, () => (n++, '')).replace(/[ \t]{2,}/g, (m) => (n++, ' ')).replace(/[ \t]+$/gm, (m) => (n++, '')); return { text: s, count: n }; },
    marks(t) { const out = []; const re = /[  ­​-‍⁠﻿]/g; let m; while ((m = re.exec(t))) out.push({ from: m.index, to: m.index + 1, kind: 'invisible' }); return out; },
  },
  ligatures: {
    label: 'Ligatures ﬁ ﬂ → fi fl', unit: ['ligature', 'ligatures'], sign: '',
    run(t) { let n = 0; const s = t.replace(/[ﬀ-ﬆ]/g, (c) => (n++, c.normalize('NFKC'))); return { text: s, count: n }; },
    marks(t) { const out = []; const re = /[ﬀ-ﬆ]/g; let m; while ((m = re.exec(t))) out.push({ from: m.index, to: m.index + 1, kind: 'ligature' }); return out; },
  },
  quotes: {
    label: 'Smart quotes → "straight"', unit: ['quote', 'quotes'], sign: '',
    run(t) { let n = 0; const s = t.replace(/[„“”«»]/g, () => (n++, '"')).replace(/[‚‘’‹›]/g, () => (n++, "'")); return { text: s, count: n }; },
    marks(t) { const out = []; const re = /[„“”«»‚‘’]/g; let m; while ((m = re.exec(t))) out.push({ from: m.index, to: m.index + 1, kind: 'quote' }); return out; },
  },
  trim: { label: 'Trim each line', unit: ['line', 'lines'], sign: '', run(t) { let n = 0; const s = lines(t).map((l) => { const x = l.trim(); if (x !== l) n++; return x; }).join('\n'); return { text: s, count: n }; } },
  unique: { label: 'Remove duplicate lines', unit: ['duplicate', 'duplicates'], sign: '−', run(t) { const seen = new Set(); let n = 0; const ls = lines(t); const trail = ls[ls.length - 1] === ''; const s = ls.filter((l, i) => { if (trail && i === ls.length - 1) return true; if (seen.has(l)) { n++; return false; } seen.add(l); return true; }).join('\n'); return { text: s, count: n }; } },
  sort: { label: 'Sort lines A→Z', unit: ['line', 'lines'], sign: '', run(t) { const ls = lines(t); const trail = ls[ls.length - 1] === '' ? ls.pop() : null; const s = [...ls].sort((a, b) => a.localeCompare(b, 'de')); const n = s.filter((l, i) => l !== ls[i]).length; return { text: s.join('\n') + (trail != null ? '\n' : ''), count: n }; } },
  blank: { label: 'Collapse blank lines (keep paragraphs)', unit: ['blank line', 'blank lines'], sign: '−', run(t) { let n = 0; const s = t.replace(/\n{3,}/g, (m) => { n += m.length - 2; return '\n\n'; }); return { text: s, count: n }; } },
  snake: { label: 'snake_case each line', unit: ['line', 'lines'], sign: '', run(t) { let n = 0; const s = lines(t).map((l) => { const x = toSnake(l); if (x !== l) n++; return x; }).join('\n'); return { text: s, count: n }; } },
};
export const PRESETS = [
  { id: 'pdf', label: 'Fix PDF/Word paste', steps: [['headers', true], ['hyphen', true], ['join', true], ['invisible', true], ['ligatures', true], ['quotes', false]] },
  { id: 'unique', label: 'Unique + sorted lines', steps: [['trim', true], ['unique', true], ['sort', true]] },
  { id: 'snake', label: 'snake_case IDs', steps: [['trim', true], ['snake', true], ['unique', true]] },
];
export const ADDABLE = ['headers', 'hyphen', 'join', 'invisible', 'ligatures', 'quotes', 'trim', 'unique', 'sort', 'blank', 'snake'];

/** Run the enabled steps in order → { text, results: [{ id, count }] } */
export function runRecipe(text, recipe) {
  let cur = text; const results = [];
  for (const s of recipe) {
    if (!s.on) { results.push({ id: s.id, count: null }); continue; }
    const r = STEPS[s.id].run(cur); cur = r.text; results.push({ id: s.id, count: r.count });
  }
  return { text: cur, results };
}
/** Preview marks on the ORIGINAL text for steps that support it. */
export function previewMarks(text, recipe) {
  const on = new Set(recipe.filter((s) => s.on).map((s) => s.id));
  const out = [];
  const skip = on.has('headers') ? headerLines(text) : new Set();
  for (const id of on) { const st = STEPS[id]; if (!st.marks) continue; out.push(...(id === 'join' ? st.marks(text, skip) : st.marks(text))); }
  // a hyphen-break is shown as hyphen (not also as a join)
  const hy = new Set(out.filter((m) => m.kind === 'hyphen').map((m) => m.to));
  return out.filter((m) => !(m.kind === 'join' && hy.has(m.from)));
}
export function summaryLine(results) {
  return results.filter((r) => r.count).map((r) => { const st = STEPS[r.id]; return `${st.sign}${r.count} ${r.count === 1 ? st.unit[0] : st.unit[1]}`; });
}

// ───────── case conversions (selection-aware, punctuation-safe) ─────────
const SMALL = new Set('a an and as at but by for in nor of on or the to via vs'.split(' '));
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;
const isAllCaps = (w) => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase();
export const CASES = {
  upper: { label: 'UPPER', fn: (s) => s.replace(/ß/g, 'SS').toUpperCase() },
  lower: { label: 'lower', fn: (s) => s.toLowerCase() },
  title: { label: 'Title Case', fn: (s) => { let first = true; return s.replace(WORD, (w, off) => { const keep = isAllCaps(w) || /^.+\p{Lu}/u.test(w); const small = !first && SMALL.has(w.toLowerCase()) && !/[.:!?]\s*$/.test(s.slice(0, off)); first = false; if (keep) return w; if (small) return w.toLowerCase(); return w[0].toUpperCase() + w.slice(1).toLowerCase(); }); } },
  sentence: { label: 'Sentence case', fn: (s) => s.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (m, a, c, off) => { const before = s.slice(Math.max(0, off - 12), off + 1); if (/[.]\s*$/.test(a) && /(^|\s)(\p{Ll}|ca|bzw|usw|vgl|etc|e\.g|i\.e|Nr|Dr|ggf|inkl)\.$/u.test(before.trimEnd())) return m; return a + c.toUpperCase(); }) },
  camel: { label: 'camelCase', fn: (s) => s.replace(/[^\n]+/g, (l) => { const ws = l.match(WORD) || []; return ws.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(''); }) },
  snake: { label: 'snake_case', fn: (s) => s.replace(/[^\n]+/g, toSnake) },
  kebab: { label: 'kebab-case', fn: (s) => s.replace(/[^\n]+/g, (l) => toSnake(l).replace(/_/g, '-')) },
};
function toSnake(l) { return (l.normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[A-Za-z0-9]+/g) || []).map((w) => w.toLowerCase()).join('_'); }
