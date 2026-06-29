import { afterNextRender, Component, computed, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { avatarIcon, colorFor, markerIcon } from '../../core/maps/avatar';
import { hidingZoneViz } from '../../core/maps/deduction';
import { disperse } from '../../core/maps/spread';
import { HidingState } from '../../core/services/hiding-state';
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
  // The game's allowed transit modes — which stops bound the carved zone.
  readonly transitModes = input<string[] | undefined>(undefined);
  // 'nearest' = carve the zone (no other station inside); 'circle' = plain radius.
  readonly zoneRule = input<string>('nearest');
  readonly mapClick = output<Position>();

  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private centred = false;
  private wasPicking = false; // tracks picking sessions so a re-pick (e.g. Move) re-zooms
  private readonly hiding = inject(HidingState);

  // The carve's neighbours: the shared nearby-stops set (fetched once by HidingState, also
  // feeding the picker) that fall INSIDE the zone radius — so the zone is carved only by
  // stations that would otherwise be inside it (no other station can be in the zone), and a
  // station just outside the radius never cuts it. null while the stops are still loading.
  private readonly carveNeighbors = computed<{ lat: number; lng: number }[] | null>(() => {
    const az = this.activeZone();
    const all = this.hiding.allStops();
    if (!az || !all) {
      return null;
    }

    return all.filter((s) => this.metresBetween(az.lat, az.lng, s.lat, s.lng) <= az.radiusM);
  });

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

    // During SEEKING the hider-panel isn't mounted, so ensure the shared stops are loaded
    // around the committed zone (while picking, the hider-panel already loads them).
    effect(() => {
      const committed = this.zone();
      if (committed) {
        void this.hiding.loadFor(committed.center.lat, committed.center.lng, this.transitModes(), committed.radius_m);
      }
    });
  }

  private metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const dLat = (bLat - aLat) * 111000;
    const dLng = (bLng - aLng) * 111000 * Math.cos((aLat * Math.PI) / 180);

    return Math.hypot(dLat, dLng);
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

    // 'circle' rule = a plain radius (official, other stations don't matter); otherwise carve.
    const carve = this.zoneRule() !== 'circle';

    // The committed zone (seeking) shows the carve with bounding-station pins.
    const zone = this.zone();
    if (zone) {
      if (carve) {
        this.drawCarvedZone(zone.center, zone.radius_m, true);
      } else {
        L.circle([zone.center.lat, zone.center.lng], { radius: zone.radius_m, color: '#f59e0b', weight: 2, fillOpacity: 0.12 }).addTo(this.overlay);
      }
    }

    // While the hider is still picking, show the SAME zone live for the previewed spot
    // (recomputed as they move) so they can see the area they'd hide in. The pickable
    // stops are drawn as their own mode-coloured markers below, so skip the grey pins.
    const preview = this.previewZone();
    if (preview && !zone) {
      if (carve) {
        this.drawCarvedZone({ lat: preview.lat, lng: preview.lng }, preview.radiusM, false);
      } else {
        L.circle([preview.lat, preview.lng], { radius: preview.radiusM, color: '#f59e0b', weight: 1, dashArray: '4 4', fillOpacity: 0.08 }).addTo(this.overlay);
      }
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

    // A picking session is the hider choosing a spot: a previewed zone with no committed one
    // yet (initial hiding, or again after a 'move'). When one (re)starts, re-arm the one-shot
    // auto-zoom so the new pick area + its carved zone are framed (a ~400 m zone is invisible
    // at the seeking-phase zoom otherwise).
    const picking = !!this.previewZone() && !this.zone();
    if (picking && !this.wasPicking) {
      this.centred = false;
    }
    this.wasPicking = picking;

    const hl = this.highlight();
    if (hl) {
      L.circleMarker([hl.lat, hl.lng], { radius: 9, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 3 }).addTo(this.overlay);
      // Zoom to the hider's station area once per picking session, so the stops + zone are
      // legible. Non-animated: the panel re-renders rapidly and an animated zoom gets
      // interrupted (and silently no-ops) before it lands.
      if (!this.centred) {
        this.centred = true;
        this.map.setView([hl.lat, hl.lng], 15, { animate: false });
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
