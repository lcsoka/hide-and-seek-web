import { afterNextRender, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { avatarIcon, colorFor, markerIcon } from '../../core/maps/avatar';
import { hidingZone } from '../../core/maps/deduction';
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
      this.render();
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
      // Draw the true (carved) zone: the radius circle minus areas closer to another
      // station, so the hider sees exactly where their station stays the nearest.
      if (zone.neighbors?.length) {
        const carved = hidingZone(zone.center, zone.radius_m, zone.neighbors);
        L.geoJSON(carved, { style: { color: '#f59e0b', weight: 2, fillOpacity: 0.12 } }).addTo(this.overlay);
      } else {
        L.circle([zone.center.lat, zone.center.lng], { radius: zone.radius_m, color: '#f59e0b', fillOpacity: 0.1 }).addTo(this.overlay);
      }

      for (const n of zone.neighbors ?? []) {
        L.circleMarker([n.lat, n.lng], { radius: 4, color: '#9ca3af' }).addTo(this.overlay);
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
