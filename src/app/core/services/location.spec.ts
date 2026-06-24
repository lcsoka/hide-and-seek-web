import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { LocationTracker } from './location';
import { LOCATION_SOURCE } from './location-source';
import { SimulatedLocationSource } from './simulated-location-source';

describe('LocationTracker', () => {
  it('posts the simulated position to /location', () => {
    const sim = new SimulatedLocationSource();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LOCATION_SOURCE, useValue: sim }],
    });
    const tracker = TestBed.inject(LocationTracker);
    const httpMock = TestBed.inject(HttpTestingController);

    sim.jumpTo({ lat: 47.5, lng: 19.05 });
    tracker.start('sess-1');

    const req = httpMock.expectOne(`${environment.apiBase}/sessions/sess-1/location`);
    expect(req.request.body).toEqual({ lat: 47.5, lng: 19.05 });
    req.flush({});
    httpMock.verify();
  });
});
