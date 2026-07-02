import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Position } from '../models';
import { stepTowards } from '../util/geo';
import { LocationSource } from './location-source';

const BUDAPEST: Position = { lat: 47.4979, lng: 19.0402 };

/**
 * Simulated location for tests and the dev cockpit: jump to a point, take a single
 * step toward a target, or auto-drive a route at a speed.
 */
@Injectable()
export class SimulatedLocationSource implements LocationSource {
  private readonly subject = new BehaviorSubject<Position>(BUDAPEST);
  private timer: ReturnType<typeof setInterval> | null = null;

  positions(): Observable<Position> {
    return this.subject.asObservable();
  }

  current(): Position {
    return this.subject.value;
  }

  jumpTo(pos: Position): void {
    this.stop();
    this.subject.next(pos);
  }

  /** One step of `meters` toward target; emits the new position; returns whether it arrived. */
  step(target: Position, meters: number): boolean {
    const { pos, arrived } = stepTowards(this.subject.value, target, meters);
    this.subject.next(pos);

    return arrived;
  }

  /** Auto-drive toward target at `speedMps`, emitting every `intervalMs`, until arrival. */
  driveTo(target: Position, speedMps: number, intervalMs = 1000): void {
    this.stop();
    const metersPerTick = (speedMps * intervalMs) / 1000;
    this.timer = setInterval(() => {
      if (this.step(target, metersPerTick)) {
        this.stop();
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
