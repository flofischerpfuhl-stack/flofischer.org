import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, Ref } from 'react';
import { Check, ChevronRight, Play, Search, X } from 'lucide-react';
import { tip } from './copy.js';
import './list.css';

export type ItemState = 'hidden' | 'visible' | 'clickable' | 'editable';

/**
 * A side panel's list as a table (owner 2026-11-06: Layers, Folders, Tree, Types): the toolbar on
 * top as a zone of its own, below it the list, which alone scrolls. The pane fills the panel.
 */
export function ListPane(props: {
  toolbar: ReactNode;
  paneRef?: Ref<HTMLDivElement> | undefined;
  /** A right-click into empty space (what can be created there), the menu key. */
  onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
  /** A press on empty space (it clears the selection). */
  onPointerDown?: ((event: PointerEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      ref={props.paneRef}
      className="ui-list-pane"
      onContextMenu={props.onContextMenu}
      onPointerDown={props.onPointerDown}
    >
      {props.toolbar}
      {props.children}
    </div>
  );
}

/** The list's toolbar: what leads (scroll jumps or the filter field), then its buttons at the end. */
export function ListToolbar(props: { start?: ReactNode; children?: ReactNode }): JSX.Element {
  return (
    <div className="ui-list-toolbar">
      {props.start}
      <span className="ui-list-toolbar-gap" />
      {props.children}
    </div>
  );
}

/**
 * The type filter in a list's toolbar, in place of the scroll jumps (opened by its button or by
 * typing in the list; Esc closes it). It takes the keyboard when it opens.
 */
export function FilterField(props: {
  label: string;
  value: string;
  placeholder?: string | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  onChange: (value: string) => void;
  onKeyDown?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;
  onBlur?: (() => void) | undefined;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="ui-filter">
      <Search size={14} />
      <input
        ref={props.inputRef}
        className="ui-filter-input"
        value={props.value}
        placeholder={props.placeholder ?? 'Filter'}
        aria-label={props.label}
        autoFocus
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onBlur}
        onKeyDown={props.onKeyDown}
      />
      <button
        type="button"
        aria-label="Close filter"
        data-tip={tip('Close filter', 'Esc')}
        onClick={props.onClose}
      >
        <X size={13} />
      </button>
    </div>
  );
}

/**
 * The rows: columns like a table — the play column (where there is a current entry), the name, the
 * state column — each behind a line that runs the list's full height (Photoshop, Finder); the
 * scrollbar is a column of its own that exists only while the list scrolls. Selection and keys
 * follow the file-manager standard (UI-REVIEW-REFERENCE §5, §6) and stay with the caller.
 */
export function List(props: {
  label: string;
  role?: 'listbox' | 'tree' | undefined;
  /** The play column's line (Layers, Folders). */
  play?: boolean | undefined;
  /** The keyboard cursor is shown while the list has focus from the keyboard. */
  keyboard?: boolean | undefined;
  /** Something is dragged over the list's empty space: the list is the drop target. */
  drop?: boolean | undefined;
  activeDescendant?: string | undefined;
  listRef?: Ref<HTMLDivElement> | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  onDragOver?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDrop?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDragLeave?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      ref={props.listRef}
      className={`ui-list${props.play ? ' has-play' : ''}${props.keyboard ? ' is-keyboard' : ''}${props.drop ? ' is-drop' : ''}`}
      role={props.role ?? 'listbox'}
      aria-label={props.label}
      aria-multiselectable
      aria-activedescendant={props.activeDescendant}
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragLeave={props.onDragLeave}
    >
      {props.children}
    </div>
  );
}

/**
 * One 32 px row spanning the list: hover and selection take the whole row. Its cells are its
 * children, in this order: PlayButton or PlaySlot, Twisty, RowIcon, ListName or RenameField,
 * RowMark, StateButton or StateSlot.
 */
export function ListRow(props: {
  id?: string | undefined;
  dataKey?: string | undefined;
  role?: 'option' | 'treeitem' | undefined;
  level?: number | undefined;
  expanded?: boolean | undefined;
  /** Undefined for rows that cannot be selected (a reference). */
  selected?: boolean | undefined;
  /** The keyboard cursor. */
  focus?: boolean | undefined;
  /** The right-click target outside the selection (VS Code). */
  context?: boolean | undefined;
  /** Not shown in the view: the name and icon dim. */
  dim?: boolean | undefined;
  /** A group without members: the name is quiet. */
  empty?: boolean | undefined;
  /** A reference to an entry elsewhere: italic, a click goes there. */
  reference?: boolean | undefined;
  /** Drag & drop: the target folder, or everything inside it. */
  drop?: 'target' | 'zone' | undefined;
  tip?: string | undefined;
  draggable?: boolean | undefined;
  onPointerDown?: ((event: PointerEvent<HTMLDivElement>) => void) | undefined;
  onPointerEnter?: ((event: PointerEvent<HTMLDivElement>) => void) | undefined;
  onClick?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
  onDoubleClick?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
  onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
  onDragStart?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDragOver?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDrop?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDragEnd?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  const cls = `ui-list-row${props.selected ? ' is-selected' : ''}${props.focus ? ' is-focus' : ''}${
    props.context ? ' is-context' : ''
  }${props.dim ? ' is-dim' : ''}${props.empty ? ' is-empty' : ''}${props.reference ? ' is-ref' : ''}${
    props.drop === 'target' ? ' is-drop' : props.drop === 'zone' ? ' is-drop-zone' : ''
  }`;
  return (
    <div
      id={props.id}
      data-key={props.dataKey}
      className={cls}
      role={props.role ?? 'option'}
      aria-level={props.level}
      aria-expanded={props.expanded}
      aria-selected={props.selected}
      data-tip={props.tip}
      draggable={props.draggable}
      onPointerDown={props.onPointerDown}
      onPointerEnter={props.onPointerEnter}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
    >
      {props.children}
    </div>
  );
}

/** Keeps the row's own press, click and double click (a button inside the row). */
const own = {
  onPointerDown: (event: PointerEvent) => event.stopPropagation(),
  onDoubleClick: (event: MouseEvent) => event.stopPropagation(),
};

/**
 * ▶ the current entry: new elements go there (the current layer, folder). Without a frame it
 * follows the specification; in a solid frame (`fixed`) the user fixed it. Shown on row hover.
 */
export function PlayButton(props: {
  current: boolean;
  fixed?: boolean | undefined;
  label: string;
  tip: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ui-list-play${props.current ? ' is-current' : ''}${props.fixed ? ' is-fixed' : ''}`}
      aria-label={props.label}
      data-tip={props.tip}
      tabIndex={-1}
      {...own}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      <Play size={11} fill={props.current ? 'currentColor' : 'none'} />
    </button>
  );
}

/** The play column of a row that cannot be current. */
export function PlaySlot(): JSX.Element {
  return <span className="ui-list-play-slot" />;
}

/** A tree row's disclosure, indented 10 px per level. */
export function Twisty(props: {
  depth: number;
  expandable: boolean;
  expanded?: boolean | undefined;
  onToggle: () => void;
}): JSX.Element {
  return (
    <span className="ui-list-twisty" style={{ marginLeft: props.depth * 10 }}>
      {props.expandable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={props.expanded ? 'Collapse' : 'Expand'}
          {...own}
          onClick={(event) => {
            event.stopPropagation();
            props.onToggle();
          }}
        >
          <ChevronRight size={14} className={props.expanded ? 'is-open' : ''} />
        </button>
      )}
    </span>
  );
}

/** What kind of entry the row is (a tree's icons). */
export function RowIcon(props: { children: ReactNode }): JSX.Element {
  return (
    <span className="ui-list-icon" aria-hidden>
      {props.children}
    </span>
  );
}

/** The name: cut with an ellipsis, the full name as tooltip while cut. `preview`: a bulk rename. */
export function ListName(props: {
  preview?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={`ui-list-name${props.preview ? ' is-preview' : ''}`}
      data-tip-overflow={props.preview ? undefined : true}
    >
      {props.children}
    </span>
  );
}

/**
 * Rename in place (Finder, VS Code, Figma): the same font and text position as the name, only a
 * thin frame appears. Enter or leaving commits, Esc cancels — the blur Esc causes never commits.
 */
export function RenameField(props: {
  label: string;
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** The text while it is typed (a bulk rename previews it on the other rows). */
  onDraft?: ((value: string) => void) | undefined;
}): JSX.Element {
  let cancelled = false;
  return (
    <input
      className="ui-list-rename"
      defaultValue={props.defaultValue}
      autoFocus
      aria-label={props.label}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => props.onDraft?.(event.target.value)}
      onBlur={(event) => {
        if (cancelled) return;
        props.onCommit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelled = true;
          props.onCancel();
        }
      }}
    />
  );
}

/**
 * A quiet mark after the name (a reference, an outdated result); its name is its label. `spaced`
 * keeps 2 px to what follows (the outdated mark before the state column).
 */
export function RowMark(props: {
  label: string;
  spaced?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={`ui-list-mark${props.spaced ? ' is-spaced' : ''}`}
      role="img"
      aria-label={props.label}
    >
      {props.children}
    </span>
  );
}

/**
 * The state column's control: the one check glyph with the visibility and interaction ladder
 * (UI-REVIEW-REFERENCE §4). Not a tab stop: the list's keys step it. The click event comes with it
 * (Shift+click also sets everything inside).
 */
export function StateButton(props: {
  state: ItemState;
  pale?: boolean | undefined;
  /** Accessible name: the entry and its state. */
  label: string;
  /** Tooltip: the state and what a click does; defaults to the label. */
  tip?: string | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-list-state"
      tabIndex={-1}
      aria-label={props.label}
      data-tip={props.tip ?? props.label}
      {...own}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick(event);
      }}
    >
      <StateGlyph state={props.state} pale={props.pale} />
    </button>
  );
}

/** The state column of a row without a state. */
export function StateSlot(): JSX.Element {
  return <span className="ui-list-state-slot" />;
}

/**
 * The one check glyph (owner 2026-11-06: „Rahmen immer, Linie = Stufe"): the frame is always
 * drawn, its line is the level — hidden: empty pale frame; visible: check in it; clickable: dashed;
 * editable: solid. Pale: what it shows does not hold for everything it stands for.
 */
export function StateGlyph(props: { state: ItemState; pale?: boolean | undefined }): JSX.Element {
  return (
    <span className={`ui-state-glyph is-${props.state}${props.pale ? ' is-pale' : ''}`} aria-hidden>
      {props.state !== 'hidden' && <Check size={14} strokeWidth={2.2} />}
    </span>
  );
}

/** What an empty list says (nothing matches the filter, no elements). */
export function ListEmpty(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-list-empty">{props.children}</div>;
}
