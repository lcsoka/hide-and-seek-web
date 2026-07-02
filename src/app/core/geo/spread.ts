/**
 * Spread markers that share (near-)identical coordinates into a small ring so they
 * don't fully overlap on the map. Markers at distinct spots are returned unchanged.
 */
export function disperse<T extends { lat: number; lng: number }>(items: T[], radiusM = 12): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`; // ~1 m precision
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const n = group.length;
    group.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / n;
      const dLat = (radiusM / 111320) * Math.cos(angle);
      const dLng = (radiusM / (111320 * Math.cos((item.lat * Math.PI) / 180))) * Math.sin(angle);
      out.push({ ...item, lat: item.lat + dLat, lng: item.lng + dLng });
    });
  }

  return out;
}
