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

/** A note inside this many milliseconds is called out as imminent. */
const SOON_MS = 600;

export function RunPanel({ status, frame, canRun, onToggle, onResetRun }: RunPanelProps) {
  const nextLabel =
    status === 'running' || status === 'paused' ? formatNextIn(frame.nextDueMs) : '—';
  const soon =
    !frame.cue && frame.nextDueMs !== null && frame.nextDueMs > 0 && frame.nextDueMs <= SOON_MS;
  const clock = formatClock(frame.elapsed);
  const dot = clock.lastIndexOf('.');

  return (
    <section className="panel panel-run" aria-labelledby="run-heading">
      <div className="panel-heading">
        <h2 id="run-heading">Run</h2>
      </div>

      <div className="readout">
        <p className="timer" aria-label={`Elapsed ${clock}`}>
          {dot > 0 ? (
            <>
              <span className="timer-main">{clock.slice(0, dot)}</span>
              <span className="timer-frac">{clock.slice(dot)}</span>
            </>
          ) : (
            clock
          )}
        </p>

        <div className="readout-facts">
          <p className="readout-fact">
            <span className="meta-label">Note</span>
            <strong>{formatNotePosition(frame.skip, frame.total)}</strong>
          </p>
          <p
            className={`readout-fact next-meta${frame.cue ? ' is-cue' : ''}${soon ? ' is-soon' : ''}`}
          >
            <span className="meta-label">Next</span>
            <strong>{nextLabel}</strong>
          </p>
        </div>
      </div>

      {/* <progress
        className="run-progress"
        max={Math.max(frame.duration, 1)}
        value={Math.min(frame.elapsed, frame.duration)}
        aria-label="Time through the sequence"
        aria-valuetext={`${formatClock(frame.elapsed)} of ${formatClock(frame.duration)}`}
      /> */}

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
