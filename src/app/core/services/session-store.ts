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

  readonly state = computed(() => this.resource.value() ?? null);
  readonly loading = this.resource.isLoading;
  readonly error = this.resource.error;
  readonly feed = signal<FeedEntry[]>([]);

  setSession(id: string): void {
    this.sessionId.set(id);
  }

  refresh(): void {
    this.resource.reload();
  }

  /** A realtime event arrived: log it and re-hydrate authoritative state. */
  onEvent(type: string): void {
    this.feed.update((log) => [{ type, at: Date.now() }, ...log].slice(0, 30));
    this.refresh();
  }
}
