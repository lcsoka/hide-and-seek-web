import { classifyStop, transitMeta } from './transit';

describe('classifyStop', () => {
  it('classifies primary tags', () => {
    expect(classifyStop({ railway: 'tram_stop' })).toEqual(['tram']);
    expect(classifyStop({ highway: 'bus_stop' })).toEqual(['bus']);
    expect(classifyStop({ amenity: 'bus_station' })).toEqual(['bus']);
    expect(classifyStop({ station: 'subway' })).toEqual(['metro']);
    expect(classifyStop({ railway: 'station' })).toEqual(['train']);
    expect(classifyStop({ railway: 'halt' })).toEqual(['train']);
  });

  it('refines a station by its mode flags', () => {
    expect(classifyStop({ railway: 'station', subway: 'yes' })).toEqual(['metro']);
    expect(classifyStop({ railway: 'station', light_rail: 'yes' })).toEqual(['light_rail']);
  });

  it('lists every mode that serves an interchange', () => {
    expect(classifyStop({ railway: 'tram_stop', bus: 'yes' })).toEqual(['tram', 'bus']);
    expect(classifyStop({ station: 'subway', tram: 'yes', bus: 'yes' })).toEqual(['metro', 'tram', 'bus']);
    expect(classifyStop({ public_transport: 'station', trolleybus: 'yes' })).toEqual(['trolleybus']);
  });

  it('falls back to a generic stop', () => {
    expect(classifyStop({})).toEqual(['stop']);
    expect(classifyStop({ public_transport: 'platform' })).toEqual(['stop']);
  });

  it('gives every mode display metadata with a colour', () => {
    for (const id of ['metro', 'tram', 'train', 'light_rail', 'bus', 'trolleybus', 'stop']) {
      expect(transitMeta(id).color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(transitMeta(id).icon.length).toBeGreaterThan(0);
    }
    expect(transitMeta('nonsense').id).toBe('stop');
  });
});
