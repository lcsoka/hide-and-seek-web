import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ProfileStats } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { AuthStore } from '../../core/services/auth-store';
import { AuthModal } from '../auth/auth-modal';

/** Account screen: display name, email, avatar; register (if guest), or log out. */
@Component({
  selector: 'app-profile',
  host: { class: 'block min-h-[100dvh] bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white' },
  imports: [RouterLink, FormsModule, TranslocoModule, AuthModal],
  templateUrl: './profile.html',
})
export class ProfilePage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly stats = signal<ProfileStats | null>(null);
  readonly busy = signal(false);
  readonly authOpen = signal(false);
  name = '';
  private synced = false;

  constructor() {
    if (!this.user()) {
      void this.auth.loadMe();
    }
    void this.loadStats();
    effect(() => {
      const u = this.user();
      if (u && !this.synced) {
        this.name = u.name;
        this.synced = true;
      }
    });
  }

  private async loadStats(): Promise<void> {
    try {
      this.stats.set(await this.api.profileStats());
    } catch {
      // not signed in / offline — leave stats null
    }
  }

  /** Seconds → "1h 23m" for long totals, "3:05" for short times. */
  fmtDuration(s: number): string {
    if (s <= 0) {
      return '0:00';
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    return h > 0 ? `${h}h ${m}m` : `${m}:${sec.toString().padStart(2, '0')}`;
  }

  async saveName(): Promise<void> {
    if (!this.name.trim() || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.updateName(this.name.trim());
    } finally {
      this.busy.set(false);
    }
  }

  onAvatarPicked(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    this.busy.set(true);
    void this.auth.uploadAvatar(file).finally(() => this.busy.set(false));
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/']);
  }
}
