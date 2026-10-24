/* =====================================================================
 * theme.js  —  Load eagerly in <head> BEFORE style.css.
 *
 * Sets <html data-theme="light|dark"> based on (in order):
 *   1. localStorage['oo-theme']  → 'system' | 'light' | 'dark'
 *   2. OS preference via matchMedia('(prefers-color-scheme: dark)')
 *
 * Exposed on window.OOTheme with methods set(mode), get(), cycle().
 * Mode 'system' means "track OS", and keeps a live media-query listener.
 *
 * Must run BEFORE the first paint to avoid a flash of wrong theme,
 * which is why this is a non-module plain script in the document head.
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'oo-theme';
  var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function readStored() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch (_) { /* storage may be blocked */ }
    return 'system';
  }

  function effective(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return mediaQuery.matches ? 'dark' : 'light';
  }

  function apply(mode) {
    document.documentElement.setAttribute('data-theme', effective(mode));
    // Let other modules react (e.g. charts, toolbars).
    try {
      document.dispatchEvent(new CustomEvent('oo-theme-change', {
        detail: { mode: mode, effective: effective(mode) }
      }));
    } catch (_) { /* Safari older: fall back below */ }
  }

  function set(mode) {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') mode = 'system';
    try { localStorage.setItem(KEY, mode); } catch (_) {}
    apply(mode);
  }

  function get() { return readStored(); }

  function cycle() {
    var order = ['system', 'light', 'dark'];
    var idx = order.indexOf(readStored());
    set(order[(idx + 1) % order.length]);
  }

  // Track OS preference while user is on "system".
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', function () {
      if (readStored() === 'system') apply('system');
    });
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(function () {
      if (readStored() === 'system') apply('system');
    });
  }

  apply(readStored());

  window.OOTheme = { set: set, get: get, cycle: cycle, apply: apply };
})();
