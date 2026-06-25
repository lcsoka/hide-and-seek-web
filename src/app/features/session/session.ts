import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { GameState, Position, QuestionCatalogItem } from '../../core/models/models';
import { unitsOf } from '../../core/util/units';
import { ApiClient } from '../../core/services/api-client';
import { DeductionState } from '../../core/services/deduction-state';
import { HidingState } from '../../core/services/hiding-state';
import { LocationTracker } from '../../core/services/location';
import { PlayerStore } from '../../core/services/player-store';
import { Realtime } from '../../core/services/realtime';
import { SessionStore } from '../../core/services/session-store';
import { computeGameTimer, GameTimer } from '../../core/util/game-timer';
import { actionLabel } from '../../core/util/labels';
import { DeductionMap } from '../map/deduction-map';
import { CardDeck } from './card-deck';
import { DevTools } from './dev-tools';
import { DrawModal } from './draw-modal';
import { GameHud } from './game-hud';
import { HiderPanel } from './hider-panel';
import { HostPanel } from './host-panel';
import { LobbyPanel } from './lobby-panel';
import { MapView } from './map';
import { QuestionPicker } from './question-picker';
import { SeekerPanel } from './seeker-panel';

// Actions with a dedicated panel — kept out of the generic button row.
const PANEL_ACTIONS = ['start', 'assign_hider', 'choose_station', 'confirm_hidden', 'ask_question', 'answer_question', 'play_curse', 'play_powerup', 'keep_cards', 'complete_curse'];

const STATUS_HINTS: Record<string, string> = {
  role_assignment: 'Waiting for the host to assign roles…',
  hiding: 'The hider is choosing a spot…',
  seeking: 'Seekers are hunting — answer their questions and play curses.',
  endgame: 'Final guesses!',
  round_end: 'Round over.',
  finished: 'Game over.',
};

/** Premium full-screen game shell: a full-bleed map, a floating HUD, and a context side panel. */
@Component({
  selector: 'app-session',
  host: { class: 'block h-[100dvh] w-full' },
  imports: [RouterLink, MapView, DeductionMap, GameHud, LobbyPanel, HostPanel, HiderPanel, SeekerPanel, CardDeck, DevTools, QuestionPicker, DrawModal],
  templateUrl: './session.html',
})
export class SessionView {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly realtime = inject(Realtime);
  private readonly location = inject(LocationTracker);
  private readonly players = inject(PlayerStore);
  readonly store = inject(SessionStore);
  readonly deduction = inject(DeductionState);
  readonly hiding = inject(HidingState);

  readonly id = signal<string | undefined>(this.route.snapshot.paramMap.get('id') ?? undefined);
  readonly myId = signal<string | null>(null);
  readonly acting = signal(false);
  readonly label = actionLabel;
  readonly devMode = !!environment.developerToken;
  readonly devPlacing = signal(false);
  readonly pickerOpen = signal(false);
  readonly catalog = signal<QuestionCatalogItem[]>([]);

  private readonly tick = signal(0);
  private offset = 0;

  readonly timer = computed<GameTimer | null>(() => {
    this.tick();
    const s = this.store.state();

    return s ? computeGameTimer(s, this.offset) : null;
  });

  constructor() {
    const sessionId = this.id();
    if (sessionId) {
      this.myId.set(this.players.get(sessionId));
      this.store.setSession(sessionId);
      this.realtime.connect(sessionId, this.myId(), (name) => this.store.onEvent(name));
      this.location.start(sessionId);
    }

    const interval = setInterval(() => this.tick.update((n) => n + 1), 1000);
    // Poll /state as a safety net so the view never gets stuck on stale state if a
    // realtime event is delayed or missed (Reverb is best-effort).
    const poll = setInterval(() => this.store.refresh(), 4000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      clearInterval(poll);
    });

    effect(() => {
      const now = this.store.state()?.timers?.now;
      if (now) {
        this.offset = now * 1000 - Date.now();
      }
    });
  }

  role(s: GameState): string | null {
    return s.players.find((p) => p.id === this.myId())?.role ?? null;
  }

  isHost(s: GameState): boolean {
    return s.players.find((p) => p.id === this.myId())?.is_host ?? false;
  }

  showDeductionMap(s: GameState): boolean {
    return this.role(s) === 'seeker' && (s.state === 'seeking' || s.state === 'endgame');
  }

  /** While the hider is picking a station, surface the candidates + choice on the map. */
  private picking(s: GameState): boolean {
    return this.role(s) === 'hider' && s.state === 'hiding';
  }

  hidingStations(s: GameState): { lat: number; lng: number; name?: string }[] {
    return this.picking(s) ? (this.hiding.stations() ?? []) : [];
  }

  hidingHighlight(s: GameState): Position | null {
    return this.picking(s) ? this.hiding.selectedPosition() : null;
  }

  hidingPreviewZone(s: GameState): { lat: number; lng: number; radiusM: number } | null {
    const p = this.hidingHighlight(s);

    return p ? { lat: p.lat, lng: p.lng, radiusM: Number(s.config?.['hiding_zone_radius_m'] ?? 400) || 400 } : null;
  }

  /** The hider sees the seeker's pending question on their map (ask point + radar radius). */
  hiderQuestionMarker(s: GameState): { lat: number; lng: number; radiusM?: number | null; label?: string } | null {
    if (this.role(s) !== 'hider') {
      return null;
    }
    const q = s.pending_question;
    if (!q?.ask || q.ask.lat == null || q.ask.lng == null) {
      return null;
    }

    return { lat: q.ask.lat, lng: q.ask.lng, radiusM: q.params?.radius_m ?? null, label: q.title ?? 'Question asked here' };
  }

  prettyState(state: string): string {
    return state.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  statusHint(s: GameState): string {
    return STATUS_HINTS[s.state] ?? '';
  }

  visibleActions(s: GameState): string[] {
    return s.available_actions.filter((a) => !PANEL_ACTIONS.includes(a));
  }

  askUnits(s: GameState): 'metric' | 'imperial' {
    return unitsOf(s.config);
  }

  openAsk(): void {
    if (!this.catalog().length) {
      void this.api.questionsCatalog().then((c) => this.catalog.set(c));
    }
    this.pickerOpen.set(true);
  }

  async onAsk(s: GameState, event: { questionId: string; payload: Record<string, unknown> }): Promise<void> {
    this.pickerOpen.set(false);
    await this.api.submitAction(s.session_id, 'ask_question', { question_id: event.questionId, ...event.payload });
    this.store.refresh();
  }

  /** Dev-only: tapping the map sets this player's simulated position. */
  onMapClick(p: Position): void {
    const sessionId = this.id();
    if (this.devMode && this.devPlacing() && sessionId) {
      void this.api.reportLocation(sessionId, p.lat, p.lng).then(() => this.store.refresh());
    }
  }

  async act(type: string): Promise<void> {
    const sessionId = this.id();
    if (!sessionId) {
      return;
    }

    this.acting.set(true);
    try {
      await this.api.submitAction(sessionId, type);
    } finally {
      this.acting.set(false);
      this.store.refresh();
    }
  }
}
