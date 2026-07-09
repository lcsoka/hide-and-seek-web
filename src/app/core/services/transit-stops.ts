import { TransitStop } from './transit.model';

/** Flat-earth metres between two nearby lat/lng points (fine at stop-to-stop distances). */
export function stopMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111000;
  const dLng = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);

  return Math.hypot(dLat, dLng);
}

/**
 * Whether two same-named stops are the SAME station (so one must not carve the other's hiding zone).
 * Very close ⇒ yes (a tight interchange, whatever the modes). Otherwise, up to a road's width of
 * stagger ⇒ yes only when they share a transit type — the classic opposite-direction platform split
 * across a wide road, which used to sit beyond the old 90 m gap and halve the zone.
 */
export function sameStation(a: TransitStop, b: TransitStop): boolean {
  const m = stopMetres(a, b);
  if (m <= 90) {
    return true;
  }
  if (m > 220) {
    return false;
  }

  return a.modes.some((mode) => b.modes.includes(mode));
}

/**
 * A real transit stop appears in OSM as one platform node per travel direction: same name, same
 * modes, but often on opposite sides of the road and STAGGERED along it — routinely tens of metres
 * apart, sometimes past 100 m on a wide boulevard. Those are ONE station for the game, so collapse
 * them into the closest one (merging their modes). Otherwise the carve draws a perpendicular
 * bisector toward the twin platform and eats half the zone. Input must be sorted nearest-first, so
 * the kept representative is the closest platform.
 */
export function collapseDirectionalStops(stops: TransitStop[]): TransitStop[] {
  const kept: TransitStop[] = [];
  for (const s of stops) {
    const twin = s.name !== 'Unnamed stop' ? kept.find((k) => k.name === s.name && sameStation(k, s)) : undefined;
    if (twin) {
      twin.modes = [...new Set([...twin.modes, ...s.modes])];
    } else {
      kept.push({ ...s });
    }
  }

  return kept;
}
