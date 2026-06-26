import { afterNextRender, Component, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { avatarIcon, colorFor, markerIcon } from '../../core/maps/avatar';
import { hidingZoneViz } from '../../core/maps/deduction';
import { OverpassService } from '../../core/maps/overpass';
import { disperse } from '../../core/maps/spread';
import { HidingZone, PlayerView, Position } from '../../core/models/models';
import { transitMeta } from '../../core/util/transit';

const BUDAPEST: L.LatLngExpression = [47.4979, 19.0402];

@Component({
  selector: 'app-map',
  host: { class: 'block h-full' },
  template: `<div #el class="h-full min-h-72 w-full overflow-hidden"></div>`,
})
export class MapView {
  readonly el = viewChild.required<ElementRef<HTMLElement>>('el');
  readonly players = input<PlayerView[]>([]);
  readonly zone = input<HidingZone | null>(null);
  readonly stations = input<{ lat: number; lng: number; name?: string; modes?: string[] }[]>([]); // nearby stops to pick from
  readonly highlight = input<Position | null>(null); // the chosen/nearest station
  readonly previewZone = input<{ lat: number; lng: number; radiusM: number } | null>(null);
  // The seeker's current question, drawn so the hider sees what's being asked.
  readonly questionMarker = input<{ lat: number; lng: number; radiusM?: number | null; label?: string } | null>(null);
  // Round-over reveal of where the hider was hiding.
  readonly reveal = input<{ lat: number; lng: number; label?: string } | null>(null);
  readonly mapClick = output<Position>();

  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private centred = false;
  private readonly overpass = inject(OverpassService);
  // All transit stops near the zone centre, fetched via the cached proxy — reliable
  // neighbours for carving the zone (the backend's synchronous fetch can be throttled to 0).
  private readonly carveNeighbors = signal<{ lat: number; lng: number }[] | null>(null);
  private carveKey = '';

  constructor() {
    afterNextRender(() => this.init());
    // Re-render whenever any rendered input changes.
    effect(() => {
      this.players();
      this.zone();
      this.stations();
      this.highlight();
      this.previewZone();
      this.questionMarker();
      this.reveal();
      this.carveNeighbors();
      this.render();
    });

    // Load the bounding transit stops for the carve whenever the active centre moves — the
    // committed zone OR, while the hider is still picking, the previewed spot. So the carved
    // zone is shown live as the hider moves around looking for somewhere to hide.
    effect(() => {
      const az = this.activeZone();
      if (!az) {
        return;
      }
      const key = `${az.lat.toFixed(4)},${az.lng.toFixed(4)}`;
      if (key === this.carveKey) {
        return;
      }
      this.carveKey = key;
      this.carveNeighbors.set(null);
      void this.overpass
        .transitStops(az.lat, az.lng, (az.radiusM * 2) / 1000)
        .then((fc) => this.carveNeighbors.set(fc.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }))))
        .catch(() => this.carveNeighbors.set([]));
    });
  }

  /** The zone being shown: the committed one, or (while picking) the previewed spot. */
  private activeZone(): { lat: number; lng: number; radiusM: number } | null {
    const z = this.zone();
    if (z) {
      return { lat: z.center.lat, lng: z.center.lng, radiusM: z.radius_m };
    }
    const p = this.previewZone();

    return p ? { lat: p.lat, lng: p.lng, radiusM: p.radiusM } : null;
  }

  /**
   * Draw the carved hiding zone: original radius (dashed), slices cut away by a nearer
   * station (red), the final zone (bold amber outline), and — for the committed zone — the
   * bounding stations (🚉). Falls back to a plain circle until the stops load.
   */
  private drawCarvedZone(center: { lat: number; lng: number }, radiusM: number, showPins: boolean): void {
    const neighbors = this.carveNeighbors() ?? [];
    if (!neighbors.length) {
      L.circle([center.lat, center.lng], { radius: radiusM, color: '#f59e0b', weight: 1, dashArray: '4 4', fillOpacity: 0.08 }).addTo(this.overlay!);

      return;
    }
    const viz = hidingZoneViz(center, radiusM, neighbors);
    L.geoJSON(viz.original, { style: { color: '#9ca3af', weight: 1, dashArray: '4 4', fill: false } }).addTo(this.overlay!);
    if (viz.removed) {
      L.geoJSON(viz.removed, { style: { stroke: false, fillColor: '#ef4444', fillOpacity: 0.15 } }).addTo(this.overlay!);
    }
    L.geoJSON(viz.carved, { style: { color: '#f59e0b', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.15 } }).addTo(this.overlay!);

    // Make it obvious WHY the zone is this size: a line from the chosen spot to every
    // station that forms an edge, with a tick at the halfway point — the zone is cut there.
    for (const cut of viz.cuts) {
      L.polyline([[center.lat, center.lng], [cut.station.lat, cut.station.lng]], { color: '#334155', weight: 1.5, dashArray: '2 4', opacity: 0.75 }).addTo(this.overlay!);
      L.circleMarker([cut.mid.lat, cut.mid.lng], { radius: 3.5, color: '#334155', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1 })
        .bindTooltip('Cut here — halfway to a nearer station', { direction: 'top' })
        .addTo(this.overlay!);
      if (showPins) {
        L.marker([cut.station.lat, cut.station.lng], { icon: markerIcon('🚉', { color: '#6b7280', size: 20 }) })
          .bindTooltip('A nearer station bounds your zone')
          .addTo(this.overlay!);
      }
    }
  }

  private init(): void {
    this.map = L.map(this.el().nativeElement, { zoomAnimation: true, fadeAnimation: true }).setView(BUDAPEST, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => this.mapClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng }));
    setTimeout(() => this.map?.invalidateSize(), 100);
    this.render();
  }

  private render(): void {
    if (!this.map) {
      return;
    }

    this.overlay?.remove();
    this.overlay = L.layerGroup().addTo(this.map);

    const located = this.players().filter((p) => p.lat != null && p.lng != null) as (PlayerView & { lat: number; lng: number })[];
    for (const p of disperse(located)) {
      const color = p.role === 'hider' ? '#e11d48' : colorFor(p.id);
      L.marker([p.lat, p.lng], { icon: avatarIcon(p.display_name, color, p.role === 'hider') })
        .bindTooltip(p.display_name)
        .addTo(this.overlay);
    }

    // The committed zone (seeking) shows the carve with bounding-station pins.
    const zone = this.zone();
    if (zone) {
      this.drawCarvedZone(zone.center, zone.radius_m, true);
    }

    // While the hider is still picking, show the SAME carve live for the previewed spot
    // (recomputed as they move) so they can see the area they'd hide in. The pickable
    // stops are drawn as their own mode-coloured markers below, so skip the grey pins.
    const preview = this.previewZone();
    if (preview && !zone) {
      this.drawCarvedZone({ lat: preview.lat, lng: preview.lng }, preview.radiusM, false);
    }
    for (const st of disperse(this.stations())) {
      const meta = transitMeta(st.modes?.[0] ?? 'stop');
      L.marker([st.lat, st.lng], { icon: markerIcon(meta.icon, { color: meta.color, size: 22 }) })
        .bindTooltip(`${meta.icon} ${st.name ?? 'stop'}`)
        .addTo(this.overlay);
    }
    // The seeker's current question: where it was asked (+ radar radius), so the hider
    // can see exactly what's being measured against them.
    const qm = this.questionMarker();
    if (qm) {
      if (qm.radiusM) {
        L.circle([qm.lat, qm.lng], { radius: qm.radiusM, color: '#2563eb', weight: 1.5, dashArray: '5', fillOpacity: 0.05 }).addTo(this.overlay);
      }
      L.marker([qm.lat, qm.lng], { icon: markerIcon('❓', { color: '#2563eb', size: 28 }) })
        .bindTooltip(qm.label ?? 'Question asked here', { permanent: true, direction: 'top', offset: [0, -18] })
        .addTo(this.overlay);
    }

    const hl = this.highlight();
    if (hl) {
      L.circleMarker([hl.lat, hl.lng], { radius: 9, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 3 }).addTo(this.overlay);
      // Zoom to the hider's station area once, so the stops + zone are legible.
      if (!this.centred) {
        this.centred = true;
        this.map.setView([hl.lat, hl.lng], 14, { animate: false });
      }
    }

    // Round-over: reveal the hider's actual spot and centre on it.
    const reveal = this.reveal();
    if (reveal) {
      L.marker([reveal.lat, reveal.lng], { icon: markerIcon('🫥', { color: '#7c3aed', emphasis: true }) })
        .bindTooltip(reveal.label ?? 'Hider was here', { permanent: true, direction: 'top', offset: [0, -22] })
        .addTo(this.overlay);
      this.map.setView([reveal.lat, reveal.lng], 15, { animate: true });
    }
  }
}
