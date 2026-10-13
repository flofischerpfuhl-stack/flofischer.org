// Viewers · SVG Viewer. Real: parse (errors with line numbers), sanitised inline render (scripts and event handlers
// removed), size from viewBox or width/height (derived when missing), true zoom %, pan, background choice, source
// editing with a live preview that keeps the last good render, colours / fonts / element counts, SVG + PNG exports.

const human = (title, why, details) => Object.assign(new Error(details), { human: true, title, why, details });
const OPT_KEY = 'fw:vw-svg';
const loadOpt = () => { try { return { bg: 'checker', ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { bg: 'checker' }; } };
const saveOpt = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* */ } };

function parse(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) { const msg = err.textContent || ''; const m = /line (\d+)(?: at column (\d+))?/i.exec(msg); return { error: { line: m ? +m[1] : null, col: m?.[2] ? +m[2] : null, msg: msg.replace(/^.*?error[^:]*:\s*/i, '').replace(/Below is a rendering.*$/s, '').trim().slice(0, 160) } }; }
  const svg = doc.documentElement; if (svg.localName !== 'svg') return { error: { line: 1, msg: `The root element is <${svg.localName}>, not <svg>.` } };
  return { doc, svg };
}
function stats(svg, text) {
  const all = [...svg.querySelectorAll('*')]; const by = {};
  for (const el of all) by[el.localName] = (by[el.localName] || 0) + 1;
  const colors = new Map();
  const add = (c) => { if (!c || /^(none|transparent|currentColor|inherit)$/i.test(c) || c.startsWith('url(')) return; c = c.trim().toLowerCase(); colors.set(c, (colors.get(c) || 0) + 1); };
  for (const el of [svg, ...all]) { add(el.getAttribute('fill')); add(el.getAttribute('stroke')); add(el.getAttribute('stop-color')); const st = el.getAttribute('style') || ''; for (const m of st.matchAll(/(?:fill|stroke|stop-color)\s*:\s*([^;]+)/g)) add(m[1]); }
  const fonts = new Set(); for (const el of [svg, ...all]) { const f = el.getAttribute('font-family') || (/font-family\s*:\s*([^;]+)/.exec(el.getAttribute('style') || '')?.[1]); if (f) fonts.add(f.split(',')[0].replace(/['"]/g, '').trim()); }
  const risky = all.filter((el) => el.localName === 'script' || [...el.attributes].some((a) => /^on/i.test(a.name))).length + (/<foreignObject/i.test(text) ? 1 : 0);
  return { count: all.length, by, colors: [...colors].sort((a, b) => b[1] - a[1]), fonts: [...fonts], risky };
}
function sizeOf(svg) {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const num = (v) => { const m = /^([\d.]+)(px|pt|mm|cm|in)?$/.exec((v || '').trim()); if (!m) return null; return +m[1] * ({ pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[m[2]] || 1); };
  const w = num(svg.getAttribute('width')), h = num(svg.getAttribute('height'));
  if (vb.length === 4 && vb.every(Number.isFinite)) return { vb, w: w || vb[2], h: h || vb[3], derived: false };
  if (w && h) return { vb: [0, 0, w, h], w, h, derived: 'size' };
  return { vb: null, w: null, h: null, derived: 'bbox' };
}

export default {
  id: 'svg', label: 'SVG', icon: 'shapes',
  modes: [{ id: 'view', label: 'View', icon: 'eye' }, { id: 'edit', label: 'Edit source', icon: 'code-xml' }],
  steps(d, ctx) {
    return [
      { label: 'Loading SVG engine (bundled · 29 KB)', cached: 'SVG engine ready', engine: 'svg', ms: 220, run: () => ctx.loadScript('vendor/dompurify-3.4.15.min.js') },
      { label: `Reading ${ctx.formatBytes(d.size)}`, ms: 160, run: async () => { d.orig = await d.file.text(); d.text = d.draft ?? d.orig; } },
      { label: 'Checking and drawing', ms: 180, run: async () => {
        const p = parse(d.text);
        if (p.error && d.text === d.orig) throw human(`${d.name} couldn’t be drawn`, p.error.line ? `There’s a mistake in the SVG code on line ${p.error.line}: ${p.error.msg || 'the markup isn’t closed properly'}.` : (p.error.msg || 'It isn’t valid SVG.'), p.error.msg);
        d.opt = loadOpt();
      } },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  saveOriginal(d, ctx) { ctx.download(d.name, d.text, 'image/svg+xml'); ctx.toast(d.dirty ? `Saved ${d.name} with your edits` : `Saved ${d.name}`); },
  inspector(d, ctx) {
    const s = d.stats; if (!s) return {};
    const z = d.size2;
    const info = ctx.kv([
      ['Size', z?.w ? `<strong>${ctx.nf(z.w, 0)} × ${ctx.nf(z.h, 0)} px</strong>${z.derived ? `<span class="ov-subline">${z.derived === 'bbox' ? 'No size in the file; taken from the drawing' : 'From width and height (no viewBox)'}</span>` : ''}` : '—'],
      ['viewBox', z?.vb ? `<span class="ov-mono">${z.vb.map((v) => +v.toFixed(2)).join(' ')}</span>` : '—'],
      ['Elements', `${ctx.nf(s.count)}<span class="ov-subline">${Object.entries(s.by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n} ${k}`).join(' · ')}</span>`],
      ['Colours', s.colors.length ? `<span class="svg-swatches">${s.colors.slice(0, 12).map(([c]) => `<button class="svg-sw" type="button" style="--c:${ctx.esc(c)}" data-copyc="${ctx.esc(c)}" data-tip="${ctx.esc(c)} · copy" aria-label="Copy ${ctx.esc(c)}"></button>`).join('')}</span>` : 'None set'],
      s.fonts.length ? ['Fonts', ctx.esc(s.fonts.join(', '))] : null,
      s.risky ? ['Safety', `<span class="ov-warnline">${ctx.icon('shield-check', { size: 14 })}${s.risky} script${s.risky > 1 ? 's' : ''} or handler${s.risky > 1 ? 's' : ''} not run</span>`] : null,
      ['File', `${ctx.formatBytes(new Blob([d.text]).size)}${d.dirty ? ' · edited' : ''}`],
    ]);
    return { info, infoLabel: 'Graphic' };
  },
  bindInspector(d, root, ctx) { root.querySelectorAll('[data-copyc]').forEach((b) => b.addEventListener('click', () => ctx.copyText(b.dataset.copyc, b, { toastLabel: b.dataset.copyc }))); },
  status(d, ctx) { if (d.mode !== 'edit') return null; const c = d.cursor; return [c ? `Ln ${c.line}, Col ${c.col}` : `${ctx.nf(d.text.split('\n').length)} lines`, d.svgErr ? `<span class="svg-errline">${ctx.icon('circle-alert', { size: 12 })}Line ${d.svgErr.line ?? '?'}: ${ctx.esc(d.svgErr.msg || 'not valid SVG')}</span>` : 'Valid SVG']; },
  options(d, ctx) {
    const set = (bg) => { d.opt.bg = bg; saveOpt(d.opt); d.ctl.applyBg(); };
    return [{ group: 'Background', items: [['checker', 'Checkerboard'], ['light', 'Light'], ['dark', 'Dark'], ['theme', 'Match theme']].map(([v, l]) => ({ label: l, radio: true, checked: d.opt.bg === v, onSelect: () => set(v) })) }];
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name); const z = d.size2 || { w: 0, h: 0 };
    return [
      { group: 'Image', items: [1, 2, 4, 8].map((k) => ({ label: `PNG ${k}×`, sub: `${ctx.nf(Math.round(z.w * k))} × ${ctx.nf(Math.round(z.h * k))} px · transparent`, icon: 'image', file: `${b}${k > 1 ? `@${k}x` : ''}.png`, onSelect: () => d.ctl.png(k) })) },
      { group: 'Code', items: [{ label: 'Copy SVG code', icon: 'copy', file: 'Clipboard', onSelect: () => { ctx.copyText(d.text); ctx.toast('Copied SVG code'); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      { id: 'edit', label: 'Edit SVG source', icon: 'code-xml', run: () => ctx.setMode(d, 'edit') },
      { id: 'png2', label: 'Save as PNG 2×', icon: 'image', run: () => d.ctl.png(2) },
      ...['checker', 'light', 'dark'].map((v) => ({ id: 'bg-' + v, label: `Background: ${v}`, icon: 'palette', searchOnly: true, run: () => { d.opt.bg = v; saveOpt(d.opt); d.ctl.applyBg(); } })),
    ];
  },
  mobileSlots(d) { return [{ id: 'info', label: 'Info', icon: 'info' }, { id: 'more', label: 'Background', icon: 'palette' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};

function mountView(d, el, ctx) {
  el.classList.add('svgv');
  el.innerHTML = `<div class="svgv-stage" tabindex="0" aria-label="${ctx.esc(d.name)}"><div class="svgv-art"></div><div class="svgv-stale" hidden>${ctx.icon('circle-alert', { size: 14 })}<span></span></div></div>
    <div class="md-src svgv-src"><div class="md-gutter" aria-hidden="true"></div><textarea class="md-editor" spellcheck="false" wrap="off" aria-label="SVG source"></textarea></div>`;
  const stage = el.querySelector('.svgv-stage'), art = el.querySelector('.svgv-art'), stale = el.querySelector('.svgv-stale'), ta = el.querySelector('textarea'), gut = el.querySelector('.md-gutter');
  const V = { k: 1, x: 0, y: 0, fit: true }; let showOrig = false, rt = 0;
  ta.value = d.text;
  function lines() { const n = ta.value.split('\n').length; if (gut.childElementCount !== n) gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  function render() {
    const src = showOrig ? d.orig : d.text; const p = parse(src);
    d.svgErr = p.error || null;
    if (p.error) { stale.hidden = false; stale.querySelector('span').textContent = `Showing the last good version · line ${p.error.line ?? '?'}: ${p.error.msg || 'not valid SVG'}`; ctx.refresh('status'); return; }
    stale.hidden = true;
    const clean = window.DOMPurify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'], RETURN_DOM: true });
    const svgEl = clean.querySelector('svg') || clean.firstElementChild; if (!svgEl) return;
    const z = sizeOf(svgEl);
    art.replaceChildren(svgEl);
    if (!z.vb) { const bb = svgEl.getBBox(); z.vb = [bb.x, bb.y, bb.width || 100, bb.height || 100]; z.w = z.vb[2]; z.h = z.vb[3]; svgEl.setAttribute('viewBox', z.vb.join(' ')); }
    svgEl.setAttribute('width', z.w); svgEl.setAttribute('height', z.h); svgEl.removeAttribute('style');
    art.style.width = z.w + 'px'; art.style.height = z.h + 'px';
    d.size2 = z; d.stats = stats(p.svg, src);
    if (V.fit) fit(); else apply();
    ctx.refresh('insp status');
  }
  const apply = () => { art.style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.k})`; ctx.refresh('zoom'); };
  function fit() { const r = stage.getBoundingClientRect(); const z = d.size2; if (!z || !r.width) return; const pad = ctx.isMobile() ? 24 : 56; V.k = Math.min((r.width - pad * 2) / z.w, (r.height - pad * 2) / z.h, 8); V.x = (r.width - z.w * V.k) / 2; V.y = (r.height - z.h * V.k) / 2; V.fit = true; apply(); }
  function zoomAt(f, sx, sy) { const r = stage.getBoundingClientRect(); sx ??= r.width / 2; sy ??= r.height / 2; const k = Math.max(0.02, Math.min(64, V.k * f)); V.x = sx - ((sx - V.x) * k) / V.k; V.y = sy - ((sy - V.y) * k) / V.k; V.k = k; V.fit = false; apply(); }
  function applyBg() { el.dataset.bg = d.opt.bg; }
  // pan + pinch + wheel
  const pts = new Map(); let drag = null, pinch = null;
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; return; } drag = { x: e.clientX, y: e.clientY, ox: V.x, oy: V.y }; stage.classList.add('is-panning'); });
  stage.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const nd = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = stage.getBoundingClientRect(); zoomAt(nd / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = nd; return; } if (drag) { V.x = drag.ox + e.clientX - drag.x; V.y = drag.oy + e.clientY - drag.y; V.fit = false; apply(); } });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; drag = null; stage.classList.remove('is-panning'); };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  // source editing
  ta.addEventListener('input', () => { d.text = ta.value; lines(); const dirty = d.text !== d.orig; d.draft = dirty ? d.text : null; ctx.setDirty(d, dirty); ctx.saveDraft(d); clearTimeout(rt); rt = setTimeout(render, 160); });
  const caret = () => { const v = ta.value.slice(0, ta.selectionStart); d.cursor = { line: v.split('\n').length, col: ta.selectionStart - v.lastIndexOf('\n') }; ctx.refresh('status'); };
  ta.addEventListener('keyup', caret); ta.addEventListener('click', caret);
  ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
  const ro = new ResizeObserver(() => { if (V.fit) fit(); }); ro.observe(stage);
  lines(); applyBg(); render();
  el.dataset.mode = d.mode;
  const setText = (t) => { d.text = t; ta.value = t; lines(); render(); const dirty = t !== d.orig; d.draft = dirty ? t : null; ctx.setDirty(d, dirty); ctx.saveDraft(d); };
  return {
    zoom: () => V.k * 100, isFit: () => V.fit, fit, setZoom: (p) => zoomAt(p / 100 / V.k), zoomBy: (f) => zoomAt(f),
    setMode: (m) => { el.dataset.mode = m; requestAnimationFrame(() => { if (V.fit) fit(); }); ctx.refresh('status'); if (m === 'edit' && !ctx.isMobile()) setTimeout(() => ta.focus({ preventScroll: true }), 40); },
    onResize: () => { if (V.fit) fit(); }, applyBg,
    toggleOriginal: () => { showOrig = !showOrig; render(); return showOrig; }, discardDraft: () => { showOrig = false; setText(d.orig); }, setDraft: (t) => setText(t),
    png: (k) => {
      const z = d.size2; const s = new XMLSerializer().serializeToString(art.querySelector('svg')); const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(z.w * k); c.height = Math.round(z.h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob((bl) => { const name = `${ctx.baseName(d.name)}${k > 1 ? `@${k}x` : ''}.png`; ctx.download(name, bl); ctx.toast(`Saved ${name} · ${c.width} × ${c.height} px`); }); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.includes('xmlns=') ? s : s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
    },
    destroy: () => { ro.disconnect(); clearTimeout(rt); },
  };
}
