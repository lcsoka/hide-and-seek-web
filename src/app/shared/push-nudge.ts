import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { Push } from '../core/services/push';

const DISMISS_KEY = 'jl_push_nudge_dismissed';

/**
 * Contextual "turn on notifications" prompt. Shows only where push is usable and not yet enabled or
 * blocked — the lobby is the natural home, since that's the last moment the app is guaranteed to be
 * in the foreground before players start backgrounding it mid-game.
 */
@Component({
  selector: 'app-push-nudge',
  imports: [TranslocoModule],
  templateUrl: './push-nudge.html',
})
export class PushNudge {
  readonly push = inject(Push);
  /** Slim pill layout for the in-game HUD (vs the full card used in the lobby). */
  readonly compact = input(false);
  private readonly dismissed = signal(this.readDismissed());

  readonly visible = computed(() => this.push.supported && !this.dismissed() && !this.push.enabled() && this.push.permission() !== 'denied');

  async enable(): Promise<void> {
    await this.push.enable();
  }

  dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage blocked — hide for this session only
    }
    this.dismissed.set(true);
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}
