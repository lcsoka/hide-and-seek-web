import { Injectable, signal } from '@angular/core';

/** A shared, once-per-second ticking clock for live countdowns (curse timers, etc.). */
@Injectable({ providedIn: 'root' })
export class Clock {
  readonly nowMs = signal(Date.now());

  constructor() {
    setInterval(() => this.nowMs.set(Date.now()), 1000);
  }
}

/** Format whole seconds as `m:ss`, or `h:mm:ss` once the time reaches an hour (clamped at zero). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
