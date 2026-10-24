/* =====================================================================
 * viewer-session.js  —  Per-viewer file persistence via IndexedDB.
 *
 * Problem: When the user loads a DXF, PPTX, DOCX, etc. in one viewer tab
 * and then navigates to a different tool, they expect the file to still
 * be there when they come back. localStorage / sessionStorage are capped
 * around 5 MB per origin and are synchronous — unusable for the 20 MB
 * DOCX or 40 MB DXF the user might have loaded. IndexedDB holds Blobs
 * directly, so we keep the original File object intact.
 *
 * Storage model:
 *   - Single object store `files` keyed by viewer id (e.g. "dxf", "pptx").
 *   - Each record: { id, name, type, size, blob, savedAt }.
 *   - We store one file per viewer; loading a new file overwrites the old.
 *
 * Quota: IndexedDB defaults vary (Firefox ~50% of disk, Chrome ~60% of
 * free disk). If a write fails due to QuotaExceededError we just log it
 * — the viewer keeps working, the file just won't be restored next time.
 *
 * Public API:
 *   saveViewerFile(viewerId, file)  → stores the File Blob.
 *   loadViewerFile(viewerId)        → returns a File object or null.
 *   clearViewerFile(viewerId)       → removes the entry.
 *   showViewerSpinner(root, label)  → overlay spinner used by viewers.
 *   hideViewerSpinner(root)         → removes it.
 *   bootstrapViewerWithRestore(opt) → full "spinner-first" rehydrate flow
 *                                     that prevents the empty-dropzone
 *                                     flash on viewer mount.
 * ===================================================================== */

import { showToast } from './toast.js';
import { storageVersion } from './app-version.js';

const DB_NAME = 'oo-viewer-sessions';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function restoreVersionFor(viewerId) {
  return storageVersion(viewerId);
}

/** Persist a File/Blob associated with a viewer id. */
export async function saveViewerFile(viewerId, file) {
  if (!file) return;
  try {
    const store = await tx('readwrite');
    const record = {
      id: String(viewerId),
      name: file.name || 'file',
      type: file.type || 'application/octet-stream',
      size: file.size ?? 0,
      appVersion: restoreVersionFor(viewerId),
      // IndexedDB accepts Blobs directly in all evergreen browsers.
      blob: file,
      savedAt: Date.now(),
    };
    await new Promise((resolve, reject) => {
      const r = store.put(record);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  } catch (err) {
    console.warn('[viewer-session] Could not persist file for', viewerId, err);
  }
}

/** Load a previously saved File (or null if none). */
export async function loadViewerFile(viewerId) {
  try {
    const store = await tx('readonly');
    const rec = await new Promise((resolve, reject) => {
      const r = store.get(String(viewerId));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (!rec || !rec.blob) return null;
    if (rec.appVersion !== restoreVersionFor(viewerId)) {
      try { await clearViewerFile(viewerId); } catch { /* ignore stale cleanup failures */ }
      return null;
    }
    // Wrap the Blob back into a File so callers don't need special casing.
    return new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.savedAt });
  } catch (err) {
    console.warn('[viewer-session] Could not load file for', viewerId, err);
    return null;
  }
}

/** Remove the persisted file for a viewer (usually on close). */
export async function clearViewerFile(viewerId) {
  try {
    const store = await tx('readwrite');
    await new Promise((resolve, reject) => {
      const r = store.delete(String(viewerId));
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  } catch (err) {
    console.warn('[viewer-session] Could not clear file for', viewerId, err);
  }
}

// ─── Spinner helpers ────────────────────────────────────────────────
// Standalone full-cover spinner that viewers can drop over their canvas
// while they parse a restored file. Small and self-contained so each
// viewer doesn't re-invent the wheel.

export function showViewerSpinner(root, label = 'Loading…') {
  if (!root) return;
  hideViewerSpinner(root);
  const overlay = document.createElement('div');
  overlay.className = 'viewer-spinner-overlay';
  overlay.innerHTML = `
    <div class="viewer-spinner-inner">
      <span class="spinner spinner-lg"></span>
      <span class="viewer-spinner-label"></span>
    </div>
  `;
  overlay.querySelector('.viewer-spinner-label').textContent = label;
  // Make the spinner overlay relative to whatever positioned ancestor the
  // viewer uses; callers generally pass a positioned container.
  const cs = getComputedStyle(root);
  if (cs.position === 'static') root.style.position = 'relative';
  root.appendChild(overlay);
}

export function hideViewerSpinner(root) {
  if (!root) return;
  const existing = root.querySelector(':scope > .viewer-spinner-overlay');
  if (existing) existing.remove();
}

// ─── Bootstrap helper ───────────────────────────────────────────────
// Coordinates the "show spinner first → check IndexedDB → restore or
// reveal dropzone" dance that every viewer needs at mount. Without it,
// each viewer renders the empty drag-and-drop UI for ~50–300 ms before
// the IndexedDB lookup finishes — looks like a bug to the user, who
// just navigated away and back and expects their file to still be open.
//
// The dropzone element MUST start hidden in the markup (`class="hidden"`)
// so this helper can choose what to reveal once the lookup resolves.
//
// `restore(file)` is awaited; if it throws, the saved file is purged
// and the dropzone is shown so the user can re-load manually.
//
// The spinner is only inserted after a small `debounceMs` delay so a
// fast no-data lookup (a few ms on warm IndexedDB) doesn't produce a
// visible flicker either.
export async function bootstrapViewerWithRestore({
  viewerId,
  dropEl,
  shell,
  restore,
  label = 'Loading…',
  restoreLabel,
  debounceMs = 60,
  showSpinner = true,
}) {
  if (!dropEl || !shell || typeof restore !== 'function') {
    console.warn('[viewer-session] bootstrapViewerWithRestore: missing dropEl/shell/restore');
    return false;
  }

  // Spinner host: prefer the common parent so the overlay covers
  // whichever child (dropzone or shell) ends up visible. Falls back to
  // the dropzone itself if the elements don't share a parent.
  const host = dropEl.parentElement || dropEl;
  const cs = getComputedStyle(host);
  if (cs.position === 'static') host.style.position = 'relative';

  let spinnerEl = null;
  const showTimer = showSpinner ? setTimeout(() => {
    spinnerEl = document.createElement('div');
    spinnerEl.className = 'viewer-spinner-overlay';
    spinnerEl.innerHTML = `
      <div class="viewer-spinner-inner">
        <span class="spinner spinner-lg"></span>
        <span class="viewer-spinner-label"></span>
      </div>
    `;
    spinnerEl.querySelector('.viewer-spinner-label').textContent = label;
    host.appendChild(spinnerEl);
  }, debounceMs) : null;

  const setLabel = (text) => {
    if (spinnerEl) {
      const lbl = spinnerEl.querySelector('.viewer-spinner-label');
      if (lbl) lbl.textContent = text;
    } else {
      // Spinner not yet visible — update the label that will be used
      // when (and if) the debounce timer fires.
      label = text;
    }
  };

  const removeSpinner = () => {
    if (showTimer) clearTimeout(showTimer);
    if (spinnerEl && spinnerEl.parentNode) spinnerEl.parentNode.removeChild(spinnerEl);
    spinnerEl = null;
  };

  let saved = null;
  try {
    saved = await loadViewerFile(viewerId);
  } catch (err) {
    console.warn('[viewer-session] lookup failed for', viewerId, err);
  }

  if (!saved) {
    removeSpinner();
    dropEl.classList.remove('hidden');
    return false;
  }

  // Found a saved file — keep the spinner up over the shell while the
  // viewer's own restore code parses + renders the document.
  shell.classList.remove('hidden');
  setLabel(restoreLabel || `Restoring ${saved.name || 'file'}…`);

  try {
    await restore(saved);
    return true;
  } catch (err) {
    console.warn('[viewer-session] restore failed for', viewerId, err);
    try { await clearViewerFile(viewerId); } catch { /* ignore */ }
    shell.classList.add('hidden');
    dropEl.classList.remove('hidden');
    return false;
  } finally {
    removeSpinner();
  }
}

/**
 * A "loaded" confirmation only matters to someone looking at that viewer. Viewers restore their last file in the
 * background (hidden sub-viewers too), so a toast from a panel that is not on screen is dropped.
 */
export function showToastIfVisible(anchor, message, type = 'info', duration, options) {
  if (anchor && !anchor.getClientRects().length) return null;
  return showToast(message, type, duration, options);
}
