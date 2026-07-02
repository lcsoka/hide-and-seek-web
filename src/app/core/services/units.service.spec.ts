import { UnitsService } from './units.service';

describe('UnitsService', () => {
  const units = new UnitsService();

  it('reads the unit system from config, defaulting to metric', () => {
    expect(units.unitsOf({ units: 'imperial' })).toBe('imperial');
    expect(units.unitsOf({ units: 'metric' })).toBe('metric');
    expect(units.unitsOf({})).toBe('metric');
    expect(units.unitsOf(null)).toBe('metric');
  });

  it('formats metric distances in m / km', () => {
    expect(units.formatDistance(500, 'metric')).toBe('500 m');
    expect(units.formatDistance(1500, 'metric')).toBe('1.5 km');
    expect(units.formatDistance(50000, 'metric')).toBe('50 km');
  });

  it('formats imperial distances in ft / mi', () => {
    expect(units.formatDistance(8047, 'imperial')).toBe('5.0 mi');
    expect(units.formatDistance(40234, 'imperial')).toBe('25 mi');
  });

  it('offers radar presets per unit system', () => {
    expect(units.radarPresets.metric[0].meters).toBe(500);
    expect(units.radarPresets.imperial.some((p) => p.meters === 1609)).toBe(true);
  });
});
