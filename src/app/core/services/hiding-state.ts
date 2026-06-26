import { computed, inject, Injectable, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService } from '../maps/overpass';
import { Position } from '../models/models';
import { classifyStop } from '../util/transit';

export interface NearbyStation {
  name: string;
  lat: number;
  lng: number;
  distM: number;
  modes: string[]; // transit modes serving the stop (metro/tram/bus/…), most-specific first
}

/**
 * Shared hiding selection: the nearby transit stops and the chosen one. Used by the
 * hider's panel (to pick) and the shell (to show them on the map).
 */
@Injectable({ providedIn: 'root' })
export class HidingState {
  private readonly overpass = inject(OverpassService);

  readonly stations = signal<NearbyStation[] | null>(null);
  readonly selected = signal<NearbyStation | null>(null);
  private loadedKey: string | null = null;

  // > 0 while any hiding-zone work (station list OR the map's carve) is in flight, so the
  // UI can show a "calculating…" indicator. Incremented by loadFor + MapView's carve fetch.
  private readonly inflight = signal(0);
  readonly calculating = computed(() => this.inflight() > 0);

  readonly selectedPosition = computed<Position | null>(() => {
    const s = this.selected();

    return s ? { lat: s.lat, lng: s.lng } : null;
  });

  beginWork(): void {
    this.inflight.update((n) => n + 1);
  }

  endWork(): void {
    this.inflight.update((n) => Math.max(0, n - 1));
  }

  async loadFor(lat: number, lng: number, modeIds?: string[]): Promise<void> {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${(modeIds ?? []).join(',')}`;
    if (key === this.loadedKey) {
      return;
    }
    this.loadedKey = key;
    this.beginWork();

    try {
      const fc = await this.overpass.transitStops(lat, lng, 1.5, modeIds);
      const here = point([lng, lat]);
      const list = fc.features
        .map((f) => {
          const [flng, flat] = (f.geometry as Point).coordinates;

          return {
            name: String(f.properties?.['name'] ?? 'Unnamed stop'),
            lat: flat,
            lng: flng,
            distM: Math.round(distance(here, f as Feature<Point>, { units: 'kilometers' }) * 1000),
            modes: classifyStop(f.properties ?? {}),
          };
        })
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 8);
      this.stations.set(list);
      this.selected.set(list[0] ?? null);
    } catch {
      // Transient failure (Overpass throttled past the retries) — don't cache it: clear the
      // key so the next position update (or re-render) tries again instead of staying empty.
      this.loadedKey = null;
      this.stations.set(this.stations() ?? []);
    } finally {
      this.endWork();
    }
  }
}
