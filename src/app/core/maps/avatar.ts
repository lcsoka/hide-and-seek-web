import * as L from 'leaflet';

/** Up-to-two-letter initials from a display name ("Anna Kovács" → "AK", "Bo" → "BO"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable, pleasant colour derived from a seed string (e.g. a player id/name). */
export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return `hsl(${hash % 360} 62% 45%)`;
}

/** A circular avatar marker showing the player's initials. `emphasis` rings + enlarges it. */
export function avatarIcon(name: string | null | undefined, color: string, emphasis = false): L.DivIcon {
  const size = emphasis ? 36 : 28;
  const ring = emphasis ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : '0 0 0 2px #fff';
  const html = `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;
    display:flex;align-items:center;justify-content:center;font:700 ${emphasis ? 14 : 11}px system-ui;
    box-shadow:${ring};text-shadow:0 1px 1px rgba(0,0,0,.4)">${initials(name)}</div>`;

  return L.divIcon({ html, className: 'jl-avatar', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
