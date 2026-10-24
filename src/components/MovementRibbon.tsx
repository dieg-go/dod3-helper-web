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
}

function rgb(color: readonly [number, number, number]): string {
  return `${color[0]} ${color[1]} ${color[2]}`;
}

/**
 * The score map: one segment per tempo movement, scaled by duration, with the
 * live playhead. It gives the 235-note sequence a visible shape and shows where
 * the run sits in the eight-part song.
 */
export function MovementRibbon({ elapsed, duration, total }: MovementRibbonProps) {
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

  return (
    <figure className="movement" style={{ '--seg': rgb(color) } as CSSProperties}>
      <div className="movement-track" aria-hidden="true">
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
              style={
                {
                  flexGrow: Math.max(section.endMs - section.startMs, 1),
                  '--seg': rgb(sectionColor(index)),
                } as CSSProperties
              }
            >
              <span className="movement-num">{movementLabel(index)}</span>
            </span>
          );
        })}
        <span className="movement-head" style={{ left: `${progress * 100}%` }} />
      </div>

      <figcaption className="movement-meta">
        <span className="movement-now">
          <span className="movement-dot" aria-hidden="true" />
          <span>{active ? `Movement ${movementLabel(activeIndex ?? 0)}` : 'Movement —'}</span>
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
