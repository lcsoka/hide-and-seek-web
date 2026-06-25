import { afterNextRender, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { avatarIcon, colorFor } from '../../core/maps/avatar';
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
      L.circle([zone.center.lat, zone.center.lng], {
        radius: zone.radius_m,
        color: '#f59e0b',
        fillOpacity: 0.1,
      }).addTo(this.overlay);

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
      L.circleMarker([st.lat, st.lng], { radius: 5, color: meta.color, fillColor: meta.color, fillOpacity: 0.9, weight: 1 })
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
      L.marker([qm.lat, qm.lng], {
        icon: L.divIcon({
          html: `<div style="font-size:20px;line-height:20px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">❓</div>`,
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      })
        .bindTooltip(qm.label ?? 'Question asked here', { permanent: true, direction: 'top', offset: [0, -8] })
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
  }
}
