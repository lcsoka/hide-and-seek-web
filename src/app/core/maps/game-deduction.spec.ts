import { ResolvedQuestion } from '../models/models';
import { resolvedQuestionsToDeduction } from './game-deduction';

function resolved(partial: Partial<ResolvedQuestion>): ResolvedQuestion {
  return {
    seq: 1, category: 'radar', question_id: null, asked_by: null, asked_at: null, resolved_at: null, auto: false,
    answer: null,
    ask: { lat: null, lng: null, radius_m: null, start_lat: null, start_lng: null },
    end: { lat: null, lng: null },
    ...partial,
  };
}

describe('resolvedQuestionsToDeduction', () => {
  it('maps a radar question to a radar deduction (within from yes/no)', () => {
    const out = resolvedQuestionsToDeduction([
      resolved({ seq: 3, category: 'radar', answer: { answer: 'no' }, ask: { lat: 47.5, lng: 19.0, radius_m: 1609, start_lat: null, start_lng: null } }),
    ]);

    expect(out).toEqual([{ id: 'q3', type: 'radar', lat: 47.5, lng: 19.0, radiusKm: 1.609, within: false }]);
  });

  it('maps a thermometer question using start (A) and end (B) positions', () => {
    const out = resolvedQuestionsToDeduction([
      resolved({
        seq: 4, category: 'thermometer', answer: { answer: 'hotter' },
        ask: { lat: 47.5, lng: 19.0, radius_m: null, start_lat: 47.5, start_lng: 19.0 },
        end: { lat: 47.6, lng: 19.1 },
      }),
    ]);

    expect(out).toEqual([{ id: 'q4', type: 'thermometer', aLat: 47.5, aLng: 19.0, bLat: 47.6, bLng: 19.1, warmer: true }]);
  });

  it('skips OSM-backed categories and incomplete questions', () => {
    const out = resolvedQuestionsToDeduction([
      resolved({ category: 'matching', answer: { answer: 'yes' } }),
      resolved({ category: 'radar', answer: { answer: 'yes' } }), // no ask coords
    ]);

    expect(out).toEqual([]);
  });
});
