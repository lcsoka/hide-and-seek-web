import { DistancePreset, Units } from './units.model';

/** Radar distance presets per unit system (the ask only sends metres). */
export const RADAR_PRESETS: Record<Units, DistancePreset[]> = {
  metric: [
    { label: '500 m', meters: 500 },
    { label: '1 km', meters: 1000 },
    { label: '2 km', meters: 2000 },
    { label: '5 km', meters: 5000 },
    { label: '10 km', meters: 10000 },
    { label: '25 km', meters: 25000 },
    { label: '50 km', meters: 50000 },
  ],
  imperial: [
    { label: '¼ mi', meters: 402 },
    { label: '½ mi', meters: 805 },
    { label: '1 mi', meters: 1609 },
    { label: '3 mi', meters: 4828 },
    { label: '5 mi', meters: 8047 },
    { label: '10 mi', meters: 16093 },
    { label: '25 mi', meters: 40234 },
  ],
};

/** Thermometer travel distances — how far the seeker commits to move before stopping. */
export const THERMO_PRESETS: Record<Units, DistancePreset[]> = {
  metric: [
    { label: '500 m', meters: 500 },
    { label: '1 km', meters: 1000 },
    { label: '3 km', meters: 3000 },
    { label: '5 km', meters: 5000 },
    { label: '10 km', meters: 10000 },
  ],
  imperial: [
    { label: '½ mi', meters: 805 },
    { label: '1 mi', meters: 1609 },
    { label: '3 mi', meters: 4828 },
    { label: '5 mi', meters: 8047 },
    { label: '10 mi', meters: 16093 },
  ],
};

export function unitsOf(config: Record<string, unknown> | undefined | null): Units {
  return config?.['units'] === 'imperial' ? 'imperial' : 'metric';
}

export function formatDistance(meters: number, units: Units): string {
  if (units === 'imperial') {
    const miles = meters / 1609.34;

    return miles < 0.25 ? `${Math.round(meters / 0.3048)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  }

  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
