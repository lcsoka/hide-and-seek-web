import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FeatureCollection, Point } from 'geojson';
import { applyQuestions, playArea } from '../../core/deduction/deduction';
import { DeductionQuestion, RegionQuestion } from '../../core/deduction/deduction.model';
import { resolvedQuestionsToDeduction } from '../../core/deduction/game-deduction';
import { isOsmCategory, OsmDeductionService } from '../../core/deduction/osm-deduction.service';
import { TranslocoService } from '@jsverse/transloco';
import { AnnotationsService } from '../../core/maps/annotations.service';
import { MapAnnotation } from '../../core/maps/map.model';
import { ActiveCurse, GodView, ResolvedQuestion } from '../../core/models';
import { DebugApi } from '../../core/services/debug-api';
import { Language } from '../../core/services/language';
import { LabelService } from '../../core/services/label.service';
import { UnitsService } from '../../core/services/units.service';
import { MediaViewerService } from '../../shared/media-viewer';
import { Icon } from '../../shared/icon';
import { DeductionMap } from '../map/deduction-map';
import { ReplayScrubber } from './replay-scrubber';

interface TimelineEntry {
  at: number;
  kind: 'step' | 'ask' | 'answer' | 'curse';
  who: string;
  text: string;
  media?: string[]; // photo/video URLs (question photo answers, curse proofs) — tap to view
  card?: { name: string; color: string; emblem: string }; // a played card, shown as a chip
  explain?: string; // plain-language reason (why the map was cut, what the curse did)
  num?: number; // the map pin number this event corresponds to (answers only)
}

/** One player's ordered movement samples (unix seconds). */
interface Track {
  lat: number;
  lng: number;
  at: number;
}

/** Linearly interpolate a player's position at time `t`, clamped to the ends of their track. */
function positionAt(track: Track[], t: number): { lat: number; lng: number } | null {
  if (!track.length) {
    return null;
  }
  if (t <= track[0].at) {
    return { lat: track[0].lat, lng: track[0].lng };
  }
  const last = track[track.length - 1];
  if (t >= last.at) {
    return { lat: last.lat, lng: last.lng };
  }
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (t >= a.at && t <= b.at) {
      const span = b.at - a.at;
      const f = span > 0 ? (t - a.at) / span : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
  }
  return { lat: last.lat, lng: last.lng };
}

/** Two seq-sets are equal if they hold the same members — lets the candidate recompute only when a cut lands. */
function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const x of a) {
    if (!b.has(x)) {
      return false;
    }
  }
  return true;
}

@Component({
  selector: 'app-replay',
  imports: [RouterLink, DeductionMap, Icon, ReplayScrubber],
  templateUrl: './replay.html',
})
export class Replay {
  private readonly route = inject(ActivatedRoute);
  private readonly debug = inject(DebugApi);
  private readonly osmDeduction = inject(OsmDeductionService);
  private readonly label = inject(LabelService);
  private readonly unitsService = inject(UnitsService);
  private readonly annotationsService = inject(AnnotationsService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(Language);
  readonly media = inject(MediaViewerService);

  private readonly deductionMap = viewChild(DeductionMap);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly god = signal<GodView | null>(null);
  readonly error = signal<string | null>(null);
  readonly osmRegions = signal<Map<number, RegionQuestion>>(new Map());
  private readonly osmSeen = new Set<number>();

  // Playback state: a movable playhead over the game's [t0, t1] window, plus transport.
  readonly playhead = signal(0);
  readonly playing = signal(false);
  readonly speed = signal(60); // game-seconds advanced per real second while playing
  readonly showTrails = signal(true); // draw each player's movement path up to the playhead
  private fitted = false;

  readonly units = computed(() => this.unitsService.unitsOf(this.god()?.config));
  readonly markerQuestions = computed(() => resolvedQuestionsToDeduction(this.god()?.questions ?? []));

  /** The game's time window: earliest → latest of every stamped event and position sample. */
  readonly domain = computed<{ t0: number; t1: number }>(() => {
    const g = this.god();
    if (!g) {
      return { t0: 0, t1: 0 };
    }
    let t0 = Infinity;
    let t1 = -Infinity;
    const see = (at: number | null | undefined) => {
      if (at != null) {
        t0 = Math.min(t0, at);
        t1 = Math.max(t1, at);
      }
    };
    for (const p of g.positions ?? []) see(p.at);
    for (const q of g.questions) {
      see(q.asked_at);
      see(q.resolved_at);
    }
    for (const c of g.curses) see(c.at);
    for (const l of g.action_logs) see(l.at);
    return Number.isFinite(t0) ? { t0, t1 } : { t0: 0, t1: 0 };
  });

  /** Whether the game has any scrubbable history (positions or stamped events). */
  readonly hasTimeline = computed(() => {
    const d = this.domain();
    return d.t1 > d.t0;
  });

  /** Movement samples grouped per player, each track ordered by time. */
  private readonly tracks = computed(() => {
    const byId = new Map<string, Track[]>();
    for (const p of this.god()?.positions ?? []) {
      if (p.at == null) {
        continue;
      }
      const list = byId.get(p.player_id) ?? [];
      list.push({ lat: p.lat, lng: p.lng, at: p.at });
      byId.set(p.player_id, list);
    }
    for (const list of byId.values()) {
      list.sort((a, b) => a.at - b.at);
    }
    return byId;
  });

  /** Which questions have been answered as of the playhead — only these cut the map. */
  private readonly appliedSeqs = computed(
    () => {
      const t = this.playhead();
      const s = new Set<number>();
      for (const q of this.god()?.questions ?? []) {
        if (q.resolved_at != null && q.resolved_at <= t) {
          s.add(q.seq);
        }
      }
      return s;
    },
    { equal: sameSet },
  );

  private seqOf(id: string): number {
    return Number(String(id).replace(/^q/, ''));
  }

  /** Geometry cuts (radar/thermometer) applied so far, for the map's question layer. */
  readonly activeMarkerQuestions = computed(() => {
    const applied = this.appliedSeqs();
    return this.markerQuestions().filter((dq) => applied.has(this.seqOf(dq.id)));
  });

  /** OSM-backed region cuts (matching/measuring) applied so far. */
  private readonly activeOsmRegions = computed(() => {
    const applied = this.appliedSeqs();
    const out: RegionQuestion[] = [];
    for (const [seq, r] of this.osmRegions()) {
      if (applied.has(seq)) {
        out.push(r);
      }
    }
    return out;
  });

  readonly candidate = computed(() => {
    const g = this.god();
    if (!g) {
      return null;
    }
    const city = g.config?.['city'] as { lat?: number; lng?: number } | undefined;
    const lat = city?.lat ?? 47.4979;
    const lng = city?.lng ?? 19.0402;
    const radiusKm = Number(g.config?.['play_radius_km'] ?? 50) || 50;
    const questions: DeductionQuestion[] = [...this.activeMarkerQuestions(), ...this.activeOsmRegions()];
    try {
      return applyQuestions(playArea(lat, lng, radiusKm), questions);
    } catch {
      return null;
    }
  });

  /** Every located player's position at the playhead (interpolated), for the map's point layer. */
  readonly playerPoints = computed<FeatureCollection<Point>>(() => {
    const t = this.playhead();
    const tracks = this.tracks();
    const features = (this.god()?.players ?? [])
      .map((p) => {
        const track = tracks.get(p.id);
        const pos = track?.length ? positionAt(track, t) : p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
        if (!pos) {
          return null;
        }
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [pos.lng, pos.lat] },
          properties: { name: `${p.display_name}${p.role ? ' (' + p.role + ')' : ''}`, color: this.playerColor(p.id, p.role) },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f != null);
    return { type: 'FeatureCollection', features };
  });

  /** All resolved questions as numbered, explained map annotations — radar circles, thermometer
   *  bisectors, reference pins, and a plain-language reason the map was cut that way. */
  private readonly allAnnotations = computed<MapAnnotation[]>(() => {
    this.language.lang(); // re-localize the effect sentences when the language switches…
    this.language.loaded(); // …and once the active language's file finishes loading (else raw keys)
    const resolved = (this.god()?.questions ?? []).filter((q) => q.resolved_at != null);
    return this.annotationsService.build(resolved, this.units(), (k, p) => this.transloco.translate(k, p));
  });

  /** Annotations for the questions answered by the playhead — shown on the map. */
  readonly activeAnnotations = computed(() => {
    const applied = this.appliedSeqs();
    return this.allAnnotations().filter((a) => applied.has(a.seq));
  });

  /** Region cuts (matching/measuring) applied by the playhead — outlined kept/removed on the map. */
  readonly activeRegions = computed(() => this.activeOsmRegions().map((r) => ({ region: r.region, within: r.within, label: r.label })));

  private readonly effectBySeq = computed(() => {
    const m = new Map<number, string>();
    for (const a of this.allAnnotations()) {
      m.set(a.seq, a.effect);
    }
    return m;
  });

  private readonly numBySeq = computed(() => {
    const m = new Map<number, number>();
    for (const a of this.allAnnotations()) {
      m.set(a.seq, a.n);
    }
    return m;
  });

  /** Each player's path up to the playhead, coloured per player — the toggleable trails layer. */
  readonly trails = computed<{ color: string; latlngs: [number, number][] }[]>(() => {
    if (!this.showTrails()) {
      return [];
    }
    const t = this.playhead();
    const out: { color: string; latlngs: [number, number][] }[] = [];
    for (const [id, track] of this.tracks()) {
      const pts = track.filter((s) => s.at <= t).map((s) => [s.lat, s.lng] as [number, number]);
      if (pts.length > 1) {
        const role = this.god()?.players.find((p) => p.id === id)?.role ?? null;
        out.push({ color: this.playerColor(id, role), latlngs: pts });
      }
    }
    return out;
  });

  readonly timeline = computed<TimelineEntry[]>(() => this.buildTimeline());

  constructor() {
    void this.load();

    // Frame the play area a single time, once the map and the (end-of-game) candidate are ready,
    // so scrubbing never yanks the view around. The playhead is seeded to t1 in load() before this
    // runs, so the fit uses the final deduction, not the full 50 km circle.
    effect(() => {
      const map = this.deductionMap();
      if (map && this.candidate() && !this.fitted) {
        this.fitted = true;
        queueMicrotask(() => map.fitToCandidate());
      }
    });

    // Playback: advance the playhead in real time while playing, stopping at the end.
    effect((onCleanup) => {
      if (!this.playing()) {
        return;
      }
      const step = this.speed() / 5; // 200ms ticks
      const timer = setInterval(() => {
        const end = this.domain().t1;
        const next = this.playhead() + step;
        if (next >= end) {
          this.playhead.set(end);
          this.playing.set(false);
        } else {
          this.playhead.set(next);
        }
      }, 200);
      onCleanup(() => clearInterval(timer));
    });

    effect(() => {
      const g = this.god();
      if (!g) {
        return;
      }
      for (const q of g.questions) {
        // OSM regions come from a point feature (measuring/tentacles/place-matching) OR an admin
        // level (zone-matching / border-measuring) — the latter has no feature, so gate on both.
        if (isOsmCategory(q.category) && q.ask.lat != null && (q.ask.feature || q.ask.admin_level != null || q.ask.boundary_level != null) && !this.osmSeen.has(q.seq)) {
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
      // Seed the playhead to the end of the window synchronously (before effects flush) so the
      // first candidate + one-time map fit reflect the final deduction, not an empty one.
      this.playhead.set(this.domain().t1);
      this.error.set(null);
    } catch {
      this.error.set('Could not load this session — is GAME_DEBUG enabled and the developer token set?');
    }
  }

  /** Play/pause; if paused at the very end, restart from the beginning. */
  togglePlay(): void {
    if (!this.playing() && this.playhead() >= this.domain().t1) {
      this.playhead.set(this.domain().t0);
    }
    this.playing.update((p) => !p);
  }

  seek(at: number): void {
    this.playing.set(false);
    this.playhead.set(at);
  }

  setSpeed(s: number): void {
    this.speed.set(s);
  }

  toggleTrails(): void {
    this.showTrails.update((v) => !v);
  }

  /** A stable per-player colour: the hider in rose, everyone else a hashed hue (matches trails). */
  private playerColor(id: string, role: string | null): string {
    if (role === 'hider') {
      return '#e11d48';
    }
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    }
    return `hsl(${Math.abs(h) % 360} 62% 45%)`;
  }

  dot(kind: TimelineEntry['kind']): string {
    return { step: 'bg-gray-400', ask: 'bg-blue-500', answer: 'bg-green-500', curse: 'bg-purple-500' }[kind];
  }

  /** True once the playhead has reached this entry — future entries render dimmed. */
  isPast(at: number): boolean {
    return at <= this.playhead();
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
        // The annotation's effect explains WHY the map was cut this way (kept vs ruled out).
        entries.push({ at: q.resolved_at, kind: 'answer', who: 'Hider', text: `${q.category}: ${this.answerText(q)}`, media, explain: this.effectBySeq().get(q.seq), num: this.numBySeq().get(q.seq) });
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
