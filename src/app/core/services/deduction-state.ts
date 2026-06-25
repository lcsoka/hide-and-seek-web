import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { applyQuestions, DeductionQuestion, playArea, RegionQuestion } from '../maps/deduction';
import { resolvedQuestionsToDeduction } from '../maps/game-deduction';
import { isOsmCategory, osmRegion } from '../maps/osm-deduction';
import { OverpassService } from '../maps/overpass';
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

  readonly markerQuestions = computed(() => resolvedQuestionsToDeduction(this.store.state()?.questions ?? []));
  readonly narrowedCount = computed(() => this.markerQuestions().length + this.osmRegions().size);

  readonly candidate = computed(() => {
    const s = this.store.state();
    if (!s) {
      return null;
    }
    const city = s.config?.['city'] as { lat?: number; lng?: number } | undefined;
    const lat = city?.lat ?? 47.4979;
    const lng = city?.lng ?? 19.0402;
    const radiusKm = Number(s.config?.['play_radius_km'] ?? 50) || 50;
    const questions: DeductionQuestion[] = [...this.markerQuestions(), ...this.osmRegions().values()];
    try {
      return applyQuestions(playArea(lat, lng, radiusKm), questions);
    } catch {
      return null;
    }
  });

  constructor() {
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
