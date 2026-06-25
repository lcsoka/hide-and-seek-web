import { Component, computed, inject, input, signal } from '@angular/core';
import { ActiveCurse } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';

/** Rolls the dice a curse requires (server-authoritative), with a spin animation. */
@Component({
  selector: 'app-dice-roller',
  template: `
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <div class="flex gap-1">
          @for (v of displayValues(); track $index) {
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-white text-lg font-extrabold text-gray-900 shadow ring-1 ring-black/10"
                  [class.rolling]="rolling()">{{ v }}</span>
          }
        </div>
        <button (click)="roll()" [disabled]="rolling()"
                class="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
          🎲 Roll
        </button>
      </div>
      @if (!rolling() && result(); as r) {
        <div class="text-xs font-semibold"
             [class]="r.success === true ? 'text-green-600 dark:text-green-400' : r.success === false ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'">
          Rolled {{ r.sum }}@if (r.success === true) { — success! } @else if (r.success === false) { — roll again }
        </div>
      }
    </div>
  `,
  styles: [
    `
      @keyframes diceSpin {
        0% { transform: rotate(0) scale(1); }
        50% { transform: rotate(180deg) scale(1.15); }
        100% { transform: rotate(360deg) scale(1); }
      }
      .rolling { animation: diceSpin 0.25s linear infinite; }
    `,
  ],
})
export class DiceRoller {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly sessionId = input.required<string>();
  readonly curse = input.required<ActiveCurse>();

  readonly rolling = signal(false);
  private readonly faces = signal<number[]>([]);

  readonly result = computed(() => this.curse().last_roll ?? null);
  readonly displayValues = computed(() => {
    if (this.rolling()) {
      return this.faces();
    }
    const roll = this.curse().last_roll;
    return roll?.values ?? Array.from({ length: this.curse().dice?.count ?? 1 }, () => 1);
  });

  async roll(): Promise<void> {
    this.rolling.set(true);
    const count = this.curse().dice?.count ?? 1;
    const sides = this.curse().dice?.sides ?? 6;
    const spin = setInterval(() => this.faces.set(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides))), 80);
    try {
      await this.api.submitAction(this.sessionId(), 'roll_dice', { curse_uid: this.curse().uid });
    } finally {
      this.store.refresh();
      setTimeout(() => {
        clearInterval(spin);
        this.rolling.set(false);
      }, 700);
    }
  }
}
