/** Display metadata for a transit mode (label, icon, colour for chips + map markers). */
export interface TransitMeta {
  id: string;
  label: string;
  icon: string;
  color: string;
}

/**
 * A nearby public-transport stop. A single real stop (its two directional platforms already
 * collapsed) that the hider can hide at or the seeker can board from.
 */
export interface TransitStop {
  name: string;
  lat: number;
  lng: number;
  distM: number;
  modes: string[]; // transit modes serving the stop (metro/tram/bus/…), most-specific first
}

/**
 * A boardable line: one line number of one mode (e.g. "27 tram") with both travel directions
 * collapsed. The seeker picks this once instead of a stop that lists the line twice (per direction).
 */
export interface GroupedLine {
  ref: string; // line label, e.g. "27", "M2"
  mode: string; // metro/tram/train/light_rail/bus/trolleybus
  colour?: string; // OSM `colour` tag
  routeIds: string[]; // every direction's relation id (for drawing the full line)
  destinations: string[]; // distinct termini (`to` tags), to show "→ A / B"
}

/** A route's path being shown on the map (one polyline per member way). */
export interface DisplayedRoute {
  ref: string;
  mode: string;
  lines: { lat: number; lng: number }[][];
}
