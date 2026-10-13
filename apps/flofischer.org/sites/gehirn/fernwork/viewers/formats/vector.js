// Viewers · shared 2D vector stage for DXF drawings and Shapefiles (today both use one vector viewer).
// SVG renderer with a local origin (UTM stays precise), Pan · Select · Measure with snapping, layers, display options
// (snap, fill closed shapes, 3D tilt view), background incl. a map underneath (mocked offline here; the real build
// loads tiles), coordinate system picker, scale calibration, unit-aware readouts and exports.

export const PX_PER_M_AT_100 = 37.795; // 100 % = paper scale 1:100 on a 96 dpi screen
const NS = 'http://www.w3.org/2000/svg';
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]);
export function segDist(p, a, b) { const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1))); const q = [a[0] + ab[0] * t, a[1] + ab[1] * t]; return { d: len(sub(p, q)), q }; }
export function segsOf(e) { if (e.kind === 'line' || e.kind === 'dim') return [[e.pts[0], e.pts[1]]]; if (e.kind === 'polyline') { const s = []; for (let i = 0; i < e.pts.length - 1; i++) s.push([e.pts[i], e.pts[i + 1]]); if (e.closed) s.push([e.pts.at(-1), e.pts[0]]); return s; } return []; }
export function entLength(e) { if (e.kind === 'circle') return 2 * Math.PI * e.r; if (e.kind === 'arc') return (((e.a1 - e.a0) % 360 + 360) % 360 || 360) / 360 * 2 * Math.PI * e.r; return segsOf(e).reduce((s, [a, b]) => s + len(sub(b, a)), 0); }
export const bearing = (a, b) => { const g = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI; return (g + 360) % 360; };
export const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
export const fmtCoord = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
export const fmtLen = (v, u) => { const m = v * u.toM; return Math.abs(m) >= 1 ? `${m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : `${(m * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} cm`; };
export const fmtArea = (a, u) => { const m2 = a * u.toM ** 2; return m2 >= 10000 ? `${(m2 / 10000).toLocaleString('en-US', { maximumFractionDigits: 3 })} ha` : `${m2.toLocaleString('en-US', { maximumFractionDigits: 1 })} m²`; };
export function aci(c) { return [1, 2, 3, 4, 5, 6, 7, 8, 30].includes(c) ? c : 7; }
export function bboxOf(ents) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const e of ents) {
    if (e.kind === 'circle' || e.kind === 'arc') { add(e.x - e.r, e.y - e.r); add(e.x + e.r, e.y + e.r); }
    else if (e.kind === 'point') add(e.x, e.y);
    else if (e.kind === 'text') { const w = e.h * 0.55 * (e.mtext ? Math.max(...e.lines.map((l) => l.t.length)) : e.text.length); add(e.x - w / 2, e.y - e.h); add(e.x + w / 2, e.y + e.h); }
    else if (e.kind === 'dim') for (const p of e.dim) add(p[0], p[1]);
    else for (const p of e.pts) add(p[0], p[1]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
/** Shift big projected coordinates to a local origin so float maths stays precise. */
export function localize(out) {
  const xs = [], ys = [];
  for (const e of out.ents) for (const p of e.pts || [[e.x, e.y]]) { xs.push(p[0]); ys.push(p[1]); }
  let ox = Infinity, oy = Infinity; for (const x of xs) if (x < ox) ox = x; for (const y of ys) if (y < oy) oy = y;
  ox = Math.floor(ox); oy = Math.floor(oy); out.origin = { x: ox, y: oy };
  for (const e of out.ents) {
    if (e.pts) e.pts = e.pts.map(([x, y]) => [x - ox, y - oy]);
    if (e.x != null) { e.x -= ox; e.y -= oy; }
    if (e.dim) e.dim = e.dim.map(([x, y]) => [x - ox, y - oy]);
  }
  out.bbox = bboxOf(out.ents);
}

// ───────────────────────── coordinate systems ─────────────────────────
export const CRS_LIST = [
  ['EPSG:25832', 'ETRS89 / UTM zone 32N', 'Germany west, Denmark, Norway'], ['EPSG:25833', 'ETRS89 / UTM zone 33N', 'Germany east, Austria, Poland'],
  ['EPSG:32632', 'WGS 84 / UTM zone 32N', 'GPS-based surveys'], ['EPSG:31467', 'DHDN / Gauss-Krüger zone 3', 'Older German maps'],
  ['EPSG:31468', 'DHDN / Gauss-Krüger zone 4', 'Older German maps (east)'], ['EPSG:31466', 'DHDN / Gauss-Krüger zone 2', 'Older German maps (far west)'],
  ['EPSG:4326', 'WGS 84 (latitude / longitude)', 'GPS, GeoJSON, KML'], ['EPSG:3857', 'Web Mercator', 'Web maps'],
  ['EPSG:2056', 'CH1903+ / LV95', 'Switzerland'], ['EPSG:31287', 'MGI / Austria Lambert', 'Austria'],
  ['EPSG:27700', 'OSGB 1936 / British National Grid', 'Great Britain'], ['EPSG:2154', 'RGF93 / Lambert-93', 'France'],
  ['EPSG:28992', 'Amersfoort / RD New', 'Netherlands'], ['EPSG:5514', 'S-JTSK / Krovak East North', 'Czechia, Slovakia'],
];
export const crsName = (code) => CRS_LIST.find((c) => c[0] === code)?.[1] || 'Projected coordinates';
function suggestCRS(D) {
  const E = D.origin.x + D.bbox.x0, N = D.origin.y + D.bbox.y0;
  if (E > 166000 && E < 834000 && N > 5200000 && N < 6200000) return [['EPSG:25832', 'Coordinates look like UTM in Germany'], ['EPSG:25833', 'Same, one zone east'], ['EPSG:32632', 'UTM 32N on WGS 84']];
  if (E > 2400000 && E < 5600000 && N > 5200000 && N < 6200000) { const z = Math.floor(E / 1e6); return [[`EPSG:3146${4 + z}`, `Gauss-Krüger zone ${z} (first digit of the easting)`]]; }
  if (Math.abs(E) <= 180 && Math.abs(N) <= 90) return [['EPSG:4326', 'Values look like longitude / latitude']];
  if (E > 2400000 && E < 2900000 && N > 1000000 && N < 1400000) return [['EPSG:2056', 'Coordinates look like Swiss LV95']];
  return [];
}
export function openCRSPicker(d, ctx, onPick) {
  const sug = suggestCRS(d.data);
  const body = ctx.h(`<div class="vx-crs">
    <label class="fw-inputwrap">${ctx.icon('search')}<input class="fw-input" type="search" placeholder="Search EPSG code or name" aria-label="Search coordinate systems"></label>
    ${sug.length ? `<div class="vx-crs__group"><div class="fw-label">Suggested for this file</div>${sug.map(([c, why]) => row(c, why, true)).join('')}</div>` : ''}
    <div class="vx-crs__group"><div class="fw-label">All</div><div class="vx-crs__all">${CRS_LIST.map(([c, n, where]) => row(c, where)).join('')}</div></div></div>`);
  function row(c, why, sugg) { return `<button class="vx-crs__row ${d.data.crs === c ? 'is-cur' : ''}" type="button" data-crs="${c}"><span class="vx-crs__code">${c}</span><span class="vx-crs__main"><span>${ctx.esc(crsName(c))}</span><span class="vx-crs__why">${ctx.esc(why)}</span></span>${d.data.crs === c ? ctx.icon('check') : sugg ? '<span class="fw-badge fw-badge--accent">Suggested</span>' : ''}</button>`; }
  const dlg = ctx.openDialog({ title: 'Coordinate system', body, size: 520, actions: [{ label: 'Cancel', ghost: true }] });
  const inp = body.querySelector('input');
  inp.addEventListener('input', () => { const q = inp.value.toLowerCase(); body.querySelectorAll('.vx-crs__all .vx-crs__row').forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); }); });
  body.addEventListener('click', (e) => { const b = e.target.closest('[data-crs]'); if (!b) return; dlg.close(); onPick(b.dataset.crs); });
  setTimeout(() => inp.focus(), 60);
}

// ───────────────────────── basemap (offline mock of the tile layer) ─────────────────────────
export const MAPS = [['streets', 'Streets'], ['light-streets', 'Light streets'], ['dark-streets', 'Dark streets'], ['outdoors', 'Outdoors'], ['satellite', 'Satellite'], ['satellite-labels', 'Satellite + labels']];
const PAL = {
  streets: { land: '#efe9df', park: '#cfe6c4', road: '#ffffff', major: '#fbd68b', casing: '#d8cfc2', bld: '#dcd3c7', water: '#a9d3f0', label: '#5b5348' },
  'light-streets': { land: '#f6f6f4', park: '#e3efe0', road: '#ffffff', major: '#ffffff', casing: '#dedede', bld: '#e8e8e6', water: '#d4e6f4', label: '#7a7a7a' },
  'dark-streets': { land: '#1f2329', park: '#22302a', road: '#3a404a', major: '#4b5260', casing: '#15181c', bld: '#2a2f37', water: '#1b2b3d', label: '#a8b0bb' },
  outdoors: { land: '#eef0e2', park: '#bcdcae', road: '#ffffff', major: '#f5c26b', casing: '#c9c4b3', bld: '#d9d4c6', water: '#9fcbea', label: '#4f5a44' },
};
const ROADS = (o) => [ // sample neighbourhood around Lindenstraße 14 (absolute ETRS89 / UTM 32N metres)
  { n: 'Lindenstraße', w: 9, major: true, p: [[512180, 5612372], [512300, 5612373.5], [512420, 5612371], [512560, 5612366]] },
  { n: 'Kirchweg', w: 7, p: [[512301, 5612260], [512300, 5612373.5], [512304, 5612500]] },
  { n: 'Am Weinberg', w: 7, p: [[512402, 5612250], [512407, 5612371], [512395, 5612470], [512430, 5612540]] },
  { n: 'Gartenstraße', w: 6, p: [[512180, 5612290], [512300, 5612291], [512402, 5612294], [512560, 5612288]] },
  { n: 'Fuldaweg', w: 6, p: [[512180, 5612450], [512304, 5612452], [512398, 5612452]] },
].map((r) => ({ ...r, p: r.p.map(([x, y]) => [x - o.x, y - o.y]) }));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
let satTex = null;
function satelliteTexture() {
  if (satTex) return satTex;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); const r = rng(7);
  g.fillStyle = '#4d5a3b'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) { const x = r() * 512, y = r() * 512, s = 4 + r() * 26; g.fillStyle = `hsla(${70 + r() * 50},${18 + r() * 25}%,${22 + r() * 22}%,.55)`; g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r()), r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
  satTex = c.toDataURL('image/jpeg', 0.85); return satTex;
}
export function drawBasemap(g, style, D, mk) {
  g.replaceChildren(); if (!style) return;
  const b = D.bbox, o = D.origin; const pad = Math.max(160, Math.max(b.w, b.h) * 1.4);
  const X0 = b.x0 - pad, Y0 = b.y0 - pad, W = b.w + pad * 2, H = b.h + pad * 2;
  const sat = style.startsWith('satellite'); const P = PAL[style] || PAL.streets; const r = rng(Math.round(o.x / 50) ^ Math.round(o.y / 50));
  if (sat) {
    const im = mk('image', { x: X0, y: Y0, width: W, height: H, preserveAspectRatio: 'none', transform: `translate(0 ${2 * Y0 + H}) scale(1 -1)` }, g); im.setAttribute('href', satelliteTexture());
  } else mk('rect', { x: X0, y: Y0, width: W, height: H, fill: P.land }, g);
  // parks, water, buildings
  if (!sat) { for (let i = 0; i < 6; i++) { const x = X0 + r() * W, y = Y0 + r() * H, w = 30 + r() * 70, h = 20 + r() * 60; mk('rect', { x, y, width: w, height: h, rx: 6, fill: P.park }, g); } }
  const river = `M${X0} ${Y0 + H * 0.12} C ${X0 + W * 0.3} ${Y0 + H * 0.02}, ${X0 + W * 0.6} ${Y0 + H * 0.22}, ${X0 + W} ${Y0 + H * 0.08}`;
  mk('path', { d: river, fill: 'none', stroke: sat ? '#2c4a5c' : P.water, 'stroke-width': 18, 'stroke-linecap': 'round' }, g);
  const roads = ROADS(o);
  for (const rd of roads) mk('polyline', { points: rd.p.map((p) => p.join(',')).join(' '), fill: 'none', stroke: sat ? 'rgba(40,40,40,.55)' : P.casing, 'stroke-width': rd.w + 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
  for (const rd of roads) mk('polyline', { points: rd.p.map((p) => p.join(',')).join(' '), fill: 'none', stroke: sat ? 'rgba(170,165,155,.85)' : rd.major ? P.major : P.road, 'stroke-width': rd.w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
  // building blocks along the roads (avoid the drawing itself)
  for (let i = 0; i < 140; i++) {
    const rd = roads[Math.floor(r() * roads.length)]; const k = Math.floor(r() * (rd.p.length - 1)); const a = rd.p[k], c = rd.p[k + 1]; const t = r();
    const p = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]; const dir = Math.atan2(c[1] - a[1], c[0] - a[0]); const side = r() < 0.5 ? 1 : -1; const off = rd.w / 2 + 6 + r() * 6;
    const cx = p[0] - Math.sin(dir) * off * side, cy = p[1] + Math.cos(dir) * off * side; const w = 9 + r() * 8, h = 8 + r() * 6;
    if (cx > b.x0 - 12 && cx < b.x1 + 12 && cy > b.y0 - 12 && cy < b.y1 + 12) continue;
    mk('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: sat ? `hsl(${10 + r() * 25},${12 + r() * 20}%,${38 + r() * 18}%)` : P.bld, transform: `translate(${cx} ${cy}) rotate(${(dir * 180) / Math.PI})` }, g);
  }
  if (style !== 'satellite') for (const rd of roads) {
    const a = rd.p[0], c = rd.p[1]; const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; let rot = (Math.atan2(c[1] - a[1], c[0] - a[0]) * 180) / Math.PI; if (rot > 90 || rot < -90) rot += 180;
    const t = mk('text', { transform: `translate(${m[0]} ${m[1]}) scale(1 -1) rotate(${-rot})`, 'font-size': 4.2, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: sat ? '#fff' : P.label, class: 'vx-maplabel' }, g); t.textContent = rd.n;
  }
}

// ───────────────────────── options (persisted per viewer) ─────────────────────────
export function loadOpts(key) { let o = {}; try { o = JSON.parse(localStorage.getItem('fw:vw-' + key) || '{}'); } catch { /* */ } return { bg: 'theme', map: null, snap: true, fill: true, view: '2d', ignore2d: false, mapOpacity: 0.7, ...o }; }
export function saveOpts(key, o) { try { localStorage.setItem('fw:vw-' + key, JSON.stringify(o)); } catch { /* */ } }
export function optionGroups(d, ctx, key) {
  const o = d.opt; const set = (p) => { Object.assign(o, p); saveOpts(key, o); d.ctl.applyOpts(); ctx.refresh('frame insp'); };
  const needCRS = (style) => { if (d.data.crs) return set({ map: style }); openCRSPicker(d, ctx, (c) => { d.data.crs = c; d.data.crsSrc = 'chosen'; set({ map: style }); ctx.toast(`Coordinates set to ${c}`, { type: 'neutral' }); }); };
  return [
    { group: 'Display', items: [
      { label: 'Snap to corners', sub: 'While measuring', checked: o.snap, onSelect: () => set({ snap: !o.snap }) },
      { label: 'Fill closed shapes', checked: o.fill, onSelect: () => set({ fill: !o.fill }) },
      { label: '3D view', sub: 'Drag to tilt and turn', checked: o.view === '3d', onSelect: () => set({ view: o.view === '3d' ? '2d' : '3d' }) },
      { label: 'Ignore 2D in 3D', sub: d.data.flat ? 'This drawing is flat (all at height 0)' : 'Hide objects at height 0', checked: o.ignore2d, disabled: o.view !== '3d' || d.data.flat, onSelect: () => set({ ignore2d: !o.ignore2d }) },
    ] },
    { group: 'Background', items: [
      ...[['theme', 'Match theme'], ['light', 'Light paper'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, radio: true, checked: !o.map && o.bg === v, onSelect: () => set({ bg: v, map: null }) })),
      ...MAPS.map(([v, l], i) => ({ label: `Map: ${l}`, sub: i === 0 ? 'Loads map tiles from Mapbox for this area' : '', radio: true, checked: o.map === v, onSelect: () => needCRS(v) })),
    ] },
    { group: 'Coordinates', items: [
      { label: 'Coordinate system…', icon: 'globe', hint: d.data.crs || 'Not set', onSelect: () => openCRSPicker(d, ctx, (c) => { d.data.crs = c; d.data.crsSrc = 'chosen'; ctx.refresh('insp status'); ctx.toast(`Coordinates set to ${c} · ${crsName(c)}`, { type: 'neutral' }); }) },
      { label: 'Calibrate scale…', icon: 'scaling', sub: d.meas?.length ? 'From your last measurement' : 'Measure a known distance first', disabled: !d.meas?.length, onSelect: () => calibrate(d, ctx) },
      ...(d.calib && d.calib !== 1 ? [{ label: 'Reset scale', icon: 'rotate-ccw', sub: `Now × ${d.calib.toFixed(4)}`, onSelect: () => { d.data.units.toM /= d.calib; d.calib = 1; d.ctl.redraw(); ctx.refresh('insp status'); } }] : []),
      { label: 'Clear measurements', icon: 'eraser', disabled: !d.meas?.length, onSelect: () => clearMeas(d, ctx) },
    ] },
  ];
}
export function clearMeas(d, ctx) { const old = d.meas; d.meas = []; d.ctl.redraw(); ctx.refresh('insp'); ctx.toast('Measurements cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { d.meas = old; d.ctl.redraw(); ctx.refresh('insp'); } } }); }
export function calibrate(d, ctx) {
  const m = d.meas.at(-1); if (!m) return; const u = d.data.units;
  const cur = (m.dist * u.toM).toFixed(3);
  const body = ctx.h(`<div class="fw-stack" style="--gap:12px"><p class="fw-t-sm fw-muted">Measured in the drawing: <strong>${fmtLen(m.dist, u)}</strong>. Type what this distance really is; every length is scaled to match.</p>
    <label class="fw-field"><span class="fw-field__label">Real length (metres)</span><input class="fw-input" type="number" step="0.001" min="0" value="${cur}" id="cal-real"></label></div>`);
  const dlg = ctx.openDialog({ title: 'Calibrate scale', body, size: 420, actions: [{ label: 'Cancel', ghost: true }, { label: 'Apply', primary: true, onClick: () => {
    const real = parseFloat(body.querySelector('#cal-real').value); if (!(real > 0)) return;
    const f = real / (m.dist * u.toM); u.toM *= f; d.calib = (d.calib || 1) * f; d.ctl.redraw(); ctx.refresh('insp status');
    ctx.toast(`Scale × ${f.toFixed(4)} applied`, { type: 'success', action: { label: 'Undo', onClick: () => { u.toM /= f; d.calib /= f; d.ctl.redraw(); ctx.refresh('insp status'); } } });
  } }] });
  setTimeout(() => body.querySelector('#cal-real').select(), 60);
  return dlg;
}

// ───────────────────────── layer list ─────────────────────────
export function layerList(d, ctx, { title = 'Layers', swatch = (L) => `dxf-c${aci(L.color)}` } = {}) {
  const el = ctx.h(`<div class="ov-listpanel"><div class="ov-listhead"><span class="ov-listhead__title">${ctx.esc(title)}</span><span class="ov-listhead__count"></span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm ov-listhead__btn" type="button" data-all>Show all</button></div><div class="ov-layers" role="list"></div></div>`);
  const box = el.querySelector('.ov-layers');
  for (const L of d.data.layers.values()) {
    if (!L.count) continue;
    box.append(ctx.h(`<div class="ov-layer" role="listitem">
      <button class="ov-layer__toggle" type="button" aria-pressed="${L.on}" data-layer="${ctx.esc(L.name)}" title="${ctx.esc(L.name)}">
        <span class="ov-layer__eye">${ctx.icon('eye', { size: 16 })}${ctx.icon('eye-off', { size: 16 })}</span>
        <span class="ov-swatch ${swatch(L)}"></span><span class="ov-layer__name">${ctx.esc(L.name)}</span><span class="ov-layer__n">${L.count}</span></button>
      <button class="fw-iconbtn fw-iconbtn--sm ov-layer__only" type="button" aria-label="Show only ${ctx.esc(L.name)}" data-tip="Show only this" data-only="${ctx.esc(L.name)}">${ctx.icon('crosshair')}</button></div>`));
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-layer]'); const o = e.target.closest('[data-only]');
    if (t) { const L = d.data.layers.get(t.dataset.layer); setLayer(d, ctx, L.name, !L.on); }
    else if (o) { for (const L of d.data.layers.values()) L.on = L.name === o.dataset.only; d.ctl.applyLayers(); syncLayerList(d); ctx.refresh('insp'); }
    else if (e.target.closest('[data-all]')) { for (const L of d.data.layers.values()) L.on = true; d.ctl.applyLayers(); syncLayerList(d); ctx.refresh('insp'); }
  });
  d._layerEl = el; syncLayerList(d);
  return el;
}
export function syncLayerList(d) {
  const el = d._layerEl; if (!el) return;
  el.querySelectorAll('[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(d.data.layers.get(b.dataset.layer).on)));
  const L = [...d.data.layers.values()].filter((l) => l.count);
  el.querySelector('.ov-listhead__count').textContent = `${L.filter((l) => l.on).length} of ${L.length}`;
  el.querySelector('[data-all]').hidden = L.every((l) => l.on);
}
export function setLayer(d, ctx, name, on, announce = false) {
  const L = d.data.layers.get(name); L.on = on; d.ctl.applyLayers(); syncLayerList(d); ctx.refresh('insp');
  if (announce) ctx.toast(`${on ? 'Showing' : 'Hid'} layer ${name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => setLayer(d, ctx, name, !on) } });
}
export function layerCommands(d, ctx) {
  const L = [...d.data.layers.values()].filter((l) => l.count);
  return [
    ...L.map((l) => ({ id: 'lay-' + l.name, label: `${l.on ? 'Hide' : 'Show'} layer ${l.name}`, sub: `${l.count} objects`, icon: l.on ? 'eye-off' : 'eye', syn: ['layer', 'layers off', 'hide', 'show'], searchOnly: true, run: () => setLayer(d, ctx, l.name, !l.on, true) })),
    { id: 'lay-all', label: 'Show all layers', icon: 'eye', searchOnly: true, run: () => { for (const l of L) l.on = true; d.ctl.applyLayers(); syncLayerList(d); ctx.refresh('insp'); } },
  ];
}

// ───────────────────────── measurements in the inspector ─────────────────────────
export function measureHtml(d, ctx) {
  if (!d.meas?.length) return null; const u = d.data.units; const nf = ctx.nf;
  const tot = d.meas.reduce((s, m) => s + m.dist, 0);
  return `<ol class="ov-meas">${d.meas.map((m, i) => `<li class="ov-meas__row ${i === d.meas.length - 1 ? 'is-last' : ''}"><span class="ov-meas__n">${i + 1}</span><span class="ov-meas__main"><span class="ov-meas__val">${fmtLen(m.dist, u)}</span><span class="ov-meas__sub">ΔE ${nf((m.b[0] - m.a[0]) * u.toM, 2)} · ΔN ${nf((m.b[1] - m.a[1]) * u.toM, 2)} · ${nf(bearing(m.a, m.b), 1)}° from north</span></span><button class="fw-iconbtn fw-iconbtn--sm ov-meas__x" type="button" aria-label="Remove measurement ${i + 1}" data-tip="Remove" data-rm="${i}">${ctx.icon('x')}</button></li>`).join('')}</ol>
    ${d.meas.length > 1 ? `<div class="ov-meas__total"><span>Total</span><strong>${fmtLen(tot, u)}</strong></div>` : ''}
    <div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="meas-copy">${ctx.icon('copy')}Copy</button><button class="fw-btn fw-btn--sm" type="button" id="meas-csv">${ctx.icon('download')}CSV</button><button class="fw-btn fw-btn--sm" type="button" id="meas-cal">${ctx.icon('scaling')}Calibrate…</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="meas-clear">Clear</button></div>
    ${d.calib && d.calib !== 1 ? `<p class="ov-hint">Scale calibrated × ${d.calib.toFixed(4)}.</p>` : ''}`;
}
export function bindMeasure(d, root, ctx, exportCSV) {
  root.querySelector('#meas-copy')?.addEventListener('click', (e) => ctx.copyText(d.meas.map((m) => fmtLen(m.dist, d.data.units)).join('\n'), e.currentTarget));
  root.querySelector('#meas-csv')?.addEventListener('click', () => exportCSV(d, ctx));
  root.querySelector('#meas-cal')?.addEventListener('click', () => calibrate(d, ctx));
  root.querySelector('#meas-clear')?.addEventListener('click', () => clearMeas(d, ctx));
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.rm; const [m] = d.meas.splice(i, 1); d.ctl.redraw(); ctx.refresh('insp'); ctx.toast(`Removed measurement ${i + 1}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { d.meas.splice(i, 0, m); d.ctl.redraw(); ctx.refresh('insp'); } } }); }));
}
export const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
export function exportMeasurements(d, ctx) {
  if (!d.meas?.length) return;
  const D = d.data, o = D.origin, u = D.units.toM;
  const rows = [['#', 'distance_m', 'from_E', 'from_N', 'to_E', 'to_N', 'bearing_deg', 'crs'], ...d.meas.map((m, i) => [i + 1, (m.dist * u).toFixed(3), (m.a[0] + o.x).toFixed(3), (m.a[1] + o.y).toFixed(3), (m.b[0] + o.x).toFixed(3), (m.b[1] + o.y).toFixed(3), bearing(m.a, m.b).toFixed(2), D.crs || ''])];
  const name = `${ctx.baseName(d.name)}-measurements.csv`; ctx.download(name, csv(rows), 'text/csv');
  ctx.toast(`Saved ${name} · ${d.meas.length} measurement${d.meas.length > 1 ? 's' : ''}`);
}
export function scaleDen(d) { const pxPerM = d.view.s / d.data.units.toM; const n = (100 * PX_PER_M_AT_100) / pxPerM; const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000]; return nice.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)); }
export function statusItems(d) {
  const D = d.data; const c = d.cursor;
  return [`<span class="ov-coords">${c ? `E ${fmtCoord(c[0] + D.origin.x)} · N ${fmtCoord(c[1] + D.origin.y)}` : 'E — · N —'}</span>`,
    D.crs ? `${D.crs} <span class="ov-src">(${D.crsSrc === 'chosen' ? 'chosen' : 'from file'})</span>` : 'Local coordinates'];
}

// ───────────────────────── exports (image) ─────────────────────────
function svgString(d) {
  const live = d.ctl.svg(); const svg = live.cloneNode(true); const r = live.getBoundingClientRect();
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
  const cs = getComputedStyle(live);
  svg.querySelectorAll('.dxf-grid').forEach((x) => x.remove());
  const lives = live.querySelectorAll('.dxf-layer');
  svg.querySelectorAll('.dxf-layer').forEach((g, i) => { const c = getComputedStyle(lives[i]).color; g.setAttribute('stroke', c); g.setAttribute('fill', 'none'); g.querySelectorAll('text').forEach((t) => { t.setAttribute('fill', c); t.setAttribute('stroke', 'none'); t.setAttribute('font-family', 'Geist, Arial, sans-serif'); }); g.querySelectorAll('line,polyline,polygon,circle,path').forEach((s) => { s.setAttribute('vector-effect', 'non-scaling-stroke'); s.setAttribute('stroke-width', g.classList.contains('is-heavy') ? 1.75 : 1.1); }); });
  svg.insertAdjacentHTML('afterbegin', `<rect width="100%" height="100%" fill="${cs.getPropertyValue('--vx-bg').trim() || '#fff'}"/>`);
  return { s: new XMLSerializer().serializeToString(svg), w: r.width, h: r.height };
}
export function exportSVG(d, ctx) { const { s } = svgString(d); const name = `${ctx.baseName(d.name)}.svg`; ctx.download(name, s, 'image/svg+xml'); ctx.toast(`Saved ${name} · visible layers`); }
export function exportPNG(d, ctx) {
  const { s, w, h } = svgString(d); const img = new Image(); const k = 2;
  img.onload = () => { const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const g = c.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0); c.toBlob((b) => { const name = `${ctx.baseName(d.name)}.png`; ctx.download(name, b); ctx.toast(`Saved ${name} · ${Math.round(w * k)} × ${Math.round(h * k)} px`); }); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

// ───────────────────────── the stage ─────────────────────────
export function mountVector(d, el, ctx, { key, labelOf = () => '', selectable = () => true, onSelect } = {}) {
  const D = d.data;
  d.meas = d.meas || []; d.view = { s: 1, tx: 0, ty: 0, fit: true, yaw: 0, pitch: 0 }; d.opt = d.opt || loadOpts(key);
  el.classList.add('dxf');
  el.innerHTML = `<svg class="dxf-svg" role="img" aria-label="${ctx.esc(d.name)}: drawing" tabindex="0">
    <defs><pattern id="grid-v" width="1" height="1" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".03" class="dxf-griddot"/></pattern></defs>
    <g class="dxf-world"><g class="vx-map"></g><g class="vx-ents"></g></g><g class="dxf-ov"></g></svg>
    <div class="dxf-result" hidden></div><div class="dxf-tip" hidden></div>
    <div class="vx-mapop" hidden><label class="fw-slider"><span class="fw-slider__label">Map opacity</span><output class="fw-slider__value"></output><input type="range" min="0" max="100" step="5" aria-label="Map opacity"></label></div>`;
  const svg = el.querySelector('svg'), world = svg.querySelector('.dxf-world'), mapG = svg.querySelector('.vx-map'), entsG = svg.querySelector('.vx-ents'), ov = svg.querySelector('.dxf-ov');
  const resultEl = el.querySelector('.dxf-result'), tipEl = el.querySelector('.dxf-tip'), mapOp = el.querySelector('.vx-mapop'), mapIn = mapOp.querySelector('input');
  const mk = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.append(n); return n; };
  const b = D.bbox;
  mk('rect', { x: b.x0 - b.w, y: b.y0 - b.h, width: b.w * 3, height: b.h * 3, fill: 'url(#grid-v)', class: 'dxf-grid' }, entsG);
  const groups = new Map();
  for (const L of D.layers.values()) groups.set(L.name, mk('g', { class: `dxf-layer ${L.cls || `dxf-c${aci(L.color)}`} ${L.heavy ? 'is-heavy' : ''}`, 'data-layer': L.name }, entsG));
  const nodes = []; const pointNodes = [];
  for (const e of D.ents) {
    const g = groups.get(e.layer); let n;
    if (e.kind === 'line') n = mk('line', { x1: e.pts[0][0], y1: e.pts[0][1], x2: e.pts[1][0], y2: e.pts[1][1] }, g);
    else if (e.kind === 'polyline') n = mk(e.closed ? 'polygon' : 'polyline', { points: e.pts.map((p) => p.join(',')).join(' '), class: e.closed ? 'vx-closed' : '' }, g);
    else if (e.kind === 'circle') n = mk('circle', { cx: e.x, cy: e.y, r: e.r }, g);
    else if (e.kind === 'point') { n = mk('circle', { cx: e.x, cy: e.y, r: 1, class: 'vx-point' }, g); pointNodes.push(n); }
    else if (e.kind === 'arc') { const r = (a) => (a * Math.PI) / 180; const s = [e.x + e.r * Math.cos(r(e.a0)), e.y + e.r * Math.sin(r(e.a0))], t = [e.x + e.r * Math.cos(r(e.a1)), e.y + e.r * Math.sin(r(e.a1))]; const sweep = ((e.a1 - e.a0) % 360 + 360) % 360; n = mk('path', { d: `M${s[0]} ${s[1]} A${e.r} ${e.r} 0 ${sweep > 180 ? 1 : 0} 1 ${t[0]} ${t[1]}` }, g); }
    else if (e.kind === 'text') {
      n = mk('text', { transform: `translate(${e.x} ${e.y}) scale(1 -1) rotate(${-e.rot})`, 'font-size': e.h, 'text-anchor': e.ha, class: 'dxf-text' }, g);
      if (e.mtext) { const total = e.lines.reduce((s, l) => s + l.f * e.h * 1.35, 0); let y = e.vrow === 0 ? e.h : e.vrow === 1 ? -total / 2 + e.h : -total + e.h; e.lines.forEach((l, i) => { const ts = mk('tspan', { x: 0, y: y.toFixed(3), 'font-size': (e.h * l.f).toFixed(3) }, n); ts.textContent = l.t; y += e.h * 1.35 * (e.lines[i + 1]?.f ?? 1); }); }
      else { n.textContent = e.text; n.setAttribute('dominant-baseline', e.va || 'alphabetic'); }
    } else if (e.kind === 'dim') n = drawDim(e, D, g, mk);
    n.dataset.id = e.id; nodes[e.id] = n;
  }
  const V = d.view;
  const trig = () => ({ cy: Math.cos(V.yaw), sy: Math.sin(V.yaw), cp: Math.cos(V.pitch) });
  const W2S = (p) => { const { cy, sy, cp } = trig(); return [(p[0] * cy - p[1] * sy) * V.s + V.tx, -cp * (p[0] * sy + p[1] * cy) * V.s + V.ty]; };
  const S2W = (x, y) => { const { cy, sy, cp } = trig(); const u = (x - V.tx) / V.s, v = -(y - V.ty) / (V.s * (cp || 1e-6)); return [u * cy + v * sy, -u * sy + v * cy]; };
  const apply = () => {
    const { cy, sy, cp } = trig(); const s = V.s;
    world.setAttribute('transform', `matrix(${s * cy} ${-s * cp * sy} ${-s * sy} ${-s * cp * cy} ${V.tx} ${V.ty})`);
    const pr = 3.5 / s; for (const n of pointNodes) n.setAttribute('r', pr);
    drawOverlay();
  };
  const size = () => { const r = svg.getBoundingClientRect(); return [r.width || 800, r.height || 600]; };
  function fit() {
    const vis = D.ents.filter((e) => D.layers.get(e.layer).on); const bb = bboxOf(vis.length ? vis : D.ents);
    const [w, h] = size(); const pad = ctx.isMobile() ? 24 : 56;
    const corners = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]];
    V.s = 1; V.tx = 0; V.ty = 0; const sc = corners.map(W2S); const xs = sc.map((p) => p[0]), ys = sc.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs) || 1, bh = Math.max(...ys) - Math.min(...ys) || 1;
    const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    V.s = s; const c = W2S([(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]); V.tx = w / 2 - c[0]; V.ty = h / 2 - c[1]; V.fit = true;
    apply();
  }
  function zoomAt(f, sx, sy) {
    const [w, h] = size(); sx ??= w / 2; sy ??= h / 2;
    const wpt = S2W(sx, sy); V.s = Math.max(0.02, Math.min(6000, V.s * f)); const q = W2S(wpt); V.tx += sx - q[0]; V.ty += sy - q[1]; V.fit = false; apply();
  }
  const pct = () => ((V.s / D.units.toM) / PX_PER_M_AT_100) * 100;

  // snapping
  const snapPts = [];
  for (const e of D.ents) { if (e.kind === 'line' || e.kind === 'polyline') e.pts.forEach((p) => snapPts.push({ p, e, kind: 'Corner' })); if (e.kind === 'circle') snapPts.push({ p: [e.x, e.y], e, kind: 'Centre' }); if (e.kind === 'point') snapPts.push({ p: [e.x, e.y], e, kind: 'Point' }); }
  const visible = (e) => D.layers.get(e.layer).on && !(d.opt.view === '3d' && d.opt.ignore2d && !e.z);
  function snap(sx, sy) {
    const w = S2W(sx, sy); if (!d.opt.snap) return { p: w, kind: null };
    let best = null, bd = 12;
    for (const s of snapPts) { if (!visible(s.e)) continue; const q = W2S(s.p); const dd = Math.hypot(q[0] - sx, q[1] - sy); if (dd < bd) { bd = dd; best = { p: s.p, kind: s.kind, layer: s.e.layer }; } }
    if (best) return best;
    let bl = null, bld = 7 / V.s;
    for (const e of D.ents) { if (!visible(e) || (e.kind !== 'line' && e.kind !== 'polyline')) continue; for (const [a, b2] of segsOf(e)) { const r = segDist(w, a, b2); if (r.d < bld) { bld = r.d; bl = { p: r.q, kind: 'On line', layer: e.layer }; } } }
    return bl || { p: w, kind: null };
  }
  function inPoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b2 = pts[j]; if ((a[1] > p[1]) !== (b2[1] > p[1]) && p[0] < ((b2[0] - a[0]) * (p[1] - a[1])) / (b2[1] - a[1]) + a[0]) c = !c; } return c; }
  function hit(sx, sy) {
    const w = S2W(sx, sy); let best = null, bd = 8 / V.s, inside = null;
    for (const e of D.ents) {
      if (!visible(e) || !selectable(e)) continue; let dd = Infinity;
      if (e.kind === 'circle') dd = Math.abs(len(sub(w, [e.x, e.y])) - e.r);
      else if (e.kind === 'point') dd = len(sub(w, [e.x, e.y])) - 4 / V.s;
      else if (e.kind === 'arc') dd = Math.abs(len(sub(w, [e.x, e.y])) - e.r) + (len(sub(w, [e.x, e.y])) > e.r * 1.4 ? 9 : 0);
      else if (e.kind === 'text') { const bb = nodes[e.id].getBBox(); const lw = [w[0] - e.x, -(w[1] - e.y)]; dd = lw[0] >= bb.x - 0.1 && lw[0] <= bb.x + bb.width + 0.1 && lw[1] >= bb.y - 0.1 && lw[1] <= bb.y + bb.height + 0.1 ? 0 : Infinity; }
      else { for (const [a, b2] of segsOf(e)) dd = Math.min(dd, segDist(w, a, b2).d); if (e.closed && d.opt.fill && e.fillable && inPoly(w, e.pts)) inside = inside && Math.abs(area(inside.pts)) < Math.abs(area(e.pts)) ? inside : e; }
      if (dd < bd) { bd = dd; best = e; }
    }
    return best || inside;
  }
  // overlay (screen space)
  let live = null, snapNow = null, hover = null, popLayer = null;
  function pill(x, y, text, cls = '') { const w = text.length * 7.4 + 18; const g = mk('g', { class: 'dxf-pill ' + cls, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, ov); mk('rect', { x: -w / 2, y: -12, width: w, height: 24, rx: 12 }, g); const t = mk('text', { x: 0, y: 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g); t.textContent = text; }
  function measLine(m, cls) {
    const a = W2S(m.a), b2 = W2S(m.b);
    mk('line', { x1: a[0], y1: a[1], x2: b2[0], y2: b2[1], class: 'dxf-mline ' + cls }, ov);
    for (const p of [a, b2]) mk('circle', { cx: p[0], cy: p[1], r: 4, class: 'dxf-mend ' + cls }, ov);
    const mx = (a[0] + b2[0]) / 2, my = (a[1] + b2[1]) / 2; const dx = b2[0] - a[0], dy = b2[1] - a[1]; const Lh = Math.hypot(dx, dy) || 1;
    pill(mx + (-dy / Lh) * 18 * (dx >= 0 ? 1 : -1), my + (dx / Lh) * 18 * (dx >= 0 ? 1 : -1), fmtLen(m.dist, D.units), cls);
  }
  function drawOverlay() {
    ov.replaceChildren();
    d.meas.forEach((m, i) => measLine(m, i === d.meas.length - 1 ? 'is-last' : 'is-old'));
    if (live?.a && live.b) measLine({ a: live.a, b: live.b, dist: len(sub(live.b, live.a)) }, 'is-live');
    else if (live?.a) { const a = W2S(live.a); mk('circle', { cx: a[0], cy: a[1], r: 4, class: 'dxf-mend is-live' }, ov); }
    if (snapNow?.kind && d.mode === 'measure') { const q = W2S(snapNow.p); mk('rect', { x: q[0] - 6, y: q[1] - 6, width: 12, height: 12, class: 'dxf-snap' }, ov); }
    nodes.forEach((n) => n?.classList.remove('is-sel', 'is-hover'));
    if (d.sel != null) nodes[d.sel]?.classList.add('is-sel');
    if (hover != null && hover !== d.sel) nodes[hover]?.classList.add('is-hover');
    const last = d.meas.at(-1);
    resultEl.hidden = !last || !ctx.isMobile();
    if (last) resultEl.innerHTML = `<span class="dxf-result__label">Distance ${d.meas.length > 1 ? d.meas.length : ''}</span><strong>${fmtLen(last.dist, D.units)}</strong><button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Copy distance" data-tip="Copy">${ctx.icon('copy')}</button>`;
  }
  resultEl.addEventListener('click', (e) => { if (e.target.closest('button')) ctx.copyText(fmtLen(d.meas.at(-1).dist, D.units), e.target.closest('button')); });

  // pointer: pan / orbit, pinch, measure, select
  const pts = new Map(); let drag = null, pinch = null, space = false, moved = 0;
  const local = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = 0;
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; drag = null; return; }
    const pan = d.mode === 'view' || space || e.button === 1 || e.button === 2 || (e.pointerType === 'touch' && d.mode === 'view');
    const orbit = d.opt.view === '3d' && pan && !e.shiftKey && e.button === 0 && !space;
    drag = { pan, orbit, x: e.clientX, y: e.clientY, tx: V.tx, ty: V.ty, yaw: V.yaw, pitch: V.pitch };
    if (pan) el.classList.add('is-panning');
  });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    if (pinch && pts.size === 2) { const [a, b2] = [...pts.values()]; const nd = Math.hypot(a[0] - b2[0], a[1] - b2[1]); const c = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2]; V.tx += c[0] - pinch.c[0]; V.ty += c[1] - pinch.c[1]; zoomAt(nd / pinch.d, c[0], c[1]); pinch = { d: nd, c }; ctx.refresh('zoom status'); return; }
    if (drag) {
      moved = Math.max(moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
      if (drag.orbit && moved > 2) { const [w, h] = size(); const c = S2W(w / 2, h / 2); V.yaw = drag.yaw + (e.clientX - drag.x) * 0.006; V.pitch = Math.max(0, Math.min(1.25, drag.pitch + (e.clientY - drag.y) * 0.005)); const q = W2S(c); V.tx += w / 2 - q[0]; V.ty += h / 2 - q[1]; V.fit = false; apply(); }
      else if (drag.pan || (moved > 6 && e.pointerType === 'touch')) { V.tx = drag.tx + e.clientX - drag.x; V.ty = drag.ty + e.clientY - drag.y; V.fit = false; drag.pan = true; el.classList.add('is-panning'); apply(); }
    }
    const s = d.mode === 'measure' ? snap(p[0], p[1]) : { p: S2W(p[0], p[1]) };
    d.cursor = s.p; snapNow = s;
    if (d.mode === 'measure' && live?.a) live.b = s.p;
    if (d.mode === 'select' && !drag) { const h0 = hit(p[0], p[1]); hover = h0 ? h0.id : null; svg.style.cursor = h0 ? 'pointer' : ''; }
    tipEl.hidden = !(d.mode === 'measure' && s.kind); if (!tipEl.hidden) { tipEl.textContent = s.kind + (s.layer ? ` · ${s.layer}` : ''); tipEl.style.transform = `translate(${p[0] + 14}px, ${p[1] + 14}px)`; }
    drawOverlay(); statusCoords();
  });
  const end = (e) => {
    const p = local(e); pts.delete(e.pointerId); el.classList.remove('is-panning');
    if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
    const wasDrag = drag && (drag.pan || drag.orbit) && moved > 3; drag = null;
    if (wasDrag) { ctx.refresh('zoom status'); return; }
    if (e.type === 'pointercancel') return;
    if (d.mode === 'measure') {
      const s = snap(p[0], p[1]);
      if (!live?.a) { live = { a: s.p, b: null }; popLayer = ctx.pushLayer(() => { live = null; popLayer = null; drawOverlay(); }); }
      else { const m = { a: live.a, b: s.p, dist: len(sub(s.p, live.a)) }; live = null; popLayer?.(); popLayer = null; if (m.dist > 0) { d.meas.push(m); ctx.showInsp(); ctx.refresh('insp'); } }
      drawOverlay();
    } else if (d.mode === 'select') {
      const h0 = hit(p[0], p[1]); d.sel = h0 ? h0.id : null; drawOverlay(); onSelect?.(h0);
      if (h0) ctx.showInsp(); ctx.refresh('insp');
      if (h0 && ctx.isMobile()) ctx.infoSheet(d, null);
    }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { d.cursor = null; snapNow = null; hover = null; tipEl.hidden = true; drawOverlay(); statusCoords(); });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p[0], p[1]); ctx.refresh('zoom status'); }, { passive: false });
  const kd = (e) => { if (e.key === ' ' && !e.repeat && !e.target.closest('input,textarea,button,select,[contenteditable]')) { space = true; el.classList.add('is-hand'); } };
  const ku = (e) => { if (e.key === ' ') { space = false; el.classList.remove('is-hand'); } };
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  function statusCoords() { const c = document.querySelector('.ov-coords'); if (c) c.textContent = d.cursor ? `E ${fmtCoord(d.cursor[0] + D.origin.x)} · N ${fmtCoord(d.cursor[1] + D.origin.y)}` : 'E — · N —'; }

  function applyOpts() {
    const o = d.opt;
    el.dataset.bg = o.map ? 'map' : o.bg; el.dataset.map = o.map || ''; el.classList.toggle('vx-fill', !!o.fill);
    drawBasemap(mapG, o.map, D, mk); mapG.style.opacity = o.map ? o.mapOpacity : 0;
    mapOp.hidden = !o.map; mapIn.value = Math.round(o.mapOpacity * 100); mapOp.querySelector('output').textContent = `${mapIn.value} %`;
    const want3d = o.view === '3d';
    if (want3d && V.pitch === 0) { V.pitch = 0.9; V.yaw = -0.5; fit(); } else if (!want3d && (V.pitch || V.yaw)) { V.pitch = 0; V.yaw = 0; fit(); }
    for (const e of D.ents) if (nodes[e.id]) nodes[e.id].style.display = o.view === '3d' && o.ignore2d && !e.z ? 'none' : '';
    el.dataset.view = o.view;
  }
  mapIn.addEventListener('input', () => { d.opt.mapOpacity = mapIn.value / 100; mapG.style.opacity = d.opt.mapOpacity; mapOp.querySelector('output').textContent = `${mapIn.value} %`; saveOpts(key, d.opt); });
  const ro = new ResizeObserver(() => { if (V.fit) fit(); else apply(); });
  ro.observe(svg);
  applyOpts();
  requestAnimationFrame(fit);
  el.dataset.mode = d.mode;
  return {
    fit: () => fit(), zoom: pct, isFit: () => V.fit, zoomLabel: () => `1:${scaleDen(d).toLocaleString('en-US')}`,
    setZoom: (p) => zoomAt(p / pct()), zoomBy: (f) => zoomAt(f),
    setMode: (m) => { el.dataset.mode = m; live = null; popLayer?.(); popLayer = null; hover = null; drawOverlay(); },
    applyLayers: () => { for (const [n, g] of groups) g.style.display = D.layers.get(n).on ? '' : 'none'; if (d.sel != null && !D.layers.get(D.ents[d.sel].layer).on) d.sel = null; drawOverlay(); },
    applyOpts, redraw: drawOverlay, onShow: () => (V.fit ? fit() : apply()), onResize: () => (V.fit ? fit() : apply()),
    zoomTo: (e) => { const bb = bboxOf([e]); const [w, h] = size(); const s = Math.min((w - 160) / (bb.w || 10), (h - 160) / (bb.h || 10), V.s * 4); V.s = Math.max(s, 0.02); const c = W2S([(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]); V.tx += w / 2 - c[0]; V.ty += h / 2 - c[1]; V.fit = false; apply(); ctx.refresh('zoom status'); },
    select: (id) => { d.sel = id; drawOverlay(); },
    screenOf: (x, y) => { const r = svg.getBoundingClientRect(); const q = W2S([x - D.origin.x, y - D.origin.y]); return { x: r.left + q[0], y: r.top + q[1] }; },
    svg: () => svg,
    key: (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { if (d.meas.length && d.mode === 'measure') { clearMeas(d, ctx); return true; } } return false; },
    destroy: () => { ro.disconnect(); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); popLayer?.(); },
  };
}
function drawDim(e, D, g, mk) {
  const [a, b, at] = e.dim; const u = sub(b, a); const L = len(u) || 1; const ux = [u[0] / L, u[1] / L]; const n = [-ux[1], ux[0]];
  const off = (at[0] - a[0]) * n[0] + (at[1] - a[1]) * n[1]; const sg = Math.sign(off) || 1;
  const A = [a[0] + n[0] * off, a[1] + n[1] * off], B = [b[0] + n[0] * off, b[1] + n[1] * off];
  const grp = mk('g', { class: 'dxf-dim' }, g);
  const ln = (p, q) => mk('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1] }, grp);
  ln([a[0] + n[0] * 0.12 * sg, a[1] + n[1] * 0.12 * sg], [A[0] + n[0] * 0.18 * sg, A[1] + n[1] * 0.18 * sg]);
  ln([b[0] + n[0] * 0.12 * sg, b[1] + n[1] * 0.12 * sg], [B[0] + n[0] * 0.18 * sg, B[1] + n[1] * 0.18 * sg]);
  ln(A, B);
  for (const p of [A, B]) ln([p[0] - (ux[0] + n[0]) * 0.12, p[1] - (ux[1] + n[1]) * 0.12], [p[0] + (ux[0] + n[0]) * 0.12, p[1] + (ux[1] + n[1]) * 0.12]);
  let rot = (Math.atan2(ux[1], ux[0]) * 180) / Math.PI; if (rot > 90 || rot <= -90) rot += 180;
  const mid = [(A[0] + B[0]) / 2 + n[0] * 0.14 * sg, (A[1] + B[1]) / 2 + n[1] * 0.14 * sg];
  const t = mk('text', { transform: `translate(${mid[0]} ${mid[1]}) scale(1 -1) rotate(${-rot})`, 'font-size': 0.24, 'text-anchor': 'middle', class: 'dxf-text', 'dominant-baseline': sg > 0 ? 'auto' : 'hanging' }, grp);
  t.textContent = e.label && e.label !== '<>' ? e.label : e.value.toFixed(2).replace('.', D.dimsep || '.');
  return grp;
}
