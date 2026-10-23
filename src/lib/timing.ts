/**
 * Pure timing model for the Drakengard 3 final-boss helper.
 *
 * Geometry and thresholds intentionally mirror the original Pygame source:
 *  - rings start at the note origin and grow toward the player
 *  - a note is "press" inside +/- innerRadius/speed milliseconds
 *  - the source removes a note when `dif <= -innerRadius`, comparing a pixel
 *    radius to milliseconds. That asymmetry is preserved below.
 */

import { sectionColorAt } from './beat';

export interface StageGeometry {
  width: number;
  height: number;
  noteX: number;
  noteY: number;
  playerX: number;
  playerY: number;
  showMs: number;
  safeMs: number;
  distance: number;
  speed: number;
  outerRadius: number;
  innerRadius: number;
  pressWindowMs: number;
  removeAfterMs: number;
  colorGrowth: number;
  holdSlowPerMs: number;
  holdFastPerMs: number;
}

const width = 800;
const height = 700;
const noteX = width / 2;
const noteY = height / 7;
const playerX = width /2;
const playerY = height - 100;
const showMs = 2000;
const safeMs = 500;
const distance = Math.hypot(playerX - noteX, playerY - noteY);
const speed = distance / showMs;
const outerRadius = Math.trunc((safeMs * speed) / 2);
const innerRadius = Math.trunc(outerRadius / 2.5);

export const GEOMETRY: Readonly<StageGeometry> = Object.freeze({
  width,
  height,
  noteX,
  noteY,
  playerX,
  playerY,
  showMs,
  safeMs,
  distance,
  speed,
  outerRadius,
  innerRadius,
  pressWindowMs: innerRadius / speed,
  removeAfterMs: innerRadius,
  colorGrowth: (255 * 2) / safeMs,
  holdSlowPerMs: -0.12,
  holdFastPerMs: 0.18,
});

export type Rgb = Readonly<[number, number, number]>;

export interface VisibleNote {
  index: number;
  dueInMs: number;
  radius: number;
  color: Rgb;
  press: boolean;
}

export interface ParseResult {
  timings: number[];
  sorted: boolean;
}

const MAX_NOTES = 20_000;

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, value));
}

function pastColor(dueInMs: number): Rgb {
  const shift = Math.trunc(GEOMETRY.colorGrowth * dueInMs);
  return [clampByte(-shift), clampByte(255 + shift), 10];
}

/**
 * Parse the original one-number-per-line timing file. Commas are accepted as
 * decimal separators, comments and blank lines are ignored, and a file that
 * arrives out of order is sorted (the caller is told that it was sorted).
 */
export function parseTimings(text: string): ParseResult {
  const values: number[] = [];
  let sorted = true;
  let previous = Number.NEGATIVE_INFINITY;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!.trim();
    if (raw.length === 0 || raw.startsWith('#') || raw.startsWith('//')) {
      continue;
    }

    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value)) {
      throw new Error(`Line ${index + 1}: "${raw}" is not a number.`);
    }
    if (values.length >= MAX_NOTES) {
      throw new Error(`The file has more than ${MAX_NOTES.toLocaleString('en-US')} notes.`);
    }
    if (value < previous) {
      sorted = false;
    }
    previous = value;
    values.push(value);
  }

  if (values.length === 0) {
    throw new Error('The file has no note times.');
  }

  if (!sorted) {
    values.sort((a, b) => a - b);
  }

  return { timings: values, sorted };
}

export function serializeTimings(timings: readonly number[]): string {
  if (timings.length === 0) {
    return '';
  }
  return `${timings.map((value) => String(Object.is(value, -0) ? 0 : value)).join('\n')}\n`;
}

/**
 * Number of notes that have fully passed, using the source's hide threshold.
 * A note is hidden when dueIn <= -removeAfterMs.
 */
export function passedCount(timings: readonly number[], elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) {
    return 0;
  }

  const threshold = elapsedMs - GEOMETRY.removeAfterMs;
  let low = 0;
  let high = timings.length;

  while (low < high) {
    const middle = (low + high) >>> 1;
    if (timings[middle]! <= threshold) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function visibleNotes(
  timings: readonly number[],
  elapsedMs: number,
  startIndex = passedCount(timings, elapsedMs),
): VisibleNote[] {
  const notes: VisibleNote[] = [];

  for (let index = startIndex; index < timings.length; index += 1) {
    const dueInMs = timings[index]! - elapsedMs;
    if (dueInMs > GEOMETRY.showMs) {
      break;
    }
    if (dueInMs <= -GEOMETRY.removeAfterMs) {
      continue;
    }

    notes.push({
      index,
      dueInMs,
      radius: Math.max(Math.round((GEOMETRY.showMs - dueInMs) * GEOMETRY.speed), 1),
      color: dueInMs > 0 ? sectionColorAt(timings[index]!) : pastColor(dueInMs),
      press: Math.abs(dueInMs) <= GEOMETRY.pressWindowMs,
    });
  }

  return notes;
}

export function nudgeAt(timings: readonly number[], index: number, deltaMs: number): number[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= timings.length ||
    !Number.isFinite(deltaMs)
  ) {
    return timings.slice();
  }

  const next = timings.slice();
  next[index] = next[index]! + deltaMs;
  next.sort((a, b) => a - b);
  return next;
}

export function shiftAll(timings: readonly number[], deltaMs: number): number[] {
  if (!Number.isFinite(deltaMs)) {
    return timings.slice();
  }
  return timings.map((value) => value + deltaMs).sort((a, b) => a - b);
}

export function removeAt(timings: readonly number[], index: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= timings.length) {
    return timings.slice();
  }
  return timings.filter((_, current) => current !== index);
}

/** Extra elapsed time added by holding the slow/fast controls for one frame. */
export function holdDelta(dtMs: number, slow: boolean, fast: boolean): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    return 0;
  }
  if (fast) {
    return dtMs * GEOMETRY.holdFastPerMs;
  }
  if (slow) {
    return dtMs * GEOMETRY.holdSlowPerMs;
  }
  return 0;
}

/** Format like the source's truncated timedelta: m:ss.cc. */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '—';
  }

  const sign = ms < 0 ? '-' : '';
  const absolute = Math.abs(ms);
  const totalCentiseconds = Math.floor(absolute / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(absolute / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(
    2,
    '0',
  )}`;
}

export function formatNextIn(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return '—';
  }
  if (ms <= GEOMETRY.pressWindowMs) {
    return 'now';
  }
  return `in ${(Math.max(0, ms) / 1000).toFixed(2)}s`;
}

export function formatNotePosition(skip: number, total: number): string {
  if (total <= 0) {
    return '0 / 0';
  }
  return `${Math.min(skip + 1, total)} / ${total}`;
}
