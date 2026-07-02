import { Component, inject, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { CategoryService } from '../../core/services/category.service';

/** A "How to play" reference sheet: the goal, each role, and the question types. */
@Component({
  selector: 'app-how-to-play',
  imports: [TranslocoModule],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[850] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" (click)="closeChange.emit(false)" *transloco="let t">
        <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-gray-900 sm:rounded-3xl" (click)="$event.stopPropagation()">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-lg font-bold">{{ t('howto.title') }}</h2>
            <button (click)="closeChange.emit(false)" class="text-xl text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div class="space-y-4 text-sm">
            <section>
              <h3 class="font-semibold">{{ t('howto.goalTitle') }}</h3>
              <p class="text-gray-600 dark:text-gray-300">{{ t('howto.goal') }}</p>
            </section>
            <section>
              <h3 class="font-semibold">{{ t('howto.hiderTitle') }}</h3>
              <p class="text-gray-600 dark:text-gray-300">{{ t('howto.hider') }}</p>
            </section>
            <section>
              <h3 class="font-semibold">{{ t('howto.seekerTitle') }}</h3>
              <p class="text-gray-600 dark:text-gray-300">{{ t('howto.seeker') }}</p>
            </section>
            <section>
              <h3 class="mb-1 font-semibold">{{ t('howto.questionsTitle') }}</h3>
              <ul class="space-y-1.5">
                @for (c of cats; track c) {
                  <li class="flex items-start gap-2">
                    <span class="text-lg leading-none">{{ meta(c).icon }}</span>
                    <span><span class="font-medium">{{ t('category.' + c) }}</span> — <span class="text-gray-600 dark:text-gray-300">{{ t('categoryHint.' + c) }}</span></span>
                  </li>
                }
              </ul>
            </section>
          </div>
        </div>
      </div>
    }
  `,
})
export class HowToPlay {
  private readonly category = inject(CategoryService);
  readonly open = input(false);
  readonly closeChange = output<boolean>();
  readonly cats = ['radar', 'thermometer', 'matching', 'measuring', 'tentacles', 'photo'];
  readonly meta = (c: string) => this.category.categoryMeta(c);
}
