import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Point } from 'geojson';
import { distance, point } from '@turf/turf';
import { QuestionCatalogItem } from '../../core/models/models';
import { FEATURE_TAGS } from '../../core/maps/osm-deduction';
import { OverpassService } from '../../core/maps/overpass';
import { categoryMeta, questionIcon, questionShortLabel } from '../../core/util/categories';
import { DistancePreset, RADAR_PRESETS, THERMO_PRESETS, Units } from '../../core/util/units';

interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distM: number;
}

/** Icon-tile question chooser shown as a modal / bottom sheet — pick a category, then a question. */
@Component({
  selector: 'app-question-picker',
  templateUrl: './question-picker.html',
})
export class QuestionPicker {
  private readonly overpass = inject(OverpassService);

  readonly catalog = input<QuestionCatalogItem[]>([]);
  readonly units = input<Units>('metric');
  readonly open = input(false);
  readonly seekerLat = input<number | null>(null);
  readonly seekerLng = input<number | null>(null);
  readonly disabledCategories = input<string[]>([]);
  readonly ask = output<{ questionId: string; category: string; payload: Record<string, unknown> }>();
  readonly closeChange = output<boolean>();

  readonly selected = signal<string | null>(null);
  readonly custom = signal('');
  readonly meta = categoryMeta;
  readonly qIcon = (q: QuestionCatalogItem) => questionIcon(`${q.title} ${q.key}`, q.category);
  readonly qLabel = questionShortLabel;
  /** Distance-based categories get inline chips; the rest get a grid of subject tiles. */
  readonly isParametric = computed(() => this.selected() === 'radar' || this.selected() === 'thermometer');

  // Matching: confirm which place is actually the seeker's closest before asking.
  readonly matchQ = signal<QuestionCatalogItem | null>(null);
  readonly places = signal<NearbyPlace[] | null>(null);
  readonly chosenPlace = signal<NearbyPlace | null>(null);

  readonly categories = computed(() => [...new Set(this.catalog().map((q) => q.category))]);
  readonly categoryQuestions = computed(() => this.catalog().filter((q) => q.category === this.selected()));
  readonly radarPresets = computed(() => RADAR_PRESETS[this.units()]);
  readonly thermoPresets = computed(() => THERMO_PRESETS[this.units()]);
  readonly unitLabel = computed(() => (this.units() === 'imperial' ? 'mi' : 'km'));

  isDisabled(category: string): boolean {
    return this.disabledCategories().includes(category);
  }

  pick(category: string): void {
    if (this.isDisabled(category)) {
      return;
    }
    this.selected.set(category);
  }

  back(): void {
    this.selected.set(null);
    this.matchQ.set(null);
  }

  close(): void {
    this.selected.set(null);
    this.custom.set('');
    this.matchQ.set(null);
    this.places.set(null);
    this.chosenPlace.set(null);
    this.closeChange.emit(false);
  }

  askRadar(q: QuestionCatalogItem, radiusM: number): void {
    this.emit(q, { radius_m: radiusM });
  }

  askThermo(q: QuestionCatalogItem, preset: DistancePreset): void {
    this.emit(q, { distance_m: preset.meters, distance_label: preset.label });
  }

  /** A custom distance the seeker typed (in km / mi), converted to metres. */
  private customMeters(): number | null {
    const value = parseFloat(this.custom());
    if (!isFinite(value) || value <= 0) {
      return null;
    }

    return Math.round(value * (this.units() === 'imperial' ? 1609.34 : 1000));
  }

  askCustomRadar(q: QuestionCatalogItem): void {
    const meters = this.customMeters();
    if (meters) {
      this.emit(q, { radius_m: meters });
    }
  }

  askCustomThermo(q: QuestionCatalogItem): void {
    const meters = this.customMeters();
    if (meters) {
      this.emit(q, { distance_m: meters, distance_label: `${parseFloat(this.custom())} ${this.unitLabel()}` });
    }
  }

  /** Tapping a subject tile. Matching first confirms the seeker's closest place. */
  pickQuestion(q: QuestionCatalogItem): void {
    if (q.category === 'matching') {
      void this.openMatchConfirm(q);
    } else {
      this.askGeneric(q);
    }
  }

  private async openMatchConfirm(q: QuestionCatalogItem): Promise<void> {
    this.matchQ.set(q);
    this.places.set(null);
    this.chosenPlace.set(null);

    const feature = q.parameters?.['feature'] as string | undefined;
    const lat = this.seekerLat();
    const lng = this.seekerLng();
    const tag = feature ? FEATURE_TAGS[feature] : undefined;
    if (!tag || lat == null || lng == null) {
      this.places.set([]); // can't look up — the seeker can still ask without confirming
      return;
    }

    try {
      // Bound the lookup — a throttled Overpass shouldn't trap the seeker on "Finding…".
      const fc = await Promise.race([this.overpass.pois(lat, lng, 8, tag), new Promise<null>((res) => setTimeout(() => res(null), 10000))]);
      if (!fc) {
        this.places.set([]); // timed out → let them ask without confirming
        return;
      }
      const here = point([lng, lat]);
      const list = fc.features
        .map((f) => {
          const [flng, flat] = (f.geometry as Point).coordinates;
          return { name: String(f.properties?.['name'] ?? 'Unnamed'), lat: flat, lng: flng, distM: Math.round(distance(here, f as any, { units: 'kilometers' }) * 1000) };
        })
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 8);
      this.places.set(list);
      this.chosenPlace.set(list[0] ?? null);
    } catch {
      this.places.set([]);
    }
  }

  confirmMatch(): void {
    const q = this.matchQ();
    const place = this.chosenPlace();
    if (!q) {
      return;
    }
    this.emit(q, place ? { ref_lat: place.lat, ref_lng: place.lng, ref_name: place.name } : {});
  }

  askGeneric(q: QuestionCatalogItem): void {
    const radiusM = q.parameters?.['radius_m'] as number | undefined;
    this.emit(q, radiusM ? { radius_m: radiusM } : {});
  }

  private emit(q: QuestionCatalogItem, payload: Record<string, unknown>): void {
    this.ask.emit({ questionId: q.id, category: q.category, payload });
    this.close();
  }
}
