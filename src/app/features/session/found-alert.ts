import { Component, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { FoundClaim } from '../../core/models';

/** Full-screen alert shown to the hider the moment a seeker claims the catch — with the confirm /
 *  dispute actions right here, so they don't have to dig through a drawer to respond. */
@Component({
  selector: 'app-found-alert',
  imports: [TranslocoModule],
  template: `
    <div *transloco="let t" class="jl-fade fixed inset-0 z-[900] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div class="jl-pop w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl ring-2 ring-rose-400 dark:bg-gray-900">
        <div class="found-ping text-5xl">🎯</div>
        <div class="text-xs font-bold uppercase tracking-[0.25em] text-rose-500">{{ t('found.eyebrow') }}</div>
        <div class="font-display text-2xl font-extrabold">{{ t('found.title') }}</div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ claim().by_name ? t('found.bodyNamed', { name: claim().by_name }) : t('found.body') }}
        </p>
        <div class="flex gap-2 pt-1">
          <button (click)="dispute.emit()" [disabled]="busy()"
                  class="flex-1 rounded-xl border border-gray-300 p-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5">
            {{ t('found.dispute') }}
          </button>
          <button (click)="confirm.emit()" [disabled]="busy()"
                  class="flex-1 rounded-xl bg-rose-600 p-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50">
            {{ t('found.confirm') }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      @keyframes foundPing {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.18); }
      }
      .found-ping { animation: foundPing 0.9s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .found-ping { animation: none; } }
    `,
  ],
})
export class FoundAlert {
  readonly claim = input.required<FoundClaim>();
  readonly busy = input(false);
  readonly confirm = output<void>();
  readonly dispute = output<void>();
}
