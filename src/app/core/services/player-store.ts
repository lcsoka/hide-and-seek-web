import { Injectable } from '@angular/core';

/** Remembers which player this client is, per session (set on create/join). */
@Injectable({ providedIn: 'root' })
export class PlayerStore {
  set(sessionId: string, playerId: string): void {
    localStorage.setItem(this.key(sessionId), playerId);
  }

  get(sessionId: string): string | null {
    return localStorage.getItem(this.key(sessionId));
  }

  private key(sessionId: string): string {
    return `jl_player_${sessionId}`;
  }
}
