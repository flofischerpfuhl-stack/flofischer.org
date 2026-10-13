// ASCII Banner: type text → every FIGlet font at once as a live gallery; pick one, copy it. Wrap width, letter
// spacing and image theme sit behind More options. Fonts are vendored (same origin).
import {
  $, $$, h, esc, icon, enhance, toast, openMenu, copyText, settings, keeper, iconBtn, pickFile, readFileText, download, downloadBlob,
  moreOptions, moreBtn, mobileBar, debounce, isMobile,
} from './ui.js';

let api = {};
export const config = {
  accept: ['text'],
  commands: [
    { id: 'banner-copy', label: 'Copy banner', icon: 'copy', run: () => api.copy?.() },
    { id: 'banner-png', label: 'Download banner as PNG', icon: 'image', run: () => api.dl?.('png') },
  ],
};
const FONTS = ['Standard', 'Slant', 'Big', 'Small', 'Block', 'Banner', '3-D', 'Digital', 'Doom', 'Ghost', 'Graffiti', 'Isometric1', 'Ogre', 'Rectangles', 'Roman', 'Shadow', 'Speed', 'Stop', 'Thin', 'Tombstone', 'Univers', 'Whimsy'];
const THEMES = { paper: { bg: '#ffffff', fg: '#111111', label: 'Paper' }, dark: { bg: '#121214', fg: '#ededed', label: 'Dark' }, terminal: { bg: '#07110b', fg: '#4ade80', label: 'Terminal' } };
const LAYOUTS = [['fitted', 'Tight'], ['default', 'Normal'], ['full', 'Wide']];

function loadScript(src) { return new Promise((res, rej) => { if (window.figlet) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); }); }

export async function mount(root, { params }) {
  const S = settings('banner', { font: 'Slant', layout: 'fitted', wrap: true, width: 80, theme: 'paper' });
  root.innerHTML = `
    <div class="tx-bigin"><label class="fw-sr" for="b-text">Text</label><textarea id="b-text" rows="1" spellcheck="false" autocomplete="off" placeholder="Type your text"></textarea>
      ${iconBtn('b-open', 'folder-open', 'Load text from a file')}${iconBtn('b-clear', 'x', 'Clear')}</div>
    <div class="tx-bar">
      <label class="fw-inputwrap tx-filter"><span data-icon="search"></span><input class="fw-input" id="b-filter" type="search" placeholder="Filter ${FONTS.length} fonts" aria-label="Filter fonts"></label>
      <span class="fw-spacer"></span>${moreBtn()}
    </div>
    <div class="tx-note" id="b-note" hidden></div>
    <div class="tx-gallery" id="b-gal" role="radiogroup" aria-label="Fonts"></div>`;
  enhance(root);
  await loadScript('vendor/figlet/figlet.js');
  const figlet = window.figlet;
  await Promise.all(FONTS.map(async (f) => figlet.parseFont(f, await (await fetch(`vendor/figlet/fonts/${f}.flf`)).text())));
  const input = $('#b-text');
  const keep = keeper('banner', { get: () => input.value, set: (t) => { input.value = t; } });
  input.value = params.get('q') || 'Hello';
  keep.restore();
  let query = '';

  const art = (font, text = input.value) => {
    try { return figlet.textSync(text || ' ', { font, horizontalLayout: S.layout, width: S.wrap ? S.width : 1e6, whitespaceBreak: true }).replace(/\s+$/gm, '').replace(/^\n+|\n+$/g, ''); } catch { return ''; }
  };
  function missing(font) { const out = []; for (const ch of new Set([...input.value])) { if (/\s/.test(ch)) continue; let a = ''; try { a = figlet.textSync(ch, { font }); } catch { /* */ } if (!a.trim()) out.push(ch); } return out; }

  function render() {
    const list = FONTS.filter((f) => f.toLowerCase().includes(query));
    $('#b-gal').innerHTML = list.map((f) => `<div class="tx-card" role="radio" tabindex="${f === S.font ? 0 : -1}" aria-checked="${f === S.font}" data-font="${f}" aria-label="${f}">
        <div class="tx-card__head"><span class="tx-card__name">${f}</span><span class="tx-card__acts">
          <button class="fw-iconbtn fw-iconbtn--sm" type="button" data-more aria-label="Export ${f}" data-tip="Download / Markdown">${icon('download')}</button>
          <button class="fw-btn fw-btn--primary fw-btn--sm" type="button" data-copy-art>${icon('copy')}<span>Copy</span></button></span></div>
        <pre class="tx-card__art" aria-hidden="true">${esc(art(f)) || '&nbsp;'}</pre></div>`).join('') || `<p class="tx-none">No font matches “${esc(query)}”.</p>`;
    enhance($('#b-gal')); fit();
    const miss = missing(S.font); const note = $('#b-note');
    note.hidden = !miss.length;
    if (miss.length) note.innerHTML = `${icon('info', { size: 14 })}<span>${miss.length === 1 ? 'This character isn’t' : 'These characters aren’t'} in ${esc(S.font)} and will be left out: <b class="fw-mono">${miss.map(esc).join(' ')}</b></span>`;
    bar();
  }
  function fit() {
    $$('.tx-card__art').forEach((pre) => {
      const cols = Math.max(1, ...pre.textContent.split('\n').map((l) => [...l].length));
      const fs = Math.max(4, Math.min(12, (pre.clientWidth - 2) / (cols * 0.6)));
      pre.style.fontSize = fs.toFixed(2) + 'px';
    });
  }
  new ResizeObserver(debounce(fit, 50)).observe($('#b-gal'));
  function select(f, focus) {
    S.font = f; S.save();
    $$('.tx-card').forEach((c) => { const on = c.dataset.font === f; c.setAttribute('aria-checked', String(on)); c.tabIndex = on ? 0 : -1; if (on && focus) c.focus(); });
    const miss = missing(f); $('#b-note').hidden = !miss.length; if (miss.length) $('#b-note').innerHTML = `${icon('info', { size: 14 })}<span>${miss.length === 1 ? 'This character isn’t' : 'These characters aren’t'} in ${esc(f)} and will be left out: <b class="fw-mono">${miss.map(esc).join(' ')}</b></span>`;
    bar();
  }
  $('#b-gal').addEventListener('click', (e) => {
    const card = e.target.closest('.tx-card'); if (!card) return;
    if (e.target.closest('[data-copy-art]')) { copy(e.target.closest('button')); return; }
    if (e.target.closest('[data-more]')) { exportMenu(e.target.closest('button')); return; }
    select(card.dataset.font);
  });
  $('#b-gal').addEventListener('keydown', (e) => {
    const cards = $$('.tx-card'); const i = cards.findIndex((c) => c.dataset.font === S.font);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const n = cards[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length]; select(n.dataset.font, true); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tx-card')) { e.preventDefault(); copy(e.target.querySelector('[data-copy-art]')); }
  });

  // ── export ──
  const out = () => art(S.font);
  const base = () => `${(input.value || 'ascii').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ascii'}-${S.font.toLowerCase()}`;
  function copy(btn) { copyText(out(), btn, { toastLabel: `${S.font} banner` }); }
  function dl(kind) {
    const t = out();
    if (kind === 'txt') return download(t + '\n', `${base()}.txt`);
    if (kind === 'html') return download(`<!doctype html><meta charset="utf-8"><title>${esc(base())}</title><body style="margin:0;background:${THEMES[S.theme].bg}"><pre style="margin:0;padding:24px;font:14px/1.15 ui-monospace,Menlo,monospace;color:${THEMES[S.theme].fg}">${esc(t)}</pre>`, `${base()}.html`, 'text/html');
    const lines = t.split('\n'); const fs = 16, lh = Math.round(fs * 1.15), pad = 24; const c = document.createElement('canvas'); const ctx = c.getContext('2d');
    ctx.font = `${fs}px "Geist Mono", monospace`; const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    c.width = Math.ceil(w + pad * 2) * 2; c.height = (lines.length * lh + pad * 2) * 2; ctx.scale(2, 2);
    ctx.fillStyle = THEMES[S.theme].bg; ctx.fillRect(0, 0, c.width, c.height); ctx.font = `${fs}px "Geist Mono", monospace`; ctx.fillStyle = THEMES[S.theme].fg; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lh)); c.toBlob((b) => downloadBlob(b, `${base()}.png`));
  }
  function exportMenu(anchor) {
    const card = anchor.closest('.tx-card'); if (card && card.dataset.font !== S.font) select(card.dataset.font);
    openMenu(anchor, [
      { group: 'Copy', items: [{ label: 'Copy text', icon: 'copy', onSelect: () => copy(null) }, { label: 'Copy for Markdown', icon: 'code-xml', sub: 'Inside a ``` code block', onSelect: () => copyText('```\n' + out() + '\n```\n', null, { toastLabel: 'banner as Markdown' }) }] },
      { group: 'Download', items: [{ label: 'Text file (.txt)', icon: 'file-text', onSelect: () => dl('txt') }, { label: 'Image (.png)', icon: 'image', sub: `${THEMES[S.theme].label} theme`, onSelect: () => dl('png') }, { label: 'Web page (.html)', icon: 'file-code', onSelect: () => dl('html') }] },
    ], { placement: 'bottom-end' });
  }

  // ── input + options ──
  input.addEventListener('input', debounce(() => { keep.save(); render(); }, 60));
  $('#b-clear').onclick = () => { const old = input.value; input.value = ''; render(); input.focus(); toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { input.value = old; render(); } } }); };
  $('#b-open').onclick = async () => { const f = await pickFile('text/*,.txt,.md'); if (f) { const t = await readFileText(f); if (t != null) { input.value = t.slice(0, 400); render(); } } };
  $('#b-filter').addEventListener('input', (e) => { query = e.target.value.toLowerCase().trim(); render(); });
  $('#more-opts').onclick = (e) => moreOptions(e.currentTarget, {
    html: `<div class="fw-field"><span class="fw-field__label">Letter spacing</span><div class="fw-seg fw-seg--sm" aria-label="Letter spacing" id="o-lay">${LAYOUTS.map(([k, l]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${S.layout === k}">${l}</button>`).join('')}</div></div>
      <label class="fw-toggle"><input type="checkbox" id="o-wrap" ${S.wrap ? 'checked' : ''}><span>Wrap long text</span></label>
      <div class="fw-slider" id="o-wslider" ${S.wrap ? '' : 'hidden'}><label class="fw-slider__label" for="o-width">Wrap at</label><output class="fw-slider__value"></output><input id="o-width" type="range" min="30" max="200" step="2" value="${S.width}" data-unit=" columns"></div>
      <div class="fw-field"><span class="fw-field__label">Image theme</span><div class="fw-seg fw-seg--sm" aria-label="Image theme" id="o-theme">${Object.entries(THEMES).map(([k, t]) => `<button class="fw-seg__opt" type="button" data-value="${k}" aria-checked="${S.theme === k}">${t.label}</button>`).join('')}</div></div>
      <hr>${keep.toggleHtml()}`,
    wire: (el) => {
      el.querySelector('#o-lay').addEventListener('fw-change', (ev) => { S.layout = ev.detail.value; S.save(); render(); });
      el.querySelector('#o-wrap').onchange = (ev) => { S.wrap = ev.target.checked; S.save(); el.querySelector('#o-wslider').hidden = !S.wrap; render(); };
      el.querySelector('#o-width').addEventListener('input', debounce((ev) => { S.width = +ev.target.value; S.save(); render(); }, 60));
      el.querySelector('#o-theme').addEventListener('fw-change', (ev) => { S.theme = ev.detail.value; S.save(); });
      keep.wire(el);
    },
  });
  function bar() {
    const b = mobileBar(root, { line: `<b>${esc(S.font)}</b>`, actions: `<button class="fw-iconbtn" type="button" id="m-more" aria-label="Export">${icon('download')}</button><button class="fw-btn fw-btn--primary" type="button" id="m-copy">${icon('copy')}Copy</button>` });
    b.querySelector('#m-copy').onclick = (e) => copy(e.currentTarget); b.querySelector('#m-more').onclick = (e) => exportMenu(e.currentTarget);
  }
  api = { copy: () => copy(null), dl };
  if (params.get('font') && FONTS.includes(params.get('font'))) S.font = params.get('font');
  render();
  if (!matchMedia('(pointer: coarse)').matches) { input.focus(); input.select(); }
  return { onFiles: async (f) => { const t = await readFileText(f[0]); if (t != null) { input.value = t.slice(0, 400); render(); } }, onPasteText: (t) => { input.value = t.slice(0, 400); render(); return true; } };
}
