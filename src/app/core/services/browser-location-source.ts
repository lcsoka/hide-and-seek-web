import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Position } from '../models';
import { LocationSource } from './location-source';
import { stopMetres } from './transit-stops';

/** Real device location via the browser Geolocation API. */
@Injectable()
export class BrowserLocationSource implements LocationSource {
  private watchId: number | null = null;
  private last: Position | null = null;

  positions(): Observable<Position> {
    return new Observable<Position>((subscriber) => {
      if (!('geolocation' in navigator)) {
        subscriber.error(new Error('Geolocation unavailable'));

        return;
      }

      this.watchId = navigator.geolocation.watchPosition(
        (p) => {
          const pos: Position = { lat: p.coords.latitude, lng: p.coords.longitude };
          // Suppress GPS jitter while standing still: a stationary phone reports several metres of
          // random noise every reading (Android especially), which made the avatar wander on the
          // map. Only emit once the move exceeds the reading's own accuracy (clamped to 5–12 m), so
          // real walking still tracks but noise-in-place is filtered.
          const acc = Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : 10;
          const gate = Math.min(Math.max(acc, 5), 12);
          if (this.last && stopMetres(this.last, pos) < gate) {
            return;
          }
          this.last = pos;
          subscriber.next(pos);
        },
        (e) => subscriber.error(e),
        { enableHighAccuracy: true, maximumAge: 1000 },
      );

      return () => this.stop();
    });
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.last = null;
  }
}
