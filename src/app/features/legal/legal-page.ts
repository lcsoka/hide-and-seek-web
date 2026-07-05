import { Component, computed, effect, inject, signal, ViewEncapsulation } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { map } from 'rxjs';

/** Route slug → markdown file + title key. Add new documents here. */
const DOCS: Record<string, { file: string; titleKey: string }> = {
  privacy: { file: 'privacy-policy', titleKey: 'legal.privacyTitle' },
  cookies: { file: 'cookie-policy', titleKey: 'legal.cookiesTitle' },
};

/** Renders a legal document from public/legal/*.md as sanitized HTML (marked, lazy-loaded). */
@Component({
  selector: 'app-legal',
  imports: [RouterLink, TranslocoModule],
  templateUrl: './legal-page.html',
  styleUrl: './legal-page.css',
  encapsulation: ViewEncapsulation.None,
})
export class LegalPage {
  private readonly route = inject(ActivatedRoute);

  readonly html = signal<string | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  private readonly slug = toSignal(this.route.paramMap.pipe(map((p) => p.get('doc') ?? '')), { initialValue: '' });
  readonly titleKey = computed(() => DOCS[this.slug()]?.titleKey ?? 'legal.title');

  constructor() {
    effect(() => void this.load(this.slug()));
  }

  private async load(slug: string): Promise<void> {
    const doc = DOCS[slug];
    this.loading.set(true);
    this.notFound.set(false);
    this.html.set(null);

    if (!doc) {
      this.notFound.set(true);
      this.loading.set(false);

      return;
    }

    try {
      const res = await fetch(`/legal/${doc.file}.md`);
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const markdown = await res.text();
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
}
