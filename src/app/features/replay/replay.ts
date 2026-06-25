import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FeatureCollection, Point } from 'geojson';
import { applyQuestions, DeductionQuestion, playArea, RegionQuestion } from '../../core/maps/deduction';
import { resolvedQuestionsToDeduction } from '../../core/maps/game-deduction';
import { isOsmCategory, osmRegion } from '../../core/maps/osm-deduction';
import { OverpassService } from '../../core/maps/overpass';
import { GodView, ResolvedQuestion } from '../../core/models/models';
import { DebugApi } from '../../core/services/debug-api';
import { actionLabel } from '../../core/util/labels';
import { formatDistance, unitsOf } from '../../core/util/units';
import { DeductionMap } from '../map/deduction-map';

interface TimelineEntry {
  at: number;
  kind: 'step' | 'ask' | 'answer' | 'curse';
  who: string;
  text: string;
}

@Component({
  selector: 'app-replay',
  imports: [RouterLink, DeductionMap],
  template: `
    <main class="mx-auto w-full max-w-6xl space-y-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <a routerLink="/" class="text-sm text-rose-600">← Home</a>
          <h1 class="text-lg font-bold">Session replay</h1>
        </div>
        @if (god(); as g) {
          <span class="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-800">{{ g.state }} · {{ g.status }} · round {{ g.round }}</span>
        }
      </header>

      @if (error(); as e) {
        <p class="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{{ e }}</p>
      }

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <app-deduction-map [candidate]="candidate()" [questions]="markerQuestions()" [points]="playerPoints()" [autoZoom]="true" />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Shaded = ruled out by the questions. Markers show every player's last position (god view).
          </p>
        </div>

        <section class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <h2 class="mb-2 font-semibold">Timeline ({{ timeline().length }})</h2>
          <ol class="space-y-2">
            @for (e of timeline(); track $index) {
              <li class="flex items-start gap-2 text-sm">
                <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" [class]="dot(e.kind)"></span>
                <div class="flex-1">
                  <div class="flex justify-between gap-2">
                    <span class="font-medium">{{ e.text }}</span>
                    <span class="shrink-0 text-xs text-gray-400">{{ time(e.at) }}</span>
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">{{ e.who }}</div>
                </div>
              </li>
            } @empty {
              <li class="text-sm text-gray-400">No activity recorded.</li>
            }
          </ol>
        </section>
      </div>
    </main>
  `,
})
export class Replay {
  private readonly route = inject(ActivatedRoute);
  private readonly debug = inject(DebugApi);
  private readonly overpass = inject(OverpassService);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly god = signal<GodView | null>(null);
  readonly error = signal<string | null>(null);
  readonly osmRegions = signal<Map<number, RegionQuestion>>(new Map());
  private readonly osmSeen = new Set<number>();

  readonly units = computed(() => unitsOf(this.god()?.config));
  readonly markerQuestions = computed(() => resolvedQuestionsToDeduction(this.god()?.questions ?? []));

  readonly candidate = computed(() => {
    const g = this.god();
    if (!g) {
      return null;
    }
    const city = g.config?.['city'] as { lat?: number; lng?: number } | undefined;
    const lat = city?.lat ?? 47.4979;
    const lng = city?.lng ?? 19.0402;
    const radiusKm = Number(g.config?.['play_radius_km'] ?? 50) || 50;
    const questions: DeductionQuestion[] = [...this.markerQuestions(), ...this.osmRegions().values()];
    try {
      return applyQuestions(playArea(lat, lng, radiusKm), questions);
    } catch {
      return null;
    }
  });

  readonly playerPoints = computed<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: (this.god()?.players ?? [])
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng as number, p.lat as number] },
        properties: { name: `${p.display_name}${p.role ? ' (' + p.role + ')' : ''}` },
      })),
  }));

  readonly timeline = computed<TimelineEntry[]>(() => this.buildTimeline());

  constructor() {
    void this.load();

    effect(() => {
      const g = this.god();
      if (!g) {
        return;
      }
      for (const q of g.questions) {
        if (isOsmCategory(q.category) && q.ask.lat != null && q.ask.feature && !this.osmSeen.has(q.seq)) {
          this.osmSeen.add(q.seq);
          void osmRegion(this.overpass, q).then((r) => {
            if (r) {
              this.osmRegions.update((m) => new Map(m).set(q.seq, { id: `q${q.seq}`, type: 'region', label: q.category, region: r.region, within: r.within }));
            }
          });
        }
      }
    });
  }

  async load(): Promise<void> {
    try {
      this.god.set(await this.debug.state(this.id));
      this.error.set(null);
    } catch {
      this.error.set('Could not load this session — is GAME_DEBUG enabled and the developer token set?');
    }
  }

  dot(kind: TimelineEntry['kind']): string {
    return { step: 'bg-gray-400', ask: 'bg-blue-500', answer: 'bg-green-500', curse: 'bg-purple-500' }[kind];
  }

  time(at: number): string {
    return at ? new Date(at * 1000).toLocaleTimeString() : '';
  }

  private playerName(id: string | null): string {
    return this.god()?.players.find((p) => p.id === id)?.display_name ?? '—';
  }

  private answerText(q: ResolvedQuestion): string {
    const a = q.answer?.answer ?? '—';
    if (a === 'in_range' && q.answer?.feature_name) {
      return `nearest ${q.answer.feature_name}`;
    }
    const text = { yes: 'Yes', no: 'No', hotter: 'Hotter', colder: 'Colder', closer: 'Closer', further: 'Further', out_of_range: 'Out of range' }[a] ?? a;

    return q.category === 'radar' && q.ask.radius_m ? `${text} (≤ ${formatDistance(q.ask.radius_m, this.units())})` : text;
  }

  private buildTimeline(): TimelineEntry[] {
    const g = this.god();
    if (!g) {
      return [];
    }

    const entries: TimelineEntry[] = [];
    const skip = new Set(['ask_question', 'answer_question', 'play_curse']); // covered by questions/curses below

    for (const l of g.action_logs) {
      if (!skip.has(l.type) && l.at != null) {
        entries.push({ at: l.at, kind: 'step', who: this.playerName(l.player_id), text: actionLabel(l.type) });
      }
    }
    for (const q of g.questions) {
      if (q.asked_at) {
        entries.push({ at: q.asked_at, kind: 'ask', who: this.playerName(q.asked_by), text: `Asked ${q.category}` });
      }
      if (q.resolved_at) {
        entries.push({ at: q.resolved_at, kind: 'answer', who: 'Hider', text: `${q.category}: ${this.answerText(q)}` });
      }
    }
    for (const c of g.curses) {
      if (c.at) {
        entries.push({ at: c.at, kind: 'curse', who: this.playerName(c.by), text: `Curse: ${c.name ?? ''}` });
      }
    }

    return entries.sort((a, b) => a.at - b.at);
  }
}
