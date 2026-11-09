import type { PointerEvent, ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { Surface } from './Surface.js';
import './window.css';

/*
 * Window (proposal 2026-11-06, design/chats — UI-LIBRARY.md › Proposed: chat). A work area of its
 * own (import, later surface creation): in the app an OS window, in the lab a large surface over
 * the main window. A title row like the title pills (name, window buttons), then the body.
 */

/** A window of its own: title row (icon, name, window buttons) and the body. */
export function AppWindow(props: {
  label: string;
  icon?: ReactNode | undefined;
  title: string;
  /** Quiet after the title (the file). */
  meta?: string | undefined;
  onClose: () => void;
  /** The column at the left: the chat. */
  side?: ReactNode | undefined;
  /** The window's own views, side by side. */
  views?: readonly ReactNode[] | undefined;
  /**
   * A body of its own instead of chat and views (the company manager, proposal 2026-11-06: a
   * manager window without views).
   */
  children?: ReactNode | undefined;
  /** An app window, not a project's (the company manager): over the start screen too. */
  app?: boolean | undefined;
}): JSX.Element {
  return (
    <Surface
      kind="large"
      as="section"
      className={`ui-window${props.app ? ' is-app' : ''}`}
      role="dialog"
      aria-label={props.label}
    >
      <header className="ui-window-title">
        {props.icon && <span className="ui-window-icon">{props.icon}</span>}
        <span className="ui-window-name">{props.title}</span>
        {props.meta && <span className="ui-window-meta">{props.meta}</span>}
        <span className="ui-window-buttons">
          <button type="button" aria-label="Minimize" data-tip="Minimize">
            <Minus size={16} aria-hidden />
          </button>
          <button type="button" aria-label="Maximize" data-tip="Maximize">
            <Square size={13} aria-hidden />
          </button>
          <button type="button" aria-label="Close" data-tip="Close" onClick={props.onClose}>
            <X size={16} aria-hidden />
          </button>
        </span>
      </header>
      {props.children ? (
        <div className="ui-window-body is-own">{props.children}</div>
      ) : (
        <div className="ui-window-body">
          <div className="ui-window-side">{props.side}</div>
          <div className="ui-window-views" data-count={props.views?.length ?? 0}>
            {props.views}
          </div>
        </div>
      )}
    </Surface>
  );
}

/**
 * One of a window's own views (registration: Source and Project, equally weighted): a head with
 * its name, what it shows and its action (Use point), the view below. `active`: the next pick goes
 * here (a strong neutral frame, no accent).
 */
export function WindowView(props: {
  title: string;
  subtitle?: string | undefined;
  active?: boolean | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className={`ui-window-view${props.active ? ' is-active' : ''}`}
      aria-label={props.title}
    >
      <header className="ui-window-view-head">
        <span className="ui-window-view-title">{props.title}</span>
        {props.subtitle && <span className="ui-window-view-sub">{props.subtitle}</span>}
        {props.action && <span className="ui-window-view-action">{props.action}</span>}
      </header>
      <div className="ui-window-view-body">{props.children}</div>
    </section>
  );
}

/**
 * Files dragged over the window (proposal 2026-11-06): the whole window takes the drop; a pill in
 * its middle says what letting go does. The names are known only on drop, so it counts.
 */
export function DropOverlay(props: { label: string; icon?: ReactNode | undefined }): JSX.Element {
  return (
    <div className="ui-drop" aria-live="polite">
      <Surface kind="small" className="ui-drop-pill">
        {props.icon}
        <span>{props.label}</span>
      </Surface>
    </div>
  );
}

/**
 * A pop-out window (proposal 2026-11-06, owner: „einzelne Sachen, wenn ich sie aus der vertikalen
 * Tabbar rausziehe, … duplizieren zu eigenen Fenstern"): a copy of side-panel items as a window of
 * its own — in the app an OS window, in the lab a surface over the main window. It looks like the
 * side panel (round 5: „warum hier noch zusätzlich ein Title? hat das normale Sidepanel doch auch
 * nicht"): no title row; its rail's empty part moves it; Close sits in the rail where the panel has
 * its pin (`Panel` `railButtons` with `RailButton`). The app places it (`rect`).
 */
export function PopoutWindow(props: {
  label: string;
  rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  onMoveStart: (event: PointerEvent<HTMLElement>) => void;
  onResizeStart: (event: PointerEvent<HTMLElement>) => void;
  onFocus: () => void;
  front?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <Surface
      kind="large"
      as="section"
      className={`ui-popout${props.front ? ' is-front' : ''}`}
      role="dialog"
      aria-label={props.label}
      style={{ left: props.rect.x, top: props.rect.y, width: props.rect.w, height: props.rect.h }}
      onPointerDown={(event) => {
        props.onFocus();
        // The rail's empty part is the window's handle (its tabs and buttons keep their press).
        const target = event.target as Element;
        if (target.closest('.ui-panel-rail') && !target.closest('button')) props.onMoveStart(event);
      }}
    >
      <div className="ui-popout-body">{props.children}</div>
      <span className="ui-popout-resize" aria-hidden onPointerDown={props.onResizeStart} />
    </Surface>
  );
}

/** A tab being dragged out of a rail: its icon and name at the pointer. */
export function TabGhost(props: {
  icon: ReactNode;
  label: string;
  x: number;
  y: number;
}): JSX.Element {
  return (
    <div className="ui-tab-ghost" style={{ left: props.x, top: props.y }} aria-hidden>
      {props.icon}
      <span>{props.label}</span>
    </div>
  );
}
