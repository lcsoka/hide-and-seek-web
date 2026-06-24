import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Position } from '../models/models';

/** A source of the device's position — real (browser) or simulated (tests / dev). */
export interface LocationSource {
  positions(): Observable<Position>;
  stop(): void;
}

export const LOCATION_SOURCE = new InjectionToken<LocationSource>('LOCATION_SOURCE');
