// Fernwork One · stable resize (G1: no flicker while resizing).
//
// While a split divider, panel, window or slider keeps changing the size of a canvas / SVG / stage, keep the last
// good frame on screen and redraw ONCE when the size has settled (rAF + `settle` ms idle) instead of rebuilding
// every frame.
//
//   import { stableResize } from '../assets/kit/stable-resize.js';
//   const sr = stableResize(canvas, {
//     onSettle: ({ width, height }) => redraw(width, height),   // your existing render-at-size function
//     observe: canvas.parentElement,   // element whose size drives the redraw (default: parent)
//     fit: 'none',                     // frozen frame: 'none' = 1:1, cropped/letterboxed · 'contain' · 'fill'
//     anchor: 'center',                // object-position / transform-origin of the frozen frame
//   });
//   divider.addEventListener('pointerdown', () => sr.hold());   // optional: freeze for a whole drag …
//   divider.addEventListener('pointerup', () => sr.release());  // … and redraw once on release
//   sr.dispose();
//
// Canvas, <img> and <video> are frozen with `object-fit` (their bitmap is not touched until onSettle). Other
// elements (SVG, DOM stages) pin their current pixel size on `inner` (default: the element itself, which must then
// be allowed to overflow its container) and are shown CSS-scaled, so their content does not reflow every frame.

const REPLACED = /^(CANVAS|IMG|VIDEO)$/;

export function stableResize(el, { onSettle, observe = el?.parentElement || el, settle = 120, fit = 'none', anchor = 'center', inner = el } = {}) {
  if (!el || typeof ResizeObserver === 'undefined') return { hold() {}, release() {}, flush() {}, dispose() {} };
  const replaced = REPLACED.test(el.tagName);
  const size = () => { const r = observe.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height) }; };
  let last = size();
  let frozen = null, timer = 0, raf = 0, held = false, disposed = false;

  function freeze() {
    if (frozen) return;
    const target = replaced ? el : inner;
    const r = target.getBoundingClientRect();
    frozen = { target, style: target.getAttribute('style'), w: r.width, h: r.height };
    if (replaced) {
      target.style.objectFit = fit === 'contain' ? 'contain' : fit === 'fill' ? 'fill' : 'none';
      target.style.objectPosition = anchor === 'top-left' ? 'left top' : 'center';
    } else {
      target.style.width = `${frozen.w}px`; target.style.height = `${frozen.h}px`;
      target.style.transformOrigin = anchor === 'top-left' ? '0 0' : '50% 50%';
    }
    target.classList.add('fw-stable-frozen');
  }
  function track(next) {
    if (!frozen || replaced || fit === 'none') return;
    const sx = next.width / Math.max(1, frozen.w), sy = next.height / Math.max(1, frozen.h);
    const s = fit === 'fill' ? `scale(${sx}, ${sy})` : `scale(${Math.min(sx, sy)})`;
    frozen.target.style.transform = s;
  }
  function unfreeze() {
    if (!frozen) return;
    const { target, style } = frozen; frozen = null;
    if (style == null) target.removeAttribute('style'); else target.setAttribute('style', style);
    target.classList.remove('fw-stable-frozen');
  }
  function settleNow() {
    clearTimeout(timer); cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (disposed || held) return;
      last = size();
      unfreeze();
      onSettle?.(last);
    });
  }
  const ro = new ResizeObserver(() => {
    if (disposed) return;
    const next = size();
    if (next.width === last.width && next.height === last.height && !frozen) return;
    freeze(); track(next);
    clearTimeout(timer);
    if (!held) timer = setTimeout(settleNow, settle);
  });
  ro.observe(observe);

  return {
    /** Freeze now (e.g. on divider pointerdown); nothing redraws until release(). */
    hold() { held = true; clearTimeout(timer); freeze(); },
    /** End a hold; redraws once if the size changed. */
    release() { held = false; const n = size(); if (frozen || n.width !== last.width || n.height !== last.height) settleNow(); },
    /** Redraw immediately at the current size. */
    flush() { held = false; settleNow(); },
    dispose() { disposed = true; ro.disconnect(); clearTimeout(timer); cancelAnimationFrame(raf); unfreeze(); },
  };
}
