import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { bbox } from '@turf/turf';
import { Feature, FeatureCollection, GeoJsonObject, Point } from 'geojson';
import * as L from 'leaflet';
import { DeductionQuestion } from '../../core/maps/deduction';
import { holedMask, Poly } from '../../core/maps/operators';
import { Position } from '../../core/models/models';

const BUDAPEST: L.LatLngExpression = [47.4979, 19.0402];

/**
 * Renders the deduction state: the eliminated area as a translucent mask (the
 * candidate region shows through), each question's geometry, and auto-zoom to
 * what's left. Clicking the map emits a position (used to place questions).
 */
@Component({
  selector: 'app-deduction-map',
  host: { class: 'block h-full' },
  template: `<div #el class="h-full min-h-72 w-full overflow-hidden"></div>`,
})
export class DeductionMap {
  readonly el = viewChild.required<ElementRef<HTMLElement>>('el');
  readonly candidate = input<Poly | null>(null);
  readonly questions = input<DeductionQuestion[]>([]);
  readonly stations = input<FeatureCollection<Point> | null>(null);
  readonly points = input<FeatureCollection<Point> | null>(null); // highlighted POIs (e.g. tentacle candidates)
  readonly overlays = input<Feature[]>([]); // e.g. admin borders, drawn as outlines
  readonly autoZoom = input(true);
  readonly mapClick = output<Position>();

  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private resize?: ResizeObserver;

  constructor() {
    afterNextRender(() => this.init());
    effect(() => {
      this.candidate();
      this.questions();
      this.stations();
      this.points();
      this.overlays();
      this.render();
    });
    inject(DestroyRef).onDestroy(() => {
      this.resize?.disconnect();
      this.map?.remove();
    });
  }

  private init(): void {
    this.map = L.map(this.el().nativeElement).setView(BUDAPEST, 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => this.mapClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng }));
    // Full-bleed/flex containers settle their size after init — re-fit whenever the
    // container resizes so auto-zoom always uses the final dimensions.
    this.resize = new ResizeObserver(() => {
      this.map?.invalidateSize();
      this.render();
    });
    this.resize.observe(this.el().nativeElement);
    this.render();
  }

  private render(): void {
    if (!this.map) {
      return;
    }

    this.overlay?.remove();
    this.overlay = L.layerGroup().addTo(this.map);

    const cand = this.candidate();
    if (cand) {
      const mask = holedMask(cand);
      if (mask) {
        L.geoJSON(mask as GeoJsonObject, {
          style: { weight: 0, fillColor: '#334155', fillOpacity: 0.55 },
          interactive: false,
        }).addTo(this.overlay);
      }
      L.geoJSON(cand as GeoJsonObject, { style: { color: '#16a34a', weight: 2, fill: false } }).addTo(this.overlay);
    }

    for (const overlay of this.overlays()) {
      L.geoJSON(overlay as GeoJsonObject, { style: { color: '#a855f7', weight: 2, dashArray: '6', fill: false }, interactive: false }).addTo(this.overlay);
    }

    for (const s of this.stations()?.features ?? []) {
      const [lng, lat] = s.geometry.coordinates;
      L.circleMarker([lat, lng], { radius: 3, color: '#0891b2', fillColor: '#0891b2', fillOpacity: 0.9, weight: 1 })
        .bindTooltip(String(s.properties?.['name'] ?? 'stop'))
        .addTo(this.overlay);
    }

    for (const p of this.points()?.features ?? []) {
      const [lng, lat] = p.geometry.coordinates;
      L.circleMarker([lat, lng], { radius: 6, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.9, weight: 2 })
        .bindTooltip(String(p.properties?.['name'] ?? 'place'), { permanent: false })
        .addTo(this.overlay);
    }

    for (const q of this.questions()) {
      if (q.type === 'radar') {
        L.circle([q.lat, q.lng], {
          radius: q.radiusKm * 1000,
          color: q.within === false ? '#ef4444' : '#2563eb',
          weight: 1,
          fillOpacity: 0.04,
        }).addTo(this.overlay);
        L.circleMarker([q.lat, q.lng], { radius: 5, color: '#2563eb', fillOpacity: 1 }).bindTooltip('Radar').addTo(this.overlay);
      } else if (q.type === 'thermometer') {
        L.circleMarker([q.aLat, q.aLng], { radius: 6, color: '#3b82f6', fillOpacity: 1 }).bindTooltip('A (cold)').addTo(this.overlay);
        L.circleMarker([q.bLat, q.bLng], { radius: 6, color: '#ef4444', fillOpacity: 1 }).bindTooltip('B (warm)').addTo(this.overlay);
        L.polyline([[q.aLat, q.aLng], [q.bLat, q.bLng]], { color: '#94a3b8', weight: 1, dashArray: '4' }).addTo(this.overlay);
      }
    }

    if (this.autoZoom() && cand) {
      try {
        const [minX, minY, maxX, maxY] = bbox(cand);
        this.map.fitBounds([[minY, minX], [maxY, maxX]], { padding: [24, 24], maxZoom: 15, animate: false });
      } catch {
        // empty / degenerate candidate — leave the view as-is
      }
    }
  }
}
