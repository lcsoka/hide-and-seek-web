import { area, booleanPointInPolygon, point } from '@turf/turf';
import { applyQuestions, measuringRegionToBorder, playArea, RadarQuestion, RegionQuestion, ThermometerQuestion } from './deduction';
import { Feature, Polygon } from 'geojson';

const BUD = { lat: 47.4979, lng: 19.0402 };

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

  it('skips unanswered questions', () => {
    const base = playArea(BUD.lat, BUD.lng, 50);
    const q: RadarQuestion = { id: '1', type: 'radar', lat: BUD.lat, lng: BUD.lng, radiusKm: 10, within: null };

    expect(area(applyQuestions(base, [q])!)).toBeCloseTo(area(base), -3);
  });
});
