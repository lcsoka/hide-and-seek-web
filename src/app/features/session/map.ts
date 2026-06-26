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

    // Load the bounding transit stops for the carve when the hider's zone centre changes.
    effect(() => {
      const zone = this.zone();
      if (!zone) {
        return;
      }
      const key = `${zone.center.lat.toFixed(5)},${zone.center.lng.toFixed(5)}`;
      if (key === this.carveKey) {
        return;
      }
      this.carveKey = key;
      this.carveNeighbors.set(null);
      void this.overpass
        .transitStops(zone.center.lat, zone.center.lng, (zone.radius_m * 2) / 1000)
        .then((fc) => this.carveNeighbors.set(fc.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }))))
        .catch(() => this.carveNeighbors.set([]));
    });
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

    const zone = this.zone();
    if (zone) {
      // Show WHY the zone is the shape it is: the original radius (dashed), the slices cut
      // away because a different station is nearer (red), the final zone (bold amber
      // outline), and the bounding stations doing the cutting (grey pins). Prefer the
      // proxy-fetched stops (reliable) over the backend's (sometimes throttled to none).
      const neighbors = this.carveNeighbors() ?? zone.neighbors ?? [];
      if (neighbors.length) {
        const viz = hidingZoneViz(zone.center, zone.radius_m, neighbors);
        L.geoJSON(viz.original, { style: { color: '#9ca3af', weight: 1, dashArray: '4 4', fill: false } }).addTo(this.overlay);
        if (viz.removed) {
          L.geoJSON(viz.removed, { style: { stroke: false, fillColor: '#ef4444', fillOpacity: 0.18 } }).addTo(this.overlay);
        }
        L.geoJSON(viz.carved, { style: { color: '#f59e0b', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.15 } }).addTo(this.overlay);
        for (const n of viz.bounding) {
          L.marker([n.lat, n.lng], { icon: markerIcon('🚉', { color: '#6b7280', size: 20 }) })
            .bindTooltip('Another station — your zone is cut where this one is nearer')
            .addTo(this.overlay);
        }
      } else {
        L.circle([zone.center.lat, zone.center.lng], { radius: zone.radius_m, color: '#f59e0b', fillOpacity: 0.1 }).addTo(this.overlay);
      }
    }

    // Hider's station-picking aids: candidate radius, nearby stops, chosen station.
    const preview = this.previewZone();
    if (preview) {
      L.circle([preview.lat, preview.lng], { radius: preview.radiusM, color: '#f59e0b', weight: 1, fillOpacity: 0.08 }).addTo(this.overlay);
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
