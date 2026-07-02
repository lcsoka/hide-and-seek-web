import { inject, Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiClient } from './api-client';
import { LOCATION_SOURCE } from './location-source';
import { SessionStore } from './session-store';

/** Subscribes to the active LocationSource and posts throttled pings to /location. */
@Injectable({ providedIn: 'root' })
export class LocationTracker {
  private readonly api = inject(ApiClient);
  private readonly source = inject(LOCATION_SOURCE);
  private readonly store = inject(SessionStore);
  private subscription: Subscription | null = null;
  private lastSent = 0;

  start(sessionId: string, playerId: string | null): void {
    if (this.subscription) {
      return;
    }

    this.subscription = this.source.positions().subscribe({
      next: (pos) => {
        // Move the player's OWN marker instantly (no server round-trip / broadcast echo wait).
        if (playerId) {
          this.store.setLivePosition(playerId, pos.lat, pos.lng);
        }
        const now = Date.now();
        if (now - this.lastSent < 1000) {
          return; // ~1 ping/sec to the server
        }
        this.lastSent = now;
        void this.api.reportLocation(sessionId, pos.lat, pos.lng);
      },
      // Permission denied / unavailable — stop quietly; the game still works without GPS.
      error: () => this.stop(),
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.source.stop();
  }
}
