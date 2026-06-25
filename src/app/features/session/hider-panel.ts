import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService } from '../../core/maps/overpass';
import { GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';

interface NearbyStation {
  name: string;
  lat: number;
  lng: number;
  distM: number;
}

/** Smart hiding: auto-find the nearest station to the hider and confirm in one tap. */
@Component({
  selector: 'app-hider-panel',
  template: `
    <section class="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <h2 class="font-semibold">Find your hiding spot</h2>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      @if (!hasLocation()) {
        <p class="text-sm text-gray-600 dark:text-gray-300">Waiting for your GPS location — enable location to find the nearest station.</p>
      } @else if (stations() === null) {
        <p class="text-sm text-gray-600 dark:text-gray-300">Finding stations near you…</p>
      } @else if (selected(); as sel) {
        <div class="rounded-lg border border-amber-300 bg-white p-3 dark:border-amber-700 dark:bg-gray-900">
          <p class="text-xs text-gray-500 dark:text-gray-400">Hide near</p>
          <p class="text-lg font-bold">{{ sel.name }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ sel.distM }} m away</p>
        </div>
        <button (click)="hideHere()" [disabled]="busy()"
                class="w-full rounded-lg bg-rose-600 p-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
          {{ busy() ? 'Hiding…' : "I'm hidden here" }}
        </button>

        @if (others().length) {
          <details class="text-sm">
            <summary class="cursor-pointer text-gray-600 dark:text-gray-300">Pick a different stop</summary>
            <ul class="mt-2 space-y-1">
              @for (st of others(); track st.name + st.distM) {
                <li>
                  <button (click)="selected.set(st)" class="flex w-full justify-between rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900">
                    <span>{{ st.name }}</span><span class="text-gray-500">{{ st.distM }} m</span>
                  </button>
                </li>
              }
            </ul>
          </details>
        }
      } @else {
        <p class="text-sm text-gray-600 dark:text-gray-300">No stations found nearby. Move closer to a station.</p>
      }
    </section>
  `,
})
export class HiderPanel {
  private readonly api = inject(ApiClient);
  private readonly overpass = inject(OverpassService);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly meId = input<string | null>(null);

  readonly stations = signal<NearbyStation[] | null>(null);
  readonly selected = signal<NearbyStation | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private loading = false;

  readonly me = computed(() => this.state().players.find((p) => p.id === this.meId()));
  readonly hasLocation = computed(() => this.me()?.lat != null && this.me()?.lng != null);
  readonly others = computed(() => this.stations()?.filter((s) => s !== this.selected()) ?? []);

  constructor() {
    effect(() => {
      const m = this.me();
      if (m?.lat != null && m?.lng != null && this.stations() === null && !this.loading) {
        void this.loadStations(m.lat, m.lng);
      }
    });
  }

  private async loadStations(lat: number, lng: number): Promise<void> {
    this.loading = true;
    try {
      const fc = await this.overpass.transitStops(lat, lng, 1.5);
      const here = point([lng, lat]);
      const list = fc.features
        .map((f) => {
          const [flng, flat] = (f.geometry as Point).coordinates;

          return {
            name: String(f.properties?.['name'] ?? 'Unnamed stop'),
            lat: flat,
            lng: flng,
            distM: Math.round(distance(here, f as Feature<Point>, { units: 'kilometers' }) * 1000),
          };
        })
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 6);
      this.stations.set(list);
      this.selected.set(list[0] ?? null);
    } catch {
      this.stations.set([]);
      this.error.set('Could not load nearby stations.');
    } finally {
      this.loading = false;
    }
  }

  async hideHere(): Promise<void> {
    const station = this.selected();
    if (!station) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.submitAction(this.sessionId(), 'choose_station', { lat: station.lat, lng: station.lng });
      await this.api.submitAction(this.sessionId(), 'confirm_hidden', {});
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Could not confirm — make sure you are at the station.');
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
