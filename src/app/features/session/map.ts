import { afterNextRender, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { HidingZone, PlayerView, Position } from '../../core/models/models';

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
  readonly mapClick = output<Position>();

  private map?: L.Map;
  private overlay?: L.LayerGroup;

  constructor() {
    afterNextRender(() => this.init());
    // Re-render whenever the visible players or the hiding zone change.
    effect(() => {
      this.players();
      this.zone();
      this.render();
    });
  }

  private init(): void {
    this.map = L.map(this.el().nativeElement).setView(BUDAPEST, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
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

    for (const p of this.players()) {
      if (p.lat != null && p.lng != null) {
        L.circleMarker([p.lat, p.lng], {
          radius: 8,
          color: p.role === 'hider' ? '#e11d48' : '#2563eb',
          fillOpacity: 0.8,
        })
          .bindTooltip(p.display_name)
          .addTo(this.overlay);
      }
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
  }
}
