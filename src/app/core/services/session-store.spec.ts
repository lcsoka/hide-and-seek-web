import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: { translate: (k: string) => k } },
      ],
    });
  });

  it('records events newest-first and caps the feed', () => {
    const store = TestBed.inject(SessionStore);

    store.onEvent('HidingStarted');
    store.onEvent('SeekingStarted');

    expect(store.feed().length).toBe(2);
    expect(store.feed()[0].type).toBe('SeekingStarted');

    for (let i = 0; i < 40; i++) {
      store.onEvent('Tick');
    }
    expect(store.feed().length).toBe(30);
  });
});
