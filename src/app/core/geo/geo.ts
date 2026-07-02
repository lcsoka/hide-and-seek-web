import { Position } from '../models';

/** Great-circle distance between two points, in metres (Haversine). */
export function distanceMeters(a: Position, b: Position): number {
  const earth = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Move `meters` from `from` toward `to`; returns the new position and whether it arrived. */
export function stepTowards(from: Position, to: Position, meters: number): { pos: Position; arrived: boolean } {
  const total = distanceMeters(from, to);
  if (total <= meters || total === 0) {
    return { pos: to, arrived: true };
  }

  const fraction = meters / total;

  return {
    pos: { lat: from.lat + (to.lat - from.lat) * fraction, lng: from.lng + (to.lng - from.lng) * fraction },
    arrived: false,
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
