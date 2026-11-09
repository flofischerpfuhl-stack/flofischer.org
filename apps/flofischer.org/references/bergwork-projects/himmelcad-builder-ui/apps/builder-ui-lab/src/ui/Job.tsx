import './job.css';

/**
 * A long-running job in its own Properties tab (owner: visible activity, cancellable): the file,
 * the stage and percent, the progress line in blue (running work) and Cancel.
 */
export function JobProgress(props: {
  file: string;
  /** What it is doing now (Reading points …). */
  stage: string;
  /** 0 … 1. */
  progress: number;
  onCancel: () => void;
}): JSX.Element {
  const percent = Math.round(props.progress * 100);
  return (
    <div className="ui-job">
      <div className="ui-job-file">{props.file}</div>
      <div className="ui-job-stage">
        <span>{props.stage}</span>
        <span>{percent} %</span>
      </div>
      <div
        className="ui-job-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="ui-job-fill" style={{ width: `${percent}%` }} />
      </div>
      <button type="button" className="ui-job-cancel" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}
