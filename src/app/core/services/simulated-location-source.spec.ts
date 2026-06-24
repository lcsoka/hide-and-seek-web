import { Position } from '../models/models';
import { SimulatedLocationSource } from './simulated-location-source';

describe('SimulatedLocationSource', () => {
  it('jumps to a position and reports it', () => {
    const src = new SimulatedLocationSource();
    src.jumpTo({ lat: 1, lng: 2 });
    expect(src.current()).toEqual({ lat: 1, lng: 2 });
  });

  it('steps toward a target and eventually arrives', () => {
    const src = new SimulatedLocationSource();
    src.jumpTo({ lat: 0, lng: 0 });

    expect(src.step({ lat: 0, lng: 1 }, 100)).toBe(false);
    expect(src.current().lng).toBeGreaterThan(0);
    expect(src.current().lng).toBeLessThan(1);

    expect(src.step({ lat: 0, lng: 1 }, 100_000_000)).toBe(true);
    expect(src.current()).toEqual({ lat: 0, lng: 1 });
  });

  it('streams emitted positions', () => {
    const src = new SimulatedLocationSource();
    const seen: Position[] = [];
    const sub = src.positions().subscribe((p) => seen.push(p));

    src.jumpTo({ lat: 5, lng: 6 });
    sub.unsubscribe();

    expect(seen.at(-1)).toEqual({ lat: 5, lng: 6 });
  });
});
