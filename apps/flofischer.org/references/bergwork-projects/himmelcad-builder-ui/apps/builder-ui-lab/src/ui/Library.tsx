// Library window (proposal 2026-11-06, design/specifications — not approved yet): the
// specification manager as the library of nested resources (UI-LIBRARY.md › Proposed: library
// window). Built here, in src/ui, so the token, spacing and render checks reach it.
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { PanelResizeEdge } from './Panel.js';
import { Button, CopyButton, IconButton } from './Button.js';
import { NavItem, NavSection } from './Chat.js';
import { PlayButton, PlaySlot, RenameField, Twisty } from './List.js';
import { Menu, MenuItem, MenuSection } from './Menu.js';
import { tip } from './copy.js';
import './library.css';

/** Where the window was moved and how large it was made (it opens like that again). */
let placed: { x: number; y: number; w: number; h: number } | null = null;
const MIN_W = 880;
const MIN_H = 420;
const EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'] as const;
type Edge = (typeof EDGES)[number];

/**
 * A large popup over the view, between the top row and the status bar, that behaves like a window
 * (owner 2026-11-06: „bleibt offen wie ein Fenster"; „generell auch das Fenster resizen können"):
 * a press outside does not close it, its head moves it, its edges and corners size it,
 * double-clicking the head puts it back; Esc closes it while the keyboard is inside it, the close
 * button always. Edits inside are committed field by field, so closing never loses work.
 */
export function LibraryWindow(props: {
  label: string;
  title: string;
  /** Before the title (Back). */
  lead?: ReactNode;
  /** Beside the title (the catalogue choice). */
  start?: ReactNode;
  /** Quiet icon actions before the close button. */
  tools?: ReactNode;
  /** Over the app's own windows (opened from the company manager, which is a window). */
  front?: boolean | undefined;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(placed);
  const { onClose } = props;
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!ref.current?.contains(event.target as Node)) return;
      event.preventDefault();
      onClose();
    };
    // On the document: after fields and menus took their Escape, before the app's ladder (window).
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  /** The box it has now, in its stage's coordinates (from the CSS place until moved). */
  const measure = () => {
    if (box) return box;
    const el = ref.current!;
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };
  const drag = (event: ReactPointerEvent<HTMLElement>, edge: Edge | 'move') => {
    if (edge === 'move' && (event.target as Element).closest('button, input, [role="menu"]'))
      return;
    event.preventDefault();
    const from = measure();
    const at = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - at.x;
      const dy = e.clientY - at.y;
      const next = { ...from };
      if (edge === 'move') {
        next.x += dx;
        next.y += dy;
      } else {
        if (edge.includes('e')) next.w = Math.max(MIN_W, from.w + dx);
        if (edge.includes('s')) next.h = Math.max(MIN_H, from.h + dy);
        if (edge.includes('w')) {
          next.w = Math.max(MIN_W, from.w - dx);
          next.x = from.x + from.w - next.w;
        }
        if (edge.includes('n')) {
          next.h = Math.max(MIN_H, from.h - dy);
          next.y = from.y + from.h - next.h;
        }
      }
      placed = next;
      setBox(next);
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };
  return (
    <div
      ref={ref}
      className={`ui-surface is-large ui-lib-dialog${box ? ' is-placed' : ''}${props.front ? ' is-front' : ''}`}
      role="dialog"
      aria-label={props.label}
      style={box ? { left: box.x, top: box.y, width: box.w, height: box.h } : undefined}
    >
      <header
        className="ui-lib-dialog-head"
        onPointerDown={(event) => drag(event, 'move')}
        onDoubleClick={(event) => {
          if ((event.target as Element).closest('button, input')) return;
          placed = null;
          setBox(null);
        }}
      >
        {props.lead}
        <h2 className="ui-lib-dialog-title">{props.title}</h2>
        {props.start}
        <span className="ui-lib-dialog-gap" />
        {props.tools}
        <IconButton
          size="tool"
          label="Close"
          keyHint="Esc"
          icon={<X size={16} />}
          onClick={props.onClose}
        />
      </header>
      {props.children}
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`ui-lib-dialog-edge is-${edge}`}
          aria-hidden
          onPointerDown={(event) => drag(event, edge)}
          onDoubleClick={() => {
            placed = null;
            setBox(null);
          }}
        />
      ))}
    </div>
  );
}

/**
 * The kinds of a library as a vertical tab rail: the side panels' rail (Layers, Folders, Tree,
 * Types), so a window of many kinds reads like a panel the user already knows.
 */
export function KindRail<K extends string>(props: {
  label: string;
  kinds: readonly (readonly [id: K, name: string, icon: ReactNode])[];
  value: K;
  onChange: (kind: K) => void;
}): JSX.Element {
  const step = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const count = props.kinds.length;
    const i = (props.kinds.findIndex(([k]) => k === props.value) + delta + count) % count;
    props.onChange(props.kinds[i]![0]);
    (event.currentTarget.parentElement?.children[i] as HTMLElement | undefined)?.focus();
  };
  return (
    <nav
      className="ui-panel-rail ui-lib-rail"
      role="tablist"
      aria-orientation="vertical"
      aria-label={props.label}
    >
      {props.kinds.map(([id, name, icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          className={`ui-panel-tab${id === props.value ? ' is-on' : ''}`}
          aria-selected={id === props.value}
          aria-label={name}
          data-tip={name}
          tabIndex={id === props.value ? 0 : -1}
          onClick={() => props.onChange(id)}
          onKeyDown={step}
        >
          {icon}
        </button>
      ))}
    </nav>
  );
}

/** The quiet action of a row whose value is another resource (a symbol, a material): it opens it. */
export function OpenButton(props: { label: string; onOpen: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="ui-lib-open"
      aria-label={props.label}
      data-tip={props.label}
      onClick={props.onOpen}
    >
      <ArrowUpRight size={14} />
    </button>
  );
}

/** A search that stays in its toolbar: the key that reaches it shows while it is empty. */
export function SearchField(props: {
  label: string;
  value: string;
  placeholder: string;
  keyHint?: string | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  autoFocus?: boolean | undefined;
  /** A filter that narrows the list besides the text („Uses Laubbaum"): a chip with its ×. */
  token?: string | undefined;
  onClearToken?: (() => void) | undefined;
  onChange: (value: string) => void;
  onKeyDown?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;
}): JSX.Element {
  return (
    <div className={`ui-lib-search${props.value ? ' has-value' : ''}`}>
      <Search size={14} />
      {props.token && (
        <span className="ui-lib-token">
          <span>{props.token}</span>
          <button
            type="button"
            aria-label="Remove filter"
            data-tip="Remove filter"
            onClick={props.onClearToken}
          >
            <X size={12} />
          </button>
        </span>
      )}
      <input
        ref={props.inputRef}
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label}
        autoFocus={props.autoFocus}
        spellCheck={false}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Backspace' && !props.value && props.token) props.onClearToken?.();
          if (event.key === 'Escape' && props.value) {
            event.preventDefault();
            event.stopPropagation();
            props.onChange('');
            return;
          }
          props.onKeyDown?.(event);
        }}
      />
      {props.value ? (
        <button
          type="button"
          aria-label="Clear search"
          data-tip={tip('Clear', 'Esc')}
          onClick={() => props.onChange('')}
        >
          <X size={13} />
        </button>
      ) : (
        props.keyHint && <kbd>{props.keyHint}</kbd>
      )}
    </div>
  );
}

/**
 * A Properties row that knows where its value comes from (Webflow's style panel, in greys):
 * inherited — the label plain, the value quiet, the tooltip names the source; own while a parent
 * exists — the label on a chip, its menu resets to the parent. A row without a parent is a plain
 * PropertyRow.
 */
export function SourceRow(props: {
  label: string;
  /** Where the value comes from (`12 Baum allg`), or undefined when there is no parent. */
  from?: string | undefined;
  /** The value equals the parent's. */
  inherited?: boolean | undefined;
  /** The value comes from the code itself (its grammar), not from a parent. */
  fromCode?: boolean | undefined;
  onReset?: (() => void) | undefined;
  /** The value is another resource: the row opens it (instead of Copy). */
  onOpen?: (() => void) | undefined;
  openLabel?: string | undefined;
  copy?: string | false | undefined;
  children: ReactNode;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const control = useRef<HTMLDivElement>(null);
  const own = props.from !== undefined && !props.inherited && !props.fromCode;
  const shown = () => {
    const root = control.current;
    const input = root?.querySelector<HTMLInputElement>('input');
    if (input) return input.value;
    return root?.querySelector('.ui-field-value, .ui-read')?.textContent?.trim() ?? '';
  };
  return (
    <div
      className={`ui-prop-row ui-lib-source-row${props.inherited || props.fromCode ? ' is-inherited' : ''}`}
    >
      {own ? (
        <>
          <button
            type="button"
            className="ui-prop-label ui-lib-own-label"
            aria-haspopup="menu"
            aria-expanded={!!menu}
            data-tip={`Overrides ${props.from}`}
            onClick={(event) => setMenu(menu ? null : event.currentTarget.getBoundingClientRect())}
          >
            <span>{props.label}</span>
          </button>
          {menu && (
            <Menu
              label={props.label}
              x={menu.left}
              y={menu.bottom + 4}
              anchor={menu}
              onClose={() => setMenu(null)}
            >
              <MenuItem
                hint={props.from?.split(' ')[0]}
                onSelect={() => {
                  setMenu(null);
                  props.onReset?.();
                }}
              >
                Reset to parent
              </MenuItem>
            </Menu>
          )}
        </>
      ) : (
        <span
          className="ui-prop-label"
          data-tip={
            props.fromCode ? 'From the code' : props.inherited ? `From ${props.from}` : undefined
          }
        >
          {props.label}
        </span>
      )}
      <div ref={control} className="ui-prop-control">
        {props.children}
        {props.onOpen ? (
          <OpenButton
            label={props.openLabel ?? `Open ${props.label.toLowerCase()}`}
            onOpen={props.onOpen}
          />
        ) : (
          props.copy !== false && <CopyButton value={props.copy ?? shown} label={props.label} />
        )}
      </div>
    </div>
  );
}

/**
 * An image attribute in Properties (Airtable's attachment cell): a thumbnail at the field's height
 * and the file's name; its size in the tooltip, a click opens it. The mock has no image files, so
 * the thumbnail is drawn (a tree photo).
 */
export function ImageValue(props: { name: string; size: string; onOpen: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="ui-lib-image"
      onClick={props.onOpen}
      aria-label={`Open ${props.name}`}
      data-tip={tip(props.name, props.size)}
    >
      <svg
        className="ui-lib-image-thumb"
        viewBox="0 0 36 24"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <rect width="36" height="24" fill="rgb(120 150 170)" />
        <rect y="17" width="36" height="7" fill="rgb(88 118 64)" />
        <rect x="17" y="11" width="2" height="9" fill="rgb(92 70 48)" />
        <circle cx="18" cy="9" r="6" fill="rgb(64 104 52)" />
        <circle cx="14" cy="12" r="4" fill="rgb(72 114 58)" />
        <circle cx="22.5" cy="11" r="4.5" fill="rgb(58 96 48)" />
      </svg>
      <span className="ui-lib-image-name">{props.name}</span>
    </button>
  );
}

/**
 * Tags in a field (a specification's attribute tables, what a label shows): each tag a name and its
 * ×, `>` adds one from the menu. The tags' text starts where a field's text starts and sits on the
 * field's centre line, also when they wrap to a second line.
 */
export function TagField(props: {
  label: string;
  value: readonly string[];
  /** Groups of what can be added: [heading, names]. */
  options: readonly (readonly [heading: string, names: readonly string[]])[];
  onChange: (value: readonly string[]) => void;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="ui-field is-select ui-lib-tags" role="group" aria-label={props.label}>
      <span className="ui-lib-tag-list">
        {props.value.length === 0 && <span className="ui-lib-tag-empty">None</span>}
        {props.value.map((name) => (
          <span key={name} className="ui-lib-tag">
            <span className="ui-lib-tag-name">{name}</span>
            <button
              type="button"
              className="ui-lib-tag-remove"
              aria-label={`Remove ${name}`}
              data-tip="Remove"
              onClick={() => props.onChange(props.value.filter((t) => t !== name))}
            >
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        ))}
      </span>
      <button
        ref={button}
        type="button"
        className="ui-field-more ui-lib-tag-add"
        aria-label={`Add ${props.label.toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(event) => setMenu(menu ? null : event.currentTarget.getBoundingClientRect())}
      >
        <ChevronRight size={14} strokeWidth={2} />
      </button>
      {menu && (
        <Menu
          label={props.label}
          x={menu.left}
          y={menu.bottom + 4}
          anchor={menu}
          returnFocus={button.current}
          onClose={() => setMenu(null)}
        >
          {props.options.map(([heading, names]) => (
            <Fragment key={heading}>
              {/* A heading only between two or more groups (Principle: rules by construction). */}
              {props.options.length > 1 && <MenuSection>{heading}</MenuSection>}
              {names.map((name) => (
                <MenuItem
                  key={name}
                  kind="checkbox"
                  checked={props.value.includes(name)}
                  onSelect={() =>
                    props.onChange(
                      props.value.includes(name)
                        ? props.value.filter((t) => t !== name)
                        : [...props.value, name],
                    )
                  }
                >
                  {name}
                </MenuItem>
              ))}
            </Fragment>
          ))}
        </Menu>
      )}
    </div>
  );
}

// ---- The window's layout ---------------------------------------------------------------------

/**
 * The window's body: the kinds' rail, the sidebar, the table, the inspector. The two dividers size
 * the sidebar and the inspector (owner 2026-11-06: „die zwei vertikalen Trennlinien … größer
 * machen"); double-click puts a divider back.
 */
export function LibraryBody(props: {
  navWidth: number;
  inspectorWidth: number;
  onNavWidth: (width: number) => void;
  onInspectorWidth: (width: number) => void;
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  rail: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className="ui-lib-body"
      style={
        {
          '--ui-library-nav-w': `${props.navWidth}px`,
          '--ui-library-inspector-w': `${props.inspectorWidth}px`,
        } as CSSProperties
      }
      onKeyDown={props.onKeyDown}
    >
      <div className="ui-lib-split is-nav">
        <PanelResizeEdge
          side="left"
          label="Resize sidebar"
          size={props.navWidth}
          min={160}
          max={360}
          defaultSize={216}
          onSize={props.onNavWidth}
        />
      </div>
      <div className="ui-lib-split is-inspector">
        <PanelResizeEdge
          side="right"
          label="Resize properties"
          size={props.inspectorWidth}
          min={300}
          max={560}
          defaultSize={336}
          onSize={props.onInspectorWidth}
        />
      </div>
      {props.rail}
      {props.children}
    </div>
  );
}

/** A sidebar entry: a view (with its icon) or a group (with its code, if it has one). */
export interface LibraryNavEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode | undefined;
  readonly code?: string | undefined;
}

/**
 * The sidebar: the kind's name, its views, then its groups under a heading. Every entry has the
 * same lead — an icon, a code, or the empty slot of a group without a code (Free) — so every name
 * starts on one x; nothing else can be put in.
 */
export function LibraryNav(props: {
  label: string;
  title: string;
  views: readonly LibraryNavEntry[];
  /** The groups, under „Groups"; none, no heading. */
  groups?: readonly LibraryNavEntry[] | undefined;
  value: string;
  onChange: (id: string) => void;
}): JSX.Element {
  const item = (entry: LibraryNavEntry) => (
    <NavItem
      key={entry.id}
      label={entry.label}
      icon={
        entry.icon ?? (
          <span className="ui-lib-nav-lead" aria-hidden>
            {entry.code}
          </span>
        )
      }
      active={props.value === entry.id}
      onSelect={() => props.onChange(entry.id)}
    />
  );
  return (
    <nav className="ui-lib-nav" aria-label={props.label}>
      {/* One heading style in the sidebar: the kind's name is a heading like „Groups". */}
      <NavSection>{props.title}</NavSection>
      {props.views.map(item)}
      {props.groups && props.groups.length > 0 && (
        <>
          <NavSection>Groups</NavSection>
          {props.groups.map(item)}
        </>
      )}
    </nav>
  );
}

/** The middle column: the toolbar (search, New), chips under it, the table. */
export function LibraryMain(props: {
  label: string;
  /** The search over code and name. */
  search: Parameters<typeof SearchField>[0];
  /**
   * New …: a named button beside the search (never a lone +; owner round 4: „nicht intuitiv, wie
   * ich … Sachen hinzufügen kann"), the same as the table's last row and Ctrl+N.
   */
  add: {
    readonly label: string;
    readonly keyHint?: string | undefined;
    readonly onAdd: () => void;
  };
  chips?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="ui-lib-main" aria-label={props.label}>
      <div className="ui-lib-toolbar">
        <SearchField {...props.search} />
        <button
          type="button"
          className="ui-button ui-lib-new"
          data-tip={props.add.keyHint}
          onClick={props.add.onAdd}
        >
          <Plus size={14} strokeWidth={2} />
          <span>{props.add.label}</span>
        </button>
      </div>
      {props.chips}
      {props.children}
    </section>
  );
}

/** Where else a search finds its words: a chip per kind with the count; a click goes there. */
export function SearchChips(props: {
  label: string;
  items: readonly {
    readonly label: string;
    readonly count: number;
    readonly onSelect: () => void;
  }[];
}): JSX.Element | null {
  if (props.items.length === 0) return null;
  return (
    <div className="ui-lib-elsewhere" aria-label={props.label}>
      {props.items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="ui-lib-elsewhere-chip"
          onClick={item.onSelect}
        >
          {item.label}
          <span>{item.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The kinds of a table's column: the kind decides its width, alignment and what a cell holds. */
export type LibraryColumnKind =
  | 'code'
  | 'name'
  | 'look'
  | 'line'
  | 'label'
  | 'text'
  | 'swatch'
  | 'short';
const TRACK: Readonly<Record<LibraryColumnKind, string>> = {
  code: 'var(--ui-library-col-code)',
  name: 'minmax(var(--ui-library-col-name), 2fr)',
  look: 'var(--ui-library-col-look)',
  line: 'var(--ui-library-col-line)',
  label: 'var(--ui-library-col-label)',
  text: 'minmax(var(--ui-library-col-text), 1fr)',
  swatch: 'var(--ui-library-col-swatch)',
  short: 'var(--ui-library-col-short)',
};

/** A code cell: the code in mono; `marks` are what a search matched from its start. */
export interface LibraryCodeCell {
  readonly code: string;
  readonly marks?: readonly string[] | undefined;
}
/** A name cell: the name (cut with an ellipsis), what a search matched, a quiet note (Slot 4). */
export interface LibraryNameCell {
  readonly name: string;
  readonly marks?: readonly string[] | undefined;
  readonly note?: string | undefined;
}
/** A picture cell (a drawn sample, a swatch): centred; pale when inherited; null for none. */
export type LibraryPictureCell = {
  readonly picture: ReactNode;
  readonly inherited?: boolean | undefined;
} | null;
/** A text cell (a layer, a size): quiet, cut with an ellipsis; `none` shows when it is empty. */
export interface LibraryTextCell {
  readonly text: string;
  readonly none?: string | undefined;
  readonly mono?: boolean | undefined;
  readonly inherited?: boolean | undefined;
}

/**
 * A column: its kind, its heading and what each row shows in it. A cell's data is the kind's own,
 * so a heading without its column, a cell in the wrong column or a name without its ellipsis
 * cannot be built (UI-LIBRARY.md › Principle: rules by construction).
 */
export type LibraryColumn<T> =
  | { readonly kind: 'code'; readonly head: string; readonly cell: (row: T) => LibraryCodeCell }
  | { readonly kind: 'name'; readonly head: string; readonly cell: (row: T) => LibraryNameCell }
  | {
      readonly kind: 'look' | 'line' | 'label' | 'swatch';
      readonly head: string;
      readonly cell: (row: T) => LibraryPictureCell;
    }
  | {
      readonly kind: 'text' | 'short';
      readonly head: string;
      readonly cell: (row: T) => LibraryTextCell;
    };

/** What a row is, besides its cells. */
export interface LibraryRowState {
  readonly id: string;
  /** Tree depth: the twisty's indent beside the code, or the name's indent without a code. */
  readonly depth?: number | undefined;
  readonly expandable?: boolean | undefined;
  readonly expanded?: boolean | undefined;
  readonly onToggle?: (() => void) | undefined;
  readonly selected?: boolean | undefined;
  /** Shown only as the path to a search's matches. */
  readonly context?: boolean | undefined;
  /** A right-click target outside the selection (thin frame, VS Code). */
  readonly menu?: boolean | undefined;
  /** ▶ before the code: this entry is current for drawing (the current layer's ▶). */
  readonly play?:
    | {
        readonly current: boolean;
        readonly label: string;
        readonly tip: string;
        readonly onPlay: () => void;
      }
    | undefined;
  /** + on hover at the name's end: a new entry under this one. */
  readonly add?: { readonly label: string; readonly onAdd: () => void } | undefined;
  /** The name is being renamed in place. */
  readonly rename?:
    | { readonly onCommit: (text: string) => void; readonly onCancel: () => void }
    | undefined;
}

/**
 * The library's table: a head that stays on top, rows on one grid, never sideways scrolling (the
 * name and text columns give way). It builds its rows from data: the code column holds ▶ and the
 * tree's twisty in fixed slots on every row and on the head, so codes and the heading share one x
 * whether a row has children or not; the empty state and the last row (+ New …, Airtable,
 * Notion) are the table's own, so they cannot land between rows.
 */
/** Column widths a user dragged, per table (they stay while the lab runs). */
const COLUMN_WIDTHS = new Map<string, Record<number, number>>();

export function LibraryTable<T>(props: {
  label: string;
  columns: readonly LibraryColumn<T>[];
  rows: readonly T[];
  row: (row: T) => LibraryRowState;
  tree?: boolean | undefined;
  /** What the table says with no rows, and its one action. */
  empty: {
    readonly text: string;
    readonly action?:
      | {
          readonly label: string;
          readonly keyHint?: string | undefined;
          readonly onAction: () => void;
        }
      | undefined;
  };
  /** The table's last row: + New …; none while a search or filter narrows the rows. */
  add?:
    | { readonly label: string; readonly keyHint?: string | undefined; readonly onAdd: () => void }
    | undefined;
  bodyRef?: Ref<HTMLDivElement> | undefined;
  onRowClick: (event: MouseEvent<HTMLDivElement>, row: T) => void;
  onRowDoubleClick?: ((row: T) => void) | undefined;
  onRowContextMenu?: ((event: MouseEvent<HTMLDivElement>, row: T) => void) | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  /** A press on the table's background, not on a row (clears the selection). */
  onBackgroundPress?: (() => void) | undefined;
  onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
}): JSX.Element {
  const { columns } = props;
  // Columns are sized at their heading's right edge (owner 2026-11-07, S9: „die Code-, Name-
  // etc. Spalten … horizontal größer/kleiner gezogen werden können"); the last one gives way.
  const [widths, setWidths] = useState<Record<number, number>>(
    () => COLUMN_WIDTHS.get(props.label) ?? {},
  );
  const resize = (i: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const cell = event.currentTarget.parentElement!;
    const start = cell.getBoundingClientRect().width;
    const x0 = event.clientX;
    const move = (e: PointerEvent) => {
      const next = { ...widths, [i]: Math.max(40, Math.round(start + e.clientX - x0)) };
      setWidths(next);
      COLUMN_WIDTHS.set(props.label, next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const handle = (i: number) =>
    i < columns.length - 1 ? (
      <span
        className="ui-lib-col-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Size ${columns[i]!.head || 'column'}`}
        onPointerDown={resize(i)}
        onDoubleClick={() => {
          const next = { ...widths };
          delete next[i];
          setWidths(next);
          COLUMN_WIDTHS.set(props.label, next);
        }}
      />
    ) : null;
  const states = props.rows.map((r) => props.row(r));
  const play = states.some((s) => s.play);
  // The lead of a code cell: ▶'s slot when any row has one, the twisty's slot in a tree.
  const lead = (state: LibraryRowState | null) => (
    <>
      {play &&
        (state?.play ? (
          <PlayButton
            current={state.play.current}
            label={state.play.label}
            tip={state.play.tip}
            onClick={state.play.onPlay}
          />
        ) : (
          <PlaySlot />
        ))}
      {props.tree && (
        <Twisty
          depth={state?.depth ?? 0}
          expandable={!!state?.expandable}
          expanded={state?.expanded}
          onToggle={state?.onToggle ?? (() => undefined)}
        />
      )}
    </>
  );
  const cell = (column: LibraryColumn<T>, row: T, state: LibraryRowState, i: number) => {
    switch (column.kind) {
      case 'code': {
        const c = column.cell(row);
        return (
          <span key={i} className="ui-lib-cell-code" role="gridcell">
            {lead(state)}
            <span className="ui-lib-code">
              <Marked text={c.code} marks={c.marks} start />
            </span>
          </span>
        );
      }
      case 'name': {
        const c = column.cell(row);
        // Without the tree's twisty, the depth indents the name (a material's classes).
        const depth = !props.tree && state.depth ? state.depth : 0;
        return (
          <span
            key={i}
            className="ui-lib-cell-name"
            role="gridcell"
            style={depth ? ({ '--ui-library-depth': depth } as CSSProperties) : undefined}
          >
            {state.rename ? (
              <RenameField
                label="Name"
                defaultValue={c.name}
                onCommit={state.rename.onCommit}
                onCancel={state.rename.onCancel}
              />
            ) : (
              <span className="ui-lib-name" data-tip-overflow>
                <Marked text={c.name} marks={c.marks} />
              </span>
            )}
            {c.note && <span className="ui-lib-row-note">{c.note}</span>}
            {state.add && !state.context && (
              <RowAdd label={state.add.label} onAdd={state.add.onAdd} />
            )}
          </span>
        );
      }
      case 'text':
      case 'short': {
        const c = column.cell(row);
        return (
          <span
            key={i}
            className={`ui-lib-cell-text${c.inherited ? ' is-inherited' : ''}${c.mono ? ' is-mono' : ''}`}
            role="gridcell"
            data-tip-overflow
          >
            {c.text || (c.none && <span className="ui-lib-none">{c.none}</span>)}
          </span>
        );
      }
      default: {
        const c = column.cell(row);
        return (
          <span
            key={i}
            className={`ui-lib-cell-look${c?.inherited ? ' is-inherited' : ''}`}
            role="gridcell"
          >
            {c?.picture}
          </span>
        );
      }
    }
  };
  return (
    <div
      className="ui-lib-table"
      role={props.tree ? 'treegrid' : 'grid'}
      aria-label={props.label}
      style={
        {
          '--ui-library-columns': columns
            .map((c, i) => (widths[i] ? `${widths[i]}px` : TRACK[c.kind]))
            .join(' '),
        } as CSSProperties
      }
    >
      <div
        ref={props.bodyRef}
        className="ui-lib-tbody"
        tabIndex={0}
        onKeyDown={props.onKeyDown}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) props.onBackgroundPress?.();
        }}
        onContextMenu={props.onContextMenu}
      >
        <div className="ui-lib-thead" role="row">
          {columns.map((column, i) =>
            column.kind === 'code' ? (
              <span key={i} role="columnheader" className="ui-lib-cell-code">
                {lead(null)}
                <span>{column.head}</span>
                {handle(i)}
              </span>
            ) : (
              <span
                key={i}
                role="columnheader"
                className={
                  column.kind === 'name' || column.kind === 'text' || column.kind === 'short'
                    ? undefined
                    : 'is-center'
                }
              >
                {column.head}
                {handle(i)}
              </span>
            ),
          )}
        </div>
        {props.rows.length === 0 && (
          <div className="ui-lib-empty">
            <span>{props.empty.text}</span>
            {props.empty.action && (
              <Button keyHint={props.empty.action.keyHint} onClick={props.empty.action.onAction}>
                {props.empty.action.label}
              </Button>
            )}
          </div>
        )}
        {props.rows.map((row, r) => {
          const state = states[r]!;
          return (
            <div
              key={state.id}
              data-code={state.id}
              role="row"
              aria-level={props.tree ? (state.depth ?? 0) + 1 : undefined}
              aria-expanded={props.tree && state.expandable ? !!state.expanded : undefined}
              aria-selected={!!state.selected}
              className={`ui-lib-row${state.selected ? ' is-selected' : ''}${state.context ? ' is-context' : ''}${state.menu ? ' is-menu' : ''}`}
              onClick={(event) => props.onRowClick(event, row)}
              onDoubleClick={props.onRowDoubleClick && (() => props.onRowDoubleClick!(row))}
              onContextMenu={
                props.onRowContextMenu && ((event) => props.onRowContextMenu!(event, row))
              }
            >
              {columns.map((column, i) => cell(column, row, state, i))}
            </div>
          );
        })}
        {props.add && (
          // In a table with ▶ and the twisty, + takes ▶'s slot and the label starts where the codes
          // start; without them, + stands where the codes start.
          <button
            type="button"
            className={`ui-lib-new-row${play || props.tree ? '' : ' is-plain'}`}
            data-tip={props.add.keyHint}
            onClick={props.add.onAdd}
          >
            {play ? (
              <span className="ui-list-play-slot">
                <Plus size={14} strokeWidth={2} />
              </span>
            ) : (
              !props.tree && <Plus size={14} strokeWidth={2} />
            )}
            {props.tree && (
              <span className="ui-list-twisty">{!play && <Plus size={14} strokeWidth={2} />}</span>
            )}
            <span>{props.add.label}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** A text with what a search matched marked in place (a code from its start, a name anywhere). */
function Marked(props: {
  text: string;
  marks?: readonly string[] | undefined;
  start?: boolean | undefined;
}): JSX.Element {
  const lower = props.text.toLowerCase();
  const spans: [number, number][] = [];
  for (const word of props.marks ?? []) {
    const w = word.toLowerCase();
    const at = props.start ? (lower.startsWith(w) ? 0 : -1) : lower.indexOf(w);
    if (w && at >= 0) spans.push([at, at + w.length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let i = 0;
  for (const [a, b] of spans) {
    if (a < i) continue;
    out.push(
      props.text.slice(i, a),
      <mark key={a} className="ui-lib-mark">
        {props.text.slice(a, b)}
      </mark>,
    );
    i = b;
  }
  out.push(props.text.slice(i));
  return <>{out}</>;
}

/** A row's + on hover: a new entry under this one (a child specification). */
function RowAdd(props: { label: string; onAdd: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="ui-lib-row-add"
      aria-label={props.label}
      data-tip={props.label}
      onClick={(event) => {
        event.stopPropagation();
        props.onAdd();
      }}
    >
      <Plus size={13} strokeWidth={2} />
    </button>
  );
}

/** The right column: Properties of what is selected, the one action at its foot. */
export function LibraryInspector(props: {
  label: string;
  foot?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <aside className="ui-lib-inspector" aria-label={props.label}>
      <div className="ui-lib-inspector-scroll">{props.children}</div>
      {props.foot && <div className="ui-lib-inspector-foot">{props.foot}</div>}
    </aside>
  );
}

/** What the inspector says without a selection or for several. */
export function InspectorNote(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-lib-inspector-empty">{props.children}</div>;
}

/**
 * The inspector's preview on the view's grey: one figure per part, a caption under each; `single`
 * one large picture with a note (a symbol, a hatch).
 */
export function LibraryPreview(props: {
  figures?: readonly (readonly [name: string, art: ReactNode])[];
  single?: ReactNode;
  note?: string | undefined;
}): JSX.Element {
  if (props.single !== undefined)
    return (
      <div className="ui-lib-preview is-single" role="img" aria-label="Preview">
        {props.single}
        {props.note && <span className="ui-lib-preview-note">{props.note}</span>}
      </div>
    );
  const figures = props.figures ?? [];
  return (
    <div
      className="ui-lib-preview"
      role="img"
      aria-label="Preview"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, figures.length)}, minmax(0, 1fr))` }}
    >
      {figures.map(([name, art]) => (
        <figure key={name}>
          <span className="ui-lib-preview-art">{art}</span>
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** A text specification's sample („Aa" in its colour and style); `large` in the preview. */
export function TextSample(props: {
  color: string;
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  large?: boolean | undefined;
}): JSX.Element {
  return (
    <span
      className={props.large ? 'ui-lib-preview-text' : 'ui-lib-text-sample'}
      style={{
        color: props.color,
        fontWeight: props.bold ? 'var(--ui-weight-strong)' : undefined,
        fontStyle: props.italic ? 'italic' : undefined,
      }}
    >
      Aa
    </span>
  );
}

/** What a label shows, as sample values; `stacked` in the preview, one line each. */
export function LabelSample(props: {
  lines: readonly string[];
  stacked?: boolean | undefined;
}): JSX.Element {
  return props.stacked ? (
    <span className="ui-lib-preview-label">
      {props.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  ) : (
    <span className="ui-lib-label-sample">{props.lines[0] ?? ''}</span>
  );
}

/** The catalogue in the window's head: its name, where it is edited and its revision; a menu. */
export function CatalogChip(props: {
  name: string;
  scope: string;
  expanded: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-lib-catalog"
      aria-haspopup="menu"
      aria-expanded={props.expanded}
      onClick={props.onClick}
    >
      <span className="ui-lib-catalog-name">{props.name}</span>
      <span className="ui-lib-catalog-scope">{props.scope}</span>
      <ChevronDown size={14} />
    </button>
  );
}

/** A thin line between the head's tools and its close button. */
export function ToolSeparator(): JSX.Element {
  return <span className="ui-lib-dialog-sep" />;
}
