import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurseCatalogItem, GameState, GuestAuth, PlayerView, Profile, QuestionCatalogItem, SessionSummary } from '../models/models';

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

  /** Promote the current guest to a registered account (email + password). */
  register(body: { email: string; password: string; name?: string }): Promise<Profile> {
    return firstValueFrom(this.http.post<Profile>(`${this.base}/auth/register`, body));
  }

  login(email: string, password: string): Promise<Profile & { token: string }> {
    return firstValueFrom(this.http.post<Profile & { token: string }>(`${this.base}/auth/login`, { email, password }));
  }

  logout(): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/auth/logout`, {}));
  }

  me(): Promise<Profile> {
    return firstValueFrom(this.http.get<Profile>(`${this.base}/auth/me`));
  }

  updateProfile(body: { name?: string }): Promise<Profile> {
    return firstValueFrom(this.http.patch<Profile>(`${this.base}/profile`, body));
  }

  uploadAvatar(file: File): Promise<Profile> {
    const form = new FormData();
    form.append('image', file);

    return firstValueFrom(this.http.post<Profile>(`${this.base}/profile/avatar`, form));
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

  /** Upload an in-game image (photo answer, curse proof); returns its public URL. */
  uploadMedia(id: string, file: File): Promise<{ path: string; url: string }> {
    const form = new FormData();
    form.append('image', file);

    return firstValueFrom(this.http.post<{ path: string; url: string }>(`${this.base}/sessions/${id}/media`, form));
  }

  questionsCatalog(): Promise<QuestionCatalogItem[]> {
    return firstValueFrom(this.http.get<QuestionCatalogItem[]>(`${this.base}/questions`));
  }

  cursesCatalog(): Promise<CurseCatalogItem[]> {
    return firstValueFrom(this.http.get<CurseCatalogItem[]>(`${this.base}/curses`));
  }

  /** Missed broadcast events after a cursor, for reconnect catch-up. */
  eventsSince(id: string, since: number): Promise<{ events: { seq: number; type: string; payload: Record<string, unknown> }[]; cursor: number }> {
    return firstValueFrom(
      this.http.get<{ events: { seq: number; type: string; payload: Record<string, unknown> }[]; cursor: number }>(
        `${this.base}/sessions/${id}/events`,
        { params: { since } },
      ),
    );
  }

  /** Reactive, visibility-filtered game state, keyed on the session id signal. */
  stateResource(sessionId: Signal<string | undefined>) {
    return httpResource<GameState>(() => {
      const id = sessionId();

      return id ? `${this.base}/sessions/${id}/state` : undefined;
    });
  }
}
