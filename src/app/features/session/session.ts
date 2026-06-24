import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import { LocationTracker } from '../../core/location';
import { Realtime } from '../../core/realtime';

@Component({
  selector: 'app-session',
  imports: [RouterLink],
  template: `
    <main class="mx-auto max-w-lg p-6 space-y-4">
      <a routerLink="/" class="text-sm text-rose-600">← Home</a>

      @if (state.isLoading()) {
        <p>Loading…</p>
      } @else if (state.error()) {
        <p class="rounded bg-red-100 p-2 text-sm text-red-700">Couldn't load this session.</p>
      } @else if (state.value(); as s) {
        <header class="flex items-center justify-between">
          <h1 class="text-xl font-bold capitalize">{{ s.state }}</h1>
          <span class="rounded bg-gray-100 px-2 py-1 text-xs">{{ s.status }} · round {{ s.round }}</span>
        </header>

        <section class="rounded-lg border p-3">
          <h2 class="mb-2 text-sm font-semibold text-gray-500">Players</h2>
          <ul class="space-y-1">
            @for (p of s.players; track p.id) {
              <li class="flex justify-between text-sm">
                <span>{{ p.display_name }}@if (p.is_host) { <span class="text-gray-400"> (host)</span> }</span>
                <span class="text-gray-500">{{ p.role ?? '—' }}</span>
              </li>
            }
          </ul>
        </section>

        @if (s.hiding_zone; as zone) {
          <section class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <h2 class="font-semibold">Your hiding zone</h2>
            <p>{{ zone.rule }} · radius {{ zone.radius_m }} m</p>
          </section>
        }

        @if (s.pending_question; as q) {
          <section class="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm">
            Question pending ({{ q.category }}) — awaiting the hider.
          </section>
        }

        <section class="flex flex-wrap gap-2">
          @for (a of s.available_actions; track a) {
            <button (click)="act(a)" [disabled]="acting()"
                    class="rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {{ a }}
            </button>
          } @empty {
            <p class="text-sm text-gray-400">No actions available right now.</p>
          }
        </section>
      }
    </main>
  `,
})
export class SessionView {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly realtime = inject(Realtime);
  private readonly location = inject(LocationTracker);

  readonly id = signal<string | undefined>(this.route.snapshot.paramMap.get('id') ?? undefined);
  readonly state = this.api.stateResource(this.id);
  readonly acting = signal(false);

  constructor() {
    const sessionId = this.id();
    if (sessionId) {
      this.realtime.connect(sessionId, null, () => this.state.reload());
      this.location.start(sessionId);
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
      this.state.reload();
    }
  }
}
