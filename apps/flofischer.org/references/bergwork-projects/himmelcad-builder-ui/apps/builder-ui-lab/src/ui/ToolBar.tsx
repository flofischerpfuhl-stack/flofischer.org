import { useEffect, useState } from 'react';
import type {
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  Ref,
  UIEvent,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { Surface } from './Surface.js';
import './toolbar.css';

/**
 * A bar of tools. `functions`: the function bar (UI-REVIEW-REFERENCE §9; large surface, 44 px
 * buttons, the workspace button first); `mini`: the mini toolbar at the cursor (small surface,
 * 28 px buttons). The app places it.
 */
export function ToolBar(props: {
  kind: 'functions' | 'mini';
  label: string;
  /** `toolbar` for a plain row of buttons (the mini toolbar). */
  role?: 'toolbar' | undefined;
  barRef?: Ref<HTMLDivElement> | undefined;
  onPointerMove?: ((event: PointerEvent<HTMLDivElement>) => void) | undefined;
  /**
   * Functions wait while someone else writes the document (proposal 2026-11-06, design/chats: the
   * agent's turn, Assembler's write lease): the functions dim and take no clicks; the workspace
   * choice and search stay.
   */
  locked?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <Surface
      kind={props.kind === 'functions' ? 'large' : 'small'}
      className={`ui-toolbar is-${props.kind}${props.locked ? ' is-locked' : ''}`}
      role={props.role}
      aria-label={props.label}
      surfaceRef={props.barRef}
      onPointerMove={props.onPointerMove}
    >
      {props.children}
    </Surface>
  );
}

/** A vertical line between parts of a tool bar. */
export function ToolBarDivider(): JSX.Element {
  return <span className="ui-toolbar-divider" aria-hidden="true" />;
}

/**
 * The function bar's workspace choice: icon, name and a chevron that turns while its menu is
 * open. `compact`: narrow windows (less padding).
 */
export function WorkspaceButton(props: {
  label: string;
  name: string;
  icon: ReactNode;
  open: boolean;
  /** The id of the workspace menu. */
  controls: string;
  compact?: boolean | undefined;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ui-workspace-button${props.open ? ' is-open' : ''}${props.compact ? ' is-compact' : ''}`}
      aria-label={props.label}
      aria-expanded={props.open}
      aria-controls={props.controls}
      onClick={props.onClick}
    >
      {props.icon}
      <span>{props.name}</span>
      <ChevronDown size={13} className="ui-workspace-chevron" />
    </button>
  );
}

/**
 * The function bar's functions: a row that scrolls sideways (no scrollbar) when the window is
 * too narrow; a new `strip` (the workspace) slides in.
 */
export function ToolBarScroll(props: {
  strip: string;
  onScroll?: ((event: UIEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-toolbar-scroll" onScroll={props.onScroll}>
      <div className="ui-toolbar-strip" key={props.strip}>
        {props.children}
      </div>
    </div>
  );
}

/**
 * A function in a tool bar: its icon; its name is the accessible name. `bar` (44 px): the function
 * bar, which shows the name under it (`ToolBarTip`); `open` while it is revealed; `methods`: it
 * has a method list (a dot under the icon). `mini` (28 px): the mini toolbar, the name as tooltip.
 */
export function ToolBarButton(props: {
  size: 'bar' | 'mini';
  label: string;
  icon: ReactNode;
  open?: boolean | undefined;
  methods?: boolean | undefined;
  /** The method list's id while it is open. */
  controls?: string | undefined;
  /** The function's id (the app finds the button by it). */
  functionId?: string | undefined;
  /**
   * The button opens a menu of the app's at itself (the gear's settings): whether it is open. Its
   * name tip hides while it is (`ToolBarTip` reads it from the button).
   */
  expanded?: boolean | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  onPointerEnter?: ((event: PointerEvent<HTMLButtonElement>) => void) | undefined;
  onFocus?: ((event: FocusEvent<HTMLButtonElement>) => void) | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ui-toolbar-button is-${props.size}${props.open ? ' is-open' : ''}`}
      aria-label={props.label}
      aria-expanded={props.methods ? Boolean(props.open) : props.expanded}
      aria-haspopup={!props.methods && props.expanded !== undefined ? 'menu' : undefined}
      aria-controls={props.controls}
      data-function={props.functionId}
      data-tip={props.size === 'mini' ? props.label : undefined}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onPointerEnter={props.onPointerEnter}
      onFocus={props.onFocus}
      onKeyDown={props.onKeyDown}
    >
      {props.icon}
      {props.methods && <span className="ui-toolbar-dot" aria-hidden="true" />}
    </button>
  );
}

/**
 * A function's name under its button (Figma, tldraw): the bar itself never changes. It takes its
 * button and hides while the button's own menu is open (rules by construction: no tip behind a
 * menu).
 */
export function ToolBarTip(props: {
  x: number;
  y: number;
  button: HTMLElement;
  children: ReactNode;
}): JSX.Element | null {
  if (useExpanded(props.button)) return null;
  return (
    <div className="ui-tip is-placed" role="tooltip" style={{ left: props.x, top: props.y }}>
      {props.children}
    </div>
  );
}

/** What an empty tool bar says (how to fill it). */
export function ToolBarEmpty(props: { children: ReactNode }): JSX.Element {
  return <span className="ui-toolbar-empty">{props.children}</span>;
}

/** Whether an element's popup is open (`aria-expanded="true"`), kept current. */
function useExpanded(element: HTMLElement): boolean {
  const [expanded, setExpanded] = useState(element.getAttribute('aria-expanded') === 'true');
  useEffect(() => {
    const read = () => setExpanded(element.getAttribute('aria-expanded') === 'true');
    read();
    const watch = new MutationObserver(read);
    watch.observe(element, { attributes: true, attributeFilter: ['aria-expanded'] });
    return () => watch.disconnect();
  }, [element]);
  return expanded;
}
