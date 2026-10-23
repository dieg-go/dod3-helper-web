import groupingText from '../data/timings_grouping.txt?raw';

export interface TempoSection {
  readonly startMs: number;
  readonly endMs: number;
  /** Beats per minute at the start of the section. */
  readonly startBpm: number;
  /** Beats per minute at the end; equal to startBpm for a steady section. */
  readonly endBpm: number;
}

const LINE_PATTERN =
  /^(\d+):\s*(\d{1,2})\s*-\s*(\d+):\s*(\d{1,2})\s*\/\/\s*(?:BPM:\s*)?(\d+(?:\.\d+)?)(?:\s*(?:->|to)\s*(\d+(?:\.\d+)?))?\s*$/i;

function toMilliseconds(minutes: string, seconds: string): number {
  return (Number(minutes) * 60 + Number(seconds)) * 1000;
}

/**
 * Parse the hand-written tempo map. Timecodes are m:ss and the BPM follows a
 * `//` comment marker; `120 -> 60` describes a linear tempo change.
 */
export function parseTempoSections(text: string): TempoSection[] {
  const sections: TempoSection[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const match = LINE_PATTERN.exec(line);
    if (!match) {
      throw new Error(`Invalid tempo section on line ${index + 1}: ${rawLine}`);
    }

    const startMs = toMilliseconds(match[1]!, match[2]!);
    const endMs = toMilliseconds(match[3]!, match[4]!);
    const startBpm = Number(match[5]);
    const endBpm = match[6] === undefined ? startBpm : Number(match[6]);

    if (endMs <= startMs || startBpm <= 0 || endBpm < 0) {
      throw new Error(`Invalid tempo range on line ${index + 1}: ${rawLine}`);
    }

    sections.push({ startMs, endMs, startBpm, endBpm });
  }

  return sections.sort((a, b) => a.startMs - b.startMs);
}

export const TEMPO_SECTIONS = parseTempoSections(groupingText);

export type GroupColor = readonly [number, number, number];

/** One colour per tempo section: pink, gold, green, purple, blue, grey, pink, pink. */
const SECTION_COLORS: readonly GroupColor[] = Object.freeze([
  [216, 27, 96],
  [184, 134, 11],
  [46, 125, 50],
  [123, 31, 162],
  [21, 101, 192],
  [96, 125, 139],
  [216, 27, 96],
  [216, 27, 96],
]);

/**
 * Index of the tempo section a note belongs to. Notes that fall in a gap
 * between sections (usually a few hundred milliseconds around a boundary) go
 * to the nearer section; notes outside the map clamp to the first or last.
 */
export function tempoSectionIndexAt(
  timeMs: number,
  sections: readonly TempoSection[] = TEMPO_SECTIONS,
): number | null {
  if (sections.length === 0) {
    return null;
  }

  const containing = sections.findIndex(
    (section) => timeMs >= section.startMs && timeMs < section.endMs,
  );
  if (containing !== -1) {
    return containing;
  }

  if (timeMs < sections[0]!.startMs) {
    return 0;
  }

  const lastIndex = sections.length - 1;
  if (timeMs >= sections[lastIndex]!.endMs) {
    return lastIndex;
  }

  for (let index = 1; index < sections.length; index += 1) {
    const previous = sections[index - 1]!;
    const next = sections[index]!;
    if (timeMs < next.startMs) {
      return timeMs - previous.endMs <= next.startMs - timeMs ? index - 1 : index;
    }
  }

  return lastIndex;
}

export function sectionColorAt(
  timeMs: number,
  sections: readonly TempoSection[] = TEMPO_SECTIONS,
): GroupColor {
  const index = tempoSectionIndexAt(timeMs, sections);
  if (index === null) {
    return SECTION_COLORS[0]!;
  }
  return SECTION_COLORS[index] ?? SECTION_COLORS[0]!;
}

export function findTempoSection(
  elapsedMs: number,
  sections: readonly TempoSection[] = TEMPO_SECTIONS,
): TempoSection | null {
  return (
    sections.find((section) => elapsedMs >= section.startMs && elapsedMs < section.endMs) ??
    null
  );
}

/**
 * Number of beats elapsed since the start of the section. A linear BPM ramp is
 * integrated so the final section can slow to a stop without breaking phase.
 */
export function beatCount(section: TempoSection, elapsedMs: number): number {
  const sectionSeconds = (section.endMs - section.startMs) / 1000;
  const elapsedSeconds = (elapsedMs - section.startMs) / 1000;
  const bpmChange = section.endBpm - section.startBpm;

  return (
    (section.startBpm * elapsedSeconds +
      (bpmChange * elapsedSeconds * elapsedSeconds) / (2 * sectionSeconds)) /
    60
  );
}

/**
 * Vertical offset for a beat-synchronised bob. The waveform starts at centre
 * and moves a half cycle per beat, peaking midway between beats; rests between
 * tempo sections park Mikhail at centre instead of drifting out of phase.
 */
export function beatOffset(
  elapsedMs: number,
  amplitude: number,
  sections: readonly TempoSection[] = TEMPO_SECTIONS,
): number {
  const section = findTempoSection(elapsedMs, sections);
  if (!section) {
    return 0;
  }

  return Math.sin(beatCount(section, elapsedMs) * Math.PI) * amplitude;
}
