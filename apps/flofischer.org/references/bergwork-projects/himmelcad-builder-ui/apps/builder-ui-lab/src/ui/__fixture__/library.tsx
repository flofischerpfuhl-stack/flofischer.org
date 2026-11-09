import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Boxes, List } from 'lucide-react';

import '@himmelcad/theme/fonts.css';
import '@himmelcad/theme/tokens.css';
import '@himmelcad/theme/reset.css';
import {
  ImageValue,
  KeyList,
  Menu,
  MenuItem,
  MenuSection,
  MenuSub,
  LibraryMain,
  LibraryNav,
  LibraryTable,
  PropertyRow,
  ReadValue,
  Section,
  Sections,
  SelectField,
  Sheet,
  SourceRow,
  TableValue,
  TagField,
  TextField,
  type LibraryColumn,
  type SheetColumn,
} from '../index.js';
import './fixture.css';

/**
 * The library window's components (proposal, UI-LIBRARY.md › Proposed: library window) in their
 * states, for scripts/ui-lib-check.mjs › render. Each case sits in a `data-t` wrapper.
 */
const params = new URLSearchParams(location.search);
document.body.classList.add(params.get('theme') === 'light' ? 'hc-theme-light' : 'hc-theme-dark');

const noop = (): void => undefined;

interface Row {
  readonly code: string;
  readonly name: string;
  readonly depth: number;
  readonly kids: number;
  readonly note?: string;
  readonly context?: boolean;
  readonly pale?: boolean;
  readonly layer?: string;
}
// A root with children, a child with its own child, leaves, a free one without a code, a
// search's context row, an inherited look.
const ROWS: readonly Row[] = [
  { code: '20', name: 'Punkt allg', depth: 0, kids: 2, layer: '2-Punkte' },
  { code: '201', name: 'Grenzpunkt', depth: 1, kids: 1, note: 'Slot 2' },
  { code: '2011', name: 'Grenzstein mit einem sehr langen Namen', depth: 2, kids: 0, pale: true },
  { code: '21', name: 'Geländepunkt', depth: 0, kids: 0, context: true },
  { code: '', name: 'Zaun Nachbar', depth: 0, kids: 0 },
];
const Swatch = () => (
  <svg width="24" height="16" aria-hidden>
    <rect width="24" height="16" fill="currentColor" />
  </svg>
);
const COLUMNS: readonly LibraryColumn<Row>[] = [
  {
    kind: 'code',
    head: 'Code',
    cell: (r) => ({ code: r.code, marks: r.code === '201' ? ['20'] : [] }),
  },
  { kind: 'name', head: 'Name', cell: (r) => ({ name: r.name, note: r.note }) },
  { kind: 'look', head: 'Point', cell: (r) => ({ picture: <Swatch />, inherited: r.pale }) },
  { kind: 'look', head: 'Area', cell: (r) => (r.kids ? { picture: <Swatch /> } : null) },
  { kind: 'text', head: 'Layer', cell: (r) => ({ text: r.layer ?? '', none: 'Current layer' }) },
];
interface Flat {
  readonly code: string;
  readonly name: string;
  readonly depth: number;
}
const FLAT: readonly Flat[] = [
  { code: '110', name: 'Beton', depth: 0 },
  { code: '1125', name: 'Beton C25/30', depth: 1 },
];
const FLAT_COLUMNS: readonly LibraryColumn<Flat>[] = [
  { kind: 'code', head: 'Code', cell: (r) => ({ code: r.code }) },
  { kind: 'name', head: 'Name', cell: (r) => ({ name: r.name }) },
  { kind: 'swatch', head: 'Colour', cell: () => ({ picture: <Swatch /> }) },
  { kind: 'short', head: 'Size', cell: () => ({ text: '0.50 × 0.50 m', mono: true }) },
];

function Fixture(): JSX.Element {
  const [tags, setTags] = useState<readonly string[]>([
    'Erfassung',
    'Baum',
    'Brandschutz',
    'Physik',
  ]);
  const [point, setPoint] = useState(true);
  const [nav, setNav] = useState('all');
  return (
    <div className="fx">
      <div className="fx-lib" data-t="lib-table">
        <LibraryTable
          label="Specifications"
          tree
          columns={COLUMNS}
          rows={ROWS}
          row={(r) => ({
            id: r.name,
            depth: r.depth,
            expandable: r.kids > 0,
            expanded: true,
            selected: r.code === '201',
            context: r.context,
            play: {
              current: r.code === '20',
              label: `Draw with ${r.name}`,
              tip: 'Drawing specification',
              onPlay: noop,
            },
            add: { label: 'New child', onAdd: noop },
          })}
          empty={{ text: 'Nothing here' }}
          add={{ label: 'New specification', keyHint: 'Ctrl+N', onAdd: noop }}
          onRowClick={noop}
        />
      </div>
      <div className="fx-lib" data-t="lib-table-flat">
        <LibraryTable
          label="Materials"
          columns={FLAT_COLUMNS}
          rows={FLAT}
          row={(r) => ({ id: r.code, depth: r.depth })}
          empty={{ text: 'Nothing here' }}
          add={{ label: 'New material', onAdd: noop }}
          onRowClick={noop}
        />
      </div>
      <div className="fx-lib is-short" data-t="lib-main">
        <LibraryMain
          label="Materials"
          search={{
            label: 'Search materials',
            placeholder: 'Search code or name',
            value: '',
            onChange: noop,
          }}
          add={{ label: 'New material', keyHint: 'Ctrl+N', onAdd: noop }}
        >
          <LibraryTable
            label="Materials"
            columns={FLAT_COLUMNS}
            rows={FLAT}
            row={(r) => ({ id: r.code })}
            empty={{ text: 'Nothing here' }}
            onRowClick={noop}
          />
        </LibraryMain>
      </div>
      <div className="fx-lib is-short" data-t="lib-table-empty">
        <LibraryTable
          label="Search"
          columns={FLAT_COLUMNS}
          rows={[]}
          row={(r) => ({ id: r.code })}
          empty={{
            text: 'No specification matches „Zaun“',
            action: { label: 'New free specification „Zaun“', keyHint: 'Enter', onAction: noop },
          }}
          onRowClick={noop}
        />
      </div>
      {/* A menu of specifications by code (Find or create): the code on the name's line. */}
      <Menu label="Find" x={1000} y={600} onClose={noop}>
        <MenuItem code="141" onSelect={noop}>
          Zaunpunkt
        </MenuItem>
        <MenuItem code="" onSelect={noop}>
          Zaun Nachbar
        </MenuItem>
      </Menu>
      {/* The labels menu: a check row and a submenu row with its choice and its check. */}
      <Menu label="Shown" x={1000} y={300} onClose={noop}>
        {/* One group: its heading does not show (the menu's trigger names it). */}
        <MenuSection>Shown</MenuSection>
        <MenuItem kind="checkbox" checked onSelect={noop}>
          Height
        </MenuItem>
        <MenuSub label="Specification" hint="Code + Name" checked={false} onSelect={noop}>
          <MenuItem kind="radio" checked onSelect={noop}>
            Code
          </MenuItem>
        </MenuSub>
      </Menu>
      <div className="fx-lib-nav" data-t="lib-nav">
        <LibraryNav
          label="Catalogue"
          title="Specifications"
          views={[
            { id: 'all', label: 'All', icon: <List size={16} /> },
            { id: 'used', label: 'In this project', icon: <Boxes size={16} /> },
          ]}
          groups={[
            { id: 'g1', label: 'Topographie', code: '1' },
            { id: 'g2', label: 'Gelände', code: '2' },
            { id: 'free', label: 'Frei' },
          ]}
          value={nav}
          onChange={setNav}
        />
      </div>
      {/* Properties: one label column for the panel, as wide as its longest label. */}
      <div className="fx-lib-panel" data-t="lib-props">
        <Sections>
          <Section id="fx.lib.p.general" title="General" remember={false}>
            <PropertyRow label="Selection">
              <ReadValue items={['1 Scan', '1 Breakline', '1 Boundary', '12 Survey points']} />
            </PropertyRow>
            <PropertyRow label="Name">
              <TextField label="Name" value="Mixed" onCommit={noop} />
            </PropertyRow>
          </Section>
          <Section id="fx.lib.p.attributes" title="Attributes" remember={false}>
            <PropertyRow label="Kronendurchmesser">
              <TextField label="Kronendurchmesser" value="4.5 m" onCommit={noop} />
            </PropertyRow>
            <Section id="fx.lib.p.nested" title="Vertex 1" depth={1} remember={false} defaultOpen>
              <PropertyRow label="Total length 3D">
                <TextField label="Total length 3D" value="365.23 m" onCommit={noop} />
              </PropertyRow>
            </Section>
          </Section>
        </Sections>
      </div>
      <div className="fx-col">
        <div className="fx-lib-panel">
          <Sections>
            <Section id="fx.lib.attributes" title="Attributes" remember={false}>
              <div data-t="lib-row-text">
                <PropertyRow label="Name">
                  <TextField label="Name" value="Grenzpunkt" onCommit={noop} />
                </PropertyRow>
              </div>
              <div data-t="lib-row-select">
                <PropertyRow label="Layer">
                  <SelectField
                    label="Layer"
                    value="a"
                    options={[
                      ['a', '2-Punkte'],
                      ['b', '2-Linien'],
                    ]}
                    onChange={noop}
                  />
                </PropertyRow>
              </div>
              <div data-t="lib-tags">
                <PropertyRow label="Tables" copy={false}>
                  <TagField
                    label="Tables"
                    value={tags}
                    options={[['Tables', ['Erfassung', 'Baum', 'Brandschutz', 'Physik', 'Kosten']]]}
                    onChange={setTags}
                  />
                </PropertyRow>
              </div>
              <div data-t="lib-tags-one">
                <PropertyRow label="Shows" copy={false}>
                  <TagField
                    label="Shows"
                    value={['Name']}
                    options={[
                      ['Element', ['Name', 'Code']],
                      ['Keys', ['Baumart']],
                    ]}
                    onChange={noop}
                  />
                </PropertyRow>
              </div>
              <div data-t="lib-tags-empty">
                <PropertyRow label="Empty" copy={false}>
                  <TagField
                    label="Empty"
                    value={[]}
                    options={[['Tables', ['Baum']]]}
                    onChange={noop}
                  />
                </PropertyRow>
              </div>
              <div data-t="lib-image">
                <SourceRow label="Foto" copy={false}>
                  <ImageValue name="2001_baum_nord.jpg" size="4032 × 3024" onOpen={noop} />
                </SourceRow>
              </div>
              <div data-t="lib-source">
                <SourceRow label="Scale" from="20 Punkt allg" inherited>
                  <TextField label="Scale" value="0.60" mono onCommit={noop} />
                </SourceRow>
              </div>
            </Section>
            <div data-t="lib-check-on">
              <Section
                id="fx.lib.point"
                title="Point"
                remember={false}
                check={{ checked: point, onChange: setPoint }}
              >
                <PropertyRow label="Symbol">
                  <SelectField
                    label="Symbol"
                    value="x"
                    options={[['x', 'Punkt ×']]}
                    onChange={noop}
                  />
                </PropertyRow>
              </Section>
            </div>
            <div data-t="lib-check-off">
              <Section
                id="fx.lib.area"
                title="Area"
                remember={false}
                check={{ checked: false, onChange: noop }}
              >
                <PropertyRow label="Colour">
                  <TextField label="Colour" value="" onCommit={noop} />
                </PropertyRow>
              </Section>
            </div>
          </Sections>
        </div>
      </div>
    </div>
  );
}

// Tables (proposal 2026-11-07, attribute system): a grid with groups, elements as rows and every
// cell kind; keys as items with a Table key open to its columns.
const SHEET_COLUMNS: readonly SheetColumn[] = [
  { key: 'art', name: 'Baumart', type: 'text' },
  { key: 'stu', name: 'Stammumfang', type: 'number', unit: 'cm' },
  { key: 'foto', name: 'Foto', type: 'image' },
  { key: 'pflege', name: 'Pflegemaßnahmen', type: 'rows' },
  { key: 'jahr', name: 'Pflanzjahr', type: 'number' },
  { key: 'b1', name: 'Beschreibung 1', type: 'text' },
];
function Tables(): JSX.Element {
  const [selected, setSelected] = useState<readonly string[]>(['2002']);
  const [keys, setKeys] = useState<readonly string[]>(['Stammumfang']);
  const [open, setOpen] = useState(true);
  const type = (value: string) => ({
    value,
    options: [
      ['Text', 'Text'],
      ['Number', 'Number'],
      ['Table', 'Table · Pflegemaßnahme'],
    ] as const,
    onChange: noop,
  });
  return (
    <div className="fx-row">
      <div data-t="tbl-sheet">
        <Sheet
          label="Attribute table"
          columns={SHEET_COLUMNS}
          groups={[
            { code: 'AT10', name: 'Baum', span: 4, onOpen: noop },
            {
              code: 'AT12',
              name: 'Baumkataster',
              span: 1,
              source: 'Baumkataster.xlsx',
              onOpen: noop,
            },
            { code: '', name: 'Own', span: 1 },
          ]}
          rows={[
            {
              id: '2001',
              head: '2001',
              cells: [
                { kind: 'value', text: 'Quercus robur', editable: true },
                { kind: 'value', text: '120', editable: true },
                { kind: 'image', name: '2001_baum.jpg', size: '4032 × 3024', editable: true },
                { kind: 'rows', count: 3 },
                { kind: 'value', text: '1968', editable: false },
                { kind: 'value', text: 'Eiche', editable: true },
              ],
            },
            {
              id: '2002',
              head: '2002',
              cells: [
                { kind: 'value', text: '', editable: true },
                { kind: 'value', text: '95', editable: true, inherited: true },
                { kind: 'image', name: '', size: '', editable: true },
                { kind: 'rows', count: 0 },
                { kind: 'none' },
                { kind: 'value', text: 'Linde', editable: true },
              ],
            },
            {
              id: '1001',
              head: '1001',
              cells: [
                { kind: 'none' },
                { kind: 'none' },
                { kind: 'none' },
                { kind: 'none' },
                { kind: 'none' },
                { kind: 'value', text: 'Bord', editable: true },
              ],
            },
          ]}
          head="element"
          selected={selected}
          onSelected={setSelected}
          onEdit={noop}
          empty="No elements"
        />
      </div>
      <div className="fx-lib-panel" data-t="tbl-keys">
        <Sections>
          <Section id="fx.tbl.general" title="General" remember={false}>
            <PropertyRow label="Name">
              <TextField label="Name" value="Baum" onCommit={noop} />
            </PropertyRow>
            <PropertyRow label="Pflege" copy={false}>
              <TableValue label="Pflege" rows={3} onOpen={noop} />
            </PropertyRow>
          </Section>
          <Section id="fx.tbl.keys" title="Keys" remember={false}>
            <KeyList
              label="Keys"
              items={[
                { id: 'Baumart', name: 'Baumart', depth: 0, type: type('Text') },
                { id: 'Stammumfang', name: 'Stammumfang', depth: 0, type: type('Number') },
                {
                  id: 'Pflegemaßnahmen',
                  name: 'Pflegemaßnahmen',
                  depth: 0,
                  type: type('Table'),
                  expanded: open,
                  onToggle: () => setOpen(!open),
                },
                ...(open
                  ? [
                      { id: 'P/Datum', name: 'Datum', depth: 1 as const, type: type('Text') },
                      { add: 'New column', depth: 1 as const, onAdd: noop },
                    ]
                  : []),
                { add: 'New key', depth: 0, onAdd: noop },
              ]}
              selected={keys}
              onSelected={setKeys}
              renaming={null}
              onRenaming={noop}
              onRename={noop}
              menu={() => [{ label: 'Delete', shortcut: 'Del', onSelect: noop }]}
              onDelete={noop}
              empty="No keys"
            />
          </Section>
        </Sections>
      </div>
    </div>
  );
}

const root = document.getElementById('fixture');
if (!root) throw new Error('Missing #fixture');
createRoot(root).render(
  <StrictMode>
    <Fixture />
    <Tables />
  </StrictMode>,
);
