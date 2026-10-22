import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { DEFAULT_TIMINGS, DEFAULT_TIMINGS_ERROR } from '../data/defaults';
import { Clock } from '../lib/clock';
import { drawStage } from '../lib/render';
import type { RunStatus } from '../lib/run';
import { resolveShortcut, type ShortcutAction } from '../lib/shortcuts';
import {
  formatClock,
  nudgeAt,
  parseTimings,
  passedCount,
  removeAt,
  serializeTimings,
  shiftAll,
  visibleNotes,
  type VisibleNote,
} from '../lib/timing';

export interface HelperFrame {
  elapsed: number;
  skip: number;
  notes: VisibleNote[];
  cue: boolean;
  nextDueMs: number | null;
  progress: number;
  duration: number;
  total: number;
}

export interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
}

export interface Announcement {
  id: number;
  text: string;
}

export interface Holds {
  slow: boolean;
  fast: boolean;
}

export interface HelperActions {
  toggleRun: () => void;
  resetRun: () => void;
  nudgeLast: (delta: number) => void;
  nudgeNext: (delta: number) => void;
  shiftAll: (delta: number) => void;
  nudgeClock: (delta: number) => void;
  removeNext: () => void;
  setHold: (direction: 'slow' | 'fast', active: boolean) => void;
  importFile: (file: File) => Promise<void>;
  exportFile: () => void;
  resetTimings: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  dismissToast: () => void;
}

export interface UseHelperResult {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  timings: number[];
  status: RunStatus;
  frame: HelperFrame;
  dirty: boolean;
  dataError: string | null;
  helpOpen: boolean;
  confirmReset: boolean;
  toast: ToastState | null;
  holds: Holds;
  announcement: Announcement;
  actions: HelperActions;
}

interface ToastOptions {
  tone?: ToastState['tone'];
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface UndoSnapshot {
  timings: number[];
  label: string;
}

const IDLE_HOLDS: Holds = { slow: false, fast: false };
const DISCRETE_ACTIONS = new Set<ShortcutAction['type']>([
  'toggle-run',
  'reset-run',
  'remove-next',
  'undo-remove',
  'help',
]);

function emptyFrame(timings: readonly number[]): HelperFrame {
  return {
    elapsed: 0,
    skip: 0,
    notes: [],
    cue: false,
    nextDueMs: null,
    progress: 0,
    duration: timings.length > 0 ? timings[timings.length - 1]! : 0,
    total: timings.length,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.tagName === 'INPUT') {
    return (target as HTMLInputElement).type !== 'file';
  }
  return (
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

export function useHelper(): UseHelperResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clockRef = useRef(new Clock());
  const timingsRef = useRef<number[]>(DEFAULT_TIMINGS.slice());
  const statusRef = useRef<RunStatus>('idle');
  const skipRef = useRef(0);
  const holdsRef = useRef<Holds>(IDLE_HOLDS);
  const helpOpenRef = useRef(false);
  const undoRef = useRef<UndoSnapshot | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const lastHudAtRef = useRef(0);
  const lastHudFrameRef = useRef<HelperFrame>(emptyFrame(timingsRef.current));
  const performActionRef = useRef<(action: ShortcutAction) => void>(() => {});
  const finishRunRef = useRef<(now: number) => void>(() => {});

  const [timings, setTimings] = useState<number[]>(() => DEFAULT_TIMINGS.slice());
  const [status, setStatus] = useState<RunStatus>('idle');
  const [frame, setFrame] = useState<HelperFrame>(() => emptyFrame(DEFAULT_TIMINGS));
  const [dirty, setDirty] = useState(false);
  const [dataError, setDataError] = useState<string | null>(DEFAULT_TIMINGS_ERROR);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [holds, setHolds] = useState<Holds>(IDLE_HOLDS);
  const [announcement, setAnnouncement] = useState<Announcement>({ id: 0, text: '' });

  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ id: previous.id + 1, text }));
  }, []);

  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    const nextToast: ToastState = {
      id: Date.now() + Math.random(),
      message,
      tone: options.tone ?? 'info',
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    };

    if (!options.onAction) {
      undoRef.current = null;
    }

    setToast(nextToast);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
      undoRef.current = null;
    }, options.duration ?? 6000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    undoRef.current = null;
    setToast(null);
  }, []);

  const invalidateUndo = useCallback(() => {
    undoRef.current = null;
    setToast((previous) => (previous?.onAction ? null : previous));
  }, []);

  const commitStatus = useCallback((next: RunStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const publishFrame = useCallback((now: number, force = false): HelperFrame => {
    const currentStatus = statusRef.current;
    const currentTimings = timingsRef.current;
    const elapsed = currentStatus === 'idle' ? 0 : clockRef.current.elapsed(now);
    const skip = currentStatus === 'idle' ? 0 : passedCount(currentTimings, elapsed);
    const notes = currentStatus === 'idle' ? [] : visibleNotes(currentTimings, elapsed, skip);
    const cue = notes.some((note) => note.press);
    const nextDueMs =
      currentStatus === 'running' || currentStatus === 'paused'
        ? skip < currentTimings.length
          ? currentTimings[skip]! - elapsed
          : null
        : null;
    const duration =
      currentTimings.length > 0 ? currentTimings[currentTimings.length - 1]! : 0;
    const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
    const nextFrame: HelperFrame = {
      elapsed,
      skip,
      notes,
      cue,
      nextDueMs,
      progress,
      duration,
      total: currentTimings.length,
    };

    skipRef.current = skip;
    const previous = lastHudFrameRef.current;
    const changed =
      previous.skip !== nextFrame.skip ||
      previous.cue !== nextFrame.cue ||
      previous.total !== nextFrame.total ||
      previous.duration !== nextFrame.duration;

    if (
      force ||
      changed ||
      (currentStatus === 'running' && now - lastHudAtRef.current >= 66)
    ) {
      lastHudAtRef.current = now;
      lastHudFrameRef.current = nextFrame;
      setFrame(nextFrame);
    }

    return nextFrame;
  }, []);

  const clearHolds = useCallback(() => {
    holdsRef.current = IDLE_HOLDS;
    setHolds(IDLE_HOLDS);
  }, []);

  const finishRun = useCallback(
    (now: number) => {
      if (statusRef.current !== 'running') {
        return;
      }
      clearHolds();
      clockRef.current.pause(now);
      commitStatus('finished');
      publishFrame(now, true);
      announce('Sequence complete.');
      showToast('Sequence complete.', { duration: 4500 });
    },
    [announce, clearHolds, commitStatus, publishFrame, showToast],
  );
  useEffect(() => {
    finishRunRef.current = finishRun;
  }, [finishRun]);

  const resetRun = useCallback(() => {
    const now = performance.now();
    clockRef.current.reset();
    clearHolds();
    commitStatus('idle');
    publishFrame(now, true);
    announce('Ready.');
  }, [announce, clearHolds, commitStatus, publishFrame]);

  const startRun = useCallback(() => {
    if (timingsRef.current.length === 0) {
      return;
    }
    const now = performance.now();
    clockRef.current.start(now);
    commitStatus('running');
    publishFrame(now, true);
    announce('Started.');
  }, [announce, commitStatus, publishFrame]);

  const pauseRun = useCallback(() => {
    if (statusRef.current !== 'running') {
      return;
    }
    const now = performance.now();
    clearHolds();
    clockRef.current.pause(now);
    commitStatus('paused');
    publishFrame(now, true);
    announce('Paused.');
  }, [announce, clearHolds, commitStatus, publishFrame]);

  const resumeRun = useCallback(() => {
    if (statusRef.current !== 'paused') {
      return;
    }
    const now = performance.now();
    clockRef.current.resume(now);
    commitStatus('running');
    publishFrame(now, true);
    announce('Resumed.');
  }, [announce, commitStatus, publishFrame]);

  const toggleRun = useCallback(() => {
    switch (statusRef.current) {
      case 'idle':
        startRun();
        break;
      case 'running':
        pauseRun();
        break;
      case 'paused':
        resumeRun();
        break;
      case 'finished':
        resetRun();
        break;
    }
  }, [pauseRun, resetRun, resumeRun, startRun]);

  const commitTimings = useCallback(
    (next: number[], markDirty = true) => {
      const now = performance.now();
      timingsRef.current = next;
      setTimings(next);
      if (markDirty) {
        setDirty(true);
      }

      if (next.length === 0) {
        clockRef.current.reset();
        clearHolds();
        commitStatus('idle');
      } else if (statusRef.current === 'running') {
        const elapsed = clockRef.current.elapsed(now);
        if (passedCount(next, elapsed) >= next.length) {
          finishRun(now);
        }
      }

      publishFrame(now, true);
    },
    [clearHolds, commitStatus, finishRun, publishFrame],
  );

  const nudgeLast = useCallback(
    (delta: number) => {
      const index = skipRef.current - 1;
      if (index < 0) {
        return;
      }
      invalidateUndo();
      commitTimings(nudgeAt(timingsRef.current, index, delta));
    },
    [commitTimings, invalidateUndo],
  );

  const nudgeNext = useCallback(
    (delta: number) => {
      const index = skipRef.current;
      if (index >= timingsRef.current.length) {
        return;
      }
      invalidateUndo();
      commitTimings(nudgeAt(timingsRef.current, index, delta));
    },
    [commitTimings, invalidateUndo],
  );

  const shiftAllNotes = useCallback(
    (delta: number) => {
      invalidateUndo();
      commitTimings(shiftAll(timingsRef.current, delta));
    },
    [commitTimings, invalidateUndo],
  );

  const nudgeClock = useCallback(
    (delta: number) => {
      if (statusRef.current !== 'running' && statusRef.current !== 'paused') {
        return;
      }
      const now = performance.now();
      const elapsed = clockRef.current.nudge(now, delta);
      if (
        statusRef.current === 'running' &&
        passedCount(timingsRef.current, elapsed) >= timingsRef.current.length
      ) {
        finishRun(now);
      }
      publishFrame(now, true);
    },
    [finishRun, publishFrame],
  );

  const undoRemove = useCallback(() => {
    const snapshot = undoRef.current;
    if (!snapshot) {
      return;
    }
    undoRef.current = null;
    timingsRef.current = snapshot.timings.slice();
    setTimings(snapshot.timings.slice());
    setDirty(true);
    publishFrame(performance.now(), true);
    announce('Removed note restored.');
    showToast('Removed note restored.', { duration: 3000 });
  }, [announce, publishFrame, showToast]);

  const removeNext = useCallback(() => {
    const index = skipRef.current;
    const current = timingsRef.current;
    if (index < 0 || index >= current.length) {
      return;
    }

    const removed = current[index]!;
    const snapshot: UndoSnapshot = {
      timings: current.slice(),
      label: `Removed note at ${formatClock(removed)}.`,
    };
    undoRef.current = snapshot;
    commitTimings(removeAt(current, index));
    // commitTimings can finish the run, which dismisses older undo toasts and
    // clears the snapshot. Re-arm it so the removal is still reversible.
    undoRef.current = snapshot;
    announce(snapshot.label);
    showToast(snapshot.label, {
      actionLabel: 'Undo',
      onAction: undoRemove,
      duration: 6000,
    });
  }, [announce, commitTimings, showToast, undoRemove]);

  const setHold = useCallback((direction: 'slow' | 'fast', active: boolean) => {
    const next = { ...holdsRef.current, [direction]: active };
    holdsRef.current = next;
    setHolds(next);
  }, []);

  const loadSequence = useCallback(
    (next: number[], markDirty: boolean) => {
      const now = performance.now();
      clockRef.current.reset();
      clearHolds();
      timingsRef.current = next;
      setTimings(next);
      commitStatus('idle');
      setDirty(markDirty);
      undoRef.current = null;
      setToast(null);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setConfirmReset(false);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      publishFrame(now, true);
    },
    [clearHolds, commitStatus, publishFrame],
  );

  const importFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const result = parseTimings(text);
        loadSequence(result.timings, true);
        setDataError(null);
        const noteWord = result.timings.length === 1 ? 'note' : 'notes';
        const suffix = result.sorted ? '' : ' (sorted)';
        announce(`Imported ${result.timings.length} ${noteWord}${suffix}.`);
        showToast(`Imported ${result.timings.length} ${noteWord}${suffix}.`, { duration: 4000 });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The timing file could not be read.';
        setDataError(message);
        announce(message);
        showToast(message, { tone: 'error', duration: 8000 });
      }
    },
    [announce, loadSequence, showToast],
  );

  const exportFile = useCallback(() => {
    const current = timingsRef.current;
    if (current.length === 0) {
      return;
    }

    try {
      const blob = new Blob([serializeTimings(current)], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'timings.txt';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setDirty(false);
      announce(`Exported ${current.length} notes.`);
      showToast(`Exported ${current.length} notes.`, { duration: 4000 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The timing file could not be exported.';
      announce(message);
      showToast(message, { tone: 'error', duration: 8000 });
    }
  }, [announce, showToast]);

  const resetTimings = useCallback(() => {
    if (DEFAULT_TIMINGS_ERROR) {
      return;
    }

    if (!confirmReset) {
      setConfirmReset(true);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setConfirmReset(false);
        resetTimerRef.current = null;
      }, 4000);
      announce('Reset confirmation pending.');
      return;
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setConfirmReset(false);
    loadSequence(DEFAULT_TIMINGS.slice(), false);
    setDataError(null);
    announce(`Timings reset to the original ${DEFAULT_TIMINGS.length} notes.`);
    showToast(`Timings reset to the original ${DEFAULT_TIMINGS.length} notes.`, { duration: 4000 });
  }, [announce, confirmReset, loadSequence, showToast]);

  const openHelp = useCallback(() => {
    clearHolds();
    helpOpenRef.current = true;
    setHelpOpen(true);
  }, [clearHolds]);

  const closeHelp = useCallback(() => {
    helpOpenRef.current = false;
    setHelpOpen(false);
  }, []);

  const performAction = useCallback(
    (action: ShortcutAction) => {
      switch (action.type) {
        case 'toggle-run':
          toggleRun();
          break;
        case 'reset-run':
          resetRun();
          break;
        case 'undo-remove':
          undoRemove();
          break;
        case 'remove-next':
          removeNext();
          break;
        case 'nudge-last':
          nudgeLast(action.delta);
          break;
        case 'nudge-next':
          nudgeNext(action.delta);
          break;
        case 'shift-all':
          shiftAllNotes(action.delta);
          break;
        case 'nudge-clock':
          nudgeClock(action.delta);
          break;
        case 'hold':
          setHold(action.direction, action.active);
          break;
        case 'help':
          openHelp();
          break;
      }
    },
    [nudgeClock, nudgeLast, nudgeNext, openHelp, removeNext, resetRun, setHold, shiftAllNotes, toggleRun, undoRemove],
  );
  useEffect(() => {
    performActionRef.current = performAction;
  }, [performAction]);

  useEffect(() => {
    helpOpenRef.current = helpOpen;
  }, [helpOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (helpOpenRef.current) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.tagName === 'BUTTON' &&
        (event.code === 'Space' || event.code === 'Enter')
      ) {
        return;
      }

      const action = resolveShortcut(
        {
          code: event.code,
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
        'keydown',
      );
      if (!action) {
        return;
      }
      if (event.repeat && DISCRETE_ACTIONS.has(action.type)) {
        return;
      }

      event.preventDefault();
      performActionRef.current(action);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const action = resolveShortcut(
        {
          code: event.code,
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
        'keyup',
      );
      if (!action) {
        return;
      }
      event.preventDefault();
      performActionRef.current(action);
    };

    const handleBlur = () => clearHolds();
    const handleVisibility = () => {
      if (document.hidden) {
        clearHolds();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearHolds]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(Math.max(now - last, 0), 100);
      last = now;

      if (statusRef.current === 'running') {
        if (holdsRef.current.slow || holdsRef.current.fast) {
          clockRef.current.applyHold(now, dt, holdsRef.current.slow, holdsRef.current.fast);
        }
        const elapsed = clockRef.current.elapsed(now);
        if (passedCount(timingsRef.current, elapsed) >= timingsRef.current.length) {
          finishRunRef.current(now);
        }
      }

      const current = publishFrame(now);
      drawStage(canvasRef.current, {
        notes: current.notes,
        status: statusRef.current,
        elapsed: current.elapsed,
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [publishFrame]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}Destroy the Flower — Drakengard 3 helper`;
  }, [dirty]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const actions = useMemo<HelperActions>(
    () => ({
      toggleRun,
      resetRun,
      nudgeLast,
      nudgeNext,
      shiftAll: shiftAllNotes,
      nudgeClock,
      removeNext,
      setHold,
      importFile,
      exportFile,
      resetTimings,
      openHelp,
      closeHelp,
      dismissToast,
    }),
    [
      closeHelp,
      dismissToast,
      exportFile,
      importFile,
      nudgeClock,
      nudgeLast,
      nudgeNext,
      openHelp,
      removeNext,
      resetRun,
      resetTimings,
      setHold,
      shiftAllNotes,
      toggleRun,
    ],
  );

  return {
    canvasRef,
    timings,
    status,
    frame,
    dirty,
    dataError,
    helpOpen,
    confirmReset,
    toast,
    holds,
    announcement,
    actions,
  };
}
