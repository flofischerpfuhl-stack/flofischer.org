// Share ▸ Clean link. Paste → the clean link is the hero. Every change explained as a chip you can flip.
import { $, $$, esc, icon, enhance, copyText, toast, navigate, kbd, isTyping } from '../kit/shell.js';
import { cleanLink, cleanMessage, isMessage, splitForDisplay, SAMPLES, MESSAGE_SAMPLE, RULES_DATE, RULE_COUNT, SITE_COUNT } from './lib/rules.js';

const SITES = ['Amazon', 'Google', 'Facebook', 'YouTube', 'Spotify', 'Instagram', 'TikTok', 'X', 'LinkedIn', 'HubSpot', 'Reddit', 'eBay'];

export function mount(ctx) {
  const { root, hooks, params } = ctx;
  ctx.renderHeader();
  const coarse = matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
  <div class="cl">
    <div class="fw-paste cl-intake">
      <div class="fw-paste__box">
        <label class="fw-sr" for="cl-in">Link or message</label>
        <textarea class="fw-paste__field" id="cl-in" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Paste a link, or a whole message with links"></textarea>
        <div class="fw-paste__actions">
          <button class="fw-btn fw-btn--sm" type="button" id="cl-paste"><span data-icon="clipboard-paste"></span>Paste</button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" id="cl-clear" aria-label="Clear" data-tip="Clear" hidden><span data-icon="x"></span></button>
        </div>
      </div>
      <div class="fw-paste__meta" id="cl-meta"></div>
    </div>
    <div id="cl-out" aria-live="polite"></div>
  </div>`;
  enhance(root);
  const input = $('#cl-in');
  const S = { over: {}, overMsg: {}, last: '' };

  const meta = (det) => {
    $('#cl-meta').innerHTML = `${det ? `<span class="fw-detect">${icon('scan', { size: 14 })}${esc(det)}</span>` : ''}
      <span class="cl-trust">${icon('lock', { size: 12 })} Cleaned on this device · ${RULE_COUNT} rules for ${SITE_COUNT} sites, updated ${RULES_DATE}</span>`;
  };

  function emptyState() {
    meta('');
    $('#cl-out').innerHTML = `
      <div class="cl-empty">
        ${coarse ? `<button class="fw-btn fw-btn--primary fw-btn--lg cl-bigpaste" type="button" id="cl-bigpaste">${icon('clipboard-paste')}Paste link</button>` : ''}
        <div class="fw-hero fw-hero--empty cl-hero-empty">
          <span class="fw-hero__label">${icon('sparkles')} The clean link appears the moment you paste</span>
          <div class="cl-ghost"><span class="fw-mono">amazon.de/dp/B0CHX1W1XY</span><span class="fw-faint">· 11 trackers removed</span></div>
        </div>
        <div class="cl-try">
          <span class="fw-t-sm fw-muted">Try a real-world link:</span>
          <div class="fw-chips">
            ${[['amazon', 'Amazon product'], ['google', 'Google redirect'], ['youtube', 'YouTube share'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['short', 'Short link'], ['message', 'A message with 3 links']].map(([k, l]) => `<button type="button" class="fw-chip fw-chip--sample" data-sample="${k}">${esc(l)}</button>`).join('')}
          </div>
        </div>
        <section class="cl-know">
          <h2 class="fw-t-sm cl-know__title">Knows the tricks of</h2>
          <p class="cl-know__list">${SITES.map((s) => `<span>${s}</span>`).join('')}<span class="fw-faint">+ utm, fbclid, gclid and ${RULE_COUNT - 60}+ more everywhere</span></p>
          <p class="fw-t-sm fw-muted">Redirect wrappers (Google, Facebook, Outlook Safe Links) are unwrapped offline. Nothing is looked up online, ever.</p>
        </section>
      </div>`;
    enhance($('#cl-out'));
    $('#cl-bigpaste')?.addEventListener('click', pasteFromClipboard);
    ctx.mbar.hide();
  }

  const urlHtml = (url) => { const p = splitForDisplay(url); return `<span class="cl-url__scheme">${esc(p.scheme + p.sub)}</span><span class="cl-url__host">${esc(p.host)}</span><span class="cl-url__rest">${esc(p.rest)}</span>`; };
  const chip = (c) => {
    const nm = c.kind === 'param' ? c.name : c.name;
    const val = c.value ? `=${c.value.length > 18 ? c.value.slice(0, 16) + '…' : c.value}` : '';
    const tip = `${c.reason}${c.value ? ' · ' + c.value.slice(0, 60) : ''} · click to ${c.removed ? 'keep' : 'remove'}`;
    return `<button type="button" class="cl-chip ${c.removed ? 'is-removed' : 'is-kept'} ${c.tracker === false && c.known === false ? 'is-unknown' : ''}" data-key="${esc(c.key)}" aria-pressed="${!c.removed}" data-tip="${esc(tip)}">
      ${icon(c.removed ? 'x' : 'check', { size: 14 })}<span class="cl-chip__name">${esc(nm)}</span><span class="cl-chip__val">${esc(val)}</span></button>`;
  };

  function renderSingle(text) {
    const keep = new Set(Object.entries(S.over).filter(([, v]) => v === 'keep').map(([k]) => k));
    const remove = new Set(Object.entries(S.over).filter(([, v]) => v === 'remove').map(([k]) => k));
    const r = cleanLink(text, { keep, remove });
    if (!r.ok) {
      meta('');
      $('#cl-out').innerHTML = `<div class="fw-alert fw-alert--warning"><span class="fw-alert__icon">${icon('triangle-alert')}</span><div class="fw-alert__body"><strong>That doesn’t look like a link.</strong> Links look like <span class="fw-mono">amazon.de/…</span> or <span class="fw-mono">https://…</span>. Pasting a whole message? Links inside it get cleaned too.</div></div>`;
      ctx.mbar.hide(); return;
    }
    const params = r.changes.filter((c) => c.kind === 'param' || c.kind === 'hash');
    const removedP = params.filter((c) => c.removed), keptP = params.filter((c) => !c.removed);
    const groups = {}; removedP.forEach((c) => { (groups[c.group || 'You removed'] ||= []).push(c); });
    const path = r.changes.find((c) => c.kind === 'path'), unwrap = r.changes.find((c) => c.kind === 'unwrap');
    const n = r.removedCount;
    meta(`Detected: ${r.site ? r.site + ' link' : 'Link'}${r.unwrapped ? ' inside a ' + unwrap.label : ''}${r.short ? ' (short link)' : ''}`);
    const verdict = r.short ? `<span class="fw-verdict fw-verdict--warn">${icon('triangle-alert')} Short link · not expanded</span>`
      : n ? `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} ${n} tracker${n > 1 ? 's' : ''} removed${r.unwrapped ? ' · redirect unwrapped' : ''}</span>`
        : `<span class="fw-verdict fw-verdict--ok">${icon('circle-check')} No trackers we know of</span>`;
    const notes = r.notes.map((x) => `<div class="fw-alert fw-alert--${x.kind === 'warn' ? 'warning' : 'info'} cl-note"><span class="fw-alert__icon">${icon(x.kind === 'warn' ? 'triangle-alert' : 'info')}</span><div class="fw-alert__body">${esc(x.text)}${x.short ? `<div class="fw-alert__actions"><a class="fw-btn fw-btn--sm" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Open short link</a></div>` : ''}</div></div>`).join('');
    $('#cl-out').innerHTML = `
      <div class="fw-hero cl-hero">
        <span class="fw-hero__label">${verdict}</span>
        <a class="cl-url" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" data-tip="Open clean link">${urlHtml(r.url)}</a>
        <div class="fw-hero__sub cl-len"><span class="fw-num">${r.lenBefore}</span> → <strong class="fw-num">${r.lenAfter}</strong> characters${r.added ? '' : ''}</div>
        <div class="fw-hero__actions">
          <button class="fw-btn fw-btn--primary" type="button" id="cl-copy" data-tip-kbd="mod+shift+c">${icon('copy')}<span>Copy</span></button>
          <button class="fw-btn" type="button" id="cl-qr">${icon('qr-code')}QR code</button>
          <button class="fw-btn" type="button" id="cl-share">${icon('share-2')}Share</button>
          <a class="fw-btn fw-btn--ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Open</a>
        </div>
      </div>
      ${notes}
      ${(params.length || path || unwrap) ? `<section class="fw-card cl-changes" aria-label="What changed">
        <div class="cl-changes__head"><h2 class="fw-t-md cl-changes__title">What changed</h2><span class="fw-t-sm fw-muted">${coarse ? 'Tap' : 'Click'} a chip to keep or remove it</span></div>
        ${unwrap ? `<div class="cl-row"><span class="cl-row__label">Redirect</span><div class="cl-row__body"><span class="fw-mono cl-strike">${esc(unwrap.from)}</span> ${icon('arrow-right', { size: 14 })} <span class="fw-mono">${esc(unwrap.to)}</span><span class="fw-faint"> · ${esc(unwrap.reason)}</span></div>
          <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-key="unwrap">${unwrap.removed ? 'Keep redirect' : 'Unwrap'}</button></div>` : ''}
        ${path ? `<div class="cl-row"><span class="cl-row__label">Path</span><div class="cl-row__body"><span class="fw-mono ${path.removed ? 'cl-strike' : ''}">${esc(path.before)}</span> ${icon('arrow-right', { size: 14 })} <span class="fw-mono">${esc(path.after)}</span><span class="fw-faint"> · ${esc(path.label)}</span></div>
          <button class="fw-btn fw-btn--sm fw-btn--ghost" type="button" data-key="path">${path.removed ? 'Keep original' : 'Shorten'}</button></div>` : ''}
        ${Object.entries(groups).map(([g, list]) => `<div class="cl-row"><span class="cl-row__label">${esc(g === 'Everywhere' ? 'Trackers' : g)}</span><div class="cl-row__body cl-chips">${list.map(chip).join('')}</div></div>`).join('')}
        ${keptP.length ? `<div class="cl-row"><span class="cl-row__label">Kept</span><div class="cl-row__body cl-chips">${keptP.map(chip).join('')}<span class="fw-t-xs fw-faint cl-kepthint">${keptP.some((c) => !c.known) ? 'Unknown parameters stay, to be safe.' : 'Needed for the link to work.'}</span></div></div>` : ''}
      </section>` : ''}`;
    enhance($('#cl-out'));
    const copy = (el) => { copyText(r.url, el); };
    $('#cl-copy').onclick = (e) => copy(e.currentTarget);
    $('#cl-qr').onclick = () => navigate('qr-code', { query: { q: r.url } });
    $('#cl-share').onclick = (e) => share(r.url, e.currentTarget);
    $$('[data-key]', $('#cl-out')).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.key; const c = r.changes.find((x) => x.key === k);
      S.over[k] = c.removed ? 'keep' : 'remove';
      const focusKey = k; render(); $(`[data-key="${CSS.escape(focusKey)}"]`, $('#cl-out'))?.focus();
    }));
    S.copy = r.url;
    const actions = ctx.mbar.set({ line: r.url.replace(/^https:\/\/(www\.)?/, ''), sub: r.short ? 'Short link · not expanded' : `${n} tracker${n === 1 ? '' : 's'} removed · ${r.lenBefore} → ${r.lenAfter}`,
      actions: `<button class="fw-iconbtn fw-iconbtn--outline" type="button" data-a="share" aria-label="Share" data-tip="Share">${icon('share-2')}</button><button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy</span></button>` });
    actions.querySelector('[data-a="copy"]').onclick = (e) => copy(e.currentTarget);
    actions.querySelector('[data-a="share"]').onclick = (e) => share(r.url, e.currentTarget);
  }

  function renderMessage(text) {
    const m = cleanMessage(text, S.overMsg);
    meta(`Detected: message with ${m.items.length} link${m.items.length === 1 ? '' : 's'}`);
    const cleanedText = m.text;
    const segs = []; let cur = 0;
    m.items.forEach((it) => { segs.push(esc(text.slice(cur, it.start))); const u = it.r.ok ? (it.text.startsWith('http') ? it.r.url : it.r.url.replace(/^https:\/\//, '')) : it.text; segs.push(`<mark class="cl-mark" data-n="${it.r.ok ? it.r.removedCount : 0}">${esc(u)}</mark>`); cur = it.end; });
    segs.push(esc(text.slice(cur)));
    $('#cl-out').innerHTML = `
      <div class="fw-hero cl-hero">
        <span class="fw-hero__label"><span class="fw-verdict fw-verdict--ok">${icon('circle-check')} ${m.items.length} links cleaned · ${m.total} trackers removed</span></span>
        <div class="cl-msg" id="cl-msg">${segs.join('')}</div>
        <div class="fw-hero__sub"><span class="fw-num">${text.length}</span> → <strong class="fw-num">${cleanedText.length}</strong> characters · your words stay exactly as they were</div>
        <div class="fw-hero__actions">
          <button class="fw-btn fw-btn--primary" type="button" id="cl-copy">${icon('copy')}<span>Copy cleaned text</span></button>
          <button class="fw-btn" type="button" id="cl-share">${icon('share-2')}Share</button>
        </div>
      </div>
      <section class="fw-card cl-links" aria-label="Links in the message">
        ${m.items.map((it, n) => `<div class="cl-link">
          <span class="cl-link__icon">${icon('link', { size: 16 })}</span>
          <div class="cl-link__main"><span class="cl-link__url fw-mono">${it.r.ok ? urlHtml(it.r.url) : esc(it.text)}</span>
          <span class="fw-t-xs fw-muted">${it.r.ok ? `${it.r.site || it.r.host} · ${it.r.removedCount ? `${it.r.removedCount} removed: ${it.r.changes.filter((c) => c.removed).map((c) => c.name || c.kind).slice(0, 6).join(', ')}` : 'no trackers we know of'}${it.r.changes.some((c) => !c.removed && c.kind === 'param') ? ` · kept ${it.r.changes.filter((c) => !c.removed && c.kind === 'param').map((c) => c.name).join(', ')}` : ''}` : 'Not a link'}</span></div>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-copy="${esc(it.r.url || it.text)}" aria-label="Copy link" data-tip="Copy">${icon('copy')}</button>
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-one="${n}" aria-label="Open this link alone" data-tip="Details">${icon('chevron-right')}</button>
        </div>`).join('')}
      </section>`;
    enhance($('#cl-out'));
    $('#cl-copy').onclick = (e) => copyText(cleanedText, e.currentTarget);
    $('#cl-share').onclick = (e) => share(null, e.currentTarget, cleanedText);
    $$('[data-one]').forEach((b) => b.addEventListener('click', () => set(m.items[+b.dataset.one].text)));
    const actions = ctx.mbar.set({ line: `${m.items.length} links cleaned`, sub: `${m.total} trackers removed`, actions: `<button class="fw-btn fw-btn--primary" type="button" data-a="copy">${icon('copy')}<span>Copy text</span></button>` });
    actions.querySelector('[data-a="copy"]').onclick = (e) => copyText(cleanedText, e.currentTarget);
  }

  async function share(url, el, text) {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share(url ? { url } : { text }); return; } catch { return; } }
    copyText(url || text, el); toast(url ? 'Link copied. Paste it anywhere.' : 'Cleaned text copied', { type: 'success' });
  }

  function render() {
    const t = input.value.trim();
    $('#cl-clear').hidden = !t;
    $('#cl-paste').hidden = !!t;
    if (t !== S.last) { S.over = {}; S.overMsg = {}; S.last = t; }
    if (!t) return emptyState();
    if (isMessage(t)) renderMessage(input.value); else renderSingle(t);
  }
  function set(v) { input.value = v; render(); }
  async function pasteFromClipboard() {
    try { const t = await navigator.clipboard.readText(); if (t) set(t); else toast('The clipboard is empty', { type: 'info' }); }
    catch { input.focus(); toast(`Press ${kbd('mod+v').replace(/<[^>]+>/g, '')} to paste`, { type: 'info' }); }
  }
  input.addEventListener('input', render);
  $('#cl-paste').onclick = pasteFromClipboard;
  $('#cl-clear').onclick = () => { const old = input.value; set(''); input.focus(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => set(old) } }); };
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-sample]'); if (!b) return; set(b.dataset.sample === 'message' ? MESSAGE_SAMPLE : SAMPLES[b.dataset.sample]); });
  hooks.onPaste = (t) => { set(t); return true; };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c' && S.copy && input.value.trim()) { e.preventDefault(); copyText(S.copy, $('#cl-copy')); }
  });
  set(params.get('q') || '');
  if (!coarse && !params.get('q')) input.focus();
}
