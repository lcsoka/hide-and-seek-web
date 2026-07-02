import { TransitService } from './transit.service';

describe('TransitService', () => {
  const transit = new TransitService();

  describe('classifyStop', () => {
    it('classifies primary tags', () => {
      expect(transit.classifyStop({ railway: 'tram_stop' })).toEqual(['tram']);
      expect(transit.classifyStop({ highway: 'bus_stop' })).toEqual(['bus']);
      expect(transit.classifyStop({ amenity: 'bus_station' })).toEqual(['bus']);
      expect(transit.classifyStop({ station: 'subway' })).toEqual(['metro']);
      expect(transit.classifyStop({ railway: 'station' })).toEqual(['train']);
      expect(transit.classifyStop({ railway: 'halt' })).toEqual(['train']);
    });

    it('refines a station by its mode flags', () => {
      expect(transit.classifyStop({ railway: 'station', subway: 'yes' })).toEqual(['metro']);
      expect(transit.classifyStop({ railway: 'station', light_rail: 'yes' })).toEqual(['light_rail']);
    });

    it('lists every mode that serves an interchange', () => {
      expect(transit.classifyStop({ railway: 'tram_stop', bus: 'yes' })).toEqual(['tram', 'bus']);
      expect(transit.classifyStop({ station: 'subway', tram: 'yes', bus: 'yes' })).toEqual(['metro', 'tram', 'bus']);
      expect(transit.classifyStop({ public_transport: 'station', trolleybus: 'yes' })).toEqual(['trolleybus']);
    });

    it('falls back to a generic stop', () => {
      expect(transit.classifyStop({})).toEqual(['stop']);
      expect(transit.classifyStop({ public_transport: 'platform' })).toEqual(['stop']);
    });

    it('gives every mode display metadata with a colour', () => {
      for (const id of ['metro', 'tram', 'train', 'light_rail', 'bus', 'trolleybus', 'stop']) {
        expect(transit.transitMeta(id).color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(transit.transitMeta(id).icon.length).toBeGreaterThan(0);
      }
      expect(transit.transitMeta('nonsense').id).toBe('stop');
    });
  });
});
