import { difference, featureCollection, intersect } from '@turf/turf';
import { Feature, Polygon } from 'geojson';
import { Poly } from './map.model';

/** Near-global rectangle used to invert a region (kept just inside the poles for safety). */
export const WORLD: Feature<Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[-180, -89], [180, -89], [180, 89], [-180, 89], [-180, -89]]],
  },
};

/** World minus `region` — turns a region into its complement (the "everything else" mask). */
export function holedMask(region: Poly): Poly | null {
  return difference(featureCollection([WORLD, region])) as Poly | null;
}

/**
 * Keep the part of `candidate` that is inside (`within = true`) or outside
 * (`within = false`) `region`. This is the one operation every yes/no question
 * reduces to — intersect with the region, or intersect with its complement.
 */
export function modifyMapData(candidate: Poly, region: Poly, within: boolean): Poly | null {
  if (within) {
    return intersect(featureCollection([candidate, region])) as Poly | null;
  }

  const mask = holedMask(region);

  return mask ? (intersect(featureCollection([candidate, mask])) as Poly | null) : candidate;
}
