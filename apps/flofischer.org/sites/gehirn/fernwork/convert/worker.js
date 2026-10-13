// Convert mockup · image worker (real): decode, probe (size, transparency, thumbnail) and encode off the main thread.
// The real build swaps the canvas encoder for jsquash (AVIF/JXL) in the same worker contract.
const canvas = (w, h) => { const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); return [c, c.getContext('2d', { willReadFrequently: true })]; };

async function probe(file) {
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;
  // transparency: look at a small copy
  const [sc, sx] = canvas(64, 64); sx.drawImage(bmp, 0, 0, 64, 64);
  const d = sx.getImageData(0, 0, 64, 64).data; let alpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { alpha = true; break; }
  // square thumbnail (cover), 2x for crisp 44 px
  const T = 112; const [tc, tx] = canvas(T, T); const s = alpha ? Math.min((T - 12) / w, (T - 12) / h) : Math.max(T / w, T / h);
  tx.drawImage(bmp, (T - w * s) / 2, (T - h * s) / 2, w * s, h * s);
  const thumb = await tc.convertToBlob({ type: alpha ? 'image/png' : 'image/jpeg', quality: 0.82 });
  // a larger preview for the compare view
  const P = Math.min(1, 2600 / Math.max(w, h)); const [pc, px] = canvas(Math.round(w * P), Math.round(h * P));
  px.drawImage(bmp, 0, 0, pc.width, pc.height);
  const preview = await pc.convertToBlob({ type: alpha ? 'image/png' : 'image/jpeg', quality: 0.95 });
  bmp.close();
  return { w, h, alpha, thumb, preview };
}

async function encode(file, { mime, quality = 85, edge = 0, matte = '#ffffff', maxBytes = 0 }) {
  const bmp = await createImageBitmap(file);
  let s = 1; if (edge && Math.max(bmp.width, bmp.height) > edge) s = edge / Math.max(bmp.width, bmp.height);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const [c, x] = canvas(w, h);
  if (mime === 'image/jpeg') { x.fillStyle = matte; x.fillRect(0, 0, w, h); }
  x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h); bmp.close();
  let q = quality, blob = await c.convertToBlob({ type: mime, quality: q / 100 }), reached = true;
  if (maxBytes && mime !== 'image/png') {
    while (blob.size > maxBytes && q > 30) { q -= 8; blob = await c.convertToBlob({ type: mime, quality: q / 100 }); }
    reached = blob.size <= maxBytes;
  }
  return { blob, w, h, q, reached };
}

self.onmessage = async (e) => {
  const { id, op, file, opts } = e.data;
  try {
    const res = op === 'probe' ? await probe(file) : await encode(file, opts);
    self.postMessage({ id, ok: true, ...res });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
