import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { LocationTracker, shouldSendLocation } from './location';
import { LOCATION_SOURCE } from './location-source';
import { SimulatedLocationSource } from './simulated-location-source';

describe('shouldSendLocation (GPS deadband)', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const base = at(47.5, 19.05);

  it('always sends the first fix', () => {
    expect(shouldSendLocation(null, 0, base, 10_000)).toBe(true);
  });

  it('rate-limits to ~1/s even for a large jump', () => {
    expect(shouldSendLocation(base, 10_000, at(47.6, 19.05), 10_500)).toBe(false);
  });

  it('ignores sub-10m GPS jitter', () => {
    // ~3m north, 2s after the last send — under the deadband, no heartbeat due.
    expect(shouldSendLocation(base, 10_000, at(47.50003, 19.05), 12_000)).toBe(false);
  });

  it('sends real movement past the deadband', () => {
    // ~33m north, 2s later.
    expect(shouldSendLocation(base, 10_000, at(47.5003, 19.05), 12_000)).toBe(true);
  });

  it('sends a heartbeat when stationary past the interval', () => {
    // ~3m jitter, but 50s since the last send.
    expect(shouldSendLocation(base, 10_000, at(47.50003, 19.05), 60_000)).toBe(true);
  });
});

describe('LocationTracker', () => {
  it('posts the simulated position to /location', () => {
    const sim = new SimulatedLocationSource();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LOCATION_SOURCE, useValue: sim },
        // LocationTracker → SessionStore → TranslocoService (only .translate is used here).
        { provide: TranslocoService, useValue: { translate: (k: string) => k } },
      ],
    });
    const tracker = TestBed.inject(LocationTracker);
    const httpMock = TestBed.inject(HttpTestingController);

    sim.jumpTo({ lat: 47.5, lng: 19.05 });
    tracker.start('sess-1', 'p1');

    const req = httpMock.expectOne(`${environment.apiBase}/sessions/sess-1/location`);
    expect(req.request.body).toEqual({ lat: 47.5, lng: 19.05 });
    req.flush({});
    httpMock.verify();
  });
});
