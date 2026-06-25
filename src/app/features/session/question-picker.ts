import { Component, computed, input, output, signal } from '@angular/core';
import { QuestionCatalogItem } from '../../core/models/models';
import { categoryMeta } from '../../core/util/categories';
import { RADAR_PRESETS, Units } from '../../core/util/units';

/** Icon-tile question chooser shown as a modal / bottom sheet — pick a category, then a question. */
@Component({
  selector: 'app-question-picker',
  templateUrl: './question-picker.html',
})
export class QuestionPicker {
  readonly catalog = input<QuestionCatalogItem[]>([]);
  readonly units = input<Units>('metric');
  readonly open = input(false);
  readonly ask = output<{ questionId: string; payload: Record<string, unknown> }>();
  readonly closeChange = output<boolean>();

  readonly selected = signal<string | null>(null);
  readonly meta = categoryMeta;

  readonly categories = computed(() => [...new Set(this.catalog().map((q) => q.category))]);
  readonly categoryQuestions = computed(() => this.catalog().filter((q) => q.category === this.selected()));
  readonly radarPresets = computed(() => RADAR_PRESETS[this.units()]);

  pick(category: string): void {
    this.selected.set(category);
  }

  back(): void {
    this.selected.set(null);
  }

  close(): void {
    this.selected.set(null);
    this.closeChange.emit(false);
  }

  askRadar(q: QuestionCatalogItem, radiusM: number): void {
    this.emit(q, { radius_m: radiusM });
  }

  askGeneric(q: QuestionCatalogItem): void {
    const radiusM = q.parameters?.['radius_m'] as number | undefined;
    this.emit(q, radiusM ? { radius_m: radiusM } : {});
  }

  private emit(q: QuestionCatalogItem, payload: Record<string, unknown>): void {
    this.ask.emit({ questionId: q.id, payload });
    this.close();
  }
}
