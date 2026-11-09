import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Wrench, X } from 'lucide-react';
import { Button, IconButton } from './Button.js';
import { Segmented } from './Field.js';
import { CheckMark, Menu, MenuDivider, MenuItem } from './Menu.js';
import { PanelEmpty } from './Panel.js';
import { CountBadge } from './Pill.js';
import { Surface } from './Surface.js';
import { Tag } from './Manager.js';
import './work.css';

/*
 * Work windows (proposal 2026-11-06, design/create-surface; UI-LIBRARY.md › Proposed: work window —
 * not decided by the owner). A window with its own view between a settings column and a result
 * column (Photoshop's Select and Mask; Xcode's issue navigator): the surface window first. The
 * grammar of the side panels and Properties: 28 px rows 4 px apart, 32 px heads, labels
 * secondary, values primary, digits mono, greyscale states; red only for what is open.
 *
 * Rules by construction (UI-LIBRARY.md › Principle): tools, buttons, choices, rows and menus are
 * passed as data, so a head holds only quiet tools, a foot only its two buttons, a role field's
 * menu only its options.
 */

/** A quiet tool (`IconButton tool`); `'divider'` between groups of tools. */
export interface WorkTool {
  readonly label: string;
  readonly icon: ReactNode;
  readonly keyHint?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** A toggle by the frame convention. */
  readonly on?: boolean | undefined;
  /** It opened something (the close question). */
  readonly expanded?: boolean | undefined;
  readonly onClick: () => void;
}
type ToolSpec = WorkTool | 'divider';

/** Two or three short options (`Segmented`). */
export interface WorkChoice {
  readonly label: string;
  readonly value: string;
  readonly options: readonly (readonly [value: string, label: string])[];
  readonly disabled?: string | undefined;
  readonly onChange: (value: string) => void;
}

function Tools(props: { tools: readonly ToolSpec[] }): JSX.Element {
  return (
    <div className="ui-work-tools">
      {props.tools.map((tool, index) =>
        tool === 'divider' ? (
          <span key={`d${index}`} className="ui-tool-divider" aria-hidden />
        ) : (
          <IconButton
            key={tool.label}
            size="tool"
            label={tool.label}
            keyHint={tool.keyHint}
            icon={tool.icon}
            disabled={tool.disabled}
            frame={tool.on === undefined ? undefined : tool.on ? 'solid' : 'none'}
            expanded={tool.expanded}
            onClick={tool.onClick}
          />
        ),
      )}
    </div>
  );
}

const choice = (spec: WorkChoice) => (
  <Segmented
    label={spec.label}
    value={spec.value}
    options={spec.options}
    disabled={spec.disabled}
    onChange={spec.onChange}
  />
);

/** The window: head, the left column, its own view, the right column, the foot. */
export function WorkWindow(props: {
  label: string;
  head: ReactNode;
  side: ReactNode;
  stage: ReactNode;
  aside: ReactNode;
  foot: ReactNode;
  /** Over the window (its close question). */
  overlay?: ReactNode | undefined;
}): JSX.Element {
  return (
    <Surface kind="large" as="section" role="dialog" aria-label={props.label} className="ui-work">
      {props.head}
      {props.side}
      {props.stage}
      {props.aside}
      {props.overlay}
      {props.foot}
    </Surface>
  );
}

/**
 * The window's head: its icon, the name (the one strong text; double-click renames it in place),
 * its state, the quiet tools at the end.
 */
export function WorkHead(props: {
  icon: ReactNode;
  title: string;
  state?: string | undefined;
  onRename?: ((name: string) => void) | undefined;
  tools: readonly ToolSpec[];
}): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  return (
    <header className="ui-work-head">
      <span className="ui-work-head-icon" aria-hidden>
        {props.icon}
      </span>
      {renaming ? (
        <input
          className="ui-work-rename"
          aria-label="Name"
          defaultValue={props.title}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => {
            setRenaming(false);
            const name = event.currentTarget.value.trim();
            if (name && name !== props.title) props.onRename?.(name);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.currentTarget.value = props.title;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <h2
          className="ui-work-title"
          onDoubleClick={() => props.onRename && setRenaming(true)}
          data-tip-overflow
        >
          {props.title}
        </h2>
      )}
      <span className="ui-work-state">{props.state}</span>
      <Tools tools={props.tools} />
    </header>
  );
}

/** A source row (SourceItem) in a section of the left column. */
export interface SourceRowSpec {
  readonly type: 'source';
  readonly key: string;
  readonly depth: 0 | 1;
  readonly icon: ReactNode;
  readonly name: string;
  readonly count: string;
  /** null: no twisty; true/false: open/closed. */
  readonly twisty: boolean | null;
  readonly onTwisty?: (() => void) | undefined;
  readonly selected: boolean;
  /** A quiet mark after the name (2D). */
  readonly mark?: string | undefined;
  readonly onClick: () => void;
  readonly role: RoleSpec;
}
/** A row of the left column: a source, a crop, a choice or a field on the rows' grid. */
export type WorkRow =
  | SourceRowSpec
  | {
      readonly type: 'crop';
      readonly key: string;
      readonly icon: ReactNode;
      readonly name: string;
      readonly count?: string | undefined;
      /** While it is drawn: the prompt instead of its points. */
      readonly prompt?: string | undefined;
      readonly onRemove?: (() => void) | undefined;
    }
  | ({ readonly type: 'choice'; readonly key: string } & WorkChoice)
  | {
      readonly type: 'field';
      readonly key: string;
      /** An `InlineField`, full width on the rows' grid. */
      readonly field: ReactNode;
    };

function Row(props: { row: WorkRow }): JSX.Element {
  const row = props.row;
  switch (row.type) {
    case 'source':
      return <SourceItem row={row} />;
    case 'crop':
      return <CropRow row={row} />;
    case 'choice':
      return <div className="ui-pane-control">{choice(row)}</div>;
    case 'field':
      return <div className="ui-pane-control">{row.field}</div>;
  }
}

/**
 * The left column: its sections (a head with quiet tools, the rows below 4 px apart), divided by
 * lines.
 */
export function WorkSide(props: {
  label: string;
  sections: readonly {
    readonly title: string;
    readonly tools?: readonly ToolSpec[] | undefined;
    readonly rows: readonly WorkRow[];
    /** The rows are a tree (sources with their members). */
    readonly tree?: boolean | undefined;
  }[];
}): JSX.Element {
  return (
    <aside className="ui-work-pane is-left" aria-label={props.label}>
      {props.sections.map((section) => (
        <Fragment key={section.title}>
          <div className="ui-pane-head">
            <h3>{section.title}</h3>
            {section.tools && <Tools tools={section.tools} />}
          </div>
          <div
            className="ui-pane-rows"
            role={section.tree ? 'tree' : undefined}
            aria-label={section.tree ? section.title : undefined}
          >
            {section.rows.map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </div>
        </Fragment>
      ))}
    </aside>
  );
}

/** The quick fixes of the place in focus. */
export interface QuickFixSpec {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly all: string;
  readonly allTip?: string | undefined;
  readonly allDisabled?: boolean | undefined;
  readonly onThis: () => void;
  readonly onAll: () => void;
}

/**
 * The right column: its head (the choice, how many are open in red, a filter); the list — the
 * plan and the issue classes, or the steps — that scrolls, or what it says when it is empty; the
 * quick fixes of the place in focus pinned under it.
 */
export function WorkAside(props: {
  label: string;
  choice: WorkChoice;
  count: number;
  countLabel: string;
  filter?: WorkTool | undefined;
  plan?: PlanSpec | undefined;
  groups?: readonly IssueGroupSpec[] | undefined;
  steps?: { readonly label: string; readonly steps: readonly PlanStepSpec[] } | undefined;
  empty: string;
  quickFixes?:
    | {
        readonly title: string;
        readonly detail?: string | undefined;
        readonly fixes: readonly QuickFixSpec[];
      }
    | undefined;
}): JSX.Element {
  const nothing =
    !props.plan && (props.groups?.length ?? 0) === 0 && (props.steps?.steps.length ?? 0) === 0;
  return (
    <aside className="ui-work-pane is-right" aria-label={props.label}>
      <div className="ui-pane-tabs">
        <div className="ui-pane-tabs-choice">{choice(props.choice)}</div>
        <span className={`ui-pane-tabs-count${props.count > 0 ? ' is-open' : ''}`}>
          <CountBadge value={props.count} label={props.countLabel} />
        </span>
        {props.filter && (
          <div className="ui-pane-tabs-tools">
            <Tools tools={[props.filter]} />
          </div>
        )}
      </div>
      <div className="ui-work-list">
        {props.plan && <PlanBox plan={props.plan} />}
        {props.groups?.map((group) => (
          <IssueGroup key={group.id} group={group} />
        ))}
        {props.steps && props.steps.steps.length > 0 && (
          <div className="ui-step-list" role="list" aria-label={props.steps.label}>
            {props.steps.steps.map((step) => (
              <Step key={step.id} step={step} listItem />
            ))}
          </div>
        )}
        {nothing && <PanelEmpty>{props.empty}</PanelEmpty>}
      </div>
      {props.quickFixes && <QuickFixes {...props.quickFixes} />}
    </aside>
  );
}

/** One option of a role field's menu. */
export interface RoleOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode | undefined;
  /** What it stands for (the specification's role). */
  readonly hint?: string | undefined;
  readonly disabledReason?: string | undefined;
}

/**
 * A row's role: a quiet field (Properties' SelectField) with the role's glyph and the `>`
 * segment; its menu shows the option groups, divided by lines, the chosen one checked.
 * `auto`: the value comes from elsewhere (the specification), a dashed frame (the frame
 * convention). `start`: the untouched start value (quieter); `missing`: no usable value (red).
 * `fixed`: a role that cannot change (a cloud is points), quiet, without a menu.
 */
export type RoleSpec =
  | {
      readonly fixed: true;
      readonly icon: ReactNode;
      readonly value: string;
    }
  | {
      readonly fixed?: false | undefined;
      readonly label: string;
      readonly icon?: ReactNode | undefined;
      readonly value: string;
      readonly chosen: string | null;
      readonly tone?: 'start' | 'missing' | undefined;
      readonly auto?: boolean | undefined;
      readonly autoTip?: string | undefined;
      readonly groups: readonly (readonly RoleOption[])[];
      readonly onChoose: (id: string) => void;
    };

function RoleField(props: { role: RoleSpec }): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const role = props.role;
  if (role.fixed)
    return (
      <span className="ui-role is-fixed">
        <span className="ui-role-icon" aria-hidden>
          {role.icon}
        </span>
        <span className="ui-role-value">{role.value}</span>
      </span>
    );
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`ui-role${role.tone ? ` is-${role.tone}` : ''}${role.auto ? ' is-auto' : ''}`}
        data-tip={role.auto ? role.autoTip : undefined}
        aria-label={role.label}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(event) => {
          event.stopPropagation();
          setMenu(menu ? null : event.currentTarget.getBoundingClientRect());
        }}
      >
        <span className="ui-role-icon" aria-hidden>
          {role.icon}
        </span>
        <span className="ui-role-value">{role.value}</span>
        <span className="ui-role-more" aria-hidden>
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </button>
      {menu && (
        <Menu
          label={role.label}
          x={menu.left}
          y={menu.bottom + 4}
          anchor={menu}
          minWidth={menu.width}
          returnFocus={button.current}
          onClose={() => setMenu(null)}
        >
          {role.groups.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <MenuDivider />}
              {group.map((option) => (
                <MenuItem
                  key={option.id}
                  icon={option.icon}
                  hint={option.hint}
                  checked={option.id === role.chosen}
                  disabled={option.disabledReason !== undefined}
                  disabledReason={option.disabledReason}
                  onSelect={() => {
                    setMenu(null);
                    if (option.id !== role.chosen) role.onChoose(option.id);
                  }}
                >
                  {option.label}
                </MenuItem>
              ))}
            </Fragment>
          ))}
        </Menu>
      )}
    </>
  );
}

/** A source: twisty, icon, name, a mark (2D), count, its role at the row's end. */
function SourceItem(rowProps: { row: SourceRowSpec }): JSX.Element {
  const props = rowProps.row;
  return (
    <div
      className={`ui-source${props.selected ? ' is-selected' : ''}${props.depth ? ' is-child' : ''}`}
      role="treeitem"
      aria-selected={props.selected}
      aria-expanded={props.twisty ?? undefined}
      onClick={(event) => {
        // Clicks in the role's menu bubble here through the portal (React): only the row selects.
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target) || target.closest('.ui-role, .ui-source-twisty'))
          return;
        props.onClick();
      }}
    >
      <span className="ui-source-twisty-slot">
        {props.twisty !== null && (
          <button
            type="button"
            className="ui-source-twisty"
            aria-label={props.twisty ? 'Collapse' : 'Expand'}
            onClick={props.onTwisty}
          >
            <ChevronRight size={14} className={props.twisty ? 'is-open' : ''} />
          </button>
        )}
      </span>
      <span className="ui-source-icon" aria-hidden>
        {props.icon}
      </span>
      <span className="ui-source-name" data-tip-overflow>
        {props.name}
      </span>
      <span className="ui-source-mark">{props.mark && <Tag>{props.mark}</Tag>}</span>
      <span className="ui-work-count">{props.count}</span>
      <RoleField role={props.role} />
    </div>
  );
}

/** A drawn crop as a row: icon, name, its points and Remove, or the prompt while it is drawn. */
function CropRow(rowProps: { row: Extract<WorkRow, { type: 'crop' }> }): JSX.Element {
  const props = rowProps.row;
  return (
    <div className={`ui-crop${props.prompt ? ' is-drawing' : ''}`}>
      <span />
      <span className="ui-source-icon" aria-hidden>
        {props.icon}
      </span>
      <span className="ui-source-name">{props.name}</span>
      {props.prompt ? (
        <span className="ui-crop-prompt">{props.prompt}</span>
      ) : (
        <>
          <span className="ui-work-count">{props.count}</span>
          {props.onRemove && (
            <IconButton
              size="tool"
              label="Remove crop"
              icon={<X size={14} />}
              onClick={props.onRemove}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The window's own view: the view fills it; its choice and tools float at the top left, what it
 * shows at the bottom left (mono, blue dots while it updates).
 */
export function WorkStage(props: {
  view: ReactNode;
  toolsLabel: string;
  choice: WorkChoice;
  tools: readonly ToolSpec[];
  readout: string;
  busy?: boolean | undefined;
}): JSX.Element {
  return (
    <div className="ui-work-stage">
      <div className="ui-work-view">{props.view}</div>
      <Surface kind="small" className="ui-view-tools" aria-label={props.toolsLabel}>
        {choice(props.choice)}
        <Tools tools={props.tools} />
      </Surface>
      <Surface kind="small" className="ui-view-readout" aria-live="polite">
        {props.busy && <BusyDots label="Updating" />}
        <span>{props.readout}</span>
      </Surface>
    </div>
  );
}

/** Running work: three blue dots (DESIGN-SYSTEM: the selection's blue). */
export function BusyDots(props: { label: string }): JSX.Element {
  return (
    <span className="ui-busy-dots" role="img" aria-label={props.label}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** A place of an issue: a click frames it in the view; `fixed` reads quieter. */
export interface IssuePlace {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly focus: boolean;
  readonly fixed: boolean;
  readonly onClick: () => void;
}

/**
 * One class of issues (VS Code's Problems, Xcode's issue navigator): open or resolved, its name,
 * how many are open; below, its rule (the one check glyph, a distance, how many), its places and
 * the rest one click away.
 */
export interface IssueGroupSpec {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
  readonly count: string;
  readonly rule?:
    | {
        readonly label: string;
        readonly on: boolean;
        readonly count: string;
        readonly distance?:
          | {
              readonly label: string;
              readonly value: number;
              readonly unit: string;
              readonly onChange: (value: number) => void;
            }
          | undefined;
        readonly onToggle: () => void;
      }
    | undefined;
  readonly places: readonly IssuePlace[];
  readonly more?:
    | { readonly label: string; readonly disabled: boolean; readonly onClick: () => void }
    | undefined;
}

function IssueGroup(groupProps: { group: IssueGroupSpec }): JSX.Element {
  const props = groupProps.group;
  const [expanded, setExpanded] = useState(true);
  const rule = props.rule;
  return (
    <section className={`ui-issue-group${props.done ? ' is-done' : ''}`}>
      <button
        type="button"
        className="ui-issue-head"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight size={14} className={`ui-issue-twisty${expanded ? ' is-open' : ''}`} />
        <span className="ui-issue-dot" aria-label={props.done ? 'Resolved' : 'Open'}>
          {props.done ? <Check size={13} strokeWidth={2.4} /> : <i />}
        </span>
        <span className="ui-issue-title">{props.title}</span>
        <span className="ui-work-count">{props.count}</span>
      </button>
      {expanded && (
        <div className="ui-issue-body">
          {rule && (
            <div className={`ui-issue-rule${rule.on ? ' is-on' : ''}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={rule.on}
                aria-label={rule.label}
                className="ui-issue-rule-check"
                onClick={rule.onToggle}
              >
                <CheckMark checked={rule.on} />
                <span className="ui-issue-rule-label">{rule.label}</span>
              </button>
              <span className="ui-issue-rule-value">
                {rule.distance && <NumberCell {...rule.distance} />}
              </span>
              <span className="ui-work-count">{rule.count}</span>
            </div>
          )}
          {props.places.map((place) => (
            <button
              key={place.id}
              type="button"
              className={`ui-issue-item${place.focus ? ' is-focus' : ''}${place.fixed ? ' is-fixed' : ''}`}
              onClick={place.onClick}
            >
              <span className="ui-issue-item-label" data-tip-overflow>
                {place.label}
              </span>
              <span className="ui-issue-item-detail">{place.detail}</span>
            </button>
          ))}
          {props.more && (
            <button
              type="button"
              className="ui-more-row"
              disabled={props.more.disabled}
              onClick={props.more.onClick}
            >
              {props.more.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A compact number with its unit inside a row (a rule's distance). */
function NumberCell(props: {
  label: string;
  value: number;
  unit: string;
  onChange: (value: number) => void;
}): JSX.Element {
  const [text, setText] = useState(props.value.toFixed(2));
  useEffect(() => setText(props.value.toFixed(2)), [props.value]);
  return (
    <label className="ui-number-cell" onClick={(event) => event.stopPropagation()}>
      <input
        aria-label={props.label}
        value={text}
        inputMode="decimal"
        onChange={(event) => setText(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => {
          const value = Number(text.replace(',', '.'));
          if (Number.isFinite(value) && value >= 0) props.onChange(value);
          else setText(props.value.toFixed(2));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setText(props.value.toFixed(2));
            event.currentTarget.blur();
          }
        }}
      />
      <span className="ui-number-cell-unit">{props.unit}</span>
    </label>
  );
}

/** A step: its number (none: an empty slot), what it does, how many it resolves; a click applies. */
export interface PlanStepSpec {
  readonly id: string;
  readonly no?: number | undefined;
  readonly label: string;
  readonly count: string;
  readonly onClick: () => void;
}

function Step(props: { step: PlanStepSpec; listItem?: boolean }): JSX.Element {
  const { step } = props;
  return (
    <button
      type="button"
      role={props.listItem ? 'listitem' : undefined}
      className="ui-plan-step"
      data-tip="Apply"
      onClick={step.onClick}
    >
      {step.no === undefined ? (
        <span className="ui-plan-step-slot" />
      ) : (
        <CountBadge value={step.no} label="Step" />
      )}
      <span className="ui-plan-step-label" data-tip-overflow>
        {step.label}
      </span>
      <span className="ui-work-count">{step.count}</span>
    </button>
  );
}

/** A framed plan (the suggested fixes): its title, what it does, its one action; the steps. */
export interface PlanSpec {
  readonly label: string;
  readonly title: string;
  readonly sub: string;
  readonly action: { readonly label: string; readonly onClick: () => void };
  readonly steps: readonly PlanStepSpec[];
}

function PlanBox(planProps: { plan: PlanSpec }): JSX.Element {
  const props = planProps.plan;
  return (
    <section className="ui-plan" aria-label={props.label}>
      <div className="ui-plan-head">
        <span className="ui-plan-title">{props.title}</span>
        <span className="ui-plan-sub">{props.sub}</span>
        <Button onClick={props.action.onClick}>{props.action.label}</Button>
      </div>
      {props.steps.map((step) => (
        <Step key={step.id} step={step} />
      ))}
    </section>
  );
}

/**
 * Quick fixes for the place in focus (VS Code's light bulb list), pinned under the issues; every
 * fix both ways, always (owner 2026-11-06): here, or for all it applies to.
 */
function QuickFixes(props: {
  title: string;
  detail?: string | undefined;
  fixes: readonly QuickFixSpec[];
}): JSX.Element {
  return (
    <div className="ui-quick-fixes" aria-label="Quick fixes">
      <div className="ui-quick-fixes-head">
        <Wrench size={16} aria-hidden />
        <span className="ui-quick-fixes-title">{props.title}</span>
        {props.detail && <span className="ui-quick-fixes-detail">{props.detail}</span>}
      </div>
      {props.fixes.map((fix) => (
        <div key={fix.id} className="ui-quick-fix">
          <span className="ui-quick-fix-label" data-tip-overflow>
            {fix.label}
          </span>
          <span className="ui-quick-fix-hint">{fix.hint ?? ''}</span>
          <button type="button" className="ui-quick-fix-do" onClick={fix.onThis}>
            This
          </button>
          <button
            type="button"
            className="ui-quick-fix-do"
            disabled={fix.allDisabled}
            data-tip={fix.allTip}
            onClick={fix.onAll}
          >
            {fix.all}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * The window's foot: its state at the left (how many are open, in red, or ready), the quiet
 * button and the primary one (what Enter does) at the right.
 */
export function WorkFoot(props: {
  open?: string | undefined;
  ready: string;
  secondary: { readonly label: string; readonly onClick: () => void };
  primary: {
    readonly label: string;
    readonly disabledReason?: string | undefined;
    readonly onClick: () => void;
  };
}): JSX.Element {
  return (
    <footer className="ui-work-foot">
      <span className="ui-work-foot-state">
        {props.open ? (
          <>
            <i className="ui-work-dot" aria-hidden />
            {props.open}
          </>
        ) : (
          <>
            <Check size={14} aria-hidden />
            {props.ready}
          </>
        )}
      </span>
      <div className="ui-work-foot-buttons">
        <Button onClick={props.secondary.onClick}>{props.secondary.label}</Button>
        <Button
          variant="primary"
          disabled={props.primary.disabledReason !== undefined}
          disabledReason={props.primary.disabledReason}
          onClick={props.primary.onClick}
        >
          {props.primary.label}
        </Button>
      </div>
    </footer>
  );
}
