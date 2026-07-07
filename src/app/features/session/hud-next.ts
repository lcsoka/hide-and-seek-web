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
      /* Tactile "game key": a raised button with a coloured base lip that depresses on press. */
      .seg {
        flex: 1 1 0; min-width: 0; position: relative;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
        padding: 9px 2px 8px; border: none; border-radius: 16px;
        font-size: 10px; font-weight: 600; letter-spacing: .01em; line-height: 1.1;
        color: #475569;
        background: linear-gradient(180deg, #ffffff 0%, #eceff5 100%);
        box-shadow: 0 2px 0 0 #ccd3e1, 0 4px 8px -3px rgba(15,23,42,.22), inset 0 1px 0 rgba(255,255,255,.85);
        transition: transform .12s cubic-bezier(.2,.8,.3,1), box-shadow .12s;
        -webkit-tap-highlight-color: transparent;
      }
      .seg > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .seg > app-icon { filter: drop-shadow(0 1px 0 rgba(255,255,255,.6)); }
      .seg:active { transform: translateY(2px); box-shadow: 0 0 0 0 #ccd3e1, inset 0 2px 4px rgba(15,23,42,.14); }

      /* Primary brand key. */
      .seg.on {
        color: #fff;
        background: linear-gradient(180deg, var(--color-brand) 0%, var(--color-brand-strong) 100%);
        box-shadow: 0 3px 0 0 var(--color-brand-deep), 0 7px 15px -4px color-mix(in srgb, var(--color-brand) 60%, transparent), inset 0 1px 0 rgba(255,255,255,.35);
      }
      .seg.on > app-icon { filter: drop-shadow(0 1px 1px rgba(0,0,0,.22)); }
      .seg.on:active { transform: translateY(3px); box-shadow: 0 0 0 0 var(--color-brand-deep), inset 0 2px 5px rgba(0,0,0,.28); }

      /* Riding key (seeker on transit). */
      .seg.riding {
        color: #fff;
        background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
        box-shadow: 0 3px 0 0 #3730a3, 0 7px 15px -4px rgba(99,102,241,.6), inset 0 1px 0 rgba(255,255,255,.3);
      }
      .seg.riding:active { transform: translateY(3px); box-shadow: 0 0 0 0 #3730a3, inset 0 2px 5px rgba(0,0,0,.28); }

      @media (prefers-color-scheme: dark) {
        .seg {
          color: #cbd5e1;
          background: linear-gradient(180deg, #3a465c 0%, #2b3547 100%);
          box-shadow: 0 2px 0 0 #171f2e, 0 4px 8px -3px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08);
        }
        .seg > app-icon { filter: none; }
        .seg:active { box-shadow: 0 0 0 0 #171f2e, inset 0 2px 4px rgba(0,0,0,.4); }
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
