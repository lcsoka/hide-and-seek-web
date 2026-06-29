import { Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameTimer } from '../../core/util/game-timer';
import { LangToggle } from '../../shared/lang-toggle';

/** Floating HUD: leave button, copyable invite code, the phase timer, and the role badge. */
@Component({
  selector: 'app-game-hud',
  imports: [RouterLink, TranslocoModule, LangToggle],
  templateUrl: './game-hud.html',
})
export class GameHud {
  readonly joinCode = input.required<string>();
  readonly timer = input<GameTimer | null>(null);
  readonly role = input<string | null>(null);
  readonly stateLabel = input('');
  readonly calculating = input(false); // hiding-zone (stations + carve) being fetched
  readonly copied = signal(false);

  async copy(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.joinCode());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }
}
