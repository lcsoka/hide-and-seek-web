import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import { TokenStore } from '../../core/token-store';

@Component({
  selector: 'app-landing',
  imports: [FormsModule],
  template: `
    <main class="mx-auto max-w-md p-6 space-y-6">
      <h1 class="text-2xl font-bold">Jet Lag Hungary</h1>

      @if (error(); as e) {
        <p class="rounded bg-red-100 p-2 text-sm text-red-700">{{ e }}</p>
      }

      @if (!hasToken()) {
        <section class="space-y-3 rounded-lg border p-4">
          <label class="block text-sm font-medium">Display name</label>
          <input [(ngModel)]="name" placeholder="Anna" class="w-full rounded border p-2" />
          <button (click)="playAsGuest()" [disabled]="busy()"
                  class="w-full rounded bg-rose-600 p-2 font-medium text-white disabled:opacity-50">
            Play as guest
          </button>
        </section>
      } @else {
        <section class="space-y-3 rounded-lg border p-4">
          <h2 class="font-semibold">New game</h2>
          <label class="block text-sm">City</label>
          <select [(ngModel)]="city" class="w-full rounded border p-2">
            @for (c of cities; track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <label class="block text-sm">Map size</label>
          <select [(ngModel)]="size" class="w-full rounded border p-2">
            @for (s of sizes; track s) { <option [value]="s">{{ s }}</option> }
          </select>
          <button (click)="create()" [disabled]="busy()"
                  class="w-full rounded bg-rose-600 p-2 font-medium text-white disabled:opacity-50">
            Create session
          </button>
        </section>

        <section class="space-y-3 rounded-lg border p-4">
          <h2 class="font-semibold">Join a game</h2>
          <input [(ngModel)]="joinCode" placeholder="Join code" class="w-full rounded border p-2 uppercase" />
          <input [(ngModel)]="joinName" placeholder="Your name" class="w-full rounded border p-2" />
          <button (click)="join()" [disabled]="busy()"
                  class="w-full rounded border p-2 font-medium disabled:opacity-50">
            Join
          </button>
        </section>
      }
    </main>
  `,
})
export class Landing {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  readonly hasToken = signal(!!this.tokens.token());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly cities = ['budapest', 'debrecen', 'szeged', 'miskolc', 'pecs', 'gyor', 'nyiregyhaza', 'kecskemet', 'szekesfehervar', 'szombathely'];
  readonly sizes = ['small', 'medium', 'large'];

  name = '';
  city = 'budapest';
  size = 'medium';
  joinCode = '';
  joinName = '';

  async playAsGuest(): Promise<void> {
    await this.run(async () => {
      const auth = await this.api.guest(this.name || undefined);
      this.tokens.set(auth.token);
      this.hasToken.set(true);
    });
  }

  async create(): Promise<void> {
    await this.run(async () => {
      const session = await this.api.createSession({ city: this.city, game_size: this.size, display_name: this.name || undefined });
      await this.router.navigate(['/s', session.id]);
    });
  }

  async join(): Promise<void> {
    await this.run(async () => {
      const { session } = await this.api.join(this.joinCode.trim().toUpperCase(), this.joinName || 'Player');
      await this.router.navigate(['/s', session.id]);
    });
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
