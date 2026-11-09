/**
 * Builder UI library (docs/ui-redesign/UI-LIBRARY.md). The lab's look as components with rules
 * and tests (scripts/ui-lib-check.mjs): agents build UI from these and nothing else. A missing
 * component is proposed for the library and approved by the owner before it is used.
 */
import './tokens.css';

export { Surface, type SurfaceKind } from './Surface.js';
export {
  Panel,
  PanelEmpty,
  PanelResizeEdge,
  RailToggle,
  RailButton,
  type PanelTabSpec,
} from './Panel.js';
export { JobProgress } from './Job.js';
export { Sections, Section, PropertyRow, PropertyActions, ReadValue } from './Section.js';
export {
  TextField,
  SelectField,
  Fields,
  InlineField,
  InlineChoice,
  InlineRead,
  FieldMenu,
  Segmented,
  PickerField,
  InlineNotice,
  InlineSelect,
  InlineInfo,
  InlineCheck,
  FieldsActions,
  InlineOptions,
} from './Field.js';
export {
  FIELD_MENU_ORDER,
  FIELD_MENU_TITLE,
  type FieldMenuGroup,
  type FieldMenuItem,
  type FieldMenuKind,
} from './fieldMenu.js';
export { Button, IconButton, CopyButton } from './Button.js';
export { ConsolePanel, ConsoleLine } from './Console.js';
export {
  Menu,
  MenuItem,
  MenuSection,
  MenuDivider,
  MenuSearch,
  MenuOption,
  MenuSub,
  MenuScroll,
  MenuTabs,
  MenuRename,
  SlotGrid,
  type SlotTool,
  type SlotOption,
  type SlotSearch,
  Slot,
  SlotAssignment,
  CheckMark,
  CheckMenuItems,
} from './Menu.js';
export { ToolList, ToolItem, ToolSub } from './Tools.js';
export {
  ToolBar,
  ToolBarDivider,
  ToolBarScroll,
  ToolBarButton,
  ToolBarTip,
  ToolBarEmpty,
  WorkspaceButton,
} from './ToolBar.js';
export {
  ListPane,
  ListToolbar,
  FilterField,
  List,
  ListRow,
  PlayButton,
  PlaySlot,
  Twisty,
  RowIcon,
  ListName,
  RenameField,
  RowMark,
  StateButton,
  StateSlot,
  StateGlyph,
  ListEmpty,
  type ItemState,
} from './List.js';
export {
  TitlePill,
  TitleBrand,
  TitleName,
  TitleButton,
  StatusGroup,
  StatusAnchor,
  StatusItem,
  CountBadge,
  CoordinateReadout,
  SnapReadout,
} from './Pill.js';
export {
  Chat,
  ChatHead,
  ChatMessage,
  ChatMention,
  ChatSteps,
  ChatStep,
  ChatWorking,
  ChatTurnEnd,
  ChatAction,
  ChatCard,
  ChatRow,
  ChatChoices,
  ChatBubble,
  ChatChips,
  ChatMetrics,
  ChatGrid,
  ChatFooter,
  ChatThumb,
  ChatWorkspace,
  NavSection,
  NavItem,
  NavSpacer,
  ChatCode,
  ChatEmbed,
  ChatImage,
  Composer,
  ComposerChip,
  ChatColumnRole,
  ChatWorkLog,
  ChatThought,
  ChatTable,
  ChatMessageMeta,
  ChatChanges,
  ChatQueued,
  type ChatChoiceSpec,
  type ChatStepState,
  type ChatPromptSpec,
  type ChatPromptOption,
} from './Chat.js';
// Proposal 2026-11-07 (agent window, round 6), not decided by the owner: UI-LIBRARY.md › Proposed:
// agent window.
export {
  SessionRow,
  SessionGroup,
  SessionShelf,
  SettingsSection,
  SettingsRow,
  UsageMeter,
  ModelPicker,
  type SessionRowState,
  type SettingControl,
  type PickerProvider,
} from './Agent.js';
export { AppWindow, WindowView, DropOverlay, PopoutWindow, TabGhost } from './Window.js';
// Proposal 2026-11-06 (design/start-screen), not decided by the owner: UI-LIBRARY.md › Proposed:
// start screen.
export {
  StartScreen,
  StartTitle,
  StartList,
  StartProject,
  StartButton,
  StartButtons,
  StartPage,
  StartPopout,
  StartPopoutRow,
} from './Start.js';
// Proposal 2026-11-06 (design/specifications), not decided by the owner: UI-LIBRARY.md ›
// Proposed: library window.
export {
  LibraryWindow,
  LibraryBody,
  KindRail,
  LibraryNav,
  LibraryMain,
  SearchField,
  SearchChips,
  LibraryTable,
  LibraryInspector,
  InspectorNote,
  LibraryPreview,
  TextSample,
  LabelSample,
  CatalogChip,
  ToolSeparator,
  SourceRow,
  OpenButton,
  TagField,
  ImageValue,
  type LibraryColumn,
  type LibraryColumnKind,
  type LibraryRowState,
  type LibraryNavEntry,
} from './Library.js';
export {
  ManagerBody,
  CompanySwitcher,
  SidebarSearch,
  PageHead,
  PageToolbar,
  PageContent,
  CardRow,
  KindCards,
  Card,
  DataTable,
  type ColumnKind,
  type TableRow,
  NameCell,
  CodeCell,
  Tag,
  TileGrid,
  InspectorColumn,
  ValueList,
  Confirm,
  FolderMap,
  type ManagerAction,
} from './Manager.js';
export {
  WorkWindow,
  WorkHead,
  WorkSide,
  WorkAside,
  WorkStage,
  WorkFoot,
  BusyDots,
  type WorkTool,
  type WorkChoice,
  type WorkRow,
  type RoleSpec,
  type RoleOption,
  type IssueGroupSpec,
  type IssuePlace,
  type PlanSpec,
  type PlanStepSpec,
  type QuickFixSpec,
} from './Work.js';
export { SubsetField, type SubsetGroup } from './Subset.js';
// Proposal 2026-11-07 (not decided by the owner): select by criteria, the selection manager (F4).
export {
  QueryConditions,
  QuerySaved,
  type QueryCondition,
  type QueryKey,
  type QueryOption,
  type QueryPatch,
  type SavedQuery,
} from './Query.js';
export { ColourField, ColourPicker, type LibraryColour } from './Colour.js';
export { LinkField } from './LinkField.js';
export { ResourceField } from './ResourceField.js';
export { PickButton, ResultList, TypePicks, type ResultRow, type TypePick } from './Pick.js';
// Proposal 2026-11-07 (attribute system), not decided by the owner: UI-LIBRARY.md › Proposed:
// tables.
export {
  TableValue,
  TableWindow,
  Sheet,
  KeyList,
  type SheetColumn,
  type SheetColumnType,
  type SheetGroup,
  type SheetCell,
  type SheetRow,
  type SheetMenuEntry,
  type KeyItem,
  type KeyAdd,
} from './Table.js';
export { TooltipLayer } from './Tooltip.js';
export { tip, isShortName } from './copy.js';
export { uiRoot, usePlacement, type AnchorRect } from './placement.js';
