import { useEffect, useRef } from 'react';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface KeyRow {
  label: string;
  keys: string;
}

function KeyRows({ rows }: { rows: KeyRow[] }) {
  return (
    <dl className="key-list">
      {rows.map((row) => (
        <div className="key-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <kbd>{row.keys}</kbd>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      id="controls-dialog"
      className="help-dialog"
      aria-labelledby="help-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="help-inner">
        <header className="help-header">
          <h2 id="help-title">Controls</h2>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="help-intro">
          Start your run the moment you hit the first note in-game.
        </p>
        

        <div className="help-groups">
          <section className="help-group" aria-labelledby="help-run">
            <h3 id="help-run">Run</h3>
            <KeyRows
              rows={[
                { label: 'Start, pause, resume', keys: 'Space' },
                { label: 'Return to ready', keys: 'R' },
              ]}
            />
          </section>

          <section className="help-group" aria-labelledby="help-notes">
            <h3 id="help-notes">Note timing</h3>
            <KeyRows
              rows={[
                { label: 'Last note +50 / −50 ms', keys: '← / →' },
                { label: 'Next note +50 / −50 ms', keys: 'Ctrl + ← / →' },
                { label: 'All notes +50 / −50 ms', keys: 'Shift + ← / →' },
              ]}
            />
          </section>

          <section className="help-group" aria-labelledby="help-clock">
            <h3 id="help-clock">Playback clock</h3>
            <KeyRows
              rows={[
                { label: 'Rewind / advance 50 ms', keys: 'Ctrl + ↑ / ↓' },
                { label: 'Slow down while held', keys: '↑' },
                { label: 'Speed up while held', keys: '↓' },
              ]}
            />
          </section>

          <section className="help-group" aria-labelledby="help-edit">
            <h3 id="help-edit">Sequence</h3>
            <KeyRows
              rows={[
                { label: 'Remove the next note', keys: 'Y' },
                { label: 'Undo the last removal', keys: 'Ctrl + Z' },
              ]}
            />
          </section>
        </div>

        <p className="help-note">
          Timing edits are saved in this browser, so they are still here next time. Export whenever
          you want a copy to keep. The file format is one millisecond value per line.
        </p>
      </div>
    </dialog>
  );
}
