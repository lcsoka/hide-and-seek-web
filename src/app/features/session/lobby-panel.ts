import { Component, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameState } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';
import { PlayerAvatar } from '../../shared/player-avatar';
import { PushNudge } from '../../shared/push-nudge';
import { Icon } from '../../shared/icon';

/** Pre-game waiting room: roster + the host's start button. */
@Component({
  selector: 'app-lobby-panel',
  imports: [TranslocoModule, PlayerAvatar, PushNudge, Icon],
  templateUrl: './lobby-panel.html',
})
export class LobbyPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly isHost = input(false);
  readonly busy = signal(false);
  readonly copied = signal(false);

  /** A shareable link that drops the invitee straight onto the join screen with the code filled. */
  private inviteLink(): string {
    return `${location.origin}/join/${this.state().join_code}`;
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.inviteLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // clipboard blocked — the code is shown next to the button as a fallback
    }
  }

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
