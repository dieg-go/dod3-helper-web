import { useRef, type ChangeEvent } from 'react';
import { formatClock } from '../lib/timing';

interface TimingsPanelProps {
  count: number;
  duration: number;
  dirty: boolean;
  confirmReset: boolean;
  canReset: boolean;
  dataError: string | null;
  onImport: (file: File) => void | Promise<void>;
  onExport: () => void;
  onReset: () => void;
}

export function TimingsPanel({
  count,
  duration,
  dirty,
  confirmReset,
  canReset,
  dataError,
  onImport,
  onExport,
  onReset,
}: TimingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) {
      void onImport(file);
    }
    event.currentTarget.value = '';
    // Do not leave the hidden file input as the shortcut target.
    event.currentTarget.blur();
  };

  return (
    <details className="panel panel-timings">
      <summary className="panel-heading">
        <h2 id="timings-heading">
          Timings
          <span className="panel-chevron" aria-hidden="true" />
        </h2>
        {dirty ? (
          <span className="dirty-pill">
            <span className="dot" aria-hidden="true" />
            Unsaved changes
          </span>
        ) : (
          <span className="panel-aside">Session only</span>
        )}
      </summary>

      <p className="timings-summary">
        {count > 0 ? (
          <>
            <strong>{count}</strong> notes <span aria-hidden="true">·</span>{' '}
            <span>{formatClock(duration)}</span>
          </>
        ) : (
          'No notes'
        )}
      </p>

      {dataError ? (
        <p className="data-error" role="alert">
          {dataError}
        </p>
      ) : null}

      <div className="file-actions">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onExport}
          disabled={count === 0}
        >
          Export
        </button>
        <button
          className={confirmReset ? 'btn btn-danger' : 'btn btn-secondary'}
          type="button"
          onClick={onReset}
          disabled={!canReset}
        >
          {confirmReset ? 'Confirm reset' : 'Reset'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".txt,text/plain"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      <p className="panel-note">
        One millisecond value per line; commas and comments are accepted. Changes last only for
        this session, so export before closing the tab.
      </p>
    </details>
  );
}
