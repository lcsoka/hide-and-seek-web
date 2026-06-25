import { bbox, buffer, circle, difference, featureCollection, intersect, point, pointToPolygonDistance, simplify, voronoi } from '@turf/turf';
import { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { modifyMapData, Poly } from './operators';

/**
 * Client-side deduction engine, ported from taibeled/JetLagHideAndSeek.
 * Maintain one candidate polygon (where the hider can still be) and shrink it
 * per answered question: radar keeps inside/outside a circle, thermometer keeps
 * the half-plane on the warmer side. `null` answers are skipped.
 */

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

/**
 * Measuring region for "is the hider closer to the country border than the seeker?".
 * The region is the band within the seeker's own border-distance of the boundary
 * (boundary minus the boundary shrunk inward by that distance). Keep-inside =
 * hider is closer to the border. The boundary is simplified first for performance.
 */
export function measuringRegionToBorder(boundary: Feature<Polygon | MultiPolygon>, seekerLat: number, seekerLng: number): Poly {
  const simplified = simplify(boundary, { tolerance: 0.005, highQuality: false }) as Feature<Polygon | MultiPolygon>;
  const seeker = point([seekerLng, seekerLat]);
  const dist = Math.max(Math.abs(pointToPolygonDistance(seeker, simplified, { units: 'kilometers' })), 0.05);
  const inner = buffer(simplified, -dist, { units: 'kilometers' });
  const band = inner ? difference(featureCollection([simplified, inner])) : null;

  return (band ?? simplified) as Poly;
}

/** The starting candidate area: a geodesic circle around the play-area centre. */
export function playArea(lat: number, lng: number, radiusKm: number): Poly {
  return circle([lng, lat], radiusKm, { units: 'kilometers', steps: 128 }) as Poly;
}

export function radarCircle(q: RadarQuestion): Poly {
  return circle([q.lng, q.lat], q.radiusKm, { units: 'kilometers', steps: 128 }) as Poly;
}

/**
 * Half-plane of points closer to B than A (the perpendicular bisector of A–B).
 * `towardB = true` returns B's side (warmer), `false` returns A's side.
 *
 * Built as a large PLANAR quad in lng/lat (lng scaled by cos(lat) so the bisector is
 * truly perpendicular). A planar quad stays simple at any bearing — the earlier
 * geodesic-`destination` version could self-intersect over its 600 km reach, which
 * silently left the candidate uncut.
 */
export function thermometerHalfPlane(q: ThermometerQuestion, towardB: boolean): Poly {
  const midLat = (q.aLat + q.bLat) / 2;
  const k = Math.cos((midLat * Math.PI) / 180) || 1; // lng→x scale at this latitude

  // Unit vector A→B in the scaled plane.
  let ux = (q.bLng - q.aLng) * k;
  let uy = q.bLat - q.aLat;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  if (!towardB) {
    ux = -ux;
    uy = -uy;
  }
  // Perpendicular (along the bisector) in the scaled plane.
  const px = -uy;
  const py = ux;

  const mx = (q.aLng + q.bLng) / 2;
  const my = midLat;
  const reach = 8; // scaled degrees (~800 km) — beyond any play area, keeps the quad simple
  // Back to lng/lat from scaled (x, y) offsets at the midpoint.
  const at = (sx: number, sy: number): [number, number] => [mx + sx / k, my + sy];

  const ring = [
    at(px * reach, py * reach), // bisector, one end
    at(px * reach + ux * 2 * reach, py * reach + uy * 2 * reach), // pushed toward B
    at(-px * reach + ux * 2 * reach, -py * reach + uy * 2 * reach),
    at(-px * reach, -py * reach), // bisector, other end
    at(px * reach, py * reach),
  ];

  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } } as Feature<Polygon>;
}

/**
 * Tentacles region: within `radiusKm` of the centre, the Voronoi cell of the POI
 * nearest the hider — i.e. the chosen place's cell clipped to the radius circle.
 * (Voronoi cells come back in the same order as the input points.)
 */
export function tentacleRegion(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  pois: FeatureCollection<Point>,
  chosenName: string,
): Poly | null {
  const radiusCircle = circle([centerLng, centerLat], radiusKm, { units: 'kilometers', steps: 64 }) as Poly;
  if (pois.features.length < 2) {
    return radiusCircle; // only one candidate place — its cell is the whole circle
  }

  const cells = voronoi(pois, { bbox: bbox(radiusCircle) as [number, number, number, number] });
  const idx = pois.features.findIndex((f) => f.properties?.['name'] === chosenName);
  const cell = idx >= 0 ? cells.features[idx] : null;
  if (!cell) {
    return null;
  }

  return (intersect(featureCollection([cell as Poly, radiusCircle])) as Poly) ?? null;
}

function regionFor(q: DeductionQuestion): { region: Poly; within: boolean } | null {
  if (q.type === 'radar') {
    return q.within === null ? null : { region: radarCircle(q), within: q.within };
  }

  if (q.type === 'region') {
    return q.within === null ? null : { region: q.region, within: q.within };
  }

  // thermometer — the region is the side to keep, so within is always true
  return q.warmer === null ? null : { region: thermometerHalfPlane(q, q.warmer), within: true };
}

/** Fold every answered question onto the base area and return the remaining candidate region. */
export function applyQuestions(base: Poly, questions: DeductionQuestion[]): Poly | null {
  let candidate: Poly | null = base;

  for (const q of questions) {
    if (!candidate) {
      break;
    }

    const r = regionFor(q);
    if (!r) {
      continue;
    }

    try {
      candidate = modifyMapData(candidate, r.region, r.within);
    } catch {
      // a degenerate intersection (e.g. empty) — leave the candidate as-is
    }
  }

  return candidate;
}
