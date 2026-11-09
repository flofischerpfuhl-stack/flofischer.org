// Select by criteria (proposal 2026-11-07, not decided by the owner): the rows of the selection
// manager on the function panel's grid (UI-LIBRARY › Proposed: select by criteria). A condition is
// data — its key, its kind and what it matches — so a row cannot show a menu that does not fit its
// kind, a value without its key, or a heading that repeats the key.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from './Button.js';
import {
  Menu,
  MenuDivider,
  MenuItem,
  MenuRename,
  MenuScroll,
  MenuSearch,
  MenuSection,
  MenuSub,
} from './Menu.js';
import './field.css';
import './query.css';

/** A value a condition can match, with how many elements in the search have it. */
export interface QueryOption {
  readonly id: string;
  readonly label: string;
  /** A specification's code, before its name. */
  readonly code?: string | undefined;
  readonly count: number;
  /** The kinds of a type: the row checks them all, its submenu each. */
  readonly children?: readonly QueryOption[] | undefined;
}

interface ConditionBase {
  /** The row (several rows may search the same key). */
  readonly id: string;
  /** The key it searches (a `QueryKey` id): Add condition leaves keys in use out by this. */
  readonly key: string;
  /** The key's name: Type, Layer, an attribute's name. */
  readonly label: string;
  /** What to click while the value is taken from the view („Click an element"). */
  readonly picking?: string | undefined;
}

/**
 * One condition. `set`: one or more of the values that occur (Type, Layer, Specification, an
 * attribute); `pattern`: typed names or numbers with ranges and wildcards; `range`: a number between
 * two values, or none at all (Height).
 */
export type QueryCondition =
  | (ConditionBase & {
      readonly kind: 'set';
      readonly options: readonly QueryOption[];
      readonly values: readonly string[];
      readonly negate: boolean;
      /** What „is" and „is not" say for this key (Inside / Outside). */
      readonly matchLabels?: readonly [is: string, isNot: string] | undefined;
    })
  | (ConditionBase & {
      readonly kind: 'pattern';
      readonly text: string;
      readonly placeholder: string;
      readonly negate: boolean;
    })
  | (ConditionBase & {
      readonly kind: 'range';
      readonly min: string;
      readonly max: string;
      readonly unit: string;
      readonly match: 'between' | 'empty' | 'filled';
    });

export interface QueryPatch {
  readonly values?: readonly string[];
  readonly negate?: boolean;
  readonly text?: string;
  readonly min?: string;
  readonly max?: string;
  readonly match?: 'between' | 'empty' | 'filled';
}

/** A key the user can add as a condition; `keys` opens a submenu (the attributes). */
export interface QueryKey {
  readonly id: string;
  readonly label: string;
  readonly keys?: readonly QueryKey[] | undefined;
}

const RANGE_MATCH: readonly (readonly [QueryPatch['match'] & string, string])[] = [
  ['between', 'Between'],
  ['empty', 'Empty'],
  ['filled', 'Not empty'],
];
/** A menu longer than this gets a search on top (SelectField: more than ten). */
const SEARCH_FROM = 10;

/** What a condition's value reads: its values, or Any. */
function valueText(condition: QueryCondition): string {
  if (condition.kind === 'set') {
    const names: string[] = [];
    for (const option of condition.options) {
      const kids = option.children ?? [];
      if (kids.length > 0 && kids.every((kid) => condition.values.includes(kid.id)))
        names.push(option.label);
      else if (kids.length > 0)
        for (const kid of kids) {
          if (condition.values.includes(kid.id)) names.push(kid.label);
        }
      else if (condition.values.includes(option.id))
        names.push(option.code ? `${option.code} ${option.label}` : option.label);
    }
    // Values that no longer occur in the search still count (taken from a saved selection).
    const known = new Set(
      condition.options.flatMap((o) => [o.id, ...(o.children ?? []).map((k) => k.id)]),
    );
    names.push(...condition.values.filter((v) => !known.has(v)));
    return names.join(', ');
  }
  if (condition.kind === 'range') return '';
  return condition.text;
}

/**
 * The conditions of a search, one row each on the fields' grid (label column = the key), and
 * Add condition under them at the values' x. All rows must match; the values of one row are
 * alternatives. Every row's `>` holds: Match (is, is not; for a range: between, empty, not empty),
 * its values (a set), Take from (the selection, a click in the view), Remove.
 */
export function QueryConditions(props: {
  label: string;
  conditions: readonly QueryCondition[];
  /** The keys Add condition offers, in groups; a key already in use is left out. */
  keys: readonly { readonly title: string; readonly keys: readonly QueryKey[] }[];
  onChange: (id: string, patch: QueryPatch) => void;
  onAdd: (key: string) => void;
  onRemove: (id: string) => void;
  /** Take the selection's values; `disabled` says why not (nothing selected). */
  fromSelection: { readonly disabled?: string | undefined; readonly onTake: (id: string) => void };
  /** Take the value from a click in the view (null ends it). */
  onPick: (id: string | null) => void;
  /** Enter in a typed value does what the panel's one button does (Select). */
  onEnter: () => void;
}): JSX.Element {
  const used = new Set(props.conditions.map((c) => c.key));
  const [adding, setAdding] = useState<DOMRect | null>(null);
  const addRef = useRef<HTMLSpanElement>(null);
  const [query, setQuery] = useState('');
  const groups = props.keys
    .map((group) => ({
      ...group,
      keys: group.keys.filter((key) => key.keys !== undefined || !used.has(key.id)),
    }))
    .filter((group) => group.keys.length > 0);
  return (
    <>
      {props.conditions.map((condition) => (
        <ConditionRow
          key={condition.id}
          condition={condition}
          onChange={(patch) => props.onChange(condition.id, patch)}
          onRemove={() => props.onRemove(condition.id)}
          fromSelection={{
            disabled: props.fromSelection.disabled,
            onTake: () => props.fromSelection.onTake(condition.id),
          }}
          onPick={(on) => props.onPick(on ? condition.id : null)}
          onEnter={props.onEnter}
        />
      ))}
      <div className="ui-query-add" role="group" aria-label={props.label}>
        <span />
        <span className="ui-query-add-button" ref={addRef}>
          <Button
            onClick={() =>
              setAdding(adding ? null : (addRef.current?.getBoundingClientRect() ?? null))
            }
          >
            Add condition
          </Button>
        </span>
        <span />
      </div>
      {adding && (
        <Menu
          label="Add condition"
          x={adding.left}
          y={adding.bottom + 4}
          anchor={adding}
          onClose={() => {
            setAdding(null);
            setQuery('');
          }}
        >
          {groups.map((group, index) => (
            <div key={group.title} role="group" aria-label={group.title}>
              {index > 0 && <MenuDivider />}
              <MenuSection>{group.title}</MenuSection>
              {group.keys.map((key) =>
                key.keys ? (
                  <MenuSub key={key.id} label={key.label} menuLabel={key.label}>
                    {key.keys.length > SEARCH_FROM && (
                      <MenuSearch
                        label={`Find ${key.label.toLowerCase()}`}
                        value={query}
                        onChange={setQuery}
                      />
                    )}
                    <MenuScroll>
                      {key.keys
                        .filter((sub) =>
                          sub.label.toLowerCase().includes(query.trim().toLowerCase()),
                        )
                        .map((sub) => (
                          <MenuItem
                            key={sub.id}
                            disabled={used.has(sub.id)}
                            disabledReason="Already a condition"
                            onSelect={() => {
                              props.onAdd(sub.id);
                              setAdding(null);
                              setQuery('');
                            }}
                          >
                            {sub.label}
                          </MenuItem>
                        ))}
                    </MenuScroll>
                  </MenuSub>
                ) : (
                  <MenuItem
                    key={key.id}
                    onSelect={() => {
                      props.onAdd(key.id);
                      setAdding(null);
                    }}
                  >
                    {key.label}
                  </MenuItem>
                ),
              )}
            </div>
          ))}
        </Menu>
      )}
    </>
  );
}

function ConditionRow(props: {
  condition: QueryCondition;
  onChange: (patch: QueryPatch) => void;
  onRemove: () => void;
  fromSelection: { readonly disabled?: string | undefined; readonly onTake: () => void };
  onPick: (on: boolean) => void;
  onEnter: () => void;
}): JSX.Element {
  const { condition: c } = props;
  const [menu, setMenu] = useState<{ rect: DOMRect; keyboard: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const row = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const open = (keyboard: boolean) => {
    const rect = row.current?.getBoundingClientRect();
    if (rect) setMenu(menu ? null : { rect, keyboard });
  };
  const close = () => {
    setMenu(null);
    setSearch('');
  };
  const negate = c.kind !== 'range' && c.negate;
  const text = valueText(c);
  const [isLabel, notLabel] = (c.kind === 'set' && c.matchLabels) || ['Is', 'Is not'];
  const keys = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4') {
      event.preventDefault();
      event.stopPropagation();
      open(true);
    } else if (event.key === 'Escape' && c.picking) {
      event.preventDefault();
      props.onPick(false);
    } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      props.onEnter();
    } else if (event.key === 'Escape' && event.target instanceof HTMLInputElement) {
      // The field gives up the keyboard first; the next Esc goes on along the ladder.
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  let value: ReactNode;
  if (c.picking)
    value = (
      <span className="ui-query-value is-picking" role="status">
        {c.picking}
      </span>
    );
  else if (c.kind === 'set')
    value = (
      <button
        ref={(node) => {
          valueRef.current = node;
        }}
        type="button"
        className="ui-query-value"
        aria-label={`${c.label}: ${negate ? `${notLabel} ` : ''}${text || 'Any'}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        data-tip-overflow
        onClick={() => open(false)}
        onKeyDown={(event) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            props.onChange({ values: [] });
          } else keys(event);
        }}
      >
        {negate && <span className="ui-query-not">{notLabel}</span>}
        <span className={`ui-query-text${text ? '' : ' is-placeholder'}`}>{text || 'Any'}</span>
      </button>
    );
  else if (c.kind === 'pattern')
    value = (
      <span className="ui-query-value is-input">
        {negate && <span className="ui-query-not">{notLabel}</span>}
        <input
          ref={(node) => {
            valueRef.current = node;
          }}
          className="ui-query-input"
          aria-label={c.label}
          value={c.text}
          placeholder={c.placeholder}
          spellCheck={false}
          onChange={(event) => props.onChange({ text: event.target.value })}
          onKeyDown={keys}
        />
      </span>
    );
  else
    value =
      c.match === 'between' ? (
        <span className="ui-query-value is-range">
          <input
            className="ui-query-input is-number"
            aria-label={`${c.label} from`}
            inputMode="decimal"
            value={c.min}
            placeholder="Min"
            onChange={(event) => props.onChange({ min: event.target.value })}
            onKeyDown={keys}
          />
          <span className="ui-query-dash" aria-hidden>
            –
          </span>
          <input
            className="ui-query-input is-number"
            aria-label={`${c.label} to`}
            inputMode="decimal"
            value={c.max}
            placeholder="Max"
            onChange={(event) => props.onChange({ max: event.target.value })}
            onKeyDown={keys}
          />
          <span className="ui-query-unit">{c.unit}</span>
        </span>
      ) : (
        <button
          type="button"
          className="ui-query-value"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={() => open(false)}
          onKeyDown={keys}
        >
          <span className="ui-query-text">{RANGE_MATCH.find(([id]) => id === c.match)?.[1]}</span>
        </button>
      );

  // The values of a set, found by what is typed above them.
  const q = search.trim().toLowerCase();
  const hit = (o: QueryOption) =>
    !q || o.label.toLowerCase().includes(q) || (o.code ?? '').toLowerCase().startsWith(q);
  const flat = c.kind === 'set' ? c.options.flatMap((o) => [o, ...(o.children ?? [])]) : [];
  const toggle = (ids: readonly string[]) => {
    if (c.kind !== 'set') return;
    const on = ids.every((id) => c.values.includes(id));
    props.onChange({
      values: on ? c.values.filter((v) => !ids.includes(v)) : [...new Set([...c.values, ...ids])],
    });
  };
  const leafIds = (o: QueryOption) => (o.children?.length ? o.children.map((k) => k.id) : [o.id]);
  return (
    <div
      ref={row}
      className={`ui-inline-row is-select ui-query-row${menu ? ' is-open' : ''}`}
      data-field
      aria-label={c.label}
    >
      <span className="ui-inline-row-label" data-tip-overflow>
        {c.label}
      </span>
      {value}
      <span className="ui-inline-more-slot">
        <button
          type="button"
          className="ui-inline-more"
          aria-label={`${c.label}: more`}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          data-tip={menu ? undefined : 'Alternatives · Alt+↓'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => open(false)}
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </span>
      {menu && (
        <Menu
          label={c.label}
          x={menu.rect.left}
          y={menu.rect.bottom + 4}
          anchor={menu.rect}
          minWidth={menu.rect.width}
          focusFirst={menu.keyboard && !(c.kind === 'set' && flat.length > SEARCH_FROM)}
          returnFocus={valueRef.current}
          onClose={close}
        >
          {c.kind === 'range' ? (
            RANGE_MATCH.map(([id, label]) => (
              <MenuItem
                key={id}
                checked={c.match === id}
                onSelect={() => {
                  props.onChange({ match: id });
                  close();
                }}
              >
                {label}
              </MenuItem>
            ))
          ) : (
            <MenuSub label="Match" hint={negate ? notLabel : isLabel} menuLabel="Match">
              <MenuItem checked={!negate} onSelect={() => props.onChange({ negate: false })}>
                {isLabel}
              </MenuItem>
              <MenuItem checked={negate} onSelect={() => props.onChange({ negate: true })}>
                {notLabel}
              </MenuItem>
            </MenuSub>
          )}
          {c.kind === 'set' && (
            <>
              <MenuDivider />
              {flat.length > SEARCH_FROM && (
                <MenuSearch
                  label={`Find ${c.label.toLowerCase()}`}
                  placeholder={flat.some((o) => o.code) ? 'Code or name' : undefined}
                  value={search}
                  onChange={setSearch}
                />
              )}
              <MenuScroll>
                {c.options.length === 0 && (
                  <MenuItem disabled disabledReason="Not in this search" onSelect={() => undefined}>
                    None found
                  </MenuItem>
                )}
                {c.options.map((option) =>
                  option.children?.length && !q ? (
                    <MenuSub
                      key={option.id}
                      label={option.label}
                      menuLabel={option.label}
                      hint={String(option.count)}
                      checked={option.children.some((k) => c.values.includes(k.id))}
                      pale={
                        option.children.some((k) => c.values.includes(k.id)) &&
                        !option.children.every((k) => c.values.includes(k.id))
                      }
                      onSelect={() => toggle(leafIds(option))}
                    >
                      {option.children.map((kid) => (
                        <MenuItem
                          key={kid.id}
                          kind="checkbox"
                          checked={c.values.includes(kid.id)}
                          hint={String(kid.count)}
                          onSelect={() => toggle([kid.id])}
                        >
                          {kid.label}
                        </MenuItem>
                      ))}
                    </MenuSub>
                  ) : (
                    (option.children?.length ? option.children : [option])
                      .filter(hit)
                      .map((leaf) => (
                        <MenuItem
                          key={leaf.id}
                          kind="checkbox"
                          code={leaf.code}
                          checked={c.values.includes(leaf.id)}
                          hint={String(leaf.count)}
                          onSelect={() => toggle([leaf.id])}
                        >
                          {leaf.label}
                        </MenuItem>
                      ))
                  ),
                )}
              </MenuScroll>
              <MenuDivider />
              <MenuItem
                disabled={
                  flat.length === 0 ||
                  c.options.every((o) => leafIds(o).every((id) => c.values.includes(id)))
                }
                onSelect={() => props.onChange({ values: c.options.flatMap(leafIds) })}
              >
                All
              </MenuItem>
              <MenuItem
                disabled={c.values.length === 0}
                onSelect={() => props.onChange({ values: [] })}
              >
                None
              </MenuItem>
            </>
          )}
          <MenuDivider />
          {/* Take from (one group without a heading: the rows name it). */}
          <MenuItem
            disabled={props.fromSelection.disabled !== undefined}
            disabledReason={props.fromSelection.disabled}
            onSelect={() => {
              props.fromSelection.onTake();
              close();
            }}
          >
            From selection
          </MenuItem>
          {c.kind !== 'range' && (
            <MenuItem
              onSelect={() => {
                props.onPick(true);
                close();
              }}
            >
              Pick in view
            </MenuItem>
          )}
          <MenuDivider />
          <MenuItem
            onSelect={() => {
              props.onRemove();
              close();
            }}
          >
            Remove condition
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}

/** A saved search: its name and how many elements it finds now. */
export interface SavedQuery {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/**
 * The saved searches as the first row (RIB's named filters, Civil 3D's point groups): the loaded
 * one's name, or None; its `>` lists them with how many each finds now (a click loads it,
 * double-click or F2 renames in place), then Save as new, Update, Rename, Delete.
 */
export function QuerySaved(props: {
  saved: readonly SavedQuery[];
  loaded: string | null;
  /** The loaded search was changed since it was loaded or saved. */
  changed: boolean;
  /** Why the current search cannot be saved (no condition). */
  saveDisabled?: string | undefined;
  onLoad: (id: string) => void;
  /** Saves the current search under a new name; returns its id (it is renamed in place next). */
  onSave: () => string;
  onUpdate: () => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const loaded = props.saved.find((s) => s.id === props.loaded) ?? null;
  const open = () => {
    const rect = row.current?.getBoundingClientRect();
    if (rect) setMenu(menu ? null : rect);
  };
  return (
    <div
      ref={row}
      className={`ui-inline-row is-select ui-query-row${menu ? ' is-open' : ''}`}
      data-field
      aria-label="Saved"
    >
      <span className="ui-inline-row-label">Saved</span>
      <button
        ref={button}
        type="button"
        className="ui-query-value"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        aria-label={`Saved: ${loaded?.label ?? 'None'}`}
        data-tip-overflow
        onClick={open}
        onKeyDown={(event) => {
          if ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4') {
            event.preventDefault();
            event.stopPropagation();
            open();
          }
        }}
      >
        <span className={`ui-query-text${loaded ? '' : ' is-placeholder'}`}>
          {loaded?.label ?? 'None'}
        </span>
        {/* Changed since loaded or saved: a quiet dot after the name (VS Code's unsaved tab). */}
        {loaded && props.changed && (
          <span className="ui-query-changed" role="img" aria-label="Changed" data-tip="Changed">
            •
          </span>
        )}
      </button>
      <span className="ui-inline-more-slot">
        <button
          type="button"
          className="ui-inline-more"
          aria-label="Saved: more"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          data-tip={menu ? undefined : 'Alternatives · Alt+↓'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={open}
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </span>
      {menu && (
        <Menu
          label="Saved"
          x={menu.left}
          y={menu.bottom + 4}
          anchor={menu}
          minWidth={menu.width}
          returnFocus={button.current}
          onClose={() => {
            setMenu(null);
            setRenaming(null);
          }}
        >
          {props.saved.length > 0 && (
            <>
              <MenuScroll>
                {props.saved.map((saved) =>
                  renaming === saved.id ? (
                    <MenuRename
                      key={saved.id}
                      label={`Rename ${saved.label}`}
                      defaultValue={saved.label}
                      onCommit={(label) => {
                        if (label.trim()) props.onRename(saved.id, label.trim());
                        setRenaming(null);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <MenuItem
                      key={saved.id}
                      checked={saved.id === props.loaded}
                      hint={String(saved.count)}
                      onSelect={() => {
                        props.onLoad(saved.id);
                        setMenu(null);
                      }}
                      onDoubleClick={() => setRenaming(saved.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'F2') {
                          event.preventDefault();
                          setRenaming(saved.id);
                        }
                      }}
                    >
                      {saved.label}
                    </MenuItem>
                  ),
                )}
              </MenuScroll>
              <MenuDivider />
            </>
          )}
          <MenuItem
            disabled={props.saveDisabled !== undefined}
            disabledReason={props.saveDisabled}
            onSelect={() => setRenaming(props.onSave())}
          >
            Save as new
          </MenuItem>
          <MenuItem
            disabled={!loaded || !props.changed}
            disabledReason={loaded ? 'Not changed' : 'None loaded'}
            onSelect={() => {
              props.onUpdate();
              setMenu(null);
            }}
          >
            {loaded ? `Update ${loaded.label}` : 'Update'}
          </MenuItem>
          <MenuItem
            disabled={!loaded}
            disabledReason="None loaded"
            shortcut="F2"
            onSelect={() => loaded && setRenaming(loaded.id)}
          >
            Rename
          </MenuItem>
          <MenuItem
            disabled={!loaded}
            disabledReason="None loaded"
            onSelect={() => {
              if (loaded) props.onDelete(loaded.id);
              setMenu(null);
            }}
          >
            Delete
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}
