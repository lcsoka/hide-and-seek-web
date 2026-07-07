import { area, bbox, booleanPointInPolygon, distance, point } from '@turf/turf';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Feature, FeatureCollection, Point } from 'geojson';
import { CITIES } from '../../core/maps/cities';
import { applyQuestions, measuringRegionToBorder, playArea, tentacleRegion } from '../../core/deduction/deduction';
import { DeductionQuestion } from '../../core/deduction/deduction.model';
import { MAP } from '../../core/maps/map-theme';
import { Poly } from '../../core/maps/map.model';
import { OverpassService, POI_TYPES, TRANSIT_MODES } from '../../core/maps/overpass';
import { Position } from '../../core/models';
import { DeductionMap } from './deduction-map';
import { Icon } from '../../shared/icon';

type Mode = 'idle' | 'radar' | 'thermo' | 'tentacle';

interface PendingTentacle {
  lat: number;
  lng: number;
  radiusKm: number;
  typeLabel: string;
  pois: FeatureCollection<Point>;
}

const ZONE_LEVELS: { level: number; name: string }[] = [
  { level: 9, name: 'district' },
  { level: 8, name: 'town/city' },
  { level: 7, name: 'járás' },
  { level: 6, name: 'county' },
];

@Component({
  selector: 'app-map-page',
  imports: [FormsModule, RouterLink, DeductionMap, Icon],
  template: `
    <main class="mx-auto w-full max-w-6xl space-y-4 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <a routerLink="/" class="text-sm text-rose-600">← Home</a>
          <h1 class="text-lg font-bold">Deduction map</h1>
        </div>
        <div class="flex items-center gap-2">
          @if (busy()) { <span class="text-xs text-gray-400">loading…</span> }
          @if (hiderInside() !== null) {
            <span class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold" [class]="hiderInside() ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'">
              <app-icon name="hide" [size]="13" /> {{ hiderInside() ? 'inside' : 'outside' }}
            </span>
          }
          @if (remainingKm2(); as km2) {
            <span class="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-800">remaining ≈ {{ km2 }} km²</span>
          }
        </div>
      </header>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <app-deduction-map class="block h-[26rem]" [candidate]="candidate()" [questions]="questions()" [stations]="stations()"
                             [points]="pendingTentacle()?.pois ?? null" [overlays]="overlays()" [dragMarkers]="dragMarkers()"
                             [autoZoom]="autoZoom()" (markerMoved)="onMarkerMoved($event)" (mapClick)="onMapClick($event)" />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            @switch (mode()) {
              @case ('radar') { Click the map to drop a radar centre. }
              @case ('thermo') {
                @if (pendingA()) { Click for point B (warm end). } @else { Click for point A (cold end). }
              }
              @case ('tentacle') { Click the centre to find nearby {{ tentacleLabel() }}s. }
              @default { Pick a play area, then add questions and click the map. }
            }
          </p>
        </div>

        <div class="space-y-4 text-sm">
          <section class="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
            <h2 class="flex items-center gap-1 font-semibold">Ask from <app-icon name="search" [size]="14" /> (answered by <app-icon name="hide" [size]="14" />)</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">Drag the seeker + hider on the map. Each question is asked from the seeker and answered by the hider's real position, then cuts the map — a consistent answer never excludes the hider. Retract any question with Remove.</p>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-medium">Radar within</span>
              @for (r of radarChips; track r) { <button (click)="askRadar(r)" [class]="btnOutline">{{ r }} km</button> }
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <select [ngModel]="zoneLevel()" (ngModelChange)="zoneLevel.set($event)" [class]="sel">
                @for (z of zoneLevels; track z.level) { <option [ngValue]="z.level">{{ z.name }}</option> }
              </select>
              <button (click)="askZoneFromSeeker()" [class]="btn">Same {{ zoneName() }}</button>
              <button (click)="askBorderFromSeeker(2)" [class]="btn">Country border</button>
              <button (click)="askBorderFromSeeker(6)" [class]="btnOutline">County border</button>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">"Same {{ zoneName() }}" answered "different" rules out the SEEKER's {{ zoneName() }} — the only thing we learn (we can't know which other {{ zoneName() }} the hider is in).</p>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Play area</h2>
            <div class="flex flex-wrap items-center gap-2">
              <select [ngModel]="citySlug()" (ngModelChange)="selectCity($event)" [class]="sel">
                @for (c of cities; track c.slug) { <option [value]="c.slug">{{ c.name }}</option> }
              </select>
              <button (click)="loadCityBorder()" [class]="btn">Use city border</button>
              <button (click)="useRadius()" [class]="btnOutline">Use radius</button>
              @if (!baseArea()) {
                <label class="flex items-center gap-1">radius
                  <input type="number" min="1" [ngModel]="radiusKm()" (ngModelChange)="radiusKm.set($event)" [class]="num" /> km
                </label>
              }
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Public transport</h2>
            <div class="flex flex-wrap gap-3">
              @for (m of transitModes; track m.id) {
                <label class="flex items-center gap-1">
                  <input type="checkbox" [checked]="selectedModes().includes(m.id)" (change)="toggleMode(m.id)" />
                  {{ m.label }}
                </label>
              }
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button (click)="loadStations()" [class]="btn">Load stations</button>
              @if (stations(); as s) { <span class="text-xs text-gray-500">{{ s.features.length }} stops</span> }
              <button (click)="stations.set(null)" [class]="btnOutline">Clear</button>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Borders</h2>
            <div class="flex flex-wrap gap-2">
              <button (click)="loadBorder(2)" [class]="btnOutline">Show country border</button>
              <button (click)="loadBorder(6)" [class]="btnOutline">Show county border</button>
              <button (click)="clearBorders()" [class]="btnOutline">Clear</button>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">Just overlays for context — ask border questions from the panel above.</p>
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <h2 class="font-semibold">Tentacles</h2>
            <div class="flex flex-wrap items-center gap-2">
              <select [ngModel]="tentacleType()" (ngModelChange)="selectTentacleType($event)" [class]="sel">
                @for (t of poiTypes; track t.id) { <option [value]="t.id">{{ t.label }}</option> }
              </select>
              <label class="flex items-center gap-1">within
                <input type="number" min="1" [ngModel]="tentacleRadiusKm()" (ngModelChange)="tentacleRadiusKm.set($event)" [class]="num" /> km
              </label>
              <button (click)="setMode('tentacle')" [class]="mode() === 'tentacle' ? btnActive : btn">Find places</button>
            </div>
            @if (pendingTentacle(); as pt) {
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs">Nearest to hider:</span>
                <select [ngModel]="tentacleChoice()" (ngModelChange)="tentacleChoice.set($event)" [class]="sel">
                  @for (f of pt.pois.features; track f.properties!['name']) { <option [value]="f.properties!['name']">{{ f.properties!['name'] }}</option> }
                </select>
                <button (click)="addTentacle()" [disabled]="!tentacleChoice()" [class]="btn">Add</button>
                <button (click)="pendingTentacle.set(null)" [class]="btnOutline">Cancel</button>
                <span class="text-xs text-gray-500">{{ pt.pois.features.length }} found</span>
              </div>
            }
          </section>

          <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold">Questions ({{ questions().length }})</h2>
              <label class="flex items-center gap-1 text-xs">
                <input type="checkbox" [ngModel]="autoZoom()" (ngModelChange)="autoZoom.set($event)" /> auto-zoom
              </label>
            </div>
            <div class="flex flex-wrap gap-2">
              <button (click)="setMode('radar')" [class]="mode() === 'radar' ? btnActive : btn">+ Radar</button>
              <button (click)="setMode('thermo')" [class]="mode() === 'thermo' ? btnActive : btn">+ Thermometer</button>
              <button (click)="setMode('idle')" [class]="btnOutline">Cancel</button>
            </div>
            @for (q of questions(); track q.id) {
              <div class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                @if (q.type === 'radar') {
                  <span class="font-medium">Radar</span>
                  <select [ngModel]="q.within" (ngModelChange)="patchWithin(q.id, $event)" [class]="sel">
                    <option [ngValue]="true">Inside</option><option [ngValue]="false">Outside</option><option [ngValue]="null">Unknown</option>
                  </select>
                  <input type="number" min="1" [ngModel]="q.radiusKm" (ngModelChange)="setRadarRadius(q.id, $event)" [class]="num" /><span class="text-xs">km</span>
                } @else if (q.type === 'thermometer') {
                  <span class="font-medium">Thermometer</span>
                  <select [ngModel]="q.warmer" (ngModelChange)="setThermoWarmer(q.id, $event)" [class]="sel">
                    <option [ngValue]="true">Warmer → B</option><option [ngValue]="false">Colder → A</option><option [ngValue]="null">Unknown</option>
                  </select>
                } @else {
                  <span class="font-medium">{{ q.label }}</span>
                  <select [ngModel]="q.within" (ngModelChange)="patchWithin(q.id, $event)" [class]="sel">
                    <option [ngValue]="true">{{ q.yesLabel ?? 'Inside' }}</option>
                    <option [ngValue]="false">{{ q.noLabel ?? 'Outside' }}</option>
                    <option [ngValue]="null">Unknown</option>
                  </select>
                }
                <button (click)="remove(q.id)" [class]="btnOutline + ' ml-auto'">Remove</button>
              </div>
            } @empty { <p class="text-gray-400">No questions yet.</p> }
          </section>
        </div>
      </div>
    </main>
  `,
})
export class MapPage {
  private readonly overpass = inject(OverpassService);

  readonly btn = 'rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40';
  readonly btnActive = 'rounded-lg bg-rose-800 px-3 py-2 text-sm font-medium text-white ring-2 ring-rose-300';
  readonly btnOutline = 'rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800';
  readonly sel = 'rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800';
  readonly num = 'w-20 rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800';

  readonly cities = CITIES;
  readonly transitModes = TRANSIT_MODES;
  readonly zoneLevels = ZONE_LEVELS;
  readonly radarChips = [1, 2, 5, 10, 25];
  readonly zoneLevel = signal(6);
  readonly zoneName = computed(() => ZONE_LEVELS.find((z) => z.level === this.zoneLevel())?.name ?? 'zone');

  readonly poiTypes = POI_TYPES;
  readonly tentacleType = signal('museum');
  readonly tentacleRadiusKm = signal(1.6);
  readonly tentacleLabel = computed(() => POI_TYPES.find((t) => t.id === this.tentacleType())?.label ?? 'place');
  readonly pendingTentacle = signal<PendingTentacle | null>(null);
  readonly tentacleChoice = signal('');

  readonly citySlug = signal('budapest');
  readonly city = computed(() => CITIES.find((c) => c.slug === this.citySlug()) ?? CITIES[0]);
  readonly radiusKm = signal(50);
  readonly autoZoom = signal(true);

  readonly baseArea = signal<Poly | null>(null);
  readonly stations = signal<FeatureCollection<Point> | null>(null);
  readonly selectedModes = signal<string[]>(['metro', 'tram']);
  readonly country = signal<Feature | null>(null);
  readonly county = signal<Feature | null>(null);

  // Sandbox test pins: drag the seeker + hider, ask questions from the seeker, watch the cuts.
  readonly seeker = signal<Position>({ lat: 47.4979, lng: 19.0402 });
  readonly hider = signal<Position>({ lat: 47.5065, lng: 19.049 });
  readonly dragMarkers = computed(() => [
    { id: 'seeker', lat: this.seeker().lat, lng: this.seeker().lng, label: 'S', color: MAP.seeker },
    { id: 'hider', lat: this.hider().lat, lng: this.hider().lng, label: 'H', color: MAP.hider },
  ]);

  readonly questions = signal<DeductionQuestion[]>([]);
  readonly mode = signal<Mode>('idle');
  readonly pendingA = signal<Position | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly base = computed(() => this.baseArea() ?? playArea(this.city().lat, this.city().lng, this.radiusKm()));
  readonly candidate = computed(() => {
    try {
      return applyQuestions(this.base(), this.questions());
    } catch {
      return null;
    }
  });
  readonly overlays = computed(() => [this.country(), this.county()].filter((f): f is Feature => !!f));
  readonly remainingKm2 = computed(() => {
    const c = this.candidate();

    return c ? Math.round(area(c) / 1_000_000).toLocaleString() : null;
  });
  // Is the hider still inside the surviving candidate? (Consistency check as you ask/drag.)
  readonly hiderInside = computed(() => {
    const c = this.candidate();

    return c ? booleanPointInPolygon(point([this.hider().lng, this.hider().lat]), c as never) : null;
  });

  constructor() {
    // Default the play area to the real city border (falls back to the radius if Overpass fails).
    void this.loadCityBorder();
    this.resetPins();
  }

  private resetPins(): void {
    const c = this.city();
    this.seeker.set({ lat: c.lat, lng: c.lng });
    this.hider.set({ lat: +(c.lat + 0.02).toFixed(5), lng: +(c.lng + 0.03).toFixed(5) });
  }

  onMarkerMoved(e: { id: string; lat: number; lng: number }): void {
    (e.id === 'seeker' ? this.seeker : this.hider).set({ lat: e.lat, lng: e.lng });
  }

  /** Ask a radar of the given radius FROM the seeker; the answer is the real hider distance. */
  askRadar(radiusKm: number): void {
    const s = this.seeker();
    const within = distance(point([s.lng, s.lat]), point([this.hider().lng, this.hider().lat]), { units: 'kilometers' }) <= radiusKm;
    this.add({ id: crypto.randomUUID(), type: 'radar', lat: s.lat, lng: s.lng, radiusKm, within });
  }

  /** "Same {zone} as me?" from the seeker; the answer is whether the hider is in the seeker's area. */
  async askZoneFromSeeker(): Promise<void> {
    const level = this.zoneLevel();
    const name = this.zoneName();
    await this.run(async () => {
      const s = this.seeker();
      const boundary = await this.overpass.adminBoundary(s.lat, s.lng, level);
      if (!boundary) {
        throw new Error(`No ${name} boundary at the seeker.`);
      }
      const same = booleanPointInPolygon(point([this.hider().lng, this.hider().lat]), boundary as never);
      this.add({ id: crypto.randomUUID(), type: 'region', label: `Same ${name}`, region: boundary as Poly, within: same, yesLabel: 'Same', noLabel: 'Different' });
    });
  }

  /** "Closer to the border than me?" from the seeker; the answer is whether the hider is in the band. */
  async askBorderFromSeeker(level: 2 | 6): Promise<void> {
    await this.run(async () => {
      const s = this.seeker();
      const boundary = await this.overpass.adminBoundary(s.lat, s.lng, level);
      if (!boundary) {
        throw new Error('No boundary found.');
      }
      const region = measuringRegionToBorder(boundary as never, s.lat, s.lng);
      const closer = booleanPointInPolygon(point([this.hider().lng, this.hider().lat]), region as never);
      this.add({ id: crypto.randomUUID(), type: 'region', label: level === 2 ? 'Country border' : 'County border', region, within: closer, yesLabel: 'Closer', noLabel: 'Farther' });
    });
  }

  selectCity(slug: string): void {
    this.citySlug.set(slug);
    this.baseArea.set(null);
    this.stations.set(null);
    this.clearBorders();
    this.resetPins();
    void this.loadCityBorder();
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.pendingA.set(null);
  }

  useRadius(): void {
    this.baseArea.set(null);
  }

  async loadCityBorder(): Promise<void> {
    await this.run(async () => {
      const b = await this.overpass.adminBoundary(this.city().lat, this.city().lng, 8);
      if (!b) {
        throw new Error('No city boundary found.');
      }
      this.baseArea.set(b);
    });
  }

  async loadStations(): Promise<void> {
    await this.run(async () => {
      const filters = OverpassService.filtersFor(this.selectedModes());
      if (!filters.length) {
        throw new Error('Pick at least one transport mode.');
      }
      this.stations.set(await this.overpass.stations(bbox(this.base()) as [number, number, number, number], filters));
    });
  }

  async loadBorder(level: 2 | 6): Promise<void> {
    await this.run(async () => {
      const b = await this.overpass.adminBoundary(this.city().lat, this.city().lng, level);
      if (!b) {
        throw new Error('No boundary found.');
      }
      (level === 2 ? this.country : this.county).set(b);
    });
  }

  clearBorders(): void {
    this.country.set(null);
    this.county.set(null);
  }

  toggleMode(id: string): void {
    this.selectedModes.update((ms) => (ms.includes(id) ? ms.filter((m) => m !== id) : [...ms, id]));
  }

  selectTentacleType(id: string): void {
    this.tentacleType.set(id);
    const t = POI_TYPES.find((p) => p.id === id);
    if (t) {
      this.tentacleRadiusKm.set(t.defaultRadiusKm);
    }
  }

  addTentacle(): void {
    const pt = this.pendingTentacle();
    const choice = this.tentacleChoice();
    if (!pt || !choice) {
      return;
    }
    const region = tentacleRegion(pt.lat, pt.lng, pt.radiusKm, pt.pois, choice);
    if (region) {
      this.add({ id: crypto.randomUUID(), type: 'region', label: `Nearest ${pt.typeLabel}: ${choice}`, region, within: true, yesLabel: 'Confirmed', noLabel: 'Elsewhere' });
    }
    this.pendingTentacle.set(null);
    this.tentacleChoice.set('');
  }

  onMapClick(p: Position): void {
    if (this.mode() === 'radar') {
      this.add({ id: crypto.randomUUID(), type: 'radar', lat: p.lat, lng: p.lng, radiusKm: 5, within: true });
      this.setMode('idle');
    } else if (this.mode() === 'thermo') {
      const a = this.pendingA();
      if (!a) {
        this.pendingA.set(p);
      } else {
        this.add({ id: crypto.randomUUID(), type: 'thermometer', aLat: a.lat, aLng: a.lng, bLat: p.lat, bLng: p.lng, warmer: true });
        this.setMode('idle');
      }
    } else if (this.mode() === 'tentacle') {
      const type = POI_TYPES.find((t) => t.id === this.tentacleType());
      const radiusKm = this.tentacleRadiusKm();
      this.setMode('idle');
      void this.run(async () => {
        const pois = await this.overpass.pois(p.lat, p.lng, radiusKm, type?.filter ?? '');
        if (pois.features.length === 0) {
          throw new Error(`No ${type?.label ?? 'places'} found within ${radiusKm} km.`);
        }
        this.pendingTentacle.set({ lat: p.lat, lng: p.lng, radiusKm, typeLabel: type?.label ?? 'place', pois });
        this.tentacleChoice.set(String(pois.features[0].properties?.['name'] ?? ''));
      });
    }
  }

  patchWithin(id: string, within: boolean | null): void {
    this.patch(id, (q) => (q.type === 'radar' || q.type === 'region') && (q.within = within));
  }

  setRadarRadius(id: string, radiusKm: number): void {
    this.patch(id, (q) => q.type === 'radar' && (q.radiusKm = radiusKm));
  }

  setThermoWarmer(id: string, warmer: boolean | null): void {
    this.patch(id, (q) => q.type === 'thermometer' && (q.warmer = warmer));
  }

  remove(id: string): void {
    this.questions.update((qs) => qs.filter((q) => q.id !== id));
  }

  private add(q: DeductionQuestion): void {
    this.questions.update((qs) => [...qs, q]);
  }

  private patch(id: string, mutate: (q: DeductionQuestion) => unknown): void {
    this.questions.update((qs) =>
      qs.map((q) => {
        if (q.id !== id) {
          return q;
        }
        const copy = { ...q } as DeductionQuestion;
        mutate(copy);

        return copy;
      }),
    );
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Request failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
