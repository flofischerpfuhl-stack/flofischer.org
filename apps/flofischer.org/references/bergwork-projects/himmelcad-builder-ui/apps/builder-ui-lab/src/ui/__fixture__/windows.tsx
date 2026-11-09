import { useState } from 'react';
import { Copy, Folder, Image, Mountain, PenLine, Plus, Spline, Trash2, Undo2 } from 'lucide-react';
import {
  Card,
  CardRow,
  CompanySwitcher,
  CodeCell,
  Confirm,
  DataTable,
  InlineField,
  InspectorColumn,
  KindCards,
  NameCell,
  PageContent,
  PageHead,
  PageToolbar,
  PropertyRow,
  ReadValue,
  Section,
  Sections,
  Tag,
  TileGrid,
  ValueList,
  WorkAside,
  WorkFoot,
  WorkHead,
  WorkSide,
  WorkStage,
  WorkWindow,
} from '../index.js';

/** The manager and work window proposals in their states (UI-LIBRARY.md › Proposed). */
const noop = (): void => undefined;
const CONFIRM = new URLSearchParams(location.search).has('confirm');
const icon = <Folder size={16} />;
const swatch = (
  <svg viewBox="0 0 10 10" aria-hidden>
    <rect width="10" height="10" fill="currentColor" />
  </svg>
);

export function WindowsFixture(): JSX.Element {
  const [chosen, setChosen] = useState('a');
  return (
    <>
      {/* ---- Manager: the switcher at the sidebar's width (a long name, a long path) ---- */}
      <div className="fx-switcher" data-t="switcher">
        <CompanySwitcher
          name="Kranich Vermessung und Geoinformation GmbH"
          initials="KV"
          detail={'\\\\server\\Firma\\Vermessung\\HimmelCAD'}
          open={false}
          onClick={noop}
        />
      </div>
      {/* ---- Manager: page, cards, tables, tiles, inspector ---- */}
      <div className="fx-manager" data-t="manager">
        <div className="fx-manager-page">
          <PageHead
            title="Transformations"
            path="\\server\Firma\HimmelCAD\Transformations"
            meta="4 files"
            actions={[
              { label: 'Show in folder', onClick: noop },
              { label: 'Add files…', onClick: noop },
            ]}
          />
          <PageToolbar
            search={<span data-t="toolbar-search">Search</span>}
            view={{
              label: 'Show as',
              value: 'grid',
              options: [
                ['grid', 'Tiles', <Image key="g" size={16} />],
                ['list', 'List', <Copy key="l" size={16} />],
              ],
              onChange: noop,
            }}
          />
          <PageContent>
            <div data-t="kind-cards">
              <KindCards
                cards={[
                  {
                    id: 'a',
                    icon,
                    name: 'Tables',
                    count: 3,
                    detail: 'Changed 4 Nov',
                    onOpen: noop,
                  },
                  {
                    id: 'b',
                    icon,
                    name: 'Grids',
                    count: 5,
                    detail: '',
                    problem: '1 problem',
                    onOpen: noop,
                  },
                ]}
              />
            </div>
            <CardRow>
              <div data-t="card-rows">
                <Card title="New projects">
                  <PropertyRow label="Table" copy={false}>
                    <ReadValue>Codeliste 2026</ReadValue>
                  </PropertyRow>
                </Card>
              </div>
              <div data-t="card-table">
                <Card title="Problems">
                  <DataTable
                    label="Problems"
                    headless
                    columns={[
                      { name: 'Name', kind: 'name' },
                      { name: 'Kind', kind: 'muted' },
                    ]}
                    rows={[
                      {
                        id: 'p1',
                        cells: [
                          <NameCell
                            key="n"
                            icon={icon}
                            name="Testgebiet alt"
                            tags={<Tag tone="error">Not an NTv2 file</Tag>}
                          />,
                          'Grids',
                        ],
                        onSelect: noop,
                      },
                    ]}
                  />
                </Card>
              </div>
              <div data-t="card-empty">
                <Card title="Problems" empty="None" />
              </div>
            </CardRow>
            <div data-t="table">
              <DataTable
                label="Transformations"
                columns={[
                  { name: 'Name', kind: 'name' },
                  { name: 'From', kind: 'code' },
                  { name: 'Size', kind: 'number' },
                  { name: 'Modified', kind: 'date' },
                  { name: 'Changed in', kind: 'tag' },
                ]}
                rows={['a', 'b', 'c'].map((id) => ({
                  id,
                  selected: id === chosen,
                  cells: [
                    <NameCell
                      key="n"
                      icon={icon}
                      name={`UTM32 → GK3 ${id}`}
                      tags={id === 'a' ? <Tag>Default</Tag> : undefined}
                    />,
                    <CodeCell key="c" code="25832" name="ETRS89 / UTM 32N" />,
                    '2 KB',
                    '5 Nov 2026',
                    <Tag key="t">App</Tag>,
                  ],
                  onSelect: () => setChosen(id),
                }))}
              />
            </div>
            <div data-t="table-empty">
              <DataTable
                label="Empty"
                columns={[{ name: 'Name', kind: 'name' }]}
                rows={[]}
                empty="No files"
              />
            </div>
            <div data-t="tiles">
              <TileGrid
                label="Textures"
                tiles={['t1', 't2'].map((id) => ({
                  id,
                  preview: swatch,
                  name: `Pflaster ${id}`,
                  detail: '1.00 m · 2048 × 2048',
                  selected: id === 't1',
                  onSelect: noop,
                }))}
              />
            </div>
          </PageContent>
        </div>
        <div className="fx-manager-inspector" data-t="inspector">
          <InspectorColumn
            icon={icon}
            title="UTM32 → GK3"
            tools={[
              { label: 'Duplicate', icon: <Copy size={16} />, onClick: noop },
              { label: 'Delete', keyHint: 'Del', icon: <Trash2 size={16} />, onClick: noop },
            ]}
            preview={swatch}
            primary={{ label: 'Edit in Library', onClick: noop }}
          >
            <Sections>
              <Section id="fx.inspector" title="General" remember={false}>
                <PropertyRow label="File">
                  <ReadValue mono>UTM32 → GK3.hcimport</ReadValue>
                </PropertyRow>
                <PropertyRow label="Used by" copy={false}>
                  <ValueList
                    empty="Nothing"
                    openTip="Open"
                    items={[
                      { id: 'u1', label: 'UTM32 → GK3', onOpen: noop },
                      { id: 'u2', label: 'GK3 → UTM32', onOpen: noop },
                    ]}
                  />
                </PropertyRow>
                <PropertyRow label="Uses" copy={false}>
                  <span data-t="value-list-empty">
                    <ValueList empty="Nothing" items={[]} />
                  </span>
                </PropertyRow>
              </Section>
            </Sections>
          </InspectorColumn>
        </div>
      </div>

      {/* ---- Work window: head, sources, view, issues, foot, the close question ---- */}
      <div className="fx-work" data-t="work">
        <WorkWindow
          label="Create surface"
          head={
            <WorkHead
              icon={<Mountain size={16} />}
              title="Surface 1"
              state="Draft"
              onRename={noop}
              tools={[
                { label: 'Undo', keyHint: 'Ctrl+Z', icon: <Undo2 size={16} />, onClick: noop },
                'divider',
                { label: 'Close', icon: <Trash2 size={16} />, expanded: true, onClick: noop },
              ]}
            />
          }
          side={
            <WorkSide
              label="Sources"
              sections={[
                {
                  title: 'Sources',
                  tree: true,
                  tools: [{ label: 'Add selection', icon: <Plus size={16} />, onClick: noop }],
                  rows: [
                    {
                      type: 'source',
                      key: 'cloud',
                      depth: 0,
                      icon,
                      name: 'Road scan',
                      count: '438.8 k',
                      twisty: null,
                      selected: false,
                      onClick: noop,
                      role: { fixed: true, icon, value: 'Points' },
                    },
                    {
                      type: 'source',
                      key: 'top',
                      depth: 0,
                      icon: <Spline size={16} />,
                      name: 'Embankment top',
                      count: '2',
                      twisty: true,
                      selected: true,
                      onClick: noop,
                      role: {
                        label: 'Role of Embankment top',
                        icon,
                        value: 'Breakline',
                        chosen: 'breakline',
                        auto: true,
                        autoTip: 'From specification',
                        groups: [[{ id: 'breakline', label: 'Breakline' }]],
                        onChoose: noop,
                      },
                    },
                    {
                      type: 'source',
                      key: 'top-1',
                      depth: 1,
                      icon: <Spline size={16} />,
                      name: 'Embankment top 1',
                      count: '',
                      twisty: null,
                      selected: false,
                      onClick: noop,
                      role: {
                        label: 'Role of Top 1',
                        icon,
                        value: 'Points',
                        chosen: 'points',
                        tone: 'start',
                        groups: [[{ id: 'points', label: 'Points' }]],
                        onChoose: noop,
                      },
                    },
                    {
                      type: 'source',
                      key: 'shed',
                      depth: 0,
                      icon,
                      name: 'Shed 1',
                      count: '',
                      twisty: null,
                      selected: false,
                      mark: '2D',
                      onClick: noop,
                      role: {
                        label: 'Role of Shed 1',
                        value: 'None',
                        chosen: null,
                        tone: 'missing',
                        groups: [[{ id: 'hole', label: 'Hole' }]],
                        onChoose: noop,
                      },
                    },
                  ],
                },
                {
                  title: 'Outline',
                  rows: [
                    {
                      type: 'choice',
                      key: 'outline',
                      label: 'Outline',
                      value: 'edge',
                      options: [
                        ['hull', 'Hull'],
                        ['edge', 'Max edge'],
                      ],
                      onChange: noop,
                    },
                    {
                      type: 'field',
                      key: 'edge',
                      field: (
                        <InlineField
                          label="Max edge"
                          value="5.00"
                          unit="m"
                          numeric
                          onFocus={noop}
                          onChange={noop}
                        />
                      ),
                    },
                    {
                      type: 'crop',
                      key: 'c1',
                      icon: <PenLine size={16} />,
                      name: 'Crop 1',
                      count: '5 points',
                      onRemove: noop,
                    },
                    {
                      type: 'crop',
                      key: 'c2',
                      icon: <PenLine size={16} />,
                      name: 'Crop 2',
                      prompt: 'Click point 2',
                    },
                  ],
                },
              ]}
            />
          }
          stage={
            <WorkStage
              view={<div />}
              toolsLabel="View"
              choice={{
                label: 'View',
                value: 'plan',
                options: [
                  ['plan', 'Plan'],
                  ['3d', '3D'],
                ],
                onChange: noop,
              }}
              tools={[{ label: 'Draw crop', icon: <PenLine size={16} />, on: true, onClick: noop }]}
              busy
              readout="1 135 triangles · 2 834 m²"
            />
          }
          aside={
            <WorkAside
              label="Issues"
              choice={{
                label: 'Show',
                value: 'issues',
                options: [
                  ['issues', 'Issues'],
                  ['fixes', 'Fixes'],
                ],
                onChange: noop,
              }}
              count={5}
              countLabel="open"
              filter={{ label: 'Show resolved', icon, on: false, onClick: noop }}
              plan={{
                label: 'Suggested fixes',
                title: 'Suggested',
                sub: '2 fixes resolve all',
                action: { label: 'Apply all', onClick: noop },
                steps: [
                  { id: 's1', no: 1, label: 'Leave out points', count: '398.2 k', onClick: noop },
                  { id: 's2', no: 2, label: 'Height from top', count: '2', onClick: noop },
                ],
              }}
              groups={[
                {
                  id: 'g1',
                  title: 'Crossing breaklines',
                  done: false,
                  count: '2',
                  places: [
                    {
                      id: 'i1',
                      label: 'A × B',
                      detail: 'ΔZ 0.18 m',
                      focus: true,
                      fixed: false,
                      onClick: noop,
                    },
                    {
                      id: 'i2',
                      label: 'C × B',
                      detail: 'ΔZ 0.07 m',
                      focus: false,
                      fixed: false,
                      onClick: noop,
                    },
                  ],
                  more: { label: '3 more', disabled: false, onClick: noop },
                },
                {
                  id: 'g2',
                  title: 'Points near breaklines',
                  done: true,
                  count: '177',
                  rule: {
                    label: 'Leave out within',
                    on: true,
                    count: '177',
                    distance: { label: 'Distance', value: 0.1, unit: 'm', onChange: noop },
                    onToggle: noop,
                  },
                  places: [],
                },
              ]}
              empty="No open issues"
              quickFixes={{
                title: 'A × B',
                detail: 'ΔZ 0.18 m',
                fixes: [
                  {
                    id: 'f1',
                    label: 'Height from Top 1',
                    hint: '5.96',
                    all: 'All 2',
                    onThis: noop,
                    onAll: noop,
                  },
                ],
              }}
            />
          }
          overlay={
            // Only on request: its Esc and Enter would take the keys of the other cases.
            CONFIRM && (
              <Confirm
                title="Close Surface 1?"
                placement="corner"
                onCancel={noop}
                actions={[
                  { label: 'Discard draft', onClick: noop },
                  { label: 'Keep draft', primary: true, onClick: noop },
                ]}
              />
            )
          }
          foot={
            <WorkFoot
              open="5 open"
              ready="Ready"
              secondary={{ label: 'Discard', onClick: noop }}
              primary={{ label: 'Create', disabledReason: '5 open', onClick: noop }}
            />
          }
        />
      </div>
    </>
  );
}
