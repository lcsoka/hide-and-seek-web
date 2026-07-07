import { Feature, MultiPolygon, Polygon } from 'geojson';
import { Position } from '../models';

/** A GeoJSON polygon feature — the shape every deduction region/candidate reduces to. */
export type Poly = Feature<Polygon | MultiPolygon>;

/** One of the Hungarian cities the game supports, with its centre for boundary lookups. */
export interface City {
  slug: string;
  name: string;
  lat: number;
  lng: number;
}

/** Translate a key (with optional interpolation params) — Transloco's `translate`. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** A numbered, explained marker for an answered question on the deduction map. */
export interface MapAnnotation {
  n: number;
  seq: number;
  category: string;
  /** app-icon name for the question's subject (in-app inline SVG). */
  iconName: string;
  answer: string;
  /** Short explanation of how this question cut the map. */
  effect: string;
  point: Position | null;
  radarKm?: number;
  within?: boolean;
  thermo?: { a: Position; b: Position };
  photoUrl?: string;
  /** The reference OSM feature (matching/measuring/tentacles) — shown as a labelled pin. */
  feature?: { lat: number; lng: number; name: string | null };
}
