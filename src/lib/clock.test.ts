import { describe, expect, it } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  it('tracks elapsed time from an anchor', () => {
    const clock = new Clock();
    clock.start(1000);
    expect(clock.elapsed(1000)).toBe(0);
    expect(clock.elapsed(1500)).toBe(500);
    expect(clock.isRunning()).toBe(true);
  });

  it('freezes while paused and resumes without losing time', () => {
    const clock = new Clock();
    clock.start(1000);
    clock.pause(2000);
    expect(clock.elapsed(2000)).toBe(1000);
    expect(clock.elapsed(9000)).toBe(1000);
    expect(clock.isRunning()).toBe(false);

    clock.resume(9000);
    expect(clock.elapsed(9500)).toBe(1500);
  });

  it('nudges in both directions and clamps at zero', () => {
    const clock = new Clock();
    clock.start(0);
    expect(clock.elapsed(1000)).toBe(1000);

    clock.nudge(1000, -300);
    expect(clock.elapsed(1000)).toBe(700);
    expect(clock.elapsed(2000)).toBe(1700);

    clock.nudge(2000, 500);
    expect(clock.elapsed(2000)).toBe(2200);

    clock.nudge(2000, -99_000);
    expect(clock.elapsed(2000)).toBe(0);
  });

  it('allows nudging while paused', () => {
    const clock = new Clock();
    clock.start(0);
    clock.pause(1000);
    clock.nudge(2000, -50);
    expect(clock.elapsed(3000)).toBe(950);
  });

  it('resets to idle', () => {
    const clock = new Clock();
    clock.start(1000);
    clock.reset();
    expect(clock.elapsed(5000)).toBe(0);
    expect(clock.isRunning()).toBe(false);
  });

  it('applies slow and fast holds only while running', () => {
    const clock = new Clock();
    clock.start(0);

    clock.applyHold(1000, 1000, true, false);
    expect(clock.elapsed(1000)).toBe(880);
    expect(clock.elapsed(2000)).toBe(1880);

    clock.applyHold(2000, 1000, false, true);
    expect(clock.elapsed(2000)).toBe(2060);

    clock.applyHold(2000, 1000, true, true);
    expect(clock.elapsed(2000)).toBe(2240);

    clock.pause(2240);
    const frozen = clock.elapsed(5000);
    clock.applyHold(5000, 1000, false, true);
    expect(clock.elapsed(5000)).toBe(frozen);
  });
});
