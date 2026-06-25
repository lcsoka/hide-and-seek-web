import { Component, computed, input, output, signal } from '@angular/core';
import { QuestionCatalogItem } from '../../core/models/models';
import { categoryMeta, questionIcon, questionShortLabel } from '../../core/util/categories';
import { DistancePreset, RADAR_PRESETS, THERMO_PRESETS, Units } from '../../core/util/units';

/** Icon-tile question chooser shown as a modal / bottom sheet — pick a category, then a question. */
@Component({
  selector: 'app-question-picker',
  templateUrl: './question-picker.html',
})
export class QuestionPicker {
  readonly catalog = input<QuestionCatalogItem[]>([]);
  readonly units = input<Units>('metric');
  readonly open = input(false);
  readonly ask = output<{ questionId: string; category: string; payload: Record<string, unknown> }>();
  readonly closeChange = output<boolean>();

  readonly selected = signal<string | null>(null);
  readonly custom = signal('');
  readonly meta = categoryMeta;
  readonly qIcon = (q: QuestionCatalogItem) => questionIcon(`${q.title} ${q.key}`, q.category);
  readonly qLabel = questionShortLabel;
  /** Distance-based categories get inline chips; the rest get a grid of subject tiles. */
  readonly isParametric = computed(() => this.selected() === 'radar' || this.selected() === 'thermometer');

  readonly categories = computed(() => [...new Set(this.catalog().map((q) => q.category))]);
  readonly categoryQuestions = computed(() => this.catalog().filter((q) => q.category === this.selected()));
  readonly radarPresets = computed(() => RADAR_PRESETS[this.units()]);
  readonly thermoPresets = computed(() => THERMO_PRESETS[this.units()]);
  readonly unitLabel = computed(() => (this.units() === 'imperial' ? 'mi' : 'km'));

  pick(category: string): void {
    this.selected.set(category);
  }

  back(): void {
    this.selected.set(null);
  }

  close(): void {
    this.selected.set(null);
    this.custom.set('');
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

  askGeneric(q: QuestionCatalogItem): void {
    const radiusM = q.parameters?.['radius_m'] as number | undefined;
    this.emit(q, radiusM ? { radius_m: radiusM } : {});
  }

  private emit(q: QuestionCatalogItem, payload: Record<string, unknown>): void {
    this.ask.emit({ questionId: q.id, category: q.category, payload });
    this.close();
  }
}
