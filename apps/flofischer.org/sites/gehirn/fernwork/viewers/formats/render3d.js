// Viewers · small software 3D stage (canvas 2D, painter's algorithm, Lambert light) shared by STL/OBJ and IFC.
// Orbit / pan / zoom, camera presets, turntable, section plane on X/Y/Z with flip, point-to-point measuring with vertex
// snapping, element picking, wireframe / flat shading / axes, background. The real build swaps in the bundled three.js
// behind the same controller shape.

export function mount3d(el, ctx, M, o) {
  // M: { pos Float32Array(9n), nrm Float32Array(3n), n, bbox }  o: { colorOf(t), pick(t), hidden(t), dims, unitF, active, onMeasure, onPick, meas }
  const b = M.bbox; const ctr = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
  const R = Math.hypot(b.dx, b.dy, b.dz) / 2 || 1;
  const cam = { yaw: -0.62, pitch: 0.5, dist: R * 3.4, fitDist: R * 3.4, pan: [0, 0] };
  const st = { mode: 'orbit', spin: !!o.spin, dims: !!o.dims, wire: false, flat: false, axes: false, sel: null, section: { axis: null, pos: 0.55, flip: false } };
  let needs = true, raf = 0, live = null, hoverPt = null, W = 0, H = 0, dpr = 1;
  el.innerHTML = `<canvas class="m3-canvas" tabindex="0" role="img" aria-label="${ctx.esc(o.label || '3D view')}. Drag to orbit, scroll to zoom."></canvas><div class="dxf-result m3-result" hidden></div>`;
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), resEl = el.querySelector('.m3-result');
  let base = [163, 170, 179], accent = [21, 128, 61], ink = [17, 17, 17], surf = '#fff';
  function readColors() { const cs = getComputedStyle(el); const p = (v, fb) => { const m = /#([0-9a-f]{6})/i.exec(cs.getPropertyValue(v)); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : fb; }; base = o.color ? hex(o.color) : p('--ov-mesh', base); accent = p('--ov-mesh-cut', accent); ink = p('--m3-ink', p('--text-1', ink)); surf = cs.getPropertyValue('--surface-1').trim() || '#fff'; needs = true; }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); needs = true; }
  let cy, sy, cp, sp, f;
  function setupCam() { cy = Math.cos(cam.yaw); sy = Math.sin(cam.yaw); cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch); f = Math.min(W, H) * 1.25; }
  function toView(x, y, z) { x -= ctr[0]; y -= ctr[1]; z -= ctr[2]; const x1 = x * cy - y * sy, y1 = x * sy + y * cy; return [x1, z * cp + y1 * sp, y1 * cp - z * sp]; }
  function proj(v) { const dd = cam.dist + v[2]; return [W / 2 + cam.pan[0] + (f * v[0]) / dd, H / 2 + cam.pan[1] - (f * v[1]) / dd, dd]; }
  const P = (x, y, z) => proj(toView(x, y, z));
  const AX = { x: 0, y: 1, z: 2 };
  const cutVal = () => { const a = st.section.axis; const i = AX[a]; const lo = [b.x0, b.y0, b.z0][i], span = [b.dx, b.dy, b.dz][i]; return lo + span * st.section.pos; };
  function clip(tri, i, c, keepBelow) {
    const inside = (p) => (keepBelow ? p[i] <= c : p[i] >= c);
    const out = []; for (let k = 0; k < tri.length; k++) { const a = tri[k], e = tri[(k + 1) % tri.length]; const ia = inside(a), ie = inside(e); if (ia) out.push(a); if (ia !== ie) { const t = (c - a[i]) / (e[i] - a[i]); out.push([a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t, a[2] + (e[2] - a[2]) * t]); } }
    return out;
  }
  // smooth shading: averaged vertex normals
  let vnorm = null;
  function vertexNormals() {
    if (vnorm) return vnorm; const map = new Map(); const key = (i) => `${Math.round(M.pos[i] * 100)},${Math.round(M.pos[i + 1] * 100)},${Math.round(M.pos[i + 2] * 100)}`;
    for (let t = 0; t < M.n; t++) for (let k = 0; k < 3; k++) { const kk = key(t * 9 + k * 3); const a = map.get(kk) || [0, 0, 0]; a[0] += M.nrm[t * 3]; a[1] += M.nrm[t * 3 + 1]; a[2] += M.nrm[t * 3 + 2]; map.set(kk, a); }
    vnorm = new Float32Array(M.n * 3);
    for (let t = 0; t < M.n; t++) { let s = [0, 0, 0]; for (let k = 0; k < 3; k++) { const a = map.get(key(t * 9 + k * 3)); const l = Math.hypot(...a) || 1; s[0] += a[0] / l; s[1] += a[1] / l; s[2] += a[2] / l; } const l = Math.hypot(...s) || 1; const fn = [M.nrm[t * 3], M.nrm[t * 3 + 1], M.nrm[t * 3 + 2]]; const dot = (s[0] * fn[0] + s[1] * fn[1] + s[2] * fn[2]) / l; if (dot < 0.6) s = fn.map((v) => v * l); vnorm[t * 3] = s[0] / l; vnorm[t * 3 + 1] = s[1] / l; vnorm[t * 3 + 2] = s[2] / l; }
    return vnorm;
  }
  let drawn = [];
  function draw() {
    needs = false; setupCam();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const gz = b.z0, span = Math.ceil(R * 1.6 / 10) * 10, stepG = Math.max(1, Math.pow(10, Math.floor(Math.log10(R / 2))));
    const sc = P(ctr[0], ctr[1], gz), sxp = P(ctr[0] + R, ctr[1], gz), syp = P(ctr[0], ctr[1] + R, gz);
    const rx = Math.max(10, Math.hypot(sxp[0] - sc[0], sxp[1] - sc[1])), ry = Math.max(6, Math.hypot(syp[0] - sc[0], syp[1] - sc[1]) * 0.7);
    if (cam.pitch > 0) { g.save(); g.translate(sc[0], sc[1]); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * 1.05); gr.addColorStop(0, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx * 1.05, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.lineWidth = 1; g.strokeStyle = `rgba(${ink.join(',')},.08)`; g.beginPath();
    for (let v = -span; v <= span; v += stepG) { let a = P(ctr[0] + v, ctr[1] - span, gz), c = P(ctr[0] + v, ctr[1] + span, gz); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); a = P(ctr[0] - span, ctr[1] + v, gz); c = P(ctr[0] + span, ctr[1] + v, gz); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); }
    g.stroke();
    const pos = M.pos, nrm = st.flat ? M.nrm : vertexNormals(); const sect = st.section.axis; const ci = sect ? AX[sect] : 0; const cv0 = sect ? cutVal() : 0; const keepBelow = sect ? !st.section.flip : true;
    const L = [-0.42, 0.72, -0.55]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const list = [];
    for (let t = 0; t < M.n; t++) {
      if (o.hidden?.(t)) continue;
      const k = t * 9; let tri = [[pos[k], pos[k + 1], pos[k + 2]], [pos[k + 3], pos[k + 4], pos[k + 5]], [pos[k + 6], pos[k + 7], pos[k + 8]]];
      if (sect) { const ins = tri.map((p) => (keepBelow ? p[ci] <= cv0 : p[ci] >= cv0)); if (!ins.some(Boolean)) continue; if (!ins.every(Boolean)) tri = clip(tri, ci, cv0, keepBelow); }
      const vs = tri.map((p) => toView(p[0], p[1], p[2]));
      const fx = M.nrm[t * 3], fy = M.nrm[t * 3 + 1], fz = M.nrm[t * 3 + 2];
      const fny1 = fx * sy + fy * cy; const fn = [fx * cy - fy * sy, fz * cp + fny1 * sp, fny1 * cp - fz * sp];
      const toCam = [-vs[0][0], -vs[0][1], -cam.dist - vs[0][2]]; const facing = fn[0] * toCam[0] + fn[1] * toCam[1] + fn[2] * toCam[2] > 0;
      if (!facing && !sect && !st.wire && !o.twoSided) continue;
      const nx = nrm[t * 3], ny = nrm[t * 3 + 1], nz = nrm[t * 3 + 2]; const ny1 = nx * sy + ny * cy; const n = [nx * cy - ny * sy, nz * cp + ny1 * sp, ny1 * cp - nz * sp];
      const ps = vs.map(proj); let z = 0; for (const p of vs) z += p[2];
      list.push({ ps, z: z / vs.length, n, facing, t, tri });
    }
    list.sort((a, c) => c.z - a.z);
    const selSet = st.sel != null && o.elemOf ? st.sel : null;
    for (const it of list) {
      const lam = Math.max(0, (it.facing ? 1 : -1) * (it.n[0] * L[0] + it.n[1] * L[1] + it.n[2] * L[2])); const fill = it.facing ? 0.5 + 0.55 * lam : 0.62;
      const own = o.colorOf?.(it.t); const isSel = selSet != null && o.elemOf(it.t) === selSet;
      const col = isSel ? accent : it.facing || o.twoSided ? own || base : accent;
      const c = col.map((v) => Math.round(Math.min(255, v * fill + (it.facing ? 18 * lam * lam : 0))));
      g.beginPath(); g.moveTo(it.ps[0][0], it.ps[0][1]); for (let i = 1; i < it.ps.length; i++) g.lineTo(it.ps[i][0], it.ps[i][1]); g.closePath();
      if (st.wire) { g.strokeStyle = `rgba(${c.join(',')},.95)`; g.lineWidth = 0.8; g.stroke(); }
      else { g.fillStyle = g.strokeStyle = `rgb(${c.join(',')})`; g.lineWidth = 0.6; g.fill(); g.stroke(); if (o.edges) { g.strokeStyle = `rgba(0,0,0,${isSel ? 0 : 0.10})`; g.lineWidth = 0.5; g.stroke(); } }
    }
    drawn = list;
    if (st.axes) drawAxes();
    if (st.dims && st.mode !== 'measure') drawDims();
    drawMeasure();
  }
  function pillAt(x, y, text, strong) {
    g.font = '600 12px Geist, system-ui, sans-serif'; const w = g.measureText(text).width + 16;
    g.fillStyle = strong ? `rgb(${accent.join(',')})` : surf; g.strokeStyle = `rgba(${ink.join(',')},.16)`; g.lineWidth = 1;
    g.beginPath(); g.roundRect(x - w / 2, y - 11, w, 22, 11); g.fill(); if (!strong) g.stroke();
    g.fillStyle = strong ? '#fff' : `rgb(${ink.join(',')})`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
  }
  function drawAxes() {
    const o0 = [b.x0, b.y0, b.z0]; const Lx = R * 0.5; const C = [['X', [Lx, 0, 0], '#dc2626'], ['Y', [0, Lx, 0], '#16a34a'], ['Z', [0, 0, Lx], '#2563eb']];
    const a = P(...o0); for (const [n, v, col] of C) { const e = P(o0[0] + v[0], o0[1] + v[1], o0[2] + v[2]); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.stroke(); g.fillStyle = col; g.font = '600 12px Geist, system-ui'; g.fillText(n, e[0] + 6, e[1]); }
  }
  function drawDims() {
    const f2 = o.unitF(); const z = b.z0; const u = o.unitLabel || 'mm'; const d2 = o.dimDigits ?? 1;
    const edge = (A, B, label, off) => { const a = P(...A), c = P(...B); g.strokeStyle = `rgba(${ink.join(',')},.55)`; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); g.setLineDash([]); pillAt((a[0] + c[0]) / 2 + off[0], (a[1] + c[1]) / 2 + off[1], label); };
    const off = R * 0.08;
    edge([b.x0, b.y0 - off, z], [b.x1, b.y0 - off, z], `${ctx.nf(b.dx * f2, d2)} ${u}`, [0, 14]);
    edge([b.x1 + off, b.y0, z], [b.x1 + off, b.y1, z], `${ctx.nf(b.dy * f2, d2)} ${u}`, [18, 6]);
    edge([b.x1 + off, b.y0 - off, b.z0], [b.x1 + off, b.y0 - off, b.z1], `${ctx.nf(b.dz * f2, d2)} ${u}`, [34, 0]);
  }
  const dist3 = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  function drawMeasure() {
    const f2 = o.unitF(); const u = o.unitLabel || 'mm'; const dg = o.measDigits ?? 2;
    const seg = (m, live2) => { const a = P(...m.a), c = P(...m.b); g.strokeStyle = `rgb(${accent.join(',')})`; g.lineWidth = 2; g.setLineDash(live2 ? [5, 4] : []); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); g.setLineDash([]); for (const p of [a, c]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0], p[1], 4.5, 0, 7); g.fill(); g.lineWidth = 2; g.stroke(); } pillAt((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 16, `${ctx.nf(m.dist * f2, dg)} ${u}`, !live2); };
    o.meas.forEach((m) => seg(m, false));
    if (live?.a && hoverPt) seg({ a: live.a, b: hoverPt.p, dist: dist3(live.a, hoverPt.p) }, true);
    else if (live?.a) { const a = P(...live.a); g.fillStyle = `rgb(${accent.join(',')})`; g.beginPath(); g.arc(a[0], a[1], 5, 0, 7); g.fill(); }
    if (hoverPt && st.mode === 'measure') { const p = P(...hoverPt.p); g.strokeStyle = `rgb(${accent.join(',')})`; g.lineWidth = 2; g.strokeRect(p[0] - 6, p[1] - 6, 12, 12); }
    const last = o.meas.at(-1); resEl.hidden = !last || !ctx.isMobile(); if (last) resEl.innerHTML = `<span class="dxf-result__label">Distance</span><strong>${ctx.nf(last.dist * f2, dg)} ${u}</strong>`;
  }
  function pick(x, y, snapIt = true) {
    for (let i = drawn.length - 1; i >= 0; i--) {
      const it = drawn[i]; if (it.ps.length < 3) continue; if (!it.facing && !o.twoSided) continue;
      for (let k = 1; k < it.ps.length - 1; k++) {
        const a = it.ps[0], c = it.ps[k], e = it.ps[k + 1];
        const den = (c[1] - e[1]) * (a[0] - e[0]) + (e[0] - c[0]) * (a[1] - e[1]); if (!den) continue;
        const l1 = ((c[1] - e[1]) * (x - e[0]) + (e[0] - c[0]) * (y - e[1])) / den, l2 = ((e[1] - a[1]) * (x - e[0]) + (a[0] - e[0]) * (y - e[1])) / den, l3 = 1 - l1 - l2;
        if (l1 >= 0 && l2 >= 0 && l3 >= 0) {
          if (snapIt) { let best = null, bd = 12; for (let j = drawn.length - 1; j >= Math.max(0, drawn.length - 1200); j--) { const t2 = drawn[j]; t2.ps.forEach((p, kk) => { const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = t2.tri[kk]; } }); } if (best) return { p: best, snap: true, t: it.t }; }
          const T = it.tri; return { p: [0, 1, 2].map((q) => T[0][q] * l1 + T[k][q] * l2 + T[k + 1][q] * l3), snap: false, t: it.t };
        }
      }
    }
    return null;
  }
  function loop() { raf = requestAnimationFrame(loop); if (st.spin && st.mode === 'orbit' && o.active()) { cam.yaw += 0.0045; needs = true; } if (needs && o.active()) draw(); }
  const ptrs = new Map(); let drag = null, pinch = null, moved = 0, popL = null;
  const loc = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, loc(e)); moved = 0; if (ptrs.size === 2) { const [a, c] = [...ptrs.values()]; pinch = Math.hypot(a[0] - c[0], a[1] - c[1]); drag = null; return; } drag = { p: loc(e), yaw: cam.yaw, pitch: cam.pitch, pan: [...cam.pan], btn: e.button, shift: e.shiftKey }; });
  cv.addEventListener('pointermove', (e) => {
    const p = loc(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size === 2) { const [a, c] = [...ptrs.values()]; const nd = Math.hypot(a[0] - c[0], a[1] - c[1]); cam.dist = Math.max(R * 0.6, Math.min(R * 20, cam.dist * (pinch / nd))); pinch = nd; needs = true; o.onZoom?.(); return; }
    if (drag) {
      const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1]; moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 3 && (st.mode === 'orbit' || moved > 8)) { if (st.spin) setSpin(false); if (drag.btn === 2 || drag.btn === 1 || drag.shift) cam.pan = [drag.pan[0] + dx, drag.pan[1] + dy]; else { cam.yaw = drag.yaw - dx * 0.008; cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + dy * 0.008)); } needs = true; }
    }
    if (st.mode === 'measure' && !drag) { hoverPt = pick(p[0], p[1]); if (live?.a) live.b = hoverPt?.p; needs = true; }
    if (st.mode === 'pick' && !drag && o.elemOf) { const h0 = pick(p[0], p[1], false); cv.style.cursor = h0 ? 'pointer' : ''; }
  });
  const up = (e) => {
    const p = loc(e); ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    const click = drag && moved <= 8; drag = null;
    if (click && st.mode === 'measure') { const h0 = pick(p[0], p[1]); if (h0) { if (!live?.a) { live = { a: h0.p }; popL = ctx.pushLayer(() => { live = null; popL = null; needs = true; }); } else { o.meas.push({ a: live.a, b: h0.p, dist: dist3(live.a, h0.p) }); live = null; popL?.(); popL = null; o.onMeasure?.(); } needs = true; } }
    else if (click && st.mode === 'pick' && o.elemOf) { const h0 = pick(p[0], p[1], false); st.sel = h0 ? o.elemOf(h0.t) : null; needs = true; o.onPick?.(st.sel); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerleave', () => { hoverPt = null; needs = true; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(R * 0.6, Math.min(R * 20, cam.dist * Math.exp(e.deltaY * 0.0012))); needs = true; o.onZoom?.(); }, { passive: false });
  function setSpin(on) { st.spin = on; o.onSpin?.(on); needs = true; }
  const ro = new ResizeObserver(resize); ro.observe(cv);
  readColors(); resize(); loop();
  return {
    st, cam,
    zoom: () => (cam.fitDist / cam.dist) * 100, isFit: () => Math.abs(cam.dist - cam.fitDist) < 1e-6 && !cam.pan[0] && !cam.pan[1],
    fit: () => { cam.dist = cam.fitDist; cam.pan = [0, 0]; needs = true; }, setZoom: (p) => { cam.dist = cam.fitDist / (p / 100); needs = true; }, zoomBy: (k) => { cam.dist = Math.max(R * 0.6, Math.min(R * 20, cam.dist / k)); needs = true; },
    setMode: (m) => { st.mode = m; live = null; popL?.(); popL = null; hoverPt = null; if (m !== 'orbit') setSpin(false); needs = true; },
    redraw: () => { needs = true; }, readColors: () => setTimeout(readColors, 30), onResize: () => { resize(); },
    setSpin, toggleSpin: () => setSpin(!st.spin), view: (yaw, pitch) => { setSpin(false); cam.yaw = (yaw * Math.PI) / 180; cam.pitch = (pitch * Math.PI) / 180; cam.pan = [0, 0]; cam.dist = cam.fitDist; needs = true; },
    set: (k, v) => { st[k] = v; needs = true; }, setColor: (h) => { o.color = h; readColors(); },
    snapshot: (name) => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); c.toBlob((bl) => { ctx.download(name, bl); ctx.toast(`Saved ${name} · ${c.width} × ${c.height} px`); }); },
    key: (e) => { if (e.key.startsWith('Arrow')) { setSpin(false); if (e.key === 'ArrowLeft') cam.yaw -= 0.12; if (e.key === 'ArrowRight') cam.yaw += 0.12; if (e.key === 'ArrowUp') cam.pitch = Math.min(1.45, cam.pitch + 0.1); if (e.key === 'ArrowDown') cam.pitch = Math.max(-1.45, cam.pitch - 0.1); needs = true; return true; } return false; },
    screenOf: (x, y, z) => { setupCam(); const p = P(x, y, z); const r = cv.getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] }; },
    canvas: cv,
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); popL?.(); },
  };
}
