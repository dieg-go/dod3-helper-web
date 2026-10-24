import { MIKHAIL_PASS_URL, MIKHAIL_URL } from './assets';
import { beatCount, beatOffset, findTempoSection, moodColorAt, type GroupColor } from './beat';
import { GEOMETRY, type VisibleNote } from './timing';
import type { RunStatus } from './run';

/** Independent visual layers of the stage. */
export interface StageLayers {
  drawFlightPath: boolean;
  drawReticle: boolean;
  drawMikhail: boolean;
  drawPressLabel: boolean;
}

/** The player sprite starts visible; every other layer is opt-in. */
export const DEFAULT_STAGE_LAYERS: StageLayers = {
  drawFlightPath: false,
  drawReticle: false,
  drawMikhail: true,
  drawPressLabel: false,
};

export interface StageFrame {
  notes: readonly VisibleNote[];
  status: RunStatus;
  elapsed: number;
  /** Omitted frames use {@link DEFAULT_STAGE_LAYERS}. */
  layers?: StageLayers;
}

function loadMikhail(url: string): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image;
}

const mikhailIdleImage = loadMikhail(MIKHAIL_URL);
const mikhailPassImage = loadMikhail(MIKHAIL_PASS_URL);

type Rgb = readonly [number, number, number];

const INK_DARK = '26, 19, 29';
const INK_LIGHT = '244, 235, 239';
const ROSE: Rgb = [196, 101, 128];
const GOLD: Rgb = [216, 166, 87];
const GOLD_LIGHT: Rgb = [240, 203, 128];
const JADE: Rgb = [47, 122, 91];
const JADE_LIGHT: Rgb = [112, 184, 149];

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function ink(alpha: number, dark: boolean): string {
  return `rgba(${dark ? INK_LIGHT : INK_DARK}, ${alpha * (dark ? 1.4 : 1)})`;
}

/** Lift a note colour toward white so it reads against the dark stage. */
function lighten(color: Rgb, amount: number): Rgb {
  return [
    Math.round(color[0] + (255 - color[0]) * amount),
    Math.round(color[1] + (255 - color[1]) * amount),
    Math.round(color[2] + (255 - color[2]) * amount),
  ] as const;
}

/** The head script and the theme toggle keep this attribute in sync. */
function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme !== 'light';
}

/** Effects off is the low-power mode for phones: the ambience is skipped and
 * the canvas renders at 1× instead of the device pixel ratio. */
function effectsEnabled(): boolean {
  return document.documentElement.dataset.effects !== 'off';
}

const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** The media query tracks changes on its own, so this stays a cheap read. */
function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false;
}

/* ---------------------------------------------------------------- atmosphere */

/**
 * Drifting petals, the section-tinted bloom behind the target, and the light
 * cone falling from the flower. These live in the canvas so the stage keeps a
 * sense of place on an otherwise flat surface.
 */
interface Petal {
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  phase: number;
  spin: number;
  alpha: number;
}

/** Small deterministic PRNG so the petal field is identical on every load. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const PETALS: readonly Petal[] = (() => {
  const random = seeded(0x5eed_1a3);
  return Array.from({ length: 17 }, () => {
    const depth = 0.35 + random() * 0.65;
    return {
      x: random() * GEOMETRY.width,
      y: random() * GEOMETRY.height,
      size: 4 + depth * 8,
      speed: 5 + depth * 13,
      sway: 0.22 + random() * 0.35,
      phase: random() * Math.PI * 2,
      spin: random() * Math.PI * 2,
      alpha: 0.2 + depth * 0.24,
    } satisfies Petal;
  });
})();

let ambientMs = 0;
let lastDrawAt = 0;

/** A stage-local clock so the ambience keeps drifting between runs. */
function advanceAmbient(paused: boolean): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (lastDrawAt === 0) {
    lastDrawAt = now;
  }
  const delta = Math.min(Math.max(now - lastDrawAt, 0), 64);
  lastDrawAt = now;
  if (!paused && !prefersReducedMotion()) {
    ambientMs += delta;
  }
  return ambientMs;
}

function field(value: number, span: number): number {
  return ((value % span) + span) % span;
}

/** Soft light pooling around the target, tinted by the current movement. */
const bloomCache = new Map<string, CanvasGradient>();

function bloomGradient(
  context: CanvasRenderingContext2D,
  color: GroupColor,
  dark: boolean,
): CanvasGradient {
  const key = `${color.join('_')}_${dark ? 'dark' : 'light'}`;
  const cached = bloomCache.get(key);
  if (cached) {
    return cached;
  }

  const { playerX, playerY } = GEOMETRY;
  const gradient = context.createRadialGradient(playerX, playerY, 0, playerX, playerY, 265);
  gradient.addColorStop(0, rgba(color, 1));
  gradient.addColorStop(0.38, rgba(color, 0.44));
  gradient.addColorStop(1, rgba(color, 0));
  bloomCache.set(key, gradient);
  return gradient;
}

function drawBloom(
  context: CanvasRenderingContext2D,
  color: GroupColor,
  pulse: number,
  charge: number,
  dark: boolean,
): void {
  const { playerX, playerY } = GEOMETRY;
  const strength = (dark ? 0.2 : 0.09) * (0.72 + pulse * 0.36 + charge * 0.28);

  context.save();
  context.globalAlpha = strength;
  context.fillStyle = bloomGradient(context, color, dark);
  context.beginPath();
  context.arc(playerX, playerY, 265, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * A soft cone of light from the flower down to the target. The blurred wedge is
 * rendered once per palette and reused: a canvas blur every frame would cost
 * more than the rest of the stage put together.
 */
const beamCache = new Map<string, HTMLCanvasElement | null>();

function beamSprite(color: GroupColor, dark: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const key = `${color.join('_')}_${dark ? 'dark' : 'light'}`;
  const cached = beamCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const sprite = document.createElement('canvas');
  sprite.width = GEOMETRY.width;
  sprite.height = GEOMETRY.height;
  const context = sprite.getContext('2d');
  if (!context) {
    beamCache.set(key, null);
    return null;
  }

  const { noteX, noteY, playerX, playerY } = GEOMETRY;
  const top = noteY + 26;
  const bottom = playerY + 14;

  const gradient = context.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, rgba(color, 0));
  gradient.addColorStop(0.42, rgba(color, dark ? 0.12 : 0.06));
  gradient.addColorStop(1, rgba(color, 0));

  if (typeof context.filter === 'string') {
    context.filter = 'blur(22px)';
  }
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(noteX - 24, top);
  context.lineTo(noteX + 24, top);
  context.lineTo(playerX + 104, bottom);
  context.lineTo(playerX - 104, bottom);
  context.closePath();
  context.fill();

  beamCache.set(key, sprite);
  return sprite;
}

function drawBeam(
  context: CanvasRenderingContext2D,
  color: GroupColor,
  dark: boolean,
): void {
  const sprite = beamSprite(color, dark);
  if (sprite) {
    context.drawImage(sprite, 0, 0);
  }
}

function petalPath(context: CanvasRenderingContext2D, size: number): void {
  context.beginPath();
  context.moveTo(0, -size);
  context.bezierCurveTo(size * 0.9, -size * 0.24, size * 0.58, size * 0.82, 0, size);
  context.bezierCurveTo(-size * 0.58, size * 0.82, -size * 0.9, -size * 0.24, 0, -size);
  context.closePath();
}

function drawPetals(
  context: CanvasRenderingContext2D,
  ambience: number,
  color: GroupColor,
  dark: boolean,
): void {
  const seconds = ambience / 1000;
  const span = GEOMETRY.height + 160;

  context.save();
  for (const petal of PETALS) {
    const y = field(petal.y - seconds * petal.speed, span) - 80;
    const x = petal.x + Math.sin(seconds * petal.sway + petal.phase) * 30;
    const angle = petal.spin + Math.sin(seconds * petal.sway * 0.8 + petal.phase) * 0.55;

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.globalAlpha = petal.alpha * (dark ? 1 : 0.7);
    petalPath(context, petal.size);
    context.fillStyle = rgba(color, 0.75);
    context.fill();
    context.strokeStyle = rgba(color, 0.35);
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }
  context.restore();
}

function drawAtmosphere(
  context: CanvasRenderingContext2D,
  ambience: number,
  mood: GroupColor,
  pulse: number,
  charge: number,
  dark: boolean,
): void {
  // Lift the palette off the dark surface; keep it true on paper.
  const color = dark ? lighten(mood, 0.45) : mood;
  drawBloom(context, color, pulse, charge, dark);
  drawBeam(context, color, dark);
  drawPetals(context, ambience, color, dark);
}

function drawMikhail(
  context: CanvasRenderingContext2D,
  elapsedMs: number,
  showPress: boolean,
): void {
  const image =
    showPress && mikhailPassImage.complete && mikhailPassImage.naturalWidth > 0
      ? mikhailPassImage
      : mikhailIdleImage;

  if (!image.complete || image.naturalWidth === 0) {
    return;
  }

  const range = 2.2;
  const bob = prefersReducedMotion() ? 0 : beatOffset(elapsedMs, range);
  const width = 96;
  const height = width;

  // Let the wings extend just past the inner target now that the sprite is
  // more prominent.
  context.drawImage(
    image,
    0,
    0,
    619,
    619,
    GEOMETRY.playerX - width / 2,
    GEOMETRY.playerY - height / 2 + bob,
    width,
    height,
  );
}

/**
 * The target reads as a measuring instrument rather than a flat outline: a
 * dashed outer rail, short cardinal ticks, and a jade aperture that lifts off
 * the page with a soft halo.
 */
function drawReticle(context: CanvasRenderingContext2D, charge: number, dark: boolean): void {
  const { playerX, playerY, outerRadius, innerRadius } = GEOMETRY;
  const jade = dark ? JADE_LIGHT : JADE;

  context.save();
  context.lineCap = 'round';

  // Outer rail.
  context.lineWidth = 1;
  context.setLineDash([2, 5]);
  context.strokeStyle = ink(0.24, dark);
  context.beginPath();
  context.arc(playerX, playerY, outerRadius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  // Cardinal ticks, plus a quieter diagonal scale.
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const major = index % 2 === 0;
    const from = outerRadius + (major ? 3 : 4);
    const to = outerRadius + (major ? 11 : 7);
    context.strokeStyle = ink(major ? 0.34 : 0.16, dark);
    context.lineWidth = major ? 1.5 : 1;
    context.beginPath();
    context.moveTo(playerX + Math.cos(angle) * from, playerY + Math.sin(angle) * from);
    context.lineTo(playerX + Math.cos(angle) * to, playerY + Math.sin(angle) * to);
    context.stroke();
  }

  // Inner aperture halo, then the aperture itself.
  context.strokeStyle = rgba(jade, 0.12 + charge * 0.2);
  context.lineWidth = 7;
  context.beginPath();
  context.arc(playerX, playerY, innerRadius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = rgba(jade, 0.92);
  context.lineWidth = 1.75;
  context.beginPath();
  context.arc(playerX, playerY, innerRadius, 0, Math.PI * 2);
  context.stroke();

  // Crosshair stubs between the aperture and the rail.
  context.strokeStyle = ink(0.28, dark);
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(playerX - innerRadius - 4, playerY);
  context.lineTo(playerX - outerRadius + 2, playerY);
  context.moveTo(playerX + innerRadius + 4, playerY);
  context.lineTo(playerX + outerRadius - 2, playerY);
  context.moveTo(playerX, playerY + innerRadius + 4);
  context.lineTo(playerX, playerY + outerRadius - 2);
  context.stroke();

  context.restore();
}

/** Faint flight path from the flower down to the target. */
function drawFlightPath(
  context: CanvasRenderingContext2D,
  active: boolean,
  dark: boolean,
): void {
  const { playerX, noteY, playerY, outerRadius } = GEOMETRY;
  const top = noteY;
  const bottom = playerY - outerRadius - 16;

  const gradient = context.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, ink(0, dark));
  gradient.addColorStop(0.25, ink(active ? 0.14 : 0.07, dark));
  gradient.addColorStop(1, ink(active ? 0.16 : 0.08, dark));

  context.save();
  context.strokeStyle = gradient;
  context.lineWidth = 1;
  context.setLineDash([2, 7]);
  context.beginPath();
  context.moveTo(playerX, top);
  context.lineTo(playerX, bottom);
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

/**
 * A note ring is drawn as three concentric strokes so it reads as a glowing
 * edge without paying for a blur filter on every frame.
 */
function drawNoteRing(
  context: CanvasRenderingContext2D,
  note: VisibleNote,
  active: boolean,
  dark: boolean,
): void {
  const { noteX, noteY, height } = GEOMETRY;
  const color = dark ? lighten(note.color, 0.35) : note.color;

  context.save();
  context.lineCap = 'round';

  context.strokeStyle = rgba(color, active ? 0.14 : 0.07);
  context.lineWidth = 9;
  context.beginPath();
  context.arc(noteX, noteY, note.radius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = rgba(color, active ? 0.28 : 0.16);
  context.lineWidth = 4;
  context.beginPath();
  context.arc(noteX, noteY, note.radius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = rgba(color, active ? 1 : 0.86);
  context.lineWidth = active ? 2.5 : 1.75;
  context.beginPath();
  context.arc(noteX, noteY, note.radius, 0, Math.PI * 2);
  context.stroke();

  // Bright cap where the ring crosses the flight path, so its leading edge is
  // easy to track against the dashed guide as it closes on the target.
  const capY = noteY + note.radius;
  if (capY < height + 12) {
    context.fillStyle = rgba(color, active ? 0.95 : 0.6);
    context.beginPath();
    context.arc(noteX, capY, active ? 3 : 2, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

/** Golden bloom behind Mikhail when a note lands inside the press window. */
const pressAuraCache = new Map<boolean, CanvasGradient>();

function pressAuraGradient(
  context: CanvasRenderingContext2D,
  dark: boolean,
): CanvasGradient {
  const cached = pressAuraCache.get(dark);
  if (cached) {
    return cached;
  }

  const { playerX, playerY } = GEOMETRY;
  const gold = dark ? GOLD_LIGHT : GOLD;
  const gradient = context.createRadialGradient(playerX, playerY, 4, playerX, playerY, 96);
  gradient.addColorStop(0, rgba(gold, 1));
  gradient.addColorStop(0.55, rgba(gold, 0.37));
  gradient.addColorStop(1, rgba(gold, 0));
  pressAuraCache.set(dark, gradient);
  return gradient;
}

function drawPressAura(
  context: CanvasRenderingContext2D,
  charge: number,
  dark: boolean,
): void {
  const { playerX, playerY } = GEOMETRY;
  const gold = dark ? GOLD_LIGHT : GOLD;

  context.save();
  context.globalAlpha = 0.2 + charge * 0.14;
  context.fillStyle = pressAuraGradient(context, dark);
  context.beginPath();
  context.arc(playerX, playerY, 96, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // A charging ring that closes in on the aperture as the note comes due.
  context.save();
  context.strokeStyle = rgba(gold, 0.16 + charge * 0.5);
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(playerX, playerY, GEOMETRY.innerRadius + 34 * (1 - charge), 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawPressLabel(context: CanvasRenderingContext2D, dark: boolean): void {
  const { playerX, playerY } = GEOMETRY;
  const text = 'Press';

  context.save();
  context.font =
    '600 11px "Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  context.letterSpacing = '0.14em';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const width = context.measureText(text).width + 26;
  const height = 25;
  const x = playerX - width / 2;
  const y = playerY + 64;

  context.beginPath();
  context.roundRect(x, y, width, height, height / 2);
  context.fillStyle = dark ? 'rgba(26, 19, 29, 0.86)' : 'rgba(251, 247, 250, 0.82)';
  context.fill();
  context.strokeStyle = rgba(ROSE, 0.45);
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = dark ? '#f0b3c4' : '#7d2f45';
  context.fillText(text, playerX, y + height / 2 + 0.5);
  context.restore();
}

interface CanvasState {
  width: number;
  height: number;
  signature: string;
  lastAmbientDraw: number;
}

const canvasStates = new WeakMap<HTMLCanvasElement, CanvasState>();

/** Track the canvas box so the backing store matches what is actually shown. */
function stageState(canvas: HTMLCanvasElement): CanvasState {
  const existing = canvasStates.get(canvas);
  if (existing) {
    return existing;
  }

  const rect = canvas.getBoundingClientRect();
  const state: CanvasState = {
    width: rect.width || GEOMETRY.width,
    height: rect.height || GEOMETRY.height,
    signature: '',
    lastAmbientDraw: 0,
  };
  canvasStates.set(canvas, state);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      state.width = entry.contentRect.width;
      state.height = entry.contentRect.height;
      state.signature = '';
    });
    observer.observe(canvas);
  }

  return state;
}

function visualSignature(frame: StageFrame, state: CanvasState): string {
  const layers = frame.layers ?? DEFAULT_STAGE_LAYERS;
  const root = document.documentElement.dataset;
  return [
    frame.status,
    root.theme ?? '',
    root.effects ?? '',
    Math.round(state.width),
    Math.round(state.height),
    layers.drawFlightPath ? 1 : 0,
    layers.drawReticle ? 1 : 0,
    layers.drawMikhail ? 1 : 0,
    layers.drawPressLabel ? 1 : 0,
    prefersReducedMotion() ? 1 : 0,
  ].join('|');
}

/**
 * Draw the stage. The canvas stays transparent so the stage surface and the
 * paper glow can live in CSS behind it.
 */
export function drawStage(canvas: HTMLCanvasElement | null, frame: StageFrame): void {
  if (!canvas) {
    return;
  }

  const state = stageState(canvas);
  const effects = effectsEnabled();
  const idle = frame.status === 'idle';
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const signature = visualSignature(frame, state);
  const animateIdle = idle && effects && !prefersReducedMotion();

  // Idle and finished frames only change when something visible changes. The
  // drifting ambience is the exception, and 30 fps is plenty for petals.
  if ((idle || frame.status === 'finished') && signature === state.signature) {
    if (!animateIdle || now - state.lastAmbientDraw < 33) {
      return;
    }
  }

  const dpr = effects ? Math.min(2, Math.max(1, window.devicePixelRatio || 1)) : 1;
  const pixelWidth = Math.max(1, Math.round(state.width * dpr));
  const pixelHeight = Math.max(1, Math.round(state.height * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  // Cover-scale the 800x700 scene inside the stage; tall phones crop the sides
  // like the old CSS did, but only the visible pixels reach the backing store.
  const scale = Math.max(pixelWidth / GEOMETRY.width, pixelHeight / GEOMETRY.height);
  const offsetX = (pixelWidth - GEOMETRY.width * scale) / 2;
  const offsetY = (pixelHeight - GEOMETRY.height * scale) / 2;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  const dark = isDarkTheme();
  const layers = frame.layers ?? DEFAULT_STAGE_LAYERS;

  const running = frame.status !== 'idle';
  const pressing = running ? frame.notes.find((note) => note.press) : undefined;
  const charge = pressing
    ? Math.min(1, Math.max(0, 1 - Math.abs(pressing.dueInMs) / GEOMETRY.pressWindowMs))
    : 0;

  // The stage breathes with the song: a beat-locked pulse while running, and a
  // slower idle breath when the clock is stopped.
  const ambience = effects ? advanceAmbient(frame.status === 'paused') : 0;
  const section = findTempoSection(frame.elapsed);
  const reduced = prefersReducedMotion();

  let pulse: number;
  if (reduced) {
    pulse = 0.4;
  } else if (section === null) {
    pulse = 0.32;
  } else if (frame.status === 'running') {
    pulse = Math.pow(1 - field(beatCount(section, frame.elapsed), 1), 3);
  } else {
    pulse = 0.42 + 0.3 * Math.sin(ambience / 2400);
  }

  if (effects) {
    drawAtmosphere(context, ambience, moodColorAt(frame.elapsed), pulse, charge, dark);
  }

  if (layers.drawFlightPath) {
    drawFlightPath(context, running, dark);
  }
  if (layers.drawReticle) {
    drawReticle(context, charge, dark);
  }

  if (running) {
    context.save();
    for (const note of frame.notes) {
      drawNoteRing(context, note, note.press, dark);
    }
    context.restore();
  }

  if (pressing && effects) {
    drawPressAura(context, charge, dark);
  }

  // Draw the player above the note rings so Mikhail stays readable as a note
  // passes through the target.
  if (layers.drawMikhail) {
    drawMikhail(context, frame.elapsed, pressing !== undefined);
  }

  if (pressing && layers.drawPressLabel) {
    drawPressLabel(context, dark);
  }

  state.signature = signature;
  state.lastAmbientDraw = now;
}
