import type { RefObject } from 'react';
import type { RunStatus } from '../lib/run';
import { MovementRibbon } from './MovementRibbon';

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: RunStatus;
  total: number;
  elapsed: number;
  duration: number;
  cue: boolean;
  dataError: string | null;
  onStart: () => void;
  onResetRun: () => void;
}

export function Stage({
  canvasRef,
  status,
  total,
  elapsed,
  duration,
  cue,
  dataError,
  onStart,
  onResetRun,
}: StageProps) {
  const missingTimings = dataError !== null && total === 0;
  const showOverlay =
    status === 'idle' || status === 'finished' || total === 0 || missingTimings;

  return (
    <section className="stage-frame" aria-label="Timing stage">
      <div className={`stage${cue ? ' is-cue' : ''}`}>
        <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />

        {status === 'paused' ? <div className="stage-paused">Paused</div> : null}

        {showOverlay ? (
          <div className="stage-overlay">
            <div className="stage-card">
              {missingTimings ? (
                <>
                  <h2>Timings unavailable.</h2>
                  <p>{dataError}</p>
                  <p className="stage-card-hint">Import a timing file below to continue.</p>
                </>
              ) : total === 0 ? (
                <>
                  <h2>No notes in this sequence.</h2>
                  <p>Import a timing file, or reset to the built-in sequence.</p>
                </>
              ) : status === 'finished' ? (
                <>
                  <h2>Sequence complete.</h2>
                  <p>Return to the start to run it again.</p>
                  <button className="btn btn-primary" type="button" onClick={onResetRun}>
                    Back to start
                  </button>
                </>
              ) : (
                <>
                  <h2>Start the run at the same moment you hit the first note in-game.</h2>
                  {/* <p>Use Space or Start. The first note is your zero.</p> */}
                  <button className="btn btn-primary" type="button" onClick={onStart}>
                    Start <kbd aria-hidden="true">Space</kbd>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <MovementRibbon elapsed={elapsed} duration={duration} total={total} />
    </section>
  );
}
