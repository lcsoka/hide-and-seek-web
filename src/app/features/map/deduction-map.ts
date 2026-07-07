import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { bbox } from '@turf/turf';
import { Feature, FeatureCollection, GeoJsonObject, MultiPolygon, Point, Polygon } from 'geojson';
import * as L from 'leaflet';
import { TranslocoModule } from '@jsverse/transloco';
import { MapAnnotation } from '../../core/maps/map.model';
import { DeductionQuestion } from '../../core/deduction/deduction.model';
import { avatarIcon, colorFor, glyphIcon, markerIcon } from '../../core/maps/avatar';
import { MAP } from '../../core/maps/map-theme';
import { holedMask } from '../../core/deduction/operators';
import { Poly } from '../../core/maps/map.model';
import { disperse } from '../../core/geo/spread';
import { TransitRoutes } from '../../core/services/transit-routes';
import { TransitService } from '../../core/services/transit.service';
import { QuestionEvalResult } from '../../core/services/debug-api';
import { PlayerView, Position } from '../../core/models';

const BUDAPEST: L.LatLngExpression = [47.4979, 19.0402];

/**
 * Renders the deduction state: the eliminated area as a translucent mask (the
 * candidate region shows through), each question's geometry, and auto-zoom to
 * what's left. Clicking the map emits a position (used to place questions).
 */
@Component({
  selector: 'app-deduction-map',
  imports: [TranslocoModule],
  host: { class: 'relative block h-full' },
  template: `
    <div #el class="h-full min-h-72 w-full overflow-hidden"></div>
    @if (loading()) {
      <div class="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center">
        <span class="flex items-center gap-2 rounded-full bg-gray-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
          <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
          {{ 'map.calculating' | transloco }}
        </span>
      </div>
    }
    @if (candidate()) {
      <button (click)="fitToCandidate()" [title]="'map.fitTitle' | transloco"
              class="absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-sm font-semibold text-gray-800 shadow-lg ring-1 ring-black/10 hover:bg-white">
        ⊕ {{ 'map.fit' | transloco }}
      </button>
    }
  `,
})
export class DeductionMap {
  readonly el = viewChild.required<ElementRef<HTMLElement>>('el');
  readonly candidate = input<Poly | null>(null);
  readonly questions = input<DeductionQuestion[]>([]);
  readonly annotations = input<MapAnnotation[]>([]); // numbered, explained question markers
  readonly stations = input<FeatureCollection<Point> | null>(null);
  readonly points = input<FeatureCollection<Point> | null>(null); // highlighted POIs (e.g. tentacle candidates)
  readonly overlays = input<Feature[]>([]); // e.g. admin borders, drawn as outlines
  readonly autoZoom = input(true);
  readonly loading = input(false); // hold rendering until the deduction is fully computed
  readonly thermoMarker = input<{ lat: number; lng: number; radiusM?: number | null; label?: string } | null>(null);
  // A radar radius the seeker is previewing before committing to ask (two-step: preview → confirm).
  readonly radarPreview = input<{ lat: number; lng: number; radiusM: number } | null>(null);
  // A reference place the seeker is previewing for a measuring/matching question (with a dashed
  // line from their own position) before committing to ask.
  readonly refPreview = input<{ lat: number; lng: number; fromLat?: number | null; fromLng?: number | null; label?: string } | null>(null);
  // The administrative area (megye/település/kerület) to highlight for a "same division?" preview.
  readonly regionPreview = input<Feature<Polygon | MultiPolygon> | null>(null);
  readonly players = input<PlayerView[]>([]); // visible players (seekers see themselves + teammates)
  readonly meId = input<string | null>(null);
  // Dev question harness: an evaluated question's geometry to overlay. Null in normal play.
  readonly evalResult = input<QuestionEvalResult | null>(null);
  // The national border, drawn as a static frame in a different colour from the play area.
  readonly nationalBorder = input<Feature<Polygon | MultiPolygon> | null>(null);
  // Draggable pins for the dev sandbox (e.g. the seeker + hider); each drag emits markerMoved.
  readonly dragMarkers = input<{ id: string; lat: number; lng: number; label: string; color: string }[]>([]);
  readonly markerMoved = output<{ id: string; lat: number; lng: number }>();
  readonly mapClick = output<Position>();

  private readonly transitRoutes = inject(TransitRoutes);
  private readonly transitService = inject(TransitService);
  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private fog?: L.SVG; // dedicated SVG renderer holding the "excluded fog" hatch pattern
  private resize?: ResizeObserver;
  // View preservation: only auto-fit when the deduction changes, and never once the
  // user has panned/zoomed — so background /state refreshes don't reset their view.
  private lastFitSig = '';
  private lastRouteSig = '';
  private lastPreviewSig = '';
  private lastRefSig = '';
  private lastRegionSig = '';
  private lastEvalSig = '';
  private userMoved = false;
  private programmaticMove = false;

  constructor() {
    afterNextRender(() => this.init());
    effect(() => {
      this.candidate();
      this.questions();
      this.annotations();
      this.stations();
      this.points();
      this.overlays();
      this.loading();
      this.thermoMarker();
      this.radarPreview();
      this.refPreview();
      this.regionPreview();
      this.evalResult();
      this.nationalBorder();
      this.dragMarkers();
      this.players();
      this.transitRoutes.displayed();
      this.render();
    });
    inject(DestroyRef).onDestroy(() => {
      this.resize?.disconnect();
      this.map?.remove();
    });
  }

  private init(): void {
    this.map = L.map(this.el().nativeElement, { zoomAnimation: true, fadeAnimation: true }).setView(BUDAPEST, 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(this.map);

    // A dedicated SVG renderer whose <defs> holds the "excluded fog" hatch pattern; the mask below
    // fills with url(#jl-fog), so ruled-out land reads as textured fog rather than a flat wash.
    this.fog = L.svg({ padding: 2 }).addTo(this.map);
    const svg = (this.fog as unknown as { _container?: SVGSVGElement })._container;
    if (svg && !svg.querySelector('#jl-fog')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      // Diagonal hatch lines only — laid over a base tint below, so ruled-out land reads as a
      // "crossed-out" fog. (Texture only: if the pattern ever fails to resolve, the tint still shows.)
      defs.innerHTML =
        `<pattern id="jl-fog" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="6" stroke="${MAP.excluded}" stroke-opacity="0.45" stroke-width="1.5"/>` +
        `</pattern>`;
      svg.insertBefore(defs, svg.firstChild);
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => this.mapClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng }));
    // A move the app didn't initiate is the user panning/zooming — stop auto-fitting.
    this.map.on('movestart', () => {
      if (!this.programmaticMove) {
        this.userMoved = true;
      }
    });
    // Full-bleed/flex containers settle their size after init — re-fit once the
    // container resizes so the initial framing uses the final dimensions.
    this.resize = new ResizeObserver(() => {
      this.map?.invalidateSize();
      this.lastFitSig = ''; // allow one re-fit at the new size (unless the user moved)
      this.render();
    });
    this.resize.observe(this.el().nativeElement);
    this.render();
  }

  private render(): void {
    // Always draw what we know now — the candidate from the synchronous cuts (radar/
    // thermometer) is ready immediately, and OSM-backed regions narrow it as they land.
    // (Previously the whole map was held while OSM fetched, so a slow/throttled Overpass
    // left the deduction blank for up to 10s. A small "calculating" badge shows instead.)
    if (!this.map) {
      return;
    }

    this.overlay?.remove();
    this.overlay = L.layerGroup().addTo(this.map);

    // The national border — a quiet, thin slate frame (drawn first, beneath everything; never part
    // of the auto-fit) that reads as a structural boundary without competing with the candidate.
    const border = this.nationalBorder();
    if (border) {
      L.geoJSON(border as GeoJsonObject, { style: { color: MAP.frame, weight: 1.5, fill: false, opacity: 0.55, className: 'jl-national' }, interactive: false }).addTo(this.overlay);
    }

    // The transit line the seeker is previewing in the board picker / currently riding,
    // in its mode colour with a white halo so it reads over the candidate mask + tiles.
    const route = this.transitRoutes.displayed();
    if (route) {
      const color = this.transitService.transitMeta(route.mode).color;
      for (const seg of route.lines) {
        if (seg.length > 1) {
          const latlngs = seg.map((p) => [p.lat, p.lng] as L.LatLngTuple);
          L.polyline(latlngs, { color: '#ffffff', weight: 8, opacity: 0.7 }).addTo(this.overlay);
          L.polyline(latlngs, { color, weight: 4, opacity: 0.95 }).addTo(this.overlay);
        }
      }
    }

    const cand = this.candidate();
    if (cand) {
      const mask = holedMask(cand);
      if (mask) {
        // Ruled-out land: a navy base tint + a diagonal-hatch fog on top (a "crossed-out" feel).
        // `renderer` routes the hatch into the SVG that holds the pattern (Leaflet forwards it to
        // the path at runtime; it's just missing from the GeoJSONOptions type). The base tint is a
        // safe fallback so the excluded area always reads even if the pattern doesn't resolve.
        L.geoJSON(mask as GeoJsonObject, { style: { weight: 0, fillColor: MAP.excluded, fillOpacity: 0.32 }, interactive: false }).addTo(this.overlay);
        L.geoJSON(mask as GeoJsonObject, {
          style: { weight: 0, fillColor: 'url(#jl-fog)', fillOpacity: 1 },
          interactive: false,
          renderer: this.fog,
        } as L.GeoJSONOptions & { renderer?: L.SVG }).addTo(this.overlay);
      }
      // The live candidate outline: a steady violet base + a bright light "runner" chasing around
      // the perimeter (both styled in the global sheet — Leaflet SVG is outside Angular's view).
      L.geoJSON(cand as GeoJsonObject, { style: { color: MAP.possible, weight: 2, opacity: 0.55, fill: false, className: 'jl-candidate' } }).addTo(this.overlay);
      const runner = L.geoJSON(cand as GeoJsonObject, { style: { color: '#ffffff', weight: 2.5, fill: false, className: 'jl-candidate-run' } });
      runner.addTo(this.overlay);
      // Normalise the dash pattern to the path length (pathLength=1000) so the light strip stays one
      // segment at the same relative speed at every zoom — a fixed-pixel dasharray multiplies + speeds
      // up as you zoom in (the perimeter grows in px).
      runner.eachLayer((l) => (l as unknown as { _path?: SVGPathElement })._path?.setAttribute('pathLength', '1000'));
    }

    for (const overlay of this.overlays()) {
      L.geoJSON(overlay as GeoJsonObject, { style: { color: MAP.region, weight: 2, dashArray: '6', fill: false }, interactive: false }).addTo(this.overlay);
    }

    for (const s of this.stations()?.features ?? []) {
      const [lng, lat] = s.geometry.coordinates;
      L.circleMarker([lat, lng], { radius: 3, color: MAP.clue, fillColor: MAP.clue, fillOpacity: 0.9, weight: 1 })
        .bindTooltip(String(s.properties?.['name'] ?? 'stop'))
        .addTo(this.overlay);
    }

    for (const p of this.points()?.features ?? []) {
      const [lng, lat] = p.geometry.coordinates;
      L.circleMarker([lat, lng], { radius: 6, color: MAP.region, fillColor: MAP.region, fillOpacity: 0.9, weight: 2 })
        .bindTooltip(String(p.properties?.['name'] ?? 'place'), { permanent: false })
        .addTo(this.overlay);
    }

    for (const q of this.questions()) {
      if (q.type === 'radar') {
        L.circle([q.lat, q.lng], {
          radius: q.radiusKm * 1000,
          color: q.within === false ? MAP.hider : MAP.seeker,
          weight: 1,
          fillOpacity: 0.04,
        }).addTo(this.overlay);
        L.circleMarker([q.lat, q.lng], { radius: 5, color: MAP.seeker, fillOpacity: 1 }).bindTooltip('Radar').addTo(this.overlay);
      } else if (q.type === 'thermometer') {
        L.circleMarker([q.aLat, q.aLng], { radius: 6, color: MAP.seeker, fillOpacity: 1 }).bindTooltip('A (cold)').addTo(this.overlay);
        L.circleMarker([q.bLat, q.bLng], { radius: 6, color: MAP.warm, fillOpacity: 1 }).bindTooltip('B (warm)').addTo(this.overlay);
        L.polyline([[q.aLat, q.aLng], [q.bLat, q.bLng]], { color: '#94a3b8', weight: 1, dashArray: '4' }).addTo(this.overlay);
      }
    }

    // Numbered, explained markers per answered question — show WHICH question cut the map and HOW.
    for (const a of this.annotations()) {
      if (a.radarKm != null && a.point) {
        L.circle([a.point.lat, a.point.lng], {
          radius: a.radarKm * 1000,
          color: a.within ? MAP.seeker : MAP.hider,
          weight: 1.5,
          dashArray: a.within ? undefined : '5',
          fillOpacity: 0.05,
        }).addTo(this.overlay);
      }
      if (a.thermo) {
        L.polyline([[a.thermo.a.lat, a.thermo.a.lng], [a.thermo.b.lat, a.thermo.b.lng]], { color: MAP.warm, weight: 2, dashArray: '4' }).addTo(this.overlay);
        L.circleMarker([a.thermo.a.lat, a.thermo.a.lng], { radius: 4, color: MAP.seeker, fillColor: MAP.seeker, fillOpacity: 1 }).addTo(this.overlay);
        L.circleMarker([a.thermo.b.lat, a.thermo.b.lng], { radius: 4, color: MAP.warm, fillColor: MAP.warm, fillOpacity: 1 }).addTo(this.overlay);
      }
      if (a.feature) {
        // The reference place (closest airport, matched place, nearest tentacle target).
        L.marker([a.feature.lat, a.feature.lng], { icon: glyphIcon('pin', { color: MAP.clue, size: 26 }) })
          .bindTooltip(a.feature.name ? a.feature.name : 'reference place', { permanent: true, direction: 'right', offset: [6, 0], opacity: 0.95 })
          .addTo(this.overlay);
      }
      if (a.point) {
        L.marker([a.point.lat, a.point.lng], { icon: markerIcon(String(a.n), { color: '#0f172a', size: 24 }) })
          .bindTooltip(`#${a.n} ${a.icon} ${a.effect}`, { permanent: true, direction: 'top', offset: [0, -12], opacity: 0.95 })
          .addTo(this.overlay);
      }
    }

    // A running thermometer: the seeker's start + the distance they must travel.
    const thermo = this.thermoMarker();
    if (thermo) {
      if (thermo.radiusM) {
        L.circle([thermo.lat, thermo.lng], { radius: thermo.radiusM, color: MAP.warm, weight: 1.5, dashArray: '6', fillOpacity: 0.04 }).addTo(this.overlay);
      }
      L.marker([thermo.lat, thermo.lng], { icon: glyphIcon('thermo', { color: MAP.warm, size: 28 }) })
        .bindTooltip(thermo.label ?? 'Thermometer start', { permanent: true, direction: 'top', offset: [0, -18] })
        .addTo(this.overlay);
    }

    // A radar radius the seeker is previewing before asking — a marching-dashed rose circle
    // centred on them, framed once so they can judge the coverage, then Confirm & Ask.
    const preview = this.radarPreview();
    const previewSig = preview ? `${preview.lat}:${preview.lng}:${preview.radiusM}` : '';
    if (preview) {
      const circle = L.circle([preview.lat, preview.lng], { radius: preview.radiusM, color: MAP.seeker, weight: 2, dashArray: '8 6', fillColor: MAP.seeker, fillOpacity: 0.06 });
      circle.addTo(this.overlay);
      L.circleMarker([preview.lat, preview.lng], { radius: 5, color: MAP.seeker, fillColor: MAP.seeker, fillOpacity: 1 }).addTo(this.overlay);
      if (previewSig !== this.lastPreviewSig) {
        this.lastPreviewSig = previewSig;
        try {
          this.programmaticMove = true;
          this.map.fitBounds(circle.getBounds(), { padding: [48, 48], maxZoom: 16, animate: true, duration: 0.5 });
          setTimeout(() => (this.programmaticMove = false), 600);
        } catch {
          this.programmaticMove = false;
        }
      }
    } else {
      this.lastPreviewSig = '';
    }

    // A reference place the seeker is previewing for a measuring/matching question — a cyan
    // pin, with a dashed line from their own position, framed once so they can judge it.
    const ref = this.refPreview();
    const refSig = ref ? `${ref.lat}:${ref.lng}` : '';
    if (ref) {
      L.marker([ref.lat, ref.lng], { icon: glyphIcon('pin', { color: MAP.clue, size: 28 }) })
        .bindTooltip(ref.label ?? 'reference', { permanent: true, direction: 'top', offset: [0, -14], opacity: 0.95 })
        .addTo(this.overlay);
      const pts: L.LatLngExpression[] = [[ref.lat, ref.lng]];
      if (ref.fromLat != null && ref.fromLng != null) {
        L.polyline([[ref.fromLat, ref.fromLng], [ref.lat, ref.lng]], { color: MAP.clue, weight: 2, dashArray: '6 6', opacity: 0.85 }).addTo(this.overlay);
        pts.push([ref.fromLat, ref.fromLng]);
      }
      if (refSig !== this.lastRefSig) {
        this.lastRefSig = refSig;
        try {
          this.programmaticMove = true;
          this.map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 16, animate: true, duration: 0.5 });
          setTimeout(() => (this.programmaticMove = false), 600);
        } catch {
          this.programmaticMove = false;
        }
      }
    } else {
      this.lastRefSig = '';
    }

    // The seeker's containing administrative area, highlighted before asking a "same division?"
    // question — a cyan outline + light fill, framed once so they see which megye/kerület they're in.
    const region = this.regionPreview();
    const regionSig = region ? String(region.properties?.['name'] ?? 'region') : '';
    if (region) {
      const layer = L.geoJSON(region as GeoJsonObject, { style: { color: MAP.region, weight: 2.5, fillColor: MAP.region, fillOpacity: 0.12 }, interactive: false });
      layer.addTo(this.overlay);
      if (regionSig !== this.lastRegionSig) {
        this.lastRegionSig = regionSig;
        try {
          this.programmaticMove = true;
          this.map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 14, animate: true, duration: 0.5 });
          setTimeout(() => (this.programmaticMove = false), 600);
        } catch {
          this.programmaticMove = false;
        }
      }
    } else {
      this.lastRegionSig = '';
    }

    // Dev question harness: the evaluated question's geometry — seeker + hider points, the seeker's
    // query radius (radar/tentacles), every candidate (tentacles), and the matched entity with a
    // dashed line from the hider. For matching, the hider's own nearest is revealed too.
    const ev = this.evalResult();
    const evSig = ev ? `${ev.key}:${ev.seeker.lat}:${ev.seeker.lng}:${ev.hider.lat}:${ev.hider.lng}:${ev.answer}` : '';
    if (ev) {
      const pts: L.LatLngExpression[] = [[ev.seeker.lat, ev.seeker.lng], [ev.hider.lat, ev.hider.lng]];
      if (ev.radius_m) {
        L.circle([ev.seeker.lat, ev.seeker.lng], { radius: ev.radius_m, color: MAP.seeker, weight: 1.5, dashArray: '6', fillColor: MAP.seeker, fillOpacity: 0.04 }).addTo(this.overlay);
      }
      for (const c of ev.candidates) {
        L.circleMarker([c.lat, c.lng], { radius: 4, color: MAP.region, fillColor: MAP.region, fillOpacity: 0.7, weight: 1 }).bindTooltip(c.name ?? 'candidate').addTo(this.overlay);
        pts.push([c.lat, c.lng]);
      }
      L.marker([ev.seeker.lat, ev.seeker.lng], { icon: glyphIcon('search', { color: MAP.seeker, size: 26 }) }).bindTooltip('Seeker', { direction: 'top', offset: [0, -12] }).addTo(this.overlay);
      L.marker([ev.hider.lat, ev.hider.lng], { icon: glyphIcon('hide', { color: MAP.hider, size: 26 }) }).bindTooltip('Hider', { direction: 'top', offset: [0, -12] }).addTo(this.overlay);
      if (ev.matched) {
        L.polyline([[ev.hider.lat, ev.hider.lng], [ev.matched.lat, ev.matched.lng]], { color: MAP.possible, weight: 2, dashArray: '5 5' }).addTo(this.overlay);
        L.marker([ev.matched.lat, ev.matched.lng], { icon: glyphIcon('check', { color: MAP.possible, size: 28 }) })
          .bindTooltip(`${ev.answer ?? ''} · ${ev.matched.name ?? '(unnamed)'}`, { permanent: true, direction: 'right', offset: [8, 0], opacity: 0.95 })
          .addTo(this.overlay);
        pts.push([ev.matched.lat, ev.matched.lng]);
      }
      if (ev.hider_nearest) {
        L.marker([ev.hider_nearest.lat, ev.hider_nearest.lng], { icon: glyphIcon('pin', { color: MAP.hider, size: 24 }) })
          .bindTooltip(`hider's nearest · ${ev.hider_nearest.name ?? '(unnamed)'}`, { direction: 'right', offset: [8, 0] })
          .addTo(this.overlay);
        pts.push([ev.hider_nearest.lat, ev.hider_nearest.lng]);
      }
      if (evSig !== this.lastEvalSig) {
        this.lastEvalSig = evSig;
        try {
          this.programmaticMove = true;
          this.map.fitBounds(L.latLngBounds(pts).pad(0.2), { padding: [40, 40], maxZoom: 16, animate: true, duration: 0.5 });
          setTimeout(() => (this.programmaticMove = false), 600);
        } catch {
          this.programmaticMove = false;
        }
      }
    } else {
      this.lastEvalSig = '';
    }

    // Draggable sandbox pins (e.g. the seeker + hider): drag one and the cuts re-evaluate.
    for (const m of this.dragMarkers()) {
      const marker = L.marker([m.lat, m.lng], { icon: markerIcon(m.label, { color: m.color, size: 32, emphasis: true }), draggable: true, autoPan: true });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        this.markerMoved.emit({ id: m.id, lat: ll.lat, lng: ll.lng });
      });
      marker.addTo(this.overlay);
    }

    // Visible players (the seeker themselves + teammates; the hider is concealed by
    // the server). The seeker's own position gets a prominent ringed marker.
    const located = this.players().filter((p) => p.lat != null && p.lng != null) as (PlayerView & { lat: number; lng: number })[];
    for (const p of disperse(located)) {
      const isMe = p.id === this.meId();
      L.marker([p.lat, p.lng], { icon: avatarIcon(p.display_name, isMe ? MAP.seeker : colorFor(p.id), isMe, p.avatar) })
        .bindTooltip(isMe ? 'You' : p.display_name, isMe ? { permanent: true, direction: 'top', offset: [0, -20] } : {})
        .addTo(this.overlay);
    }

    // When a transit route is (re)shown, frame it so the path is legible — the whole point
    // of drawing it. This deliberately overrides the candidate fit / user view.
    const shownRoute = this.transitRoutes.displayed();
    const routeSig = shownRoute ? `${shownRoute.ref}:${shownRoute.mode}:${shownRoute.lines.length}` : '';
    if (routeSig && routeSig !== this.lastRouteSig) {
      this.lastRouteSig = routeSig;
      const pts = shownRoute!.lines.flat();
      if (pts.length) {
        try {
          const lats = pts.map((p) => p.lat);
          const lngs = pts.map((p) => p.lng);
          this.programmaticMove = true;
          this.map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40], maxZoom: 15, animate: true, duration: 0.5 });
          setTimeout(() => (this.programmaticMove = false), 600);
        } catch {
          // degenerate geometry — leave the view
        }
      }
      return; // don't also run the candidate fit this pass
    }
    if (!routeSig) {
      this.lastRouteSig = '';
    }

    // Auto-fit only when the deduction actually changed (a new clue), and never after
    // the user has taken control of the view — so periodic refreshes don't reset it.
    const sig = `${this.questions().length}:${this.annotations().length}:${cand ? 1 : 0}`;
    if (this.autoZoom() && cand && sig !== this.lastFitSig && !this.userMoved) {
      this.lastFitSig = sig;
      try {
        const [minX, minY, maxX, maxY] = bbox(cand);
        this.programmaticMove = true;
        this.map.fitBounds([[minY, minX], [maxY, maxX]], { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.6 });
        setTimeout(() => (this.programmaticMove = false), 700);
      } catch {
        // empty / degenerate candidate — leave the view as-is
      }
    }
  }

  /** Centre on the player's own position (a "find me" button). Falls back to re-framing the
   *  deduction area if we don't have the player's location. */
  recenterOnSelf(): void {
    const me = this.players().find((p) => p.id === this.meId() && p.lat != null && p.lng != null);
    if (!this.map || !me) {
      this.fitToCandidate();

      return;
    }
    this.userMoved = true; // an explicit recenter shouldn't be undone by the next auto-fit
    this.programmaticMove = true;
    this.map.setView([me.lat!, me.lng!], 15, { animate: true, duration: 0.5 });
    setTimeout(() => (this.programmaticMove = false), 600);
  }

  /** Re-frame the map to the current candidate area (and re-enable auto-fit). */
  fitToCandidate(): void {
    const cand = this.candidate();
    if (!this.map || !cand) {
      return;
    }
    this.userMoved = false;
    try {
      const [minX, minY, maxX, maxY] = bbox(cand);
      this.programmaticMove = true;
      this.map.fitBounds([[minY, minX], [maxY, maxX]], { padding: [24, 24], maxZoom: 15, animate: true, duration: 0.6 });
      setTimeout(() => (this.programmaticMove = false), 700);
    } catch {
      // degenerate candidate — ignore
    }
  }
}
