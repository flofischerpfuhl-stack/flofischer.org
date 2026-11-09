// A resource field (proposal 2026-11-07, owner review S18/S19 — not approved yet): „Linetype ist
// einfach ein Dropdown mit Suche, wo es auch ein + gibt, wo als Subpopup wieder eine neue freie
// Konfiguration machen lässt" — for every resource: linetype, fill, hatch, symbol, colour.
import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Menu, MenuDivider, MenuItem, MenuSearch } from './Menu.js';
import './field.css';

/**
 * A searchable dropdown of the Library's entries (code and name) and, last, „+ Free …": it opens
 * the free one's own definition (the owner's sub-popup), where the same fields nest again — Fill ›
 * Hatch › Line › Colour. A free value shows its name; `>` opens the list.
 */
export function ResourceField(props: {
  label: string;
  value: string;
  options: readonly { readonly id: string; readonly code: string; readonly name: string }[];
  /** What a value outside the options is called (a free one). */
  freeName?: string | undefined;
  onChange: (id: string) => void;
  /** „+ Free …": make a free one and open its definition. */
  onCreate?: (() => void) | undefined;
  /** Open the free one's definition again. */
  onEdit?: (() => void) | undefined;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const chosen = props.options.find((o) => o.id === props.value);
  const q = query.trim().toLowerCase();
  const close = () => {
    setMenu(null);
    setQuery('');
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className="ui-field is-select"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(event) => setMenu(menu ? null : event.currentTarget.getBoundingClientRect())}
      >
        <span className="ui-field-value">
          {chosen ? (
            <>
              <span className="ui-resource-code">{chosen.code}</span> {chosen.name}
            </>
          ) : (
            (props.freeName ?? (props.value ? props.value : 'None'))
          )}
        </span>
        <span className="ui-field-more" aria-hidden>
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </button>
      {menu && (
        <Menu
          label={props.label}
          x={menu.left}
          y={menu.bottom + 4}
          anchor={menu}
          minWidth={menu.width}
          returnFocus={button.current}
          onClose={close}
        >
          <MenuSearch
            label={`Find ${props.label.toLowerCase()}`}
            placeholder="Code or name"
            value={query}
            onChange={setQuery}
          />
          <div className="ui-menu-scroll is-compact">
            {props.options
              .filter(
                (o) => !q || o.code.toLowerCase().startsWith(q) || o.name.toLowerCase().includes(q),
              )
              .slice(0, 80)
              .map((o) => (
                <MenuItem
                  key={o.id}
                  code={o.code}
                  checked={o.id === props.value}
                  onSelect={() => {
                    close();
                    props.onChange(o.id);
                  }}
                >
                  {o.name}
                </MenuItem>
              ))}
          </div>
          {(props.onCreate || (props.onEdit && !chosen && props.value)) && <MenuDivider />}
          {props.onEdit && !chosen && props.value && (
            <MenuItem
              opens="window"
              checked
              onSelect={() => {
                close();
                props.onEdit!();
              }}
            >
              {props.freeName ?? 'Free'}
            </MenuItem>
          )}
          {props.onCreate && (
            <MenuItem
              opens="window"
              onSelect={() => {
                close();
                props.onCreate!();
              }}
            >
              {`New free ${props.label.toLowerCase()}`}
            </MenuItem>
          )}
        </Menu>
      )}
    </>
  );
}
