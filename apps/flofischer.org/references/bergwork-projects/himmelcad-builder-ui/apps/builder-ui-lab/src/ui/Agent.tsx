import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Pin,
  PinOff,
  ShieldCheck,
  Star,
  Undo2,
} from 'lucide-react';
import { Button } from './Button.js';
import { RenameField } from './List.js';
import { CheckMark, Menu, MenuItem, MenuSearch } from './Menu.js';
import { uiRoot, usePlacement, type AnchorRect } from './placement.js';
import './agent.css';

/*
 * The agent's own window (proposal round 6, 2026-11-07; UI-LIBRARY.md › Proposed: agent window).
 * Owner on round 5: „da fehlen tausende Dinge, die t3code geil machen von der UX her. voll viele
 * Infos fehlen z. B. in dem linken Panel. die Settings sehen awful aus, z. B. viel zu breite
 * Toggles für eine Auswahl zwischen zwei Werten". Copied from t3code as it runs (v0.1.7): its
 * thread rows (state first, the time otherwise, a second line with what the thread did, actions on
 * hover, a hover card with the details, pinned on top, finished work on a shelf), its settings
 * (sections of grouped rows, the name and a short line at the left, a control as small as its job
 * at the right, a reset per changed row) and its model picker (providers in a rail, search,
 * favourites, effort beside the models). All built from data, so a settings row cannot hold a
 * stretched toggle and a session row cannot lose its state.
 */

const anchorOf = (el: HTMLElement): AnchorRect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

// ---- Sessions ------------------------------------------------------------------------------------

/** A session's state as its row shows it: what needs the user first, its time otherwise. */
export type SessionRowState =
  | { readonly kind: 'working'; readonly elapsed: string }
  | { readonly kind: 'waiting'; readonly what: string }
  | { readonly kind: 'failed' }
  | { readonly kind: 'done' }
  | { readonly kind: 'idle'; readonly at: string };

function SessionState(props: { state: SessionRowState }): JSX.Element {
  const { state } = props;
  if (state.kind === 'working')
    return (
      <span className="ui-session-state is-working">
        <span className="ui-chat-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span>{state.elapsed}</span>
      </span>
    );
  if (state.kind === 'waiting')
    return (
      <span className="ui-session-state is-waiting">
        <span className="ui-chat-wait" aria-hidden />
        <span>{state.what}</span>
      </span>
    );
  if (state.kind === 'failed')
    return (
      <span className="ui-session-state is-failed">
        <CircleAlert size={12} aria-hidden />
        <span>Failed</span>
      </span>
    );
  if (state.kind === 'done')
    return (
      <span className="ui-session-state is-done">
        <span>Done</span>
      </span>
    );
  return (
    <span className="ui-session-state">
      <span>{state.at}</span>
    </span>
  );
}

/**
 * One session in the sidebar (t3code's thread row): the name and, at its end, the state — Working
 * with blue dots and the time, Waiting with the neutral dot and what for, Failed in red, Done until
 * it is read, otherwise when it was last used. The second line says with which model and what it
 * changed. On hover Pin and Archive take the state's place; a moment's rest shows the details card.
 */
export function SessionRow(props: {
  title: string;
  state: SessionRowState;
  model: string;
  modelIcon?: ReactNode | undefined;
  /** What it changed in the project; undone when every change of it was taken back. */
  changes: { readonly created: number; readonly undone: boolean };
  pinned?: boolean | undefined;
  archived?: boolean | undefined;
  active?: boolean | undefined;
  /** The details card (Model, Access, Started …), shown after a moment's hover. */
  details: readonly (readonly [label: string, value: string])[];
  renaming?: boolean | undefined;
  onRename?: ((name: string) => void) | undefined;
  onRenameEnd?: (() => void) | undefined;
  onSelect: () => void;
  onPin?: (() => void) | undefined;
  onArchive: () => void;
  onContextMenu?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<AnchorRect | null>(null);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const changes = props.changes.undone
    ? 'Undone'
    : props.changes.created > 0
      ? `${props.changes.created} created`
      : null;
  const attention = props.state.kind !== 'idle';
  return (
    <div
      ref={ref}
      className={`ui-session${props.active ? ' is-active' : ''}${props.archived ? ' is-archived' : ''}${
        attention ? ' is-attention' : ''
      }`}
      onPointerEnter={() => {
        clear();
        timer.current = window.setTimeout(() => {
          if (ref.current) setCard(anchorOf(ref.current));
        }, 600);
      }}
      onPointerLeave={() => {
        clear();
        setCard(null);
      }}
      onPointerDown={() => {
        clear();
        setCard(null);
      }}
      onContextMenu={props.onContextMenu}
    >
      {props.renaming && props.onRename ? (
        <span className="ui-session-rename">
          <RenameField
            label="Session name"
            defaultValue={props.title}
            onCommit={(name) => {
              if (name.trim() && name !== props.title) props.onRename?.(name.trim());
              props.onRenameEnd?.();
            }}
            onCancel={() => props.onRenameEnd?.()}
          />
        </span>
      ) : (
        <button
          type="button"
          className="ui-session-main"
          aria-current={props.active ? 'page' : undefined}
          onClick={props.onSelect}
        >
          <span className="ui-session-line">
            <span className="ui-session-title">{props.title}</span>
            {props.pinned && <Pin className="ui-session-pin" size={12} aria-label="Pinned" />}
            <SessionState state={props.state} />
          </span>
          <span className="ui-session-line is-meta">
            {props.modelIcon && <span className="ui-session-model-icon">{props.modelIcon}</span>}
            <span className="ui-session-meta">
              {props.model}
              {changes && ` · ${changes}`}
            </span>
          </span>
        </button>
      )}
      {!props.renaming && (
        <span className="ui-session-actions">
          {props.onPin && !props.archived && (
            <button
              type="button"
              className="ui-session-action"
              aria-label={props.pinned ? 'Unpin' : 'Pin'}
              data-tip={props.pinned ? 'Unpin' : 'Pin'}
              onClick={props.onPin}
            >
              {props.pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
            </button>
          )}
          <button
            type="button"
            className="ui-session-action"
            aria-label={props.archived ? 'Restore' : 'Archive'}
            data-tip={props.archived ? 'Restore' : 'Archive'}
            onClick={props.onArchive}
          >
            {props.archived ? (
              <ArchiveRestore size={14} aria-hidden />
            ) : (
              <Archive size={14} aria-hidden />
            )}
          </button>
        </span>
      )}
      {card && <SessionCard at={card} title={props.title} rows={props.details} />}
    </div>
  );
}

/** The details card beside a session row (t3code's thread hover card). */
function SessionCard(props: {
  at: AnchorRect;
  title: string;
  rows: readonly (readonly [string, string])[];
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const place = usePlacement(ref, props.at.right + 8, props.at.top, undefined, true);
  return createPortal(
    <div ref={ref} className="ui-surface is-popover ui-session-card" style={place} role="tooltip">
      <div className="ui-session-card-title">{props.title}</div>
      {props.rows.map(([label, value]) => (
        <div key={label} className="ui-session-card-row">
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>,
    uiRoot(),
  );
}

/** A group of sessions under a quiet heading (Pinned, Recent) — or none for the first group. */
export function SessionGroup(props: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="ui-session-group" role="group" aria-label={props.label}>
      <div className="ui-session-group-head">{props.label}</div>
      {props.children}
    </div>
  );
}

/**
 * Finished sessions on a shelf at the sidebar's foot (t3code's Settled): its name and count, a
 * chevron; open, the sessions above it.
 */
export function SessionShelf(props: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`ui-session-shelf${props.open ? ' is-open' : ''}`}>
      {props.open && <div className="ui-session-shelf-body">{props.children}</div>}
      <button
        type="button"
        className="ui-session-shelf-head"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <span>{props.label}</span>
        <span className="ui-session-shelf-count">{props.count}</span>
        {props.open ? (
          <ChevronDown size={14} aria-hidden />
        ) : (
          <ChevronRight size={14} aria-hidden />
        )}
      </button>
    </div>
  );
}

// ---- Settings ------------------------------------------------------------------------------------

/**
 * A settings row's control, as data (owner 2026-11-07: „viel zu breite Toggles für eine Auswahl
 * zwischen zwei Werten"): on/off is the library's one framed check; one of several — two included —
 * a compact dropdown as wide as its longest value; a model a button that opens the picker; a path
 * a field of fixed width; an action a neutral button; a figure read-only; a share of a limit a
 * meter. Nothing stretches across the row.
 */
export type SettingControl =
  | {
      readonly kind: 'check';
      readonly checked: boolean;
      readonly onChange: (checked: boolean) => void;
    }
  | {
      readonly kind: 'select';
      readonly value: string;
      readonly options: readonly (readonly [value: string, label: string])[];
      readonly onChange: (value: string) => void;
    }
  | {
      readonly kind: 'button';
      readonly label: string;
      readonly value: string;
      readonly detail?: string;
      readonly icon?: ReactNode;
      readonly expanded?: boolean;
      readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    }
  | {
      readonly kind: 'text';
      readonly value: string;
      readonly placeholder?: string;
      readonly onCommit: (value: string) => void;
    }
  | { readonly kind: 'read'; readonly value: string; readonly mono?: boolean }
  | { readonly kind: 'action'; readonly label: string; readonly onClick: () => void }
  | { readonly kind: 'meter'; readonly value: number; readonly text: string };

/** The compact dropdown of a settings row: the value and a chevron, its menu of radio rows. */
function SettingSelect(props: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState<{ at: AnchorRect; width: number; from: HTMLElement } | null>(
    null,
  );
  const current = props.options.find(([v]) => v === props.value)?.[1] ?? props.value;
  return (
    <>
      <button
        type="button"
        className="ui-setting-select"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onClick={(event) => {
          const el = event.currentTarget;
          setOpen(
            open ? null : { at: anchorOf(el), width: el.getBoundingClientRect().width, from: el },
          );
        }}
      >
        <span className="ui-setting-select-value">
          {/* Every option in one cell, so the trigger is as wide as its longest value. */}
          {props.options.map(([v, label]) => (
            <span
              key={v}
              aria-hidden={v !== props.value}
              className={v === props.value ? 'is-shown' : ''}
            >
              {label}
            </span>
          ))}
          {props.options.every(([v]) => v !== props.value) && (
            <span className="is-shown">{current}</span>
          )}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <Menu
          label={props.label}
          x={open.at.left}
          y={open.at.bottom + 4}
          anchor={open.at}
          minWidth={open.width}
          returnFocus={open.from}
          onClose={() => setOpen(null)}
        >
          {props.options.map(([v, label]) => (
            <MenuItem
              key={v}
              kind="radio"
              checked={v === props.value}
              onSelect={() => {
                props.onChange(v);
                setOpen(null);
                open.from.focus();
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}

function SettingText(props: {
  label: string;
  value: string;
  placeholder?: string | undefined;
  onCommit: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <input
      className="ui-setting-text"
      aria-label={props.label}
      value={draft}
      placeholder={props.placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== props.value && props.onCommit(draft)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(props.value);
          event.stopPropagation();
        }
      }}
    />
  );
}

/** A share of a limit (usage, context): a thin bar and its figure. */
export function UsageMeter(props: { label: string; value: number; text: string }): JSX.Element {
  const share = Math.max(0, Math.min(1, props.value));
  return (
    <span className="ui-meter">
      <span
        className="ui-meter-track"
        role="meter"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <span className="ui-meter-fill" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="ui-meter-text">{props.text}</span>
    </span>
  );
}

function Control(props: { title: string; control: SettingControl }): JSX.Element {
  const c = props.control;
  if (c.kind === 'check')
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={c.checked}
        aria-label={props.title}
        className="ui-setting-check"
        onClick={() => c.onChange(!c.checked)}
      >
        <CheckMark checked={c.checked} />
      </button>
    );
  if (c.kind === 'select')
    return (
      <SettingSelect
        label={props.title}
        value={c.value}
        options={c.options}
        onChange={c.onChange}
      />
    );
  if (c.kind === 'button')
    return (
      <button
        type="button"
        className="ui-setting-select"
        aria-label={c.label}
        aria-haspopup="dialog"
        aria-expanded={c.expanded ?? false}
        onClick={c.onClick}
      >
        {c.icon}
        <span className="ui-setting-select-value">
          <span className="is-shown">
            {c.value}
            {c.detail && <span className="ui-setting-detail"> {c.detail}</span>}
          </span>
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
    );
  if (c.kind === 'text')
    return (
      <SettingText
        label={props.title}
        value={c.value}
        placeholder={c.placeholder}
        onCommit={c.onCommit}
      />
    );
  if (c.kind === 'read')
    return <span className={`ui-setting-read${c.mono ? ' is-mono' : ''}`}>{c.value}</span>;
  if (c.kind === 'action') return <Button onClick={c.onClick}>{c.label}</Button>;
  return <UsageMeter label={props.title} value={c.value} text={c.text} />;
}

/**
 * One setting (t3code's settings row): its name, a short line under it when the name needs one,
 * a state line (a version, an error in red); the control at the row's end, as small as its job.
 * Changed from the default, a reset sits beside the name.
 */
export function SettingsRow(props: {
  id?: string | undefined;
  title: string;
  hint?: string | undefined;
  icon?: ReactNode | undefined;
  /** A quiet state under the name (Signed in · claude.ai); `error` in red. */
  status?: { readonly text: string; readonly tone?: 'error' | 'quiet' } | undefined;
  control?: SettingControl | undefined;
  /** Differs from the default: a reset beside the name. */
  onReset?: (() => void) | undefined;
  /** Found by the settings search: marked once. */
  highlight?: boolean | undefined;
  dim?: boolean | undefined;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (props.highlight) ref.current?.scrollIntoView({ block: 'center' });
  }, [props.highlight]);
  const toggles = props.control?.kind === 'check';
  return (
    <div
      ref={ref}
      id={props.id}
      className={`ui-setting${props.highlight ? ' is-found' : ''}${props.dim ? ' is-dim' : ''}${
        toggles ? ' is-toggle' : ''
      }`}
      onClick={(event) => {
        // The whole row toggles an on/off setting, as InlineCheck does in a function panel.
        if (!toggles || (event.target as Element).closest('button, input')) return;
        const c = props.control as Extract<SettingControl, { kind: 'check' }>;
        c.onChange(!c.checked);
      }}
    >
      {props.icon && <span className="ui-setting-icon">{props.icon}</span>}
      <div className="ui-setting-text-col">
        <div className="ui-setting-name">
          <span>{props.title}</span>
          {props.onReset && (
            <button
              type="button"
              className="ui-setting-reset"
              aria-label={`Reset ${props.title}`}
              data-tip="Reset"
              onClick={props.onReset}
            >
              <Undo2 size={12} aria-hidden />
            </button>
          )}
        </div>
        {props.hint && <div className="ui-setting-hint">{props.hint}</div>}
        {props.status && (
          <div
            className={`ui-setting-status${props.status.tone ? ` is-${props.status.tone}` : ''}`}
          >
            {props.status.text}
          </div>
        )}
      </div>
      {props.control && (
        <div className="ui-setting-control">
          <Control title={props.title} control={props.control} />
        </div>
      )}
    </div>
  );
}

/** A section of a settings page: its heading, an action at the heading's end, its rows grouped. */
export function SettingsSection(props: {
  title: string;
  /** At the heading's end (Look again), with a quiet note before it (Checked 4 min ago). */
  action?:
    | {
        readonly label: string;
        readonly icon?: ReactNode;
        readonly note?: string;
        readonly onClick: () => void;
      }
    | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="ui-settings-section" aria-label={props.title}>
      <div className="ui-settings-head">
        <h3>{props.title}</h3>
        {props.action && (
          <span className="ui-settings-head-action">
            {props.action.note && <span className="ui-settings-note">{props.action.note}</span>}
            <button type="button" className="ui-settings-link" onClick={props.action.onClick}>
              {props.action.icon}
              <span>{props.action.label}</span>
            </button>
          </span>
        )}
      </div>
      <div className="ui-settings-group">{props.children}</div>
    </section>
  );
}

// ---- Model picker --------------------------------------------------------------------------------

export interface PickerProvider {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** Version and account, in the picker's foot. */
  readonly about?: string | undefined;
  readonly models: readonly string[];
  /** Why it cannot be chosen (Not installed). */
  readonly disabled?: string | undefined;
}

/**
 * The model picker (t3code): the agents on this computer in a rail (Favourites first), their models
 * with a search and a star, the effort beside them; the foot names the agent's version and account
 * and leads to the models shown here. Choosing keeps it open, so model and effort are set in one go.
 */
export function ModelPicker(props: {
  label: string;
  anchor: AnchorRect;
  returnFocus?: HTMLElement | null | undefined;
  providers: readonly PickerProvider[];
  favorites: readonly string[];
  efforts: readonly string[];
  value: { readonly provider: string; readonly model: string; readonly effort: string };
  onChange: (value: { provider: string; model: string; effort: string }) => void;
  onFavorite: (model: string) => void;
  onSettings: () => void;
  /**
   * What the agent may do, in the foot (t3code nightly moved its access level from under the
   * composer into the picker): a compact dropdown.
   */
  access?:
    | {
        readonly value: string;
        readonly options: readonly (readonly [value: string, label: string])[];
        readonly onChange: (value: string) => void;
      }
    | undefined;
  onClose: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<string>(props.value.provider);
  const [query, setQuery] = useState('');
  const place = usePlacement(ref, props.anchor.left, props.anchor.bottom + 8, props.anchor, true);
  const { onClose, returnFocus } = props;
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Element;
      if (ref.current?.contains(target)) return;
      if (target.closest?.('[aria-haspopup][aria-expanded="true"], .ui-menu')) return;
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
  }, [onClose, returnFocus]);
  const all = props.providers.flatMap((p) => p.models.map((m) => ({ provider: p, model: m })));
  const q = query.trim().toLowerCase();
  const rows = (
    q
      ? all.filter((r) => `${r.provider.label} ${r.model}`.toLowerCase().includes(q))
      : tab === 'favorites'
        ? all.filter((r) => props.favorites.includes(r.model))
        : all.filter((r) => r.provider.id === tab)
  ).filter((r) => !r.provider.disabled);
  const chosen = props.providers.find((p) => p.id === props.value.provider);
  const shownProvider = props.providers.find((p) => p.id === tab) ?? chosen;
  return createPortal(
    <div
      ref={ref}
      className="ui-surface is-popover ui-picker"
      role="dialog"
      aria-label={props.label}
      style={place}
    >
      <div className="ui-picker-rail" role="tablist" aria-label="Agents">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'favorites'}
          className="ui-picker-tab"
          aria-label="Favourites"
          data-tip="Favourites"
          onClick={() => setTab('favorites')}
        >
          <Star size={16} aria-hidden />
        </button>
        {props.providers.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={tab === p.id}
            className="ui-picker-tab"
            aria-label={p.label}
            data-tip={p.disabled ? `${p.label} · ${p.disabled}` : p.label}
            disabled={!!p.disabled}
            onClick={() => setTab(p.id)}
          >
            {p.icon}
          </button>
        ))}
      </div>
      <div className="ui-picker-models">
        <MenuSearch label="Search models" value={query} onChange={setQuery} />
        <div className="ui-picker-list" role="listbox" aria-label="Models">
          {rows.length === 0 && <div className="ui-picker-empty">No models</div>}
          {rows.map((r) => {
            const on = r.provider.id === props.value.provider && r.model === props.value.model;
            const fav = props.favorites.includes(r.model);
            return (
              <div key={`${r.provider.id}:${r.model}`} className="ui-picker-row-wrap">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`ui-picker-row${on ? ' is-chosen' : ''}`}
                  onClick={() =>
                    props.onChange({ ...props.value, provider: r.provider.id, model: r.model })
                  }
                >
                  <span className="ui-picker-row-icon">{r.provider.icon}</span>
                  <span className="ui-picker-row-label">{r.model}</span>
                  <span className="ui-picker-star-slot" />
                  <CheckMark checked={on} />
                </button>
                <button
                  type="button"
                  className={`ui-picker-star${fav ? ' is-on' : ''}`}
                  aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                  aria-pressed={fav}
                  data-tip={fav ? 'Favourite' : 'Add to favourites'}
                  onClick={() => props.onFavorite(r.model)}
                >
                  <Star size={14} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ui-picker-efforts" role="radiogroup" aria-label="Effort">
        <div className="ui-picker-heading">Effort</div>
        {props.efforts.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={e === props.value.effort}
            className="ui-picker-row"
            onClick={() => props.onChange({ ...props.value, effort: e })}
          >
            <span className="ui-picker-row-label">{e}</span>
            <CheckMark checked={e === props.value.effort} />
          </button>
        ))}
      </div>
      <div className="ui-picker-foot">
        {props.access && (
          <span className="ui-picker-access">
            <ShieldCheck size={14} aria-hidden />
            <SettingSelect
              label="Access"
              value={props.access.value}
              options={props.access.options}
              onChange={props.access.onChange}
            />
          </span>
        )}
        <span className="ui-picker-about">
          {shownProvider?.about ? `${shownProvider.label} ${shownProvider.about}` : ''}
        </span>
        <button
          type="button"
          className="ui-settings-link"
          data-tip="Models in the picker"
          onClick={props.onSettings}
        >
          <span>Models…</span>
        </button>
      </div>
    </div>,
    uiRoot(),
  );
}
