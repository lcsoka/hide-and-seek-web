import { OverpassService } from './overpass';

describe('OverpassService caching', () => {
  let service: OverpassService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    service = new OverpassService();
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 })));
  });

  afterEach(() => fetchSpy.mockRestore());

  it('fetches once and serves repeats from cache', async () => {
    const a = await service.run('node;out;');
    const b = await service.run('node;out;');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(sessionStorage.getItem('ovp:node;out;')).toBeTruthy();
  });

  it('de-dupes concurrent identical queries into one request', async () => {
    const [a, b] = await Promise.all([service.run('way;out;'), service.run('way;out;')]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('fetches separately for different queries', async () => {
    await service.run('a;out;');
    await service.run('b;out;');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reads a fresh response back from sessionStorage on a new instance', async () => {
    await service.run('rel;out;');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const fresh = new OverpassService();
    await fresh.run('rel;out;');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // served from sessionStorage, no new fetch
  });
});
