import { Injectable, signal } from '@angular/core';

/** The non-standard event Chromium fires when the PWA is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'jl_install_dismissed_at';
const RESHOW_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // don't nag: re-show at most every 14 days

/**
 * Drives the "Add to home screen" prompt. On Chromium we capture `beforeinstallprompt` and offer a
 * native Install button; on iOS (no programmatic install) we flag a manual Share→Add hint. Hides
 * when the app is already installed (standalone) or was recently dismissed.
 */
@Injectable({ providedIn: 'root' })
export class InstallPrompt {
  private deferred: BeforeInstallPromptEvent | null = null;

  /** A native install prompt is available (Chrome/Edge/Android). */
  readonly canInstall = signal(false);
  /** iOS Safari — install is manual (Share → Add to Home Screen). */
  readonly isIos = signal(false);
  /** Whether the banner should be shown at all. */
  readonly visible = signal(false);

  /** Call once at startup (from App) so the listener is registered before the event fires. */
  init(): void {
    if (this.isStandalone() || this.recentlyDismissed()) {
      return; // already installed, or dismissed recently
    }

    if (this.isIosDevice()) {
      this.isIos.set(true);
      this.visible.set(true);

      return;
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault(); // suppress Chrome's mini-infobar; we show our own banner
      this.deferred = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
      // Don't re-surface if the user dismissed it this fortnight (the event can re-fire).
      this.visible.set(! this.recentlyDismissed());
    });
    window.addEventListener('appinstalled', () => this.hide());
  }

  async install(): Promise<void> {
    if (!this.deferred) {
      return;
    }
    await this.deferred.prompt();
    await this.deferred.userChoice.catch(() => undefined);
    this.deferred = null;
    this.hide();
  }

  dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage blocked — just hide for this session
    }
    this.hide();
  }

  private hide(): void {
    this.canInstall.set(false);
    this.visible.set(false);
  }

  private isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  }

  private isIosDevice(): boolean {
    const ua = navigator.userAgent;

    // iPadOS 13+ reports a desktop UA, so also check for a touch-capable "Mac".
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  private recentlyDismissed(): boolean {
    const ts = Number(localStorage.getItem(DISMISS_KEY) ?? 0);

    return ts > 0 && Date.now() - ts < RESHOW_AFTER_MS;
  }
}
