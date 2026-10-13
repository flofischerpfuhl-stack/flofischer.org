// Checksum worker: streams a File/Blob through one (or a few) incremental hashers and reports progress with throughput.
// Web Crypto's digest() cannot stream (it needs the whole file in memory and gives no progress), so big files use
// hash-wasm (MIT, vendored) here; small files and text are hashed with crypto.subtle on the main thread.
importScripts(
  'vendor/hash-wasm/md5.umd.min.js',
  'vendor/hash-wasm/sha1.umd.min.js',
  'vendor/hash-wasm/sha256.umd.min.js',
  'vendor/hash-wasm/sha384.umd.min.js',
  'vendor/hash-wasm/sha512.umd.min.js',
);
const F = {
  MD5: () => hashwasm.createMD5(), 'SHA-1': () => hashwasm.createSHA1(), 'SHA-256': () => hashwasm.createSHA256(),
  'SHA-384': () => hashwasm.createSHA384(), 'SHA-512': () => hashwasm.createSHA512(),
};
const jobs = new Map();
self.onmessage = async ({ data }) => {
  if (data.type === 'cancel') { const j = jobs.get(data.id); if (j) j.cancelled = true; return; }
  if (data.type !== 'hash') return;
  const { id, blob, algos } = data;
  const job = { cancelled: false }; jobs.set(id, job);
  try {
    const hs = await Promise.all(algos.map((a) => F[a]()));
    const reader = blob.stream().getReader();
    let done = 0, lastPost = 0; const t0 = performance.now();
    for (;;) {
      if (job.cancelled) { await reader.cancel(); self.postMessage({ type: 'cancelled', id }); return; }
      const r = await reader.read(); if (r.done) break;
      for (const h of hs) h.update(r.value);
      done += r.value.byteLength;
      const now = performance.now();
      if (now - lastPost > 90) { lastPost = now; self.postMessage({ type: 'progress', id, done, total: blob.size, ms: now - t0 }); }
    }
    const out = {}; algos.forEach((a, i) => { out[a] = hs[i].digest('hex'); });
    self.postMessage({ type: 'done', id, hashes: out, ms: performance.now() - t0, total: blob.size });
  } catch (e) {
    self.postMessage({ type: 'error', id, message: e?.message || String(e) });
  } finally { jobs.delete(id); }
};
