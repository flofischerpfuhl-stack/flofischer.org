// Viewers · DXF Viewer. Real parser (LINE, LWPOLYLINE, CIRCLE, ARC, TEXT, MTEXT, DIMENSION); drawing, layers,
// select, measure, CRS and units from the file. The stage itself is shared with the Shapefile viewer (vector.js).
import { mountVector, layerList, syncLayerList, layerCommands, measureHtml, bindMeasure, exportMeasurements, exportPNG, exportSVG,
  optionGroups, statusItems, localize, aci, entLength, bearing, area, fmtLen, fmtArea, fmtCoord, csv, crsName, calibrate, clearMeas } from './vector.js';

const UNITS = { 0: null, 1: ['inches', 'in', 0.0254], 2: ['feet', 'ft', 0.3048], 4: ['millimetres', 'mm', 0.001], 5: ['centimetres', 'cm', 0.01], 6: ['metres', 'm', 1] };
const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });

// ───────────────────────── parser ─────────────────────────
export function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const c = parseInt(lines[i], 10); if (Number.isNaN(c)) throw Object.assign(new Error(`Line ${i + 1}: expected a group code, found “${lines[i].slice(0, 20)}”`), { line: i + 1 }); pairs.push([c, lines[i + 1].trim()]); }
  if (!pairs.some(([c, v]) => c === 0 && v === 'SECTION')) throw new Error('No SECTION found: this is not a DXF drawing');
  const out = { version: '', unitsCode: 0, dimsep: '.', crs: null, layers: new Map(), ents: [], unsupported: {}, flat: true };
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
      continue;
    }
    if (sec === 'TABLES' && c === 0 && v === 'LAYER') {
      const e = readEnt(); const name = e.g.find((p) => p[0] === 2)?.[1]; const col = +(e.g.find((p) => p[0] === 62)?.[1] ?? 7);
      if (name != null) out.layers.set(name, { name, color: Math.abs(col) || 7, on: col >= 0, count: 0, kinds: {}, heavy: name === 'WAENDE' });
      continue;
    }
    if (sec === 'ENTITIES' && c === 0) { addEntity(out, readEnt()); continue; }
    i++;
  }
  if (!out.ents.length && !Object.keys(out.unsupported).length) throw new Error('The ENTITIES section is empty or missing');
  localize(out);
  out.units = UNITS[out.unitsCode] ? { name: UNITS[out.unitsCode][0], abbr: UNITS[out.unitsCode][1], toM: UNITS[out.unitsCode][2], fromFile: true } : { name: 'metres', abbr: 'm', toM: 1, fromFile: false };
  for (const e of out.ents) { const L = out.layers.get(e.layer) || out.layers.set(e.layer, { name: e.layer, color: 7, on: true, count: 0, kinds: {} }).get(e.layer); L.count++; L.kinds[e.kind] = (L.kinds[e.kind] || 0) + 1; }
  return out;
}
function addEntity(out, { type, g }) {
  const num = (c, d = 0) => { const p = g.find((x) => x[0] === c); return p ? +p[1] : d; };
  const str = (c) => g.filter((x) => x[0] === c).map((x) => x[1]).join('');
  const layer = str(8) || '0';
  const base = { type, layer, id: out.ents.length };
  const z = Math.max(Math.abs(num(30)), Math.abs(num(31)), Math.abs(num(38))); if (z > 1e-9) { base.z = z; out.flat = false; }
  if (type === 'LINE') out.ents.push({ ...base, kind: 'line', pts: [[num(10), num(20)], [num(11), num(21)]] });
  else if (type === 'LWPOLYLINE') {
    const pts = []; let cur = null;
    for (const [c, v] of g) { if (c === 10) { cur = [+v, 0]; pts.push(cur); } else if (c === 20 && cur) cur[1] = +v; }
    out.ents.push({ ...base, kind: 'polyline', pts, closed: (num(70) & 1) === 1, fillable: true });
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

const KIND_LABEL = { line: 'Line', polyline: 'Polyline', circle: 'Circle', arc: 'Arc', text: 'Text label', dim: 'Dimension' };
const KIND_ICON = { line: 'minus', polyline: 'pen-tool', circle: 'circle-help', arc: 'rotate-ccw', text: 'type', dim: 'ruler' };
const KIND_NAME = { HATCH: 'hatch fill', INSERT: 'block reference', SPLINE: 'spline', ELLIPSE: 'ellipse', SOLID: 'solid fill', IMAGE: 'image' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ver = (v) => ({ AC1009: 'R12', AC1015: 'AutoCAD 2000', AC1018: 'AutoCAD 2004', AC1021: 'AutoCAD 2007', AC1024: 'AutoCAD 2010', AC1027: 'AutoCAD 2013', AC1032: 'AutoCAD 2018' })[v] || v || 'R12';

export default {
  id: 'dxf', label: 'Drawing', icon: 'compass',
  listLabel: 'Layers', listIcon: 'layers', listOpen: () => true, listOnTablet: true,
  selIcon: 'mouse-pointer-2', measureLabel: 'Measurements',
  modes: [{ id: 'view', label: 'Pan', icon: 'hand', key: 'h', tip: 'Pan · drag to move' }, { id: 'select', label: 'Select', icon: 'mouse-pointer-2', key: 'v', tip: 'Select · click an object' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm', tip: 'Measure · click two points' }],
  keys: [{ label: 'Pan while held', keys: 'space' }, { label: 'Clear measurements', keys: 'backspace' }],
  steps(d, ctx) {
    return [
      { label: 'Loading drawing engine (bundled · 38 KB)', cached: 'Drawing engine ready', engine: 'dxf', ms: 360 },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 200, run: async () => { d.text = await d.file.text(); } },
      { label: 'Parsing layers and objects', ms: 320, run: async () => {
        try { d.data = parseDXF(d.text); } catch (e) { throw human(`${d.name} couldn’t be opened as a drawing`, d.size < 64 ? `It’s only ${ctx.formatBytes(d.size)}, too small for a DXF drawing.` : /^\s*AC10/.test(d.text) ? 'This looks like a binary DWG file. Save it as DXF in your CAD program, then open it here.' : 'It doesn’t contain DXF sections. It may be a DWG or another format renamed to .dxf.', e.message); }
        d.text = null; d.data.crsSrc = d.data.crs ? 'file' : null;
      } },
      { label: 'Drawing text labels and dimensions', ms: 240 },
    ];
  },
  mount(d, el, ctx) { return mountVector(d, el, ctx, { key: 'dxf' }); },
  list(d, ctx) { return layerList(d, ctx); },
  updateList(d) { syncLayerList(d); },
  inspector(d, ctx) {
    const D = d.data, u = D.units, nf = ctx.nf;
    const nText = D.ents.filter((e) => e.kind === 'text').length, nDim = D.ents.filter((e) => e.kind === 'dim').length;
    const skipped = Object.entries(D.unsupported);
    const info = ctx.kv([
      ['Type', `DXF · ${ver(D.version)}`],
      ['Contents', `${nf(D.ents.length)} objects · ${D.layers.size} layers<span class="ov-subline">${nText} text labels · ${nDim} dimensions</span>`],
      skipped.length ? ['Not shown', `<span class="ov-warnline">${ctx.icon('triangle-alert', { size: 14 })}${skipped.map(([k, n]) => `${n} ${KIND_NAME[k] || k.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ')}</span>`] : null,
      ['Units', `${cap(u.name)} <span class="ov-src">${u.fromFile ? 'from file' : 'assumed'}</span>`],
      ['Coordinates', D.crs ? `${D.crs} <span class="ov-src">${D.crsSrc === 'chosen' ? 'chosen' : 'from file'}</span><span class="ov-subline">${crsName(D.crs)}</span>` : `Local · <button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="dxf-crs">Set…</button>`],
      ['Extent', `${nf(D.bbox.w * u.toM, 1)} × ${nf(D.bbox.h * u.toM, 1)} m`],
    ]);
    let selection = null;
    const e = d.sel != null ? D.ents[d.sel] : null;
    if (e) {
      const W = (p) => `E ${fmtCoord(p[0] + D.origin.x)}<br>N ${fmtCoord(p[1] + D.origin.y)}`;
      const rows = [['Layer', `<span class="ov-swatch dxf-c${aci(D.layers.get(e.layer)?.color)}"></span>${ctx.esc(e.layer)}`]];
      if (e.kind === 'line' || e.kind === 'dim') rows.push(['Length', `<strong>${fmtLen(Math.hypot(e.pts[1][0] - e.pts[0][0], e.pts[1][1] - e.pts[0][1]), u)}</strong>`], ['Direction', `${nf(bearing(e.pts[0], e.pts[1]), 1)}° from north`], ['Start', W(e.pts[0]), 'ov-mono'], ['End', W(e.pts[1]), 'ov-mono']);
      else if (e.kind === 'polyline') rows.push(['Vertices', `${e.pts.length}${e.closed ? ' · closed' : ''}`], ['Length', `<strong>${fmtLen(entLength(e), u)}</strong>`], ...(e.closed ? [['Area', fmtArea(Math.abs(area(e.pts)), u)]] : []));
      else if (e.kind === 'circle') rows.push(['Diameter', `<strong>${fmtLen(2 * e.r, u)}</strong>`], ['Centre', W([e.x, e.y]), 'ov-mono']);
      else if (e.kind === 'arc') rows.push(['Radius', fmtLen(e.r, u)], ['Arc length', fmtLen(entLength(e), u)]);
      else if (e.kind === 'text') rows.push(['Text', `<strong>${ctx.esc(e.text)}</strong>`], ['Height', fmtLen(e.h, u)], ['Position', W([e.x, e.y]), 'ov-mono']);
      rows.push(['Colour', `ACI ${D.layers.get(e.layer)?.color ?? 7} (by layer)`]);
      selection = `<div class="ov-seltitle">${ctx.icon(KIND_ICON[e.kind], { size: 16 })}${KIND_LABEL[e.kind]}</div>` + ctx.kv(rows);
    }
    return { info, infoLabel: 'Drawing', selection, measure: measureHtml(d, ctx) };
  },
  bindInspector(d, root, ctx) {
    bindMeasure(d, root, ctx, exportMeasurements);
    root.querySelector('#dxf-crs')?.addEventListener('click', () => this.options(d, ctx)[2].items[0].onSelect());
  },
  status(d) { return statusItems(d); },
  options(d, ctx) { return optionGroups(d, ctx, 'dxf'); },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const m = d.meas?.length || 0;
    return [
      { group: 'Image', items: [
        { label: 'PNG of this view', sub: '2× · as shown', icon: 'image', file: `${b}.png`, onSelect: () => exportPNG(d, ctx) },
        { label: 'SVG drawing', sub: 'Vector, visible layers', icon: 'pen-tool', file: `${b}.svg`, onSelect: () => exportSVG(d, ctx) }] },
      { group: 'Data', items: [
        { id: 'meas-csv', label: 'Measurements as CSV', sub: m ? `${m} measurement${m > 1 ? 's' : ''} · metres` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !m, onSelect: () => exportMeasurements(d, ctx) },
        { label: 'Layers as CSV', sub: `${d.data.layers.size} layers with counts`, icon: 'layers', file: `${b}-layers.csv`, onSelect: () => { const rows = [['layer', 'visible', 'objects', 'aci_color'], ...[...d.data.layers.values()].map((l) => [l.name, l.on ? 'yes' : 'no', l.count, l.color])]; const name = `${b}-layers.csv`; ctx.download(name, csv(rows), 'text/csv'); ctx.toast(`Saved ${name}`); } },
        { label: 'Text labels as CSV', sub: 'Text with E/N coordinates', icon: 'type', file: `${b}-labels.csv`, onSelect: () => { const o = d.data.origin; const T = d.data.ents.filter((e) => e.kind === 'text'); const rows = [['text', 'layer', 'E', 'N', 'height_m'], ...T.map((e) => [e.text, e.layer, (e.x + o.x).toFixed(3), (e.y + o.y).toFixed(3), e.h])]; const name = `${b}-labels.csv`; ctx.download(name, csv(rows), 'text/csv'); ctx.toast(`Saved ${name} · ${T.length} labels`); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'measure', label: 'Measure distance', sub: 'M · click two points', icon: 'ruler', run: () => ctx.setMode(d, 'measure') },
      { id: 'select', label: 'Select objects', sub: 'V', icon: 'mouse-pointer-2', run: () => ctx.setMode(d, 'select') },
      { id: 'crs', label: 'Coordinate system…', sub: d.data.crs || 'Not set', icon: 'globe', searchOnly: true, run: () => optionGroups(d, ctx, 'dxf')[2].items[0].onSelect() },
      { id: 'cal', label: 'Calibrate scale…', icon: 'scaling', searchOnly: true, run: () => d.meas?.length ? calibrate(d, ctx) : ctx.toast('Measure a known distance first', { type: 'info' }) },
      { id: 'clear', label: 'Clear measurements', icon: 'eraser', searchOnly: true, run: () => clearMeas(d, ctx) },
      { id: 'png', label: 'Save this view as PNG', icon: 'image', searchOnly: true, run: () => exportPNG(d, ctx) },
      ...layerCommands(d, ctx),
    ];
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Layers', icon: 'layers' }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'Options', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
