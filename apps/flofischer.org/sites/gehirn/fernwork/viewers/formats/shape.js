// Viewers · Shapefile Viewer. Real readers: zipped shapefiles (.shp + .shx + .dbf + .prj + .cpg, several layers per zip),
// a bare .shp, GeoJSON, KML and GPX. The CRS comes from the .prj. Map stage = the shared vector stage (vector.js) with
// layers, select, measure, background / map underneath, coordinate system; plus the attribute table below the map.
import { readZip } from './zip.js';
import { mountVector, layerList, syncLayerList, layerCommands, measureHtml, bindMeasure, exportMeasurements, exportPNG, exportSVG,
  optionGroups, statusItems, localize, area, entLength, fmtLen, fmtArea, csv, crsName } from './vector.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();
const base = (n) => n.split('/').pop().replace(/\.[^.]+$/, '');
const COLORS = [5, 30, 1, 3, 6, 4, 2];

// ───────────────────────── readers ─────────────────────────
function readShp(buf) {
  const dv = new DataView(buf); if (dv.getInt32(0) !== 9994) throw new Error('not a .shp file (bad file code)');
  const type = dv.getInt32(32, true); const feats = []; let p = 100;
  while (p + 8 <= buf.byteLength) {
    const len = dv.getInt32(p + 4) * 2; const o = p + 8; const st = dv.getInt32(o, true);
    if (st === 1 || st === 11 || st === 21) feats.push({ kind: 'point', pts: [[dv.getFloat64(o + 4, true), dv.getFloat64(o + 12, true)]] });
    else if ([3, 5, 13, 15, 23, 25].includes(st)) {
      const np = dv.getInt32(o + 36, true), n = dv.getInt32(o + 40, true); const parts = []; for (let i = 0; i < np; i++) parts.push(dv.getInt32(o + 44 + i * 4, true)); parts.push(n);
      const P = o + 44 + np * 4; const rings = []; for (let i = 0; i < np; i++) { const r = []; for (let k = parts[i]; k < parts[i + 1]; k++) r.push([dv.getFloat64(P + k * 16, true), dv.getFloat64(P + k * 16 + 8, true)]); rings.push(r); }
      feats.push({ kind: st % 10 === 5 ? 'polygon' : 'line', rings });
    } else if (st === 8 || st === 18) { const n = dv.getInt32(o + 36, true); const pts = []; for (let k = 0; k < n; k++) pts.push([dv.getFloat64(o + 40 + k * 16, true), dv.getFloat64(o + 48 + k * 16, true)]); feats.push({ kind: 'multipoint', pts }); }
    else feats.push({ kind: 'null' });
    p = o + len;
  }
  return { type, feats };
}
function readDbf(buf, enc = 'utf-8') {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf); const n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true);
  const fields = []; for (let o = 32; o < hl - 1; o += 32) { const name = new TextDecoder('latin1').decode(u8.subarray(o, o + 11)).replace(/\0.*$/, '').trim(); fields.push({ name, type: String.fromCharCode(u8[o + 11]), len: u8[o + 16], dec: u8[o + 17] }); }
  let dec; try { dec = new TextDecoder(enc); } catch { dec = new TextDecoder('utf-8'); }
  const rows = []; for (let i = 0; i < n; i++) { let o = hl + i * rl + 1; const r = {}; for (const f of fields) { const s = dec.decode(u8.subarray(o, o + f.len)).trim(); r[f.name] = f.type === 'N' || f.type === 'F' ? (s === '' ? null : +s) : s; o += f.len; } rows.push(r); }
  return { fields, rows };
}
function crsFromPrj(t) {
  if (!t) return null; let m;
  if ((m = /UTM[_ ]Zone[_ ](\d+)N/i.exec(t))) return (/ETRS/i.test(t) ? 'EPSG:258' : 'EPSG:326') + m[1].padStart(2, '0');
  if (/Gauss|GK|DHDN/i.test(t) && (m = /zone[_ ]?(\d)/i.exec(t))) return `EPSG:${31464 + +m[1]}`;
  if (/^GEOGCS/i.test(t.trim()) && /WGS[_ ]?(19)?84/i.test(t)) return 'EPSG:4326';
  if (/Mercator_Auxiliary|Web_Mercator|Pseudo/i.test(t)) return 'EPSG:3857';
  return null;
}
function fromGeoJSON(obj) {
  const out = []; const feats = obj.type === 'FeatureCollection' ? obj.features : obj.type === 'Feature' ? [obj] : [{ geometry: obj, properties: {} }];
  for (const f of feats) { const g = f.geometry; if (!g) continue; const a = f.properties || {}; const push = (kind, c) => out.push({ kind, ...(kind === 'point' ? { pts: [c] } : { rings: c }), attrs: a });
    if (g.type === 'Point') push('point', g.coordinates); else if (g.type === 'MultiPoint') g.coordinates.forEach((c) => push('point', c)); else if (g.type === 'LineString') push('line', [g.coordinates]); else if (g.type === 'MultiLineString') push('line', g.coordinates); else if (g.type === 'Polygon') push('polygon', g.coordinates); else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => push('polygon', p)); }
  return out;
}
function fromXml(text, kind) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'); const out = [];
  const coords = (s) => s.trim().split(/\s+/).map((c) => c.split(',').map(Number)).filter((c) => c.length >= 2 && c.every(Number.isFinite));
  if (kind === 'kml') for (const pm of doc.getElementsByTagName('Placemark')) { const name = pm.getElementsByTagName('name')[0]?.textContent || ''; const desc = pm.getElementsByTagName('description')[0]?.textContent || ''; const a = { name, description: desc };
    for (const p of pm.getElementsByTagName('Point')) out.push({ kind: 'point', pts: coords(p.textContent), attrs: a });
    for (const l of pm.getElementsByTagName('LineString')) out.push({ kind: 'line', rings: [coords(l.textContent)], attrs: a });
    for (const p of pm.getElementsByTagName('Polygon')) out.push({ kind: 'polygon', rings: [...p.getElementsByTagName('coordinates')].map((c) => coords(c.textContent)), attrs: a }); }
  else { const pt = (e) => [+e.getAttribute('lon'), +e.getAttribute('lat')];
    for (const w of doc.getElementsByTagName('wpt')) out.push({ kind: 'point', pts: [pt(w)], attrs: { name: w.getElementsByTagName('name')[0]?.textContent || '', ele: +(w.getElementsByTagName('ele')[0]?.textContent || 0) } });
    for (const t of doc.getElementsByTagName('trk')) out.push({ kind: 'line', rings: [...t.getElementsByTagName('trkpt')].map(pt).length ? [[...t.getElementsByTagName('trkpt')].map(pt)] : [], attrs: { name: t.getElementsByTagName('name')[0]?.textContent || 'Track' } });
    for (const r of doc.getElementsByTagName('rte')) out.push({ kind: 'line', rings: [[...r.getElementsByTagName('rtept')].map(pt)], attrs: { name: r.getElementsByTagName('name')[0]?.textContent || 'Route' } }); }
  return out;
}
// lon/lat → local metres (equirectangular around the data) so lengths and areas are right; inverse for the status line.
function projectGeo(layers) {
  const all = layers.flatMap((l) => l.feats.flatMap((f) => f.pts || f.rings.flat())); const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  for (const l of layers) for (const f of l.feats) { if (f.pts) f.pts = f.pts.map(([x, y]) => [x * kx, y * ky]); if (f.rings) f.rings = f.rings.map((r) => r.map(([x, y]) => [x * kx, y * ky])); }
  return { kx, ky };
}
async function load(file, extras = []) {
  const x = extOf(file.name); const layers = []; let crs = null, prjName = null;
  if (x === 'zip') {
    const zip = await readZip(file); const names = [...zip.keys()];
    for (const shp of names.filter((n) => /\.shp$/i.test(n) && !n.startsWith('__MACOSX'))) {
      const b = shp.replace(/\.shp$/i, ''); const get = async (ext) => { const k = names.find((n) => n.toLowerCase() === (b + ext).toLowerCase()); return k ? await zip.get(k)() : null; };
      const shpB = await get('.shp'), dbfB = await get('.dbf'), prjB = await get('.prj'), cpgB = await get('.cpg');
      const g = readShp(shpB.buffer.slice(shpB.byteOffset, shpB.byteOffset + shpB.byteLength));
      const enc = cpgB ? new TextDecoder().decode(cpgB).trim() : 'utf-8';
      const db = dbfB ? readDbf(dbfB.buffer.slice(dbfB.byteOffset, dbfB.byteOffset + dbfB.byteLength), /utf-?8/i.test(enc) ? 'utf-8' : enc) : null;
      const prj = prjB ? new TextDecoder().decode(prjB) : null; crs ||= crsFromPrj(prj); prjName ||= /^\w+\["([^"]+)"/.exec(prj || '')?.[1];
      layers.push({ name: base(b), feats: g.feats.map((f, i) => ({ ...f, attrs: db?.rows[i] || {} })), fields: db?.fields.map((f) => f.name) || [], hasDbf: !!db, hasPrj: !!prj });
    }
    if (!layers.length) {
      const gj = names.find((n) => /\.(geo)?json$/i.test(n)); if (gj) return load(new File([await zip.get(gj)()], gj));
      throw human(`${file.name} has no shapefile inside`, 'The ZIP doesn’t contain a .shp file. A shapefile needs at least .shp, .shx and .dbf.', `Files: ${names.slice(0, 8).join(', ')}`);
    }
  } else if (x === 'shp') {
    const g = readShp(await file.arrayBuffer());
    const dbf = extras.find((f) => extOf(f.name) === 'dbf'), prj = extras.find((f) => extOf(f.name) === 'prj');
    const db = dbf ? readDbf(await dbf.arrayBuffer()) : null; const pt = prj ? await prj.text() : null; crs = crsFromPrj(pt);
    layers.push({ name: base(file.name), feats: g.feats.map((f, i) => ({ ...f, attrs: db?.rows[i] || {} })), fields: db?.fields.map((f) => f.name) || [], hasDbf: !!db, hasPrj: !!pt });
  } else if (x === 'geojson' || x === 'json') { const feats = fromGeoJSON(JSON.parse(await file.text())); layers.push({ name: base(file.name), feats, fields: [...new Set(feats.flatMap((f) => Object.keys(f.attrs)))], hasDbf: true, hasPrj: true }); crs = 'EPSG:4326'; }
  else if (x === 'kml' || x === 'gpx') { const feats = fromXml(await file.text(), x); layers.push({ name: base(file.name), feats, fields: [...new Set(feats.flatMap((f) => Object.keys(f.attrs)))], hasDbf: true, hasPrj: true }); crs = 'EPSG:4326'; }
  const geo = crs === 'EPSG:4326' ? projectGeo(layers) : null;
  // → vector model
  const out = { layers: new Map(), ents: [], unsupported: {}, crs, crsSrc: crs ? 'file' : null, prjName, geo, units: { name: 'metres', abbr: 'm', toM: 1, fromFile: !!crs }, flat: true, srcLayers: layers };
  layers.forEach((l, li) => {
    out.layers.set(l.name, { name: l.name, color: COLORS[li % COLORS.length], on: true, count: 0, kinds: {}, heavy: li === 0 });
    const labelField = l.fields.find((f) => /^(FLSTNR|NAME|SCHACHT|ID|NR|LABEL)$/i.test(f));
    l.feats.forEach((f, fi) => {
      const meta = { layer: l.name, feat: fi, attrs: f.attrs };
      if (f.kind === 'point' || f.kind === 'multipoint') for (const p of f.pts) out.ents.push({ ...meta, id: out.ents.length, kind: 'point', x: p[0], y: p[1] });
      else if (f.kind === 'polygon' || f.kind === 'line') f.rings.forEach((r, ri) => { if (r.length < 2) return; const closed = f.kind === 'polygon'; const pts = closed && r.length > 2 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r; out.ents.push({ ...meta, id: out.ents.length, kind: 'polyline', pts, closed, fillable: closed, hole: ri > 0 }); });
      if (labelField && f.attrs[labelField] != null && f.kind === 'polygon' && li === 0) { const r = f.rings[0]; const c = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]); out.ents.push({ layer: l.name, id: out.ents.length, kind: 'text', x: c[0], y: c[1], h: 2.4, text: String(f.attrs[labelField]), rot: 0, ha: 'middle', va: 'central', label: true }); }
      else if (labelField && f.kind === 'point') { const p = f.pts[0]; out.ents.push({ layer: l.name, id: out.ents.length, kind: 'text', x: p[0] + 2, y: p[1] + 1.2, h: 2, text: String(f.attrs[labelField]), rot: 0, ha: 'start', va: 'alphabetic', label: true }); }
    });
  });
  if (!out.ents.length) throw human(`${file.name} has no shapes`, 'The file is valid but contains no geometry.', 'no features');
  localize(out);
  for (const e of out.ents) { const L = out.layers.get(e.layer); L.count += e.label ? 0 : 1; }
  return out;
}

const featOf = (d, e) => (e && e.feat != null ? d.data.srcLayers.find((l) => l.name === e.layer)?.feats[e.feat] : null);
export default {
  id: 'shape', label: 'Map', icon: 'globe',
  listLabel: 'Layers', listIcon: 'layers', listOpen: () => true, listOnTablet: true, selIcon: 'mouse-pointer-2',
  modes: [{ id: 'view', label: 'Pan', icon: 'hand', key: 'h' }, { id: 'select', label: 'Select', icon: 'mouse-pointer-2', key: 'v' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm' }],
  defaultMode: () => 'select',
  keys: [{ label: 'Attribute table', keys: 't' }],
  steps(d, ctx) {
    return [
      { label: 'Loading map engine (bundled · 52 KB)', cached: 'Map engine ready', engine: 'shape', ms: 320 },
      { label: `Unpacking ${ctx.formatBytes(d.size)}`, ms: 220 },
      { label: 'Reading shapes, attributes and projection', ms: 320, run: async () => { try { d.data = await load(d.file, d.extras || []); } catch (e) { if (e.human) throw e; throw human(`${d.name} couldn’t be opened as a map`, 'The file is damaged or isn’t a shapefile, GeoJSON, KML or GPX.', String(e.message || e)); } d.table = { open: !ctx.isMobile(), layer: d.data.srcLayers[0].name, sort: null, filter: '' }; } },
    ];
  },
  usesExtras: true,
  acceptsAdd: (n) => ['dbf', 'prj', 'shx', 'cpg'].includes(extOf(n)),
  addFiles(d, files, ctx) { ctx.toast('Drop the .shp together with its .dbf and .prj, or a .zip of all of them', { type: 'info' }); },
  mount(d, el, ctx) {
    el.classList.add('shp');
    const mapEl = ctx.h('<div class="shp-map"></div>'); const tabEl = ctx.h('<section class="shp-table" aria-label="Attribute table"></section>'); el.append(mapEl, tabEl);
    const v = mountVector(d, mapEl, ctx, { key: 'shape', selectable: (e) => !e.label, onSelect: (e) => { d.selFeat = e && e.feat != null ? { layer: e.layer, feat: e.feat } : null; renderTable(); } });
    function renderTable() {
      el.classList.toggle('has-table', !!d.table.open); if (!d.table.open) { tabEl.innerHTML = ''; return; }
      const L = d.data.srcLayers.find((l) => l.name === d.table.layer) || d.data.srcLayers[0]; const T = d.table;
      let idx = L.feats.map((_, i) => i);
      if (T.filter) { const q = T.filter.toLowerCase(); idx = idx.filter((i) => Object.values(L.feats[i].attrs).some((v2) => String(v2 ?? '').toLowerCase().includes(q))); }
      if (T.sort) { const { f, dir } = T.sort; idx.sort((a, b) => { const x = L.feats[a].attrs[f], y = L.feats[b].attrs[f]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'de')) * dir; }); }
      const cols = L.fields.length ? L.fields : ['(no attributes)'];
      tabEl.innerHTML = `<div class="shp-tbar">${d.data.srcLayers.length > 1 ? `<div class="fw-seg fw-seg--sm" aria-label="Layer" id="shp-layer">${d.data.srcLayers.map((l) => `<button class="fw-seg__opt" type="button" data-value="${ctx.esc(l.name)}" aria-checked="${l.name === L.name}">${ctx.esc(l.name)}</button>`).join('')}</div>` : `<strong>${ctx.esc(L.name)}</strong>`}
        <span class="db-meta">${ctx.nf(idx.length)}${idx.length !== L.feats.length ? ` of ${ctx.nf(L.feats.length)}` : ''} features · ${L.fields.length} fields</span><span class="fw-spacer"></span>
        <label class="fw-inputwrap db-filter">${ctx.icon('filter')}<input class="fw-input" type="search" placeholder="Filter features" aria-label="Filter features" value="${ctx.esc(T.filter)}"></label>
        <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="shp-close" aria-label="Hide attribute table" data-tip="Hide table" data-tip-kbd="t">${ctx.icon('x')}</button></div>
        <div class="shp-gridwrap"><table class="db-grid shp-grid"><thead><tr><th class="db-rn"><span class="fw-sr">Feature</span></th>${cols.map((c) => `<th scope="col"><button type="button" class="shp-sort" data-f="${ctx.esc(c)}">${ctx.esc(c)}${T.sort?.f === c ? (T.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${idx.slice(0, 1000).map((i) => { const a = L.feats[i].attrs; const sel = d.selFeat?.layer === L.name && d.selFeat.feat === i; return `<tr data-i="${i}" ${sel ? 'aria-selected="true"' : ''}><td class="db-rn">${i + 1}</td>${cols.map((c) => { const v2 = a[c]; return `<td class="${typeof v2 === 'number' ? 'is-num' : ''}">${v2 == null ? '' : ctx.esc(typeof v2 === 'number' ? v2.toLocaleString('en-US') : v2)}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
      ctx.enhance(tabEl);
      tabEl.querySelector('#shp-layer')?.addEventListener('fw-change', (e) => { T.layer = e.detail.value; T.sort = null; renderTable(); });
      const inp = tabEl.querySelector('input'); let ft = 0; inp.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => { T.filter = inp.value; const pos = inp.selectionStart; renderTable(); const n = tabEl.querySelector('input'); n.focus(); n.setSelectionRange(pos, pos); }, 140); });
      tabEl.querySelector('#shp-close').onclick = () => toggle(false);
      tabEl.querySelector('thead').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; T.sort = T.sort?.f !== f ? { f, dir: 1 } : T.sort.dir > 0 ? { f, dir: -1 } : null; renderTable(); });
      tabEl.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const fi = +tr.dataset.i; const ent = d.data.ents.find((x) => x.layer === L.name && x.feat === fi && !x.label); if (!ent) return; d.selFeat = { layer: L.name, feat: fi }; d.sel = ent.id; v.select(ent.id); v.zoomTo(ent); ctx.showInsp(); ctx.refresh('insp'); renderTable(); });
      tabEl.querySelector('tr[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }
    function toggle(on = !d.table.open) { d.table.open = on; renderTable(); requestAnimationFrame(() => v.onResize()); ctx.refresh('frame'); }
    renderTable();
    return { ...v, renderTable, toggleTable: toggle, key: (e) => { if (e.key.toLowerCase() === 't') { toggle(); return true; } return v.key(e); }, onResize: () => v.onResize() };
  },
  bar(d, ctx) { return `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="shp-tab" aria-pressed="${!!d.table?.open}" data-tip="Attribute table" data-tip-kbd="t">${ctx.icon('sheet')}Table</button>`; },
  bindBar(d, fb) { fb.querySelector('#shp-tab')?.addEventListener('click', () => d.ctl.toggleTable()); },
  list(d, ctx) { return layerList(d, ctx); },
  updateList(d) { syncLayerList(d); },
  inspector(d, ctx) {
    const D = d.data, u = D.units; const L = D.srcLayers;
    const info = ctx.kv([
      ['Layers', L.map((l) => `${ctx.esc(l.name)} <span class="ov-subline">${ctx.nf(l.feats.length)} ${l.feats[0]?.kind === 'point' ? 'points' : l.feats[0]?.kind === 'polygon' ? 'polygons' : 'lines'} · ${l.fields.length} fields${l.hasDbf ? '' : ' · no .dbf'}</span>`).join('')],
      ['Coordinates', D.crs ? `${D.crs} <span class="ov-src">${D.crsSrc === 'chosen' ? 'chosen' : D.geo ? 'lon / lat' : 'from .prj'}</span><span class="ov-subline">${crsName(D.crs)}</span>` : '<span class="ov-warnline">No .prj · set it under ⋯</span>'],
      ['Extent', `${ctx.nf(D.bbox.w * u.toM, 0)} × ${ctx.nf(D.bbox.h * u.toM, 0)} m`],
    ]);
    let selection = null; const e = d.sel != null ? D.ents[d.sel] : null; const f = featOf(d, e);
    if (e && f) {
      const geom = e.kind === 'point' ? null : e.closed ? ['Area', `<strong>${fmtArea(Math.abs(area(e.pts)), u)}</strong> · perimeter ${fmtLen(entLength(e), u)}`] : ['Length', `<strong>${fmtLen(entLength(e), u)}</strong>`];
      selection = `<div class="ov-seltitle">${ctx.icon(e.kind === 'point' ? 'map-pin' : 'shapes', { size: 16 })}${ctx.esc(e.layer)} · feature ${e.feat + 1}</div>` + ctx.kv([geom, ...Object.entries(f.attrs).map(([k, v]) => [k, v == null || v === '' ? '<span class="ov-null">empty</span>' : ctx.esc(typeof v === 'number' ? v.toLocaleString('en-US') : v), typeof v === 'number' ? 'ov-num' : ''])]) + `<div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="shp-copy">${ctx.icon('copy')}Copy as JSON</button></div>`;
    }
    return { info, infoLabel: 'Map data', selection, selectionLabel: 'Feature', measure: measureHtml(d, ctx) };
  },
  bindInspector(d, root, ctx) {
    bindMeasure(d, root, ctx, exportMeasurements);
    root.querySelector('#shp-copy')?.addEventListener('click', (ev) => { const f = featOf(d, d.data.ents[d.sel]); ctx.copyText(JSON.stringify(f.attrs, null, 2), ev.currentTarget); });
  },
  status(d) { const s = statusItems(d); if (d.data.geo && d.cursor) { const o = d.data.origin; s[0] = `<span class="ov-coords">${((d.cursor[1] + o.y) / d.data.geo.ky).toFixed(6)}° N · ${((d.cursor[0] + o.x) / d.data.geo.kx).toFixed(6)}° E</span>`; } return s; },
  options(d, ctx) { return optionGroups(d, ctx, 'shape'); },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const L = d.data.srcLayers.find((l) => l.name === d.table?.layer) || d.data.srcLayers[0]; const m = d.meas?.length || 0;
    return [
      { group: 'Data', items: [
        { label: 'GeoJSON', sub: `${d.data.srcLayers.length} layer${d.data.srcLayers.length > 1 ? 's' : ''} · visible features`, icon: 'braces', file: `${b}.geojson`, onSelect: () => exportGeoJSON(d, ctx) },
        { label: `Attributes of ${L.name} as CSV`, sub: `${ctx.nf(L.feats.length)} rows`, icon: 'sheet', file: `${L.name}-attributes.csv`, onSelect: () => { const rows = [L.fields, ...L.feats.map((f) => L.fields.map((k) => f.attrs[k] ?? ''))]; const name = `${L.name}-attributes.csv`; ctx.download(name, csv(rows), 'text/csv'); ctx.toast(`Saved ${name}`); } },
        { label: 'Measurements as CSV', sub: m ? `${m} measurement${m > 1 ? 's' : ''}` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !m, onSelect: () => exportMeasurements(d, ctx) }] },
      { group: 'Image', items: [
        { label: 'PNG of this view', sub: '2× · as shown', icon: 'image', file: `${b}.png`, onSelect: () => exportPNG(d, ctx) },
        { label: 'SVG map', sub: 'Vector, visible layers', icon: 'pen-tool', file: `${b}.svg`, onSelect: () => exportSVG(d, ctx) }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'table', label: 'Show attribute table', icon: 'sheet', kbd: 't', run: () => d.ctl.toggleTable(true) },
      { id: 'measure', label: 'Measure distance', icon: 'ruler', run: () => ctx.setMode(d, 'measure') },
      { id: 'geojson', label: 'Export as GeoJSON', icon: 'braces', searchOnly: true, run: () => exportGeoJSON(d, ctx) },
      ...layerCommands(d, ctx),
    ];
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Layers', icon: 'layers' }, { id: 'tbl', label: 'Table', icon: 'sheet', pressed: !!d.table?.open, run: (doc, ctx) => { doc.ctl.toggleTable(); ctx.refresh('bottom'); } }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'Options', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
function exportGeoJSON(d, ctx) {
  const D = d.data; const o = D.origin; const back = (p) => (D.geo ? [+((p[0] + o.x) / D.geo.kx).toFixed(7), +((p[1] + o.y) / D.geo.ky).toFixed(7)] : [+(p[0] + o.x).toFixed(3), +(p[1] + o.y).toFixed(3)]);
  const features = []; const seen = new Set();
  for (const e of D.ents) { if (e.label || !D.layers.get(e.layer).on || e.feat == null) continue; const k = `${e.layer}:${e.feat}`; if (seen.has(k)) continue; seen.add(k); const f = featOf(d, e);
    const parts = D.ents.filter((x) => x.layer === e.layer && x.feat === e.feat && !x.label);
    const geometry = e.kind === 'point' ? { type: 'Point', coordinates: back([e.x, e.y]) } : e.closed ? { type: 'Polygon', coordinates: parts.map((x) => [...x.pts, x.pts[0]].map(back)) } : { type: 'MultiLineString', coordinates: parts.map((x) => x.pts.map(back)) };
    features.push({ type: 'Feature', properties: { layer: e.layer, ...f.attrs }, geometry }); }
  const fc = { type: 'FeatureCollection', ...(D.crs && !D.geo ? { crs: { type: 'name', properties: { name: `urn:ogc:def:crs:${D.crs.replace(':', '::')}` } } } : {}), features };
  const name = `${ctx.baseName(d.name)}.geojson`; ctx.download(name, JSON.stringify(fc), 'application/geo+json'); ctx.toast(`Saved ${name} · ${features.length} features`);
}
