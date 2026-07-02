import { Component, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';
import { PlayerAvatar } from '../../shared/player-avatar';

/** Role assignment: the host picks which player hides (or rolls a random one). */
@Component({
  selector: 'app-host-panel',
  imports: [TranslocoModule, PlayerAvatar],
  templateUrl: './host-panel.html',
})
export class HostPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly busy = signal(false);

  async assign(playerId: string | null): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.submitAction(this.sessionId(), 'assign_hider', playerId ? { player_id: playerId } : {});
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
