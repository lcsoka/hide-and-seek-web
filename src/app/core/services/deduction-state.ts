import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { buildAnnotations } from '../maps/annotations';
import { applyQuestions, DeductionQuestion, playArea, RegionQuestion } from '../maps/deduction';
import { resolvedQuestionsToDeduction } from '../maps/game-deduction';
import { isOsmCategory, osmRegion } from '../maps/osm-deduction';
import { OverpassService } from '../maps/overpass';
import { Poly } from '../maps/operators';
import { unitsOf } from '../util/units';
import { SessionStore } from './session-store';

/**
 * Derives the seeker's deduction map from the live game state so the shell can
 * render the map while panels stay focused. Radar/thermometer resolve synchronously;
 * the OSM categories are fetched + cached per question seq in the background.
 */
@Injectable({ providedIn: 'root' })
export class DeductionState {
  private readonly overpass = inject(OverpassService);
  private readonly store = inject(SessionStore);

  private readonly osmRegions = signal<Map<number, RegionQuestion>>(new Map());
  private readonly osmSeen = new Set<number>();
  // The play area defaults to the city's real admin boundary (fetched once), not a circle.
  private readonly cityBoundary = signal<Poly | null>(null);
  private boundaryCity: string | null = null;
  // In-flight OSM fetch batches. The map holds rendering until they settle, so on
  // reload the deduction is computed once (not visibly clue-by-clue). A watchdog caps
  // the hold so a slow/rate-limited Overpass can never block the map indefinitely.
  private readonly pending = signal(0);
  readonly computing = computed(() => this.pending() > 0);

  readonly markerQuestions = computed(() => resolvedQuestionsToDeduction(this.store.state()?.questions ?? []));
  readonly narrowedCount = computed(() => this.markerQuestions().length + this.osmRegions().size);
  /** Numbered, explained markers for every answered question (shared by the map + history). */
  readonly annotations = computed(() => buildAnnotations(this.store.state()?.questions ?? [], unitsOf(this.store.state()?.config)));

  readonly candidate = computed(() => {
    const s = this.store.state();
    if (!s) {
      return null;
    }
    const city = s.config?.['city'] as { lat?: number; lng?: number } | undefined;
    const lat = city?.lat ?? 47.4979;
    const lng = city?.lng ?? 19.0402;
    const radiusKm = Number(s.config?.['play_radius_km'] ?? 50) || 50;
    // Prefer the city boundary; fall back to a radius circle until it loads / if it fails.
    const base = this.cityBoundary() ?? playArea(lat, lng, radiusKm);
    const questions: DeductionQuestion[] = [...this.markerQuestions(), ...this.osmRegions().values()];
    try {
      return applyQuestions(base, questions);
    } catch {
      return null;
    }
  });

  constructor() {
    // Load the city's admin boundary once per session as the play-area base.
    effect(() => {
      const city = this.store.state()?.config?.['city'] as { key?: string; lat?: number; lng?: number } | undefined;
      if (city?.lat != null && city?.lng != null && (city.key ?? '') !== this.boundaryCity) {
        this.boundaryCity = city.key ?? `${city.lat},${city.lng}`;
        // The boundary is just the play-area base (falls back to a circle), so it
        // doesn't block rendering — it swaps in whenever it lands.
        void this.overpass.adminBoundary(city.lat, city.lng, 8).then((b) => {
          if (b) {
            this.cityBoundary.set(b as Poly);
          }
        });
      }
    });

    effect(() => {
      const s = this.store.state();
      if (!s) {
        return;
      }
      // Fetch every newly-seen OSM question concurrently and commit them in ONE update,
      // so the candidate isn't recomputed once per clue as each fetch trickles in.
      const fresh = s.questions.filter((q) => isOsmCategory(q.category) && q.ask.lat != null && q.ask.feature && !this.osmSeen.has(q.seq));
      if (!fresh.length) {
        return;
      }
      fresh.forEach((q) => this.osmSeen.add(q.seq));
      this.pending.update((n) => n + 1);
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          clearTimeout(watchdog);
          this.pending.update((n) => n - 1);
        }
      };
      // Cap the hold: if Overpass is slow, stop blocking and let regions trickle in.
      const watchdog = setTimeout(settle, 10000);
      void Promise.all(
        fresh.map((q) =>
          osmRegion(this.overpass, q)
            .then((r) => {
              // Commit each region as it lands so a late one (post-watchdog) still applies.
              if (r) {
                this.osmRegions.update((m) => new Map(m).set(q.seq, { id: `q${q.seq}`, type: 'region', label: q.category, region: r.region, within: r.within }));
              }
            })
            .catch(() => undefined),
        ),
      ).finally(settle);
    });
  }
}
