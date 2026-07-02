import { ResolvedQuestion } from '../models';
import { DeductionQuestion } from './deduction';

/**
 * Convert the game's answered questions into deduction questions for the map.
 * Radar and thermometer are pure geometry and reconstruct fully from the seeker's
 * own positions + the answer; the OSM-backed categories (matching/measuring/
 * tentacles) are shown in the history but not auto-rendered here yet.
 */
export function resolvedQuestionsToDeduction(questions: ResolvedQuestion[]): DeductionQuestion[] {
  const out: DeductionQuestion[] = [];

  for (const q of questions) {
    const answer = q.answer?.answer;

    if (q.category === 'radar' && q.ask.lat != null && q.ask.lng != null && q.ask.radius_m) {
      out.push({
        id: `q${q.seq}`,
        type: 'radar',
        lat: q.ask.lat,
        lng: q.ask.lng,
        radiusKm: q.ask.radius_m / 1000,
        within: answer === 'yes' ? true : answer === 'no' ? false : null,
      });
    } else if (
      q.category === 'thermometer' &&
      q.ask.start_lat != null &&
      q.ask.start_lng != null &&
      q.end.lat != null &&
      q.end.lng != null &&
      // Skip a degenerate segment (seeker barely moved) — its bisector is meaningless.
      Math.hypot(q.end.lat - q.ask.start_lat, q.end.lng - q.ask.start_lng) > 0.0003
    ) {
      out.push({
        id: `q${q.seq}`,
        type: 'thermometer',
        aLat: q.ask.start_lat,
        aLng: q.ask.start_lng,
        bLat: q.end.lat,
        bLng: q.end.lng,
        warmer: answer === 'hotter' ? true : answer === 'colder' ? false : null,
      });
    }
  }

  return out;
}
