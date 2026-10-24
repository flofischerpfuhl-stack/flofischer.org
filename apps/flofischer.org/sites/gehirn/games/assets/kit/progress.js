// Fernwork One · progress helper (G3: every wait shows progress).
//
// One way to show determinate or indeterminate progress, or a spinner, inside any container:
//
//   import { showProgress, withProgress, spinnerHtml } from '../assets/kit/progress.js';
//
//   const p = showProgress(previewEl, { label: 'Rendering preview…' });          // indeterminate overlay
//   p.set(0.42);                      // determinate 42 % (number 0…1); p.set(null) → back to indeterminate
//   p.label('Encoding frame 12 of 30'); p.done();                                  // or p.fail('Could not render')
//
//   await withProgress(listEl, (report) => convert(file, { onProgress: report }), 'Converting photo.heic', {
//     cancel: () => controller.abort(),     // optional Cancel button
//   });
//
// Rules: the overlay appears only after `delay` ms (default 150) so instant work never flashes; it covers the
// container (which keeps its last content visible underneath, dimmed) and never blocks the rest of the page.
// mode 'inline' renders the bar inside the container instead of over it (e.g. empty areas, list rows).
// compact: a single-row pill (spinner + label) for small areas such as thumbnails or buttons.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Spinner markup for buttons and small inline states: `${spinnerHtml('Loading')}`. */
export function spinnerHtml(label = '') {
  return `<span class="fw-spinner" role="status" aria-label="${esc(label || 'Loading')}"></span>`;
}

/**
 * showProgress(container, { label, value, cancel, mode = 'overlay' | 'inline', compact, delay = 150 })
 * → { el, set(value|null), label(text), done(), fail(message), get open() }.
 */
export function showProgress(container, { label = 'Working…', value = null, cancel, mode = 'overlay', compact = false, delay = 150 } = {}) {
  if (!container) throw new Error('showProgress: container is required');
  const host = document.createElement('div');
  host.className = mode === 'inline' ? 'fw-progress-inline fw-ui' : 'fw-progress-overlay fw-ui';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = `<div class="fw-progress-card ${compact ? 'fw-progress-card--compact' : ''}">
    <div class="fw-progress-card__row">${compact ? spinnerHtml(label) : ''}<span class="fw-progress-card__label"></span>
      <span class="fw-progress-card__pct"></span>${cancel ? '<button type="button" class="fw-btn fw-btn--ghost fw-btn--sm" data-cancel>Cancel</button>' : ''}</div>
    ${compact ? '' : '<div class="fw-progress fw-progress--thin"><div class="fw-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="fw-progress__bar"></div></div></div>'}
  </div>`;
  const labelEl = host.querySelector('.fw-progress-card__label');
  const pctEl = host.querySelector('.fw-progress-card__pct');
  const track = host.querySelector('.fw-progress__track');
  const bar = host.querySelector('.fw-progress__bar');
  const prog = host.querySelector('.fw-progress');
  let open = true, attached = false, timer = 0;

  const attach = () => {
    if (attached || !open) return; attached = true;
    if (mode !== 'inline' && getComputedStyle(container).position === 'static') container.classList.add('fw-progress-host');
    container.append(host);
    container.setAttribute('aria-busy', 'true');
  };
  const api = {
    el: host,
    get open() { return open; },
    set(v) {
      if (v == null || !Number.isFinite(v)) {
        prog?.classList.add('fw-progress--indeterminate'); track?.removeAttribute('aria-valuenow'); pctEl.textContent = '';
      } else {
        const pct = Math.max(0, Math.min(100, v * 100));
        prog?.classList.remove('fw-progress--indeterminate');
        bar?.style.setProperty('--value', pct + '%'); track?.setAttribute('aria-valuenow', String(Math.round(pct)));
        pctEl.textContent = `${Math.round(pct)} %`;
      }
      return api;
    },
    label(text) { labelEl.textContent = text; track?.setAttribute('aria-label', text); return api; },
    done() {
      if (!open) return; open = false; clearTimeout(timer);
      container.removeAttribute('aria-busy');
      if (!attached) return;
      host.classList.add('is-leaving');
      setTimeout(() => { host.remove(); container.classList.remove('fw-progress-host'); }, 130);
    },
    fail(message) { api.done(); if (message) console.warn('[fw-progress]', message); },
  };
  api.label(label); api.set(value);
  host.querySelector('[data-cancel]')?.addEventListener('click', () => { try { cancel(); } finally { api.done(); } });
  if (delay > 0) timer = setTimeout(attach, delay); else attach();
  return api;
}

/**
 * withProgress(container, work, label, opts) — runs `work` (a promise, or a function receiving
 * `report(value 0…1 | null, label?)`) with a progress overlay; removes it when the work settles. Returns the result.
 */
export async function withProgress(container, work, label = 'Working…', opts = {}) {
  const p = showProgress(container, { ...opts, label });
  const report = (value, text) => { if (text) p.label(text); p.set(value); };
  try {
    return await (typeof work === 'function' ? work(report) : work);
  } finally {
    p.done();
  }
}
