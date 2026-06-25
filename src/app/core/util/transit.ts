export interface TransitMode {
  id: string;
  label: string;
  icon: string;
  color: string;
}

/** Display metadata per transit mode (label, icon, colour for chips + map markers). */
export const TRANSIT_META: Record<string, TransitMode> = {
  metro: { id: 'metro', label: 'Metro', icon: '🚇', color: '#6366f1' }, // indigo
  tram: { id: 'tram', label: 'Tram', icon: '🚊', color: '#f59e0b' }, // amber
  train: { id: 'train', label: 'Train', icon: '🚆', color: '#2563eb' }, // blue
  light_rail: { id: 'light_rail', label: 'Light rail', icon: '🚈', color: '#0d9488' }, // teal
  bus: { id: 'bus', label: 'Bus', icon: '🚌', color: '#16a34a' }, // green
  trolleybus: { id: 'trolleybus', label: 'Trolleybus', icon: '🚎', color: '#9333ea' }, // purple
  stop: { id: 'stop', label: 'Stop', icon: '📍', color: '#64748b' }, // slate fallback
};

export function transitMeta(id: string): TransitMode {
  return TRANSIT_META[id] ?? TRANSIT_META['stop'];
}

/**
 * Classify an OSM transit stop's tags into the modes that serve it (most-specific
 * first). Uses the primary tag plus any explicit mode flags (a station tagged
 * `tram=yes;bus=yes` lists both), approximating "what stops here" without route data.
 */
export function classifyStop(tags: Record<string, unknown>): string[] {
  const modes: string[] = [];
  const add = (m: string) => {
    if (!modes.includes(m)) {
      modes.push(m);
    }
  };
  const yes = (key: string) => tags[key] === 'yes';

  // Primary tag → main mode.
  if (tags['railway'] === 'tram_stop') {
    add('tram');
  }
  if (tags['highway'] === 'bus_stop' || tags['amenity'] === 'bus_station') {
    add('bus');
  }
  if (tags['station'] === 'subway' || tags['railway'] === 'subway') {
    add('metro');
  }
  if (tags['railway'] === 'station' || tags['railway'] === 'halt') {
    if (yes('subway')) {
      add('metro');
    } else if (yes('light_rail')) {
      add('light_rail');
    } else if (yes('tram')) {
      add('tram');
    } else {
      add('train');
    }
  }

  // Extra modes that also serve the stop (interchanges).
  if (yes('tram')) {
    add('tram');
  }
  if (yes('subway')) {
    add('metro');
  }
  if (yes('train')) {
    add('train');
  }
  if (yes('light_rail')) {
    add('light_rail');
  }
  if (yes('bus')) {
    add('bus');
  }
  if (yes('trolleybus')) {
    add('trolleybus');
  }

  return modes.length ? modes : ['stop'];
}
