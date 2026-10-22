import { describe, expect, it } from 'vitest';
import {
  beatCount,
  beatOffset,
  findTempoSection,
  parseTempoSections,
  sectionColorAt,
  tempoSectionIndexAt,
  type TempoSection,
} from './beat';

const steady = (startMs: number, endMs: number, bpm: number): TempoSection => ({
  startMs,
  endMs,
  startBpm: bpm,
  endBpm: bpm,
});

describe('parseTempoSections', () => {
  it('reads loose timecodes, BPM labels, and tempo ramps', () => {
    const sections = parseTempoSections(`
      # comment
      0:0 - 1:08 // 120
      1:47 - 2: 22 // BPM: 142
      3:52 - 4:21 // 175
      5:38 - 6:34 // 130 -> 0
    `);

    expect(sections).toEqual([
      { startMs: 0, endMs: 68_000, startBpm: 120, endBpm: 120 },
      { startMs: 107_000, endMs: 142_000, startBpm: 142, endBpm: 142 },
      { startMs: 232_000, endMs: 261_000, startBpm: 175, endBpm: 175 },
      { startMs: 338_000, endMs: 394_000, startBpm: 130, endBpm: 0 },
    ]);
  });

  it('sorts sections and rejects malformed lines', () => {
    expect(
      parseTempoSections('1:00 - 2:00 // 120\n0:00 - 0:30 // 100').map(
        (section) => section.startMs,
      ),
    ).toEqual([0, 60_000]);

    expect(() => parseTempoSections('0:00 - nope // 120')).toThrow(/line 1/);
  });
});

describe('beat phase', () => {
  it('advances one cycle per beat', () => {
    const section = steady(0, 60_000, 120);

    expect(beatCount(section, 0)).toBe(0);
    expect(beatCount(section, 500)).toBe(1);
    expect(beatCount(section, 1_000)).toBe(2);
    expect(beatOffset(125, 10, [section])).toBeCloseTo(10);
  });

  it('integrates a linear tempo ramp', () => {
    const section: TempoSection = {
      startMs: 0,
      endMs: 60_000,
      startBpm: 130,
      endBpm: 0,
    };

    expect(beatCount(section, 0)).toBe(0);
    expect(beatCount(section, 30_000)).toBeCloseTo(48.75);
    expect(beatCount(section, 60_000)).toBeCloseTo(65);
  });

  it('parks at centre outside a tempo section', () => {
    const sections = [steady(10_000, 20_000, 120)];

    expect(findTempoSection(9_999, sections)).toBeNull();
    expect(findTempoSection(10_000, sections)).toEqual(sections[0]);
    expect(findTempoSection(20_000, sections)).toBeNull();
    expect(beatOffset(5_000, 10, sections)).toBe(0);
  });
});

describe('group colours', () => {
  it('uses the requested colour for each section', () => {
    expect(sectionColorAt(0)).toEqual([216, 27, 96]);
    expect(sectionColorAt(80_000)).toEqual([184, 134, 11]);
    expect(sectionColorAt(110_000)).toEqual([46, 125, 50]);
    expect(sectionColorAt(160_000)).toEqual([123, 31, 162]);
    expect(sectionColorAt(200_000)).toEqual([21, 101, 192]);
    expect(sectionColorAt(250_000)).toEqual([96, 125, 139]);
    expect(sectionColorAt(300_000)).toEqual([216, 27, 96]);
    expect(sectionColorAt(350_000)).toEqual([216, 27, 96]);
  });

  it('assigns notes near a boundary to the nearer section', () => {
    expect(tempoSectionIndexAt(75_842)).toBe(1);
    expect(tempoSectionIndexAt(142_442)).toBe(2);
    expect(tempoSectionIndexAt(223_523)).toBe(4);
    expect(tempoSectionIndexAt(261_127)).toBe(5);
    expect(tempoSectionIndexAt(338_405)).toBe(7);
  });

  it('clamps notes outside the map', () => {
    expect(tempoSectionIndexAt(-1)).toBe(0);
    expect(tempoSectionIndexAt(999_999)).toBe(7);
  });
});
