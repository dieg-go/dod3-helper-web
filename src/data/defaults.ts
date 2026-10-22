import raw from './timings.txt?raw';
import { parseTimings } from '../lib/timing';

let parsedTimings: number[] = [];
let parsedError: string | null = null;

try {
  parsedTimings = parseTimings(raw).timings;
} catch (error) {
  parsedError = error instanceof Error ? error.message : 'The built-in timing file could not be read.';
}

export const DEFAULT_TIMINGS_TEXT = raw;
export const DEFAULT_TIMINGS: readonly number[] = Object.freeze(parsedTimings);
export const DEFAULT_TIMINGS_ERROR = parsedError;
