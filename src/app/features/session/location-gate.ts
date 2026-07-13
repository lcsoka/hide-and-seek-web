import { Component, computed, inject, input } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GeolocationPermission } from '../../core/services/geolocation-permission';
import { Icon } from '../../shared/icon';

/**
 * Blocking full-screen gate shown once the game is live: everyone must share their location to
 * play (both roles are tracked). It sits above the session shell and can't be dismissed by the
 * player — it clears itself the instant the permission flips to 'granted' (via the permission
 * signal, which also picks up a grant made from browser/OS settings). On a hard denial it explains
 * how to re-enable it. Not shown in the lobby, and not shown when the browser has no geolocation.
 */
@Component({
  selector: 'app-location-gate',
  imports: [TranslocoModule, Icon],
  template: `
    @if (visible()) {
      <div *transloco="let t" class="jl-fade fixed inset-0 z-[950] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
        <div class="jl-pop w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl ring-2 ring-brand/40 dark:bg-gray-900">
          <div class="pin-bob mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <app-icon name="pin" [size]="34" />
          </div>
          <div class="text-xs font-bold uppercase tracking-[0.25em] text-brand">{{ t('geo.eyebrow') }}</div>
          <div class="font-display text-2xl font-extrabold">{{ t('geo.title') }}</div>

          @if (perm.state() === 'denied') {
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('geo.deniedBody') }}</p>
            <div class="rounded-xl bg-gray-100 p-3 text-left text-xs leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
              {{ t('geo.deniedHint') }}
            </div>
            <div class="flex items-center justify-center gap-2 pt-1 text-xs font-semibold text-gray-400">
              <span class="wait-dot h-1.5 w-1.5 rounded-full bg-brand"></span>{{ t('geo.waiting') }}
            </div>
          } @else {
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('geo.body') }}</p>
            <button (click)="perm.request()"
                    class="w-full rounded-xl bg-brand p-3 text-sm font-bold text-white shadow-lg shadow-brand/30 transition hover:brightness-110 active:scale-95">
              {{ t('geo.enable') }}
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes pinBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      .pin-bob { animation: pinBob 1.6s ease-in-out infinite; }
      @keyframes waitPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      .wait-dot { animation: waitPulse 1.1s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .pin-bob, .wait-dot { animation: none; } }
    `,
  ],
})
export class LocationGate {
  readonly perm = inject(GeolocationPermission);

  /** True while the game is live (past the lobby) — the gate only enforces during play. */
  readonly show = input(false);

  /** Only block on a CONFIRMED denial. The transient 'prompt' default (which iOS never clears,
   *  since it can't query geolocation permission) would otherwise flash the gate on every
   *  foreground; the native browser prompt does the initial asking, and a real fix marks 'granted'. */
  readonly visible = computed(() => this.show() && this.perm.state() === 'denied');
}
