import { Injectable, signal } from '@angular/core';

/** A shared, once-per-second ticking clock for live countdowns (curse timers, etc.). */
@Injectable({ providedIn: 'root' })
export class Clock {
  readonly nowMs = signal(Date.now());

  constructor() {
    setInterval(() => this.nowMs.set(Date.now()), 1000);
  }
}

/** Format whole seconds as `m:ss` (clamped at zero). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
