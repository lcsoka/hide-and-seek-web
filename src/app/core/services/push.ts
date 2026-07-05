import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from './api-client';
import { Language } from './language';

/**
 * Web Push opt-in for this device. Fetches the VAPID key from the backend, subscribes via the
 * service worker, and mirrors the state into signals for the UI. Only usable where the SW is
 * active (production builds) and the browser supports notifications.
 */
@Injectable({ providedIn: 'root' })
export class Push {
  private readonly swPush = inject(SwPush);
  private readonly api = inject(ApiClient);
  private readonly language = inject(Language);
  private readonly router = inject(Router);

  /** Push is usable at all (service worker enabled + Notification API present). */
  readonly supported = this.swPush.isEnabled && 'Notification' in globalThis;
  readonly permission = signal<NotificationPermission>(this.supported ? Notification.permission : 'denied');
  readonly enabled = signal(false);
  readonly busy = signal(false);

  constructor() {
    if (!this.supported) {
      return;
    }
    // Track the live subscription so the toggle reflects reality across devices/tabs.
    this.swPush.subscription.subscribe((sub) => this.enabled.set(!!sub));
    // If the app is already open when a notification is clicked, navigate the SPA to its target.
    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const url = (notification.data as { onActionClick?: { default?: { url?: string } } })?.onActionClick?.default?.url;
      if (url) {
        void this.router.navigateByUrl(url);
      }
    });
  }

  /** Ask for permission, subscribe, and register the subscription with the backend. */
  async enable(): Promise<boolean> {
    if (!this.supported || this.busy()) {
      return false;
    }
    this.busy.set(true);
    try {
      const { key } = await this.api.pushPublicKey();
      if (!key) {
        return false; // push not configured on the server
      }
      const sub = await this.swPush.requestSubscription({ serverPublicKey: key });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await this.api.pushSubscribe({ endpoint: json.endpoint, keys: json.keys, locale: this.language.lang() });
      this.permission.set('granted');
      this.enabled.set(true);

      return true;
    } catch {
      // Permission denied or subscription failed — reflect the (possibly changed) permission.
      this.permission.set('Notification' in globalThis ? Notification.permission : 'denied');

      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Unsubscribe this device and tell the backend to drop it. */
  async disable(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      if (sub) {
        await this.api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
        await this.swPush.unsubscribe().catch(() => undefined);
      }
      this.enabled.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async toggle(): Promise<void> {
    await (this.enabled() ? this.disable() : this.enable());
  }
}
