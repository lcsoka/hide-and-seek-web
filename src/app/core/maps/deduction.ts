import { bearing, circle, destination, midpoint, point } from '@turf/turf';
import { Feature, Polygon } from 'geojson';
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

export type DeductionQuestion = RadarQuestion | ThermometerQuestion;

/** The starting candidate area: a geodesic circle around the play-area centre. */
export function playArea(lat: number, lng: number, radiusKm: number): Poly {
  return circle([lng, lat], radiusKm, { units: 'kilometers', steps: 128 }) as Poly;
}

export function radarCircle(q: RadarQuestion): Poly {
  return circle([q.lng, q.lat], q.radiusKm, { units: 'kilometers', steps: 128 }) as Poly;
}

/**
 * Half-plane of points closer to B than A (the perpendicular bisector of A–B).
 * `towardB = true` returns B's side (warmer), `false` returns A's side. Built as a
 * large rectangle straddling the bisector — far larger than any city play area.
 */
export function thermometerHalfPlane(q: ThermometerQuestion, towardB: boolean): Poly {
  const a = point([q.aLng, q.aLat]);
  const b = point([q.bLng, q.bLat]);
  const brng = bearing(a, b);
  const mid = midpoint(a, b);
  const reach = 600; // km — comfortably beyond any city-scale play area
  const side = towardB ? brng : brng + 180;

  const f1 = destination(mid, reach, brng + 90, { units: 'kilometers' });
  const f2 = destination(mid, reach, brng - 90, { units: 'kilometers' });
  const g1 = destination(f1, 2 * reach, side, { units: 'kilometers' });
  const g2 = destination(f2, 2 * reach, side, { units: 'kilometers' });

  const ring = [f1, g1, g2, f2, f1].map((p) => p.geometry.coordinates);

  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } } as Feature<Polygon>;
}

function regionFor(q: DeductionQuestion): { region: Poly; within: boolean } | null {
  if (q.type === 'radar') {
    return q.within === null ? null : { region: radarCircle(q), within: q.within };
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
