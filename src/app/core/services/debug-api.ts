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

/** A place on the map (matched entity / candidate / hider's own nearest). */
export interface EvalPlace {
  name: string | null;
  lat: number;
  lng: number;
}

/** Result of evaluating one geo question at a hider/seeker pair (dev question harness). */
export interface QuestionEvalResult {
  category: string;
  key: string;
  evaluated: boolean; // false = not auto-answerable (admin/border questions)
  answer: string | null;
  feature: string | null;
  radius_m: number | null;
  seeker: { lat: number; lng: number };
  hider: { lat: number; lng: number };
  matched: EvalPlace | null; // the reference/matched entity (measuring/matching/tentacles)
  hider_nearest: EvalPlace | null; // matching only: the hider's OWN nearest feature
  candidates: EvalPlace[]; // tentacles: every feature within the seeker radius
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

  /** Evaluate one geo question at an arbitrary hider/seeker pair (dev question harness). */
  evalQuestion(
    id: string,
    body: { question_id: string; seeker_lat: number; seeker_lng: number; hider_lat: number; hider_lng: number; radius_m?: number },
  ): Promise<QuestionEvalResult> {
    return firstValueFrom(this.http.post<QuestionEvalResult>(`${this.base}/sessions/${id}/debug/eval-question`, body, this.options));
  }
}
