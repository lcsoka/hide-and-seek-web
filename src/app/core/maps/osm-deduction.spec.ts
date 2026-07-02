import { area, booleanPointInPolygon, point } from '@turf/turf';
import { Feature, Point } from 'geojson';
import { applyQuestions, playArea } from './deduction';
import { DeductionQuestion, RegionQuestion } from './deduction.model';
import { osmRegion } from './osm-deduction';

/** A fake OverpassService returning fixed features for around()/pois(). */
function overpassWith(features: Feature<Point>[]): any {
  const fc = { type: 'FeatureCollection', features };
  return { around: async () => fc, pois: async () => fc };
}

function feat(lng: number, lat: number, name?: string): Feature<Point> {
  return { type: 'Feature', properties: name ? { name } : {}, geometry: { type: 'Point', coordinates: [lng, lat] } };
}

function question(category: string, ask: Record<string, unknown>, answer: Record<string, unknown>): any {
  return {
    seq: 1,
    category,
    ask: { lat: null, lng: null, radius_m: null, feature: null, start_lat: null, start_lng: null, ...ask },
    end: { lat: null, lng: null },
    answer,
  };
}

/** Build the candidate after applying one OSM region to a base around the seeker. */
function cutWith(seekerLng: number, seekerLat: number, r: { region: any; within: boolean }) {
  const base = playArea(seekerLat, seekerLng, 60);
  const q: DeductionQuestion = { id: 'r', type: 'region', label: 't', region: r.region, within: r.within } as RegionQuestion;
  return { base, cut: applyQuestions(base, [q]) };
}

describe('osm region cuts', () => {
  const airports = [feat(19.1, 47.5), feat(19.4, 47.5)]; // nearest to a seeker at 19.0 is the 19.1 one

  it('measuring "closer" keeps inside the circle around the seeker\'s nearest feature', async () => {
    const r = await osmRegion(overpassWith(airports), question('measuring', { lat: 47.5, lng: 19.0, feature: 'airport' }, { answer: 'closer' }));
    expect(r).not.toBeNull();
    expect(r!.within).toBe(true);

    const { base, cut } = cutWith(19.0, 47.5, r!);
    expect(cut).not.toBeNull();
    expect(area(cut!)).toBeLessThan(area(base));
    expect(booleanPointInPolygon(point([19.1, 47.5]), cut!)).toBe(true); // at the reference → closer
    expect(booleanPointInPolygon(point([19.4, 47.5]), cut!)).toBe(false); // far → not closer
  });

  it('measuring "further" keeps outside that circle', async () => {
    const r = await osmRegion(overpassWith(airports), question('measuring', { lat: 47.5, lng: 19.0, feature: 'airport' }, { answer: 'further' }));
    expect(r!.within).toBe(false);

    const { cut } = cutWith(19.0, 47.5, r!);
    expect(booleanPointInPolygon(point([19.1, 47.5]), cut!)).toBe(false);
    expect(booleanPointInPolygon(point([19.4, 47.5]), cut!)).toBe(true);
  });

  it('matching "yes" keeps the seeker\'s nearest-feature cell, "no" drops it', async () => {
    const yes = await osmRegion(overpassWith(airports), question('matching', { lat: 47.5, lng: 19.0, feature: 'airport' }, { answer: 'yes' }));
    const { cut: keptCut } = cutWith(19.0, 47.5, yes!);
    expect(booleanPointInPolygon(point([19.05, 47.5]), keptCut!)).toBe(true); // shares nearest (west cell)
    expect(booleanPointInPolygon(point([19.45, 47.5]), keptCut!)).toBe(false); // different nearest (east)

    const no = await osmRegion(overpassWith(airports), question('matching', { lat: 47.5, lng: 19.0, feature: 'airport' }, { answer: 'no' }));
    const { cut: droppedCut } = cutWith(19.0, 47.5, no!);
    expect(booleanPointInPolygon(point([19.05, 47.5]), droppedCut!)).toBe(false);
    expect(booleanPointInPolygon(point([19.45, 47.5]), droppedCut!)).toBe(true);
  });

  it('tentacles "out_of_range" removes the radius circle around the seeker', async () => {
    const r = await osmRegion(overpassWith([]), question('tentacles', { lat: 47.5, lng: 19.0, feature: 'zoo', radius_m: 2000 }, { answer: 'out_of_range' }));
    expect(r!.within).toBe(false);

    const { cut } = cutWith(19.0, 47.5, r!);
    expect(booleanPointInPolygon(point([19.0, 47.5]), cut!)).toBe(false); // within radius → excluded
    expect(booleanPointInPolygon(point([19.4, 47.5]), cut!)).toBe(true); // outside radius → kept
  });

  it('tentacles "in_range" keeps the nearest place\'s cell within the radius', async () => {
    const zoos = [feat(19.0, 47.505, 'North Zoo'), feat(19.0, 47.495, 'South Zoo')];
    const r = await osmRegion(overpassWith(zoos), question('tentacles', { lat: 47.5, lng: 19.0, feature: 'zoo', radius_m: 3000 }, { answer: 'in_range', feature_name: 'North Zoo' }));
    expect(r).not.toBeNull();
    expect(r!.within).toBe(true);

    const { cut } = cutWith(19.0, 47.5, r!);
    expect(booleanPointInPolygon(point([19.0, 47.503]), cut!)).toBe(true); // near North Zoo, in radius
    expect(booleanPointInPolygon(point([19.0, 47.497]), cut!)).toBe(false); // South Zoo's side
  });
});
