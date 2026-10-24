/**
 * Fernwork — PWA install prompt wiring
 *
 * Chromium (Edge, Chrome, Brave, Arc, Opera…) fires a `beforeinstallprompt`
 * event when the manifest is valid and the app isn't installed yet. We
 * stash that event and expose an "Install as app" menu entry in the
 * ⋯ menu so users don't have to hunt for the browser-specific
 * install affordance (omnibox icon on desktop Chrome, three-dot menu on
 * Android, Safari's share-sheet workflow on iOS).
 *
 * Behavior summary:
 *   - If `beforeinstallprompt` fires → show the menu entry, click triggers
 *     the native prompt.
 *   - If the app is already running as a PWA (standalone display mode or
 *     iOS's `navigator.standalone`) → hide the entry entirely.
 *   - On iOS/Safari (no prompt event) → show the entry, click opens a
 *     lightweight instructions modal explaining the share-sheet flow,
 *     because Apple intentionally doesn't expose a programmatic prompt.
 *   - On desktop Firefox / Safari that have neither prompt nor standalone
 *     support → keep the entry hidden so we don't promise something we
 *     can't deliver.
 */

import { openDialog } from './kit/shell.js';

let deferredPrompt = null;
let iosHint = false;

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    // iOS Safari only populates this one.
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function showInstallSlot() {
  const slot = document.getElementById('oo-install-slot');
  if (slot) slot.hidden = false;
}

function hideInstallSlot() {
  const slot = document.getElementById('oo-install-slot');
  if (slot) slot.hidden = true;
}

function showIosInstructions() {
  // Apple doesn't give us a programmatic install prompt, so explain the share-sheet flow. A kit dialog: focus moves
  // in and is trapped, Escape / backdrop / Got it close it, focus returns to the ⋯ menu button.
  openDialog({
    title: 'Install Fernwork',
    size: 440,
    body: `
      <p>On iOS, installing a web app happens from Safari's share sheet:</p>
      <ol style="margin: 12px 0 0 20px; padding: 0;">
        <li>Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
        <li>Scroll down and pick <strong>Add to Home Screen</strong>.</li>
        <li>Confirm the name and tap <strong>Add</strong>.</li>
      </ol>
      <p style="margin-top: 16px;">Once installed, the app runs full-screen, without Safari chrome.</p>`,
    actions: [{ label: 'Got it', primary: true }],
  });
}

/** True when "Install as app" can do something: a deferred Chromium prompt, or the iOS share-sheet hint. */
export function installAvailable() {
  return !isStandalone() && (Boolean(deferredPrompt) || iosHint);
}

/** Runs the install flow (native prompt, or the iOS instructions). */
export function triggerInstall() { return triggerPrompt(); }

async function triggerPrompt() {
  if (!deferredPrompt) {
    if (isIos()) showIosInstructions();
    return;
  }
  try {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
  } catch (err) {
    console.warn('[install-prompt] prompt failed', err);
  } finally {
    // The event is single-use; subsequent clicks should be no-ops until
    // Chromium fires a fresh `beforeinstallprompt`, which it won't while
    // the PWA is still installable. Hiding the slot prevents the user
    // from getting stuck with a dead button.
    deferredPrompt = null;
    iosHint = false;
    hideInstallSlot();
  }
}

export function initInstallPrompt() {
  if (isStandalone()) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallSlot();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallSlot();
  });

  // iOS doesn't fire `beforeinstallprompt`, but users there do benefit
  // from a reminder of where the Add-to-Home-Screen action lives —
  // particularly first-time visitors who wouldn't think to look there.
  if (isIos()) { iosHint = true; showInstallSlot(); }

  // The shell's ⋯ menu shows "Install as app" only while installAvailable() is true and calls triggerInstall().
}
