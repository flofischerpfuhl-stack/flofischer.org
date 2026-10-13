// Stats lens: grapheme-correct counts, sentence ranges with DE/EN abbreviation + date rules (audit T26),
// readability (Amstad for German, Flesch for English), reading/speaking time, top words.

const segW = new Intl.Segmenter('de', { granularity: 'word' });
const segG = new Intl.Segmenter('de', { granularity: 'grapheme' });
const ABBR = new Set('z b d h u a o ä ca bzw usw vgl etc ggf inkl evtl nr dr prof dipl ing str abs gem mr mrs ms vs e g i e no fig'.split(' '));
const MONTHS = /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\b/;
const STOP = new Set(('der die das und in zu den von mit ist im für auf dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen so zum war haben nur oder aber vor zur bis mehr durch man sein wurde sei '
  + 'des beim vom wurden dieser diese '
  + 'the a an and of to in is it that for on with as was at by be this are from or have not but').split(' '));

export function sentences(text) {
  const out = []; let start = 0;
  const re = /[.!?…]+["“”»)]*(?=\s+|$)/g; let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    const word = (/([\p{L}\p{N}]+)$/u.exec(before) || [])[1] || '';
    const after = text.slice(end).replace(/^\s+/, '');
    if (m[0][0] === '.' && (ABBR.has(word.toLowerCase()) && word.length <= 4)) continue;
    if (m[0][0] === '.' && /^\d{1,2}$/.test(word) && (MONTHS.test(after) || /^\d/.test(after))) continue;
    if (m[0] === '.' && /^\d{1,3}$/.test(word) && /(^|\n)\s*\d{1,3}$/.test(text.slice(Math.max(0, m.index - 6), m.index))) continue; // "1. Heading"

    if (after && !/^[\p{Lu}\d„"“»(#-]/u.test(after)) continue;
    pushSentence(start, end); start = end;
  }
  pushSentence(start, text.length);
  function pushSentence(a, b) {
    // split at paragraph/heading breaks too
    const chunk = text.slice(a, b); let off = a;
    for (const part of chunk.split(/\n\s*\n/)) {
      const lead = part.length - part.trimStart().length; const s = off + lead, e = off + part.trimEnd().length;
      const str = text.slice(s, e);
      const heading = !/[.!?…:]["“”»)]*$/.test(str) && !str.includes('\n') && str.length < 90;
      if (e > s && /[\p{L}\p{N}]/u.test(str) && !heading) out.push({ from: s, to: e });
      off += part.length + (text.slice(off + part.length).match(/^\n\s*\n/)?.[0].length || 0);
    }
  }
  return out;
}
export function words(text) { let n = 0; for (const s of segW.segment(text)) if (s.isWordLike) n++; return n; }
export function graphemes(text) { let n = 0; for (const _ of segG.segment(text)) n++; return n; }
const syl = (w) => Math.max(1, (w.toLowerCase().match(/[aeiouyäöü]+/g) || []).length);

export function analyze(text, { long = 22 } = {}) {
  const ws = []; for (const s of segW.segment(text)) if (s.isWordLike) ws.push(s.segment);
  const chars = graphemes(text);
  const noSpace = graphemes(text.replace(/\s/g, ''));
  const sents = sentences(text).map((s) => ({ ...s, words: words(text.slice(s.from, s.to)) }));
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const bytes = new TextEncoder().encode(text).length;
  const de = ws.filter((w) => /^(der|die|das|und|ist|nicht|mit|für|wurde|werden)$/i.test(w)).length;
  const en = ws.filter((w) => /^(the|and|is|not|with|for|was|were|of)$/i.test(w)).length;
  const lang = de >= en ? 'de' : 'en';
  const asl = ws.length / Math.max(1, sents.length);
  const asw = ws.reduce((s, w) => s + syl(w), 0) / Math.max(1, ws.length);
  const score = lang === 'de' ? 180 - asl - 58.5 * asw : 206.835 - 1.015 * asl - 84.6 * asw;
  const freq = new Map(); for (const w of ws) { const k = w.toLowerCase(); if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k)) continue; freq.set(k, (freq.get(k) || 0) + 1); }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    words: ws.length, chars, noSpace, sentences: sents.length, paragraphs: paras, bytes, lang,
    lines: text.split('\n').length,
    readMin: ws.length / (lang === 'de' ? 200 : 238), speakMin: ws.length / 130,
    readability: Math.round(Math.max(0, Math.min(100, score))), readLabel: label(score),
    longSentences: sents.filter((s) => s.words > long), sents, top, avgSentence: asl,
  };
}
function label(s) { return s >= 70 ? 'Easy' : s >= 50 ? 'Fairly easy' : s >= 30 ? 'Difficult' : 'Very difficult'; }
export function fmtTime(min) { if (min < 1) return `${Math.max(1, Math.round(min * 60))} s`; const m = Math.floor(min), s = Math.round((min - m) * 60); return s ? `${m} min ${s} s` : `${m} min`; }
export const TARGETS = [
  { id: 'none', label: 'None' }, { id: 'meta', label: 'Meta 155', max: 155, unit: 'chars', sub: 'Search snippet' },
  { id: 'tweet', label: 'Post 280', max: 280, unit: 'chars', sub: 'X / Mastodon 500' }, { id: 'sms', label: 'SMS 160', max: 160, unit: 'chars' },
  { id: 'title', label: 'Title 60', max: 60, unit: 'chars', sub: 'Page title' },
];
