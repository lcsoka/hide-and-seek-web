import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FeatureCollection, Point } from 'geojson';
import { applyQuestions, playArea } from '../../core/deduction/deduction';
import { DeductionQuestion, RegionQuestion } from '../../core/deduction/deduction.model';
import { resolvedQuestionsToDeduction } from '../../core/deduction/game-deduction';
import { isOsmCategory, OsmDeductionService } from '../../core/deduction/osm-deduction.service';
import { ActiveCurse, GodView, ResolvedQuestion } from '../../core/models';
import { DebugApi } from '../../core/services/debug-api';
import { LabelService } from '../../core/services/label.service';
import { UnitsService } from '../../core/services/units.service';
import { MediaViewerService } from '../../shared/media-viewer';
import { Icon } from '../../shared/icon';
import { DeductionMap } from '../map/deduction-map';

interface TimelineEntry {
  at: number;
  kind: 'step' | 'ask' | 'answer' | 'curse';
  who: string;
  text: string;
  media?: string[]; // photo/video URLs (question photo answers, curse proofs) — tap to view
  card?: { name: string; color: string; emblem: string }; // a played card, shown as a chip
}

@Component({
  selector: 'app-replay',
  imports: [RouterLink, DeductionMap, Icon],
  templateUrl: './replay.html',
})
export class Replay {
  private readonly route = inject(ActivatedRoute);
  private readonly debug = inject(DebugApi);
  private readonly osmDeduction = inject(OsmDeductionService);
  private readonly label = inject(LabelService);
  private readonly unitsService = inject(UnitsService);
  readonly media = inject(MediaViewerService);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly god = signal<GodView | null>(null);
  readonly error = signal<string | null>(null);
  readonly osmRegions = signal<Map<number, RegionQuestion>>(new Map());
  private readonly osmSeen = new Set<number>();

  readonly units = computed(() => this.unitsService.unitsOf(this.god()?.config));
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
          void this.osmDeduction.region(q).then((r) => {
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

  /** A stable hh:mm:ss clock (not the locale's am/pm formatting). */
  time(at: number): string {
    if (!at) {
      return '';
    }
    const d = new Date(at * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  isVideo(url: string): boolean {
    return /\.(mp4|mov|m4v|webm|3gp|ogv)(\?|#|$)/i.test(url);
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

    return q.category === 'radar' && q.ask.radius_m ? `${text} (≤ ${this.unitsService.formatDistance(q.ask.radius_m, this.units())})` : text;
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
        entries.push({ at: l.at, kind: 'step', who: this.playerName(l.player_id), text: this.label.actionLabel(l.type) });
      }
    }
    for (const q of g.questions) {
      if (q.asked_at) {
        entries.push({ at: q.asked_at, kind: 'ask', who: this.playerName(q.asked_by), text: `Asked ${q.category}` });
      }
      if (q.resolved_at) {
        // A photo-question answer is the hider's photo/video — surface it inline.
        const media = q.answer?.photo_url ? [q.answer.photo_url] : undefined;
        entries.push({ at: q.resolved_at, kind: 'answer', who: 'Hider', text: `${q.category}: ${this.answerText(q)}`, media });
      }
    }
    for (const c of g.curses) {
      if (c.at) {
        // The hider's cast media + the seeker's proof (photo or video), whichever exist.
        const media = [c.hint_photo_url, c.proof_url].filter((u): u is string => !!u);
        entries.push({
          at: c.at,
          kind: 'curse',
          who: this.playerName(c.by),
          text: this.curseStatus(c),
          card: { name: c.name ?? 'Curse', color: 'var(--color-curse)', emblem: 'curse' },
          media: media.length ? media : undefined,
        });
      }
    }

    return entries.sort((a, b) => a.at - b.at);
  }

  private curseStatus(c: ActiveCurse): string {
    return c.status === 'completed' ? 'Curse cleared' : c.status === 'expired' ? 'Curse expired' : 'Curse played';
  }
}
