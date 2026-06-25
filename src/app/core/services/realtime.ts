import { inject, Injectable } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '../../../environments/environment';
import { TokenStore } from './token-store';

/**
 * Laravel Echo + pusher-js pointed at Reverb. Joins the session presence channel
 * (everyone events) and the player's private channel (player-scoped events), and
 * listens to ALL events so every server-authoritative change re-hydrates the store
 * — no event allowlist to keep in sync. Typed loosely (`any`) to avoid laravel-echo
 * v2 generic friction.
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly tokens = inject(TokenStore);
  private echo: any = null;
  private joined: string | null = null;

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

    // The store is a singleton; don't double-subscribe to the same session.
    if (this.joined === sessionId) {
      return;
    }
    this.joined = sessionId;

    const fire = (event: string) => {
      if (!event.startsWith('pusher:')) {
        onEvent(event.replace(/^\./, ''));
      }
    };

    this.echo.join(`session.${sessionId}`).listenToAll((event: string) => fire(event));

    if (playerId) {
      this.echo.private(`session.${sessionId}.player.${playerId}`).listenToAll((event: string) => fire(event));
    }
  }

  disconnect(): void {
    this.echo?.leaveAllChannels?.();
    this.joined = null;
  }
}
