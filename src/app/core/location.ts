import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api-client';

/** Wraps watchPosition; throttled posts to /location. */
@Injectable({ providedIn: 'root' })
export class LocationTracker {
  private readonly api = inject(ApiClient);
  private watchId: number | null = null;
  private lastSent = 0;

  start(sessionId: string): void {
    if (!('geolocation' in navigator) || this.watchId !== null) {
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - this.lastSent < 1000) {
          return; // ~1 ping/sec
        }
        this.lastSent = now;
        void this.api.reportLocation(sessionId, pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.warn('geolocation', err),
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
