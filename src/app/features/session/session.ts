import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ActiveCurse, GameState, PlayerView, Position, QuestionCatalogItem } from '../../core/models/models';
import { unitsOf } from '../../core/util/units';
import { ApiClient } from '../../core/services/api-client';
import { DeductionState } from '../../core/services/deduction-state';
import { HidingState } from '../../core/services/hiding-state';
import { LocationTracker } from '../../core/services/location';
import { PlayerStore } from '../../core/services/player-store';
import { Realtime } from '../../core/services/realtime';
import { SessionStore } from '../../core/services/session-store';
import { TranslocoModule } from '@jsverse/transloco';
import { computeGameTimer, GameTimer } from '../../core/util/game-timer';
import { DeductionMap } from '../map/deduction-map';
import { CardDeck } from './card-deck';
import { CurseAlert } from './curse-alert';
import { DevTools } from './dev-tools';
import { DrawModal } from './draw-modal';
import { GameHud } from './game-hud';
import { HiderPanel } from './hider-panel';
import { HostPanel } from './host-panel';
import { LobbyPanel } from './lobby-panel';
import { MapView } from './map';
import { QuestionPicker } from './question-picker';
import { RoundResults } from './round-results';
import { SeekerPanel } from './seeker-panel';

// Actions with a dedicated panel — kept out of the generic button row.
const PANEL_ACTIONS = ['start', 'assign_hider', 'choose_station', 'confirm_hidden', 'ask_question', 'answer_question', 'play_curse', 'play_powerup', 'keep_cards', 'complete_curse', 'roll_dice', 'start_thermometer', 'stop_thermometer', 'confirm_found', 'amend_answer', 'choose_disabled_categories', 'discard_card'];

// States that have a one-line status hint (the text lives in i18n under `statusHint.*`).
const STATUS_HINT_STATES = new Set(['role_assignment', 'hiding', 'seeking', 'endgame', 'round_end', 'finished']);

/** Premium full-screen game shell: a full-bleed map, a floating HUD, and a context side panel. */
@Component({
  selector: 'app-session',
  host: { class: 'block h-[100dvh] w-full' },
  imports: [RouterLink, TranslocoModule, MapView, DeductionMap, GameHud, LobbyPanel, HostPanel, HiderPanel, SeekerPanel, CardDeck, DevTools, QuestionPicker, DrawModal, CurseAlert, RoundResults],
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
  readonly devMode = !!environment.developerToken;
  readonly devPlacing = signal(false);
  readonly pickerOpen = signal(false);
  readonly catalog = signal<QuestionCatalogItem[]>([]);
  readonly curseAlert = signal<ActiveCurse | null>(null);
  private readonly seenCurses = new Set<string>();
  private cursesInit = false;

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
      this.realtime.connect(sessionId, this.myId(), (name, data) => this.store.onEvent(name, data));
      // In a dev build the position is driven by the debug tools (map tap / presets),
      // so don't let the browser GPS overwrite the simulated location.
      if (!this.devMode) {
        this.location.start(sessionId);
      }
    }

    // 1s local tick for countdowns (no server hit). State updates come from realtime
    // (Reverb) events + the refresh after each of this player's own actions — no poll.
    const interval = setInterval(() => this.tick.update((n) => n + 1), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));

    effect(() => {
      const now = this.store.state()?.timers?.now;
      if (now) {
        this.offset = now * 1000 - Date.now();
      }
    });

    // Flash a "you've been cursed" alert to seekers when a NEW curse lands. Curses
    // present at first load are marked seen silently (no retro-alert on join/reload).
    effect(() => {
      const s = this.store.state();
      if (!s || this.role(s) !== 'seeker') {
        return;
      }
      const active = s.curses.filter((c) => c.status === 'active' && c.uid);
      if (!this.cursesInit) {
        this.cursesInit = true;
        active.forEach((c) => this.seenCurses.add(c.uid!));
        return;
      }
      const fresh = active.find((c) => !this.seenCurses.has(c.uid!));
      if (fresh) {
        this.seenCurses.add(fresh.uid!);
        this.curseAlert.set(fresh);
        setTimeout(() => this.curseAlert.set(null), 4000);
      }
    });
  }

  me(s: GameState): PlayerView | undefined {
    return s.players.find((p) => p.id === this.myId());
  }

  role(s: GameState): string | null {
    return this.me(s)?.role ?? null;
  }

  isHost(s: GameState): boolean {
    return s.players.find((p) => p.id === this.myId())?.is_host ?? false;
  }

  showDeductionMap(s: GameState): boolean {
    return this.role(s) === 'seeker' && (s.state === 'seeking' || s.state === 'endgame');
  }

  /** While the hider is picking a station, surface the candidates + choice on the map —
   *  during the hiding phase, and again while relocating after a 'move' powerup. */
  private picking(s: GameState): boolean {
    return this.role(s) === 'hider'
      && (s.state === 'hiding' || (!!s.relocating && (s.state === 'seeking' || s.state === 'endgame')));
  }

  hidingStations(s: GameState): { lat: number; lng: number; name?: string; modes?: string[] }[] {
    return this.picking(s) ? (this.hiding.stations() ?? []) : [];
  }

  hidingHighlight(s: GameState): Position | null {
    return this.picking(s) ? this.hiding.selectedPosition() : null;
  }

  hidingPreviewZone(s: GameState): { lat: number; lng: number; radiusM: number } | null {
    const p = this.hidingHighlight(s);

    return p ? { lat: p.lat, lng: p.lng, radiusM: Number(s.config?.['hiding_zone_radius_m'] ?? 400) || 400 } : null;
  }

  /** The transit modes players may hide at (drives the station picker + zone carve). */
  transitModes(s: GameState): string[] | undefined {
    return s.config?.['transit_modes'] as string[] | undefined;
  }

  /** Hiding-zone rule: 'nearest' (carved, no other station inside) or 'circle' (plain radius). */
  zoneRule(s: GameState): string {
    return (s.config?.['hiding_zone_rule'] as string) ?? 'nearest';
  }

  /** True while the hiding zone (stations + carve) is being fetched — shows a HUD loader. */
  hidingCalculating(): boolean {
    return this.hiding.calculating();
  }

  /** The hider sees the seeker's pending question on their map. For a place question
   *  this is the seeker's closest object; otherwise the ask point (+ radar radius). */
  hiderQuestionMarker(s: GameState): { lat: number; lng: number; radiusM?: number | null; label?: string } | null {
    if (this.role(s) !== 'hider') {
      return null;
    }
    const q = s.pending_question;
    if (!q) {
      return null;
    }
    // Matching/measuring: show WHERE the seeker's closest object is, not just their spot.
    if (q.reference) {
      const feat = (q.params?.feature ?? 'place').replace(/_/g, ' ');
      return { lat: q.reference.lat, lng: q.reference.lng, label: `Seeker's closest ${feat}${q.reference.name ? ': ' + q.reference.name : ''}` };
    }
    if (q.ask?.lat == null || q.ask.lng == null) {
      return null;
    }

    return { lat: q.ask.lat, lng: q.ask.lng, radiusM: q.params?.radius_m ?? null, label: q.title ?? 'Question asked here' };
  }

  /** i18n key for the current state's status hint, or '' if it has none. */
  statusHint(s: GameState): string {
    return STATUS_HINT_STATES.has(s.state) ? 'statusHint.' + s.state : '';
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

  async onAsk(s: GameState, event: { questionId: string; category: string; payload: Record<string, unknown> }): Promise<void> {
    this.pickerOpen.set(false);
    // A thermometer is started (then stopped) rather than asked outright.
    const action = event.category === 'thermometer' ? 'start_thermometer' : 'ask_question';
    await this.api.submitAction(s.session_id, action, { question_id: event.questionId, ...event.payload });
    this.store.refresh();
  }

  /** Once a round is over, reveal where the hider was actually hiding. */
  revealMarker(s: GameState): { lat: number; lng: number; label?: string } | null {
    if (s.state !== 'round_end' && s.state !== 'finished') {
      return null;
    }
    const p = s.last_round?.hider_position;
    const name = s.last_round?.hider_name;

    return p ? { lat: p.lat, lng: p.lng, label: name ? `🫥 ${name} hid here` : '🫥 Hider was here' } : null;
  }

  /** While a thermometer is running, show its target distance circle on the seeker map. */
  thermoMarker(s: GameState): { lat: number; lng: number; radiusM?: number | null; label?: string } | null {
    const t = s.thermometer;
    if (!t || t.start_lat == null || t.start_lng == null) {
      return null;
    }

    return { lat: t.start_lat, lng: t.start_lng, radiusM: t.distance_m, label: `🌡️ Travel ${t.distance_label ?? ''}` };
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
