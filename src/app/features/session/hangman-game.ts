import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { ActiveCurse } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';

/**
 * The Hidden Gallows mini-game: seekers reveal a masked word letter-by-letter to lift the curse's
 * asking block. Server-authoritative — the word only ever arrives masked, guesses are resolved by
 * the `hangman_guess` action, and running out of misses quietly swaps in a fresh word (never a
 * dead end). The gallows figure draws one limb per wrong guess.
 */
@Component({
  selector: 'app-hangman-game',
  imports: [TranslocoModule],
  template: `
    <div class="space-y-3" *transloco="let tr">
      @if (hangman(); as h) {
        <div class="flex items-center gap-3">
          <!-- Gallows: static frame + a body part per wrong guess. -->
          <svg viewBox="0 0 80 100" class="h-24 w-20 shrink-0 text-purple-700 dark:text-purple-300" fill="none"
               stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <line x1="8" y1="96" x2="56" y2="96" />
            <line x1="20" y1="96" x2="20" y2="8" />
            <line x1="20" y1="8" x2="54" y2="8" />
            <line x1="54" y1="8" x2="54" y2="18" />
            @if (wrongCount() >= 1) { <circle cx="54" cy="26" r="8" class="hm-part" /> }
            @if (wrongCount() >= 2) { <line x1="54" y1="34" x2="54" y2="60" class="hm-part" /> }
            @if (wrongCount() >= 3) { <line x1="54" y1="42" x2="44" y2="52" class="hm-part" /> }
            @if (wrongCount() >= 4) { <line x1="54" y1="42" x2="64" y2="52" class="hm-part" /> }
            @if (wrongCount() >= 5) { <line x1="54" y1="60" x2="45" y2="74" class="hm-part" /> }
            @if (wrongCount() >= 6) { <line x1="54" y1="60" x2="63" y2="74" class="hm-part" /> }
          </svg>

          <div class="min-w-0 flex-1 space-y-2">
            <p class="text-xs font-medium text-purple-700 dark:text-purple-300">{{ tr('hangman.solveToAsk') }}</p>
            <!-- Masked word. -->
            <div class="flex flex-wrap gap-1">
              @for (ch of h.mask; track $index) {
                <span class="grid h-8 w-6 place-items-center border-b-2 text-lg font-extrabold"
                      [class]="ch ? 'border-purple-500 text-purple-900 dark:text-purple-100' : 'border-gray-300 text-transparent dark:border-gray-600'">
                  {{ ch ?? '·' }}
                </span>
              }
            </div>
            <div class="text-xs font-semibold" [class]="wrongCount() >= h.max_wrong - 1 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'">
              {{ tr('hangman.misses') }}: {{ wrongCount() }} / {{ h.max_wrong }}
            </div>
          </div>
        </div>

        @if (h.solved) {
          <p class="rounded-lg bg-green-100 p-2 text-center text-sm font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
            {{ tr('hangman.solved') }}
          </p>
        } @else {
          <!-- Alphabet. -->
          <div class="grid grid-cols-8 gap-1">
            @for (letter of h.alphabet; track letter) {
              <button (click)="guess(letter)"
                      [disabled]="isUsed(letter) || busy()"
                      class="aspect-square rounded-md text-sm font-bold uppercase transition disabled:cursor-not-allowed"
                      [class]="letterClass(letter)">
                {{ letter }}
              </button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      @keyframes hmDraw {
        from { opacity: 0; transform: scale(0.7); }
        to { opacity: 1; transform: scale(1); }
      }
      .hm-part {
        transform-box: fill-box;
        transform-origin: center;
        animation: hmDraw 0.3s ease-out both;
      }
    `,
  ],
})
export class HangmanGame {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly sessionId = input.required<string>();
  readonly curse = input.required<ActiveCurse>();

  readonly busy = signal(false);
  readonly hangman = computed(() => this.curse().hangman ?? null);
  readonly wrongCount = computed(() => this.hangman()?.wrong.length ?? 0);

  isUsed(letter: string): boolean {
    const h = this.hangman();
    return !!h && (h.guessed.includes(letter) || h.wrong.includes(letter));
  }

  letterClass(letter: string): string {
    const h = this.hangman();
    if (h?.guessed.includes(letter)) {
      return 'bg-green-500 text-white';
    }
    if (h?.wrong.includes(letter)) {
      return 'bg-red-400 text-white opacity-60';
    }
    return 'bg-white text-gray-800 ring-1 ring-gray-300 hover:bg-purple-100 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600 dark:hover:bg-purple-900';
  }

  async guess(letter: string): Promise<void> {
    if (this.busy() || this.isUsed(letter)) {
      return;
    }
    this.busy.set(true);
    try {
      await this.api.submitAction(this.sessionId(), 'hangman_guess', { curse_uid: this.curse().uid, letter });
    } finally {
      this.store.refresh();
      this.busy.set(false);
    }
  }
}
