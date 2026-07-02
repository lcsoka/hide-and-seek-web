import { Component, computed, input } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameState } from '../../core/models';
import { PlayerAvatar } from '../../shared/player-avatar';

/** End-of-round (and end-of-game) screen: the reveal, who caught whom, standings, recap. */
@Component({
  selector: 'app-round-results',
  imports: [TranslocoModule, PlayerAvatar],
  templateUrl: './round-results.html',
})
export class RoundResults {
  readonly state = input.required<GameState>();
  readonly isHost = input(false);

  readonly finished = computed(() => this.state().state === 'finished');
  readonly reveal = computed(() => this.state().last_round);
  readonly standings = computed(() => this.state().standings ?? []);
  readonly winner = computed(() => this.standings()[0] ?? null);

  /** Avatar URL for a player id, resolved from the current roster (standings/reveal carry ids). */
  avatarOf(id: string | null | undefined): string | null {
    return id ? (this.state().players.find((p) => p.id === id)?.avatar ?? null) : null;
  }

  duration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
}
