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
      for (const q of s.questions) {
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
}
