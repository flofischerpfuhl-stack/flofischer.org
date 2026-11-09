import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileDown,
  ListPlus,
  Maximize2,
  Pencil,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { tip } from './copy.js';
import { RenameField } from './List.js';
import { Button, CopyButton } from './Button.js';
import { CheckMark } from './Menu.js';
import './section.css';
import './chat.css';

/*
 * Chat (proposal 2026-11-06, design/chats — UI-LIBRARY.md › Proposed: chat). The agent chat and
 * the import chat share one language: a tab of the right panel with a head, a log that stays at its
 * end while new things arrive, and a dock for what waits for the user (a card, the composer or the
 * one button). Steps are function rows with the function's own icon; answers are Properties rows.
 */

/** The chat column of a panel tab: head, log, dock. */
export function Chat(props: {
  label: string;
  head?: ReactNode | undefined;
  /** What waits for the user, under the log: cards, the composer, the one button. */
  dock?: ReactNode | undefined;
  /** Changes when the log grows; the log follows when it was at its end. */
  scrollKey?: string | number | undefined;
  children: ReactNode;
}): JSX.Element {
  const log = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  useLayoutEffect(() => {
    const el = log.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [props.scrollKey]);
  return (
    <section className="ui-chat" aria-label={props.label}>
      {props.head}
      <div
        ref={log}
        className="ui-chat-log"
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const el = event.currentTarget;
          atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
      >
        {props.children}
      </div>
      {props.dock && <div className="ui-chat-dock">{props.dock}</div>}
    </section>
  );
}

/**
 * The head: what the chat is about (the session, the file) and its quiet tools. With `onMenu` the
 * title opens the session menu (Figma's page name).
 */
export function ChatHead(props: {
  title: string;
  /** Under the title, quiet (the file's format). */
  meta?: string | undefined;
  /** Where the chat lives, before the title as a breadcrumb (t3code: project / thread). */
  context?: string | undefined;
  /**
   * Rename in place (owner 2026-11-06: „warum kein Inline-Edit?"): double-click or F2 on the
   * title; Enter or leaving commits, Esc cancels.
   */
  onRename?: ((name: string) => void) | undefined;
  /** Counts up when Rename is chosen elsewhere (a session's menu): the title turns into the field. */
  renameRequest?: number | undefined;
  tools?: ReactNode | undefined;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (props.renameRequest) setEditing(true);
  }, [props.renameRequest]);
  return (
    <header className="ui-chat-head">
      {props.context && (
        <span className="ui-chat-context">
          <span>{props.context}</span>
          <span aria-hidden>/</span>
        </span>
      )}
      {editing && props.onRename ? (
        <span className="ui-chat-title is-editing">
          <RenameField
            label="Session name"
            defaultValue={props.title}
            onCommit={(name) => {
              setEditing(false);
              if (name.trim() && name !== props.title) props.onRename?.(name.trim());
            }}
            onCancel={() => setEditing(false)}
          />
        </span>
      ) : props.onRename ? (
        <button
          type="button"
          className="ui-chat-title is-renamable"
          data-tip-overflow
          aria-label={`${props.title} · rename with F2`}
          onDoubleClick={() => setEditing(true)}
          onKeyDown={(event) => {
            if (event.key === 'F2') setEditing(true);
          }}
        >
          <span>{props.title}</span>
        </button>
      ) : (
        <h3 className="ui-chat-title" data-tip-overflow>
          <span>{props.title}</span>
        </h3>
      )}
      {props.meta && <span className="ui-chat-meta">{props.meta}</span>}
      {props.tools && <div className="ui-chat-tools">{props.tools}</div>}
    </header>
  );
}

/** A message: the user's on a control-grey block at the right, the agent's as plain text. */
export function ChatMessage(props: { from: 'user' | 'agent'; children: ReactNode }): JSX.Element {
  return (
    <div className={`ui-chat-msg is-${props.from}`}>
      <div className="ui-chat-text">{props.children}</div>
    </div>
  );
}

/**
 * An element named in a message (a mention): its icon and name. A click selects it; `state`
 * marks a mention whose element changed (stale) or is gone (removed, never rebound by name).
 * In the composer it can be taken out again (`onRemove`).
 */
export function ChatMention(props: {
  label: string;
  icon?: ReactNode | undefined;
  state?: 'stale' | 'removed' | undefined;
  onSelect?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  tip?: string | undefined;
}): JSX.Element {
  return (
    <span className={`ui-chat-mention${props.state ? ` is-${props.state}` : ''}`}>
      <button
        type="button"
        className="ui-chat-mention-main"
        data-tip={props.tip}
        onClick={props.onSelect}
      >
        {props.icon}
        <span>{props.label}</span>
      </button>
      {props.onRemove && (
        <button
          type="button"
          className="ui-chat-mention-remove"
          aria-label={`Remove ${props.label}`}
          onClick={props.onRemove}
        >
          <X size={11} aria-hidden />
        </button>
      )}
    </span>
  );
}

export type ChatStepState = 'done' | 'running' | 'failed' | 'waiting';

function StepState(props: { state: ChatStepState }): JSX.Element {
  return (
    <span className={`ui-chat-state is-${props.state}`} aria-label={props.state}>
      {props.state === 'done' && <Check size={14} aria-hidden />}
      {props.state === 'running' && <ChatDotsInner />}
      {props.state === 'failed' && <CircleAlert size={14} aria-hidden />}
      {props.state === 'waiting' && <span className="ui-chat-wait" aria-hidden />}
    </span>
  );
}

function ChatDotsInner(): JSX.Element {
  return (
    <span className="ui-chat-dots" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * What the agent did, folded: „3 steps · Parallel" with the state of the last one; open, the steps
 * underneath (Assembler: consecutive calls fold into one line).
 */
export function ChatSteps(props: {
  count: number;
  /** The last step's name. */
  summary: string;
  state: ChatStepState;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-chat-steps">
      <button
        type="button"
        className="ui-chat-step is-group"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <ChevronRight size={14} className={`ui-twisty${props.open ? ' is-open' : ''}`} />
        <span className="ui-chat-step-label">
          <span className="ui-chat-step-count">
            {props.count} {props.count === 1 ? 'step' : 'steps'}
          </span>
          {!props.open && <span className="ui-chat-step-value">{props.summary}</span>}
        </span>
        {!props.open && <StepState state={props.state} />}
      </button>
      {props.open && <div className="ui-chat-steps-body">{props.children}</div>}
    </div>
  );
}

/**
 * One step: the function's own icon, its name and what it made; the state at the end (done: a
 * quiet check, running: blue dots, failed: red, waiting for the user: a neutral dot). A click
 * selects what it made.
 */
export function ChatStep(props: {
  icon: ReactNode;
  label: string;
  value?: string | undefined;
  state: ChatStepState;
  /** A failed step's message, under it in red. */
  error?: string | undefined;
  onSelect?: (() => void) | undefined;
  /**
   * What the call was given and returned, and the same call as the Python SDK writes it (t3code:
   * expand a tool call to see its command and output). With either, a chevron opens them.
   */
  params?: readonly (readonly [string, string])[] | undefined;
  command?: string | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const more = (props.params?.length ?? 0) > 0 || !!props.command;
  return (
    <>
      <div className="ui-chat-step-line">
        <button
          type="button"
          className={`ui-chat-step is-${props.state}`}
          onClick={props.onSelect}
          disabled={!props.onSelect}
        >
          <span className="ui-chat-step-icon">{props.icon}</span>
          <span className="ui-chat-step-label">
            <span>{props.label}</span>
            {props.value && <span className="ui-chat-step-value">{props.value}</span>}
          </span>
          <StepState state={props.state} />
        </button>
        {more ? (
          <button
            type="button"
            className="ui-chat-step-more"
            aria-expanded={open}
            aria-label={`${props.label} details`}
            data-tip={open ? 'Hide details' : 'Details'}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight size={14} className={`ui-twisty${open ? ' is-open' : ''}`} />
          </button>
        ) : (
          <span className="ui-chat-step-more" aria-hidden />
        )}
      </div>
      {props.error && <div className="ui-chat-error">{props.error}</div>}
      {open && (
        <div className="ui-chat-step-detail">
          {props.params?.map(([label, value]) => (
            <ChatRow key={label} label={label}>
              {value}
            </ChatRow>
          ))}
          {props.command && (
            <pre className="ui-chat-step-command">
              <code>{props.command}</code>
            </pre>
          )}
        </div>
      )}
    </>
  );
}

/** Running work: blue dots, what it is doing and for how long („Working · 0:08"). */
export function ChatWorking(props: { label: string; detail?: string | undefined }): JSX.Element {
  return (
    <div className="ui-chat-working" role="status">
      <ChatDotsInner />
      <span>{props.label}</span>
      {props.detail && <span className="ui-chat-step-value">{props.detail}</span>}
    </div>
  );
}

/** The end of a turn: what changed, and its actions (Select, Undo). */
export function ChatTurnEnd(props: { label: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="ui-chat-turn-end">
      <span>{props.label}</span>
      {props.children && <span className="ui-chat-actions">{props.children}</span>}
    </div>
  );
}

/** A quiet text action inside the log (Select, Undo, Skip). */
export function ChatAction(props: {
  onClick: () => void;
  keyHint?: string | undefined;
  disabled?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className="ui-chat-action"
      data-tip={props.keyHint}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/**
 * Something that waits for the user (an approval, a pick) or a result worth a frame (a preview):
 * a framed card with a strong title, its rows and its buttons. Deny before Allow.
 */
export function ChatCard(props: {
  title: string;
  icon?: ReactNode | undefined;
  /** Waiting for the user: the neutral dot in the title. */
  waiting?: boolean | undefined;
  /** In the import chat: under the messages, after the avatar's column. */
  inset?: boolean | undefined;
  actions?: ReactNode | undefined;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`ui-chat-card${props.waiting ? ' is-waiting' : ''}${props.inset ? ' is-inset' : ''}`}
    >
      <div className="ui-chat-card-head">
        {props.icon && <span className="ui-chat-step-icon">{props.icon}</span>}
        <span className="ui-chat-card-title">{props.title}</span>
        {props.waiting && <span className="ui-chat-wait" aria-label="Waiting" />}
      </div>
      {props.children && <div className="ui-chat-card-body">{props.children}</div>}
      {props.actions && <div className="ui-chat-card-actions">{props.actions}</div>}
    </div>
  );
}

/** A row of a card: a short label and its value (a card's own grid, narrower than Properties). */
export function ChatRow(props: {
  label: string;
  mono?: boolean | undefined;
  muted?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-chat-row">
      <span className="ui-chat-row-label">{props.label}</span>
      <span
        className={`ui-chat-row-value${props.mono ? ' is-mono' : ''}${props.muted ? ' is-muted' : ''}`}
      >
        {props.children}
      </span>
    </div>
  );
}

export interface ChatChoiceSpec {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** A candidate's letter (A, B, C), shown in the view at the same element. */
  readonly letter?: string;
  /** Quiet text at the row's end (a value, a count). */
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

/**
 * What the user can answer, one row each (a menu's rows in a frame): the recommended first, Enter
 * takes the focused row, ↑/↓ move. Names, not explanations.
 */
export function ChatChoices(props: {
  label: string;
  options: readonly ChatChoiceSpec[];
  onChoose: (id: string) => void;
  /** The first row takes the keyboard when the question appears. */
  autoFocus?: boolean | undefined;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.autoFocus) ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [props.autoFocus]);
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => rows[(i + rows.length) % rows.length]?.focus();
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? rows.length - 1 : at - 1);
    else return;
    event.preventDefault();
  };
  return (
    <div
      ref={ref}
      className="ui-chat-choices"
      role="group"
      aria-label={props.label}
      onKeyDown={step}
    >
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="ui-chat-choice"
          disabled={option.disabled}
          data-tip={option.disabled ? option.disabledReason : undefined}
          onClick={() => props.onChoose(option.id)}
        >
          {option.letter ? (
            <span className="ui-chat-letter">{option.letter}</span>
          ) : (
            <span className="ui-chat-step-icon">{option.icon}</span>
          )}
          <span className="ui-chat-choice-label">{option.label}</span>
          {option.hint && <span className="ui-chat-choice-hint">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export interface ChatPromptOption {
  readonly id: string;
  readonly label: string;
  /** Quiet second line (where the candidate is). */
  readonly hint?: string;
  /** A candidate's letter, also shown in the view (A, B, C); otherwise its number key. */
  readonly letter?: string;
}

/**
 * What the session waits for, attached to the composer's top (t3code's pending input): a question
 * with its answers (1, 2, 3 or the candidates' letters; or the user's own words in the composer,
 * which then says Submit), or an approval with Deny and Allow once. Data, not children: the panel
 * cannot hold anything but an answer list or an approval's rows.
 */
export type ChatPromptSpec =
  | {
      readonly kind: 'choice';
      readonly topic: string;
      readonly question: string;
      readonly options: readonly ChatPromptOption[];
      readonly onChoose: (id: string) => void;
      /** The user's own answer, typed in the composer. */
      readonly onAnswer: (text: string) => void;
    }
  | {
      readonly kind: 'approval';
      readonly title: string;
      readonly icon?: ReactNode;
      readonly rows: readonly (readonly [label: string, value: string])[];
      readonly onDeny: () => void;
      readonly onAllow: () => void;
    };

function Prompt(props: {
  spec: ChatPromptSpec;
  chosen: string | null;
  onPick: (id: string) => void;
}): JSX.Element {
  const { spec } = props;
  if (spec.kind === 'approval')
    return (
      <div className="ui-composer-prompt is-approval" role="group" aria-label={spec.title}>
        <div className="ui-composer-prompt-head">
          {spec.icon && <span className="ui-chat-step-icon">{spec.icon}</span>}
          <span className="ui-composer-prompt-title">{spec.title}</span>
          <span className="ui-chat-wait" aria-label="Waiting" />
        </div>
        <div className="ui-composer-prompt-rows">
          {spec.rows.map(([label, value]) => (
            <ChatRow key={label} label={label}>
              {value}
            </ChatRow>
          ))}
        </div>
        <div className="ui-composer-prompt-actions">
          <Button onClick={spec.onDeny}>Deny</Button>
          <Button onClick={spec.onAllow}>Allow once</Button>
        </div>
      </div>
    );
  return (
    <div className="ui-composer-prompt" role="group" aria-label={spec.question}>
      <div className="ui-composer-prompt-topic">
        <span>{spec.topic}</span>
        <span className="ui-chat-wait" aria-label="Waiting" />
      </div>
      <div className="ui-composer-prompt-title">{spec.question}</div>
      <div className="ui-composer-options" role="radiogroup" aria-label={spec.question}>
        {spec.options.map((option, i) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={props.chosen === option.id}
            className={`ui-composer-option${props.chosen === option.id ? ' is-chosen' : ''}`}
            onClick={() => props.onPick(option.id)}
            onDoubleClick={() => spec.onChoose(option.id)}
          >
            <span className="ui-composer-option-key">{option.letter ?? String(i + 1)}</span>
            <span className="ui-composer-option-text">
              <span>{option.label}</span>
              {option.hint && <small>{option.hint}</small>}
            </span>
            <CheckMark checked={props.chosen === option.id} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The composer (t3code, Assembler): what the session waits for on top (`prompt`), mentions, the
 * text and one row of controls with the round Send at the end — nothing under the frame (owner
 * 2026-11-07: „unter der Chateingabe verschenken wir noch viel zu viel Platz"). While a turn runs
 * an empty composer offers Stop; typed text is queued for after the turn (t3code's follow-ups).
 * With a question, the same round button submits the chosen answer or the typed one (owner: „vllt.
 * kleinerer Button ohne diesen Schriftzug"). Enter sends (or Ctrl+Enter, `sendWith`), Shift+Enter
 * breaks the line; ↑ in an empty composer brings back the earlier messages (`history`, t3code).
 */
export function Composer(props: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSend: () => void;
  running?: boolean | undefined;
  onStop?: (() => void) | undefined;
  mentions?: ReactNode | undefined;
  controls?: ReactNode | undefined;
  /** Controls beside Send (t3code: the model and its effort). */
  controlsEnd?: ReactNode | undefined;
  inputRef?: Ref<HTMLTextAreaElement> | undefined;
  prompt?: ChatPromptSpec | null | undefined;
  /** The user's earlier messages of this session, oldest first (↑ / ↓ walk them). */
  history?: readonly string[] | undefined;
  sendWith?: 'enter' | 'ctrl' | undefined;
}): JSX.Element {
  const empty = props.value.trim().length === 0;
  const [chosen, setChosen] = useState<string | null>(null);
  // Where ↑ stands in the history; null while the text is the user's own draft.
  const [recall, setRecall] = useState<number | null>(null);
  const choice = props.prompt?.kind === 'choice' ? props.prompt : null;
  // A new question starts without an answer (keyed by its words: the spec is rebuilt each render).
  const promptKey = !props.prompt
    ? ''
    : props.prompt.kind === 'choice'
      ? props.prompt.question
      : props.prompt.title;
  useEffect(() => setChosen(null), [promptKey]);
  const sendKey = props.sendWith === 'ctrl' ? 'Ctrl+Enter' : 'Enter';
  const submit = () => {
    setRecall(null);
    if (choice) {
      if (!empty) choice.onAnswer(props.value.trim());
      else if (chosen) choice.onChoose(chosen);
      return;
    }
    if (!empty) props.onSend();
  };
  const queue = props.running && !empty && !choice;
  const history = props.history ?? [];
  return (
    <div className={`ui-composer-wrap${props.prompt ? ' has-prompt' : ''}`}>
      {props.prompt && <Prompt spec={props.prompt} chosen={chosen} onPick={setChosen} />}
      <div className="ui-composer">
        {props.mentions && <div className="ui-composer-mentions">{props.mentions}</div>}
        <textarea
          ref={props.inputRef}
          className="ui-composer-input"
          aria-label={props.label}
          placeholder={choice ? 'Your own answer' : props.placeholder}
          rows={2}
          value={props.value}
          onChange={(event) => {
            setRecall(null);
            props.onChange(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            const ctrl = event.ctrlKey || event.metaKey;
            if (event.key === 'Enter' && !event.shiftKey && (props.sendWith !== 'ctrl' || ctrl)) {
              event.preventDefault();
              submit();
            }
            if (choice && empty && !ctrl) {
              const at = choice.options.findIndex(
                (o, i) => (o.letter ?? String(i + 1)).toLowerCase() === event.key.toLowerCase(),
              );
              if (at >= 0) {
                event.preventDefault();
                setChosen(choice.options[at]!.id);
              }
            }
            // ↑ in an empty composer (or on a recalled message) goes back, ↓ forward.
            if (!choice && history.length && (empty || recall !== null)) {
              const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
              if (step) {
                const at = (recall ?? history.length) + step;
                if (at >= 0 && at <= history.length) {
                  event.preventDefault();
                  setRecall(at === history.length ? null : at);
                  props.onChange(at === history.length ? '' : history[at]!);
                }
              }
            }
            if (event.key === 'Escape') {
              if (props.running && props.onStop) props.onStop();
              else event.currentTarget.blur();
            }
          }}
        />
        <div className="ui-composer-row">
          {props.controls}
          <span className="ui-composer-spacer" />
          {props.controlsEnd}
          {props.running && empty && !choice ? (
            <button
              type="button"
              className="ui-composer-send is-stop"
              aria-label="Stop"
              data-tip={tip('Stop', 'Esc')}
              onClick={props.onStop}
            >
              <Square size={10} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="ui-composer-send"
              aria-label={choice ? 'Submit' : queue ? 'Queue' : 'Send'}
              data-tip={tip(choice ? 'Submit' : queue ? 'Queue' : 'Send', sendKey)}
              disabled={choice ? empty && !chosen : empty}
              onClick={submit}
            >
              {queue ? <ListPlus size={15} aria-hidden /> : <ArrowUp size={15} aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A control in the composer's row: a value that opens its menu (model, effort) or an icon. */
export function ComposerChip(props: {
  label: string;
  icon?: ReactNode | undefined;
  /** The value shown; without it the chip is the icon alone with its name as tooltip. */
  value?: string | undefined;
  /** A second value, quiet (the model's effort: „Opus 4.6 High"). */
  detail?: string | undefined;
  expanded?: boolean | undefined;
  chipRef?: Ref<HTMLButtonElement> | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
  return (
    <button
      ref={props.chipRef}
      type="button"
      className={`ui-composer-chip${props.value ? '' : ' is-icon'}`}
      aria-label={props.label}
      aria-haspopup={props.expanded !== undefined ? 'menu' : undefined}
      aria-expanded={props.expanded}
      data-tip={props.label}
      onClick={props.onClick}
    >
      {props.icon}
      {props.value && <span>{props.value}</span>}
      {props.detail && <span className="ui-composer-chip-detail">{props.detail}</span>}
    </button>
  );
}

/** A column's role in a `ChatGrid` head: the role and a chevron; a click opens the roles. */
export function ChatColumnRole(props: {
  role: string;
  /** Ignore: the column stays out (quiet). */
  ignored?: boolean | undefined;
  expanded?: boolean | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ui-chat-role${props.ignored ? ' is-ignored' : ''}`}
      aria-haspopup="menu"
      aria-expanded={props.expanded ?? false}
      aria-label={`Column role ${props.role}`}
      onClick={props.onClick}
    >
      <span>{props.role}</span>
      <ChevronDown size={12} aria-hidden />
    </button>
  );
}

/*
 * The import chat (owner 2026-11-06: built on the existing PhotoLab/Builder import chat, in its own
 * window): the app's messages with an avatar and a tail, the user's answers as bubbles at the
 * right with Revert under them, choice chips, cards, metrics, a table and a footer.
 */

/**
 * A message of the import chat. `system`: the avatar and a bubble with a title and a detail
 * (red for an error). `user`: the answer, at the right. `onRevert`: back to this step.
 */
export function ChatBubble(props: {
  from: 'system' | 'user';
  title?: string | undefined;
  detail?: string | undefined;
  tone?: 'error' | undefined;
  /** The system's avatar: the function's own icon (Import) — never a robot, that is the agent. */
  avatar?: ReactNode | undefined;
  onRevert?: (() => void) | undefined;
  children?: ReactNode;
}): JSX.Element {
  const revert = props.onRevert && (
    <button
      type="button"
      className="ui-chat-revert"
      aria-label="Revert to this step"
      data-tip="Revert"
      onClick={props.onRevert}
    >
      <RotateCcw size={11} aria-hidden />
    </button>
  );
  if (props.from === 'user')
    return (
      <div className="ui-chat-bubble-row is-user">
        <div className="ui-chat-bubble is-user">{props.children ?? props.title}</div>
        {revert}
      </div>
    );
  return (
    <div className="ui-chat-bubble-row is-system">
      <div className="ui-chat-bubble-line">
        <span className="ui-chat-avatar" aria-hidden>
          {props.avatar}
        </span>
        <div className={`ui-chat-bubble is-system${props.tone ? ` is-${props.tone}` : ''}`}>
          {props.title && <strong>{props.title}</strong>}
          {props.children}
          {props.detail && <small>{props.detail}</small>}
        </div>
      </div>
      {revert}
    </div>
  );
}

/**
 * The answers to the last message as chips (PhotoLab's choices), the recommended one first and
 * strong. Once answered they lock; the answer shows as the user's bubble.
 */
export function ChatChips(props: {
  label: string;
  options: readonly {
    readonly id: string;
    readonly label: string;
    readonly primary?: boolean;
    readonly disabled?: boolean;
  }[];
  chosen?: string | undefined;
  onChoose: (id: string) => void;
}): JSX.Element {
  const locked = props.chosen !== undefined;
  return (
    <div className="ui-chat-chips" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`ui-chat-chip${option.primary ? ' is-primary' : ''}${props.chosen === option.id ? ' is-chosen' : ''}`}
          disabled={locked || option.disabled}
          onClick={() => props.onChoose(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Figures in a grid of small framed cells (PhotoLab's metrics): label, value. */
export function ChatMetrics(props: {
  items: readonly (readonly [label: string, value: string])[];
}): JSX.Element {
  return (
    <div className="ui-chat-metrics">
      {props.items.map(([label, value]) => (
        <div key={label} className="ui-chat-metric">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

/** A table inside a card (sample rows, point pairs): mono, digits right; invalid cells red. */
export function ChatGrid(props: {
  label: string;
  head: readonly ReactNode[];
  rows: readonly (readonly ReactNode[])[];
  invalid?: readonly (readonly [row: number, column: number])[] | undefined;
  /** The row being worked on (the next pair): bright. */
  current?: number | undefined;
}): JSX.Element {
  const bad = new Set((props.invalid ?? []).map(([r, c]) => `${r}:${c}`));
  return (
    <div className="ui-chat-grid">
      <table aria-label={props.label}>
        <thead>
          <tr>
            {props.head.map((cell, c) => (
              <th key={c}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, r) => (
            <tr key={r} className={props.current === r ? 'is-current' : undefined}>
              {row.map((cell, c) => (
                <td key={c} className={bad.has(`${r}:${c}`) ? 'is-invalid' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The import chat's footer: where it stands (quiet, left), then its buttons. */
export function ChatFooter(props: { status: string; children: ReactNode }): JSX.Element {
  return (
    <footer className="ui-chat-footer">
      <span className="ui-chat-footer-status">{props.status}</span>
      {props.children}
    </footer>
  );
}

/** A small picture in a card (an image's preview where it becomes an attribute). */
export function ChatThumb(props: { src: string; alt: string }): JSX.Element {
  return <img className="ui-chat-thumb" src={props.src} alt={props.alt} />;
}

/*
 * The agent's own window (proposal round 2, 2026-11-06; owner: „von den coolen UX-Entscheidungen
 * von t3code profitieren … das linke Sidepanel mit Threads, Settings" and „von der Darstellung von
 * Inline-HTML usw."): a sidebar of sessions and settings, the conversation in a readable column,
 * the composer under it, the project changes of the session at the right (t3code's diff panel).
 */

/** The agent window's layout: sidebar, head, conversation, composer; an aside at the right. */
export function ChatWorkspace(props: {
  label: string;
  sidebar: ReactNode;
  head: ReactNode;
  composer?: ReactNode | undefined;
  aside?: ReactNode | undefined;
  scrollKey?: string | number | undefined;
  /** A page that reads from the top (Settings) rather than a conversation that follows its end. */
  fromTop?: boolean | undefined;
  /**
   * A session without messages (t3code's new thread): the question and where it works, centred,
   * with the composer under them instead of at the foot.
   */
  empty?: { readonly title: string; readonly context: string } | undefined;
  /** The sidebar's own label (Sessions, Settings). */
  sidebarLabel?: string | undefined;
  children: ReactNode;
}): JSX.Element {
  const log = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const following = useRef(true);
  following.current = atEnd && !props.fromTop;
  const toEnd = () => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useLayoutEffect(() => {
    const el = log.current;
    if (!el) return;
    if (props.fromTop) el.scrollTop = 0;
    else if (atEnd || !props.scrollKey) el.scrollTop = el.scrollHeight;
    // A new session or page starts at its end (or its top); new content keeps following.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scrollKey, props.fromTop]);
  // Pictures and frames that load later grow the log: it stays at its end while it was there.
  const hasLog = !props.empty;
  useEffect(() => {
    const el = log.current;
    const column = el?.firstElementChild;
    if (!hasLog || !el || !column) return;
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, [hasLog]);
  return (
    <section className="ui-chat-ws" aria-label={props.label}>
      <nav className="ui-chat-ws-side" aria-label={props.sidebarLabel ?? 'Sessions'}>
        {props.sidebar}
      </nav>
      <div className="ui-chat-ws-main">
        {props.head}
        {props.empty ? (
          <div className="ui-chat-ws-empty">
            <div className="ui-chat-ws-column">
              <h2 className="ui-chat-ws-hero">{props.empty.title}</h2>
              <p className="ui-chat-ws-hero-context">{props.empty.context}</p>
              {props.composer}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={log}
              className="ui-chat-ws-log"
              role="log"
              aria-live="polite"
              onScroll={(event) => {
                const el = event.currentTarget;
                setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
              }}
            >
              <div className="ui-chat-ws-column">{props.children}</div>
            </div>
            {props.composer && (
              <div className="ui-chat-ws-dock">
                {!atEnd && !props.fromTop && (
                  <button type="button" className="ui-chat-to-end" onClick={toEnd}>
                    <ArrowDown size={14} aria-hidden />
                    <span>Scroll to end</span>
                  </button>
                )}
                <div className="ui-chat-ws-column">{props.composer}</div>
              </div>
            )}
          </>
        )}
      </div>
      {props.aside && <aside className="ui-chat-ws-aside">{props.aside}</aside>}
    </section>
  );
}

/** Pushes the rest of a navigation list to its foot (Settings). */
export function NavSpacer(): JSX.Element {
  return <span className="ui-nav-spacer" aria-hidden />;
}

/** A group heading in a navigation list (Today, Earlier). */
export function NavSection(props: { children: ReactNode }): JSX.Element {
  return <div className="ui-nav-section">{props.children}</div>;
}

/**
 * A row of a navigation list (t3code's threads, VS Code's sidebar): an icon, the name, quiet meta
 * at the end (a time) or the state (running: blue dots, waiting: the neutral dot); the open one
 * filled. Right-click: its menu (Rename, Delete).
 */
export function NavItem(props: {
  label: string;
  icon?: ReactNode | undefined;
  meta?: string | undefined;
  state?: 'running' | 'waiting' | undefined;
  active?: boolean | undefined;
  onSelect: () => void;
  onContextMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ui-nav-item${props.active ? ' is-active' : ''}`}
      aria-current={props.active ? 'page' : undefined}
      onClick={props.onSelect}
      onContextMenu={props.onContextMenu}
      data-tip-overflow
    >
      {props.icon}
      <span className="ui-nav-label">{props.label}</span>
      {props.state === 'running' ? (
        <ChatDotsInner />
      ) : props.state === 'waiting' ? (
        <span className="ui-chat-wait" aria-label="Waiting" />
      ) : (
        props.meta && <span className="ui-nav-meta">{props.meta}</span>
      )}
    </button>
  );
}

/** Code the agent shows or ran (a Python script): the language, Copy, the code in mono. */
export function ChatCode(props: { language: string; code: string }): JSX.Element {
  return (
    <div className="ui-chat-code">
      <div className="ui-chat-code-head">
        <span>{props.language}</span>
        <CopyButton value={props.code} label="Code" />
      </div>
      <pre>
        <code>{props.code}</code>
      </pre>
    </div>
  );
}

/**
 * Rich content the agent made, shown inline (t3code renders HTML and the like): a report or chart
 * as HTML in a sandboxed frame (no scripts, no network), with its actions (Open, Save).
 */
export function ChatEmbed(props: {
  title: string;
  html: string;
  height: number;
  /** Save as PDF (t3code's visual replies keep a page the user can take along). */
  onSave?: (() => void) | undefined;
}): JSX.Element {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setFull(false);
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [full]);
  const tools = (
    <span className="ui-chat-embed-tools">
      {props.onSave && (
        <button
          type="button"
          className="ui-chat-embed-tool"
          aria-label="Save as PDF"
          data-tip="Save as PDF"
          onClick={props.onSave}
        >
          <FileDown size={14} aria-hidden />
        </button>
      )}
      <button
        type="button"
        className="ui-chat-embed-tool"
        aria-label={full ? 'Close' : 'Expand'}
        data-tip={full ? tip('Close', 'Esc') : 'Expand'}
        onClick={() => setFull(!full)}
      >
        {full ? <X size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
      </button>
    </span>
  );
  return (
    <figure className={`ui-chat-embed${full ? ' is-full' : ''}`}>
      <div className="ui-chat-embed-frame">
        <iframe
          title={props.title}
          sandbox=""
          srcDoc={props.html}
          style={full ? undefined : { height: props.height }}
        />
        {tools}
      </div>
      <figcaption className="ui-chat-embed-caption">
        <span>{props.title}</span>
        <span className="ui-chat-embed-kind">HTML</span>
      </figcaption>
    </figure>
  );
}

/**
 * The work of a turn, folded (t3code: „Worked for 2m 16s ›"): its header with the time and a
 * summary, the steps and thoughts underneath while open. Open while it runs.
 */
export function ChatWorkLog(props: {
  /** „Working for 0:08" while it runs, „Worked for 0:42" after. */
  label: string;
  /** What it did, quiet after the time („3 functions · 2 created"). */
  summary?: string | undefined;
  running?: boolean | undefined;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`ui-chat-worklog${props.open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="ui-chat-worklog-head"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {props.running && <ChatDotsInner />}
        <span>{props.label}</span>
        {props.summary && <span className="ui-chat-worklog-summary">{props.summary}</span>}
        <ChevronRight size={14} className={`ui-twisty${props.open ? ' is-open' : ''}`} />
      </button>
      {props.open && <div className="ui-chat-worklog-body">{props.children}</div>}
    </div>
  );
}

/** What the agent thought on the way: one quiet line, the whole text on a click. */
export function ChatThought(props: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={`ui-chat-thought${open ? ' is-open' : ''}`}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span className="ui-chat-step-icon">
        <Brain aria-hidden />
      </span>
      <span className="ui-chat-thought-text">{props.text}</span>
    </button>
  );
}

/**
 * A table the agent wrote (t3code's Markdown tables): a strong head, a line between rows, numbers
 * right-aligned in mono, Copy at its foot (tab-separated, so it pastes into a spreadsheet).
 */
export function ChatTable(props: {
  label: string;
  head: readonly string[];
  rows: readonly (readonly string[])[];
  /** Columns of numbers. */
  numeric?: readonly number[] | undefined;
}): JSX.Element {
  const num = new Set(props.numeric ?? []);
  const text = [props.head, ...props.rows].map((row) => row.join('\t')).join('\n');
  return (
    <div className="ui-chat-table">
      <table aria-label={props.label}>
        <thead>
          <tr>
            {props.head.map((cell, c) => (
              <th key={c} className={num.has(c) ? 'is-num' : undefined}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={num.has(c) ? 'is-num' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ui-chat-table-foot">
        <CopyButton value={text} label="Table" />
      </div>
    </div>
  );
}

/** Under a turn's answer (t3code): Copy, how long it worked, with which model. */
export function ChatMessageMeta(props: {
  text: string;
  worked: string;
  model: string;
}): JSX.Element {
  return (
    <div className="ui-chat-meta-line">
      <CopyButton value={props.text} label="Answer" />
      <span className="ui-chat-meta-item">{props.worked}</span>
      <span className="ui-chat-meta-item">{props.model}</span>
    </div>
  );
}

/**
 * What a turn changed in the project (t3code's changed files, for elements): a head with the
 * count, a row per element (a click selects it), Select all and Undo; undone, the rows are struck
 * and the actions gone.
 */
export function ChatChanges(props: {
  label: string;
  items: readonly {
    readonly key: string;
    readonly icon: ReactNode;
    readonly name: string;
    readonly change: 'created' | 'changed' | 'deleted';
    readonly onSelect?: (() => void) | undefined;
  }[];
  undone?: boolean | undefined;
  onSelectAll?: (() => void) | undefined;
  onUndo?: (() => void) | undefined;
}): JSX.Element {
  return (
    <div className={`ui-chat-changes${props.undone ? ' is-undone' : ''}`}>
      <div className="ui-chat-changes-head">
        <span>{props.undone ? `${props.label} · undone` : props.label}</span>
        {!props.undone && (
          <span className="ui-chat-actions">
            {props.onSelectAll && <ChatAction onClick={props.onSelectAll}>Select all</ChatAction>}
            {props.onUndo && <ChatAction onClick={props.onUndo}>Undo</ChatAction>}
          </span>
        )}
      </div>
      {props.items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="ui-chat-change-row"
          disabled={!item.onSelect || props.undone}
          onClick={item.onSelect}
        >
          <span className="ui-chat-step-icon">{item.icon}</span>
          <span className="ui-chat-change-name">{item.name}</span>
          <span className="ui-chat-change-kind">{item.change}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A message typed while the agent works (t3code's queue): dashed, at the log's end; Send now
 * gives it to the running turn, Edit takes it back into the composer, Remove drops it.
 */
export function ChatQueued(props: {
  text: string;
  onSendNow: () => void;
  onEdit: () => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div className="ui-chat-msg is-user is-queued">
      <div className="ui-chat-queued">
        <div className="ui-chat-text">
          <p>{props.text}</p>
        </div>
        <div className="ui-chat-queued-foot">
          <span className="ui-chat-queued-tag">Queued</span>
          <button
            type="button"
            className="ui-chat-queued-tool"
            aria-label="Send now"
            data-tip="Send now"
            onClick={props.onSendNow}
          >
            <ArrowUp size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="ui-chat-queued-tool"
            aria-label="Edit"
            data-tip="Edit"
            onClick={props.onEdit}
          >
            <Pencil size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="ui-chat-queued-tool"
            aria-label="Remove"
            data-tip="Remove"
            onClick={props.onRemove}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A picture the agent made (a render of a view with its own camera), with its caption. */
export function ChatImage(props: { src: string; caption: string }): JSX.Element {
  return (
    <figure className="ui-chat-image">
      <img src={props.src} alt={props.caption} />
      <figcaption>{props.caption}</figcaption>
    </figure>
  );
}
