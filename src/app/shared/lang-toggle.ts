import { Component, inject } from '@angular/core';
import { Language } from '../core/services/language';

/** A small HU/EN switch. Drop it anywhere; it flips + persists the app language. */
@Component({
  selector: 'app-lang-toggle',
  template: `
    <button type="button" (click)="lang.toggle()" [attr.aria-label]="'Switch language'"
            class="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
      {{ lang.lang() === 'hu' ? 'EN' : 'HU' }}
    </button>
  `,
})
export class LangToggle {
  readonly lang = inject(Language);
}
