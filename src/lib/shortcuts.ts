export interface KeyLike {
  code: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export type ShortcutAction =
  | { type: 'toggle-run' }
  | { type: 'reset-run' }
  | { type: 'undo-remove' }
  | { type: 'remove-next' }
  | { type: 'nudge-last'; delta: number }
  | { type: 'nudge-next'; delta: number }
  | { type: 'shift-all'; delta: number }
  | { type: 'nudge-clock'; delta: number }
  | { type: 'hold'; direction: 'slow' | 'fast'; active: boolean }
  | { type: 'help' };

/**
 * Map a keyboard event to the helper's action vocabulary. Modifier precedence
 * follows the source: Ctrl (or Meta) wins over Shift, then plain keys.
 */
export function resolveShortcut(
  event: KeyLike,
  phase: 'keydown' | 'keyup' = 'keydown',
): ShortcutAction | null {
  const ctrl = Boolean(event.ctrlKey || event.metaKey);
  const shift = Boolean(event.shiftKey);

  if (phase === 'keyup') {
    if (event.code === 'ArrowUp') {
      return { type: 'hold', direction: 'slow', active: false };
    }
    if (event.code === 'ArrowDown') {
      return { type: 'hold', direction: 'fast', active: false };
    }
    return null;
  }

  // Leave Alt-based browser navigation (back/forward) alone.
  if (event.altKey) {
    return null;
  }

  if (!ctrl && event.key === '?') {
    return { type: 'help' };
  }

  if (ctrl) {
    switch (event.code) {
      case 'KeyZ':
        return { type: 'undo-remove' };
      case 'ArrowLeft':
        return { type: 'nudge-next', delta: 50 };
      case 'ArrowRight':
        return { type: 'nudge-next', delta: -50 };
      case 'ArrowUp':
        return { type: 'nudge-clock', delta: -50 };
      case 'ArrowDown':
        return { type: 'nudge-clock', delta: 50 };
      default:
        return null;
    }
  }

  if (shift) {
    switch (event.code) {
      case 'ArrowLeft':
        return { type: 'shift-all', delta: 50 };
      case 'ArrowRight':
        return { type: 'shift-all', delta: -50 };
      default:
        return null;
    }
  }

  switch (event.code) {
    case 'Space':
      return { type: 'toggle-run' };
    case 'KeyR':
      return { type: 'reset-run' };
    case 'KeyY':
      return { type: 'remove-next' };
    case 'ArrowLeft':
      return { type: 'nudge-last', delta: 50 };
    case 'ArrowRight':
      return { type: 'nudge-last', delta: -50 };
    case 'ArrowUp':
      return { type: 'hold', direction: 'slow', active: true };
    case 'ArrowDown':
      return { type: 'hold', direction: 'fast', active: true };
    default:
      return null;
  }
}
