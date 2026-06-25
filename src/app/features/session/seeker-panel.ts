import { Component, computed, inject, input, signal } from '@angular/core';
import { GameState, QuestionCatalogItem, ResolvedQuestion } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { DeductionState } from '../../core/services/deduction-state';
import { SessionStore } from '../../core/services/session-store';
import { formatDistance, RADAR_PRESETS, unitsOf } from '../../core/util/units';

/** Seeker side-panel content: question chooser, answered history, active curses.
 *  The deduction map (shell background) and timer (HUD) live outside this component. */
@Component({
  selector: 'app-seeker-panel',
  templateUrl: './seeker-panel.html',
})
export class SeekerPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  readonly deduction = inject(DeductionState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();

  readonly chip = 'rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800';
  readonly chipActive = 'rounded-full bg-rose-600 px-3 py-1 text-sm text-white';
  readonly btn = 'rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40';

  readonly catalog = signal<QuestionCatalogItem[]>([]);
  readonly selectedCategory = signal('radar');
  readonly asking = signal(false);

  readonly units = computed(() => unitsOf(this.state().config));
  readonly radarPresets = computed(() => RADAR_PRESETS[this.units()]);
  readonly categories = computed(() => [...new Set(this.catalog().map((q) => q.category))]);
  readonly categoryQuestions = computed(() => this.catalog().filter((q) => q.category === this.selectedCategory()));
  readonly canAsk = computed(() => this.state().available_actions.includes('ask_question'));
  readonly history = computed(() => [...this.state().questions].reverse());

  constructor() {
    void this.api.questionsCatalog().then((c) => {
      this.catalog.set(c);
      if (c.length && !c.some((q) => q.category === this.selectedCategory())) {
        this.selectedCategory.set(c[0].category);
      }
    });
  }

  async askRadar(q: QuestionCatalogItem, radiusM: number): Promise<void> {
    await this.ask(q.id, { radius_m: radiusM });
  }

  async askGeneric(q: QuestionCatalogItem): Promise<void> {
    const radiusM = q.parameters?.['radius_m'] as number | undefined;
    await this.ask(q.id, radiusM ? { radius_m: radiusM } : {});
  }

  answerText(q: ResolvedQuestion): string {
    const a = q.answer?.answer ?? '—';
    if (a === 'in_range' && q.answer?.feature_name) {
      return `Nearest: ${q.answer.feature_name}`;
    }
    const labels: Record<string, string> = {
      yes: 'Yes', no: 'No', hotter: 'Hotter', colder: 'Colder', closer: 'Closer', further: 'Further', out_of_range: 'Out of range',
    };
    const text = labels[a] ?? a;
    if (q.category === 'radar' && q.ask.radius_m) {
      return `${text} · ≤ ${formatDistance(q.ask.radius_m, this.units())}`;
    }

    return text;
  }

  private async ask(questionId: string, extra: Record<string, unknown>): Promise<void> {
    this.asking.set(true);
    try {
      await this.api.submitAction(this.sessionId(), 'ask_question', { question_id: questionId, ...extra });
    } finally {
      this.asking.set(false);
      this.store.refresh();
    }
  }
}
