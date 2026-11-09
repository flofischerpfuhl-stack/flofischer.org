// Picking a resource by type (proposal 2026-11-07, owner review §3 view 2 and S14/S15 — not
// approved yet): a button per type that shows Code – Name and becomes its own search.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight, Pencil, SquareDashed } from 'lucide-react';
import { SlotGrid, type SlotTool } from './Menu.js';
import './pick.css';

/** A row of a result list: code on the name's line. */
export interface ResultRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** A quiet mark at its end (Recent). */
  readonly note?: string | undefined;
  readonly onSelect: () => void;
}

/**
 * Results of a search, usable anywhere (a popup, a panel, a window — not only in a menu): a row
 * per result, code on the name's line, at most about twelve rows, then it scrolls.
 */
export function ResultList(props: {
  label: string;
  rows: readonly ResultRow[];
  empty?: string;
}): JSX.Element {
  return (
    <div className="ui-results" role="listbox" aria-label={props.label}>
      {props.rows.length === 0 && props.empty && (
        <div className="ui-results-empty">{props.empty}</div>
      )}
      {props.rows.map((row) => (
        <button
          key={row.id}
          type="button"
          role="option"
          aria-selected={false}
          className="ui-results-row"
          onClick={row.onSelect}
        >
          <span className="ui-results-code">{row.code}</span>
          <span className="ui-results-name">{row.name}</span>
          {row.note && <span className="ui-results-note">{row.note}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * One type's pick (owner 2026-11-07 §3: „der Button zeigt Code - Name, wenn man reinklickt, wird
 * es zur Suchleiste"; correction: „nicht der Button soll zur Suche werden, sondern der Text beim
 * Reinklicken"; S14: „der Name … klickbar mit >-Button", „Free-Icon … Gegenstück zum Stift"): the
 * type as caption; the button with Code – Name — a click into the text makes the text the search
 * field, `>` opens the list; beside it the pencil (choose in the Library) and the free icon (make
 * a free one). The list itself is the owner's (`ResultList` under the picks).
 */
export function PickButton(props: {
  caption: ReactNode;
  code: string;
  name: string;
  searching: boolean;
  query: string;
  onQuery: (query: string) => void;
  /** Start searching (the text was clicked, or `>`). */
  onSearch: () => void;
  onCancel: () => void;
  /** Enter: take the first result. */
  onEnter: () => void;
  onLibrary: () => void;
  onFree: () => void;
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.searching) input.current?.focus();
  }, [props.searching]);
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onEnter();
    }
  };
  const label = `${props.code} – ${props.name}`;
  return (
    <div className="ui-pick">
      <span className="ui-pick-caption">{props.caption}</span>
      <div className="ui-pick-row">
        <div
          className={`ui-field is-select ui-pick-button${props.searching ? ' is-searching' : ''}`}
        >
          {props.searching ? (
            <input
              ref={input}
              className="ui-pick-input"
              aria-label={`Find ${String(props.caption).toLowerCase()} specification`}
              placeholder={label}
              value={props.query}
              onChange={(event) => props.onQuery(event.target.value)}
              onKeyDown={keys}
            />
          ) : (
            <button
              type="button"
              className="ui-pick-text"
              data-tip={label}
              onClick={props.onSearch}
            >
              <span className="ui-pick-code">{props.code}</span>
              <span className="ui-pick-name">{props.name}</span>
            </button>
          )}
          <button
            type="button"
            className="ui-field-more ui-pick-more"
            aria-label={`List ${String(props.caption).toLowerCase()} specifications`}
            aria-expanded={props.searching}
            onClick={props.searching ? props.onCancel : props.onSearch}
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={props.searching ? 'is-open' : undefined}
            />
          </button>
        </div>
        <button
          type="button"
          className="ui-pick-icon"
          aria-label="Choose in the Library"
          data-tip="Choose in the Library"
          onClick={props.onLibrary}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="ui-pick-icon"
          aria-label="New free specification"
          data-tip="New free specification"
          onClick={props.onFree}
        >
          <SquareDashed size={14} />
        </button>
      </div>
    </div>
  );
}

/** A type and the specification it draws with now. */
export interface TypePick {
  readonly id: string;
  readonly caption: string;
  readonly code: string;
  readonly name: string;
}

/**
 * The drawing specification by type (owner 2026-11-07 §3 view 2): Point, Line, Area, Text side by
 * side, each a `PickButton`; while one is searched its list stands under the picks (the recent
 * first, then by code); Take over · Set at the foot.
 */
export function TypePicks(props: {
  types: readonly TypePick[];
  searching: string | null;
  query: string;
  onQuery: (query: string) => void;
  onSearch: (type: string) => void;
  onCancel: () => void;
  results: readonly ResultRow[];
  onLibrary: (type: string) => void;
  onFree: (type: string) => void;
  actions: readonly SlotTool[];
}): JSX.Element {
  return (
    <SlotGrid
      columns={4}
      actions={props.actions}
      below={
        props.searching ? (
          <ResultList
            label={`${props.types.find((t) => t.id === props.searching)?.caption ?? ''} specifications`}
            rows={props.results}
            empty="Nothing found"
          />
        ) : undefined
      }
    >
      <div className="ui-picks">
        {props.types.map((t) => (
          <PickButton
            key={t.id}
            caption={t.caption}
            code={t.code}
            name={t.name}
            searching={props.searching === t.id}
            query={props.searching === t.id ? props.query : ''}
            onQuery={props.onQuery}
            onSearch={() => props.onSearch(t.id)}
            onCancel={props.onCancel}
            onEnter={() => props.results[0]?.onSelect()}
            onLibrary={() => props.onLibrary(t.id)}
            onFree={() => props.onFree(t.id)}
          />
        ))}
      </div>
    </SlotGrid>
  );
}
