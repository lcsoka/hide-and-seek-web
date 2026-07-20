import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Position } from '../models';
import { LocationSource } from './location-source';
import { stopMetres } from './transit-stops';

/**
 * Worse than this and the reading is not really GPS — the phone has fallen back to a wifi or
 * cell-tower fix that only narrows the player down to a district. It carries no usable signal
 * about where they are and jumps their own marker across the map, so it is dropped outright.
 */
const REJECT_ACCURACY_M = 150;

/**
 * Upper bound on the stand-still jitter gate below. Kept in step with the server's
 * `game.location.max_accuracy_m`: a fix that rough can't decide anything anyway, so it should
 * not be allowed to walk the player's marker around either.
 */
const JITTER_GATE_MAX_M = 50;

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
          const acc = Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : undefined;
          if (acc !== undefined && acc > REJECT_ACCURACY_M) {
            return; // not a position, just an area — see REJECT_ACCURACY_M
          }
          const pos: Position = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: acc };
          // Suppress GPS jitter while standing still: a stationary phone reports several metres of
          // random noise every reading (Android especially), which made the avatar wander on the
          // map. Only emit once the move exceeds the reading's own accuracy, so real walking still
          // tracks but noise-in-place is filtered. The gate follows the reading's own error rather
          // than being capped near it — a fix that could be 40 m out must clear 40 m to count as
          // movement, otherwise its noise passes for walking.
          const gate = Math.min(Math.max(acc ?? 10, 5), JITTER_GATE_MAX_M);
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
