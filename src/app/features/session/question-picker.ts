import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FeatureCollection, Point } from 'geojson';
import { distance, point } from '@turf/turf';
import { TranslocoModule } from '@jsverse/transloco';
import { QuestionCatalogItem } from '../../core/models';
import { FEATURE_TAGS } from '../../core/deduction/osm-deduction.service';
import { OverpassService } from '../../core/maps/overpass';
import { CategoryService } from '../../core/services/category.service';
import { UnitsService } from '../../core/services/units.service';
import { DistancePreset, Units } from '../../core/services/units.model';

interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distM: number;
}

/** Icon-tile question chooser shown as a modal / bottom sheet — pick a category, then a question. */
@Component({
  selector: 'app-question-picker',
  imports: [TranslocoModule],
  templateUrl: './question-picker.html',
})
export class QuestionPicker {
  private readonly overpass = inject(OverpassService);
  private readonly category = inject(CategoryService);
  private readonly unitsService = inject(UnitsService);

  readonly catalog = input<QuestionCatalogItem[]>([]);
  readonly units = input<Units>('metric');
  readonly open = input(false);
  readonly seekerLat = input<number | null>(null);
  readonly seekerLng = input<number | null>(null);
  readonly disabledCategories = input<string[]>([]);
  readonly onTransit = input(false); // seeker is riding → thermometer is unavailable (walk-only)
  readonly ask = output<{ questionId: string; category: string; payload: Record<string, unknown> }>();
  // Radar is two-step: choosing a radius previews it on the map (picker closes), then the
  // seeker confirms in the shell to actually ask.
  readonly preview = output<{ questionId: string; radiusM: number; label: string }>();
  // Measuring/matching: preview the seeker's reference place on the map, then confirm in the shell.
  readonly refPreview = output<{ questionId: string; category: string; name: string; lat: number; lng: number }>();
  readonly closeChange = output<boolean>();

  readonly selected = signal<string | null>(null);
  readonly custom = signal('');
  readonly meta = (c: string) => this.category.categoryMeta(c);
  readonly qIcon = (q: QuestionCatalogItem) => this.category.questionIcon(`${q.title} ${q.key}`, q.category);
  readonly qLabel = (title: string) => this.category.questionShortLabel(title);
  /** Distance-based categories get inline chips; the rest get a grid of subject tiles. */
  readonly isParametric = computed(() => this.selected() === 'radar' || this.selected() === 'thermometer');

  // Looking up the reference place for a measuring/matching question before previewing it.
  readonly finding = signal(false);

  readonly categories = computed(() => [...new Set(this.catalog().map((q) => q.category))]);
  readonly categoryQuestions = computed(() => this.catalog().filter((q) => q.category === this.selected()));
  readonly radarPresets = computed(() => this.unitsService.radarPresets[this.units()]);
  readonly thermoPresets = computed(() => this.unitsService.thermoPresets[this.units()]);
  readonly unitLabel = computed(() => (this.units() === 'imperial' ? 'mi' : 'km'));

  isDisabled(category: string): boolean {
    return this.disabledCategories().includes(category) || (category === 'thermometer' && this.onTransit());
  }

  /** Why a category tile is greyed: walk-only (on transit) vs blocked by a curse. */
  disabledReason(category: string): string {
    return category === 'thermometer' && this.onTransit() ? 'picker.thermoTransit' : 'picker.disabledLock';
  }

  pick(category: string): void {
    if (this.isDisabled(category)) {
      return;
    }
    this.selected.set(category);
  }

  back(): void {
    this.selected.set(null);
  }

  close(): void {
    this.selected.set(null);
    this.custom.set('');
    this.finding.set(false);
    this.closeChange.emit(false);
  }

  /** Preview a radar radius (don't ask yet): close the picker so the map + circle are visible,
   *  then the seeker confirms in the shell. */
  previewRadar(q: QuestionCatalogItem, radiusM: number, label: string): void {
    this.preview.emit({ questionId: q.id, radiusM, label });
    this.close();
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

  previewCustomRadar(q: QuestionCatalogItem): void {
    const meters = this.customMeters();
    if (meters) {
      this.previewRadar(q, meters, `${parseFloat(this.custom())} ${this.unitLabel()}`);
    }
  }

  askCustomThermo(q: QuestionCatalogItem): void {
    const meters = this.customMeters();
    if (meters) {
      this.emit(q, { distance_m: meters, distance_label: `${parseFloat(this.custom())} ${this.unitLabel()}` });
    }
  }

  /** Tapping a subject tile. Measuring/matching first preview the seeker's reference place. */
  pickQuestion(q: QuestionCatalogItem): void {
    if (q.category === 'matching' || q.category === 'measuring') {
      void this.openRefPreview(q);
    } else {
      this.askGeneric(q);
    }
  }

  /** Look up the seeker's nearest reference place and preview it on the map (picker closes). No
   *  nearby feature (or Overpass unavailable) → ask directly and let the server compute the ref. */
  private async openRefPreview(q: QuestionCatalogItem): Promise<void> {
    const feature = q.parameters?.['feature'] as string | undefined;
    const lat = this.seekerLat();
    const lng = this.seekerLng();
    const tag = feature ? FEATURE_TAGS[feature] : undefined;
    if (!tag || lat == null || lng == null) {
      this.askGeneric(q);
      return;
    }

    this.finding.set(true);
    let nearest: NearbyPlace | null = null;
    try {
      // Bound the lookup — a throttled Overpass shouldn't trap the seeker on "Finding…".
      const fc = await Promise.race([this.overpass.pois(lat, lng, 15, tag), new Promise<FeatureCollection<Point> | null>((res) => setTimeout(() => res(null), 10000))]);
      nearest = this.nearestPlace(fc, lat, lng);
    } catch {
      nearest = null;
    }
    this.finding.set(false);

    if (nearest) {
      this.refPreview.emit({ questionId: q.id, category: q.category, name: nearest.name, lat: nearest.lat, lng: nearest.lng });
      this.close();
    } else {
      this.askGeneric(q); // no nearby reference — ask directly (server computes / falls back)
    }
  }

  private nearestPlace(fc: FeatureCollection<Point> | null, lat: number, lng: number): NearbyPlace | null {
    if (!fc) {
      return null;
    }
    const here = point([lng, lat]);
    const list = fc.features
      .map((f) => {
        const [flng, flat] = f.geometry.coordinates;
        return { name: String(f.properties?.['name'] ?? 'Unnamed'), lat: flat, lng: flng, distM: Math.round(distance(here, f as any, { units: 'kilometers' }) * 1000) };
      })
      .sort((a, b) => a.distM - b.distM);

    return list[0] ?? null;
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
