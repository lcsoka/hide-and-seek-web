import { inject, Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiClient } from './api-client';
import { LOCATION_SOURCE } from './location-source';

/** Subscribes to the active LocationSource and posts throttled pings to /location. */
@Injectable({ providedIn: 'root' })
export class LocationTracker {
  private readonly api = inject(ApiClient);
  private readonly source = inject(LOCATION_SOURCE);
  private subscription: Subscription | null = null;
  private lastSent = 0;

  start(sessionId: string): void {
    if (this.subscription) {
      return;
    }

    this.subscription = this.source.positions().subscribe({
      next: (pos) => {
        const now = Date.now();
        if (now - this.lastSent < 1000) {
          return; // ~1 ping/sec
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
