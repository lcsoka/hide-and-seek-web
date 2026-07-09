import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActiveSession, CityOption, CurseCatalogItem, CustomCurse, CustomQuestion, DeckCard, GameState, GuestAuth, PlayerView, Profile, ProfileStats, QuestionCatalogItem, SessionSummary } from '../models';
import { TokenStore } from './token-store';

/**
 * Typed wrapper over the REST contract. Reads use `httpResource` (signals);
 * commands use `HttpClient`. The Sanctum token is attached by authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
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

  forgotPassword(email: string): Promise<{ message: string }> {
    return firstValueFrom(this.http.post<{ message: string }>(`${this.base}/auth/forgot-password`, { email }));
  }

  resetPassword(body: { token: string; email: string; password: string }): Promise<{ message: string }> {
    return firstValueFrom(this.http.post<{ message: string }>(`${this.base}/auth/reset-password`, body));
  }

  me(): Promise<Profile> {
    return firstValueFrom(this.http.get<Profile>(`${this.base}/auth/me`));
  }

  profileStats(): Promise<ProfileStats> {
    return firstValueFrom(this.http.get<ProfileStats>(`${this.base}/profile/stats`));
  }

  updateProfile(body: { name?: string }): Promise<Profile> {
    return firstValueFrom(this.http.patch<Profile>(`${this.base}/profile`, body));
  }

  uploadAvatar(file: File): Promise<Profile> {
    const form = new FormData();
    form.append('image', file);

    return firstValueFrom(this.http.post<Profile>(`${this.base}/profile/avatar`, form));
  }

  /** GDPR: permanently delete the account. Registered users must pass their password. */
  deleteAccount(password?: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.base}/profile`, { body: password ? { password } : {} }));
  }

  // ── Web Push ──────────────────────────────────────────────────────────────
  pushPublicKey(): Promise<{ key: string | null }> {
    return firstValueFrom(this.http.get<{ key: string | null }>(`${this.base}/push/public-key`));
  }

  pushSubscribe(body: { endpoint: string; keys: { p256dh: string; auth: string }; locale: string }): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/push/subscribe`, body));
  }

  pushUnsubscribe(endpoint: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/push/unsubscribe`, { endpoint }));
  }

  /** Player feedback — a bug report or suggestion. Public endpoint (no auth required). */
  sendFeedback(body: { type: 'bug' | 'suggestion'; message: string; contact?: string; context?: Record<string, unknown> }): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.base}/feedback`, body));
  }

  /** The user's still-live games, for the landing "resume" list. */
  mySessions(): Promise<ActiveSession[]> {
    return firstValueFrom(this.http.get<ActiveSession[]>(`${this.base}/my/sessions`));
  }

  createSession(body: {
    city: string;
    game_size?: string; // ignored by the server (size is tied to the city) — kept for back-compat
    game_mode?: string;
    display_name?: string;
    config?: Record<string, unknown>;
  }): Promise<SessionSummary> {
    return firstValueFrom(this.http.post<SessionSummary>(`${this.base}/sessions`, body));
  }

  /** Playable cities for the new-game wizard (image, size, transit modes). */
  cities(): Promise<CityOption[]> {
    return firstValueFrom(this.http.get<CityOption[]>(`${this.base}/cities`));
  }

  /** The full hider deck the host can curate (official + own custom); requires auth. */
  deck(): Promise<DeckCard[]> {
    return firstValueFrom(this.http.get<DeckCard[]>(`${this.base}/deck`));
  }

  join(code: string, displayName: string): Promise<{ player: PlayerView; session: SessionSummary }> {
    return firstValueFrom(
      this.http.post<{ player: PlayerView; session: SessionSummary }>(`${this.base}/sessions/${code}/join`, { display_name: displayName }),
    );
  }

  /**
   * Leave a game (the server only removes lobby players; in-game is kept). Best-effort and fired
   * from teardown, so it uses `fetch` with `keepalive` — it must both carry the auth header AND
   * outlive the page, which neither HttpClient (no keepalive) nor sendBeacon (no headers) can do.
   */
  leaveSession(id: string): void {
    const token = this.tokens.token();
    try {
      void fetch(`${this.base}/sessions/${id}/leave`, {
        method: 'POST',
        keepalive: true,
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      // Unload-time best effort — the prune sweep is the backstop.
    }
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

  /** The askable questions for a specific game (official + the host's custom). */
  sessionQuestions(id: string): Promise<QuestionCatalogItem[]> {
    return firstValueFrom(this.http.get<QuestionCatalogItem[]>(`${this.base}/sessions/${id}/questions`));
  }

  // ── User-generated content (own custom curses + questions) ─────────────────
  myContent(): Promise<{ curses: CustomCurse[]; questions: CustomQuestion[] }> {
    return firstValueFrom(this.http.get<{ curses: CustomCurse[]; questions: CustomQuestion[] }>(`${this.base}/my/content`));
  }

  createCurse(body: Partial<CustomCurse>): Promise<CustomCurse> {
    return firstValueFrom(this.http.post<CustomCurse>(`${this.base}/my/curses`, body));
  }

  deleteCurse(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.base}/my/curses/${id}`));
  }

  createQuestion(body: { title: string; prompt: string }): Promise<CustomQuestion> {
    return firstValueFrom(this.http.post<CustomQuestion>(`${this.base}/my/questions`, body));
  }

  deleteQuestion(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.base}/my/questions/${id}`));
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
