// Viewers · Point Cloud Viewer. Real readers: LAS 1.0–1.4 (point formats 0–3, 6–8: XYZ, intensity, class, RGB),
// PLY (ASCII and binary), PCD (ASCII), XYZ / PTS / TXT. LAZ and E57 use the bundled decoders in the real build (shown
// honestly here). Canvas splat renderer with a depth buffer: orbit, top view, colour by RGB / height / intensity / class /
// solid, point size, clip box, point-to-point measuring (distance, horizontal, height difference, slope), stations.
const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();
const MAX = 400000;
const CLASS = { 0: 'Never classified', 1: 'Unclassified', 2: 'Ground', 3: 'Low vegetation', 4: 'Medium vegetation', 5: 'High vegetation', 6: 'Building', 7: 'Noise', 9: 'Water', 11: 'Road surface', 17: 'Bridge' };
const CLASS_RGB = { 1: [160, 160, 170], 2: [166, 124, 82], 3: [120, 190, 90], 4: [80, 160, 70], 5: [40, 120, 50], 6: [230, 120, 70], 7: [255, 0, 255], 9: [60, 130, 220], 11: [110, 110, 120] };
const OPT_KEY = 'fw:vw-points';
const loadOpt = () => { try { return { color: 'rgb', size: 2, solid: '#15803d', bg: 'theme', ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { color: 'rgb', size: 2, solid: '#15803d', bg: 'theme' }; } };
const saveOpt = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* */ } };

function finish(n, X, Y, Z, rgb, inten, cls, meta) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, i0 = Infinity, i1 = -Infinity; const classes = {};
  for (let i = 0; i < n; i++) { if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i]; if (Z[i] < z0) z0 = Z[i]; if (Z[i] > z1) z1 = Z[i]; if (inten) { if (inten[i] < i0) i0 = inten[i]; if (inten[i] > i1) i1 = inten[i]; } if (cls) classes[cls[i]] = (classes[cls[i]] || 0) + 1; }
  return { n, X, Y, Z, rgb, inten, cls, classes: cls ? classes : null, bbox: { x0, y0, z0, x1, y1, z1, dx: x1 - x0, dy: y1 - y0, dz: z1 - z0 }, irange: inten ? [i0, i1] : null, ...meta };
}
function readLAS(buf) {
  const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  if (new TextDecoder().decode(u8.subarray(0, 4)) !== 'LASF') throw new Error('No LASF signature');
  const ver = `${u8[24]}.${u8[25]}`; const hs = dv.getUint16(94, true), off = dv.getUint32(96, true), nvlr = dv.getUint32(100, true);
  const fmt = u8[104] & 0x3f; if (u8[104] & 0xc0) throw human('This LAS file is compressed (LAZ)', 'Compressed points need the bundled LAZ engine of the real viewer.', 'compression bit set');
  const rl = dv.getUint16(105, true); let total = dv.getUint32(107, true); if (!total && u8[25] >= 4) total = Number(dv.getBigUint64(247, true));
  const sc = [0, 1, 2].map((k) => dv.getFloat64(131 + k * 8, true)), of = [0, 1, 2].map((k) => dv.getFloat64(155 + k * 8, true));
  const sys = new TextDecoder().decode(u8.subarray(26, 58)).replace(/\0.*$/s, '').trim(), sw = new TextDecoder().decode(u8.subarray(58, 90)).replace(/\0.*$/s, '').trim();
  let epsg = null; let p = hs; for (let v = 0; v < nvlr && p + 54 <= off; v++) { const rec = dv.getUint16(p + 18, true), len = dv.getUint16(p + 20, true); if (rec === 34735) { const n = dv.getUint16(p + 54 + 6, true); for (let k = 0; k < n; k++) { const kid = dv.getUint16(p + 54 + 8 + k * 8, true), val = dv.getUint16(p + 54 + 8 + k * 8 + 6, true); if (kid === 3072 || kid === 2048) epsg = val; } } p += 54 + len; }
  const step = Math.max(1, Math.ceil(total / MAX)); const n = Math.floor((total - 1) / step) + 1;
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float32Array(n), I = new Uint16Array(n), C = new Uint8Array(n);
  const hasRGB = [2, 3, 5, 7, 8, 10].includes(fmt); const rgbOff = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }[fmt]; const RGB = hasRGB ? new Uint8Array(n * 3) : null; const RAW = hasRGB ? new Uint16Array(n * 3) : null; let max16 = 0;
  for (let i = 0, k = 0; i < total && k < n; i += step, k++) {
    const o = off + i * rl; X[k] = dv.getInt32(o, true) * sc[0] + of[0]; Y[k] = dv.getInt32(o + 4, true) * sc[1] + of[1]; Z[k] = dv.getInt32(o + 8, true) * sc[2] + of[2]; I[k] = dv.getUint16(o + 12, true);
    C[k] = fmt >= 6 ? u8[o + 16] : u8[o + 15] & 31;
    if (hasRGB) for (let c = 0; c < 3; c++) { const v = dv.getUint16(o + rgbOff + c * 2, true); if (v > max16) max16 = v; RAW[k * 3 + c] = v; }
  }
  if (hasRGB) for (let i = 0; i < RAW.length; i++) RGB[i] = max16 > 255 ? RAW[i] >> 8 : RAW[i]; // 16-bit colours → 8 bit
  return finish(n, X, Y, Z, RGB, I, C, { total, kind: `LAS ${ver} · point format ${fmt}`, system: sys, software: sw, epsg: epsg ? `EPSG:${epsg}` : null });
}
function readPLY(buf) {
  const u8 = new Uint8Array(buf); const he = new TextDecoder().decode(u8.subarray(0, 8192)).indexOf('end_header'); if (he < 0) throw new Error('No PLY header');
  const head = new TextDecoder().decode(u8.subarray(0, he)); const nv = +(/element vertex (\d+)/.exec(head)?.[1] || 0);
  const props = []; let inV = false; for (const l of head.split('\n')) { if (/^element vertex/.test(l)) inV = true; else if (/^element/.test(l)) inV = false; else if (inV && /^property/.test(l)) { const t = l.trim().split(/\s+/); props.push({ type: t[1], name: t[2] }); } }
  const ix = (n) => props.findIndex((p) => p.name === n); const [xi, yi, zi, ri, gi, bi] = ['x', 'y', 'z', 'red', 'green', 'blue'].map(ix);
  const step = Math.max(1, Math.ceil(nv / MAX)); const n = Math.floor((nv - 1) / step) + 1; const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float32Array(n); const RGB = ri >= 0 ? new Uint8Array(n * 3) : null;
  const start = he + 11; const fmtA = /format ascii/.test(head);
  if (fmtA) { const lines = new TextDecoder().decode(u8.subarray(start)).split('\n'); for (let i = 0, k = 0; i < nv && k < n; i += step, k++) { const v = lines[i].trim().split(/\s+/).map(Number); X[k] = v[xi]; Y[k] = v[yi]; Z[k] = v[zi]; if (RGB) { RGB[k * 3] = v[ri]; RGB[k * 3 + 1] = v[gi]; RGB[k * 3 + 2] = v[bi]; } } }
  else {
    const le = /binary_little_endian/.test(head); const size = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
    const offs = []; let rl = 0; for (const p of props) { offs.push(rl); rl += size[p.type] || 4; }
    const dv = new DataView(buf); const rd = (o, t) => (t === 'float' || t === 'float32' ? dv.getFloat32(o, le) : t === 'double' || t === 'float64' ? dv.getFloat64(o, le) : t === 'uchar' || t === 'uint8' ? dv.getUint8(o) : t === 'ushort' || t === 'uint16' ? dv.getUint16(o, le) : t === 'int' || t === 'int32' ? dv.getInt32(o, le) : dv.getFloat32(o, le));
    for (let i = 0, k = 0; i < nv && k < n; i += step, k++) { const o = start + i * rl; X[k] = rd(o + offs[xi], props[xi].type); Y[k] = rd(o + offs[yi], props[yi].type); Z[k] = rd(o + offs[zi], props[zi].type); if (RGB) { RGB[k * 3] = rd(o + offs[ri], props[ri].type); RGB[k * 3 + 1] = rd(o + offs[gi], props[gi].type); RGB[k * 3 + 2] = rd(o + offs[bi], props[bi].type); } }
  }
  return finish(n, X, Y, Z, RGB, null, null, { total: nv, kind: `PLY · ${fmtA ? 'ASCII' : 'binary'}` });
}
function readText(text, kind) {
  const lines = text.split(/\r?\n/); const rows = [];
  for (const l of lines) { if (!l.trim() || /^[#%/A-Za-z]/.test(l.trim()) && !/^-?\d/.test(l.trim())) continue; const v = l.trim().split(/[\s,;]+/).map(Number); if (v.length >= 3 && v.slice(0, 3).every(Number.isFinite)) rows.push(v); }
  if (kind === 'pts' && rows.length && rows[0].length === 1) rows.shift();
  if (!rows.length) throw human('No points found', 'The text file has no lines with X Y Z numbers.', 'no xyz rows');
  const step = Math.max(1, Math.ceil(rows.length / MAX)); const n = Math.floor((rows.length - 1) / step) + 1;
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float32Array(n); const w = rows[0].length; const ci = w >= 7 ? w - 3 : w === 6 ? 3 : -1; const RGB = ci >= 0 ? new Uint8Array(n * 3) : null; const I = w === 4 || w === 7 ? new Uint16Array(n) : null;
  for (let i = 0, k = 0; k < n; i += step, k++) { const r = rows[i]; X[k] = r[0]; Y[k] = r[1]; Z[k] = r[2]; if (RGB) { RGB[k * 3] = r[ci]; RGB[k * 3 + 1] = r[ci + 1]; RGB[k * 3 + 2] = r[ci + 2]; } if (I) I[k] = Math.max(0, r[3]); }
  return finish(n, X, Y, Z, RGB, I, null, { total: rows.length, kind: `${kind.toUpperCase()} · text` });
}
const ramp = (t) => { const s = [[37, 99, 235], [13, 148, 136], [132, 204, 22], [234, 179, 8], [234, 88, 12], [220, 38, 38]]; t = Math.max(0, Math.min(0.999, t)) * (s.length - 1); const i = Math.floor(t), f = t - i; return s[i].map((v, k) => v + (s[i + 1][k] - v) * f); };

export default {
  id: 'points', label: 'Point cloud', icon: 'scan',
  inspOpen: () => false, measureLabel: 'Measurements',
  modes: [{ id: 'orbit', label: 'Orbit', icon: 'rotate-3d', key: 'o', tip: 'Orbit · drag to turn' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm', tip: 'Measure · click two points' }, { id: 'station', label: 'Station', icon: 'scan', tip: 'Panorama from a scanner station' }],
  keys: [{ label: 'Top view', keys: 't' }, { label: 'Clip box', keys: 'b' }, { label: 'Pan', keys: 'shift' }],
  steps(d, ctx) {
    const x = extOf(d.name);
    return [
      { label: 'Loading point engine (bundled · 180 KB)', cached: 'Point engine ready', engine: 'points', ms: 380 },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 300, run: async () => { d.buf = await d.file.arrayBuffer(); } },
      { label: 'Decoding points', ms: 420, run: async () => {
        try {
          if (x === 'laz') throw human(`${d.name} is compressed (LAZ)`, 'This preview reads LAS, PLY, PCD and XYZ. The real viewer decodes LAZ with its bundled LAZ engine.', 'LAZ decoder not in mockup');
          if (x === 'e57') throw human(`${d.name} needs the E57 engine`, 'This preview reads LAS, PLY, PCD and XYZ. The real viewer streams E57 scans, including station panoramas, with its bundled E57 engine.', 'E57 decoder not in mockup');
          d.data = x === 'las' ? readLAS(d.buf) : x === 'ply' ? readPLY(d.buf) : readText(new TextDecoder().decode(d.buf), x);
        } catch (e) { if (e.human) throw e; throw human(`${d.name} couldn’t be read as a point cloud`, 'The file is damaged or isn’t a supported point cloud.', String(e.message || e)); }
        d.buf = null; d.meas = []; d.opt = loadOpt(); if (d.opt.color === 'rgb' && !d.data.rgb) d.opt.color = 'height';
      } },
      { label: `Preparing ${'points'} for display`, ms: 260 },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  bar(d, ctx) { return `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="pc-top" aria-pressed="${!!d.top}" data-tip="Top view" data-tip-kbd="t">${ctx.icon('arrow-down')}Top</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="pc-clip" aria-pressed="${!!d.clipOn}" data-tip="Clip to a box" data-tip-kbd="b">${ctx.icon('square-dashed')}Clip</button>`; },
  bindBar(d, fb) { fb.querySelector('#pc-top')?.addEventListener('click', () => d.ctl.toggleTop()); fb.querySelector('#pc-clip')?.addEventListener('click', () => d.ctl.toggleClip()); },
  inspector(d, ctx) {
    const D = d.data, b = D.bbox; const nf = ctx.nf;
    const info = ctx.kv([
      ['Points', `<strong>${nf(D.total)}</strong>${D.n < D.total ? `<span class="ov-subline">${nf(D.n)} shown (every ${Math.ceil(D.total / D.n)}th)</span>` : ''}`],
      ['Extent', `${nf(b.dx, 1)} × ${nf(b.dy, 1)} m · ${nf(b.dz, 1)} m high`],
      ['Heights', `${nf(b.z0, 2)} to ${nf(b.z1, 2)} m`],
      ['Colour', D.rgb ? 'RGB from the scanner' : 'No colour in the file'],
      D.irange ? ['Intensity', `${nf(D.irange[0])} to ${nf(D.irange[1])}`] : null,
      D.classes ? ['Classes', Object.entries(D.classes).sort((a, c) => c[1] - a[1]).map(([k, v]) => `<span class="pc-cls"><span class="ov-swatch" style="color:rgb(${(CLASS_RGB[k] || [150, 150, 150]).join(',')})"></span>${ctx.esc(CLASS[k] || `Class ${k}`)} <span class="ov-subline" style="display:inline">${nf(v)}</span></span>`).join('')] : null,
      ['Coordinates', D.epsg ? D.epsg : 'Not stored in the file'],
      ['Format', `${ctx.esc(D.kind)}${D.software ? `<span class="ov-subline">${ctx.esc(D.software)}</span>` : ''}`],
    ]);
    let measure = null;
    if (d.meas.length) measure = `<ol class="ov-meas">${d.meas.map((m, i) => { const dx = m.b[0] - m.a[0], dy = m.b[1] - m.a[1], dz = m.b[2] - m.a[2]; const hz = Math.hypot(dx, dy); return `<li class="ov-meas__row ${i === d.meas.length - 1 ? 'is-last' : ''}"><span class="ov-meas__n">${i + 1}</span><span class="ov-meas__main"><span class="ov-meas__val">${nf(m.dist, 2)} m</span><span class="ov-meas__sub">horizontal ${nf(hz, 2)} m · height ${dz >= 0 ? '+' : ''}${nf(dz, 2)} m · slope ${hz ? nf((dz / hz) * 100, 1) : '—'} %</span></span><button class="fw-iconbtn fw-iconbtn--sm ov-meas__x" type="button" aria-label="Remove measurement ${i + 1}" data-rm="${i}">${ctx.icon('x')}</button></li>`; }).join('')}</ol><div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="pc-copy">${ctx.icon('copy')}Copy</button><button class="fw-btn fw-btn--sm" type="button" id="pc-csv">${ctx.icon('download')}CSV</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="pc-clear">Clear</button></div>`;
    return { info, infoLabel: 'Scan', measure };
  },
  bindInspector(d, root, ctx) {
    root.querySelector('#pc-copy')?.addEventListener('click', (e) => ctx.copyText(d.meas.map((m) => `${m.dist.toFixed(3)} m`).join('\n'), e.currentTarget));
    root.querySelector('#pc-csv')?.addEventListener('click', () => exportMeas(d, ctx));
    root.querySelector('#pc-clear')?.addEventListener('click', () => { const old = d.meas.splice(0); d.ctl.redraw(); ctx.refresh('insp'); ctx.toast('Measurements cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { d.meas.push(...old); d.ctl.redraw(); ctx.refresh('insp'); } } }); });
    root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { d.meas.splice(+b.dataset.rm, 1); d.ctl.redraw(); ctx.refresh('insp'); }));
  },
  options(d, ctx) {
    const o = d.opt; const set = (p) => { Object.assign(o, p); saveOpt(o); d.ctl.redraw(); d.ctl.applyBg(); };
    return [
      { group: 'Colour points by', items: [['rgb', 'Scanner colour (RGB)', !d.data.rgb], ['height', 'Height'], ['intensity', 'Intensity', !d.data.inten], ['class', 'Classification', !d.data.cls], ['solid', 'One colour']].map(([v, l, dis]) => ({ label: l, radio: true, checked: o.color === v, disabled: !!dis, onSelect: () => set({ color: v }) })) },
      { group: 'Point size', html: `<div class="vw-menu-slider"><label class="fw-slider"><span class="fw-slider__label">Size</span><output class="fw-slider__value">${o.size} px</output><input type="range" min="1" max="6" step="1" value="${o.size}" aria-label="Point size"></label>${o.color === 'solid' ? `<label class="vw-menu-color" style="padding:6px 0 0">Point colour<input type="color" value="${o.solid}" aria-label="Point colour"></label>` : ''}</div>`, bind: (x) => { const r = x.querySelector('input[type=range]'); r.addEventListener('input', () => { x.querySelector('output').textContent = `${r.value} px`; set({ size: +r.value }); }); x.querySelector('input[type=color]')?.addEventListener('input', (e) => set({ solid: e.target.value })); }, items: [] },
      { group: 'View', items: [
        { label: 'Top view', kbd: 't', checked: !!d.top, onSelect: () => d.ctl.toggleTop() },
        { label: 'Clip box', kbd: 'b', checked: !!d.clipOn, onSelect: () => d.ctl.toggleClip() },
        { label: 'Show clip box outline', checked: d.boxLine !== false, disabled: !d.clipOn, onSelect: () => { d.boxLine = d.boxLine === false; d.ctl.redraw(); } },
        { label: 'Fit', icon: 'maximize', kbd: 'f', onSelect: () => d.ctl.fit() },
        { label: 'Full screen', icon: 'expand', onSelect: () => d.ctl.fullscreen() },
        ...[['theme', 'Match theme'], ['dark', 'Dark background'], ['light', 'Light background']].map(([v, l]) => ({ label: l, radio: true, checked: o.bg === v, onSelect: () => set({ bg: v }) })),
      ] },
    ];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const m = d.meas.length;
    return [
      { group: 'Image', items: [{ label: 'Snapshot as PNG', sub: 'This view', icon: 'image', file: `${b}.png`, onSelect: () => d.ctl.snapshot() }] },
      { group: 'Data', items: [
        { label: 'Measurements as CSV', sub: m ? `${m} distance${m > 1 ? 's' : ''}` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !m, onSelect: () => exportMeas(d, ctx) },
        { label: d.clipOn ? 'Clipped points as XYZ' : 'Points as XYZ', sub: 'X Y Z R G B, text', icon: 'file-text', file: `${b}${d.clipOn ? '-clip' : ''}.xyz`, onSelect: () => exportPts(d, ctx, 'xyz') },
        { label: d.clipOn ? 'Clipped points as PLY' : 'Points as PLY', sub: 'Binary, with colour', icon: 'box', file: `${b}${d.clipOn ? '-clip' : ''}.ply`, onSelect: () => exportPts(d, ctx, 'ply') }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'meas', label: 'Measure distance', icon: 'ruler', run: () => ctx.setMode(d, 'measure') },
      { id: 'top', label: 'Top view', icon: 'arrow-down', kbd: 't', run: () => d.ctl.toggleTop() },
      { id: 'clip', label: 'Clip to a box', icon: 'square-dashed', kbd: 'b', run: () => d.ctl.toggleClip() },
      ...['rgb', 'height', 'intensity', 'class'].map((c) => ({ id: 'c-' + c, label: `Colour by ${c === 'rgb' ? 'scanner colour' : c}`, icon: 'palette', searchOnly: true, run: () => { d.opt.color = c; saveOpt(d.opt); d.ctl.redraw(); } })),
    ];
  },
  mobileSlots(d) { return [{ id: 'clip', label: 'Clip', icon: 'square-dashed', pressed: !!d.clipOn, run: (doc) => doc.ctl.toggleClip() }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'View', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
function exportMeas(d, ctx) { const name = `${ctx.baseName(d.name)}-measurements.csv`; ctx.download(name, 'n,distance_m,horizontal_m,height_diff_m,ax,ay,az,bx,by,bz\n' + d.meas.map((m, i) => [i + 1, m.dist.toFixed(3), Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]).toFixed(3), (m.b[2] - m.a[2]).toFixed(3), ...m.a.map((v) => v.toFixed(3)), ...m.b.map((v) => v.toFixed(3))].join(',')).join('\n'), 'text/csv'); ctx.toast(`Saved ${name}`); }
function exportPts(d, ctx, kind) {
  const D = d.data; const keep = []; for (let i = 0; i < D.n; i++) if (!d.clipOn || d.ctl.inClip(i)) keep.push(i);
  const name = `${ctx.baseName(d.name)}${d.clipOn ? '-clip' : ''}.${kind}`;
  if (kind === 'xyz') { const parts = []; for (const i of keep) parts.push(`${D.X[i].toFixed(3)} ${D.Y[i].toFixed(3)} ${D.Z[i].toFixed(3)}${D.rgb ? ` ${D.rgb[i * 3]} ${D.rgb[i * 3 + 1]} ${D.rgb[i * 3 + 2]}` : ''}`); ctx.download(name, parts.join('\n') + '\n', 'text/plain'); }
  else { const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${keep.length}\nproperty double x\nproperty double y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`; const buf = new ArrayBuffer(keep.length * 23); const dv = new DataView(buf); keep.forEach((i, k) => { const o = k * 23; dv.setFloat64(o, D.X[i], true); dv.setFloat64(o + 8, D.Y[i], true); dv.setFloat32(o + 16, D.Z[i], true); const c = D.rgb ? [D.rgb[i * 3], D.rgb[i * 3 + 1], D.rgb[i * 3 + 2]] : [200, 200, 200]; dv.setUint8(o + 20, c[0]); dv.setUint8(o + 21, c[1]); dv.setUint8(o + 22, c[2]); }); ctx.download(name, new Blob([head, buf])); }
  ctx.toast(`Saved ${name} · ${ctx.nf(keep.length)} points`);
}

function mountView(d, el, ctx) {
  const D = d.data, b = D.bbox; const ctr = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]; const R = Math.hypot(b.dx, b.dy, b.dz) / 2 || 1;
  const cam = { yaw: -0.7, pitch: 0.55, dist: R * 2.6, fit: R * 2.6, pan: [0, 0] }; let needs = true, raf = 0, W = 0, H = 0, dpr = 1, live = null, hover = null, popL = null;
  d.clip = d.clip || { x: [0, 1], y: [0, 1], z: [0, 1] };
  el.classList.add('pc'); el.innerHTML = `<canvas class="pc-canvas" tabindex="0" role="img" aria-label="${ctx.esc(d.name)}: point cloud. Drag to orbit, scroll to zoom."></canvas>
    <div class="pc-clip" hidden><div class="pc-clip__head"><strong>Clip box</strong><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-reset>Reset</button></div>
      ${['x', 'y', 'z'].map((a) => `<div class="pc-clip__row"><span>${a === 'z' ? 'Height' : a === 'x' ? 'East' : 'North'}</span><input type="range" min="0" max="100" value="${d.clip[a][0] * 100}" data-a="${a}" data-k="0" aria-label="${a} from"><input type="range" min="0" max="100" value="${d.clip[a][1] * 100}" data-a="${a}" data-k="1" aria-label="${a} to"></div>`).join('')}</div>
    <div class="pc-station" hidden><div class="fw-empty"><div class="fw-empty__icon">${ctx.icon('scan')}</div><div class="fw-empty__title">No station panorama in this file</div><div class="fw-empty__text">Panoramas come with E57 scans that store the scanner’s photos per station.</div></div></div>
    <div class="dxf-result pc-result" hidden></div>`;
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), clipEl = el.querySelector('.pc-clip'), resEl = el.querySelector('.pc-result');
  let img = null, zbuf = null, pick = null, cols = null;
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr)); cv.width = W; cv.height = H; img = g.createImageData(W, H); zbuf = new Float32Array(W * H); pick = new Int32Array(W * H); needs = true; }
  function colors() {
    const n = D.n, o = d.opt; const c = new Uint8Array(n * 3);
    const solid = [1, 3, 5].map((i) => parseInt(o.solid.slice(i, i + 2), 16));
    for (let i = 0; i < n; i++) {
      let v;
      if (o.color === 'rgb' && D.rgb) v = [D.rgb[i * 3], D.rgb[i * 3 + 1], D.rgb[i * 3 + 2]];
      else if (o.color === 'intensity' && D.inten) { const t = (D.inten[i] - D.irange[0]) / ((D.irange[1] - D.irange[0]) || 1); const q = 40 + t * 215; v = [q, q, q]; }
      else if (o.color === 'class' && D.cls) v = CLASS_RGB[D.cls[i]] || [150, 150, 150];
      else if (o.color === 'solid') v = solid;
      else v = ramp((D.Z[i] - b.z0) / (b.dz || 1));
      c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2];
    }
    cols = c; cols.key = `${o.color}|${o.solid}`;
  }
  const inClip = (i) => { const C = d.clip; const tx = (D.X[i] - b.x0) / (b.dx || 1), ty = (D.Y[i] - b.y0) / (b.dy || 1), tz = (D.Z[i] - b.z0) / (b.dz || 1); return tx >= C.x[0] && tx <= C.x[1] && ty >= C.y[0] && ty <= C.y[1] && tz >= C.z[0] && tz <= C.z[1]; };
  let cy, sy, cp, sp, f;
  const setup = () => { const pitch = d.top ? Math.PI / 2 - 0.0001 : cam.pitch; cy = Math.cos(cam.yaw); sy = Math.sin(cam.yaw); cp = Math.cos(pitch); sp = Math.sin(pitch); f = Math.min(W, H) * 1.1; };
  const proj = (x, y, z) => { x -= ctr[0]; y -= ctr[1]; z -= ctr[2]; const x1 = x * cy - y * sy, y1 = x * sy + y * cy; const vx = x1, vy = z * cp + y1 * sp, vz = y1 * cp - z * sp; const dd = cam.dist + vz; return [W / 2 + cam.pan[0] * dpr + (f * vx) / dd, H / 2 + cam.pan[1] * dpr - (f * vy) / dd, dd]; };
  function bgColor() { const st = getComputedStyle(el); const m = /#([0-9a-f]{6})/i.exec(st.getPropertyValue('--pc-bg')) || /#([0-9a-f]{6})/i.exec(st.getPropertyValue('--stage')); return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : [244, 244, 245]; }
  function draw() {
    needs = false; if (!img) return; setup(); if (!cols || cols.key !== `${d.opt.color}|${d.opt.solid}`) colors();
    const data = new Uint32Array(img.data.buffer); const bg = bgColor(); const bgv = (255 << 24) | (bg[2] << 16) | (bg[1] << 8) | bg[0];
    data.fill(bgv); zbuf.fill(Infinity); pick.fill(-1);
    const s = Math.max(1, Math.round(d.opt.size * dpr * 0.9)); const half = s >> 1; const clipOn = d.clipOn;
    for (let i = 0; i < D.n; i++) {
      if (clipOn && !inClip(i)) continue;
      const p = proj(D.X[i], D.Y[i], D.Z[i]); if (p[2] <= 0.01) continue; const px = p[0] | 0, py = p[1] | 0; if (px < -s || py < -s || px >= W + s || py >= H + s) continue;
      const col = (255 << 24) | (cols[i * 3 + 2] << 16) | (cols[i * 3 + 1] << 8) | cols[i * 3];
      for (let yy = py - half; yy < py - half + s; yy++) { if (yy < 0 || yy >= H) continue; const row = yy * W; for (let xx = px - half; xx < px - half + s; xx++) { if (xx < 0 || xx >= W) continue; const k = row + xx; if (p[2] < zbuf[k]) { zbuf[k] = p[2]; data[k] = col; pick[k] = i; } } }
    }
    g.putImageData(img, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (clipOn && d.boxLine !== false) drawBox();
    drawMeas();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  const P3 = (i) => [D.X[i], D.Y[i], D.Z[i]];
  function drawBox() {
    const C = d.clip; const xs = [b.x0 + b.dx * C.x[0], b.x0 + b.dx * C.x[1]], ys = [b.y0 + b.dy * C.y[0], b.y0 + b.dy * C.y[1]], zs = [b.z0 + b.dz * C.z[0], b.z0 + b.dz * C.z[1]];
    const v = []; for (const x of xs) for (const y of ys) for (const z of zs) v.push(proj(x, y, z).map((q, k) => (k < 2 ? q / dpr : q)));
    g.strokeStyle = 'rgba(21,128,61,.9)'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath();
    for (const [a, c] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) { g.moveTo(v[a][0], v[a][1]); g.lineTo(v[c][0], v[c][1]); }
    g.stroke(); g.setLineDash([]);
  }
  function pill(x, y, text, strong) { g.font = '600 12px Geist, system-ui, sans-serif'; const w = g.measureText(text).width + 16; g.fillStyle = strong ? '#15803d' : '#fff'; g.strokeStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.roundRect(x - w / 2, y - 11, w, 22, 11); g.fill(); if (!strong) g.stroke(); g.fillStyle = strong ? '#fff' : '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5); }
  function drawMeas() {
    const seg = (a, c, label, liveSeg) => { const p = proj(...a), q = proj(...c); const ax = p[0] / dpr, ay = p[1] / dpr, bx = q[0] / dpr, by = q[1] / dpr; g.strokeStyle = '#16a34a'; g.lineWidth = 2; g.setLineDash(liveSeg ? [5, 4] : []); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]); for (const [x, y] of [[ax, ay], [bx, by]]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); g.strokeStyle = '#16a34a'; g.stroke(); } pill((ax + bx) / 2, (ay + by) / 2 - 16, label, !liveSeg); };
    d.meas.forEach((m) => seg(m.a, m.b, `${ctx.nf(m.dist, 2)} m`));
    if (live && hover != null) { const c = P3(hover); seg(live, c, `${ctx.nf(Math.hypot(c[0] - live[0], c[1] - live[1], c[2] - live[2]), 2)} m`, true); }
    if (hover != null && d.mode === 'measure') { const p = proj(...P3(hover)); g.strokeStyle = '#16a34a'; g.lineWidth = 2; g.strokeRect(p[0] / dpr - 6, p[1] / dpr - 6, 12, 12); }
    const last = d.meas.at(-1); resEl.hidden = !last || !ctx.isMobile(); if (last) resEl.innerHTML = `<span class="dxf-result__label">Distance</span><strong>${ctx.nf(last.dist, 2)} m</strong>`;
  }
  const pickAt = (x, y) => { const cx = Math.round(x * dpr), cyy = Math.round(y * dpr); let best = -1, bd = 1e9; const r = Math.round(8 * dpr); for (let yy = cyy - r; yy <= cyy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) { if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = pick[yy * W + xx]; if (i < 0) continue; const dd = (xx - cx) ** 2 + (yy - cyy) ** 2; if (dd < bd) { bd = dd; best = i; } } return best < 0 ? null : best; };
  function loop() { raf = requestAnimationFrame(loop); if (needs && ctx.isActive(d) && d.mode !== 'station') draw(); }
  const ptrs = new Map(); let drag = null, pinch = null, moved = 0;
  const loc = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, loc(e)); moved = 0; if (ptrs.size === 2) { const [a, c] = [...ptrs.values()]; pinch = Math.hypot(a[0] - c[0], a[1] - c[1]); drag = null; return; } drag = { p: loc(e), yaw: cam.yaw, pitch: cam.pitch, pan: [...cam.pan], btn: e.button, shift: e.shiftKey }; });
  cv.addEventListener('pointermove', (e) => {
    const p = loc(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size === 2) { const [a, c] = [...ptrs.values()]; const nd = Math.hypot(a[0] - c[0], a[1] - c[1]); cam.dist = Math.max(R * 0.05, Math.min(R * 20, cam.dist * (pinch / nd))); pinch = nd; needs = true; ctx.refresh('zoom'); return; }
    if (drag) { const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1]; moved = Math.max(moved, Math.hypot(dx, dy)); if (moved > 3 && (d.mode === 'orbit' || moved > 8)) { if (drag.btn === 2 || drag.btn === 1 || drag.shift) cam.pan = [drag.pan[0] + dx, drag.pan[1] + dy]; else { cam.yaw = drag.yaw - dx * 0.008; if (!d.top) cam.pitch = Math.max(-0.2, Math.min(1.55, drag.pitch + dy * 0.008)); } needs = true; } }
    else if (d.mode === 'measure') { hover = pickAt(p[0], p[1]); needs = true; }
  });
  const up = (e) => {
    const p = loc(e); ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    const click = drag && moved <= 8; drag = null;
    if (click && d.mode === 'measure') { const i = pickAt(p[0], p[1]); if (i != null) { const c = P3(i); if (!live) { live = c; popL = ctx.pushLayer(() => { live = null; popL = null; needs = true; }); } else { d.meas.push({ a: live, b: c, dist: Math.hypot(c[0] - live[0], c[1] - live[1], c[2] - live[2]) }); live = null; popL?.(); popL = null; ctx.showInsp(); ctx.refresh('insp'); } needs = true; } }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(R * 0.05, Math.min(R * 20, cam.dist * Math.exp(e.deltaY * 0.0012))); needs = true; ctx.refresh('zoom'); }, { passive: false });
  clipEl.addEventListener('input', (e) => { const r = e.target.closest('input[type=range]'); if (!r) return; const a = r.dataset.a, k = +r.dataset.k; d.clip[a][k] = r.value / 100; if (d.clip[a][0] > d.clip[a][1]) { d.clip[a][k] = d.clip[a][1 - k]; r.value = d.clip[a][k] * 100; } needs = true; });
  clipEl.querySelector('[data-reset]').onclick = () => { d.clip = { x: [0, 1], y: [0, 1], z: [0, 1] }; clipEl.querySelectorAll('input').forEach((x) => { x.value = x.dataset.k === '0' ? 0 : 100; }); needs = true; };
  const applyBg = () => { el.dataset.bg = d.opt.bg; needs = true; };
  const ro = new ResizeObserver(resize); ro.observe(cv);
  applyBg(); resize(); loop();
  el.dataset.mode = d.mode;
  const setMode = (m) => { el.dataset.mode = m; el.querySelector('.pc-station').hidden = m !== 'station'; live = null; popL?.(); popL = null; hover = null; needs = true; };
  setMode(d.mode);
  return {
    zoom: () => (cam.fit / cam.dist) * 100, isFit: () => Math.abs(cam.dist - cam.fit) < 1e-6 && !cam.pan[0] && !cam.pan[1],
    fit: () => { cam.dist = cam.fit; cam.pan = [0, 0]; needs = true; ctx.refresh('zoom'); }, setZoom: (p) => { cam.dist = cam.fit / (p / 100); needs = true; }, zoomBy: (k) => { cam.dist = Math.max(R * 0.05, Math.min(R * 20, cam.dist / k)); needs = true; },
    setMode, redraw: () => { needs = true; }, applyBg, onTheme: () => { needs = true; }, onResize: resize, onShow: resize, inClip,
    toggleTop: () => { d.top = !d.top; needs = true; ctx.refresh('frame'); },
    toggleClip: () => { d.clipOn = !d.clipOn; clipEl.hidden = !d.clipOn; needs = true; ctx.refresh('frame'); },
    fullscreen: () => { const s = document.getElementById('stage'); if (document.fullscreenElement) document.exitFullscreen(); else s.requestFullscreen?.().catch(() => ctx.toast('Full screen isn’t available here', { type: 'info' })); },
    snapshot: () => { cv.toBlob((bl) => { const name = `${ctx.baseName(d.name)}.png`; ctx.download(name, bl); ctx.toast(`Saved ${name} · ${W} × ${H} px`); }); },
    key: (e) => { const k = e.key.toLowerCase(); if (k === 't') { d.ctl.toggleTop(); return true; } if (k === 'b') { d.ctl.toggleClip(); return true; } if (e.key.startsWith('Arrow')) { if (e.key === 'ArrowLeft') cam.yaw -= 0.12; if (e.key === 'ArrowRight') cam.yaw += 0.12; if (e.key === 'ArrowUp') cam.pitch = Math.min(1.55, cam.pitch + 0.1); if (e.key === 'ArrowDown') cam.pitch = Math.max(-0.2, cam.pitch - 0.1); needs = true; return true; } return false; },
    screenOf: (x, y, z) => { setup(); const p = proj(x, y, z); const r = cv.getBoundingClientRect(); return { x: r.left + p[0] / dpr, y: r.top + p[1] / dpr }; },
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); popL?.(); },
  };
}
