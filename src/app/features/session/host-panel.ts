import { Component, inject, input, signal } from '@angular/core';
import { GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';

/** Role assignment: the host picks which player hides (or rolls a random one). */
@Component({
  selector: 'app-host-panel',
  template: `
    <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h2 class="font-semibold">Choose the hider</h2>
      <ul class="space-y-2">
        @for (p of state().players; track p.id) {
          <li class="flex items-center justify-between gap-2">
            <span>{{ p.display_name }}@if (p.is_host) { <span class="text-gray-400"> (you)</span> }</span>
            <button (click)="assign(p.id)" [disabled]="busy()"
                    class="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40">
              Make hider
            </button>
          </li>
        }
      </ul>
      <button (click)="assign(null)" [disabled]="busy()"
              class="w-full rounded-lg border border-gray-300 p-2 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800">
        🎲 Pick a random hider
      </button>
    </section>
  `,
})
export class HostPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly busy = signal(false);

  async assign(playerId: string | null): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.submitAction(this.sessionId(), 'assign_hider', playerId ? { player_id: playerId } : {});
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
