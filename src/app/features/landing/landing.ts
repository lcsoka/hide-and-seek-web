import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { PlayerStore } from '../../core/services/player-store';
import { TokenStore } from '../../core/services/token-store';

@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="mx-auto w-full max-w-md space-y-6 p-4 sm:p-6">
      <h1 class="text-center text-2xl font-bold sm:text-3xl">Jet Lag Hungary</h1>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      <div class="space-y-1">
        <label class="text-sm font-medium" for="name">Your name</label>
        <input id="name" [(ngModel)]="name" placeholder="Anna" autocomplete="off"
               class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800" />
      </div>

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">Start a game</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select [(ngModel)]="city" aria-label="City"
                  class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
            @for (c of cities; track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <select [(ngModel)]="size" aria-label="Map size"
                  class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
            @for (s of sizes; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </div>
        <button (click)="create()" [disabled]="busy()"
                class="w-full rounded-lg bg-rose-600 p-3 font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          Create game
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">Join a game</h2>
        <input [(ngModel)]="joinCode" placeholder="Join code" autocapitalize="characters"
               class="w-full rounded-lg border border-gray-300 bg-white p-3 uppercase dark:border-gray-600 dark:bg-gray-800" />
        <button (click)="join()" [disabled]="busy() || !joinCode.trim()"
                class="w-full rounded-lg border border-gray-300 p-3 font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800">
          Join game
        </button>
      </section>

      <p class="text-center text-sm">
        <a routerLink="/map" class="text-rose-600 hover:underline">🗺 Open the deduction map</a>
      </p>
    </main>
  `,
})
export class Landing {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly players = inject(PlayerStore);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly cities = ['budapest', 'debrecen', 'szeged', 'miskolc', 'pecs', 'gyor', 'nyiregyhaza', 'kecskemet', 'szekesfehervar', 'szombathely'];
  readonly sizes = ['small', 'medium', 'large'];

  name = '';
  city = 'budapest';
  size = 'medium';
  joinCode = '';

  async create(): Promise<void> {
    await this.run(async () => {
      await this.ensureToken();
      const session = await this.api.createSession({ city: this.city, game_size: this.size, display_name: this.name || undefined });
      if (session.host_player_id) {
        this.players.set(session.id, session.host_player_id);
      }
      await this.router.navigate(['/s', session.id]);
    });
  }

  async join(): Promise<void> {
    await this.run(async () => {
      await this.ensureToken();
      const { player, session } = await this.api.join(this.joinCode.trim().toUpperCase(), this.name || 'Player');
      this.players.set(session.id, player.id);
      await this.router.navigate(['/s', session.id]);
    });
  }

  private async ensureToken(): Promise<void> {
    if (!this.tokens.token()) {
      const auth = await this.api.guest(this.name || undefined);
      this.tokens.set(auth.token);
    }
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
