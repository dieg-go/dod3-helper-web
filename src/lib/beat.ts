import groupingText from '../data/timings_grouping.txt?raw';

export interface TempoSection {
  readonly startMs: number;
  readonly endMs: number;
  /** Beats per minute at the start of the section. */
  readonly startBpm: number;
  /** Beats per minute at the end; equal to startBpm for a steady section. */
  readonly endBpm: number;
}

const CLOCK = /^(\d+):\s*(\d{1,2}(?:\.\d+)?)$/;
const MILLISECONDS = /^(\d+(?:\.\d+)?)(?:ms)?$/i;
const TEMPO = /^(?:BPM:?\s*)?(\d+(?:\.\d+)?)(?:\s*(?:->|to)\s*(\d+(?:\.\d+)?))?$/i;

/**
 * Parse one side of the range into milliseconds. Accepted forms:
 *
 *   `1:10`        minutes:seconds
 *   `1:10.250`    minutes:seconds with a fractional part
 *   `70250`       bare milliseconds
 *   `70250ms`     milliseconds with an explicit unit
 */
function parseTimecode(token: string, lineNumber: number, rawLine: string): number {
  const text = token.trim();

  const clock = CLOCK.exec(text);
  if (clock) {
    const minutes = Number(clock[1]);
    const seconds = Number(clock[2]);
    if (seconds >= 60) {
      throw new Error(`Seconds must be below 60 on line ${lineNumber}: ${rawLine}`);
    }
    return (minutes * 60 + seconds) * 1000;
  }

  const milliseconds = MILLISECONDS.exec(text);
  if (milliseconds) {
    return Number(milliseconds[1]);
  }

  throw new Error(`Invalid tempo timecode on line ${lineNumber}: ${rawLine}`);
}

/**
 * Parse the hand-written tempo map. Each line is `start - end // BPM`, the BPM
 * follows a `//` comment marker, and `120 -> 60` describes a linear tempo
 * change. Timecodes accept minutes:seconds, fractional seconds, or plain
 * milliseconds — the map's start also sets the phase of the beat pulse, so
 * sub-second precision keeps it aligned with the music.
 */
export function parseTempoSections(text: string): TempoSection[] {
  const sections: TempoSection[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const lineNumber = index + 1;
    const commentAt = line.indexOf('//');
    if (commentAt === -1) {
      throw new Error(`Invalid tempo section on line ${lineNumber}: ${rawLine}`);
    }

    const range = line.slice(0, commentAt).trim().split('-');
    if (range.length !== 2) {
      throw new Error(`Invalid tempo section on line ${lineNumber}: ${rawLine}`);
    }

    const startMs = parseTimecode(range[0]!, lineNumber, rawLine);
    const endMs = parseTimecode(range[1]!, lineNumber, rawLine);

    const tempo = TEMPO.exec(line.slice(commentAt + 2).trim());
    if (!tempo) {
      throw new Error(`Invalid tempo section on line ${lineNumber}: ${rawLine}`);
    }

    const startBpm = Number(tempo[1]);
    const endBpm = tempo[2] === undefined ? startBpm : Number(tempo[2]);

    if (endMs <= startMs || startBpm <= 0 || endBpm < 0) {
      throw new Error(`Invalid tempo range on line ${lineNumber}: ${rawLine}`);
    }

    sections.push({ startMs, endMs, startBpm, endBpm });
  }

  return sections.sort((a, b) => a.startMs - b.startMs);
}

/**
 * A typo in the hand-written map must not take the whole helper down: without
 * movements the stage and the run still work, only the colour map goes away.
 */
export const TEMPO_SECTIONS: readonly TempoSection[] = (() => {
  try {
    return parseTempoSections(groupingText);
  } catch (error) {
    console.warn('The tempo map could not be read; movements are disabled.', error);
    return [];
  }
})();

export type GroupColor = readonly [number, number, number];

/** One colour per tempo section: pink, yellow, green, purple, blue, red, pink, pink. */
export const SECTION_COLORS: readonly GroupColor[] = Object.freeze([
  [216, 27, 96],
  [230, 230, 46],
  [46, 125, 50],
  [123, 31, 162],
  [21, 101, 192],
  [180, 25, 25],
  [216, 27, 96],
  [216, 27, 96],
]);

const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const;

/** Roman numeral for a zero-based section index, used as the movement label. */
export function movementLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    return '—';
  }
  return ROMAN[index] ?? String(index + 1);
}

/** Colour of a section index, falling back to the opening pink. */
export function sectionColor(index: number | null): GroupColor {
  if (index === null) {
    return SECTION_COLORS[0]!;
  }
  return SECTION_COLORS[index] ?? SECTION_COLORS[0]!;
}

function mix(from: GroupColor, to: GroupColor, amount: number): GroupColor {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ] as const;
}

/**
 * The stage mood colour. Sections change the colour of the ambient light, and
 * the first {@link blendMs} of a movement cross-fades from the previous one so
 * the change reads as a lighting shift rather than a hard cut.
 */
export function moodColorAt(
  timeMs: number,
  sections: readonly TempoSection[] = TEMPO_SECTIONS,
  blendMs = 1600,
): GroupColor {
  const index = tempoSectionIndexAt(timeMs, sections);
  if (index === null) {
    return SECTION_COLORS[0]!;
  }

  const current = sectionColor(index);
  const section = sections[index];
  if (!section || blendMs <= 0) {
    return current;
  }

  const sinceStart = timeMs - section.startMs;
  if (sinceStart < 0 || sinceStart >= blendMs) {
    return current;
  }

  const amount = sinceStart / blendMs;
  // Smoothstep keeps the handover soft at both ends.
  return mix(sectionColor(index - 1), current, amount * amount * (3 - 2 * amount));
}

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
