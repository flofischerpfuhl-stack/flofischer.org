import type { CSSProperties, PointerEvent, ReactNode, Ref } from 'react';
import './surface.css';

export type SurfaceKind = 'large' | 'title' | 'status' | 'popover' | 'small';

/**
 * A floating surface over the view: chrome grey, a 1 px control line, the shadow — with one of
 * the decided radii. `large`: function bar, side panels (16). `title`: title pills (12, no
 * shadow). `status`: status group pills (12, no shadow, pill grey). `popover`: menus and dropdowns
 * (8, popover grey). `small`: any other small floating surface (8).
 */
export function Surface(props: {
  kind: SurfaceKind;
  as?: 'div' | 'section' | 'aside' | 'nav' | 'header' | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  role?: string | undefined;
  'aria-label'?: string | undefined;
  onPointerDown?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
  onPointerMove?: ((event: PointerEvent<HTMLDivElement>) => void) | undefined;
  surfaceRef?: Ref<HTMLDivElement> | undefined;
  children: ReactNode;
}): JSX.Element {
  const Tag = props.as ?? 'div';
  const kind = props.kind === 'small' ? '' : ` is-${props.kind}`;
  return (
    <Tag
      className={`ui-surface${kind}${props.className ? ` ${props.className}` : ''}`}
      style={props.style}
      role={props.role}
      aria-label={props['aria-label']}
      onPointerDown={props.onPointerDown}
      onPointerMove={
        props.onPointerMove as ((event: PointerEvent<HTMLElement>) => void) | undefined
      }
      ref={props.surfaceRef as Ref<never> | undefined}
    >
      {props.children}
    </Tag>
  );
}
