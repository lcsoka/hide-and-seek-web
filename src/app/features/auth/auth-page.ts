import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthStore } from '../../core/services/auth-store';
import { LangToggle } from '../../shared/lang-toggle';
import { MapBackdrop } from '../../shared/map-backdrop';

type Mode = 'login' | 'register' | 'forgot';

/**
 * Full-screen login / sign-up page over the living-map backdrop. A segmented control slides between
 * "Log in" and "Sign up"; a "Forgot password?" sub-flow reuses the same card. Registering promotes
 * the current guest in place. Reads `?mode=register` to preselect the tab and `?redirect=` for where
 * to land after success (defaults to the landing).
 */
@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, TranslocoModule, LangToggle, MapBackdrop],
  host: { class: 'block h-full' },
  templateUrl: './auth-page.html',
})
export class AuthPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<Mode>('login');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly sent = signal(false); // "check your email" after a forgot-password request

  email = '';
  password = '';
  name = '';

  private readonly redirect = this.route.snapshot.queryParamMap.get('redirect') || '/';

  constructor() {
    if (this.route.snapshot.queryParamMap.get('mode') === 'register') {
      this.mode.set('register');
    }
    // Already (or newly) signed in → leave the auth page. Covers both landing here with a live
    // session and a successful login/register (which flips isRegistered → true).
    effect(() => {
      if (this.auth.isRegistered()) {
        void this.router.navigateByUrl(this.redirect);
      }
    });
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.sent.set(false);
    this.password = '';
  }

  async submit(): Promise<void> {
    if (this.mode() === 'forgot') {
      await this.sendReset();

      return;
    }
    if (!this.email.trim() || this.password.length < (this.mode() === 'register' ? 8 : 1)) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'register') {
        await this.auth.register(this.email.trim(), this.password, this.name.trim());
      } else {
        await this.auth.login(this.email.trim(), this.password);
      }
      // Navigation happens via the isRegistered effect once the profile lands.
    } catch (e: unknown) {
      this.error.set(this.messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async sendReset(): Promise<void> {
    if (!this.email.trim()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.forgotPassword(this.email.trim());
      this.sent.set(true); // always succeeds (server doesn't reveal whether the email exists)
    } catch (e: unknown) {
      this.error.set(this.messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  private messageOf(e: unknown): string {
    const body = (e as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    const firstFieldError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;

    return firstFieldError ?? body?.message ?? 'Something went wrong.';
  }
}
