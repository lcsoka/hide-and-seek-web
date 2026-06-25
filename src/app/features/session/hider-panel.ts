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
  templateUrl: './hider-panel.html',
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
