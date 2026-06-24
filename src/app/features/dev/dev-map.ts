import { afterNextRender, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { GodPlayer, Position } from '../../core/models/models';

const BUDAPEST: L.LatLngExpression = [47.4979, 19.0402];

/** God-view map for the dev cockpit: all players, the picked point, and click-to-place. */
@Component({
  selector: 'app-dev-map',
  template: `<div #el class="h-96 w-full overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700"></div>`,
})
export class DevMap {
  readonly el = viewChild.required<ElementRef<HTMLElement>>('el');
  readonly players = input<GodPlayer[]>([]);
  readonly picked = input<Position | null>(null);
  readonly selectedId = input<string | null>(null);
  readonly mapClick = output<Position>();

  private map?: L.Map;
  private overlay?: L.LayerGroup;

  constructor() {
    afterNextRender(() => this.init());
    effect(() => {
      this.players();
      this.picked();
      this.selectedId();
      this.render();
    });
  }

  private init(): void {
    this.map = L.map(this.el().nativeElement).setView(BUDAPEST, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => this.mapClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng }));
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
        const selected = p.id === this.selectedId();
        L.circleMarker([p.lat, p.lng], {
          radius: selected ? 11 : 8,
          weight: selected ? 3 : 1,
          color: p.role === 'hider' ? '#e11d48' : '#2563eb',
          fillOpacity: 0.8,
        })
          .bindTooltip(`${p.display_name}${p.role ? ' · ' + p.role : ''}`)
          .addTo(this.overlay);
      }
    }

    const pt = this.picked();
    if (pt) {
      L.circleMarker([pt.lat, pt.lng], { radius: 6, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9 })
        .bindTooltip('picked point')
        .addTo(this.overlay);
    }
  }
}
