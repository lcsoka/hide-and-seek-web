import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { PlayerStore } from '../../core/services/player-store';
import { TokenStore } from '../../core/services/token-store';

/** Dev launcher: spin up a test game (opens the REAL game UI with debug tools) or open one. */
@Component({
  selector: 'app-dev-index',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="mx-auto w-full max-w-md space-y-6 p-4 sm:p-6">
      <h1 class="text-center text-2xl font-bold">Simulate a game</h1>
      <p class="text-center text-sm text-gray-500 dark:text-gray-400">
        Opens the real game with a 🛠 debug drawer (simulate GPS, seed bots, drive the flow).
        To play multiplayer, share the join code and open it in other browsers.
      </p>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">New test game</h2>
        <button (click)="createTest()" [disabled]="busy()"
                class="w-full rounded-lg bg-rose-600 p-3 font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          Create &amp; play
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">Open a session</h2>
        <input [(ngModel)]="sessionId" placeholder="session UUID"
               class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800" />
        <button (click)="open()" [disabled]="!sessionId.trim()"
                class="w-full rounded-lg border border-gray-300 p-3 font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800">
          Open game
        </button>
        @if (sessionId.trim()) {
          <a [routerLink]="['/dev/s', sessionId.trim()]" class="block text-center text-xs text-gray-400 hover:underline">…or the god cockpit</a>
        }
      </section>
    </main>
  `,
})
export class DevIndex {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly players = inject(PlayerStore);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  sessionId = '';

  async open(): Promise<void> {
    await this.router.navigate(['/s', this.sessionId.trim()]);
  }

  async createTest(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (!this.tokens.token()) {
        this.tokens.set((await this.api.guest('Dev host')).token);
      }
      const session = await this.api.createSession({ city: 'budapest', game_size: 'medium', display_name: 'Dev host' });
      if (session.host_player_id) {
        this.players.set(session.id, session.host_player_id);
      }
      await this.router.navigate(['/s', session.id]);
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Could not create a test session.');
    } finally {
      this.busy.set(false);
    }
  }
}
