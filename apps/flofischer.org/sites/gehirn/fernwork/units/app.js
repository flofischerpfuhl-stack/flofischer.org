// Fernwork Units · "Units: One Line". One input that answers; category detected; every unit one keystroke away.
import './uicons.js';
import { mountShell, renderPageHeader, getLeaf, icon, esc, $, $$, h, enhance, copyText, toast, openPopover, openSheet, openMenu,
  navigate, kbd, store, isMobile, isCoarse, roving, pushLayer } from '../kit/shell.js';
import { CATS, CAT, UNITS, COMPOUNDS, FREQUENT, FORMATS, unitsOf, parse, resultText, sourceText, formulaFor, format, copyNum, fromBase,
  formatCompound, inchFraction, searchUnits, aliasesOf, targetQuery, querySym, isLinear, readNumber, answerFor } from './units-core.js';

// ───────────────────────────── setup ─────────────────────────────
const params = new URLSearchParams(location.search);
const PRESET = { 'cm-to-inches': '180 cm in in', 'kg-to-lb': '70 kg in lb', 'celsius-to-fahrenheit': '20 °C in °F', 'km-to-miles': '10 km in mi' };
const leafId = getLeaf(params.get('leaf')) && (params.get('leaf') === 'units' || PRESET[params.get('leaf')]) ? params.get('leaf') : 'units';
const routes = { units: './', ...Object.fromEntries(Object.keys(PRESET).map((k) => [k, `./?leaf=${k}`])) };

mountShell({
  leaf: leafId, archetype: 'instant', routes, searchInput: '#q',
  recent: params.get('q') ? { note: params.get('q').slice(0, 40) } : undefined,
  onPasteText: (t) => { set(t.trim(), { push: true }); $('#q').focus(); return true; },
  shortcuts: [
    { label: 'Copy the result', keys: 'enter' }, { label: 'Move the target unit', keys: 'up down' }, { label: 'Complete a unit name', keys: 'tab' },
    { label: 'Swap units', keys: 'shift+mod+s' }, { label: 'Pin this conversion', keys: 'mod+d' },
  ],
});
const leaf = getLeaf(leafId);
renderPageHeader($('#page-header'), { leaf, lede: leafId === 'units' ? 'Type it like you say it. The category finds itself, every unit is one keystroke away.' : undefined });
document.title = `${leaf.name} · Fernwork`;

const DEMO_PINS = [{ from: 'm', to: 'ft' }, { from: 'c', to: 'f' }, { from: 'l100km', to: 'mpgus' }];
const H = 3600e3;
const DEMO_RECENT = [
  { q: '100 km/h in mph', t: Date.now() - 26 * H }, { q: '20 °C in °F', t: Date.now() - 3 * 24 * H }, { q: '2.5 cups in ml', t: Date.now() - 5 * 24 * H },
];
const S = {
  q: '', r: null, good: null, over: {},
  ctx: { from: null, to: null },
  prec: store.get('units:prec', 'auto'), fmt: store.get('units:fmt', defaultFmt()),
  pins: store.get('units:pins', null) || DEMO_PINS, recent: store.get('units:recent', null) || DEMO_RECENT,
  typedAt: 0, lastKey: '', lastRecorded: '',
};
function defaultFmt() { const l = (navigator.language || 'en').toLowerCase(); return /^(de|nl|da|es|it|pt|id|tr)/.test(l) ? 'de' : /^(fr|sv|nb|fi|pl|cs|ru)/.test(l) ? 'si' : 'en'; }
const opts = () => ({ prec: S.prec, fmt: S.fmt });
const SUPMAP = { '⁻': '−', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
/** escape + render "× 10⁻⁷" with a real <sup> (Geist has no superscript digits) */
const numHtml = (s) => esc(s).replace(/× 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (m, e) => `×&#8202;10<sup>${[...e].map((c) => SUPMAP[c]).join('')}</sup>`);
const input = $('#q');
const mobile = () => isMobile();

// ───────────────────────────── parsing with context ─────────────────────────────
function compute(q) {
  const ctx = { fmt: S.fmt, over: S.over };
  let r = parse(q, ctx);
  // a bare number ("82") uses the current pair (mobile composer, pinned pairs)
  if (!r.ok && r.error?.code === 'nounit' && !r.terms.length && S.ctx.from && (S.ctx.sticky || mobile()) && !/[^\d\s.,+\-*/^()−×÷½¼¾⅓⅔⅛⅜⅝⅞eE]/.test(q)) {
    const from = UNITS[S.ctx.from], to = keyUnits(S.ctx.to);
    if (from && to.length) { r = parse(`${q} ${querySym(from)} in ${targetQuery(to)}`, ctx); r.bare = true; }
  }
  return r;
}
/** write HTML only when it changed (keeps focus, hover and in-flight clicks stable). Returns true when written. */
function put(el, html) { if (el._html === html) return false; el._html = html; el.innerHTML = html; return true; }
const keyUnits = (key) => (key ? String(key).split('+').map((id) => UNITS[id]).filter(Boolean) : []);
const canonical = (r) => `${sourceText(r, S.fmt)} in ${targetQuery(r.target.units)}`;
const fromQuerySym = (r) => (r.terms.length > 1 && r.terms.every((t) => isLinear(t.u)) ? r.terms.map((t) => t.u.sym).join('+') : querySym(r.terms[0].u));

// ───────────────────────────── state changes ─────────────────────────────
let urlT = 0;
function set(q, { push = false, select = null, keepCtx = false } = {}) {
  if (push) { clearTimeout(urlT); history.replaceState({ q: S.q }, '', urlFor(S.q)); history.pushState({ q }, '', urlFor(q)); }
  S.q = q; if (input.value !== q) input.value = q;
  if (!keepCtx) { /* ctx follows parsed units */ }
  if (select) { const i = q.indexOf(select); if (i >= 0) input.setSelectionRange(i, i + select.length); }
  render();
}
function urlFor(q) {
  const u = new URL(location.href);
  for (const k of [...u.searchParams.keys()]) if (k !== 'leaf' && k !== 'theme') u.searchParams.delete(k);
  if (q) u.searchParams.set('q', q);
  return u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString().replace(/\+/g, '%20') : '') ;
}
function syncUrl() {
  clearTimeout(urlT);
  urlT = setTimeout(() => { const q = S.r?.ok && S.r.bare ? canonical(S.r) : S.q; history.replaceState({ q }, '', urlFor(q)); }, 250);
}
window.addEventListener('popstate', () => { const q = new URLSearchParams(location.search).get('q') || ''; S.q = q; input.value = q; render(); });

input.addEventListener('input', () => { S.typedAt = Date.now(); S.q = input.value; render(); });
input.addEventListener('keydown', onInputKey);
input.addEventListener('blur', () => { if (S.r?.ok) recordRecent(S.r); });
input.addEventListener('focus', () => updateGhost());
input.addEventListener('select', updateGhost); input.addEventListener('click', updateGhost);
$('#clear').onclick = () => { const old = S.q; set('', { push: true }); input.focus(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }); };
$('#mcopy').onclick = (e) => copyResult(e.currentTarget);

// ───────────────────────────── render ─────────────────────────────
let errT = 0;
function render() {
  const q = S.q.trim();
  const r = q ? compute(q) : null;
  S.r = r;
  if (r?.ok) {
    S.good = r;
    S.ctx = { from: r.terms[0].u.id, to: r.target.key, sticky: !!r.bare };
    for (const k of Object.keys(S.over)) if (!q.includes(k)) delete S.over[k];
  }
  // errors while typing stay quiet for a moment (no red flash on every keystroke)
  const typing = Date.now() - S.typedAt < 700;
  const soft = r && !r.ok && typing;
  if (soft) { clearTimeout(errT); errT = setTimeout(render, 720); }
  S.soft = soft;
  document.documentElement.classList.toggle('u-has-result', !!q);
  $('#clear').hidden = !q;
  renderMeta(); renderHero(); renderList(); renderCats(); renderEmpty(); renderAside(); renderMobile(); updateGhost();
  if (q || location.search.includes('q=')) syncUrl();
}

// ── meta line: ambiguity chips, number hints, errors ──
function renderMeta() {
  const r = S.r, el = $('#meta'); let html = '';
  $('#qbox').removeAttribute('aria-invalid');
  if (r && r.ok) {
    for (const a of r.amb.slice(0, 2)) html += ambChip(a, r);
    for (const n of r.numAmb.slice(0, 1)) html += numHint(n);
    if (r.clockAlt) html += clockChip(r);
    const seen = new Set(), notes = [];
    for (const u of [...r.terms.map((t) => t.u), ...r.target.units]) { if (seen.has(u.id)) continue; seen.add(u.id); if (['mach', 'mo', 'yr', 'inhg', 'hp', 'mil', 'ozt'].includes(u.id) || (u.id === 'kcal' && /\bCal\b/.test(S.q))) notes.push(u); }
    if (notes.length && !html) html += `<span class="u-note">${icon('info', { size: 14 })}${notes.map((u) => `${esc(u.sym)} = ${esc(u.name)}${u.note ? ' · ' + esc(u.note) : ''}`).join(' · ')}</span>`;
    if (r.pendingTarget) html += `<span class="u-note">${icon('corner-down-left', { size: 14 })}Showing ${esc(r.target.units.map((u) => u.sym).join(' + '))} until you name a unit</span>`;
  } else if (r && !r.ok && r.error && r.error.code !== 'empty' && !S.soft) {
    const e = r.error, hard = !['nounit', 'syntax'].includes(e.code) || !e.partial;
    if (hard && e.code !== 'nounit') $('#qbox').setAttribute('aria-invalid', 'true');
    let acts = '';
    if (e.code === 'incompatible' && e.suggest?.length) acts = `<span class="u-alert__try">Try</span>${e.suggest.map((id) => `<button class="fw-chip u-fix" type="button" data-target="${id}">${esc(UNITS[id].sym)}</button>`).join('')}`;
    if (e.code === 'unknown' && e.suggest?.length) acts = `<span class="u-alert__try">Did you mean</span>${e.suggest.map((id) => `<button class="fw-chip u-fix" type="button" data-replace="${esc(e.token)}" data-with="${esc(UNITS[id].sym)}">${esc(UNITS[id].name)} <span class="fw-muted">${esc(UNITS[id].sym)}</span></button>`).join('')}`;
    const tone = e.code === 'nounit' || e.code === 'syntax' ? 'info' : e.code === 'abszero' || e.code === 'incompatible' || e.code === 'unknown' ? 'danger' : 'warning';
    html = `<div class="fw-alert fw-alert--${tone} u-alert" role="${tone === 'danger' ? 'alert' : 'status'}"><span class="fw-alert__icon">${icon(tone === 'info' ? 'info' : 'circle-alert')}</span>
      <div class="fw-alert__body"><span>${esc(e.msg || 'Keep typing…')}</span>${acts ? `<div class="u-alert__acts">${acts}</div>` : ''}</div></div>`;
  }
  el.hidden = !html;
  if (put(el, html)) hookMeta(el);
}
function ambChip(a, r) {
  const caseNote = r.cat === 'data' || r.cat === 'rate' ? 'b = bit · B = byte' : a.raw === 'Cal' || a.raw === 'cal' ? 'Cal = food calorie (kcal)' : '';
  const opt = (id) => {
    const alt = parse(S.q.trim(), { fmt: S.fmt, over: { ...S.over, [a.raw]: id } });
    const val = alt.ok ? (() => { const t = resultText(alt, opts()); return t.text + (t.unitText ? ' ' + t.unitText : ''); })() : '';
    return `<button class="u-choice__opt" type="button" role="radio" aria-checked="${id === a.chosen}" data-raw="${esc(a.raw)}" data-id="${id}">
      <span class="u-choice__dot" aria-hidden="true"></span><span class="u-choice__name">${esc(UNITS[id].name)}</span>${val ? `<span class="u-choice__val">${esc(val)}</span>` : ''}</button>`;
  };
  return `<div class="u-choice" role="radiogroup" aria-label="${esc(a.raw)} means">
    <span class="u-choice__q"><b class="u-mono">${esc(a.raw)}</b> means</span>${a.options.slice(0, 3).map(opt).join('')}
    ${caseNote ? `<span class="u-choice__why">${icon('case-sensitive', { size: 14 })}${esc(caseNote)}</span>` : ''}</div>`;
}
function numHint(n) {
  const read = format(n.read, { prec: 'max', fmt: S.fmt }), alt = format(n.alt, { prec: 'max', fmt: S.fmt });
  const how = n.as === 'decimal' ? 'decimal point' : n.sep === ',' && S.fmt !== 'de' ? 'thousands separator' : 'thousands separator';
  return `<div class="u-choice u-choice--num"><span class="u-choice__q">${icon('info', { size: 14 })} Read <b class="u-mono">${esc(n.raw)}</b> as <b>${esc(read)}</b> (${how}).</span>
    <button class="fw-btn fw-btn--sm fw-btn--subtle" type="button" data-numfix="${esc(n.raw)}" data-alt="${esc(copyNum(n.alt, { prec: 'max', fmt: S.fmt }))}">Meant ${esc(alt)}?</button></div>`;
}
function clockChip(r) {
  const isRatio = r.terms[0].u.id === 'ratio';
  return `<div class="u-choice" role="radiogroup" aria-label="${esc(r.clockAlt.raw)} means"><span class="u-choice__q"><b class="u-mono">${esc(r.clockAlt.raw)}</b> means</span>
    <button class="u-choice__opt" type="button" role="radio" aria-checked="${!isRatio}" data-clock="time"><span class="u-choice__dot"></span><span class="u-choice__name">hours : minutes</span></button>
    <button class="u-choice__opt" type="button" role="radio" aria-checked="${isRatio}" data-clock="ratio"><span class="u-choice__dot"></span><span class="u-choice__name">slope ratio</span></button></div>`;
}
function hookMeta(el) {
  $$('.u-choice__opt[data-raw]', el).forEach((b) => b.onclick = () => { S.over[b.dataset.raw] = b.dataset.id; render(); });
  $$('[data-clock]', el).forEach((b) => b.onclick = () => { const raw = S.r.clockAlt.raw; if (b.dataset.clock === 'ratio') S.over[raw] = 'ratio'; else delete S.over[raw]; render(); });
  $$('[data-numfix]', el).forEach((b) => b.onclick = () => {
    const old = S.q; const i = S.q.indexOf(b.dataset.numfix);
    if (i >= 0) { set(S.q.slice(0, i) + b.dataset.alt + S.q.slice(i + b.dataset.numfix.length), { push: true }); toast(`Changed to ${b.dataset.alt}`, { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }); }
  });
  $$('[data-target]', el).forEach((b) => b.onclick = () => { setTargetText(querySym(UNITS[b.dataset.target])); input.focus(); });
  $$('[data-replace]', el).forEach((b) => b.onclick = () => { const i = S.q.lastIndexOf(b.dataset.replace); if (i >= 0) set(S.q.slice(0, i) + b.dataset.with + S.q.slice(i + b.dataset.replace.length), { push: true }); input.focus(); });
  $$('.u-choice[role=radiogroup]', el).forEach((g) => roving(g, '.u-choice__opt'));
}
// replace (or add) the target part of the query text
function setTargetText(tq) {
  const r = S.r?.ok ? S.r : S.good; let left;
  if (S.r && !S.r.ok && S.r.leftText != null && S.r.leftText) left = S.r.leftText;
  else left = r?.leftText || (r ? sourceText(r, S.fmt) : S.q.trim());
  if (S.r?.bare) { S.ctx.to = keyFromQuery(tq); render(); return; }
  const sep = (S.r?.ok ? S.r.sepText : '') || 'in';
  set(`${left} ${sep} ${tq}`);
}
const keyFromQuery = (tq) => { const r = parse(`1 ${querySym(UNITS[S.ctx.from])} in ${tq}`, { fmt: S.fmt }); return r.ok ? r.target.key : S.ctx.to; };

// ── hero ──
function renderHero() {
  const el = $('#hero'); const r = S.r;
  if (!S.q.trim()) {
    const changedE = put(el, `<div class="fw-hero fw-hero--empty u-hero u-hero--empty">
      <span class="fw-hero__label">${icon('text-cursor')} The answer appears as you type</span>
      <div class="u-try"><span class="u-try__label">Try</span>${['5\'3" in cm', '70 kg to lb', '−40 °C in °F', '7 l/100km in mpg', '1 Mb in MB', '1.000 kg in lb'].map((x) => `<button class="fw-chip fw-chip--sample" type="button" data-try="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`);
    if (changedE) $$('[data-try]', el).forEach((b) => b.onclick = () => { set(b.dataset.try, { push: true }); if (!isCoarse()) input.focus(); });
    S.lastKey = ''; return;
  }
  const g = r?.ok ? r : S.good;
  if (!g) {
    const msg = r?.error?.code === 'nounit' ? 'Add a unit: 70 kg, 20 °C, 5 ft 3 in…' : S.soft ? 'Keep typing…' : 'Not converted yet. These work:';
    const changedE = put(el, `<div class="fw-hero fw-hero--empty u-hero u-hero--empty"><span class="fw-hero__label">${icon(S.soft ? 'text-cursor' : 'ruler')} ${esc(msg)}</span>
      <div class="u-try">${['5\'3" in cm', '70 kg to lb', '−40 °C in °F', '7 l/100km in mpg'].map((x) => `<button class="fw-chip fw-chip--sample" type="button" data-try="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`);
    if (changedE) $$('[data-try]', el).forEach((b) => b.onclick = () => { set(b.dataset.try, { push: true }); if (!isCoarse()) input.focus(); });
    S.lastKey = ''; return;
  }
  const stale = !r?.ok && !S.soft, pending = !r?.ok && S.soft;
  const t = resultText(g, opts());
  const f = formulaFor(g, { fmt: S.fmt });
  const c = CAT[g.cat];
  const key = `${g.cat}|${g.target.key}`; const changed = key !== S.lastKey; S.lastKey = key;
  const pinned = isPinned(g);
  const valueHtml = t.parts ? t.parts.map((p) => `${esc(format(p.v, { prec: 'max', fmt: S.fmt }))}<small>${esc(p.u.sym)}</small>`).join(' ')
    : g.target.units[0].id === 'ratio' ? esc(t.text) : `${numHtml(t.text)}<small>${esc(t.unitText)}</small>`;
  const exactBadge = t.exact ? `<span class="fw-badge fw-badge--accent u-exact" data-tip="The value shown is the exact result">${icon('check', { size: 12 })}Exact</span>`
    : `<span class="fw-badge u-exact" data-tip="Rounded for display. Copy uses the same digits; set Digits to Max for more">≈ Rounded</span>`;
  if (!put(el, `<div class="fw-hero u-hero ${stale ? 'is-stale' : ''} ${pending ? 'is-pending' : ''} ${changed ? 'is-new' : ''}" aria-live="polite">
    <div class="u-hero__top"><span class="fw-hero__label u-hero__q">${esc(sourceText(g, S.fmt))} =</span>
      <span class="u-hero__cat">${stale ? `<span class="fw-badge fw-badge--warning">Out of date</span>` : pending ? `${icon('text-cursor', { size: 14 })}Typing…` : `${icon(c.icon, { size: 14 })}${esc(c.label)}`}</span></div>
    <div class="fw-hero__value u-hero__value" id="hero-value">${valueHtml}</div>
    <div class="u-hero__formula">${exactBadge}${f?.main ? `<code class="u-formula">${esc(f.main)}</code>` : ''}${f?.step ? `<span class="u-step">${esc(f.step)}</span>` : ''}</div>
    <div class="fw-hero__actions u-hero__actions">
      <button class="fw-btn fw-btn--primary u-copy" type="button" id="copy" ${stale || pending ? 'disabled' : ''}>${icon('copy')}<span>Copy</span>${kbd('enter', 'u-kbd-on-primary fw-kbd-hint')}</button>
      <button class="fw-btn" type="button" id="pin" aria-pressed="${pinned}" data-tip="${pinned ? 'Unpin' : 'Pin this pair'}" data-tip-kbd="mod+d" ${stale ? 'disabled' : ''}>${icon('pin')}<span>${pinned ? 'Pinned' : 'Pin'}</span></button>
      <button class="fw-btn" type="button" id="swap" data-tip="Swap units" data-tip-kbd="shift+mod+s">${icon('arrow-left-right')}<span>Swap</span></button>
      <button class="fw-btn fw-btn--ghost" type="button" id="share" data-tip="Copy a link to this conversion" ${stale ? 'disabled' : ''}>${icon('link')}<span class="u-hide-sm">Link</span></button>
      <button class="fw-btn fw-btn--ghost u-hide-sm" type="button" id="tocalc" data-tip="Continue in Calculator" ${stale ? 'disabled' : ''}>${icon('calculator')}<span>Calculator</span></button>
    </div>
    ${structRow(g)}
  </div>`)) return;
  enhance(el);
  $('#copy', el).onclick = (e) => copyResult(e.currentTarget);
  $('#pin', el).onclick = () => togglePin();
  $('#swap', el).onclick = () => swap();
  $('#share', el).onclick = (e) => { const u = new URL(location.href); u.search = ''; u.searchParams.set('q', canonical(g)); copyText(u.href.replace(/\+/g, '%20'), e.currentTarget, { toastLabel: 'link' }); };
  $('#tocalc', el).onclick = () => navigate('calculator', { query: { q: t.copy } });
  hookStruct(el, g);
}
function structRow(g) {
  const terms = g.terms.map((t, k) => `<span class="u-struct__term">
      <input class="u-num" type="text" inputmode="decimal" data-term="${k}" value="${esc(copyNum(t.v, { prec: 'max', fmt: S.fmt }))}" aria-label="Value in ${esc(t.u.name)}s" autocomplete="off" spellcheck="false">
      <button class="fw-target fw-target--lg u-pill" type="button" data-pill="from" data-term="${k}" aria-haspopup="listbox" aria-label="From unit: ${esc(t.u.name)}">${esc(t.u.sym)}${icon('chevron-down', { size: 14 })}</button></span>`).join('');
  const t = resultText(g, { prec: 'max', fmt: S.fmt });
  const val = g.target.units.length > 1 ? t.copy : (g.target.units[0].id === 'ratio' ? t.copy.replace(/^1:/, '') : copyNum(g.value, { prec: 10, fmt: S.fmt }));
  return `<div class="u-struct" role="group" aria-label="Edit either side">
    <div class="u-struct__side">${terms}</div>
    <button class="fw-iconbtn fw-iconbtn--outline u-struct__swap" type="button" data-swap aria-label="Swap units" data-tip="Swap" data-tip-kbd="shift+mod+s">${icon('arrow-left-right')}</button>
    <div class="u-struct__side"><span class="u-struct__term">
      <input class="u-num u-num--out" type="text" inputmode="decimal" data-out value="${esc(val)}" aria-label="Value in ${esc(g.target.units.map((u) => u.name).join(' and '))}" autocomplete="off" spellcheck="false">
      <button class="fw-target fw-target--lg u-pill" type="button" data-pill="to" aria-haspopup="listbox" aria-label="To unit: ${esc(g.target.units.map((u) => u.name).join(' + '))}">${esc(g.target.units.map((u) => u.sym).join(' + '))}${icon('chevron-down', { size: 14 })}</button></span></div>
  </div>`;
}
function hookStruct(el, g) {
  $$('.u-num[data-term]', el).forEach((inp) => inp.addEventListener('input', () => {
    const vals = $$('.u-num[data-term]', el).map((x) => x.value.trim() || '0');
    const q = g.terms.map((t, k) => `${vals[k]} ${querySym(t.u)}`).join(' ') + ` in ${targetQuery(g.target.units)}`;
    editFromField(q, inp);
  }));
  const out = $('.u-num[data-out]', el);
  out?.addEventListener('input', () => {
    const txt = out.value.trim(); if (!txt) return;
    const tg = g.target.units;
    const r2 = parse(/[a-z°'"′″]/i.test(txt) ? `${txt} in ${fromQuerySym(g)}` : `${tg[0].id === 'ratio' ? '1:' + txt : txt + ' ' + querySym(tg[0])} in ${fromQuerySym(g)}`, { fmt: S.fmt });
    if (!r2.ok) { out.setAttribute('aria-invalid', 'true'); return; }
    out.removeAttribute('aria-invalid');
    const tr = resultText(r2, { prec: 10, fmt: S.fmt });
    const src = r2.target.units.length > 1 ? tr.copy : `${tr.copy}`;
    editFromField(`${src} in ${targetQuery(tg)}`, out);
  });
  $$('[data-pill]', el).forEach((b) => b.onclick = () => openPicker(b, { role: b.dataset.pill, term: +b.dataset.term || 0 }));
  $('[data-swap]', el)?.addEventListener('click', swap);
}
// structured-row edits rewrite the query but keep the focused field (caret) intact
function editFromField(q, field) {
  S.q = q; input.value = q;
  const r = compute(q); if (!r.ok) return;
  S.r = r; S.good = r; S.ctx = { from: r.terms[0].u.id, to: r.target.key };
  const sel = [field.selectionStart, field.selectionEnd];
  renderMeta(); renderList(); renderCats(); renderMobile(); syncUrl();
  // refresh hero parts except the focused field
  const t = resultText(r, opts()); const hv = $('#hero-value');
  if (hv) hv.innerHTML = t.parts ? t.parts.map((p) => `${esc(format(p.v, { prec: 'max', fmt: S.fmt }))}<small>${esc(p.u.sym)}</small>`).join(' ') : `${numHtml(t.text)}<small>${esc(t.unitText || '')}</small>`;
  const q2 = $('.u-hero__q'); if (q2) q2.textContent = `${sourceText(r, S.fmt)} =`;
  const f = formulaFor(r, { fmt: S.fmt }); const fe = $('.u-formula'); if (fe && f) fe.textContent = f.main;
  if (!field.hasAttribute('data-out')) { const out = $('.u-num[data-out]'); if (out) out.value = r.target.units.length > 1 ? resultText(r, { prec: 'max', fmt: S.fmt }).copy : copyNum(r.value, { prec: 10, fmt: S.fmt }); }
  else $$('.u-num[data-term]').forEach((x, k) => { if (r.terms[k]) x.value = copyNum(r.terms[k].v, { prec: 'max', fmt: S.fmt }); });
  const ex = $('.u-exact'); if (ex) { ex.className = t.exact ? 'fw-badge fw-badge--accent u-exact' : 'fw-badge u-exact'; ex.innerHTML = t.exact ? `${icon('check', { size: 12 })}Exact` : '≈ Rounded'; }
  field.setSelectionRange(...sel);
}

// ── all units list ──
function rowsFor(g) {
  const cat = g.cat, groups = CAT[cat].groups, rows = [];
  for (const [sys, label] of groups) {
    const ids = unitsOf(cat).filter((id) => UNITS[id].sys === sys);
    const items = ids.map((id) => ({ key: id, units: [UNITS[id]] }));
    for (const comp of COMPOUNDS[cat] || []) {
      const s0 = UNITS[comp[0]].sys; if (s0 !== sys) continue;
      const at = items.findIndex((x) => x.key === comp[comp.length - 1]);
      items.splice(at >= 0 ? at + 1 : items.length, 0, { key: comp.join('+'), units: comp.map((id) => UNITS[id]) });
    }
    if (items.length) rows.push({ sys, label, items });
  }
  return rows;
}
function rowValue(g, units, o = opts()) {
  if (units.length > 1) { const c = formatCompound(g.base, units, o); return { text: c.text, copy: c.copy }; }
  const u = units[0]; const v = fromBase(u, g.base);
  if (!Number.isFinite(v)) return { text: '—', copy: '' };
  if (u.id === 'ratio') return { text: `1:${format(v, o)}`, copy: `1:${copyNum(v, o)}` };
  return { text: format(v, o), copy: `${copyNum(v, o)} ${u.sym}` };
}
function flatKeys(g) { return rowsFor(g).flatMap((gr) => gr.items.map((x) => x.key)); }
function renderList() {
  const el = $('#all'); const g = S.r?.ok ? S.r : S.q.trim() ? S.good : null;
  el.hidden = !g; if (!g) { put(el, ''); return; }
  const stale = !S.r?.ok && !S.soft;
  const groups = rowsFor(g);
  const precOpts = [['auto', 'Auto'], ['3', '3'], ['6', '6'], ['10', '10'], ['max', 'Max']];
  const fmtCur = FORMATS.find((f) => f.id === S.fmt) || FORMATS[0];
  el.classList.toggle('is-stale', stale);
  if (!put(el, `<div class="u-all__head">
      <h2 class="u-all__title">All ${esc(CAT[g.cat].label.toLowerCase())} units</h2>
      <span class="u-all__hint fw-kbd-hint">${kbd('up')}${kbd('down')} change target</span>
      <div class="u-ctrls">
        <span class="u-ctrl"><span class="u-ctrl__label" id="prec-l">Digits</span>
          <div class="fw-seg fw-seg--sm" id="prec" aria-labelledby="prec-l">${precOpts.map(([v, l]) => `<button class="fw-seg__opt" type="button" data-value="${v}" aria-checked="${String(S.prec) === v}">${l}</button>`).join('')}</div></span>
        <span class="u-ctrl"><span class="u-ctrl__label">Format</span>
          <button class="fw-btn fw-btn--sm u-fmt" type="button" id="fmt" aria-haspopup="menu" aria-expanded="false"><span class="u-mono">${esc(fmtCur.label)}</span>${icon('chevron-down', { size: 14 })}</button></span>
      </div>
    </div>
    <div class="u-groups">${groups.map((gr) => `<div class="u-group" role="group" aria-label="${esc(gr.label)}">
      <div class="u-group__label">${esc(gr.label)}</div>
      ${gr.items.map((it) => {
        const v = rowValue(g, it.units); const on = it.key === g.target.key;
        const isIn = it.key === 'in' && !on; const fr = it.key === 'in' ? inchFraction(fromBase(UNITS.in, g.base)) : null;
        const name = it.units.length > 1 ? it.units.map((u) => u.sym).join(' + ') : it.units[0].name;
        return `<div class="u-row ${on ? 'is-target' : ''}" data-key="${it.key}">
          <button class="u-row__main" type="button" aria-pressed="${on}" ${on ? 'aria-current="true"' : ''} data-key="${it.key}" aria-label="${esc(name)}: ${esc(v.text)}${on ? ', current target' : ''}">
            <span class="u-row__sym">${esc(it.units.length > 1 ? it.units.map((u) => u.sym).join('+') : it.units[0].sym)}</span>
            <span class="u-row__name">${esc(it.units.length > 1 ? 'compound' : name)}${it.units[0].note && it.units.length === 1 ? ` <span class="u-row__note">· ${esc(it.units[0].note)}</span>` : ''}</span>
            <span class="u-row__val"><span>${numHtml(v.text)}</span>${fr && !fr.exact && fr.text !== v.text ? `<span class="u-row__frac" title="nearest 1/16 inch">≈ ${esc(fr.text)}</span>` : ''}</span>
          </button>
          <button class="fw-iconbtn fw-iconbtn--sm u-row__copy" type="button" data-copy="${esc(v.copy)}" aria-label="Copy ${esc(v.copy)}" data-tip="Copy ${esc(v.copy)}">${icon('copy')}</button>
        </div>`; }).join('')}
    </div>`).join('')}</div>`)) return;
  enhance(el);
  $('#prec', el).addEventListener('fw-change', (e) => { S.prec = e.detail.value === 'auto' || e.detail.value === 'max' ? e.detail.value : +e.detail.value; store.set('units:prec', S.prec); render(); $('#prec .fw-seg__opt[aria-checked="true"]')?.focus(); });
  $('#fmt', el).onclick = (e) => openMenu(e.currentTarget, FORMATS.map((f) => ({ label: f.label, sub: f.name, checked: f.id === S.fmt, onSelect: () => { reformatQuery(S.fmt, f.id); S.fmt = f.id; store.set('units:fmt', f.id); render(); } })), { placement: 'bottom-end' });
  $$('.u-row__main', el).forEach((b) => b.onclick = () => { setTargetKey(b.dataset.key); });
}
// switching between 1,234.5 and 1.234,5 rewrites decimal marks in the query so the numbers keep their value
function reformatQuery(from, to) {
  const decFrom = from === 'de' ? ',' : '.', decTo = to === 'de' ? ',' : '.';
  if (decFrom === decTo || !S.q) return;
  const r = S.r; if (!r?.ok) return;
  S.q = canonicalWith(r, to); input.value = S.q;
}
function canonicalWith(r, fmt) { return `${sourceText(r, fmt)} in ${targetQuery(r.target.units)}`; }
function setTargetKey(key, { reveal = false } = {}) {
  const units = keyUnits(key); if (!units.length) return;
  if (S.r?.bare) { S.ctx.to = key; render(); }
  else setTargetText(targetQuery(units));
  // keyboard moves keep the target row in view; clicks and the picker never move the page (the result stays put)
  if (reveal) $(`.u-row[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function moveTarget(d) {
  const g = S.r?.ok ? S.r : null; if (!g) return;
  const keys = flatKeys(g); let i = keys.indexOf(g.target.key);
  i = i < 0 ? 0 : Math.max(0, Math.min(keys.length - 1, i + d));
  setTargetKey(keys[i], { reveal: true });
}

// ── categories ──
function renderCats() {
  const el = $('#cats'); const g = S.r?.ok ? S.r : S.q.trim() ? S.good : null;
  el.hidden = !g;
  if (!put(el, CATS.map((c) => `<button class="fw-chip u-cat" type="button" data-cat="${c.id}" aria-pressed="${g?.cat === c.id}">${icon(c.icon, { size: 14 })}${esc(c.label)}</button>`).join(''))) return;
  roving(el, '.u-cat'); $$('.u-cat', el).forEach((b, i, all) => { b.tabIndex = (b.getAttribute('aria-pressed') === 'true' || (i === 0 && !all.some((x) => x.getAttribute('aria-pressed') === 'true'))) ? 0 : -1; });
  $$('.u-cat', el).forEach((b) => b.onclick = () => loadCategory(b.dataset.cat));
  const on = el.querySelector('[aria-pressed="true"]');
  if (on) { const r = on.getBoundingClientRect(), pr = el.getBoundingClientRect(); if (r.right > pr.right || r.left < pr.left) el.scrollTo({ left: on.offsetLeft - 24, behavior: 'smooth' }); }
}
function loadCategory(cat) {
  const ex = CAT[cat].example;
  if (mobile()) { const r = parse(ex, { fmt: S.fmt }); S.ctx = { from: r.terms[0].u.id, to: r.target.key, sticky: true }; set(copyNum(r.terms[0].v, { prec: 'max', fmt: S.fmt }), { push: true }); }
  else { set(ex, { push: true }); input.focus(); const m = /^[\d.,'−-]+/.exec(ex); if (m) input.setSelectionRange(0, m[0].length); }
}

// ── empty state: browse by category ──
function renderEmpty() {
  const el = $('#empty'); const empty = !S.q.trim(); el.hidden = !empty;
  if (!empty) return;
  if (!put(el, `<div class="u-section-head"><h2 class="u-h2">Browse</h2><span class="fw-muted fw-t-sm">${CATS.length} categories, ${Object.keys(UNITS).length} units</span></div>
    <div class="u-browse">${CATS.map((c) => {
      const r = parse(c.example, { fmt: S.fmt }); const t = r.ok ? resultText(r, opts()) : null;
      return `<button class="u-browse__item" type="button" data-cat="${c.id}"><span class="u-browse__icon">${icon(c.icon, { size: 18 })}</span>
        <span class="u-browse__text"><span class="u-browse__label">${esc(c.label)}</span><span class="u-browse__ex">${r.ok ? `${esc(sourceText(r, S.fmt))} = ${numHtml(t.text)}${t.unitText ? ' ' + esc(t.unitText) : ''}` : ''}</span></span></button>`;
    }).join('')}</div>`)) return;
  $$('.u-browse__item', el).forEach((b) => b.onclick = () => loadCategory(b.dataset.cat));
}

// ── aside: pinned + recent ──
const pinKey = (p) => `${p.from}>${p.to}`;
function pairOf(r) { return { from: r.terms.length > 1 && r.terms.every((t) => isLinear(t.u)) ? r.terms.map((t) => t.u.id).join('+') : r.terms[0].u.id, to: r.target.key }; }
function isPinned(r) { const k = pinKey(pairOf(r)); return S.pins.some((p) => pinKey(p) === k); }
const pinLabel = (p) => `${keyUnits(p.from).map((u) => u.sym).join('+')} to ${keyUnits(p.to).map((u) => u.sym).join('+')}`;
const pinHtml = (p) => `${esc(keyUnits(p.from).map((u) => u.sym).join('+'))}<span class="u-arrow" aria-hidden="true">${icon('arrow-left-right', { size: 12 })}</span><span class="fw-sr"> to </span>${esc(keyUnits(p.to).map((u) => u.sym).join('+'))}`;
function pinSub(p) {
  const fu = keyUnits(p.from), tu = keyUnits(p.to); if (!fu.length || !tu.length) return '';
  const r = parse(`1 ${querySym(fu[0])} in ${targetQuery(tu)}`, { fmt: S.fmt }); if (!r.ok) return '';
  const t = resultText(r, opts()); return `1 ${fu[0].sym} = ${t.text}${t.unitText ? ' ' + t.unitText : ''}`;
}
function renderAside() {
  const el = $('#aside');
  const cur = S.r?.ok ? pinKey(pairOf(S.r)) : '';
  if (!put(el, `<section class="u-side">
      <div class="u-section-head"><h2 class="u-h2">Pinned</h2>${S.r?.ok && !isPinned(S.r) ? `<button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" id="pin-cur">${icon('plus')}Pin current</button>` : ''}</div>
      ${S.pins.length ? `<div class="u-pins" data-roving=".u-pin__main" data-orientation="vertical">${S.pins.map((p, i) => `<div class="u-pin ${pinKey(p) === cur ? 'is-current' : ''}">
        <button class="u-pin__main" type="button" data-pin="${i}"><span class="u-pin__icon">${icon(CAT[keyUnits(p.from)[0]?.cat]?.icon || 'ruler', { size: 16 })}</span>
          <span class="u-pin__text"><span class="u-pin__title">${pinHtml(p)}</span><span class="u-pin__sub">${esc(pinSub(p))}</span></span></button>
        <button class="fw-iconbtn fw-iconbtn--sm u-pin__x" type="button" data-unpin="${i}" aria-label="Unpin ${esc(pinLabel(p))}" data-tip="Unpin">${icon('x')}</button></div>`).join('')}</div>`
        : `<p class="fw-t-sm fw-muted u-side__empty">Pin a pair you use often. It stays on this device.</p>`}
    </section>
    <section class="u-side" ${S.recent.length ? '' : 'hidden'}>
      <div class="u-section-head"><h2 class="u-h2">Recent</h2><span class="fw-t-xs fw-muted">On this device · <a href="#" id="clear-recent">Clear</a></span></div>
      <div class="fw-recent u-recent">${S.recent.slice(0, 6).map((x, i) => { const r = parse(x.q, { fmt: S.fmt }); if (!r.ok) return ''; const t = resultText(r, opts());
        return `<a class="fw-recent__item" href="${esc(urlFor(x.q))}" data-recent="${i}"><span class="fw-recent__main"><span class="fw-recent__title u-recent__title">${esc(sourceText(r, S.fmt))} <span class="fw-muted">=</span> ${esc(t.text)}${t.unitText ? ' ' + esc(t.unitText) : ''}</span></span><span class="fw-recent__when">${esc(ago(x.t))}</span></a>`; }).join('')}</div>
    </section>`)) return;
  enhance(el);
  $('#pin-cur', el)?.addEventListener('click', () => togglePin());
  $$('[data-pin]', el).forEach((b) => b.onclick = () => usePin(S.pins[+b.dataset.pin]));
  $$('[data-unpin]', el).forEach((b) => b.onclick = () => unpin(+b.dataset.unpin));
  $$('[data-recent]', el).forEach((a) => a.onclick = (e) => { e.preventDefault(); set(S.recent[+a.dataset.recent].q, { push: true }); if (!isCoarse()) input.focus(); });
  $('#clear-recent', el)?.addEventListener('click', (e) => { e.preventDefault(); const old = S.recent; S.recent = []; store.set('units:recent', []); renderAside(); toast('Recent conversions cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { S.recent = old; store.set('units:recent', old); renderAside(); } } }); });
}
function ago(t) { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`; }
function usePin(p) {
  const fu = keyUnits(p.from), tu = keyUnits(p.to); if (!fu.length) return;
  const cur = S.r?.ok && S.r.cat === fu[0].cat && S.r.terms.length === 1 ? copyNum(S.r.terms[0].v, { prec: 'max', fmt: S.fmt }) : '1';
  if (mobile()) {
    S.ctx = { from: fu[0].id, to: p.to, sticky: true };
    history.pushState({ q: S.q }, '', urlFor(S.q));
    S.q = cur; input.value = cur; render();
    input.focus({ preventScroll: true }); input.select();
  } else {
    const num = cur; set(`${num} ${fu.length > 1 ? fu.map((u) => u.sym).join(' ') : querySym(fu[0])} in ${targetQuery(tu)}`, { push: true });
    input.focus(); input.setSelectionRange(0, num.length);
  }
}
function togglePin() {
  const r = S.r?.ok ? S.r : null; if (!r) return;
  const p = pairOf(r); const k = pinKey(p); const i = S.pins.findIndex((x) => pinKey(x) === k);
  if (i >= 0) { unpin(i); return; }
  S.pins = [p, ...S.pins].slice(0, 12); store.set('units:pins', S.pins); recordRecent(r);
  render(); toast(`Pinned ${pinLabel(p)}`, { type: 'success' });
}
function unpin(i) {
  const old = [...S.pins]; const p = S.pins[i]; S.pins.splice(i, 1); store.set('units:pins', S.pins); render();
  toast(`Unpinned ${pinLabel(p)}`, { type: 'neutral', action: { label: 'Undo', onClick: () => { S.pins = old; store.set('units:pins', old); render(); } } });
}
function recordRecent(r) {
  const q = canonical(r); if (q === S.lastRecorded) return; S.lastRecorded = q;
  S.recent = [{ q, t: Date.now() }, ...S.recent.filter((x) => x.q !== q)].slice(0, 12); store.set('units:recent', S.recent);
}

// ── actions ──
function copyResult(btn) {
  const r = S.r?.ok ? S.r : null; if (!r) return;
  const t = resultText(r, opts());
  copyText(t.copy, btn || $('#copy'), { toastLabel: t.copy });
  recordRecent(r); renderAside();
}
function swap() {
  const r = S.r?.ok ? S.r : null;
  if (!r) { if (S.ctx.from && S.ctx.to && !S.ctx.to.includes('+')) { S.ctx = { from: S.ctx.to, to: S.ctx.from }; render(); } else toast('Type a conversion first, then swap', { type: 'info' }); return; }
  const tr = resultText(r, { prec: 10, fmt: S.fmt });
  const src = fromQuerySym(r);
  if (r.bare && !mobile()) { /* fallthrough to full text */ }
  if (r.bare && mobile()) {
    const v = r.target.units.length > 1 ? null : copyNum(r.value, { prec: 10, fmt: S.fmt });
    S.ctx = { from: r.target.units[0].id, to: r.terms[0].u.id };
    if (v != null) { S.q = v; input.value = v; } render(); flashSwap(); return;
  }
  const left = r.target.units.length > 1 ? tr.copy : r.target.units[0].id === 'ratio' ? tr.copy : `${tr.copy}`;
  set(`${left} in ${src}`, { push: true }); flashSwap();
}
function flashSwap() { const v = $('#hero-value'); if (v) { v.classList.remove('is-swapped'); void v.offsetWidth; v.classList.add('is-swapped'); } }

// ── keyboard ──
function onInputKey(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Enter' && !mod) { e.preventDefault(); if (S.r?.ok) copyResult($('#copy') || $('#mcopy')); return; }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !mod && !e.altKey && S.r?.ok) { e.preventDefault(); moveTarget(e.key === 'ArrowDown' ? 1 : -1); return; }
  if (e.key === 'Tab' && !e.shiftKey && ghost.hint) { e.preventDefault(); acceptGhost(); return; }
}
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); swap(); }
  else if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); togglePin(); }
});

// ── ghost completion (Tab completes a unit name) ──
const ghost = { hint: '' };
function updateGhost() {
  const g = $('#ghost'); const v = input.value;
  ghost.hint = '';
  const atEnd = input.selectionStart === v.length && input.selectionEnd === v.length && document.activeElement === input;
  const m = /(?:^|[\s\d])([A-Za-zÄÖÜäöüß°µ][A-Za-zÄÖÜäöüß/]*)$/.exec(v);
  if (atEnd && m && m[1].length >= 2 && !isCoarse()) {
    const typed = m[1]; const low = typed.toLowerCase();
    const best = searchUnits(typed, { limit: 6 });
    const exactAlias = best.some((u) => [u.sym, u.name, u.plural, ...aliasesOf(u.id)].some((a) => a.toLowerCase() === low));
    if (!exactAlias) {
      for (const u of best) {
        const cand = [u.name, u.plural, u.sym, ...aliasesOf(u.id)].filter((a) => a.toLowerCase().startsWith(low) && a.length > typed.length).sort((a, b) => a.length - b.length)[0];
        if (cand) { ghost.hint = cand.slice(typed.length); break; }
      }
    }
  }
  g.querySelector('.u-ghost__typed').textContent = v;
  g.querySelector('.u-ghost__hint').textContent = ghost.hint;
  g.hidden = !ghost.hint || input.scrollWidth > input.clientWidth + 1;
  if (ghost.hint && !g.hidden) g.querySelector('.u-ghost__hint').dataset.tab = 'Tab';
}
function acceptGhost() { const v = input.value + ghost.hint + ' '; S.q = v; input.value = v; input.setSelectionRange(v.length, v.length); S.typedAt = Date.now(); render(); }

// ───────────────────────────── unit picker (one combobox, popover or bottom sheet) ─────────────────────────────
let pickerSeq = 0;
function openPicker(anchor, { role, term = 0 }) {
  const g = S.r?.ok ? S.r : S.good; if (!g) return;
  const cat = g.cat; const id = 'u-pk-' + ++pickerSeq;
  const curKey = role === 'to' ? g.target.key : g.terms[term].u.id;
  const el = h(`<div class="u-picker">
    <div class="u-picker__search"><div class="fw-inputwrap">${icon('search')}<input class="fw-input" type="text" role="combobox" aria-expanded="true" aria-controls="${id}" aria-autocomplete="list"
      placeholder="Search units: inch, Zoll, ″, Pfund…" aria-label="Search units" autocomplete="off" spellcheck="false"></div></div>
    <div class="u-picker__list" role="listbox" id="${id}" aria-label="${role === 'to' ? 'Convert to' : 'Convert from'}"></div></div>`);
  const list = el.querySelector('.u-picker__list'), search = el.querySelector('input');
  let opts2 = [], active = 0;
  const preview = (key) => { if (role !== 'to') return ''; const units = keyUnits(key); if (units.some((u) => u.cat !== cat)) return ''; return rowValue(g, units).text; };
  const optHtml = (key, units, i, extra = '') => `<div class="u-picker__opt ${key === curKey ? 'is-current' : ''}" role="option" id="${id}-${i}" data-key="${key}" aria-selected="${key === curKey}">
      <span class="u-picker__sym">${esc(units.map((u) => u.sym).join(' + '))}</span><span class="u-picker__name">${esc(units.length > 1 ? 'compound' : units[0].name)}${extra}</span>
      <span class="u-picker__val">${numHtml(preview(key))}</span>${key === curKey ? icon('check', { className: 'u-picker__check' }) : ''}</div>`;
  function draw() {
    const qv = search.value.trim(); let html = ''; opts2 = []; let i = 0;
    const push = (key, units, extra) => { opts2.push(key); return optHtml(key, units, i++, extra); };
    if (!qv) {
      const freq = (FREQUENT[cat] || []).filter((x) => UNITS[x]);
      html += `<div class="u-picker__label">Frequent</div><div class="u-picker__freq" role="group" aria-label="Frequent">${freq.map((x) => { opts2.push(x); return `<span class="u-picker__chip ${x === curKey ? 'is-current' : ''}" role="option" id="${id}-${i++}" data-key="${x}" aria-selected="${x === curKey}">${esc(UNITS[x].sym)}</span>`; }).join('')}</div>`;
      for (const gr of rowsFor({ cat })) {
        const items = role === 'to' ? gr.items : gr.items.filter((x) => x.units.length === 1);
        if (!items.length) continue;
        html += `<div class="u-picker__label">${esc(gr.label)}</div>${items.map((x) => push(x.key, x.units)).join('')}`;
      }
    } else {
      const found = searchUnits(qv, { limit: 30 });
      const inCat = found.filter((u) => u.cat === cat), other = role === 'from' ? found.filter((u) => u.cat !== cat) : [];
      if (inCat.length) html += `<div class="u-picker__label">${esc(CAT[cat].label)}</div>${inCat.map((u) => push(u.id, [u])).join('')}`;
      if (other.length) html += `<div class="u-picker__label">Other categories</div>${other.slice(0, 8).map((u) => push(u.id, [u], ` · ${CAT[u.cat].label}`)).join('')}`;
      if (!html) html = `<div class="u-picker__none">No unit called “${esc(qv)}”${role === 'to' ? ` in ${esc(CAT[cat].label.toLowerCase())}` : ''}. Try the symbol or the German name.</div>`;
    }
    list.innerHTML = html;
    active = Math.max(0, opts2.indexOf(curKey)); if (qv) active = 0;
    mark(false);
  }
  function mark(scroll = true) {
    const nodes = $$('[role=option]', list);
    nodes.forEach((n, k) => n.classList.toggle('is-active', k === active));
    const n = nodes[active]; if (n) { search.setAttribute('aria-activedescendant', n.id); if (scroll) n.scrollIntoView({ block: 'nearest' }); }
  }
  function choose(key) {
    close();
    if (role === 'to') { setTargetKey(key); return; }
    // change a source unit: keep the number, change the unit; a new category gets its default counterpart
    const nu = UNITS[key]; const terms = g.terms.map((t, k) => (k === term ? { v: t.v, u: nu } : t));
    const sameCat = nu.cat === cat;
    const left = (sameCat ? terms : [terms[term]]).map((t) => `${copyNum(t.v, { prec: 'max', fmt: S.fmt })} ${querySym(t.u)}`).join(' ');
    if (S.r?.bare) { S.ctx.from = nu.id; if (!sameCat) S.ctx.to = null; S.ctx.to = sameCat ? S.ctx.to : parse(`1 ${querySym(nu)}`, {}).target?.key; render(); return; }
    set(sameCat ? `${left} in ${targetQuery(g.target.units)}` : left, { push: true });
  }
  list.addEventListener('click', (e) => { const o = e.target.closest('[role=option]'); if (o) choose(o.dataset.key); });
  list.addEventListener('pointermove', (e) => { const o = e.target.closest('[role=option]'); if (!o) return; const k = $$('[role=option]', list).indexOf(o); if (k !== active) { active = k; mark(false); } });
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts2.length) % opts2.length; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (opts2[active]) choose(opts2[active]); }
  });
  draw();
  let close;
  if (mobile()) {
    const sh = openSheet({ title: role === 'to' ? 'Convert to' : 'Convert from', body: el, height: 'half', className: 'u-picker-sheet' });
    close = sh.close;
  } else {
    const p = openPopover(anchor, el, { className: 'u-picker-pop', width: 380, label: role === 'to' ? 'Convert to' : 'Convert from', focus: false });
    close = () => p.close(true);
    search.focus({ preventScroll: true });
  }
  requestAnimationFrame(() => list.querySelector('.is-current')?.scrollIntoView({ block: 'center' }));
}

// ───────────────────────────── mobile: pinned chips + composer pair ─────────────────────────────
function renderMobile() {
  const pins = $('#mpins');
  const cur = S.r?.ok ? pinKey(pairOf(S.r)) : '';
  if (put(pins, `<div class="fw-subchips u-mpins__row" data-roving="button">${S.pins.map((p, i) => `<button class="fw-chip u-mpin" type="button" data-mpin="${i}" aria-pressed="${pinKey(p) === cur}">${icon('pin', { size: 14 })}${pinHtml(p)}</button>`).join('')}
    ${S.r?.ok && !isPinned(S.r) ? `<button class="fw-chip fw-chip--sample u-mpin" type="button" id="mpin-add">${icon('plus', { size: 14 })}Pin ${pinHtml(pairOf(S.r))}</button>` : ''}</div>`)) {
  enhance(pins);
  $$('[data-mpin]', pins).forEach((b) => b.onclick = () => usePin(S.pins[+b.dataset.mpin]));
  $('#mpin-add', pins)?.addEventListener('click', togglePin);
  }
  const g = S.r?.ok ? S.r : S.good;
  const pair = $('#mpair');
  const fromU = g ? g.terms[0].u : UNITS[S.ctx.from] || null, toUs = g ? g.target.units : keyUnits(S.ctx.to);
  const pc = put(pair, fromU ? `<button class="fw-target fw-target--lg u-pill" type="button" data-mp="from" aria-label="From unit: ${esc(fromU.name)}">${esc(g && g.terms.length > 1 ? g.terms.map((t) => t.u.sym).join(' ') : fromU.sym)}${icon('chevron-down', { size: 14 })}</button>
    <button class="fw-iconbtn u-mpair__swap" type="button" data-mp="swap" aria-label="Swap units">${icon('arrow-left-right', { size: 18 })}</button>
    <button class="fw-target fw-target--lg u-pill" type="button" data-mp="to" aria-label="To unit: ${esc(toUs.map((u) => u.name).join(' + '))}">${esc(toUs.map((u) => u.sym).join(' + '))}${icon('chevron-down', { size: 14 })}</button>
    <span class="u-mpair__cat">${g ? `${icon(CAT[g.cat].icon, { size: 14 })}${esc(CAT[g.cat].label)}` : ''}</span>` : `<span class="u-mpair__hint">${icon('ruler', { size: 14 })}Type a conversion or tap a pinned pair</span>`);
  if (pc) $$('[data-mp]', pair).forEach((b) => b.onclick = () => (b.dataset.mp === 'swap' ? swap() : openPicker(b, { role: b.dataset.mp, term: 0 })));
  $('#mcopy').disabled = !S.r?.ok;
}
// keep the composer above the on-screen keyboard and reserve its height at the bottom of the page
const composer = $('#composer');
function fitComposer() {
  const vv = window.visualViewport; const kb = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
  composer.style.setProperty('--u-kb', kb + 'px');
  const hgt = composer.offsetHeight;
  document.body.style.setProperty('--u-composer-h', hgt + 'px');
  document.body.style.setProperty('--toast-offset', (mobile() ? hgt + 8 : 0) + 'px');
}
new ResizeObserver(fitComposer).observe(composer);
window.visualViewport?.addEventListener('resize', fitComposer);
window.visualViewport?.addEventListener('scroll', fitComposer);
addEventListener('resize', () => { fitComposer(); updateGhost(); });

function placeholder() { input.placeholder = mobile() ? 'e.g. 5′3″ in cm · 70 kg to lb' : 'Type a conversion: 5′3″ in cm · 70 kg to lb · −40 °C in °F'; }
addEventListener('resize', placeholder);
// ───────────────────────────── ⌘K on this page: the kit palette answers with units-core ─────────────────────────────
// Kit addition: eval.js answer() should call units-core answerFor(); until then the answer row is upgraded in place here.
new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.('dialog.fw-cmd')) hookCmd(n); }).observe(document.body, { childList: true });
function hookCmd(dlg) {
  const inp = dlg.querySelector('.fw-cmd__input'), list = dlg.querySelector('.fw-cmd__list');
  let ans = null;
  const upgrade = () => {
    ans = answerFor(inp.value, { fmt: S.fmt, prec: S.prec });
    const row = list.querySelector('.fw-cmd__answer'); if (!row || !ans) return;
    row.querySelector('.fw-cmd__answer-q').textContent = ans.q;
    row.querySelector('.fw-cmd__answer-v').innerHTML = `${numHtml(ans.value)}${ans.unit ? ` <small>${esc(ans.unit)}</small>` : ''}`;
    row.dataset.units = '1';
  };
  inp.addEventListener('input', () => queueMicrotask(upgrade));
  inp.addEventListener('keydown', (e) => {
    const row = list.querySelector('.fw-cmd__answer[data-units][aria-selected="true"]');
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || !row || !ans) return;
    e.preventDefault(); e.stopImmediatePropagation();
    copyText(ans.copy); const hint = row.querySelector('.fw-cmd__answer-hints span');
    if (hint) { const old = hint.innerHTML; hint.innerHTML = `${icon('check')} Copied`; row.classList.add('is-copied'); setTimeout(() => { hint.innerHTML = old; row.classList.remove('is-copied'); }, 1500); }
  }, true);
  queueMicrotask(upgrade);
}

// ───────────────────────────── boot ─────────────────────────────
placeholder();
const initial = params.get('q') ?? PRESET[leafId] ?? '';
S.q = initial; input.value = initial;
render();
if (!isCoarse()) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
fitComposer();
window.__units = { S, parse, render, set };
