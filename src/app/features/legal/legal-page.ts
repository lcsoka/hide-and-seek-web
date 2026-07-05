import { Component, computed, effect, inject, signal, ViewEncapsulation } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { LangToggle } from '../../shared/lang-toggle';

/** Route slug → markdown file + title key. Add new documents here. */
const DOCS: Record<string, { file: string; titleKey: string }> = {
  privacy: { file: 'privacy-policy', titleKey: 'legal.privacyTitle' },
  cookies: { file: 'cookie-policy', titleKey: 'legal.cookiesTitle' },
};

/** Renders a legal document from public/legal/*.md as sanitized HTML (marked, lazy-loaded). */
@Component({
  selector: 'app-legal',
  imports: [RouterLink, TranslocoModule, LangToggle],
  templateUrl: './legal-page.html',
  styleUrl: './legal-page.css',
  encapsulation: ViewEncapsulation.None,
})
export class LegalPage {
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  readonly html = signal<string | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  private readonly slug = toSignal(this.route.paramMap.pipe(map((p) => p.get('doc') ?? '')), { initialValue: '' });
  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  readonly titleKey = computed(() => DOCS[this.slug()]?.titleKey ?? 'legal.title');

  constructor() {
    // Re-fetch whenever the document OR the active language changes (Hungarian-first, English fallback).
    effect(() => void this.load(this.slug(), this.lang()));
  }

  private async load(slug: string, lang: string): Promise<void> {
    const doc = DOCS[slug];
    this.loading.set(true);
    this.notFound.set(false);
    this.html.set(null);

    if (!doc) {
      this.notFound.set(true);
      this.loading.set(false);

      return;
    }

    // Prefer the active language; fall back to the default (hu) then en if a translation is missing.
    const langs = [...new Set([lang, 'hu', 'en'])];
    try {
      const markdown = await this.fetchFirst(doc.file, langs);
      const { marked } = await import('marked');
      // Binding the string to [innerHTML] lets Angular's built-in sanitizer scrub it; the source
      // is our own trusted static asset, so this is defence-in-depth rather than a hard boundary.
      this.html.set(await marked.parse(markdown, { async: true }));
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Fetch `${file}.${lang}.md` for the first language that resolves; throws if none do. */
  private async fetchFirst(file: string, langs: string[]): Promise<string> {
    for (const lang of langs) {
      const res = await fetch(`/legal/${file}.${lang}.md`);
      if (res.ok) {
        return res.text();
      }
    }
    throw new Error('no translation available');
  }
}
