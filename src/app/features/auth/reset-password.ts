import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthStore } from '../../core/services/auth-store';

/** The page the emailed reset link opens (/reset-password?token=…&email=…). */
@Component({
  selector: 'app-reset-password',
  host: { class: 'block min-h-[100dvh] bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white' },
  imports: [FormsModule, RouterLink, TranslocoModule],
  templateUrl: './reset-password.html',
})
export class ResetPasswordPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStore);

  readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  readonly email = this.route.snapshot.queryParamMap.get('email') ?? '';
  readonly valid = !!this.token && !!this.email;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal(false);
  password = '';

  async submit(): Promise<void> {
    if (this.password.length < 8 || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.resetPassword(this.token, this.email, this.password);
      this.done.set(true);
    } catch (e: unknown) {
      const body = (e as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
      this.error.set(body?.errors?.['email']?.[0] ?? body?.message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
