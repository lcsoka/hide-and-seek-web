import { computed, inject, Injectable, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService } from '../maps/overpass';
import { Position } from '../models/models';

export interface NearbyStation {
  name: string;
  lat: number;
  lng: number;
  distM: number;
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

  readonly selectedPosition = computed<Position | null>(() => {
    const s = this.selected();

    return s ? { lat: s.lat, lng: s.lng } : null;
  });

  async loadFor(lat: number, lng: number): Promise<void> {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (key === this.loadedKey) {
      return;
    }
    this.loadedKey = key;

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
    }
  }
}
