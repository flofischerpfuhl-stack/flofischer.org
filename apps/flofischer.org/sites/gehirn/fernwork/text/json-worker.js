// JSON work off the main thread: validate, format/minify (with key sorting) and summarise.
import { explainError, summarize, sortKeysDeep } from './json.js';
self.onmessage = (e) => {
  const { id, op, text, indent = 2, sort = false } = e.data;
  const t0 = performance.now();
  try {
    let v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    const summary = summarize(v);
    if (op === 'validate') { self.postMessage({ id, ok: true, summary, ms: performance.now() - t0 }); return; }
    if (sort) v = sortKeysDeep(v);
    const out = op === 'minify' ? JSON.stringify(v) : JSON.stringify(v, null, indent === 'tab' ? '\t' : indent);
    self.postMessage({ id, ok: true, summary, text: out, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id, ok: false, error: explainError(text, err), ms: performance.now() - t0 });
  }
};
