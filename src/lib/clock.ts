import { holdDelta } from './timing';

/**
 * Elapsed-time clock anchored to a monotonic timestamp. Because the base time
 * is derived from `now - anchor`, a throttled or hidden tab catches up
 * correctly when it becomes visible again, matching the original's wall-clock
 * behavior.
 */
export class Clock {
  private anchorAt = 0;
  private elapsedAtAnchor = 0;
  private running = false;

  start(now: number): void {
    this.anchorAt = now;
    this.elapsedAtAnchor = 0;
    this.running = true;
  }

  pause(now: number): void {
    if (!this.running) {
      return;
    }
    this.elapsedAtAnchor = this.elapsed(now);
    this.running = false;
  }

  resume(now: number): void {
    if (this.running) {
      return;
    }
    this.anchorAt = now;
    this.running = true;
  }

  reset(): void {
    this.anchorAt = 0;
    this.elapsedAtAnchor = 0;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  elapsed(now: number): number {
    if (!this.running) {
      return this.elapsedAtAnchor;
    }
    return Math.max(0, this.elapsedAtAnchor + (now - this.anchorAt));
  }

  /** Move the clock without changing whether it is running. */
  nudge(now: number, deltaMs: number): number {
    if (Number.isFinite(deltaMs)) {
      this.elapsedAtAnchor = Math.max(0, this.elapsed(now) + deltaMs);
      this.anchorAt = now;
    }
    return this.elapsedAtAnchor;
  }

  /** Apply one frame of hold-to-slow/fast, if the clock is running. */
  applyHold(now: number, dtMs: number, slow: boolean, fast: boolean): number {
    if (!this.running) {
      return this.elapsedAtAnchor;
    }
    return this.nudge(now, holdDelta(dtMs, slow, fast));
  }
}
