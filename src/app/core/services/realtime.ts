import { inject, Injectable, signal } from '@angular/core';
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
 *
 * Tracks the socket connection state so the UI can show a "reconnecting" banner, and
 * fires `onReconnect` when the socket comes back after a drop (backgrounded tab / locked
 * phone) so the store can replay missed events + re-hydrate.
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly tokens = inject(TokenStore);
  private echo: any = null;
  private joined: string | null = null;
  private onReconnect: (() => void) | null = null;

  /** True while the WebSocket is live; false during connecting/unavailable/disconnected. */
  readonly connected = signal(false);
  /** True once we've connected at least once — lets the UI show a "reconnecting" banner
   *  only after a real drop, not during the initial connect. */
  readonly everConnected = signal(false);

  connect(
    sessionId: string,
    playerId: string | null,
    onEvent: (name: string, data?: unknown) => void,
    onReconnect?: () => void,
  ): void {
    this.onReconnect = onReconnect ?? null;

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
      this.bindConnectionState();
    }

    // The store is a singleton; don't double-subscribe to the same session.
    if (this.joined === sessionId) {
      return;
    }
    this.joined = sessionId;

    const fire = (event: string, data?: unknown) => {
      if (!event.startsWith('pusher:')) {
        onEvent(event.replace(/^\./, ''), data);
      }
    };

    this.echo.join(`session.${sessionId}`).listenToAll((event: string, data: unknown) => fire(event, data));

    if (playerId) {
      this.echo.private(`session.${sessionId}.player.${playerId}`).listenToAll((event: string, data: unknown) => fire(event, data));
    }
  }

  /** Watch the pusher-js connection: reflect it in `connected`, and fire onReconnect when the
   *  socket recovers after a drop (the first connect is the initial one, not a reconnect). */
  private bindConnectionState(): void {
    const connection = this.echo?.connector?.pusher?.connection;
    if (!connection?.bind) {
      return;
    }
    connection.bind('state_change', ({ current }: { current: string }) => {
      const isConnected = current === 'connected';
      this.connected.set(isConnected);
      if (isConnected) {
        if (this.everConnected()) {
          this.onReconnect?.(); // recovered after a drop — replay what we missed
        }
        this.everConnected.set(true);
      }
    });
  }

  disconnect(): void {
    this.echo?.leaveAllChannels?.();
    this.joined = null;
  }
}
