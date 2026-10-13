// Viewers · IFC Viewer. Real STEP parser for the spatial structure (project › site › building › storeys › elements),
// property sets, quantities and materials. Geometry: extruded rectangle / polyline profiles with local placements
// (enough for the sample and many simple models); the real build uses the bundled web-ifc engine for full geometry.
// Shared 3D stage (render3d.js): orbit, select element → properties, measure, section plane, storey / type visibility.
import { mount3d } from './render3d.js';
import { bindSection } from './mesh.js';

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const TYPE_LABEL = { IFCWALL: 'Wall', IFCWALLSTANDARDCASE: 'Wall', IFCSLAB: 'Slab', IFCROOF: 'Roof', IFCWINDOW: 'Window', IFCDOOR: 'Door', IFCSTAIR: 'Stair', IFCSTAIRFLIGHT: 'Stair', IFCCOLUMN: 'Column', IFCBEAM: 'Beam', IFCRAILING: 'Railing', IFCCOVERING: 'Covering', IFCFURNISHINGELEMENT: 'Furniture', IFCBUILDINGELEMENTPROXY: 'Other element', IFCMEMBER: 'Member', IFCPLATE: 'Plate', IFCSPACE: 'Space' };
const COLOR = { Wall: [231, 228, 221], Slab: [188, 184, 176], Roof: [182, 84, 60], Window: [142, 197, 232], Door: [138, 90, 54], Stair: [160, 164, 170], Column: [200, 200, 205], Beam: [200, 190, 170] };
const plural = (t, n) => (n === 1 ? t : t === 'Other element' ? 'Other elements' : t === 'Furniture' ? 'Furniture' : t + 's');

// ───────────────────────── STEP parsing ─────────────────────────
function parseArgs(s) {
  let i = 0;
  const val = () => {
    while (s[i] === ' ' || s[i] === '\n' || s[i] === '\r') i++;
    const c = s[i];
    if (c === "'") { let out = ''; i++; for (;;) { if (s[i] === "'" && s[i + 1] === "'") { out += "'"; i += 2; } else if (s[i] === "'") { i++; break; } else out += s[i++]; } return decodeStep(out); }
    if (c === '(') { i++; const arr = []; while (s[i] !== ')') { arr.push(val()); while (s[i] === ' ') i++; if (s[i] === ',') i++; } i++; return arr; }
    if (c === '#') { let j = i + 1; while (/\d/.test(s[j])) j++; const r = { ref: +s.slice(i + 1, j) }; i = j; return r; }
    if (c === '$' || c === '*') { i++; return null; }
    if (c === '.') { const j = s.indexOf('.', i + 1); const e = s.slice(i + 1, j); i = j + 1; return { enum: e }; }
    if (/[A-Z]/i.test(c)) { let j = i; while (/[A-Z0-9_]/i.test(s[j])) j++; const name = s.slice(i, j).toUpperCase(); i = j; const inner = val(); return { typed: name, v: inner?.[0] ?? inner }; }
    let j = i; while (j < s.length && /[-+0-9.Ee]/.test(s[j])) j++; const n = +s.slice(i, j); i = j; return n;
  };
  const out = val(); return out;
}
const decodeStep = (t) => t.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h) => h.match(/.{4}/g).map((x) => String.fromCharCode(parseInt(x, 16))).join('')).replace(/\\S\\(.)/g, (_, ch) => String.fromCharCode(ch.charCodeAt(0) + 128));
export function parseIFC(text) {
  if (!/^ISO-10303-21/.test(text.trimStart())) throw new Error('not an ISO-10303-21 (STEP) file');
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(text)?.[1] || 'IFC';
  const data = text.slice(text.indexOf('DATA;') + 5, text.lastIndexOf('ENDSEC;'));
  const E = new Map(); const byType = new Map();
  const re = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*(\([\s\S]*?\))\s*;(?=\s*(?:#|$|ENDSEC))/gi; let m;
  while ((m = re.exec(data))) { const t = m[2].toUpperCase(); const e = { id: +m[1], type: t, a: parseArgs(m[3]) }; E.set(e.id, e); if (!byType.has(t)) byType.set(t, []); byType.get(t).push(e); }
  if (!E.size) throw new Error('no entities in the DATA section');
  return { schema, E, byType };
}

// ───────────────────────── geometry ─────────────────────────
const mmul = (A, B) => { const C = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) C[r * 4 + c] += A[r * 4 + k] * B[k * 4 + c]; return C; };
const apply = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];
const norm3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function build(M) {
  const { E } = M; const get = (r) => (r && r.ref != null ? E.get(r.ref) : null);
  const pt = (r) => get(r)?.a[0] || [0, 0, 0];
  function ax3(r) {
    const a = get(r); if (!a) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const o = pt(a.a[0]); const z = norm3(get(a.a[1])?.a[0] || [0, 0, 1]); let x = norm3(get(a.a[2])?.a[0] || [1, 0, 0]);
    const y = norm3(cross(z, x)); x = cross(y, z);
    return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2] ?? 0, 0, 0, 0, 1];
  }
  const cache = new Map();
  function placement(r) { const p = get(r); if (!p) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; if (cache.has(p.id)) return cache.get(p.id); const rel = p.a[0] ? placement(p.a[0]) : null; const L = ax3(p.a[1]); const Mx = rel ? mmul(rel, L) : L; cache.set(p.id, Mx); return Mx; }
  function profile(r) {
    const p = get(r); if (!p) return null;
    if (p.type === 'IFCRECTANGLEPROFILEDEF') { const pos = get(p.a[2]); const c = pos ? pt(pos.a[0]) : [0, 0]; const w = p.a[3], h = p.a[4]; return [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]]; }
    if (p.type === 'IFCARBITRARYCLOSEDPROFILEDEF') { const pl = get(p.a[2]); if (pl?.type === 'IFCPOLYLINE') { const pts = pl.a[0].map((q) => pt(q)); if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop(); return pts; } }
    return null;
  }
  const tris = []; const owner = [];
  function solid(r, Mx, el) {
    const s = get(r); if (!s) return false;
    if (s.type === 'IFCEXTRUDEDAREASOLID') {
      const prof = profile(s.a[0]); if (!prof) return false; const P = mmul(Mx, ax3(s.a[1])); const dir = get(s.a[2])?.a[0] || [0, 0, 1]; const dep = s.a[3];
      const bot = prof.map((q) => apply(P, [q[0], q[1], 0])), top = prof.map((q) => apply(P, [q[0] + dir[0] * dep, q[1] + dir[1] * dep, dir[2] * dep]));
      const tri = (a, b, c) => { tris.push(a, b, c); owner.push(el); };
      // quads are split into ~1 m cells so the painter's sort stays right for long walls and slabs
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const quad = (a, b, c, e) => { const nu = Math.min(24, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 1.2))), nv = Math.min(24, Math.max(1, Math.ceil(Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]) / 1.2)));
        const at = (u, v) => lerp(lerp(a, b, u), lerp(e, c, u), v);
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p00 = at(i / nu, j / nv), p10 = at((i + 1) / nu, j / nv), p11 = at((i + 1) / nu, (j + 1) / nv), p01 = at(i / nu, (j + 1) / nv); tri(p00, p10, p11); tri(p00, p11, p01); } };
      if (prof.length === 4) { quad(bot[0], bot[3], bot[2], bot[1]); quad(top[0], top[1], top[2], top[3]); }
      else for (let k = 1; k < prof.length - 1; k++) { tri(bot[0], bot[k + 1], bot[k]); tri(top[0], top[k], top[k + 1]); }
      for (let k = 0; k < prof.length; k++) { const k2 = (k + 1) % prof.length; quad(bot[k], bot[k2], top[k2], top[k]); }
      return true;
    }
    if (s.type === 'IFCBOOLEANCLIPPINGRESULT' || s.type === 'IFCBOOLEANRESULT') return solid(s.a[1], Mx, el);
    if (s.type === 'IFCMAPPEDITEM') { const map = get(s.a[0]); const rep = get(map?.a[1]); return (rep?.a[3] || []).some((it) => solid(it, Mx, el)); }
    return false;
  }
  // spatial structure
  const children = new Map(); const add = (p, c) => { if (!children.has(p)) children.set(p, []); children.get(p).push(c); };
  for (const r of M.byType.get('IFCRELAGGREGATES') || []) { const p = r.a[4]?.ref; for (const c of r.a[5] || []) add(p, c.ref); }
  const contained = new Map(); for (const r of M.byType.get('IFCRELCONTAINEDINSPATIALSTRUCTURE') || []) { const st = r.a[5]?.ref; for (const c of r.a[4] || []) contained.set(c.ref, st); }
  const psets = new Map(); for (const r of M.byType.get('IFCRELDEFINESBYPROPERTIES') || []) { const ps = get(r.a[5]); if (!ps) continue; for (const o of r.a[4] || []) { if (!psets.has(o.ref)) psets.set(o.ref, []); psets.get(o.ref).push(ps); } }
  const mats = new Map(); for (const r of M.byType.get('IFCRELASSOCIATESMATERIAL') || []) { const m = get(r.a[5]); const name = m?.type === 'IFCMATERIAL' ? m.a[0] : m?.a?.[0] && typeof m.a[0] === 'string' ? m.a[0] : 'Material set'; for (const o of r.a[4] || []) mats.set(o.ref, name); }
  const storeys = (M.byType.get('IFCBUILDINGSTOREY') || []).map((s) => ({ id: s.id, name: s.a[2] || 'Storey', elev: s.a[9] ?? 0, on: true }));
  storeys.sort((a, b) => a.elev - b.elev);
  const elems = []; let noGeom = 0;
  for (const [t, list] of M.byType) {
    if (!TYPE_LABEL[t] || t === 'IFCSPACE') continue;
    for (const e of list) {
      const pred0 = e.a.find((x) => x && x.enum && !/^(T|F|U)$/.test(x.enum))?.enum; const type = t === 'IFCSLAB' && pred0 === 'ROOF' ? 'Roof' : TYPE_LABEL[t]; const el = elems.length;
      const Mx = placement(e.a[5]); const shape = get(e.a[6]); let ok = false;
      for (const rep of shape?.a[2] || []) { const R = get(rep); if (R && (R.a[1] === 'Body' || !R.a[1])) for (const it of R.a[3] || []) ok = solid(it, Mx, el) || ok; }
      if (!ok) noGeom++;
      const pred = e.a.find((x) => x && x.enum && !/^(T|F|U)$/.test(x.enum))?.enum;
      elems.push({ id: e.id, el, ifc: t, type, name: e.a[2] || type, guid: e.a[0], storey: contained.get(e.id), predefined: pred && pred !== 'NOTDEFINED' ? pred : null, material: mats.get(e.id) || null, psets: (psets.get(e.id) || []).map((ps) => ({ name: ps.a[2], props: (ps.a[4] || ps.a[5] || []).map((q) => get(q)).filter(Boolean).map((q) => ({ name: q.a[0], value: q.type === 'IFCPROPERTYSINGLEVALUE' ? q.a[2] : q.a[3] ?? q.a[2], kind: q.type })) })), on: true, hasGeom: ok });
    }
  }
  if (!tris.length) throw human('This IFC model has no geometry this preview can draw', 'The model uses geometry types the real viewer draws with its bundled IFC engine (web-ifc).', 'no supported representation');
  const pos = new Float32Array(tris.length * 3); tris.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const n = tris.length / 3; const nrm = new Float32Array(n * 3); let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let t = 0; t < n; t++) { const o = t * 9; const u = [pos[o + 3] - pos[o], pos[o + 4] - pos[o + 1], pos[o + 5] - pos[o + 2]], v = [pos[o + 6] - pos[o], pos[o + 7] - pos[o + 1], pos[o + 8] - pos[o + 2]]; const c = norm3(cross(u, v)); nrm[t * 3] = c[0]; nrm[t * 3 + 1] = c[1]; nrm[t * 3 + 2] = c[2]; for (let k = 0; k < 9; k += 3) { x0 = Math.min(x0, pos[o + k]); x1 = Math.max(x1, pos[o + k]); y0 = Math.min(y0, pos[o + k + 1]); y1 = Math.max(y1, pos[o + k + 1]); z0 = Math.min(z0, pos[o + k + 2]); z1 = Math.max(z1, pos[o + k + 2]); } }
  const proj = (M.byType.get('IFCPROJECT') || [])[0]; const site = (M.byType.get('IFCSITE') || [])[0]; const bld = (M.byType.get('IFCBUILDING') || [])[0];
  return { pos, nrm, n, owner, bbox: { x0, y0, z0, x1, y1, z1, dx: x1 - x0, dy: y1 - y0, dz: z1 - z0 }, elems, storeys, noGeom, project: proj?.a[2] || 'Project', site: site?.a[2] || null, address: (typeof site?.a[13] === 'string' ? site.a[13] : typeof site?.a[12] === 'string' ? site.a[12] : null), building: bld?.a[2] || null, schema: M.schema, entities: M.E.size, hiddenTypes: new Set() };
}
const fmtVal = (v) => (v == null ? '—' : typeof v === 'object' && 'typed' in v ? (v.v?.enum === 'T' || v.v === '.T.' ? 'Yes' : v.v?.enum === 'F' ? 'No' : typeof v.v === 'number' ? (+v.v.toFixed(3)).toLocaleString('en-US') + ({ IFCTHERMALTRANSMITTANCEMEASURE: ' W/m²K', IFCPOSITIVELENGTHMEASURE: ' m', IFCLENGTHMEASURE: ' m', IFCAREAMEASURE: ' m²', IFCVOLUMEMEASURE: ' m³', IFCPOSITIVERATIOMEASURE: '' }[v.typed] || '') : String(v.v)) : v?.enum ? (v.enum === 'T' ? 'Yes' : v.enum === 'F' ? 'No' : v.enum) : String(v));

export default {
  id: 'ifc', label: 'IFC model', icon: 'building',
  listLabel: 'Model', listIcon: 'list-tree', listOpen: () => true, listWidth: 'wide', selIcon: 'mouse-pointer-2', measureLabel: 'Measurements',
  modes: [{ id: 'orbit', label: 'Orbit', icon: 'rotate-3d', key: 'o' }, { id: 'pick', label: 'Select', icon: 'mouse-pointer-2', key: 'v', tip: 'Select an element to see its properties' }, { id: 'measure', label: 'Measure', icon: 'ruler', key: 'm' }],
  keys: [{ label: 'Section plane', keys: 's' }, { label: 'Clear selection', keys: 'escape' }],
  steps(d, ctx) {
    return [
      { label: 'Loading IFC engine (bundled · 1.4 MB)', cached: 'IFC engine ready', engine: 'ifc', ms: 700 },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 240, run: async () => { d.text = await d.file.text(); } },
      { label: 'Reading storeys, elements and properties', ms: 360, run: async () => { let M; try { M = parseIFC(d.text); } catch (e) { throw human(`${d.name} couldn’t be opened as a building model`, 'It isn’t an IFC (STEP) file. IFC files start with “ISO-10303-21”.', String(e.message || e)); } d.model = M; } },
      { label: 'Building geometry', ms: 420, run: async () => { d.data = build(d.model); d.model = null; d.text = null; d.meas = []; d.sel = null; } },
    ];
  },
  mount(d, el, ctx) {
    el.classList.add('m3', 'ifc'); const D = d.data; const holder = ctx.h('<div class="m3-holder"></div>'); el.append(holder);
    const hidden = (t) => { const e = D.elems[D.owner[t]]; return !e.on || D.hiddenTypes.has(e.type) || (e.storey && D.storeys.find((s) => s.id === e.storey)?.on === false); };
    const c3 = mount3d(holder, ctx, D, { label: d.name, meas: d.meas, unitF: () => 1, unitLabel: 'm', measDigits: 2, dimDigits: 2, active: () => ctx.isActive(d),
      colorOf: (t) => COLOR[D.elems[D.owner[t]].type] || [190, 190, 195], elemOf: (t) => D.owner[t], hidden,
      onMeasure: () => { ctx.showInsp(); ctx.refresh('insp'); }, onZoom: () => ctx.refresh('zoom'), onPick: (i) => { d.sel = i; ctx.showInsp(); ctx.refresh('insp list'); if (i != null && ctx.isMobile()) ctx.infoSheet(d, null); } });
    c3.cam.yaw = -0.75; c3.cam.pitch = 0.42; c3.st.flat = true;
    el.insertAdjacentHTML('beforeend', sectionHtml(ctx));
    const sec = bindSection(d, el, ctx, c3, (v) => `${ctx.nf(v, 2)} m`);
    const setMode = (m) => { el.dataset.mode = m; c3.setMode(m); };
    setMode(d.mode); d.c3 = c3; d.sec = sec;
    return { ...c3, setMode, onTheme: () => c3.readColors(), onShow: () => c3.onResize(), toggleSection: (on = !d.secOn) => { d.secOn = on; sec.show(on); ctx.refresh('frame'); }, select: (i) => { c3.st.sel = i; d.sel = i; c3.redraw(); ctx.showInsp(); ctx.refresh('insp list'); }, key: (e) => { if (e.key.toLowerCase() === 's') { d.ctl.toggleSection(); return true; } return c3.key(e); } };
  },
  bar(d, ctx) { return `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="ifc-sec" aria-pressed="${!!d.secOn}" data-tip="Section plane" data-tip-kbd="s">${ctx.icon('scissors')}Section</button>`; },
  bindBar(d, fb) { fb.querySelector('#ifc-sec')?.addEventListener('click', () => d.ctl.toggleSection()); },
  list(d, ctx) {
    const D = d.data; const el = ctx.h('<div class="ov-listpanel ifc-tree"></div>');
    const fill = () => {
      const byStorey = (s) => D.elems.filter((e) => e.storey === s.id);
      el.innerHTML = `<div class="ov-listhead"><span class="ov-listhead__title">${ctx.esc(D.project)}</span></div>
        <div class="ifc-path">${ctx.icon('globe', { size: 14 })}${ctx.esc(D.site || 'Site')} › ${ctx.esc(D.building || 'Building')}</div>
        ${D.storeys.map((s) => { const els = byStorey(s); const types = [...new Set(els.map((e) => e.type))]; return `<details class="ifc-st" ${s.open ? 'open' : ''} data-st="${s.id}"><summary class="ov-layer"><span class="ov-layer__toggle ifc-sum"><button class="ifc-eye" type="button" aria-pressed="${s.on}" aria-label="${s.on ? 'Hide' : 'Show'} ${ctx.esc(s.name)}" data-st-eye="${s.id}">${ctx.icon(s.on ? 'eye' : 'eye-off', { size: 16 })}</button><span class="ov-layer__name">${ctx.esc(s.name)}</span><span class="ov-layer__n">${els.length}</span></span><button class="fw-iconbtn fw-iconbtn--sm ov-layer__only" type="button" aria-label="Show only ${ctx.esc(s.name)}" data-tip="Show only this storey" data-st-only="${s.id}">${ctx.icon('crosshair')}</button></summary>
          ${types.map((t) => `<div class="ifc-type">${ctx.esc(plural(t, 2))}</div>${els.filter((e) => e.type === t).map((e) => `<button class="ifc-el" type="button" data-el="${e.el}" aria-current="${d.sel === e.el}"><span class="ov-swatch" style="color:rgb(${(COLOR[e.type] || [190, 190, 195]).join(',')})"></span><span class="ov-layer__name">${ctx.esc(e.name)}</span></button>`).join('')}`).join('')}</details>`; }).join('')}
        <div class="ov-listhead ov-listhead--sub"><span class="ov-listhead__title">Element types</span></div>
        ${[...new Set(D.elems.map((e) => e.type))].map((t) => `<div class="ov-layer"><button class="ov-layer__toggle" type="button" aria-pressed="${!D.hiddenTypes.has(t)}" data-type="${t}"><span class="ov-layer__eye">${ctx.icon('eye', { size: 16 })}${ctx.icon('eye-off', { size: 16 })}</span><span class="ov-swatch" style="color:rgb(${(COLOR[t] || [190, 190, 195]).join(',')})"></span><span class="ov-layer__name">${plural(t, 2)}</span><span class="ov-layer__n">${D.elems.filter((e) => e.type === t).length}</span></button></div>`).join('')}`;
    };
    el.addEventListener('click', (e) => {
      const eye = e.target.closest('[data-st-eye]'), only = e.target.closest('[data-st-only]'), it = e.target.closest('[data-el]'), ty = e.target.closest('[data-type]');
      if (eye) { e.preventDefault(); const s = D.storeys.find((x) => x.id === +eye.dataset.stEye); s.on = !s.on; }
      else if (only) { e.preventDefault(); for (const s of D.storeys) s.on = s.id === +only.dataset.stOnly; }
      else if (it) { d.ctl.select(+it.dataset.el); if (d.mode !== 'pick') ctx.setMode(d, 'pick'); }
      else if (ty) { const t = ty.dataset.type; D.hiddenTypes.has(t) ? D.hiddenTypes.delete(t) : D.hiddenTypes.add(t); }
      else return;
      d.ctl.redraw(); D.storeys.forEach((s) => { s.open = el.querySelector(`[data-st="${s.id}"]`)?.open; }); fill();
    });
    d._fill = fill; fill(); return el;
  },
  updateList(d) { d.data.storeys.forEach((s) => { s.open = d.listEl?.querySelector(`[data-st="${s.id}"]`)?.open; }); if (d.sel != null) { const e = d.data.elems[d.sel]; const s = d.data.storeys.find((x) => x.id === e.storey); if (s) s.open = true; } d._fill?.(); d.listEl?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); },
  inspector(d, ctx) {
    const D = d.data; const counts = {}; for (const e of D.elems) counts[e.type] = (counts[e.type] || 0) + 1;
    const info = ctx.kv([['Project', ctx.esc(D.project)], D.address ? ['Address', ctx.esc(D.address)] : null, ['Schema', D.schema], ['Storeys', D.storeys.map((s) => `${ctx.esc(s.name)} <span class="ov-subline" style="display:inline">+${ctx.nf(s.elev, 2)} m</span>`).join('<br>')], ['Elements', Object.entries(counts).map(([t, n]) => `${n} ${plural(t, n).toLowerCase()}`).join(' · ')], ['Size', `${ctx.nf(D.bbox.dx, 2)} × ${ctx.nf(D.bbox.dy, 2)} × ${ctx.nf(D.bbox.dz, 2)} m`], D.noGeom ? ['Not drawn', `<span class="ov-warnline">${ctx.icon('triangle-alert', { size: 14 })}${D.noGeom} elements without simple geometry</span>`] : null]);
    let selection = null; const e = d.sel != null ? D.elems[d.sel] : null;
    if (e) {
      const st = D.storeys.find((s) => s.id === e.storey);
      selection = `<div class="ov-seltitle"><span class="ov-swatch" style="color:rgb(${(COLOR[e.type] || [190, 190, 195]).join(',')})"></span>${ctx.esc(e.name)}</div>` + ctx.kv([['Type', `${e.type}${e.predefined ? ` · ${e.predefined.toLowerCase().replace(/_/g, ' ')}` : ''}<span class="ov-subline">${e.ifc}</span>`], ['Storey', st ? ctx.esc(st.name) : '—'], ['Material', e.material ? ctx.esc(e.material) : '—'], ['GlobalId', `<span class="ov-mono">${ctx.esc(e.guid || '')}</span>`]])
        + e.psets.map((ps) => `<div class="ifc-pset"><div class="fw-label">${ctx.esc(ps.name)}</div>${ctx.kv(ps.props.map((p) => [p.name, ctx.esc(fmtVal(p.value))]))}</div>`).join('')
        + `<div class="ov-btnrow"><button class="fw-btn fw-btn--sm" type="button" id="ifc-copy">${ctx.icon('copy')}Copy properties</button><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="ifc-iso">${ctx.icon('crosshair')}Show only this</button></div>`;
    }
    let measure = null;
    if (d.meas.length) measure = `<ol class="ov-meas">${d.meas.map((m, i) => `<li class="ov-meas__row ${i === d.meas.length - 1 ? 'is-last' : ''}"><span class="ov-meas__n">${i + 1}</span><span class="ov-meas__main"><span class="ov-meas__val">${ctx.nf(m.dist, 2)} m</span><span class="ov-meas__sub">height difference ${ctx.nf(Math.abs(m.b[2] - m.a[2]), 2)} m</span></span></li>`).join('')}</ol><div class="ov-btnrow"><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="ifc-mclear">Clear</button></div>`;
    return { info, infoLabel: 'Model', selection, selectionLabel: 'Element', measure };
  },
  bindInspector(d, root, ctx) {
    const D = d.data; const e = D.elems[d.sel];
    root.querySelector('#ifc-copy')?.addEventListener('click', (ev) => ctx.copyText(JSON.stringify({ name: e.name, type: e.ifc, material: e.material, globalId: e.guid, ...Object.fromEntries(e.psets.map((ps) => [ps.name, Object.fromEntries(ps.props.map((p) => [p.name, fmtVal(p.value)]))])) }, null, 2), ev.currentTarget));
    root.querySelector('#ifc-iso')?.addEventListener('click', () => { for (const x of D.elems) x.on = x === e; d.ctl.redraw(); ctx.toast(`Showing only ${e.name}`, { type: 'neutral', action: { label: 'Show all', onClick: () => { for (const x of D.elems) x.on = true; d.ctl.redraw(); } } }); });
    root.querySelector('#ifc-mclear')?.addEventListener('click', () => { d.meas.splice(0); d.ctl.redraw(); ctx.refresh('insp'); });
  },
  options(d, ctx) {
    const c = d.c3;
    return [
      { group: 'Camera', items: [['Iso', -43, 24], ['Front', 0, 0], ['Top', 0, 89], ['Side', 90, 0]].map(([n, y, p]) => ({ label: `${n} view`, icon: 'box', onSelect: () => c.view(y, p) })).concat([{ label: 'Fit', icon: 'maximize', kbd: 'f', onSelect: () => c.fit() }]) },
      { group: 'Display', items: [
        { label: 'Section plane', kbd: 's', checked: !!d.secOn, onSelect: () => d.ctl.toggleSection() },
        { label: 'Wireframe', checked: c.st.wire, onSelect: () => c.set('wire', !c.st.wire) },
        { label: 'Axes', checked: c.st.axes, onSelect: () => c.set('axes', !c.st.axes) },
        { label: 'Show all elements', icon: 'eye', onSelect: () => { for (const x of d.data.elems) x.on = true; d.data.storeys.forEach((s) => { s.on = true; }); d.data.hiddenTypes.clear(); c.redraw(); d._fill?.(); } },
        { label: 'Clear selection', kbd: 'escape', disabled: d.sel == null, onSelect: () => { d.sel = null; c.st.sel = null; c.redraw(); ctx.refresh('insp list'); } },
      ] },
      { group: 'Background', items: [['theme', 'Match theme'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => ({ label: l, radio: true, checked: (d.bg || 'theme') === v, onSelect: () => { d.bg = v; d.el.querySelector('.ifc').dataset.bg = v; c.readColors(); } })) },
    ];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const D = d.data;
    return [
      { group: 'Image', items: [{ label: 'Snapshot as PNG', sub: 'This view', icon: 'image', file: `${b}.png`, onSelect: () => d.c3.snapshot(`${b}.png`) }] },
      { group: 'Data', items: [
        { label: 'Element list as CSV', sub: `${D.elems.length} elements with storey and material`, icon: 'sheet', file: `${b}-elements.csv`, onSelect: () => { const q = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : v ?? ''); const rows = [['name', 'type', 'ifc_class', 'storey', 'material', 'global_id'], ...D.elems.map((e) => [e.name, e.type, e.ifc, D.storeys.find((s) => s.id === e.storey)?.name || '', e.material || '', e.guid])]; const name = `${b}-elements.csv`; ctx.download(name, '﻿' + rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv'); ctx.toast(`Saved ${name}`); } },
        { label: 'Properties as JSON', sub: d.sel != null ? `Selected: ${D.elems[d.sel].name}` : 'All elements', icon: 'braces', file: `${b}-properties.json`, onSelect: () => { const pick = d.sel != null ? [D.elems[d.sel]] : D.elems; const name = `${b}-properties.json`; ctx.download(name, JSON.stringify(pick.map((e) => ({ name: e.name, type: e.ifc, storey: D.storeys.find((s) => s.id === e.storey)?.name, material: e.material, globalId: e.guid, psets: Object.fromEntries(e.psets.map((ps) => [ps.name, Object.fromEntries(ps.props.map((p) => [p.name, fmtVal(p.value)]))])) })), null, 2), 'application/json'); ctx.toast(`Saved ${name}`); } },
        { label: 'Measurements as CSV', sub: d.meas.length ? `${d.meas.length} distances` : 'Measure something first', icon: 'ruler', file: `${b}-measurements.csv`, disabled: !d.meas.length, onSelect: () => { const name = `${b}-measurements.csv`; ctx.download(name, 'n,distance_m,height_diff_m\n' + d.meas.map((m, i) => `${i + 1},${m.dist.toFixed(3)},${Math.abs(m.b[2] - m.a[2]).toFixed(3)}`).join('\n'), 'text/csv'); ctx.toast(`Saved ${name}`); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'sec', label: 'Section plane', icon: 'scissors', kbd: 's', run: () => d.ctl.toggleSection(true) },
      { id: 'pick', label: 'Select an element', icon: 'mouse-pointer-2', run: () => ctx.setMode(d, 'pick') },
      ...d.data.storeys.map((s) => ({ id: 'st' + s.id, label: `Show only ${s.name}`, icon: 'layers', searchOnly: true, run: () => { for (const x of d.data.storeys) x.on = x === s; d.ctl.redraw(); d._fill?.(); } })),
      ...d.data.elems.map((e) => ({ id: 'el' + e.el, label: e.name, sub: `${e.type} · select`, icon: 'box', searchOnly: true, run: () => { ctx.setMode(d, 'pick'); d.ctl.select(e.el); } })),
    ];
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Model', icon: 'list-tree' }, { id: 'sec', label: 'Section', icon: 'scissors', pressed: !!d.secOn, run: (doc, ctx) => { doc.ctl.toggleSection(); ctx.refresh('bottom'); } }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'Options', icon: 'sliders-horizontal' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
const sectionHtml = (ctx) => `<div class="m3-sec" role="group" aria-label="Section plane" hidden>
  <div class="fw-seg fw-seg--sm" aria-label="Cut along" id="sec-axis">${['x', 'y', 'z'].map((a) => `<button class="fw-seg__opt" type="button" data-value="${a}" aria-checked="${a === 'z'}">${a === 'z' ? 'Height' : a.toUpperCase()}</button>`).join('')}</div>
  <label class="fw-slider m3-sec__slider"><span class="fw-slider__label">Position</span><output class="fw-slider__value"></output><input type="range" min="0" max="1000" value="550" aria-label="Section position"></label>
  <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-flip aria-pressed="false">${ctx.icon('flip-horizontal')}Flip</button></div>`;
