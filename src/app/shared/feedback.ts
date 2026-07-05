import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiClient } from '../core/services/api-client';

/** A "Feedback" link that opens a small modal for players to send a bug report or suggestion. */
@Component({
  selector: 'app-feedback',
  imports: [FormsModule, TranslocoModule],
  templateUrl: './feedback.html',
})
export class Feedback {
  private readonly api = inject(ApiClient);

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal(false);

  type: 'suggestion' | 'bug' = 'suggestion';
  message = '';
  contact = '';

  show(): void {
    this.open.set(true);
    this.sent.set(false);
    this.error.set(false);
  }

  close(): void {
    this.open.set(false);
  }

  async send(): Promise<void> {
    if (!this.message.trim() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.sendFeedback({
        type: this.type,
        message: this.message.trim(),
        contact: this.contact.trim() || undefined,
        context: { url: location.pathname, ua: navigator.userAgent },
      });
      this.sent.set(true);
      this.message = '';
      this.contact = '';
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
