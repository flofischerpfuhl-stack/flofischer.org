/**
 * Fernwork — Drag & Drop File Upload Component
 */

import { icon } from './icons.js';
import { registerFilePasteTarget } from './file-paste.js';

/**
 * Create a drag & drop zone in a container
 * @param {HTMLElement} container - Container to inject dropzone into
 * @param {Object} options
 * @param {string[]} [options.accept] - Accepted file extensions (e.g. ['.jpg', '.png'])
 * @param {string} [options.acceptLabel] - Human-readable format list (e.g. "JPG, PNG, WebP")
 * @param {boolean} [options.multiple=true] - Allow multiple files
 * @param {Function} options.onFiles - Callback when files are selected: (files: File[]) => void
 * @param {string} [options.message] - Custom message text
 * @param {boolean} [options.showPrivacy=true] - Show the quiet "Files stay on your device" line
 * @param {string} [options.viewerId] - If set, the dropzone also listens for a
 *   global `oo-open-file-<viewerId>` CustomEvent, so the PWA's OS-level file
 *   handler (registered in manifest.webmanifest) can route a file here
 *   without every viewer having to wire up its own launchQueue consumer.
 *   The event detail is `{ file: File }`.
 * @param {number} [options.pastePriority=0] - Resolves clipboard routing when
 *   multiple visible dropzones accept the same file type.
 * @returns {{ reset: Function, getElement: Function }}
 */
export function createDropzone(container, options = {}) {
  const {
    accept = [],
    acceptLabel = '',
    multiple = true,
    onFiles,
    message,
    showPrivacy = true,
    viewerId = null,
    pastePriority = 0,
  } = options;

  const accepted = [...accept];
  let acceptedLabel = acceptLabel;
  const acceptStr = () => accepted.length ? accepted.join(',') : '';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'sr-only';
  fileInput.id = 'dropzone-input-' + Math.random().toString(36).slice(2, 8);
  if (multiple) fileInput.multiple = true;
  if (acceptStr()) fileInput.accept = acceptStr();

  const zone = document.createElement('div');
  zone.className = 'dropzone';
  zone.id = 'dropzone-' + Math.random().toString(36).slice(2, 8);
  zone.innerHTML = `
    <svg class="dropzone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <div class="dropzone-text">
      ${message || `<span class="fw-pointer-copy">Drag & drop file${multiple ? 's' : ''} here or <span class="dropzone-browse">browse</span></span><span class="fw-touch-copy">Choose ${multiple ? 'files' : 'a file'}</span>`}
    </div>
    <div class="dropzone-hint ${acceptedLabel ? '' : 'hidden'}" data-dropzone-accept-hint>${acceptedLabel ? `Supports: ${acceptedLabel}` : ''}</div>
    <div class="dropzone-busy hidden" data-dropzone-busy aria-live="polite">
      <div class="dropzone-busy-label" data-dropzone-busy-label>Preparing file...</div>
      <div class="dropzone-busy-bar"><div class="dropzone-busy-fill"></div></div>
    </div>
    ${showPrivacy ? `<div class="dropzone-hint dropzone-local"><span class="fw-local">${icon('lock')}Files stay on your device</span></div>` : ''}
  `;

  container.appendChild(zone);
  container.appendChild(fileInput);

  // Click to browse
  zone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFiles([...fileInput.files]).finally(() => {
        fileInput.value = ''; // Reset so same file can be re-selected
      });
    }
  });

  // Drag events
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');

    const files = [...(e.dataTransfer?.files || [])];
    if (files.length > 0) {
      handleFiles(multiple ? files : [files[0]]);
    }
  });

  async function handleFiles(files) {
    // Filter by accepted extensions if specified
    if (accepted.length > 0) {
      const filtered = files.filter(f => {
        return accepted.some((rule) => acceptsFile(f, rule));
      });
      
      if (filtered.length === 0) {
        // Import toast dynamically to avoid circular deps
        import('./toast.js').then(({ showToast }) => {
          showToast(`Unsupported file format. Accepted: ${acceptedLabel || accepted.join(', ')}`, 'error');
        });
        return;
      }
      
      if (filtered.length < files.length) {
        import('./toast.js').then(({ showToast }) => {
          showToast(`${files.length - filtered.length} file(s) skipped (unsupported format)`, 'warning');
        });
      }
      
      files = filtered;
    }

    if (!onFiles) return;
    setBusy(true, files.length > 1 ? `Preparing ${files.length} files...` : `Preparing ${files[0]?.name || 'file'}...`);
    try {
      await onFiles(files);
    } finally {
      setBusy(false);
    }
  }

  registerFilePasteTarget({
    root: zone,
    input: fileInput,
    accept: accepted,
    multiple,
    onFiles: handleFiles,
    priority: pastePriority,
  });

  // Cross-cutting entry point used by the OS-level PWA file-handler flow.
  // `assets/file-open.js` dispatches `oo-open-file-<viewerId>` once it has
  // pulled a `File` out of the launchQueue; by listening here instead of
  // inside each viewer we avoid duplicating error handling / filtering
  // across nine viewer modules — they all already go through `onFiles`.
  if (viewerId) {
    document.addEventListener(`oo-open-file-${viewerId}`, (ev) => {
      const file = ev.detail?.file;
      if (file) handleFiles([file]);
    });
  }

  function reset() {
    fileInput.value = '';
  }

  function hide() {
    zone.classList.add('hidden');
  }

  function show() {
    zone.classList.remove('hidden');
  }

  function setAccept(nextAccept = [], nextAcceptLabel = '') {
    accepted.splice(0, accepted.length, ...nextAccept);
    acceptedLabel = nextAcceptLabel;
    if (accepted.length) fileInput.accept = acceptStr();
    else fileInput.removeAttribute('accept');
    const hint = zone.querySelector('[data-dropzone-accept-hint]');
    if (hint) {
      hint.textContent = acceptedLabel ? `Supports: ${acceptedLabel}` : '';
      hint.classList.toggle('hidden', !acceptedLabel);
    }
  }

  function setBusy(isBusy, label = 'Preparing file...') {
    zone.classList.toggle('is-busy', isBusy);
    fileInput.disabled = isBusy;
    const busy = zone.querySelector('[data-dropzone-busy]');
    const labelEl = zone.querySelector('[data-dropzone-busy-label]');
    if (labelEl) labelEl.textContent = label;
    if (busy) busy.classList.toggle('hidden', !isBusy);
  }

  return { reset, hide, show, setAccept, getElement: () => zone, getInput: () => fileInput };
}

function acceptsFile(file, rule) {
  const normalized = String(rule || '').trim().toLowerCase();
  if (!normalized) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (normalized.startsWith('.')) return name.endsWith(normalized);
  if (normalized.endsWith('/*')) return type.startsWith(normalized.slice(0, -1));
  return type === normalized;
}
