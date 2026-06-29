import { Injectable } from '@angular/core';
import { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import osmtogeojson from 'osmtogeojson';
import { environment } from '../../../environments/environment';

export interface TransitMode {
  id: string;
  label: string;
  filters: string[]; // Overpass tag filters, e.g. '[railway=tram_stop]'
}

/** Public-transport modes. Metro + tram are the game default; the rest are opt-in. */
export const TRANSIT_MODES: TransitMode[] = [
  { id: 'metro', label: 'Metro', filters: ['[railway=station][subway=yes]', '[station=subway]'] },
  { id: 'tram', label: 'Tram', filters: ['[railway=tram_stop]'] },
  { id: 'rail', label: 'Rail', filters: ['[railway=station][subway!=yes][light_rail!=yes]'] },
  { id: 'light_rail', label: 'Light rail', filters: ['[railway=station][light_rail=yes]', '[railway=halt][light_rail=yes]'] },
  { id: 'bus', label: 'Bus', filters: ['[highway=bus_stop]'] },
  { id: 'trolleybus', label: 'Trolleybus', filters: ['[public_transport=stop_position][trolleybus=yes]'] },
];

export const DEFAULT_TRANSIT_MODES = ['metro', 'tram'];
/** Every transit mode id — the seeker may board ANY of these (independent of the game's hiding modes). */
export const ALL_TRANSIT_MODES = TRANSIT_MODES.map((m) => m.id);

/** A public-transport line serving a stop (one OSM `type=route` relation = one direction). */
export interface RouteLine {
  id: string; // relation id, for fetching geometry
  ref: string; // line label, e.g. "47", "M2"
  mode: string; // our mode id (tram/metro/light_rail/rail/bus/trolleybus)
  name: string;
  to: string; // terminus (the route's `to` tag), to tell the two directions apart
  colour?: string; // OSM `colour` tag, e.g. "#FFD700"
}

/** our mode id → the OSM `route` relation value; and the reverse. */
const ROUTE_VALUE: Record<string, string> = {
  metro: 'subway', tram: 'tram', light_rail: 'light_rail', rail: 'train', bus: 'bus', trolleybus: 'trolleybus',
};
const MODE_OF_ROUTE: Record<string, string> = {
  subway: 'metro', tram: 'tram', light_rail: 'light_rail', train: 'rail', railway: 'rail', bus: 'bus', trolleybus: 'trolleybus',
};

export interface PoiType {
  id: string;
  label: string;
  filter: string;
  defaultRadiusKm: number;
}

/** Tentacle POI categories (from the original game): ~15 mi for big attractions, ~1 mi for the rest. */
export const POI_TYPES: PoiType[] = [
  { id: 'theme_park', label: 'Theme park', filter: '[tourism=theme_park]', defaultRadiusKm: 24 },
  { id: 'zoo', label: 'Zoo', filter: '[tourism=zoo]', defaultRadiusKm: 24 },
  { id: 'aquarium', label: 'Aquarium', filter: '[tourism=aquarium]', defaultRadiusKm: 24 },
  { id: 'museum', label: 'Museum', filter: '[tourism=museum]', defaultRadiusKm: 1.6 },
  { id: 'hospital', label: 'Hospital', filter: '[amenity=hospital]', defaultRadiusKm: 1.6 },
  { id: 'cinema', label: 'Cinema', filter: '[amenity=cinema]', defaultRadiusKm: 1.6 },
  { id: 'library', label: 'Library', filter: '[amenity=library]', defaultRadiusKm: 1.6 },
];

/**
 * OSM data client. Every query goes through the BACKEND Overpass proxy
 * (`POST /geo/overpass`), which holds the authoritative 6h cache and is the only thing
 * that talks to the public Overpass mirrors — the browser never hits OSM directly. A small
 * in-memory + sessionStorage cache here just de-dupes repeat queries within a session.
 */
@Injectable({ providedIn: 'root' })
export class OverpassService {
  private readonly proxyUrl = `${environment.apiBase}/geo/overpass`;

  // Cache responses — OSM data is stable, and the hiding flow, picker, and deduction
  // otherwise re-request the same queries (and on every reload). In-memory for the session
  // + sessionStorage so reloads are free; the backend is the cross-client/source cache.
  private static readonly TTL_MS = 6 * 60 * 60 * 1000; // 6h, mirrors the server cache
  private readonly mem = new Map<string, unknown>();
  private inflight = new Map<string, Promise<unknown>>();

  async run(ql: string): Promise<unknown> {
    const key = `ovp:${ql}`;
    const cached = this.mem.get(key) ?? this.readStored(key);
    if (cached !== undefined) {
      this.mem.set(key, cached);
      return cached;
    }
    // De-dupe concurrent identical queries (e.g. the same feature fetched twice).
    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const promise = this.fetchFromBackend(ql).then((result) => {
      this.mem.set(key, result);
      this.writeStored(key, result);

      return result;
    });
    this.inflight.set(key, promise);

    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Run the query through the backend proxy (server-cached); the browser never calls public
   * Overpass. Retries a few times — the proxy returns 502 when every OSM mirror is
   * momentarily throttled, and a short wait usually clears it (then it's cached 6h).
   */
  private async fetchFromBackend(ql: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
      try {
        const res = await fetch(this.proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ql }),
        });
        if (res.ok) {
          return await res.json();
        }
        lastError = new Error(`Overpass proxy request failed (${res.status})`);
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Overpass proxy request failed');
  }

  private readStored(key: string): unknown {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) {
        return undefined;
      }
      const { at, value } = JSON.parse(raw) as { at: number; value: unknown };
      if (Date.now() - at > OverpassService.TTL_MS) {
        sessionStorage.removeItem(key);
        return undefined;
      }

      return value;
    } catch {
      return undefined;
    }
  }

  private writeStored(key: string, value: unknown): void {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
    } catch {
      // storage full / unavailable — the in-memory cache still applies
    }
  }

  /** The administrative boundary at `adminLevel` containing the point (8 = city, 6 = county, 2 = country). */
  async adminBoundary(lat: number, lng: number, adminLevel: number): Promise<Feature<Polygon | MultiPolygon> | null> {
    const ql = `[out:json][timeout:30];is_in(${lat},${lng})->.a;rel(pivot.a)["admin_level"="${adminLevel}"]["boundary"="administrative"];out geom;`;
    const geo = osmtogeojson(await this.run(ql)) as FeatureCollection;
    const poly = geo.features.find((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');

    return (poly as Feature<Polygon | MultiPolygon>) ?? null;
  }

  /** Public-transport stops of the given Overpass filters within bbox [west, south, east, north]. */
  async stations(bbox: [number, number, number, number], filters: string[]): Promise<FeatureCollection<Point>> {
    const [west, south, east, north] = bbox;
    const body = filters.map((f) => `nwr${f}(${south},${west},${north},${east});`).join('');
    const ql = `[out:json][timeout:30];(${body});out center;`;
    const geo = osmtogeojson(await this.run(ql)) as FeatureCollection;
    const features = geo.features.filter((f) => f.geometry?.type === 'Point') as Feature<Point>[];

    return { type: 'FeatureCollection', features };
  }

  /** Named POIs of one tag filter within `radiusKm` of a point (deduped by name; nameless dropped). */
  async pois(lat: number, lng: number, radiusKm: number, filter: string): Promise<FeatureCollection<Point>> {
    const radiusM = Math.round(radiusKm * 1000);
    const ql = `[out:json][timeout:30];(nwr${filter}(around:${radiusM},${lat},${lng}););out center;`;
    const geo = osmtogeojson(await this.run(ql)) as FeatureCollection;

    const seen = new Set<string>();
    const features: Feature<Point>[] = [];
    for (const f of geo.features) {
      if (f.geometry?.type !== 'Point') {
        continue;
      }
      const name = (f.properties?.['name'] ?? f.properties?.['name:en']) as string | undefined;
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      features.push({ ...f, properties: { ...f.properties, name } } as Feature<Point>);
    }

    return { type: 'FeatureCollection', features };
  }

  /** All point features of one tag filter within `radiusKm` of a point (no name filtering). */
  async around(lat: number, lng: number, radiusKm: number, filter: string): Promise<FeatureCollection<Point>> {
    const radiusM = Math.round(radiusKm * 1000);
    const ql = `[out:json][timeout:30];(nwr${filter}(around:${radiusM},${lat},${lng}););out center;`;
    const geo = osmtogeojson(await this.run(ql)) as FeatureCollection;
    const features = geo.features.filter((f) => f.geometry?.type === 'Point') as Feature<Point>[];

    return { type: 'FeatureCollection', features };
  }

  /** Nearby transit stops for the smart hiding flow, limited to the game's allowed modes. */
  async transitStops(lat: number, lng: number, radiusKm: number, modeIds?: string[]): Promise<FeatureCollection<Point>> {
    const radiusM = Math.round(radiusKm * 1000);
    const filters = OverpassService.filtersFor(modeIds?.length ? modeIds : DEFAULT_TRANSIT_MODES);
    const body = filters.map((f) => `nwr${f}(around:${radiusM},${lat},${lng});`).join('');
    const ql = `[out:json][timeout:30];(${body});out center;`;
    const geo = osmtogeojson(await this.run(ql)) as FeatureCollection;
    const features = geo.features.filter((f) => f.geometry?.type === 'Point') as Feature<Point>[];

    return { type: 'FeatureCollection', features };
  }

  /** Resolve the Overpass tag filters for a set of selected mode ids. */
  static filtersFor(modeIds: string[]): string[] {
    return TRANSIT_MODES.filter((m) => modeIds.includes(m.id)).flatMap((m) => m.filters);
  }

  /** Public-transport lines (route relations) passing within `radiusM` of a stop. */
  async transitRoutes(lat: number, lng: number, modeIds?: string[], radiusM = 140): Promise<RouteLine[]> {
    const values = (modeIds?.length ? modeIds : DEFAULT_TRANSIT_MODES).map((m) => ROUTE_VALUE[m]).filter(Boolean);
    if (!values.length) {
      return [];
    }
    const ql = `[out:json][timeout:25];rel(around:${radiusM},${lat},${lng})[type=route][route~"^(${values.join('|')})$"];out tags;`;
    const res = (await this.run(ql)) as { elements?: { id: number; tags?: Record<string, string> }[] };

    return (res.elements ?? []).map((e) => ({
      id: String(e.id),
      ref: String(e.tags?.['ref'] ?? e.tags?.['name'] ?? '?'),
      mode: MODE_OF_ROUTE[e.tags?.['route'] ?? ''] ?? 'bus',
      name: String(e.tags?.['name'] ?? ''),
      to: String(e.tags?.['to'] ?? ''),
      colour: e.tags?.['colour'],
    }));
  }

  /** The path a route follows, as one polyline per member way (lat/lng points). */
  async routeGeometry(relationId: string): Promise<{ lat: number; lng: number }[][]> {
    const ql = `[out:json][timeout:25];rel(${relationId});out geom;`;
    const res = (await this.run(ql)) as { elements?: { members?: { type: string; geometry?: { lat: number; lon: number }[] }[] }[] };
    const members = res.elements?.[0]?.members ?? [];

    return members
      .filter((m) => m.type === 'way' && Array.isArray(m.geometry))
      .map((m) => m.geometry!.map((g) => ({ lat: g.lat, lng: g.lon })));
  }
}
