/**
 * Fernwork — PWA file-handler entry point
 *
 * When the user opens a file from their OS file manager and picks the
 * installed Fernwork PWA, Chromium launches the URL declared in the
 * manifest's `file_handlers[].action` and hands us the file(s) through
 * `window.launchQueue`. This module turns that into something every viewer
 * on the page can consume:
 *
 *   1. `setupFileOpenRouter({ extToViewer })` wires a launchQueue consumer
 *      and, for each incoming file, figures out the right viewer based on
 *      its extension, switches the hash tab (so the viewer is mounted /
 *      visible) and dispatches `oo-open-file-<viewerId>` with the File.
 *
 *   2. Each viewer's dropzone already listens for that event (see
 *      `createDropzone`'s `viewerId` option), so no viewer has to know
 *      anything about the launchQueue.
 *
 * The launchQueue API is Chromium-only. On browsers without it (Safari,
 * Firefox) this module is a no-op — the standard drag/drop + file picker
 * flow still works. Installed Safari PWAs on macOS 14+ don't yet expose
 * file handlers either, so there's nothing to wire there.
 *
 * The router is deliberately tolerant: if we can't determine a viewer from
 * the extension we fall back to the current tab (for single-viewer pages
 * like pdf-tools.html) or surface a toast so the user knows the launch
 * happened but the file type wasn't recognized.
 */

import { showToast } from './toast.js';

function getExt(name) {
  const i = (name || '').lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/**
 * @param {Object} config
 * @param {Record<string, string>} [config.extToViewer]
 *   Map of file extension (without the dot, lower-case) to the viewerId
 *   that should handle it. The viewerId must match both the page's tab
 *   hash and the `viewerId` option passed to createDropzone on the
 *   receiving viewer.
 * @param {string} [config.defaultViewer]
 *   When set, files whose extension isn't in `extToViewer` are still
 *   dispatched to this viewer. Use for single-purpose pages like
 *   pdf-tools.html so that launchQueue entries without a matching
 *   extension (e.g. macOS sometimes omits it) still land somewhere.
 */
export function setupFileOpenRouter(config = {}) {
  const { extToViewer = {}, defaultViewer = null } = config;

  if (!('launchQueue' in window) || !('LaunchParams' in window)) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams?.files?.length) return;

    for (const handle of launchParams.files) {
      try {
        const file = await handle.getFile();
        const ext = getExt(file.name);
        const viewerId = extToViewer[ext] || defaultViewer;

        if (!viewerId) {
          showToast(`No viewer registered for .${ext} files.`, 'error');
          continue;
        }

        // Routing on a multi-tab page: flip the hash first so the tab's
        // container is visible *before* the file arrives. The tab may
        // render its dropzone lazily on activation; without this, the
        // event would fire into thin air.
        if (window.location.hash.replace('#', '') !== viewerId) {
          window.location.hash = viewerId;
          // Give the hashchange listener (setupTabs) a tick to swap the
          // active tab before we dispatch the file event.
          await new Promise((r) => requestAnimationFrame(() => r()));
        }

        document.dispatchEvent(
          new CustomEvent(`oo-open-file-${viewerId}`, { detail: { file } }),
        );
      } catch (err) {
        console.error('[file-open] Failed to receive launch file', err);
        showToast('Couldn’t open the file handed over by the OS.', 'error');
      }
    }
  });
}
