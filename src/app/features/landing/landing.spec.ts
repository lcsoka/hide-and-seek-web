import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        importProvidersFrom(
          TranslocoTestingModule.forRoot({
            langs: { en: { landing: { startGame: 'Start a game', joinTitle: 'Join a game' } } },
            translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
            preloadLangs: true,
          }),
        ),
      ],
    });
  });

  it('offers both starting and joining a game up front', () => {
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Jet Lag Hungary');
    expect(text).toContain('Start a game');
    expect(text).toContain('Join a game');
  });
});
