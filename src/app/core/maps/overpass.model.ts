export interface TransitMode {
  id: string;
  label: string;
  filters: string[]; // Overpass tag filters, e.g. '[railway=tram_stop]'
}

/** A public-transport line serving a stop (one OSM `type=route` relation = one direction). */
export interface RouteLine {
  id: string; // relation id, for fetching geometry
  ref: string; // line label, e.g. "47", "M2"
  mode: string; // our mode id (tram/metro/light_rail/rail/bus/trolleybus)
  name: string;
  to: string; // terminus (the route's `to` tag), to tell the two directions apart
  colour?: string; // OSM `colour` tag, e.g. "#FFD700"
}

export interface PoiType {
  id: string;
  label: string;
  filter: string;
  defaultRadiusKm: number;
}
