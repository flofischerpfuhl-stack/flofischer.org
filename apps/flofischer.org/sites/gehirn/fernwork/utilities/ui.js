// Utilities · small shared pieces: inline "More options" disclosure, opt-in "Remember my input", file download,
// clipboard paste. Everything else comes from the kit.
import { $, esc, icon, toast, store, kbd } from '../kit/shell.js';

/** Inline disclosure button + panel. Returns HTML; wire with wireMore(root). */
export const moreHtml = (id, body, { label = 'More options', open = false } = {}) => `
  <div class="ut-more ${open ? 'is-open' : ''}" data-more="${id}">
    <button class="fw-btn fw-btn--ghost fw-btn--sm ut-more__btn" type="button" aria-expanded="${open}" aria-controls="${id}">${icon('sliders-horizontal')}<span>${esc(label)}</span>${icon('chevron-down', { size: 14 })}</button>
    <div class="ut-more__body" id="${id}" ${open ? '' : 'hidden'}>${body}</div>
  </div>`;
export function wireMore(root, { onToggle, key } = {}) {
  root.querySelectorAll('[data-more]').forEach((m) => {
    const b = m.querySelector('.ut-more__btn'); const body = m.querySelector('.ut-more__body');
    if (key && store.get(key) === true && body.hidden) { body.hidden = false; b.setAttribute('aria-expanded', 'true'); m.classList.add('is-open'); }
    b.onclick = () => {
      const open = body.hidden; body.hidden = !open; b.setAttribute('aria-expanded', String(open)); m.classList.toggle('is-open', open);
      if (key) store.set(key, open); onToggle?.(open);
    };
  });
}

/** Opt-in content memory (today's "Remember inputs on this device (except passwords)"). Off by default. */
export function remember(tool) {
  const on = () => store.get(`util:remember:${tool}`) === true;
  const k = `util:input:${tool}`;
  return {
    on,
    load() { return on() ? store.get(k) : null; },
    save(v) { if (on()) store.set(k, v); },
    html: () => `<label class="fw-toggle ut-remember"><input type="checkbox" data-remember ${on() ? 'checked' : ''}><span>Remember my input on this device${tool === 'qr' ? ' (not passwords)' : ''}</span></label>`,
    wire(root, get) {
      const cb = root.querySelector('[data-remember]'); if (!cb) return;
      cb.onchange = () => {
        store.set(`util:remember:${tool}`, cb.checked);
        if (cb.checked) { store.set(k, get()); toast('Your input is kept on this device', { type: 'neutral' }); }
        else { store.del(k); toast('Saved input removed', { type: 'neutral' }); }
      };
    },
  };
}

export function download(blob, name, { quiet = false } = {}) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (!quiet) toast(`Saved ${name}`, { type: 'success' });
}

export async function readClipboard(label = 'text') {
  try { const t = await navigator.clipboard.readText(); if (!t) toast('The clipboard is empty', { type: 'info' }); return t || null; }
  catch { toast(`Press ${kbd('mod+v').replace(/<[^>]+>/g, '')} to paste ${label}`, { type: 'info' }); return null; }
}

export const isCoarse = () => matchMedia('(pointer: coarse)').matches;
export const isPhone = () => matchMedia('(max-width: 640px)').matches;
export { $ };
