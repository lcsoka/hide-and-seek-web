import { computed, inject, Injectable, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService } from '../maps/overpass';
import { Position } from '../models';
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

  readonly stations = signal<NearbyStation[] | null>(null); // the 8 nearest, for the picker
  readonly allStops = signal<{ lat: number; lng: number }[] | null>(null); // every nearby stop, for the map's carve
  readonly selected = signal<NearbyStation | null>(null);
  private loadedKey: string | null = null;

  // > 0 while the nearby-stops fetch is in flight, so the UI can show a "calculating…"
  // indicator. One fetch now feeds both the picker and the carve.
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

  /**
   * Fetch the nearby transit stops ONCE for both the picker (8 nearest) and the map's carve
   * (all of them, filtered to the zone). `carveRadiusM` widens the fetch enough to cover the
   * carve (radius × 2) for the current game size.
   */
  async loadFor(lat: number, lng: number, modeIds?: string[], carveRadiusM = 400): Promise<void> {
    const fetchKm = Math.max(1.5, (carveRadiusM * 2) / 1000 + 0.3);
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${(modeIds ?? []).join(',')}|${Math.round(fetchKm * 10)}`;
    if (key === this.loadedKey) {
      return;
    }
    this.loadedKey = key;
    this.beginWork();

    try {
      const fc = await this.overpass.transitStops(lat, lng, fetchKm, modeIds);
      const here = point([lng, lat]);
      const all = fc.features
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
        .sort((a, b) => a.distM - b.distM);
      const stops = this.collapseDirectionalStops(all);
      this.allStops.set(stops.map((s) => ({ lat: s.lat, lng: s.lng })));
      this.stations.set(stops.slice(0, 8));
      this.selected.set(stops[0] ?? null);
    } catch {
      // Transient failure (Overpass throttled past the retries) — don't cache it: clear the
      // key so the next position update (or re-render) tries again instead of staying empty.
      this.loadedKey = null;
      this.stations.set(this.stations() ?? []);
    } finally {
      this.endWork();
    }
  }

  /**
   * A real transit stop appears in OSM as one platform node per travel direction: same name, a
   * few tens of metres apart, same modes. Those are ONE station for the game — so collapse
   * same-named stops within SAME_STATION_M into the closest one (merging their modes). Otherwise
   * the carve draws a perpendicular bisector toward the twin platform and eats half the zone.
   * Input is sorted nearest-first, so the kept representative is the closest platform.
   */
  private collapseDirectionalStops(stops: NearbyStation[]): NearbyStation[] {
    const SAME_STATION_M = 90;
    const kept: NearbyStation[] = [];
    for (const s of stops) {
      const twin =
        s.name !== 'Unnamed stop'
          ? kept.find((k) => k.name === s.name && this.metresBetween(k, s) <= SAME_STATION_M)
          : undefined;
      if (twin) {
        twin.modes = [...new Set([...twin.modes, ...s.modes])];
      } else {
        kept.push({ ...s });
      }
    }

    return kept;
  }

  private metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const dLat = (a.lat - b.lat) * 111000;
    const dLng = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);

    return Math.hypot(dLat, dLng);
  }
}
