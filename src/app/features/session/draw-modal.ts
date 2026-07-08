import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { HandCard, PendingDraw } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';
import { Icon } from '../../shared/icon';

/** Reveal of the cards the hider just drew; they keep `keep` of them. */
@Component({
  selector: 'app-draw-modal',
  imports: [TranslocoModule, Icon],
  templateUrl: './draw-modal.html',
  styles: [
    `
      /* Drawn cards flip up from the deck, one after another, with a small settle overshoot. */
      @keyframes cardReveal {
        0% { transform: translateY(46px) rotateX(38deg) scale(0.82); opacity: 0; }
        70% { transform: translateY(-5px) rotateX(0) scale(1.03); opacity: 1; }
        100% { transform: none; opacity: 1; }
      }
      .card-reveal {
        animation: cardReveal 0.5s cubic-bezier(0.2, 0.85, 0.25, 1) both;
        transform-origin: bottom center;
        will-change: transform, opacity;
      }
      @media (prefers-reduced-motion: reduce) {
        .card-reveal { animation: none; }
      }
    `,
  ],
})
export class DrawModal {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly sessionId = input.required<string>();
  readonly draw = input.required<PendingDraw>();

  readonly selected = signal<Set<string>>(new Set());
  readonly busy = signal(false);

  readonly keep = computed(() => Math.min(this.draw().keep, this.draw().cards.length));
  readonly canConfirm = computed(() => this.selected().size === this.keep());
  // No real choice: you keep everything you drew — the cards aren't individually selectable.
  readonly noChoice = computed(() => this.keep() >= this.draw().cards.length);

  constructor() {
    // If there's no choice (keep == drawn), pre-select everything.
    effect(() => {
      const d = this.draw();
      if (d.keep >= d.cards.length) {
        this.selected.set(new Set(d.cards.map((c) => c.uid)));
      }
    });
  }

  isSelected(uid: string): boolean {
    return this.selected().has(uid);
  }

  toggle(uid: string): void {
    if (this.noChoice()) {
      return; // must keep all drawn cards — deselecting isn't allowed
    }
    const next = new Set(this.selected());
    if (next.has(uid)) {
      next.delete(uid);
    } else if (next.size < this.keep()) {
      next.add(uid);
    }
    this.selected.set(next);
  }

  /** Collectible-card theme (matches the hand); colours come from the branded style tokens. */
  cardColor(card: HandCard): string {
    return card.type === 'time_bonus'
      ? 'var(--color-timebonus)'
      : card.type === 'powerup'
        ? 'var(--color-powerup)'
        : 'var(--color-curse)';
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
      await this.api.submitAction(this.sessionId(), 'keep_cards', { uids: [...this.selected()] });
    } finally {
      this.busy.set(false);
      this.selected.set(new Set());
      this.store.refresh();
    }
  }
}
