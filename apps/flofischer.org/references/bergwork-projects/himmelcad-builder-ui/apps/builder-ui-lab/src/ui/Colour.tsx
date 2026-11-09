// Colours (proposal 2026-11-07, owner review §1 — not approved yet): the Library's own colours with
// code and name, and a free colour from a wheel, hex or RGB (UI-LIBRARY › Proposed: colours).
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Button } from './Button.js';
import { Menu, MenuDivider, MenuItem, MenuSearch } from './Menu.js';
import { usePlacement, uiRoot } from './placement.js';
import { createPortal } from 'react-dom';
import './colour.css';

/** A colour of the Library: code, name, RGB as „r,g,b". */
export interface LibraryColour {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly rgb: string;
}

const parse = (rgb: string): [number, number, number] => {
  const [r = 0, g = 0, b = 0] = rgb.split(',').map(Number);
  return [r, g, b];
};
const hex = (rgb: string): string =>
  rgb
    ? `#${parse(rgb)
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()}`
    : '';
const fromHex = (text: string): string | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
function toHsv(rgb: string): [number, number, number] {
  const [r, g, b] = parse(rgb).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h =
    d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max === 0 ? 0 : d / max, max];
}
function fromHsv(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `${f(5)},${f(3)},${f(1)}`;
}
const css = (rgb: string) => `rgb(${rgb.split(',').join(' ')})`;

/** A swatch: the colour in a small rounded square; none is struck through. */
function Swatch(props: { rgb: string }): JSX.Element {
  return (
    <span
      className={`ui-colour-swatch${props.rgb ? '' : ' is-none'}`}
      style={props.rgb ? { background: css(props.rgb) } : undefined}
    />
  );
}

/**
 * A free colour (owner 2026-11-07: „frei eine erstellen mit so Colorwheel und Hex- und RGB-Codes"):
 * the hue on the ring, saturation and brightness in the square inside, hex and R G B below. Every
 * change is the colour at once; `onSave` offers „Save as colour…" (a Library colour of it).
 */
export function ColourPicker(props: {
  value: string;
  onChange: (rgb: string) => void;
  onSave?: (() => void) | undefined;
}): JSX.Element {
  const [hsv, setHsv] = useState(() => toHsv(props.value || '128,128,128'));
  const [h, s, v] = hsv;
  const wheel = useRef<HTMLDivElement>(null);
  const set = (next: [number, number, number]) => {
    setHsv(next);
    props.onChange(fromHsv(...next));
  };
  const drag = (event: ReactPointerEvent<HTMLDivElement>, part: 'ring' | 'square') => {
    event.preventDefault();
    const box = (part === 'ring' ? wheel.current! : event.currentTarget).getBoundingClientRect();
    const at = (x: number, y: number) => {
      if (part === 'ring') {
        const angle =
          (Math.atan2(y - (box.top + box.height / 2), x - (box.left + box.width / 2)) * 180) /
          Math.PI;
        set([(angle + 90 + 360) % 360, s, v]);
      } else {
        const sx = Math.min(1, Math.max(0, (x - box.left) / box.width));
        const vy = Math.min(1, Math.max(0, 1 - (y - box.top) / box.height));
        set([h, sx, vy]);
      }
    };
    at(event.clientX, event.clientY);
    const move = (e: PointerEvent) => at(e.clientX, e.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const rgb = fromHsv(h, s, v);
  const channel = (i: 0 | 1 | 2, label: string) => (
    <label className="ui-colour-channel">
      <span>{label}</span>
      <input
        className="ui-field is-mono"
        inputMode="numeric"
        aria-label={label}
        value={parse(rgb)[i]}
        onChange={(event) => {
          const n = Math.max(0, Math.min(255, Number(event.target.value.replace(/\D/g, '')) || 0));
          const next = parse(rgb);
          next[i] = n;
          set(toHsv(next.join(',')));
        }}
      />
    </label>
  );
  return (
    <div className="ui-colour-picker">
      <div
        ref={wheel}
        className="ui-colour-wheel"
        aria-label="Hue"
        role="slider"
        aria-valuenow={Math.round(h)}
        aria-valuemin={0}
        aria-valuemax={360}
        // The hues around the ring, red at the top (the colours are the content, not the look).
        style={{
          background: `conic-gradient(${[0, 60, 120, 180, 240, 300, 360].map((d) => `hsl(${d} 100% 50%)`).join(', ')})`,
        }}
        onPointerDown={(e) => drag(e, 'ring')}
      >
        <span className="ui-colour-ring-mark" style={{ rotate: `${h}deg` }} />
        <div
          className="ui-colour-square"
          role="slider"
          aria-label="Saturation and brightness"
          aria-valuenow={Math.round(s * 100)}
          style={{
            background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${h} 100% 50%))`,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            drag(e, 'square');
          }}
        >
          <span
            className="ui-colour-square-mark"
            style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
          />
        </div>
      </div>
      <div className="ui-colour-values">
        <label className="ui-colour-channel is-hex">
          <span>Hex</span>
          <input
            className="ui-field is-mono"
            aria-label="Hex"
            defaultValue={hex(rgb)}
            key={hex(rgb)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              const next = fromHex(event.currentTarget.value);
              if (next) set(toHsv(next));
            }}
            onBlur={(event) => {
              const next = fromHex(event.currentTarget.value);
              if (next) set(toHsv(next));
            }}
          />
        </label>
        {channel(0, 'R')}
        {channel(1, 'G')}
        {channel(2, 'B')}
      </div>
      {props.onSave && (
        <div className="ui-colour-actions">
          <Button onClick={props.onSave}>Save as colour…</Button>
        </div>
      )}
    </div>
  );
}

/**
 * A colour field (owner 2026-11-07: „eigene Farben mit Code und Name anlegen können und dann im
 * Dropdown aus ihnen wählen können oder auch frei eine erstellen"): the swatch and the Library
 * colour's code and name, or the free RGB. Its menu: the Library's colours, then Custom… — the
 * picker beside the field. A free colour stays a free RGB value; „Save as colour…" makes it one of
 * the Library's.
 */
export function ColourField(props: {
  label: string;
  value: string;
  colours: readonly LibraryColour[];
  /** Shown instead of the value (Mixed). */
  placeholder?: string | undefined;
  onChange: (rgb: string) => void;
  /** Make the current free colour a Library colour. */
  onSave?: ((rgb: string) => void) | undefined;
  /** Locked: why (the specification sets it). */
  disabledReason?: string | undefined;
  /**
   * „+ Custom colour…": a free colour from the wheel, hex or RGB — only outside the Library and in
   * free specifications (owner 2026-11-07, S7: „in der Library … nur vorangelegte auswählen").
   */
  custom?: boolean | undefined;
}): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const named = props.colours.find((c) => c.rgb === props.value);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="ui-field is-select ui-colour-field"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={!!menu || !!picker}
        disabled={props.disabledReason !== undefined}
        data-tip={props.disabledReason}
        onClick={(event) => {
          setPicker(null);
          setMenu(menu ? null : event.currentTarget.getBoundingClientRect());
        }}
      >
        <span className="ui-field-value">
          <Swatch rgb={props.value} />
          {props.placeholder ? (
            <span className="ui-colour-text is-placeholder">{props.placeholder}</span>
          ) : named ? (
            <span className="ui-colour-text">
              <span className="ui-colour-code">{named.code}</span>
              {named.name}
            </span>
          ) : (
            <span className={`ui-colour-text${props.value ? ' is-mono' : ' is-placeholder'}`}>
              {props.value ? props.value.split(',').join(' ') : 'None'}
            </span>
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
          onClose={() => {
            setMenu(null);
            setQuery('');
            setHover(null);
          }}
        >
          {/* The preview (S7: „wo man sieht, wie die gewählte Farbe dann aussieht"): the colour
              under the pointer, else the chosen one, with its code and name or RGB. */}
          {(() => {
            const shown = hover ?? props.value;
            const c = props.colours.find((x) => x.rgb === shown);
            return (
              <div className="ui-colour-preview" aria-hidden>
                <span
                  className={`ui-colour-preview-swatch${shown ? '' : ' is-none'}`}
                  style={shown ? { background: css(shown) } : undefined}
                />
                <span className="ui-colour-preview-text">
                  {c ? `${c.code} ${c.name}` : shown ? shown.split(',').join(' ') : 'None'}
                  <span>{shown ? `${hex(shown)} · ${shown.split(',').join(' ')}` : ''}</span>
                </span>
              </div>
            );
          })()}
          <MenuSearch
            label="Find colour"
            placeholder="Code or name"
            value={query}
            onChange={setQuery}
          />
          <div className="ui-menu-scroll is-compact" onPointerLeave={() => setHover(null)}>
            {props.colours
              .filter((c) => {
                const q = query.trim().toLowerCase();
                return !q || c.code.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q);
              })
              .map((c) => (
                <span key={c.id} onPointerEnter={() => setHover(c.rgb)} className="ui-colour-row">
                  <MenuItem
                    icon={<Swatch rgb={c.rgb} />}
                    code={c.code}
                    checked={c.rgb === props.value}
                    onSelect={() => {
                      setMenu(null);
                      setQuery('');
                      if (c.rgb !== props.value) props.onChange(c.rgb);
                    }}
                  >
                    {c.name}
                  </MenuItem>
                </span>
              ))}
          </div>
          {props.custom && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<Plus size={16} />}
                checked={!named && !!props.value}
                opens="window"
                onSelect={() => {
                  setPicker(menu);
                  setMenu(null);
                }}
              >
                Custom colour
              </MenuItem>
            </>
          )}
        </Menu>
      )}
      {picker && (
        <PickerPopover
          anchor={picker}
          value={props.value}
          onChange={props.onChange}
          onSave={props.onSave && !named ? () => props.onSave!(props.value) : undefined}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

function PickerPopover(props: {
  anchor: DOMRect;
  value: string;
  onChange: (rgb: string) => void;
  onSave?: (() => void) | undefined;
  onClose: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const placement = usePlacement(
    ref,
    props.anchor.left,
    props.anchor.bottom + 4,
    props.anchor,
    true,
  );
  return createPortal(
    <>
      <div className="ui-colour-scrim" onPointerDown={props.onClose} />
      <div
        ref={ref}
        className="ui-surface is-popover ui-colour-popover"
        role="dialog"
        aria-label="Custom colour"
        style={placement}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            props.onClose();
          }
        }}
      >
        <ColourPicker value={props.value} onChange={props.onChange} onSave={props.onSave} />
      </div>
    </>,
    uiRoot(),
  );
}
