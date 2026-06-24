import { inject, Injectable } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '../../../environments/environment';
import { TokenStore } from './token-store';

const SESSION_EVENTS = [
  'RoundStarted', 'HidingStarted', 'SeekingStarted', 'QuestionAsked', 'QuestionAnswered',
  'CursePlayed', 'EndgameTriggered', 'HiderFound', 'GuessMissed', 'RoundEnded', 'GameEnded', 'LocationUpdated',
];

/**
 * Laravel Echo + pusher-js pointed at Reverb. Subscribes to the session presence
 * channel (everyone events) and the player's private channel (player-scoped events).
 * Typed loosely (`any`) to avoid laravel-echo v2 generic friction; behaviour is
 * verified against a running Reverb server.
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly tokens = inject(TokenStore);
  private echo: any = null;

  connect(sessionId: string, playerId: string | null, onEvent: (name: string) => void): void {
    if (!this.echo) {
      (window as any).Pusher = Pusher;
      this.echo = new (Echo as any)({
        broadcaster: 'reverb',
        key: environment.reverb.key,
        wsHost: environment.reverb.host,
        wsPort: environment.reverb.port,
        wssPort: environment.reverb.port,
        forceTLS: environment.reverb.scheme === 'wss',
        enabledTransports: ['ws', 'wss'],
        authEndpoint: `${environment.apiBase}/broadcasting/auth`,
        auth: { headers: { Authorization: `Bearer ${this.tokens.token()}` } },
      });
    }

    const presence = this.echo.join(`session.${sessionId}`);
    for (const name of SESSION_EVENTS) {
      presence.listen(`.${name}`, () => onEvent(name));
    }

    if (playerId) {
      this.echo.private(`session.${sessionId}.player.${playerId}`)
        .listen('.HidingZoneChosen', () => onEvent('HidingZoneChosen'));
    }
  }

  disconnect(): void {
    this.echo?.leaveAllChannels?.();
  }
}
