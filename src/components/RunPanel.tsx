import type { HelperFrame } from '../hooks/useHelper';
import type { RunStatus } from '../lib/run';
import { formatClock, formatNextIn, formatNotePosition } from '../lib/timing';

interface RunPanelProps {
  status: RunStatus;
  frame: HelperFrame;
  canRun: boolean;
  onToggle: () => void;
  onResetRun: () => void;
}

const PRIMARY_LABELS: Record<RunStatus, string> = {
  idle: 'Start',
  running: 'Pause',
  paused: 'Resume',
  finished: 'Back to start',
};

export function RunPanel({ status, frame, canRun, onToggle, onResetRun }: RunPanelProps) {
  const nextLabel =
    status === 'running' || status === 'paused' ? formatNextIn(frame.nextDueMs) : '—';
  const progressMax = Math.max(frame.duration, 1);
  const progressValue = Math.min(frame.elapsed, frame.duration);

  return (
    <section className="panel panel-run" aria-labelledby="run-heading">
      <div className="panel-heading">
        <h2 id="run-heading">Run</h2>
        {/* <span className={`mini-status mini-status-${status}`}>
          <span className="dot" aria-hidden="true" />
          {status === 'running' ? 'Clock running' : status === 'paused' ? 'Clock paused' : 'Clock stopped'}
        </span> */}
      </div>

      <p className="timer-label">Elapsed</p>
      <p className="timer" aria-label={`Elapsed ${formatClock(frame.elapsed)}`}>
        {formatClock(frame.elapsed)}
      </p>

      <div className="run-meta">
        <div>
          <span className="meta-label">Note</span>
          <strong>{formatNotePosition(frame.skip, frame.total)}</strong>
        </div>
        <div className={`next-meta${frame.cue ? ' is-cue' : ''}`}>
          <span className="meta-label">Next note</span>
          <strong>{nextLabel}</strong>
        </div>
      </div>

      <progress
        className="run-progress"
        max={progressMax}
        value={progressValue}
        aria-label="Time through the sequence"
        aria-valuetext={`${formatClock(frame.elapsed)} of ${formatClock(frame.duration)}`}
      />

      <div className="transport">
        <button
          className="btn btn-primary"
          type="button"
          onClick={onToggle}
          disabled={!canRun}
        >
          {PRIMARY_LABELS[status]} <kbd aria-hidden="true">Space</kbd>
        </button>
        <button className="btn btn-secondary" type="button" onClick={onResetRun}>
          Reset run <kbd aria-hidden="true">R</kbd>
        </button>
      </div>
    </section>
  );
}
