import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { tip } from './copy.js';
import './button.css';

/** Keeps the keyboard where it is (typing goes on into the active field). */
const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * A text button, always neutral (no accent). `primary`: the one action Enter does — full width
 * under the values it uses, its tooltip is the key (owner 2026-11-01). `neutral`: any other action.
 */
export function Button(props: {
  variant?: 'primary' | 'neutral' | undefined;
  /** The key that does the same; primary defaults to Enter. */
  keyHint?: string | undefined;
  disabled?: boolean | undefined;
  /** Why it is disabled (tooltip). */
  disabledReason?: string | undefined;
  /** Do not take the keyboard on click (buttons of the function panel). */
  keepFocus?: boolean | undefined;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  const primary = props.variant === 'primary';
  const key = props.keyHint ?? (primary ? 'Enter' : undefined);
  return (
    <button
      type="button"
      className={`ui-button${primary ? ' is-primary' : ''}`}
      disabled={props.disabled}
      data-tip={props.disabled ? props.disabledReason : key}
      onMouseDown={props.keepFocus ? keepFocus : undefined}
      onClick={props.onClick}
    >
      <span>{props.children}</span>
    </button>
  );
}

/**
 * An icon-only button; its name is the accessible name and the tooltip, with its key. `tool`
 * (28 px): a quiet action in a panel head. `small` (34 px): the console's head and scroll column.
 * `toolbar` (36 px): a list toolbar button; `on` fills it. `bar` (44 px): a utility at the end of
 * the function bar (quieter: secondary).
 */
export function IconButton(props: {
  size: 'tool' | 'small' | 'toolbar' | 'bar';
  label: string;
  keyHint?: string | undefined;
  icon: ReactNode;
  on?: boolean | undefined;
  /** The tooltip when it says more than the name (a count, the action of a toggle). */
  tip?: string | undefined;
  /** It has opened its menu (aria-expanded): the icon brightens. */
  expanded?: boolean | undefined;
  /** A toggle drawn by the frame convention (no frame off, dashed automatic, solid on). */
  frame?: 'none' | 'dashed' | 'solid' | undefined;
  disabled?: boolean | undefined;
  keepFocus?: boolean | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ui-icon-button is-${props.size}${props.on ? ' is-on' : ''}${props.expanded ? ' is-open' : ''}`}
      aria-label={props.label}
      aria-pressed={props.frame !== undefined ? props.frame === 'solid' : props.on}
      aria-haspopup={props.expanded !== undefined ? 'menu' : undefined}
      aria-expanded={props.expanded}
      data-tip={props.tip ?? tip(props.label, props.keyHint)}
      disabled={props.disabled}
      onMouseDown={props.keepFocus ? keepFocus : undefined}
      onClick={props.onClick}
    >
      {props.frame !== undefined ? (
        <span className={`ui-icon-frame is-${props.frame}`} aria-hidden>
          {props.icon}
        </span>
      ) : (
        props.icon
      )}
    </button>
  );
}

/**
 * Copy for a value row: floats over the value's end while the row is hovered. Numbers copy without
 * unit, a point copies X, Y, Z tab-separated — the caller passes that text.
 */
export function CopyButton(props: { value: string | (() => string); label: string }): JSX.Element {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(timer);
  }, [done]);
  return (
    <button
      type="button"
      className="ui-copy"
      aria-label={`Copy ${props.label}`}
      data-tip={done ? 'Copied' : 'Copy'}
      onClick={() => {
        void navigator.clipboard?.writeText(
          typeof props.value === 'function' ? props.value() : props.value,
        );
        setDone(true);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
