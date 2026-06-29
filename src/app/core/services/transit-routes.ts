import { computed, inject, Injectable, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService, RouteLine } from '../maps/overpass';
import { classifyStop } from '../util/transit';

export interface NearbyStop {
  name: string;
  lat: number;
  lng: number;
  distM: number;
  modes: string[];
}

/** A route's path being shown on the map (one polyline per member way). */
export interface DisplayedRoute {
  ref: string;
  mode: string;
  lines: { lat: number; lng: number }[][];
}

/**
 * Seeker's transit boarding helper: the nearby stops to board at, the lines serving the
 * chosen stop, and the route path currently drawn on the map. Used by the board picker
 * (to choose) and the map (to draw the line the seeker previews / is riding).
 */
@Injectable({ providedIn: 'root' })
export class TransitRoutes {
  private readonly overpass = inject(OverpassService);

  readonly stops = signal<NearbyStop[] | null>(null);
  readonly routes = signal<RouteLine[] | null>(null); // lines at the selected stop
  readonly displayed = signal<DisplayedRoute | null>(null); // drawn on the map
  private readonly inflight = signal(0);
  readonly busy = computed(() => this.inflight() > 0);

  /** Nearby stops to board at (the 10 closest of the game's modes). */
  async loadStops(lat: number, lng: number, modeIds?: string[]): Promise<void> {
    this.inflight.update((n) => n + 1);
    try {
      const fc = await this.overpass.transitStops(lat, lng, 0.5, modeIds);
      const here = point([lng, lat]);
      const stops = fc.features
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
        .slice(0, 10);
      this.stops.set(stops);
    } catch {
      this.stops.set([]);
    } finally {
      this.inflight.update((n) => Math.max(0, n - 1));
    }
  }

  /** Lines serving a stop, deduped to one entry per ref+direction. */
  async loadRoutes(stop: NearbyStop, modeIds?: string[]): Promise<void> {
    this.routes.set(null);
    this.inflight.update((n) => n + 1);
    try {
      const lines = await this.overpass.transitRoutes(stop.lat, stop.lng, modeIds);
      const seen = new Set<string>();
      const deduped = lines.filter((l) => {
        const key = `${l.mode}:${l.ref}:${l.to}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);

        return true;
      });
      this.routes.set(deduped);
    } catch {
      this.routes.set([]);
    } finally {
      this.inflight.update((n) => Math.max(0, n - 1));
    }
  }

  /** Fetch + draw a line's path on the map. */
  async showRoute(line: RouteLine): Promise<void> {
    this.inflight.update((n) => n + 1);
    try {
      const lines = await this.overpass.routeGeometry(line.id);
      this.displayed.set({ ref: line.ref, mode: line.mode, lines });
    } catch {
      this.displayed.set(null);
    } finally {
      this.inflight.update((n) => Math.max(0, n - 1));
    }
  }

  clearDisplayed(): void {
    this.displayed.set(null);
  }

  reset(): void {
    this.stops.set(null);
    this.routes.set(null);
  }
}
