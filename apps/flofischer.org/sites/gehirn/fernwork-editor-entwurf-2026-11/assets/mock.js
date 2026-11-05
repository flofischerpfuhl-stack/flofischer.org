/* Shared mockup runtime: building-block markup (same classes as packages/pdf-editor/src/pdf-editor/ui/*.jsx),
   page frame (variant / state / device / theme), stage scaling, synthetic plan, objects, overlay geometry. */
(function () {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const attrs = a => a ? ' ' + Object.entries(a).filter(([, v]) => v != null && v !== false).map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`).join(' ') : '';
  const cx = (...n) => n.filter(Boolean).join(' ');

  /* ── Icons (copied set) ─────────────────────────────────────────────────────────────────── */
  const EXTRA = {
    // Not in the shared set: a few glyphs the mockups need (proposal: add to web-kit icons.js).
    'layers-stack': '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    'link-2': '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
    'unlink-2': '<path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M9 17H7A5 5 0 0 1 7 7h2"/>',
    'bold': '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    'italic': '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
    'mouse-pointer': '<path d="M4.04 4.04a.5.5 0 0 1 .64-.06l14.5 9.2a.5.5 0 0 1-.13.9l-6.1 1.7a.5.5 0 0 0-.33.3l-2.4 5.9a.5.5 0 0 1-.93-.02L4 4.68a.5.5 0 0 1 .04-.64Z"/>',
    'spline': '<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>',
    'corner': '<path d="M4 20V10a6 6 0 0 1 6-6h10"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'arrow-up-down': '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    'droplet': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    'tree': '<path d="M12 3 5 13h4l-3 5h12l-3-5h4Z"/><path d="M12 18v3"/>',
  };
  const icon = (name, cls = '') => {
    const body = (window.FW_ICONS && window.FW_ICONS[name]) || EXTRA[name] || '<circle cx="12" cy="12" r="9"/>';
    return `<span class="oo-ui-icon ${cls}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
  };

  /* ── Building blocks as HTML (classes as in ui/*.jsx) ───────────────────────────────────── */
  const B = {
    btn(label, o = {}) {
      return `<button type="button"${attrs(o.attrs)} class="${cx('oo-ui-button', `is-${o.variant || 'secondary'}`, `is-${o.size || 'md'}`, o.block && 'is-block', o.pressed && 'is-pressed', o.busy && 'is-busy', o.cls)}"${o.disabled ? ' disabled' : ''}${o.pressed != null ? ` aria-pressed="${!!o.pressed}"` : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${o.busy ? '<span class="oo-ui-spinner" aria-hidden="true"></span>' : (o.icon ? icon(o.icon) : '')}${label != null ? `<span class="oo-ui-button-label">${o.html ? label : esc(label)}</span>` : ''}${o.iconEnd ? icon(o.iconEnd) : ''}</button>`;
    },
    ibtn(ic, label, o = {}) {
      const title = o.shortcut ? `${label} (${o.shortcut})` : label;
      return `<button type="button"${attrs(o.attrs)} aria-label="${esc(label)}" title="${esc(title)}" class="${cx('oo-ui-button', 'is-icon', `is-${o.variant || 'quiet'}`, `is-${o.size || 'md'}`, o.pressed && 'is-pressed', o.cls)}"${o.disabled ? ' disabled' : ''}${o.pressed != null ? ` aria-pressed="${!!o.pressed}"` : ''}>${o.busy ? '<span class="oo-ui-spinner" aria-hidden="true"></span>' : icon(ic)}</button>`;
    },
    split(label, o = {}) {
      return `<span class="${cx('oo-ui-split', o.pressed && 'is-pressed')}"${attrs(o.attrs)}><button type="button" class="${cx('oo-ui-button oo-ui-split-main', `is-${o.variant || 'quiet'}`, o.pressed && 'is-pressed', !label && 'is-icon')}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${o.icon ? icon(o.icon) : ''}${label ? `<span class="oo-ui-button-label">${esc(label)}</span>` : ''}</button><button type="button" aria-label="More" class="${cx('oo-ui-button oo-ui-split-toggle', `is-${o.variant || 'quiet'}`, o.pressed && 'is-pressed')}">${icon('chevron-down')}</button></span>`;
    },
    field(label, inner, o = {}) {
      const pos = o.labelPos || 'top';
      return `<div class="${cx('oo-ui-field', `is-label-${pos}`, o.width && `is-width-${o.width}`, o.cls)}"${attrs(o.fattrs)}>${pos !== 'hidden' ? `<label class="oo-ui-field-label"${o.id ? ` for="${o.id}"` : ''}>${esc(label)}</label>` : ''}${inner}${o.error && pos === 'top' ? `<span class="oo-ui-field-error" role="alert">${esc(o.error)}</span>` : ''}</div>`;
    },
    num(o = {}) {
      const id = o.id || 'f' + Math.random().toString(36).slice(2, 8);
      const inner = `<span class="${cx('oo-ui-input', o.size === 'sm' && 'is-sm', o.error && 'is-invalid', o.disabled && 'is-disabled', o.cls)}"${o.title ? ` title="${esc(o.title)}"` : ''}>${o.prefix ? `<span class="nb-prefix" aria-hidden="true">${o.prefixIcon ? icon(o.prefixIcon) : esc(o.prefix)}</span>` : ''}<input id="${id}" class="${cx('oo-ui-input-native', o.mixed && 'is-mixed')}" data-ui-number inputmode="decimal" autocomplete="off" value="${o.mixed ? '' : esc(o.value ?? '')}" placeholder="${o.mixed ? 'Mixed' : esc(o.placeholder || '')}"${o.disabled ? ' disabled' : ''}${o.label && (o.labelPos === 'hidden' || o.prefix) ? ` aria-label="${esc(o.label)}"` : ''}${attrs(o.attrs)}>${o.unit ? `<span class="oo-ui-input-unit" aria-hidden="true">${esc(o.unit)}</span>` : ''}</span>`;
      if (o.bare) return inner;
      return B.field(o.label, inner, { ...o, id, labelPos: o.prefix ? 'hidden' : o.labelPos });
    },
    select(o = {}) {
      const id = o.id || 's' + Math.random().toString(36).slice(2, 8);
      const chosen = o.options.find(x => String(x.value) === String(o.value));
      const inner = `<span class="${cx('oo-ui-input', 'is-select', o.size === 'sm' && 'is-sm', o.disabled && 'is-disabled')}"><span class="${cx('oo-ui-select-value', (!chosen || o.mixed) && 'is-placeholder')}" aria-hidden="true">${o.loading ? '<span class="oo-ui-spinner" style="vertical-align:-2px;margin-right:6px"></span>' : ''}${esc(o.mixed ? 'Mixed' : chosen ? chosen.label : (o.placeholder || 'Mixed'))}</span><select id="${id}" class="oo-ui-input-native"${o.disabled ? ' disabled' : ''}${o.labelPos === 'hidden' ? ` aria-label="${esc(o.label)}"` : ''}${attrs(o.attrs)}>${o.options.map(x => `<option value="${esc(x.value)}"${String(x.value) === String(o.value) ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>${icon('chevron-down', 'oo-ui-select-chevron')}</span>`;
      if (o.bare) return inner;
      return B.field(o.label, inner, { ...o, id });
    },
    seg(o = {}) {
      return `<div role="${o.multi ? 'group' : 'radiogroup'}" aria-label="${esc(o.label || '')}" class="${cx('oo-ui-segmented', o.size === 'sm' && 'is-sm', o.disabled && 'is-disabled', o.cls)}"${attrs(o.attrs)}>${o.options.map(x => {
        const on = o.multi ? (o.value || []).includes(x.value) : String(x.value) === String(o.value);
        return `<button type="button" ${o.multi ? `aria-pressed="${on}"` : `role="radio" aria-checked="${on}"`} data-v="${esc(x.value)}" class="${cx('oo-ui-segment', on && 'is-checked', x.iconOnly && 'is-icon')}"${x.iconOnly ? ` aria-label="${esc(x.label)}" title="${esc(x.title || x.label)}"` : ''}${o.disabled ? ' disabled' : ''}>${x.icon ? icon(x.icon) : ''}${x.iconOnly ? '' : `<span class="oo-ui-button-label">${esc(x.label)}</span>`}</button>`;
      }).join('')}</div>`;
    },
    color(o = {}) {
      return `<label class="${cx('oo-ui-color', o.size === 'sm' && 'is-sm', o.showValue && 'has-value', o.mixed && 'is-mixed', o.disabled && 'is-disabled', o.cls)}" title="${esc(o.label || 'Colour')}"${attrs(o.attrs)}><span class="oo-ui-color-swatch" aria-hidden="true" style="--oo-ui-swatch:${esc(o.hex || '#000000')}"></span>${o.showValue ? `<span class="oo-ui-color-value">${o.mixed ? 'Mixed' : esc((o.hex || '').toUpperCase())}</span>` : ''}<input type="color" class="oo-ui-color-native" value="${esc(o.hex || '#000000')}" aria-label="${esc(o.label || 'Colour')}"${o.disabled ? ' disabled' : ''}></label>`;
    },
    check(label, o = {}) {
      return `<label class="${cx('oo-ui-check', o.disabled && 'is-disabled')}"><input type="checkbox" class="oo-ui-check-input"${o.checked ? ' checked' : ''}${o.disabled ? ' disabled' : ''}${attrs(o.attrs)}><span class="oo-ui-check-box" aria-hidden="true">${icon('check')}</span><span class="oo-ui-check-label">${esc(label)}</span></label>`;
    },
    status(text, o = {}) {
      const cls = cx('oo-ui-status', `is-${o.tone || 'neutral'}`, o.action && 'is-action', o.cls);
      const inner = `${o.busy ? '<span class="oo-ui-spinner" aria-hidden="true"></span>' : (o.icon ? icon(o.icon) : '')}<span class="oo-ui-status-text">${o.html ? text : esc(text)}</span>${o.iconEnd ? icon(o.iconEnd) : ''}`;
      return o.action
        ? `<button type="button" class="${cls}"${attrs(o.attrs)}${o.title ? ` title="${esc(o.title)}"` : ''}>${inner}</button>`
        : `<span class="${cls}" role="status"${attrs(o.attrs)}${o.title ? ` title="${esc(o.title)}"` : ''}>${inner}</span>`;
    },
    group(label, inner, o = {}) {
      return `<div role="group" aria-label="${esc(label)}" class="${cx('oo-ui-bar-group', o.cls)}"${attrs(o.attrs)}>${o.showLabel ? `<span class="oo-ui-bar-group-label">${o.labelHtml || esc(label)}</span>` : ''}${inner}</div>`;
    },
    bar(o = {}) {
      const groups = o.groups.filter(Boolean);
      return `<div role="toolbar" aria-label="${esc(o.label)}" class="${cx('oo-ui-bar', o.cls)}"${attrs(o.attrs)}><div class="oo-ui-bar-groups">${groups.map((g, i) => (i ? '<span class="oo-ui-bar-divider" aria-hidden="true"></span>' : '') + g).join('')}</div><div class="oo-ui-bar-end">${o.end || ''}${o.confirm ? B.btn(o.confirm, { variant: 'primary', disabled: o.confirmDisabled, attrs: { 'data-act': 'confirm' } }) : ''}${o.noClose ? '' : B.ibtn('x', o.closeLabel || 'Close', { shortcut: 'Esc', attrs: { 'data-act': 'close' } })}</div></div>`;
    },
    menuItem(label, o = {}) {
      return `<button type="button" role="menuitem" class="${cx('oo-ui-menu-item', o.danger && 'is-danger', o.cls)}"${o.disabled ? ' disabled' : ''}${attrs(o.attrs)}><span class="${cx('oo-ui-menu-lead', o.check && 'is-check')}">${o.check ? icon('check') : o.icon ? icon(o.icon) : ''}</span><span class="oo-ui-menu-label">${esc(label)}</span>${o.kbd ? `<span class="nb-kbd">${esc(o.kbd)}</span>` : ''}</button>`;
    },
  };

  /* ── Page frame ─────────────────────────────────────────────────────────────────────────── */
  const store = {
    get(k, d) { try { return localStorage.getItem('fwmock.' + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('fwmock.' + k, v); } catch { /* private mode */ } },
  };
  function initialTheme() {
    const s = store.get('theme', null);
    if (s === 'light' || s === 'dark') return s;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = new URLSearchParams(location.hash.slice(1)).get('t') || initialTheme();

  const vw = () => document.documentElement.clientWidth || window.innerWidth;
  const isPhoneViewport = () => vw() <= 560;

  // Scroll areas show a fade at the side with more content (UI-REVIEW-CHECKLIST 7).
  function scrollHints(root) {
    $$('.ed-panel-scroll, .nb-sheet-body', root).forEach(el => {
      const upd = () => {
        el.toggleAttribute('data-more-end', el.scrollTop + el.clientHeight < el.scrollHeight - 2);
        el.toggleAttribute('data-more-start', el.scrollTop > 2);
      };
      upd(); el.addEventListener('scroll', upd, { passive: true });
    });
    // Horizontal rows (static bars, context rows): same fade as ToolOptionsBar (data-overflow-start/end).
    $$('.oo-ui-bar-groups, .cc-row', root).forEach(el => {
      const upd = () => {
        el.toggleAttribute('data-overflow-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
        el.toggleAttribute('data-overflow-start', el.scrollLeft > 1);
      };
      upd(); el.addEventListener('scroll', upd, { passive: true });
    });
  }
  function page(cfg) {
    const params = new URLSearchParams(location.hash.slice(1));
    const ctx = {
      variant: params.get('v') || 'a',
      state: params.get('s') || cfg.states[0].v,
      device: params.get('d') || (isPhoneViewport() ? 'phone' : (cfg.defaultDevice || 'desktop')),
      cfg,
    };
    if (!cfg.devices.some(d => d.v === ctx.device)) ctx.device = cfg.devices[0].v;
    if (!cfg.states.some(s => s.v === ctx.state)) ctx.state = cfg.states[0].v;
    const top = document.createElement('header');
    top.className = 'mk-top';
    document.body.prepend(top);
    const why = document.createElement('div');
    why.className = 'mk-why';
    top.after(why);
    const main = document.createElement('main');
    main.className = 'mk-main';
    main.innerHTML = '<div class="stage-wrap"><div class="stage"></div></div>';
    why.after(main);
    const stage = $('.stage', main), wrap = $('.stage-wrap', main);
    ctx.stage = stage;

    function header() {
      top.innerHTML = `<div class="mk-title">${B.ibtn('arrow-left', 'Alle Entwürfe', { attrs: { 'data-href': './' } })}<b>${esc(cfg.title)}</b><span class="mk-id">${esc(cfg.ids)}</span>
        <span style="margin-left:auto"></span>${B.ibtn(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 'Hell / dunkel', { attrs: { 'data-mk': 'theme' } })}</div>
        <div class="mk-ctrls">${B.seg({ label: 'Variante', value: ctx.variant, options: [{ value: 'a', label: 'Variante A' }, { value: 'b', label: 'Variante B' }], attrs: { 'data-mk': 'variant' } })}
        ${B.select({ label: 'Zustand', labelPos: 'hidden', value: ctx.state, options: cfg.states.map(s => ({ value: s.v, label: s.label })), attrs: { 'data-mk': 'state' }, cls: 'oo-ui-select-wrap', bare: false })}
        ${cfg.devices.length > 1 ? B.seg({ label: 'Gerät', value: ctx.device, options: cfg.devices.map(d => ({ value: d.v, label: d.label })), attrs: { 'data-mk': 'device' } }) : ''}</div>`;
      const v = cfg.variants[ctx.variant];
      why.innerHTML = `<b>${esc(v.name)}</b><span>${v.why}</span>`;
      why.onclick = () => why.classList.toggle('is-open');
    }
    top.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.href) { location.href = t.dataset.href; return; }
      if (t.dataset.mk === 'theme') {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next; store.set('theme', next); sync(); return;
      }
      const seg = t.closest('[data-mk]');
      if (seg && t.dataset.v) { ctx[seg.dataset.mk] = t.dataset.v; if (seg.dataset.mk === 'variant') ctx.resetState?.(); sync(); }
    });
    top.addEventListener('change', e => { if (e.target.dataset.mk === 'state') { ctx.state = e.target.value; sync(); } });

    function fit() {
      const real = ctx.device !== 'desktop' && isPhoneViewport();
      stage.className = cx('stage', ctx.device === 'desktop' ? 'is-desktop' : 'is-phone', real && 'is-real');
      main.classList.toggle('is-phone-real', real);
      let W, H, scale = 1;
      if (ctx.device === 'desktop') {
        W = 1280; H = 780;
        const avail = vw() - (isPhoneViewport() ? 16 : 32);
        scale = Math.min(1, avail / W);
      } else if (real) {
        W = vw();
        H = Math.max(560, Math.round((window.visualViewport ? visualViewport.height : document.documentElement.clientHeight)) - top.offsetHeight - why.offsetHeight);
      } else {
        W = ctx.device === 'phone320' ? 320 : 390; H = ctx.device === 'phone320' ? 700 : 800;
      }
      stage.style.width = W + 'px'; stage.style.height = H + 'px';
      stage.style.transform = scale !== 1 ? `scale(${scale})` : '';
      wrap.style.width = W * scale + 'px'; wrap.style.height = H * scale + 'px';
      ctx.W = W; ctx.H = H; ctx.scale = scale; ctx.phone = ctx.device !== 'desktop';
    }
    function sync() {
      const p = new URLSearchParams({ v: ctx.variant, s: ctx.state, d: ctx.device });
      history.replaceState(null, '', '#' + p.toString());
      header();
      fit();
      cfg.render(ctx);
      scrollHints(stage);
    }
    ctx.sync = sync;
    // Keyboard for non-button controls with role="button" (section heads, grabbers).
    stage.addEventListener('keydown', e => {
      const t = e.target.closest('[role="button"][tabindex]');
      if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); }
    });
    ctx.setState = s => { ctx.state = s; const sel = $('[data-mk="state"]', top); if (sel) sel.value = s; sync(); };
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(sync, 80); });
    const notes = document.getElementById('notes');
    if (notes) { const n = document.createElement('section'); n.className = 'mk-notes'; n.innerHTML = notes.innerHTML; main.after(n); }
    sync();
    return ctx;
  }

  /* ── Editor chrome ──────────────────────────────────────────────────────────────────────── */
  const fern = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 22V3"/><path d="M12 6 8 4M12 6l4-2M12 10 6.5 7.5M12 10l5.5-2.5M12 14l-6-2.5M12 14l6-2.5M12 18l-5-2M12 18l5-2"/></svg>';
  function chrome(ctx, o = {}) {
    const ph = ctx.phone;
    const head = `<div class="ed-head"><span class="logo">${fern}${ph ? '' : 'Fernwork'}</span>${ph ? '<span class="crumb"><b style="font-size:17px;font-weight:600">PDF Tools</b></span>' : '<span class="crumb">/ <b>PDF Tools</b></span>'}<span class="search">${icon('search')}Search tools…<span class="k">Ctrl+K</span></span><span class="icons">${ph ? icon('search') + '&nbsp;&nbsp;' + icon('ellipsis') : icon('history') + '&nbsp;&nbsp;' + icon('moon') + '&nbsp;&nbsp;' + icon('ellipsis')}</span></div>`;
    const tool = o.tool || 'edit';
    let islands;
    if (!ph) {
      islands = `<div class="island tl">${B.btn('Lageplan-Muster.pdf', { variant: 'quiet', icon: 'file-text', iconEnd: 'chevron-down', cls: 'file' })}<span class="sep"></span>
        ${B.btn('Pan', { variant: tool === 'pan' ? 'primary' : 'secondary', icon: 'hand' })}
        ${tool === 'measure' ? B.btn('Distance', { variant: 'primary', icon: 'measure-distance' }) : `<span class="${cx('oo-ui-split', tool === 'edit' && 'is-pressed')}"><button type="button" class="${cx('oo-ui-button oo-ui-split-main', tool === 'edit' ? 'is-pressed' : 'is-secondary')}">${icon('pen-tool')}<span class="oo-ui-button-label">Edit PDF</span></button><button type="button" aria-label="Editable objects" class="${cx('oo-ui-button oo-ui-split-toggle', tool === 'edit' ? 'is-pressed' : 'is-secondary')}">${icon('chevron-down')}</button></span>`}
        ${B.btn('Insert', { icon: 'plus' })}${tool === 'measure' ? '' : B.btn('Markup', { icon: 'highlighter' })}${B.btn('Guides', { icon: 'guides' })}</div>
        <div class="island tr">${B.btn('Save', { icon: 'save' })}${B.ibtn('undo' in (window.FW_ICONS || {}) ? 'undo' : 'rotate-ccw', 'Undo')}${B.ibtn('rotate-cw', 'Redo', { disabled: true })}<span class="sep"></span>${B.ibtn('printer', 'Print')}<span class="sep"></span>${B.btn('Document tools', { icon: 'wrench', iconEnd: 'chevron-down' })}${B.btn('Properties', { icon: 'panel-right', pressed: !!o.properties })}</div>
        <div class="island bl">${B.btn(o.zoom || '100%', { variant: 'quiet', cls: 'zoom' })}<span class="sep"></span>${B.btn('1 / 1', { variant: 'quiet' })}</div>
        <div class="island bc">${B.btn('Pages', { icon: 'files' })}${B.ibtn('rotate-ccw', 'Rotate page left')}${B.ibtn('rotate-cw', 'Rotate page right')}</div>
        <div class="island br">${B.ibtn('search', 'Find in PDF')}${B.ibtn('message-square', 'Comments', { pressed: true })}${B.ibtn('link', 'Links')}${B.ibtn('maximize', 'Fullscreen')}</div>`;
    } else {
      islands = `<div class="island top">${B.ibtn('files', 'Document tools', { variant: 'secondary' })}${B.btn('Lageplan…', { iconEnd: 'chevron-down', cls: 'file' })}${B.ibtn('save', 'Save', { variant: 'secondary' })}${B.ibtn('rotate-ccw', 'Undo', { variant: 'secondary' })}${B.ibtn('panel-right', 'Properties', { variant: 'secondary', pressed: !!o.properties })}</div>
        ${o.noBottom ? '' : `<div class="island bottom"><span style="display:flex;gap:4px">${B.ibtn('hand', 'Pan', { variant: 'secondary', pressed: tool === 'pan' })}${B.ibtn(tool === 'measure' ? 'measure-distance' : 'pen-tool', tool === 'measure' ? 'Distance' : 'Edit PDF', { variant: 'secondary', pressed: tool !== 'pan' })}${B.ibtn('plus', 'Insert', { variant: 'secondary' })}</span><span style="display:flex;gap:4px">${B.btn(o.zoom || '57%', { variant: 'secondary', cls: 'zoom' })}</span></div>`}`;
    }
    return { head, islands };
  }

  /* ── View transform, plan, objects ──────────────────────────────────────────────────────── */
  const PAGE = { w: 1000, h: 700 };
  const view = (z, ox, oy) => ({ z, ox, oy, s: p => ({ x: p.x * z + ox, y: p.y * z + oy }), w: p => ({ x: (p.x - ox) / z, y: (p.y - oy) / z }) });
  const rad = d => d * Math.PI / 180;
  const rot = (p, a) => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };

  // The synthetic Lageplan (paper; its own colours). World units = PDF points at 1:500.
  function plan(uid = 'p') {
    const hatch = `${uid}-h`, green = `${uid}-g`;
    return `<defs>
      <pattern id="${hatch}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e4e4e7"/><line x1="0" y1="0" x2="0" y2="8" stroke="#71717a" stroke-width="1"/></pattern>
      <pattern id="${green}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#dcfce7"/><circle cx="5" cy="5" r="1" fill="#16a34a"/></pattern>
    </defs>
    <rect x="0" y="0" width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
    <g font-family="Arial, Helvetica, sans-serif" fill="none" stroke="#111" stroke-width="1.2">
      <path d="M0 520 L1000 340 L1000 410 L0 590 Z" fill="#f4f4f5" stroke="none"/>
      <path d="M0 520 L1000 340 M0 590 L1000 410"/>
      <text x="0" y="0" transform="translate(230 543) rotate(-10.2)" font-size="20" fill="#111" stroke="none" font-style="italic">Musterweg</text>
      <path d="M90 60 L470 30 L520 500 L120 572" />
      <path d="M470 30 L860 70 L900 418 L520 500" />
      <path d="M90 60 L40 0 M860 70 L940 0" />
      <path d="M120 572 L60 700 M900 418 L1000 600" stroke-dasharray="14 4 2 4"/>
      <path d="M620 150 L800 130 L822 330 L640 350 Z" fill="url(#${green})" stroke="#16a34a"/>
      <path d="M150 110 L430 85 L462 390 L182 430 Z" stroke="#c026d3" stroke-width="2" stroke-dasharray="16 8"/>
      <g transform="translate(560 120) rotate(-6)"><rect x="0" y="0" width="70" height="120" fill="url(#${hatch})"/></g>
      <g transform="translate(700 380) rotate(-6)"><rect x="0" y="0" width="120" height="26" fill="url(#${hatch})"/></g>
      ${[[700, 230], [760, 270], [670, 300], [140, 470], [180, 520]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" stroke="#15803d" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="1.5" fill="#15803d" stroke="none"/>`).join('')}
      <g stroke="#111" stroke-width="0.8"><path d="M182 455 L462 415"/><path d="M182 447 L182 463 M462 407 L462 423"/></g>
      <text transform="translate(322 448) rotate(-8.1)" font-size="13" fill="#111" stroke="none" text-anchor="middle">28.40</text>
      <text x="300" y="300" font-size="15" fill="#111" stroke="none">1234/5</text>
      <text x="690" y="440" font-size="15" fill="#111" stroke="none">1236</text>
      <text x="230" y="40" font-size="13" fill="#111" stroke="none">1233</text>
      ${[[255, 140, '512.48'], [410, 360, '512.91'], [560, 470, '511.86'], [830, 160, '513.20']].map(([x, y, t]) => `<path d="M${x - 4} ${y} h8 M${x} ${y - 4} v8" stroke-width="1"/><text x="${x + 6}" y="${y - 4}" font-size="10" fill="#334155" stroke="none">${t}</text>`).join('')}
      <g transform="translate(940 60)"><path d="M0 -26 L9 14 L0 6 L-9 14 Z" fill="#111" stroke="none"/><text y="32" font-size="13" text-anchor="middle" fill="#111" stroke="none">N</text></g>
      <g transform="translate(700 600)"><rect width="280" height="80" fill="#fff"/><path d="M0 28 H280 M150 28 V80"/>
        <text x="10" y="20" font-size="13" font-weight="bold" fill="#111" stroke="none">Lageplan (Muster)</text>
        <text x="10" y="48" font-size="10" fill="#111" stroke="none">Gemarkung Musterhausen</text><text x="10" y="64" font-size="10" fill="#111" stroke="none">Flurstück 1234/5</text>
        <text x="160" y="48" font-size="10" fill="#111" stroke="none">Maßstab 1:500</text><text x="160" y="64" font-size="10" fill="#111" stroke="none">synthetisch</text></g>
    </g>`;
  }

  // Objects: {id,name,type:'text'|'rect'|'area'|'path'|'line', cx,cy,rot, w,h | pts(local), …}
  const isBox = o => o.type === 'text' || o.type === 'rect' || o.type === 'image';
  function localBox(o) {
    if (o.type === 'text') { const w = o.text.length * o.size * 0.56, h = o.size * 1.25; return { x0: -w / 2, y0: -h / 2, x1: w / 2, y1: h / 2 }; }
    if (o.type === 'rect' || o.type === 'image') return { x0: -o.w / 2, y0: -o.h / 2, x1: o.w / 2, y1: o.h / 2 };
    const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  const toWorld = (o, p) => { const r = rot(p, o.rot || 0); return { x: r.x + o.cx, y: r.y + o.cy }; };
  const toLocal = (o, p) => rot({ x: p.x - o.cx, y: p.y - o.cy }, -(o.rot || 0));
  function corners(o) { const b = localBox(o); return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }].map(p => toWorld(o, p)); }
  function shapePts(o) { // outline in world coords
    if (isBox(o)) return { pts: corners(o), closed: true };
    return { pts: o.pts.map(p => toWorld(o, p)), closed: o.type === 'area' };
  }
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function inPoly(p, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
    }
    return c;
  }
  function hit(o, wp, tol) {
    const { pts, closed } = shapePts(o);
    if (closed && inPoly(wp, pts)) return true;
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) if (segDist(wp, pts[i], pts[(i + 1) % pts.length]) <= tol) return true;
    return false;
  }
  function renderObj(o, uid = 'p') {
    const tr = `translate(${o.cx} ${o.cy}) rotate(${o.rot || 0})`;
    const op = o.opacity != null ? ` opacity="${o.opacity}"` : '';
    if (o.type === 'text') return `<g transform="${tr}"${op}><text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${o.size}" font-weight="${o.bold ? 700 : 400}" font-style="${o.italic ? 'italic' : 'normal'}" text-decoration="${[o.underline && 'underline', o.strike && 'line-through'].filter(Boolean).join(' ') || 'none'}" fill="${o.fill || '#111'}">${esc(o.text)}</text></g>`;
    if (o.type === 'image') return '';
    if (o.type === 'rect') return `<g transform="${tr}"${op}><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" fill="${o.fill === 'hatch' ? `url(#${uid}-h)` : (o.fill || 'none')}" stroke="${o.stroke || '#111'}" stroke-width="${o.sw || 1.5}"/></g>`;
    const d = o.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (o.type === 'area' ? ' Z' : '');
    return `<g transform="${tr}"${op}><path d="${d}" fill="${o.type === 'area' ? (o.fill || 'none') : 'none'}" stroke="${o.stroke || '#111'}" stroke-width="${o.sw || 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/></g>`;
  }
  const polyStr = pts => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const typeLabel = { text: 'Text', rect: 'Rechteck', area: 'Fläche', path: 'Pfad', line: 'Linie', image: 'Bild' };
  const typeIcon = { text: 'type', rect: 'square', area: 'shapes', path: 'spline', line: 'minus', image: 'image' };

  // Pointer helper on an element: gives stage-local coordinates (unscaled) for pointer events.
  function localPoint(ctx, el, e) {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / ctx.scale, y: (e.clientY - r.top) / ctx.scale };
  }


  /* ── Selection overlay (screen coordinates) ─────────────────────────────────────────────── */
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function outlineSVG(o, v, cls = 'ov-outline', halo = true) {
    const { pts, closed } = shapePts(o);
    const sp = pts.map(v.s);
    const tag = closed ? 'polygon' : 'polyline';
    return (halo ? `<${tag} class="ov-outline-halo" points="${polyStr(sp)}"/>` : '') + `<${tag} class="${cls}" points="${polyStr(sp)}"/>`;
  }
  function handlesSVG(cs, angle, phone, kind = 'corner') {
    const r = phone ? 7 : 4;
    return cs.map((p, i) => `<g class="hit" data-h="${kind}:${i}" style="cursor:${['nwse', 'nesw', 'nwse', 'nesw'][i % 4]}-resize">${phone ? `<circle cx="${p.x}" cy="${p.y}" r="22" fill="transparent"/>` : `<circle cx="${p.x}" cy="${p.y}" r="8" fill="transparent"/>`}${phone
      ? `<circle class="ov-handle" cx="${p.x}" cy="${p.y}" r="${r}"/>`
      : `<rect class="ov-handle" x="${p.x - r}" y="${p.y - r}" width="${2 * r}" height="${2 * r}" rx="1.5" transform="rotate(${angle} ${p.x} ${p.y})"/>`}</g>`).join('');
  }
  function rotHandleSVG(cs, phone) {
    const c = mid(cs[0], cs[2]), t = mid(cs[0], cs[1]);
    let dx = t.x - c.x, dy = t.y - c.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const off = phone ? 34 : 22, p = { x: t.x + dx * off, y: t.y + dy * off };
    const r = phone ? 14 : 6;
    return `<line class="ov-stem" x1="${t.x}" y1="${t.y}" x2="${p.x - dx * r}" y2="${p.y - dy * r}"/><g class="hit" data-h="rot" style="cursor:grab"><circle cx="${p.x}" cy="${p.y}" r="${phone ? 22 : 10}" fill="transparent"/><circle class="ov-rot" cx="${p.x}" cy="${p.y}" r="${r}"/>${phone ? `<g transform="translate(${p.x - 8} ${p.y - 8}) scale(.6667)" fill="none" stroke="var(--pdf-accent-strong)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></g>` : ''}</g>`;
  }
  /* style: 'aabb' (today), 'obb' (frame turns with the object, outline for paths), 'shape' (lines/paths: vertices only) */
  function selOverlay(objs, v, o = {}) {
    if (!objs.length) return '';
    const phone = !!o.phone, style = o.style || 'obb';
    if (style === 'aabb') {
      const all = objs.flatMap(ob => isBox(ob) ? corners(ob) : shapePts(ob).pts).map(v.s);
      const x0 = Math.min(...all.map(p => p.x)) - 2, y0 = Math.min(...all.map(p => p.y)) - 2, x1 = Math.max(...all.map(p => p.x)) + 2, y1 = Math.max(...all.map(p => p.y)) + 2;
      const cs = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
      return `<polygon class="ov-frame" points="${polyStr(cs)}"/>` + cs.map(p => `<circle class="ov-handle" cx="${p.x}" cy="${p.y}" r="${phone ? 9 : 4.5}"/>`).join('') + (phone ? rotHandleSVG(cs, phone) : '');
    }
    let out = '';
    if (objs.length === 1) {
      const ob = objs[0];
      const isPath = ob.type === 'path' || ob.type === 'line' || ob.type === 'area';
      if (isPath) out += outlineSVG(ob, v);
      if (style === 'shape' && (ob.type === 'path' || ob.type === 'line')) {
        const sp = shapePts(ob).pts.map(v.s);
        out += sp.map((p, i) => `<g class="hit" data-h="v:${i}" style="cursor:move"><circle cx="${p.x}" cy="${p.y}" r="${phone ? 22 : 8}" fill="transparent"/><circle class="ov-handle is-vertex" cx="${p.x}" cy="${p.y}" r="${phone ? 7 : 4}"/></g>`).join('');
        return out;
      }
      const cs = corners(ob).map(v.s);
      out += `<polygon class="ov-frame" points="${polyStr(cs)}"${isPath ? ' style="stroke-width:1;stroke-dasharray:4 3"' : ''}/>`;
      if (!o.locked) out += rotHandleSVG(cs, phone) + handlesSVG(cs, ob.rot || 0, phone);
      else out += cs.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--pdf-accent-strong)"/>`).join('');
      return out;
    }
    // Several objects: each shows its own outline, one group frame (turned when all share an angle).
    objs.forEach(ob => { out += outlineSVG(ob, v, 'ov-hover', false); });
    const same = objs.every(ob => Math.abs(((ob.rot || 0) - (objs[0].rot || 0)) % 360) < 0.5);
    const ang = same ? (objs[0].rot || 0) : 0;
    const pts = objs.flatMap(ob => isBox(ob) ? corners(ob) : shapePts(ob).pts);
    const loc = pts.map(p => rot(p, -ang));
    const x0 = Math.min(...loc.map(p => p.x)), y0 = Math.min(...loc.map(p => p.y)), x1 = Math.max(...loc.map(p => p.x)), y1 = Math.max(...loc.map(p => p.y));
    const cs = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map(p => v.s(rot(p, ang)));
    out += `<polygon class="ov-frame" points="${polyStr(cs)}"/>` + rotHandleSVG(cs, phone) + handlesSVG(cs, ang, phone);
    return out;
  }
  // A view at zoom z that centres the objects inside a band of the canvas (the part no sheet or island covers).
  function fitView(objs, z, band) {
    const pts = objs.flatMap(o => isBox(o) ? corners(o) : shapePts(o).pts);
    const cx0 = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2;
    const cy0 = (Math.min(...pts.map(p => p.y)) + Math.max(...pts.map(p => p.y))) / 2;
    return view(z, (band.x0 + band.x1) / 2 - cx0 * z, (band.y0 + band.y1) / 2 - cy0 * z);
  }
  function hoverOverlay(ob, v, cls = 'ov-hover') { return ob ? outlineSVG(ob, v, cls, false) : ''; }
  function objectsAt(objs, wp, tolPx, v) { return objs.filter(o => !o.hidden && hit(o, wp, tolPx / v.z)).reverse(); }

  window.Mock = { $, $$, esc, cx, icon, B, page, chrome, plan, PAGE, view, rot, rad, localBox, toWorld, toLocal, corners, shapePts, hit, renderObj, polyStr, typeLabel, typeIcon, localPoint, store, scrollHints, selOverlay, fitView, hoverOverlay, outlineSVG, objectsAt, mid };
})();
