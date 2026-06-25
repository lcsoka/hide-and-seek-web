import { computed, inject, Injectable, signal } from '@angular/core';
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

  setSession(id: string): void {
    this.sessionId.set(id);
  }

  refresh(): void {
    this.resource.reload();
  }

  /** A realtime event arrived: log it. PlayerMoved just patches a position (cheap);
   *  everything else re-hydrates authoritative state. */
  onEvent(type: string, data?: unknown): void {
    this.feed.update((log) => [{ type, at: Date.now() }, ...log].slice(0, 30));

    if (type === 'PlayerMoved') {
      const move = data as { player_id?: string; lat?: number; lng?: number } | undefined;
      if (move?.player_id && move.lat != null && move.lng != null) {
        this.livePositions.update((m) => ({ ...m, [move.player_id!]: { lat: move.lat!, lng: move.lng! } }));
      }
      return;
    }

    this.refresh();
  }
}
