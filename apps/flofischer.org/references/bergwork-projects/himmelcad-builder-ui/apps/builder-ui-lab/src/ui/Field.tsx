import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ChevronRight, Lock, TriangleAlert } from 'lucide-react';
import { Button, CopyButton } from './Button.js';
import { FIELD_MENU_ORDER, FIELD_MENU_TITLE, type FieldMenuGroup } from './fieldMenu.js';
import { CheckMark, Menu, MenuDivider, MenuItem, MenuSearch, MenuSection } from './Menu.js';
import './button.css';
import './section.css';
import './field.css';

/** Lists longer than this get a search field and scroll (owner 2026-10-22). */
const SEARCH_FROM = 10;

/* ================================ Properties: label column ================================== */

/**
 * Free text or a number in Properties (label column): commits on Enter or when the field is left;
 * Esc restores the value and never commits through the blur it causes. Tab moves on (and commits).
 */
export function TextField(props: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  /** Several elements with different values: empty, „Mixed" as placeholder. */
  mixed?: boolean | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  mono?: boolean | undefined;
  placeholder?: string | undefined;
  /**
   * The value is being picked in the view (owner 2026-10-24): focus starts it (`onFocus`), a click in
   * the view takes the value — so leaving the field for the view does not end it. `onDone` ends it:
   * Enter, Esc, or a typed value committed.
   */
  picking?: boolean | undefined;
  onFocus?: (() => void) | undefined;
  onDone?: (() => void) | undefined;
  /** Off: only Enter commits, leaving the field keeps the value (a vertex's point name). */
  commitOnBlur?: boolean | undefined;
  /** An auxiliary point's name. */
  italic?: boolean | undefined;
  /** A name for the field's state (tooltip), never an explanation. */
  tip?: string | undefined;
}): JSX.Element {
  const shown = props.mixed ? '' : props.value;
  const [text, setText] = useState(shown);
  const cancelled = useRef(false);
  useEffect(() => setText(shown), [shown]);
  const commitOnBlur = props.commitOnBlur ?? true;
  const cls = `ui-field${props.mono ? ' is-mono' : ''}${props.picking ? ' is-picking' : ''}${props.italic ? ' is-italic' : ''}`;
  const commit = () => {
    const next = text.trim();
    if (!next || next === shown) return false;
    // A typed value wins: the click that moved the focus does not overwrite it.
    props.onCommit(next);
    // The field shows what holds: a refused value (a point number that exists) goes back; an
    // accepted one arrives as the new value.
    setText(shown);
    return true;
  };
  return (
    <input
      className={cls}
      aria-label={props.label}
      value={text}
      placeholder={props.mixed ? 'Mixed' : props.placeholder}
      disabled={props.disabled}
      data-tip={props.disabled ? props.disabledReason : props.tip}
      onChange={(event) => setText(event.target.value)}
      onFocus={(event) => {
        event.currentTarget.select();
        props.onFocus?.();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          if (!commitOnBlur && commit()) cancelled.current = true;
          event.currentTarget.blur();
          props.onDone?.();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelled.current = true;
          setText(shown);
          event.currentTarget.blur();
          props.onDone?.();
        }
      }}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (!commitOnBlur) return;
        if (commit()) props.onDone?.();
        else setText(shown);
      }}
    />
  );
}

/**
 * A fixed choice in Properties: the value and a `>` segment behind a divider; a click opens the
 * app's menu with a check on the value. More than ten options: a search field, about eight rows,
 * scrolling; ↑/↓ highlight, Enter takes it. Options may carry a code (specifications).
 */
export function SelectField<T extends string>(props: {
  label: string;
  value: T | null;
  /** Several elements with different values. */
  mixed?: boolean | undefined;
  options: readonly (readonly [value: T, label: string, code?: string])[];
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
  /** Why it is disabled (tooltip; a value the specification sets). */
  disabledReason?: string | undefined;
  /**
   * The `>` leads somewhere else than the list (the specification's library window, owner
   * 2026-11-06): it becomes a button of its own; a click on the value still opens the list.
   */
  more?: { readonly label: string; readonly onClick: () => void } | undefined;
  /**
   * The field takes its value from an element clicked in the view (the active frame stays while
   * the list is closed again); `onOpen` starts that when the list opens.
   */
  picking?: boolean | undefined;
  onOpen?: (() => void) | undefined;
  /** The list closed by a second click on the field: taking from the view ends too. */
  onDone?: (() => void) | undefined;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = props.options.find(([value]) => value === props.value);
  const searchable = props.options.length > SEARCH_FROM;
  const coded = props.options.some(([, , code]) => code !== undefined);
  const shown = props.options.filter(([, label, code]) =>
    `${code ?? ''} ${label}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const choose = (value: T) => {
    setMenu(null);
    if (value !== props.value) props.onChange(value);
  };
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(navigated ? '.is-highlighted' : '[aria-checked="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [menu, active, navigated]);
  const step = (delta: number) => {
    const from = navigated ? active : shown.findIndex(([value]) => value === props.value);
    setActive(Math.max(0, Math.min(shown.length - 1, (from < 0 ? -delta : from) + delta)));
    setNavigated(true);
  };
  const field = (
    <button
      ref={button}
      type="button"
      className={`ui-field is-select${props.picking ? ' is-picking' : ''}`}
      aria-label={props.label}
      aria-haspopup="menu"
      aria-expanded={!!menu}
      aria-controls={menu ? menuId : undefined}
      disabled={props.disabled}
      data-tip={props.disabled ? props.disabledReason : undefined}
      onClick={(event) => {
        if (menu) {
          setMenu(null);
          props.onDone?.();
          return;
        }
        setQuery('');
        setActive(0);
        setNavigated(false);
        setMenu(event.currentTarget.getBoundingClientRect());
        props.onOpen?.();
      }}
    >
      <span className={`ui-field-value${props.mixed ? ' is-mixed' : ''}`}>
        {!props.mixed && current?.[2] && <span className="ui-menu-code">{current[2]}</span>}
        {props.mixed ? 'Mixed' : (current?.[1] ?? props.value)}
      </span>
      <span className="ui-field-more" aria-hidden>
        <ChevronRight size={14} strokeWidth={2} />
      </span>
    </button>
  );
  return (
    <>
      {props.more ? (
        <span className="ui-field-wrap">
          {field}
          <button
            type="button"
            className="ui-field-more-button"
            aria-label={props.more.label}
            data-tip={props.more.label}
            disabled={props.disabled}
            onClick={props.more.onClick}
          />
        </span>
      ) : (
        field
      )}
      {menu && (
        <Menu
          id={menuId}
          label={props.label}
          x={menu.left}
          y={menu.bottom + 4}
          anchor={menu}
          minWidth={menu.width}
          returnFocus={button.current}
          focusFirst={!searchable}
          onClose={() => setMenu(null)}
        >
          {searchable && (
            <MenuSearch
              label={`Search ${props.label.toLowerCase()}`}
              value={query}
              onChange={(value) => {
                setQuery(value);
                setActive(0);
                setNavigated(value.trim() !== '');
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  step(event.key === 'ArrowDown' ? 1 : -1);
                }
                const pick = shown[active];
                if (event.key === 'Enter' && navigated && pick) choose(pick[0]);
              }}
            />
          )}
          <div ref={list} className={searchable ? 'ui-menu-scroll is-compact' : 'ui-menu-scroll'}>
            {shown.map(([value, label, code], index) => (
              <MenuItem
                key={value}
                checked={value === props.value}
                code={coded ? (code ?? '') : undefined}
                highlighted={navigated && index === active}
                onSelect={() => choose(value)}
              >
                {label}
              </MenuItem>
            ))}
            {shown.length === 0 && <div className="ui-menu-empty">Nothing matches “{query}”</div>}
          </div>
        </Menu>
      )}
    </>
  );
}

/**
 * A field whose choice opens a picker of the app's own (proposal 2026-11-06: the coordinate system
 * picker): the SelectField's look — value, code in its quiet column, the `>` segment — but the
 * owner places the menu. Empty shows the placeholder, quiet.
 */
export function PickerField(props: {
  label: string;
  value: string | null;
  code?: string | undefined;
  placeholder?: string | undefined;
  open?: boolean | undefined;
  /** `menuId` is the id the owner's Menu takes (the field's `aria-controls`). */
  onOpen: (anchor: DOMRect, trigger: HTMLButtonElement, menuId: string) => void;
}): JSX.Element {
  const menuId = useId();
  return (
    <button
      type="button"
      className="ui-field is-select"
      aria-label={props.label}
      aria-haspopup="menu"
      aria-expanded={props.open ?? false}
      aria-controls={props.open ? menuId : undefined}
      onClick={(event) =>
        props.onOpen(event.currentTarget.getBoundingClientRect(), event.currentTarget, menuId)
      }
    >
      <span className={`ui-field-value${props.value === null ? ' is-placeholder' : ''}`}>
        {props.value !== null && props.code && <span className="ui-menu-code">{props.code}</span>}
        {props.value ?? props.placeholder ?? 'Choose'}
      </span>
      <span className="ui-field-more" aria-hidden>
        <ChevronRight size={14} strokeWidth={2} />
      </span>
    </button>
  );
}

/* ================================ Function panel: label inside ============================== */

/**
 * The column of fields of a function (Figma's inspector on the Properties grammar): the step as
 * the head with its quiet actions (IconButton size="tool"), the choice that decides which fields
 * exist (`modes`, Segmented without a label), the fields, and the one Button that Enter does.
 */
export function Fields(props: {
  /** What the function waits for: "First point", "Point 3". */
  step: string;
  tools?: ReactNode | undefined;
  modes?: ReactNode | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="ui-section is-top ui-fields">
      <header className="ui-fields-head">
        <h3 className="ui-fields-title">{props.step}</h3>
        {props.tools && <div className="ui-fields-tools">{props.tools}</div>}
      </header>
      {props.modes && <div className="ui-fields-modes">{props.modes}</div>}
      {props.children}
    </section>
  );
}

/**
 * A value field that holds its label (function panel). Digits end on one x over every row; the
 * lock and the unit have slots of their own, so nothing moves when a value locks. The field that
 * takes the typing is `active` (the neutral active frame); a typed value is `locked` (bright).
 * Keys: Tab / Shift+Tab → `onTab`, Enter → `onEnter`, Esc → `onEscape` (while picking:
 * `onCancelPick`), Alt+↓ or F4 opens the `>` menu.
 */
export function InlineField(props: {
  label: string;
  value: string;
  unit: string;
  active?: boolean | undefined;
  locked?: boolean | undefined;
  invalid?: boolean | undefined;
  /** Why it cannot be typed right now (it stays, disabled). */
  disabled?: string | undefined;
  /** A value is being picked in the view: what to click next. */
  picking?: string | undefined;
  numeric?: boolean | undefined;
  menu?: readonly FieldMenuGroup[] | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  onFocus: () => void;
  onChange: (text: string) => void;
  onRelease?: (() => void) | undefined;
  onTab?: ((back: boolean) => void) | undefined;
  onEnter?: (() => void) | undefined;
  onEscape?: (() => void) | undefined;
  onCancelPick?: (() => void) | undefined;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const setInput = (node: HTMLInputElement | null) => {
    input.current = node;
    if (typeof props.inputRef === 'function') props.inputRef(node);
    else if (props.inputRef)
      (props.inputRef as { current: HTMLInputElement | null }).current = node;
  };
  const cls = `ui-inline-field${props.active && !props.disabled ? ' is-active' : ''}${props.locked && !props.picking ? ' is-locked' : ''}${props.disabled ? ' is-disabled' : ''}`;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4') {
      event.preventDefault();
      if (props.menu?.some((group) => group.items.length > 0)) setMenuOpen(true);
      return;
    }
    if (props.picking && event.key === 'Escape') {
      event.preventDefault();
      props.onCancelPick?.();
      return;
    }
    // Tab, `,` and `<` move to the next field (AutoCAD's dynamic input), Shift+Tab back; the field
    // is left first, so the next one takes the keyboard.
    if ((event.key === 'Tab' || event.key === ',' || event.key === '<') && props.onTab) {
      event.preventDefault();
      event.currentTarget.blur();
      props.onTab(event.key === 'Tab' && event.shiftKey);
    } else if (event.key === 'Enter' && props.onEnter) {
      event.preventDefault();
      event.currentTarget.blur();
      props.onEnter();
    } else if (event.key === 'Escape' && props.onEscape) {
      event.preventDefault();
      event.currentTarget.blur();
      props.onEscape();
    }
  };
  return (
    <div
      className={cls}
      data-field
      data-tip={props.disabled}
      onMouseDown={(event) => {
        // A press anywhere on the field goes to its input; its own buttons keep the press.
        if ((event.target as HTMLElement).closest('button, input')) return;
        event.preventDefault();
        input.current?.focus();
      }}
    >
      <span className="ui-inline-label">{props.label}</span>
      <span className="ui-inline-lock-slot">
        {props.locked && !props.picking && (
          <button
            type="button"
            className="ui-inline-lock"
            aria-label={`Release ${props.label}`}
            data-tip="Release"
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onRelease}
          >
            <Lock size={12} strokeWidth={2} />
          </button>
        )}
      </span>
      <input
        ref={setInput}
        className={`ui-inline-input${props.invalid ? ' is-invalid' : ''}${props.picking ? ' is-picking' : ''}`}
        inputMode={props.numeric === false ? 'text' : 'decimal'}
        aria-label={props.label}
        aria-invalid={props.invalid || undefined}
        disabled={props.disabled !== undefined}
        readOnly={props.picking !== undefined}
        value={props.picking ?? props.value}
        placeholder="—"
        onFocus={(event) => {
          props.onFocus();
          if (!props.picking) event.currentTarget.select();
        }}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="ui-inline-unit">{props.picking ? '' : props.unit}</span>
      <FieldMenu
        label={props.label}
        groups={props.menu ?? []}
        open={menuOpen}
        onOpen={setMenuOpen}
        // Back to this field only when it takes the typing; otherwise typing goes on into the
        // active field (as in the lab: a meaning chosen elsewhere does not move the typing).
        returnFocus={props.active ? input.current : null}
      />
    </div>
  );
}

/**
 * A choice that is not a number (a source line) on the fields' grid: its label, what is chosen,
 * and the same `>` with the alternatives.
 */
export function InlineChoice(props: {
  label: string;
  value: string;
  muted?: boolean | undefined;
  menu: readonly FieldMenuGroup[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="ui-inline-field is-choice" data-field aria-label={props.label}>
      <span className="ui-inline-label">{props.label}</span>
      <span className="ui-inline-lock-slot" />
      <span className={`ui-inline-choice${props.muted ? ' is-muted' : ''}`} data-tip-overflow>
        {props.value}
      </span>
      <span className="ui-inline-unit" />
      <FieldMenu label={props.label} groups={props.menu} open={open} onOpen={setOpen} />
    </div>
  );
}

/*
 * Text rows of a function panel (proposal 2026-11-06, import/export round 5 — „values float",
 * „read-only values look like fields"): a label column of one width, so every text value starts on
 * one x; the `>` slot at every row's end, so every row ends on one x. A choice is a field (control
 * grey, `>`); a value that cannot be changed is plain text on the same grid; a check and a list of
 * options sit on the same grid with the one framed check at the row's end. Labels 12, values 13.
 */

/** One option of a text choice. */
export interface InlineSelectOption {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  /** Why it cannot be chosen (it stays, disabled). */
  readonly disabled?: string | undefined;
}

/**
 * A text choice: label, value, the `>` with its alternatives. Either `options` — one of several
 * (Import as, Elements): the value is the chosen option's name and the menu is just the options,
 * no heading (the field's label says what they are) — or `menu`, groups to take a value from
 * (File, Folder), headed only when there are two or more.
 */
export function InlineSelect(
  props: {
    label: string;
    muted?: boolean | undefined;
    /** The value is a path: when cut, it keeps its end (the folder or file name), not its start. */
    path?: boolean | undefined;
  } & (
    | {
        options: readonly InlineSelectOption[];
        selected: string;
        onChange: (id: string) => void;
        value?: never;
        menu?: never;
      }
    | {
        value: string;
        menu: readonly FieldMenuGroup[];
        options?: never;
        selected?: never;
        onChange?: never;
      }
  ),
): JSX.Element {
  const [open, setOpen] = useState(false);
  const { options, onChange } = props;
  const groups: readonly FieldMenuGroup[] = options
    ? [
        {
          kind: 'meaning',
          items: options.map((option) => ({
            ...option,
            checked: option.id === props.selected,
            onSelect: () => onChange?.(option.id),
          })),
        },
      ]
    : props.menu;
  // The value says what its row in the menu says (name · hint).
  const chosen = options?.find((option) => option.id === props.selected);
  const value = options
    ? chosen
      ? [chosen.label, chosen.hint].filter(Boolean).join(' · ')
      : ''
    : props.value;
  // Label plain on the panel, the editable value in its field (owner 2026-11-07, decided
  // library-wide: only an editable value has the grey field).
  return (
    <div className="ui-inline-row has-field" aria-label={props.label}>
      <span className="ui-inline-row-label">{props.label}</span>
      <span className="ui-inline-row-field" data-field>
        <span
          className={`ui-inline-row-value${props.muted ? ' is-muted' : ''}${props.path ? ' is-path' : ''}`}
          data-tip-overflow
          onClick={() => setOpen(!open)}
        >
          {props.path ? <bdi>{value}</bdi> : value}
        </span>
        <FieldMenu label={props.label} groups={groups} open={open} onOpen={setOpen} />
      </span>
    </div>
  );
}

/**
 * A value that cannot be changed here (file, points, size): plain text on the panel, on the values'
 * x, one line — cut with „…" and its full text as tooltip.
 */
export function InlineInfo(props: { label: string; value: string }): JSX.Element {
  return (
    <div className="ui-inline-row is-info" aria-label={props.label}>
      <span className="ui-inline-row-label">{props.label}</span>
      <span className="ui-inline-row-value" data-tip-overflow>
        {props.value}
      </span>
    </div>
  );
}

/**
 * A check box in a function panel (Transform on export): its text on the labels' x as the check's
 * label, the framed check in the trailing column like every check in the lab (lists, menus). Never
 * a field look, not even on hover — only the check's frame brightens (owner round 5: „sieht wie
 * ein editierbares Label aus"; 2026-11-07: „dass das grau hinterlegt ist, widerspricht doch auch
 * dem ganzen Rest der UI"). The whole row toggles it.
 */
export function InlineCheck(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Why it cannot change right now (it stays, disabled). */
  disabled?: string | undefined;
}): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      className="ui-inline-check"
      disabled={props.disabled !== undefined}
      data-tip={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span>{props.label}</span>
      <span className="ui-inline-check-slot">
        <CheckMark checked={props.checked} />
      </span>
    </button>
  );
}

/**
 * The buttons at the end of a function panel, in one row (owner 2026-11-07, import: „statt nur
 * Import-Button sollten da einfach zwei Buttons in der Zeile sein, einer mit Import Manager und
 * einer Default Import"): the other way on the left (a manager window), what Enter does on the
 * right. Both share the row; the primary is the panel's one primary button.
 */
export function FieldsActions(props: {
  other: { readonly label: string; readonly onClick: () => void };
  primary: {
    readonly label: string;
    readonly onClick: () => void;
    /** Why it cannot run now (it stays, disabled). */
    readonly disabled?: string | undefined;
  };
}): JSX.Element {
  return (
    <div className="ui-fields-actions">
      <Button onClick={props.other.onClick}>{props.other.label}</Button>
      <Button
        variant="primary"
        disabled={props.primary.disabled !== undefined}
        disabledReason={props.primary.disabled}
        onClick={props.primary.onClick}
      >
        {props.primary.label}
      </Button>
    </div>
  );
}

/**
 * One of several, as a list on the fields' grid (Format): each option's name, quiet text at its
 * end (how much it takes), the one framed check at the row's end on the chosen one. An option
 * that cannot be taken stays, dimmed, and says why. ↑/↓ move and choose.
 */
export function InlineOptions(props: {
  label: string;
  value: string;
  options: readonly {
    readonly id: string;
    readonly label: string;
    readonly hint?: string | undefined;
    readonly disabled?: string | undefined;
  }[];
  onChange: (id: string) => void;
}): JSX.Element {
  const enabled = props.options.filter((o) => o.disabled === undefined);
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const d = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    event.preventDefault();
    const at = enabled.findIndex((o) => o.id === props.value);
    const next = enabled[(at + d + enabled.length) % enabled.length];
    if (next) {
      props.onChange(next.id);
      event.currentTarget.querySelector<HTMLElement>(`[data-option="${next.id}"]`)?.focus();
    }
  };
  return (
    <div className="ui-inline-options" role="radiogroup" aria-label={props.label} onKeyDown={step}>
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          data-option={option.id}
          aria-checked={option.id === props.value}
          tabIndex={option.id === props.value ? 0 : -1}
          className="ui-inline-option"
          disabled={option.disabled !== undefined}
          data-tip={option.disabled}
          onClick={() => props.onChange(option.id)}
        >
          <span className="ui-inline-row-value">{option.label}</span>
          <span className="ui-inline-option-hint">{option.hint}</span>
          <span className="ui-inline-check-slot">
            <CheckMark checked={option.id === props.value} />
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * A notice the function gives and does not stop for (far away, what a format leaves out): its mark
 * on the labels' x, the text right after it across the panel (round 5: a short sentence must not
 * wrap in the value column). Neutral, not a colour: none
 * of the three colours means „notice" (blue selected, yellow worked on, red error).
 */
export function InlineNotice(props: { children: ReactNode }): JSX.Element {
  return (
    <div className="ui-inline-notice" role="status">
      <TriangleAlert aria-hidden />
      <span className="ui-inline-notice-text">{props.children}</span>
    </div>
  );
}

/** A computed value on the fields' grid (Result, Start point): its digits end where theirs do. */
export function InlineRead(props: { label: string; value: string; unit?: string }): JSX.Element {
  return (
    <div className="ui-inline-read">
      <span className="ui-prop-label">{props.label}</span>
      <span className="ui-inline-read-value" data-tip-overflow>
        {props.value}
      </span>
      <span className="ui-inline-unit">{props.unit ?? ''}</span>
      <CopyButton value={props.value} label={props.label} />
    </div>
  );
}

/**
 * The `>` at a field's end (Trimble Access): one menu of groups in a fixed order — what the value
 * means (a check on the current meaning), Take from, Calculate, Recent. A field without
 * alternatives keeps the empty slot, so every value still ends on the same x.
 */
export function FieldMenu(props: {
  label: string;
  groups: readonly FieldMenuGroup[];
  open: boolean;
  onOpen: (open: boolean) => void;
  /** The field's input: the keyboard goes back to it when the menu closes. */
  returnFocus?: HTMLElement | null | undefined;
}): JSX.Element {
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const groups = [...props.groups]
    .filter((group) => group.items.length > 0)
    .sort((a, b) => FIELD_MENU_ORDER.indexOf(a.kind) - FIELD_MENU_ORDER.indexOf(b.kind));
  if (groups.length === 0) return <span className="ui-inline-more-slot" />;
  // Rules by construction (owner round 5: „wenn das Feld schon ‚Import as' heißt, dann braucht
  // nicht das Dropdown-Menü auch noch das als Überschrift"): one group has no heading — the field's
  // label says what it is; of two or more, a heading that would repeat the label is left out.
  const heading = (group: FieldMenuGroup): string | null => {
    const title = group.title ?? FIELD_MENU_TITLE[group.kind];
    return groups.length < 2 || title === props.label ? null : title;
  };
  const { open, onOpen } = props;
  // A field's alternatives hang under the whole field, its left edge on the field's (a dropdown).
  const field = button.current?.closest<HTMLElement>('[data-field]') ?? button.current;
  const rect = open ? field?.getBoundingClientRect() : undefined;
  const fromKeyboard = open && document.activeElement === props.returnFocus;
  return (
    <span className="ui-inline-more-slot">
      <button
        ref={button}
        type="button"
        className="ui-inline-more"
        aria-label={`${props.label}: more`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-tip={open ? undefined : 'Alternatives · Alt+↓'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onOpen(!open)}
      >
        <ChevronRight size={14} strokeWidth={2} />
      </button>
      {open && rect && (
        <Menu
          id={menuId}
          label={props.label}
          x={rect.left}
          y={rect.bottom + 4}
          anchor={rect}
          minWidth={rect.width}
          focusFirst={fromKeyboard}
          returnFocus={props.returnFocus}
          onClose={() => onOpen(false)}
        >
          {groups.map((group, index) => (
            <div
              key={group.kind}
              role="group"
              aria-label={group.title ?? FIELD_MENU_TITLE[group.kind]}
            >
              {index > 0 && <MenuDivider />}
              {heading(group) !== null && <MenuSection>{heading(group)}</MenuSection>}
              {group.items.map((item) => (
                <MenuItem
                  key={item.id}
                  checked={group.kind === 'meaning' ? !!item.checked : undefined}
                  disabled={item.disabled !== undefined}
                  disabledReason={item.disabled}
                  hint={item.hint}
                  tip={item.tip}
                  keepFocus
                  onSelect={() => {
                    item.onSelect?.();
                    onOpen(false);
                    props.returnFocus?.focus();
                  }}
                >
                  {item.label}
                </MenuItem>
              ))}
            </div>
          ))}
        </Menu>
      )}
    </span>
  );
}

/**
 * Two or three short options as one track the height of a field (more are a SelectField). The
 * chosen option is the raised thumb. Options never take the keyboard (typing goes on into the
 * active field); an icon replaces the text, which stays the accessible name.
 */
export function Segmented(props: {
  label: string;
  value: string;
  /** `tip` names an abbreviated option (ΔXY); an icon replaces the text, its name stays the tip. */
  options: readonly (readonly [
    value: string,
    label: string,
    icon?: ReactNode,
    tip?: string | undefined,
  ])[];
  onChange: (value: string) => void;
  /** Why it has no effect right now (it stays, disabled). */
  disabled?: string | undefined;
}): JSX.Element {
  const icons = props.options.every((option) => option[2]);
  return (
    <div
      className={`ui-segmented${icons ? ' is-icons' : ''}`}
      role="radiogroup"
      aria-label={props.label}
      aria-disabled={props.disabled !== undefined}
    >
      {props.options.map(([value, label, icon, tip]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={props.value === value}
          aria-label={label}
          aria-disabled={props.disabled !== undefined}
          className={props.value === value ? 'is-on' : ''}
          data-tip={props.disabled ?? tip ?? (icon ? label : undefined)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (props.disabled === undefined) props.onChange(value);
          }}
        >
          {icon ?? <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
