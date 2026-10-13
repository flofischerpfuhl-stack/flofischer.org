// Open · 3D meshes (STL binary + ASCII). Real parser, watertight check, size/volume/surface, and a small software
// renderer (canvas 2D, painter's algorithm, Lambert light) with orbit, zoom, turntable, section cut and point-to-point
// measuring with vertex snapping. The real build would use the bundled three.js; the frame contract is the same.
import { formatBytes } from '../../kit/shell.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details, alt: ['text', 'hex'] });
const UNIT = { mm: ['millimetres', 1], cm: ['centimetres', 10], in: ['inches', 25.4] };

export function parseSTL(buf, name) {
  const size = buf.byteLength; const dv = new DataView(buf);
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(size, 512)));
  let pos, header = '';
  if (size >= 84 && 84 + dv.getUint32(80, true) * 50 === size) {
    const n = dv.getUint32(80, true); pos = new Float32Array(n * 9);
    header = new TextDecoder().decode(new Uint8Array(buf, 0, 80)).replace(/\0.*$/s, '').trim();
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
    return finish(pos, 'binary', header);
  }
  if (/^\s*solid/.test(head) && /facet/.test(head)) {
    const t = new TextDecoder().decode(new Uint8Array(buf)); const v = []; const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g; let m;
    while ((m = re.exec(t))) v.push(+m[1], +m[2], +m[3]);
    if (v.length >= 9 && v.length % 9 === 0) return finish(new Float32Array(v), 'ASCII', (/^\s*solid\s*(.*)/.exec(t)?.[1] || '').trim());
  }
  const zeros = new Uint8Array(buf).every((b) => b === 0);
  if (size < 84) throw human(`${name} couldn’t be opened as a 3D model`, `It’s only ${size} bytes${zeros ? ' and every byte is zero' : ''}. A real STL needs at least 134 bytes for a single triangle, so this is probably an unfinished download or a failed export.`, `Binary STL: file shorter than the 84-byte header (${size} bytes). ASCII STL: no “solid … facet” found.`);
  const claimed = size >= 84 ? dv.getUint32(80, true) : 0;
  throw human(`${name} couldn’t be opened as a 3D model`, `The header promises ${claimed.toLocaleString('en-US')} triangles, but the file is ${formatBytes(size)}, so it’s cut off or isn’t an STL.`, `Expected ${84 + claimed * 50} bytes for ${claimed} triangles, found ${size}.`);
}
function finish(pos, kind, header) {
  const n = pos.length / 9; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, vol = 0, area = 0;
  const nrm = new Float32Array(n * 3); const edges = new Map(); const key = (i) => `${Math.round(pos[i] * 1e3)},${Math.round(pos[i + 1] * 1e3)},${Math.round(pos[i + 2] * 1e3)}`;
  for (let t = 0; t < n; t++) {
    const o = t * 9; const ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5], cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    for (let k = 0; k < 9; k += 3) { const X = pos[o + k], Y = pos[o + k + 1], Z = pos[o + k + 2]; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z; }
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; area += l / 2;
    nrm[t * 3] = nx / l; nrm[t * 3 + 1] = ny / l; nrm[t * 3 + 2] = nz / l;
    const ks = [key(o), key(o + 3), key(o + 6)];
    for (let e = 0; e < 3; e++) { const a = ks[e], b = ks[(e + 1) % 3]; const k2 = a < b ? a + '|' + b : b + '|' + a; edges.set(k2, (edges.get(k2) || 0) + 1); }
  }
  let open = 0; for (const c of edges.values()) if (c !== 2) open++;
  return { pos, nrm, n, kind, header, bbox: { x0, y0, z0, x1, y1, z1, dx: x1 - x0, dy: y1 - y0, dz: z1 - z0 }, volume: Math.abs(vol), area, open, flipped: vol < 0 };
}

export default {
  id: 'mesh', label: '3D model', asLabel: '3D model (STL)', icon: 'cylinder', exts: ['stl'],
  selIcon: 'box', selHint: 'Orbit: drag. Zoom: scroll or pinch.', measureHint: 'Press M, then click two points on the part. It snaps to edges and corners.',
  modes: [{ id: 'orbit', label: 'Orbit', icon: 'rotate-3d', key: 'o' }, { id: 'section', label: 'Section', icon: 'scissors', key: 's' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm' }],
  steps(d) {
    return [
      { label: 'Loading 3D engine (bundled · 610 KB)', cached: '3D engine ready', engine: '3d', ms: 700 },
      { label: `Reading ${formatBytes(d.size)}`, ms: 260, run: async () => { d.buf = await d.file.arrayBuffer(); } },
      { label: 'Building mesh', ms: 520, run: async () => { d.data = parseSTL(d.buf, d.name); d.buf = null; d.unit = 'mm'; d.meas = []; } },
      { label: 'Checking it’s watertight', ms: 240 },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  inspector(d, ctx) {
    const M = d.data, [uname, f] = UNIT[d.unit]; const L = (v) => `${ctx.nf(v * f / (d.unit === 'mm' ? 1 : 1), 1)} mm`;
    const mm = (v) => v * f; const b = M.bbox; const cm3 = (M.volume * f ** 3) / 1000;
    const info = ctx.kv([
      ['Type', `STL mesh · ${M.kind}`],
      ['Size', `<strong>${ctx.nf(mm(b.dx), 1)} × ${ctx.nf(mm(b.dy), 1)} × ${ctx.nf(mm(b.dz), 1)} mm</strong><span class="ov-subline">width × depth × height</span>`],
      ['Volume', `<strong>${ctx.nf(cm3, 1)} cm³</strong>`],
      ['Surface', `${ctx.nf((M.area * f ** 2) / 100, 1)} cm²`],
      ['Weight', `≈ ${ctx.nf(cm3 * 1.24, 0)} g in PLA · ${ctx.nf(cm3 * 7.85, 0)} g in steel`],
      ['Triangles', ctx.nf(M.n)],
      ['Printable', M.open ? `<span class="ov-warnline">${ctx.icon('triangle-alert', { size: 14 })}${ctx.nf(M.open)} open edges</span><span class="ov-subline">Holes in the surface; slicers may fail.</span>` : `<span class="ov-okline">${ctx.icon('circle-check', { size: 14 })}Watertight</span><span class="ov-subline">Closed surface, ready for a slicer.</span>`],
      ['Units', `<select class="fw-select ov-unitsel" id="mesh-unit-${d.id}" aria-label="Units of this STL">${Object.entries(UNIT).map(([k, [n]]) => `<option value="${k}" ${k === d.unit ? 'selected' : ''}>${n[0].toUpperCase() + n.slice(1)}</option>`).join('')}</select><span class="ov-subline">STL files don’t store units; millimetres is the usual.</span>`],
    ]);
    let measure = null;
    if (d.meas.length) measure = `<ol class="ov-meas">${d.meas.map((m, i) => `<li class="ov-meas__row ${i === d.meas.length - 1 ? 'is-last' : ''}"><span class="ov-meas__n">${i + 1}</span><span class="ov-meas__main"><span class="ov-meas__val">${ctx.nf(m.dist * f, 2)} mm</span><span class="ov-meas__sub">Δx ${ctx.nf(Math.abs(m.b[0] - m.a[0]) * f, 1)} · Δy ${ctx.nf(Math.abs(m.b[1] - m.a[1]) * f, 1)} · Δz ${ctx.nf(Math.abs(m.b[2] - m.a[2]) * f, 1)} mm</span></span></li>`).join('')}</ol><div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="m3-copy">${ctx.icon('copy')}Copy</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="m3-clear">Clear</button></div>`;
    const selection = d.mode === 'section' ? ctx.kv([['Cut height', `${ctx.nf(d.cut * f, 1)} mm`], ['Shows', 'Inside faces in green']]) : null;
    return { info, selection, measure };
  },
  bindInspector(d, root, ctx) {
    root.querySelector(`#mesh-unit-${d.id}`)?.addEventListener('change', (e) => { d.unit = e.target.value; ctx.refresh('insp status'); d.ctl.redraw(); });
    root.querySelector('#m3-copy')?.addEventListener('click', (e) => ctx.copyText(d.meas.map((m) => `${(m.dist * UNIT[d.unit][1]).toFixed(2)} mm`).join('\n'), e.currentTarget));
    root.querySelector('#m3-clear')?.addEventListener('click', () => { d.meas = []; d.ctl.redraw(); ctx.refresh('insp'); });
  },
  status(d, ctx) { const M = d.data, f = UNIT[d.unit][1], b = M.bbox; return [`${ctx.nf(M.n)} triangles`, `${ctx.nf(b.dx * f, 1)} × ${ctx.nf(b.dy * f, 1)} × ${ctx.nf(b.dz * f, 1)} mm`, M.open ? 'Has holes' : 'Watertight', d.mode === 'measure' ? 'Click two points' : 'Drag to orbit · scroll to zoom']; },
  exports(d, ctx) {
    const b = ctx.baseName(d.name);
    return [
      { group: 'Image', items: [{ label: 'Snapshot as PNG', sub: 'This view · 2× · transparent', icon: 'image', file: `${b}.png`, onSelect: () => d.ctl.snapshot() }] },
      { group: 'Data', items: [
        { label: 'Dimensions as JSON', sub: 'Size, volume, surface, triangles', icon: 'braces', file: `${b}-dimensions.json`, onSelect: () => { const M = d.data, f = UNIT[d.unit][1]; const name = `${b}-dimensions.json`; ctx.download(name, JSON.stringify({ file: d.name, units: 'mm', size_mm: [M.bbox.dx * f, M.bbox.dy * f, M.bbox.dz * f].map((v) => +v.toFixed(3)), volume_cm3: +((M.volume * f ** 3) / 1000).toFixed(3), surface_cm2: +((M.area * f ** 2) / 100).toFixed(3), triangles: M.n, watertight: !M.open }, null, 2), 'application/json'); ctx.toast(`Saved ${name}`); } },
        { label: 'Measurements as CSV', sub: d.meas.length ? `${d.meas.length} distances` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !d.meas.length, onSelect: () => { const f = UNIT[d.unit][1]; const name = `${b}-measurements.csv`; ctx.download(name, 'n,distance_mm,ax,ay,az,bx,by,bz\n' + d.meas.map((m, i) => [i + 1, (m.dist * f).toFixed(3), ...m.a.map((v) => (v * f).toFixed(3)), ...m.b.map((v) => (v * f).toFixed(3))].join(',')).join('\n'), 'text/csv'); ctx.toast(`Saved ${name}`); } }] },
    ];
  },
  commands(d, t, ctx) {
    const out = [];
    if (/^(sec|cut)/.test(t)) out.push({ label: 'Section view', sub: 'Cut through the part', icon: 'scissors', run: () => ctx.setMode(d, 'section') });
    if (/^meas/.test(t)) out.push({ label: 'Measure on the part', sub: 'M · click two points', icon: 'ruler', run: () => ctx.setMode(d, 'measure') });
    if (/^(snap|png|image|shot)/.test(t)) out.push({ label: 'Save snapshot as PNG', sub: `${ctx.baseName(d.name)}.png`, icon: 'image', run: () => d.ctl.snapshot() });
    if (/^(turn|spin|rot)/.test(t)) out.push({ label: 'Turntable on/off', sub: 'Slow automatic rotation', icon: 'rotate-3d', run: () => d.ctl.toggleSpin() });
    if (/^(top|front|side|iso|view)/.test(t)) [['Top', 0, 89], ['Front', 0, 0], ['Iso', -38, 28]].forEach(([n, y, p]) => out.push({ label: `${n} view`, sub: 'Camera', icon: 'box', run: () => d.ctl.view(y, p) }));
    return out;
  },
  mobileSlots(d) { return [{ id: 'sec', label: 'Section', icon: 'scissors', pressed: d.mode === 'section', run: (doc, ctx) => ctx.setMode(doc, doc.mode === 'section' ? 'orbit' : 'section') }, { id: 'meas', label: 'Measure', icon: 'ruler', pressed: d.mode === 'measure', run: (doc, ctx) => ctx.setMode(doc, doc.mode === 'measure' ? 'orbit' : 'measure') }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};

function mountView(d, el, ctx) {
  const M = d.data, b = M.bbox; const ctr = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
  const R = Math.hypot(b.dx, b.dy, b.dz) / 2 || 1;
  const cam = { yaw: -0.62, pitch: 0.5, dist: R * 3.4, fitDist: R * 3.4, pan: [0, 0] };
  d.cut = b.z0 + b.dz * 0.55; let spin = true, needs = true, raf = 0, live = null, hoverPt = null;
  el.classList.add('m3');
  el.innerHTML = `<canvas class="m3-canvas" tabindex="0" role="img" aria-label="${ctx.esc(d.name)}: 3D view. Drag to orbit, scroll to zoom."></canvas>
    <div class="m3-tools" role="toolbar" aria-label="3D view"><button class="fw-chip" type="button" aria-pressed="true" data-t="dims">${ctx.icon('ruler', { size: 14 })}Dimensions</button><button class="fw-chip" type="button" aria-pressed="true" data-t="spin">${ctx.icon('rotate-3d', { size: 14 })}Turntable</button></div>
    <div class="m3-cut" hidden><label class="fw-slider"><span class="fw-slider__label">Cut height</span><output class="fw-slider__value"></output><input type="range" min="0" max="1000" value="550" aria-label="Section cut height"></label></div>
    <div class="dxf-result m3-result" hidden></div>`;
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), tools = el.querySelector('.m3-tools'), cutBox = el.querySelector('.m3-cut'), cutIn = cutBox.querySelector('input'), resEl = el.querySelector('.m3-result');
  let dims = true, W = 0, H = 0, dpr = 1, color = [163, 170, 179], accent = [21, 128, 61], ink = [17, 17, 17], bgc = '#fff';
  function readColors() { const cs = getComputedStyle(el); const p = (v, fb) => { const m = /#([0-9a-f]{6})/i.exec(cs.getPropertyValue(v)); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : fb; }; color = p('--ov-mesh', color); accent = p('--ov-mesh-cut', accent); ink = p('--text-1', ink); bgc = cs.getPropertyValue('--stage').trim(); needs = true; }
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); needs = true; }
  // view transform
  let cy, sy, cp, sp, f;
  function setupCam() { cy = Math.cos(cam.yaw); sy = Math.sin(cam.yaw); cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch); f = Math.min(W, H) * 1.25; }
  function toView(x, y, z) { x -= ctr[0]; y -= ctr[1]; z -= ctr[2]; const x1 = x * cy - y * sy, y1 = x * sy + y * cy; return [x1, z * cp + y1 * sp, y1 * cp - z * sp]; }
  function proj(v) { const dd = cam.dist + v[2]; return [W / 2 + cam.pan[0] + (f * v[0]) / dd, H / 2 + cam.pan[1] - (f * v[1]) / dd, dd]; }
  const P = (x, y, z) => proj(toView(x, y, z));
  let drawn = [];
  function clip(tri) { // keep the part below the cut plane (Sutherland–Hodgman against z <= cut)
    const out = []; for (let i = 0; i < tri.length; i++) { const a = tri[i], c = tri[(i + 1) % tri.length]; const ia = a[2] <= d.cut, ic = c[2] <= d.cut; if (ia) out.push(a); if (ia !== ic) { const t = (d.cut - a[2]) / (c[2] - a[2]); out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, d.cut]); } }
    return out;
  }
  function draw() {
    needs = false; setupCam();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // ground grid + soft shadow
    const gz = b.z0, span = Math.ceil(R * 1.6 / 10) * 10;
    const sc = P(ctr[0], ctr[1], gz), sxp = P(ctr[0] + R, ctr[1], gz), syp = P(ctr[0], ctr[1] + R, gz);
    const rx = Math.max(10, Math.hypot(sxp[0] - sc[0], sxp[1] - sc[1])), ry = Math.max(6, Math.hypot(syp[0] - sc[0], syp[1] - sc[1]) * 0.7);
    g.save(); g.translate(sc[0], sc[1]); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * 1.05); gr.addColorStop(0, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx * 1.05, 0, Math.PI * 2); g.fill(); g.restore();
    g.lineWidth = 1; g.strokeStyle = `rgba(${ink.join(',')},.08)`; g.beginPath();
    for (let v = -span; v <= span; v += 10) { let a = P(ctr[0] + v, ctr[1] - span, gz), c = P(ctr[0] + v, ctr[1] + span, gz); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); a = P(ctr[0] - span, ctr[1] + v, gz); c = P(ctr[0] + span, ctr[1] + v, gz); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); }
    g.stroke();
    // triangles
    const pos = M.pos, nrm = M.nrm, sect = d.mode === 'section'; const L = [-0.42, 0.72, -0.55]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const list = [];
    for (let t = 0; t < M.n; t++) {
      const o = t * 9; let tri = [[pos[o], pos[o + 1], pos[o + 2]], [pos[o + 3], pos[o + 4], pos[o + 5]], [pos[o + 6], pos[o + 7], pos[o + 8]]];
      if (sect) { if (tri[0][2] > d.cut && tri[1][2] > d.cut && tri[2][2] > d.cut) continue; if (tri.some((p) => p[2] > d.cut)) tri = clip(tri); }
      const vs = tri.map((p) => toView(p[0], p[1], p[2]));
      const n = [nrm[t * 3] * cy - nrm[t * 3 + 1] * sy, 0, 0]; const ny1 = nrm[t * 3] * sy + nrm[t * 3 + 1] * cy; n[1] = nrm[t * 3 + 2] * cp + ny1 * sp; n[2] = ny1 * cp - nrm[t * 3 + 2] * sp;
      const toCam = [-vs[0][0], -vs[0][1], -cam.dist - vs[0][2]]; const facing = n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] > 0;
      if (!facing && !sect) continue;
      const ps = vs.map(proj); let z = 0; for (const p of vs) z += p[2];
      list.push({ ps, z: z / vs.length, n, facing, t, tri });
    }
    list.sort((a, c) => c.z - a.z);
    for (const it of list) {
      const lam = Math.max(0, it.n[0] * L[0] + it.n[1] * L[1] + it.n[2] * L[2]); const fill = it.facing ? 0.5 + 0.55 * lam : 0.62;
      const base = it.facing ? color : accent; const c = base.map((v) => Math.round(Math.min(255, v * fill + (it.facing ? 18 * lam * lam : 0))));
      g.fillStyle = g.strokeStyle = `rgb(${c.join(',')})`; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(it.ps[0][0], it.ps[0][1]); for (let i = 1; i < it.ps.length; i++) g.lineTo(it.ps[i][0], it.ps[i][1]); g.closePath(); g.fill(); g.stroke();
    }
    drawn = list;
    if (dims && d.mode !== 'measure') drawDims();
    drawMeasure();
  }
  function pillAt(x, y, text, strong) {
    g.font = `600 12px Geist, system-ui, sans-serif`; const w = g.measureText(text).width + 16;
    g.fillStyle = strong ? `rgb(${accent.join(',')})` : getComputedStyle(el).getPropertyValue('--surface-1').trim() || '#fff';
    g.strokeStyle = `rgba(${ink.join(',')},.16)`; g.lineWidth = 1; g.beginPath(); g.roundRect(x - w / 2, y - 11, w, 22, 11); g.fill(); if (!strong) g.stroke();
    g.fillStyle = strong ? '#fff' : `rgb(${ink.join(',')})`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
  }
  function drawDims() {
    const f2 = UNIT[d.unit][1]; const z = b.z0;
    const edge = (A, B, label, off) => { const a = P(...A), c = P(...B); g.strokeStyle = `rgba(${ink.join(',')},.55)`; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); g.setLineDash([]); pillAt((a[0] + c[0]) / 2 + off[0], (a[1] + c[1]) / 2 + off[1], label); };
    const o = 4;
    edge([b.x0, b.y0 - o, z], [b.x1, b.y0 - o, z], `${ctx.nf(b.dx * f2, 1)} mm`, [0, 14]);
    edge([b.x1 + o, b.y0, z], [b.x1 + o, b.y1, z], `${ctx.nf(b.dy * f2, 1)} mm`, [18, 6]);
    edge([b.x1 + o, b.y0 - o, b.z0], [b.x1 + o, b.y0 - o, b.z1], `${ctx.nf(b.dz * f2, 1)} mm`, [34, 0]);
  }
  function drawMeasure() {
    const f2 = UNIT[d.unit][1];
    const seg = (m, live2) => { const a = P(...m.a), c = P(...m.b); g.strokeStyle = `rgb(${accent.join(',')})`; g.lineWidth = 2; g.setLineDash(live2 ? [5, 4] : []); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); g.setLineDash([]); for (const p of [a, c]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0], p[1], 4.5, 0, 7); g.fill(); g.lineWidth = 2; g.stroke(); } pillAt((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 16, `${ctx.nf(m.dist * f2, 2)} mm`, !live2); };
    d.meas.forEach((m) => seg(m, false));
    if (live?.a && hoverPt) seg({ a: live.a, b: hoverPt.p, dist: dist3(live.a, hoverPt.p) }, true);
    else if (live?.a) { const a = P(...live.a); g.fillStyle = `rgb(${accent.join(',')})`; g.beginPath(); g.arc(a[0], a[1], 5, 0, 7); g.fill(); }
    if (hoverPt && d.mode === 'measure') { const p = P(...hoverPt.p); g.strokeStyle = `rgb(${accent.join(',')})`; g.lineWidth = 2; g.strokeRect(p[0] - 6, p[1] - 6, 12, 12); }
    const last = d.meas.at(-1); resEl.hidden = !last; if (last) resEl.innerHTML = `<span class="dxf-result__label">Distance</span><strong>${ctx.nf(last.dist * f2, 2)} mm</strong>`;
  }
  const dist3 = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  function pick(x, y) {
    for (let i = drawn.length - 1; i >= 0; i--) {
      const it = drawn[i]; if (!it.facing) continue; const [a, c, e] = it.ps; if (it.ps.length !== 3) continue;
      const den = (c[1] - e[1]) * (a[0] - e[0]) + (e[0] - c[0]) * (a[1] - e[1]); if (!den) continue;
      const l1 = ((c[1] - e[1]) * (x - e[0]) + (e[0] - c[0]) * (y - e[1])) / den, l2 = ((e[1] - a[1]) * (x - e[0]) + (a[0] - e[0]) * (y - e[1])) / den, l3 = 1 - l1 - l2;
      if (l1 >= 0 && l2 >= 0 && l3 >= 0) {
        // snap to the nearest corner of the hit triangle or its neighbours' corners when close on screen
        let best = null, bd = 12; for (let j = drawn.length - 1; j >= Math.max(0, drawn.length - 900); j--) { const t2 = drawn[j]; if (!t2.facing) continue; t2.ps.forEach((p, k) => { const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = t2.tri[k]; } }); }
        if (best) return { p: best, snap: true };
        const T = it.tri; return { p: [0, 1, 2].map((k) => T[0][k] * l1 + T[1][k] * l2 + T[2][k] * l3), snap: false };
      }
    }
    return null;
  }
  function loop() { raf = requestAnimationFrame(loop); if (spin && d.mode === 'orbit' && ctx.isActive(d)) { cam.yaw += 0.0045; needs = true; } if (needs && ctx.isActive(d)) draw(); }
  // input
  const ptrs = new Map(); let drag = null, pinch = null, moved = 0;
  const loc = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, loc(e)); moved = 0; if (ptrs.size === 2) { const [a, c] = [...ptrs.values()]; pinch = Math.hypot(a[0] - c[0], a[1] - c[1]); drag = null; return; } drag = { p: loc(e), yaw: cam.yaw, pitch: cam.pitch, pan: [...cam.pan], btn: e.button, shift: e.shiftKey }; });
  cv.addEventListener('pointermove', (e) => {
    const p = loc(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size === 2) { const [a, c] = [...ptrs.values()]; const nd = Math.hypot(a[0] - c[0], a[1] - c[1]); cam.dist = Math.max(R * 1.2, Math.min(R * 20, cam.dist * (pinch / nd))); pinch = nd; needs = true; ctx.refresh('zoom'); return; }
    if (drag) {
      const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1]; moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 3 && (d.mode !== 'measure' || moved > 8)) { if (spin) setSpin(false); if (drag.btn === 2 || drag.shift) { cam.pan = [drag.pan[0] + dx, drag.pan[1] + dy]; } else { cam.yaw = drag.yaw - dx * 0.008; cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + dy * 0.008)); } needs = true; }
    }
    if (d.mode === 'measure' && !drag) { hoverPt = pick(p[0], p[1]); if (live?.a) live.b = hoverPt?.p; needs = true; }
  });
  const up = (e) => {
    const p = loc(e); ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    const click = drag && moved <= 8; drag = null;
    if (click && d.mode === 'measure') { const h0 = pick(p[0], p[1]); if (h0) { if (!live?.a) { live = { a: h0.p }; popL = ctx.pushLayer(() => { live = null; popL = null; needs = true; }); } else { d.meas.push({ a: live.a, b: h0.p, dist: dist3(live.a, h0.p) }); live = null; popL?.(); popL = null; ctx.refresh('insp'); } needs = true; } }
  };
  let popL = null;
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerleave', () => { hoverPt = null; needs = true; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(R * 1.2, Math.min(R * 20, cam.dist * Math.exp(e.deltaY * 0.0012))); needs = true; ctx.refresh('zoom'); }, { passive: false });
  function setSpin(on) { spin = on; tools.querySelector('[data-t="spin"]').setAttribute('aria-pressed', String(on)); }
  tools.addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (!t) return; if (t.dataset.t === 'dims') { dims = !dims; t.setAttribute('aria-pressed', String(dims)); needs = true; } else setSpin(!spin); });
  const cutUpd = () => { d.cut = b.z0 + (b.dz * cutIn.value) / 1000; cutBox.querySelector('output').textContent = `${ctx.nf((d.cut - b.z0) * UNIT[d.unit][1], 1)} mm`; cutIn.style.setProperty('--p', cutIn.value / 10 + '%'); needs = true; ctx.refresh('insp'); };
  cutIn.addEventListener('input', cutUpd);
  const ro = new ResizeObserver(resize); ro.observe(cv);
  readColors(); resize(); cutUpd(); loop();
  el.dataset.mode = d.mode;
  return {
    zoom: () => (cam.fitDist / cam.dist) * 100, isFit: () => Math.abs(cam.dist - cam.fitDist) < 1e-6 && !cam.pan[0] && !cam.pan[1],
    fit: () => { cam.dist = cam.fitDist; cam.pan = [0, 0]; needs = true; }, setZoom: (p) => { cam.dist = cam.fitDist / (p / 100); needs = true; }, zoomBy: (k) => { cam.dist = Math.max(R * 1.2, Math.min(R * 20, cam.dist / k)); needs = true; },
    setMode: (m) => { el.dataset.mode = m; cutBox.hidden = m !== 'section'; live = null; popL?.(); popL = null; hoverPt = null; if (m !== 'orbit') setSpin(false); if (m === 'section') cutUpd(); needs = true; },
    redraw: () => { needs = true; }, onTheme: () => setTimeout(readColors, 30), onShow: () => { resize(); needs = true; },
    toggleSpin: () => setSpin(!spin), view: (yaw, pitch) => { setSpin(false); cam.yaw = (yaw * Math.PI) / 180; cam.pitch = (pitch * Math.PI) / 180; needs = true; },
    snapshot: () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); c.toBlob((bl) => { const name = `${ctx.baseName(d.name)}.png`; ctx.download(name, bl); ctx.toast(`Saved ${name} · ${c.width} × ${c.height} px`); }); },
    key: (e) => { if (e.key.startsWith('Arrow')) { setSpin(false); if (e.key === 'ArrowLeft') cam.yaw -= 0.12; if (e.key === 'ArrowRight') cam.yaw += 0.12; if (e.key === 'ArrowUp') cam.pitch = Math.min(1.45, cam.pitch + 0.1); if (e.key === 'ArrowDown') cam.pitch = Math.max(-1.45, cam.pitch - 0.1); needs = true; return true; } return false; },
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); popL?.(); },
    screenOfModel: (x, y, z) => { setupCam(); const p = P(x, y, z); const r = cv.getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] }; },
  };
}
