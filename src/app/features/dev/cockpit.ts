import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GodView, Position } from '../../core/models';
import { DebugApi } from '../../core/services/debug-api';
import { stepTowards } from '../../core/util/geo';
import { DevMap } from './dev-map';

const STATES = ['lobby', 'role_assignment', 'hiding', 'seeking', 'round_review', 'finished'];

@Component({
  selector: 'app-dev-cockpit',
  imports: [FormsModule, RouterLink, DevMap],
  template: `
    <main class="mx-auto w-full max-w-6xl space-y-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <a routerLink="/dev" class="text-sm text-rose-600">← Dev</a>
          <h1 class="text-lg font-bold">Dev cockpit</h1>
        </div>
        @if (god(); as g) {
          <span class="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-800">{{ g.state }} · {{ g.status }} · round {{ g.round }}</span>
        }
      </header>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <app-dev-map [players]="god()?.players ?? []" [picked]="picked()" [selectedId]="selectedId()"
                       (mapClick)="onMapClick($event)" />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Click the map to pick a point.
            @if (picked(); as p) { <span class="font-mono">{{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}</span> }
            @else { <span>(none picked)</span> }
          </p>
        </div>

        <div class="space-y-4 text-sm">
          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Acting as</h2>
            <select [ngModel]="selectedId()" (ngModelChange)="selectedId.set($event)"
                    class="w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800">
              @for (p of god()?.players ?? []; track p.id) {
                <option [value]="p.id">{{ p.display_name }}{{ p.role ? ' (' + p.role + ')' : '' }}{{ p.is_host ? ' · host' : '' }}</option>
              }
            </select>
            <div class="flex flex-wrap gap-2">
              <button (click)="spoof()" [disabled]="!selectedId() || !picked()" [class]="btn">Teleport to point</button>
              <button (click)="drive()" [disabled]="!selectedId() || !picked()" [class]="btn">Drive to point</button>
              <button (click)="stopDrive()" [class]="btnOutline">Stop driving</button>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Quick actions</h2>
            <div class="flex flex-wrap gap-2">
              <button (click)="quick('start')" [class]="btnOutline">Start game</button>
              <button (click)="quick('assign_hider', { player_id: selectedId() })" [class]="btnOutline">Assign hider (selected)</button>
              <button (click)="quick('choose_station', pointPayload())" [class]="btnOutline">Choose station (here)</button>
              <button (click)="quick('confirm_hidden')" [class]="btnOutline">Confirm hidden</button>
              <button (click)="quick('confirm_found')" [class]="btnOutline">Catch hider (selected, in range)</button>
              <button (click)="quick('advance_round')" [class]="btnOutline">Next round</button>
              <button (click)="quick('end_game')" [class]="btnOutline">End game</button>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Custom action (act as selected)</h2>
            <input [(ngModel)]="actionType" placeholder="action type, e.g. ask_question"
                   class="w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800" />
            <textarea [(ngModel)]="payloadText" rows="3" placeholder='payload JSON, e.g. {"category":"radar"}'
                      class="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono dark:border-gray-600 dark:bg-gray-800"></textarea>
            <button (click)="submit()" [disabled]="!selectedId()" [class]="btn">Submit</button>
          </section>

          <section class="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div>
              <h2 class="mb-1 font-semibold">Seed bots</h2>
              <input type="number" min="1" max="20" [(ngModel)]="seedCount" class="w-20 rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800" />
            </div>
            <button (click)="seed()" [class]="btn">Seed</button>
            <div class="flex-1">
              <h2 class="mb-1 font-semibold">Force state</h2>
              <select [(ngModel)]="forceStateValue" class="w-full rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800">
                @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <button (click)="force()" [class]="btnOutline">Force</button>
          </section>

          <section class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="mb-1 font-semibold">state_data</h2>
            <pre class="max-h-60 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">{{ stateJson() }}</pre>
          </section>
        </div>
      </div>
    </main>
  `,
})
export class DevCockpit {
  private readonly route = inject(ActivatedRoute);
  private readonly debug = inject(DebugApi);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly god = signal<GodView | null>(null);
  readonly error = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly picked = signal<Position | null>(null);

  readonly states = STATES;
  readonly btn = 'rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40';
  readonly btnOutline = 'rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800';

  actionType = 'start';
  payloadText = '';
  seedCount = 3;
  forceStateValue = 'hiding';

  private poll?: ReturnType<typeof setInterval>;
  private driveTimer?: ReturnType<typeof setInterval>;

  constructor() {
    void this.load();
    this.poll = setInterval(() => void this.load(), 2000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.poll);
      this.stopDrive();
    });
  }

  async load(): Promise<void> {
    try {
      this.apply(await this.debug.state(this.id));
      this.error.set(null);
    } catch {
      this.error.set('Debug API unavailable — is GAME_DEBUG enabled and the token set?');
    }
  }

  onMapClick(p: Position): void {
    this.picked.set(p);
  }

  pointPayload(): Record<string, number> {
    const p = this.picked();

    return p ? { lat: p.lat, lng: p.lng } : {};
  }

  async spoof(): Promise<void> {
    const id = this.selectedId();
    const p = this.picked();
    if (id && p) {
      await this.run(() => this.debug.spoofLocation(this.id, id, p.lat, p.lng));
    }
  }

  async quick(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    const id = this.selectedId();
    if (id) {
      await this.run(() => this.debug.actAs(this.id, id, type, payload));
    }
  }

  async submit(): Promise<void> {
    const id = this.selectedId();
    if (!id) {
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = this.payloadText.trim() ? JSON.parse(this.payloadText) : {};
    } catch {
      this.error.set('Payload is not valid JSON.');

      return;
    }
    await this.run(() => this.debug.actAs(this.id, id, this.actionType.trim(), payload));
  }

  async seed(): Promise<void> {
    await this.run(() => this.debug.seedPlayers(this.id, this.seedCount));
  }

  async force(): Promise<void> {
    await this.run(() => this.debug.forceState(this.id, this.forceStateValue));
  }

  drive(): void {
    const id = this.selectedId();
    const target = this.picked();
    const g = this.god();
    if (!id || !target || !g) {
      return;
    }

    const self = g.players.find((p) => p.id === id);
    let cur: Position = self?.lat != null && self?.lng != null ? { lat: self.lat, lng: self.lng } : { lat: 47.4979, lng: 19.0402 };

    this.stopDrive();
    this.driveTimer = setInterval(() => {
      const next = stepTowards(cur, target, 150); // ~150 m per second
      cur = next.pos;
      void this.run(() => this.debug.spoofLocation(this.id, id, next.pos.lat, next.pos.lng));
      if (next.arrived) {
        this.stopDrive();
      }
    }, 1000);
  }

  stopDrive(): void {
    clearInterval(this.driveTimer);
    this.driveTimer = undefined;
  }

  stateJson(): string {
    return JSON.stringify(this.god()?.state_data ?? {}, null, 2);
  }

  private apply(view: GodView): void {
    this.god.set(view);
    if (!this.selectedId() && view.players[0]) {
      this.selectedId.set(view.players[0].id);
    }
  }

  private async run(fn: () => Promise<GodView>): Promise<void> {
    try {
      this.apply(await fn());
      this.error.set(null);
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Action failed.');
    }
  }
}
