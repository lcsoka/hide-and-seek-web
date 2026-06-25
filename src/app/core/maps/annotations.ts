import { Position, ResolvedQuestion } from '../models/models';
import { answerLabel, categoryMeta } from '../util/categories';
import { formatDistance, Units } from '../util/units';

/** A numbered, explained marker for an answered question on the deduction map. */
export interface MapAnnotation {
  n: number;
  category: string;
  icon: string;
  answer: string;
  /** Short explanation of how this question cut the map. */
  effect: string;
  point: Position | null;
  radarKm?: number;
  within?: boolean;
  thermo?: { a: Position; b: Position };
}

function midpoint(a: Position, b: Position): Position {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/** Build per-question annotations (numbered to match the history list). */
export function buildAnnotations(questions: ResolvedQuestion[], units: Units): MapAnnotation[] {
  return questions.map((q, i) => {
    const meta = categoryMeta(q.category);
    const answer = q.answer?.answer ?? '';
    const base = { n: i + 1, category: q.category, icon: meta.icon, answer };

    if (q.category === 'radar' && q.ask.lat != null && q.ask.lng != null) {
      const within = answer === 'yes';

      return {
        ...base,
        point: { lat: q.ask.lat, lng: q.ask.lng },
        radarKm: (q.ask.radius_m ?? 0) / 1000,
        within,
        effect: `${within ? 'Within' : 'Beyond'} ${formatDistance(q.ask.radius_m ?? 0, units)}`,
      };
    }

    if (q.category === 'thermometer' && q.ask.start_lat != null && q.ask.start_lng != null && q.end.lat != null && q.end.lng != null) {
      const a: Position = { lat: q.ask.start_lat, lng: q.ask.start_lng };
      const b: Position = { lat: q.end.lat, lng: q.end.lng };

      return { ...base, point: midpoint(a, b), thermo: { a, b }, effect: answer === 'hotter' ? 'Got warmer this way' : 'Got colder this way' };
    }

    const effect = answer === 'in_range' && q.answer?.feature_name
      ? `Nearest: ${q.answer.feature_name}`
      : { yes: 'Same place', no: 'Different place', closer: 'Closer to it', further: 'Further from it', out_of_range: 'Out of range' }[answer] ?? answerLabel(answer);

    return { ...base, point: q.ask.lat != null && q.ask.lng != null ? { lat: q.ask.lat, lng: q.ask.lng } : null, effect };
  });
}
