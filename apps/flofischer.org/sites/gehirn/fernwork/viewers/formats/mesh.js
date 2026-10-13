// Viewers · STL / OBJ Viewer. Real parsers (STL binary + ASCII, OBJ, PLY meshes, 3MF), watertight check, size / volume /
// surface / weight, units, camera presets, wireframe, flat shading, axes, mesh colour, background, section plane,
// point-to-point measuring. Rendering is the shared software 3D stage (render3d.js).
import { mount3d } from './render3d.js';
import { readZip, zipText } from './zip.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const UNIT = { mm: ['millimetres', 1], cm: ['centimetres', 10], m: ['metres', 1000], in: ['inches', 25.4] };
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();
const OPT_KEY = 'fw:vw-mesh';
const loadOpt = () => { let o = {}; try { o = JSON.parse(localStorage.getItem(OPT_KEY) || '{}'); } catch { /* */ } return { wire: false, flat: false, axes: false, dims: true, spin: true, color: null, bg: 'theme', ...o }; };
const saveOpt = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* */ } };

export function parseSTL(buf, name) {
  const size = buf.byteLength; const dv = new DataView(buf);
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(size, 512)));
  if (size >= 84 && 84 + dv.getUint32(80, true) * 50 === size) {
    const n = dv.getUint32(80, true); const pos = new Float32Array(n * 9);
    const header = new TextDecoder().decode(new Uint8Array(buf, 0, 80)).replace(/\0.*$/s, '').trim();
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
    return finish(pos, 'STL · binary', header);
  }
  if (/^\s*solid/.test(head) && /facet/.test(head)) {
    const t = new TextDecoder().decode(new Uint8Array(buf)); const v = []; const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g; let m;
    while ((m = re.exec(t))) v.push(+m[1], +m[2], +m[3]);
    if (v.length >= 9 && v.length % 9 === 0) return finish(new Float32Array(v), 'STL · ASCII', (/^\s*solid\s*(.*)/.exec(t)?.[1] || '').trim());
  }
  const zeros = new Uint8Array(buf).every((b) => b === 0);
  if (size < 84) throw human(`${name} couldn’t be opened as a 3D model`, `It’s only ${size} bytes${zeros ? ' and every byte is zero' : ''}. A real STL needs at least 134 bytes for a single triangle, so this is probably an unfinished download or a failed export.`, `Binary STL: file shorter than the 84-byte header (${size} bytes). ASCII STL: no “solid … facet” found.`);
  const claimed = size >= 84 ? dv.getUint32(80, true) : 0;
  throw human(`${name} couldn’t be opened as a 3D model`, `The header promises ${claimed.toLocaleString('en-US')} triangles, but the file is ${size.toLocaleString('en-US')} bytes, so it’s cut off or isn’t an STL.`, `Expected ${84 + claimed * 50} bytes for ${claimed} triangles, found ${size}.`);
}
function parseOBJ(text, name) {
  const v = [], out = [];
  for (const line of text.split('\n')) {
    const s = line.trim(); if (s.startsWith('v ')) { const p = s.split(/\s+/); v.push([+p[1], +p[2], +p[3]]); }
    else if (s.startsWith('f ')) { const idx = s.split(/\s+/).slice(1).map((x) => { const i = parseInt(x, 10); return i < 0 ? v.length + i : i - 1; }); for (let k = 1; k < idx.length - 1; k++) for (const j of [idx[0], idx[k], idx[k + 1]]) { const p = v[j]; if (!p) throw new Error('face uses a missing vertex'); out.push(p[0], -p[2], p[1]); } }
  }
  if (!out.length) throw human(`${name} has no faces`, 'The OBJ file lists no triangles or polygons, so there is nothing to show.', 'No “f” lines found.');
  return finish(new Float32Array(out), 'OBJ', '');
}
function parsePLY(buf, name) {
  const u8 = new Uint8Array(buf); const headEnd = new TextDecoder().decode(u8.slice(0, 4096)).indexOf('end_header'); if (headEnd < 0) throw new Error('No PLY header');
  const head = new TextDecoder().decode(u8.slice(0, headEnd)); const nv = +(/element vertex (\d+)/.exec(head)?.[1] || 0), nf = +(/element face (\d+)/.exec(head)?.[1] || 0);
  if (!nf) throw human(`${name} is a point cloud, not a mesh`, 'This PLY file has points but no faces. Open it in the Point Cloud viewer instead.', 'PLY without faces');
  if (!/format ascii/.test(head)) throw human(`${name} uses binary PLY`, 'This mockup reads ASCII PLY meshes; the real viewer reads both.', 'binary PLY');
  const body = new TextDecoder().decode(u8.slice(headEnd + 11)).trim().split('\n'); const v = body.slice(0, nv).map((l) => l.trim().split(/\s+/).map(Number)); const out = [];
  for (const l of body.slice(nv, nv + nf)) { const p = l.trim().split(/\s+/).map(Number); const idx = p.slice(1, 1 + p[0]); for (let k = 1; k < idx.length - 1; k++) for (const j of [idx[0], idx[k], idx[k + 1]]) out.push(v[j][0], v[j][1], v[j][2]); }
  return finish(new Float32Array(out), 'PLY · ASCII', '');
}
async function parse3MF(blob, name) {
  const zip = await readZip(blob); const key = [...zip.keys()].find((k) => /3dmodel\.model$/i.test(k)); if (!key) throw human(`${name} isn’t a 3MF model`, 'The package has no 3D/3dmodel.model inside.', 'missing model');
  const doc = new DOMParser().parseFromString(await zipText(zip, key), 'application/xml'); const out = [];
  for (const mesh of doc.getElementsByTagName('mesh')) { const v = [...mesh.getElementsByTagName('vertex')].map((x) => [+x.getAttribute('x'), +x.getAttribute('y'), +x.getAttribute('z')]); for (const t of mesh.getElementsByTagName('triangle')) for (const a of ['v1', 'v2', 'v3']) { const p = v[+t.getAttribute(a)]; out.push(p[0], p[1], p[2]); } }
  return finish(new Float32Array(out), '3MF', '');
}
function finish(pos, kind, header) {
  const n = pos.length / 9; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, vol = 0, area = 0;
  const nrm = new Float32Array(n * 3); const edges = new Map(); const key = (i) => `${Math.round(pos[i] * 1e3)},${Math.round(pos[i + 1] * 1e3)},${Math.round(pos[i + 2] * 1e3)}`;
  for (let t = 0; t < n; t++) {
    const o = t * 9; const ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5], cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    for (let k = 0; k < 9; k += 3) { const X = pos[o + k], Y = pos[o + k + 1], Z = pos[o + k + 2]; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z; }
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; area += l / 2;
    nrm[t * 3] = nx / l; nrm[t * 3 + 1] = ny / l; nrm[t * 3 + 2] = nz / l;
    const ks = [key(o), key(o + 3), key(o + 6)];
    for (let e = 0; e < 3; e++) { const a = ks[e], b = ks[(e + 1) % 3]; const k2 = a < b ? a + '|' + b : b + '|' + a; edges.set(k2, (edges.get(k2) || 0) + 1); }
  }
  let open = 0; for (const c of edges.values()) if (c !== 2) open++;
  return { pos, nrm, n, kind, header, bbox: { x0, y0, z0, x1, y1, z1, dx: x1 - x0, dy: y1 - y0, dz: z1 - z0 }, volume: Math.abs(vol), area, open };
}

const sectionBar = (d, ctx) => `<div class="m3-sec" role="group" aria-label="Section plane">
  <div class="fw-seg fw-seg--sm" aria-label="Cut along" id="sec-axis">${['x', 'y', 'z'].map((a) => `<button class="fw-seg__opt" type="button" data-value="${a}" aria-checked="${d.ctl3?.st.section.axis === a}">${a.toUpperCase()}</button>`).join('')}</div>
  <label class="fw-slider m3-sec__slider"><span class="fw-slider__label">Position</span><output class="fw-slider__value"></output><input type="range" min="0" max="1000" value="550" aria-label="Section position"></label>
  <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-flip aria-pressed="false">${ctx.icon('flip-horizontal')}Flip</button></div>`;
export function bindSection(d, el, ctx, ctl3, label) {
  const box = el.querySelector('.m3-sec'); const inp = box.querySelector('input'); const S = ctl3.st.section;
  const upd = () => { S.pos = inp.value / 1000; const b = d.data.bbox; const i = { x: 0, y: 1, z: 2 }[S.axis]; const lo = [b.x0, b.y0, b.z0][i], span = [b.dx, b.dy, b.dz][i]; box.querySelector('output').textContent = label(lo + span * S.pos - lo); inp.style.setProperty('--p', inp.value / 10 + '%'); ctl3.redraw(); };
  box.querySelector('#sec-axis').addEventListener('fw-change', (e) => { S.axis = e.detail.value; upd(); ctx.refresh('insp'); });
  inp.addEventListener('input', upd);
  box.querySelector('[data-flip]').addEventListener('click', (e) => { S.flip = !S.flip; e.currentTarget.setAttribute('aria-pressed', String(S.flip)); ctl3.redraw(); });
  ctx.enhance(box);
  return { show: (on) => { box.hidden = !on; if (on) { if (!S.axis) S.axis = 'z'; box.querySelectorAll('.fw-seg__opt').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === S.axis))); upd(); } else { S.axis = null; ctl3.redraw(); } } };
}

export default {
  id: 'mesh', label: '3D model', icon: 'box',
  inspOpen: () => true, measureLabel: 'Measurements',
  modes: [{ id: 'orbit', label: 'Orbit', icon: 'rotate-3d', key: 'o', tip: 'Orbit · drag to turn' }, { id: 'section', label: 'Section', icon: 'scissors', key: 's', tip: 'Cut through the part' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm', tip: 'Measure · click two points' }],
  keys: [{ label: 'Turn the model', keys: 'arrowleft' }, { label: 'Pan', keys: 'shift' }],
  steps(d, ctx) {
    return [
      { label: 'Loading 3D engine (bundled · 610 KB)', cached: '3D engine ready', engine: '3d', ms: 600 },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 220, run: async () => { d.buf = await d.file.arrayBuffer(); } },
      { label: 'Building mesh', ms: 420, run: async () => {
        const x = extOf(d.name);
        d.data = x === 'obj' ? parseOBJ(new TextDecoder().decode(d.buf), d.name) : x === 'ply' ? parsePLY(d.buf, d.name) : x === '3mf' ? await parse3MF(d.file, d.name) : parseSTL(d.buf, d.name);
        d.buf = null; d.unit = 'mm'; d.meas = []; d.opt = loadOpt();
      } },
      { label: 'Checking it’s watertight', ms: 200 },
    ];
  },
  mount(d, el, ctx) {
    el.classList.add('m3'); el.dataset.bg = d.opt.bg;
    const holder = ctx.h('<div class="m3-holder"></div>'); el.append(holder);
    const c3 = mount3d(holder, ctx, d.data, { label: d.name, dims: d.opt.dims, spin: d.opt.spin, color: d.opt.color, meas: d.meas, unitF: () => UNIT[d.unit][1], active: () => ctx.isActive(d),
      onMeasure: () => { ctx.showInsp(); ctx.refresh('insp'); }, onZoom: () => ctx.refresh('zoom'), onSpin: (on) => { d.opt.spin = on; } });
    Object.assign(c3.st, { wire: d.opt.wire, flat: d.opt.flat, axes: d.opt.axes });
    d.ctl3 = c3;
    el.insertAdjacentHTML('beforeend', sectionBar(d, ctx));
    const sec = bindSection(d, el, ctx, c3, (v) => `${ctx.nf(v * UNIT[d.unit][1], 1)} mm`);
    const setMode = (m) => { el.dataset.mode = m; c3.setMode(m === 'section' ? 'orbit' : m); sec.show(m === 'section'); };
    setMode(d.mode);
    return { ...c3, setMode, onTheme: () => c3.readColors(), onShow: () => c3.onResize(), snapshot: () => c3.snapshot(`${ctx.baseName(d.name)}.png`) };
  },
  inspector(d, ctx) {
    const M = d.data, f = UNIT[d.unit][1]; const mm = (v) => v * f; const b = M.bbox; const cm3 = (M.volume * f ** 3) / 1000;
    const info = ctx.kv([
      ['Size', `<strong>${ctx.nf(mm(b.dx), 1)} × ${ctx.nf(mm(b.dy), 1)} × ${ctx.nf(mm(b.dz), 1)} mm</strong><span class="ov-subline">width × depth × height</span>`],
      ['Volume', `<strong>${ctx.nf(cm3, 1)} cm³</strong>`],
      ['Surface', `${ctx.nf((M.area * f ** 2) / 100, 1)} cm²`],
      ['Weight', `≈ ${ctx.nf(cm3 * 1.24, 0)} g in PLA · ${ctx.nf(cm3 * 7.85, 0)} g in steel`],
      ['Printable', M.open ? `<span class="ov-warnline">${ctx.icon('triangle-alert', { size: 14 })}${ctx.nf(M.open)} open edges</span><span class="ov-subline">Holes in the surface; slicers may fail.</span>` : `<span class="ov-okline">${ctx.icon('circle-check', { size: 14 })}Watertight</span>`],
      ['Triangles', `${ctx.nf(M.n)} · ${M.kind}`],
      ['Units', `<select class="fw-select ov-unitsel" id="mesh-unit" aria-label="Units of this file">${Object.entries(UNIT).map(([k, [n]]) => `<option value="${k}" ${k === d.unit ? 'selected' : ''}>${n[0].toUpperCase() + n.slice(1)}</option>`).join('')}</select><span class="ov-subline">The file doesn’t store units; millimetres is usual.</span>`],
    ]);
    let measure = null;
    if (d.meas.length) measure = `<ol class="ov-meas">${d.meas.map((m, i) => `<li class="ov-meas__row ${i === d.meas.length - 1 ? 'is-last' : ''}"><span class="ov-meas__n">${i + 1}</span><span class="ov-meas__main"><span class="ov-meas__val">${ctx.nf(m.dist * f, 2)} mm</span><span class="ov-meas__sub">Δx ${ctx.nf(Math.abs(m.b[0] - m.a[0]) * f, 1)} · Δy ${ctx.nf(Math.abs(m.b[1] - m.a[1]) * f, 1)} · Δz ${ctx.nf(Math.abs(m.b[2] - m.a[2]) * f, 1)} mm</span></span></li>`).join('')}</ol><div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="m3-copy">${ctx.icon('copy')}Copy</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="m3-clear">Clear</button></div>`;
    return { info, infoLabel: 'Part', measure };
  },
  bindInspector(d, root, ctx) {
    root.querySelector('#mesh-unit')?.addEventListener('change', (e) => { d.unit = e.target.value; ctx.refresh('insp'); d.ctl.redraw(); });
    root.querySelector('#m3-copy')?.addEventListener('click', (e) => ctx.copyText(d.meas.map((m) => `${(m.dist * UNIT[d.unit][1]).toFixed(2)} mm`).join('\n'), e.currentTarget));
    root.querySelector('#m3-clear')?.addEventListener('click', () => { const old = d.meas.splice(0); d.ctl.redraw(); ctx.refresh('insp'); ctx.toast('Measurements cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { d.meas.push(...old); d.ctl.redraw(); ctx.refresh('insp'); } } }); });
  },
  options(d, ctx) {
    const o = d.opt, c = d.ctl3; const set = (k, v) => { o[k] = v; saveOpt(o); if (k === 'bg') d.el.querySelector('.m3').dataset.bg = v, c.readColors(); else if (k === 'spin') c.setSpin(v); else c.set(k, v); };
    return [
      { group: 'Camera', items: [['Iso', -38, 28], ['Front', 0, 0], ['Top', 0, 89], ['Side', 90, 0]].map(([n, y, p]) => ({ label: `${n} view`, icon: 'box', onSelect: () => c.view(y, p) })).concat([{ label: 'Fit', icon: 'maximize', kbd: 'f', onSelect: () => c.fit() }]) },
      { group: 'Display', items: [
        { label: 'Turntable', sub: 'Slow automatic rotation', checked: c.st.spin, onSelect: () => set('spin', !c.st.spin) },
        { label: 'Dimensions on the model', checked: c.st.dims, onSelect: () => set('dims', !c.st.dims) },
        { label: 'Wireframe', checked: c.st.wire, onSelect: () => set('wire', !c.st.wire) },
        { label: 'Flat shading', checked: c.st.flat, onSelect: () => set('flat', !c.st.flat) },
        { label: 'Axes', sub: 'X Y Z helper', checked: c.st.axes, onSelect: () => set('axes', !c.st.axes) },
      ] },
      { group: 'Colours', html: `<label class="vw-menu-color">Mesh colour<input type="color" value="${o.color || '#a1aab5'}" aria-label="Mesh colour"></label>`, bind: (x) => x.querySelector('input').addEventListener('input', (e) => { o.color = e.target.value; saveOpt(o); c.setColor(o.color); }), items: [] },
      { group: 'Background', items: [['theme', 'Match theme'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, radio: true, checked: o.bg === v, onSelect: () => set('bg', v) })) },
    ];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name);
    return [
      { group: 'Image', items: [{ label: 'Snapshot as PNG', sub: 'This view · 2×', icon: 'image', file: `${b}.png`, onSelect: () => d.ctl.snapshot() }] },
      { group: 'Data', items: [
        { label: 'Dimensions as JSON', sub: 'Size, volume, surface, triangles', icon: 'braces', file: `${b}-dimensions.json`, onSelect: () => { const M = d.data, f = UNIT[d.unit][1]; const name = `${b}-dimensions.json`; ctx.download(name, JSON.stringify({ file: d.name, units: 'mm', size_mm: [M.bbox.dx * f, M.bbox.dy * f, M.bbox.dz * f].map((v) => +v.toFixed(3)), volume_cm3: +((M.volume * f ** 3) / 1000).toFixed(3), surface_cm2: +((M.area * f ** 2) / 100).toFixed(3), triangles: M.n, watertight: !M.open }, null, 2), 'application/json'); ctx.toast(`Saved ${name}`); } },
        { label: 'Measurements as CSV', sub: d.meas.length ? `${d.meas.length} distances` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !d.meas.length, onSelect: () => { const f = UNIT[d.unit][1]; const name = `${b}-measurements.csv`; ctx.download(name, 'n,distance_mm,ax,ay,az,bx,by,bz\n' + d.meas.map((m, i) => [i + 1, (m.dist * f).toFixed(3), ...m.a.map((v) => (v * f).toFixed(3)), ...m.b.map((v) => (v * f).toFixed(3))].join(',')).join('\n'), 'text/csv'); ctx.toast(`Saved ${name}`); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'sec', label: 'Section view', sub: 'Cut through the part', icon: 'scissors', run: () => ctx.setMode(d, 'section') },
      { id: 'meas', label: 'Measure on the part', sub: 'M · click two points', icon: 'ruler', run: () => ctx.setMode(d, 'measure') },
      { id: 'png', label: 'Save snapshot as PNG', icon: 'image', run: () => d.ctl.snapshot() },
      { id: 'spin', label: 'Turntable on/off', icon: 'rotate-3d', searchOnly: true, run: () => d.ctl3.toggleSpin() },
      ...[['Top', 0, 89], ['Front', 0, 0], ['Iso', -38, 28]].map(([n, y, p]) => ({ id: 'v' + n, label: `${n} view`, icon: 'box', searchOnly: true, run: () => d.ctl3.view(y, p) })),
    ];
  },
  mobileSlots(d) { return [{ id: 'info', label: 'Size', icon: 'ruler' }, { id: 'more', label: 'View', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
