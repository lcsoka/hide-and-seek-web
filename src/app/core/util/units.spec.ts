import { formatDistance, RADAR_PRESETS, unitsOf } from './units';

describe('units', () => {
  it('reads the unit system from config, defaulting to metric', () => {
    expect(unitsOf({ units: 'imperial' })).toBe('imperial');
    expect(unitsOf({ units: 'metric' })).toBe('metric');
    expect(unitsOf({})).toBe('metric');
    expect(unitsOf(null)).toBe('metric');
  });

  it('formats metric distances in m / km', () => {
    expect(formatDistance(500, 'metric')).toBe('500 m');
    expect(formatDistance(1500, 'metric')).toBe('1.5 km');
    expect(formatDistance(50000, 'metric')).toBe('50 km');
  });

  it('formats imperial distances in ft / mi', () => {
    expect(formatDistance(8047, 'imperial')).toBe('5.0 mi');
    expect(formatDistance(40234, 'imperial')).toBe('25 mi');
  });

  it('offers radar presets per unit system', () => {
    expect(RADAR_PRESETS.metric[0].meters).toBe(500);
    expect(RADAR_PRESETS.imperial.some((p) => p.meters === 1609)).toBe(true);
  });
});
