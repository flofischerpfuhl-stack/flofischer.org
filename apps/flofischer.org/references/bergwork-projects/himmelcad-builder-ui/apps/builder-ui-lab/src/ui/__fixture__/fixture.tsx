import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownToLine,
  Eye,
  FolderPlus,
  Layers,
  Link2,
  ListTree,
  Magnet,
  Minus,
  Pin,
  Redo2,
  Square,
  Undo2,
  X,
} from 'lucide-react';

import '@himmelcad/theme/fonts.css';
import '@himmelcad/theme/tokens.css';
import '@himmelcad/theme/reset.css';
import {
  Button,
  CheckMenuItems,
  ConsoleLine,
  ConsolePanel,
  Fields,
  IconButton,
  InlineChoice,
  InlineField,
  InlineRead,
  List,
  ListName,
  ListPane,
  ListRow,
  ListToolbar,
  PlayButton,
  Menu,
  MenuDivider,
  MenuItem,
  MenuSection,
  MenuSub,
  MenuTabs,
  MenuScroll,
  MenuRename,
  SlotGrid,
  Slot,
  ToolBar,
  ToolBarButton,
  ToolBarDivider,
  ToolBarEmpty,
  ToolBarScroll,
  ToolBarTip,
  ToolItem,
  ToolList,
  ToolSub,
  WorkspaceButton,
  Panel,
  PanelEmpty,
  PanelResizeEdge,
  JobProgress,
  PropertyActions,
  PropertyRow,
  RailToggle,
  ReadValue,
  Section,
  Sections,
  Segmented,
  SelectField,
  StateButton,
  StatusAnchor,
  StatusGroup,
  StatusItem,
  CoordinateReadout,
  SnapReadout,
  Surface,
  TextField,
  TitleBrand,
  TitleButton,
  TitleName,
  TitlePill,
  TooltipLayer,
  type FieldMenuGroup,
  InlineCheck,
  InlineInfo,
  FieldsActions,
  InlineNotice,
  InlineOptions,
  InlineSelect,
  PopoutWindow,
  RailButton,
} from '../index.js';
import { WindowsFixture } from './windows.js';
import { QueryFixture } from './query.js';
import './fixture.css';

/**
 * Every library component in its states, for scripts/ui-lib-check.mjs. `?theme=light`,
 * `?corners=sharp` switch the appearance. Each case sits in a `data-t` wrapper the script finds.
 */
const params = new URLSearchParams(location.search);
document.body.classList.add(params.get('theme') === 'light' ? 'hc-theme-light' : 'hc-theme-dark');
if (params.get('corners') === 'sharp') document.documentElement.dataset.corners = 'sharp';

/** A control the fixture does not need to act on. */
const noop = (): void => undefined;
const LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const LAYERS = Array.from({ length: 12 }, (_, i) => [`l${i + 1}`, `Layer ${i + 1}`] as const);
const INLINE = ['distance', 'direction', 'height'] as const;

/** The panel's list (both tabs show it). */
function PanelList(): JSX.Element {
  return (
    <div data-t="list" style={{ display: 'contents' }}>
      <ListPane
        toolbar={
          <ListToolbar
            start={
              <IconButton
                size="toolbar"
                label="Scroll to bottom"
                icon={<ArrowDownToLine size={16} />}
                disabled
                onClick={noop}
              />
            }
          >
            <IconButton
              size="toolbar"
              label="Quick filters"
              icon={<Eye size={16} />}
              expanded
              onClick={noop}
            />
            <IconButton
              size="toolbar"
              label="New layer"
              icon={<FolderPlus size={16} />}
              on
              onClick={noop}
            />
          </ListToolbar>
        }
      >
        <List label="Layers" play keyboard>
          {(
            [
              ['Layer 1', 'hidden', {}],
              ['Layer 2', 'visible', { selected: true }],
              ['Layer 3', 'clickable', { selected: true, focus: true }],
              ['Layer 4', 'editable', { context: true }],
              ['Layer 5', 'editable', { pale: true }],
            ] as const
          ).map(([name, state, flags], index) => (
            <ListRow
              key={name}
              selected={'selected' in flags}
              focus={'focus' in flags}
              context={'context' in flags}
              dim={state === 'hidden'}
            >
              <PlayButton
                current={index === 1}
                fixed={index === 1}
                label={name}
                tip="Make current"
                onClick={noop}
              />
              <ListName>{name}</ListName>
              <StateButton
                state={state}
                pale={'pale' in flags}
                label={`${name}: ${state}`}
                onClick={noop}
              />
            </ListRow>
          ))}
        </List>
      </ListPane>
    </div>
  );
}

function Fixture(): JSX.Element {
  const [tab, setTab] = useState('layers');
  const [name, setName] = useState('Boundary 1');
  const [commits, setCommits] = useState(0);
  const [layer, setLayer] = useState<string>('l2');
  const [shape, setShape] = useState('line');
  const [mode, setMode] = useState('polar');
  const [active, setActive] = useState<string>('distance');
  const [typed, setTyped] = useState<Record<string, string>>({ direction: '100.0000' });
  const [enters, setEnters] = useState(0);
  const [importAs, setImportAs] = useState('points');
  const [format, setFormat] = useState('dxf');
  const [transform, setTransform] = useState(false);
  const [popTab, setPopTab] = useState('one');
  const [popClosed, setPopClosed] = useState(0);
  const [meaning, setMeaning] = useState('north');
  const [snap, setSnap] = useState<string[]>(['End']);
  const [menu, setMenu] = useState<'snap' | 'actions' | null>(null);
  const [attachedOpen, setAttachedOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [consoleH, setConsoleH] = useState(240);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  // The function's name sits centred under its button, 4 px below the bar — placed as the function
  // bar's owner places it (FunctionBar), not at a fixed x (owner 2026-11-06: „misaligned").
  const functionsRef = useRef<HTMLSpanElement>(null);
  const [tipAt, setTipAt] = useState<{ x: number; y: number; button: HTMLElement } | null>(null);
  const [gearAt, setGearAt] = useState<{ x: number; y: number; button: HTMLElement } | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  useLayoutEffect(() => {
    const box = functionsRef.current!;
    const top = box.getBoundingClientRect();
    const bar = box.querySelector('.ui-toolbar')!.getBoundingClientRect();
    const under = (id: string) => {
      const button = box.querySelector<HTMLElement>(`[data-function="${id}"]`)!;
      const own = button.getBoundingClientRect();
      return { x: own.left + own.width / 2 - top.left, y: bar.bottom - top.top + 4, button };
    };
    setTipAt(under('text'));
    setGearAt(under('gear'));
  }, []);
  const [command, setCommand] = useState('');
  const [typed2, setTyped2] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState<'history' | 'slots' | null>(null);
  const snapRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const fieldMenu: FieldMenuGroup[] = [
    // Out of order on purpose: the library sorts the groups.
    { kind: 'recent', items: [{ id: 'r1', label: '12.500', hint: 'm' }] },
    { kind: 'take', items: [{ id: 'pick', label: 'Pick in view' }] },
    {
      kind: 'meaning',
      title: 'Direction',
      items: [
        {
          id: 'north',
          label: 'From north',
          checked: meaning === 'north',
          onSelect: () => setMeaning('north'),
        },
        {
          id: 'last',
          label: 'From last',
          checked: meaning === 'last',
          onSelect: () => setMeaning('last'),
        },
      ],
    },
    {
      kind: 'calculate',
      items: [
        { id: '+100', label: '+100 gon', tip: 'Right angle' },
        { id: 'none', label: '+200 gon', disabled: 'No direction yet' },
      ],
    },
  ];
  const cycle = (back: boolean) => {
    const at = INLINE.indexOf(active as (typeof INLINE)[number]);
    const next = INLINE[(at + (back ? -1 : 1) + INLINE.length) % INLINE.length] ?? 'distance';
    setActive(next);
    inputs.current[next]?.focus();
  };

  return (
    <div className="fx">
      <TooltipLayer />
      {/* ---- Surfaces ---- */}
      <div className="fx-col fx-wide">
        <div data-t="surface-large">
          <Surface kind="large">large</Surface>
        </div>
        <div data-t="surface-popover">
          <Surface kind="popover">popover</Surface>
        </div>
        <div className="fx-row" data-t="title">
          <span data-t="title-brand">
            <TitlePill kind="brand">
              <TitleBrand logo={LOGO} product="BUILDER" />
            </TitlePill>
          </span>
          <span data-t="title-project">
            <TitlePill kind="project">
              <TitleName name="Musterstraße 12" path="/data/Musterstraße 12.hcad" />
            </TitlePill>
          </span>
          <span data-t="title-controls">
            <TitlePill kind="controls">
              <TitleButton
                label="Minimize"
                icon={<Minus size={16} strokeWidth={1.7} />}
                onClick={noop}
              />
              <TitleButton label="Close" icon={<X size={16} strokeWidth={1.7} />} onClick={noop} />
            </TitlePill>
          </span>
        </div>
        {/* ---- Status groups ---- */}
        <div className="fx-row" data-t="status">
          <span data-t="status-a">
            <StatusGroup label="History">
              <StatusItem
                label="Undo"
                iconOnly
                keyHint="Ctrl+Z"
                icon={<Undo2 size={16} />}
                onClick={noop}
              />
              <StatusItem
                label="Redo"
                iconOnly
                keyHint="Ctrl+Y"
                disabled
                disabledReason="Nothing to redo"
                icon={<Redo2 size={16} />}
                onClick={noop}
              />
            </StatusGroup>
          </span>
          <span data-t="status-b">
            <StatusGroup label="Snap">
              <StatusItem
                ref={snapRef}
                label="Snap"
                icon={<Magnet size={16} />}
                count={snap.length}
                countLabel="snap kinds on"
                menu={{ open: menu === 'snap', id: 'fx-snap' }}
                onClick={() => setMenu(menu === 'snap' ? null : 'snap')}
              />
              <StatusItem label="Elements" icon={<ListTree size={16} />} on onClick={noop} />
              <StatusItem
                ref={actionsRef}
                label="Actions"
                iconOnly
                icon={<Layers size={16} />}
                menu={{ open: menu === 'actions' }}
                onClick={() => setMenu(menu === 'actions' ? null : 'actions')}
              />
            </StatusGroup>
          </span>
        </div>
        {/* Status items as the bar collapses, the readouts, an anchor with its menu. */}
        <div className="fx-row fx-status-more" data-t="status-more">
          <span data-t="status-c">
            <StatusGroup label="View" tight>
              <StatusItem label="Mode: 3D" text="3D" compact onClick={noop} />
              <StatusItem
                label="Views: Overview"
                value="Overview"
                icon={<Eye size={16} />}
                count={1}
                onClick={noop}
              />
              <StatusItem
                label="Views: Overview"
                value="Overview"
                icon={<Eye size={16} />}
                compact
                onClick={noop}
              />
              <StatusItem label="Zoom" icon={<Square size={16} />} compact narrow onClick={noop} />
              <StatusAnchor>
                <StatusItem
                  label="Pinned"
                  icon={<Pin size={16} />}
                  menu={{ open: anchorOpen, id: 'fx-anchor-menu' }}
                  onClick={() => setAnchorOpen(!anchorOpen)}
                />
                {anchorOpen && (
                  <Menu id="fx-anchor-menu" label="Pinned" attached="above" onClose={noop}>
                    <MenuItem onSelect={noop}>Pin</MenuItem>
                  </Menu>
                )}
              </StatusAnchor>
            </StatusGroup>
          </span>
          <span data-t="status-d">
            <StatusGroup label="Panel">
              <StatusItem
                label="Properties"
                icon={<ListTree size={16} />}
                expanded={false}
                busy="Function running"
                onClick={noop}
              />
            </StatusGroup>
          </span>
          <span data-t="status-e" className="fx-grow">
            <StatusGroup label="Cursor" grow>
              <CoordinateReadout
                label="Cursor coordinates"
                chars={8}
                axes={[
                  { axis: 'X', value: '-214.845' },
                  { axis: 'Y', value: '57.710' },
                  { axis: 'Z', value: '—' },
                ]}
              />
              <SnapReadout
                label="Snap"
                icon={<Magnet size={14} />}
                kind="Endpoint"
                short="End"
                name="Boundary 1 with a long name"
                form="full"
              />
              <SnapReadout
                label="Snap"
                icon={<Magnet size={14} />}
                kind="Endpoint"
                short="End"
                form="short"
              />
              <SnapReadout
                label="Snap"
                icon={<Magnet size={14} />}
                kind="—"
                short="—"
                none
                form="glyph"
              />
            </StatusGroup>
          </span>
        </div>
        {menu === 'snap' && snapRef.current && (
          <Menu
            label="Snap"
            x={snapRef.current.getBoundingClientRect().left}
            y={snapRef.current.getBoundingClientRect().bottom + 8}
            returnFocus={snapRef.current}
            onClose={() => setMenu(null)}
          >
            <CheckMenuItems
              heading="Snap to"
              options={['End', 'Mid', 'Node']}
              selected={snap}
              onChange={setSnap}
            />
          </Menu>
        )}
        {menu === 'actions' && actionsRef.current && (
          <Menu
            label="Actions"
            x={actionsRef.current.getBoundingClientRect().left}
            y={actionsRef.current.getBoundingClientRect().bottom + 8}
            focusFirst
            returnFocus={actionsRef.current}
            onClose={() => setMenu(null)}
          >
            <MenuSection>Layer</MenuSection>
            <MenuItem
              icon={<FolderPlus size={16} />}
              shortcut="Ctrl+N"
              onSelect={() => setMenu(null)}
            >
              New layer
            </MenuItem>
            <MenuItem disabled disabledReason="Last layer" onSelect={noop}>
              Delete
            </MenuItem>
            <MenuDivider />
            {/* Two groups: their headings show (one group would show none). */}
            <MenuSection>Element</MenuSection>
            <MenuItem checked onSelect={noop}>
              Rename
            </MenuItem>
            <MenuItem checked={false} onSelect={noop}>
              Merge
            </MenuItem>
          </Menu>
        )}
        {/* Attached menu with a submenu row (status bar's Snap › Angle) and on/off boxes. */}
        <div className="fx-row fx-menus-more" data-t="menus-more">
          <span className="fx-anchor" data-t="attached">
            <button
              type="button"
              className="fx-trigger"
              onClick={() => setAttachedOpen(!attachedOpen)}
            >
              Snap
            </button>
            {attachedOpen && (
              <Menu label="Snap" attached="above" onClose={noop}>
                <MenuItem kind="checkbox" checked onSelect={noop}>
                  Endpoints
                </MenuItem>
                <MenuItem kind="checkbox" checked={false} onSelect={noop}>
                  Midpoints
                </MenuItem>
                <MenuSub label="Angle" checked pale onSelect={noop} id="fx-angle">
                  <MenuItem kind="checkbox" checked onSelect={noop}>
                    100 gon
                  </MenuItem>
                  <MenuItem kind="checkbox" checked={false} onSelect={noop}>
                    50 gon
                  </MenuItem>
                </MenuSub>
              </Menu>
            )}
          </span>
          <span className="fx-anchor" data-t="attached-history">
            <button
              type="button"
              className="fx-trigger"
              onClick={() => setMoreOpen(moreOpen === 'history' ? null : 'history')}
            >
              History
            </button>
            {moreOpen === 'history' && (
              <Menu label="History" attached="above" onClose={noop}>
                <MenuTabs
                  label="History of"
                  tabs={[
                    { id: 'all', label: 'All', icon: <Layers size={16} /> },
                    { id: 'view', label: 'View', icon: <Eye size={16} />, disabled: 'Not yet' },
                  ]}
                  value="all"
                  onChange={noop}
                >
                  <MenuScroll label="History">
                    <MenuItem checked={false} onSelect={noop}>
                      Opened
                    </MenuItem>
                    <MenuItem checked onSelect={noop}>
                      Line
                    </MenuItem>
                    <MenuItem checked={false} muted onSelect={noop}>
                      Move
                    </MenuItem>
                  </MenuScroll>
                </MenuTabs>
                <MenuRename
                  label="View name"
                  defaultValue="Overview"
                  onCommit={noop}
                  onCancel={noop}
                />
              </Menu>
            )}
          </span>
          <span className="fx-anchor" data-t="attached-slots">
            <button
              type="button"
              className="fx-trigger"
              onClick={() => setMoreOpen(moreOpen === 'slots' ? null : 'slots')}
            >
              Slots
            </button>
            {moreOpen === 'slots' && (
              <Menu
                label="Specification"
                attached="above"
                align="center"
                wide
                role="dialog"
                onClose={noop}
              >
                <SlotGrid>
                  {['Kerb', 'Road', 'Fence', 'None'].map((label, index) => (
                    <Slot
                      key={label}
                      number={index + 1}
                      label={label}
                      active={index === 1}
                      useLabel={`Use slot ${index + 1}`}
                      editLabel={`Assign slot ${index + 1}`}
                      editTip="Assign specification"
                      onUse={noop}
                      onEdit={noop}
                    />
                  ))}
                </SlotGrid>
              </Menu>
            )}
          </span>
          <span className="fx-anchor" data-t="tools-bar">
            <ToolList label="Line methods" size="bar" title="Line" open>
              <ToolItem
                index={0}
                icon={<Minus size={18} />}
                label="Through two points"
                onSelect={noop}
              />
              <ToolItem index={1} icon={<Link2 size={18} />} label="Best fit" onSelect={noop} />
            </ToolList>
          </span>
          <span data-t="tools-cursor">
            <ToolList label="Functions" size="cursor">
              <ToolItem icon={<Eye size={16} />} label="Display" onSelect={noop} />
              <ToolSub icon={<Square size={16} />} label="Edit">
                <ToolItem icon={<X size={16} />} label="Delete" onSelect={noop} />
                <ToolItem icon={<Pin size={16} />} label="Pin" onSelect={noop} />
              </ToolSub>
              <ToolItem icon={<Layers size={16} />} label="Properties" onSelect={noop} />
            </ToolList>
          </span>
        </div>
        <div className="fx-row" data-t="buttons">
          <span data-t="button-neutral">
            <Button onClick={noop}>Isolate</Button>
          </span>
          <span data-t="button-disabled">
            <Button disabled disabledReason="Nothing selected" onClick={noop}>
              Isolate
            </Button>
          </span>
        </div>
      </div>

      {/* ---- Tool bars: the function bar (workspace, functions, a utility) and the mini toolbar ---- */}
      <div className="fx-toolbars" data-t="toolbars">
        <span data-t="toolbar-functions" ref={functionsRef}>
          <ToolBar kind="functions" label="Builder functions">
            <WorkspaceButton
              label="Workspace: Draw"
              name="Draw"
              icon={<Pin size={20} />}
              open={workspaceOpen}
              controls="fx-workspaces"
              onClick={() => setWorkspaceOpen(!workspaceOpen)}
            />
            <ToolBarDivider />
            <ToolBarScroll strip="draw">
              <ToolBarButton
                size="bar"
                functionId="line"
                label="Line"
                icon={<Minus size={20} />}
                methods
                open
                controls="fx-methods"
                onClick={noop}
              />
              <ToolBarButton
                size="bar"
                functionId="text"
                label="Text"
                icon={<Square size={20} />}
                onClick={noop}
              />
              <ToolBarButton
                size="bar"
                functionId="gear"
                label="Settings"
                icon={<Eye size={20} />}
                expanded={gearOpen}
                onClick={() => setGearOpen(!gearOpen)}
              />
            </ToolBarScroll>
            <ToolBarDivider />
            <IconButton
              size="bar"
              label="Search functions"
              icon={<Eye size={18} />}
              onClick={noop}
            />
          </ToolBar>
          {tipAt && (
            <ToolBarTip x={tipAt.x} y={tipAt.y} button={tipAt.button}>
              Text
            </ToolBarTip>
          )}
          {gearAt && (
            <span data-t="gear-tip" style={{ display: 'contents' }}>
              <ToolBarTip x={gearAt.x} y={gearAt.y} button={gearAt.button}>
                Settings
              </ToolBarTip>
            </span>
          )}
        </span>
        <span data-t="toolbar-mini">
          <ToolBar kind="mini" role="toolbar" label="Mini toolbar">
            <ToolBarButton size="mini" label="Line" icon={<Minus size={18} />} onClick={noop} />
            <ToolBarButton size="mini" label="Text" icon={<Square size={18} />} onClick={noop} />
          </ToolBar>
        </span>
        <span data-t="toolbar-empty">
          <ToolBar kind="mini" role="toolbar" label="Mini toolbar">
            <ToolBarEmpty>Right-click a function</ToolBarEmpty>
          </ToolBar>
        </span>
      </div>

      {/* ---- A running job and an empty panel ---- */}
      <div className="fx-col" data-t="job">
        <JobProgress file="Scan-2.e57" stage="Reading points" progress={0.4} onCancel={noop} />
        <PanelEmpty>No selection</PanelEmpty>
      </div>

      {/* ---- Console with its top resize edge ---- */}
      <div className="fx-console" data-t="console" style={{ height: consoleH }}>
        <ConsolePanel
          title="Console"
          icon={<Square size={17} />}
          actions={
            <IconButton size="small" label="Close console" icon={<X size={17} />} onClick={noop} />
          }
          scrollLabel="Console scroll controls"
          scroll={
            <>
              <IconButton
                size="small"
                label="Scroll console to top"
                tip="Scroll to top"
                icon={<ArrowDownToLine size={16} />}
                onClick={noop}
              />
              <IconButton
                size="small"
                label="Scroll console to bottom"
                tip="Scroll to bottom"
                icon={<ArrowDownToLine size={16} />}
                onClick={noop}
              />
            </>
          }
          resize={
            <PanelResizeEdge
              side="top"
              label="Resize console"
              size={consoleH}
              min={120}
              max={400}
              defaultSize={240}
              onSize={setConsoleH}
            />
          }
          input={{
            label: 'Console command',
            placeholder: 'Command',
            value: command,
            onChange: setCommand,
            onSubmit: () => {
              setTyped2([...typed2, `› ${command}`]);
              setCommand('');
            },
          }}
        >
          <ConsoleLine>Ready</ConsoleLine>
          {typed2.map((line, index) => (
            <ConsoleLine key={index} command>
              {line}
            </ConsoleLine>
          ))}
        </ConsolePanel>
      </div>

      {/* ---- Panel with a list ---- */}
      <div className="fx-panel" data-t="panel">
        <Panel
          side="left"
          label="Elements"
          tabs={[
            { id: 'layers', label: 'Layers', icon: <Layers size={18} />, render: PanelList },
            {
              id: 'tree',
              label: 'Tree',
              icon: <ListTree size={18} />,
              busy: true,
              render: PanelList,
            },
          ]}
          activeTab={tab}
          onTab={setTab}
          railButtons={
            <>
              <RailToggle
                icon={<Link2 size={15} />}
                frame="none"
                label="Sync panel widths"
                tip="Width sync"
                onToggle={noop}
              />
              <RailToggle
                icon={<Pin size={15} />}
                frame="dashed"
                label="Sticky auto"
                tip="Sticky"
                onToggle={noop}
              />
              <RailToggle
                icon={<Eye size={15} />}
                frame="solid"
                label="Show all"
                tip="Show all"
                onToggle={noop}
              />
            </>
          }
        />
      </div>

      {/* ---- Properties ---- */}
      <div className="fx-col" data-t="props">
        <Surface kind="large">
          <Sections>
            <Section id="fx.general" title="General" remember={false}>
              <div data-t="row-text">
                <PropertyRow label="Name">
                  <TextField
                    label="Name"
                    value={name}
                    onCommit={(v) => {
                      setName(v);
                      setCommits((c) => c + 1);
                    }}
                  />
                </PropertyRow>
              </div>
              <div data-t="row-text-2">
                <PropertyRow label="Code">
                  <TextField label="Code" value="BL" onCommit={noop} />
                </PropertyRow>
              </div>
              <div data-t="row-select">
                <PropertyRow label="Layer">
                  <SelectField label="Layer" value={layer} options={LAYERS} onChange={setLayer} />
                </PropertyRow>
              </div>
              <div data-t="row-select-short">
                <PropertyRow label="Shape">
                  <SelectField
                    label="Shape"
                    value={shape}
                    options={[
                      ['line', 'Line'],
                      ['arc', 'Arc'],
                      ['spline', 'Spline'],
                    ]}
                    onChange={setShape}
                  />
                </PropertyRow>
              </div>
              <div data-t="row-read">
                <PropertyRow label="Length">
                  <ReadValue mono>12.500 m</ReadValue>
                </PropertyRow>
              </div>
              <div data-t="row-disabled">
                <PropertyRow label="Source">
                  <TextField
                    label="Source"
                    value="survey.dxf"
                    disabled
                    disabledReason="From the import"
                    onCommit={noop}
                  />
                </PropertyRow>
              </div>
              <div data-t="row-link">
                <PropertyRow label="Part of">
                  <ReadValue tip="Select the whole line" onClick={noop}>
                    Breakline 1
                  </ReadValue>
                </PropertyRow>
              </div>
              <div data-t="row-aux">
                <PropertyRow label="From">
                  <ReadValue mono italic>
                    A12
                  </ReadValue>
                </PropertyRow>
              </div>
              <div data-t="head-section">
                <Section
                  id="fx.vertex"
                  title="Vertex 1"
                  depth={1}
                  remember={false}
                  head={
                    <TextField
                      label="Vertex 1 point"
                      value="A12"
                      mono
                      italic
                      commitOnBlur={false}
                      onCommit={noop}
                    />
                  }
                >
                  <PropertyRow label="X">
                    <ReadValue mono>1.000</ReadValue>
                  </PropertyRow>
                </Section>
              </div>
              <div data-t="actions">
                <PropertyActions>
                  <Button onClick={noop}>Update</Button>
                  <Button onClick={noop}>Detach</Button>
                </PropertyActions>
              </div>
              <div data-t="row-picking">
                <PropertyRow label="Point">
                  <TextField
                    label="Point"
                    value=""
                    picking
                    placeholder="Click a point"
                    onCommit={noop}
                  />
                </PropertyRow>
              </div>
            </Section>
            <Section id="fx.geometry" title="Geometry" remember={false}>
              <Section id="fx.vertices" title="Vertices" depth={1} remember={false} defaultOpen>
                <div data-t="row-nested">
                  <PropertyRow label="X">
                    <TextField label="X" value="3512345.678" mono onCommit={noop} />
                  </PropertyRow>
                </div>
              </Section>
            </Section>
          </Sections>
          <div data-t="commits" data-value={commits} />
        </Surface>
      </div>

      {/* ---- Text rows of a function panel (import/export round 5) ---- */}
      <div className="fx-col" data-t="rows">
        <Surface kind="large">
          <Sections>
            <Fields
              step="Export"
              tools={
                <IconButton
                  size="tool"
                  label="Close without exporting"
                  icon={<X size={16} />}
                  onClick={noop}
                />
              }
            >
              <InlineInfo label="File" value="absteckung_137.csv" />
              <InlineInfo label="Rows" value="137" />
              <InlineInfo
                label="Columns"
                value="Number, X, Y, Z, Code, Beschreibung 1, Beschreibung 2"
              />
              <InlineSelect
                label="Import as"
                options={[
                  { id: 'points', label: 'Survey points' },
                  { id: 'cloud', label: 'Point cloud' },
                  { id: 'plan', label: 'Plan', disabled: 'No world file' },
                ]}
                selected={importAs}
                onChange={setImportAs}
              />
              <InlineSelect
                label="Folder"
                path
                value="D:\Projekte\2026\Vermessung\Lageplan\Export"
                menu={[
                  { kind: 'take', items: [{ id: 'choose', label: 'Choose folder…' }] },
                  { kind: 'recent', items: [{ id: 'r1', label: 'D:\\Projekte' }] },
                ]}
              />
              <InlineOptions
                label="Format"
                value={format}
                options={[
                  { id: 'dxf', label: 'DXF', hint: 'All' },
                  { id: 'las', label: 'LAS 1.4', hint: '1 of 15' },
                  { id: 'obj', label: 'OBJ', hint: 'None', disabled: 'Takes no lines' },
                ]}
                onChange={setFormat}
              />
              <InlineNotice>LAS 1.4 leaves out 14 lines</InlineNotice>
              <InlineCheck
                label="Transform on export"
                checked={transform}
                onChange={setTransform}
              />
              <InlineCheck
                label="Keep layers"
                checked={false}
                onChange={noop}
                disabled="Takes no layers"
              />
              <FieldsActions
                other={{ label: 'Export manager', onClick: noop }}
                primary={{ label: 'Export', onClick: noop }}
              />
            </Fields>
          </Sections>
        </Surface>
        {/* A menu row outside a menu renders nothing (rules by construction). */}
        <div data-t="stray-row">
          <MenuItem onSelect={noop}>Stray</MenuItem>
        </div>
        {/* One text column with and without icons; a row that opens a window ends in „…". */}
        <div data-t="menu-icons" style={{ position: 'relative' }}>
          {gearOpen && (
            <Menu label="Settings" attached="below" onClose={noop}>
              <MenuItem icon={<Eye size={16} />} checked onSelect={noop}>
                Dark
              </MenuItem>
              <MenuItem icon={<Minus size={16} />} checked={false} onSelect={noop}>
                Sharp
              </MenuItem>
              <MenuDivider />
              <MenuItem opens="window" onSelect={noop}>
                Import and export
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {/* ---- Pop-out window: no title, Close in the rail, tabs with their content ---- */}
      <div
        className="fx-col"
        data-t="popout"
        data-closed={popClosed}
        style={{ position: 'relative', height: 260, transform: 'translateZ(0)' }}
      >
        <PopoutWindow
          label="Export window"
          rect={{ x: 0, y: 0, w: 320, h: 260 }}
          front
          onFocus={noop}
          onMoveStart={noop}
          onResizeStart={noop}
        >
          <Panel
            side="left"
            bare
            fill
            label="Export window"
            tabs={[
              {
                id: 'one',
                label: 'Export',
                icon: <Layers size={18} />,
                render: () => <PanelEmpty>Tab one</PanelEmpty>,
              },
              {
                id: 'two',
                label: 'Agent',
                icon: <ListTree size={18} />,
                render: () => <PanelEmpty>Tab two</PanelEmpty>,
              },
            ]}
            activeTab={popTab}
            onTab={setPopTab}
            railButtons={
              <RailButton
                icon={<X size={16} />}
                label="Close"
                onClick={() => setPopClosed((n) => n + 1)}
              />
            }
          />
        </PopoutWindow>
      </div>

      {/* ---- Function panel fields ---- */}
      <div className="fx-col" data-t="fields">
        <Surface kind="large">
          <Sections>
            <Fields
              step="Point 3"
              tools={
                <>
                  <IconButton
                    size="tool"
                    label="Undo point"
                    keyHint="Ctrl+Z"
                    icon={<Undo2 size={16} />}
                    keepFocus
                    onClick={noop}
                  />
                  <IconButton
                    size="tool"
                    label="Close"
                    keyHint="C"
                    icon={<Square size={16} />}
                    disabled
                    keepFocus
                    onClick={noop}
                  />
                </>
              }
              modes={
                <span data-t="segmented" style={{ display: 'contents' }}>
                  <Segmented
                    label="Input"
                    value={mode}
                    options={[
                      ['polar', 'Polar'],
                      ['relative', 'Relative'],
                      ['absolute', 'Absolute'],
                    ]}
                    onChange={setMode}
                  />
                </span>
              }
            >
              {INLINE.map((id) => (
                <div key={id} data-t={`inline-${id}`}>
                  <InlineField
                    label={id[0]!.toUpperCase() + id.slice(1)}
                    value={typed[id] ?? (id === 'height' ? '' : '12.345')}
                    unit={id === 'direction' ? 'gon' : 'm'}
                    active={active === id}
                    locked={typed[id] !== undefined}
                    invalid={typed[id] === 'x'}
                    menu={id === 'direction' ? fieldMenu : undefined}
                    inputRef={(node) => {
                      inputs.current[id] = node;
                    }}
                    onFocus={() => setActive(id)}
                    onChange={(text) => setTyped({ ...typed, [id]: text })}
                    onRelease={() => {
                      const next = { ...typed };
                      delete next[id];
                      setTyped(next);
                    }}
                    onTab={cycle}
                    onEnter={() => setEnters((n) => n + 1)}
                    onEscape={() => setTyped({})}
                  />
                </div>
              ))}
              <div data-t="inline-disabled">
                <InlineField
                  label="Slope"
                  value=""
                  unit="%"
                  disabled="No last point"
                  onFocus={noop}
                  onChange={noop}
                />
              </div>
              <div data-t="inline-picking">
                <InlineField
                  label="Point"
                  value=""
                  unit=""
                  picking="Click a point"
                  onFocus={noop}
                  onChange={noop}
                />
              </div>
              <div data-t="inline-choice">
                <InlineChoice label="Source" value="Boundary 1" menu={fieldMenu} />
              </div>
              <div data-t="row-toggle">
                <PropertyRow label="Close" copy={false}>
                  <Segmented
                    label="Close"
                    value="open"
                    options={[
                      ['open', 'Open'],
                      ['closed', 'Closed'],
                    ]}
                    onChange={noop}
                    disabled="Two points needed"
                  />
                </PropertyRow>
              </div>
              <div data-t="button-primary">
                <Button variant="primary" keepFocus onClick={() => setEnters((n) => n + 1)}>
                  Set point
                </Button>
              </div>
            </Fields>
            <Section id="fx.result" title="Result" remember={false}>
              <div data-t="inline-read">
                <InlineRead label="Length" value="12.345" unit="m" />
              </div>
            </Section>
          </Sections>
          <div data-t="enters" data-value={enters} />
        </Surface>
      </div>
      <QueryFixture />
      <WindowsFixture />
    </div>
  );
}

const root = document.getElementById('fixture');
if (!root) throw new Error('Missing #fixture');
createRoot(root).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
