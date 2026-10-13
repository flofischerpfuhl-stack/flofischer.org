// Fernwork Units, round 2.
// People arrive from a search like "lbs to kg", so the PAIR PAGE is the primary experience: one big input, the answer
// right under it (live, both sides editable), swap, a one-line formula, a compact table of common values and a few
// related pairs. The 14 CATEGORY PAGES (Length, Weight, …) are hubs: today's from/to converter with unit search,
// quick picks, swap, copy, saved pairs & recent and the reference table, plus links to the popular pairs.
//
// URLs:  ?leaf=lbs-to-kg[&v=150]                      registered pair page (kit registry preset)
//        ?leaf=units-pressure&pair=bar-psi[&v=2.2]   any other pair, same page
//        ?leaf=units-weight[&from=kg&to=lb&v=70]      category hub (today's from/to/v params)
//        ?q=70 kg in lb                               old round-1 links → the matching hub
import './uicons.js';
import { mountShell, renderPageHeader, getLeaf, canonicalId, LEAVES, hrefFor, icon, esc, $, $$, h, enhance, copyText, toast,
  openPopover, openSheet, store, isMobile, isCoarse, setCommands } from '../kit/shell.js';
import { CAT, UNITS, COMPOUNDS, FORMATS, unitsOf, parse, resultText, sourceText, formulaFor, format, copyNum, fromBase,
  formatCompound, inchFraction, searchUnits, targetQuery, querySym } from './units-core.js';

// ───────────────────────────── data ─────────────────────────────
const HUBS = { 'units-length': 'length', 'units-area': 'area', 'units-volume': 'volume', 'units-weight': 'mass', 'units-temperature': 'temperature',
  'units-speed': 'speed', 'units-time': 'time', 'units-pressure': 'pressure', 'units-energy': 'energy', 'units-power': 'power', 'units-data': 'data',
  'units-angle': 'angle', 'units-frequency': 'frequency', 'units-fuel': 'fuel' };
const HUB_OF = Object.fromEntries(Object.entries(HUBS).map(([k, v]) => [v, k]));
// today's DEFAULT_UNITS and QUICK_UNITS (unit-converter.js), in engine ids
const DEFAULTS = { length: ['m', 'ft'], area: ['m2', 'ft2'], volume: ['l', 'galus'], mass: ['kg', 'lb'], temperature: ['c', 'f'], speed: ['kmh', 'mph'],
  time: ['min', 'h'], pressure: ['bar', 'psi'], energy: ['kj', 'kcal'], power: ['kw', 'hp'], data: ['MB', 'MiB'], angle: ['deg', 'rad'],
  frequency: ['hz', 'khz'], fuel: ['l100km', 'mpgus'] };
const QUICK = { length: ['m', 'cm', 'ft', 'in'], area: ['m2', 'ft2', 'acre', 'ha'], volume: ['l', 'ml', 'cup', 'galus'], mass: ['kg', 'g', 'lb', 'oz'],
  temperature: ['c', 'f', 'k'], speed: ['kmh', 'mph', 'mps', 'kn'], time: ['s', 'min', 'h', 'd'], pressure: ['bar', 'psi', 'kpa', 'atm'],
  energy: ['j', 'kj', 'kwh', 'kcal'], power: ['w', 'kw', 'hp'], data: ['MB', 'GB', 'MiB', 'GiB'], angle: ['deg', 'rad', 'pct'],
  frequency: ['hz', 'khz', 'mhz', 'ghz'], fuel: ['l100km', 'mpgus', 'mpguk', 'kml'] };
// popular pairs per category (hub links + "Related" on pair pages); registered presets are used where they exist
const POPULAR = {
  length: ['cm>in', 'in>cm', 'ft>m', 'm>ft', 'km>mi', 'mi>km', 'cm>ft+in', 'mm>in'],
  mass: ['lb>kg', 'kg>lb', 'oz>g', 'g>oz', 'st>kg', 'kg>st'],
  temperature: ['c>f', 'f>c', 'c>k', 'k>c'],
  volume: ['ml>flozus', 'flozus>ml', 'l>galus', 'galus>l', 'cup>ml', 'tbsp>ml'],
  area: ['ft2>m2', 'm2>ft2', 'acre>ha', 'ha>acre', 'acre>ft2'],
  speed: ['mph>kmh', 'kmh>mph', 'kn>kmh', 'mps>kmh'],
  time: ['h>min', 'min>s', 'd>h', 'wk>d', 's>h+min+s'],
  pressure: ['bar>psi', 'psi>bar', 'kpa>psi', 'atm>bar', 'hpa>inhg'],
  energy: ['kcal>kj', 'kj>kcal', 'kwh>mj', 'btu>kj', 'j>cal'],
  power: ['kw>hp', 'hp>kw', 'ps>kw', 'kw>ps', 'w>btuh'],
  data: ['MB>GB', 'GB>MB', 'GB>GiB', 'Mbit>MB', 'kB>MB', 'TB>TiB'],
  angle: ['deg>rad', 'rad>deg', 'pct>deg', 'deg>pct', 'ratio>pct'],
  frequency: ['hz>rpm', 'rpm>hz', 'khz>hz', 'ghz>mhz', 'rpm>rads'],
  fuel: ['l100km>mpgus', 'mpgus>l100km', 'l100km>mpguk', 'kml>l100km', 'l100km>kml'],
};
// common values for the pair table, by the FROM unit
const COMMON = {
  lb: [1, 2, 5, 10, 20, 50, 100, 150, 200, 250], kg: [1, 2, 5, 10, 20, 50, 60, 70, 80, 100], oz: [1, 2, 4, 8, 12, 16, 24, 32, 48, 64],
  g: [1, 5, 10, 25, 50, 100, 200, 250, 500, 1000], st: [1, 5, 8, 9, 10, 11, 12, 13, 14, 15],
  cm: [1, 2, 5, 10, 15, 20, 30, 50, 100, 180], in: [1, 2, 3, 4, 5, 6, 8, 10, 12, 24], ft: [1, 2, 3, 5, 6, 10, 20, 50, 100, 1000],
  m: [1, 2, 3, 5, 10, 20, 50, 100, 500, 1000], km: [1, 2, 5, 10, 21.0975, 42.195, 50, 100, 200, 500], mi: [1, 2, 3, 5, 10, 13.1, 26.2, 50, 100, 500],
  mm: [1, 2, 3, 5, 6, 8, 10, 12, 20, 25],
  c: [-40, -20, -10, 0, 10, 20, 25, 30, 37, 100], f: [-40, 0, 32, 50, 68, 77, 86, 98.6, 212, 350], k: [0, 100, 200, 273.15, 293.15, 300, 373.15, 500, 1000, 5000],
  mph: [10, 20, 25, 30, 40, 50, 60, 70, 80, 100], kmh: [10, 20, 30, 50, 60, 80, 100, 120, 130, 200], kn: [1, 5, 10, 15, 20, 25, 30, 40, 50, 100],
  mps: [1, 2, 5, 10, 20, 30, 50, 100, 200, 343],
  ml: [1, 5, 10, 15, 30, 50, 100, 250, 500, 1000], flozus: [1, 2, 4, 6, 8, 12, 16, 20, 32, 64], flozuk: [1, 2, 4, 5, 10, 15, 20, 30, 40, 50],
  l: [1, 2, 4, 5, 10, 20, 50, 60, 100, 200], galus: [1, 2, 3, 5, 10, 15, 20, 50, 55, 100], galuk: [1, 2, 3, 5, 10, 15, 20, 50, 55, 100],
  cup: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8], tbsp: [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 16],
  ft2: [1, 10, 50, 100, 200, 500, 1000, 1500, 2000, 5000], m2: [1, 5, 10, 20, 50, 80, 100, 150, 200, 1000],
  acre: [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 640], ha: [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 1000],
  MB: [1, 10, 100, 250, 500, 700, 1000, 2000, 5000, 10000], GB: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512], TB: [0.5, 1, 2, 4, 8, 10, 12, 16, 20, 24],
  Mbit: [1, 10, 16, 50, 100, 250, 500, 1000], kB: [1, 10, 100, 256, 500, 1000, 2048, 5000],
  l100km: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15], mpgus: [10, 15, 20, 25, 30, 35, 40, 50, 60, 100], mpguk: [10, 20, 30, 35, 40, 45, 50, 60, 70, 100],
  kml: [5, 8, 10, 12, 15, 18, 20, 25, 30, 40],
  bar: [0.5, 1, 1.5, 2, 2.2, 2.5, 3, 5, 10, 200], psi: [1, 10, 15, 20, 30, 32, 35, 40, 100, 3000], kpa: [1, 10, 50, 100, 200, 220, 250, 300, 500, 1000],
  atm: [0.5, 1, 1.5, 2, 3, 5, 10, 20, 50, 100], hpa: [950, 980, 1000, 1013.25, 1020, 1030, 1040],
  kcal: [1, 50, 100, 200, 250, 500, 1000, 1500, 2000, 2500], kj: [1, 100, 250, 500, 1000, 2000, 4184, 5000, 8400, 10000],
  kwh: [1, 2, 5, 10, 20, 50, 100, 500, 1000, 3500], btu: [1, 100, 1000, 5000, 10000, 12000, 18000, 24000, 36000, 100000], j: [1, 10, 100, 1000, 4184, 10000],
  kw: [1, 5, 10, 50, 75, 100, 150, 200, 300, 500], hp: [1, 5, 10, 50, 100, 150, 200, 300, 400, 500], ps: [1, 5, 10, 50, 100, 150, 200, 300, 400, 500],
  w: [1, 10, 100, 500, 1000, 1500, 2000, 3000, 5000, 10000],
  deg: [1, 5, 10, 15, 30, 45, 60, 90, 180, 360], rad: [0.1, 0.5, 1, 1.5, 2, 3, 3.14159, 4, 5, 6.28319], pct: [1, 2, 5, 8, 10, 12, 15, 20, 50, 100],
  ratio: [2, 5, 10, 12, 20, 50, 100, 200, 500, 1000],
  hz: [1, 10, 50, 60, 100, 440, 1000, 2000, 10000, 20000], rpm: [60, 100, 500, 800, 1000, 1500, 3000, 6000, 7200, 10000],
  khz: [1, 2, 5, 10, 20, 44.1, 48, 96, 100, 500], ghz: [1, 1.5, 2, 2.4, 3, 3.5, 4, 5, 5.8, 6],
  h: [0.5, 1, 1.5, 2, 3, 4, 8, 12, 24, 48], min: [1, 5, 10, 15, 30, 45, 60, 90, 120, 180], s: [1, 10, 30, 60, 90, 100, 300, 600, 3600, 86400],
  d: [1, 2, 3, 5, 7, 10, 14, 30, 90, 365], wk: [1, 2, 3, 4, 6, 8, 12, 26, 52, 104],
};
const COMMON_FALLBACK = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const START = { c: '20', f: '68', k: '293.15', r: '527.67', l100km: '7', mpgus: '30', mpguk: '35', kml: '15' };
// US/UK variants: a small toggle on pair pages ("liters to gallons" serves both)
const VARIANT = { galus: 'galuk', galuk: 'galus', flozus: 'flozuk', flozuk: 'flozus', mpgus: 'mpguk', mpguk: 'mpgus', ptus: 'ptuk', ptuk: 'ptus', qtus: 'qtuk', qtuk: 'qtus' };
const SHORT = { deg: 'degrees', rad: 'radians', pct: '% slope', permil: '‰ slope', ratio: 'slope 1:n', s: 'seconds', min: 'minutes', h: 'hours',
  d: 'days', wk: 'weeks', mo: 'months', yr: 'years', c: '°C', f: '°F', 'ft+in': 'feet & inches', 'st+lb': 'stone & pounds', 'h+min+s': 'h:min:s' };

// registered pair presets (kit registry, kind 'preset' with `pair`) → engine unit keys
const PRESETS = {};
const PRESET_BY_KEY = {};
for (const l of LEAVES) {
  if (l.kind !== 'preset' || !l.pair) continue;
  const r = parse(`1 ${l.pair[0]} in ${l.pair[1]}`, {});
  if (!r.ok) { console.warn('Units: cannot resolve preset', l.id, l.pair); continue; }
  PRESETS[l.id] = { from: r.terms[0].u.id, to: r.target.key, hub: l.parent, cat: r.cat };
  PRESET_BY_KEY[`${r.terms[0].u.id}>${r.target.key}`] = l.id;
}

// ───────────────────────────── helpers ─────────────────────────────
const keyUnits = (key) => String(key || '').split('+').map((id) => UNITS[id]).filter(Boolean);
const validKey = (key, cat) => { const u = keyUnits(key); return u.length > 0 && u.length === String(key).split('+').length && u.every((x) => x.cat === cat); };
const symOf = (key) => keyUnits(key).map((u) => u.sym).join(' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nameOf = (key) => { const u = keyUnits(key); return u.length > 1 ? u.map((x) => x.plural).join(' + ') : u[0]?.plural || ''; };
const shortOf = (key) => SHORT[key] || symOf(key);
const usOf = (k) => (VARIANT[k] && /uk$/.test(k) ? VARIANT[k] : k);
/** registered preset for a pair; UK variants map to the US preset ("liters to gallons" + UK toggle) */
const findPreset = (a, b) => PRESET_BY_KEY[`${a}>${b}`] || PRESET_BY_KEY[`${usOf(a)}>${usOf(b)}`];
const pairTitle = (a, b) => { const id = findPreset(a, b); return id ? getLeaf(id).name : `${shortOf(a)} to ${shortOf(b)}`; };
const catLabel = (cat) => CAT[cat].label;
const symAfter = (u) => (u.id === 'ratio' ? '' : /^[°′″]$/.test(u.sym) ? u.sym : ' ' + u.sym);
const opts = () => ({ prec: S.prec, fmt: S.fmt });
/** display number: grouped thousands, no spaces inside decimals (they read as separate numbers) */
const fmtN = (x, o = {}) => format(x, { groupDecimals: false, ...o });
const SUPMAP = { '⁻': '−', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const numHtml = (s) => esc(s).replace(/× 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (m, e) => `×&#8202;10<sup>${[...e].map((c) => SUPMAP[c]).join('')}</sup>`);
/** write HTML only when it changed (keeps focus and in-flight clicks stable) */
function put(el, html) { if (!el || el._html === html) return false; el._html = html; el.innerHTML = html; return true; }
/** a number as it should appear inside an editable field (re-parseable, no thin spaces in decimals) */
function fieldNum(x) {
  if (!Number.isFinite(x)) return '';
  const a = Math.abs(x);
  if (a && (a >= 1e15 || a < 1e-6)) return copyNum(x, opts());
  return fmtN(x, opts());
}
function displayOf(r) {
  const units = r.target.units;
  if (units.length > 1) return formatCompound(r.base, units, opts()).text;
  if (units[0].id === 'ratio') return '1:' + fieldNum(r.value);
  return fieldNum(r.value);
}
function pairHref(a, b, v) {
  const id = findPreset(a, b);
  if (id) return hrefFor(id, { ...(a !== PRESETS[id].from ? { from: a } : {}), ...(b !== PRESETS[id].to ? { to: b } : {}), ...(v ? { v } : {}) });
  const cat = keyUnits(a)[0].cat;
  return hrefFor(HUB_OF[cat], { pair: `${a}-${b}`, ...(v ? { v } : {}) });
}

// ───────────────────────────── state ─────────────────────────────
const S = {
  page: null,            // { kind: 'pair'|'hub', leafId, hubId, cat, presetId? }
  from: 'kg', to: 'lb',  // unit keys ('ft+in' = compound)
  text: '1', src: 'from', // what the user typed, and on which side
  r: null, over: {},
  prec: store.get('units:prec', 'auto'), fmt: store.get('units:numfmt', 'en'), // decimal point unless the user chose otherwise
  saved: store.get('units:saved', []), recent: store.get('units:recent2', []), remembered: store.get('units:last', {}),
  typedAt: 0,
};

function stateFromLocation() {
  const p = new URLSearchParams(location.search);
  const id = canonicalId(p.get('leaf') || '');
  const leaf = id && getLeaf(id);
  const q = p.get('q');
  if (leaf && leaf.kind === 'preset' && PRESETS[leaf.id]) {
    const pr = PRESETS[leaf.id];
    const pick = (x, d) => (x && (x === d || VARIANT[d] === x) ? x : d);
    return { page: { kind: 'pair', leafId: leaf.id, hubId: pr.hub, cat: pr.cat, presetId: leaf.id }, from: pick(p.get('from'), pr.from), to: pick(p.get('to'), pr.to), v: p.get('v'), tv: p.get('tv') };
  }
  let hubId = leaf && HUBS[leaf.id] ? leaf.id : null;
  // today's links: /tools/unit-converter#weight (#slope = angle)
  if (!hubId && location.hash) { const hsh = location.hash === '#slope' ? '#angle' : location.hash; hubId = Object.keys(HUBS).find((id) => getLeaf(id).hash === hsh) || null; }
  // old round-1 links (?q=70 kg in lb) and unknown leaves land on the matching hub
  let parsed = null;
  if (q) { const r = parse(q, { fmt: S.fmt, cat: hubId ? HUBS[hubId] : undefined }); if (r.ok && HUB_OF[r.cat] && (!hubId || HUBS[hubId] === r.cat)) parsed = r; }
  if (!hubId) hubId = parsed ? HUB_OF[parsed.cat] : 'units-length';
  const cat = HUBS[hubId];
  const pair = p.get('pair');
  if (pair) {
    const [a, b] = pair.split('-');
    if (validKey(a, cat) && validKey(b, cat)) {
      const presetId = findPreset(a, b);
      return { page: { kind: 'pair', leafId: presetId || hubId, hubId, cat, presetId }, from: a, to: b, v: p.get('v'), tv: p.get('tv') };
    }
  }
  if (parsed) {
    const from = parsed.terms.length > 1 ? parsed.terms.map((t) => t.u.id).join('+') : parsed.terms[0].u.id;
    return { page: { kind: 'hub', leafId: hubId, hubId, cat }, from, to: parsed.target.key, v: sourceText(parsed, S.fmt).replace(/ [^\d\s.,−-].*$/, '') };
  }
  const mem = S.remembered[cat] || {};
  const from = validKey(p.get('from'), cat) ? p.get('from') : validKey(mem.from, cat) ? mem.from : DEFAULTS[cat][0];
  const to = validKey(p.get('to'), cat) ? p.get('to') : validKey(mem.to, cat) ? mem.to : DEFAULTS[cat][1];
  return { page: { kind: 'hub', leafId: hubId, hubId, cat }, from, to, v: p.get('v') ?? (p.get('from') || p.get('tv') ? null : mem.v), tv: p.get('tv') };
}

// ───────────────────────────── shell ─────────────────────────────
const initial = stateFromLocation();
mountShell({
  leaf: initial.page.leafId, archetype: 'instant', searchInput: '#u-from',
  recent: initial.page.kind === 'pair' ? undefined : { note: catLabel(initial.page.cat) },
  onPasteText: (t) => { const f = $('#u-from'); if (!f) return false; S.src = 'from'; S.text = t.trim(); f.value = S.text; f.focus(); update({ commit: true }); return true; },
  shortcuts: [{ label: 'Copy the result', keys: 'enter' }, { label: 'Swap units', keys: 'alt+s' }, { label: 'Save this pair', keys: 'alt+d' }],
  commands: [],
});

// ───────────────────────────── page render ─────────────────────────────
function go(next, { push = false, keepFocus = false } = {}) {
  const same = S.page && S.page.kind === next.page.kind && S.page.leafId === next.page.leafId && S.page.cat === next.page.cat;
  S.page = next.page; S.from = next.from; S.to = next.to; S.over = {};
  // ?tv= is a value typed in the To field (keeps "80 kg" exact instead of a rounded "176.37 lb")
  if (next.tv) { S.src = 'to'; S.text = String(next.tv); }
  else { S.src = 'from'; S.text = next.v != null && next.v !== '' ? String(next.v) : START[S.from] || '1'; }
  if (!same || !$('#u-from')) renderPage(); else renderHeader();
  $('#u-from').value = S.src === 'from' ? S.text : '';
  $('#u-to').value = S.src === 'to' ? S.text : '';
  update();
  syncUrl({ push });
  if (!keepFocus && !isCoarse()) { const f = $(S.src === 'to' ? '#u-to' : '#u-from'); f.focus({ preventScroll: true }); f.select(); }
}

function renderHeader() {
  const pg = S.page; const leaf = getLeaf(pg.leafId);
  let title, lede;
  if (pg.kind === 'pair') {
    title = pg.presetId ? leaf.name : pairTitle(S.from, S.to);
    lede = `${cap(nameOf(S.from))} to ${nameOf(S.to)}`;
  } else { title = leaf.name; lede = leaf.desc; }
  const key = `${pg.kind}|${title}|${lede}`;
  if ($('#page-header')._key !== key) {
    $('#page-header')._key = key;
    renderPageHeader($('#page-header'), { leaf, title, lede, chips: pg.kind === 'hub' });
  }
  document.title = `${title} · Fernwork`;
}

function fieldHtml(side) {
  return `<div class="u-field" data-side="${side}">
    <div class="u-field__head"><label class="u-field__label" for="u-${side}" id="u-${side}-label"></label><span class="u-field__badge" id="u-${side}-badge"></span></div>
    <div class="u-field__box">
      <input class="u-field__input" id="u-${side}" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
      ${side === 'from' ? '<button class="u-pm" type="button" id="u-pm" aria-label="Change sign" hidden>±</button>' : ''}
      <button class="u-unit" type="button" id="u-${side}-unit" aria-haspopup="dialog"></button>
      ${side === 'to' ? `<button class="u-copy" type="button" id="u-copy" aria-label="Copy result" data-tip="Copy" data-tip-kbd="enter">${icon('copy')}<span class="u-copy__text">Copy</span></button>` : ''}
    </div>
    <div class="u-field__sub" id="u-${side}-sub"></div>
    <div class="u-field__quick" id="u-${side}-quick"></div>
  </div>`;
}

function renderPage() {
  renderHeader();
  const pg = S.page; const pair = pg.kind === 'pair';
  const conv = `<section class="u-conv fw-card ${pair ? 'u-conv--pair' : 'u-conv--hub'}" aria-label="Converter">
      <div class="u-fields">
        ${fieldHtml('from')}
        <button class="u-swap" type="button" id="u-swap" aria-label="Swap units" data-tip="Swap" data-tip-kbd="alt+s">${icon('arrow-left-right', { size: 18 })}</button>
        ${fieldHtml('to')}
      </div>
      <div class="u-note" id="u-note" aria-live="polite"></div>
      <div class="u-foot">
        <p class="u-formula" id="u-formula"></p>
        <div class="u-actions">
          <button class="fw-iconbtn" type="button" id="u-star" aria-pressed="false" aria-label="Save this pair" data-tip="Save pair" data-tip-kbd="alt+d">${icon('star')}</button>
          <button class="fw-iconbtn" type="button" id="u-saved" aria-label="Saved pairs and recent conversions" data-tip="Saved & recent" aria-haspopup="dialog">${icon('history')}</button>
          <button class="fw-btn fw-btn--ghost fw-btn--sm u-more" type="button" id="u-more" aria-haspopup="dialog">${icon('sliders-horizontal')}<span>More options</span></button>
        </div>
      </div>
    </section>`;
  $('#app').innerHTML = pair
    ? `<div class="u-pairgrid">
        <div class="u-pairgrid__conv">${conv}</div>
        <section class="u-common" aria-labelledby="u-common-h"><h2 class="u-h2" id="u-common-h">Common values</h2><div class="fw-table-wrap"><table class="fw-table u-ctable" id="u-ctable"></table></div></section>
        <nav class="u-related" aria-labelledby="u-related-h"><h2 class="u-h2" id="u-related-h">Related</h2><div class="fw-chips" id="u-related"></div></nav>
      </div>`
    : `${conv}
      <nav class="u-popular" aria-labelledby="u-pop-h"><h2 class="u-h2" id="u-pop-h">Popular conversions</h2><div class="fw-chips" id="u-popular"></div></nav>
      <section class="u-ref" aria-labelledby="u-ref-h"><h2 class="u-h2" id="u-ref-h"></h2><div class="fw-table-wrap"><table class="fw-table u-rtable" id="u-rtable"></table></div></section>`;
  enhance($('#app'));
  wire();
}

// ───────────────────────────── compute ─────────────────────────────
/** text typed on one side → parse result converting into the other side's unit(s) */
function compute(text, fromKey, toKey) {
  const t = String(text || '').trim();
  if (!t) return null;
  const fu = keyUnits(fromKey), tu = keyUnits(toKey);
  const ctx = { fmt: S.fmt, over: S.over, cat: S.page.cat, from: fu[0].id };
  const txt = fu.length === 1 && fu[0].id === 'ratio' ? t.replace(/^1\s*:\s*/, '') : t;
  let r = parse(txt, ctx);
  if (r.ok && r.bare) { r = parse(`${txt} ${querySym(fu[0])} in ${targetQuery(tu)}`, ctx); r.bare = true; return r; }
  if (r.ok && r.cat !== S.page.cat) return { ...r, ok: false, other: true };
  if (r.ok) { // the user typed units ("5 ft 3 in", "70 kg in lb")
    if (!r.target.explicit) { const r2 = parse(`${txt} in ${targetQuery(tu)}`, ctx); if (r2.ok) { r2.typed = true; return r2; } }
    r.typed = true;
  }
  return r;
}
const typedKey = (r) => (r.terms.length > 1 ? r.terms.map((t) => t.u.id).join('+') : r.terms[0].u.id);

// ───────────────────────────── update ─────────────────────────────
let recentT = 0, errT = 0;
function update({ commit = false } = {}) {
  const pg = S.page; const pair = pg.kind === 'pair';
  const srcKey = S.src === 'from' ? S.from : S.to, dstKey = S.src === 'from' ? S.to : S.from;
  let r = compute(S.text, srcKey, dstKey);
  // hubs: typed units become the side's unit ("5 ft 3 in" → the pill shows ft + in)
  if (r?.ok && r.typed && !pair) {
    const tk = typedKey(r);
    if (S.src === 'from') { S.from = tk; if (r.target.explicit) S.to = r.target.key; } else { S.to = tk; if (r.target.explicit) S.from = r.target.key; }
  }
  S.r = r;
  const other = $(S.src === 'from' ? '#u-to' : '#u-from');
  const srcEl = $(S.src === 'from' ? '#u-from' : '#u-to');
  other.value = r?.ok ? displayOf(r) : '';
  // errors stay quiet while typing (no red flash per keystroke)
  const typing = Date.now() - S.typedAt < 700 && !commit;
  if (r && !r.ok && typing) { clearTimeout(errT); errT = setTimeout(() => update(), 720); }
  srcEl.setAttribute('aria-invalid', r && !r.ok && !typing && !r.other && r.error?.code !== 'empty' ? 'true' : 'false');
  other.removeAttribute('aria-invalid');

  // labels, pills, badges
  for (const side of ['from', 'to']) {
    const key = side === 'from' ? S.from : S.to;
    $(`#u-${side}-label`).textContent = cap(nameOf(key));
    put($(`#u-${side}-unit`), `<span class="u-unit__sym">${esc(symOf(key))}</span>${icon('chevron-down', { size: 14 })}`);
    $(`#u-${side}-unit`).setAttribute('aria-label', `${side === 'from' ? 'From' : 'To'} unit: ${nameOf(key)}. Change`);
    const inp = $(`#u-${side}`);
    const units = keyUnits(key);
    inp.inputMode = units.length > 1 || ['time', 'angle'].includes(pg.cat) ? 'text' : 'decimal';
    inp.placeholder = units.length > 1 ? `e.g. ${units.map((u, i) => `${[5, 3, 0][i] ?? 0} ${u.sym}`).slice(0, 2).join(' ')}` : '0';
    inp.setAttribute('aria-label', `Value in ${nameOf(key)}`);
  }
  const res = r?.ok ? resultText(r, opts()) : null;
  put($('#u-to-badge'), res && !res.exact ? `<span class="u-approx" data-tip="Rounded to ${S.prec === 'auto' ? 'a sensible length' : S.prec + ' digits'}. More options → Digits">≈ rounded</span>` : '');
  put($('#u-from-badge'), '');
  $('#u-copy').disabled = !r?.ok;
  $('#u-pm').hidden = !(pg.cat === 'temperature' && isCoarse());
  $('#u-swap').classList.toggle('is-stack', pair);

  renderSub(r); renderNote(r, typing); renderFormula(); renderStar();
  if (pair) { renderCommon(); renderRelated(); } else { renderQuick(); renderPopular(); renderRef(r); }
  if (r?.ok) {
    remember();
    clearTimeout(recentT); recentT = setTimeout(() => recordRecent(), commit ? 0 : 1200);
  }
  syncUrl();
}

function renderSub(r) {
  // inches: nearest 1/16 and feet + inches (heights)
  const toKey = S.to;
  let sub = '';
  if (r?.ok && toKey === 'in' && S.src === 'from') {
    const x = r.value; const fr = inchFraction(x);
    sub = `≈ ${esc(fr.text)} in${Math.abs(x) >= 12 ? ` · ${esc(formatCompound(r.base, [UNITS.ft, UNITS.in], opts()).text)}` : ''}`;
  }
  // US / UK variants on pair pages
  const variant = (side) => {
    const key = side === 'from' ? S.from : S.to;
    if (S.page.kind !== 'pair' || !VARIANT[key]) return '';
    const us = /us$/.test(key) ? key : VARIANT[key], uk = VARIANT[us];
    return `<div class="fw-seg fw-seg--sm u-variant" role="radiogroup" aria-label="US or UK ${esc(UNITS[us].name.replace(/^US /, ''))}" data-variant="${side}">
      <button class="fw-seg__opt" type="button" role="radio" aria-checked="${key === us}" data-value="${us}">US</button>
      <button class="fw-seg__opt" type="button" role="radio" aria-checked="${key === uk}" data-value="${uk}">UK</button></div>`;
  };
  if (put($('#u-to-sub'), (variant('to') + (sub ? `<span class="u-frac">${sub}</span>` : '')))) enhance($('#u-to-sub'));
  if (put($('#u-from-sub'), variant('from'))) enhance($('#u-from-sub'));
}

function renderNote(r, typing) {
  const el = $('#u-note'); let html = '';
  const item = (cls, ic, body) => `<div class="u-note__item ${cls}">${icon(ic, { size: 16 })}<span>${body}</span></div>`;
  if (r && r.other) {
    const hub = HUB_OF[r.cat];
    html = hub ? item('', 'info', `“${esc(sourceText(r, S.fmt))}” is ${esc(catLabel(r.cat).toLowerCase())}. <a href="${hrefFor(hub, { q: S.text })}">Convert it in ${esc(catLabel(r.cat))}</a>`)
      : item('', 'info', `“${esc(S.text)}” isn’t ${esc(catLabel(S.page.cat).toLowerCase())}.`);
  } else if (r && !r.ok && !typing && r.error?.code !== 'empty') {
    const sug = (r.error.suggest || []).filter((id) => UNITS[id]);
    html = item('is-error', 'circle-alert', `${esc(r.error.msg || 'That doesn’t look like a number.')}${sug.length ? ` Did you mean ${sug.map((id) => `<button class="u-link" type="button" data-sugg="${esc(UNITS[id].sym)}" data-bad="${esc(r.error.token || '')}">${esc(UNITS[id].sym)}</button>`).join(', ')}?` : ''}`);
  } else if (r?.ok) {
    if (r.typed && S.page.kind === 'pair') html += item('', 'info', `Read as ${esc(sourceText(r, S.fmt))}`);
    for (const a of (r.typed ? r.amb : []).slice(0, 1)) { // only for units the user typed (a picked unit is never ambiguous)
      const alts = a.options.filter((x) => x !== a.chosen).slice(0, 2);
      html += item('', 'info', `“${esc(a.raw)}” read as ${esc(UNITS[a.chosen].name)} · ${alts.map((x) => `<button class="u-link" type="button" data-amb="${esc(a.raw)}" data-pick="${x}">${esc(UNITS[x].name)}?</button>`).join(' ')}`);
    }
    for (const n of r.numAmb.slice(0, 1)) {
      html += item('', 'info', `Read ${esc(n.raw)} as ${esc(fieldNum(n.read))} · <button class="u-link" type="button" data-num="${esc(n.raw)}" data-alt="${esc(copyNum(n.alt, { prec: 'max', fmt: 'plain' }))}">Meant ${esc(fmtN(n.alt, { fmt: S.fmt, prec: 'max' }))}?</button>`);
    }
  }
  put(el, html);
}

function renderFormula() {
  const r1 = parse(`1 ${querySym(keyUnits(S.from)[0])} in ${targetQuery(keyUnits(S.to))}`, { fmt: S.fmt });
  const f = r1.ok ? formulaFor(r1, { fmt: S.fmt }) : null;
  let txt = f?.main || '';
  // linear pairs: "1 lb = 0.45359237 kg"; the formula is added only when it says something new (÷ forms)
  if (r1.ok && keyUnits(S.from).length === 1 && keyUnits(S.to).length === 1 && r1.terms[0].u.f != null && r1.target.units[0].f != null && S.from !== S.to) {
    const one = `1 ${r1.terms[0].u.sym} = ${fmtN(r1.value, { fmt: S.fmt, prec: 10 })} ${r1.target.units[0].sym}`;
    txt = txt.includes('÷') ? [one, txt] : [one];
  } else txt = txt ? [txt] : [];
  put($('#u-formula'), txt.map((t) => `<span class="u-formula__part">${numHtml(t)}</span>`).join('<span class="u-formula__sep" aria-hidden="true"> · </span>'));
}

const pairKey = () => `${S.page.cat}:${S.from}:${S.to}`;
function renderStar() {
  const on = S.saved.some((x) => `${x.cat}:${x.from}:${x.to}` === pairKey());
  const b = $('#u-star'); b.setAttribute('aria-pressed', String(on)); b.dataset.tip = on ? 'Saved · click to remove' : 'Save pair';
  b.classList.toggle('is-on', on);
}

// pair page: common values + related
function renderCommon() {
  const vals = COMMON[S.from] || COMMON_FALLBACK;
  const cur = S.r?.ok && S.src === 'from' ? S.r.terms.reduce((s, t) => s + t.v, 0) : null;
  const rows = vals.map((v) => {
    const r = parse(`${v} ${querySym(keyUnits(S.from)[0])} in ${targetQuery(keyUnits(S.to))}`, { fmt: 'en' });
    if (!r.ok) return '';
    const out = r.target.units.length > 1 ? formatCompound(r.base, r.target.units, opts()).text : (r.target.units[0].id === 'ratio' ? '1:' : '') + fmtN(r.value, opts());
    const vt = fmtN(v, { fmt: S.fmt, prec: 'max' });
    return `<tr class="${cur != null && Math.abs(cur - v) < 1e-12 ? 'is-current' : ''}"><td><button class="u-cval" type="button" data-v="${esc(copyNum(v, { prec: 'max', fmt: S.fmt }))}" aria-label="Use ${esc(vt)} ${esc(symOf(S.from))}">${numHtml(vt)}</button></td><td class="is-num">${numHtml(out)}</td></tr>`;
  }).join('');
  put($('#u-ctable'), `<thead><tr><th scope="col">${esc(symOf(S.from))}</th><th scope="col" class="is-num">${esc(symOf(S.to))}</th></tr></thead><tbody>${rows}</tbody>`);
}
function renderRelated() {
  const cat = S.page.cat; const cur = `${S.from}>${S.to}`; const rev = `${S.to}>${S.from}`;
  // reverse first, then pairs that share a unit with this one, then the rest of the category's popular pairs
  const shares = (k) => k.split('>').some((u) => u === S.from || u === S.to);
  const rest = POPULAR[cat].filter((k) => k !== cur && k !== rev);
  const list = [rev, ...rest.filter(shares), ...rest.filter((k) => !shares(k))].slice(0, 5);
  const v = S.r?.ok ? (S.src === 'from' ? $('#u-to').value : $('#u-from').value) : '';
  const chips = list.map((k) => { const [a, b] = k.split('>'); return `<a class="fw-chip" href="${esc(pairHref(a, b, k === rev ? v : ''))}" data-pair="${esc(k)}">${esc(pairTitle(a, b))}</a>`; });
  chips.push(`<a class="fw-chip u-hub-link" href="${esc(hrefFor(S.page.hubId, { from: S.from, to: S.to, ...valueParams() }))}">${icon(CAT[cat].icon, { size: 14 })}All ${esc(catLabel(cat).toLowerCase())} units${icon('arrow-right', { size: 14 })}</a>`);
  put($('#u-related'), chips.join(''));
}

// hub: quick picks, popular pairs, reference table
function renderQuick() {
  for (const side of ['from', 'to']) {
    const key = side === 'from' ? S.from : S.to;
    const html = `<div class="u-quick" role="group" aria-label="${side === 'from' ? 'From' : 'To'}: quick units">${(QUICK[S.page.cat] || []).map((id) => `<button class="fw-chip u-qp" type="button" data-qp="${side}" data-unit="${id}" aria-pressed="${key === id}">${esc(UNITS[id].sym)}</button>`).join('')}</div>`;
    put($(`#u-${side}-quick`), html);
  }
}
function renderPopular() {
  put($('#u-popular'), POPULAR[S.page.cat].map((k) => { const [a, b] = k.split('>'); return `<a class="fw-chip" href="${esc(pairHref(a, b))}">${esc(pairTitle(a, b))}</a>`; }).join(''));
}
function refRows(cat) {
  const out = [];
  for (const id of unitsOf(cat)) out.push(id);
  for (const c of COMPOUNDS[cat] || []) out.push(c.join('+'));
  return out;
}
function renderRef(r) {
  const cat = S.page.cat;
  const base = r?.ok ? r : parse(`${START[S.from] || 1} ${querySym(keyUnits(S.from)[0])}`, { fmt: 'en' });
  if (!base.ok) return;
  put($('#u-ref-h'), `${numHtml(sourceText(base, S.fmt))} equals`); // today's "1 Kilogram equals:"
  const rows = refRows(cat).map((key) => {
    const units = keyUnits(key);
    let v;
    if (units.length > 1) v = formatCompound(base.base, units, opts()).text;
    else { const x = fromBase(units[0], base.base); v = (units[0].id === 'ratio' ? '1:' : '') + fmtN(x, opts()) + symAfter(units[0]); }
    const copy = units.length > 1 ? formatCompound(base.base, units, opts()).copy : (units[0].id === 'ratio' ? '1:' : '') + copyNum(fromBase(units[0], base.base), opts()) + symAfter(units[0]);
    const name = units.length > 1 ? units.map((u) => cap(u.plural)).join(' + ') : cap(units[0].name);
    return `<tr class="${key === S.to ? 'is-current' : ''}" data-key="${esc(key)}">
      <td><button class="u-rname" type="button" data-to="${esc(key)}" aria-label="Convert to ${esc(name)}">${esc(name)} <span class="u-rsym">${esc(symOf(key))}</span></button></td>
      <td class="is-num u-rval">${numHtml(v)}</td>
      <td class="u-rcopy"><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copyrow="${esc(copy)}" aria-label="Copy ${esc(copy)}" data-tip="Copy">${icon('copy')}</button></td></tr>`;
  }).join('');
  if (put($('#u-rtable'), `<thead><tr><th scope="col">Unit</th><th scope="col" class="is-num">Value</th><th scope="col"><span class="fw-sr">Copy</span></th></tr></thead><tbody>${rows}</tbody>`)) enhance($('#u-rtable'));
}

// ───────────────────────────── URL, memory, saved & recent ─────────────────────────────
let urlT = 0;
/** the typed value for links/URLs: ?v= (From field) or ?tv= (To field) */
const valueParams = () => { const t = (S.text || '').trim(); return !t ? {} : S.src === 'from' ? { v: t } : { tv: t }; };
function urlNow() {
  const u = new URL(location.href);
  for (const k of [...u.searchParams.keys()]) if (k !== 'theme') u.searchParams.delete(k);
  const pg = S.page; const vp = valueParams(); const v = vp.v;
  if (pg.kind === 'pair') {
    const pr = pg.presetId && PRESETS[pg.presetId];
    if (pr) { u.searchParams.set('leaf', pg.presetId); if (S.from !== pr.from) u.searchParams.set('from', S.from); if (S.to !== pr.to) u.searchParams.set('to', S.to); }
    else { u.searchParams.set('leaf', pg.hubId); u.searchParams.set('pair', `${S.from}-${S.to}`); }
    if (v && v !== (START[S.from] || '1')) u.searchParams.set('v', v);
    if (vp.tv) u.searchParams.set('tv', vp.tv);
  } else {
    u.searchParams.set('leaf', pg.hubId); u.searchParams.set('from', S.from); u.searchParams.set('to', S.to); if (v) u.searchParams.set('v', v);
    if (vp.tv) u.searchParams.set('tv', vp.tv);
  }
  return u.pathname + '?' + u.searchParams.toString().replace(/\+/g, '%20').replace(/%2B/gi, '+').replace(/%2C/gi, ',');
}
function syncUrl({ push = false } = {}) {
  clearTimeout(urlT);
  if (push) { history.pushState({}, '', urlNow()); return; }
  urlT = setTimeout(() => history.replaceState({}, '', urlNow()), 250);
}
window.addEventListener('popstate', () => go(stateFromLocation(), { keepFocus: true }));
function remember() {
  if (S.page.kind !== 'hub') return;
  S.remembered[S.page.cat] = { from: S.from, to: S.to, v: S.src === 'from' ? S.text : $('#u-from').value };
  store.set('units:last', S.remembered);
}
function recordRecent() {
  const r = S.r; if (!r?.ok) return;
  const v = S.src === 'from' ? S.text.trim() : $('#u-from').value, res = S.src === 'from' ? $('#u-to').value : S.text.trim();
  const e = { cat: S.page.cat, from: S.from, to: S.to, v, res, t: Date.now() };
  S.recent = [e, ...S.recent.filter((x) => !(x.cat === e.cat && x.from === e.from && x.to === e.to && x.v === e.v))].slice(0, 30);
  store.set('units:recent2', S.recent);
}
function toggleSave() {
  const k = pairKey(); const on = S.saved.some((x) => `${x.cat}:${x.from}:${x.to}` === k);
  S.saved = on ? S.saved.filter((x) => `${x.cat}:${x.from}:${x.to}` !== k) : [{ cat: S.page.cat, from: S.from, to: S.to }, ...S.saved].slice(0, 24);
  store.set('units:saved', S.saved); renderStar();
  toast(on ? `Removed ${symOf(S.from)} → ${symOf(S.to)} from saved pairs` : `Saved ${symOf(S.from)} → ${symOf(S.to)}`, { type: on ? 'neutral' : 'success', duration: 2200 });
}
/** saved/recent item: on a hub of the same category it applies in place; otherwise it opens its pair or hub page */
function applyItem(x) {
  if (x.cat === S.page.cat && S.page.kind === 'hub') { go({ page: S.page, from: x.from, to: x.to, v: x.v ?? $('#u-from').value }, { push: true }); return; }
  location.href = S.page.kind === 'pair' ? pairHref(x.from, x.to, x.v) : hrefFor(HUB_OF[x.cat], { from: x.from, to: x.to, v: x.v || '' });
}

const hasUnit = (t) => /[^\d\s.,−+\-eE:/*()]/.test(String(t)); // "5 ft 3 in", "48° 8′" already carry units
function openSaved(anchor) {
  const cat = S.page.cat;
  const recent = S.recent.filter((x) => x.cat === cat && validKey(x.from, cat) && validKey(x.to, cat)).slice(0, 8);
  const saved = S.saved.filter((x) => CAT[x.cat] && validKey(x.from, x.cat) && validKey(x.to, x.cat));
  const row = (x, i, kind) => `<button class="u-sr__item" type="button" data-${kind}="${i}">
      <span class="u-sr__icon">${icon(CAT[x.cat].icon, { size: 16 })}</span>
      <span class="u-sr__main">${kind === 'recent' ? `<span class="u-sr__val">${numHtml(`${x.v}${hasUnit(x.v) ? '' : ' ' + symOf(x.from)} = ${x.res}${hasUnit(x.res) ? '' : ' ' + symOf(x.to)}`)}</span>` : `<span class="u-sr__val">${esc(symOf(x.from))} → ${esc(symOf(x.to))}</span><span class="u-sr__cat">${esc(catLabel(x.cat))}</span>`}</span></button>`;
  const el = h(`<div class="u-sr">
    <div class="u-sr__head"><h3 class="u-sr__title">Saved pairs</h3></div>
    <div class="u-sr__list" id="u-sr-saved">${saved.length ? saved.map((x, i) => row(x, i, 'saved')).join('') : `<p class="u-sr__empty">${icon('star', { size: 14 })} Star a pair to keep it here.</p>`}</div>
    <div class="u-sr__head"><h3 class="u-sr__title">Recent · ${esc(catLabel(cat))}</h3>${recent.length ? '<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-clear>Clear</button>' : ''}</div>
    <div class="u-sr__list">${recent.length ? recent.map((x, i) => row(x, i, 'recent')).join('') : '<p class="u-sr__empty">Conversions you make show up here.</p>'}</div></div>`);
  let close;
  if (isMobile()) { const s = openSheet({ title: 'Saved & recent', body: el, height: 'half' }); close = s.close; }
  else { const p = openPopover(anchor, el, { placement: 'bottom-end', width: 360, label: 'Saved and recent' }); close = () => p.close(); }
  el.addEventListener('click', (e) => {
    const s = e.target.closest('[data-saved]'), rc = e.target.closest('[data-recent]'), cl = e.target.closest('[data-clear]');
    if (s) { close(); applyItem(saved[+s.dataset.saved]); }
    else if (rc) { close(); applyItem(recent[+rc.dataset.recent]); }
    else if (cl) {
      const old = S.recent; S.recent = S.recent.filter((x) => x.cat !== cat); store.set('units:recent2', S.recent); close();
      toast(`Cleared recent ${catLabel(cat).toLowerCase()} conversions`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.recent = old; store.set('units:recent2', old); } } });
    }
  });
}

function openOptions(anchor) {
  const el = h(`<div class="u-opts">
    <div class="fw-field"><label class="fw-field__label" for="u-fmt">Number format</label>
      <select class="fw-select" id="u-fmt">${FORMATS.map((f) => `<option value="${f.id}" ${f.id === S.fmt ? 'selected' : ''}>${esc(f.label)} · ${esc(f.name)}</option>`).join('')}</select>
      <span class="fw-field__hint">For typing and for results.</span></div>
    <div class="fw-field"><span class="fw-field__label" id="u-prec-l">Digits</span>
      <div class="fw-seg" role="radiogroup" aria-labelledby="u-prec-l" id="u-prec">${[['auto', 'Auto'], ['3', '3'], ['6', '6'], ['10', '10'], ['max', 'Max']].map(([v, l]) => `<button class="fw-seg__opt" type="button" role="radio" data-value="${v}" aria-checked="${String(S.prec) === v}">${l}</button>`).join('')}</div></div>
  </div>`);
  if (isMobile()) openSheet({ title: 'More options', body: el });
  else openPopover(anchor, el, { placement: 'bottom-end', width: 320, label: 'More options' });
  el.querySelector('#u-fmt').addEventListener('change', (e) => setFmt(e.target.value));
  el.querySelector('#u-prec').addEventListener('fw-change', (e) => { S.prec = e.detail.value === 'auto' || e.detail.value === 'max' ? e.detail.value : +e.detail.value; store.set('units:prec', S.prec); update(); });
}
function setFmt(fmt) {
  // keep the typed number's meaning: re-write it in the new format
  if (S.r?.ok && S.r.bare) { const v = S.r.terms.reduce((s, t) => s + t.v, 0); S.fmt = fmt; S.text = fieldNum(v); $(S.src === 'from' ? '#u-from' : '#u-to').value = S.text; }
  S.fmt = fmt; store.set('units:numfmt', fmt); update();
  toast(fmt === 'de' ? 'Decimal comma: 1.234,5' : `Number format: ${FORMATS.find((f) => f.id === fmt).label}`, { type: 'neutral', duration: 1800 });
}

// ───────────────────────────── unit picker (combobox: popover on desktop, sheet on phones) ─────────────────────────────
function pickerGroups(cat) {
  const groups = CAT[cat].groups.map(([sys, label]) => ({ label, items: unitsOf(cat).filter((id) => UNITS[id].sys === sys) })).filter((g) => g.items.length);
  if (COMPOUNDS[cat]) groups.push({ label: cat === 'time' ? 'Durations' : cat === 'angle' ? 'Degrees, minutes, seconds' : 'Combined', items: COMPOUNDS[cat].map((c) => c.join('+')) });
  return groups;
}
let pickerSeq = 0;
function openPicker(anchor, side) {
  const cat = S.page.cat; const id = 'u-pk-' + ++pickerSeq;
  const curKey = side === 'from' ? S.from : S.to;
  const el = h(`<div class="u-picker">
    <div class="u-picker__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" type="text" role="combobox" aria-expanded="true" aria-controls="${id}" aria-autocomplete="list"
      placeholder="Search units: inch, Zoll, ″, Pfund…" aria-label="Search units" autocomplete="off" spellcheck="false"></div></div>
    <div class="u-picker__list" role="listbox" id="${id}" aria-label="${side === 'to' ? 'Convert to' : 'Convert from'}"></div></div>`);
  const list = el.querySelector('.u-picker__list'), search = el.querySelector('input');
  let keys = [], active = 0;
  const base = S.r?.ok ? S.r.base : null;
  const preview = (key) => {
    if (base == null || S.src === side) return '';
    const units = keyUnits(key); if (units[0].cat !== cat) return '';
    return units.length > 1 ? formatCompound(base, units, opts()).text : fmtN(fromBase(units[0], base), opts());
  };
  const optHtml = (key, extra = '') => {
    const units = keyUnits(key); const i = keys.length; keys.push(key);
    return `<div class="u-picker__opt ${key === curKey ? 'is-current' : ''}" role="option" id="${id}-${i}" data-key="${esc(key)}" aria-selected="${key === curKey}">
      <span class="u-picker__sym">${esc(units.map((u) => u.sym).join(' + '))}</span><span class="u-picker__name">${esc(units.length > 1 ? units.map((u) => u.plural).join(' + ') : cap(units[0].name))}${extra}</span>
      <span class="u-picker__val">${numHtml(preview(key))}</span>${key === curKey ? icon('check', { className: 'u-picker__check' }) : '<span></span>'}</div>`;
  };
  function draw() {
    const qv = search.value.trim(); let html = ''; keys = [];
    if (!qv) {
      html += `<div class="u-picker__label">Quick picks</div><div class="u-picker__freq" role="group" aria-label="Quick picks">${(QUICK[cat] || []).map((x) => { const i = keys.length; keys.push(x); return `<span class="u-picker__chip ${x === curKey ? 'is-current' : ''}" role="option" id="${id}-${i}" data-key="${x}" aria-selected="${x === curKey}">${esc(UNITS[x].sym)}</span>`; }).join('')}</div>`;
      for (const g of pickerGroups(cat)) html += `<div class="u-picker__label">${esc(g.label)}</div>${g.items.map((k) => optHtml(k)).join('')}`;
    } else {
      const found = searchUnits(qv, { limit: 30 });
      const inCat = found.filter((u) => u.cat === cat), other = found.filter((u) => u.cat !== cat && HUB_OF[u.cat]);
      if (inCat.length) html += `<div class="u-picker__label">${esc(catLabel(cat))}</div>${inCat.map((u) => optHtml(u.id)).join('')}`;
      if (other.length) html += `<div class="u-picker__label">Other categories</div>${other.slice(0, 6).map((u) => optHtml(u.id, ` · ${esc(catLabel(u.cat))}`)).join('')}`;
      if (!html) html = `<div class="u-picker__none">No unit called “${esc(qv)}”. Try the symbol or the German name.</div>`;
    }
    list.innerHTML = html;
    active = qv ? 0 : Math.max(0, keys.indexOf(curKey));
    mark(false);
  }
  function mark(scroll = true) {
    const nodes = $$('[role=option]', list);
    nodes.forEach((n, k) => n.classList.toggle('is-active', k === active));
    const n = nodes[active]; if (n) { search.setAttribute('aria-activedescendant', n.id); if (scroll) n.scrollIntoView({ block: 'nearest' }); }
  }
  function choose(key) {
    close();
    const u = keyUnits(key)[0];
    if (u.cat !== cat) { // another category: go to that page with this unit
      const c = u.cat, other = DEFAULTS[c][0] === key ? DEFAULTS[c][1] : DEFAULTS[c][0];
      const [a, b] = side === 'from' ? [key, other] : [other, key];
      location.href = S.page.kind === 'pair' ? pairHref(a, b) : hrefFor(HUB_OF[c], { from: a, to: b });
      return;
    }
    setUnit(side, key);
  }
  list.addEventListener('click', (e) => { const o = e.target.closest('[role=option]'); if (o) choose(o.dataset.key); });
  list.addEventListener('pointermove', (e) => { const o = e.target.closest('[role=option]'); if (!o) return; const k = $$('[role=option]', list).indexOf(o); if (k !== active) { active = k; mark(false); } });
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + keys.length) % keys.length; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (keys[active]) choose(keys[active]); }
  });
  draw();
  let close;
  if (isMobile()) { const sh = openSheet({ title: side === 'to' ? 'Convert to' : 'Convert from', body: el, height: 'half', className: 'u-picker-sheet' }); close = sh.close; }
  else { const p = openPopover(anchor, el, { className: 'u-picker-pop', width: 380, label: side === 'to' ? 'Convert to' : 'Convert from', focus: false }); close = () => p.close(true); search.focus({ preventScroll: true }); }
  const centre = () => { const c = list.querySelector('.u-picker__opt.is-current'); if (c) list.scrollTop = c.offsetTop - list.clientHeight / 2 + c.offsetHeight / 2; };
  requestAnimationFrame(centre); setTimeout(centre, 260); // after the sheet's opening animation
}

/** change one side's unit. Hubs stay put; pair pages become the page for the new pair (Back returns). */
function setUnit(side, key) {
  const cur = side === 'from' ? S.from : S.to; if (cur === key) return;
  // keep the number the user typed; the other side follows
  const keepText = S.src === side ? (S.r?.ok && S.r.typed ? fieldNum(S.r.terms[0].v) : S.text) : null;
  if (side === 'from') S.from = key; else S.to = key;
  if (keepText != null) { S.text = keepText; $(`#u-${side}`).value = keepText; }
  if (S.page.kind === 'pair' && !(VARIANT[cur] === key)) {
    const presetId = findPreset(S.from, S.to);
    S.page = { ...S.page, presetId, leafId: presetId || S.page.hubId };
    renderHeader(); update(); syncUrl({ push: true });
    return;
  }
  update();
}

function swap() {
  const fromVal = $('#u-from').value, toVal = $('#u-to').value;
  [S.from, S.to] = [S.to, S.from];
  // the answer becomes the input (same quantity, other way round)
  S.src = 'from'; S.text = toVal || fromVal; $('#u-from').value = S.text;
  if (S.page.kind === 'pair') {
    const presetId = findPreset(S.from, S.to);
    S.page = { ...S.page, presetId, leafId: presetId || S.page.hubId };
    renderHeader();
  }
  const b = $('#u-swap'); b.classList.remove('is-turn'); void b.offsetWidth; b.classList.add('is-turn');
  update({ commit: true });
  syncUrl();
  if (!isCoarse()) { const f = $('#u-from'); f.focus({ preventScroll: true }); f.select(); } // keep typing; Enter copies
}

function copyResult(btn) {
  const r = S.r; if (!r?.ok) return;
  let text;
  if (S.src === 'from') text = resultText(r, opts()).copy;
  else { const v = $('#u-from').value; text = keyUnits(S.from).length > 1 ? v : `${v.replace(/[  ]/g, '')} ${symOf(S.from)}`; }
  copyText(text, btn || $('#u-copy'), btn ? {} : { toastLabel: text }); // keyboard copy names the value in a toast
  clearTimeout(recentT); recordRecent();
}

// ───────────────────────────── wiring ─────────────────────────────
function wire() {
  for (const side of ['from', 'to']) {
    const inp = $(`#u-${side}`);
    inp.addEventListener('input', () => { S.src = side; S.text = inp.value; S.typedAt = Date.now(); update(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); update({ commit: true }); copyResult(); }
    });
    inp.addEventListener('blur', () => { if (S.src === side) { S.typedAt = 0; update({ commit: true }); } });
    $(`#u-${side}-unit`).addEventListener('click', (e) => openPicker(e.currentTarget, side));
    $(`#u-${side}-quick`).addEventListener('click', (e) => {
      const q = e.target.closest('[data-qp]'); if (q) setUnit(side, q.dataset.unit);
    });
    $(`#u-${side}-sub`).addEventListener('fw-change', (e) => { const g = e.target.closest('[data-variant]'); if (g) setUnit(g.dataset.variant, e.detail.value); });
  }
  $('#u-swap').addEventListener('click', swap);
  $('#u-copy').addEventListener('click', (e) => copyResult(e.currentTarget));
  $('#u-pm').addEventListener('click', () => {
    const inp = $('#u-from'); S.src = 'from';
    S.text = /^\s*[-−]/.test(inp.value) ? inp.value.replace(/^\s*[-−]\s*/, '') : '−' + inp.value.trim();
    inp.value = S.text; update({ commit: true });
  });
  $('#u-star').addEventListener('click', toggleSave);
  $('#u-saved').addEventListener('click', (e) => openSaved(e.currentTarget));
  $('#u-more').addEventListener('click', (e) => openOptions(e.currentTarget));
  $('#u-note').addEventListener('click', (e) => {
    const sg = e.target.closest('[data-sugg]'), am = e.target.closest('[data-amb]'), nm = e.target.closest('[data-num]');
    const inp = $(S.src === 'from' ? '#u-from' : '#u-to');
    if (sg) { S.text = sg.dataset.bad ? S.text.replace(sg.dataset.bad, sg.dataset.sugg) : S.text; inp.value = S.text; update({ commit: true }); inp.focus(); }
    if (am) { S.over[am.dataset.amb] = am.dataset.pick; update({ commit: true }); }
    if (nm) { S.text = S.text.replace(nm.dataset.num, nm.dataset.alt); inp.value = S.text; update({ commit: true }); inp.focus(); }
  });
  const ct = $('#u-ctable');
  ct?.addEventListener('click', (e) => {
    const b = e.target.closest('tr')?.querySelector('[data-v]'); if (!b || !e.target.closest('tbody')) return;
    S.src = 'from'; S.text = b.dataset.v; $('#u-from').value = S.text; update({ commit: true });
    if (!isCoarse()) $('#u-from').focus({ preventScroll: true });
    else $('.u-conv').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('#u-rtable')?.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copyrow]'); if (c) { copyText(c.dataset.copyrow, c, { toastLabel: c.dataset.copyrow }); return; }
    const t = e.target.closest('[data-to]'); if (t) { setUnit('to', t.dataset.to); $('.u-conv').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
}
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.metaKey || e.ctrlKey) return;
  const k = e.code;
  if (k === 'KeyS') { e.preventDefault(); swap(); }
  else if (k === 'KeyD') { e.preventDefault(); toggleSave(); }
});

setCommands([
  { id: 'u-swap', label: 'Swap units', icon: 'arrow-left-right', kbd: 'alt+s', syn: ['reverse', 'flip', 'switch units'], run: () => swap() },
  { id: 'u-copy', label: 'Copy result', icon: 'copy', kbd: 'enter', syn: ['copy answer'], run: () => copyResult() },
  { id: 'u-save', label: 'Save this pair', icon: 'star', kbd: 'alt+d', syn: ['favorite', 'favourite', 'pin', 'bookmark'], run: () => toggleSave() },
  { id: 'u-saved', label: 'Saved pairs & recent conversions', icon: 'history', syn: ['history', 'favorites'], run: () => openSaved($('#u-saved')) },
  { id: 'u-comma', label: 'Use decimal comma (1.234,5)', icon: 'sliders-horizontal', syn: ['komma', 'german numbers', 'number format'], run: () => setFmt('de'), hidden: () => S.fmt === 'de' },
  { id: 'u-point', label: 'Use decimal point (1,234.5)', icon: 'sliders-horizontal', syn: ['number format', 'english numbers'], run: () => setFmt('en'), hidden: () => S.fmt === 'en' },
]);

// ───────────────────────────── boot ─────────────────────────────
go(initial);
window.__units = { S, update, go, parse, compute };
