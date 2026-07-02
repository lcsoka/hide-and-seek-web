import { distanceMeters, stepTowards } from './geo';

describe('geo', () => {
  it('is ~0 for the same point', () => {
    expect(distanceMeters({ lat: 47.5, lng: 19 }, { lat: 47.5, lng: 19 })).toBeLessThan(1);
  });

  it('measures Budapest → Debrecen at roughly 190 km', () => {
    const d = distanceMeters({ lat: 47.4979, lng: 19.0402 }, { lat: 47.5316, lng: 21.6273 });
    expect(d).toBeGreaterThan(150_000);
    expect(d).toBeLessThan(250_000);
  });

  it('arrives when the step exceeds the remaining distance', () => {
    const r = stepTowards({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, 1_000_000);
    expect(r.arrived).toBe(true);
    expect(r.pos).toEqual({ lat: 0, lng: 0.001 });
  });

  it('moves partway when the step is small', () => {
    const r = stepTowards({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, 100);
    expect(r.arrived).toBe(false);
    expect(r.pos.lng).toBeGreaterThan(0);
    expect(r.pos.lng).toBeLessThan(1);
  });
});
