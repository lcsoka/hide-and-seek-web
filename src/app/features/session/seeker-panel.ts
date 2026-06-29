import { Component, computed, inject, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { ActiveCurse, GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { Clock, formatCountdown } from '../../core/services/clock';
import { DeductionState } from '../../core/services/deduction-state';
import { SessionStore } from '../../core/services/session-store';
import { TransitRoutes } from '../../core/services/transit-routes';
import { answerPositive } from '../../core/util/categories';
import { transitMeta } from '../../core/util/transit';
import { DiceRoller } from './dice-roller';
import { ImageUpload } from './image-upload';

/** Seeker side panel: an Ask button, the numbered history (with photo clues), and curses. */
@Component({
  selector: 'app-seeker-panel',
  imports: [ImageUpload, DiceRoller, TranslocoModule],
  templateUrl: './seeker-panel.html',
})
export class SeekerPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  private readonly clock = inject(Clock);
  private readonly transitRoutes = inject(TransitRoutes);
  readonly deduction = inject(DeductionState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly openPicker = output<void>();
  readonly openBoard = output<void>();
  readonly mode = transitMeta;

  readonly questionNotice = this.store.questionNotice;
  readonly canAsk = computed(() => this.state().available_actions.includes('ask_question'));
  readonly canCatch = computed(() => this.state().available_actions.includes('confirm_found'));
  readonly closingIn = computed(() => this.state().state === 'endgame' && !this.canCatch());
  readonly running = computed(() => this.state().thermometer);
  readonly transit = computed(() => this.state().transit);
  readonly onTransit = computed(() => this.transit()?.on_transit ?? false);
  readonly canBoard = computed(() => this.state().available_actions.includes('board_transit'));
  // Journey log newest-first; only completed legs (with an alight time).
  readonly journey = computed(() => [...(this.transit()?.log ?? [])].filter((l) => l.alight.at != null).reverse());
  readonly history = computed(() => [...this.deduction.annotations()].reverse());
  // Done curses (time ran out / task completed) disappear — only show active ones.
  readonly curses = computed(() => this.state().curses.filter((c) => c.status === 'active'));

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
    const positive = answerPositive(answer);
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

  async confirmFound(): Promise<void> {
    await this.api.submitAction(this.sessionId(), 'confirm_found', {});
    this.store.refresh();
  }
}
