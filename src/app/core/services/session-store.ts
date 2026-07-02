import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ApiClient } from './api-client';

export interface FeedEntry {
  type: string;
  at: number;
}

/**
 * Single source of truth for the active session. Hydrates from GET /state (a
 * reactive httpResource) and re-hydrates whenever a realtime event arrives —
 * the server stays authoritative; the client never reduces game rules itself.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiClient);
  private readonly transloco = inject(TranslocoService);
  private readonly sessionId = signal<string | undefined>(undefined);
  private readonly resource = this.api.stateResource(this.sessionId);
  // Live seeker positions from PlayerMoved events, overlaid on /state so the map moves
  // in real time without re-fetching the whole state on every location ping.
  private readonly livePositions = signal<Record<string, { lat: number; lng: number }>>({});

  readonly state = computed(() => {
    const s = this.resource.value() ?? null;
    const live = this.livePositions();
    if (!s || !Object.keys(live).length) {
      return s;
    }

    return { ...s, players: s.players.map((p) => (live[p.id] ? { ...p, lat: live[p.id].lat, lng: live[p.id].lng } : p)) };
  });
  readonly loading = this.resource.isLoading;
  readonly error = this.resource.error;
  readonly feed = signal<FeedEntry[]>([]);
  // A brief notice to the seeker about their last question's fate (voided / vetoed) so
  // they know to ask again rather than waiting on a vanished question. Auto-clears.
  readonly questionNotice = signal<string | null>(null);

  // The highest event seq the client has seen (from `_seq` on live events / the catch-up cursor).
  // Used to ask the server for only what was missed while the socket was down.
  private lastSeq = 0;

  private notify(message: string): void {
    this.questionNotice.set(message);
    setTimeout(() => this.questionNotice.set(null), 6000);
  }

  setSession(id: string): void {
    this.sessionId.set(id);
  }

  refresh(): void {
    this.resource.reload();
  }

  /** Overlay a live position on the polled state (from a PlayerMoved event, or optimistically
   *  from the player's own GPS so their marker moves instantly without a server round-trip). */
  setLivePosition(playerId: string, lat: number, lng: number): void {
    this.livePositions.update((m) => ({ ...m, [playerId]: { lat, lng } }));
  }

  /** A realtime event arrived: log it. PlayerMoved just patches a position (cheap);
   *  everything else re-hydrates authoritative state. */
  onEvent(type: string, data?: unknown): void {
    this.trackSeq(data);
    this.feed.update((log) => [{ type, at: Date.now() }, ...log].slice(0, 30));

    if (type === 'PlayerMoved') {
      const move = data as { player_id?: string; lat?: number; lng?: number } | undefined;
      if (move?.player_id && move.lat != null && move.lng != null) {
        this.setLivePosition(move.player_id, move.lat, move.lng);
      }
      return;
    }

    this.applyNotice(type);
    this.refresh();
  }

  /**
   * Reconnect catch-up: replay the events broadcast while the socket was down (their
   * transient notices would otherwise be lost — Reverb doesn't buffer for absent clients),
   * then re-hydrate authoritative state. Safe to call on every reconnect / tab-resume:
   * with nothing missed it just advances the cursor and does one /state refresh.
   */
  async catchUp(): Promise<void> {
    const id = this.sessionId();
    if (!id) {
      return;
    }
    try {
      const { events, cursor } = await this.api.eventsSince(id, this.lastSeq);
      for (const e of events) {
        this.feed.update((log) => [{ type: e.type, at: Date.now() }, ...log].slice(0, 30));
        if (e.type !== 'PlayerMoved') {
          this.applyNotice(e.type); // replay the notice the user missed
        }
      }
      if (typeof cursor === 'number') {
        this.lastSeq = Math.max(this.lastSeq, cursor);
      }
    } catch {
      // Network still flaky — the refresh below still re-syncs correctness.
    }
    this.refresh();
  }

  /** A brief seeker notice for events whose only payload is transient (not reflected in /state). */
  private applyNotice(type: string): void {
    if (type === 'QuestionVoided') {
      this.notify(this.transloco.translate('seeker.voidedNotice'));
    } else if (type === 'QuestionVetoed') {
      this.notify(this.transloco.translate('seeker.vetoedNotice'));
    }
  }

  private trackSeq(data?: unknown): void {
    const seq = (data as { _seq?: number } | undefined)?._seq;
    if (typeof seq === 'number' && seq > this.lastSeq) {
      this.lastSeq = seq;
    }
  }
}
