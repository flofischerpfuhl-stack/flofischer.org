/**
 * A segmented control: one contained component — a shared track, equal
 * segment heights, the selected segment filled — for a choice among two to
 * four short options (docs/DESIGN-SYSTEM.md "Tool cards"). Longer lists
 * belong in a `Select`.
 *
 * Semantics: `role="radiogroup"` named by `aria-label` (or
 * `aria-labelledby`), segments are `role="radio"` with `aria-checked`;
 * arrow keys move the choice (roving focus, like native radios). A segment
 * chosen with the pointer lets go of the focus, so a following Enter goes to
 * the surface's default action (a tool's Done), not to the segment again.
 *
 * Sizes come from custom properties, so a host layout can grow them without
 * a prop: `--hc-segmented-h` (segment height, default the control height),
 * `--hc-segmented-font` (default 12px).
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is not plain text (an icon). */
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  'aria-label'?: string | undefined;
  'aria-labelledby'?: string | undefined;
  /** `true`: the track takes its container's width, segments share it equally. */
  fill?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  fill = false,
  disabled = false,
  className,
  id,
  ...aria
}: SegmentedProps<T>): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled || disabled ? -1 : i)).filter((i) => i >= 0);
  const selected = options.findIndex((o) => o.value === value);
  // Roving tab stop: the selected segment, else the first enabled one.
  const tabStop = selected >= 0 && enabled.includes(selected) ? selected : (enabled[0] ?? -1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let step = keys[event.key];
    if (event.key === 'Home' || event.key === 'End') step = 0;
    if (step === undefined || enabled.length === 0) return;
    event.preventDefault();
    const at = enabled.indexOf(Math.max(0, selected));
    const next =
      event.key === 'Home'
        ? enabled[0]!
        : event.key === 'End'
          ? enabled[enabled.length - 1]!
          : enabled[(at + step + enabled.length) % enabled.length]!;
    const option = options[next];
    if (!option) return;
    refs.current[next]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      aria-disabled={disabled || undefined}
      className={`${styles.track} ${fill ? styles.fill : ''} ${className ?? ''}`.trim()}
      style={{ ['--hc-segmented-count' as string]: options.length }}
      data-segmented=""
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            disabled={disabled || option.disabled}
            tabIndex={index === tabStop ? 0 : -1}
            className={`${styles.segment} ${checked ? styles.selected : ''}`}
            onClick={(event) => {
              if (!checked) onChange(option.value);
              // Chosen with the pointer (not the keyboard): let go of the focus.
              if (event.detail > 0) event.currentTarget.blur();
            }}
          >
            <span className={styles.label}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
