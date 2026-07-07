import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameState, QuestionCatalogItem } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { DebugApi, DebugCard, QuestionEvalResult } from '../../core/services/debug-api';
import { SessionStore } from '../../core/services/session-store';
import { Icon } from '../../shared/icon';

const STATES = ['lobby', 'role_assignment', 'hiding', 'seeking', 'endgame', 'round_end', 'finished'];

/**
 * In-game debug drawer (dev only): simulate this player's GPS by tapping the map or
 * presets, and god-controls (seed bots, force state, expire timers, act as anyone)
 * via the debug API. Lets you play the real game UI across browsers without GPS.
 */
@Component({
  selector: 'app-dev-tools',
  imports: [FormsModule, Icon],
  templateUrl: './dev-tools.html',
})
export class DevTools {
  private readonly api = inject(ApiClient);
  private readonly debug = inject(DebugApi);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly placing = input(false);
  readonly placingChange = output<boolean>();
  // Emits the geometry to overlay on the deduction map (null clears it).
  readonly evalResult = output<QuestionEvalResult | null>();

  readonly open = signal(false);
  readonly error = signal<string | null>(null);
  readonly states = STATES;

  readonly btn = 'w-full rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40';
  readonly activeBtn = 'w-full rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black';
  readonly ghost = 'rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10';

  readonly cards = signal<DebugCard[]>([]);
  readonly catalog = signal<QuestionCatalogItem[]>([]);
  readonly evalOut = signal<string | null>(null);

  seedCount = 2;
  forceStateValue = 'seeking';
  actPlayer = '';
  actType = 'confirm_hidden';
  giveCardId = '';

  // Question harness inputs.
  evalQuestionId = '';
  evalSeekerLat: number | null = null;
  evalSeekerLng: number | null = null;
  evalHiderLat: number | null = null;
  evalHiderLng: number | null = null;
  evalRadiusM = 5000;

  /** Toggle the drawer, lazy-loading the card + question catalogues the first time it opens. */
  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      if (!this.cards().length) void this.loadCards();
      if (!this.catalog().length) void this.loadCatalog();
      this.prefillEvalCoords();
    }
  }

  private async loadCards(): Promise<void> {
    try {
      this.cards.set(await this.debug.cards(this.sessionId()));
    } catch {
      // debug API off — leave the list empty
    }
  }

  private async loadCatalog(): Promise<void> {
    try {
      this.catalog.set(await this.api.questionsCatalog());
    } catch {
      // debug/API off — leave the list empty
    }
  }

  /** The category of the currently-selected question (drives the radar-radius input). */
  categoryOf(id: string): string {
    return this.catalog().find((q) => q.id === id)?.category ?? '';
  }

  /** Seed the harness at the play city: seeker at centre, hider ~1.2 km NE (overridable). */
  private prefillEvalCoords(): void {
    if (this.evalSeekerLat !== null) {
      return;
    }
    const city = this.state().config?.['city'] as { lat: number; lng: number } | undefined;
    if (city) {
      this.evalSeekerLat = city.lat;
      this.evalSeekerLng = city.lng;
      this.evalHiderLat = +(city.lat + 0.0086).toFixed(5);
      this.evalHiderLng = +(city.lng + 0.0088).toFixed(5);
    }
  }

  /** Evaluate the selected question at the harness coords and overlay the result on the map. */
  async evalQuestion(): Promise<void> {
    const q = this.catalog().find((x) => x.id === this.evalQuestionId);
    if (!q || this.evalSeekerLat === null || this.evalSeekerLng === null || this.evalHiderLat === null || this.evalHiderLng === null) {
      return;
    }
    this.error.set(null);
    try {
      const res = await this.debug.evalQuestion(this.sessionId(), {
        question_id: q.id,
        seeker_lat: this.evalSeekerLat,
        seeker_lng: this.evalSeekerLng,
        hider_lat: this.evalHiderLat,
        hider_lng: this.evalHiderLng,
        ...(q.category === 'radar' ? { radius_m: this.evalRadiusM } : {}),
      });
      this.evalResult.emit(res);
      this.evalOut.set(this.evalSummary(res));
    } catch (e: any) {
      this.error.set(e?.error?.message ?? e?.message ?? 'Failed.');
    }
  }

  clearEval(): void {
    this.evalResult.emit(null);
    this.evalOut.set(null);
  }

  private evalSummary(r: QuestionEvalResult): string {
    if (!r.evaluated) {
      return 'not auto-evaluable (manual / admin question)';
    }
    const matched = r.matched ? ` → ${r.matched.name ?? '(unnamed)'}` : '';
    const candidates = r.candidates.length ? ` · ${r.candidates.length} candidates` : '';

    return `${r.answer}${matched}${candidates}`;
  }

  async giveCard(): Promise<void> {
    if (this.giveCardId) {
      await this.run(() => this.debug.giveCard(this.sessionId(), this.giveCardId));
    }
  }

  togglePlacing(): void {
    this.placingChange.emit(!this.placing());
  }

  async preset(which: 'city' | 'north' | 'east'): Promise<void> {
    const city = this.state().config?.['city'] as { lat: number; lng: number } | undefined;
    if (!city) {
      return;
    }
    const off = which === 'north' ? { lat: 0.027, lng: 0 } : which === 'east' ? { lat: 0, lng: 0.066 } : { lat: 0, lng: 0 };
    await this.run(() => this.api.reportLocation(this.sessionId(), city.lat + off.lat, city.lng + off.lng));
  }

  async seed(): Promise<void> {
    await this.run(() => this.debug.seedPlayers(this.sessionId(), this.seedCount));
  }

  async force(): Promise<void> {
    await this.run(() => this.debug.forceState(this.sessionId(), this.forceStateValue));
  }

  async expire(key: string): Promise<void> {
    await this.run(() => this.debug.expireTimer(this.sessionId(), key));
  }

  async actAs(): Promise<void> {
    if (this.actPlayer) {
      await this.run(() => this.debug.actAs(this.sessionId(), this.actPlayer, this.actType.trim(), {}));
    }
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await fn();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? e?.message ?? 'Failed.');
    } finally {
      this.store.refresh();
    }
  }
}
