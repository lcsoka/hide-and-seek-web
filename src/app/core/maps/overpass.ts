import { Injectable } from '@angular/core';
import { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import osmtogeojson from 'osmtogeojson';

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

/** Thin client over the public Overpass API (CORS-enabled). */
@Injectable({ providedIn: 'root' })
export class OverpassService {
  // Primary + fallback (the public endpoints rate-limit heavy `out geom` queries with 429).
  private readonly endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  async run(ql: string): Promise<unknown> {
    const data = encodeURIComponent(ql);
    let lastError: unknown;

    for (const endpoint of this.endpoints) {
      try {
        const res = await fetch(`${endpoint}?data=${data}`);
        if (res.ok) {
          return res.json();
        }
        lastError = new Error(`Overpass request failed (${res.status})`);
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Overpass request failed');
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

  /** Nearby transit stops (rail / tram / subway / halt) for the smart hiding flow. */
  async transitStops(lat: number, lng: number, radiusKm: number): Promise<FeatureCollection<Point>> {
    const radiusM = Math.round(radiusKm * 1000);
    const filters = ['[railway=station]', '[railway=tram_stop]', '[railway=halt]', '[station=subway]'];
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
}
