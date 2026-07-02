import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameState } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { DebugApi } from '../../core/services/debug-api';
import { SessionStore } from '../../core/services/session-store';

const STATES = ['lobby', 'role_assignment', 'hiding', 'seeking', 'endgame', 'round_end', 'finished'];

/**
 * In-game debug drawer (dev only): simulate this player's GPS by tapping the map or
 * presets, and god-controls (seed bots, force state, expire timers, act as anyone)
 * via the debug API. Lets you play the real game UI across browsers without GPS.
 */
@Component({
  selector: 'app-dev-tools',
  imports: [FormsModule],
  templateUrl: './dev-tools.html',
})
export class DevTools {
  private readonly api = inject(ApiClient);
  private readonly debug = inject(DebugApi);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly placing = input(false);
  readonly placingChange = output<boolean>();

  readonly open = signal(false);
  readonly error = signal<string | null>(null);
  readonly states = STATES;

  readonly btn = 'w-full rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40';
  readonly activeBtn = 'w-full rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black';
  readonly ghost = 'rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10';

  seedCount = 2;
  forceStateValue = 'seeking';
  actPlayer = '';
  actType = 'confirm_hidden';

  togglePlacing(): void {
    this.placingChange.emit(!this.placing());
  }

  async preset(which: 'city' | 'north' | 'east'): Promise<void> {
    const city = this.state().config?.['city'] as { lat: number; lng: number } | undefined;
    if (!city) {
      return;
    }
    const off = which === 'north' ? { lat: 0.027, lng: 0 } : which === 'east' ? { lat: 0, lng: 0.066 } : { lat: 0, lng: 0 };
    await this.run(() => this.api.reportLocation(this.sessionId(), city.lat + off.lat, city.lng + off.lng));
  }

  async seed(): Promise<void> {
    await this.run(() => this.debug.seedPlayers(this.sessionId(), this.seedCount));
  }

  async force(): Promise<void> {
    await this.run(() => this.debug.forceState(this.sessionId(), this.forceStateValue));
  }

  async expire(key: string): Promise<void> {
    await this.run(() => this.debug.expireTimer(this.sessionId(), key));
  }

  async actAs(): Promise<void> {
    if (this.actPlayer) {
      await this.run(() => this.debug.actAs(this.sessionId(), this.actPlayer, this.actType.trim(), {}));
    }
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await fn();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? e?.message ?? 'Failed.');
    } finally {
      this.store.refresh();
    }
  }
}
