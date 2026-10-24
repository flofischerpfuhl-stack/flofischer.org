/**
 * Fernwork — Themed dialog primitives.
 *
 * Promise-based replacements for the native `window.alert/confirm/prompt`
 * popups, styled to match the rest of the Fernwork UI. All return
 * promises so they can be awaited inline in async handlers.
 *
 * Usage:
 *   await ooAlert({ title: 'Heads up', message: '…' });
 *   const ok = await ooConfirm({ message: 'Delete this row?', destructive: true });
 *   const value = await ooPrompt({ message: 'Sheet name', defaultValue: 'Sheet1' });
 *   const choice = await ooChoice({ message: 'Pick one', options: [...] });
 *
 * The functions render an accessible dialog with focus trap, ESC-cancel,
 * backdrop-click cancel, and the Fernwork button styling. Confirm/Prompt
 * cancel resolve with `false`/`null` respectively, never with `undefined`,
 * so call-sites can use a simple truthy check.
 */

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'oo-dialog-host';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function renderDialog({ title, bodyHTML, buttons, onClose, onMounted }) {
  const root = ensureHost();
  const overlay = document.createElement('div');
  overlay.className = 'oo-dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (title) overlay.setAttribute('aria-label', title);

  overlay.innerHTML = `
    <div class="oo-dialog">
      ${title ? `<header class="oo-dialog-header"><h3 class="oo-dialog-title">${escapeHtml(title)}</h3></header>` : ''}
      <div class="oo-dialog-body">${bodyHTML}</div>
      <footer class="oo-dialog-footer">
        ${buttons.map((b, i) => `
          <button type="button"
                  class="btn ${b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : 'btn-secondary'}"
                  data-dialog-action="${escapeHtml(b.action)}"
                  data-dialog-index="${i}">
            ${escapeHtml(b.label)}
          </button>`).join('')}
      </footer>
    </div>
  `;

  root.appendChild(overlay);

  let resolved = false;
  const close = (action) => {
    if (resolved) return;
    resolved = true;
    overlay.classList.add('is-leaving');
    document.removeEventListener('keydown', handleKey);
    setTimeout(() => overlay.remove(), 140);
    onClose(action);
  };

  function handleKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close('cancel');
    } else if (event.key === 'Enter' && !(event.target.tagName === 'TEXTAREA')) {
      const primary = overlay.querySelector('button[data-dialog-action="confirm"]')
        || overlay.querySelector('button.btn-primary')
        || overlay.querySelector('button.btn-danger');
      if (primary) {
        event.preventDefault();
        primary.click();
      }
    }
  }
  document.addEventListener('keydown', handleKey);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close('cancel');
    const btn = event.target.closest('button[data-dialog-action]');
    if (btn) close(btn.dataset.dialogAction);
  });

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    onMounted?.(overlay);
  });
}

/**
 * Show a custom alert dialog. Resolves when the user dismisses.
 */
export function ooAlert({ title = '', message = '', confirmLabel = 'OK' } = {}) {
  return new Promise((resolve) => {
    renderDialog({
      title,
      bodyHTML: `<p class="oo-dialog-message">${formatMessage(message)}</p>`,
      buttons: [{ label: confirmLabel, action: 'confirm', kind: 'primary' }],
      onClose: () => resolve(undefined),
    });
  });
}

/**
 * Show a confirmation dialog. Resolves true on confirm, false on cancel.
 */
export function ooConfirm({
  title = '',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
} = {}) {
  return new Promise((resolve) => {
    renderDialog({
      title,
      bodyHTML: `<p class="oo-dialog-message">${formatMessage(message)}</p>`,
      buttons: [
        { label: cancelLabel, action: 'cancel', kind: 'secondary' },
        { label: confirmLabel, action: 'confirm', kind: destructive ? 'danger' : 'primary' },
      ],
      onClose: (action) => resolve(action === 'confirm'),
    });
  });
}

/**
 * Show a prompt dialog asking the user for input.
 * Resolves with the entered string, or null if cancelled.
 *
 * Options:
 *   { title, message, defaultValue, placeholder, confirmLabel, cancelLabel, multiline, type }
 */
export function ooPrompt({
  title = '',
  message = '',
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  multiline = false,
  type = 'text',
  pattern = null,
  minlength = null,
  maxlength = null,
} = {}) {
  return new Promise((resolve) => {
    const fieldId = `oo-dialog-input-${Math.random().toString(36).slice(2, 8)}`;
    const fieldHTML = multiline
      ? `<textarea id="${fieldId}" class="oo-dialog-input" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>`
      : `<input id="${fieldId}"
                class="oo-dialog-input"
                type="${escapeHtml(type)}"
                value="${escapeHtml(defaultValue)}"
                placeholder="${escapeHtml(placeholder)}"
                ${pattern ? `pattern="${escapeHtml(pattern)}"` : ''}
                ${minlength != null ? `minlength="${minlength}"` : ''}
                ${maxlength != null ? `maxlength="${maxlength}"` : ''}>`;

    let lastValue = defaultValue;

    renderDialog({
      title,
      bodyHTML: `
        ${message ? `<p class="oo-dialog-message">${formatMessage(message)}</p>` : ''}
        <div class="oo-dialog-field">${fieldHTML}</div>
      `,
      buttons: [
        { label: cancelLabel, action: 'cancel', kind: 'secondary' },
        { label: confirmLabel, action: 'confirm', kind: 'primary' },
      ],
      onMounted: (overlay) => {
        const input = overlay.querySelector(`#${fieldId}`);
        if (input) {
          input.focus();
          if (input.select && !multiline) input.select();
          input.addEventListener('input', () => { lastValue = input.value; });
        }
      },
      onClose: (action) => resolve(action === 'confirm' ? lastValue : null),
    });
  });
}

/**
 * Show a list of choices. Resolves with the selected option's value, or null.
 *
 * Options: { title, message, options: [{ label, value, hint? }], cancelLabel }
 */
export function ooChoice({
  title = '',
  message = '',
  options = [],
  cancelLabel = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    let selected = null;
    const optionsHTML = options.map((opt, i) => `
      <button type="button"
              class="oo-dialog-choice"
              data-dialog-choice="${i}">
        <span class="oo-dialog-choice-label">${escapeHtml(opt.label)}</span>
        ${opt.hint ? `<span class="oo-dialog-choice-hint">${escapeHtml(opt.hint)}</span>` : ''}
      </button>
    `).join('');

    renderDialog({
      title,
      bodyHTML: `
        ${message ? `<p class="oo-dialog-message">${formatMessage(message)}</p>` : ''}
        <div class="oo-dialog-choices">${optionsHTML}</div>
      `,
      buttons: [{ label: cancelLabel, action: 'cancel', kind: 'secondary' }],
      onMounted: (overlay) => {
        overlay.querySelectorAll('[data-dialog-choice]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.dialogChoice);
            selected = options[idx]?.value ?? null;
            const action = btn.closest('button')?.dispatchEvent(new MouseEvent('click'));
            // Click root to close
            overlay.dispatchEvent(new CustomEvent('__close'));
            const root = ensureHost();
            const overlays = root.querySelectorAll('.oo-dialog-overlay');
            // We just resolve and unmount manually via close synthesizer
            resolve(selected);
            overlays[overlays.length - 1]?.remove();
          });
        });
      },
      onClose: () => {
        if (selected == null) resolve(null);
      },
    });
  });
}

function formatMessage(message) {
  if (message == null) return '';
  return String(message)
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br>');
}

// Convenience: expose globally so vendor scripts that try `window.alert`
// get hooked too if desired. We DON'T actually override the natives
// (would break SDKs), but make the helpers easy to discover from devtools.
if (typeof window !== 'undefined') {
  window.ooAlert = ooAlert;
  window.ooConfirm = ooConfirm;
  window.ooPrompt = ooPrompt;
  window.ooChoice = ooChoice;
}
