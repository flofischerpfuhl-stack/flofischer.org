// Regex lens engine: a small parser that explains JavaScript patterns as a tree, a static nested-quantifier check,
// and a Worker runner with a hard time limit (terminate + calm explanation instead of a frozen tab).

export function parseRegex(src) {
  let i = 0, groupNo = 0;
  const peek = () => src[i], eat = () => src[i++];
  function alt() {
    const opts = [seq()];
    while (peek() === '|') { eat(); opts.push(seq()); }
    return opts.length === 1 ? opts[0] : { type: 'alt', options: opts };
  }
  function seq() {
    const items = [];
    while (i < src.length && peek() !== '|' && peek() !== ')') {
      const start = i; let a = atom(); if (!a) break;
      const q = quant(); if (q) a = { type: 'quant', q, body: a, src: src.slice(start, i) };
      a.src = a.src || src.slice(start, i);
      // merge literal runs
      const last = items[items.length - 1];
      if (a.type === 'lit' && last && last.type === 'lit') { last.value += a.value; last.src += a.src; } else items.push(a);
    }
    return items.length === 1 ? items[0] : { type: 'seq', items };
  }
  function quant() {
    const c = peek(); let q = null;
    if (c === '*') { eat(); q = { min: 0, max: Infinity }; }
    else if (c === '+') { eat(); q = { min: 1, max: Infinity }; }
    else if (c === '?') { eat(); q = { min: 0, max: 1 }; }
    else if (c === '{') { const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i)); if (m) { i += m[0].length; q = { min: +m[1], max: m[2] ? (m[3] ? +m[3] : Infinity) : +m[1] }; } }
    if (q && peek() === '?') { eat(); q.lazy = true; }
    return q;
  }
  function atom() {
    const c = eat();
    if (c === '(') {
      let kind = 'cap', name = null, idx = null;
      if (src.startsWith('?:', i)) { i += 2; kind = 'nc'; }
      else if (src.startsWith('?=', i)) { i += 2; kind = 'la'; }
      else if (src.startsWith('?!', i)) { i += 2; kind = 'nla'; }
      else if (src.startsWith('?<=', i)) { i += 3; kind = 'lb'; }
      else if (src.startsWith('?<!', i)) { i += 3; kind = 'nlb'; }
      else if (src.startsWith('?<', i)) { const m = /^\?<([A-Za-z_$][\w$]*)>/.exec(src.slice(i)); if (m) { i += m[0].length; name = m[1]; } else throw err('Group name is missing', i); }
      if (kind === 'cap') idx = ++groupNo;
      const body = alt();
      if (eat() !== ')') throw err('Unclosed group (', i);
      return { type: 'group', kind, name, idx, body };
    }
    if (c === '[') {
      let neg = false; if (peek() === '^') { eat(); neg = true; }
      const parts = []; let closed = false;
      while (i < src.length) {
        let d = eat();
        if (d === ']' && parts.length) { closed = true; break; }
        if (d === ']') { closed = true; break; }
        if (d === '\\') { d = '\\' + eat(); }
        if (peek() === '-' && src[i + 1] && src[i + 1] !== ']') { eat(); let e = eat(); if (e === '\\') e = '\\' + eat(); parts.push({ range: [d, e] }); }
        else parts.push({ ch: d });
      }
      if (!closed) throw err('Unclosed character class [', i);
      return { type: 'class', neg, parts };
    }
    if (c === '\\') {
      const d = eat();
      if (d === undefined) throw err('Pattern ends with \\', i);
      if ('wdsWDSbB'.includes(d)) return { type: 'esc', value: d };
      if (/[1-9]/.test(d)) return { type: 'backref', value: d };
      if (d === 'k') { const m = /^<([^>]+)>/.exec(src.slice(i)); if (m) { i += m[0].length; return { type: 'backref', value: m[1] }; } }
      if (d === 'u' || d === 'x') { const m = (d === 'u' ? /^[0-9a-fA-F]{4}/ : /^[0-9a-fA-F]{2}/).exec(src.slice(i)); if (m) { i += m[0].length; return { type: 'lit', value: String.fromCharCode(parseInt(m[0], 16)) }; } }
      if (d === 'n') return { type: 'lit', value: '\n', show: '\\n' };
      if (d === 't') return { type: 'lit', value: '\t', show: '\\t' };
      return { type: 'lit', value: d };
    }
    if (c === '.') return { type: 'dot' };
    if (c === '^') return { type: 'anchor', value: '^' };
    if (c === '$') return { type: 'anchor', value: '$' };
    if (c === '*' || c === '+' || c === '?') throw err(`Nothing to repeat before ${c}`, i - 1);
    if (c === ')') throw err('Unmatched )', i - 1);
    return { type: 'lit', value: c };
  }
  function err(msg, at) { const e = new Error(msg); e.at = at; return e; }
  const tree = alt();
  if (i < src.length) { if (src[i] === ')') throw err('Unmatched )', i); throw err('Unexpected ' + src[i], i); }
  return { tree, groups: groupNo };
}

const ESC = { w: 'word character (a–z, A–Z, 0–9, _)', d: 'digit 0–9', s: 'whitespace', W: 'not a word character', D: 'not a digit', S: 'not whitespace', b: 'word boundary', B: 'not a word boundary' };
const classPart = (p) => (p.range ? `${show(p.range[0])}–${show(p.range[1])}` : p.ch.startsWith('\\') ? (ESC[p.ch[1]] ? ESC[p.ch[1]].replace(/ \(.*\)/, '') : `“${p.ch[1]}”`) : `“${p.ch}”`);
const show = (s) => s.replace(/^\\/, '');
export function quantText(q) {
  const base = q.min === 0 && q.max === Infinity ? 'zero or more' : q.min === 1 && q.max === Infinity ? 'one or more' : q.min === 0 && q.max === 1 ? 'optional' : q.max === Infinity ? `${q.min} or more` : q.min === q.max ? `exactly ${q.min}` : `${q.min} to ${q.max}`;
  return base + (q.lazy ? ', as few as possible' : '');
}

/** Flatten the tree into explanation rows: { depth, label, detail, src, group } */
export function explain(tree, { multiline = false } = {}) {
  const rows = [];
  const walk = (n, depth, ctxGroup) => {
    switch (n.type) {
      case 'seq': n.items.forEach((x) => walk(x, depth, ctxGroup)); break;
      case 'alt': rows.push({ depth, label: 'Either', detail: `${n.options.length} alternatives`, group: ctxGroup }); n.options.forEach((o, k) => { rows.push({ depth: depth + 1, label: `Option ${k + 1}`, group: ctxGroup }); walk(o, depth + 2, ctxGroup); }); break;
      case 'quant': {
        const inner = n.body;
        if (inner.type === 'group') { const at = rows.length; walk(inner, depth, ctxGroup); rows[at].detail = (rows[at].detail ? rows[at].detail + ' · ' : '') + `repeated ${quantText(n.q)}`; rows[at].src = n.src; break; }
        const r = describe(inner); rows.push({ depth, label: r.label, detail: `${r.detail ? r.detail + ' · ' : ''}${quantText(n.q)}`, src: n.src, group: ctxGroup }); break;
      }
      case 'group': {
        const g = n.kind === 'cap' ? n.idx : null;
        const label = n.kind === 'cap' ? (n.name ? `Group “${n.name}”` : `Group ${n.idx}`) : { nc: 'Group (not captured)', la: 'Followed by', nla: 'Not followed by', lb: 'Preceded by', nlb: 'Not preceded by' }[n.kind];
        rows.push({ depth, label, detail: n.kind === 'cap' ? `captures #${n.idx}` : '', group: g ?? ctxGroup, isGroupHead: true, cap: g });
        walk(n.body, depth + 1, g ?? ctxGroup); break;
      }
      default: { const r = describe(n); rows.push({ depth, label: r.label, detail: r.detail, src: n.src, group: ctxGroup }); }
    }
  };
  function describe(n) {
    if (n.type === 'lit') return { label: n.value.length > 1 ? `Text “${n.show || n.value}”` : `Character “${n.show || n.value}”` };
    if (n.type === 'class') return { label: n.neg ? 'Any character except' : 'One of', detail: n.parts.map(classPart).join(', ') };
    if (n.type === 'esc') return { label: n.value === 'b' || n.value === 'B' ? ESC[n.value][0].toUpperCase() + ESC[n.value].slice(1) : 'Any ' + ESC[n.value] };
    if (n.type === 'dot') return { label: 'Any character', detail: 'except line breaks' };
    if (n.type === 'anchor') return { label: n.value === '^' ? (multiline ? 'Start of line' : 'Start of text') : multiline ? 'End of line' : 'End of text' };
    if (n.type === 'backref') return { label: `Same text as group ${n.value}` };
    if (n.type === 'group' || n.type === 'seq' || n.type === 'alt') return { label: 'Group' };
    return { label: n.type };
  }
  walk(tree, 0, null);
  return rows;
}

/** Static check: a repeated group whose body also repeats → returns the offending source slice. */
export function nestedQuantifier(tree) {
  let hit = null;
  const hasInnerRepeat = (n) => {
    if (!n) return false;
    if (n.type === 'quant' && n.q.max === Infinity) return true;
    if (n.type === 'seq') return n.items.some(hasInnerRepeat);
    if (n.type === 'alt') return n.options.some(hasInnerRepeat);
    if (n.type === 'group') return hasInnerRepeat(n.body);
    if (n.type === 'quant') return hasInnerRepeat(n.body);
    return false;
  };
  const walk = (n) => {
    if (!n || hit) return;
    if (n.type === 'quant' && n.q.max === Infinity && n.body.type === 'group' && hasInnerRepeat(n.body.body)) { hit = n.src; return; }
    if (n.type === 'seq') n.items.forEach(walk); else if (n.type === 'alt') n.options.forEach(walk); else if (n.type === 'group') walk(n.body); else if (n.type === 'quant') walk(n.body);
  };
  walk(tree);
  return hit;
}
export function saferPattern(src) {
  const m = /\((\\[wd]|\[[^\]]+\])\+(\\s|\s)\?\)\+/.exec(src);
  if (m) return src.replace(m[0], `${m[1]}+(?:${m[2]}${m[1]}+)*`);
  return null;
}

/** Runs patterns in a Worker; a job that exceeds `limit` ms is killed and reported as { timeout: true }. */
export class RegexRunner {
  constructor(url, limit = 1000) { this.url = url; this.limit = limit; this.seq = 0; this.spawn(); }
  spawn() { this.w = new Worker(this.url); this.busy = null; }
  run(job) {
    if (this.busy) { this.w.terminate(); this.busy.reject({ cancelled: true }); this.spawn(); }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const timer = setTimeout(() => { this.w.terminate(); this.spawn(); reject({ timeout: true, ms: performance.now() - t0 }); }, this.limit);
      this.busy = { id, reject: (e) => { clearTimeout(timer); reject(e); } };
      this.w.onmessage = (e) => { if (e.data.id !== id) return; clearTimeout(timer); this.busy = null; if (e.data.error) reject({ error: e.data.error }); else resolve(e.data); };
      this.w.postMessage({ id, ...job });
    });
  }
}
