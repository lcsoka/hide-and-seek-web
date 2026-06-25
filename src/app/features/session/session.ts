import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { GameState, Position } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { DeductionState } from '../../core/services/deduction-state';
import { LocationTracker } from '../../core/services/location';
import { PlayerStore } from '../../core/services/player-store';
import { Realtime } from '../../core/services/realtime';
import { SessionStore } from '../../core/services/session-store';
import { computeGameTimer, GameTimer } from '../../core/util/game-timer';
import { actionLabel } from '../../core/util/labels';
import { DeductionMap } from '../map/deduction-map';
import { DevTools } from './dev-tools';
import { GameHud } from './game-hud';
import { HiderPanel } from './hider-panel';
import { HostPanel } from './host-panel';
import { LobbyPanel } from './lobby-panel';
import { MapView } from './map';
import { SeekerPanel } from './seeker-panel';

// Actions with a dedicated panel — kept out of the generic button row.
const PANEL_ACTIONS = ['start', 'assign_hider', 'choose_station', 'confirm_hidden', 'ask_question'];

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
  imports: [RouterLink, MapView, DeductionMap, GameHud, LobbyPanel, HostPanel, HiderPanel, SeekerPanel, DevTools],
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

  readonly id = signal<string | undefined>(this.route.snapshot.paramMap.get('id') ?? undefined);
  readonly myId = signal<string | null>(null);
  readonly acting = signal(false);
  readonly label = actionLabel;
  readonly devMode = !!environment.developerToken;
  readonly devPlacing = signal(false);

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
    inject(DestroyRef).onDestroy(() => clearInterval(interval));

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

  prettyState(state: string): string {
    return state.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  statusHint(s: GameState): string {
    return STATUS_HINTS[s.state] ?? '';
  }

  visibleActions(s: GameState): string[] {
    return s.available_actions.filter((a) => !PANEL_ACTIONS.includes(a));
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
