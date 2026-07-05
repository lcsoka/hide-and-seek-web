import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

/** Small site footer with legal links. Reused on the landing + profile screens. */
@Component({
  selector: 'app-footer',
  imports: [RouterLink, TranslocoModule],
  template: `
    <footer *transloco="let t" class="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center gap-2 px-5 pb-6 pt-2 text-center text-xs text-gray-500 dark:text-gray-400">
      <nav class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <a routerLink="/legal/privacy" class="transition hover:text-gray-800 dark:hover:text-gray-200">{{ t('legal.privacyTitle') }}</a>
        <a routerLink="/legal/cookies" class="transition hover:text-gray-800 dark:hover:text-gray-200">{{ t('legal.cookiesTitle') }}</a>
      </nav>
      <p class="opacity-80">© 2026 Hide &amp; Seek</p>
    </footer>
  `,
})
export class AppFooter {}
