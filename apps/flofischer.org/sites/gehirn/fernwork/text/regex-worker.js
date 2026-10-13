// Runs one regex job. The page terminates this worker if it takes longer than the time limit
// (catastrophic backtracking can't be interrupted from inside the engine).
self.onmessage = (e) => {
  const { id, source, flags, text, limit = 5000, replace } = e.data;
  const t0 = performance.now();
  let re;
  try { re = new RegExp(source, flags.includes('g') ? flags : flags + 'g'); } catch (err) { self.postMessage({ id, error: err.message }); return; }
  const out = []; let m; let total = 0;
  const wantIdx = flags.includes('d');
  while ((m = re.exec(text))) {
    total++;
    if (out.length < limit) {
      const groups = [];
      // group spans: use the d flag when available for exact offsets, else search inside the match
      let ind = null;
      if (!wantIdx) { try { const r2 = new RegExp(source, flags.replace('g', '') + 'dy'); r2.lastIndex = m.index; const m2 = r2.exec(text); ind = m2 && m2.indices; } catch { /* */ } }
      else ind = m.indices;
      for (let g = 1; g < m.length; g++) groups.push({ v: m[g], s: ind && ind[g] ? ind[g][0] : -1, e: ind && ind[g] ? ind[g][1] : -1 });
      out.push({ s: m.index, e: m.index + m[0].length, v: m[0], groups, named: m.groups ? Object.keys(m.groups) : [] });
    }
    if (m[0].length === 0) re.lastIndex++;
    if (!flags.includes('g')) break;
  }
  let replaced = null;
  if (replace != null) { try { replaced = text.replace(new RegExp(source, flags), replace); } catch { /* */ } }
  self.postMessage({ id, matches: out, total, ms: performance.now() - t0, replaced });
};
