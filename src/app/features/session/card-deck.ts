import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActiveCurse, GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { Clock, formatCountdown } from '../../core/services/clock';
import { HidingState } from '../../core/services/hiding-state';
import { SessionStore } from '../../core/services/session-store';
import { ImageUpload } from './image-upload';

/** The hider's hand of curse cards: answer pending questions and play curses, with a draw animation. */
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
  private readonly hiding = inject(HidingState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();

  readonly busy = signal(false);
  readonly animatingFrom = signal(Number.MAX_SAFE_INTEGER);
  private prevLen = 0;

  readonly hand = computed(() => this.state().hand ?? []);
  readonly pending = computed(() => this.state().pending_question);
  readonly isPhoto = computed(() => this.pending()?.category === 'photo');
  readonly canAnswer = computed(() => this.state().available_actions.includes('answer_question'));
  readonly canRelocate = computed(() => this.state().available_actions.includes('choose_station'));
  readonly playedCurses = computed(() => this.state().curses);

  constructor() {
    // When the hand grows (a draw), animate the newly added cards in.
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

  async answer(): Promise<void> {
    await this.act('answer_question', {});
  }

  /** Answer a photo question with the uploaded image. */
  async answerPhoto(url: string): Promise<void> {
    await this.act('answer_question', { photo_url: url });
  }

  /** Remaining time for a timed curse the hider played, or null. */
  countdown(curse: ActiveCurse): string | null {
    if (curse.status !== 'active' || curse.expires_at == null) {
      return null;
    }

    return formatCountdown(curse.expires_at - this.clock.nowMs() / 1000);
  }

  /** Re-hide at the station nearest the hider's current position (allowed only while unlocked). */
  async relocate(): Promise<void> {
    const me = this.state().players.find((p) => p.role === 'hider');
    if (me?.lat == null || me?.lng == null) {
      return;
    }
    await this.hiding.loadFor(me.lat, me.lng);
    const station = this.hiding.selected();
    if (station) {
      await this.act('choose_station', { lat: station.lat, lng: station.lng });
    }
  }

  async play(curseId: string): Promise<void> {
    await this.act('play_curse', { curse_id: curseId });
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
