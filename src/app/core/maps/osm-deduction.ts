import { bbox, booleanPointInPolygon, circle, distance, nearestPoint, point, voronoi } from '@turf/turf';
import { ResolvedQuestion } from '../models/models';
import { tentacleRegion } from './deduction';
import { Poly } from './operators';
import { OverpassService } from './overpass';

/** Feature key → Overpass tag filter (mirrors config/game.php `overpass.features`). */
const FEATURE_TAGS: Record<string, string> = {
  airport: '[aeroway=aerodrome]',
  rail_station: '[railway=station]',
  museum: '[tourism=museum]',
  park: '[leisure=park]',
  hospital: '[amenity=hospital]',
  library: '[amenity=library]',
  zoo: '[tourism=zoo]',
  aquarium: '[tourism=aquarium]',
  amusement_park: '[tourism=theme_park]',
  golf_course: '[leisure=golf_course]',
  movie_theater: '[amenity=cinema]',
};

const SEARCH_KM = 80; // matching/measuring need a wide-area feature set

/**
 * Rebuild the deduction region for an OSM-backed answer (matching/measuring/
 * tentacles) by fetching the relevant features and applying the same geometry the
 * server reasoned over. Returns the region to keep plus whether to keep inside it.
 */
export async function osmRegion(overpass: OverpassService, q: ResolvedQuestion): Promise<{ region: Poly; within: boolean } | null> {
  const { lat, lng, feature, radius_m } = q.ask;
  const tag = feature ? FEATURE_TAGS[feature] : undefined;
  const answer = q.answer?.answer;
  if (!tag || lat == null || lng == null) {
    return null;
  }

  if (q.category === 'tentacles') {
    const radiusKm = (radius_m ?? 1609) / 1000;
    if (answer === 'out_of_range') {
      return { region: circle([lng, lat], radiusKm, { units: 'kilometers', steps: 64 }) as Poly, within: false };
    }
    const places = await overpass.pois(lat, lng, radiusKm, tag);
    const region = q.answer?.feature_name ? tentacleRegion(lat, lng, radiusKm, places, q.answer.feature_name) : null;

    return region ? { region, within: true } : null;
  }

  const features = await overpass.around(lat, lng, SEARCH_KM, tag);
  if (features.features.length < 2) {
    return null;
  }
  const askPoint = point([lng, lat]);

  if (q.category === 'matching') {
    const box = bbox(circle([lng, lat], SEARCH_KM, { units: 'kilometers' })) as [number, number, number, number];
    const cells = voronoi(features, { bbox: box });
    const cell = cells.features.find((c) => c && booleanPointInPolygon(askPoint, c));

    return cell ? { region: cell as Poly, within: answer === 'yes' } : null;
  }

  if (q.category === 'measuring') {
    // Reference = the seeker's nearest feature; keep within the seeker's distance to it
    // (closer) or outside it (further) — a single circle around that one feature.
    const reference = nearestPoint(askPoint, features);
    const d = Math.max(distance(askPoint, reference, { units: 'kilometers' }), 0.05);

    return { region: circle(reference, d, { units: 'kilometers', steps: 64 }) as Poly, within: answer === 'closer' };
  }

  return null;
}

export function isOsmCategory(category: string): boolean {
  return category === 'matching' || category === 'measuring' || category === 'tentacles';
}
