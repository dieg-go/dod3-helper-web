import type { Holds } from '../hooks/useHelper';
import type { RunStatus } from '../lib/run';

interface CalibrationPanelProps {
  status: RunStatus;
  skip: number;
  total: number;
  holds: Holds;
  onNudgeLast: (delta: number) => void;
  onNudgeNext: (delta: number) => void;
  onShiftAll: (delta: number) => void;
  onNudgeClock: (delta: number) => void;
  onSetHold: (direction: 'slow' | 'fast', active: boolean) => void;
  onRemoveNext: () => void;
}

interface StepButtonProps {
  delta: -50 | 50;
  shortcut: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
}

function StepButton({ delta, shortcut, ariaLabel, disabled, onClick }: StepButtonProps) {
  return (
    <button
      className="btn btn-step"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {delta > 0 ? '+50' : '−50'} <kbd aria-hidden="true">{shortcut}</kbd>
    </button>
  );
}

interface HoldButtonProps {
  label: string;
  shortcut: string;
  ariaLabel: string;
  active: boolean;
  disabled: boolean;
  onHold: (active: boolean) => void;
}

function HoldButton({ label, shortcut, ariaLabel, active, disabled, onHold }: HoldButtonProps) {
  return (
    <button
      className={`btn btn-hold${active ? ' is-active' : ''}`}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          onHold(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          onHold(false);
        }
      }}
      onBlur={() => onHold(false)}
    >
      {label} <kbd aria-hidden="true">{shortcut}</kbd>
    </button>
  );
}

export function CalibrationPanel({
  status,
  skip,
  total,
  holds,
  onNudgeLast,
  onNudgeNext,
  onShiftAll,
  onNudgeClock,
  onSetHold,
  onRemoveNext,
}: CalibrationPanelProps) {
  const canAdjustLast = skip > 0;
  const canAdjustNext = skip < total;
  const canScrubClock = status === 'running' || status === 'paused';
  const canHold = status === 'running';

  return (
    <details className="panel panel-calibration">
      <summary className="panel-heading">
        <h2 id="calibration-heading">
          Calibration
          <span className="panel-chevron" aria-hidden="true" />
        </h2>
        <span className="panel-aside">Applies live</span>
      </summary>

      <div className="cal-row">
        <div className="cal-label">
          <span>Last note</span>
          <span className="cal-note">the most recent pass</span>
        </div>
        <StepButton
          delta={-50}
          shortcut="→"
          ariaLabel="Advance the last note by 50 milliseconds"
          disabled={!canAdjustLast}
          onClick={() => onNudgeLast(-50)}
        />
        <StepButton
          delta={50}
          shortcut="←"
          ariaLabel="Delay the last note by 50 milliseconds"
          disabled={!canAdjustLast}
          onClick={() => onNudgeLast(50)}
        />
      </div>

      <div className="cal-row">
        <div className="cal-label">
          <span>Next note</span>
          <span className="cal-note">the first approaching note</span>
        </div>
        <StepButton
          delta={-50}
          shortcut="Ctrl →"
          ariaLabel="Advance the next note by 50 milliseconds"
          disabled={!canAdjustNext}
          onClick={() => onNudgeNext(-50)}
        />
        <StepButton
          delta={50}
          shortcut="Ctrl ←"
          ariaLabel="Delay the next note by 50 milliseconds"
          disabled={!canAdjustNext}
          onClick={() => onNudgeNext(50)}
        />
      </div>

      <div className="cal-row">
        <div className="cal-label">
          <span>All notes</span>
          <span className="cal-note">shift the whole sequence</span>
        </div>
        <StepButton
          delta={-50}
          shortcut="Shift →"
          ariaLabel="Advance all notes by 50 milliseconds"
          disabled={total === 0}
          onClick={() => onShiftAll(-50)}
        />
        <StepButton
          delta={50}
          shortcut="Shift ←"
          ariaLabel="Delay all notes by 50 milliseconds"
          disabled={total === 0}
          onClick={() => onShiftAll(50)}
        />
      </div>

      <div className="cal-row">
        <div className="cal-label">
          <span>Clock</span>
          <span className="cal-note">nudge playback time</span>
        </div>
        <StepButton
          delta={-50}
          shortcut="Ctrl ↑"
          ariaLabel="Rewind the clock by 50 milliseconds"
          disabled={!canScrubClock}
          onClick={() => onNudgeClock(-50)}
        />
        <StepButton
          delta={50}
          shortcut="Ctrl ↓"
          ariaLabel="Advance the clock by 50 milliseconds"
          disabled={!canScrubClock}
          onClick={() => onNudgeClock(50)}
        />
      </div>

      <div className="cal-hold-row">
        <HoldButton
          label="Hold to slow"
          shortcut="↑"
          ariaLabel="Slow the clock while held"
          active={holds.slow}
          disabled={!canHold}
          onHold={(active) => onSetHold('slow', active)}
        />
        <HoldButton
          label="Hold to speed"
          shortcut="↓"
          ariaLabel="Speed up the clock while held"
          active={holds.fast}
          disabled={!canHold}
          onHold={(active) => onSetHold('fast', active)}
        />
      </div>

      <div className="cal-remove-row">
        <button
          className="btn btn-quiet btn-remove"
          type="button"
          onClick={onRemoveNext}
          disabled={!canAdjustNext}
        >
          Remove next note <kbd aria-hidden="true">Y</kbd>
        </button>
      </div>
    </details>
  );
}
