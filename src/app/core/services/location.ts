import { computed, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { distanceMeters } from '../geo/geo';
import { Position } from '../models';
import { ApiClient } from './api-client';
import { GeolocationPermission } from './geolocation-permission';
import { LOCATION_SOURCE } from './location-source';
import { SessionStore } from './session-store';

/** Never post more than once a second, even when moving fast. */
const MIN_INTERVAL_MS = 1000;
/** Deadband: ignore GPS jitter — don't post unless the player moved at least this far. */
const MIN_DISTANCE_M = 10;
/** …but still post at least this often when stationary, to stay "active" and self-correct. */
const HEARTBEAT_MS = 45_000;
/**
 * Kept in step with the server's `game.location.max_accuracy_m`. Above this the server still
 * records the position but will not act on it — questions fall back to a manual answer, the
 * catch and the endgame trigger stay shut — so the player is told rather than left guessing why
 * a button does nothing.
 */
const WEAK_ACCURACY_M = 50;

/**
 * Pure decision for whether a new fix is worth sending to the server. Mobile GPS emits a steady
 * stream of jittery fixes while the user stands still; we send the first fix, then only when the
 * player has actually moved (beyond the deadband) or a heartbeat interval has elapsed — always
 * rate-limited to ~1/s.
 */
export function shouldSendLocation(lastSent: Position | null, lastSentAt: number, pos: Position, now: number): boolean {
  if (lastSent === null) {
    return true; // first fix of the session
  }
  if (now - lastSentAt < MIN_INTERVAL_MS) {
    return false; // rate cap
  }
  if (distanceMeters(lastSent, pos) >= MIN_DISTANCE_M) {
    return true; // real movement
  }

  return now - lastSentAt >= HEARTBEAT_MS; // stationary, but keep a fresh heartbeat
}

/** Subscribes to the active LocationSource and posts distance-gated, throttled pings to /location. */
@Injectable({ providedIn: 'root' })
export class LocationTracker {
  private readonly api = inject(ApiClient);
  private readonly source = inject(LOCATION_SOURCE);
  private readonly store = inject(SessionStore);
  private readonly perm = inject(GeolocationPermission);
  private subscription: Subscription | null = null;

  private lastSent: Position | null = null;
  private lastSentAt = 0;

  /** Accuracy of the latest fix in metres; null before the first one, or if the device omits it. */
  readonly accuracy = signal<number | null>(null);

  /** The current fix is too rough for the server to decide anything on it — surfaced in the HUD. */
  readonly weakFix = computed(() => {
    const metres = this.accuracy();

    return metres !== null && metres > WEAK_ACCURACY_M;
  });

  start(sessionId: string, playerId: string | null): void {
    if (this.subscription) {
      return;
    }
    this.lastSent = null;
    this.lastSentAt = 0;
    this.accuracy.set(null);

    this.subscription = this.source.positions().subscribe({
      next: (pos) => {
        this.perm.markGranted(); // a real fix arrived → permission is granted (reliable on iOS too)
        this.accuracy.set(pos.accuracy ?? null);
        // Move the player's OWN marker instantly (no server round-trip / broadcast echo wait).
        if (playerId) {
          this.store.setLivePosition(playerId, pos.lat, pos.lng);
        }
        if (shouldSendLocation(this.lastSent, this.lastSentAt, pos, Date.now())) {
          this.lastSent = pos;
          this.lastSentAt = Date.now();
          void this.api.reportLocation(sessionId, pos.lat, pos.lng, pos.accuracy);
        }
      },
      // Denied / unavailable — stop quietly; the game still works without GPS. A hard denial
      // (code 1) surfaces the gate so the player can re-enable it from settings.
      error: (e: GeolocationPositionError) => {
        if (e?.code === 1) {
          this.perm.markDenied();
        }
        this.stop();
      },
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.accuracy.set(null);
    this.source.stop();
  }
}
