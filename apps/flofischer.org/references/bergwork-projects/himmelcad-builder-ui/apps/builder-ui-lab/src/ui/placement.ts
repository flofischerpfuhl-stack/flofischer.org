import { useLayoutEffect, useState, type RefObject } from 'react';

/** Floating surfaces keep this distance to the window edge (DESIGN-SYSTEM › floating surfaces). */
const MARGIN = 8;
/** A dropdown that flips above its field keeps the same gap as below it. */
const FIELD_GAP = 4;

/**
 * The element floating surfaces are portalled into and kept inside: the app marks its window
 * root with `data-ui-root`; without it the document body.
 */
export function uiRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-ui-root]') ?? document.body;
}

export interface AnchorRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Menu placement like every desktop toolkit (copied from the lab's popupPlacement.ts): a context
 * menu opens at the pointer and flips above it / left of it at the window edge; a dropdown stays
 * at its field — above it at the bottom edge, right-aligned to it at the right edge. Never leaves
 * the window. Measured before paint, so nothing flickers.
 */
export function usePlacement(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
  anchor?: AnchorRect,
  /** Off for a surface its owner positions (an attached menu). */
  enabled = true,
): { left: number; top: number } {
  const [position, setPosition] = useState({ left: x, top: y });
  const anchorRight = anchor?.right;
  const anchorTop = anchor?.top;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const bounds = (
      el.closest('[data-ui-root]') ?? document.documentElement
    ).getBoundingClientRect();
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (anchorRight !== undefined && anchorTop !== undefined) {
      if (top + height > bounds.bottom - MARGIN) top = anchorTop - FIELD_GAP - height;
      if (left + width > bounds.right - MARGIN) left = anchorRight - width;
    } else {
      if (top + height > bounds.bottom - MARGIN) top = y - height;
      if (left + width > bounds.right - MARGIN) left = x - width;
    }
    left = Math.max(bounds.left + MARGIN, Math.min(left, bounds.right - MARGIN - width));
    top = Math.max(bounds.top + MARGIN, Math.min(top, bounds.bottom - MARGIN - height));
    setPosition((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
  }, [ref, x, y, anchorRight, anchorTop, enabled]);
  return position;
}
