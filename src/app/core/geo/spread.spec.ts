import { disperse } from './spread';

describe('disperse', () => {
  it('leaves markers at distinct positions unchanged', () => {
    const items = [
      { lat: 47.5, lng: 19.0, id: 'a' },
      { lat: 47.6, lng: 19.1, id: 'b' },
    ];
    expect(disperse(items)).toEqual(items);
  });

  it('spreads coincident markers into a small distinct ring', () => {
    const items = [
      { lat: 47.5, lng: 19.0, id: 'a' },
      { lat: 47.5, lng: 19.0, id: 'b' },
      { lat: 47.5, lng: 19.0, id: 'c' },
    ];
    const out = disperse(items, 12);

    // All three end up at distinct positions...
    const keys = new Set(out.map((o) => `${o.lat.toFixed(6)},${o.lng.toFixed(6)}`));
    expect(keys.size).toBe(3);
    // ...preserving the original data...
    expect(out.map((o) => o.id).sort()).toEqual(['a', 'b', 'c']);
    // ...within ~12 m of the original spot.
    for (const o of out) {
      expect(Math.hypot(o.lat - 47.5, o.lng - 19.0)).toBeLessThan(0.0005);
    }
  });
});
