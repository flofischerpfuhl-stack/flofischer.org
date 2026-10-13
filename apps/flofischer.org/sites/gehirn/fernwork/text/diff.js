// Compare engine for the Textbench Compare lens: Myers line diff, word-level diff for changed line pairs,
// moved-block detection (like git --color-moved), folding of unchanged runs, and a real unified patch.
// (The real build runs this in the text worker with a linear-space Myers and a size guard.)

export function myers(a, b, eq = (x, y) => x === y) {
  const n = a.length, m = b.length, max = n + m, off = max + 1;
  let v = new Int32Array(2 * max + 3); v[off + 1] = 0; const trace = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x], b[y])) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { trace.push(v.slice()); break outer; }
    }
  }
  // backtrack
  const ops = []; let x = n, y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    const vv = trace[d]; const k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const px = vv[off + prevK], py = px - prevK;
    while (x > px && y > py) { ops.push({ t: 'eq', a: x - 1, b: y - 1 }); x--; y--; }
    if (d > 0) { if (x === px) ops.push({ t: 'ins', b: y - 1 }); else ops.push({ t: 'del', a: x - 1 }); }
    x = px; y = py;
  }
  while (x > 0 && y > 0) { ops.push({ t: 'eq', a: x - 1, b: y - 1 }); x--; y--; }
  return ops.reverse();
}

const TOK = /\s+|[\p{L}\p{N}][\p{L}\p{N}.,/%-]*[\p{L}\p{N}%]|[\p{L}\p{N}]|[^\s\p{L}\p{N}]/gu;
export const tokens = (s) => s.match(TOK) || [];
/** word diff → { a: [[text, 'eq'|'del']], b: [[text, 'eq'|'ins']], sim } */
export function wordDiff(sa, sb, { ignoreCase = false } = {}) {
  const ta = tokens(sa), tb = tokens(sb);
  const norm = (t) => (ignoreCase ? t.toLowerCase() : t);
  const ops = myers(ta.map(norm), tb.map(norm));
  const A = [], B = []; let same = 0;
  const push = (arr, t, k) => { const last = arr[arr.length - 1]; if (last && last[1] === k) last[0] += t; else arr.push([t, k]); };
  for (const o of ops) {
    if (o.t === 'eq') { push(A, ta[o.a], 'eq'); push(B, tb[o.b], 'eq'); if (/\S/.test(ta[o.a])) same += ta[o.a].length; }
    else if (o.t === 'del') push(A, ta[o.a], 'del');
    else push(B, tb[o.b], 'ins');
  }
  // glue whitespace between two changed pieces into the change so highlights read as phrases
  for (const arr of [A, B]) for (let i = 1; i < arr.length - 1; i++) if (arr[i][1] === 'eq' && !/\S/.test(arr[i][0]) && arr[i - 1][1] !== 'eq' && arr[i + 1][1] === arr[i - 1][1]) { arr[i - 1][0] += arr[i][0] + arr[i + 1][0]; arr.splice(i, 2); i--; }
  const len = Math.max(1, Math.max(sa.replace(/\s/g, '').length, sb.replace(/\s/g, '').length));
  return { a: A, b: B, sim: Math.min(1, same / len) };
}

/**
 * compare(textA, textB, opts) → { rows, hunks, stats, moved, identical }
 * rows: { k: 'eq'|'chg'|'del'|'ins'|'fold', a: {n, text, segs?}, b: {n, text, segs?}, hunk, move: {id, side, other} }
 */
export function compare(textA, textB, { ignoreWs = false, ignoreCase = false, context = 2 } = {}) {
  const A = textA.replace(/\r\n/g, '\n').split('\n'), B = textB.replace(/\r\n/g, '\n').split('\n');
  if (A[A.length - 1] === '' && B[B.length - 1] === '') { A.pop(); B.pop(); }
  const norm = (s) => { let t = ignoreWs ? s.replace(/\s+/g, ' ').trim() : s; return ignoreCase ? t.toLowerCase() : t; };
  const ops = myers(A.map(norm), B.map(norm));
  // group into runs
  const raw = []; let i = 0;
  while (i < ops.length) {
    if (ops[i].t === 'eq') { raw.push({ k: 'eq', a: ops[i].a, b: ops[i].b }); i++; continue; }
    const dels = [], ins = [];
    while (i < ops.length && ops[i].t !== 'eq') { if (ops[i].t === 'del') dels.push(ops[i].a); else ins.push(ops[i].b); i++; }
    // pair similar lines in order; reflowed text (several old lines → one new line) pairs as one change
    let p = 0, q = 0;
    const bare = (t) => t.replace(/[\s\u00ad\u200b-]/g, '');
    while (p < dels.length && q < ins.length) {
      const target = bare(B[ins[q]]).length; if (target < 30) break;
      let k = p, acc = 0; while (k < dels.length && acc < target * 0.92) { acc += bare(A[dels[k]]).length; k++; }
      if (k - p < 2) break;
      let best = null;
      for (let kk = k; kk <= Math.min(dels.length, k + 4); kk++) {
        const joined = dels.slice(p, kk).map((x) => A[x]).join('\n');
        const w = wordDiff(joined, B[ins[q]], { ignoreCase });
        if (!best || w.sim > best.w.sim + 0.01) best = { k: kk, joined, w };
      }
      k = best.k; const { joined, w } = best;
      if (w.sim < 0.6) break;
      raw.push({ k: 'chg', a: dels[p], aTo: dels[k - 1], aText: joined, b: ins[q], w }); p = k; q++;
    }
    while (p < dels.length || q < ins.length) {
      if (p < dels.length && q < ins.length) {
        const w = wordDiff(A[dels[p]], B[ins[q]], { ignoreCase });
        if (w.sim >= 0.35 || (A[dels[p]].trim() === '' && B[ins[q]].trim() === '')) { raw.push({ k: 'chg', a: dels[p], b: ins[q], w }); p++; q++; continue; }
        const w2 = q + 1 < ins.length ? wordDiff(A[dels[p]], B[ins[q + 1]], { ignoreCase }) : null;
        if (w2 && w2.sim >= 0.35) { raw.push({ k: 'ins', b: ins[q] }); q++; continue; }
        raw.push({ k: 'del', a: dels[p] }); p++; continue;
      }
      if (p < dels.length) raw.push({ k: 'del', a: dels[p++] }); else raw.push({ k: 'ins', b: ins[q++] });
    }
  }
  // moved blocks: deleted lines that reappear verbatim as inserted lines elsewhere (≥ 30 chars)
  const insByText = new Map();
  raw.forEach((r, idx) => { if (r.k === 'ins' && B[r.b].trim().length >= 30) insByText.set(norm(B[r.b]), idx); });
  let moveId = 0; const moved = [];
  for (let idx = 0; idx < raw.length; idx++) {
    const r = raw[idx];
    if (r.k !== 'del' || r.move) continue;
    const j = insByText.get(norm(A[r.a]));
    if (j == null || raw[j].move) continue;
    const id = ++moveId; let len = 0;
    let x = idx, y = j;
    while (x < raw.length && y < raw.length && raw[x].k === 'del' && raw[y].k === 'ins' && norm(A[raw[x].a]) === norm(B[raw[y].b]) && !raw[x].move) {
      raw[x].move = { id, side: 'from' }; raw[y].move = { id, side: 'to' }; x++; y++; len++;
    }
    moved.push({ id, fromA: A.length ? raw[idx].a : 0, toB: raw[j].b, lines: len, rowFrom: idx, rowTo: j, text: A[raw[idx].a] });
  }
  for (const mv of moved) { raw[mv.rowFrom].move.first = true; raw[mv.rowTo].move.first = true; raw[mv.rowFrom].move.other = mv.toB; raw[mv.rowTo].move.other = mv.fromA; raw[mv.rowFrom].move.lines = mv.lines; raw[mv.rowTo].move.lines = mv.lines; }
  // hunks + stats
  let hunk = -1, inHunk = false; const stats = { changed: 0, added: 0, removed: 0, moved: moved.length };
  for (const r of raw) {
    if (r.k === 'eq') { inHunk = false; continue; }
    if (!inHunk) { hunk++; inHunk = true; }
    r.hunk = hunk;
    if (r.move) continue;
    if (r.k === 'chg') stats.changed++; else if (r.k === 'ins') stats.added++; else stats.removed++;
  }
  // build rows with folding of long unchanged runs
  const rows = []; let run = [];
  const flush = (atEnd) => {
    if (!run.length) return;
    const keepHead = rows.length ? context : 0, keepTail = atEnd ? 0 : context;
    if (run.length > keepHead + keepTail + 2) {
      run.slice(0, keepHead).forEach((r) => rows.push(r));
      rows.push({ k: 'fold', hidden: run.slice(keepHead, run.length - keepTail) });
      run.slice(run.length - keepTail).forEach((r) => rows.push(r));
    } else run.forEach((r) => rows.push(r));
    run = [];
  };
  for (const r of raw) {
    const row = { k: r.k, hunk: r.hunk, move: r.move };
    if (r.a != null) row.a = { n: r.aTo != null ? `${r.a + 1}–${r.aTo + 1}` : r.a + 1, text: r.aText ?? A[r.a], segs: r.w?.a, multi: r.aTo != null };
    if (r.b != null) row.b = { n: r.b + 1, text: B[r.b], segs: r.w?.b };
    if (r.k === 'eq') run.push(row); else { flush(false); rows.push(row); }
  }
  flush(true);
  return { rows, hunks: hunk + 1, stats, moved, identical: hunk < 0, linesA: A.length, linesB: B.length };
}

/** Real unified diff (git style) with 3 lines of context. */
export function unifiedPatch(textA, textB, nameA = 'a', nameB = 'b', ctx = 3) {
  const A = textA.split('\n'), B = textB.split('\n');
  const ops = myers(A, B);
  const out = [`--- ${nameA}`, `+++ ${nameB}`];
  let i = 0;
  while (i < ops.length) {
    while (i < ops.length && ops[i].t === 'eq') i++;
    if (i >= ops.length) break;
    let s = Math.max(0, i - ctx); let e = i;
    // extend while changes are within 2*ctx of each other
    for (;;) {
      while (e < ops.length && ops[e].t !== 'eq') e++;
      let k = e; while (k < ops.length && ops[k].t === 'eq' && k - e < 2 * ctx) k++;
      if (k < ops.length && ops[k].t !== 'eq') { e = k; continue; }
      e = Math.min(ops.length, e + ctx); break;
    }
    const seg = ops.slice(s, e);
    const a0 = seg.find((o) => o.a != null)?.a ?? 0, b0 = seg.find((o) => o.b != null)?.b ?? 0;
    const na = seg.filter((o) => o.t !== 'ins').length, nb = seg.filter((o) => o.t !== 'del').length;
    out.push(`@@ -${a0 + 1},${na} +${b0 + 1},${nb} @@`);
    for (const o of seg) out.push(o.t === 'eq' ? ' ' + A[o.a] : o.t === 'del' ? '-' + A[o.a] : '+' + B[o.b]);
    i = e;
  }
  return out.join('\n') + '\n';
}
