import type { CSSProperties } from 'react';
import {
  TEMPO_SECTIONS,
  movementLabel,
  sectionColor,
  tempoSectionIndexAt,
} from '../lib/beat';
import { formatClock } from '../lib/timing';

interface MovementRibbonProps {
  elapsed: number;
  duration: number;
  total: number;
  onSeek: (positionMs: number) => void;
}

function rgb(color: readonly [number, number, number]): string {
  return `${color[0]} ${color[1]} ${color[2]}`;
}

/**
 * Who holds the stage in each movement, in tempo-map order: Zero opens alone, a
 * sister joins her every movement, everyone is on stage in VII, and Zero closes
 * alone in VIII.
 */
const MOVEMENT_NAMES = [
  'Zero',
  'Five',
  'Four',
  'Three',
  'Two',
  'One',
  'Everyone',
  'Zero',
] as const;

/** A movement's cast name; past the end of the list its numeral stands in. */
function movementName(index: number | null): string {
  if (index === null) {
    return '—';
  }
  return MOVEMENT_NAMES[index] ?? movementLabel(index);
}

/**
 * The score map: one segment per tempo movement, scaled by duration, with the
 * live playhead. It doubles as a scrubber, so the eight-part song can be
 * rewound or fast-forwarded without waiting through it.
 */
export function MovementRibbon({ elapsed, duration, total, onSeek }: MovementRibbonProps) {
  if (total === 0 || TEMPO_SECTIONS.length === 0) {
    return null;
  }

  const lastSection = TEMPO_SECTIONS[TEMPO_SECTIONS.length - 1];
  const span = Math.max(duration, lastSection ? lastSection.endMs : 0, 1);
  const progress = Math.min(1, Math.max(0, elapsed / span));
  const activeIndex = tempoSectionIndexAt(elapsed);
  const active = activeIndex === null ? null : (TEMPO_SECTIONS[activeIndex] ?? null);
  const color = sectionColor(activeIndex);
  const rampLength = active ? active.endMs - active.startMs : 0;

  const bpm = active
    ? active.endBpm === active.startBpm
      ? `${Math.round(active.startBpm)} BPM`
      : `${Math.round(active.startBpm)} → ${Math.round(active.endBpm)} BPM`
    : null;

  const valueText =
    activeIndex === null
      ? formatClock(elapsed)
      : `${formatClock(elapsed)}, ${movementName(activeIndex)}`;

  return (
    <figure className="movement" style={{ '--seg': rgb(color) } as CSSProperties}>
      <div className="movement-track">
        {TEMPO_SECTIONS.map((section, index) => {
          const state =
            index === activeIndex
              ? ' is-active'
              : activeIndex !== null && index < activeIndex
                ? ' is-past'
                : '';
          return (
            <span
              key={`${section.startMs}-${index}`}
              className={`movement-seg${state}`}
              aria-hidden="true"
              style={
                {
                  flexGrow: Math.max(section.endMs - section.startMs, 1),
                  '--seg': rgb(sectionColor(index)),
                } as CSSProperties
              }
            >
              <span className="movement-num">{movementName(index)}</span>
            </span>
          );
        })}
        <span
          className="movement-head"
          aria-hidden="true"
          style={{ left: `${progress * 100}%` }}
        />
        <input
          className="movement-scrub"
          type="range"
          min={0}
          max={span}
          step={50}
          value={Math.min(elapsed, span)}
          onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
          aria-label="Scrub the sequence"
          aria-valuetext={valueText}
        />
      </div>

      <figcaption className="movement-meta">
        <span className="movement-now">
          <span className="movement-dot" aria-hidden="true" />
          <span>{movementName(activeIndex)}</span>
          {bpm ? <span className="movement-bpm">{bpm}</span> : null}
        </span>
        <span className="movement-range">
          {active && rampLength > 0
            ? `${formatClock(active.startMs)} – ${formatClock(active.endMs)}`
            : formatClock(elapsed)}
        </span>
      </figcaption>
    </figure>
  );
}
