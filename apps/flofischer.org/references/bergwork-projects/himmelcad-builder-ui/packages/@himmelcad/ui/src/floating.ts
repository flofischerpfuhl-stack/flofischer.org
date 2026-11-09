/**
 * One placement rule for every floating surface (tooltips, menus, submenus,
 * select lists, context menus, popovers): keep it inside the window with an
 * 8 px margin and the device's safe-area insets — prefer the requested side,
 * flip to the opposite side when that has the room, else take the roomier side
 * and limit the height (the surface scrolls inside); along the edge, align as
 * asked and shift back inside.
 *
 * The geometry is pure (`placeAnchored`, `placeAtPoint`, `shiftInside`, unit
 * tested); `useFloatingPlacement` / `useKeepInViewport` apply it to a DOM
 * element before paint. Fixed positioning is corrected for a transformed
 * ancestor (which would otherwise become the containing block).
 */
import { useLayoutEffect, type RefObject } from 'react';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type FloatingSide = 'top' | 'bottom' | 'left' | 'right';
export type FloatingAlign = 'start' | 'center' | 'end';

export interface FloatingPlacement {
  /** Window coordinates of the surface's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly side: FloatingSide;
  /** Set when the surface is taller / wider than the room: it scrolls inside. */
  readonly maxHeight?: number;
  readonly maxWidth?: number;
}

/** Distance kept from the window edges (and the safe-area insets). */
export const FLOATING_MARGIN = 8;

const OPPOSITE: Record<FloatingSide, FloatingSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** Room on each side of the anchor inside the bounds, minus the gap. */
function room(anchor: Box, bounds: Box, side: FloatingSide, gap: number): number {
  switch (side) {
    case 'top':
      return anchor.top - gap - bounds.top;
    case 'bottom':
      return bounds.bottom - anchor.bottom - gap;
    case 'left':
      return anchor.left - gap - bounds.left;
    case 'right':
      return bounds.right - anchor.right - gap;
  }
}

/** `start` … `end` aligned along [lo, hi), then shifted inside [min, max). */
function alongEdge(
  lo: number,
  hi: number,
  extent: number,
  align: FloatingAlign,
  min: number,
  max: number,
): { at: number; limit?: number } {
  if (extent >= max - min) return { at: min, limit: max - min };
  const at = align === 'start' ? lo : align === 'end' ? hi - extent : (lo + hi - extent) / 2;
  return { at: Math.min(Math.max(at, min), max - extent) };
}

/**
 * Placement of a surface of `size` next to `anchor`: on `side` when it fits,
 * else on the opposite side when that fits, else on the roomier of the two
 * with `maxHeight`/`maxWidth` set to that room.
 */
export function placeAnchored(
  anchor: Box,
  size: Size,
  bounds: Box,
  options: { side?: FloatingSide; align?: FloatingAlign; gap?: number } = {},
): FloatingPlacement {
  const preferred = options.side ?? 'bottom';
  const align = options.align ?? 'start';
  const gap = options.gap ?? 4;
  const vertical = preferred === 'top' || preferred === 'bottom';
  const need = vertical ? size.height : size.width;
  const flipped = OPPOSITE[preferred];
  let side = preferred;
  let limit: number | undefined;
  if (room(anchor, bounds, preferred, gap) < need) {
    if (room(anchor, bounds, flipped, gap) >= need) side = flipped;
    else {
      side =
        room(anchor, bounds, flipped, gap) > room(anchor, bounds, preferred, gap)
          ? flipped
          : preferred;
      // Too tall for either side: the roomier side, scrolling inside. Too wide for either side
      // (a menu cannot get narrower than its rows): shifted inside, over the anchor.
      if (vertical) limit = Math.max(0, room(anchor, bounds, side, gap));
      else if (need > bounds.right - bounds.left) limit = bounds.right - bounds.left;
    }
  }
  const extent = limit === undefined ? need : Math.min(need, limit);
  // An anchor at (or past) the margin, e.g. a pointer at the very edge, still leaves the margin.
  const clampMain = (at: number, min: number, max: number): number =>
    Math.min(Math.max(at, min), Math.max(min, max - extent));
  if (vertical) {
    const y = clampMain(
      side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - extent,
      bounds.top,
      bounds.bottom,
    );
    const cross = alongEdge(
      anchor.left,
      anchor.right,
      size.width,
      align,
      bounds.left,
      bounds.right,
    );
    return {
      x: cross.at,
      y,
      side,
      ...(limit !== undefined ? { maxHeight: limit } : {}),
      ...(cross.limit !== undefined ? { maxWidth: cross.limit } : {}),
    };
  }
  const x = clampMain(
    side === 'right' ? anchor.right + gap : anchor.left - gap - extent,
    bounds.left,
    bounds.right,
  );
  const cross = alongEdge(anchor.top, anchor.bottom, size.height, align, bounds.top, bounds.bottom);
  return {
    x,
    y: cross.at,
    side,
    ...(limit !== undefined ? { maxWidth: limit } : {}),
    ...(cross.limit !== undefined ? { maxHeight: cross.limit } : {}),
  };
}

/**
 * A context menu at a pointer: right of and below it; flipped to the left /
 * above when it does not fit there; shifted (and height-limited) when it fits
 * on neither side.
 */
export function placeAtPoint(x: number, y: number, size: Size, bounds: Box): FloatingPlacement {
  const point = { left: x, right: x, top: y, bottom: y };
  const horizontal = placeAnchored(point, size, bounds, { side: 'right', align: 'start', gap: 0 });
  const vertical = placeAnchored(point, size, bounds, { side: 'bottom', align: 'start', gap: 0 });
  return {
    x: horizontal.x,
    y: vertical.y,
    side: vertical.side,
    ...(vertical.maxHeight !== undefined ? { maxHeight: vertical.maxHeight } : {}),
    ...(horizontal.maxWidth !== undefined ? { maxWidth: horizontal.maxWidth } : {}),
  };
}

/** The shift that brings `rect` inside `bounds` (and the height limit when it is taller). */
export function shiftInside(
  rect: Box,
  bounds: Box,
): { dx: number; dy: number; maxHeight?: number; maxWidth?: number } {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const axis = (lo: number, hi: number, extent: number, min: number, max: number) => {
    // Larger than the window: keep its start where it is (inside the margin) and scroll.
    if (extent > max - min) {
      const at = Math.min(Math.max(lo, min), max - 120);
      return { d: at - lo, limit: max - at };
    }
    if (hi > max) return { d: max - hi };
    if (lo < min) return { d: min - lo };
    return { d: 0 };
  };
  const h = axis(rect.left, rect.right, width, bounds.left, bounds.right);
  const v = axis(rect.top, rect.bottom, height, bounds.top, bounds.bottom);
  return {
    dx: h.d,
    dy: v.d,
    ...(v.limit !== undefined ? { maxHeight: v.limit } : {}),
    ...(h.limit !== undefined ? { maxWidth: h.limit } : {}),
  };
}

let insetProbe: HTMLElement | null = null;

/** Safe-area insets (notches, home indicator) read from `env()` through a hidden probe. */
function safeAreaInsets(): Box {
  if (typeof document === 'undefined' || !document.body) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  if (!insetProbe || !insetProbe.isConnected) {
    insetProbe = document.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(insetProbe);
  }
  const cs = getComputedStyle(insetProbe);
  return {
    left: parseFloat(cs.paddingLeft) || 0,
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  };
}

/** The window inside the margin and the safe-area insets. */
export function viewportBounds(margin = FLOATING_MARGIN): Box {
  if (typeof window === 'undefined') return { left: margin, top: margin, right: 1280, bottom: 720 };
  const inset = safeAreaInsets();
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = window.innerHeight;
  return {
    left: inset.left + margin,
    top: inset.top + margin,
    right: width - inset.right - margin,
    bottom: height - inset.bottom - margin,
  };
}

/** `position: fixed` at window coordinates, corrected for a transformed ancestor. */
function applyFixed(el: HTMLElement, placement: FloatingPlacement): void {
  el.style.position = 'fixed';
  el.style.translate = '';
  el.style.left = `${placement.x}px`;
  el.style.top = `${placement.y}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.maxHeight = placement.maxHeight !== undefined ? `${placement.maxHeight}px` : '';
  el.style.maxWidth = placement.maxWidth !== undefined ? `${placement.maxWidth}px` : '';
  if (placement.maxHeight !== undefined) el.style.overflowY = 'auto';
  const rect = el.getBoundingClientRect();
  const dx = placement.x - rect.left;
  const dy = placement.y - rect.top;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    el.style.left = `${placement.x + dx}px`;
    el.style.top = `${placement.y + dy}px`;
  }
  el.dataset.side = placement.side;
}

/**
 * The surface's own size (its CSS limits apply), without a height/width limit set by an
 * earlier placement and measured at the window's corner, where a shrink-to-fit width is not
 * squeezed by the edge.
 */
function naturalSize(el: HTMLElement): Size {
  el.style.position = 'fixed';
  el.style.translate = '';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.maxHeight = '';
  el.style.maxWidth = '';
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export type FloatingRequest =
  | {
      readonly anchor: Box | (() => Box | null);
      readonly side?: FloatingSide;
      readonly align?: FloatingAlign;
      readonly gap?: number;
    }
  | { readonly point: { readonly x: number; readonly y: number } };

/**
 * Re-runs `update` on window resizes and on scrolling anywhere but inside `el` (an anchor in
 * a scrolling panel moves; the surface's own scrolling does not move it).
 */
function followLayout(el: HTMLElement, update: () => void): () => void {
  const onScroll = (event: Event): void => {
    if (event.target instanceof Node && el.contains(event.target)) return;
    update();
  };
  window.addEventListener('resize', update);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', onScroll, { capture: true });
  };
}

/** Places `ref`'s element by `request` after every render, on resize and on scroll. */
export function useFloatingPlacement(
  ref: RefObject<HTMLElement | null>,
  request: FloatingRequest | null,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !request) return;
    const place = (): void => {
      // A height limit set below is lifted to measure; keep the reader's scroll position.
      const scrollTop = el.scrollTop;
      const size = naturalSize(el);
      const bounds = viewportBounds();
      if ('point' in request) {
        applyFixed(el, placeAtPoint(request.point.x, request.point.y, size, bounds));
      } else {
        const anchor = typeof request.anchor === 'function' ? request.anchor() : request.anchor;
        if (!anchor) return;
        applyFixed(
          el,
          placeAnchored(anchor, size, bounds, {
            ...(request.side ? { side: request.side } : {}),
            ...(request.align ? { align: request.align } : {}),
            ...(request.gap !== undefined ? { gap: request.gap } : {}),
          }),
        );
      }
      if (scrollTop) el.scrollTop = scrollTop;
    };
    place();
    return followLayout(el, place);
  });
}

/**
 * Keeps an element that positions itself (CSS or a caller's style) inside the
 * window: shifted with the `translate` property (independent of `transform`)
 * and height-limited with internal scrolling when it is taller than the room.
 */
export function useKeepInViewport(ref: RefObject<HTMLElement | null>, active = true): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const keep = (): void => {
      const scrollTop = el.scrollTop;
      el.style.translate = '';
      if (el.dataset.hcKeptHeight) {
        el.style.maxHeight = el.dataset.hcKeptHeight === 'none' ? '' : el.dataset.hcKeptHeight;
        delete el.dataset.hcKeptHeight;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const fit = shiftInside(rect, viewportBounds());
      if (fit.maxHeight !== undefined) {
        el.dataset.hcKeptHeight = el.style.maxHeight || 'none';
        el.style.maxHeight = `${fit.maxHeight}px`;
        el.style.overflowY = 'auto';
      }
      if (fit.dx || fit.dy) el.style.translate = `${fit.dx}px ${fit.dy}px`;
      if (scrollTop) el.scrollTop = scrollTop;
    };
    keep();
    return followLayout(el, keep);
  });
}

/** A DOM rect as a {@link Box}. */
export function boxOf(el: Element | null | undefined): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}
