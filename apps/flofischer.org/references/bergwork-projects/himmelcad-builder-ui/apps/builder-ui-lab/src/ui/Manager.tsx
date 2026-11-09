import {
  useEffect,
  useRef,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown } from 'lucide-react';
import { Button, CopyButton, IconButton } from './Button.js';
import { Segmented } from './Field.js';
import { ReadValue } from './Section.js';
import { Surface } from './Surface.js';
import { DropOverlay } from './Window.js';
import { uiRoot } from './placement.js';
import type { WorkTool } from './Work.js';
import './manager.css';

/** A text action (`Button`). */
export interface ManagerAction {
  readonly label: string;
  readonly keyHint?: string | undefined;
  /** What Enter does (one per place). */
  readonly primary?: boolean | undefined;
  readonly onClick: () => void;
}

/*
 * Manager windows (proposal 2026-11-06, the company manager; UI-LIBRARY.md › Proposed: company
 * manager — not decided by the owner). After the Cloudflare dashboard (owner: „mit
 * Cloudflare-Dashboard-Erwähnung"): a sidebar with the account switcher, pages with a head, cards
 * and tables, the chosen item's Properties at the right.
 *
 * Rules by construction (UI-LIBRARY.md › Principle): actions, tools, tiles and values are passed
 * as data, so a page head holds only text buttons, an inspector head only quiet tools, a question
 * only its buttons with the safe one first.
 */

/** The window's body: a sidebar, the page, the inspector; drops and keys stay in it. */
export function ManagerBody(props: {
  sidebar: ReactNode;
  page: ReactNode;
  inspector: ReactNode;
  /** Files are dragged over it: what letting go does (a DropOverlay over the body). */
  dropping?: { readonly label: string; readonly icon: ReactNode } | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  onDragEnter?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDragOver?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDragLeave?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
  onDrop?: ((event: DragEvent<HTMLDivElement>) => void) | undefined;
}): JSX.Element {
  return (
    <div
      className="ui-manager"
      onKeyDown={props.onKeyDown}
      onDragEnter={props.onDragEnter}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    >
      <nav className="ui-manager-sidebar" aria-label="Company">
        {props.sidebar}
      </nav>
      <main className="ui-manager-page">{props.page}</main>
      <aside className="ui-manager-inspector" aria-label="Properties">
        {props.inspector}
      </aside>
      {props.dropping && <DropOverlay label={props.dropping.label} icon={props.dropping.icon} />}
    </div>
  );
}

/**
 * A path that keeps its end when it is too long (`…\\Firma\\HimmelCAD`): the folder that matters
 * is the last one. The whole path is its tooltip.
 */
function PathEnd(props: { className: string; path: string }): JSX.Element {
  return (
    <span className={`${props.className} ui-path-end`} data-tip-overflow>
      <bdi>{props.path}</bdi>
    </span>
  );
}

/** The sidebar's head: which company (its monogram, name and folder); a click opens its menu. */
export function CompanySwitcher(props: {
  name: string;
  initials: string;
  detail: string;
  open: boolean;
  onClick: (anchor: DOMRect) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-switcher"
      aria-haspopup="menu"
      aria-expanded={props.open}
      aria-label={`Company: ${props.name}`}
      onClick={(event) => props.onClick(event.currentTarget.getBoundingClientRect())}
    >
      <span className="ui-monogram" aria-hidden>
        {props.initials}
      </span>
      <span className="ui-switcher-text">
        {/* The one place that says which company is open: the name wraps, never cut. */}
        <span className="ui-switcher-name">{props.name}</span>
        <PathEnd className="ui-switcher-detail" path={props.detail} />
      </span>
      <ChevronsUpDown size={14} aria-hidden />
    </button>
  );
}

/** A search at the sidebar's top (Go to): its field at the sidebar's row height. */
export function SidebarSearch(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-sidebar-search">{props.children}</div>;
}

/**
 * A page's head: the title, where it lives (a path, mono, with its Copy) and what else it says,
 * the page's actions at the right.
 */
export function PageHead(props: {
  title: string;
  path?: string | undefined;
  meta?: string | undefined;
  actions?: readonly ManagerAction[] | undefined;
}): JSX.Element {
  return (
    <header className="ui-page-head">
      <div className="ui-page-title">
        <h2>{props.title}</h2>
        {(props.path || props.meta) && (
          <div className="ui-page-meta">
            {props.path && (
              <>
                <PathEnd className="ui-page-path" path={props.path} />
                <CopyButton value={props.path} label="Path" />
              </>
            )}
            {props.meta && <span>{props.meta}</span>}
          </div>
        )}
      </div>
      {props.actions && (
        <div className="ui-page-actions">
          {props.actions.map((action) => (
            <Button key={action.label} keyHint={action.keyHint} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </header>
  );
}

/** A page's toolbar under its head: its filter (a SearchField) and the page's view choice. */
export function PageToolbar(props: {
  search: ReactNode;
  view?:
    | {
        readonly label: string;
        readonly value: string;
        readonly options: readonly (readonly [value: string, label: string, icon: ReactNode])[];
        readonly onChange: (value: string) => void;
      }
    | undefined;
}): JSX.Element {
  return (
    <div className="ui-page-toolbar">
      {props.search}
      {props.view && (
        <Segmented
          label={props.view.label}
          value={props.view.value}
          options={props.view.options}
          onChange={props.view.onChange}
        />
      )}
    </div>
  );
}

/** The scrolling content of a page, at its readable width. */
export function PageContent(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-page-content">{props.children}</div>;
}

/** Titled cards side by side (two up, one in a narrow page). */
export function CardRow(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-card-grid is-cards">{props.children}</div>;
}

/**
 * The overview's kinds as cards: icon, name, how many, the last change or its problem (red); a
 * click opens the kind.
 */
export function KindCards(props: {
  cards: readonly {
    readonly id: string;
    readonly icon: ReactNode;
    readonly name: string;
    readonly count: number;
    readonly detail: string;
    readonly problem?: string | undefined;
    readonly onOpen: () => void;
  }[];
}): JSX.Element {
  return (
    <div className="ui-card-grid is-kinds">
      {props.cards.map((card) => (
        <button key={card.id} type="button" className="ui-kind-card" onClick={card.onOpen}>
          <span className="ui-kind-card-head">
            {card.icon}
            <span>{card.name}</span>
          </span>
          <span className="ui-kind-card-count">{card.count}</span>
          <span className="ui-kind-card-detail">
            {card.problem ? <Tag tone="error">{card.problem}</Tag> : card.detail}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * A titled box of rows (PropertyRow, DataTable) with its actions in the head. Its title, the
 * Properties labels and a table's first column share one x (the label inset).
 */
export function Card(props: {
  title: string;
  actions?: readonly WorkTool[] | undefined;
  /** What it says when it has nothing to show (instead of its rows). */
  empty?: string | undefined;
  /** PropertyRows, a DataTable or a FolderMap. */
  children?: ReactNode | undefined;
}): JSX.Element {
  return (
    <section className="ui-card" aria-label={props.title}>
      <header className="ui-card-head">
        <h3>{props.title}</h3>
        {props.actions && <Tools tools={props.actions} className="ui-card-actions" />}
      </header>
      <div className="ui-card-body">
        {props.empty !== undefined ? (
          <div className="ui-card-empty">{props.empty}</div>
        ) : (
          props.children
        )}
      </div>
    </section>
  );
}

/**
 * What a table column holds; its width and alignment follow from it (tokens), never from the
 * caller: `name` (icon, name, tags; the widest), `text`, `muted` (quiet text), `code` (a code and
 * its name), `file` (a file name, mono), `number` (digits right), `date` (quiet), `tag` (a Tag),
 * `swatch` (a small picture).
 */
export type ColumnKind =
  | 'name'
  | 'text'
  | 'muted'
  | 'code'
  | 'file'
  | 'number'
  | 'date'
  | 'tag'
  | 'swatch';

/** A table row: one cell per column, in the columns' order. */
export interface TableRow {
  readonly id: string;
  readonly cells: readonly ReactNode[];
  readonly selected?: boolean | undefined;
  readonly onSelect: () => void;
  readonly onOpen?: (() => void) | undefined;
  readonly onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
}

const TRACK: Record<ColumnKind, string> = {
  name: 'minmax(0, 1.6fr)',
  text: 'minmax(0, 1fr)',
  muted: 'minmax(0, 1fr)',
  code: 'minmax(0, 1.2fr)',
  file: 'minmax(0, 1fr)',
  number: 'var(--ui-table-col-number)',
  date: 'var(--ui-table-col-date)',
  tag: 'var(--ui-table-col-tag)',
  swatch: 'var(--ui-table-col-swatch)',
};

/**
 * A table (Cloudflare's): the column heads, then the rows, the chosen one filled. The keyboard
 * moves the choice (↑ ↓, the owner's `onKeyDown`, also Enter, F2, Delete, Shift+F10). `headless`:
 * a short list without column heads (in a card).
 */
export function DataTable(props: {
  label: string;
  columns: readonly { readonly name: string; readonly kind: ColumnKind }[];
  rows: readonly TableRow[];
  headless?: boolean | undefined;
  empty?: string | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
}): JSX.Element {
  const tracks = props.columns.map((column) => TRACK[column.kind]).join(' ');
  return (
    <div
      className="ui-table"
      role="grid"
      aria-label={props.label}
      tabIndex={0}
      style={{ '--ui-table-cols': tracks } as CSSProperties}
      onKeyDown={props.onKeyDown}
    >
      {!props.headless && (
        <div className="ui-table-head" role="row">
          {props.columns.map((column, index) => (
            <span
              key={`${column.name}-${index}`}
              role="columnheader"
              className={`is-${column.kind}`}
            >
              {column.name}
            </span>
          ))}
        </div>
      )}
      {props.rows.length === 0 ? (
        <div className="ui-table-empty">{props.empty ?? 'Empty'}</div>
      ) : (
        props.rows.map((row) => <TableRowView key={row.id} row={row} columns={props.columns} />)
      )}
    </div>
  );
}

function TableRowView(props: {
  row: TableRow;
  columns: readonly { readonly kind: ColumnKind }[];
}): JSX.Element {
  const { row } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (row.selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [row.selected]);
  return (
    <div
      ref={ref}
      role="row"
      data-id={row.id}
      aria-selected={!!row.selected}
      className={`ui-table-row${row.selected ? ' is-selected' : ''}`}
      onClick={row.onSelect}
      onDoubleClick={row.onOpen}
      onContextMenu={row.onContextMenu}
    >
      {props.columns.map((column, index) => (
        <span key={index} role="gridcell" className={`ui-table-cell is-${column.kind}`}>
          {row.cells[index]}
        </span>
      ))}
    </div>
  );
}

/** A name in a table cell: its icon, the name (cut with …), its tags after it. */
export function NameCell(props: {
  icon?: ReactNode | undefined;
  name: string;
  tags?: ReactNode | undefined;
}): JSX.Element {
  return (
    <>
      {props.icon}
      <span className="ui-table-name" data-tip-overflow>
        {props.name}
      </span>
      {props.tags}
    </>
  );
}

/** A code before its name in a table cell (an EPSG number): the code quiet in mono. */
export function CodeCell(props: { code?: string | undefined; name: string }): JSX.Element {
  return (
    <>
      {props.code && <span className="ui-table-code">{props.code}</span>}
      <span className="ui-table-name" data-tip-overflow>
        {props.name}
      </span>
    </>
  );
}

/** A quiet badge: what a thing is (Default, 2D) or where it was changed (Folder); red: an error. */
export function Tag(props: { tone?: 'error' | undefined; children: string }): JSX.Element {
  return (
    <span className={`ui-tag${props.tone === 'error' ? ' is-error' : ''}`}>{props.children}</span>
  );
}

/**
 * Picture files as tiles in a grid (textures, Cloudflare Images): the picture, its name, a
 * detail; the chosen one framed. A list box the arrows move through (the owner's `onKeyDown`).
 */
export function TileGrid(props: {
  label: string;
  tiles: readonly {
    readonly id: string;
    readonly preview: ReactNode;
    readonly name: string;
    readonly detail: string;
    readonly selected: boolean;
    readonly onSelect: () => void;
    readonly onContextMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  }[];
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
}): JSX.Element {
  return (
    <div
      className="ui-tiles"
      role="listbox"
      aria-label={props.label}
      tabIndex={0}
      onKeyDown={props.onKeyDown}
    >
      {props.tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          data-id={tile.id}
          className={`ui-tile${tile.selected ? ' is-selected' : ''}`}
          aria-pressed={tile.selected}
          onClick={tile.onSelect}
          onContextMenu={tile.onContextMenu}
        >
          <span className="ui-tile-preview">{tile.preview}</span>
          <span className="ui-tile-name" data-tip-overflow>
            {tile.name}
          </span>
          <span className="ui-tile-detail">{tile.detail}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The inspector's column: its head, the sections (they scroll) and an action at the foot (the
 * one primary button).
 */
/**
 * The inspector: its head — what is chosen (its icon, its name on the section titles' x) and its
 * quiet tools (the key in the tooltip) —, a picture (a texture), the sections (they scroll), the
 * one primary action at the foot.
 */
export function InspectorColumn(props: {
  icon: ReactNode;
  title: string;
  tools?: readonly WorkTool[] | undefined;
  preview?: ReactNode | undefined;
  primary?: ManagerAction | undefined;
  /** Sections. */
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-inspector">
      <header className="ui-inspector-head">
        <span className="ui-inspector-icon" aria-hidden>
          {props.icon}
        </span>
        <span className="ui-inspector-title" data-tip-overflow>
          {props.title}
        </span>
        {props.tools && <Tools tools={props.tools} className="ui-inspector-tools" />}
      </header>
      <div className="ui-inspector-scroll">
        {props.preview && <div className="ui-inspector-preview">{props.preview}</div>}
        {props.children}
      </div>
      {props.primary && (
        <div className="ui-inspector-foot">
          <Button variant="primary" keyHint={props.primary.keyHint} onClick={props.primary.onClick}>
            {props.primary.label}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Quiet tools in a head (`IconButton tool`). */
function Tools(props: { tools: readonly WorkTool[]; className: string }): JSX.Element {
  return (
    <span className={props.className}>
      {props.tools.map((tool) => (
        <IconButton
          key={tool.label}
          size="tool"
          label={tool.label}
          keyHint={tool.keyHint}
          icon={tool.icon}
          disabled={tool.disabled}
          onClick={tool.onClick}
        />
      ))}
    </span>
  );
}

/**
 * Several values in one Properties row, one under the other (Used by): each a link to its item
 * or plain; `empty` (quiet) when there is none.
 */
export function ValueList(props: {
  items: readonly {
    readonly id: string;
    readonly label: string;
    readonly onOpen?: (() => void) | undefined;
  }[];
  empty: string;
  openTip?: string | undefined;
}): JSX.Element {
  return (
    <span className="ui-value-list">
      {props.items.length === 0 ? (
        <ReadValue muted>{props.empty}</ReadValue>
      ) : (
        props.items.map((item) => (
          <ReadValue
            key={item.id}
            onClick={item.onOpen}
            tip={item.onOpen ? props.openTip : undefined}
          >
            {item.label}
          </ReadValue>
        ))
      )}
    </span>
  );
}

/**
 * A question before a change Ctrl+Z cannot take back. `center` (a company file overwritten or
 * deleted): over everything with a dim, the keyboard on the first action (Cancel), so Enter alone
 * never overwrites. `corner` (a window's close: keep or discard the draft): under the window's
 * head at its right, Enter does `onEnter`. Esc always cancels.
 */
export function Confirm(props: {
  title: string;
  rows?: readonly (readonly [label: string, value: ReactNode])[] | undefined;
  placement?: 'center' | 'corner' | undefined;
  onCancel: () => void;
  /** Its buttons, the safe one first (the keyboard starts there in the centre). */
  actions: readonly ManagerAction[];
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const corner = props.placement === 'corner';
  const { onCancel } = props;
  const onEnter = props.actions.find((action) => action.primary)?.onClick;
  useEffect(() => {
    if (!corner)
      ref.current?.querySelector<HTMLButtonElement>('.ui-confirm-buttons button')?.focus();
  }, [corner]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      else if (event.key === 'Enter' && onEnter) onEnter();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, onEnter]);
  const box = (
    <Surface
      kind="popover"
      role="alertdialog"
      aria-label={props.title}
      className={`ui-confirm is-${corner ? 'corner' : 'center'}`}
    >
      <div ref={ref} className="ui-confirm-inner">
        <div className="ui-confirm-title">{props.title}</div>
        {props.rows && props.rows.length > 0 && (
          <dl className="ui-confirm-rows">
            {props.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="ui-confirm-buttons">
          {props.actions.map((action) => (
            <Button
              key={action.label}
              variant={action.primary ? 'primary' : undefined}
              keyHint={action.keyHint}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </Surface>
  );
  return corner ? box : createPortal(<div className="ui-confirm-scrim">{box}</div>, uiRoot());
}

/** The folder's structure: each subfolder, the file types it takes, how many files are in it. */
export function FolderMap(props: {
  root: string;
  rows: readonly (readonly [name: string, types: string, count: string, onOpen?: () => void])[];
}): JSX.Element {
  return (
    <div className="ui-folder-map" role="tree" aria-label="Folder structure">
      <div className="ui-folder-root" role="treeitem" aria-expanded>
        {props.root}
      </div>
      {props.rows.map(([name, types, count, onOpen]) => (
        <div key={name} className="ui-folder-row" role="treeitem">
          {onOpen ? (
            <button type="button" className="ui-folder-name" onClick={onOpen}>
              {name}
            </button>
          ) : (
            <span className="ui-folder-name">{name}</span>
          )}
          <span className="ui-folder-types">{types}</span>
          <span className="ui-folder-count">{count}</span>
        </div>
      ))}
    </div>
  );
}
