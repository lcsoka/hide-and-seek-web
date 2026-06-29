import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { TokenStore } from '../services/token-store';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: { getActiveLang: () => 'hu' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token when present', () => {
    TestBed.inject(TokenStore).set('tok123');
    http.get('/x').subscribe();

    const req = httpMock.expectOne('/x');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok123');
    req.flush({});
  });

  it('sends no Authorization header when there is no token', () => {
    http.get('/y').subscribe();

    const req = httpMock.expectOne('/y');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('sends the active language so the backend localizes content', () => {
    http.get('/z').subscribe();

    const req = httpMock.expectOne('/z');
    expect(req.request.headers.get('Accept-Language')).toBe('hu');
    req.flush({});
  });
});
