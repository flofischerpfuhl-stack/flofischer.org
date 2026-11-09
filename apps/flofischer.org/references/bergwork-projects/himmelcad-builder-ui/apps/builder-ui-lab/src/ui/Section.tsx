import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { CopyButton } from './Button.js';
import { CheckMark } from './Menu.js';
import { rememberedOpen, rememberOpen } from './sectionMemory.js';
import './button.css';
import './section.css';

/** The column of sections in a panel (Properties, function panel). */
export function Sections(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-sections">{props.children}</div>;
}

/**
 * A collapsible group (Revit). Top level (`depth` 0): a 32 px head; sections are divided by a line.
 * Nested (`depth` ≥ 1): a row with a twisty that opens its rows underneath, indented one step —
 * closed means closed. Named after its content, never „Options". Open by default at the top level;
 * `remember` keeps the choice per id.
 */
export function Section(props: {
  id: string;
  title: string;
  depth?: number | undefined;
  defaultOpen?: boolean | undefined;
  remember?: boolean | undefined;
  /** Nested only: shown next to the closed head (a count). */
  summary?: ReactNode | undefined;
  /** Nested only: what Copy puts on the clipboard for the whole group (a point's X, Y, Z). */
  copy?: string | undefined;
  /** Nested only: a control as the head instead of the title (a vertex's point name). */
  head?: ReactNode | undefined;
  /**
   * Top level (proposal 2026-11-06, library window): an on/off check at the head's end, where the
   * app's checks sit (owner: „bei den jeweiligen Parents ‚Point', ‚Line' etc. einfach eine
   * Checkbox daneben"). Off: the section stays closed and its title quiet; on opens it.
   */
  check?: { readonly checked: boolean; readonly onChange: (checked: boolean) => void } | undefined;
  children: ReactNode;
}): JSX.Element {
  const depth = props.depth ?? 0;
  const remember = props.remember ?? true;
  const [open, setOpen] = useState(
    () => (remember ? rememberedOpen(props.id) : undefined) ?? props.defaultOpen ?? depth === 0,
  );
  const toggle = () => {
    setOpen(!open);
    if (remember) rememberOpen(props.id, !open);
  };
  const off = props.check !== undefined && !props.check.checked;
  const shown = open && !off;
  const twisty = <ChevronRight size={14} className={`ui-twisty${shown ? ' is-open' : ''}`} />;
  return (
    <section
      className={`ui-section ${depth === 0 ? 'is-top' : 'is-nested'}${off ? ' is-off' : ''}`}
    >
      {depth === 0 && props.check ? (
        <div className="ui-section-head-row">
          <button
            type="button"
            className="ui-section-head"
            aria-expanded={shown}
            disabled={off}
            onClick={toggle}
          >
            {twisty}
            <span>{props.title}</span>
          </button>
          <button
            type="button"
            role="checkbox"
            className="ui-section-check"
            aria-checked={props.check.checked}
            aria-label={props.title}
            onClick={() => {
              const next = !props.check!.checked;
              props.check!.onChange(next);
              if (next && !open) toggle();
            }}
          >
            <CheckMark checked={props.check.checked} />
          </button>
        </div>
      ) : depth === 0 ? (
        <button type="button" className="ui-section-head" aria-expanded={open} onClick={toggle}>
          {twisty}
          <span>{props.title}</span>
        </button>
      ) : props.head ? (
        <div className="ui-prop-row has-head">
          <button
            type="button"
            className="ui-section-sub"
            aria-expanded={open}
            aria-label={props.title}
            onClick={toggle}
          >
            {twisty}
          </button>
          <div className="ui-prop-control">
            {props.head}
            {props.copy !== undefined && <CopyButton value={props.copy} label={props.title} />}
          </div>
        </div>
      ) : (
        // At its parent's depth (inherited), so the twisty sits where the parent's labels start.
        <div className="ui-prop-row">
          <button type="button" className="ui-section-sub" aria-expanded={open} onClick={toggle}>
            {twisty}
            <span>{props.title}</span>
          </button>
          <div className="ui-prop-control">
            {!open && props.summary}
            {props.copy !== undefined && <CopyButton value={props.copy} label={props.title} />}
          </div>
        </div>
      )}
      {shown && (
        <div
          className="ui-section-body"
          style={depth > 0 ? ({ '--ui-prop-depth': depth } as CSSProperties) : undefined}
        >
          {props.children}
        </div>
      )}
    </section>
  );
}

/**
 * Label column · value (Properties). Every value row has Copy (owner 2026-11-06: „warum fehlen bei
 * so vielen Einträgen die Copy-to-Clipboard-Buttons?"): it copies what the row shows unless `copy`
 * names the text; `copy={false}` only for rows without a value (toggles, actions).
 */
export function PropertyRow(props: {
  label: string;
  copy?: string | false | undefined;
  /**
   * The row can be removed (a table's key, owner 2026-11-07: „ich kann auch gar keine Keys
   * löschen"): × on row hover where Copy would be.
   */
  remove?: { readonly label: string; readonly onRemove: () => void } | undefined;
  /**
   * A check right behind the label (owner 2026-11-07, S11: „hinter Specification eine Checkbox"):
   * whether what the row names applies; its accessible name is the label.
   */
  check?:
    | {
        readonly checked: boolean;
        readonly onChange: (checked: boolean) => void;
        readonly disabledReason?: string | undefined;
      }
    | undefined;
  children: ReactNode;
}): JSX.Element {
  const control = useRef<HTMLDivElement>(null);
  const shown = () => {
    const root = control.current;
    if (!root) return '';
    const input = root.querySelector<HTMLInputElement>('input');
    if (input) return input.value;
    const choice = root.querySelector('.ui-field-value');
    if (choice) return choice.textContent?.trim() ?? '';
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.ui-copy').forEach((node) => node.remove());
    return clone.textContent?.trim() ?? '';
  };
  return (
    <div className="ui-prop-row">
      {props.check ? (
        <span className="ui-prop-label-check">
          <span className="ui-prop-label" data-tip-overflow>
            {props.label}
          </span>
          <button
            type="button"
            role="checkbox"
            className="ui-prop-check"
            aria-checked={props.check.checked}
            aria-label={props.label}
            disabled={props.check.disabledReason !== undefined}
            data-tip={props.check.disabledReason}
            onClick={() => props.check!.onChange(!props.check!.checked)}
          >
            <CheckMark checked={props.check.checked} />
          </button>
        </span>
      ) : (
        <span className="ui-prop-label" data-tip-overflow>
          {props.label}
        </span>
      )}
      <div ref={control} className="ui-prop-control">
        {props.children}
        {props.remove ? (
          <button
            type="button"
            className="ui-copy"
            aria-label={props.remove.label}
            data-tip={props.remove.label}
            onClick={props.remove.onRemove}
          >
            <X size={14} />
          </button>
        ) : (
          props.copy !== false && <CopyButton value={props.copy ?? shown} label={props.label} />
        )}
      </div>
    </div>
  );
}

/**
 * A computed value: plain text that wraps — a value is never cut (rules by construction: a cut
 * number or name shows something false). `mono` for numbers, `muted` for „none". `path` for a path
 * or file name: on one line, and when it does not fit it is cut at its start, so its end (the
 * folder or file name) stays; the whole path is in the tooltip. `nowrap` only for a section's
 * one-line summary.
 * With `onClick` it leads to its element (Part of: the line; a click selects it).
 */
export function ReadValue(props: {
  mono?: boolean | undefined;
  muted?: boolean | undefined;
  nowrap?: boolean | undefined;
  path?: boolean | undefined;
  italic?: boolean | undefined;
  onClick?: (() => void) | undefined;
  /** A name for where the link leads (tooltip). */
  tip?: string | undefined;
  /**
   * A list (what a selection holds: „1 Scan · 12 Survey points"): it wraps between the items only,
   * never inside one. Instead of children.
   */
  items?: readonly string[] | undefined;
  children?: ReactNode;
}): JSX.Element {
  if (props.items)
    return (
      <span className="ui-read is-list">
        {props.items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span>{i < props.items!.length - 1 ? `${item} ·` : item}</span>
          </Fragment>
        ))}
      </span>
    );
  const cls = `ui-read${props.mono ? ' is-mono' : ''}${props.muted ? ' is-muted' : ''}${props.nowrap ? ' is-nowrap' : ''}${props.path ? ' is-path' : ''}${props.italic ? ' is-italic' : ''}`;
  if (props.onClick)
    return (
      <button
        type="button"
        className={`${cls} is-link`}
        data-tip={props.tip}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  return (
    <span className={cls} data-tip-overflow>
      {props.path ? <bdi>{props.children}</bdi> : props.children}
    </span>
  );
}

/** Actions of a section (Update, Detach): a row of buttons under its rows. */
export function PropertyActions(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-prop-actions">{props.children}</div>;
}
