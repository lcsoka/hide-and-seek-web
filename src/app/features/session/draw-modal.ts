import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HandCard, PendingDraw } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';

/** Reveal of the cards the hider just drew; they keep `keep` of them. */
@Component({
  selector: 'app-draw-modal',
  templateUrl: './draw-modal.html',
  styles: [
    `
      @keyframes cardReveal {
        from {
          transform: translateY(40px) rotateY(90deg) scale(0.8);
          opacity: 0;
        }
        to {
          transform: none;
          opacity: 1;
        }
      }
      .card-reveal {
        animation: cardReveal 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
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
    const next = new Set(this.selected());
    if (next.has(uid)) {
      next.delete(uid);
    } else if (next.size < this.keep()) {
      next.add(uid);
    }
    this.selected.set(next);
  }

  cardClass(card: HandCard): string {
    if (card.type === 'time_bonus') {
      return 'bg-gradient-to-br from-emerald-600 to-green-800';
    }
    if (card.type === 'powerup') {
      return 'bg-gradient-to-br from-sky-600 to-blue-800';
    }

    return 'bg-gradient-to-br from-purple-600 to-indigo-800';
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
