import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { GameState, GuestAuth, PlayerView, SessionSummary } from './models';

/**
 * Typed wrapper over the REST contract. Reads use `httpResource` (signals);
 * commands use `HttpClient`. The Sanctum token is attached by authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  guest(displayName?: string): Promise<GuestAuth> {
    return firstValueFrom(this.http.post<GuestAuth>(`${this.base}/auth/guest`, { display_name: displayName }));
  }

  createSession(body: {
    city: string;
    game_size: string;
    game_mode?: string;
    display_name?: string;
    config?: Record<string, unknown>;
  }): Promise<SessionSummary> {
    return firstValueFrom(this.http.post<SessionSummary>(`${this.base}/sessions`, body));
  }

  join(code: string, displayName: string): Promise<{ player: PlayerView; session: SessionSummary }> {
    return firstValueFrom(
      this.http.post<{ player: PlayerView; session: SessionSummary }>(`${this.base}/sessions/${code}/join`, { display_name: displayName }),
    );
  }

  start(id: string): Promise<GameState> {
    return firstValueFrom(this.http.post<GameState>(`${this.base}/sessions/${id}/start`, {}));
  }

  submitAction(id: string, type: string, payload: Record<string, unknown> = {}): Promise<GameState> {
    return firstValueFrom(this.http.post<GameState>(`${this.base}/sessions/${id}/actions`, { type, payload }));
  }

  reportLocation(id: string, lat: number, lng: number): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/sessions/${id}/location`, { lat, lng }));
  }

  /** Reactive, visibility-filtered game state, keyed on the session id signal. */
  stateResource(sessionId: Signal<string | undefined>) {
    return httpResource<GameState>(() => {
      const id = sessionId();

      return id ? `${this.base}/sessions/${id}/state` : undefined;
    });
  }
}
