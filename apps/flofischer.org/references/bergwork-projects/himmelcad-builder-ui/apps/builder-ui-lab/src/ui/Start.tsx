import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { FolderSearch, Play, X } from 'lucide-react';
import { IconButton } from './Button.js';
import { tip } from './copy.js';
import { usePlacement, type AnchorRect } from './placement.js';
import './start.css';

/*
 * Start screen (proposal 2026-11-06, design/start-screen — UI-LIBRARY.md › Proposed: start screen;
 * not decided by the owner). Minecraft's title screen as the reference (owner: „Minecraft-
 * Startscreen-inspiriert … gerne bisschen anders wie der Rest, aber schon immer noch passend …
 * großes Bild einfach als Hintergrund und gerne eckig"); round 2 (2026-11-07): „Minecraft Splash
 * Screen meets himmelcad.com Website Design" — the world as a slowly drifting picture, the
 * website's wordmark, palette, cards and buttons, Minecraft's splash and world list. Opaque cards
 * (owner: „halbdurchsichtiger Hintergrund find ich scheiße"), always square.
 */

/**
 * The whole window before a project is open: the picture, the title, the centre column, the
 * window buttons at the top right and a quiet foot line. While it is shown the window has square
 * corners everywhere (`:root[data-screen='start']`), its menus included. Keys typed on it stay
 * on it.
 */
export function StartScreen(props: {
  label: string;
  /** The background picture (cover, drifting slowly; still with reduced motion). */
  image: string;
  /** `StartTitle`. */
  title: ReactNode;
  /** The window buttons (a `TitlePill kind="controls"`). */
  controls?: ReactNode | undefined;
  /** Quiet text at the bottom left (the version) and right. */
  foot?: ReactNode | undefined;
  footEnd?: ReactNode | undefined;
  /** Keys on the screen that no control took (Enter opens, Ctrl+N, Ctrl+O). */
  onKeyDown?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.screen = 'start';
    return () => {
      delete root.dataset.screen;
    };
  }, []);
  useEffect(() => {
    // The keyboard starts on the screen, so no key reaches what lies behind it.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      className="ui-start hc-theme-dark"
      role="region"
      aria-label={props.label}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (!event.defaultPrevented) props.onKeyDown?.(event);
        event.stopPropagation();
      }}
      onBlur={(event) => {
        // A field that lets go (Enter, Esc) hands the keyboard back to the screen, not the page.
        if (event.relatedTarget) return;
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) ref.current?.focus();
        });
      }}
    >
      <div className="ui-start-image" style={{ backgroundImage: `url(${props.image})` }} />
      {props.controls && <div className="ui-start-controls">{props.controls}</div>}
      <header className="ui-start-head">{props.title}</header>
      <main className="ui-start-main">{props.children}</main>
      <footer className="ui-start-foot">
        <span>{props.foot}</span>
        <span>{props.footEnd}</span>
      </footer>
    </div>
  );
}

/**
 * The wordmark as on himmelcad.com (the display face in cream, an ink outline and a hard ink
 * shadow, so it stands off any picture), the product as a tag under its start (Minecraft's „Java
 * Edition", the website's status tag), and the splash: a short line in the display face, tilted
 * and beating like Minecraft's (owner: „der schräge Text kann auch größer sein … soll sich auch
 * bewegen wie bei Minecraft"). The splash is decoration, not a name.
 */
export function StartTitle(props: { product: string; splash?: string | undefined }): JSX.Element {
  return (
    <h1 className="ui-start-title">
      <span className="ui-start-wordmark">himmel:CAD</span>
      {/* The band under the wordmark, in its em: the product tag at its start, the splash rising
          from its middle towards the wordmark's end — never into the wordmark or below the band. */}
      <span className="ui-start-band">
        <span className="ui-start-product">{props.product}</span>
        {props.splash && (
          <span className="ui-start-splash" aria-hidden>
            <span>{props.splash}</span>
          </span>
        )}
      </span>
    </h1>
  );
}

/**
 * The projects to pick from (Minecraft's world list): a heading with its count, then the rows; only
 * the rows scroll. One row is the current one (selected, framed white like Minecraft's); ↑/↓,
 * Home/End move it, Enter opens it. Rows are `StartProject`s.
 */
export function StartList(props: {
  label: string;
  /** The heading's end: the count, or tools. */
  meta?: ReactNode | undefined;
  /** The ids in their order (the keys step through them). */
  ids: readonly string[];
  active: string | null;
  onActive: (id: string) => void;
  onOpen: (id: string) => void;
  /** What the list says when it has no rows. */
  empty?: ReactNode | undefined;
  /** Take the keyboard when it appears (the start screen's first stop). */
  autoFocus?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { active, autoFocus } = props;
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  useEffect(() => {
    if (!active) return;
    ref.current
      ?.querySelector(`[data-start-id="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const { ids } = props;
    if (ids.length === 0) return;
    const at = active ? ids.indexOf(active) : -1;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else if (event.key === 'Enter' && active) {
      event.preventDefault();
      event.stopPropagation();
      props.onOpen(active);
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    props.onActive(ids[next]!);
  };
  return (
    <section className="ui-start-list hc-theme-light">
      <div className="ui-start-list-head">
        <span className="ui-start-list-title">{props.label}</span>
        {props.meta && <span className="ui-start-list-meta">{props.meta}</span>}
      </div>
      <div
        ref={ref}
        className="ui-start-list-rows"
        role="listbox"
        aria-label={props.label}
        aria-activedescendant={active ? `start-${active}` : undefined}
        tabIndex={0}
        onKeyDown={step}
      >
        {props.ids.length === 0 ? (
          <div className="ui-start-list-empty">{props.empty}</div>
        ) : (
          props.children
        )}
      </div>
    </section>
  );
}

/**
 * One project: its thumbnail (its last view), name, folder and when it was last opened. Hover shows
 * ▶ on the thumbnail (a click there opens it at once, as in Minecraft); a click selects, a
 * double-click opens. A project that is not where it was stays in the list as `missing`: dimmed, a
 * search glyph instead of ▶, „Not found" in red instead of the time — opening it means locating it.
 * `actions`: quiet icon buttons at the row's end (shown on hover and when selected).
 */
export function StartProject(props: {
  id: string;
  name: string;
  folder: string;
  /** When it was last opened, written out. */
  opened: string;
  thumb?: string | undefined;
  missing?: boolean | undefined;
  /** The text in place of the time when missing. */
  missingLabel?: string | undefined;
  selected?: boolean | undefined;
  actions?: ReactNode | undefined;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined;
}): JSX.Element {
  const openLabel = props.missing ? 'Locate' : 'Open';
  return (
    <div
      id={`start-${props.id}`}
      data-start-id={props.id}
      className={`ui-start-project${props.selected ? ' is-selected' : ''}${props.missing ? ' is-missing' : ''}`}
      role="option"
      aria-selected={props.selected ?? false}
      onPointerDown={(event) => {
        if (event.button === 0 || event.button === 2) props.onSelect();
      }}
      onDoubleClick={props.onOpen}
      onContextMenu={props.onContextMenu}
    >
      <span
        className="ui-start-thumb"
        data-tip={tip(openLabel)}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpen();
        }}
      >
        {props.thumb && !props.missing && <img src={props.thumb} alt="" draggable={false} />}
        <span className="ui-start-thumb-play" aria-hidden>
          {props.missing ? <FolderSearch /> : <Play fill="currentColor" />}
        </span>
      </span>
      <span className="ui-start-project-text">
        <span className="ui-start-project-name">{props.name}</span>
        <span className="ui-start-project-folder" data-tip-overflow>
          {props.folder}
        </span>
        <span className="ui-start-project-opened">
          {props.missing ? (
            <span className="ui-start-project-missing">{props.missingLabel ?? 'Not found'}</span>
          ) : (
            props.opened
          )}
        </span>
      </span>
      {props.actions && <span className="ui-start-project-actions">{props.actions}</span>}
    </div>
  );
}

/**
 * A start screen button, the website's: square, opaque, a 2 px border and a hard offset shadow,
 * heavy uppercase mono; hover lifts it, a press pushes it into its shadow. `blue` is the main way
 * in (New empty project), `cream` another (Open…), `dark` a utility. With `icon` and no children
 * it is a square icon button whose name is its tooltip (Minecraft's language and accessibility
 * buttons beside the row).
 */
export function StartButton(props: {
  label: string;
  variant?: 'blue' | 'cream' | 'dark' | undefined;
  icon?: ReactNode | undefined;
  keyHint?: string | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  /** It has opened its popout. */
  expanded?: boolean | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode | undefined;
}): JSX.Element {
  const square = props.children === undefined;
  return (
    <button
      type="button"
      className={`ui-start-button is-${props.variant ?? 'cream'}${square ? ' is-square' : ''}`}
      aria-label={square ? props.label : undefined}
      aria-haspopup={props.expanded !== undefined ? 'dialog' : undefined}
      aria-expanded={props.expanded}
      disabled={props.disabled}
      data-tip={
        props.disabled
          ? props.disabledReason
          : square
            ? tip(props.label, props.keyHint)
            : props.keyHint
      }
      onClick={props.onClick}
    >
      {props.icon}
      {!square && <span>{props.children}</span>}
    </button>
  );
}

/**
 * A popout window at its button (account and company): a head with the name, a quiet tag (In
 * development) and Close; the body below. Stays until Close, Esc or a press outside it.
 */
export function StartPopout(props: {
  label: string;
  anchor: AnchorRect;
  /** Which edge of its button it lines up with (`end`: a button at the row's end). */
  align?: 'start' | 'end' | undefined;
  /** A quiet tag after the name. */
  tag?: string | undefined;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => setWidth(ref.current?.offsetWidth ?? 0), []);
  const x = props.align === 'end' ? props.anchor.right - width : props.anchor.left;
  const placement = usePlacement(ref, x, props.anchor.bottom + 8, props.anchor);
  const { onClose } = props;
  useEffect(() => {
    ref.current?.focus();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Element;
      if (ref.current?.contains(target)) return;
      if (target.closest?.('[aria-haspopup][aria-expanded="true"]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="ui-start-popout hc-theme-light"
      role="dialog"
      aria-label={props.label}
      tabIndex={-1}
      style={placement}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="ui-start-popout-head">
        <span className="ui-start-popout-title">{props.label}</span>
        {props.tag && <span className="ui-start-tag">{props.tag}</span>}
        <IconButton size="tool" label="Close" icon={<X size={16} />} onClick={onClose} />
      </div>
      <div className="ui-start-popout-body">{props.children}</div>
    </div>
  );
}

/** A row in a popout: an icon, a name with a quiet second line, an action at the end. */
export function StartPopoutRow(props: {
  icon: ReactNode;
  name: string;
  detail?: string | undefined;
  action?: ReactNode | undefined;
}): JSX.Element {
  return (
    <div className="ui-start-popout-row">
      <span className="ui-start-popout-icon">{props.icon}</span>
      <span className="ui-start-popout-text">
        <span className="ui-start-popout-name">{props.name}</span>
        {props.detail && <span className="ui-start-popout-detail">{props.detail}</span>}
      </span>
      {props.action}
    </div>
  );
}

/**
 * The centre column's second page (Minecraft's „Create New World"): a heading, the form, the
 * buttons below it. Esc goes back.
 */
export function StartPage(props: {
  label: string;
  onBack: () => void;
  buttons: ReactNode;
  /** The form: its element, typing in it, keys before its fields take them (Enter creates). */
  bodyRef?: Ref<HTMLDivElement> | undefined;
  onInput?: (() => void) | undefined;
  onKeyDownCapture?: ((event: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className="ui-start-page hc-theme-light"
      aria-label={props.label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        props.onBack();
      }}
    >
      <div className="ui-start-list-head">
        <span className="ui-start-list-title">{props.label}</span>
      </div>
      <div
        ref={props.bodyRef}
        className="ui-start-page-body"
        onInput={props.onInput}
        onKeyDownCapture={props.onKeyDownCapture}
      >
        {props.children}
      </div>
      <div className="ui-start-buttons">{props.buttons}</div>
    </section>
  );
}

/** The row of buttons under the list (square icon buttons at its ends). */
export function StartButtons(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-start-buttons">{props.children}</div>;
}
