import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { TRANSIT_MODES } from '../../core/maps/overpass';
import { ApiClient } from '../../core/services/api-client';
import { PlayerStore } from '../../core/services/player-store';
import { TokenStore } from '../../core/services/token-store';
import { LangToggle } from '../../shared/lang-toggle';

@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink, TranslocoModule, LangToggle],
  template: `
    <main class="mx-auto w-full max-w-md space-y-6 p-4 sm:p-6" *transloco="let t">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold sm:text-3xl">Jet Lag Hungary</h1>
        <app-lang-toggle />
      </div>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      <div class="space-y-1">
        <label class="text-sm font-medium" for="name">{{ t('landing.yourName') }}</label>
        <input id="name" [(ngModel)]="name" placeholder="Anna" autocomplete="off"
               class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800" />
      </div>

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">{{ t('landing.startGame') }}</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select [(ngModel)]="city" [attr.aria-label]="t('landing.startGame')"
                  class="w-full rounded-lg border border-gray-300 bg-white p-3 capitalize dark:border-gray-600 dark:bg-gray-800">
            @for (c of cities; track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <select [(ngModel)]="size" aria-label="Map size"
                  class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
            @for (s of sizes; track s) { <option [value]="s">{{ t('landing.size.' + s) }}</option> }
          </select>
          <select [(ngModel)]="units" aria-label="Units"
                  class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
            <option value="metric">{{ t('landing.units.metric') }}</option>
            <option value="imperial">{{ t('landing.units.imperial') }}</option>
          </select>
          <select [(ngModel)]="zoneRule" aria-label="Hiding zone"
                  class="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
            <option value="nearest">{{ t('landing.zoneCarved') }}</option>
            <option value="circle">{{ t('landing.zoneCircle') }}</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <div class="text-sm font-medium">{{ t('landing.transport') }}</div>
          <div class="flex flex-wrap gap-2">
            @for (m of allModes; track m.id) {
              <button type="button" (click)="toggleMode(m.id)"
                      class="rounded-full border px-3 py-1.5 text-sm font-medium transition"
                      [class]="modes().includes(m.id)
                        ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-500 dark:bg-rose-950 dark:text-rose-300'
                        : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400'">
                {{ t('mode.' + m.id) }}
              </button>
            }
          </div>
          <p class="text-xs text-gray-400">{{ t('landing.transportHint') }}</p>
        </div>

        <button (click)="create()" [disabled]="busy()"
                class="w-full rounded-lg bg-rose-600 p-3 font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          {{ t('landing.createGame') }}
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">{{ t('landing.joinTitle') }}</h2>
        <input [(ngModel)]="joinCode" [placeholder]="t('landing.joinCode')" autocapitalize="characters"
               class="w-full rounded-lg border border-gray-300 bg-white p-3 uppercase dark:border-gray-600 dark:bg-gray-800" />
        <button (click)="join()" [disabled]="busy() || !joinCode.trim()"
                class="w-full rounded-lg border border-gray-300 p-3 font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800">
          {{ t('landing.joinBtn') }}
        </button>
      </section>

      <p class="text-center text-sm">
        <a routerLink="/map" class="text-rose-600 hover:underline">{{ t('landing.openMap') }}</a>
      </p>
    </main>
  `,
})
export class Landing {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly players = inject(PlayerStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly cities = ['budapest', 'debrecen', 'szeged', 'miskolc', 'pecs', 'gyor', 'nyiregyhaza', 'kecskemet', 'szekesfehervar', 'szombathely'];
  readonly sizes = ['small', 'medium', 'large'];
  readonly allModes = TRANSIT_MODES;
  readonly modes = signal<string[]>(['metro', 'tram']);

  name = '';
  city = 'budapest';
  size = 'medium';
  units = 'metric';
  zoneRule = 'nearest';
  joinCode = '';

  /** Toggle a transit mode, but never let the last one be removed (need ≥1 to hide at). */
  toggleMode(id: string): void {
    this.modes.update((m) => (m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]));
  }

  async create(): Promise<void> {
    await this.run(async () => {
      await this.ensureToken();
      const session = await this.api.createSession({ city: this.city, game_size: this.size, display_name: this.name || undefined, config: { units: this.units, transit_modes: this.modes(), hiding_zone_rule: this.zoneRule } });
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
      this.error.set(e?.error?.message ?? this.transloco.translate('common.error'));
    } finally {
      this.busy.set(false);
    }
  }
}
