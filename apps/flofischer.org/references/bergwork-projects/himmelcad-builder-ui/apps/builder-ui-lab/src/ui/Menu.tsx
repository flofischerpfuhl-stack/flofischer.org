import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Pencil, Search } from 'lucide-react';
import { uiRoot, usePlacement, type AnchorRect } from './placement.js';
import { useSubmenu } from './submenu.js';
import { ResultList } from './Pick.js';
import './surface.css';
import './menu.css';

const ITEMS = '.ui-menu-item:not(:disabled), .ui-slot > button:first-child';

/**
 * Rules by construction (UI-LIBRARY › „Principle: rules by construction"): a menu row exists only
 * inside a menu. `Menu` and a submenu provide this; a row anywhere else renders nothing (owner round
 * 5: „Transform on export" was a menu row standing in a panel).
 */
const InMenu = createContext(false);
function useInMenu(row: string): boolean {
  const inMenu = useContext(InMenu);
  if (!inMenu) console.error(`${row} renders only inside a Menu`);
  return inMenu;
}
/** The rows the keys step through: this menu's own, not those of an open submenu. */
const ownItems = (menu: HTMLElement | null): HTMLElement[] =>
  [...(menu?.querySelectorAll<HTMLElement>(ITEMS) ?? [])].filter(
    (item) => item.closest('.ui-menu') === menu,
  );

/** ↑/↓, Home/End and type-ahead over a menu's own rows (a submenu steps its own). */
function stepMenu(menu: HTMLElement | null, event: KeyboardEvent<HTMLDivElement>): void {
  if (event.target instanceof HTMLInputElement) return;
  const items = ownItems(menu);
  const index = items.indexOf(document.activeElement as HTMLElement);
  const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
  if (event.key === 'ArrowDown') focus(index + 1);
  else if (event.key === 'ArrowUp') focus(index < 0 ? items.length - 1 : index - 1);
  else if (event.key === 'Home') focus(0);
  else if (event.key === 'End') focus(items.length - 1);
  else if (event.key.length === 1 && /\S/.test(event.key)) {
    const letter = event.key.toLowerCase();
    const order = [...items.slice(index + 1), ...items.slice(0, index + 1)];
    order.find((item) => item.textContent?.trim().toLowerCase().startsWith(letter))?.focus();
  } else return;
  event.preventDefault();
  event.stopPropagation();
}

/**
 * A menu or dropdown (UI-REVIEW-REFERENCE §8, §8a): portalled into the window and kept inside it.
 * A context menu opens at `x`/`y`; a dropdown passes its field as `anchor` and stays at it.
 * Closes on any outside press — except a press on its own trigger (`aria-haspopup` with
 * `aria-expanded="true"`), whose click toggles it shut — and on Esc, which hands the keyboard back
 * to `returnFocus`. Keys: ↑/↓, Home/End, type-ahead by first letter, Enter/Space.
 */
export function Menu(props: {
  label: string;
  /** Pointer position of a context menu (ignored when `attached`). */
  x?: number | undefined;
  y?: number | undefined;
  /**
   * Attached to its trigger instead of floating, 8 px off it: `above` (the status bar's menus,
   * owner 2026-10-20) or `below` (the workspace choice). Not portalled; it hangs on the trigger's
   * positioned wrapper, at its left edge.
   */
  attached?: 'above' | 'below' | undefined;
  /** Attached: where it lines up with its trigger (start by default). */
  align?: 'start' | 'center' | 'end' | undefined;
  /** A grid of tiles rather than rows (the specification slots): wider, a dialog. */
  wide?: boolean | undefined;
  role?: 'menu' | 'dialog' | undefined;
  id?: string | undefined;
  anchor?: AnchorRect | undefined;
  /** A dropdown is at least as wide as its field. */
  minWidth?: number | undefined;
  /** The first enabled item takes the keyboard on open (opened from the keyboard). */
  focusFirst?: boolean | undefined;
  /** Where the keyboard goes back to on Esc (the trigger or the field). */
  returnFocus?: HTMLElement | null | undefined;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const placement = usePlacement(ref, props.x ?? 0, props.y ?? 0, props.anchor, !props.attached);
  const { onClose, returnFocus, focusFirst } = props;
  useEffect(() => {
    if (focusFirst) ownItems(ref.current)[0]?.focus();
  }, [focusFirst]);
  useEffect(() => {
    // An attached menu is opened and closed by its owner (the status bar's own outside press).
    if (props.attached) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Element;
      if (ref.current?.contains(target)) return;
      if (target.closest?.('[aria-haspopup][aria-expanded="true"]')) return;
      onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
      returnFocus?.focus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [onClose, returnFocus, props.attached]);
  const menu = (
    <div
      ref={ref}
      id={props.id}
      className={`ui-surface is-popover ui-menu${props.attached ? ` is-attached is-${props.attached}` : ''}${
        props.align && props.align !== 'start' ? ` is-align-${props.align}` : ''
      }${props.wide ? ' is-wide' : ''}`}
      role={props.role ?? 'menu'}
      aria-label={props.label}
      style={props.attached ? undefined : { ...placement, minWidth: props.minWidth }}
      onKeyDown={(event) => stepMenu(ref.current, event)}
    >
      <InMenu.Provider value>
        <MenuHeadings>{props.children}</MenuHeadings>
      </InMenu.Provider>
    </div>
  );
  return props.attached ? menu : createPortal(menu, uiRoot());
}

/**
 * One menu row. `checked` makes it a choice with the trailing check column (always the framed
 * check): `kind="radio"` for one of several (default), `kind="checkbox"` for on/off — the kind is
 * the accessible role only. `pale`: a parent whose items are partly on.
 */
export function MenuItem(props: {
  /** The click comes with it (Ctrl/Shift add to a choice; a second click may rename). */
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (() => void) | undefined;
  /** Row keys (F2 renames). */
  onKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
  disabled?: boolean | undefined;
  /** Why it is unavailable (tooltip); unavailable items stay in the menu. */
  disabledReason?: string | undefined;
  /** A name for what the label abbreviates (tooltip), never an explanation. */
  tip?: string | undefined;
  /** A meaningful icon in its own column before the label. */
  icon?: ReactNode | undefined;
  /** The key, quiet at the row's end. */
  shortcut?: string | undefined;
  checked?: boolean | undefined;
  kind?: 'radio' | 'checkbox' | undefined;
  pale?: boolean | undefined;
  /** Quiet text at the row's end (a recent value's unit). */
  hint?: string | undefined;
  /** A code column before the label (specifications). */
  code?: string | undefined;
  highlighted?: boolean | undefined;
  /** Keep the keyboard where it is (field menus: typing goes on into the field). */
  keepFocus?: boolean | undefined;
  /** Quiet: a state that lies ahead (a redo step). */
  muted?: boolean | undefined;
  /** A glyph in the trailing column instead of a check (the parts' four-level glyph). */
  trailing?: ReactNode | undefined;
  /** The accessible name when it says more than the label (its state). */
  ariaLabel?: string | undefined;
  /**
   * The row opens a window rather than choosing or doing something at once: its name ends in „…"
   * (the library's way, as Choose folder…), and it says it opens a dialog.
   */
  opens?: 'window' | undefined;
  children: ReactNode;
}): JSX.Element | null {
  const inMenu = useInMenu('MenuItem');
  const choice = props.checked !== undefined;
  if (!inMenu) return null;
  const role = !choice
    ? 'menuitem'
    : props.kind === 'checkbox'
      ? 'menuitemcheckbox'
      : 'menuitemradio';
  return (
    <button
      type="button"
      role={role}
      aria-checked={choice ? props.checked : undefined}
      aria-haspopup={props.opens ? 'dialog' : undefined}
      className={`ui-menu-item${props.highlighted ? ' is-highlighted' : ''}${props.muted ? ' is-muted' : ''}`}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      data-tip={props.disabled ? props.disabledReason : props.tip}
      onMouseDown={props.keepFocus ? (event) => event.preventDefault() : undefined}
      onClick={props.onSelect}
      onDoubleClick={props.onDoubleClick}
      onKeyDown={props.onKeyDown}
    >
      {props.icon}
      {props.code !== undefined && <span className="ui-menu-code">{props.code}</span>}
      <span className="ui-menu-label" data-tip-overflow>
        {props.children}
        {props.opens && '…'}
      </span>
      {props.hint && <span className="ui-menu-hint">{props.hint}</span>}
      {props.shortcut && <kbd>{props.shortcut}</kbd>}
      {props.trailing}
      {choice && <CheckMark checked={props.checked ?? false} pale={props.pale} />}
    </button>
  );
}

/**
 * A row that opens a submenu (`children`): hover opens it, the safe triangle keeps it on the way,
 * → and ← open and close it from the keyboard. The row itself may be an on/off item for all its
 * children (Angle over its steps: `checked`, `pale` when only some are on, `onSelect` all/none).
 */
export function MenuSub(props: {
  label: string;
  icon?: ReactNode | undefined;
  checked?: boolean | undefined;
  pale?: boolean | undefined;
  onSelect?: (() => void) | undefined;
  /** The submenu's id (its `aria-controls`) and name. */
  id?: string | undefined;
  menuLabel?: string | undefined;
  /** What is chosen in the submenu, quiet before the check (proposal 2026-11-06: Code + Name). */
  hint?: string | undefined;
  children: ReactNode;
}): JSX.Element | null {
  const inMenu = useInMenu('MenuSub');
  const sub = useSubmenu();
  const row = useRef<HTMLButtonElement>(null);
  const choice = props.checked !== undefined;
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    event.stopPropagation();
    sub.setOpen(true);
    requestAnimationFrame(() =>
      sub.panel.current?.querySelector<HTMLElement>('.ui-menu-item:not(:disabled)')?.focus(),
    );
  };
  if (!inMenu) return null;
  return (
    <div
      ref={sub.anchor}
      className="ui-menu-sub-anchor"
      onPointerEnter={sub.enter}
      onPointerLeave={sub.leave}
    >
      <button
        ref={row}
        type="button"
        className="ui-menu-item"
        role={choice ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={choice ? (props.pale ? 'mixed' : props.checked) : undefined}
        aria-haspopup="menu"
        aria-expanded={sub.open}
        aria-controls={props.id}
        onClick={props.onSelect ?? (() => sub.setOpen(!sub.open))}
        onKeyDown={keys}
      >
        {props.icon}
        <span className="ui-menu-label">{props.label}</span>
        {props.hint && <span className="ui-menu-hint">{props.hint}</span>}
        {/* One trailing slot (owner 2026-11-07: „der >-Pfeil hinter den Checkboxes ist dumm, weil
            der bei allen, die das nicht haben, unnötig leere Fläche erzeugt"): a row with a check
            keeps the check there and shows its › just before it; the other rows keep nothing
            free. */}
        <ChevronRight size={14} className={`ui-menu-more${choice ? ' is-before-check' : ''}`} />
        {choice && <CheckMark checked={props.checked ?? false} pale={props.pale} />}
      </button>
      {sub.open && (
        <div
          ref={sub.panel}
          id={props.id}
          className={`ui-surface is-popover ui-menu ui-menu-sub is-${sub.side}`}
          role="menu"
          aria-label={props.menuLabel ?? props.label}
          style={{ translate: `0 ${sub.shift}px` }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              event.stopPropagation();
              sub.setOpen(false);
              row.current?.focus();
            } else stepMenu(sub.panel.current, event);
          }}
        >
          <InMenu.Provider value>
            <MenuHeadings>{props.children}</MenuHeadings>
          </InMenu.Provider>
        </div>
      )}
    </div>
  );
}

/**
 * The trailing check column of a menu row: the first two levels of the one check glyph — a pale
 * frame, with a check when chosen — for every choice, on/off and one of several alike (owner
 * 2026-11-06: „Rahmen immer, Linie = Stufe"; „warum haben wir da jetzt wieder Checkboxes ohne
 * Rahmen?"; the lists' StateGlyph has all four levels). `pale`: a parent whose items are partly on.
 */
export function CheckMark(props: { checked: boolean; pale?: boolean | undefined }): JSX.Element {
  return (
    <span className={`ui-check${props.pale ? ' is-pale' : ''}`} aria-hidden="true">
      {props.checked && <Check size={13} strokeWidth={2} />}
    </span>
  );
}

/**
 * The headings of one menu (or submenu) count themselves: a heading shows only when the menu has
 * two or more groups — a menu of one group is named by its trigger, not by a heading
 * (UI-LIBRARY › Principle: rules by construction; owner 2026-11-06 on field menus).
 */
const Headings = createContext<{ readonly register: () => () => void; readonly show: boolean }>({
  register: () => () => undefined,
  show: true,
});
function MenuHeadings(props: { children: ReactNode }): JSX.Element {
  const [count, setCount] = useState(0);
  const register = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ register, show: count >= 2 }), [register, count]);
  return <Headings.Provider value={value}>{props.children}</Headings.Provider>;
}

/**
 * A group heading in a menu: says what the rows below are (never a title repeating the chip).
 * Shown only in a menu with two or more groups.
 */
export function MenuSection(props: { children: ReactNode }): JSX.Element | null {
  const { register, show } = useContext(Headings);
  useLayoutEffect(register, [register]);
  return show ? <div className="ui-menu-section">{props.children}</div> : null;
}

/** A horizontal line between groups; menus have no vertical lines. */
export function MenuDivider(): JSX.Element {
  return <div className="ui-menu-divider" role="separator" />;
}

/**
 * A menu of on/off items (owner 2026-11-06): a heading says what the checks mean, the items, and
 * below a divider All / None — each disabled when it would change nothing.
 */
export function CheckMenuItems(props: {
  heading: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** A menu that goes on with more rows leaves All / None out. */
  allNone?: boolean | undefined;
}): JSX.Element {
  const { options, selected, onChange } = props;
  return (
    <>
      <MenuSection>{props.heading}</MenuSection>
      {options.map((option) => (
        <MenuItem
          key={option}
          kind="checkbox"
          checked={selected.includes(option)}
          onSelect={() =>
            onChange(
              selected.includes(option)
                ? selected.filter((value) => value !== option)
                : [...selected, option],
            )
          }
        >
          {option}
        </MenuItem>
      ))}
      {props.allNone !== false && (
        <>
          <MenuDivider />
          <MenuItem
            disabled={selected.length === options.length}
            onSelect={() => onChange([...options])}
          >
            All
          </MenuItem>
          <MenuItem disabled={selected.length === 0} onSelect={() => onChange([])}>
            None
          </MenuItem>
        </>
      )}
    </>
  );
}

/**
 * A row of a searchable picker with a second line (proposal 2026-11-06, design/chats; after
 * Fernwork's CRS picker): the name, its code at the end, what it covers underneath, the check of
 * the current value in the check column.
 */
export function MenuOption(props: {
  label: string;
  code?: string | undefined;
  /** The second line, quiet (region, use). */
  hint?: string | undefined;
  checked?: boolean | undefined;
  highlighted?: boolean | undefined;
  onSelect: () => void;
}): JSX.Element | null {
  if (!useInMenu('MenuOption')) return null;
  return (
    <button
      type="button"
      role={props.checked !== undefined ? 'menuitemradio' : 'menuitem'}
      aria-checked={props.checked}
      className={`ui-menu-item is-option${props.highlighted ? ' is-highlighted' : ''}`}
      onClick={props.onSelect}
    >
      <span className="ui-menu-option">
        <span className="ui-menu-option-line">
          <span className="ui-menu-label">{props.label}</span>
          {props.code && <span className="ui-menu-option-code">{props.code}</span>}
        </span>
        {props.hint && <span className="ui-menu-option-hint">{props.hint}</span>}
      </span>
      {props.checked !== undefined && <CheckMark checked={props.checked} />}
    </button>
  );
}

/** The search field on top of a long dropdown (more than ten entries). */
export function MenuSearch(props: {
  label: string;
  /** What can be typed (CRS: EPSG or name); default Search. */
  placeholder?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;
}): JSX.Element {
  return (
    <div className="ui-menu-search">
      <Search size={14} />
      <input
        autoFocus
        aria-label={props.label}
        placeholder={props.placeholder ?? 'Search'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
    </div>
  );
}

/** A long list in a menu (history): about twelve rows, then it scrolls. */
export function MenuScroll(props: {
  label?: string | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-menu-scroll is-long" role={props.label ? 'tabpanel' : undefined}>
      {props.children}
    </div>
  );
}

/**
 * Vertical tabs beside a menu's list, like the side panels' rail (History: All, Content, Selection
 * …). A tab that is not there yet stays, disabled, with its reason.
 */
export function MenuTabs(props: {
  label: string;
  tabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly icon: ReactNode;
    readonly disabled?: string | undefined;
  }[];
  value: string;
  onChange: (id: string) => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-menu-tabbed">
      <div
        className="ui-menu-tabs"
        role="tablist"
        aria-orientation="vertical"
        aria-label={props.label}
      >
        {props.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`ui-menu-tab${props.value === tab.id ? ' is-on' : ''}`}
            aria-label={tab.label}
            aria-selected={props.value === tab.id}
            disabled={tab.disabled !== undefined}
            data-tip={tab.disabled ?? tab.label}
            onClick={() => props.onChange(tab.id)}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      {props.children}
    </div>
  );
}

/**
 * Rename a menu row in place (views, camera positions): the same text position, a thin neutral
 * frame. Enter commits, Esc cancels (the menu stays open); `trailing` keeps the row's own end.
 */
export function MenuRename(props: {
  label: string;
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  trailing?: ReactNode | undefined;
}): JSX.Element {
  let done = false;
  return (
    <div className="ui-menu-item is-renaming">
      <input
        className="ui-menu-rename"
        aria-label={props.label}
        defaultValue={props.defaultValue}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          if (!done) props.onCommit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            done = true;
            props.onCommit(event.currentTarget.value);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            done = true;
            props.onCancel();
          }
        }}
      />
      {props.trailing}
    </div>
  );
}

/** Find or create above a slot grid (proposal 2026-11-06): what is typed finds by code and name. */
export interface SlotSearch {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** What the words find, a code and a name each; shown instead of the tiles while typing. */
  readonly results: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly onSelect: () => void;
  }[];
  /** The last row while typing: make what was typed (New free „…"). */
  readonly create: { readonly label: string; readonly onSelect: () => void };
  /** The results show before anything is typed (a type's list: the recent first, then by code). */
  readonly browse?: boolean | undefined;
  /** Esc in the empty field leaves the search (back to the tiles). */
  readonly onCancel?: (() => void) | undefined;
}

/** A choice in a foot button's options (right-click: single elements or the selection). */
export interface SlotOption {
  readonly label: string;
  readonly checked: boolean;
  readonly onSelect: () => void;
}
/** An icon button at a slot grid's foot; its options open on right-click (or on click when it has
 * no action of its own: the grid's size). */
export interface SlotTool {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onSelect?: (() => void) | undefined;
  readonly options?: readonly SlotOption[] | undefined;
}

/**
 * Numbered tiles (the drawing specification's slots), in a menu or a panel: `columns` per row,
 * pages ‹ n / m ›, icon tools at the foot's start (Pop out, the grid's size) and icon actions at
 * its end (Take over · Set, owner 2026-11-07 S13: „bekommen natürlich Icons wie in RIB Civil";
 * right-click: single elements or the selection). With `search`, a search above at the tiles'
 * spacing; while something is typed its results replace the tiles (codes on the names' line, the
 * create row last), Enter takes the first. It needs no menu around it (the pinned slots search
 * too, owner: search „auch für 1.").
 */
export function SlotGrid(props: {
  search?: SlotSearch | undefined;
  columns?: number | undefined;
  pages?:
    | { readonly page: number; readonly count: number; readonly onPage: (page: number) => void }
    | undefined;
  tools?: readonly SlotTool[] | undefined;
  actions?: readonly SlotTool[] | undefined;
  /** Between the tiles and the foot (a pick's result list). */
  below?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const { search, pages } = props;
  const [options, setOptions] = useState<{ tool: SlotTool; end: boolean } | null>(null);
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!options) return;
    const away = (event: PointerEvent) => {
      if (!foot.current?.contains(event.target as Node)) setOptions(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOptions(null);
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [options]);
  const button = (tool: SlotTool, end: boolean) => (
    <button
      key={tool.label}
      type="button"
      className={`ui-slots-page${options?.tool === tool ? ' is-open' : ''}`}
      aria-label={tool.label}
      aria-haspopup={tool.options ? 'menu' : undefined}
      aria-expanded={tool.options ? options?.tool === tool : undefined}
      data-tip={tool.options && tool.onSelect ? `${tool.label} · right-click: options` : tool.label}
      onClick={() => {
        if (tool.onSelect) tool.onSelect();
        else if (tool.options) setOptions(options?.tool === tool ? null : { tool, end });
      }}
      onContextMenu={(event) => {
        if (!tool.options) return;
        event.preventDefault();
        setOptions({ tool, end });
      }}
    >
      {tool.icon}
    </button>
  );
  const grid = (
    <div
      className="ui-slots"
      style={props.columns ? { gridTemplateColumns: `repeat(${props.columns}, 1fr)` } : undefined}
    >
      {props.children}
    </div>
  );
  const footer =
    (pages && pages.count > 1) || props.actions?.length || props.tools?.length ? (
      <div ref={foot} className="ui-slots-foot">
        <span className="ui-slots-start">
          {props.tools?.map((tool) => button(tool, false))}
          {pages && pages.count > 1 ? (
            <span className="ui-slots-pages">
              <button
                type="button"
                className="ui-slots-page"
                aria-label="Previous page"
                data-tip="Previous page"
                disabled={pages.page === 0}
                onClick={() => pages.onPage(pages.page - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span>{`${pages.page + 1} / ${pages.count}`}</span>
              <button
                type="button"
                className="ui-slots-page"
                aria-label="Next page"
                data-tip="Next page"
                disabled={pages.page >= pages.count - 1}
                onClick={() => pages.onPage(pages.page + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </span>
          ) : null}
        </span>
        <span className="ui-slots-start">{props.actions?.map((tool) => button(tool, true))}</span>
        {options?.tool.options && (
          <div
            className={`ui-surface is-popover ui-slots-options${options.end ? ' is-end' : ''}`}
            role="menu"
            aria-label={options.tool.label}
          >
            {options.tool.options.map((o) => (
              <button
                key={o.label}
                type="button"
                role="menuitemradio"
                aria-checked={o.checked}
                className="ui-menu-item"
                onClick={() => {
                  o.onSelect();
                  setOptions(null);
                }}
              >
                <span className="ui-menu-label">{o.label}</span>
                <CheckMark checked={o.checked} />
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null;
  if (search === undefined)
    return footer || props.below ? (
      <div className="ui-slots-searched">
        {grid}
        {props.below}
        {footer}
      </div>
    ) : (
      grid
    );
  const typed = search.value.trim();
  const rows = [
    ...search.results.map((r) => ({ id: r.id, code: r.code, name: r.name, onSelect: r.onSelect })),
    { id: '+create', code: '', name: search.create.label, onSelect: search.create.onSelect },
  ];
  return (
    <div className="ui-slots-searched">
      <MenuSearch
        label={search.label}
        placeholder={search.placeholder}
        value={search.value}
        onChange={search.onChange}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !typed && search.onCancel) {
            event.preventDefault();
            event.stopPropagation();
            search.onCancel();
            return;
          }
          if (event.key !== 'Enter' || !typed) return;
          event.preventDefault();
          (search.results[0] ?? search.create).onSelect();
        }}
      />
      {typed || search.browse ? (
        // Results as rows of their own (no menu needed): code on the name's line.
        <ResultList label={search.label} rows={rows} />
      ) : (
        <>
          {grid}
          {footer}
        </>
      )}
    </div>
  );
}

/** One slot: its number and what it holds; the pencil assigns it. */
export function Slot(props: {
  /** Its number in the grid, or what it stands for (a type: Point, Line …) in its place. */
  number: number | string;
  label: string;
  active: boolean;
  /** Accessible names of the slot and of its pencil. */
  useLabel: string;
  editLabel: string;
  editTip: string;
  onUse: () => void;
  onEdit: () => void;
}): JSX.Element {
  return (
    <div className={`ui-slot${props.active ? ' is-on' : ''}`}>
      <button aria-label={props.useLabel} aria-pressed={props.active} onClick={props.onUse}>
        <span className={`ui-slot-number${typeof props.number === 'string' ? ' is-name' : ''}`}>
          {props.number}
        </span>
        <span className="ui-slot-label" data-tip-overflow>
          {props.label}
        </span>
      </button>
      <button
        className="ui-slot-edit"
        aria-label={props.editLabel}
        data-tip={props.editTip}
        onClick={props.onEdit}
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

/** A slot's assignment below the grid: a heading and its choices in two columns. */
export function SlotAssignment(props: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="ui-slot-assignment" role="group" aria-label={props.label}>
      {props.children}
    </div>
  );
}
