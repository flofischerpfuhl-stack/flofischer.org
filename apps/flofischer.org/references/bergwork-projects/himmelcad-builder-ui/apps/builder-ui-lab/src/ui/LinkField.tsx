// A resource a row links to, with a check (proposal 2026-11-07, owner review S11/S12 — not
// approved yet): „hinter Specification eine Checkbox … Name natürlich klickbar und mit >-Button".
import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Menu, MenuDivider, MenuItem, MenuSearch } from './Menu.js';
import './linkfield.css';

/**
 * A linked resource in a Properties row: its name as a link (opens it; the code in the tooltip),
 * and `>` (choose another; the menu's last rows are the field's actions). Whether it applies is
 * the row's check (PropertyRow `check`).
 */
export function LinkField(props: {
  label: string;
  /** In the link's tooltip with the name (the row is too narrow for both). */
  code?: string | undefined;
  name: string;
  /** Opens the resource (the Library on it). */
  onOpen: () => void;
  /** What `>` offers: the resources to choose, by code and name. */
  options: readonly { readonly id: string; readonly code: string; readonly name: string }[];
  value: string;
  onChange: (id: string) => void;
  /** Rows after the options (New specification from this…). */
  actions?: readonly { readonly label: string; readonly onSelect: () => void }[] | undefined;
  disabledReason?: string | undefined;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState('');
  const more = useRef<HTMLButtonElement>(null);
  const disabled = props.disabledReason !== undefined;
  const q = query.trim().toLowerCase();
  return (
    <div className="ui-field is-select ui-linkfield" role="group" aria-label={props.label}>
      <button
        type="button"
        className="ui-linkfield-link"
        data-tip={props.code ? `${props.code} ${props.name}` : props.name}
        onClick={props.onOpen}
      >
        <span className="ui-linkfield-name">{props.name}</span>
      </button>
      <button
        ref={more}
        type="button"
        className="ui-field-more ui-linkfield-more"
        aria-label={`Choose ${props.label.toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        disabled={disabled}
        data-tip={disabled ? props.disabledReason : undefined}
        onClick={(event) => {
          const box = event.currentTarget.parentElement!.getBoundingClientRect();
          setMenu(menu ? null : box);
        }}
      >
        <ChevronRight size={14} strokeWidth={2} />
      </button>
      {menu && (
        <Menu
          label={props.label}
          x={menu.left}
          y={menu.bottom + 4}
          anchor={menu}
          minWidth={menu.width}
          returnFocus={more.current}
          onClose={() => {
            setMenu(null);
            setQuery('');
          }}
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
              .slice(0, 60)
              .map((o) => (
                <MenuItem
                  key={o.id}
                  code={o.code}
                  checked={o.id === props.value}
                  onSelect={() => {
                    setMenu(null);
                    setQuery('');
                    props.onChange(o.id);
                  }}
                >
                  {o.name}
                </MenuItem>
              ))}
          </div>
          {props.actions?.length ? (
            <>
              <MenuDivider />
              {props.actions.map((a) => (
                <MenuItem
                  key={a.label}
                  opens="window"
                  onSelect={() => {
                    setMenu(null);
                    a.onSelect();
                  }}
                >
                  {a.label}
                </MenuItem>
              ))}
            </>
          ) : null}
        </Menu>
      )}
    </div>
  );
}
