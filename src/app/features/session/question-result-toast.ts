import { Component, computed, inject, input } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { SessionStore } from '../../core/services/session-store';
import { CategoryService } from '../../core/services/category.service';
import { Icon } from '../../shared/icon';

/**
 * A live, top-of-screen flash for the seekers when one of their questions resolves — answered,
 * vetoed or voided. The asker previously got no feedback at all; this pops in with the result
 * (answer + category icon, colour-coded), then auto-dismisses. Seekers only.
 */
@Component({
  selector: 'app-question-result-toast',
  imports: [TranslocoModule, Icon],
  template: `
    @if (show() && store.questionResult(); as r) {
      <div class="pointer-events-none absolute inset-x-0 top-20 z-[760] flex justify-center px-4 sm:top-24" *transloco="let t">
        <div class="qr-pop pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-white shadow-xl"
             [style.background]="bg()">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20">
            <app-icon [name]="icon()" [size]="18" />
          </span>
          <div class="min-w-0">
            @if (r.kind === 'answered') {
              <div class="text-[10px] font-semibold uppercase tracking-wider opacity-80">{{ t('seeker.answerArrived') }}</div>
              <div class="text-sm font-bold leading-tight">{{ t('answer.' + (r.answer || 'none')) }}</div>
            } @else {
              <div class="text-sm font-bold leading-tight">{{ t(r.kind === 'vetoed' ? 'seeker.vetoedNotice' : 'seeker.voidedNotice') }}</div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes qrPop {
        0% { transform: translateY(-14px) scale(0.9); opacity: 0; }
        60% { transform: translateY(0) scale(1.03); opacity: 1; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }
      .qr-pop { animation: qrPop 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
      @media (prefers-reduced-motion: reduce) { .qr-pop { animation: none; } }
    `,
  ],
})
export class QuestionResultToast {
  readonly store = inject(SessionStore);
  private readonly category = inject(CategoryService);

  /** Only the seekers see it (the hider just gave the answer / the veto is their own move). */
  readonly show = input(false);

  private readonly result = computed(() => this.store.questionResult());

  icon = computed(() => {
    const r = this.result();
    if (!r) {
      return 'help';
    }
    if (r.kind === 'vetoed') {
      return 'ban';
    }
    if (r.kind === 'voided') {
      return 'x';
    }
    return r.category ? this.category.categoryIconName(r.category) : 'check';
  });

  bg = computed(() => {
    const r = this.result();
    if (!r || r.kind !== 'answered') {
      return '#64748b'; // slate for veto/void
    }
    const positive = this.category.answerPositive(r.answer ?? undefined);
    return positive === true ? '#16a34a' : positive === false ? '#dc2626' : '#0ea5e9';
  });
}
