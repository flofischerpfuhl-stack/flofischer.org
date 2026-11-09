import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uiRoot } from './placement.js';
import './tooltip.css';

const FIRST_DELAY = 450;
const WARM_WINDOW = 800;
const GAP = 8;
const MARGIN = 8;

/**
 * The one tooltip layer of the window (copied from the lab's TooltipLayer). Controls declare
 * `data-tip` (use `tip(name, key)`); a label marked `data-tip-overflow` shows its full text only
 * while it is cut off. A native `title` is taken over, never shown by the browser. After the first
 * tip the next ones appear at once while the pointer moves on (warm-up, as in Figma and macOS).
 */
export function TooltipLayer(): JSX.Element | null {
  const [tipState, setTip] = useState<{ text: string; anchor: DOMRect } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let target: HTMLElement | null = null;
    let shownUntil = 0;
    let open = false;
    const textOf = (el: HTMLElement) => {
      if (el.hasAttribute('data-tip-overflow'))
        return el.scrollWidth > el.clientWidth ? (el.textContent ?? '') : '';
      const title = el.getAttribute('title');
      if (title) {
        el.dataset.tip = title;
        el.removeAttribute('title');
      }
      return el.dataset.tip ?? '';
    };
    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      target = null;
      if (open) shownUntil = performance.now();
      open = false;
      setTip(null);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const selector = '[title], [data-tip], [data-tip-overflow]';
      let el = (event.target as Element | null)?.closest<HTMLElement>(selector) ?? null;
      while (el?.hasAttribute('data-tip-overflow') && !textOf(el))
        el = el.parentElement?.closest<HTMLElement>(selector) ?? null;
      if (el === target) return;
      if (!el) {
        if (target) hide();
        return;
      }
      // A trigger whose menu is open shows no tip (it would sit behind or beside its own menu).
      const text = el.getAttribute('aria-expanded') === 'true' ? '' : textOf(el);
      if (timer) clearTimeout(timer);
      target = el;
      if (!text) {
        setTip(null);
        return;
      }
      const show = () => {
        if (target !== el || !el.isConnected || el.getAttribute('aria-expanded') === 'true') return;
        open = true;
        setTip({ text: textOf(el) || text, anchor: el.getBoundingClientRect() });
      };
      if (open || performance.now() - shownUntil < WARM_WINDOW) show();
      else timer = setTimeout(show, FIRST_DELAY);
    };
    const leaveWindow = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', leaveWindow, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    document.addEventListener('scroll', hide, true);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', leaveWindow, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      document.removeEventListener('wheel', hide, true);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!tipState || !el) {
      setPosition(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const { anchor } = tipState;
    let top = anchor.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN) top = anchor.top - GAP - height;
    const left = Math.max(
      MARGIN,
      Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - MARGIN - width),
    );
    setPosition({ left, top: Math.max(MARGIN, top) });
  }, [tipState]);

  if (!tipState) return null;
  return createPortal(
    <div
      ref={ref}
      className="ui-tip"
      role="tooltip"
      style={position ?? { left: -9999, top: -9999, visibility: 'hidden' }}
    >
      {tipState.text}
    </div>,
    uiRoot(),
  );
}
