import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

const KEY = 'jl_lang';
const SUPPORTED = ['hu', 'en'];

/** App language: Hungarian-first, English fallback. Persists the user's choice. */
@Injectable({ providedIn: 'root' })
export class Language {
  private readonly transloco = inject(TranslocoService);
  readonly lang = signal(this.transloco.getActiveLang());

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
