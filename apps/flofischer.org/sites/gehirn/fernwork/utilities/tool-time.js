// Timestamp. One input takes any timestamp or date (Unix s/ms/µs/ns, ISO 8601, RFC 2822, logs, "tomorrow 9am"),
// or pick a date and time. Result: the time in your chosen zone + every format with copy. DST cases are asked, not guessed.
import { $, $$, esc, icon, enhance, copyText, toast, openMenu, openPopover, openSheet, store, isTyping, hasLayers, h } from '../kit/shell.js';
import * as T from './lib/timelib.js';
import { moreHtml, wireMore, remember, readClipboard, isCoarse, isPhone } from './ui.js';

const { pad } = T;

export function mount(ctx) {
  const { root, hooks, params } = ctx;
  const mem = remember('time');
  const S = { input: '', unit: null, pick: 0, zone: store.get('util:time:zone') || T.LOCAL_TZ, res: null };
  if (!T.ALL_ZONES.includes(S.zone)) S.zone = T.LOCAL_TZ;
  ctx.renderHeader({ aside: `<button class="tm-now" type="button" id="tm-now" data-tip="Set to now" data-tip-kbd="n" aria-label="Set to now"></button>` });
  root.innerHTML = `
  <div class="tm">
    <div class="fw-paste tm-box">
      <div class="fw-paste__box">
        <label class="fw-sr" for="tm-in">Timestamp or date</label>
        <textarea class="fw-paste__field" id="tm-in" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="1791879300, 2026-10-13T08:15:00Z or a date"></textarea>
        <div class="fw-paste__actions">
          <button class="fw-btn fw-btn--sm" type="button" id="tm-nowbtn">${icon('clock')}Now</button>
          <button class="fw-btn fw-btn--sm" type="button" id="tm-paste"><span data-icon="clipboard-paste"></span>Paste</button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="tm-clear" aria-label="Clear" data-tip="Clear" hidden><span data-icon="x"></span></button>
        </div>
      </div>
      <div class="tm-meta">
        <div class="fw-paste__meta" id="tm-meta"></div>
        <div class="tm-pickrow">
          <label class="tm-pick"><span class="fw-sr">Pick a date and time</span>${icon('calendar-clock', { size: 16 })}<input class="tm-pick__in" type="datetime-local" step="1" id="tm-local" aria-label="Pick a date and time in the selected time zone"></label>
          <button class="fw-btn fw-btn--sm fw-btn--subtle tm-zonebtn" type="button" id="tm-zone" aria-haspopup="dialog">${icon('globe', { size: 14 })}<span id="tm-zone-l"></span>${icon('chevron-down', { size: 14 })}</button>
          ${moreHtml('tm-more', `<div class="tm-moreopts">${mem.html()}</div>`)}
        </div>
      </div>
    </div>
    <div id="tm-alert"></div>
    <div id="tm-out" class="tm-out" aria-live="polite"></div>
  </div>`;
  enhance(root);
  wireMore(root);
  mem.wire(root, () => S.input);
  const field = $('#tm-in');
  const sync = () => { const has = !!field.value.trim(); $('#tm-clear').hidden = !has; $('#tm-paste').hidden = has; };
  function set(v) { field.value = v; S.input = v; S.unit = null; S.pick = 0; sync(); update(); }
  field.addEventListener('input', () => { S.input = field.value; S.unit = null; S.pick = 0; sync(); update(); });
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !/\n/.test(field.value)) e.preventDefault(); });
  const setNow = () => set(String(Math.floor(Date.now() / 1000)));
  $('#tm-nowbtn').onclick = setNow; $('#tm-now').onclick = setNow;
  $('#tm-paste').onclick = async () => { const t = await readClipboard('a timestamp'); if (t) set(t.trim()); else field.focus(); };
  $('#tm-clear').onclick = () => { const old = field.value; set(''); field.focus(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }); };
  $('#tm-local').addEventListener('input', (e) => { const v = e.target.value; if (!v) return; const iso = v.length === 16 ? v + ':00' : v; set(iso.replace('T', ' ')); });
  $('#tm-zone').onclick = (e) => zonePicker(e.currentTarget, (tz) => { S.zone = tz; store.set('util:time:zone', tz); update(); });
  hooks.onPaste = (t) => { set(t.trim()); return true; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping() && !hasLayers()) { e.preventDefault(); setNow(); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c' && S.copyMain) { e.preventDefault(); copyText(S.copyMain, $('#tm-copy')); }
  });
  ctx.shell.setCommands?.([{ id: 'tm-now', label: 'Set to now', icon: 'clock', kbd: 'n', run: setNow }, { id: 'tm-zone', label: 'Change time zone', icon: 'globe', run: () => $('#tm-zone').click() }]);

  function tick() {
    const n = Date.now(); const p = T.partsIn(S.zone, n);
    $('#tm-now').innerHTML = `${icon('clock', { size: 14 })}<span>Now <b class="fw-num">${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}</b> <span class="tm-now__unix fw-num">${Math.floor(n / 1000)}</span></span>`;
    $$('[data-rel]').forEach((e) => { e.textContent = T.relHuman(+e.dataset.rel, { parts: 2 }); });
  }
  setInterval(tick, 1000); tick();

  function zonePicker(anchor, onPick) {
    const now = Date.now();
    const content = h(`<div class="tm-picker"><div class="fw-inputwrap"><span data-icon="search"></span><input class="fw-input" placeholder="City, zone or UTC+2" aria-label="Search time zones"></div><div class="tm-picker__list" role="listbox" aria-label="Time zones"></div></div>`);
    enhance(content);
    const list = content.querySelector('.tm-picker__list'); const inp = content.querySelector('input');
    const draw = () => {
      const q = inp.value.toLowerCase().trim();
      const hits = T.ALL_ZONES.filter((z) => !q || z.toLowerCase().replace(/_/g, ' ').includes(q) || T.zoneAbbr(z, now).toLowerCase() === q || T.fmtOffsetShort(T.offsetMin(z, now)).toLowerCase().replace('−', '-') === q.replace('−', '-')).slice(0, 120);
      list.innerHTML = hits.map((z) => `<button type="button" class="tm-picker__opt" role="option" aria-selected="${z === S.zone}" data-tz="${esc(z)}"><span>${esc(T.cityOf(z))}${z === T.LOCAL_TZ ? ' <span class="fw-faint">· this device</span>' : ''}</span><span class="fw-faint fw-t-xs">${esc(z.includes('/') ? z.split('/')[0] : '')}</span><span class="fw-mono fw-t-sm">${esc(T.fmtOffsetShort(T.offsetMin(z, now)))}</span></button>`).join('') || '<div class="fw-faint fw-t-sm tm-picker__none">No match</div>';
    };
    draw(); inp.addEventListener('input', draw);
    const p = isPhone() ? openSheet({ title: 'Time zone', body: content, height: 'half' }) : openPopover(anchor, content, { placement: 'bottom-start', width: 320, label: 'Time zone' });
    setTimeout(() => inp.focus(), 30);
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-tz]'); if (b) { p.close(); onPick(b.dataset.tz); } });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('[data-tz]')?.click(); });
  }

  function update() {
    mem.save(S.input);
    $('#tm-zone-l').textContent = `${T.cityOf(S.zone)} · ${T.zoneAbbr(S.zone, Date.now())}`;
    const lines = S.input.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length >= 2) return renderLog(lines);
    const r = S.input.trim() ? T.parseTime(S.input, { zone: S.zone, unit: S.unit, pick: S.pick }) : null;
    S.res = r; renderMeta(r);
    if (!r) return renderEmpty();
    if (r.error) return renderError(r.why);
    render(r);
  }
  function renderMeta(r) {
    const meta = $('#tm-meta');
    if (!r || r.error) { meta.innerHTML = ''; return; }
    const zoneChip = r.epoch ? '' : r.natural ? '' : r.zoneGiven
      ? `<span class="tm-zone is-given">${icon('globe', { size: 14 })}Zone in input: ${esc(r.zoneText && !/^[+-−]/.test(r.zoneText) ? r.zoneText.toUpperCase() + ' · ' : '')}${esc(T.fmtOffset(r.off ?? 0))}</span>`
      : `<span class="tm-zone is-assumed">${icon('globe', { size: 14 })}No zone given → read as ${esc(T.cityOf(S.zone))} time</span>`;
    meta.innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>Detected: ${esc(r.kind)}</span>${r.epoch ? '<button type="button" id="tm-unit" aria-haspopup="menu">change</button>' : ''}</span>${zoneChip}`;
    $('#tm-unit')?.addEventListener('click', (e) => openMenu(e.currentTarget, [{ group: 'Read the number as', items: ['s', 'ms', 'µs', 'ns'].map((u) => ({ label: `Unix ${T.EPOCH_UNITS[u]}`, hint: u === r.auto ? 'by length' : '', checked: (S.unit || r.auto) === u, onSelect: () => { S.unit = u; update(); } })) }]));
  }
  function rows(ms, r) {
    const tz = S.zone; const p = T.partsIn(tz, ms); const wk = T.isoWeek(p.y, p.mo, p.d);
    return [
      ['Unix seconds', String(Math.floor(ms / 1000)), 's'],
      ['Unix milliseconds', String(Math.floor(ms)), 'ms'],
      r.sub ? ['Unix nanoseconds', `${Math.floor(ms)}${(r.sub + '000000').slice(0, 6)}`, 'ns'] : null,
      ['ISO 8601 (UTC)', new Date(ms).toISOString()],
      [`ISO 8601 (${T.cityOf(tz)})`, T.isoIn(ms, tz)],
      ['RFC 2822', T.rfc2822(ms, tz)],
      ['UTC', new Date(ms).toUTCString()],
      ['ISO week', `${wk.wy}-W${pad(wk.w)}`],
      ['Day of year', String(T.dayOfYear(p.y, p.mo, p.d))],
      ['Relative', T.relHuman(ms, { parts: 2 }), null, true],
    ].filter(Boolean);
  }
  function render(r) {
    const ms = r.ms; const tz = S.zone; const p = T.partsIn(tz, ms); const off = T.offsetMin(tz, ms);
    const al = $('#tm-alert');
    if (r.warn) al.innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${esc(r.warn)}<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" id="tm-fix">Read as ${esc(T.EPOCH_UNITS[r.fixUnit])}</button></div></div></div>`;
    else if (r.cands?.length > 1) {
      const [a, b] = r.cands; const w = r.wall;
      al.innerHTML = `<div class="fw-alert fw-alert--info"><span class="fw-alert__icon">${icon('clock')}</span><div class="fw-alert__body"><span><b>${pad(w.hh)}:${pad(w.mi)} happens twice in ${esc(T.cityOf(S.zone))} on ${w.d} ${T.MONN[w.mo - 1]} ${w.y}</b>: the clocks go back. Which one?</span>
        <div class="fw-alert__actions"><div class="fw-seg fw-seg--sm" role="radiogroup" id="tm-pickocc" aria-label="Which occurrence">${[a, b].map((c, i) => `<button class="fw-seg__opt" role="radio" type="button" data-value="${i}" aria-checked="${S.pick === i}">${i ? 'Later' : 'Earlier'} · ${esc(T.zoneAbbr(S.zone, c))}</button>`).join('')}</div></div></div></div>`;
    } else if (r.gap) {
      const w = r.wall; al.innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><span><b>${pad(w.hh)}:${pad(w.mi)} doesn’t exist in ${esc(T.cityOf(S.zone))} on ${w.d} ${T.MONN[w.mo - 1]} ${w.y}</b>: the clocks jump forward. Showing ${pad(p.h)}:${pad(p.mi)} ${esc(T.zoneAbbr(S.zone, ms))}.</span></div></div>`;
    } else al.innerHTML = '';
    enhance(al);
    $('#tm-fix')?.addEventListener('click', () => { S.unit = r.fixUnit; update(); });
    $('#tm-pickocc')?.addEventListener('fw-change', (e) => { S.pick = +e.detail.value; update(); });

    const rs = rows(ms, r);
    S.copyMain = r.epoch ? T.isoIn(ms, tz) : String(Math.floor(ms / 1000));
    const copyLabel = r.epoch ? 'Copy ISO' : 'Copy Unix';
    const frac = r.sub ? `.${pad(Math.floor(ms % 1000), 3)}${r.sub}` : (ms % 1000 || r.prec || (r.epoch && r.unit !== 's')) ? `.${pad(Math.floor(((ms % 1000) + 1000) % 1000), 3)}` : '';
    const isInput = (row) => r.epoch && row[2] === { s: 's', ms: 'ms', 'µs': 'ns', ns: 'ns' }[r.unit];
    $('#tm-out').innerHTML = `<section class="fw-hero tm-hero">
        <span class="fw-hero__label">${T.DAYN[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]}, ${p.d} ${T.MONN[p.mo - 1]} ${p.y}</span>
        <div class="fw-hero__value tm-clock">${pad(p.h)}:${pad(p.mi)}<span class="tm-sec">:${pad(p.s)}${esc(frac)}</span></div>
        <div class="tm-zoneline"><span>${esc(T.cityOf(tz))} · ${esc(T.zoneAbbr(tz, ms))} · UTC${esc(T.fmtOffset(off))}</span><span class="tm-rel" data-rel="${ms}">${esc(T.relHuman(ms, { parts: 2 }))}</span></div>
        <div class="fw-hero__actions"><button class="fw-btn fw-btn--primary" type="button" id="tm-copy" data-tip-kbd="mod+shift+c">${icon('copy')}<span>${copyLabel}</span></button></div>
      </section>
      <div class="fw-rows tm-rows">${rs.map((row) => `<div class="fw-vrow ${isInput(row) ? 'is-input' : ''}"><span class="fw-vrow__label">${esc(row[0])}</span><span class="fw-vrow__value ${row[3] ? 'fw-vrow__value--sans' : ''}" ${row[3] ? `data-rel="${ms}"` : ''}>${esc(row[1])}</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copy="${esc(row[1])}" aria-label="Copy ${esc(row[0])}" data-tip="Copy">${icon('copy')}</button></div>`).join('')}</div>`;
    enhance($('#tm-out'));
    $('#tm-copy').onclick = (e) => copyText(S.copyMain, e.currentTarget);
    if (document.activeElement !== $('#tm-local')) $('#tm-local').value = T.localInputValue(ms, tz);
    const a = ctx.mbar.set({ line: `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} · ${p.d} ${T.MONN[p.mo - 1]} ${p.y}`, sub: `${T.cityOf(tz)} · ${T.relHuman(ms)}`, actions: `<button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>${copyLabel}</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = (e) => copyText(S.copyMain, e.currentTarget);
  }
  function renderLog(lines) {
    $('#tm-alert').innerHTML = ''; S.copyMain = '';
    const found = lines.map((l) => ({ l, r: T.findInLine(l, { zone: S.zone }) }));
    const n = found.filter((x) => x.r).length;
    $('#tm-meta').innerHTML = `<span class="fw-detect">${icon('scan', { size: 14 })}<span>Detected: ${n} timestamp${n === 1 ? '' : 's'} in ${lines.length} lines</span></span>`;
    let prev = null;
    $('#tm-out').innerHTML = `<section class="fw-card tm-log"><div class="tm-log__head"><h2>Each line in ${esc(T.cityOf(S.zone))} time</h2></div>
      <div class="tm-log__rows">${found.map(({ l, r }) => {
        if (!r) return `<div class="tm-logrow is-none"><span class="tm-logrow__when">—</span><code class="tm-logrow__line">${esc(l)}</code><span></span></div>`;
        const gap = prev != null ? r.ms - prev : null; prev = r.ms; const p = T.partsIn(S.zone, r.ms);
        const hl = esc(l.slice(0, r.idx)) + `<mark>${esc(r.match)}</mark>` + esc(l.slice(r.idx + r.match.length));
        return `<div class="tm-logrow"><span class="tm-logrow__when fw-num">${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}.${pad(p.ms, 3)}</span><code class="tm-logrow__line">${hl}</code><span class="tm-logrow__gap fw-num ${gap > 2000 ? 'is-slow' : ''}">${gap == null ? 'start' : `+${gap >= 1000 ? (gap / 1000).toFixed(gap >= 10000 ? 1 : 3) + ' s' : Math.round(gap) + ' ms'}`}</span></div>`;
      }).join('')}</div></section>`;
    ctx.mbar.hide();
  }
  function renderError(why) {
    $('#tm-alert').innerHTML = ''; S.copyMain = ''; ctx.mbar.hide();
    $('#tm-out').innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><span><b>${esc(why || 'Can’t read this as a time.')}</b> Try a Unix number (1791879300), an ISO date (2026-10-13T08:15:00Z) or RFC 2822 (Tue, 13 Oct 2026 08:15:00 +0200).</span></div></div>`;
  }
  function renderEmpty() {
    $('#tm-alert').innerHTML = ''; S.copyMain = ''; ctx.mbar.hide();
    const now = Date.now();
    const ex = [String(Math.floor(now / 1000)), String(now), '2026-10-13T08:15:00Z', 'Tue, 13 Oct 2026 08:15:00 +0200', '2026-10-25 02:30', 'tomorrow 9am'];
    $('#tm-out').innerHTML = `<div class="tm-examples"><span class="fw-t-sm fw-muted">Try</span>${ex.map((x) => `<button class="fw-chip fw-chip--sample fw-mono" type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    $$('[data-ex]').forEach((b) => (b.onclick = () => set(b.dataset.ex)));
  }

  const hash = location.hash.slice(1);
  set(params.get('q') || (/^\d{9,19}$/.test(hash) ? hash : '') || mem.load() || String(Math.floor(Date.now() / 1000)));
  if (!isCoarse()) { field.focus(); field.select(); }
}
