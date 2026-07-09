import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import * as L from 'leaflet';

/**
 * A non-interactive Budapest map that slowly drifts between landmarks — the shared hero backdrop
 * for the landing and auth pages, with a hider (rose) + seeker (blue) marker pulsing to set the
 * theme. Tiles follow the OS colour scheme (voyager when light, dark_all when dark) and swap live
 * if the OS toggles. Rendered outside any *transloco block so the viewChild resolves on first paint.
 */
@Component({
  selector: 'app-map-backdrop',
  templateUrl: './map-backdrop.html',
})
export class MapBackdrop {
  private readonly destroyRef = inject(DestroyRef);
  readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('mapEl');

  constructor() {
    afterNextRender(() => this.init());
  }

  private init(): void {
    const spots: L.LatLngExpression[] = [
      [47.4979, 19.0402], [47.5003, 19.0836], [47.5106, 19.0567], [47.4874, 19.0700], [47.4813, 19.0561],
    ];
    const map = L.map(this.mapEl().nativeElement, {
      center: spots[0], zoom: 13, zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, inertia: false,
    });
    const tileUrl = (dark: boolean) =>
      dark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let tiles = L.tileLayer(tileUrl(scheme.matches), { subdomains: 'abcd', maxZoom: 18 }).addTo(map);
    const onSchemeChange = (e: MediaQueryListEvent) => {
      map.removeLayer(tiles);
      tiles = L.tileLayer(tileUrl(e.matches), { subdomains: 'abcd', maxZoom: 18 }).addTo(map);
    };
    scheme.addEventListener('change', onSchemeChange);
    const dot = (color: string) =>
      L.divIcon({ className: '', iconSize: [14, 14], html: `<div class="jl-pulse-dot" style="width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px rgba(2,6,23,.5)"></div>` });
    L.marker([47.5003, 19.0836], { icon: dot('#f43f5e'), interactive: false }).addTo(map);
    L.marker([47.4979, 19.0402], { icon: dot('#3b82f6'), interactive: false }).addTo(map);
    L.marker([47.5106, 19.0567], { icon: dot('#3b82f6'), interactive: false }).addTo(map);
    setTimeout(() => map.invalidateSize(), 200);

    let i = 0;
    const drift = setInterval(() => {
      i = (i + 1) % spots.length;
      map.flyTo(spots[i], 13, { duration: 7, easeLinearity: 0.25 });
    }, 9000);
    this.destroyRef.onDestroy(() => {
      clearInterval(drift);
      scheme.removeEventListener('change', onSchemeChange);
      // Halt any in-flight flyTo first: otherwise its queued rAF frame fires on the just-removed
      // map and computes an Invalid LatLng (NaN, NaN) — noisy on every navigate-away mid-drift.
      map.stop();
      map.remove();
    });
  }
}
