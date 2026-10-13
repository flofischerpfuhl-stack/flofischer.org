// Calc Paper graph · canvas plotter: theme-aware axes with label halos, CVD-safe series colours, hover trace with
// crosshair + readout, automatic points of interest (roots, extrema, intersections) that pop in, click to pin,
// pan / wheel / pinch zoom that edits never reset, Fit, PNG/SVG export. No third-party renderer.

const NICE = [1, 2, 5];
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const n of NICE) if (n * p >= raw) return n * p;
  return 10 * p;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Graph {
  constructor(host, { fmt = 'en', angle = 'rad', onView, onTrace, onPin } = {}) {
    this.host = host; this.fmt = fmt; this.angle = angle;
    this.onView = onView; this.onTrace = onTrace; this.onPin = onPin;
    this.plots = []; this.pois = []; this.pins = []; this.trace = null; this.hoverPoi = null; this.focusKey = null;
    this.view = null; this.base = null; this.poiBorn = new Map(); this.markX = null; this.userView = false; this.padBottom = 0;
    host.innerHTML = `<canvas class="cp-g__cv" tabindex="0" role="img" aria-label="Graph"></canvas>
      <div class="cp-g__tip" hidden></div>
      <div class="cp-g__readout" aria-live="off"></div>
      <div class="cp-g__empty" hidden><div class="cp-g__empty-in"><b>Nothing to draw yet</b><span>Lines with <code>x</code> show up here, like <code>f(x) = x^2 − 2</code></span></div></div>`;
    this.cv = host.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.tip = host.querySelector('.cp-g__tip'); this.readout = host.querySelector('.cp-g__readout'); this.empty = host.querySelector('.cp-g__empty');
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.readTheme();
    this.bind();
  }

  // ── theme ──
  readTheme() {
    const cs = getComputedStyle(this.host);
    const v = (n) => cs.getPropertyValue(n).trim();
    this.col = {
      bg: v('--cp-graph-bg') || v('--bg'), grid: v('--chart-grid'), axis: v('--chart-axis'), label: v('--chart-label'), halo: v('--chart-label-halo'),
      text1: v('--text-1'), text2: v('--text-2'), text3: v('--text-3'), surface: v('--surface-1'), border: v('--border-strong'),
      series: Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`)), font: v('--font-ui') || 'Geist, system-ui', mono: v('--font-mono') || 'monospace',
    };
    this.render();
  }

  // ── data ──
  setPlots(plots) {
    this.plots = plots;
    this.empty.hidden = plots.length > 0;
    if (!this.view && plots.length && this.w) this.fit(false);
    else if (!this.userView && plots.length && this.w) { clearTimeout(this._fitT); this._fitT = setTimeout(() => { if (!this.userView) this.fit(true); }, 450); }
    this.pins = this.pins.filter((p) => plots.some((q) => q.key === p.key));
    this.schedulePois(); this.render();
    if (this.trace) this.updateTrace(this.trace.px, this.trace.py);
  }
  setFmt(fmt) { this.fmt = fmt; this.render(); }
  setAngle(a) { this.angle = a; this.render(); }
  setView(v) { this.view = v ? { cx: v.cx, cy: v.cy, kx: v.kx, ky: v.ky } : null; this.base = v?.base ?? null; this.userView = !!v?.user; if (!this.view && this.plots.length && this.w) this.fit(false); this.schedulePois(); this.render(); }
  getView() { return this.view ? { ...this.view, base: this.base, user: this.userView } : null; }

  // ── geometry ──
  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (r.width < 2 || r.height < 2) return;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px';
    if (!this.view && this.plots.length) this.fit(false);
    this.schedulePois(); this.render();
  }
  X(x) { return this.w / 2 + (x - this.view.cx) * this.view.kx; }
  Y(y) { return this.h / 2 - (y - this.view.cy) * this.view.ky; }
  wx(px) { return this.view.cx + (px - this.w / 2) / this.view.kx; }
  wy(py) { return this.view.cy - (py - this.h / 2) / this.view.ky; }
  range() { return { x0: this.wx(0), x1: this.wx(this.w), y0: this.wy(this.h), y1: this.wy(0) }; }

  fit(animate = true) {
    if (!this.w) return;
    const vis = this.plots.filter((p) => !p.hidden);
    let xs = [], ys = [], periodic = false;
    const R = this.angle === 'deg' ? 720 : 10;
    for (const p of vis) {
      const pts = findPois([p], -R, R, 900, 60).filter((q) => q.kind !== 'yint');
      if (pts.length > 10) { periodic = true; continue; }
      xs.push(...pts.map((q) => q.x)); ys.push(...pts.map((q) => q.y));
    }
    xs = xs.filter(Number.isFinite); ys = ys.filter(Number.isFinite);
    const P = this.angle === 'deg' ? 360 : 2 * Math.PI;
    let x0 = -R, x1 = R;
    if (xs.length) {
      const a = Math.min(...xs), b = Math.max(...xs), pad = Math.max(1.2, (b - a) * 0.38);
      x0 = a - pad; x1 = b + pad;
      const span = clamp(x1 - x0, periodic ? 2 * P : 6, 24), mid = (x0 + x1) / 2; x0 = mid - span / 2; x1 = mid + span / 2;
    } else if (periodic) { x0 = -P; x1 = P; }
    const kx = this.w / (x1 - x0);
    let cy = 0;
    if (ys.length) { const a = Math.min(...ys, 0), b = Math.max(...ys, 0); cy = (a + b) / 2; }
    // equal scales unless that hides the shape (e.g. sin over 720°): then fit y to what matters
    let ky = kx;
    const hy = Math.max(1.2, ys.length ? Math.max(...ys.map((y) => Math.abs(y - cy))) * 1.5 : 1.2);
    const visHalf = (this.h - this.padBottom) / 2 / kx;
    if (visHalf < hy * 0.6 || visHalf > hy * 9) ky = (this.h - this.padBottom) / 2 / hy;
    const target = { cx: (x0 + x1) / 2, cy: cy - this.padBottom / 2 / ky, kx, ky };
    this.base = kx;
    this.animateTo(target, animate);
  }
  animateTo(t, animate = true) {
    if (!this.view || !animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.view = t; this.changed(); return; }
    const from = { ...this.view }, t0 = performance.now(), D = 260;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      const lerp = (a, b) => a + (b - a) * e;
      const lg = (a, b) => Math.exp(lerp(Math.log(a), Math.log(b)));
      this.view = { cx: lerp(from.cx, t.cx), cy: lerp(from.cy, t.cy), kx: lg(from.kx, t.kx), ky: lg(from.ky, t.ky) };
      this.render();
      if (k < 1) requestAnimationFrame(step); else this.changed();
    };
    requestAnimationFrame(step);
  }
  zoomBy(f, px = this.w / 2, py = this.h / 2) {
    if (!this.view) return;
    const x = this.wx(px), y = this.wy(py);
    const kx = clamp(this.view.kx * f, 1e-4, 1e7), ky = clamp(this.view.ky * f, 1e-4, 1e7);
    this.view = { kx, ky, cx: x - (px - this.w / 2) / kx, cy: y + (py - this.h / 2) / ky };
    this.changed();
  }
  panBy(dx, dy) { if (!this.view) return; this.view.cx -= dx / this.view.kx; this.view.cy += dy / this.view.ky; this.changed(); }
  zoomPct() { return this.view && this.base ? Math.round((this.view.kx / this.base) * 100) : 100; }
  changed() { this.render(); this.schedulePois(); this.onView?.(this.getView()); }

  // ── points of interest ──
  schedulePois() {
    clearTimeout(this._poiT);
    this._poiT = setTimeout(() => {
      if (!this.view || !this.w) return;
      const { x0, x1 } = this.range();
      const vis = this.plots.filter((p) => !p.hidden);
      const now = performance.now();
      const next = findPois(vis, x0, x1, Math.min(1200, Math.round(this.w)), 18);
      for (const q of next) { q.id = `${q.kind}:${q.keys}:${q.x.toPrecision(6)}`; if (!this.poiBorn.has(q.id)) this.poiBorn.set(q.id, now); }
      this.pois = next;
      this.render();
      if (next.some((q) => now - this.poiBorn.get(q.id) < 300)) this.animatePop();
    }, 90);
  }
  animatePop() { const t0 = performance.now(); const f = (n) => { this.render(); if (n - t0 < 320) requestAnimationFrame(f); }; requestAnimationFrame(f); }

  // ── input ──
  bind() {
    const cv = this.cv; const pts = new Map(); let drag = null, pinch = null, moved = 0;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = 0;
      if (pts.size === 1) drag = { x: e.offsetX, y: e.offsetY, t: performance.now() };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (p) { p.x = e.offsetX; p.y = e.offsetY; }
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.userView = true; this.panBy(mx - pinch.mx, my - pinch.my); this.zoomBy(d / pinch.d, mx, my);
        pinch = { d, mx, my }; moved += 10; this.hideTip(); return;
      }
      if (drag) {
        const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) { this.userView = true; this.panBy(dx, dy); this.host.classList.add('is-panning'); this.hideTip(); }
        drag.x = e.offsetX; drag.y = e.offsetY; return;
      }
      if (e.pointerType !== 'touch') this.updateTrace(e.offsetX, e.offsetY);
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag && moved <= 4) this.tapAt(e.offsetX, e.offsetY, e.pointerType);
      if (pts.size === 0) drag = null;
      this.host.classList.remove('is-panning');
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !pts.size) { this.trace = null; this.hoverPoi = null; this.hideTip(); this.readout.innerHTML = ''; this.render(); this.onTrace?.(null); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); this.userView = true;
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      this.zoomBy(f, e.offsetX, e.offsetY); if (this.trace) this.updateTrace(e.offsetX, e.offsetY);
    }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key, s = 40;
      if (k === 'ArrowLeft') this.panBy(s, 0); else if (k === 'ArrowRight') this.panBy(-s, 0);
      else if (k === 'ArrowUp') this.panBy(0, s); else if (k === 'ArrowDown') this.panBy(0, -s);
      else if (k === '+' || k === '=') this.zoomBy(1.25); else if (k === '-' || k === '_') this.zoomBy(0.8);
      else if (k === 'f' || k === 'F' || k === '0') this.fit();
      else if (k === 'Escape' && this.pins.length) { this.pins = []; this.render(); }
      else return;
      e.preventDefault(); this.userView = true; this.changed();
    });
  }
  nearest(px, py) {
    if (!this.view) return null;
    // POIs first (they are the interesting ones)
    let best = null;
    for (const q of this.pois) { const d = Math.hypot(this.X(q.x) - px, this.Y(q.y) - py); if (d < 12 && (!best || d < best.d)) best = { d, poi: q }; }
    if (best) return { poi: best.poi, x: best.poi.x, y: best.poi.y, key: best.poi.keys.split('|')[0] };
    const x = this.wx(px); let near = null;
    for (const p of this.plots) {
      if (p.hidden) continue;
      const y = p.f(x); if (!Number.isFinite(y)) continue;
      const d = Math.abs(this.Y(y) - py);
      if (d < 36 && (!near || d < near.d)) near = { d, key: p.key, x, y };
    }
    return near;
  }
  updateTrace(px, py) {
    if (!this.view) return;
    const n = this.nearest(px, py);
    this.trace = { px, py, hit: n };
    this.hoverPoi = n?.poi || null;
    this.cv.style.cursor = n ? 'crosshair' : 'grab';
    if (n) this.showTip(n); else this.hideTip();
    this.render();
    const x = n ? n.x : this.wx(px);
    this.onTrace?.({ x, hit: n });
    this.renderReadout(x, n);
  }
  tapAt(px, py, type) {
    const n = this.nearest(px, py);
    if (!n) { if (type === 'touch') { this.trace = null; this.hideTip(); this.render(); } return; }
    const id = n.poi ? n.poi.id : null;
    const i = this.pins.findIndex((p) => (id ? p.id === id : Math.abs(p.x - n.x) < 1e-9 && p.key === n.key));
    if (i >= 0) this.pins.splice(i, 1);
    else this.pins.push({ id, key: n.key, x: n.x, y: n.y, kind: n.poi?.kind, poi: n.poi });
    if (type === 'touch') { this.trace = { px, py, hit: n }; this.showTip(n); }
    this.render(); this.onPin?.(this.pins);
  }

  // ── formatting ──
  num(v, d = 4) {
    if (!Number.isFinite(v)) return 'undefined';
    if (Math.abs(v) < 1e-9) v = 0;
    const a = Math.abs(v);
    let s;
    if (a !== 0 && (a < 1e-4 || a >= 1e7)) s = v.toExponential(2);
    else s = String(Number(v.toFixed(a >= 100 ? 2 : d)));
    if (this.fmt === 'de') s = s.replace('.', ',');
    return s.replace('-', '−');
  }
  pt(x, y) { return this.fmt === 'de' ? `(${this.num(x, 3)}; ${this.num(y, 3)})` : `(${this.num(x, 3)}, ${this.num(y, 3)})`; }
  plot(key) { return this.plots.find((p) => p.key === key); }
  poiLabel(q) {
    const names = q.keys.split('|').map((k) => this.plot(k)?.name || k);
    const kind = q.kind === 'root' ? 'root' : q.kind === 'max' ? 'local max' : q.kind === 'min' ? 'local min' : q.kind === 'yint' ? 'y-intercept' : `${names.join(' = ')}`;
    return { kind, xy: this.pt(q.x, q.y) };
  }
  showTip(n) {
    const p = this.plot(n.key);
    let html;
    if (n.poi) { const l = this.poiLabel(n.poi); html = `<span class="cp-g__tipk">${l.kind}</span><b>${l.xy}</b>`; }
    else html = `<i style="--c:${p?.color}"></i><span>${p?.name === 'y' ? 'y' : `${p?.name}(${this.num(n.x, 2)})`} =</span><b>${this.num(n.y)}</b>`;
    this.tip.innerHTML = html; this.tip.hidden = false;
    const tx = this.X(n.x), ty = this.Y(n.y);
    const r = this.tip.getBoundingClientRect();
    let left = tx + 14, top = ty - r.height - 12;
    if (left + r.width > this.w - 8) left = tx - r.width - 14;
    if (top < 8) top = ty + 14;
    this.tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  hideTip() { this.tip.hidden = true; }
  renderReadout(x, n) {
    const vis = this.plots.filter((p) => !p.hidden);
    if (!vis.length) { this.readout.innerHTML = ''; return; }
    const xs = this.num(x, 2);
    this.readout.innerHTML = `<span class="cp-g__ro-x">x ${xs}</span>` + vis.slice(0, 4).map((p) => `<span><i style="--c:${p.color}"></i>${p.name === 'y' ? 'y' : p.name} ${this.num(p.f(x), 3)}</span>`).join('');
  }

  // ── drawing ──
  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(this.ctx, this.w, this.h, this.dpr); });
  }
  draw(ctx, W, H, dpr, { exportMode = false } = {}) {
    if (!W || !H || !this.col) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.col.bg; ctx.fillRect(0, 0, W, H);
    if (!this.view) return;
    const c = this.col;
    const { x0, x1, y0, y1 } = this.range();
    // grid
    const sx = niceStep(90 / this.view.kx), sy = niceStep(90 / this.view.ky);
    const minor = (s) => s / (String(s / Math.pow(10, Math.floor(Math.log10(s)))).startsWith('2') ? 4 : 5);
    ctx.lineWidth = 1;
    const line = (xa, ya, xb, yb) => { ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke(); };
    ctx.strokeStyle = c.grid; ctx.globalAlpha = 0.55;
    for (let x = Math.ceil(x0 / minor(sx)) * minor(sx); x <= x1; x += minor(sx)) { const X = Math.round(this.X(x)) + 0.5; line(X, 0, X, H); }
    for (let y = Math.ceil(y0 / minor(sy)) * minor(sy); y <= y1; y += minor(sy)) { const Y = Math.round(this.Y(y)) + 0.5; line(0, Y, W, Y); }
    ctx.globalAlpha = 1;
    for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) { const X = Math.round(this.X(x)) + 0.5; line(X, 0, X, H); }
    for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) { const Y = Math.round(this.Y(y)) + 0.5; line(0, Y, W, Y); }
    // axes
    const ax = clamp(Math.round(this.X(0)) + 0.5, 0.5, W - 0.5), ay = clamp(Math.round(this.Y(0)) + 0.5, 0.5, H - 0.5);
    ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5;
    line(0, ay, W, ay); line(ax, 0, ax, H);
    // tick labels with halo
    ctx.font = `500 12px ${c.font}`; ctx.lineJoin = 'round';
    const label = (t, x, y, align, base) => { ctx.textAlign = align; ctx.textBaseline = base; ctx.strokeStyle = c.halo; ctx.lineWidth = 4; ctx.strokeText(t, x, y); ctx.fillStyle = c.label; ctx.fillText(t, x, y); };
    const fmtT = (v, s) => { const d = Math.max(0, -Math.floor(Math.log10(s))); let t = Math.abs(v) < s / 2 ? '0' : v.toFixed(d); if (this.fmt === 'de') t = t.replace('.', ','); return t.replace('-', '−'); };
    const lyBelow = ay + 6 + 14 < H;
    for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) {
      if (Math.abs(x) < sx / 2) continue;
      const X = this.X(x); if (X < 14 || X > W - 14) continue;
      label(fmtT(x, sx), X, lyBelow ? ay + 6 : ay - 6, 'center', lyBelow ? 'top' : 'bottom');
    }
    const lxLeft = ax - 8 > 30;
    for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) {
      if (Math.abs(y) < sy / 2) continue;
      const Y = this.Y(y); if (Y < 10 || Y > H - 10) continue;
      label(fmtT(y, sy), lxLeft ? ax - 8 : ax + 8, Y, lxLeft ? 'right' : 'left', 'middle');
    }
    if (ax > 0.5 && ax < W - 0.5 && ay > 0.5 && ay < H - 0.5) label('0', ax - 7, ay + 6, 'right', 'top');
    ctx.font = `italic 500 13px ${c.font}`;
    label('x', W - 10, ay - 8, 'right', 'bottom');
    label('y', ax + 9, 10, 'left', 'top');
    // curves
    for (const p of this.plots) {
      if (p.hidden) continue;
      ctx.strokeStyle = p.color; ctx.lineWidth = this.focusKey === p.key || this.trace?.hit?.key === p.key ? 3 : 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      this.tracePath(ctx, p, W, H);
    }
    // marker from the value table
    if (this.markX != null) {
      const X = this.X(this.markX); ctx.setLineDash([4, 4]); ctx.strokeStyle = c.text3; ctx.lineWidth = 1; line(X, 0, X, H); ctx.setLineDash([]);
      for (const p of this.plots) { if (p.hidden) continue; const y = p.f(this.markX); if (Number.isFinite(y)) this.dot(ctx, X, this.Y(y), p.color, 4.5); }
    }
    // POIs
    const now = performance.now();
    for (const q of this.pois) {
      const X = this.X(q.x), Y = this.Y(q.y); if (X < -10 || X > W + 10 || Y < -10 || Y > H + 10) continue;
      const age = exportMode ? 1e9 : now - (this.poiBorn.get(q.id) || 0);
      const t = clamp(age / 280, 0, 1), s = t >= 1 ? 1 : 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
      const r = 4.5 * Math.max(0, s) * (this.hoverPoi === q ? 1.35 : 1);
      if (r <= 0.2) continue;
      ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fillStyle = c.bg; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = this.hoverPoi === q ? c.text1 : c.text3; ctx.stroke();
    }
    // pins
    for (const p of this.pins) {
      const pl = this.plot(p.key); const X = this.X(p.x), Y = this.Y(p.y);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      this.dot(ctx, X, Y, pl?.color || c.text1, 5.5);
      const t = p.poi ? `${this.poiLabel(p.poi).kind} ${this.pt(p.x, p.y)}` : this.pt(p.x, p.y);
      this.bubble(ctx, t, X, Y, W);
    }
    // trace crosshair
    if (!exportMode && this.trace?.hit) {
      const { x, y, key } = this.trace.hit; const X = this.X(x), Y = this.Y(y);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = c.text3; ctx.lineWidth = 1;
      line(X, ay, X, Y); line(ax, Y, X, Y); ctx.setLineDash([]);
      this.dot(ctx, X, Y, this.plot(key)?.color || c.text1, 5.5);
    }
    if (exportMode) this.legend(ctx);
  }
  dot(ctx, X, Y, color, r) {
    ctx.beginPath(); ctx.arc(X, Y, r + 2, 0, Math.PI * 2); ctx.fillStyle = this.col.bg; ctx.fill();
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  bubble(ctx, t, X, Y, W) {
    ctx.font = `500 12px ${this.col.font}`;
    const w = ctx.measureText(t).width + 16, h = 24;
    let bx = X + 10, by = Y - h - 10; if (bx + w > W - 6) bx = X - w - 10; if (by < 6) by = Y + 10;
    ctx.beginPath(); ctx.roundRect(bx, by, w, h, 6); ctx.fillStyle = this.col.surface; ctx.fill(); ctx.strokeStyle = this.col.border; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = this.col.text1; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, bx + 8, by + h / 2 + 0.5);
  }
  legend(ctx) {
    const vis = this.plots.filter((p) => !p.hidden); if (!vis.length) return;
    ctx.font = `500 13px ${this.col.mono}`;
    const rows = vis.map((p) => p.text || p.label);
    const w = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 44, h = rows.length * 22 + 14;
    ctx.beginPath(); ctx.roundRect(12, 12, w, h, 8); ctx.fillStyle = this.col.surface; ctx.fill(); ctx.strokeStyle = this.col.border; ctx.lineWidth = 1; ctx.stroke();
    vis.forEach((p, i) => {
      const y = 12 + 7 + i * 22 + 11;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(40, y); ctx.stroke();
      ctx.fillStyle = this.col.text1; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(rows[i], 48, y + 0.5);
    });
  }
  samples(p, W, H, step = 1) {
    // returns polylines in screen coords, broken at gaps and asymptotes
    const out = []; let cur = [];
    let prevY = null;
    for (let X = -step; X <= W + step; X += step) {
      const y = p.f(this.wx(X));
      if (!Number.isFinite(y)) { if (cur.length > 1) out.push(cur); cur = []; prevY = null; continue; }
      let Y = this.Y(y);
      if (prevY != null && Math.abs(Y - prevY) > H * 1.2 && ((Y < 0 && prevY > H) || (Y > H && prevY < 0))) { if (cur.length > 1) out.push(cur); cur = []; }
      Y = clamp(Y, -4 * H, 5 * H);
      cur.push([X, Y]); prevY = Y;
    }
    if (cur.length > 1) out.push(cur);
    return out;
  }
  tracePath(ctx, p, W, H) {
    for (const seg of this.samples(p, W, H)) {
      ctx.beginPath(); ctx.moveTo(seg[0][0], seg[0][1]);
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
      ctx.stroke();
    }
  }

  // ── export ──
  toCanvas(scale = 2) {
    const c = document.createElement('canvas'); c.width = Math.round(this.w * scale); c.height = Math.round(this.h * scale);
    this.draw(c.getContext('2d'), this.w, this.h, scale, { exportMode: true });
    this.render();
    return c;
  }
  toSVG() {
    const W = Math.round(this.w), H = Math.round(this.h), c = this.col, { x0, x1, y0, y1 } = this.range();
    const sx = niceStep(90 / this.view.kx), sy = niceStep(90 / this.view.ky);
    const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let g = '';
    for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) g += `<line x1="${this.X(x).toFixed(1)}" y1="0" x2="${this.X(x).toFixed(1)}" y2="${H}"/>`;
    for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) g += `<line x1="0" y1="${this.Y(y).toFixed(1)}" x2="${W}" y2="${this.Y(y).toFixed(1)}"/>`;
    const ax = clamp(this.X(0), 0, W), ay = clamp(this.Y(0), 0, H);
    let labels = '';
    for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) if (Math.abs(x) > sx / 2) labels += `<text x="${this.X(x).toFixed(1)}" y="${(ay + 18).toFixed(1)}" text-anchor="middle">${e(this.num(x, 2))}</text>`;
    for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) if (Math.abs(y) > sy / 2) labels += `<text x="${(ax - 8).toFixed(1)}" y="${(this.Y(y) + 4).toFixed(1)}" text-anchor="end">${e(this.num(y, 2))}</text>`;
    let curves = '';
    for (const p of this.plots) {
      if (p.hidden) continue;
      const d = this.samples(p, W, H, 1.5).map((s) => 'M' + s.map(([X, Y]) => `${X.toFixed(1)} ${Y.toFixed(1)}`).join('L')).join('');
      curves += `<path d="${d}" stroke="${p.color}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const pois = this.pois.map((q) => `<circle cx="${this.X(q.x).toFixed(1)}" cy="${this.Y(q.y).toFixed(1)}" r="4.5" fill="${c.bg}" stroke="${c.text3}" stroke-width="2"/>`).join('');
    const legend = this.plots.filter((p) => !p.hidden).map((p, i) => `<g transform="translate(16 ${22 + i * 22})"><line x1="0" y1="0" x2="16" y2="0" stroke="${p.color}" stroke-width="3"/><text x="24" y="4" font-family="Geist Mono, monospace" fill="${c.text1}">${e(p.text || p.label)}</text></g>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Geist, system-ui, sans-serif" font-size="12">
<rect width="${W}" height="${H}" fill="${c.bg}"/>
<g stroke="${c.grid}" stroke-width="1">${g}</g>
<g stroke="${c.axis}" stroke-width="1.5"><line x1="0" y1="${ay.toFixed(1)}" x2="${W}" y2="${ay.toFixed(1)}"/><line x1="${ax.toFixed(1)}" y1="0" x2="${ax.toFixed(1)}" y2="${H}"/></g>
<g fill="${c.label}" paint-order="stroke" stroke="${c.halo}" stroke-width="4" stroke-linejoin="round">${labels}</g>
${curves}${pois}${legend}
</svg>`;
  }
}

// ── numeric analysis (pure) ──
function bisect(f, a, b, fa) {
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2, fm = f(m); if (!Number.isFinite(fm)) return null; if (fm === 0) return m; if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}
function golden(f, a, b, max) {
  const g = (Math.sqrt(5) - 1) / 2; let c = b - g * (b - a), d = a + g * (b - a);
  const s = max ? -1 : 1;
  for (let i = 0; i < 60; i++) { if (s * f(c) < s * f(d)) b = d; else a = c; c = b - g * (b - a); d = a + g * (b - a); }
  return (a + b) / 2;
}
export function findPois(plots, x0, x1, N = 600, cap = 18) {
  const out = []; const dx = (x1 - x0) / N;
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + i * dx);
  const vals = plots.map((p) => xs.map((x) => p.f(x)));
  plots.forEach((p, k) => {
    const ys = vals[k]; const found = [];
    const span = (() => { const f = ys.filter(Number.isFinite); if (!f.length) return 1; let a = Infinity, b = -Infinity; for (const v of f) { if (v < a) a = v; if (v > b) b = v; } return Math.max(1e-9, b - a); })();
    for (let i = 0; i < N; i++) {
      const a = ys[i], b = ys[i + 1];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a === 0) found.push({ kind: 'root', x: xs[i], y: 0 });
      else if ((a < 0) !== (b < 0) && b !== 0 && Math.abs(a - b) < span * 0.5) { const r = bisect(p.f, xs[i], xs[i + 1], a); if (r != null) found.push({ kind: 'root', x: r, y: 0 }); }
      if (i > 0 && Number.isFinite(ys[i - 1])) {
        const d1 = a - ys[i - 1], d2 = b - a;
        if (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) {
          if (Math.abs(d1) + Math.abs(d2) > span * 0.5) continue; // cusp / asymptote
          const max = d1 > 0; const x = golden(p.f, xs[i - 1], xs[i + 1], max); const y = p.f(x);
          if (Number.isFinite(y)) found.push({ kind: max ? 'max' : 'min', x, y });
        }
      }
    }
    if (x0 < 0 && x1 > 0) { const y = p.f(0); if (Number.isFinite(y) && Math.abs(y) > 1e-9) found.push({ kind: 'yint', x: 0, y }); }
    const uniq = found.filter((q, i) => !found.some((o, j) => j < i && o.kind === q.kind && Math.abs(o.x - q.x) < dx * 0.6));
    if (uniq.filter((q) => q.kind !== 'yint').length <= cap) out.push(...uniq.map((q) => ({ ...q, keys: p.key })));
  });
  for (let a = 0; a < plots.length; a++) for (let b = a + 1; b < plots.length; b++) {
    const A = vals[a], B = vals[b]; const h = (x) => plots[a].f(x) - plots[b].f(x); const hits = [];
    for (let i = 0; i < N; i++) {
      const d0 = A[i] - B[i], d1 = A[i + 1] - B[i + 1];
      if (!Number.isFinite(d0) || !Number.isFinite(d1)) continue;
      if (d0 === 0 || (d0 < 0) !== (d1 < 0)) { const x = d0 === 0 ? xs[i] : bisect(h, xs[i], xs[i + 1], d0); if (x != null && Math.abs(d0 - d1) < 1e3) hits.push({ kind: 'cross', x, y: plots[a].f(x), keys: `${plots[a].key}|${plots[b].key}` }); }
    }
    if (hits.length <= cap) out.push(...hits);
  }
  // an intersection at a shared root shows once
  return out.filter((q, i) => !out.some((o, j) => j < i && Math.abs(o.x - q.x) < dx && Math.abs(o.y - q.y) < 1e-6 * (1 + Math.abs(q.y)) && o.kind !== 'yint'));
}
