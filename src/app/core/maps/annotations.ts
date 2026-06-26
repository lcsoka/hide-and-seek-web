import { Position, ResolvedQuestion } from '../models/models';
import { answerLabel, categoryMeta } from '../util/categories';
import { formatDistance, Units } from '../util/units';

/** A numbered, explained marker for an answered question on the deduction map. */
export interface MapAnnotation {
  n: number;
  seq: number;
  category: string;
  icon: string;
  answer: string;
  /** Short explanation of how this question cut the map. */
  effect: string;
  point: Position | null;
  radarKm?: number;
  within?: boolean;
  thermo?: { a: Position; b: Position };
  photoUrl?: string;
  /** The reference OSM feature (matching/measuring/tentacles) — shown as a labelled pin. */
  feature?: { lat: number; lng: number; name: string | null };
}

function midpoint(a: Position, b: Position): Position {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/** OSM admin level → friendly Hungarian zone name (mirrors the seeder's admin ladder). */
function zoneName(level: number | null | undefined): string {
  return { 6: 'county', 7: 'district', 8: 'town', 9: 'borough' }[level ?? -1] ?? 'zone';
}

/**
 * Build per-question annotations (numbered to match the history list). Each `effect` is a
 * short plain-language sentence explaining WHY the map was cut that way — kept (blue) vs
 * removed (red) — shown as the on-map label and in the history.
 */
export function buildAnnotations(questions: ResolvedQuestion[], units: Units): MapAnnotation[] {
  return questions.map((q, i) => {
    const meta = categoryMeta(q.category);
    const answer = q.answer?.answer ?? '';
    const place = q.answer?.feature_name ?? null;
    const askPoint = q.ask.lat != null && q.ask.lng != null ? { lat: q.ask.lat, lng: q.ask.lng } : null;
    const feature = q.answer?.feature_lat != null && q.answer?.feature_lng != null
      ? { lat: q.answer.feature_lat, lng: q.answer.feature_lng, name: place }
      : undefined;
    const base = { n: i + 1, seq: q.seq, category: q.category, icon: meta.icon, answer };

    if (q.category === 'radar' && askPoint) {
      const within = answer === 'yes';
      const dist = formatDistance(q.ask.radius_m ?? 0, units);

      return {
        ...base,
        point: askPoint,
        radarKm: (q.ask.radius_m ?? 0) / 1000,
        within,
        effect: within ? `Hider within ${dist} of here → kept this circle` : `Hider beyond ${dist} from here → removed this circle`,
      };
    }

    if (q.category === 'thermometer' && q.ask.start_lat != null && q.ask.start_lng != null && q.end.lat != null && q.end.lng != null) {
      const a: Position = { lat: q.ask.start_lat, lng: q.ask.start_lng };
      const b: Position = { lat: q.end.lat, lng: q.end.lng };
      const warmer = answer === 'hotter';

      return {
        ...base,
        point: midpoint(a, b),
        thermo: { a, b },
        within: true,
        effect: warmer ? 'Hider got warmer moving this way → kept the half toward here' : 'Hider got colder moving this way → kept the half behind the start',
      };
    }

    if (q.category === 'photo') {
      return { ...base, point: askPoint, effect: 'Photo clue from the hider', photoUrl: q.answer?.photo_url };
    }

    if (q.category === 'tentacles') {
      if (answer === 'out_of_range') {
        return { ...base, point: askPoint, within: false, effect: `Hider outside this ${formatDistance(q.ask.radius_m ?? 0, units)} ring → removed it` };
      }

      return { ...base, point: askPoint, feature, within: true, effect: place ? `Hider's nearest is ${place} → kept ${place}'s area` : 'Hider in range → kept that cell' };
    }

    if (q.category === 'measuring') {
      const closer = answer === 'closer';

      return {
        ...base,
        point: askPoint,
        feature,
        within: closer,
        effect: place
          ? (closer ? `Hider closer to ${place} than you → kept inside that ring` : `Hider further from ${place} than you → kept outside that ring`)
          : answerLabel(answer),
      };
    }

    if (q.category === 'matching' && q.ask.admin_level != null) {
      const same = answer === 'yes';
      const zone = zoneName(q.ask.admin_level);

      return { ...base, point: askPoint, within: same, effect: same ? `Same ${zone} as you → kept that ${zone}` : `Different ${zone} → removed yours` };
    }

    if (q.category === 'matching') {
      const same = answer === 'yes';

      return {
        ...base,
        point: askPoint,
        feature,
        within: same,
        effect: same
          ? (place ? `Same nearest place (${place}) → kept the area around it` : 'Same nearest place → kept that area')
          : (place ? `Hider's nearest isn't ${place} → removed the area around it` : 'Different nearest place → removed that area'),
      };
    }

    return { ...base, point: askPoint, feature, effect: answerLabel(answer) };
  });
}
