import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GodView } from '../models';

/**
 * Client for the developer/debug API (gated by EnsureDebugAccess on the backend).
 * Every endpoint returns the unfiltered god view, so callers refresh state from the
 * response. The X-Developer-Token must match the backend GAME_DEBUG_TOKEN.
 */
@Injectable({ providedIn: 'root' })
export class DebugApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  private get options() {
    return { headers: new HttpHeaders({ 'X-Developer-Token': environment.developerToken }) };
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
}
