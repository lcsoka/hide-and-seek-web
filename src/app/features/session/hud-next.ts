import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { GameState } from '../../core/models';
import { GameTimer } from '../../core/services/game-timer.model';
import { Icon } from '../../shared/icon';
import { HowToPlay } from './how-to-play';

type Drawer = 'hide' | 'questions' | 'hand' | 'seeker';

/** Category → bespoke icon name (mirrors the question-picker's category set). */
const CAT_ICON: Record<string, string> = {
  radar: 'radar',
  matching: 'pin',
  measuring: 'ruler',
  tentacles: 'tentacles',
  thermometer: 'thermo',
  photo: 'camera',
};

/**
 * The NEW in-game HUD chrome (behind the HudPreference toggle): a compact top bar + a bottom
 * command dock. It only owns the chrome — every action opens the SAME shared drawers/sheets as
 * the classic HUD (question picker, transit picker, card deck, seeker panel), so the two HUDs
 * stay behaviourally identical and the classic one is never at risk.
 */
@Component({
  selector: 'app-hud-next',
  imports: [RouterLink, TranslocoModule, Icon, HowToPlay],
  templateUrl: './hud-next.html',
  styles: [
    `
      /* Flat, cartoon-style key: solid fill, bold rounded shape, no depth/gradient/glow. */
      .seg {
        flex: 1 1 0; min-width: 0; position: relative;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
        padding: 9px 2px 8px; border: none; border-radius: 16px;
        font-size: 10px; font-weight: 600; letter-spacing: .01em; line-height: 1.1;
        color: #475569; background: #e9edf4;
        transition: transform .1s ease, background-color .12s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .seg > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .seg:active { transform: scale(0.94); background: #dde3ee; }

      .seg.on { color: #fff; background: var(--color-brand); }
      .seg.on:active { background: var(--color-brand-strong); }

      .seg.riding { color: #fff; background: #6366f1; }
      .seg.riding:active { background: #4f46e5; }

      @media (prefers-color-scheme: dark) {
        .seg { color: #cbd5e1; background: #334155; }
        .seg:active { background: #3d4b60; }
      }

      @keyframes hudbreathe { 0%, 100% { box-shadow: 0 6px 16px rgba(2,6,23,.14); } 50% { box-shadow: 0 6px 16px rgba(2,6,23,.14), 0 0 0 4px rgba(56,189,248,.28); } }
      .breathe { animation: hudbreathe 2.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .breathe { animation: none; } }
    `,
  ],
})
export class HudNext {
  readonly state = input.required<GameState>();
  readonly timer = input<GameTimer | null>(null);
  readonly survival = input<string | null>(null); // hider's live survival time during seeking
  readonly role = input<string | null>(null);
  readonly canEndGame = input(false);
  readonly calculating = input(false);
  readonly active = input(false); // live play (hiding/seeking/endgame) — the bottom dock only shows then

  readonly openAsk = output<void>();
  readonly openBoard = output<void>();
  readonly recenter = output<void>();
  readonly endGame = output<void>();
  readonly openDrawer = output<Drawer>();

  readonly helpOpen = signal(false);
  readonly codeOpen = signal(false);
  readonly copied = signal(false);

  readonly isHider = computed(() => this.role() === 'hider');
  readonly isSeeker = computed(() => this.role() === 'seeker');
  readonly hiding = computed(() => this.state().state === 'hiding');
  readonly pending = computed(() => this.state().pending_question);
  readonly onTransit = computed(() => this.state().transit?.on_transit ?? false);
  readonly transitLine = computed(() => this.state().transit?.line ?? null);
  readonly questionsAsked = computed(() => (this.state().questions ?? []).length);
  readonly activeCurses = computed(() => this.state().curses.filter((c) => c.status === 'active').length);

  catIcon(category: string | null | undefined): string {
    return (category && CAT_ICON[category]) || 'ask';
  }

  async copyCode(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.state().join_code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }
}
