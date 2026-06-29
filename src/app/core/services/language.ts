import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

const KEY = 'jl_lang';
const SUPPORTED = ['hu', 'en'];

/** App language: Hungarian-first, English fallback. Persists the user's choice. */
@Injectable({ providedIn: 'root' })
export class Language {
  private readonly transloco = inject(TranslocoService);
  readonly lang = signal(this.transloco.getActiveLang());
  // Bumps whenever a translation file finishes loading. Imperative translators (e.g. the
  // deduction annotations built outside a template) depend on this so they re-run once the
  // active language's strings are actually available — translate() returns the key until then.
  readonly loaded = signal(0);

  constructor() {
    this.transloco.events$.subscribe((e) => {
      if (e.type === 'translationLoadSuccess') {
        this.loaded.update((v) => v + 1);
      }
    });
  }

  /** Restore the saved language (call once at startup). */
  init(): void {
    const saved = localStorage.getItem(KEY);
    if (saved && SUPPORTED.includes(saved)) {
      this.set(saved);
    }
  }

  set(lang: string): void {
    this.transloco.setActiveLang(lang);
    this.lang.set(lang);
    localStorage.setItem(KEY, lang);
    document.documentElement.lang = lang;
  }

  toggle(): void {
    this.set(this.lang() === 'hu' ? 'en' : 'hu');
  }
}
