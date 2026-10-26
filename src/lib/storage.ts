import { parseTimings, serializeTimings } from './timing';

/** The key the helper keeps the player's sequence under. */
const TIMINGS_KEY = 'dod3-timings';

/**
 * Storage can be unavailable (private mode, blocked storage, a full quota).
 * Every access is best-effort: the helper keeps working from memory.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Nothing to do: the edits still apply for this visit.
  }
}

/**
 * The sequence saved in this browser, in the same one-value-per-line format the
 * helper exports. A stored file that no longer parses is dropped rather than
 * left to fail on every visit.
 */
export function loadSavedTimings(): number[] | null {
  const text = read(TIMINGS_KEY);
  if (text === null) {
    return null;
  }

  try {
    const { timings } = parseTimings(text);
    return timings.length > 0 ? timings : null;
  } catch {
    write(TIMINGS_KEY, null);
    return null;
  }
}

/** Keep the current sequence for the next visit; an empty one clears the slot. */
export function saveTimings(timings: readonly number[]): void {
  write(TIMINGS_KEY, timings.length === 0 ? null : serializeTimings(timings));
}

/** Forget the saved sequence, so the built-in one is used again. */
export function clearSavedTimings(): void {
  write(TIMINGS_KEY, null);
}
