/**
 * Fernwork — Content Zoom Controller
 *
 * A reusable pan/zoom layer for scrollable HTML content (DOCX viewer,
 * Markdown preview, PPTX slide host, …). It wires up the interactions
 * users expect from every other document preview in the suite:
 *
 *   - Ctrl / Cmd  +   /   -   /   0       → zoom in, out, reset
 *   - Ctrl / Cmd  +  mouse wheel          → zoom anchored on cursor
 *   - Two-finger pinch                     → zoom anchored on pinch midpoint
 *
 * Two modes:
 *   - 'zoom' (default):  applies CSS `zoom` to the target element. The
 *     layout reflows, the scroll container sees the grown content and
 *     shows scrollbars as expected. Best for long document-style content.
 *
 *   - 'transform':       applies `transform: scale()` with a fixed
 *     origin. Content doesn't push scrollbars on its own — the caller
 *     usually sizes a wrapper. Best for fixed-aspect content like
 *     rendered slides.
 *
 * Both modes adjust `scrollLeft` / `scrollTop` after each zoom step so
 * the point under the cursor / pinch midpoint stays put — exactly like
 * the SVG and DXF viewers.
 */

/**
 * @typedef {Object} ZoomOptions
 * @property {HTMLElement} container          Scroll container.
 * @property {HTMLElement} [content=container] Element that actually scales.
 *   Defaults to the container itself for 'zoom' mode where the scaled
 *   element and the scroll element are the same.
 * @property {'zoom'|'transform'} [mode='zoom']
 * @property {number} [min=0.4]
 * @property {number} [max=4]
 * @property {number} [step=1.15]
 * @property {number} [initial=1]
 * @property {(zoom:number)=>void} [onChange] Called on every zoom change.
 * @property {()=>boolean} [enabled] Gate all shortcuts (e.g. skip when
 *   the viewer is hidden / not mounted).
 * @property {boolean} [keyboardShortcuts=true]
 * @property {HTMLElement} [shortcutScope=document] Element whose
 *   keydown events trigger shortcuts. Defaults to document so shortcuts
 *   work globally while the viewer is on-screen.
 * @property {boolean} [leftPan=false] If true, left mouse button drag
 *   always pans (use for viewers where text selection doesn't apply,
 *   e.g. PPTX slide host). Middle mouse button and Space + left
 *   already pan regardless of this flag.
 */

/**
 * Install pan/zoom handlers on an element.
 * @param {ZoomOptions} opts
 * @returns {{
 *   get zoom(): number,
 *   setZoom: (z:number, anchor?:{x:number,y:number})=>void,
 *   zoomIn: ()=>void,
 *   zoomOut: ()=>void,
 *   reset: ()=>void,
 *   destroy: ()=>void,
 * }}
 */
export function attachContentZoom(opts) {
  const container = opts.container;
  const content = opts.content || container;
  const mode = opts.mode || 'zoom';
  const min = opts.min ?? 0.4;
  const max = opts.max ?? 4;
  const step = opts.step ?? 1.15;
  let zoom = opts.initial ?? 1;
  const enabled = opts.enabled || (() => true);
  const shortcutScope = opts.shortcutScope || document;

  function apply() {
    if (mode === 'zoom') {
      // CSS `zoom` is back in all evergreen browsers (Chrome since v1,
      // Safari forever, Firefox since 126). It re-lays out the content,
      // so the scroll container sees the grown bounds naturally.
      content.style.zoom = zoom === 1 ? '' : String(zoom);
    } else {
      content.style.transformOrigin = '0 0';
      content.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
    }
    opts.onChange?.(zoom);
  }

  // Set an arbitrary zoom while keeping the point at `anchor` (coords
  // relative to the scroll container's viewport) anchored under the
  // cursor. `anchor` defaults to the container's center so toolbar
  // zoom buttons feel stable.
  //
  // Implementation: we sample the content's position on screen, zoom,
  // then shift the scroll container by the same amount the anchor
  // point moved. This automatically handles paddings, borders and the
  // `zoom` vs `transform` mode difference without any extra math.
  function setZoom(z, anchor) {
    const newZoom = Math.max(min, Math.min(max, Math.round(z * 1000) / 1000));
    if (newZoom === zoom) return;
    const rect = container.getBoundingClientRect();
    const ax = anchor ? anchor.x : container.clientWidth / 2;
    const ay = anchor ? anchor.y : container.clientHeight / 2;
    const clientX = rect.left + ax;
    const clientY = rect.top + ay;

    const before = content.getBoundingClientRect();
    // Ratio of the anchor point inside the content (0..1 when inside).
    const rx = before.width > 0 ? (clientX - before.left) / before.width : 0;
    const ry = before.height > 0 ? (clientY - before.top) / before.height : 0;

    zoom = newZoom;
    apply();

    // After layout, measure where the same ratio now lives and slide
    // the scroll container so it ends up back under the cursor.
    const after = content.getBoundingClientRect();
    const dx = (after.left + rx * after.width) - clientX;
    const dy = (after.top + ry * after.height) - clientY;
    container.scrollLeft += dx;
    container.scrollTop  += dy;
  }

  function zoomIn(anchor) { setZoom(zoom * step, anchor); }
  function zoomOut(anchor) { setZoom(zoom / step, anchor); }
  function reset()         { setZoom(1); }

  // ── Wheel zoom (Ctrl / Cmd pressed, anchored on cursor) ──────────
  function onWheel(e) {
    if (!enabled()) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Proportional to the wheel delta: a trackpad pinch sends many small events and must not race to the limit.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-300, Math.min(300, e.deltaY * unit * (e.ctrlKey ? 4 : 1)));
    setZoom(zoom * Math.exp(-delta * 0.0014), anchor);
  }
  container.addEventListener('wheel', onWheel, { passive: false });

  // ── Pinch zoom (anchored on pinch midpoint) ──────────────────────
  let pinchStartDist = null;
  let pinchStartZoom = 1;
  let pinchAnchor = null;
  function pinchMidpoint(touches) {
    const rect = container.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  }
  function pinchDistance(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  }
  function onTouchStart(e) {
    if (!enabled()) return;
    if (e.touches.length === 2) {
      pinchStartDist = pinchDistance(e.touches);
      pinchStartZoom = zoom;
      pinchAnchor = pinchMidpoint(e.touches);
      // Claim the gesture so the browser doesn't also pinch-zoom the
      // whole page on top of ours.
      e.preventDefault();
    }
  }
  function onTouchMove(e) {
    if (!enabled()) return;
    if (e.touches.length === 2 && pinchStartDist != null) {
      e.preventDefault();
      const nd = pinchDistance(e.touches);
      if (nd > 0 && pinchStartDist > 0) {
        // Update the anchor each frame so a two-finger pan while
        // pinching stays natural (the midpoint moves with the fingers).
        pinchAnchor = pinchMidpoint(e.touches);
        setZoom(pinchStartZoom * (nd / pinchStartDist), pinchAnchor);
      }
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) {
      pinchStartDist = null;
      pinchAnchor = null;
    }
  }
  container.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('touchmove',  onTouchMove,  { passive: false });
  container.addEventListener('touchend',   onTouchEnd);
  container.addEventListener('touchcancel', onTouchEnd);

  // ── Mouse drag to pan ────────────────────────────────────────────
  //   - Middle mouse button always pans (keeps text selection intact)
  //   - Space + left mouse button pans with a "grab" cursor
  //   - If `leftPan` is enabled, plain left drag pans too (use for
  //     viewers that don't have selectable text, e.g. PPTX host)
  let spaceHeld = false;
  let pointerInside = false;
  let panning = null; // { pointerId, x, y }

  container.addEventListener('pointerenter', () => { pointerInside = true; updateCursor(); });
  container.addEventListener('pointerleave', () => { pointerInside = false; updateCursor(); });

  function wantsPan(e) {
    if (!enabled()) return false;
    if (e.pointerType !== 'mouse') return false; // touch handled by pinch
    if (e.button === 1) return true;             // middle mouse
    if (e.button === 0 && (spaceHeld || opts.leftPan)) return true;
    return false;
  }

  function updateCursor() {
    // "grab" on hover while the hand tool is armed, so users see the
    // affordance before they start dragging.
    if (!enabled()) return;
    if (panning) {
      container.style.cursor = 'grabbing';
    } else if (spaceHeld || opts.leftPan) {
      container.style.cursor = 'grab';
    } else {
      container.style.cursor = '';
    }
  }

  function onPointerDown(e) {
    if (!wantsPan(e)) return;
    // Ignore clicks on native form controls / links so toolbar buttons
    // still work when they happen to live inside the scroll container.
    const t = e.target;
    if (t && t.closest && t.closest('button, a, input, select, textarea, [contenteditable=""], [contenteditable="true"]')) return;
    e.preventDefault();
    panning = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    try { container.setPointerCapture(e.pointerId); } catch (_) { /* capture is best-effort */ }
    updateCursor();
  }
  function onPointerMove(e) {
    if (!panning || e.pointerId !== panning.pointerId) return;
    const dx = e.clientX - panning.x;
    const dy = e.clientY - panning.y;
    panning.x = e.clientX;
    panning.y = e.clientY;
    container.scrollLeft -= dx;
    container.scrollTop  -= dy;
  }
  function endPan(e) {
    if (!panning) return;
    if (e && e.pointerId !== panning.pointerId) return;
    try { container.releasePointerCapture(panning.pointerId); } catch (_) { /* ignore */ }
    panning = null;
    updateCursor();
  }
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', endPan);
  container.addEventListener('pointercancel', endPan);
  // Middle-click on most browsers opens the auto-scroll gizmo — block
  // that default so the pointer drag above is the only behaviour.
  container.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  container.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

  if (opts.leftPan) updateCursor();

  // ── Keyboard shortcuts (global while enabled()) ──────────────────
  function onKey(e) {
    // Track Space separately (no modifier required) so the hand tool
    // engages regardless of the Ctrl / Cmd branch below. Only claim
    // the key while the cursor is actually over this viewer so Space
    // still scrolls the page when the user's focus is elsewhere.
    if (e.code === 'Space' && !spaceHeld && pointerInside) {
      const t = e.target;
      if (!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) {
        if (enabled()) {
          spaceHeld = true;
          e.preventDefault();
          updateCursor();
        }
      }
    }
    if (opts.keyboardShortcuts === false) return;
    if (!enabled()) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '+' || e.key === '=' || e.key === 'Add') {
      e.preventDefault(); zoomIn();
    } else if (e.key === '-' || e.key === 'Subtract') {
      e.preventDefault(); zoomOut();
    } else if (e.key === '0') {
      e.preventDefault(); reset();
    }
  }
  function onKeyUp(e) {
    if (e.code === 'Space' && spaceHeld) {
      spaceHeld = false;
      updateCursor();
    }
  }
  function onBlur() {
    if (spaceHeld) { spaceHeld = false; updateCursor(); }
  }
  shortcutScope.addEventListener('keydown', onKey);
  shortcutScope.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  apply();

  return {
    get zoom() { return zoom; },
    setZoom,
    zoomIn: (anchor) => zoomIn(anchor),
    zoomOut: (anchor) => zoomOut(anchor),
    reset,
    destroy() {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', endPan);
      container.removeEventListener('pointercancel', endPan);
      shortcutScope.removeEventListener('keydown', onKey);
      shortcutScope.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      container.style.cursor = '';
    },
  };
}
