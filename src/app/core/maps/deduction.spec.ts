import { area, booleanPointInPolygon, featureCollection, point } from '@turf/turf';
import { applyQuestions, hidingZone, hidingZoneViz, measuringRegionToBorder, playArea, tentacleRegion } from './deduction';
import { RadarQuestion, RegionQuestion, ThermometerQuestion } from './deduction.model';
import { Feature, FeatureCollection, Point, Polygon } from 'geojson';

const BUD = { lat: 47.4979, lng: 19.0402 };

describe('hidingZone carve', () => {
  // A neighbour ~0.006° east (~450 m). The bisector sits ~halfway between them.
  const center = { lat: 47.5, lng: 19.05 };
  const neighbor = { lat: 47.5, lng: 19.056 };
  const zone = hidingZone(center, 800, [neighbor]);

  it('keeps the side toward the chosen station', () => {
    expect(booleanPointInPolygon(point([19.047, 47.5]), zone)).toBe(true); // west of centre
  });

  it('carves out the area toward (and past) the neighbour', () => {
    expect(booleanPointInPolygon(point([neighbor.lng, neighbor.lat]), zone)).toBe(false); // the neighbour itself
    expect(booleanPointInPolygon(point([19.054, 47.5]), zone)).toBe(false); // past the bisector
  });

  it('is smaller than the plain radius circle', () => {
    expect(area(zone)).toBeLessThan(area(hidingZone(center, 800, [])));
  });

  it('reports the cutting station + its halfway point (the cut)', () => {
    const viz = hidingZoneViz(center, 800, [neighbor]);
    expect(viz.cuts.length).toBe(1);
    expect(viz.cuts[0].station).toEqual(neighbor);
    // The cut sits halfway between the chosen stop and the neighbour.
    expect(viz.cuts[0].mid.lng).toBeCloseTo((center.lng + neighbor.lng) / 2, 5);
    expect(viz.removed).not.toBeNull();
  });

  it('ignores a far station whose halfway line never reaches the zone', () => {
    const far = { lat: 47.5, lng: 19.2 }; // ~10 km away — its bisector is well outside the radius
    expect(hidingZoneViz(center, 800, [far]).cuts.length).toBe(0);
  });
});

describe('deduction engine', () => {
  it('radar within=true shrinks the area to the circle', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    const q: RadarQuestion = { id: '1', type: 'radar', lat: BUD.lat, lng: BUD.lng, radiusKm: 10, within: true };
    const result = applyQuestions(base, [q])!;

    expect(area(result)).toBeLessThan(area(base));
    expect(booleanPointInPolygon(point([BUD.lng, BUD.lat]), result)).toBe(true);
    expect(booleanPointInPolygon(point([BUD.lng, BUD.lat + 0.3]), result)).toBe(false); // ~33 km north
  });

  it('radar within=false removes the circle', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    const q: RadarQuestion = { id: '1', type: 'radar', lat: BUD.lat, lng: BUD.lng, radiusKm: 10, within: false };
    const result = applyQuestions(base, [q])!;

    expect(booleanPointInPolygon(point([BUD.lng, BUD.lat]), result)).toBe(false);
    expect(booleanPointInPolygon(point([BUD.lng, BUD.lat + 0.3]), result)).toBe(true);
  });

  it('thermometer keeps the side toward the warmer point', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    const q: ThermometerQuestion = {
      id: 't', type: 'thermometer',
      aLat: BUD.lat, aLng: BUD.lng - 0.2, bLat: BUD.lat, bLng: BUD.lng + 0.2, warmer: true,
    };
    const result = applyQuestions(base, [q])!;

    expect(booleanPointInPolygon(point([BUD.lng + 0.15, BUD.lat]), result)).toBe(true); // toward B
    expect(booleanPointInPolygon(point([BUD.lng - 0.15, BUD.lat]), result)).toBe(false); // toward A
  });

  it('cuts a SHORT, NE-bearing thermometer (regression: geodesic build self-intersected → no cut)', () => {
    const base = playArea(47.4825, 19.068, 10);
    const q: ThermometerQuestion = {
      id: 't', type: 'thermometer',
      aLat: 47.480436, aLng: 19.066858, bLat: 47.484613, bLng: 19.069562, warmer: true,
    };
    const result = applyQuestions(base, [q])!;

    const ratio = area(result) / area(base);
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.8); // it genuinely halved the area, not left it whole
    expect(booleanPointInPolygon(point([19.0739, 47.4917]), result)).toBe(true); // warmer (B) side kept
    expect(booleanPointInPolygon(point([19.0621, 47.4733]), result)).toBe(false); // colder (A) side dropped
  });

  it('combines questions by intersection', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    const radar: RadarQuestion = { id: '1', type: 'radar', lat: BUD.lat, lng: BUD.lng, radiusKm: 20, within: true };
    const thermo: ThermometerQuestion = {
      id: 't', type: 'thermometer',
      aLat: BUD.lat, aLng: BUD.lng - 0.2, bLat: BUD.lat, bLng: BUD.lng + 0.2, warmer: true,
    };

    expect(area(applyQuestions(base, [radar, thermo])!)).toBeLessThan(area(applyQuestions(base, [radar])!));
  });

  it('applies a precomputed region question (e.g. border band)', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    // a square region covering roughly the eastern half of the play area
    const region: Feature<Polygon> = {
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[BUD.lng, 47], [21, 47], [21, 48], [BUD.lng, 48], [BUD.lng, 47]]] },
    };
    const q: RegionQuestion = { id: 'r', type: 'region', label: 'border', region, within: true };
    const result = applyQuestions(base, [q])!;

    expect(booleanPointInPolygon(point([BUD.lng + 0.1, 47.5]), result)).toBe(true);
    expect(booleanPointInPolygon(point([BUD.lng - 0.1, 47.5]), result)).toBe(false);
  });

  it('builds a border measuring band that excludes the seeker side', () => {
    // a triangle "country"; seeker near the centre
    const boundary: Feature<Polygon> = {
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[18, 46], [22, 46], [20, 49], [18, 46]]] },
    };
    const region = measuringRegionToBorder(boundary, 47, 20);
    expect(area(region)).toBeGreaterThan(0);
  });

  it('builds a tentacle region = the chosen place\'s Voronoi cell within the radius', () => {
    const pois = featureCollection([
      point([BUD.lng - 0.05, BUD.lat], { name: 'West place' }),
      point([BUD.lng + 0.05, BUD.lat], { name: 'East place' }),
    ]) as FeatureCollection<Point>;

    const region = tentacleRegion(BUD.lat, BUD.lng, 10, pois, 'East place')!;

    expect(region).toBeTruthy();
    // a point near the east place is in the region; near the west place is not
    expect(booleanPointInPolygon(point([BUD.lng + 0.04, BUD.lat]), region)).toBe(true);
    expect(booleanPointInPolygon(point([BUD.lng - 0.04, BUD.lat]), region)).toBe(false);
  });

  it('skips unanswered questions', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    const q: RadarQuestion = { id: '1', type: 'radar', lat: BUD.lat, lng: BUD.lng, radiusKm: 10, within: null };

    expect(area(applyQuestions(base, [q])!)).toBeCloseTo(area(base), -3);
  });
});
