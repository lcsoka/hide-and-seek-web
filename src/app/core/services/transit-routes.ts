import { computed, inject, Injectable, signal } from '@angular/core';
import { distance, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { OverpassService } from '../maps/overpass';
import { TransitService } from './transit.service';
import { DisplayedRoute, GroupedLine, TransitStop } from './transit.model';

/** Rail-bound modes first, buses last — how boardable lines are ordered in the picker. */
const MODE_ORDER = ['metro', 'train', 'light_rail', 'tram', 'trolleybus', 'bus'];

/**
 * Seeker's transit boarding helper: the nearby boardable lines (grouped by number + mode, both
 * directions collapsed) and the route path currently drawn on the map. Used by the board picker
 * (to choose a line) and the map (to draw the line the seeker previews / is riding).
 */
@Injectable({ providedIn: 'root' })
export class TransitRoutes {
  private readonly overpass = inject(OverpassService);
  private readonly transitService = inject(TransitService);

  readonly lines = signal<GroupedLine[] | null>(null); // nearby boardable lines
  readonly stops = signal<TransitStop[] | null>(null); // nearby stops (boarding-point lookup)
  readonly displayed = signal<DisplayedRoute | null>(null); // drawn on the map
  private readonly inflight = signal(0);
  readonly busy = computed(() => this.inflight() > 0);

  /**
   * Nearby boardable lines: one entry per line number + mode (e.g. "27 tram"), with both travel
   * directions collapsed and their termini gathered — so the seeker picks "tram 27" once instead
   * of scrolling a long list of stops that each repeat every line twice.
   */
  async loadLines(lat: number, lng: number, modeIds?: string[]): Promise<void> {
    this.lines.set(null);
    this.inflight.update((n) => n + 1);
    try {
      // Stops (for the boarding point) + route relations near the seeker, fetched together.
      const [stops, routeLines] = await Promise.all([
        this.nearbyStops(lat, lng, modeIds),
        this.overpass.transitRoutes(lat, lng, modeIds, 250),
      ]);
      this.stops.set(stops);

      // Collapse the two directional relations of each line into a single entry.
      const grouped = new Map<string, GroupedLine>();
      for (const l of routeLines) {
        if (!l.ref || l.ref === '?') {
          continue;
        }
        const key = `${l.mode}:${l.ref}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.routeIds.push(l.id);
          if (l.to && !existing.destinations.includes(l.to)) {
            existing.destinations.push(l.to);
          }
        } else {
          grouped.set(key, {
            ref: l.ref,
            mode: l.mode,
            colour: l.colour,
            routeIds: [l.id],
            destinations: l.to ? [l.to] : [],
          });
        }
      }

      const ordered = [...grouped.values()].sort((a, b) => {
        const ma = this.modeRank(a.mode);
        const mb = this.modeRank(b.mode);

        return ma !== mb ? ma - mb : this.refRank(a.ref) - this.refRank(b.ref) || a.ref.localeCompare(b.ref);
      });
      this.lines.set(ordered);
    } catch {
      this.lines.set([]);
      this.stops.set([]);
    } finally {
      this.inflight.update((n) => Math.max(0, n - 1));
    }
  }

  /** The nearest stop the seeker boards a line at — closest one serving that mode. */
  boardStopFor(line: GroupedLine): TransitStop | null {
    const stops = this.stops() ?? [];

    return stops.find((s) => s.modes.includes(line.mode)) ?? stops[0] ?? null;
  }

  /** Fetch + draw a grouped line's full path (every direction) on the map. */
  async showLine(line: GroupedLine): Promise<void> {
    this.inflight.update((n) => n + 1);
    try {
      const parts = await Promise.all(line.routeIds.map((id) => this.overpass.routeGeometry(id).catch(() => [])));
      this.displayed.set({ ref: line.ref, mode: line.mode, lines: parts.flat() });
    } catch {
      this.displayed.set(null);
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

  clearDisplayed(): void {
    this.displayed.set(null);
  }

  reset(): void {
    this.lines.set(null);
    this.stops.set(null);
  }

  /** The nearby stops within 500 m, closest first, each classified into the modes it serves. */
  private async nearbyStops(lat: number, lng: number, modeIds?: string[]): Promise<TransitStop[]> {
    const fc = await this.overpass.transitStops(lat, lng, 0.5, modeIds);
    const here = point([lng, lat]);

    return fc.features
      .map((f) => {
        const [flng, flat] = (f.geometry as Point).coordinates;

        return {
          name: String(f.properties?.['name'] ?? 'Unnamed stop'),
          lat: flat,
          lng: flng,
          distM: Math.round(distance(here, f as Feature<Point>, { units: 'kilometers' }) * 1000),
          modes: this.transitService.classifyStop(f.properties ?? {}),
        };
      })
      .sort((a, b) => a.distM - b.distM);
  }

  private modeRank(mode: string): number {
    const i = MODE_ORDER.indexOf(mode);

    return i < 0 ? MODE_ORDER.length : i;
  }

  /** Numeric rank of a line label so "2, 4, 27" sort before "M4"/named lines. */
  private refRank(ref: string): number {
    const n = parseInt(ref.replace(/^\D+/, ''), 10);

    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
  }
}
