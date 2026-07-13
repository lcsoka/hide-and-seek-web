import { Injectable, signal } from '@angular/core';

export type GeoPermState = 'granted' | 'prompt' | 'denied' | 'unsupported';

/**
 * Tracks the browser's geolocation permission as a live signal. Uses the Permissions API where
 * available (with its `change` event, so granting from OS/browser settings is picked up without a
 * reload) and a slow poll as a fallback for engines that lack it or don't fire `change` reliably
 * (older Safari). The game needs location to play, so the session shell gates play on this.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationPermission {
  readonly state = signal<GeoPermState>('prompt');

  constructor() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.state.set('unsupported');
      return;
    }
    void this.query();
    // Belt-and-suspenders: re-check every few seconds while not yet granted, so the gate modal
    // auto-dismisses the moment the user allows location (even if `change` never fires).
    setInterval(() => {
      if (this.state() !== 'granted' && this.state() !== 'unsupported') {
        void this.query();
      }
    }, 3000);
  }

  private async query(): Promise<void> {
    const perms = (navigator as unknown as { permissions?: { query?: (d: { name: string }) => Promise<PermissionStatus> } }).permissions;
    if (perms?.query) {
      try {
        const status = await perms.query({ name: 'geolocation' });
        this.state.set(status.state as GeoPermState);
        status.onchange = () => this.state.set(status.state as GeoPermState);
      } catch {
        // Permissions API present but 'geolocation' not queryable — stay at the current state and
        // let request() resolve it.
      }
    }
  }

  /**
   * The live location loop received a fix — hard proof the grant is real. This is the reliable
   * signal on iOS, where `navigator.permissions.query({name:'geolocation'})` isn't supported, so the
   * state would otherwise sit at 'prompt' forever and flash the gate on every foreground.
   */
  markGranted(): void {
    this.state.set('granted');
  }

  /** The location loop failed with a hard permission denial. */
  markDenied(): void {
    this.state.set('denied');
  }

  /** Trigger the native prompt (or confirm an existing grant). Resolves the state either way. */
  request(): void {
    if (this.state() === 'unsupported') {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => this.state.set('granted'),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.state.set('denied');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
}
