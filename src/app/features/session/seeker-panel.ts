import { Component, computed, effect, inject, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { ActiveCurse, GameState } from '../../core/models';
import { ALL_TRANSIT_MODES } from '../../core/maps/overpass';
import { ApiClient } from '../../core/services/api-client';
import { Clock, formatCountdown } from '../../core/services/clock';
import { DeductionState } from '../../core/services/deduction-state';
import { SessionStore } from '../../core/services/session-store';
import { TransitRoutes } from '../../core/services/transit-routes';
import { CategoryService } from '../../core/services/category.service';
import { TransitService } from '../../core/services/transit.service';
import { DiceRoller } from './dice-roller';
import { HangmanGame } from './hangman-game';
import { ImageUpload } from './image-upload';
import { Icon } from '../../shared/icon';
import { MediaViewerService } from '../../shared/media-viewer';

/** Seeker side panel: an Ask button, the numbered history (with photo clues), and curses. */
@Component({
  selector: 'app-seeker-panel',
  imports: [ImageUpload, DiceRoller, HangmanGame, TranslocoModule, Icon],
  templateUrl: './seeker-panel.html',
})
export class SeekerPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  private readonly clock = inject(Clock);
  private readonly transitRoutes = inject(TransitRoutes);
  private readonly category = inject(CategoryService);
  readonly media = inject(MediaViewerService);
  private readonly transitService = inject(TransitService);
  readonly deduction = inject(DeductionState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly openPicker = output<void>();
  readonly openBoard = output<void>();
  readonly mode = (id: string) => this.transitService.transitMeta(id);

  /** A proof URL that points at a video (so the preview shows a player, not a broken <img>). */
  isVideoUrl(url: string | null | undefined): boolean {
    return !!url && /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(url);
  }

  readonly questionNotice = this.store.questionNotice;
  readonly canAsk = computed(() => this.state().available_actions.includes('ask_question'));
  readonly canCatch = computed(() => this.state().available_actions.includes('claim_found'));
  readonly pendingClaim = computed(() => this.state().found_claim);
  readonly closingIn = computed(() => this.state().state === 'endgame' && !this.canCatch() && !this.pendingClaim());
  readonly running = computed(() => this.state().thermometer);
  readonly transit = computed(() => this.state().transit);
  readonly onTransit = computed(() => this.transit()?.on_transit ?? false);
  readonly canBoard = computed(() => this.state().available_actions.includes('board_transit'));
  // Journey log newest-first; only completed legs (with an alight time).
  readonly journey = computed(() => [...(this.transit()?.log ?? [])].filter((l) => l.alight.at != null).reverse());
  readonly history = computed(() => [...this.deduction.annotations()].reverse());
  readonly catColor = (c: string) => this.category.categoryColor(c);
  // Done curses (time ran out / task completed) disappear — only show active ones.
  readonly curses = computed(() => this.state().curses.filter((c) => c.status === 'active'));

  private restoredRide: string | null = null;

  constructor() {
    // After a reload the ridden line's geometry is gone (it was in-memory) — re-fetch + draw
    // it once per ride from the stored board point + line.
    effect(() => {
      const t = this.transit();
      if (t?.on_transit && t.line && t.board?.lat != null && t.board?.lng != null) {
        const key = `${t.line}:${t.boarded_at}`;
        if (this.restoredRide !== key) {
          this.restoredRide = key;
          void this.transitRoutes.restoreActive(t.board.lat, t.board.lng, t.line, t.mode ?? 'tram', ALL_TRANSIT_MODES);
        }
      } else if (!t?.on_transit) {
        this.restoredRide = null;
      }
    });
  }

  /** Compact "12m · 3.4 km" summary for a journey leg. */
  legSummary(leg: { duration_s: number | null; distance_m: number | null }): string {
    const parts: string[] = [];
    if (leg.duration_s != null) {
      parts.push(leg.duration_s >= 60 ? `${Math.round(leg.duration_s / 60)}m` : `${leg.duration_s}s`);
    }
    if (leg.distance_m != null) {
      parts.push(leg.distance_m >= 1000 ? `${(leg.distance_m / 1000).toFixed(1)} km` : `${leg.distance_m} m`);
    }

    return parts.join(' · ');
  }

  async alight(): Promise<void> {
    await this.api.submitAction(this.sessionId(), 'alight_transit', {});
    this.transitRoutes.clearDisplayed();
    this.store.refresh();
  }

  chipClass(answer: string): string {
    const positive = this.category.answerPositive(answer);
    if (positive === true) {
      return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300';
    }
    if (positive === false) {
      return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  /** Remaining time for a timed curse, or null. */
  countdown(curse: ActiveCurse): string | null {
    if (curse.status !== 'active' || curse.expires_at == null) {
      return null;
    }

    return formatCountdown(curse.expires_at - this.clock.nowMs() / 1000);
  }

  async submitProof(curse: ActiveCurse, url: string): Promise<void> {
    await this.api.submitAction(this.sessionId(), 'complete_curse', { curse_uid: curse.uid, proof_url: url });
    this.store.refresh();
  }

  async stopThermometer(): Promise<void> {
    await this.api.submitAction(this.sessionId(), 'stop_thermometer', {});
    this.store.refresh();
  }

  /** Claim the catch — the round ends only once the hider confirms it. */
  async claimFound(): Promise<void> {
    await this.api.submitAction(this.sessionId(), 'claim_found', {});
    this.store.refresh();
  }
}
