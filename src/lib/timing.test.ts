import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS, DEFAULT_TIMINGS_ERROR, DEFAULT_TIMINGS_TEXT } from '../data/defaults';
import { sectionColorAt } from './beat';
import {
  GEOMETRY,
  formatClock,
  formatNextIn,
  formatNotePosition,
  holdDelta,
  nudgeAt,
  parseTimings,
  passedCount,
  removeAt,
  serializeTimings,
  shiftAll,
  visibleNotes,
} from './timing';

describe('built-in timing data', () => {
  it('loads the original 235-note sequence', () => {
    expect(DEFAULT_TIMINGS_ERROR).toBeNull();
    expect(DEFAULT_TIMINGS).toHaveLength(235);
    expect(DEFAULT_TIMINGS[0]).toBe(0);
    expect(DEFAULT_TIMINGS.at(-1)).toBe(394060.72739406076);
    expect(DEFAULT_TIMINGS_TEXT).toContain('4004.004004004004');
  });

  it('is already sorted', () => {
    const result = parseTimings(DEFAULT_TIMINGS_TEXT);
    expect(result.sorted).toBe(true);
    expect(result.timings).toEqual([...DEFAULT_TIMINGS]);
  });
});

describe('geometry', () => {
  it('matches the source constants', () => {
    expect(GEOMETRY.distance).toBe(500);
    expect(GEOMETRY.speed).toBe(0.25);
    expect(GEOMETRY.outerRadius).toBe(62);
    expect(GEOMETRY.innerRadius).toBe(24);
    expect(GEOMETRY.pressWindowMs).toBe(96);
    expect(GEOMETRY.removeAfterMs).toBe(24);
  });
});

describe('parseTimings', () => {
  it('handles BOM, CRLF, commas, comments, and blank lines', () => {
    const result = parseTimings('\uFEFF0\r\n\r\n# first note\r\n1,5\r\n// second\r\n2000\r\n');
    expect(result).toEqual({ timings: [0, 1.5, 2000], sorted: true });
  });

  it('sorts an out-of-order file and reports it', () => {
    const result = parseTimings('2000\n0\n1000\n');
    expect(result).toEqual({ timings: [0, 1000, 2000], sorted: false });
  });

  it('reports the bad line number', () => {
    expect(() => parseTimings('0\n1000\nnot-a-time\n')).toThrow('Line 3: "not-a-time" is not a number.');
  });

  it('rejects an empty file', () => {
    expect(() => parseTimings('# only comments\n\n')).toThrow('The file has no note times.');
  });

  it('allows negative notes', () => {
    expect(parseTimings('-149.0006\n0\n').timings).toEqual([-149.0006, 0]);
  });
});

describe('serializeTimings', () => {
  it('writes one value per line with a trailing newline', () => {
    expect(serializeTimings([0, 1000.5, -50])).toBe('0\n1000.5\n-50\n');
    expect(serializeTimings([])).toBe('');
  });

  it('round-trips through parseTimings', () => {
    const values = [0, 4004.004004004004, 394060.72739406076];
    expect(parseTimings(serializeTimings(values)).timings).toEqual(values);
  });
});

describe('passedCount', () => {
  const timings = [0, 1000, 3000];

  it('uses the source removal threshold', () => {
    expect(passedCount(timings, 0)).toBe(0);
    expect(passedCount(timings, 23)).toBe(0);
    expect(passedCount(timings, 24)).toBe(1);
    expect(passedCount(timings, 1000)).toBe(1);
    expect(passedCount(timings, 1023)).toBe(1);
    expect(passedCount(timings, 1024)).toBe(2);
    expect(passedCount(timings, 3024)).toBe(3);
  });

  it('handles non-finite elapsed time', () => {
    expect(passedCount(timings, Number.NaN)).toBe(0);
  });
});

describe('visibleNotes', () => {
  it('draws the first note at full radius at time zero', () => {
    const notes = visibleNotes([0, 4004], 0);
    expect(notes).toHaveLength(1);
    const [note] = notes;
    expect(note?.index).toBe(0);
    expect(note?.dueInMs).toBe(0);
    expect(note?.radius).toBe(500);
    expect(note?.press).toBe(true);
    expect(note?.color).toEqual([236, 141, 176]);
  });

  it('removes a note exactly 24 ms after its timestamp', () => {
    expect(visibleNotes([0, 4004], 23)).toHaveLength(1);
    expect(visibleNotes([0, 4004], 24)).toHaveLength(0);
  });

  it('starts the next ring at radius one when it enters the show window', () => {
    const notes = visibleNotes([1000], 1000 - GEOMETRY.showMs);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.dueInMs).toBe(2000);
    expect(notes[0]?.radius).toBe(1);
    expect(notes[0]?.press).toBe(false);
    expect(notes[0]?.color).toEqual(sectionColorAt(1000));
  });

  it('uses the press window boundaries and brightens past-due rings', () => {
    const early = visibleNotes([1000], 904);
    expect(early[0]?.dueInMs).toBe(96);
    expect(early[0]?.press).toBe(true);
    expect(early[0]?.radius).toBe(476);

    const outside = visibleNotes([1000], 903);
    expect(outside[0]?.dueInMs).toBe(97);
    expect(outside[0]?.press).toBe(false);

    const justPast = visibleNotes([1000], 1023);
    expect(justPast[0]?.dueInMs).toBe(-23);
    expect(justPast[0]?.press).toBe(true);
    expect(justPast[0]?.radius).toBe(506);
    expect(justPast[0]?.color).toEqual([236, 141, 176]);
  });

  it('breaks once notes are beyond the show window', () => {
    const notes = visibleNotes([1000, 3000, 3001], 1000);
    expect(notes.map((note) => note.index)).toEqual([0, 1]);
    expect(notes[1]?.radius).toBe(1);
  });

  it('colours incoming rings by their song section', () => {
    expect(visibleNotes([77_000], 75_000)[0]?.color).toEqual([184, 134, 11]);
    expect(visibleNotes([80_000], 79_000)[0]?.color).toEqual([184, 134, 11]);
    expect(visibleNotes([70_000], 69_000)[0]?.color).toEqual([216, 27, 96]);
  });
});

describe('timing mutations', () => {
  it('nudges and keeps the sequence sorted', () => {
    expect(nudgeAt([1000, 2000], 0, 50)).toEqual([1050, 2000]);
    expect(nudgeAt([1000, 1020], 0, 50)).toEqual([1020, 1050]);
    expect(nudgeAt([0, 1000], 99, 50)).toEqual([0, 1000]);
  });

  it('shifts every note', () => {
    expect(shiftAll([0, 1000, 5000], 50)).toEqual([50, 1050, 5050]);
    expect(shiftAll([0, 1000], -50)).toEqual([-50, 950]);
  });

  it('removes a note by index', () => {
    expect(removeAt([0, 1000, 2000], 1)).toEqual([0, 2000]);
    expect(removeAt([0], 0)).toEqual([]);
    expect(removeAt([0], 5)).toEqual([0]);
  });
});

describe('formatting', () => {
  it('truncates centiseconds like the source', () => {
    expect(formatClock(0)).toBe('0:00.00');
    expect(formatClock(25)).toBe('0:00.02');
    expect(formatClock(999)).toBe('0:00.99');
    expect(formatClock(1000)).toBe('0:01.00');
    expect(formatClock(4004.004)).toBe('0:04.00');
    expect(formatClock(394060.727)).toBe('6:34.06');
    expect(formatClock(-50)).toBe('-0:00.05');
  });

  it('formats the next-note countdown', () => {
    expect(formatNextIn(null)).toBe('—');
    expect(formatNextIn(96)).toBe('now');
    expect(formatNextIn(96.1)).toBe('in 0.10s');
    expect(formatNextIn(1004)).toBe('in 1.00s');
  });

  it('formats a one-based note position', () => {
    expect(formatNotePosition(0, 235)).toBe('1 / 235');
    expect(formatNotePosition(234, 235)).toBe('235 / 235');
    expect(formatNotePosition(235, 235)).toBe('235 / 235');
    expect(formatNotePosition(0, 0)).toBe('0 / 0');
  });
});

describe('holdDelta', () => {
  it('matches the 60 FPS-equivalent rates', () => {
    expect(holdDelta(1000, true, false)).toBe(-120);
    expect(holdDelta(1000, false, true)).toBe(180);
    expect(holdDelta(1000, true, true)).toBe(180);
    expect(holdDelta(0, true, true)).toBe(0);
  });
});
