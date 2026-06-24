import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { applyQuestions, playArea } from '../../core/maps/deduction';
import { resolvedQuestionsToDeduction } from '../../core/maps/game-deduction';
import { GameState, QuestionCatalogItem, ResolvedQuestion } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/services/session-store';
import { DeductionMap } from '../map/deduction-map';

const DISTANCE_M: Record<string, number> = {
  '1/4 mile': 402,
  '1/2 mile': 805,
  '1 mile': 1609,
  '3 miles': 4828,
  '5 miles': 8047,
  '10 miles': 16093,
  '25 miles': 40234,
  '50 miles': 80467,
  '100 miles': 160934,
};

@Component({
  selector: 'app-seeker-panel',
  imports: [DeductionMap],
  template: `
    <div class="space-y-4">
      @if (timer(); as t) {
        <div class="flex items-center justify-center gap-3 rounded-xl border p-3"
             [class]="t.urgent ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'">
          <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ t.label }}</span>
          <span class="font-mono text-2xl font-bold tabular-nums" [class.text-red-600]="t.urgent">{{ t.text }}</span>
        </div>
      }

      <div>
        <app-deduction-map [candidate]="candidate()" [questions]="mapQuestions()" [autoZoom]="true" />
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Shaded = ruled out. {{ mapQuestions().length }} of {{ state().questions.length }} answers narrow the map (radar &amp; thermometer).
        </p>
      </div>

      <section class="space-y-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">Ask a question</h2>
        @if (!canAsk()) {
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ state().pending_question ? 'Waiting for the hider to answer…' : 'You can ask once the round is in the seeking phase.' }}
          </p>
        } @else {
          <div class="flex flex-wrap gap-1">
            @for (c of categories(); track c) {
              <button (click)="selectedCategory.set(c)"
                      [class]="c === selectedCategory() ? chipActive : chip">{{ c }}</button>
            }
          </div>
          @for (q of categoryQuestions(); track q.id) {
            <div class="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              <div class="mb-1 text-sm font-medium">{{ q.title }}</div>
              @if (q.category === 'radar' && radarDistances(q).length) {
                <div class="flex flex-wrap gap-1">
                  @for (d of radarDistances(q); track d) {
                    <button (click)="askRadar(q, d)" [disabled]="asking()" [class]="chip">{{ d }}</button>
                  }
                </div>
              } @else {
                <button (click)="askGeneric(q)" [disabled]="asking()" [class]="btn">Ask</button>
              }
            </div>
          }
        }
      </section>

      <section class="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <h2 class="font-semibold">Your questions ({{ state().questions.length }})</h2>
        @for (q of history(); track q.seq) {
          <div class="flex items-center justify-between gap-2 border-b border-gray-100 py-1 text-sm last:border-0 dark:border-gray-800">
            <span class="capitalize text-gray-600 dark:text-gray-300">{{ q.category }}</span>
            <span class="font-medium">{{ answerText(q) }}</span>
            @if (q.auto) { <span class="text-xs text-amber-600">auto</span> }
          </div>
        } @empty {
          <p class="text-sm text-gray-400">No questions asked yet.</p>
        }
      </section>

      @if (state().curses.length) {
        <section class="space-y-2 rounded-xl border border-purple-300 bg-purple-50 p-3 dark:border-purple-700 dark:bg-purple-950">
          <h2 class="font-semibold">Active curses</h2>
          @for (c of state().curses; track c.at) {
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">{{ c.name ?? 'Curse' }}</span>
              @if (c.cost) { <span class="text-xs text-gray-500 dark:text-gray-400">{{ c.cost }}</span> }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class SeekerPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly meId = input<string | null>(null);

  readonly chip = 'rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800';
  readonly chipActive = 'rounded-full bg-rose-600 px-3 py-1 text-sm text-white';
  readonly btn = 'rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40';

  readonly catalog = signal<QuestionCatalogItem[]>([]);
  readonly selectedCategory = signal('radar');
  readonly asking = signal(false);
  private readonly tick = signal(0);
  private offset = 0;

  readonly categories = computed(() => [...new Set(this.catalog().map((q) => q.category))]);
  readonly categoryQuestions = computed(() => this.catalog().filter((q) => q.category === this.selectedCategory()));
  readonly canAsk = computed(() => this.state().available_actions.includes('ask_question'));
  readonly mapQuestions = computed(() => resolvedQuestionsToDeduction(this.state().questions));
  readonly history = computed(() => [...this.state().questions].reverse());

  readonly candidate = computed(() => {
    const s = this.state();
    const me = s.players.find((p) => p.id === this.meId());
    const lat = me?.lat ?? 47.4979;
    const lng = me?.lng ?? 19.0402;
    const radiusKm = Number(s.config?.['play_radius_km'] ?? 50) || 50;
    try {
      return applyQuestions(playArea(lat, lng, radiusKm), this.mapQuestions());
    } catch {
      return null;
    }
  });

  readonly timer = computed<{ label: string; text: string; urgent: boolean } | null>(() => {
    this.tick();
    const s = this.state();
    const serverNow = Math.floor((Date.now() + this.offset) / 1000);

    if (s.pending_question?.deadline) {
      const left = s.pending_question.deadline - serverNow;

      return { label: 'Hider answering', text: fmt(Math.max(0, left)), urgent: left <= 30 };
    }
    if (s.state === 'seeking' && s.timers.seeking_started_at) {
      return { label: 'Seeking', text: fmt(serverNow - s.timers.seeking_started_at), urgent: false };
    }
    if (s.state === 'hiding' && s.timers.hiding_deadline) {
      const left = s.timers.hiding_deadline - serverNow;

      return { label: 'Hiding', text: fmt(Math.max(0, left)), urgent: left <= 60 };
    }

    return null;
  });

  constructor() {
    void this.api.questionsCatalog().then((c) => {
      this.catalog.set(c);
      if (c.length && !c.some((q) => q.category === this.selectedCategory())) {
        this.selectedCategory.set(c[0].category);
      }
    });

    const id = setInterval(() => this.tick.update((n) => n + 1), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));

    effect(() => {
      const now = this.state().timers?.now;
      if (now) {
        this.offset = now * 1000 - Date.now();
      }
    });
  }

  radarDistances(q: QuestionCatalogItem): string[] {
    const distances = (q.parameters?.['distances'] as string[] | undefined) ?? [];

    return distances.filter((d) => DISTANCE_M[d] !== undefined);
  }

  async askRadar(q: QuestionCatalogItem, distance: string): Promise<void> {
    const radiusM = DISTANCE_M[distance];
    if (radiusM) {
      await this.ask(q.id, { radius_m: radiusM });
    }
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

    return labels[a] ?? a;
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

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
