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
    // A lazily-imported route chunk that fails to load — a stale shell asking for a content hash
    // that no longer exists, so the server answers with index.html / a 404 instead of JS — is fatal:
    // the app can't navigate. This can happen even where the SW is disabled (dev, unsupported
    // browsers), so it's wired up unconditionally. Recover by clearing the broken caches + SW and
    // reloading fresh from the network.
    window.addEventListener('unhandledrejection', (e) => this.onError((e.reason as { message?: string } | undefined)?.message ?? String(e.reason)));
    window.addEventListener('error', (e) => this.onError(e.message));

    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this._ready.set(true));

    // If the SW gives up (its cached version references assets that can no longer be fetched), the
    // only way out is a clean reload from the network.
    this.swUpdate.unrecoverable.subscribe(() => this.recover());

    // Check at startup, whenever the tab regains focus / connectivity, and on a slow interval.
    void this.check();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.check());
    window.addEventListener('online', () => this.check());
    setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  /** Detect a fatal chunk-load / bad-MIME failure and self-heal. */
  private onError(message: string | undefined): void {
    if (!message) {
      return;
    }
    const fatal =
      /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|valid JavaScript MIME type|ChunkLoadError|Loading chunk [\w-]+ failed/i;
    if (fatal.test(message)) {
      void this.recover();
    }
  }

  /**
   * Nuke the service worker + its caches and reload from the network. Guarded so a persistent
   * failure can't hot-loop the page (never more than once per 30s within a browsing session).
   */
  private async recover(): Promise<void> {
    const KEY = 'jl-sw-recover-at';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) {
      return;
    }
    sessionStorage.setItem(KEY, String(Date.now()));
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // best-effort — reload regardless
    }
    document.location.reload();
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
