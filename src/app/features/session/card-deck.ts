import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActiveCurse, GameState, HandCard, ResolvedQuestion } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { Clock, formatCountdown } from '../../core/services/clock';
import { SessionStore } from '../../core/services/session-store';
import { answerLabel, answerPositive, categoryMeta } from '../../core/util/categories';
import { formatDistance, unitsOf } from '../../core/util/units';
import { ImageUpload } from './image-upload';

/** The hider's hand: see the full pending question, confirm the answer, play cards. */
@Component({
  selector: 'app-card-deck',
  imports: [ImageUpload],
  templateUrl: './card-deck.html',
  styles: [
    `
      @keyframes cardDraw {
        from {
          transform: translateY(60px) scale(0.7) rotate(-8deg);
          opacity: 0;
        }
        to {
          transform: none;
          opacity: 1;
        }
      }
      .card-draw {
        animation: cardDraw 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
    `,
  ],
})
export class CardDeck {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  private readonly clock = inject(Clock);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();

  readonly busy = signal(false);
  readonly animatingFrom = signal(Number.MAX_SAFE_INTEGER);
  private prevLen = 0;

  readonly meta = categoryMeta;
  readonly answerLabel = answerLabel;
  readonly confirmCard = signal<HandCard | null>(null);

  readonly hand = computed(() => this.state().hand ?? []);
  readonly history = computed(() => [...(this.state().questions ?? [])].reverse());
  readonly pending = computed(() => this.state().pending_question);
  readonly isPhoto = computed(() => this.pending()?.category === 'photo');
  readonly canAnswer = computed(() => this.state().available_actions.includes('answer_question'));
  readonly preview = computed(() => this.pending()?.preview_answer ?? null);
  readonly timeBonusMin = computed(() => Math.round((this.state().time_bonus_s ?? 0) / 60));
  readonly playedCurses = computed(() => this.state().curses.filter((c) => c.status === 'active'));
  readonly vetoCard = computed(() => this.hand().find((c) => c.type === 'powerup' && c.power === 'veto') ?? null);

  private readonly units = computed(() => unitsOf(this.state().config));

  /** A short human summary of the question's parameters (radius / feature). */
  readonly questionParams = computed(() => {
    const p = this.pending()?.params;
    if (!p) {
      return null;
    }
    const parts: string[] = [];
    if (p.radius_m) {
      parts.push(`within ${formatDistance(p.radius_m, this.units())}`);
    }
    if (p.feature) {
      parts.push(`nearest ${p.feature.replace(/_/g, ' ')}`);
    }

    return parts.join(' · ') || null;
  });

  readonly previewColor = computed(() => {
    const positive = answerPositive(this.preview()?.answer);
    if (positive === true) {
      return 'text-green-600 dark:text-green-400';
    }
    if (positive === false) {
      return 'text-red-600 dark:text-red-400';
    }

    return 'text-gray-800 dark:text-gray-100';
  });

  constructor() {
    // When the hand grows, animate the newly added cards in.
    effect(() => {
      const len = this.hand().length;
      if (len > this.prevLen) {
        const from = this.prevLen;
        this.animatingFrom.set(from);
        setTimeout(() => {
          if (this.animatingFrom() === from) {
            this.animatingFrom.set(Number.MAX_SAFE_INTEGER);
          }
        }, 700);
      }
      this.prevLen = len;
    });
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

  cardTitle(card: HandCard): string {
    if (card.name) {
      return card.name;
    }
    if (card.type === 'time_bonus') {
      return `+${card.minutes ?? 0} min`;
    }

    return card.power ?? 'Card';
  }

  async answer(): Promise<void> {
    await this.act('answer_question', {});
  }

  async answerPhoto(url: string): Promise<void> {
    await this.act('answer_question', { photo_url: url });
  }

  async veto(): Promise<void> {
    const card = this.vetoCard();
    if (card) {
      await this.act('play_powerup', { card_uid: card.uid });
    }
  }

  /** Curses ask for confirmation (they're played on the seekers); powerups play directly. */
  async playCard(card: HandCard): Promise<void> {
    if (card.type === 'curse') {
      this.confirmCard.set(card);
    } else if (card.type === 'powerup') {
      await this.act('play_powerup', { card_uid: card.uid });
    }
  }

  async confirmPlay(): Promise<void> {
    const card = this.confirmCard();
    this.confirmCard.set(null);
    if (card) {
      await this.act('play_curse', { card_uid: card.uid });
    }
  }

  cancelPlay(): void {
    this.confirmCard.set(null);
  }

  /** The question's range / feature, so the hider sees the full question (not just "radar"). */
  questionInfo(q: ResolvedQuestion): string | null {
    const parts: string[] = [];
    if (q.ask?.radius_m) {
      parts.push(formatDistance(q.ask.radius_m, this.units()));
    }
    if (q.ask?.feature) {
      parts.push(q.ask.feature.replace(/_/g, ' '));
    }

    return parts.join(' · ') || null;
  }

  /** A coloured chip for an answer in the hider's past-answers list. */
  historyChip(q: ResolvedQuestion): string {
    const positive = answerPositive(q.answer?.answer);
    if (positive === true) {
      return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300';
    }
    if (positive === false) {
      return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  /** Remaining time for a timed curse the hider played, or null. */
  countdown(curse: ActiveCurse): string | null {
    if (curse.status !== 'active' || curse.expires_at == null) {
      return null;
    }

    return formatCountdown(curse.expires_at - this.clock.nowMs() / 1000);
  }

  private async act(type: string, payload: Record<string, unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.submitAction(this.sessionId(), type, payload);
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
