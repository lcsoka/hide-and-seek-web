import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../shared/icon';

/**
 * Presentational transport bar for the replay: play/pause, a time slider over the game's
 * [t0, t1] window, the current clock + elapsed offset, and playback-speed chips. Holds no
 * state — the parent owns the playhead and drives the map; this only reflects and emits.
 */
@Component({
  selector: 'app-replay-scrubber',
  imports: [Icon],
  templateUrl: './replay-scrubber.html',
})
export class ReplayScrubber {
  readonly t0 = input.required<number>();
  readonly t1 = input.required<number>();
  readonly playhead = input.required<number>();
  readonly playing = input.required<boolean>();
  readonly speed = input.required<number>();

  readonly seek = output<number>();
  readonly toggle = output<void>();
  readonly speedChange = output<number>();

  readonly speeds = [30, 60, 120, 300];

  /** Seconds elapsed since the game's first event, as m:ss. */
  readonly elapsed = computed(() => {
    const s = Math.max(0, Math.round(this.playhead() - this.t0()));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  });

  onSeek(e: Event): void {
    this.seek.emit(Number((e.target as HTMLInputElement).value));
  }

  /** Wall clock hh:mm:ss for a unix timestamp (seconds). */
  clock(at: number): string {
    if (!at) {
      return '';
    }
    const d = new Date(at * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}
