import { Injectable } from '@angular/core';

/** Remembers which player this client is, per session (set on create/join). A `?player=`
 *  URL param overrides it for this app instance — lets a dev iframe/window act as a
 *  specific player (paired with `?token=`; see TokenStore). */
@Injectable({ providedIn: 'root' })
export class PlayerStore {
  private readonly urlPlayer = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('player');

  set(sessionId: string, playerId: string): void {
    localStorage.setItem(this.key(sessionId), playerId);
  }

  get(sessionId: string): string | null {
    return this.urlPlayer ?? localStorage.getItem(this.key(sessionId));
  }

  private key(sessionId: string): string {
    return `jl_player_${sessionId}`;
  }
}
