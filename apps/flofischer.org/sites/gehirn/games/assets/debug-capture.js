/**
 * Fernwork — debug report capture
 *
 * In debug mode (`?debug=1`) Cmd/Ctrl+Shift+B or the "Report" badge opens a
 * small dialog. The event log and app state are frozen when the dialog opens,
 * so typing a long note does not push the reproduction out of the log.
 * Saving posts them with the note to the local dev server (`serve.py`), which
 * writes a report folder under test/reports/ and, on
 * "Save + screenshot", captures the browser window's screen area.
 */

import { debugSessionId, debugSnapshot, isDebugMode, log, recentEvents } from './debug-log.js';
import { showToast } from './toast.js';

const REPORT_ENDPOINT = '/__debug/report';
const REPORT_WINDOW_MS = 120_000;
const INSTALLED_KEY = '__fernworkDebugCaptureInstalled';

let dialog = null;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'style') Object.assign(node.style, value);
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function installBadge() {
  const badge = el('button', {
    type: 'button',
    'data-debug-badge': 'true',
    title: 'Debug mode: report an issue (Cmd/Ctrl+Shift+B). Open with ?debug=0 to turn off.',
    text: 'Debug · Report',
    style: {
      position: 'fixed',
      left: '8px',
      bottom: '8px',
      zIndex: '2147483000',
      padding: '3px 8px',
      font: '600 11px/1.4 system-ui, sans-serif',
      color: '#fff',
      background: '#b45309',
      border: '0',
      borderRadius: '4px',
      opacity: '0.85',
      cursor: 'pointer',
    },
  });
  badge.addEventListener('click', () => openDialog());
  document.body.appendChild(badge);
}

function closeDialog() {
  dialog?.remove();
  dialog = null;
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function downloadFallback(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `fernwork-report-${Date.now()}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function freezeCapture() {
  const entry = log.info('report.captured');
  return {
    capturedAt: new Date().toISOString(),
    markerSeq: entry.seq,
    snapshot: debugSnapshot(),
    events: recentEvents(REPORT_WINDOW_MS),
  };
}

// Screen points of the whole browser window; screencapture -R uses the same space.
function windowRegion() {
  return {
    x: Math.round(window.screenX),
    y: Math.round(window.screenY),
    width: Math.round(window.outerWidth),
    height: Math.round(window.outerHeight),
  };
}

async function submitReport({ kind, note, screenshot, frozen }) {
  const payload = {
    kind,
    note,
    sessionId: debugSessionId(),
    ...frozen,
    events: kind === 'bug' ? frozen.events : [],
    captureScreen: screenshot,
    screenshotRegion: screenshot ? windowRegion() : undefined,
  };
  // The dialog must be gone before the server takes the screenshot.
  await nextFrame();
  try {
    const response = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const shot = screenshot && !result.screenshot ? ' (screenshot failed — check macOS Screen Recording permission)' : '';
    showToast(`Report saved: ${result.folder}${shot}`, shot ? 'warning' : 'success', shot ? 8000 : 4000);
  } catch (error) {
    downloadFallback(payload);
    showToast(`Report server unavailable (${error.message}); downloaded the report as JSON instead. Run "npm run serve".`, 'warning', 8000);
  }
}

function openDialog() {
  if (dialog) {
    dialog.querySelector('textarea')?.focus();
    return;
  }
  const frozen = freezeCapture();
  const textarea = el('textarea', {
    rows: '3',
    placeholder: 'What happened? (optional)\nEnter saves · Cmd/Ctrl+Enter saves with screenshot · Shift+Enter new line',
    'aria-label': 'Report description',
    style: { width: '100%', boxSizing: 'border-box', font: '13px/1.4 system-ui, sans-serif', padding: '6px', resize: 'vertical' },
  });
  const kindSelect = el('select', { 'aria-label': 'Report kind', style: { font: '13px system-ui, sans-serif' } }, [
    el('option', { value: 'bug', text: 'Bug (attach log)' }),
    el('option', { value: 'idea', text: 'Idea / UX' }),
  ]);
  const save = el('button', { type: 'button', text: 'Save', title: 'Enter', style: { font: '600 13px system-ui, sans-serif', padding: '4px 12px' } });
  const saveWithShot = el('button', {
    type: 'button',
    text: 'Save + screenshot',
    title: 'Cmd/Ctrl+Enter — captures this browser window',
    'data-debug-report-screenshot': 'true',
    style: { font: '600 13px system-ui, sans-serif', padding: '4px 12px' },
  });
  const cancel = el('button', { type: 'button', text: 'Cancel', style: { font: '13px system-ui, sans-serif', padding: '4px 12px' } });
  dialog = el('div', {
    role: 'dialog',
    'aria-label': 'Report an issue',
    'data-debug-report-dialog': 'true',
    style: {
      position: 'fixed',
      left: '8px',
      bottom: '36px',
      width: 'min(480px, calc(100vw - 16px))',
      zIndex: '2147483001',
      padding: '10px',
      display: 'grid',
      gap: '8px',
      background: '#fff',
      color: '#111',
      border: '2px solid #b45309',
      borderRadius: '6px',
      boxShadow: '0 6px 24px rgba(0,0,0,.25)',
    },
  }, [
    el('strong', { text: 'Report an issue', style: { font: '600 13px system-ui, sans-serif' } }),
    textarea,
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      kindSelect,
      el('span', { style: { flex: '1' } }),
      cancel,
      save,
      saveWithShot,
    ]),
  ]);
  const doSave = screenshot => {
    const note = textarea.value.trim();
    const kind = kindSelect.value;
    closeDialog();
    void submitReport({ kind, note, screenshot, frozen });
  };
  save.addEventListener('click', () => doSave(false));
  saveWithShot.addEventListener('click', () => doSave(true));
  cancel.addEventListener('click', closeDialog);
  // Keep typing inside the dialog away from the editor's keyboard shortcuts.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
    } else if (event.key === 'Enter' && !event.shiftKey && event.target === textarea) {
      event.preventDefault();
      doSave(event.metaKey || event.ctrlKey);
    }
  });
  document.body.appendChild(dialog);
  textarea.focus();
}

function isCaptureShortcut(event) {
  return event.shiftKey && (event.metaKey || event.ctrlKey) && !event.altKey &&
    (event.code === 'KeyB' || String(event.key).toLowerCase() === 'b');
}

export function installDebugCapture() {
  if (!isDebugMode() || typeof window === 'undefined' || window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;
  window.addEventListener('keydown', event => {
    if (!isCaptureShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    openDialog();
  }, true);
  if (document.body) installBadge();
  else document.addEventListener('DOMContentLoaded', installBadge, { once: true });
  log.info('debug.enabled', { sessionId: debugSessionId() });
}

installDebugCapture();
