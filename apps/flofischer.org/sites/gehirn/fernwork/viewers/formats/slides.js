// Viewers · PowerPoint Viewer (PPTX). Real parsing with the bundled JSZip (same origin): slide size, shapes, fills, text runs,
// bullets, title/author. Slides render on an isolated white "paper" palette, so they stay readable in dark mode.
import { formatBytes } from '../../kit/shell.js';

const EMU_PX = 9525, PT = 96 / 72;
const human = (d, why, details) => Object.assign(new Error(details), { human: true, title: `${d.name} couldn’t be opened`, why, details, ...(/\.(ppt|key|odp)$/i.test(d.name) ? { route: null } : {}) });
const q = (el, sel) => el.getElementsByTagName(sel)[0] || null;
const qa = (el, sel) => [...el.getElementsByTagName(sel)];
const kid = (el, name) => el && [...el.children].find((c) => c.tagName === name) || null;

export default {
  id: 'slides', label: 'Presentation', icon: 'presentation',
  listLabel: 'Slides', listIcon: 'layout-grid', listOpen: () => true, listWidth: 'slides', selIcon: 'mouse-pointer-2',
  measureLabel: 'This slide', measureIcon: 'presentation',
  modes: [{ id: 'slide', label: 'Slides', icon: 'presentation' }, { id: 'outline', label: 'Outline', icon: 'list' }],
  keys: [{ label: 'Previous / next slide', keys: '[' }, { label: 'First / last slide', keys: 'home' }],
  steps(d) {
    return [
      { label: 'Loading slide engine (bundled · 97 KB)', cached: 'Slide engine ready', engine: 'pptx', ms: 380, run: () => window.JSZip ? null : loadVendor('vendor/jszip-3.10.1.min.js') },
      { label: `Unpacking ${formatBytes(d.size)}`, ms: 300, run: async () => {
        try { d.zip = await window.JSZip.loadAsync(await d.file.arrayBuffer()); } catch (e) { throw human(d, `It’s ${formatBytes(d.size)} and isn’t a ZIP package, so it can’t be a PowerPoint file. It may have been renamed or only partly downloaded.`, String(e.message || e)); }
        if (!d.zip.file('ppt/presentation.xml')) throw human(d, 'The package has no ppt/presentation.xml, so it isn’t a PowerPoint deck.', 'Missing ppt/presentation.xml');
      } },
      { label: 'Reading slides, text and shapes', ms: 420, run: async () => { d.data = await parse(d.zip); d.zip = null; d.cur = 0; } },
      { label: 'Drawing thumbnails', ms: 260 },
    ];
  },
  mount(d, el, ctx) { return mountView(d, el, ctx); },
  list(d, ctx) {
    const el = ctx.h(`<div class="ov-listpanel"><div class="ov-listhead"><span class="ov-listhead__title">Slides</span><span class="ov-listhead__count">${d.data.slides.length}</span></div><div class="sl-thumbs" role="list"></div></div>`);
    const box = el.querySelector('.sl-thumbs');
    d.data.slides.forEach((s, i) => {
      const b = ctx.h(`<button class="sl-thumb" type="button" role="listitem" data-i="${i}" aria-label="Slide ${i + 1}: ${ctx.esc(s.title)}" aria-current="${i === d.cur}"><span class="sl-thumb__n">${i + 1}</span><span class="sl-thumb__frame"></span></button>`);
      const fr = b.querySelector('.sl-thumb__frame'); const sl = slideEl(d.data, s, ctx); sl.style.transform = 'scale(var(--k))'; fr.append(sl);
      box.append(b);
    });
    const ro = new ResizeObserver(() => { const w = box.querySelector('.sl-thumb__frame')?.clientWidth || 180; box.style.setProperty('--k', w / d.data.w); });
    ro.observe(box);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) d.ctl.go(+b.dataset.i); });
    el.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); d.ctl.go(d.cur + (e.key === 'ArrowDown' ? 1 : -1)); el.querySelector(`[data-i="${d.cur}"]`)?.focus(); } });
    d._list = el; return el;
  },
  updateList(d) { d._list?.querySelectorAll('[data-i]').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.i === d.cur))); d._list?.querySelector(`[data-i="${d.cur}"]`)?.scrollIntoView({ block: 'nearest' }); },
  inspector(d, ctx) {
    const D = d.data; const s = D.slides[d.cur];
    const cm = (px) => `${ctx.nf((px / 96) * 2.54, 1)} cm`;
    const info = ctx.kv([['Type', 'PowerPoint presentation'], ['Slides', `${D.slides.length} · ${ratio(D.w, D.h)}`], ['Size', `${cm(D.w)} × ${cm(D.h)}`], D.title ? ['Title', ctx.esc(D.title)] : null, D.author ? ['Author', ctx.esc(D.author)] : null, D.modified ? ['Saved', new Date(D.modified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })] : null,
      ['Fonts', `${[...D.fonts].map((f) => ctx.esc(f)).join(', ') || 'Theme'} <span class="ov-subline">Shown with Geist, a similar sans-serif. Line breaks may differ slightly.</span>`]]);
    let selection = null; const sh = d.selShape != null ? s.shapes[d.selShape] : null;
    if (sh) selection = `<div class="ov-seltitle">${ctx.icon(sh.text ? 'type' : 'shapes', { size: 16 })}${sh.text ? 'Text box' : 'Shape'} · ${ctx.esc(sh.name || '')}</div>` + ctx.kv([sh.text ? ['Text', ctx.esc(sh.text.slice(0, 160))] : null, ['Position', `${cm(sh.x)} · ${cm(sh.y)}`], ['Size', `${cm(sh.w)} × ${cm(sh.h)}`], sh.fill ? ['Fill', `<span class="ov-swatch" style="background:#${sh.fill}"></span><span class="ov-mono">#${sh.fill}</span>`] : null, sh.size ? ['Font size', `${sh.size} pt`] : null]);
    const words = s.shapes.reduce((n, x) => n + (x.text.match(/\S+/g) || []).length, 0);
    const measure = ctx.kv([['Slide', `${d.cur + 1} of ${D.slides.length}`], ['Title', ctx.esc(s.title || 'Untitled')], ['Words', ctx.nf(words)], ['Objects', `${s.shapes.length} shapes and text boxes`]]);
    return { info, infoLabel: 'Presentation', selection, measure, measureLabel: 'This slide' };
  },
  exports(d, ctx) {
    const b = ctx.baseName(d.name);
    return [
      { group: 'Image', items: [
        { label: 'This slide as PNG', sub: `Slide ${d.cur + 1} · 1920 × 1080`, icon: 'image', file: `${b}-slide-${d.cur + 1}.png`, onSelect: () => slidePNG(d, ctx) },
        { label: 'Print / PDF', sub: `All ${d.data.slides.length} slides · landscape`, icon: 'file-text', file: `${b}.pdf`, onSelect: () => printPDF(d, ctx) }] },
      { group: 'Data', items: [
        { label: 'Outline as Markdown', sub: 'Titles and bullet points', icon: 'list', file: `${b}-outline.md`, onSelect: () => { const name = `${b}-outline.md`; ctx.download(name, outlineMd(d.data), 'text/markdown'); ctx.toast(`Saved ${name}`); } },
        { label: 'Download text', sub: 'All slide text as .txt', icon: 'type', file: `${b}.txt`, onSelect: () => { const name = `${b}.txt`; ctx.download(name, d.data.slides.map((s, i) => `--- Slide ${i + 1} ---\n` + s.shapes.map((x) => x.text).filter(Boolean).join('\n')).join('\n\n'), 'text/plain'); ctx.toast(`Saved ${name}`); } }] },
    ];
  },
  commands(d, ctx) {
    return [
      ...d.data.slides.map((sl, i) => ({ id: 'go' + i, label: `Slide ${i + 1} · ${sl.title}`, sub: 'Go to slide', icon: 'presentation', searchOnly: true, run: () => d.ctl.go(i) })),
      { id: 'pdf', label: 'Print / save all slides as PDF', icon: 'file-text', run: () => printPDF(d, ctx) },
      { id: 'outline', label: 'Show outline', sub: 'Titles and bullets as text', icon: 'list', run: () => ctx.setMode(d, 'outline') },
    ];
  },
  mobileSlots(d) { return [{ id: 'list', label: 'Slides', icon: 'layout-grid' }, { id: 'info', label: 'Info', icon: 'info' }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
function loadVendor(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('engine missing')); document.head.append(s); }); }
const ratio = (w, h) => { const r = w / h; return Math.abs(r - 16 / 9) < 0.01 ? '16:9' : Math.abs(r - 4 / 3) < 0.01 ? '4:3' : `${w}×${h}`; };

async function parse(zip) {
  const P = new DOMParser(); const xml = async (n) => { const f = zip.file(n); return f ? P.parseFromString(await f.async('string'), 'application/xml') : null; };
  const pres = await xml('ppt/presentation.xml'); const rels = await xml('ppt/_rels/presentation.xml.rels');
  const sz = q(pres, 'p:sldSz'); const w = +sz.getAttribute('cx') / EMU_PX, h = +sz.getAttribute('cy') / EMU_PX;
  const relMap = Object.fromEntries(qa(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const ids = qa(pres, 'p:sldId').map((s) => s.getAttribute('r:id'));
  const fonts = new Set(); const slides = [];
  for (const id of ids) {
    const doc = await xml('ppt/' + relMap[id]); if (!doc) continue;
    const bg = q(q(doc, 'p:bg') || doc.createElement('x'), 'a:srgbClr')?.getAttribute('val') || 'FFFFFF';
    const shapes = qa(doc, 'p:sp').map((sp) => {
      const spPr = q(sp, 'p:spPr'); const off = q(spPr, 'a:off'), ext = q(spPr, 'a:ext');
      const fill = kid(kid(spPr, 'a:solidFill'), 'a:srgbClr')?.getAttribute('val') || null;
      const line = q(q(spPr, 'a:ln') || doc.createElement('x'), 'a:srgbClr')?.getAttribute('val') || null;
      const geom = q(spPr, 'a:prstGeom')?.getAttribute('prst') || 'rect';
      const body = q(sp, 'p:txBody'); const bodyPr = body && q(body, 'a:bodyPr');
      const paras = body ? qa(body, 'a:p').map((p) => {
        const pPr = q(p, 'a:pPr'); const bu = pPr && q(pPr, 'a:buChar');
        const runs = qa(p, 'a:r').map((r) => { const rPr = q(r, 'a:rPr'); const tf = rPr && q(rPr, 'a:latin')?.getAttribute('typeface'); if (tf) fonts.add(tf); return { t: q(r, 'a:t')?.textContent || '', sz: rPr?.getAttribute('sz') ? +rPr.getAttribute('sz') / 100 : 18, b: rPr?.getAttribute('b') === '1', color: rPr && q(rPr, 'a:srgbClr')?.getAttribute('val') }; });
        return { algn: pPr?.getAttribute('algn') || 'l', bullet: bu?.getAttribute('char') || null, marL: +(pPr?.getAttribute('marL') || 0) / EMU_PX, indent: +(pPr?.getAttribute('indent') || 0) / EMU_PX, spcBef: pPr && q(pPr, 'a:spcPts') ? +q(pPr, 'a:spcPts').getAttribute('val') / 100 : 0, runs };
      }) : [];
      const text = paras.map((p) => p.runs.map((r) => r.t).join('')).filter(Boolean).join('\n');
      return { name: q(sp, 'p:cNvPr')?.getAttribute('name'), x: +off.getAttribute('x') / EMU_PX, y: +off.getAttribute('y') / EMU_PX, w: +ext.getAttribute('cx') / EMU_PX, h: +ext.getAttribute('cy') / EMU_PX, fill, line, geom, anchor: bodyPr?.getAttribute('anchor') || 't', paras, text, size: paras[0]?.runs[0]?.sz };
    });
    const titled = shapes.find((s) => /title/i.test(s.name || '') && s.text) || shapes.filter((s) => s.text).sort((a, b) => (b.paras[0]?.runs[0]?.sz || 0) - (a.paras[0]?.runs[0]?.sz || 0))[0];
    slides.push({ bg, shapes, title: titled?.text.split('\n')[0] || 'Untitled' });
  }
  const core = await xml('docProps/core.xml');
  return { w, h, slides, fonts, title: core && q(core, 'dc:title')?.textContent, author: core && q(core, 'dc:creator')?.textContent, modified: core && q(core, 'dcterms:modified')?.textContent };
}
// Inline styles only (no classes), so the same element works in thumbnails, the stage and PNG export.
function slideEl(D, s, ctx, { interactive = false } = {}) {
  const el = document.createElement('div');
  el.className = 'sl-paper';
  el.style.cssText = `position:absolute;left:0;top:0;width:${D.w}px;height:${D.h}px;background:#${s.bg};color:#111;transform-origin:0 0;overflow:hidden;font-family:Geist,Calibri,Carlito,Arial,sans-serif;line-height:1.18;overflow-wrap:normal;word-break:normal;hyphens:manual;color-scheme:light;text-align:left;letter-spacing:0`;
  s.shapes.forEach((sh, i) => {
    const b = document.createElement('div');
    const rad = sh.geom === 'ellipse' ? '50%' : sh.geom === 'roundRect' ? `${Math.min(sh.w, sh.h) * 0.12}px` : '0';
    b.style.cssText = `position:absolute;left:${sh.x}px;top:${sh.y}px;width:${sh.w}px;height:${sh.h}px;box-sizing:border-box;padding:4.8px 9.6px;border-radius:${rad};display:flex;flex-direction:column;justify-content:${{ t: 'flex-start', ctr: 'center', b: 'flex-end' }[sh.anchor] || 'flex-start'};${sh.fill ? `background:#${sh.fill};` : ''}${sh.line ? `border:1.33px solid #${sh.line};` : ''}`;
    if (interactive) { b.dataset.sh = i; b.style.cursor = 'pointer'; }
    for (const p of sh.paras) {
      const pe = document.createElement('div');
      pe.style.cssText = `text-align:${{ l: 'left', ctr: 'center', r: 'right', just: 'justify' }[p.algn] || 'left'};margin:${p.spcBef * PT}px 0 0 ${p.marL}px;${p.bullet ? `text-indent:${p.indent}px;` : ''}`;
      if (p.bullet) { const bu = document.createElement('span'); bu.textContent = p.bullet; bu.style.cssText = `display:inline-block;width:${-p.indent}px;text-indent:0;font-size:${(p.runs[0]?.sz || 18) * PT}px;color:#${p.runs[0]?.color || '111111'}`; pe.append(bu); }
      for (const r of p.runs) { const sp = document.createElement('span'); sp.textContent = r.t; sp.style.cssText = `font-size:${r.sz * PT}px;font-weight:${r.b ? 600 : 400};color:#${r.color || '111111'}`; pe.append(sp); }
      if (!p.runs.length) pe.innerHTML = '&nbsp;';
      b.append(pe);
    }
    el.append(b);
  });
  return el;
}
function mountView(d, el, ctx) {
  const D = d.data; d.selShape = null; d.fitZ = true;
  el.classList.add('sl');
  el.innerHTML = `<div class="sl-stage"><div class="sl-frame" aria-live="polite"></div></div>
    <div class="sl-nav" role="group" aria-label="Slides"><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-step="-1" aria-label="Previous slide" data-tip="Previous" data-tip-kbd="[">${ctx.icon('chevron-left')}</button><span class="sl-nav__n"></span><button class="fw-iconbtn fw-iconbtn--sm" type="button" data-step="1" aria-label="Next slide" data-tip="Next" data-tip-kbd="]">${ctx.icon('chevron-right')}</button></div>
    <div class="sl-outline"></div>`;
  const stage = el.querySelector('.sl-stage'), frame = el.querySelector('.sl-frame'), nav = el.querySelector('.sl-nav__n'), outline = el.querySelector('.sl-outline');
  let k = 1;
  function layout() {
    const r = stage.getBoundingClientRect(); const pad = ctx.isMobile() ? 16 : 48;
    if (d.fitZ) k = Math.max(0.05, Math.min((r.width - pad * 2) / D.w, (r.height - pad * 2 - 40) / D.h));
    frame.style.width = D.w * k + 'px'; frame.style.height = D.h * k + 'px';
    const p = frame.firstElementChild; if (p) p.style.transform = `scale(${k})`;
    if (ctx.isActive(d) && r.width) ctx.refresh('zoom');
  }
  function show() {
    const s = D.slides[d.cur]; frame.replaceChildren(slideEl(D, s, ctx, { interactive: true })); frame.setAttribute('aria-label', `Slide ${d.cur + 1} of ${D.slides.length}: ${s.title}`);
    nav.textContent = `${d.cur + 1} / ${D.slides.length}`;
    layout();
    if (d.selShape != null) frame.querySelector(`[data-sh="${d.selShape}"]`)?.classList.add('sl-sel');
  }
  function renderOutline() {
    outline.innerHTML = `<ol class="sl-ol">${D.slides.map((s, i) => `<li class="sl-ol__item ${i === d.cur ? 'is-cur' : ''}"><button class="sl-ol__title" type="button" data-go="${i}"><span class="sl-ol__n">${i + 1}</span>${ctx.esc(s.title)}</button><ul>${s.shapes.filter((x) => x.text && x.text.split('\n')[0] !== s.title && !/footer|accent/i.test(x.name || '')).map((x) => `<li>${ctx.esc(x.text.replace(/\n/g, ' · '))}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  }
  frame.addEventListener('click', (e) => { const b = e.target.closest('[data-sh]'); frame.querySelectorAll('.sl-sel').forEach((x) => x.classList.remove('sl-sel')); d.selShape = b ? +b.dataset.sh : null; b?.classList.add('sl-sel'); ctx.refresh('insp'); });
  el.querySelector('.sl-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) go(d.cur + +b.dataset.step); });
  outline.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { go(+b.dataset.go); ctx.setMode(d, 'slide'); } });
  let sx = null; stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') sx = e.clientX; });
  stage.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) go(d.cur + (e.clientX < sx ? 1 : -1)); sx = null; });
  stage.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.01)); }, { passive: false });
  function go(i) { const n = Math.max(0, Math.min(D.slides.length - 1, i)); if (n === d.cur && frame.firstElementChild) return; d.cur = n; d.selShape = null; show(); if (d.mode === 'outline') renderOutline(); d.fmt.updateList(d); ctx.refresh('insp'); }
  function zoomBy(f) { d.fitZ = false; k = Math.max(0.1, Math.min(4, k * f)); layout(); ctx.refresh('zoom'); }
  const ro = new ResizeObserver(layout); ro.observe(stage);
  show(); renderOutline();
  el.dataset.mode = d.mode;
  return {
    go, step: (dir) => go(d.cur + dir),
    key: (e) => { if (d.mode !== 'slide') return false; if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(d.cur + 1); return true; } if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(d.cur - 1); return true; } if (e.key === 'Home') { go(0); return true; } if (e.key === 'End') { go(D.slides.length - 1); return true; } return false; },
    zoom: () => k * 100, isFit: () => d.fitZ, fit: () => { d.fitZ = true; layout(); }, setZoom: (p) => { d.fitZ = false; k = p / 100; layout(); }, zoomBy,
    setMode: (m) => { el.dataset.mode = m; if (m === 'outline') renderOutline(); else layout(); },
    onShow: layout, destroy: () => ro.disconnect(),
  };
}
function outlineMd(D) { return D.slides.map((s, i) => `## ${i + 1}. ${s.title}\n\n` + s.shapes.filter((x) => x.text && x.text.split('\n')[0] !== s.title && !/footer|accent/i.test(x.name || '')).map((x) => `- ${x.text.replace(/\n/g, ' · ')}`).join('\n')).join('\n\n') + '\n'; }
function slidePNG(d, ctx) {
  const D = d.data; const k = 1920 / D.w; const sl = slideEl(D, D.slides[d.cur], ctx); sl.style.transform = `scale(${k})`;
  const html = new XMLSerializer().serializeToString(sl);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${Math.round(D.h * k)}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 1920; c.height = Math.round(D.h * k); c.getContext('2d').drawImage(img, 0, 0); c.toBlob((b) => { const name = `${ctx.baseName(d.name)}-slide-${d.cur + 1}.png`; ctx.download(name, b); ctx.toast(`Saved ${name} · 1920 × ${c.height}`); }); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function printPDF(d, ctx) {
  const D = d.data; const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; document.body.append(f);
  const doc = f.contentDocument; doc.open(); doc.write('<!doctype html><title></title><style>@page{size:landscape;margin:0}body{margin:0}.pg{position:relative;width:100vw;height:56.25vw;overflow:hidden;page-break-after:always}</style>'); doc.close();
  doc.title = ctx.baseName(d.name); // set via DOM, never written as markup
  const k = 1123 / D.w;
  D.slides.forEach((s) => { const pg = doc.createElement('div'); pg.className = 'pg'; const sl = slideEl(D, s, ctx); sl.style.transform = `scale(${k})`; pg.append(doc.importNode(sl, true)); doc.body.append(pg); });
  ctx.toast(`Choose “Save as PDF” to keep ${ctx.baseName(d.name)}.pdf`, { type: 'info' });
  setTimeout(() => { try { f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 2000); }, 300);
}
