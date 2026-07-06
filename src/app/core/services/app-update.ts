import { inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // re-check for a new build every 30 min

/**
 * Watches for a newer deployed build. The service worker serves the cached version instantly and
 * downloads a new one in the background; this surfaces a "ready" flag so the UI can offer a Refresh
 * (we never auto-reload — that could interrupt a live game). No-ops where the SW isn't active
 * (dev / unsupported browsers).
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly swUpdate = inject(SwUpdate);
  private readonly _ready = signal(false);

  /** True once a newer build has been downloaded and will apply on reload. */
  readonly ready = this._ready.asReadonly();

  init(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this._ready.set(true));

    // Check at startup, whenever the tab regains focus / connectivity, and on a slow interval.
    void this.check();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.check());
    window.addEventListener('online', () => this.check());
    setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  private async check(): Promise<void> {
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      // offline / transient — try again next tick
    }
  }

  /** Activate the downloaded build and reload. Called from the Refresh prompt. */
  async apply(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // fall through to a hard reload anyway
    }
    document.location.reload();
  }

  dismiss(): void {
    this._ready.set(false);
  }
}
