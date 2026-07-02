import { Component, input } from '@angular/core';
import { ActiveCurse } from '../../core/models';

/** Full-screen flash shown to a seeker the moment a new curse lands on them. */
@Component({
  selector: 'app-curse-alert',
  template: `
    <div class="pointer-events-none fixed inset-0 z-[900] flex items-center justify-center bg-black/30">
      <div class="curse-pop max-w-sm rounded-3xl bg-purple-900/95 px-8 py-6 text-center text-white shadow-2xl ring-2 ring-purple-400">
        <div class="curse-shake text-5xl">💥🧙‍♂️</div>
        <div class="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-purple-300">You've been cursed</div>
        <div class="mt-1 text-2xl font-extrabold">{{ curse().name }}</div>
        @if (curse().description) { <div class="mx-auto mt-2 text-sm text-purple-100">{{ curse().description }}</div> }
      </div>
    </div>
  `,
  styles: [
    `
      @keyframes cursePop {
        0% { transform: scale(0.6); opacity: 0; }
        60% { transform: scale(1.05); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes curseShake {
        0%, 100% { transform: rotate(0); }
        25% { transform: rotate(-12deg); }
        75% { transform: rotate(12deg); }
      }
      .curse-pop { animation: cursePop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.3) both; }
      .curse-shake { animation: curseShake 0.5s ease-in-out 2; }
    `,
  ],
})
export class CurseAlert {
  readonly curse = input.required<ActiveCurse>();
}
