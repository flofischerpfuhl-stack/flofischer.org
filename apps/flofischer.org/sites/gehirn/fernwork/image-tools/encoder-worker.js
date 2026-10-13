// Lightbox encoder worker: resize + encode off the main thread (OffscreenCanvas.convertToBlob).
// { id, bmp, mime, quality (0-100), width, height, target (bytes, optional), flatten ('#fff' to drop alpha) }
self.onmessage = async (ev) => {
  const { id, bmp, mime, quality = 80, width, height, target, flatten } = ev.data;
  try {
    const W = width || bmp.width, H = height || bmp.height;
    const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
    if (flatten || mime === 'image/jpeg') { x.fillStyle = flatten || '#ffffff'; x.fillRect(0, 0, W, H); }
    x.imageSmoothingQuality = 'high';
    // step down in halves for clean downscales
    let src = bmp, sw = bmp.width, sh = bmp.height;
    while (sw / 2 >= W && sh / 2 >= H) {
      const t = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2)); const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high';
      tx.drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height;
    }
    x.drawImage(src, 0, 0, W, H);
    bmp.close?.();
    const enc = (q) => c.convertToBlob({ type: mime, quality: q / 100 });
    let blob, q = quality;
    if (target && mime !== 'image/png') {
      let lo = 5, hi = 95, best = null;
      for (let i = 0; i < 7; i++) {
        const mid = Math.round((lo + hi) / 2); const b = await enc(mid);
        if (b.size <= target) { best = { b, q: mid }; lo = mid + 1; } else hi = mid - 1;
        if (lo > hi) break;
      }
      if (!best) best = { b: await enc(5), q: 5 };
      blob = best.b; q = best.q;
    } else blob = await enc(q);
    self.postMessage({ id, blob, quality: q, width: W, height: H });
  } catch (e) { self.postMessage({ id, error: String(e && e.message || e) }); }
};
