// Text Diff off the main thread: line diff + word diff + moved blocks (diff.js). The page cancels stale jobs by
// terminating the worker, so typing never queues up work. (Real build: linear-space Myers + size guard, audit T01.)
import { compare, unifiedPatch } from './diff.js';
self.onmessage = (e) => {
  const { id, a, b, ignoreWs, ignoreCase, context, nameA, nameB } = e.data;
  const t0 = performance.now();
  const r = compare(a, b, { ignoreWs, ignoreCase, context });
  const patch = unifiedPatch(a, b, nameA, nameB);
  self.postMessage({ id, r, patch, ms: performance.now() - t0 });
};
