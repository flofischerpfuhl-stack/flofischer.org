import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './BaseControls.module.css';
import { boxOf, useFloatingPlacement, type FloatingSide } from './floating.js';

interface TooltipChildProps {
  disabled?: boolean;
  style?: CSSProperties;
  'aria-describedby'?: string;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<TooltipChildProps>;
  delay?: number;
  open?: boolean;
  /**
   * Preferred side (default: the nearest `data-tooltip-side` ancestor's, else
   * below). The tip flips and shifts to stay inside the window (`floating.ts`).
   */
  side?: FloatingSide;
  /**
   * Also describe a disabled control (usually why it is unavailable): the
   * wrapper takes the hover, since disabled controls take no pointer events.
   */
  describeDisabled?: boolean;
  /** Class of the wrapper (e.g. a full-width menu row). */
  anchorClassName?: string | undefined;
  /**
   * The wrapper takes no box (`display: contents`), for a control positioned by its own CSS
   * (absolutely placed buttons). Not for disabled controls (nothing would take the hover).
   */
  contents?: boolean;
}

const SIDES = new Set<string>(['top', 'bottom', 'left', 'right']);

/**
 * Hover/keyboard-focus description. The visible tip is rendered into
 * `document.body` and placed by the shared floating rule, so no overflow,
 * transform or window edge cuts it off; the description stays next to the
 * control for assistive technology (`aria-describedby`).
 */
export function Tooltip({
  content,
  children,
  delay = 500,
  open: controlledOpen,
  side,
  describeDisabled = false,
  anchorClassName,
  contents = false,
}: TooltipProps): JSX.Element {
  const id = useId();
  const timer = useRef<number | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  useEffect(() => () => clear(), []);
  const disabled = isValidElement(children) && !!children.props.disabled;
  const sideFromChrome = anchorRef.current
    ?.closest('[data-tooltip-side]')
    ?.getAttribute('data-tooltip-side');
  const preferredSide =
    side ??
    (sideFromChrome && SIDES.has(sideFromChrome) ? (sideFromChrome as FloatingSide) : 'bottom');
  useFloatingPlacement(
    tipRef,
    open && content
      ? {
          // The control itself (the wrapper may be a full-width row or take no box).
          anchor: () => boxOf(anchorRef.current?.firstElementChild ?? anchorRef.current),
          side: preferredSide,
          align: 'center',
          gap: 6,
        }
      : null,
  );

  if (!isValidElement(children) || (disabled && !describeDisabled)) return children;

  const show = (): void => {
    clear();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = (): void => {
    clear();
    setOpen(false);
  };
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ');
  const trigger = disabled
    ? cloneElement(children, {
        'aria-describedby': describedBy,
        // The wrapper takes the hover (a disabled control gets no pointer events).
        style: { ...children.props.style, pointerEvents: 'none' },
      })
    : cloneElement(children, {
        'aria-describedby': describedBy,
        onMouseEnter: (event: MouseEvent) => {
          children.props.onMouseEnter?.(event);
          show();
        },
        onMouseLeave: (event: MouseEvent) => {
          children.props.onMouseLeave?.(event);
          hide();
        },
        onFocus: (event: FocusEvent) => {
          children.props.onFocus?.(event);
          // Keyboard focus only: a click (or a tap) acts, it does not ask for the tip.
          if (isFocusVisible(event.currentTarget)) show();
        },
        onBlur: (event: FocusEvent) => {
          children.props.onBlur?.(event);
          hide();
        },
      });

  function clear(): void {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  const portal =
    open && content && typeof document !== 'undefined' && document.body
      ? createPortal(
          <div
            ref={tipRef}
            className={`${styles.tooltip} ${styles.tooltipFloating}`}
            data-tooltip-for={id}
            data-floating=""
            aria-hidden="true"
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  return (
    <span
      ref={anchorRef}
      className={
        anchorClassName ? `${styles.tooltipAnchor} ${anchorClassName}` : styles.tooltipAnchor
      }
      {...(contents ? { style: { display: 'contents' } } : {})}
      // A press acts: the tip goes away until the pointer comes back.
      onPointerDown={hide}
      {...(disabled ? { onPointerEnter: show, onPointerLeave: hide } : {})}
    >
      {trigger}
      <span id={id} role="tooltip" hidden>
        {content}
      </span>
      {portal}
    </span>
  );
}

function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}
