// Subset of a selection (proposal 2026-11-07, owner review §9 — not approved yet): Properties of a
// multi-selection edit a part of it without losing the selection (UI-LIBRARY › Proposed: subset).
import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Menu, MenuDivider, MenuItem, MenuSub } from './Menu.js';
import './field.css';
import './subset.css';

/** One group of the selection under the chosen grouping (a layer, a folder, a type). */
export interface SubsetGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

/**
 * „Multiple" in a multi-selection's Properties (owner 2026-11-07: „hier sollte ‚Multiple' einfach
 * stehen … im Dropdown die auswählen können … oben ein weiteres Dropdown, wo man auswählen kann, ob
 * die Elemente nach Layer, Tree, Type, Folder gruppiert sein sollen"). The field says what
 * Properties edit — Multiple (all) or „3 of 12"; its menu: the grouping as a row named by its
 * choice, All, then one row per group (its check takes the whole group, pale when part of it is
 * chosen; its submenu the single elements). The selection itself stays as it is.
 */
export function SubsetField(props: {
  label: string;
  groupings: readonly (readonly [id: string, label: string])[];
  grouping: string;
  onGrouping: (id: string) => void;
  groups: readonly SubsetGroup[];
  /** The ids Properties edit (every id: the whole selection). */
  value: readonly string[];
  onChange: (ids: readonly string[]) => void;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const button = useRef<HTMLButtonElement>(null);
  const all = props.groups.flatMap((g) => g.items.map((i) => i.id));
  const chosen = new Set(props.value);
  const whole = all.every((id) => chosen.has(id));
  // While the whole selection is edited, a click starts a subset: the group or element alone.
  const toggle = (ids: readonly string[]) => {
    const base = whole ? [] : props.value;
    const on = ids.every((id) => base.includes(id));
    const next = on ? base.filter((id) => !ids.includes(id)) : [...new Set([...base, ...ids])];
    // Nothing chosen is no subset: back to the whole selection.
    props.onChange(next.length ? all.filter((id) => next.includes(id)) : all);
  };
  const groupingLabel = props.groupings.find(([id]) => id === props.grouping)?.[1] ?? '';
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
          {whole ? 'Multiple' : `${props.value.length} of ${all.length}`}
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
          onClose={() => setMenu(null)}
        >
          <MenuSub label={`By ${groupingLabel.toLowerCase()}`} menuLabel="Group by">
            {props.groupings.map(([id, label]) => (
              <MenuItem
                key={id}
                checked={id === props.grouping}
                onSelect={() => props.onGrouping(id)}
              >
                {label}
              </MenuItem>
            ))}
          </MenuSub>
          <MenuDivider />
          <MenuItem
            kind="checkbox"
            checked={whole}
            hint={String(all.length)}
            onSelect={() => props.onChange(all)}
          >
            All
          </MenuItem>
          {/* Groups open in place (owner 2026-11-07, S3: „im Dropdown aufklappen … ohne
              Sub-Dropdown … eingerückt"): a twisty, the group's check takes all of it; its
              elements indented below, without counts. */}
          <div className="ui-menu-scroll is-compact">
            {props.groups.map((group) => {
              const ids = group.items.map((i) => i.id);
              const n = ids.filter((id) => chosen.has(id)).length;
              const isOpen = open.has(group.id);
              return (
                <div key={group.id} role="group" aria-label={group.label}>
                  <div className="ui-subset-row">
                    <button
                      type="button"
                      className="ui-subset-twisty"
                      aria-label={isOpen ? `Close ${group.label}` : `Open ${group.label}`}
                      aria-expanded={isOpen}
                      onClick={() => {
                        const next = new Set(open);
                        if (isOpen) next.delete(group.id);
                        else next.add(group.id);
                        setOpen(next);
                      }}
                    >
                      <ChevronRight size={14} className={isOpen ? 'is-open' : undefined} />
                    </button>
                    <MenuItem
                      kind="checkbox"
                      checked={!whole && n > 0}
                      pale={!whole && n > 0 && n < ids.length}
                      onSelect={() => toggle(ids)}
                    >
                      {group.label}
                    </MenuItem>
                  </div>
                  {isOpen &&
                    group.items.map((item) => (
                      <div key={item.id} className="ui-subset-row is-child">
                        <MenuItem
                          kind="checkbox"
                          checked={!whole && chosen.has(item.id)}
                          onSelect={() => toggle([item.id])}
                        >
                          {item.label}
                        </MenuItem>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </Menu>
      )}
    </>
  );
}
