import { useEffect, useState } from 'react';
import { CalibrationPanel } from './components/CalibrationPanel';
import { HelpDialog } from './components/HelpDialog';
import { RunPanel } from './components/RunPanel';
import { Stage } from './components/Stage';
import { StageLayersPanel } from './components/StageLayersPanel';
import { TimingsPanel } from './components/TimingsPanel';
import { Toast } from './components/Toast';
import { DEFAULT_TIMINGS_ERROR } from './data/defaults';
import { useHelper } from './hooks/useHelper';

type Theme = 'light' | 'dark';

const THEME_KEY = 'dod3-theme';
const EFFECTS_KEY = 'dod3-effects';

/** The head script resolves the saved or system theme before first paint. */
function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** The head script also applies the saved effects choice before first paint. */
function readEffects(): boolean {
  return document.documentElement.dataset.effects !== 'off';
}

export default function App() {
  const helper = useHelper();
  const { actions, frame } = helper;
  const canRun = frame.total > 0;
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [effects, setEffects] = useState(readEffects);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f5eff2' : '#120d15');
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.effects = effects ? 'on' : 'off';
  }, [effects]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable; the choice still applies for this visit.
    }
  };

  const toggleEffects = () => {
    const next = !effects;
    setEffects(next);
    try {
      localStorage.setItem(EFFECTS_KEY, next ? 'on' : 'off');
    } catch {
      // Storage can be unavailable; the choice still applies for this visit.
    }
  };

  // Pointer clicks should not leave a control focused, otherwise a subsequent
  // Space press would activate that control instead of start/pause. The score
  // map is included so a scrub does not swallow the next Space.
  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const label = target.closest('label');
        if (label instanceof HTMLLabelElement) {
          label.control?.blur();
        } else {
          target.closest<HTMLElement>('button, input[type="range"]')?.blur();
        }
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
          <div className="brand-copy">
            <h1>DOD3 Helper</h1>
            <p>A visual guide for the final boss of Drakengard 3.</p>
          </div>
        </div>

        <div className="masthead-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleEffects}
            aria-pressed={effects}
            aria-label={`Visual effects ${effects ? 'on' : 'off'}`}
            title={
              effects
                ? 'Turn visual effects off for better performance'
                : 'Turn visual effects on'
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0Z" />
              {effects ? null : <path d="M3 21 21 3" />}
            </svg>
          </button>

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
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="layout">
        <Stage
          canvasRef={helper.canvasRef}
          status={helper.status}
          total={frame.total}
          elapsed={frame.elapsed}
          duration={frame.duration}
          cue={frame.cue}
          dark={theme === 'dark'}
          dataError={helper.dataError}
          onStart={actions.toggleRun}
          onResetRun={actions.resetRun}
          onSeek={actions.seek}
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
            helpOpen={helper.helpOpen}
            onNudgeLast={actions.nudgeLast}
            onNudgeNext={actions.nudgeNext}
            onShiftAll={actions.shiftAll}
            onNudgeClock={actions.nudgeClock}
            onSetHold={actions.setHold}
            onRemoveNext={actions.removeNext}
            onOpenHelp={actions.openHelp}
          />

          <TimingsPanel
            count={frame.total}
            duration={frame.duration}
            custom={helper.custom}
            confirmReset={helper.confirmReset}
            canReset={DEFAULT_TIMINGS_ERROR === null}
            dataError={helper.dataError}
            onImport={actions.importFile}
            onExport={actions.exportFile}
            onReset={actions.resetTimings}
          />

          <StageLayersPanel layers={helper.layers} onSetLayer={actions.setLayer} />
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
        <p className="footer-note">Timings are saved in this browser — export for a copy.</p>
      </footer>

      {helper.toast ? <Toast toast={helper.toast} onDismiss={actions.dismissToast} /> : null}

      <HelpDialog open={helper.helpOpen} onClose={actions.closeHelp} />

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={helper.announcement.id}>{helper.announcement.text}</span>
      </div>
    </div>
  );
}
