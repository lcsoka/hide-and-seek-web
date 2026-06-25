import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { LocationTracker } from '../../core/services/location';
import { PlayerStore } from '../../core/services/player-store';
import { Realtime } from '../../core/services/realtime';
import { SessionStore } from '../../core/services/session-store';
import { actionLabel } from '../../core/util/labels';
import { HiderPanel } from './hider-panel';
import { HostPanel } from './host-panel';
import { MapView } from './map';
import { SeekerPanel } from './seeker-panel';

// Actions that have their own dedicated panel — hidden from the generic button row.
const PANEL_ACTIONS = ['assign_hider', 'choose_station', 'confirm_hidden', 'ask_question'];

@Component({
  selector: 'app-session',
  imports: [RouterLink, MapView, SeekerPanel, HostPanel, HiderPanel],
  template: `
    <main class="mx-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
      <a routerLink="/" class="text-sm text-rose-600">← Home</a>

      @if (store.loading() && !store.state()) {
        <p>Loading…</p>
      } @else if (store.error()) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">Couldn't load this session.</p>
      } @else if (store.state(); as s) {
        <header class="flex flex-wrap items-center justify-between gap-2">
          <h1 class="text-xl font-bold capitalize">{{ s.state }}</h1>
          <div class="flex items-center gap-2">
            @if (role(s); as r) {
              <span class="rounded-full px-2 py-1 text-xs font-medium"
                    [class]="r === 'hider' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'">{{ r }}</span>
            }
            <span class="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-800">{{ s.status }} · round {{ s.round }}</span>
          </div>
        </header>

        <section class="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div>
            <p class="text-xs text-gray-500 dark:text-gray-400">Share this code to invite friends</p>
            <p class="font-mono text-2xl font-bold tracking-widest">{{ s.join_code }}</p>
          </div>
          <button (click)="copyCode(s.join_code)"
                  class="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
            {{ copied() ? 'Copied!' : 'Copy' }}
          </button>
        </section>

        @if (role(s) === 'seeker' && (s.state === 'seeking' || s.state === 'endgame')) {
          <app-seeker-panel [state]="s" [sessionId]="s.session_id" [meId]="myId()" />
        } @else if (s.state === 'role_assignment' && isHost(s)) {
          <app-host-panel [state]="s" [sessionId]="s.session_id" />
        } @else if (s.state === 'hiding' && role(s) === 'hider') {
          <app-hider-panel [state]="s" [sessionId]="s.session_id" [meId]="myId()" />
        } @else {
          <app-map [players]="s.players" [zone]="s.hiding_zone" />
        }

        <section class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <h2 class="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Players</h2>
          <ul class="space-y-1">
            @for (p of s.players; track p.id) {
              <li class="flex justify-between text-sm">
                <span>{{ p.display_name }}@if (p.is_host) { <span class="text-gray-400"> (host)</span> }</span>
                <span class="text-gray-500 dark:text-gray-400">{{ p.role ?? '—' }}</span>
              </li>
            }
          </ul>
        </section>

        @if (s.hiding_zone; as zone) {
          <section class="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
            <h2 class="font-semibold">Your hiding zone</h2>
            <p>{{ zone.rule }} · radius {{ zone.radius_m }} m</p>
          </section>
        }

        @if (s.pending_question; as q) {
          <section class="rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-700 dark:bg-blue-950">
            Question pending ({{ q.category }}) — awaiting the hider.
          </section>
        }

        @if (visibleActions(s); as actions) {
          @if (actions.length) {
            <section class="flex flex-wrap gap-2">
              @for (a of actions; track a) {
                <button (click)="act(a)" [disabled]="acting()"
                        class="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                  {{ label(a) }}
                </button>
              }
            </section>
          }
        }

        @if (store.feed().length) {
          <section class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Events</h2>
            <ul class="space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              @for (e of store.feed(); track e.at) {
                <li>{{ e.type }}</li>
              }
            </ul>
          </section>
        }
      }
    </main>
  `,
})
export class SessionView {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly realtime = inject(Realtime);
  private readonly location = inject(LocationTracker);
  private readonly players = inject(PlayerStore);
  readonly store = inject(SessionStore);

  readonly id = signal<string | undefined>(this.route.snapshot.paramMap.get('id') ?? undefined);
  readonly myId = signal<string | null>(null);
  readonly acting = signal(false);
  readonly copied = signal(false);
  readonly label = actionLabel;

  constructor() {
    const sessionId = this.id();
    if (sessionId) {
      this.myId.set(this.players.get(sessionId));
      this.store.setSession(sessionId);
      this.realtime.connect(sessionId, this.myId(), (name) => this.store.onEvent(name));
      this.location.start(sessionId);
    }
  }

  role(s: GameState): string | null {
    return s.players.find((p) => p.id === this.myId())?.role ?? null;
  }

  isHost(s: GameState): boolean {
    return s.players.find((p) => p.id === this.myId())?.is_host ?? false;
  }

  /** Available actions minus the ones handled by a dedicated panel. */
  visibleActions(s: GameState): string[] {
    return s.available_actions.filter((a) => !PANEL_ACTIONS.includes(a));
  }

  async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  async act(type: string): Promise<void> {
    const sessionId = this.id();
    if (!sessionId) {
      return;
    }

    this.acting.set(true);
    try {
      if (type === 'start') {
        await this.api.start(sessionId);
      } else {
        await this.api.submitAction(sessionId, type);
      }
    } finally {
      this.acting.set(false);
      this.store.refresh();
    }
  }
}
