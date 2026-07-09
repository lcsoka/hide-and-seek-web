import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { HandCard } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';
import { Icon } from '../../shared/icon';

/**
 * Cost step of a cycle powerup (discard N, draw N+1): the hider picks which N cards to shed from
 * their hand. Confirming pays the cost and triggers the draw (which then opens the keep modal), so
 * the play is net-neutral on hand size — the played card plus N chosen cards leave, N+1 are drawn.
 */
@Component({
  selector: 'app-discard-modal',
  imports: [TranslocoModule, Icon],
  templateUrl: './discard-modal.html',
})
export class DiscardModal {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly sessionId = input.required<string>();
  readonly need = input.required<number>();
  readonly hand = input.required<HandCard[]>();

  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);

  readonly target = computed(() => Math.min(this.need(), this.hand().length));
  readonly canConfirm = computed(() => this.selected().size === this.target());

  isSelected(uid: string): boolean {
    return this.selected().has(uid);
  }

  toggle(uid: string): void {
    const next = new Set(this.selected());
    if (next.has(uid)) {
      next.delete(uid);
    } else if (next.size < this.target()) {
      next.add(uid);
    }
    this.selected.set(next);
  }

  /** Collectible-card theme (matches the hand + draw modal). */
  cardColor(card: HandCard): string {
    return card.type === 'time_bonus' ? 'var(--color-timebonus)' : card.type === 'powerup' ? 'var(--color-powerup)' : 'var(--color-curse)';
  }

  cardTintClass(card: HandCard): string {
    return card.type === 'time_bonus'
      ? 'bg-amber-50 dark:bg-amber-950/40'
      : card.type === 'powerup'
        ? 'bg-sky-50 dark:bg-sky-950/40'
        : 'bg-violet-50 dark:bg-violet-950/40';
  }

  cardEmblem(card: HandCard): string {
    return card.type === 'time_bonus' ? 'hourglass' : card.type === 'powerup' ? 'bolt' : 'curse';
  }

  async confirm(): Promise<void> {
    if (!this.canConfirm()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.api.submitAction(this.sessionId(), 'discard_cards', { uids: [...this.selected()] });
    } finally {
      this.busy.set(false);
      this.selected.set(new Set());
      this.store.refresh();
    }
  }
}
