import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Position } from '../models';
import { LocationSource } from './location-source';

/** Real device location via the browser Geolocation API. */
@Injectable()
export class BrowserLocationSource implements LocationSource {
  private watchId: number | null = null;

  positions(): Observable<Position> {
    return new Observable<Position>((subscriber) => {
      if (!('geolocation' in navigator)) {
        subscriber.error(new Error('Geolocation unavailable'));

        return;
      }

      this.watchId = navigator.geolocation.watchPosition(
        (p) => subscriber.next({ lat: p.coords.latitude, lng: p.coords.longitude }),
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
  }
}
