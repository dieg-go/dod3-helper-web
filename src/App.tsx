import { useEffect } from 'react';
import { CalibrationPanel } from './components/CalibrationPanel';
import { HelpDialog } from './components/HelpDialog';
import { RunPanel } from './components/RunPanel';
import { Stage } from './components/Stage';
import { TimingsPanel } from './components/TimingsPanel';
import { Toast } from './components/Toast';
import { DEFAULT_TIMINGS_ERROR } from './data/defaults';
import { useHelper } from './hooks/useHelper';
import { FLOWER_URL } from './lib/assets';

export default function App() {
  const helper = useHelper();
  const { actions, frame } = helper;
  const canRun = frame.total > 0;

  // Pointer clicks should not leave a calibration button focused, otherwise a
  // subsequent Space press would activate that button instead of start/pause.
  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        target.closest('button')?.blur();
      }
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#controls">
        Skip to controls
      </a>

      <header className="masthead">
        <div className="brand">
          <span className="brand-flower" aria-hidden="true">
            <img src={FLOWER_URL} alt="" />
          </span>
          <div className="brand-copy">
            <h1>Destroy the Flower</h1>
            <p>A timing helper for the final boss of Drakengard 3.</p>
          </div>
        </div>

        <div className="masthead-actions">
          <button
            className="btn btn-quiet help-button"
            type="button"
            onClick={actions.openHelp}
            aria-haspopup="dialog"
            aria-expanded={helper.helpOpen}
            aria-controls="controls-dialog"
          >
            Controls <kbd aria-hidden="true">?</kbd>
          </button>
        </div>
      </header>

      <main className="layout">
        <Stage
          canvasRef={helper.canvasRef}
          status={helper.status}
          total={frame.total}
          dataError={helper.dataError}
          onStart={actions.toggleRun}
          onResetRun={actions.resetRun}
        />

        <aside className="rail" id="controls" aria-label="Run controls and tuning" tabIndex={-1}>
          <RunPanel
            status={helper.status}
            frame={frame}
            canRun={canRun}
            onToggle={actions.toggleRun}
            onResetRun={actions.resetRun}
          />

          <CalibrationPanel
            status={helper.status}
            skip={frame.skip}
            total={frame.total}
            holds={helper.holds}
            onNudgeLast={actions.nudgeLast}
            onNudgeNext={actions.nudgeNext}
            onShiftAll={actions.shiftAll}
            onNudgeClock={actions.nudgeClock}
            onSetHold={actions.setHold}
            onRemoveNext={actions.removeNext}
          />

          <TimingsPanel
            count={frame.total}
            duration={frame.duration}
            dirty={helper.dirty}
            confirmReset={helper.confirmReset}
            canReset={DEFAULT_TIMINGS_ERROR === null}
            dataError={helper.dataError}
            onImport={actions.importFile}
            onExport={actions.exportFile}
            onReset={actions.resetTimings}
          />
        </aside>
      </main>

      <footer className="footer">
        <p>
          Unofficial fan tool. Based on{' '}
          <a href="https://github.com/UnknownAr/Drakengard3-helper" target="_blank" rel="noreferrer">
            Drakengard3-helper
          </a>{' '}
          by UnknownAr, Apache 2.0. Drakengard 3 is a trademark of Square Enix.
        </p>
        <p className="footer-note">Session only — export your timings before closing.</p>
      </footer>

      {helper.toast ? <Toast toast={helper.toast} onDismiss={actions.dismissToast} /> : null}

      <HelpDialog open={helper.helpOpen} onClose={actions.closeHelp} />

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={helper.announcement.id}>{helper.announcement.text}</span>
      </div>
    </div>
  );
}
