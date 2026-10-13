// Decode every QR code in an image, off the main thread.
// Pipeline: full resolution → mask each found code and look again (several codes) → if nothing: half scale, then tiles.
import jsQR from '../vendor/jsqr.mjs';

function fillQuad(data, w, h, loc, padFrac = 0.18) {
  const pts = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
  const cx = pts.reduce((a, p) => a + p.x, 0) / 4, cy = pts.reduce((a, p) => a + p.y, 0) / 4;
  const P = pts.map((p) => ({ x: cx + (p.x - cx) * (1 + padFrac * 2), y: cy + (p.y - cy) * (1 + padFrac * 2) }));
  const minX = Math.max(0, Math.floor(Math.min(...P.map((p) => p.x)))), maxX = Math.min(w - 1, Math.ceil(Math.max(...P.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...P.map((p) => p.y)))), maxY = Math.min(h - 1, Math.ceil(Math.max(...P.map((p) => p.y))));
  const inside = (x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; } } return true; };
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (inside(x, y)) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; }
}
function scaleLoc(loc, s, ox = 0, oy = 0) {
  const o = {}; for (const k of Object.keys(loc)) o[k] = { x: loc[k].x * s + ox, y: loc[k].y * s + oy }; return o;
}
function downscale(data, w, h, f) {
  const W = Math.floor(w / f), H = Math.floor(h / f), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const k = ((y * f + j) * w + x * f + i) * 4; r += data[k]; g += data[k + 1]; b += data[k + 2]; }
    const n = f * f, o = (y * W + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return { data: out, w: W, h: H };
}
function crop(data, w, x0, y0, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * cw * 4);
  return out;
}
function findAll(data, w, h, max = 6, inv = 'dontInvert') {
  const found = [];
  for (let i = 0; i < max; i++) {
    const r = jsQR(data, w, h, { inversionAttempts: inv });
    if (!r || (!r.data && !r.binaryData?.length)) break;
    if (found.some((f) => f.data === r.data)) break;
    found.push({ data: r.data, location: r.location, version: r.version });
    fillQuad(data, w, h, r.location);
  }
  return found;
}
self.onmessage = (e) => {
  const { id, data, width: w, height: h, mode } = e.data;
  const t0 = performance.now();
  if (mode === 'frame') { // camera: one quick pass
    const r = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
    self.postMessage({ id, codes: r ? [{ data: r.data, location: r.location }] : [], ms: performance.now() - t0 });
    return;
  }
  // 1 · fast pass on a ≤1000 px copy (also tries inverted codes)
  const work = new Uint8ClampedArray(data);
  const codes = []; let pass = 'fast';
  const add = (list, sx = 1, ox = 0, oy = 0) => {
    let n = 0;
    for (const k of list) {
      const loc = scaleLoc(k.location, sx, ox, oy);
      if (codes.some((c) => c.data === k.data)) continue;
      codes.push({ ...k, location: loc }); fillQuad(work, w, h, loc); n++;
    }
    return n;
  };
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 1000));
  const small = f > 1 ? downscale(work, w, h, f) : { data: new Uint8ClampedArray(work), w, h };
  add(findAll(small.data, small.w, small.h, 6, 'attemptBoth'), f);
  const tiles = (src, W, H, k, ns) => {
    for (const n of ns) {
      let base = src === work ? work : downscale(work, w, h, k).data;
      const tw = Math.min(W, Math.round((W / n) * 1.5)), th = Math.min(H, Math.round((H / n) * 1.5));
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const cx = Math.round(Math.min(W - tw, Math.max(0, (W / n) * i - (tw - W / n) / 2))), cy = Math.round(Math.min(H - th, Math.max(0, (H / n) * j - (th - H / n) / 2)));
        if (add(findAll(crop(base, W, cx, cy, tw, th), tw, th, 3), k, cx * k, cy * k) && src !== work) base = downscale(work, w, h, k).data;
      }
    }
  };
  if (codes.length) {
    self.postMessage({ id, partial: true, codes: codes.map((c) => ({ ...c })), ms: Math.round(performance.now() - t0) });
    // 2a · found something: look for more codes nearby at the same (cheap) scale
    if (Math.max(small.w, small.h) > 400) tiles(null, small.w, small.h, f, [2, 3]);
  } else if (f > 1) {
    // 2b · nothing yet: full resolution, then tiles
    self.postMessage({ id, progress: 'Trying harder…' }); pass = 'full';
    add(findAll(work, w, h, 6));
  }
  if (f === 1 || pass === 'full') {
    if (!codes.length) self.postMessage({ id, progress: 'Looking closer…' });
    const before = codes.length; tiles(work, w, h, 1, [2, 3]); if (codes.length > before && !before) pass = 'tiles';
  }
  self.postMessage({ id, codes, pass, ms: Math.round(performance.now() - t0) });
};
