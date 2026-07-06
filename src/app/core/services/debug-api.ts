import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GodView } from '../models';
import { DevMode } from './dev-mode';

/** A grantable card in the dev card-tester. */
export interface DebugCard {
  id: string;
  type: string;
  name: string;
  power: string | null;
}

/**
 * Client for the developer/debug API (gated by EnsureDebugAccess on the backend).
 * Every endpoint returns the unfiltered god view, so callers refresh state from the
 * response. The X-Developer-Token must match the backend GAME_DEBUG_TOKEN.
 */
@Injectable({ providedIn: 'root' })
export class DebugApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;
  private readonly dev = inject(DevMode);

  private get options() {
    return { headers: new HttpHeaders({ 'X-Developer-Token': this.dev.token }) };
  }

  state(id: string): Promise<GodView> {
    return firstValueFrom(this.http.get<GodView>(`${this.base}/sessions/${id}/debug/state`, this.options));
  }

  actAs(id: string, playerId: string, type: string, payload: Record<string, unknown> = {}): Promise<GodView> {
    return firstValueFrom(
      this.http.post<GodView>(`${this.base}/sessions/${id}/debug/act-as`, { player_id: playerId, type, payload }, this.options),
    );
  }

  spoofLocation(id: string, playerId: string, lat: number, lng: number): Promise<GodView> {
    return firstValueFrom(
      this.http.post<GodView>(`${this.base}/sessions/${id}/debug/location`, { player_id: playerId, lat, lng }, this.options),
    );
  }

  seedPlayers(id: string, count: number): Promise<GodView> {
    return firstValueFrom(this.http.post<GodView>(`${this.base}/sessions/${id}/debug/seed-players`, { count }, this.options));
  }

  forceState(id: string, state: string, stateData?: Record<string, unknown>): Promise<GodView> {
    return firstValueFrom(
      this.http.post<GodView>(`${this.base}/sessions/${id}/debug/state`, { state, state_data: stateData }, this.options),
    );
  }

  expireTimer(id: string, key: string): Promise<GodView> {
    return firstValueFrom(this.http.post<GodView>(`${this.base}/sessions/${id}/debug/timer/${key}/expire`, {}, this.options));
  }

  /** Every grantable card, for the dev card-tester. */
  cards(id: string): Promise<DebugCard[]> {
    return firstValueFrom(this.http.get<DebugCard[]>(`${this.base}/sessions/${id}/debug/cards`, this.options));
  }

  /** Drop a card into the hider's hand (test-any-card). */
  giveCard(id: string, cardId: string): Promise<GodView> {
    return firstValueFrom(this.http.post<GodView>(`${this.base}/sessions/${id}/debug/give-card`, { card_id: cardId }, this.options));
  }
}
