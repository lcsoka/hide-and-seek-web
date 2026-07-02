import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthStore } from '../../core/services/auth-store';

/** Bottom-sheet login / register form. Registering promotes the current guest in place. */
@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule, TranslocoModule],
  templateUrl: './auth-modal.html',
})
export class AuthModal {
  private readonly auth = inject(AuthStore);

  readonly open = input(false);
  readonly startMode = input<'login' | 'register'>('login');
  readonly closeChange = output<boolean>();
  readonly done = output<void>(); // emitted on a successful login/register

  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  email = '';
  password = '';
  name = '';

  constructor() {
    // Reset to the requested start mode each time the sheet is opened.
    effect(() => {
      if (this.open()) {
        this.mode.set(this.startMode());
        this.error.set(null);
        this.password = '';
      }
    });
  }

  toggle(): void {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
    this.error.set(null);
  }

  async submit(): Promise<void> {
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
      this.done.emit();
      this.close();
    } catch (e: unknown) {
      this.error.set(this.messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    this.error.set(null);
    this.password = '';
    this.closeChange.emit(false);
  }

  private messageOf(e: unknown): string {
    const body = (e as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    const firstFieldError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;

    return firstFieldError ?? body?.message ?? 'Something went wrong.';
  }
}
