import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FEATURE_TAGS } from '../../core/deduction/osm-deduction.service';
import { OverpassService } from '../../core/maps/overpass';
import { distanceMeters } from '../../core/geo/geo';
import { ActiveCurse, GameState, HandCard, PendingQuestion, PlayerView, ResolvedQuestion } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { Clock, formatCountdown } from '../../core/services/clock';
import { SessionStore } from '../../core/services/session-store';
import { CategoryService } from '../../core/services/category.service';
import { UnitsService } from '../../core/services/units.service';
import { TranslocoModule } from '@jsverse/transloco';
import { ImageUpload } from './image-upload';
import { PlayerAvatar } from '../../shared/player-avatar';
import { Icon } from '../../shared/icon';
import { MediaViewerService } from '../../shared/media-viewer';

interface TentaclePlace {
  name: string;
  lat: number;
  lng: number;
  distanceM?: number; // distance from the hider (for sorting + display)
}

/** The hider's hand: see the full pending question, confirm the answer, play cards. */
@Component({
  selector: 'app-card-deck',
  imports: [ImageUpload, TranslocoModule, PlayerAvatar, Icon],
  templateUrl: './card-deck.html',
  styles: [
    `
      /* New card springs up into the hand with a little overshoot + settle. */
      @keyframes cardDraw {
        0% { transform: translateY(64px) scale(0.72) rotate(-7deg); opacity: 0; }
        55% { transform: translateY(-6px) scale(1.05) rotate(1deg); opacity: 1; }
        100% { transform: none; opacity: 1; }
      }
      .card-draw {
        animation: cardDraw 0.55s cubic-bezier(0.2, 0.85, 0.25, 1) both;
        transform-origin: bottom center;
        will-change: transform, opacity;
      }
      @media (prefers-reduced-motion: reduce) {
        .card-draw { animation: none; }
      }
    `,
  ],
})
export class CardDeck {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  private readonly clock = inject(Clock);
  private readonly overpass = inject(OverpassService);
  private readonly category = inject(CategoryService);
  private readonly unitsService = inject(UnitsService);
  readonly media = inject(MediaViewerService);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  // Which slice to render: 'all' (desktop/one panel), 'question' (the incoming-question view)
  // or 'hand' (cards + history). Cross-cutting prompts (catch claim, curse-choice/confirm) show
  // in every slice so they're never missed.
  readonly section = input<'all' | 'question' | 'hand'>('all');

  show(part: 'question' | 'hand'): boolean {
    return this.section() === 'all' || this.section() === part;
  }

  readonly busy = signal(false);
  readonly animatingFrom = signal(Number.MAX_SAFE_INTEGER);
  private prevLen = 0;

  readonly meta = (c: string) => this.category.categoryMeta(c);
  readonly catIcon = (c: string | null | undefined) => this.category.categoryIconName(c ?? '');
  readonly catColor = (c: string | null | undefined) => this.category.categoryColor(c ?? '');
  readonly qIcon = (subject: string | null | undefined, c: string | null | undefined) =>
    this.category.questionIconName(subject ?? '', c ?? '');
  readonly confirmCard = signal<HandCard | null>(null);
  // The 'duplicate' powerup being played — while set, the hider picks which OTHER card to copy.
  readonly duplicateChoosing = signal<HandCard | null>(null);
  readonly duplicateTargets = computed(() => {
    const dup = this.duplicateChoosing();
    return dup ? this.hand().filter((c) => c.uid !== dup.uid) : [];
  });
  // The word the hider types when casting the Hidden Hangman (min 4 letters).
  readonly castWord = signal('');

  // A 'choose' curse (The Drained Brain) awaiting the hider's category picks.
  readonly curseChoice = computed(() => this.state().curse_choice);
  readonly allCategories = ['matching', 'measuring', 'radar', 'thermometer', 'photo', 'tentacles'];
  readonly chosenCategories = signal<string[]>([]);

  readonly hand = computed(() => this.state().hand ?? []);
  readonly handLimit = computed(() => this.state().hand_limit ?? 6);
  readonly handFull = computed(() => this.hand().length >= this.handLimit());
  readonly history = computed(() => [...(this.state().questions ?? [])].reverse());
  readonly pending = computed(() => this.state().pending_question);
  readonly isPhoto = computed(() => this.pending()?.category === 'photo');
  readonly canAnswer = computed(() => this.state().available_actions.includes('answer_question'));
  readonly preview = computed(() => this.pending()?.preview_answer ?? null);

  // Tentacles answered by hand: the hider must name the actual place they're nearest to
  // (not just "in range"), so the seekers get the real Voronoi cell. We fetch the candidate
  // places within the question's radius of the seeker; null = loading, [] = none/unavailable.
  readonly isTentacleManual = computed(
    () => this.pending()?.category === 'tentacles' && this.canAnswer() && !this.preview(),
  );
  readonly tentaclePlaces = signal<TentaclePlace[] | null>(null);
  readonly timeBonusMin = computed(() => Math.round((this.state().time_bonus_s ?? 0) / 60));
  readonly isMeasuring = computed(() => this.pending()?.category === 'measuring');
  // The hider's own position, for the measuring distance readouts on the answer card.
  private readonly hiderPos = computed(() => {
    const h = this.state().players.find((p) => p.role === 'hider');
    return h?.lat != null && h?.lng != null ? { lat: h.lat, lng: h.lng } : null;
  });
  readonly playedCurses = computed(() => this.state().curses.filter((c) => c.status === 'active'));
  readonly vetoCard = computed(() => this.hand().find((c) => c.type === 'powerup' && c.power === 'veto') ?? null);
  // The hider's score is the time they survive — show it live (rough; the authoritative
  // figure is computed server-side at round end).
  readonly survivalText = computed(() => {
    const start = this.state().timers?.seeking_started_at;
    return start == null ? null : formatCountdown(Math.max(0, Math.floor(this.clock.nowMs() / 1000) - start));
  });
  // A seeker claims they found the hider — the round ends only once the hider confirms it.
  readonly foundClaim = computed(() => this.state().found_claim);

  private readonly units = computed(() => this.unitsService.unitsOf(this.state().config));

  /** A short human summary of the question's parameters (radius / feature). */
  readonly questionParams = computed(() => {
    const p = this.pending()?.params;
    if (!p) {
      return null;
    }
    const parts: string[] = [];
    if (p.radius_m) {
      parts.push(`within ${this.unitsService.formatDistance(p.radius_m, this.units())}`);
    }
    if (p.feature) {
      parts.push(`nearest ${p.feature.replace(/_/g, ' ')}`);
    }

    return parts.join(' · ') || null;
  });

  readonly previewColor = computed(() => {
    const positive = this.category.answerPositive(this.preview()?.answer);
    if (positive === true) {
      return 'text-green-600 dark:text-green-400';
    }
    if (positive === false) {
      return 'text-red-600 dark:text-red-400';
    }

    return 'text-gray-800 dark:text-gray-100';
  });

  constructor() {
    // When the hand grows, animate the newly added cards in.
    effect(() => {
      const len = this.hand().length;
      if (len > this.prevLen) {
        const from = this.prevLen;
        this.animatingFrom.set(from);
        setTimeout(() => {
          if (this.animatingFrom() === from) {
            this.animatingFrom.set(Number.MAX_SAFE_INTEGER);
          }
        }, 700);
      }
      this.prevLen = len;
    });

    // Load the tentacle candidate places (within the seeker's radius) when the hider has a
    // tentacles question to answer by hand. Keyed by question seq so it loads once per ask.
    let loadedSeq: number | null = null;
    effect(() => {
      const q = this.pending();
      if (!this.isTentacleManual() || !q) {
        loadedSeq = null;
        this.tentaclePlaces.set(null);

        return;
      }
      if (q.seq === loadedSeq) {
        return;
      }
      loadedSeq = q.seq ?? null;
      this.tentaclePlaces.set(null);
      void this.loadTentaclePlaces(q);
    });
  }

  private async loadTentaclePlaces(q: PendingQuestion): Promise<void> {
    const tag = q.params?.feature ? FEATURE_TAGS[q.params.feature] : undefined;
    const lat = q.ask?.lat;
    const lng = q.ask?.lng;
    if (!tag || lat == null || lng == null) {
      this.tentaclePlaces.set([]);

      return;
    }
    try {
      const fc = await this.overpass.pois(lat, lng, (q.params?.radius_m ?? 1609) / 1000, tag);
      const me = this.state().players.find((p) => p.role === 'hider');
      const here = me?.lat != null && me?.lng != null ? { lat: me.lat, lng: me.lng } : null;
      const places = fc.features
        .map((f) => {
          const place: TentaclePlace = { name: (f.properties?.['name'] as string) ?? 'Unnamed', lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
          if (here) {
            place.distanceM = distanceMeters(here, { lat: place.lat, lng: place.lng });
          }

          return place;
        })
        // Nearest to the hider first (that's the one they'll pick); names break ties.
        .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.name.localeCompare(b.name));
      this.tentaclePlaces.set(places);
    } catch {
      this.tentaclePlaces.set([]); // unavailable → the simple In range / Out of range fallback shows
    }
  }

  /** The hider names the specific place they're nearest to (tentacles). */
  async answerTentaclePlace(place: TentaclePlace): Promise<void> {
    await this.act('answer_question', { answer: 'in_range', feature_name: place.name, feature_lat: place.lat, feature_lng: place.lng });
  }

  placeDistance(m: number | undefined): string {
    return m == null ? '' : this.unitsService.formatDistance(m, this.units());
  }

  /** Distance from the hider to a reference point, formatted — only for measuring questions,
   *  so the hider sees how far THEY are from what's being measured (like the seeker). */
  distFromHider(pt: { lat: number; lng: number } | null | undefined): string | null {
    const me = this.hiderPos();
    if (!me || !this.isMeasuring() || pt?.lat == null || pt?.lng == null) {
      return null;
    }

    return this.placeDistance(Math.round(distanceMeters(me, { lat: pt.lat, lng: pt.lng })));
  }

  /** Collectible-card theme per type: accent colour (border/ribbon/button), tinted art panel, emblem.
   *  Colours come from the branded tokens in styles.css so they change in one place. */
  cardColor(card: HandCard): string {
    return card.type === 'time_bonus'
      ? 'var(--color-timebonus)'
      : card.type === 'powerup'
        ? 'var(--color-powerup)'
        : 'var(--color-curse)';
  }

  cardTintClass(card: HandCard): string {
    return card.type === 'time_bonus'
      ? 'bg-amber-50 dark:bg-amber-950/40'
      : card.type === 'powerup'
        ? 'bg-sky-50 dark:bg-sky-950/40'
        : 'bg-violet-50 dark:bg-violet-950/40';
  }

  cardEmblem(card: HandCard): string {
    return card.type === 'time_bonus' ? 'hourglass' : card.type === 'powerup' ? 'bolt' : 'curse';
  }

  cardTitle(card: HandCard): string {
    if (card.name) {
      return card.name;
    }
    if (card.type === 'time_bonus') {
      return `+${card.minutes ?? 0} min`;
    }

    return card.power ?? 'Card';
  }

  async answer(): Promise<void> {
    await this.act('answer_question', {});
  }

  async answerPhoto(url: string): Promise<void> {
    await this.act('answer_question', { photo_url: url });
  }

  /** Manual answer options when there's no auto-truth (matching / measuring). `labelKey` is a
   *  translation key resolved in the template. */
  readonly manualOptions = computed<{ value: string; labelKey: string }[] | null>(() => {
    switch (this.pending()?.category) {
      case 'matching':
        return [{ value: 'yes', labelKey: 'deck.matchSame' }, { value: 'no', labelKey: 'deck.matchDiff' }];
      case 'measuring':
        return [{ value: 'closer', labelKey: 'answer.closer' }, { value: 'further', labelKey: 'answer.further' }];
      // tentacles is handled by a dedicated place picker (isTentacleManual), not these verdicts.
      default:
        return null;
    }
  });

  /** Translation key for the manual-answer prompt (resolved in the template). */
  readonly manualPrompt = computed(() => {
    switch (this.pending()?.category) {
      case 'measuring':
        return 'deck.promptMeasuring';
      case 'tentacles':
        return 'deck.promptTentacles';
      default:
        return 'deck.promptMatching';
    }
  });

  /** The hider answers manually (matching/measuring) when the auto-truth couldn't be computed. */
  async answerManual(answer: string): Promise<void> {
    await this.act('answer_question', { answer });
  }

  /** The just-answered question the hider may still correct (amend window open), or null. */
  readonly amendLast = computed<ResolvedQuestion | null>(() => {
    if (!this.state().available_actions.includes('amend_answer')) {
      return null;
    }
    const qs = this.state().questions ?? [];

    return qs[qs.length - 1] ?? null;
  });

  /** The answer values a manual answer can be flipped between (matching / measuring). */
  amendOptions(category: string | null | undefined): string[] {
    if (category === 'matching') {
      return ['yes', 'no'];
    }
    if (category === 'tentacles') {
      return ['in_range', 'out_of_range'];
    }

    return category === 'measuring' ? ['closer', 'further'] : [];
  }

  async amend(answer: string): Promise<void> {
    await this.act('amend_answer', { answer });
  }

  /** Drop a card from the hand to free a slot (manage the hand limit). */
  async discard(card: HandCard): Promise<void> {
    await this.act('discard_card', { card_uid: card.uid });
  }

  /** Confirm a seeker's catch claim — ends the round. */
  async confirmCaught(): Promise<void> {
    await this.act('confirm_caught', {});
  }

  /** Reject a catch claim (the seeker isn't actually here) — the round continues. */
  async disputeFound(): Promise<void> {
    await this.act('dispute_found', {});
  }

  /** Toggle a category in the Drained Brain pick (capped at the curse's count). */
  toggleCategory(category: string): void {
    const chosen = this.chosenCategories();
    if (chosen.includes(category)) {
      this.chosenCategories.set(chosen.filter((c) => c !== category));
    } else if (chosen.length < (this.curseChoice()?.count ?? 0)) {
      this.chosenCategories.set([...chosen, category]);
    }
  }

  async confirmDisable(): Promise<void> {
    await this.act('choose_disabled_categories', { categories: this.chosenCategories() });
    this.chosenCategories.set([]);
  }

  async veto(): Promise<void> {
    const card = this.vetoCard();
    if (card) {
      await this.act('play_powerup', { card_uid: card.uid });
    }
  }

  /** Curses ask for confirmation (they're played on the seekers); powerups play directly — except
   *  'duplicate', which first asks WHICH card to copy (without a target it silently did nothing). */
  async playCard(card: HandCard): Promise<void> {
    if (card.type === 'curse') {
      this.confirmCard.set(card);
    } else if (card.type === 'powerup' && card.power === 'duplicate') {
      if (this.hand().some((c) => c.uid !== card.uid)) {
        this.duplicateChoosing.set(card); // open the copy-target picker
      }
    } else if (card.type === 'powerup') {
      await this.act('play_powerup', { card_uid: card.uid });
    }
  }

  /** Play the 'duplicate' powerup against the chosen target card (makes a copy of it). */
  async chooseDuplicateTarget(target: HandCard): Promise<void> {
    const dup = this.duplicateChoosing();
    this.duplicateChoosing.set(null);
    if (dup) {
      await this.act('play_powerup', { card_uid: dup.uid, target_uid: target.uid });
    }
  }

  cancelDuplicate(): void {
    this.duplicateChoosing.set(null);
  }

  async confirmPlay(): Promise<void> {
    const card = this.confirmCard();
    this.confirmCard.set(null);
    if (card) {
      await this.act('play_curse', { card_uid: card.uid });
    }
  }

  /** Cast a curse that requires a hider photo (e.g. a Street View screenshot) once it's uploaded. */
  async confirmPlayWithPhoto(url: string): Promise<void> {
    const card = this.confirmCard();
    this.confirmCard.set(null);
    if (card) {
      await this.act('play_curse', { card_uid: card.uid, photo_url: url });
    }
  }

  /** Whether the typed hangman word is long enough to cast (server enforces the full rule). */
  readonly wordReady = computed(() => this.castWord().trim().length >= 4);

  /** Cast the Hidden Hangman with the word the hider typed for the seekers to guess. */
  async confirmPlayWithWord(): Promise<void> {
    const card = this.confirmCard();
    const word = this.castWord().trim();
    if (!card || word.length < 4) {
      return;
    }
    this.confirmCard.set(null);
    this.castWord.set('');
    await this.act('play_curse', { card_uid: card.uid, word });
  }

  cancelPlay(): void {
    this.confirmCard.set(null);
    this.castWord.set('');
  }

  /** The seeker who asked a past question (for the answer-history author row), or null. */
  asker(q: ResolvedQuestion): PlayerView | null {
    return this.state().players.find((p) => p.id === q.asked_by) ?? null;
  }

  /** The question's range / feature, so the hider sees the full question (not just "radar"). */
  questionInfo(q: ResolvedQuestion): string | null {
    const parts: string[] = [];
    if (q.ask?.radius_m) {
      parts.push(this.unitsService.formatDistance(q.ask.radius_m, this.units()));
    }
    if (q.ask?.feature) {
      parts.push(q.ask.feature.replace(/_/g, ' '));
    }

    return parts.join(' · ') || null;
  }

  /** A coloured chip for an answer in the hider's past-answers list. */
  historyChip(q: ResolvedQuestion): string {
    const positive = this.category.answerPositive(q.answer?.answer);
    if (positive === true) {
      return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300';
    }
    if (positive === false) {
      return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  /** Remaining time for a timed curse the hider played, or null. */
  countdown(curse: ActiveCurse): string | null {
    if (curse.status !== 'active' || curse.expires_at == null) {
      return null;
    }

    return formatCountdown(curse.expires_at - this.clock.nowMs() / 1000);
  }

  private async act(type: string, payload: Record<string, unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.submitAction(this.sessionId(), type, payload);
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
