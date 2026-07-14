import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { combineLatest, merge } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

/** Per-route SEO copy, keyed by the first path segment. Values are Transloco keys. */
const ROUTE_SEO: Record<string, { title: string; desc: string }> = {
  '': { title: 'seo.home.title', desc: 'seo.home.desc' },
  map: { title: 'seo.map.title', desc: 'seo.map.desc' },
  legal: { title: 'seo.legal.title', desc: 'seo.home.desc' },
  auth: { title: 'seo.auth.title', desc: 'seo.home.desc' },
  profile: { title: 'seo.profile.title', desc: 'seo.home.desc' },
  content: { title: 'seo.content.title', desc: 'seo.home.desc' },
  s: { title: 'seo.game.title', desc: 'seo.home.desc' },
  replay: { title: 'seo.replay.title', desc: 'seo.home.desc' },
  guide: { title: 'seo.guide.title', desc: 'seo.guide.desc' },
};

/**
 * Keeps the document <title> + description/OG/Twitter tags in sync with the current route AND the
 * active language. Static crawlers still get the rich defaults baked into index.html; this refines
 * them for Google's JS rendering and in-app tab titles.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly transloco = inject(TranslocoService);

  /** Call once at startup (from App). */
  init(): void {
    const url$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    );
    // Re-apply on navigation, language switch, and once a translation file finishes loading
    // (translate() returns the raw key until then).
    const i18n$ = merge(
      this.transloco.langChanges$,
      this.transloco.events$.pipe(filter((e) => e.type === 'translationLoadSuccess')),
    ).pipe(startWith(null));

    combineLatest([url$, i18n$]).subscribe(([url]) => this.apply(url));
  }

  private apply(url: string): void {
    const segment = url.split('?')[0].split('/').filter(Boolean)[0] ?? '';
    const entry = ROUTE_SEO[segment] ?? ROUTE_SEO[''];
    const title = this.transloco.translate(entry.title);
    const description = this.transloco.translate(entry.desc);

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
  }
}
