import type { FormEvent, ReactNode, Ref } from 'react';
import { Surface } from './Surface.js';
import './console.css';

/**
 * The console: a floating surface (the app places it between the side panels, like PhotoLab), a
 * head with its name and icon buttons, the log with a column of scroll buttons beside it, and the
 * command line. `resize` takes a `PanelResizeEdge side="top"`; the surface fills the app's box.
 */
export function ConsolePanel(props: {
  title: string;
  icon: ReactNode;
  /** The head's buttons (`IconButton size="small"`). */
  actions: ReactNode;
  /** The column beside the log (`IconButton size="small"`: to the top, to the end). */
  scroll?: ReactNode | undefined;
  scrollLabel?: string | undefined;
  resize?: ReactNode | undefined;
  logRef?: Ref<HTMLDivElement> | undefined;
  /** The lines (`ConsoleLine`) and anything above them. */
  children: ReactNode;
  input: {
    readonly label: string;
    readonly placeholder?: string | undefined;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onSubmit: () => void;
  };
}): JSX.Element {
  return (
    <Surface kind="small" className="ui-console">
      {props.resize}
      <header className="ui-console-head">
        {props.icon}
        <span>{props.title}</span>
        {props.actions}
      </header>
      <div className="ui-console-body">
        <div className="ui-console-log" ref={props.logRef} role="log">
          {props.children}
        </div>
        {props.scroll && (
          <div className="ui-console-scroll" aria-label={props.scrollLabel}>
            {props.scroll}
          </div>
        )}
      </div>
      <form
        className="ui-console-input"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          props.input.onSubmit();
        }}
      >
        <span aria-hidden="true">›</span>
        <input
          aria-label={props.input.label}
          placeholder={props.input.placeholder}
          value={props.input.value}
          onChange={(event) => props.input.onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </Surface>
  );
}

/** One line of the console's log; `command`: what was typed (brighter). */
export function ConsoleLine(props: {
  command?: boolean | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={props.command ? 'ui-console-line is-command' : 'ui-console-line'}>
      {props.children}
    </div>
  );
}
