// Open · DXF drawings. Real parser (LINE, LWPOLYLINE, CIRCLE, ARC, TEXT, MTEXT, DIMENSION), SVG renderer with local
// origin (UTM coordinates stay precise), layers, pick, unit-aware measure with snapping, CRS + units from the file.
import { formatBytes } from '../../kit/shell.js';

const UNITS = { 0: null, 1: ['inches', 'in', 0.0254], 2: ['feet', 'ft', 0.3048], 4: ['millimetres', 'mm', 0.001], 5: ['centimetres', 'cm', 0.01], 6: ['metres', 'm', 1] };
const CRS = { 'EPSG:25832': 'ETRS89 / UTM zone 32N', 'EPSG:25833': 'ETRS89 / UTM zone 33N', 'EPSG:31467': 'DHDN / Gauss-Krüger zone 3' };
const PX_PER_M_AT_100 = 37.795; // 100 % = paper scale 1:100 on a 96 dpi screen

// ───────────────────────── parser ─────────────────────────
export function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const c = parseInt(lines[i], 10); if (Number.isNaN(c)) throw Object.assign(new Error(`Line ${i + 1}: expected a group code, found “${lines[i].slice(0, 20)}”`), { line: i + 1 }); pairs.push([c, lines[i + 1].trim()]); }
  if (!pairs.some(([c, v]) => c === 0 && v === 'SECTION')) throw new Error('No SECTION found: this is not a DXF drawing');
  const out = { version: '', unitsCode: 0, dimsep: '.', crs: null, layers: new Map(), ents: [], unsupported: {}, ext: null };
  const crsM = /EPSG[:\s]?(\d{4,5})/i;
  let sec = null, i = 0;
  const readEnt = () => { const type = pairs[i][1]; const g = []; i++; while (i < pairs.length && pairs[i][0] !== 0) { g.push(pairs[i]); i++; } return { type, g }; };
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 999) { const m = crsM.exec(v); if (m) out.crs = 'EPSG:' + m[1]; i++; continue; }
    if (c === 0 && v === 'SECTION') { sec = pairs[i + 1]?.[1]; i += 2; continue; }
    if (c === 0 && v === 'ENDSEC') { sec = null; i++; continue; }
    if (c === 0 && v === 'EOF') break;
    if (sec === 'HEADER' && c === 9) {
      const name = v; i++; const vals = [];
      while (i < pairs.length && pairs[i][0] !== 9 && pairs[i][0] !== 0) { vals.push(pairs[i]); i++; }
      const get = (code) => vals.find((p) => p[0] === code)?.[1];
      if (name === '$ACADVER') out.version = get(1);
      if (name === '$INSUNITS') out.unitsCode = +get(70);
      if (name === '$DIMDSEP') out.dimsep = String.fromCharCode(+get(70) || 46);
      if (name === '$EXTMIN') out.ext = { ...(out.ext || {}), x0: +get(10), y0: +get(20) };
      if (name === '$EXTMAX') out.ext = { ...(out.ext || {}), x1: +get(10), y1: +get(20) };
      continue;
    }
    if (sec === 'TABLES' && c === 0 && v === 'LAYER') {
      const e = readEnt(); const name = e.g.find((p) => p[0] === 2)?.[1]; const col = +(e.g.find((p) => p[0] === 62)?.[1] ?? 7);
      if (name != null) out.layers.set(name, { name, color: Math.abs(col) || 7, on: col >= 0, count: 0, kinds: {} });
      continue;
    }
    if (sec === 'ENTITIES' && c === 0) { const e = readEnt(); addEntity(out, e); continue; }
    i++;
  }
  if (!out.ents.length && !Object.keys(out.unsupported).length) throw new Error('The ENTITIES section is empty or missing');
  // local origin keeps big UTM numbers precise in the renderer
  const xs = [], ys = [];
  for (const e of out.ents) for (const p of e.pts || [[e.x, e.y]]) { xs.push(p[0]); ys.push(p[1]); }
  const ox = Math.floor(Math.min(...xs)), oy = Math.floor(Math.min(...ys));
  out.origin = { x: ox, y: oy };
  for (const e of out.ents) {
    if (e.pts) e.pts = e.pts.map(([x, y]) => [x - ox, y - oy]);
    if (e.x != null) { e.x -= ox; e.y -= oy; }
    if (e.dim) e.dim = e.dim.map(([x, y]) => [x - ox, y - oy]);
  }
  out.units = UNITS[out.unitsCode] ? { name: UNITS[out.unitsCode][0], abbr: UNITS[out.unitsCode][1], toM: UNITS[out.unitsCode][2], fromFile: true } : { name: 'metres', abbr: 'm', toM: 1, fromFile: false };
  out.crsName = out.crs ? CRS[out.crs] || 'Projected coordinates' : null;
  for (const e of out.ents) { const L = out.layers.get(e.layer) || out.layers.set(e.layer, { name: e.layer, color: 7, on: true, count: 0, kinds: {} }).get(e.layer); L.count++; L.kinds[e.kind] = (L.kinds[e.kind] || 0) + 1; }
  out.bbox = bboxOf(out.ents);
  return out;
}
function addEntity(out, { type, g }) {
  const num = (c, d = 0) => { const p = g.find((x) => x[0] === c); return p ? +p[1] : d; };
  const str = (c) => g.filter((x) => x[0] === c).map((x) => x[1]).join('');
  const layer = str(8) || '0';
  const base = { type, layer, id: out.ents.length };
  if (type === 'LINE') out.ents.push({ ...base, kind: 'line', pts: [[num(10), num(20)], [num(11), num(21)]] });
  else if (type === 'LWPOLYLINE') {
    const pts = []; let cur = null;
    for (const [c, v] of g) { if (c === 10) { cur = [+v, 0]; pts.push(cur); } else if (c === 20 && cur) cur[1] = +v; }
    out.ents.push({ ...base, kind: 'polyline', pts, closed: (num(70) & 1) === 1 });
  } else if (type === 'CIRCLE') out.ents.push({ ...base, kind: 'circle', x: num(10), y: num(20), r: num(40) });
  else if (type === 'ARC') out.ents.push({ ...base, kind: 'arc', x: num(10), y: num(20), r: num(40), a0: num(50), a1: num(51) });
  else if (type === 'TEXT') {
    const h72 = num(72), v73 = num(73); const aligned = h72 || v73;
    out.ents.push({ ...base, kind: 'text', x: aligned ? num(11) : num(10), y: aligned ? num(21) : num(20), h: num(40, 1), text: str(1), rot: num(50), ha: ['start', 'middle', 'end'][h72] || 'start', va: v73 === 2 ? 'central' : v73 === 3 ? 'hanging' : 'alphabetic' });
  } else if (type === 'MTEXT') {
    const raw = str(3) + str(1); const att = num(71, 1);
    const lines = raw.split('\\P').map((l) => { const f = /\\H([\d.]+)x;/.exec(l); return { t: l.replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, ''), f: f ? +f[1] : 1 }; });
    out.ents.push({ ...base, kind: 'text', mtext: true, x: num(10), y: num(20), h: num(40, 1), lines, text: lines.map((l) => l.t).join(' · '), rot: num(50), ha: ['start', 'middle', 'end'][(att - 1) % 3], vrow: Math.floor((att - 1) / 3) });
  } else if (type === 'DIMENSION') {
    const a = [num(13), num(23)], b = [num(14), num(24)], at = [num(10), num(20)];
    out.ents.push({ ...base, kind: 'dim', pts: [a, b], dim: [a, b, at], value: num(42), label: str(1) });
  } else { out.unsupported[type] = (out.unsupported[type] || 0) + 1; }
}
function bboxOf(ents) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const e of ents) {
    if (e.kind === 'circle' || e.kind === 'arc') { add(e.x - e.r, e.y - e.r); add(e.x + e.r, e.y + e.r); }
    else if (e.kind === 'text') { const w = e.h * 0.55 * (e.mtext ? Math.max(...e.lines.map((l) => l.t.length)) : e.text.length); add(e.x - w / 2, e.y - e.h); add(e.x + w / 2, e.y + e.h); }
    else if (e.kind === 'dim') for (const p of e.dim) add(p[0], p[1]);
    else for (const p of e.pts) add(p[0], p[1]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// ───────────────────────── geometry helpers ─────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]);
function segDist(p, a, b) { const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1))); const q = [a[0] + ab[0] * t, a[1] + ab[1] * t]; return { d: len(sub(p, q)), q }; }
function segsOf(e) { if (e.kind === 'line' || e.kind === 'dim') return [[e.pts[0], e.pts[1]]]; if (e.kind === 'polyline') { const s = []; for (let i = 0; i < e.pts.length - 1; i++) s.push([e.pts[i], e.pts[i + 1]]); if (e.closed) s.push([e.pts.at(-1), e.pts[0]]); return s; } return []; }
function entLength(e) { if (e.kind === 'circle') return 2 * Math.PI * e.r; if (e.kind === 'arc') return (((e.a1 - e.a0) % 360 + 360) % 360 || 360) / 360 * 2 * Math.PI * e.r; return segsOf(e).reduce((s, [a, b]) => s + len(sub(b, a)), 0); }
const bearing = (a, b) => { const g = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI; return (g + 360) % 360; };

// ───────────────────────── format plugin ─────────────────────────
export default {
  id: 'dxf', label: 'Drawing', asLabel: 'Drawing (DXF)', icon: 'box', exts: ['dxf'],
  listLabel: 'Layers', listIcon: 'layers', selIcon: 'mouse-pointer-2', selHint: 'Press V, then click a wall, label or manhole.',
  measureHint: 'Press M, then click two points. It snaps to corners and line ends.',
  modes: [{ id: 'view', label: 'Pan', icon: 'hand', key: 'h' }, { id: 'select', label: 'Select', icon: 'mouse-pointer-2', key: 'v' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm' }],
  steps(d) {
    return [
      { label: 'Loading drawing engine (bundled · 38 KB)', cached: 'Drawing engine ready', engine: 'dxf', ms: 420 },
      { label: `Reading ${formatBytes(d.size)}`, ms: 220, run: async () => { d.text = await d.file.text(); } },
      { label: 'Parsing layers and objects', ms: 360, run: async () => { d.data = parseDXF(d.text); d.text = null; } },
      { label: 'Drawing text labels and dimensions', ms: 280 },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  list(d, ctx) { return layerList(d, ctx); },
  updateList(d) { syncLayerList(d); },
  inspector(d, ctx) {
    const D = d.data, u = D.units, nf = ctx.nf;
    const nText = D.ents.filter((e) => e.kind === 'text').length, nDim = D.ents.filter((e) => e.kind === 'dim').length;
    const skipped = Object.entries(D.unsupported);
    const vis = [...D.layers.values()].filter((l) => l.on).length;
    const info = ctx.kv([
      ['Type', `DXF drawing · ${({ AC1015: 'AutoCAD 2000', AC1018: 'AutoCAD 2004', AC1021: 'AutoCAD 2007', AC1024: 'AutoCAD 2010', AC1027: 'AutoCAD 2013', AC1032: 'AutoCAD 2018' })[D.version] || D.version || 'R12'}`],
      ['Objects', `${nf(D.ents.length)} drawing objects`],
      ['Layers', `${D.layers.size} · ${vis} visible`],
      ['Labels', `${nText} text labels · ${nDim} dimensions`],
      skipped.length ? ['Not shown', `<span class="ov-warnline">${ctx.icon('triangle-alert', { size: 14 })}${skipped.map(([k, n]) => `${n} ${KIND_NAME[k] || k.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ')}</span><span class="ov-subline">Not supported yet; everything else is drawn.</span>`] : null,
      ['Units', `${cap(u.name)}${u.fromFile ? ' <span class="ov-src">from file</span>' : ' <span class="ov-src">assumed</span>'}`],
      ['Coordinates', D.crs ? `${D.crs} <span class="ov-src">from file</span><span class="ov-subline">${D.crsName}</span>` : 'Local (no CRS in the file)'],
      ['Extent', `${nf(D.bbox.w * u.toM, 1)} × ${nf(D.bbox.h * u.toM, 1)} m`],
    ]);
    let selection = null;
    const e = d.sel != null ? D.ents[d.sel] : null;
    if (e) {
      const W = (p) => `E ${fmtCoord(p[0] + D.origin.x)}<br>N ${fmtCoord(p[1] + D.origin.y)}`;
      const rows = [['Layer', `<span class="ov-swatch dxf-c${aci(D.layers.get(e.layer)?.color)}"></span>${ctx.esc(e.layer)}`]];
      if (e.kind === 'line' || e.kind === 'dim') rows.push(['Length', `<strong>${fmtLen(len(sub(e.pts[1], e.pts[0])), u)}</strong>`], ['Direction', `${nf(bearing(e.pts[0], e.pts[1]), 1)}° from north`], ['Start', W(e.pts[0]), 'ov-mono'], ['End', W(e.pts[1]), 'ov-mono']);
      else if (e.kind === 'polyline') rows.push(['Vertices', `${e.pts.length}${e.closed ? ' · closed' : ''}`], ['Length', `<strong>${fmtLen(entLength(e), u)}</strong>`], ...(e.closed ? [['Area', `${nf(Math.abs(area(e.pts)) * u.toM ** 2, 2)} m²`]] : []));
      else if (e.kind === 'circle') rows.push(['Diameter', `<strong>${fmtLen(2 * e.r, u)}</strong>`], ['Centre', W([e.x, e.y]), 'ov-mono']);
      else if (e.kind === 'arc') rows.push(['Radius', fmtLen(e.r, u)], ['Arc length', fmtLen(entLength(e), u)]);
      else if (e.kind === 'text') rows.push(['Text', `<strong>${ctx.esc(e.text)}</strong>`], ['Height', fmtLen(e.h, u)], ['Position', W([e.x, e.y]), 'ov-mono']);
      selection = `<div class="ov-seltitle">${ctx.icon(KIND_ICON[e.kind], { size: 16 })}${KIND_LABEL[e.kind]}</div>` + ctx.kv(rows);
    }
    let measure = null;
    if (d.meas?.length) {
      const tot = d.meas.reduce((s, m) => s + m.dist, 0);
      measure = `<ol class="ov-meas">${d.meas.map((m, i) => `<li class="ov-meas__row ${i === d.meas.length - 1 ? 'is-last' : ''}"><span class="ov-meas__n">${i + 1}</span><span class="ov-meas__main"><span class="ov-meas__val">${fmtLen(m.dist, u)}</span><span class="ov-meas__sub">ΔE ${nf((m.b[0] - m.a[0]) * u.toM, 2)} · ΔN ${nf((m.b[1] - m.a[1]) * u.toM, 2)} · ${nf(bearing(m.a, m.b), 1)}° from north</span></span></li>`).join('')}</ol>
        ${d.meas.length > 1 ? `<div class="ov-meas__total"><span>Total</span><strong>${fmtLen(tot, u)}</strong></div>` : ''}
        <div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="meas-copy">${ctx.icon('copy')}Copy</button><button class="fw-btn fw-btn--sm" type="button" id="meas-csv">${ctx.icon('download')}CSV</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="meas-clear">Clear</button></div>
        <p class="ov-hint">Units: ${u.name}${u.fromFile ? ' (from file)' : ''}. Snaps to corners and line ends.</p>`;
    }
    return { info, selection, measure };
  },
  bindInspector(d, root, ctx) {
    root.querySelector('#meas-copy')?.addEventListener('click', (e) => ctx.copyText(d.meas.map((m) => fmtLen(m.dist, d.data.units)).join('\n'), e.currentTarget));
    root.querySelector('#meas-csv')?.addEventListener('click', () => exportMeasurements(d, ctx));
    root.querySelector('#meas-clear')?.addEventListener('click', () => { const old = d.meas; d.meas = []; d.ctl.redraw(); ctx.refresh('insp'); ctx.toast('Measurements cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { d.meas = old; d.ctl.redraw(); ctx.refresh('insp'); } } }); });
  },
  status(d, ctx) {
    const D = d.data; const c = d.cursor;
    return [`<span class="ov-coords">${c ? `E ${fmtCoord(c[0] + D.origin.x)} · N ${fmtCoord(c[1] + D.origin.y)}` : 'E — · N —'}</span>`,
      D.crs ? `${D.crs} <span class="ov-src">(from file)</span>` : 'Local coordinates', cap(D.units.name), `≈ 1:${scaleDen(d)}`];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const m = d.meas?.length || 0;
    return [
      { group: 'Image', items: [
        { label: 'PNG of this view', sub: '2× · as shown', icon: 'image', file: `${b}.png`, onSelect: () => exportPNG(d, ctx) },
        { label: 'SVG drawing', sub: 'Vector, visible layers', icon: 'pen-tool', file: `${b}.svg`, onSelect: () => exportSVG(d, ctx) }] },
      { group: 'Data', items: [
        { id: 'meas-csv', label: 'Measurements as CSV', sub: m ? `${m} measurement${m > 1 ? 's' : ''} · metres` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !m, onSelect: () => exportMeasurements(d, ctx) },
        { label: 'Layers as CSV', sub: `${d.data.layers.size} layers with counts`, icon: 'layers', file: `${b}-layers.csv`, onSelect: () => exportLayers(d, ctx) },
        { label: 'Text labels as CSV', sub: 'Text with E/N coordinates', icon: 'type', file: `${b}-labels.csv`, onSelect: () => exportLabels(d, ctx) }] },
    ];
  },
  commands(d, t, ctx) {
    const out = []; const L = [...d.data.layers.values()].filter((l) => l.count);
    let m;
    if ((m = t.match(/^(?:hide|layers? off|turn off|off)\s*(.*)$/)) || (m = t.match(/^(.+?)\s+off$/))) {
      const q = m[1].trim();
      L.filter((l) => l.on && (!q || l.name.toLowerCase().includes(q))).slice(0, 4).forEach((l) => out.push({ label: `Hide layer ${l.name}`, sub: `${l.count} objects · undo with ⌘Z`, icon: 'eye-off', run: () => setLayer(d, ctx, l.name, false, true) }));
    } else if ((m = t.match(/^(?:show|layers? on|turn on|on)\s*(.*)$/))) {
      const q = m[1].trim();
      if (!q || 'all'.startsWith(q)) out.push({ label: 'Show all layers', sub: `${L.length} layers`, icon: 'eye', run: () => { for (const l of L) l.on = true; d.ctl.applyLayers(); ctx.refresh('list insp'); } });
      L.filter((l) => !l.on && (!q || l.name.toLowerCase().includes(q))).slice(0, 3).forEach((l) => out.push({ label: `Show layer ${l.name}`, sub: `${l.count} objects`, icon: 'eye', run: () => setLayer(d, ctx, l.name, true) }));
    } else {
      L.filter((l) => t.length > 2 && l.name.toLowerCase().includes(t)).slice(0, 2).forEach((l) => out.push({ label: `${l.on ? 'Hide' : 'Show'} layer ${l.name}`, sub: `${l.count} objects`, icon: l.on ? 'eye-off' : 'eye', run: () => setLayer(d, ctx, l.name, !l.on, true) }));
    }
    if (/^meas/.test(t)) out.push({ label: 'Measure distance', sub: 'M · click two points', icon: 'ruler', run: () => ctx.setMode(d, 'measure') });
    if (/^(export|csv|meas)/.test(t) && d.meas?.length) out.push({ label: 'Export measurements as CSV', sub: `${ctx.baseName(d.name)}-measurements.csv`, icon: 'download', run: () => exportMeasurements(d, ctx) });
    if (/^(png|image|snap)/.test(t)) out.push({ label: 'Save this view as PNG', sub: `${ctx.baseName(d.name)}.png`, icon: 'image', run: () => exportPNG(d, ctx) });
    return out;
  },
  mobileSlots(d) {
    return [{ id: 'list', label: 'Layers', icon: 'layers' }, { id: 'meas', label: 'Measure', icon: 'ruler', pressed: d.mode === 'measure', run: (doc, ctx) => ctx.setMode(doc, doc.mode === 'measure' ? 'view' : 'measure') }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }];
  },
};
const KIND_LABEL = { line: 'Line', polyline: 'Polyline', circle: 'Circle', arc: 'Arc', text: 'Text label', dim: 'Dimension' };
const KIND_ICON = { line: 'minus', polyline: 'pen-tool', circle: 'circle-help', arc: 'rotate-ccw', text: 'type', dim: 'ruler' };
const KIND_NAME = { HATCH: 'hatch fill', INSERT: 'block reference', SPLINE: 'spline', ELLIPSE: 'ellipse', SOLID: 'solid fill', IMAGE: 'image' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const fmtCoord = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
export const fmtLen = (v, u) => { const m = v * u.toM; return m >= 1 ? `${m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : `${(m * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} cm`; };
const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function aci(c) { return [1, 2, 3, 4, 5, 6, 7, 8, 30].includes(c) ? c : 7; }
function scaleDen(d) { const pxPerM = d.view.s / d.data.units.toM; const n = (100 * PX_PER_M_AT_100) / pxPerM; const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]; return nice.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)); }

// ───────────────────────── layers list ─────────────────────────
function layerList(d, ctx) {
  const el = ctx.h(`<div class="ov-listpanel"><div class="ov-listhead"><span class="ov-listhead__title">Layers</span><span class="ov-listhead__count" id="lay-count-${d.id}"></span>
    <button class="fw-btn fw-btn--ghost fw-btn--sm ov-listhead__btn" type="button" data-all>Show all</button></div>
    <div class="ov-layers" role="list"></div></div>`);
  const box = el.querySelector('.ov-layers');
  for (const L of d.data.layers.values()) {
    if (!L.count) continue;
    const row = ctx.h(`<div class="ov-layer" role="listitem">
      <button class="ov-layer__toggle" type="button" aria-pressed="${L.on}" data-layer="${ctx.esc(L.name)}" title="${ctx.esc(L.name)}">
        <span class="ov-layer__eye">${ctx.icon('eye', { size: 16 })}${ctx.icon('eye-off', { size: 16 })}</span>
        <span class="ov-swatch dxf-c${aci(L.color)}"></span><span class="ov-layer__name">${ctx.esc(L.name)}</span><span class="ov-layer__n">${L.count}</span></button>
      <button class="fw-iconbtn fw-iconbtn--sm ov-layer__only" type="button" aria-label="Show only ${ctx.esc(L.name)}" data-tip="Show only this" data-only="${ctx.esc(L.name)}">${ctx.icon('crosshair')}</button></div>`);
    box.append(row);
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
function syncLayerList(d) {
  const el = d._layerEl; if (!el) return;
  el.querySelectorAll('[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(d.data.layers.get(b.dataset.layer).on)));
  const L = [...d.data.layers.values()].filter((l) => l.count);
  el.querySelector(`#lay-count-${d.id}`).textContent = `${L.filter((l) => l.on).length} of ${L.length}`;
  el.querySelector('[data-all]').hidden = L.every((l) => l.on);
}
function setLayer(d, ctx, name, on, announce = false) {
  const L = d.data.layers.get(name); L.on = on; d.ctl.applyLayers(); syncLayerList(d); ctx.refresh('insp');
  if (announce) ctx.toast(`${on ? 'Showing' : 'Hid'} layer ${name}`, { type: 'neutral', action: { label: 'Undo', onClick: () => setLayer(d, ctx, name, !on) } });
}

// ───────────────────────── view ─────────────────────────
function mountView(d, el, ctx) {
  const D = d.data; const NS = 'http://www.w3.org/2000/svg';
  d.meas = d.meas || []; d.view = { s: 1, tx: 0, ty: 0, fit: true };
  el.classList.add('dxf');
  el.innerHTML = `<svg class="dxf-svg" role="img" aria-label="${ctx.esc(d.name)}: floor plan drawing" tabindex="0">
    <defs><pattern id="grid-${d.id}" width="1" height="1" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".03" class="dxf-griddot"/></pattern></defs>
    <g class="dxf-world"></g><g class="dxf-ov"></g></svg>
    <div class="dxf-result" hidden></div><div class="dxf-tip" hidden></div>`;
  const svg = el.querySelector('svg'), world = svg.querySelector('.dxf-world'), ov = svg.querySelector('.dxf-ov');
  const resultEl = el.querySelector('.dxf-result'), tipEl = el.querySelector('.dxf-tip');
  const mk = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.append(n); return n; };
  const b = D.bbox;
  mk('rect', { x: b.x0 - b.w, y: b.y0 - b.h, width: b.w * 3, height: b.h * 3, fill: `url(#grid-${d.id})`, class: 'dxf-grid' }, world);
  const groups = new Map();
  for (const L of D.layers.values()) { const g = mk('g', { class: `dxf-layer dxf-c${aci(L.color)} ${L.name === 'WAENDE' ? 'is-heavy' : ''}`, 'data-layer': L.name }, world); groups.set(L.name, g); }
  const nodes = [];
  for (const e of D.ents) {
    const g = groups.get(e.layer); let n;
    if (e.kind === 'line') n = mk('line', { x1: e.pts[0][0], y1: e.pts[0][1], x2: e.pts[1][0], y2: e.pts[1][1] }, g);
    else if (e.kind === 'polyline') n = mk(e.closed ? 'polygon' : 'polyline', { points: e.pts.map((p) => p.join(',')).join(' ') }, g);
    else if (e.kind === 'circle') n = mk('circle', { cx: e.x, cy: e.y, r: e.r }, g);
    else if (e.kind === 'arc') { const r = (a) => (a * Math.PI) / 180; const s = [e.x + e.r * Math.cos(r(e.a0)), e.y + e.r * Math.sin(r(e.a0))], t = [e.x + e.r * Math.cos(r(e.a1)), e.y + e.r * Math.sin(r(e.a1))]; const sweep = ((e.a1 - e.a0) % 360 + 360) % 360; n = mk('path', { d: `M${s[0]} ${s[1]} A${e.r} ${e.r} 0 ${sweep > 180 ? 1 : 0} 1 ${t[0]} ${t[1]}` }, g); }
    else if (e.kind === 'text') {
      n = mk('text', { transform: `translate(${e.x} ${e.y}) scale(1 -1) rotate(${-e.rot})`, 'font-size': e.h, 'text-anchor': e.ha, class: 'dxf-text' }, g);
      if (e.mtext) { const total = e.lines.reduce((s, l) => s + l.f * e.h * 1.35, 0); let y = e.vrow === 0 ? e.h : e.vrow === 1 ? -total / 2 + e.h : -total + e.h; e.lines.forEach((l, i) => { const ts = mk('tspan', { x: 0, y: y.toFixed(3), 'font-size': (e.h * l.f).toFixed(3) }, n); ts.textContent = l.t; y += e.h * 1.35 * (e.lines[i + 1]?.f ?? 1); }); }
      else { n.textContent = e.text; n.setAttribute('dominant-baseline', e.va); }
    } else if (e.kind === 'dim') n = drawDim(e, D, g, mk);
    n.dataset.id = e.id; nodes[e.id] = n;
  }
  const W2S = (p) => [p[0] * d.view.s + d.view.tx, -p[1] * d.view.s + d.view.ty];
  const S2W = (x, y) => [(x - d.view.tx) / d.view.s, -(y - d.view.ty) / d.view.s];
  const apply = () => { world.setAttribute('transform', `matrix(${d.view.s} 0 0 ${-d.view.s} ${d.view.tx} ${d.view.ty})`); drawOverlay(); };
  const size = () => { const r = svg.getBoundingClientRect(); return [r.width || 800, r.height || 600]; };
  function fit() {
    const vis = D.ents.filter((e) => D.layers.get(e.layer).on); const bb = bboxOf(vis.length ? vis : D.ents);
    const [w, h] = size(); const pad = ctx.isMobile() ? 24 : 56;
    const s = Math.min((w - pad * 2) / (bb.w || 1), (h - pad * 2) / (bb.h || 1));
    d.view.s = s; d.view.tx = w / 2 - ((bb.x0 + bb.x1) / 2) * s; d.view.ty = h / 2 + ((bb.y0 + bb.y1) / 2) * s; d.view.fit = true;
    apply();
  }
  function zoomAt(f, sx, sy) {
    const [w, h] = size(); sx ??= w / 2; sy ??= h / 2;
    const wpt = S2W(sx, sy); const s = Math.max(2, Math.min(4000, d.view.s * f));
    d.view.s = s; d.view.tx = sx - wpt[0] * s; d.view.ty = sy + wpt[1] * s; d.view.fit = false; apply();
  }
  const pct = () => ((d.view.s / D.units.toM) / PX_PER_M_AT_100) * 100;

  // ── snapping ──
  const snapPts = [];
  for (const e of D.ents) { if (e.kind === 'line' || e.kind === 'polyline') e.pts.forEach((p) => snapPts.push({ p, e, kind: 'Corner' })); if (e.kind === 'circle') snapPts.push({ p: [e.x, e.y], e, kind: 'Centre' }); }
  function snap(sx, sy) {
    const w = S2W(sx, sy); let best = null, bd = 12;
    for (const s of snapPts) { if (!D.layers.get(s.e.layer).on) continue; const q = W2S(s.p); const dd = Math.hypot(q[0] - sx, q[1] - sy); if (dd < bd) { bd = dd; best = { p: s.p, kind: s.kind, layer: s.e.layer }; } }
    if (best) return best;
    let bl = null, bld = 7 / d.view.s;
    for (const e of D.ents) { if (!D.layers.get(e.layer).on || (e.kind !== 'line' && e.kind !== 'polyline')) continue; for (const [a, b2] of segsOf(e)) { const r = segDist(w, a, b2); if (r.d < bld) { bld = r.d; bl = { p: r.q, kind: 'On line', layer: e.layer }; } } }
    return bl || { p: w, kind: null };
  }
  function hit(sx, sy) {
    const w = S2W(sx, sy); let best = null, bd = 8 / d.view.s;
    for (const e of D.ents) {
      if (!D.layers.get(e.layer).on) continue; let dd = Infinity;
      if (e.kind === 'circle') dd = Math.abs(len(sub(w, [e.x, e.y])) - e.r);
      else if (e.kind === 'arc') dd = Math.abs(len(sub(w, [e.x, e.y])) - e.r) + (len(sub(w, [e.x, e.y])) > e.r * 1.4 ? 9 : 0);
      else if (e.kind === 'text') { const bb = nodes[e.id].getBBox(); const lw = [w[0] - e.x, -(w[1] - e.y)]; dd = lw[0] >= bb.x - 0.1 && lw[0] <= bb.x + bb.width + 0.1 && lw[1] >= bb.y - 0.1 && lw[1] <= bb.y + bb.height + 0.1 ? 0 : Infinity; }
      else for (const [a, b2] of segsOf(e)) dd = Math.min(dd, segDist(w, a, b2).d);
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  }

  // ── overlay (screen space) ──
  let live = null, snapNow = null, hover = null;
  function pill(x, y, text, cls = '') {
    const w = text.length * 7.4 + 18;
    const g = mk('g', { class: 'dxf-pill ' + cls, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, ov);
    mk('rect', { x: -w / 2, y: -12, width: w, height: 24, rx: 12 }, g); const t = mk('text', { x: 0, y: 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g); t.textContent = text;
  }
  function measLine(m, cls) {
    const a = W2S(m.a), b2 = W2S(m.b);
    mk('line', { x1: a[0], y1: a[1], x2: b2[0], y2: b2[1], class: 'dxf-mline ' + cls }, ov);
    for (const p of [a, b2]) mk('circle', { cx: p[0], cy: p[1], r: 4, class: 'dxf-mend ' + cls }, ov);
    const mx = (a[0] + b2[0]) / 2, my = (a[1] + b2[1]) / 2; const dx = b2[0] - a[0], dy = b2[1] - a[1]; const L = Math.hypot(dx, dy) || 1;
    const off = 18; pill(mx + (-dy / L) * off * (dx >= 0 ? 1 : -1), my + (dx / L) * off * (dx >= 0 ? 1 : -1), fmtLen(m.dist, D.units), cls);
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
    resultEl.hidden = !last;
    if (last) resultEl.innerHTML = `<span class="dxf-result__label">Distance ${d.meas.length > 1 ? d.meas.length : ''}</span><strong>${fmtLen(last.dist, D.units)}</strong><button class="fw-iconbtn fw-iconbtn--sm" type="button" aria-label="Copy distance" data-tip="Copy" id="dxf-copy-${d.id}">${ctx.icon('copy')}</button>`;
  }
  resultEl.addEventListener('click', (e) => { if (e.target.closest('button')) ctx.copyText(fmtLen(d.meas.at(-1).dist, D.units), e.target.closest('button')); });

  // ── pointer: pan, pinch, measure, select ──
  const pts = new Map(); let drag = null, pinch = null, space = false, moved = 0;
  const local = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = 0;
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; drag = null; return; }
    const pan = d.mode === 'view' || space || e.button === 1 || e.pointerType === 'touch' && d.mode !== 'measure' && d.mode !== 'select';
    drag = { pan, x: e.clientX, y: e.clientY, tx: d.view.tx, ty: d.view.ty };
    if (pan) el.classList.add('is-panning');
  });
  svg.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    if (pinch && pts.size === 2) { const [a, b2] = [...pts.values()]; const nd = Math.hypot(a[0] - b2[0], a[1] - b2[1]); const c = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2]; d.view.tx += c[0] - pinch.c[0]; d.view.ty += c[1] - pinch.c[1]; zoomAt(nd / pinch.d, c[0], c[1]); pinch = { d: nd, c }; ctx.refresh('zoom status'); return; }
    if (drag) { moved = Math.max(moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y)); if (drag.pan || moved > 6 && e.pointerType === 'touch') { d.view.tx = drag.tx + e.clientX - drag.x; d.view.ty = drag.ty + e.clientY - drag.y; d.view.fit = false; drag.pan = true; el.classList.add('is-panning'); apply(); } }
    const s = d.mode === 'measure' ? snap(p[0], p[1]) : { p: S2W(p[0], p[1]) };
    d.cursor = s.p; snapNow = s;
    if (d.mode === 'measure' && live?.a) live.b = s.p;
    if (d.mode === 'select') { const h0 = hit(p[0], p[1]); hover = h0 ? h0.id : null; svg.style.cursor = h0 ? 'pointer' : ''; }
    tipEl.hidden = !(d.mode === 'measure' && s.kind); if (!tipEl.hidden) { tipEl.textContent = s.kind + (s.layer ? ` · ${s.layer}` : ''); tipEl.style.transform = `translate(${p[0] + 14}px, ${p[1] + 14}px)`; }
    drawOverlay(); statusCoords();
  });
  const end = (e) => {
    const p = local(e); pts.delete(e.pointerId); el.classList.remove('is-panning');
    if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
    const wasPan = drag?.pan && moved > 3; drag = null;
    if (wasPan) { ctx.refresh('zoom status'); return; }
    if (e.type === 'pointercancel') return;
    if (d.mode === 'measure') {
      const s = snap(p[0], p[1]);
      if (!live?.a) { live = { a: s.p, b: null }; popLayer = ctx.pushLayer(() => { live = null; popLayer = null; drawOverlay(); }); }
      else { const m = { a: live.a, b: s.p, dist: len(sub(s.p, live.a)) }; live = null; popLayer?.(); popLayer = null; if (m.dist > 0) { d.meas.push(m); ctx.refresh('insp'); } }
      drawOverlay();
    } else if (d.mode === 'select') {
      const h0 = hit(p[0], p[1]); d.sel = h0 ? h0.id : null; drawOverlay(); ctx.refresh('insp');
      if (h0 && ctx.isMobile()) ctx.infoSheet(d, null);
    }
  };
  let popLayer = null;
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { d.cursor = null; snapNow = null; hover = null; tipEl.hidden = true; drawOverlay(); statusCoords(); });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p[0], p[1]); ctx.refresh('zoom status'); }, { passive: false });
  const kd = (e) => { if (e.key === ' ' && !e.repeat && ctx.isActive(d) && document.activeElement?.closest?.('.ov-stage,body') && !e.target.closest('input,textarea,button')) { space = true; el.classList.add('is-hand'); } };
  const ku = (e) => { if (e.key === ' ') { space = false; el.classList.remove('is-hand'); } };
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  function statusCoords() { const c = document.querySelector('.ov-coords'); if (c && ctx.isActive(d)) c.textContent = d.cursor ? `E ${fmtCoord(d.cursor[0] + D.origin.x)} · N ${fmtCoord(d.cursor[1] + D.origin.y)}` : 'E — · N —'; }

  const ro = new ResizeObserver(() => { if (d.view.fit) fit(); else apply(); });
  ro.observe(svg);
  requestAnimationFrame(fit);
  el.dataset.mode = d.mode;
  return {
    fit: () => { fit(); }, zoom: pct, isFit: () => d.view.fit,
    setZoom: (p) => zoomAt((p / pct())), zoomBy: (f) => zoomAt(f),
    setMode: (m) => { el.dataset.mode = m; live = null; popLayer?.(); popLayer = null; hover = null; drawOverlay(); },
    applyLayers: () => { for (const [n, g] of groups) g.style.display = D.layers.get(n).on ? '' : 'none'; if (d.sel != null && !D.layers.get(D.ents[d.sel].layer).on) d.sel = null; drawOverlay(); },
    redraw: drawOverlay, onShow: () => (d.view.fit ? fit() : apply()),
    screenOf: (x, y) => { const r = svg.getBoundingClientRect(); const q = W2S([x - D.origin.x, y - D.origin.y]); return { x: r.left + q[0], y: r.top + q[1] }; },
    svg: () => svg,
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
  t.textContent = e.label && e.label !== '<>' ? e.label : e.value.toFixed(2).replace('.', D.dimsep);
  return grp;
}

// ───────────────────────── exports ─────────────────────────
function csv(rows) { return '﻿' + rows.map((r) => r.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n'); }
function exportMeasurements(d, ctx) {
  if (!d.meas?.length) return;
  const D = d.data, o = D.origin, u = D.units.toM;
  const rows = [['#', 'distance_m', 'from_E', 'from_N', 'to_E', 'to_N', 'bearing_deg', 'crs'], ...d.meas.map((m, i) => [i + 1, (m.dist * u).toFixed(3), (m.a[0] + o.x).toFixed(3), (m.a[1] + o.y).toFixed(3), (m.b[0] + o.x).toFixed(3), (m.b[1] + o.y).toFixed(3), bearing(m.a, m.b).toFixed(2), D.crs || ''])];
  const name = `${ctx.baseName(d.name)}-measurements.csv`; ctx.download(name, csv(rows), 'text/csv');
  ctx.toast(`Saved ${name} · ${d.meas.length} measurement${d.meas.length > 1 ? 's' : ''}`);
}
function exportLayers(d, ctx) {
  const rows = [['layer', 'visible', 'objects', 'aci_color'], ...[...d.data.layers.values()].map((l) => [l.name, l.on ? 'yes' : 'no', l.count, l.color])];
  const name = `${ctx.baseName(d.name)}-layers.csv`; ctx.download(name, csv(rows), 'text/csv'); ctx.toast(`Saved ${name}`);
}
function exportLabels(d, ctx) {
  const o = d.data.origin; const T = d.data.ents.filter((e) => e.kind === 'text');
  const rows = [['text', 'layer', 'E', 'N', 'height_m'], ...T.map((e) => [e.text, e.layer, (e.x + o.x).toFixed(3), (e.y + o.y).toFixed(3), e.h])];
  const name = `${ctx.baseName(d.name)}-labels.csv`; ctx.download(name, csv(rows), 'text/csv'); ctx.toast(`Saved ${name} · ${T.length} labels`);
}
function svgString(d) {
  const svg = d.ctl.svg().cloneNode(true); const r = d.ctl.svg().getBoundingClientRect();
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
  const cs = getComputedStyle(d.ctl.svg());
  svg.querySelectorAll('.dxf-grid').forEach((x) => x.remove());
  // inline the theme colours so the file looks the same outside Fernwork
  const live = d.ctl.svg().querySelectorAll('.dxf-layer');
  svg.querySelectorAll('.dxf-layer').forEach((g, i) => { const c = getComputedStyle(live[i]).color; g.setAttribute('stroke', c); g.setAttribute('fill', 'none'); g.querySelectorAll('text').forEach((t) => { t.setAttribute('fill', c); t.setAttribute('stroke', 'none'); t.setAttribute('font-family', 'Geist, Arial, sans-serif'); }); g.querySelectorAll('line,polyline,polygon,circle,path').forEach((s) => { s.setAttribute('vector-effect', 'non-scaling-stroke'); s.setAttribute('stroke-width', g.classList.contains('is-heavy') ? 1.75 : 1.1); }); });
  svg.insertAdjacentHTML('afterbegin', `<rect width="100%" height="100%" fill="${cs.getPropertyValue('--stage').trim() || '#fff'}"/>`);
  return { s: new XMLSerializer().serializeToString(svg), w: r.width, h: r.height };
}
function exportSVG(d, ctx) { const { s } = svgString(d); const name = `${ctx.baseName(d.name)}.svg`; ctx.download(name, s, 'image/svg+xml'); ctx.toast(`Saved ${name} · visible layers`); }
function exportPNG(d, ctx) {
  const { s, w, h } = svgString(d); const img = new Image(); const k = 2;
  img.onload = () => { const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const g = c.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0); c.toBlob((b) => { const name = `${ctx.baseName(d.name)}.png`; ctx.download(name, b); ctx.toast(`Saved ${name} · ${Math.round(w * k)} × ${Math.round(h * k)} px`); }); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
