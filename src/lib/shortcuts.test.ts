import { describe, expect, it } from 'vitest';
import { resolveShortcut, type KeyLike } from './shortcuts';

function key(code: string, overrides: Partial<KeyLike> = {}): KeyLike {
  return { code, key: '', ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

describe('resolveShortcut', () => {
  it('maps transport keys', () => {
    expect(resolveShortcut(key('Space', { key: ' ' }))).toEqual({ type: 'toggle-run' });
    expect(resolveShortcut(key('KeyR'))).toEqual({ type: 'reset-run' });
  });

  it('maps last-note nudges', () => {
    expect(resolveShortcut(key('ArrowLeft'))).toEqual({ type: 'nudge-last', delta: 50 });
    expect(resolveShortcut(key('ArrowRight'))).toEqual({ type: 'nudge-last', delta: -50 });
  });

  it('maps next-note and clock controls with Ctrl or Meta', () => {
    expect(resolveShortcut(key('ArrowLeft', { ctrlKey: true }))).toEqual({
      type: 'nudge-next',
      delta: 50,
    });
    expect(resolveShortcut(key('ArrowRight', { metaKey: true }))).toEqual({
      type: 'nudge-next',
      delta: -50,
    });
    expect(resolveShortcut(key('ArrowUp', { ctrlKey: true }))).toEqual({
      type: 'nudge-clock',
      delta: -50,
    });
    expect(resolveShortcut(key('ArrowDown', { ctrlKey: true }))).toEqual({
      type: 'nudge-clock',
      delta: 50,
    });
  });

  it('maps shift-all nudges', () => {
    expect(resolveShortcut(key('ArrowLeft', { shiftKey: true }))).toEqual({
      type: 'shift-all',
      delta: 50,
    });
    expect(resolveShortcut(key('ArrowRight', { shiftKey: true }))).toEqual({
      type: 'shift-all',
      delta: -50,
    });
  });

  it('gives Ctrl precedence over Shift', () => {
    expect(resolveShortcut(key('ArrowLeft', { ctrlKey: true, shiftKey: true }))).toEqual({
      type: 'nudge-next',
      delta: 50,
    });
  });

  it('maps removal, undo, and help', () => {
    expect(resolveShortcut(key('KeyY'))).toEqual({ type: 'remove-next' });
    expect(resolveShortcut(key('KeyZ', { ctrlKey: true }))).toEqual({ type: 'undo-remove' });
    expect(resolveShortcut(key('Slash', { key: '?', shiftKey: true }))).toEqual({ type: 'help' });
  });

  it('maps held arrows and releases them on keyup', () => {
    expect(resolveShortcut(key('ArrowUp'))).toEqual({
      type: 'hold',
      direction: 'slow',
      active: true,
    });
    expect(resolveShortcut(key('ArrowDown'))).toEqual({
      type: 'hold',
      direction: 'fast',
      active: true,
    });
    expect(resolveShortcut(key('ArrowUp'), 'keyup')).toEqual({
      type: 'hold',
      direction: 'slow',
      active: false,
    });
    expect(resolveShortcut(key('ArrowDown'), 'keyup')).toEqual({
      type: 'hold',
      direction: 'fast',
      active: false,
    });
    expect(resolveShortcut(key('KeyR'), 'keyup')).toBeNull();
  });

  it('ignores unmatched or modified combinations', () => {
    expect(resolveShortcut(key('KeyY', { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(key('Space', { key: ' ', shiftKey: true }))).toBeNull();
    expect(resolveShortcut(key('KeyA'))).toBeNull();
    expect(resolveShortcut(key('ArrowLeft', { altKey: true }))).toBeNull();
    expect(resolveShortcut(key('ArrowLeft', { ctrlKey: true }), 'keyup')).toBeNull();
  });
});
