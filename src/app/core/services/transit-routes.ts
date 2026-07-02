import { computed, inject, Injectable, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService } from '../maps/overpass';
import { RouteLine } from '../maps/overpass.model';
import { classifyStop } from '../util/transit';
import { DisplayedRoute, TransitStop } from './transit.model';

/**
 * Seeker's transit boarding helper: the nearby stops to board at, the lines serving the
 * chosen stop, and the route path currently drawn on the map. Used by the board picker
 * (to choose) and the map (to draw the line the seeker previews / is riding).
 */
@Injectable({ providedIn: 'root' })
export class TransitRoutes {
  private readonly overpass = inject(OverpassService);

  readonly stops = signal<TransitStop[] | null>(null);
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
  async loadRoutes(stop: TransitStop, modeIds?: string[]): Promise<void> {
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

  /**
   * Re-draw the line a seeker is already riding (e.g. after a reload) — the geometry is
   * in-memory, so re-find the route by ref/mode near where they boarded and draw it.
   */
  async restoreActive(lat: number, lng: number, ref: string, mode: string, modeIds?: string[]): Promise<void> {
    if (this.displayed()) {
      return;
    }
    this.inflight.update((n) => n + 1);
    try {
      const lines = await this.overpass.transitRoutes(lat, lng, modeIds);
      const match = lines.find((l) => l.ref === ref && l.mode === mode) ?? lines.find((l) => l.ref === ref);
      if (match) {
        const geom = await this.overpass.routeGeometry(match.id);
        this.displayed.set({ ref: match.ref, mode: match.mode, lines: geom });
      }
    } catch {
      // leave it undrawn — the journey log still shows the ride
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
