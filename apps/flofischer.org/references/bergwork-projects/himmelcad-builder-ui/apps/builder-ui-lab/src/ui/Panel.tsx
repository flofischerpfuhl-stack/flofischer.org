import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Surface } from './Surface.js';
import './panel.css';

export interface PanelTabSpec {
  readonly id: string;
  /** The tab's name: its accessible name and tooltip. */
  readonly label: string;
  readonly icon: ReactNode;
  /** A blue dot: work running in this tab. */
  readonly busy?: boolean | undefined;
  /** A neutral dot: this tab waits for the user (an import's question, the agent's approval). */
  readonly waiting?: boolean | undefined;
  /**
   * What the tab shows. The panel renders the content of the tab it highlights, so the highlighted
   * tab is always the one shown (rules by construction; round 5: Export showed under Properties).
   */
  readonly render: () => ReactNode;
}

/**
 * A side panel (UI-REVIEW-REFERENCE §9): a vertical tab rail, no title row (the tab says it), the
 * panel's own buttons at the rail's foot below a line, the content. A list (ListPane) brings its
 * own toolbar zone and fills the body. Arrow keys, Home and End move along the tabs. Where it sits
 * and how it opens is the app's layout: `fill` makes it as large as its place.
 */
export function Panel(props: {
  side: 'left' | 'right';
  /** The rail's name (its tablist). */
  label: string;
  tabs: readonly PanelTabSpec[];
  activeTab: string;
  onTab: (id: string) => void;
  /** The panel's own toggles (RailToggle) below the rail line. */
  railButtons?: ReactNode | undefined;
  width?: number | undefined;
  fill?: boolean | undefined;
  /** Presses on the panel stay in it (the view behind must not take them). */
  onPointerDown?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
  /**
   * Pop-out (proposal 2026-11-06, design/chats): a press on a tab may become a drag out of the rail
   * (the app decides by distance); a right-click offers Pop out.
   */
  onTabPointerDown?: ((id: string, event: PointerEvent<HTMLButtonElement>) => void) | undefined;
  onTabContextMenu?: ((id: string, event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** A dragged tab would join this rail on release: the rail shows it. */
  dropTarget?: boolean | undefined;
  /** Names the rail for the app's hit test while a tab is dragged. */
  railId?: string | undefined;
  /** Inside a pop-out window: no surface of its own (the window is the surface). */
  bare?: boolean | undefined;
}): JSX.Element {
  const active = props.tabs.find((tab) => tab.id === props.activeTab) ?? props.tabs[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? props.tabs.length - 1 : -1;
    if (!step && edge < 0) return;
    event.preventDefault();
    const next = edge >= 0 ? edge : (index + step + props.tabs.length) % props.tabs.length;
    tabRefs.current[next]?.focus();
    const tab = props.tabs[next];
    if (tab) props.onTab(tab.id);
  };
  const style =
    props.width !== undefined
      ? ({ '--ui-panel-w': `${props.width}px` } as CSSProperties)
      : undefined;
  return (
    <Surface
      kind="large"
      as="aside"
      className={`ui-panel is-${props.side}${props.fill ? ' is-fill' : ''}${props.bare ? ' is-bare' : ''}`}
      style={style}
      onPointerDown={props.onPointerDown}
    >
      <nav
        className={`ui-panel-rail${props.dropTarget ? ' is-drop' : ''}`}
        data-rail={props.railId}
        role="tablist"
        aria-orientation="vertical"
        aria-label={props.label}
      >
        {props.tabs.map((tab, index) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              className={`ui-panel-tab${selected ? ' is-on' : ''}`}
              aria-selected={selected}
              aria-label={tab.label}
              data-tip={tab.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => props.onTab(tab.id)}
              onKeyDown={(event) => onTabKey(event, index)}
              onPointerDown={
                props.onTabPointerDown && ((event) => props.onTabPointerDown?.(tab.id, event))
              }
              onContextMenu={
                props.onTabContextMenu && ((event) => props.onTabContextMenu?.(tab.id, event))
              }
            >
              {tab.icon}
              {tab.busy && !tab.waiting && <span className="ui-panel-busy" aria-hidden />}
              {tab.waiting && <span className="ui-panel-busy is-waiting" aria-hidden />}
            </button>
          );
        })}
        <span className="ui-panel-rail-spacer" />
        {props.railButtons}
      </nav>
      <div className="ui-panel-main" role="tabpanel" aria-label={active?.label}>
        <div className="ui-panel-body">{active?.render()}</div>
      </div>
    </Surface>
  );
}

/**
 * A plain button in the rail, below its line (a pop-out window's Close, where the panel has its
 * pin): the rail tab's size and look, no frame — it is an action, not a state.
 */
export function RailButton(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-rail-toggle"
      aria-label={props.label}
      data-tip={props.label}
      onClick={props.onClick}
    >
      <span className="ui-rail-frame">{props.icon}</span>
    </button>
  );
}

/** What a panel says when it has nothing to show (No selection): centred, quiet. */
export function PanelEmpty(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-panel-empty">{props.children}</div>;
}

/**
 * A state toggle in the panel's rail, by the frame convention (UI-REVIEW-REFERENCE §3): the same
 * icon in every state; no frame = off, dashed = automatic, solid = on.
 */
export function RailToggle(props: {
  icon: ReactNode;
  frame: 'none' | 'dashed' | 'solid';
  /** Accessible name. */
  label: string;
  /** Tooltip: the name and the state. */
  tip: string;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-rail-toggle"
      aria-pressed={props.frame === 'solid' ? true : props.frame === 'dashed' ? 'mixed' : false}
      aria-label={props.label}
      data-tip={props.tip}
      onClick={props.onToggle}
    >
      <span
        className={`ui-rail-frame${props.frame === 'none' ? '' : ` is-${props.frame}`}`}
        aria-hidden
      >
        {props.icon}
      </span>
    </button>
  );
}

/**
 * A surface's resizable edge: the inner edge of a side panel (`left`, `right`: its width) or the
 * top of the console (`top`: its height). Drag to resize (the app remembers it), double-click
 * resets, the arrow keys step 16 px.
 */
export function PanelResizeEdge(props: {
  side: 'left' | 'right' | 'top';
  /** Accessible name; „Resize panel" by default. */
  label?: string | undefined;
  /** The width (left, right) or height (top). */
  size: number;
  min: number;
  max: number;
  /** Double-click goes back to it. */
  defaultSize: number;
  onSize: (size: number) => void;
}): JSX.Element {
  const start = useRef<{ at: number; size: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.min(props.max, Math.max(props.min, value)));
  const top = props.side === 'top';
  const along = (event: { clientX: number; clientY: number }) =>
    top ? event.clientY : event.clientX;
  // Which way grows: away from the surface.
  const sign = props.side === 'left' ? 1 : -1;
  const grow = top ? 'ArrowUp' : props.side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  const shrink = top ? 'ArrowDown' : props.side === 'left' ? 'ArrowLeft' : 'ArrowRight';
  return (
    <div
      className={`ui-panel-resize is-${props.side}`}
      role="separator"
      aria-orientation={top ? 'horizontal' : 'vertical'}
      aria-label={props.label ?? 'Resize panel'}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.size}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { at: along(event), size: props.size };
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        props.onSize(clamp(start.current.size + sign * (along(event) - start.current.at)));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onDoubleClick={() => props.onSize(props.defaultSize)}
      onKeyDown={(event) => {
        if (event.key === grow) props.onSize(clamp(props.size + 16));
        else if (event.key === shrink) props.onSize(clamp(props.size - 16));
        else return;
        event.preventDefault();
      }}
    />
  );
}
