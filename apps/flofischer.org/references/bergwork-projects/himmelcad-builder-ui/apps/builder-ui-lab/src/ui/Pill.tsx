import {
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Surface } from './Surface.js';
import { tip } from './copy.js';
import './pill.css';

/**
 * One of the three title pills on the function bar's row (UI-REVIEW-REFERENCE §9): `brand` (logo,
 * wordmark, product), `project` (the project name) and `controls` (window buttons). Brand and
 * project are the window's drag handles.
 */
export function TitlePill(props: {
  kind: 'brand' | 'project' | 'controls';
  children: ReactNode;
}): JSX.Element {
  return (
    <Surface kind="title" className={`ui-title-pill is-${props.kind}`}>
      {props.children}
    </Surface>
  );
}

/** The brand pill's content: the logo, the wordmark in the display face, the product. */
export function TitleBrand(props: { logo: string; product: string }): JSX.Element {
  return (
    <>
      <img className="ui-title-logo" alt="" src={props.logo} />
      <span className="ui-title-wordmark">himmel:CAD</span>
      <span className="ui-title-product">{props.product}</span>
    </>
  );
}

/**
 * The project pill's name; the full path is its tooltip. An app with a richer label (the shared
 * path card with Copy, `@himmelcad/ui` ProjectLabel) passes it as `children`.
 */
export function TitleName(props: {
  name: string;
  path?: string | undefined;
  children?: ReactNode | undefined;
}): JSX.Element {
  return (
    <span className="ui-title-name" data-tip={props.children ? undefined : props.path}>
      {props.children ?? props.name}
    </span>
  );
}

/** A window button in the controls pill (Minimize, Maximize, Close). */
export function TitleButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-title-button"
      aria-label={props.label}
      data-tip={props.label}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
}

/**
 * A status bar group: one pill, its items a button group edge to edge with a 1 px stroke between
 * two (UI-REVIEW-REFERENCE §9). Groups hold global modes only. A menu attached to the whole group
 * (History on Undo / Redo) is its child; `onContextMenu` opens it. `grow` fills the space its row
 * leaves (the cursor readouts); `tight` drops the gap between items (the narrowest windows).
 */
export function StatusGroup(props: {
  label?: string | undefined;
  grow?: boolean | undefined;
  tight?: boolean | undefined;
  onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`ui-surface is-status ui-status-group${props.grow ? ' is-grow' : ''}${props.tight ? ' is-tight' : ''}`}
      role="group"
      aria-label={props.label}
      onContextMenu={props.onContextMenu}
    >
      {props.children}
    </div>
  );
}

/** Holds a status item and the menu attached to it (the menu is placed from this box). */
export function StatusAnchor(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-status-anchor">{props.children}</div>;
}

/**
 * An item of a status group. With a `label` it shows icon and label (the tooltip is left out, a
 * labelled button needs none); `iconOnly` items (34 px square) and `compact` items (the label and
 * value left out, as the bar collapses) get their name and key as tooltip; `tip` replaces it. `on`
 * fills the segment (a toggle that is on, or the item whose menu is open); `expanded` does the same
 * for a panel the item opens. `count` is a CountBadge for multi-choice items. `value` is a value in a
 * fixed width, cut with "…" (view, specification); `text` a short value instead of an icon, in a
 * fixed minimum width (2D / 2.5D / 3D). `narrow`: 26 px wide (the narrowest windows).
 */
export const StatusItem = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    icon?: ReactNode | undefined;
    iconOnly?: boolean | undefined;
    compact?: boolean | undefined;
    narrow?: boolean | undefined;
    keyHint?: string | undefined;
    tip?: string | undefined;
    value?: string | undefined;
    text?: string | undefined;
    count?: number | undefined;
    countLabel?: string | undefined;
    on?: boolean | undefined;
    expanded?: boolean | undefined;
    /** A blue dot: work is running behind this item; a string names it for assistive tech. */
    busy?: boolean | string | undefined;
    disabled?: boolean | undefined;
    disabledReason?: string | undefined;
    /**
     * Opens a menu: the trigger's ARIA (second click closes, ↑/↓ opens on the first item).
     * `onContextMenu`: a click acts, the right click opens the menu.
     */
    menu?:
      | { readonly open: boolean; readonly id?: string; readonly onContextMenu?: boolean }
      | undefined;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    onContextMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
    onKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
  }
>(function StatusItem(props, ref) {
  const iconOnly = props.iconOnly ?? false;
  const compact = props.compact ?? false;
  // Whenever its name is not written on it (an icon, a value such as „1"), its name is its tooltip
  // (owner 2026-11-07: „hier fehlt irgendwie Tooltip").
  const labelShown = !iconOnly && !compact && props.value === undefined;
  const tooltip = props.disabled
    ? props.disabledReason
    : (props.tip ?? (!labelShown || props.keyHint ? tip(props.label, props.keyHint) : undefined));
  const showValue = props.value !== undefined && !compact;
  const className = [
    'ui-status-item',
    iconOnly && 'is-icon',
    showValue && 'has-value',
    props.narrow && 'is-narrow',
    (props.on || props.expanded || props.menu?.open) && 'is-on',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      aria-label={props.label}
      aria-pressed={props.menu || props.expanded !== undefined ? undefined : props.on}
      aria-haspopup={props.menu ? 'menu' : undefined}
      aria-expanded={props.menu ? props.menu.open : props.expanded}
      aria-controls={props.menu?.id}
      data-menu-on={props.menu?.onContextMenu ? 'contextmenu' : undefined}
      disabled={props.disabled}
      data-tip={tooltip}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onKeyDown={props.onKeyDown}
    >
      {props.icon}
      {props.text !== undefined && <span className="ui-status-text">{props.text}</span>}
      {!iconOnly && !compact && props.value === undefined && <span>{props.label}</span>}
      {showValue && (
        <span className="ui-status-value" data-tip-overflow>
          {props.value}
        </span>
      )}
      {props.count !== undefined && (
        <CountBadge value={props.count} label={props.countLabel ?? 'on'} />
      )}
      {props.busy && (
        <span
          className="ui-status-busy"
          role={typeof props.busy === 'string' ? 'img' : undefined}
          aria-label={typeof props.busy === 'string' ? props.busy : undefined}
          aria-hidden={typeof props.busy === 'string' ? undefined : true}
        />
      )}
    </button>
  );
});

/** How many things are on: 0 included, two digits wide, so the item never changes size. */
export function CountBadge(props: { value: number; label: string }): JSX.Element {
  return (
    <span className="ui-count" aria-label={`${props.value} ${props.label}`}>
      {props.value}
    </span>
  );
}

/**
 * A readout in a status group: text, not a button (Fluent / VS Code status bars), no hover. The
 * cursor coordinates: axis letters and values in the mono face, each value `chars` characters plus
 * one spare wide, so the bar never jumps while the cursor moves.
 */
export function CoordinateReadout(props: {
  label: string;
  tip?: string | undefined;
  axes: readonly { readonly axis: string; readonly value: string }[];
  /** The longest value in characters (the data's longest coordinate). */
  chars: number;
}): JSX.Element {
  return (
    <output
      className="ui-coordinates"
      aria-label={props.label}
      style={{ '--ui-coord-ch': props.chars } as CSSProperties}
      data-tip={props.tip}
    >
      {props.axes.map(({ axis, value }) => (
        <span key={axis}>
          <b>{axis}</b>
          <span>{value}</span>
        </span>
      ))}
    </output>
  );
}

/**
 * What the cursor snaps to, next to the coordinates, in a fixed width per form so the bar never
 * jumps: `full` the kind and the element's name (cut with "…"), `short` the short form (End, Mid,
 * 1004), `glyph` the icon only. `none`: nothing to snap to (quieter).
 */
export function SnapReadout(props: {
  label: string;
  tip?: string | undefined;
  icon: ReactNode;
  kind: string;
  short: string;
  name?: string | null | undefined;
  none?: boolean | undefined;
  form: 'full' | 'short' | 'glyph';
}): JSX.Element {
  return (
    <output
      className={`ui-snap-readout is-${props.form}${props.none ? ' is-none' : ''}`}
      aria-label={props.label}
      data-tip={props.tip}
    >
      {props.icon}
      {props.form === 'full' && <span>{props.kind}</span>}
      {props.form === 'short' && <span>{props.short}</span>}
      {props.form === 'full' && props.name && <span className="ui-snap-name">· {props.name}</span>}
    </output>
  );
}
