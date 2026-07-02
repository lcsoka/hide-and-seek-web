import { Poly } from './map.model';

export interface RadarQuestion {
  id: string;
  type: 'radar';
  lat: number;
  lng: number;
  radiusKm: number;
  within: boolean | null;
}

export interface ThermometerQuestion {
  id: string;
  type: 'thermometer';
  aLat: number;
  aLng: number;
  bLat: number;
  bLng: number;
  warmer: boolean | null; // true = getting warmer travelling A → B
}

/**
 * A question whose region is precomputed elsewhere (e.g. a measuring buffer to the
 * country border, or an administrative-zone match) — the engine just keeps inside
 * or outside it. Lets async/OSM-derived geometry plug into the sync engine.
 */
export interface RegionQuestion {
  id: string;
  type: 'region';
  label: string;
  region: Poly;
  within: boolean | null;
  yesLabel?: string; // answer label for within=true (default "Inside")
  noLabel?: string; //  answer label for within=false (default "Outside")
}

export type DeductionQuestion = RadarQuestion | ThermometerQuestion | RegionQuestion;

export interface ZoneCut {
  station: { lat: number; lng: number };
  mid: { lat: number; lng: number }; // the halfway point (on the carved boundary) — where it cuts
}

export interface HidingZoneViz {
  original: Poly; // the full radius circle (before carving)
  carved: Poly; // the final hiding zone
  removed: Poly | null; // the slices cut away (original − carved), to shade differently
  cuts: ZoneCut[]; // the stations whose halfway line forms a zone edge (what makes it small)
}
