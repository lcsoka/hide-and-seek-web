import { Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameTimer } from '../../core/services/game-timer.model';
import { Icon } from '../../shared/icon';
import { LangToggle } from '../../shared/lang-toggle';
import { HowToPlay } from './how-to-play';

/** Floating HUD: leave button, copyable invite code, the phase timer, role badge, help, and
 *  (host only) the single End-game control — confirmed by the shell. */
@Component({
  selector: 'app-game-hud',
  imports: [RouterLink, TranslocoModule, LangToggle, HowToPlay, Icon],
  templateUrl: './game-hud.html',
})
export class GameHud {
  readonly joinCode = input.required<string>();
  readonly timer = input<GameTimer | null>(null);
  readonly role = input<string | null>(null);
  readonly stateLabel = input('');
  readonly calculating = input(false); // hiding-zone (stations + carve) being fetched
  readonly canEndGame = input(false); // host, mid-game — show the End-game control
  readonly endGame = output<void>();
  readonly copied = signal(false);
  readonly helpOpen = signal(false);

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
