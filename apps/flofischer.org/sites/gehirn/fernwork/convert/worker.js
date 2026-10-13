// Convert mockup · image worker (real): probe (size, transparency, thumbnail) and encode off the main thread.
// JPG, PNG and WebP are real canvas encodes. AVIF/JXL (jsquash), GIF, BMP, TIFF, ICO are stand-ins in the mockup:
// they reuse WebP/PNG bytes. The real build swaps in the vendored encoders behind the same message contract.
const canvas = (w, h) => { const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); return [c, c.getContext('2d', { willReadFrequently: true })]; };

async function probe(file) {
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;
  const [, sx] = canvas(64, 64); sx.drawImage(bmp, 0, 0, 64, 64);
  const d = sx.getImageData(0, 0, 64, 64).data; let alpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { alpha = true; break; }
  const T = 112; const [tc, tx] = canvas(T, T); const s = alpha ? Math.min((T - 12) / w, (T - 12) / h) : Math.max(T / w, T / h);
  tx.drawImage(bmp, (T - w * s) / 2, (T - h * s) / 2, w * s, h * s);
  const thumb = await tc.convertToBlob({ type: alpha ? 'image/png' : 'image/jpeg', quality: 0.82 });
  const P = Math.min(1, 2400 / Math.max(w, h)); const [pc, px] = canvas(Math.round(w * P), Math.round(h * P));
  px.drawImage(bmp, 0, 0, pc.width, pc.height);
  const preview = await pc.convertToBlob({ type: alpha ? 'image/png' : 'image/jpeg', quality: 0.95 });
  bmp.close();
  return { w, h, alpha, thumb, preview };
}

const REAL = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const STAND_IN = { avif: ['image/webp', -12], jxl: ['image/webp', -6], gif: ['image/png', 0], bmp: ['image/png', 0], tiff: ['image/png', 0], ico: ['image/png', 0] };
const FILLS = new Set(['jpg', 'gif', 'bmp']); // formats without (full) transparency get the matte colour

async function encode(file, { fmt, quality = 85, w, h, matte = '#ffffff', maxBytes = 0 }) {
  const bmp = await createImageBitmap(file);
  if (fmt === 'ico') { const k = Math.min(1, 256 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); }
  const [c, x] = canvas(w, h);
  if (FILLS.has(fmt)) { x.fillStyle = matte; x.fillRect(0, 0, w, h); }
  x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h); bmp.close();
  const [mime, qShift] = REAL[fmt] ? [REAL[fmt], 0] : STAND_IN[fmt] || ['image/png', 0];
  const lossy = mime !== 'image/png';
  let q = quality; const enc = (qq) => c.convertToBlob({ type: mime, quality: Math.max(0.05, (qq + qShift) / 100) });
  let blob = await enc(q); let reached = true;
  if (maxBytes && lossy && blob.size > maxBytes) {
    // binary search the highest quality that fits (today's "Max KB": overrides Quality)
    let lo = 5, hi = q, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const b = await enc(mid); if (b.size <= maxBytes) { best = { b, mid }; lo = mid + 1; } else hi = mid - 1; }
    if (best) { blob = best.b; q = best.mid; } else { blob = await enc(5); q = 5; reached = false; }
  }
  return { blob, w, h, q, reached };
}

self.onmessage = async (e) => {
  const { id, op, file, opts } = e.data;
  try {
    const res = op === 'probe' ? await probe(file) : await encode(file, opts);
    self.postMessage({ id, ok: true, ...res });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
