import { MIKHAIL_PASS_URL, MIKHAIL_URL } from './assets';
import { beatOffset } from './beat';
import { GEOMETRY, type VisibleNote } from './timing';
import type { RunStatus } from './run';

export interface StageFrame {
  notes: readonly VisibleNote[];
  status: RunStatus;
  elapsed: number;
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
const ROSE_LIGHT: Rgb = [232, 167, 185];
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

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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
  const width = 80;
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

/** Rose bloom behind Mikhail when a note lands inside the press window. */
function drawPressAura(
  context: CanvasRenderingContext2D,
  charge: number,
  dark: boolean,
): void {
  const { playerX, playerY } = GEOMETRY;
  const rose = dark ? ROSE_LIGHT : ROSE;

  const gradient = context.createRadialGradient(playerX, playerY, 4, playerX, playerY, 96);
  gradient.addColorStop(0, rgba(rose, 0.2 + charge * 0.14));
  gradient.addColorStop(0.55, rgba(rose, 0.07 + charge * 0.06));
  gradient.addColorStop(1, rgba(rose, 0));

  context.save();
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(playerX, playerY, 96, 0, Math.PI * 2);
  context.fill();

  // A charging ring that closes in on the aperture as the note comes due.
  context.strokeStyle = rgba(rose, 0.16 + charge * 0.5);
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

/**
 * Draw the stage. The canvas stays transparent so the paper texture and the
 * flower watermark can live in CSS behind it.
 */
export function drawStage(canvas: HTMLCanvasElement | null, frame: StageFrame): void {
  if (!canvas) {
    return;
  }

  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.round(GEOMETRY.width * dpr);
  const pixelHeight = Math.round(GEOMETRY.height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const dark = isDarkTheme();

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, GEOMETRY.width, GEOMETRY.height);

  const running = frame.status !== 'idle';
  const pressing = running ? frame.notes.find((note) => note.press) : undefined;
  const charge = pressing
    ? Math.min(1, Math.max(0, 1 - Math.abs(pressing.dueInMs) / GEOMETRY.pressWindowMs))
    : 0;

  drawFlightPath(context, running, dark);
  // drawReticle(context, charge, dark);

  if (running) {
    context.save();
    for (const note of frame.notes) {
      drawNoteRing(context, note, note.press, dark);
    }
    context.restore();
  }

  if (pressing) {
    drawPressAura(context, charge, dark);
  }

  // Draw the player above the note rings so Mikhail stays readable as a note
  // passes through the target.
  drawMikhail(context, frame.elapsed, pressing !== undefined);

  if (pressing) {
    drawPressLabel(context, dark);
  }
}
