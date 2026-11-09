import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useSubmenu } from './submenu.js';
import './tools.css';

/**
 * A tool list (owner 2026-11-06, after Shapr3D: „engere Abstände, Text auch hinterlegt mit
 * passendem Grau … diese beiden gleich aussehen, außer vielleicht die Size"): one column of icons
 * on a chrome surface, each label on a chip of its own beside it, 4 px between rows. `bar` (32) is
 * the function bar's method list, `cursor` (28) the right-click functions. The method list's
 * `title` is the function's name, centred over the icon column; `open` shows and hides it with the
 * rows rising in turn. Its owner positions it (`style`).
 */
export function ToolList(props: {
  label: string;
  size: 'bar' | 'cursor';
  title?: string | undefined;
  /** Present but closed: hidden and inert (the method list stays mounted while the bar is used). */
  open?: boolean | undefined;
  id?: string | undefined;
  style?: CSSProperties | undefined;
  onPointerEnter?: (() => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  const closed = props.open === false;
  return (
    <div
      id={props.id}
      className={`ui-tools is-${props.size}${props.title !== undefined ? ' has-title' : ''}${props.open === undefined ? '' : props.open ? ' is-open' : ' is-closable'}`}
      role="menu"
      aria-label={props.label}
      aria-hidden={closed || undefined}
      inert={closed || undefined}
      style={props.style}
      onPointerEnter={props.onPointerEnter}
    >
      {props.title !== undefined && <div className="ui-tools-title">{props.title}</div>}
      {props.children}
    </div>
  );
}

/** One tool: its icon in the column, its name on a chip. */
export function ToolItem(props: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  onContextMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** Its place in the list: the rows rise in turn when the list opens. */
  index?: number | undefined;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-tool"
      role="menuitem"
      style={
        props.index === undefined
          ? undefined
          : ({ '--ui-item-index': props.index } as CSSProperties)
      }
      onClick={props.onSelect}
      onContextMenu={props.onContextMenu}
    >
      <span className="ui-tool-icon">{props.icon}</span>
      <span className="ui-tool-label">{props.label}</span>
    </button>
  );
}

/** A tool group: its row opens the group's tools beside the list (hover, safe triangle, → / ←). */
export function ToolSub(props: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}): JSX.Element {
  const sub = useSubmenu();
  return (
    <div
      ref={sub.anchor}
      className="ui-tool-sub-anchor"
      onPointerEnter={sub.enter}
      onPointerLeave={sub.leave}
    >
      <button
        type="button"
        className="ui-tool"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={sub.open}
        onClick={() => sub.setOpen(!sub.open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          sub.setOpen(true);
          requestAnimationFrame(() =>
            sub.panel.current?.querySelector<HTMLElement>('button')?.focus(),
          );
        }}
      >
        <span className="ui-tool-icon">{props.icon}</span>
        <span className="ui-tool-label">
          {props.label}
          <ChevronRight size={14} className="ui-tool-more" />
        </span>
      </button>
      {sub.open && (
        <div
          ref={sub.panel}
          className={`ui-tools is-cursor ui-tools-sub is-${sub.side}`}
          role="menu"
          aria-label={props.label}
          data-submenu={props.label}
          style={{ translate: `0 ${sub.shift}px` }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft') return;
            event.preventDefault();
            event.stopPropagation();
            sub.setOpen(false);
          }}
        >
          {props.children}
        </div>
      )}
    </div>
  );
}
