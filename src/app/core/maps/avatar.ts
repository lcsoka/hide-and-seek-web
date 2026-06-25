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

/**
 * The app's one marker style: a circular badge (white ring + shadow) holding short
 * content — initials, a number, or an emoji. Used for every point marker so they all
 * look alike. `emphasis` enlarges + double-rings it (the seeker's own marker).
 */
export function markerIcon(content: string, opts: { color: string; emphasis?: boolean; size?: number }): L.DivIcon {
  const size = opts.size ?? (opts.emphasis ? 36 : 28);
  const isText = /^[\w]+$/.test(content); // number/letters → white text; otherwise an emoji
  const font = isText ? Math.round(size * (content.length > 1 ? 0.42 : 0.5)) : Math.round(size * 0.55);
  const ring = opts.emphasis ? `0 0 0 3px #fff, 0 0 0 5px ${opts.color}` : '0 0 0 2px #fff';
  const html = `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${opts.color};${isText ? 'color:#fff;' : ''}
    display:flex;align-items:center;justify-content:center;font:700 ${font}px system-ui;box-shadow:${ring};text-shadow:0 1px 1px rgba(0,0,0,.4)">${content}</div>`;

  return L.divIcon({ html, className: 'jl-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

/** A circular avatar marker showing the player's initials. `emphasis` rings + enlarges it. */
export function avatarIcon(name: string | null | undefined, color: string, emphasis = false): L.DivIcon {
  return markerIcon(initials(name), { color, emphasis });
}
