// Tables (proposal 2026-11-07, attribute system — not decided by the owner; UI-LIBRARY.md ›
// Proposed: tables). One rule: an attribute table defines columns, its rows are elements — or,
// inside an element, the rows of a table attribute. So one grid shows both: a table attribute's
// rows (a small spreadsheet, owner: „wie eine kleine Excel-Tabelle") and elements as rows (the GIS
// attribute table). And a table's keys are items of their own (owner review S5: select, rename,
// right-click › Delete, Del, multi-select), not property rows with a × in the value.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Plus, SquareArrowOutUpRight, X } from 'lucide-react';
import { IconButton } from './Button.js';
import { SelectField } from './Field.js';
import { RenameField, Twisty } from './List.js';
import { Menu, MenuDivider, MenuItem } from './Menu.js';
import { uiRoot } from './placement.js';
import './table.css';

/**
 * A table value in Properties, compact (owner answer 3a: „kompakte Vorschau … ‚Open table' poppt sie
 * aus"): how many rows and the first row's values at a field's height; the ↗ at its end opens the
 * table as a window.
 */
export function TableValue(props: {
  label: string;
  rows: number;
  /** The first row's values, in one line. */
  first?: string | undefined;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-field is-select ui-sheet-value"
      aria-label={`Open ${props.label}`}
      data-tip="Open table"
      onClick={props.onOpen}
    >
      <span className="ui-field-value">
        <span className="ui-sheet-count">{props.rows === 1 ? '1 row' : `${props.rows} rows`}</span>
        {props.first && <span className="ui-sheet-first">{props.first}</span>}
      </span>
      <span className="ui-field-more" aria-hidden>
        <SquareArrowOutUpRight size={14} />
      </span>
    </button>
  );
}

// ---- The window ------------------------------------------------------------------------------
const EDGES = ['e', 's', 'se', 'w', 'sw'] as const;
type Edge = (typeof EDGES)[number];

/**
 * A table as a window of its own: the head names the table, what its rows belong to and — as a
 * link with › — the attribute table its columns come from; moves by its head, sized at its edges;
 * Esc (with the keyboard inside) or × closes. Edits are committed cell by cell.
 */
export function TableWindow(props: {
  label: string;
  title: string;
  /** Quiet after the title: whose rows (2001), how many. */
  meta?: string | undefined;
  /** The attribute table the columns come from: a link that opens it. */
  source?: { readonly label: string; readonly onOpen: () => void } | undefined;
  /** Placed a step down and right of the first window (a second one opened from it). */
  offset?: number | undefined;
  onClose: () => void;
  /** A `Sheet`. */
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  // As wide as its table (at most the window less a margin) until it is sized by hand; centred,
  // a second one a step down and right.
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [placed, setPlaced] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || placed) return;
    const step = (props.offset ?? 0) * 32;
    setBox({
      x: Math.max(16, (window.innerWidth - el.offsetWidth) / 2) + step,
      y: 132 + step,
      w: 0,
      h: 0,
    });
    setPlaced(true);
    el.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, [placed, props.offset]);
  const { onClose } = props;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!ref.current?.contains(event.target as Node)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  const drag = (event: ReactPointerEvent<HTMLElement>, edge: Edge | 'move') => {
    if (edge === 'move' && (event.target as Element).closest('button')) return;
    event.preventDefault();
    const el = ref.current!;
    const from = { ...box, w: box.w || el.offsetWidth, h: box.h || el.offsetHeight };
    const at = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - at.x;
      const dy = e.clientY - at.y;
      const next = { ...from };
      if (edge === 'move') {
        next.x += dx;
        next.y = Math.max(0, from.y + dy);
      } else {
        if (edge.includes('e')) next.w = Math.max(MIN_W, from.w + dx);
        if (edge.includes('w')) {
          next.w = Math.max(MIN_W, from.w - dx);
          next.x = from.x + from.w - next.w;
        }
        if (edge.includes('s')) next.h = Math.max(MIN_H, from.h + dy);
      }
      setBox(next);
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };
  return createPortal(
    <section
      ref={ref}
      className="ui-surface is-large ui-sheet-window"
      role="dialog"
      aria-label={props.label}
      style={{
        left: box.x,
        top: box.y,
        ...(box.w ? { width: box.w } : {}),
        ...(box.h ? { height: box.h } : {}),
        ...(placed ? {} : { visibility: 'hidden' as const }),
      }}
    >
      <header className="ui-sheet-head" onPointerDown={(event) => drag(event, 'move')}>
        <span className="ui-sheet-title">{props.title}</span>
        {props.meta && <span className="ui-sheet-meta">{props.meta}</span>}
        {props.source && (
          <button
            type="button"
            className="ui-sheet-link"
            data-tip="Open attribute table"
            onClick={props.source.onOpen}
          >
            <span>{props.source.label}</span>
            <ChevronRight size={14} aria-hidden />
          </button>
        )}
        <span className="ui-sheet-head-gap" />
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
        <span
          key={edge}
          className={`ui-sheet-edge is-${edge}`}
          aria-hidden
          onPointerDown={(event) => drag(event, edge)}
        />
      ))}
    </section>,
    uiRoot(),
  );
}
const MIN_W = 420;
const MIN_H = 160;

// ---- The grid --------------------------------------------------------------------------------
/** What a column holds; it decides alignment and font (numbers right in mono, dates mono). */
export type SheetColumnType = 'text' | 'number' | 'date' | 'choice' | 'yesno' | 'image' | 'rows';

export interface SheetColumn {
  readonly key: string;
  readonly name: string;
  readonly type: SheetColumnType;
  readonly unit?: string | undefined;
  /** A choice's values. */
  readonly options?: readonly string[] | undefined;
}

/**
 * Columns that come from one attribute table, under one heading: its code and name — a link with
 * › to the table — and, for a linked table, the file its values are read from.
 */
export interface SheetGroup {
  readonly code: string;
  readonly name: string;
  readonly span: number;
  readonly source?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}

/**
 * A cell: a value (editable: a field, like every editable value; read-only: plain text), an image,
 * a table value's rows (opens them), or none — the row's element does not have the key.
 */
export type SheetCell =
  | {
      readonly kind: 'value';
      readonly text: string;
      readonly editable: boolean;
      /** A default the element inherits (its specification's): quiet until it is set. */
      readonly inherited?: boolean | undefined;
    }
  | {
      readonly kind: 'image';
      readonly name: string;
      readonly size: string;
      readonly editable: boolean;
    }
  | { readonly kind: 'rows'; readonly count: number }
  | { readonly kind: 'none' };

export interface SheetRow {
  readonly id: string;
  /** The row's head: its number, or the element it is (a link that selects it). */
  readonly head: string;
  readonly cells: readonly SheetCell[];
}

export type SheetMenuEntry =
  | {
      readonly label: string;
      readonly shortcut?: string | undefined;
      readonly disabled?: boolean | undefined;
      readonly disabledReason?: string | undefined;
      readonly onSelect: () => void;
    }
  | 'divider';

const numeric = (type: SheetColumnType) => type === 'number';
const monoType = (type: SheetColumnType) => type === 'number' || type === 'date';

/**
 * A table as a grid (Excel, Airtable, the QGIS attribute table): a head row with each column's
 * name and unit (and, above, the attribute tables they come from), a head column (a row's number
 * or its element), cells. An editable cell looks like every editable value — a field — so the
 * grid reads as editable; a read-only value is plain text. Click a cell to make it current,
 * Enter, F2, double-click or typing edits it, Enter commits and goes down, Tab right, Esc cancels,
 * arrows move, Delete clears. A row is selected by its head (Ctrl, Shift); right-click there for
 * its menu, Delete deletes the selected rows. + Add row is the grid's last row.
 */
export function Sheet(props: {
  label: string;
  columns: readonly SheetColumn[];
  groups?: readonly SheetGroup[] | undefined;
  rows: readonly SheetRow[];
  /** `number`: rows are counted; `element`: each row is an element, its name a link. */
  head: 'number' | 'element';
  selected: readonly string[];
  onSelected: (ids: readonly string[]) => void;
  /** The element of a row was clicked (head `element`): select it in the view. */
  onHead?: ((row: SheetRow) => void) | undefined;
  onEdit: (row: SheetRow, column: SheetColumn, value: string) => void;
  onImage?: ((row: SheetRow, column: SheetColumn) => void) | undefined;
  onRows?: ((row: SheetRow, column: SheetColumn) => void) | undefined;
  rowMenu?: ((rows: readonly SheetRow[]) => readonly SheetMenuEntry[]) | undefined;
  onDelete?: ((rows: readonly SheetRow[]) => void) | undefined;
  add?: { readonly label: string; readonly onAdd: () => void } | undefined;
  empty: string;
}): JSX.Element {
  const [at, setAt] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ seed: string | null } | null>(null);
  const [choice, setChoice] = useState<DOMRect | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const { rows, columns } = props;
  const cellAt = (r: number, c: number) => rows[r]?.cells[c];
  const editable = (cell: SheetCell | undefined) =>
    !!cell && (cell.kind === 'value' || cell.kind === 'image') && cell.editable;
  const focusHost = () => host.current?.focus({ preventScroll: true });

  const commit = (r: number, c: number, value: string) => {
    const row = rows[r];
    const col = columns[c];
    const cell = cellAt(r, c);
    setEditing(null);
    if (row && col && cell?.kind === 'value' && value !== cell.text) props.onEdit(row, col, value);
    focusHost();
  };
  const move = (dr: number, dc: number) =>
    setAt((cur) =>
      cur
        ? {
            r: Math.max(0, Math.min(rows.length - 1, cur.r + dr)),
            c: Math.max(0, Math.min(columns.length - 1, cur.c + dc)),
          }
        : { r: 0, c: 0 },
    );
  const begin = (r: number, c: number, seed: string | null) => {
    const cell = cellAt(r, c);
    const col = columns[c];
    if (!col || !cell) return;
    if (cell.kind === 'rows') return props.onRows?.(rows[r]!, col);
    if (cell.kind === 'image')
      return cell.editable || cell.name ? props.onImage?.(rows[r]!, col) : undefined;
    if (!editable(cell)) return;
    if (col.type === 'choice' || col.type === 'yesno') {
      const el = host.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
      setChoice(el?.getBoundingClientRect() ?? null);
      return;
    }
    setEditing({ seed });
  };
  useEffect(() => {
    if (!at) return;
    host.current
      ?.querySelector<HTMLElement>(`[data-cell="${at.r}:${at.c}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [at]);

  const selectRow = (event: ReactMouseEvent, row: SheetRow) => {
    const ids = rows.map((r) => r.id);
    if (event.shiftKey && anchor) {
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(row.id);
      props.onSelected(ids.slice(Math.min(from, to), Math.max(from, to) + 1));
    } else if (event.ctrlKey || event.metaKey) {
      props.onSelected(
        props.selected.includes(row.id)
          ? props.selected.filter((id) => id !== row.id)
          : [...props.selected, row.id],
      );
      setAnchor(row.id);
    } else {
      props.onSelected([row.id]);
      setAnchor(row.id);
    }
    setAt(null);
    focusHost();
  };
  const selectedRows = rows.filter((r) => props.selected.includes(r.id));

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing || choice) return;
    const k = event.key;
    if ((k === 'Delete' || k === 'Backspace') && !at && selectedRows.length && props.onDelete) {
      event.preventDefault();
      props.onDelete(selectedRows);
      props.onSelected([]);
      return;
    }
    if (!at) {
      if (k.startsWith('Arrow')) {
        event.preventDefault();
        setAt({ r: 0, c: 0 });
      }
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (arrows[k]) {
      event.preventDefault();
      move(...arrows[k]!);
    } else if (k === 'Tab') {
      event.preventDefault();
      move(0, event.shiftKey ? -1 : 1);
    } else if (k === 'Enter' || k === 'F2') {
      event.preventDefault();
      begin(at.r, at.c, null);
    } else if (k === 'Delete' || k === 'Backspace') {
      const cell = cellAt(at.r, at.c);
      if (cell?.kind === 'value' && cell.editable && cell.text) {
        event.preventDefault();
        props.onEdit(rows[at.r]!, columns[at.c]!, '');
      }
    } else if (k === 'Escape' && at) {
      event.preventDefault();
      setAt(null);
    } else if (k.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const col = columns[at.c];
      if (col && col.type !== 'choice' && col.type !== 'yesno' && editable(cellAt(at.r, at.c))) {
        event.preventDefault();
        begin(at.r, at.c, k);
      }
    }
  };

  const cell = (row: SheetRow, r: number, col: SheetColumn, c: number) => {
    const value = row.cells[c] ?? ({ kind: 'none' } as const);
    const current = at?.r === r && at?.c === c;
    const cls = (base: string) =>
      `ui-sheet-cell ${base}${monoType(col.type) ? ' is-mono' : ''}${numeric(col.type) ? ' is-number' : ''}${current ? ' is-current' : ''}`;
    const press = (event: ReactMouseEvent) => {
      event.preventDefault();
      setAt({ r, c });
      props.onSelected([]);
      focusHost();
    };
    if (value.kind === 'none')
      return <td key={col.key} className="ui-sheet-td is-none" aria-label="None" />;
    if (value.kind === 'value' && value.editable && current && editing)
      return (
        <td key={col.key} className="ui-sheet-td">
          <input
            className={`${cls('is-edit')} is-editing`}
            aria-label={`${col.name}, ${row.head}`}
            autoFocus
            defaultValue={editing.seed ?? value.text}
            onFocus={(event) => {
              if (editing.seed === null) event.currentTarget.select();
            }}
            onBlur={(event) => commit(r, c, event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                setEditing(null);
                focusHost();
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                const v = event.currentTarget.value;
                commit(r, c, v);
                if (event.key === 'Enter') move(1, 0);
                else move(0, event.shiftKey ? -1 : 1);
              }
            }}
          />
        </td>
      );
    if (value.kind === 'value')
      return (
        <td key={col.key} className="ui-sheet-td">
          <div
            className={cls(
              `${value.editable ? 'is-edit' : 'is-read'}${value.inherited ? ' is-inherited' : ''}`,
            )}
            data-cell={`${r}:${c}`}
            data-tip-overflow={value.text ? true : undefined}
            onMouseDown={press}
            onDoubleClick={() => begin(r, c, null)}
          >
            {value.text ? (
              <span className="ui-sheet-text">{value.text}</span>
            ) : (
              value.editable && <span className="ui-sheet-placeholder">None</span>
            )}
          </div>
        </td>
      );
    if (value.kind === 'image')
      return (
        <td key={col.key} className="ui-sheet-td">
          <div
            className={cls(value.editable ? 'is-edit is-image' : 'is-read is-image')}
            data-cell={`${r}:${c}`}
            data-tip={value.name ? `${value.name} · ${value.size}` : undefined}
            onMouseDown={press}
            onDoubleClick={() => begin(r, c, null)}
          >
            {value.name ? (
              <>
                <Thumb />
                <span className="ui-sheet-text">{value.name}</span>
              </>
            ) : (
              value.editable && <span className="ui-sheet-placeholder">None</span>
            )}
          </div>
        </td>
      );
    return (
      <td key={col.key} className="ui-sheet-td">
        <div
          className={cls('is-edit is-rows')}
          data-cell={`${r}:${c}`}
          data-tip="Open table"
          onMouseDown={press}
          onDoubleClick={() => begin(r, c, null)}
        >
          <span className="ui-sheet-text">
            {value.count === 1 ? '1 row' : `${value.count} rows`}
          </span>
          <button
            type="button"
            className="ui-sheet-open"
            aria-label={`Open ${col.name}, ${row.head}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => props.onRows?.(row, col)}
          >
            <SquareArrowOutUpRight size={14} aria-hidden />
          </button>
        </div>
      </td>
    );
  };

  const chosen = at && columns[at.c];
  const chosenCell = at && cellAt(at.r, at.c);
  return (
    <div
      ref={host}
      className="ui-sheet-scroll"
      tabIndex={0}
      role="grid"
      aria-label={props.label}
      aria-multiselectable
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === host.current) {
          setAt(null);
          props.onSelected([]);
        }
      }}
    >
      <table className={`ui-sheet${props.head === 'element' ? ' is-elements' : ''}`}>
        <thead>
          {props.groups && (
            <tr className="ui-sheet-groups">
              <th className="ui-sheet-corner" />
              {props.groups.map((g, i) => (
                <th key={`${g.code}-${i}`} colSpan={g.span} scope="colgroup">
                  <span className="ui-sheet-group">
                    {g.onOpen ? (
                      <button
                        type="button"
                        className="ui-sheet-link"
                        data-tip="Open attribute table"
                        onClick={g.onOpen}
                      >
                        {g.code && <span className="ui-sheet-code">{g.code}</span>}
                        <span>{g.name}</span>
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    ) : (
                      <span className="ui-sheet-group-name">{g.name}</span>
                    )}
                    {g.source && (
                      <span className="ui-sheet-source" data-tip-overflow>
                        {g.source}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          )}
          <tr className="ui-sheet-columns">
            <th className="ui-sheet-corner" scope="col">
              {props.head === 'element' ? 'Element' : ''}
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={numeric(col.type) ? 'is-number' : undefined}
                data-tip-overflow
              >
                {col.name}
                {col.unit && <span className="ui-sheet-unit">{col.unit}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.id} aria-selected={props.selected.includes(row.id)}>
              <th
                scope="row"
                className="ui-sheet-rowhead"
                onMouseDown={(event) => {
                  if (event.button === 0) selectRow(event, row);
                }}
                onContextMenu={(event) => {
                  if (!props.rowMenu) return;
                  event.preventDefault();
                  if (!props.selected.includes(row.id)) {
                    props.onSelected([row.id]);
                    setAnchor(row.id);
                  }
                  setAt(null);
                  setMenu({ x: event.clientX, y: event.clientY });
                }}
              >
                {props.head === 'element' ? (
                  <button
                    type="button"
                    className="ui-sheet-element"
                    data-tip="Select"
                    onClick={() => props.onHead?.(row)}
                  >
                    {row.head}
                  </button>
                ) : (
                  <span className="ui-sheet-number">{row.head}</span>
                )}
              </th>
              {columns.map((col, c) => cell(row, r, col, c))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="ui-sheet-empty" colSpan={columns.length + 1}>
                {props.empty}
              </td>
            </tr>
          )}
          {props.add && (
            <tr>
              <td className="ui-sheet-td" colSpan={columns.length + 1}>
                <button type="button" className="ui-sheet-add" onClick={props.add.onAdd}>
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  <span>{props.add.label}</span>
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {choice && chosen && chosenCell?.kind === 'value' && (
        <Menu
          label={chosen.name}
          x={choice.left}
          y={choice.bottom + 4}
          anchor={choice}
          minWidth={choice.width}
          onClose={() => {
            setChoice(null);
            focusHost();
          }}
        >
          {['', ...(chosen.type === 'yesno' ? ['Yes', 'No'] : (chosen.options ?? []))].map(
            (option) => (
              <MenuItem
                key={option || 'none'}
                kind="radio"
                checked={chosenCell.text === option}
                onSelect={() => {
                  setChoice(null);
                  commit(at.r, at.c, option);
                }}
              >
                {option || 'None'}
              </MenuItem>
            ),
          )}
        </Menu>
      )}
      {menu && props.rowMenu && (
        <Menu
          label="Row menu"
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
            focusHost();
          }}
        >
          {props.rowMenu(selectedRows).map((entry, i) =>
            entry === 'divider' ? (
              <MenuDivider key={`d${i}`} />
            ) : (
              <MenuItem
                key={entry.label}
                shortcut={entry.shortcut}
                disabled={entry.disabled}
                disabledReason={entry.disabledReason}
                onSelect={() => {
                  setMenu(null);
                  entry.onSelect();
                  focusHost();
                }}
              >
                {entry.label}
              </MenuItem>
            ),
          )}
        </Menu>
      )}
    </div>
  );
}

/** The mock has no image files: a drawn thumbnail (a tree photo), as ImageValue's. */
function Thumb(): JSX.Element {
  return (
    <svg
      className="ui-sheet-thumb"
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
  );
}

// ---- Keys as items ---------------------------------------------------------------------------
/**
 * A key (or a table key's column) as an item: its name is the object — selected by a click (Ctrl,
 * Shift), renamed in place (double-click, F2), deleted by Delete or its menu — and its type is an
 * editable value beside it. A Table key opens (twisty) to the columns it takes from its attribute
 * table, indented under it, so they visibly belong to it.
 */
export interface KeyItem {
  readonly id: string;
  readonly name: string;
  readonly depth: 0 | 1;
  /** The type as a choice; a linked table's keys have their source's types, read-only. */
  readonly type:
    | {
        readonly value: string;
        readonly options: readonly (readonly [value: string, label: string, code?: string])[];
        readonly onChange: (value: string) => void;
      }
    | { readonly text: string };
  readonly expanded?: boolean | undefined;
  readonly onToggle?: (() => void) | undefined;
  /** Its name cannot change here (a linked table's key). */
  readonly fixed?: boolean | undefined;
}

/** + New … under a list of keys, or under a Table key's columns (indented with them). */
export interface KeyAdd {
  readonly add: string;
  readonly depth: 0 | 1;
  readonly onAdd: () => void;
}

export function KeyList(props: {
  label: string;
  items: readonly (KeyItem | KeyAdd)[];
  selected: readonly string[];
  onSelected: (ids: readonly string[]) => void;
  renaming: string | null;
  onRenaming: (id: string | null) => void;
  onRename: (item: KeyItem, name: string) => void;
  menu: (items: readonly KeyItem[]) => readonly SheetMenuEntry[];
  onDelete: (items: readonly KeyItem[]) => void;
  empty: string;
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const keys = props.items.filter((i): i is KeyItem => 'id' in i);
  const chosen = keys.filter((k) => props.selected.includes(k.id));
  const pick = (event: ReactMouseEvent, item: KeyItem) => {
    const ids = keys.map((k) => k.id);
    if (event.shiftKey && anchor) {
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(item.id);
      props.onSelected(ids.slice(Math.min(from, to), Math.max(from, to) + 1));
      return;
    }
    if (event.ctrlKey || event.metaKey)
      props.onSelected(
        props.selected.includes(item.id)
          ? props.selected.filter((id) => id !== item.id)
          : [...props.selected, item.id],
      );
    else props.onSelected([item.id]);
    setAnchor(item.id);
  };
  return (
    <div
      ref={host}
      className="ui-keys"
      role="treegrid"
      aria-label={props.label}
      aria-multiselectable
      tabIndex={0}
      onKeyDown={(event) => {
        if (props.renaming) return;
        if (['Delete', 'F2', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.stopPropagation();
        if (event.key === 'Delete' && chosen.length) {
          event.preventDefault();
          props.onDelete(chosen);
        } else if (event.key === 'F2' && chosen.length === 1 && !chosen[0]!.fixed) {
          event.preventDefault();
          props.onRenaming(chosen[0]!.id);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const i = keys.findIndex((k) => k.id === anchor);
          const next =
            keys[Math.max(0, Math.min(keys.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))];
          if (next) {
            props.onSelected([next.id]);
            setAnchor(next.id);
          }
        }
      }}
    >
      <div className="ui-keys-head" role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Type</span>
      </div>
      {keys.length === 0 && <div className="ui-keys-empty">{props.empty}</div>}
      {props.items.map((item) =>
        'add' in item ? (
          <button
            key={`add-${item.add}-${item.depth}`}
            type="button"
            className={`ui-keys-add is-depth-${item.depth}`}
            onClick={item.onAdd}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            <span>{item.add}</span>
          </button>
        ) : (
          <div
            key={item.id}
            role="row"
            aria-level={item.depth + 1}
            aria-selected={props.selected.includes(item.id)}
            aria-expanded={item.onToggle ? !!item.expanded : undefined}
            className={`ui-keys-row is-depth-${item.depth}`}
            onMouseDown={(event) => {
              if ((event.target as Element).closest('.ui-field, .ui-list-twisty, input')) return;
              if (event.button === 0) pick(event, item);
            }}
            onDoubleClick={(event) => {
              if ((event.target as Element).closest('.ui-field')) return;
              if (!item.fixed) props.onRenaming(item.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              if (!props.selected.includes(item.id)) {
                props.onSelected([item.id]);
                setAnchor(item.id);
              }
              setMenu({ x: event.clientX, y: event.clientY });
            }}
          >
            <span className="ui-keys-name" role="gridcell">
              <Twisty
                depth={0}
                expandable={!!item.onToggle}
                expanded={!!item.expanded}
                onToggle={() => item.onToggle?.()}
              />
              {props.renaming === item.id ? (
                <RenameField
                  label={`Rename ${item.name}`}
                  defaultValue={item.name}
                  onCommit={(name) => {
                    props.onRenaming(null);
                    if (name.trim() && name.trim() !== item.name) props.onRename(item, name.trim());
                    host.current?.focus();
                  }}
                  onCancel={() => {
                    props.onRenaming(null);
                    host.current?.focus();
                  }}
                />
              ) : (
                <span className="ui-keys-label" data-tip-overflow>
                  {item.name}
                </span>
              )}
            </span>
            <span className="ui-keys-type" role="gridcell">
              {'options' in item.type ? (
                <SelectField
                  label={`${item.name} type`}
                  value={item.type.value}
                  options={item.type.options}
                  onChange={item.type.onChange}
                />
              ) : (
                <span className="ui-keys-read">{item.type.text}</span>
              )}
            </span>
          </div>
        ),
      )}
      {menu && (
        <Menu label="Key menu" x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {props.menu(chosen).map((entry, i) =>
            entry === 'divider' ? (
              <MenuDivider key={`d${i}`} />
            ) : (
              <MenuItem
                key={entry.label}
                shortcut={entry.shortcut}
                disabled={entry.disabled}
                disabledReason={entry.disabledReason}
                onSelect={() => {
                  setMenu(null);
                  entry.onSelect();
                }}
              >
                {entry.label}
              </MenuItem>
            ),
          )}
        </Menu>
      )}
    </div>
  );
}
