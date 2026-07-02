import { Component, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';
import { PlayerAvatar } from '../../shared/player-avatar';

/** Pre-game waiting room: roster + the host's start button. */
@Component({
  selector: 'app-lobby-panel',
  imports: [TranslocoModule, PlayerAvatar],
  templateUrl: './lobby-panel.html',
})
export class LobbyPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly isHost = input(false);
  readonly busy = signal(false);

  async start(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.start(this.sessionId());
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
