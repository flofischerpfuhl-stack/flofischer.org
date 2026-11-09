import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

/** Floating surfaces keep this distance to the window edge. */
const MARGIN = 8;
/** Hover opens a submenu after this pause (macOS/Fluent). */
const OPEN_DELAY = 120;
/** Resting inside the safe triangle longer than this closes the submenu. */
const STALL = 400;

/** Is (x, y) inside triangle abc? */
export function pointInTriangle(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const side = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    (x - q.x) * (p.y - q.y) - (p.x - q.x) * (y - q.y);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/**
 * One submenu's behaviour (macOS/Fluent; owner 2026-10-20 „hover muss reichen … mit Dreieck"):
 * hover opens it after a short pause; while the pointer moves from the row toward the submenu it
 * may cross other rows — inside the triangle between where it left the row and the submenu's near
 * edge the submenu stays (the safe triangle); it closes when the pointer leaves that triangle or
 * rests in it too long. Reaching the submenu cancels the close (owner 2026-11-06: „sogar wenn ich
 * über dem Child hovere verschwindet es"). It opens to the right when there is room, else to the
 * left. Vertically it starts beside its row — its first item on the row's line (macOS) — and
 * slides up only as far as the window's bottom needs, never above the window's top.
 */
export function useSubmenu() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [shift, setShift] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stall = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracking = useRef<((event: globalThis.PointerEvent) => void) | null>(null);

  const stopTracking = () => {
    if (tracking.current) document.removeEventListener('pointermove', tracking.current);
    tracking.current = null;
    if (stall.current) clearTimeout(stall.current);
    stall.current = null;
  };
  const close = () => {
    stopTracking();
    setOpen(false);
  };
  const enter = () => {
    stopTracking();
    if (opening.current) clearTimeout(opening.current);
    if (!open) opening.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };
  const leave = (event: PointerEvent<HTMLElement>) => {
    if (opening.current) clearTimeout(opening.current);
    const box = panel.current;
    if (!box) {
      setOpen(false);
      return;
    }
    const exit = { x: event.clientX, y: event.clientY };
    stopTracking();
    stall.current = setTimeout(close, STALL);
    const track = (move: globalThis.PointerEvent) => {
      const r = box.getBoundingClientRect();
      if (
        move.clientX >= r.left &&
        move.clientX <= r.right &&
        move.clientY >= r.top &&
        move.clientY <= r.bottom
      ) {
        stopTracking();
        return;
      }
      const nearX = side === 'right' ? r.left : r.right;
      if (
        !pointInTriangle(
          move.clientX,
          move.clientY,
          exit,
          { x: nearX, y: r.top - MARGIN },
          { x: nearX, y: r.bottom + MARGIN },
        )
      ) {
        close();
        return;
      }
      if (stall.current) clearTimeout(stall.current);
      stall.current = setTimeout(close, STALL);
    };
    tracking.current = track;
    document.addEventListener('pointermove', track);
  };

  useLayoutEffect(() => {
    if (!open || !panel.current || !anchor.current) return;
    const host = anchor.current.getBoundingClientRect();
    const width = panel.current.offsetWidth;
    setSide(host.right + MARGIN + width <= window.innerWidth - MARGIN ? 'right' : 'left');
    setShift((current) => {
      // Where it stands without a shift: its top beside the row (CSS).
      const box = panel.current!.getBoundingClientRect();
      const top = box.top - current;
      const up = Math.min(0, window.innerHeight - MARGIN - (top + box.height));
      return Math.max(MARGIN - top, up);
    });
  }, [open]);
  useEffect(
    () => () => {
      stopTracking();
      if (opening.current) clearTimeout(opening.current);
    },
    [],
  );

  return { open, setOpen, side, shift, panel, anchor, enter, leave };
}
