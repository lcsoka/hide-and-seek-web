import { TransitStop } from './transit.model';
import { collapseDirectionalStops, sameStation } from './transit-stops';

const stop = (name: string, lat: number, lng: number, modes: string[] = ['tram']): TransitStop => ({ name, lat, lng, distM: 0, modes });

describe('collapseDirectionalStops', () => {
  it('merges opposite-direction platforms staggered across a wide road (same name + type, ~150 m)', () => {
    // ~150 m apart along a boulevard — beyond the old 90 m twin gap that used to split the zone.
    const out = collapseDirectionalStops([stop('Blaha Lujza tér', 47.4966, 19.07), stop('Blaha Lujza tér', 47.4966, 19.072)]);

    expect(out.length).toBe(1);
    expect(out[0].name).toBe('Blaha Lujza tér');
  });

  it('merges a tight interchange regardless of type (<= 90 m), unioning the modes', () => {
    const out = collapseDirectionalStops([stop('Deák Ferenc tér', 47.4976, 19.0547, ['metro']), stop('Deák Ferenc tér', 47.4977, 19.055, ['tram'])]);

    expect(out.length).toBe(1);
    expect(out[0].modes).toEqual(['metro', 'tram']); // nearest-first kept, then the twin's modes unioned in
  });

  it('does NOT merge same-name stops too far apart to be one station (> 220 m)', () => {
    expect(collapseDirectionalStops([stop('Duplicate', 47.5, 19.05), stop('Duplicate', 47.5, 19.058)]).length).toBe(2);
  });

  it('does NOT merge same-name different-type stops in the stagger band (90–220 m)', () => {
    expect(collapseDirectionalStops([stop('Mixed', 47.5, 19.05, ['tram']), stop('Mixed', 47.5, 19.0515, ['bus'])]).length).toBe(2);
  });

  it('keeps genuinely different stations (different names) apart', () => {
    expect(collapseDirectionalStops([stop('Astoria', 47.494, 19.059), stop('Kálvin tér', 47.489, 19.061)]).length).toBe(2);
  });

  it('never merges unnamed stops together', () => {
    expect(collapseDirectionalStops([stop('Unnamed stop', 47.5, 19.05), stop('Unnamed stop', 47.5001, 19.05)]).length).toBe(2);
  });
});

describe('sameStation', () => {
  it('is symmetric-ish on the type check within the stagger band', () => {
    expect(sameStation(stop('X', 47.5, 19.05, ['tram', 'bus']), stop('X', 47.5, 19.0515, ['bus']))).toBe(true);
    expect(sameStation(stop('X', 47.5, 19.05, ['tram']), stop('X', 47.5, 19.0515, ['bus']))).toBe(false);
  });
});
