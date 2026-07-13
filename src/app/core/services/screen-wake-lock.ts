import { Injectable } from '@angular/core';

interface WakeSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener?(type: 'release', cb: () => void): void;
}

/**
 * Keeps the screen awake during active play. A hide-and-seek game is played walking with the phone
 * in hand/pocket — when the screen sleeps the PWA is suspended: geolocation stops, the websocket
 * drops, and the UI/position go stale (a real playtest lost a catch to exactly this). The Screen
 * Wake Lock is released by the OS whenever the tab backgrounds, so it must be re-acquired on return
 * to the foreground. Best-effort: unsupported/denied just means the screen may sleep as before.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWakeLock {
  private lock: WakeSentinel | null = null;
  private wanted = false;

  /** Ask to keep the screen on (idempotent). */
  async enable(): Promise<void> {
    this.wanted = true;
    await this.acquire();
  }

  /** Stop keeping the screen on. */
  disable(): void {
    this.wanted = false;
    void this.lock?.release().catch(() => {});
    this.lock = null;
  }

  /** Re-acquire after the OS auto-released it (call on visibilitychange → visible). */
  async reacquire(): Promise<void> {
    if (this.wanted && !this.lock) {
      await this.acquire();
    }
  }

  private async acquire(): Promise<void> {
    const nav = navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> } };
    if (this.lock || !nav.wakeLock) {
      return;
    }
    try {
      const sentinel = await nav.wakeLock.request('screen');
      this.lock = sentinel;
      sentinel.addEventListener?.('release', () => (this.lock = null));
    } catch {
      // Denied or unsupported — the game still works; the screen may sleep.
    }
  }
}
