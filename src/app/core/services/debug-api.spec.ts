import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { DebugApi } from './debug-api';

describe('DebugApi', () => {
  let api: DebugApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DebugApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the god view with the developer token header', async () => {
    const promise = api.state('s1');

    const req = httpMock.expectOne(`${environment.apiBase}/sessions/s1/debug/state`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('X-Developer-Token')).toBe(environment.developerToken);
    req.flush({ session_id: 's1', state: 'lobby', status: 'open', round: 0, config: {}, state_data: {}, players: [], teams: [] });

    await expect(promise).resolves.toMatchObject({ state: 'lobby' });
  });

  it('acts as a player', async () => {
    const promise = api.actAs('s1', 'p1', 'assign_hider', { player_id: 'p1' });

    const req = httpMock.expectOne(`${environment.apiBase}/sessions/s1/debug/act-as`);
    expect(req.request.body).toEqual({ player_id: 'p1', type: 'assign_hider', payload: { player_id: 'p1' } });
    req.flush({ session_id: 's1', state: 'hiding', status: 'running', round: 0, config: {}, state_data: {}, players: [], teams: [] });

    await expect(promise).resolves.toMatchObject({ state: 'hiding' });
  });

  it('spoofs a player location', async () => {
    const promise = api.spoofLocation('s1', 'p1', 47.5, 19.05);

    const req = httpMock.expectOne(`${environment.apiBase}/sessions/s1/debug/location`);
    expect(req.request.body).toEqual({ player_id: 'p1', lat: 47.5, lng: 19.05 });
    req.flush({ session_id: 's1', state: 'hiding', status: 'running', round: 0, config: {}, state_data: {}, players: [], teams: [] });

    await expect(promise).resolves.toBeTruthy();
  });
});
