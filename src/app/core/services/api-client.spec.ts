import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ApiClient } from './api-client';

describe('ApiClient', () => {
  let api: ApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests a guest token', async () => {
    const promise = api.guest('Anna');

    const req = httpMock.expectOne(`${environment.apiBase}/auth/guest`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ display_name: 'Anna' });
    req.flush({ token: 't', display_name: 'Anna', user_id: 'u' });

    await expect(promise).resolves.toMatchObject({ token: 't' });
  });

  it('creates a session with city + size', async () => {
    const promise = api.createSession({ city: 'budapest', game_size: 'medium' });

    const req = httpMock.expectOne(`${environment.apiBase}/sessions`);
    expect(req.request.body).toMatchObject({ city: 'budapest', game_size: 'medium' });
    req.flush({ id: 's1', join_code: 'ABC123' });

    await expect(promise).resolves.toMatchObject({ id: 's1' });
  });

  it('submits an action', async () => {
    const promise = api.submitAction('s1', 'start');

    const req = httpMock.expectOne(`${environment.apiBase}/sessions/s1/actions`);
    expect(req.request.body).toEqual({ type: 'start', payload: {} });
    req.flush({ state: 'role_assignment' });

    await expect(promise).resolves.toMatchObject({ state: 'role_assignment' });
  });
});
