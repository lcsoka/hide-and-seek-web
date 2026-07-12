import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { CityOption, DeckCard } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { PlayerStore } from '../../core/services/player-store';
import { TokenStore } from '../../core/services/token-store';
import { Icon } from '../../shared/icon';

/** Transit-mode id → app-icon name (the canonical ids match the backend enum). */
const MODE_ICON: Record<string, string> = {
  metro: 'train', rail: 'train', light_rail: 'tram', tram: 'tram', bus: 'bus', trolleybus: 'trolleybus',
};

type DeckTab = 'curse' | 'powerup' | 'time_bonus' | 'mine';

/**
 * Full-screen "new game" wizard, launched from the landing. City (image cards) → transit (the
 * city's modes, no toggle) → deck (curate the cards) → start. The play size + metric units are
 * fixed by the city; on create it plays a shuffle flourish, then lands in the lobby (which opens
 * on the chosen city). Exiting asks for confirmation so a half-built game isn't lost by accident.
 */
@Component({
  selector: 'app-new-game-wizard',
  imports: [TranslocoModule, Icon],
  templateUrl: './new-game-wizard.html',
  styles: [
    `
      @keyframes dealIn { 0% { transform: translateY(38px) scale(.7); opacity: 0; } 100% { opacity: 1; } }
      .fc { animation: dealIn .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .5s cubic-bezier(.2,.8,.2,1); }
      .fc:nth-child(1) { transform: rotate(-16deg) translateX(-30px); animation-delay: 0s; }
      .fc:nth-child(2) { transform: rotate(-5deg) translateX(-10px); animation-delay: .08s; }
      .fc:nth-child(3) { transform: rotate(6deg) translateX(12px); animation-delay: .16s; }
      .fc:nth-child(4) { transform: rotate(16deg) translateX(32px); animation-delay: .24s; }
      @keyframes wzin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .wz-step { animation: wzin .25s ease both; }
      @media (prefers-reduced-motion: reduce) { .fc, .wz-step { animation: none; } }
    `,
  ],
})
export class NewGameWizard {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly players = inject(PlayerStore);
  private readonly router = inject(Router);

  readonly open = input(false);
  readonly playerName = input(''); // the guest's name (or the account name) — used on create
  readonly closeChange = output<boolean>();

  readonly step = signal(1);
  readonly cities = signal<CityOption[]>([]);
  readonly deckCards = signal<DeckCard[]>([]);
  readonly cityKey = signal<string | null>(null);
  readonly modeState = signal<Record<string, boolean>>({});
  readonly excluded = signal<Set<string>>(new Set());
  readonly deckTab = signal<DeckTab>('curse');
  readonly reveal = signal(false);
  readonly endgameQuestions = signal(true); // seekers can keep asking in the endgame (default on)
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly shuffling = signal(false);
  readonly exitConfirm = signal(false);

  readonly deckTabs: { key: DeckTab; label: string }[] = [
    { key: 'curse', label: 'wizard.deckCurses' },
    { key: 'powerup', label: 'wizard.deckPowerups' },
    { key: 'time_bonus', label: 'wizard.deckBonuses' },
    { key: 'mine', label: 'wizard.deckMine' },
  ];

  readonly modeIcon = (m: string) => MODE_ICON[m] ?? 'pin';

  /** The chosen transit modes as a localized, comma-joined label (for the summary step). */
  selectedModeLabels(t: (key: string) => string): string {
    return this.selectedModes().map((m) => t('mode.' + m)).join(', ');
  }
  readonly city = computed(() => this.cities().find((c) => c.key === this.cityKey()) ?? null);
  readonly cityModes = computed(() => this.city()?.modes ?? []);
  readonly selectedModes = computed(() => this.cityModes().filter((m) => this.modeState()[m]));
  readonly deckByTab = computed(() => {
    const tab = this.deckTab();
    return this.deckCards().filter((c) => (tab === 'mine' ? c.is_custom : c.type === tab && !c.is_custom));
  });
  readonly hasMine = computed(() => this.deckCards().some((c) => c.is_custom));
  // Physical cards in the deck: the sum of copies of every kept card (so multi-copy powerups /
  // time-bonuses count once per copy, matching the real shuffled deck).
  readonly deckCount = computed(() =>
    this.deckCards().filter((c) => !this.excluded().has(c.id)).reduce((n, c) => n + Math.max(1, c.count), 0),
  );
  readonly canNext = computed(() => !(this.step() === 2 && this.selectedModes().length === 0));

  /** A deterministic hue per city, so the placeholder cover reads as a distinct "photo" until a
   *  real one is uploaded in the admin. */
  hueFor(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }

  /** Placeholder cover gradient for a city without an uploaded photo. */
  coverBg(key: string): string {
    const h = this.hueFor(key);
    return `linear-gradient(160deg, hsl(${h} 40% 28%), hsl(${h} 45% 12%))`;
  }

  /** Emblem icon per deck-card type. */
  deckEmblem(card: DeckCard): string {
    return card.type === 'time_bonus' ? 'hourglass' : card.type === 'powerup' ? 'bolt' : 'curse';
  }

  /** Accent colour per deck-card type (custom curses use the seeker blue). */
  deckAccent(card: DeckCard): string {
    if (card.is_custom) {
      return '#3b82f6';
    }
    return card.type === 'time_bonus' ? 'var(--color-timebonus)' : card.type === 'powerup' ? 'var(--color-powerup)' : 'var(--color-curse)';
  }

  constructor() {
    effect(() => {
      if (this.open()) {
        this.reset();
        void this.load();
      }
    });
  }

  private reset(): void {
    this.step.set(1);
    this.error.set(null);
    this.shuffling.set(false);
    this.busy.set(false);
    this.exitConfirm.set(false);
    this.excluded.set(new Set());
    this.deckTab.set('curse');
    this.reveal.set(false);
    this.endgameQuestions.set(true);
  }

  private async load(): Promise<void> {
    try {
      await this.ensureToken();
      const [cities, deck] = await Promise.all([this.api.cities(), this.api.deck()]);
      this.cities.set(cities);
      this.deckCards.set(deck);
      if (cities.length && !this.cityKey()) {
        this.pickCity(cities[0].key);
      }
    } catch {
      // The wizard stays usable even if the catalogue is briefly unreachable.
    }
  }

  pickCity(key: string): void {
    this.cityKey.set(key);
    const modes = this.cities().find((c) => c.key === key)?.modes ?? [];
    const state: Record<string, boolean> = {};
    modes.forEach((m) => (state[m] = true)); // default all the city's modes on; the host trims
    this.modeState.set(state);
  }

  toggleMode(m: string): void {
    this.modeState.update((s) => ({ ...s, [m]: !s[m] }));
  }

  isExcluded(id: string): boolean {
    return this.excluded().has(id);
  }

  toggleCard(id: string): void {
    this.excluded.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleCategory(): void {
    const cards = this.deckByTab();
    const anyIn = cards.some((c) => !this.excluded().has(c.id));
    this.excluded.update((s) => {
      const next = new Set(s);
      cards.forEach((c) => (anyIn ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  }

  next(): void {
    if (this.step() < 4) {
      this.step.update((s) => s + 1);
    } else {
      void this.create();
    }
  }

  back(): void {
    if (this.step() === 1) {
      this.exitConfirm.set(true);
    } else {
      this.step.update((s) => s - 1);
    }
  }

  requestClose(): void {
    this.exitConfirm.set(true);
  }

  confirmExit(): void {
    this.exitConfirm.set(false);
    this.closeChange.emit(false);
  }

  private async ensureToken(): Promise<void> {
    if (!this.tokens.token()) {
      const auth = await this.api.guest(this.playerName() || undefined);
      this.tokens.set(auth.token);
    }
  }

  async create(): Promise<void> {
    const cityKey = this.cityKey();
    if (!cityKey || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.shuffling.set(true);

    // Only send a deck list when the host actually trimmed it (empty = full deck server-side).
    const enabled = this.excluded().size
      ? this.deckCards().filter((c) => !this.excluded().has(c.id)).map((c) => c.id)
      : undefined;
    const config: Record<string, unknown> = {
      transit_modes: this.selectedModes(),
      reveal_seekers_to_hider: this.reveal(),
      endgame_questions: this.endgameQuestions(),
    };
    if (enabled) {
      config['deck_cards'] = enabled;
    }

    try {
      await this.ensureToken();
      const session = await this.submitCreate(cityKey, config);
      if (session.host_player_id) {
        this.players.set(session.id, session.host_player_id);
      }
      // Let the shuffle flourish breathe, then drop into the lobby (which opens on the city).
      setTimeout(() => void this.router.navigate(['/s', session.id]), 900);
    } catch (e: unknown) {
      this.shuffling.set(false);
      this.busy.set(false);
      const err = e as { error?: { message?: string } };
      this.error.set(err?.error?.message ?? 'Nem sikerült létrehozni a játékot.');
    }
  }

  /** Create, retrying once on a stale (401) token — a stored token can outlive its backend. */
  private async submitCreate(cityKey: string, config: Record<string, unknown>) {
    const body = { city: cityKey, display_name: this.playerName().trim() || undefined, config };
    try {
      return await this.api.createSession(body);
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 401) {
        this.tokens.clear();
        await this.ensureToken();
        return this.api.createSession(body);
      }
      throw e;
    }
  }
}
