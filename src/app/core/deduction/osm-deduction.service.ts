import { Injectable, inject } from '@angular/core';
import { bbox, booleanPointInPolygon, circle, distance, nearestPoint, point, voronoi } from '@turf/turf';
import { ResolvedQuestion } from '../models';
import { measuringRegionToBorder, tentacleRegion } from './deduction';
import { Poly } from '../maps/map.model';
import { OverpassService } from '../maps/overpass';

/** Feature key → Overpass tag filter (mirrors config/game.php `overpass.features`). */
export const FEATURE_TAGS: Record<string, string> = {
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

/** The reference feature the server already resolved (the seeker's nearest place), as a turf point. */
function serverReference(q: ResolvedQuestion): ReturnType<typeof point> | null {
  const { feature_lat, feature_lng } = q.answer ?? {};

  return feature_lat != null && feature_lng != null ? point([feature_lng, feature_lat]) : null;
}

export function isOsmCategory(category: string): boolean {
  return category === 'matching' || category === 'measuring' || category === 'tentacles';
}

@Injectable({ providedIn: 'root' })
export class OsmDeductionService {
  private readonly overpass = inject(OverpassService);

  /**
   * Rebuild the deduction region for an OSM-backed answer (matching/measuring/
   * tentacles) by fetching the relevant features and applying the same geometry the
   * server reasoned over. Returns the region to keep plus whether to keep inside it.
   */
  async region(q: ResolvedQuestion): Promise<{ region: Poly; within: boolean } | null> {
    const { lat, lng, feature, radius_m, admin_level, boundary_level } = q.ask;
    const tag = feature ? FEATURE_TAGS[feature] : undefined;
    const answer = q.answer?.answer;
    // No answer (e.g. a question that couldn't be computed) must not cut the map.
    if (!answer || lat == null || lng == null) {
      return null;
    }

    // Zone matching ("same administrative division as me?"): keep (yes) or remove (no) the
    // admin boundary the seeker is standing in. No point feature involved.
    if (q.category === 'matching' && admin_level != null) {
      const boundary = await this.overpass.adminBoundary(lat, lng, admin_level);

      return boundary ? { region: boundary as Poly, within: answer === 'yes' } : null;
    }

    // Border measuring ("closer to the {international/county} border than me?"): the band within the
    // seeker's OWN distance of that boundary line — keep inside (closer) or outside (further).
    if (q.category === 'measuring' && boundary_level != null) {
      const boundary = await this.overpass.adminBoundary(lat, lng, boundary_level);

      return boundary ? { region: measuringRegionToBorder(boundary, lat, lng), within: answer === 'closer' } : null;
    }

    if (!tag) {
      return null; // the remaining categories need a point-feature tag
    }

    const askPoint = point([lng, lat]);

    if (q.category === 'tentacles') {
      const radiusKm = (radius_m ?? 1609) / 1000;
      if (answer === 'out_of_range') {
        return { region: circle([lng, lat], radiusKm, { units: 'kilometers', steps: 64 }) as Poly, within: false };
      }
      const places = await this.overpass.pois(lat, lng, radiusKm, tag);
      const region = q.answer?.feature_name ? tentacleRegion(lat, lng, radiusKm, places, q.answer.feature_name) : null;

      return region ? { region, within: true } : null;
    }

    if (q.category === 'measuring') {
      // Reference = the seeker's nearest feature; keep within the seeker's distance to it
      // (closer) or outside it (further) — a single circle around that one feature. The
      // server already computed that reference, so reuse it — no Overpass call needed.
      const reference = serverReference(q) ?? nearestPoint(askPoint, await this.overpass.around(lat, lng, SEARCH_KM, tag));
      const d = Math.max(distance(askPoint, reference, { units: 'kilometers' }), 0.05);

      return { region: circle(reference, d, { units: 'kilometers', steps: 64 }) as Poly, within: answer === 'closer' };
    }

    if (q.category === 'matching') {
      // The Voronoi cell of the seeker's reference feature needs the full local feature
      // set, so this one still fetches (cached client-side until a self-hosted backend).
      const features = await this.overpass.around(lat, lng, SEARCH_KM, tag);
      if (features.features.length < 2) {
        return null;
      }
      const box = bbox(circle([lng, lat], SEARCH_KM, { units: 'kilometers' })) as [number, number, number, number];
      const cells = voronoi(features, { bbox: box });
      // The cell must be the one around the seeker's CONFIRMED reference place — not the
      // ask point, whose nearest feature can differ from the place the seeker picked.
      const ref = serverReference(q) ?? askPoint;
      const cell = cells.features.find((c) => c && booleanPointInPolygon(ref, c));

      return cell ? { region: cell as Poly, within: answer === 'yes' } : null;
    }

    return null;
  }
}
