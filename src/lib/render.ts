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

function colorToCss(color: readonly [number, number, number]): string {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`;
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

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const range = 2.2;
  const bob = reduceMotion ? 0 : beatOffset(elapsedMs, range);
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
 * Draw the original expanding-ring stage. The canvas is transparent so the
 * paper texture and flower watermark can live in CSS behind it.
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

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, GEOMETRY.width, GEOMETRY.height);

  const { playerX, playerY, outerRadius, innerRadius } = GEOMETRY;

  context.save();
  context.lineWidth = 1;
  context.strokeStyle = '#00000033';
  context.beginPath();
  context.arc(playerX, playerY, outerRadius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = '#008000';
  context.beginPath();
  context.arc(playerX, playerY, innerRadius, 0, Math.PI * 2);
  context.stroke();

  context.lineWidth = 2;
  context.strokeStyle = '#00000033';
  context.beginPath();
  context.moveTo(playerX - outerRadius + 1, playerY);
  context.lineTo(playerX - innerRadius, playerY);
  context.moveTo(playerX + innerRadius, playerY);
  context.lineTo(playerX + outerRadius, playerY);
  context.moveTo(playerX, playerY + innerRadius);
  context.lineTo(playerX, playerY + outerRadius);
  context.stroke();
  context.restore();

  if (frame.status !== 'idle') {
    context.save();
    context.lineWidth = 4;
    for (const note of frame.notes) {
      context.strokeStyle = colorToCss(note.color);
      context.beginPath();
      context.arc(GEOMETRY.noteX, GEOMETRY.noteY, note.radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  const showPress =
    frame.status !== 'idle' && frame.notes.some((note) => note.press);

  // Draw the player above the note rings so Mikhail stays readable as a note
  // passes through the target.
  drawMikhail(context, frame.elapsed, showPress);

  if (showPress) {
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#8E3A52';
    context.font = '600 29px "Bodoni MT", Didot, "Palatino Linotype", Georgia, serif';
    context.fillText('Press', playerX, playerY + 80);
    context.restore();
  }
}
