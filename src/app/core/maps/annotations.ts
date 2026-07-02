import { Position, ResolvedQuestion } from '../models';
import { categoryMeta } from '../util/categories';
import { formatDistance } from '../util/units';
import { Units } from '../util/units.model';
import { MapAnnotation, Translate } from './map.model';

function midpoint(a: Position, b: Position): Position {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/** OSM admin level → localized zone name (mirrors the seeder's admin ladder). */
function zoneName(level: number | null | undefined, t: Translate): string {
  const key = { 6: 'county', 7: 'district', 8: 'town', 9: 'borough' }[level ?? -1] ?? 'zone';

  return t('annot.zone.' + key);
}

/**
 * Build per-question annotations (numbered to match the history list). Each `effect` is a
 * short plain-language sentence explaining WHY the map was cut that way — kept (blue) vs
 * removed (red) — shown as the on-map label and in the history. `t` localizes the sentences
 * (so they re-render on a language switch when the caller depends on the lang signal).
 */
export function buildAnnotations(questions: ResolvedQuestion[], units: Units, t: Translate): MapAnnotation[] {
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
        effect: t(within ? 'annot.radarIn' : 'annot.radarOut', { dist }),
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
        effect: t(warmer ? 'annot.thermoWarm' : 'annot.thermoCold'),
      };
    }

    if (q.category === 'photo') {
      return { ...base, point: askPoint, effect: t('annot.photo'), photoUrl: q.answer?.photo_url };
    }

    if (q.category === 'tentacles') {
      if (answer === 'out_of_range') {
        return { ...base, point: askPoint, within: false, effect: t('annot.tentOut', { dist: formatDistance(q.ask.radius_m ?? 0, units) }) };
      }

      return { ...base, point: askPoint, feature, within: true, effect: place ? t('annot.tentInPlace', { place }) : t('annot.tentIn') };
    }

    if (q.category === 'measuring') {
      const closer = answer === 'closer';

      return {
        ...base,
        point: askPoint,
        feature,
        within: closer,
        effect: place
          ? t(closer ? 'annot.measCloser' : 'annot.measFurther', { place })
          : t('answer.' + (answer || 'none')),
      };
    }

    if (q.category === 'matching' && q.ask.admin_level != null) {
      const same = answer === 'yes';
      const zone = zoneName(q.ask.admin_level, t);

      return { ...base, point: askPoint, within: same, effect: t(same ? 'annot.matchSameZone' : 'annot.matchDiffZone', { zone }) };
    }

    if (q.category === 'matching') {
      const same = answer === 'yes';

      return {
        ...base,
        point: askPoint,
        feature,
        within: same,
        effect: same
          ? (place ? t('annot.matchSamePlace', { place }) : t('annot.matchSame'))
          : (place ? t('annot.matchDiffPlace', { place }) : t('annot.matchDiff')),
      };
    }

    return { ...base, point: askPoint, feature, effect: t('answer.' + (answer || 'none')) };
  });
}
