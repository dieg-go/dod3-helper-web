import { useEffect, useState } from 'react';
import { CalibrationPanel } from './components/CalibrationPanel';
import { HelpDialog } from './components/HelpDialog';
import { RunPanel } from './components/RunPanel';
import { Stage } from './components/Stage';
import { TimingsPanel } from './components/TimingsPanel';
import { Toast } from './components/Toast';
import { DEFAULT_TIMINGS_ERROR } from './data/defaults';
import { useHelper } from './hooks/useHelper';
import { FLOWER_URL } from './lib/assets';

type Theme = 'light' | 'dark';

const THEME_KEY = 'dod3-theme';

/** The head script resolves the saved or system theme before first paint. */
function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export default function App() {
  const helper = useHelper();
  const { actions, frame } = helper;
  const canRun = frame.total > 0;
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f5eff2' : '#120d15');
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable; the choice still applies for this visit.
    }
  };

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
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.35 5.35l1.5 1.5M17.15 17.15l1.5 1.5M18.65 5.35l-1.5 1.5M6.85 17.15l-1.5 1.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
              </svg>
            )}
          </button>

          {/* <button
            className="btn btn-quiet help-button"
            type="button"
            onClick={actions.openHelp}
            aria-haspopup="dialog"
            aria-expanded={helper.helpOpen}
            aria-controls="controls-dialog"
          >
            Controls <kbd aria-hidden="true">?</kbd>
          </button> */}
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
