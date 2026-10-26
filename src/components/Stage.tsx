import type { CSSProperties, RefObject } from 'react';
import { lighten, sectionColorAt } from '../lib/beat';
import type { RunStatus } from '../lib/run';
import { MovementRibbon } from './MovementRibbon';

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: RunStatus;
  total: number;
  elapsed: number;
  duration: number;
  cue: boolean;
  dark: boolean;
  dataError: string | null;
  onStart: () => void;
  onResetRun: () => void;
  onSeek: (positionMs: number) => void;
}

export function Stage({
  canvasRef,
  status,
  total,
  elapsed,
  duration,
  cue,
  dark,
  dataError,
  onStart,
  onResetRun,
  onSeek,
}: StageProps) {
  const missingTimings = dataError !== null && total === 0;
  const showOverlay =
    status === 'idle' || status === 'finished' || total === 0 || missingTimings;

  // The frame glows in the colour of the ring closing on the target, lifted the
  // same way the canvas lifts the ring itself.
  const cueColor = lighten(sectionColorAt(elapsed), dark ? 0.35 : 0).join(' ');

  return (
    <section className="stage-frame" aria-label="Timing stage">
      <div
        className={`stage${cue ? ' is-cue' : ''}`}
        style={{ '--cue': cueColor } as CSSProperties}
      >
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

      <MovementRibbon
        elapsed={elapsed}
        duration={duration}
        total={total}
        onSeek={onSeek}
      />
    </section>
  );
}
