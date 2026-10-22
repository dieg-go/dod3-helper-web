import type { ToastState } from '../hooks/useHelper';

interface ToastProps {
  toast: ToastState;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      className={`toast toast-${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="toast-message">{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          className="toast-action"
          type="button"
          onClick={() => {
            toast.onAction?.();
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button className="toast-dismiss" type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
