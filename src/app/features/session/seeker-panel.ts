import { Component, computed, inject, input, output } from '@angular/core';
import { ActiveCurse, GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { Clock, formatCountdown } from '../../core/services/clock';
import { DeductionState } from '../../core/services/deduction-state';
import { SessionStore } from '../../core/services/session-store';
import { answerLabel, answerPositive } from '../../core/util/categories';
import { DiceRoller } from './dice-roller';
import { ImageUpload } from './image-upload';

/** Seeker side panel: an Ask button, the numbered history (with photo clues), and curses. */
@Component({
  selector: 'app-seeker-panel',
  imports: [ImageUpload, DiceRoller],
  templateUrl: './seeker-panel.html',
})
export class SeekerPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  private readonly clock = inject(Clock);
  readonly deduction = inject(DeductionState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly openPicker = output<void>();

  readonly label = answerLabel;
  readonly canAsk = computed(() => this.state().available_actions.includes('ask_question'));
  readonly history = computed(() => [...this.deduction.annotations()].reverse());
  readonly curses = computed(() => this.state().curses.filter((c) => c.status !== 'expired' || c.requires_proof));

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
}
