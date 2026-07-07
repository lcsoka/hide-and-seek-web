import { Component, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { AppUpdate } from '../core/services/app-update';
import { Icon } from './icon';

/** Non-disruptive "a new version is available — Refresh" prompt (never auto-reloads mid-game). */
@Component({
  selector: 'app-update-toast',
  imports: [TranslocoModule, Icon],
  template: `
    @if (update.ready()) {
      <div *transloco="let t" class="jl-pop pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[950] flex justify-center px-4">
        <div class="pointer-events-auto flex items-center gap-3 rounded-full bg-gray-900 py-2 pl-4 pr-2 text-sm text-white shadow-2xl ring-1 ring-white/10 dark:bg-gray-800">
          <span>{{ t('update.available') }}</span>
          <button (click)="update.apply()" class="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold transition hover:bg-rose-500">{{ t('update.refresh') }}</button>
          <button (click)="update.dismiss()" [attr.aria-label]="t('common.cancel')" class="grid h-6 w-6 place-items-center rounded-full text-base opacity-70 transition hover:bg-white/10 hover:opacity-100"><app-icon name="x" [size]="18" /></button>
        </div>
      </div>
    }
  `,
})
export class UpdateToast {
  readonly update = inject(AppUpdate);
}
