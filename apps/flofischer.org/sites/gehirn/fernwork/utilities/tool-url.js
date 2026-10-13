// URL Cleaner. Paste → the clean link is the result. Every change is a chip you can flip (ClearURLs-style rules,
// redirect unwrapping, path canonicalisers). A message with several links is cleaned in place.
import { $, $$, esc, icon, enhance, copyText, toast, navigate, store } from '../kit/shell.js';
import { cleanLink, cleanMessage, isMessage, splitForDisplay, SAMPLES, MESSAGE_SAMPLE } from './lib/rules.js';
import { moreHtml, wireMore, remember, readClipboard, isCoarse } from './ui.js';

export function mount(ctx) {
  const { root, hooks, params } = ctx;
  ctx.renderHeader();
  const mem = remember('url');
  const opt = { dropHash: store.get('util:url:dropHash') === true, parts: store.get('util:url:parts') === true };
  root.innerHTML = `
  <div class="cl">
    <div class="fw-paste cl-intake">
      <div class="fw-paste__box">
        <label class="fw-sr" for="cl-in">Link or message</label>
        <textarea class="fw-paste__field" id="cl-in" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Paste a link, or a message with links"></textarea>
        <div class="fw-paste__actions">
          <button class="fw-btn fw-btn--sm" type="button" id="cl-paste"><span data-icon="clipboard-paste"></span>Paste</button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cl-clear" aria-label="Clear" data-tip="Clear" hidden><span data-icon="x"></span></button>
        </div>
      </div>
      <div class="cl-meta"><div class="fw-paste__meta" id="cl-meta"></div>
        ${moreHtml('cl-more', `
          <label class="fw-toggle"><input type="checkbox" id="cl-hash" ${opt.dropHash ? 'checked' : ''}><span>Remove #fragment too</span></label>
          <label class="fw-toggle"><input type="checkbox" id="cl-parts" ${opt.parts ? 'checked' : ''}><span>Show URL parts</span></label>
          ${mem.html()}`)}
      </div>
    </div>
    <div id="cl-out" aria-live="polite"></div>
  </div>`;
  enhance(root);
  wireMore(root);
  const input = $('#cl-in');
  const S = { over: {}, overMsg: {}, last: '', copy: '' };
  const meta = (det) => { $('#cl-meta').innerHTML = det ? `<span class="fw-detect">${icon('scan', { size: 14 })}${esc(det)}</span>` : ''; };

  function emptyState() {
    meta('');
    $('#cl-out').innerHTML = `
      <div class="cl-try"><span class="fw-t-sm fw-muted">Try</span>
        ${[['amazon', 'Amazon product'], ['google', 'Google redirect'], ['youtube', 'YouTube share'], ['instagram', 'Instagram'], ['short', 'Short link'], ['message', 'Message with 3 links']].map(([k, l]) => `<button type="button" class="fw-chip fw-chip--sample" data-sample="${k}">${esc(l)}</button>`).join('')}
      </div>`;
    ctx.mbar.hide();
  }
  const urlHtml = (url) => { const p = splitForDisplay(url); return `<span class="cl-url__scheme">${esc(p.scheme + p.sub)}</span><span class="cl-url__host">${esc(p.host)}</span><span class="cl-url__rest">${esc(p.rest)}</span>`; };
  const chip = (c) => {
    const val = c.value ? `${c.kind === 'hash' && c.name === '#' ? '' : '='}${c.value.length > 18 ? c.value.slice(0, 16) + '…' : c.value}` : '';
    const tip = `${c.reason}${c.value ? ' · ' + c.value.slice(0, 60) : ''} · ${isCoarse() ? 'tap' : 'click'} to ${c.removed ? 'keep' : 'remove'}`;
    return `<button type="button" class="cl-chip ${c.removed ? 'is-removed' : 'is-kept'} ${!c.known ? 'is-unknown' : ''}" data-key="${esc(c.key)}" aria-pressed="${!c.removed}" data-tip="${esc(tip)}">
      ${icon(c.removed ? 'x' : 'check', { size: 14 })}<span class="cl-chip__name">${esc(c.name)}</span><span class="cl-chip__val">${esc(val)}</span></button>`;
  };
  const partsHtml = (url) => {
    const u = new URL(url);
    const rows = [['Protocol', u.protocol], ['Host', u.host], ['Path', u.pathname], ['Query', u.search || '(none)'], ['Fragment', u.hash || '(none)']];
    return `<section class="fw-card cl-parts" aria-label="URL parts"><div class="fw-rows">${rows.map(([l, v]) => `<div class="fw-vrow"><span class="fw-vrow__label">${l}</span><span class="fw-vrow__value">${esc(v)}</span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copy="${esc(v)}" aria-label="Copy ${l}" data-tip="Copy">${icon('copy')}</button></div>`).join('')}</div></section>`;
  };

  function renderSingle(text) {
    const keep = new Set(Object.entries(S.over).filter(([, v]) => v === 'keep').map(([k]) => k));
    const remove = new Set(Object.entries(S.over).filter(([, v]) => v === 'remove').map(([k]) => k));
    const r = cleanLink(text, { keep, remove, dropHash: opt.dropHash });
    if (!r.ok) {
      meta('');
      $('#cl-out').innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body">${r.scheme
        ? `<span><strong>Only web links can be cleaned.</strong> This is a <span class="fw-mono">${esc(r.scheme)}:</span> link; links start with <span class="fw-mono">https://</span> or <span class="fw-mono">http://</span>.</span>`
        : `<span><strong>That doesn’t look like a link.</strong> Links look like <span class="fw-mono">amazon.de/…</span> or <span class="fw-mono">https://…</span>.</span>`}</div></div>`;
      ctx.mbar.hide(); S.copy = ''; return;
    }
    const params = r.changes.filter((c) => c.kind === 'param' || c.kind === 'hash');
    const removedP = params.filter((c) => c.removed), keptP = params.filter((c) => !c.removed);
    const groups = {}; removedP.forEach((c) => { (groups[c.kind === 'hash' ? 'Fragment' : c.group || 'You removed'] ||= []).push(c); });
    const path = r.changes.find((c) => c.kind === 'path'), unwrap = r.changes.find((c) => c.kind === 'unwrap');
    const n = r.removedCount;
    meta(`Detected: ${r.site ? r.site + ' link' : 'Link'}${r.unwrapped ? ' inside a ' + unwrap.label : ''}${r.short ? ' (short link)' : ''}`);
    const verdict = r.short ? `<span class="fw-verdict fw-verdict--warn">${icon('triangle-alert')} Short link · not expanded</span>`
      : n ? `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} ${n} tracker${n > 1 ? 's' : ''} removed${r.unwrapped ? ' · redirect unwrapped' : ''}</span>`
        : `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} No trackers we know of${r.unwrapped ? ' · redirect unwrapped' : ''}</span>`;
    const notes = r.notes.filter((x) => !/^Added https/.test(x.text)).map((x) => `<div class="fw-alert fw-alert--${x.kind === 'warn' ? 'warning' : 'info'} cl-note"><span class="fw-alert__icon">${icon(x.kind === 'warn' ? 'triangle-alert' : 'info')}</span><div class="fw-alert__body">${esc(x.text)}${x.short ? `<div class="fw-alert__actions"><a class="fw-btn fw-btn--sm" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Open short link</a></div>` : ''}</div></div>`).join('');
    $('#cl-out').innerHTML = `
      <div class="fw-hero cl-hero">
        <span class="fw-hero__label">${verdict}</span>
        <a class="cl-url" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" data-tip="Open clean link">${urlHtml(r.url)}</a>
        <div class="fw-hero__sub cl-len"><span class="fw-num">${r.lenBefore}</span> → <strong class="fw-num">${r.lenAfter}</strong> characters</div>
        <div class="fw-hero__actions">
          <button class="fw-btn fw-btn--primary" type="button" id="cl-copy" data-tip-kbd="mod+shift+c">${icon('copy')}<span>Copy</span></button>
          <a class="fw-btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Open</a>
          <button class="fw-btn fw-btn--ghost" type="button" id="cl-qr">${icon('qr-code')}QR code</button>
        </div>
      </div>
      ${notes}
      ${(params.length || path || unwrap) ? `<section class="fw-card cl-changes" aria-label="What changed">
        <div class="cl-changes__head"><h2 class="fw-t-md cl-changes__title">What changed</h2><span class="fw-t-sm fw-muted">${isCoarse() ? 'Tap' : 'Click'} a chip to keep or remove it</span></div>
        ${unwrap ? `<div class="cl-row"><span class="cl-row__label">Redirect</span><div class="cl-row__body"><span class="fw-mono ${unwrap.removed ? 'cl-strike' : ''}">${esc(unwrap.from)}</span> ${icon('arrow-right', { size: 14 })} <span class="fw-mono">${esc(unwrap.to)}</span><span class="fw-faint"> · ${esc(unwrap.reason)}</span></div>
          <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-key="unwrap">${unwrap.removed ? 'Keep redirect' : 'Unwrap'}</button></div>` : ''}
        ${path ? `<div class="cl-row"><span class="cl-row__label">Path</span><div class="cl-row__body"><span class="fw-mono ${path.removed ? 'cl-strike' : ''}">${esc(path.before)}</span> ${icon('arrow-right', { size: 14 })} <span class="fw-mono">${esc(path.after)}</span><span class="fw-faint"> · ${esc(path.label)}</span></div>
          <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-key="path">${path.removed ? 'Keep original' : 'Shorten'}</button></div>` : ''}
        ${Object.entries(groups).map(([g, list]) => `<div class="cl-row"><span class="cl-row__label">${esc(g === 'Everywhere' ? 'Trackers' : g)}</span><div class="cl-row__body cl-chips">${list.map(chip).join('')}</div></div>`).join('')}
        ${keptP.length ? `<div class="cl-row"><span class="cl-row__label">Kept</span><div class="cl-row__body cl-chips">${keptP.map(chip).join('')}<span class="fw-t-xs fw-faint cl-kepthint">${keptP.some((c) => !c.known) ? 'Unknown parameters stay, to be safe.' : 'Needed for the link to work.'}</span></div></div>` : ''}
      </section>` : ''}
      ${opt.parts ? partsHtml(r.url) : ''}`;
    enhance($('#cl-out'));
    $('#cl-copy').onclick = (e) => copyText(r.url, e.currentTarget);
    $('#cl-qr').onclick = () => navigate('qr-generator', { query: { q: r.url } });
    $$('[data-key]', $('#cl-out')).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.key; const c = r.changes.find((x) => x.key === k);
      S.over[k] = c.removed ? 'keep' : 'remove';
      render(); $(`[data-key="${CSS.escape(k)}"]`, $('#cl-out'))?.focus();
    }));
    S.copy = r.url;
    const a = ctx.mbar.set({ line: r.url.replace(/^https:\/\/(www\.)?/, ''), sub: r.short ? 'Short link · not expanded' : `${n} tracker${n === 1 ? '' : 's'} removed · ${r.lenBefore} → ${r.lenAfter}`,
      actions: `<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="share" aria-label="Share" data-tip="Share">${icon('share-2')}</button><button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = (e) => copyText(r.url, e.currentTarget);
    a.querySelector('[data-a="share"]').onclick = (e) => share(r.url, e.currentTarget);
  }

  function renderMessage(text) {
    const m = cleanMessage(text, S.overMsg, { dropHash: opt.dropHash });
    meta(`Detected: message with ${m.items.length} link${m.items.length === 1 ? '' : 's'}`);
    const segs = []; let cur = 0;
    m.items.forEach((it) => { segs.push(esc(text.slice(cur, it.start))); const u = it.r.ok ? (it.text.startsWith('http') ? it.r.url : it.r.url.replace(/^https:\/\//, '')) : it.text; segs.push(`<mark class="cl-mark">${esc(u)}</mark>`); cur = it.end; });
    segs.push(esc(text.slice(cur)));
    $('#cl-out').innerHTML = `
      <div class="fw-hero cl-hero">
        <span class="fw-hero__label"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} ${m.items.length} links cleaned · ${m.total} trackers removed</span></span>
        <div class="cl-msg">${segs.join('')}</div>
        <div class="fw-hero__sub"><span class="fw-num">${text.length}</span> → <strong class="fw-num">${m.text.length}</strong> characters · your words stay as they were</div>
        <div class="fw-hero__actions"><button class="fw-btn fw-btn--primary" type="button" id="cl-copy">${icon('copy')}<span>Copy cleaned text</span></button></div>
      </div>
      <section class="fw-card cl-links" aria-label="Links in the message">
        ${m.items.map((it, n) => `<div class="cl-link">
          <span class="cl-link__icon">${icon('link', { size: 16 })}</span>
          <div class="cl-link__main"><span class="cl-link__url fw-mono">${it.r.ok ? urlHtml(it.r.url) : esc(it.text)}</span>
          <span class="fw-t-xs fw-muted">${it.r.ok ? `${esc(it.r.site || it.r.host)} · ${it.r.removedCount ? `${it.r.removedCount} removed` : 'no trackers we know of'}` : 'Not a link'}</span></div>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copy="${esc(it.r.url || it.text)}" aria-label="Copy link" data-tip="Copy">${icon('copy')}</button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-one="${n}" aria-label="Show what changed in this link" data-tip="Details">${icon('chevron-right')}</button>
        </div>`).join('')}
      </section>`;
    enhance($('#cl-out'));
    $('#cl-copy').onclick = (e) => copyText(m.text, e.currentTarget);
    $$('[data-one]').forEach((b) => b.addEventListener('click', () => set(m.items[+b.dataset.one].text)));
    S.copy = m.text;
    const a = ctx.mbar.set({ line: `${m.items.length} links cleaned`, sub: `${m.total} trackers removed`, actions: `<button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy text</span></button>` });
    a.querySelector('[data-a="copy"]').onclick = (e) => copyText(m.text, e.currentTarget);
  }

  async function share(url, el) {
    if (navigator.share && isCoarse()) { try { await navigator.share({ url }); } catch { /* cancelled */ } return; }
    copyText(url, el);
  }
  function render() {
    const t = input.value.trim();
    $('#cl-clear').hidden = !t; $('#cl-paste').hidden = !!t;
    if (t !== S.last) { S.over = {}; S.overMsg = {}; S.last = t; }
    mem.save(input.value);
    if (!t) { S.copy = ''; return emptyState(); }
    if (isMessage(t)) renderMessage(input.value); else renderSingle(t);
  }
  function set(v) { input.value = v; render(); }
  input.addEventListener('input', render);
  $('#cl-paste').onclick = async () => { const t = await readClipboard('a link'); if (t) set(t); else input.focus(); };
  $('#cl-clear').onclick = () => { const old = input.value; set(''); input.focus(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }); };
  $('#cl-hash').onchange = (e) => { opt.dropHash = e.target.checked; store.set('util:url:dropHash', opt.dropHash); S.over = {}; render(); };
  $('#cl-parts').onchange = (e) => { opt.parts = e.target.checked; store.set('util:url:parts', opt.parts); render(); };
  mem.wire(root, () => input.value);
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-sample]'); if (!b) return; set(b.dataset.sample === 'message' ? MESSAGE_SAMPLE : SAMPLES[b.dataset.sample]); });
  hooks.onPaste = (t) => { set(t); return true; };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c' && S.copy) { e.preventDefault(); copyText(S.copy, $('#cl-copy')); }
  });
  set(params.get('q') || mem.load() || '');
  if (!isCoarse() && !params.get('q')) input.focus();
}
