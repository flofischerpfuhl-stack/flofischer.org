import {
  createContext,
  forwardRef,
  useId,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEventHandler,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
  type ReactNode,
} from 'react';

import styles from './BaseControls.module.css';
import { nextLinearIndex } from './controlInteractions.js';
import {
  boxOf,
  useFloatingPlacement,
  useKeepInViewport,
  type FloatingRequest,
} from './floating.js';
import { Tooltip } from './Tooltip.js';
import { registerEscapeRung } from './escapeLadder.js';

interface MenuContextValue {
  close: () => void;
  markFocused: (item: HTMLButtonElement) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export interface MenuProps {
  children: ReactNode;
  onClose: () => void;
  id?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  menuRef?: Ref<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /**
   * Where the menu opens (next to a trigger, or at a pointer), placed by the shared floating
   * rule (`floating.ts`): flipped, shifted and height-limited to stay inside the window.
   * Without it the caller's position is kept and only shifted back inside the window.
   */
  placement?: FloatingRequest;
  /**
   * The button that opened the menu. A press on it does not count as "outside": its own click
   * toggles the menu (a second click on an open menu's trigger closes it, like a desktop menu
   * bar), instead of the press closing the menu and the click opening it again.
   */
  triggerRef?: RefObject<HTMLElement | null>;
}

/**
 * Whether a press at `target` closes a menu (`root`) opened by `trigger`: anywhere outside both.
 * The trigger handles its own click (toggle). Pure; shared by the menus and the chrome popovers.
 */
export function pressClosesMenu(
  target: Node | null,
  root: Node | null | undefined,
  trigger?: Node | null,
): boolean {
  if (!target) return true;
  if (root?.contains(target)) return false;
  if (trigger?.contains(target)) return false;
  return true;
}

export function Menu({
  children,
  onClose,
  id,
  ariaLabel = 'Menu',
  className,
  style,
  autoFocus = true,
  menuRef,
  onKeyDown,
  placement,
  triggerRef,
}: MenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useFloatingPlacement(ref, placement ?? null);
  useKeepInViewport(ref, !placement);

  useEffect(() => registerEscapeRung('menu', () => (onClose(), true)), [onClose]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (pressClosesMenu(event.target as Node | null, ref.current, triggerRef?.current)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose, triggerRef]);

  useEffect(() => {
    if (!autoFocus) return;
    queueMicrotask(() => {
      const first = menuItems(ref.current)[0];
      if (first) first.tabIndex = 0;
      first?.focus();
    });
  }, [autoFocus]);

  return (
    <MenuContext.Provider
      value={{
        close: onClose,
        markFocused: (item) => markFocusedMenuItem(menuItems(ref.current), item),
      }}
    >
      <div
        ref={(node) => {
          ref.current = node;
          setRef(menuRef, node);
        }}
        role="menu"
        id={id}
        aria-label={ariaLabel}
        className={className ? `${styles.menu} ${className}` : styles.menu}
        style={style}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if ((event.target as Element).closest('[role="menu"]') !== event.currentTarget) return;
          const items = menuItems(ref.current);
          if (items.length === 0) return;
          const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = nextLinearIndex(
              current,
              items.length,
              event.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
              'vertical',
            );
            moveMenuFocus(items, next);
          }
        }}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export interface ContextMenuProps extends MenuProps {
  x: number;
  y: number;
}

/** A menu at a pointer (x, y): right of and below it, flipped or shifted to stay inside the window. */
export function ContextMenu({ x, y, style, ...props }: ContextMenuProps): JSX.Element {
  return (
    <Menu
      {...props}
      style={{ ...style, position: 'fixed', left: x, top: y }}
      placement={{ point: { x, y } }}
    />
  );
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  onSelect?: () => void;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { onSelect, onClick, disabled, children, className, onFocus, onBlur, title, ...props },
  forwardedRef,
) {
  const menu = useContext(MenuContext);
  const item = (
    <button
      {...props}
      ref={forwardedRef}
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={`${styles.menuItem} ${className ?? ''}`.trim()}
      onFocus={(event) => {
        onFocus?.(event);
        menu?.markFocused(event.currentTarget);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        event.currentTarget.removeAttribute('data-focused');
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) return;
        onSelect?.();
        menu?.close();
      }}
    >
      {children}
    </button>
  );
  // A row's note (often why it is unavailable) as the design-system tip beside the menu, not a
  // browser-drawn `title` that cannot be kept inside the window.
  if (!title) return item;
  return (
    <Tooltip content={title} side="right" describeDisabled anchorClassName={styles.menuItemAnchor}>
      {item}
    </Tooltip>
  );
});

MenuItem.displayName = 'MenuItem';

export interface MenuSubmenuProps {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly defaultOpen?: boolean;
  readonly hoverOpenDelay?: number;
}

/** A menu row whose child menu follows the ARIA menubar keyboard convention. */
export function MenuSubmenu({
  label,
  children,
  ariaLabel,
  className,
  defaultOpen = false,
  hoverOpenDelay = 150,
}: MenuSubmenuProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFirstOnOpen = useRef(false);
  /** A submenu the pointer opened stays open on the click that follows; one a click opened toggles. */
  const openedByClick = useRef(false);
  const submenuId = useId();

  const clearTimers = (): void => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  const openSubmenu = (focusFirst: boolean): void => {
    clearTimers();
    focusFirstOnOpen.current ||= focusFirst;
    setOpen(true);
  };
  const closeSubmenu = (restoreFocus: boolean): void => {
    clearTimers();
    focusFirstOnOpen.current = false;
    setOpen(false);
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  };

  useEffect(() => clearTimers, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !submenuRef.current) return;
    if (focusFirstOnOpen.current) {
      focusFirstOnOpen.current = false;
      moveMenuFocus(menuItems(submenuRef.current), 0);
    }
  }, [open]);

  const scheduleOpen = (): void => {
    if (open || openTimer.current !== null) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      openedByClick.current = false;
      setOpen(true);
    }, hoverOpenDelay);
  };
  const scheduleClose = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    openTimer.current = null;
    // The submenu overlaps the trigger by two pixels. This grace period also
    // preserves it while the pointer crosses diagonally toward the child menu.
    closeTimer.current = setTimeout(() => closeSubmenu(false), Math.max(hoverOpenDelay, 300));
  };

  return (
    <span
      className={styles.submenuHost}
      onPointerEnter={() => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
        closeTimer.current = null;
        scheduleOpen();
      }}
      onPointerLeave={scheduleClose}
    >
      <MenuItem
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? submenuId : undefined}
        onClick={(event) => {
          event.preventDefault();
          if (open && openedByClick.current) {
            openedByClick.current = false;
            closeSubmenu(false);
          } else {
            openedByClick.current = true;
            openSubmenu(false);
          }
        }}
        onKeyDown={(event) => {
          if (submenuKeyboardAction(event.key, false) !== 'open') return;
          event.preventDefault();
          event.stopPropagation();
          openSubmenu(true);
        }}
      >
        {label}
      </MenuItem>
      {open ? (
        <Menu
          id={submenuId}
          menuRef={submenuRef}
          triggerRef={triggerRef}
          onClose={() => closeSubmenu(false)}
          ariaLabel={ariaLabel}
          {...(className ? { className } : {})}
          autoFocus={false}
          // Beside its row (right, else left), shifted up when it would leave the window.
          placement={{
            anchor: () => boxOf(triggerRef.current),
            side: 'right',
            align: 'start',
            gap: -2,
          }}
          onKeyDown={(event) => {
            if (submenuKeyboardAction(event.key, true) !== 'close') return;
            event.preventDefault();
            event.stopPropagation();
            closeSubmenu(true);
          }}
        >
          {children}
        </Menu>
      ) : null}
    </span>
  );
}

interface SubmenuRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

export interface SubmenuPosition {
  readonly x: number;
  readonly y: number;
  readonly side: 'left' | 'right';
}

export function getSubmenuPosition(
  parent: SubmenuRect,
  submenu: Pick<SubmenuRect, 'width'>,
  viewportWidth: number,
  overlap = 2,
): SubmenuPosition {
  const rightX = parent.right - overlap;
  return rightX + submenu.width <= viewportWidth
    ? { x: rightX, y: parent.top, side: 'right' }
    : { x: parent.left - submenu.width + overlap, y: parent.top, side: 'left' };
}

export function submenuKeyboardAction(
  key: string,
  insideSubmenu: boolean,
): 'open' | 'close' | null {
  if (!insideSubmenu && key === 'ArrowRight') return 'open';
  if (insideSubmenu && key === 'ArrowLeft') return 'close';
  return null;
}

export function MenuSeparator(): JSX.Element {
  return <div role="separator" className={styles.menuSeparator} />;
}

function menuItems(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  ).filter((item) => item.closest('[role="menu"]') === root);
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

type RovingMenuItem = Pick<
  HTMLButtonElement,
  'focus' | 'removeAttribute' | 'setAttribute' | 'tabIndex'
>;

export function moveMenuFocus(items: RovingMenuItem[], next: number): void {
  const nextItem = items[next];
  if (!nextItem) return;
  for (const item of items) {
    item.tabIndex = item === nextItem ? 0 : -1;
    item.removeAttribute('data-focused');
  }
  nextItem.setAttribute('data-focused', 'true');
  nextItem.focus();
}

function markFocusedMenuItem(items: HTMLButtonElement[], focused: HTMLButtonElement): void {
  for (const item of items) {
    if (item === focused) item.setAttribute('data-focused', 'true');
    else item.removeAttribute('data-focused');
  }
}
