import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
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
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly busy = signal(false);
  readonly authOpen = signal(false);
  name = '';
  private synced = false;

  constructor() {
    if (!this.user()) {
      void this.auth.loadMe();
    }
    effect(() => {
      const u = this.user();
      if (u && !this.synced) {
        this.name = u.name;
        this.synced = true;
      }
    });
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
