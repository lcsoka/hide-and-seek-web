import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Tracks backend maintenance mode. Laravel's `php artisan down` returns HTTP 503 for every request;
 * the maintenance interceptor flips `down` on a 503 and clears it on any successful response. While
 * down we poll a lightweight public endpoint so the app recovers on its own once the backend is back.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly http = inject(HttpClient);
  readonly down = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** The interceptor saw a 503 — the backend is under maintenance. */
  enter(): void {
    if (!this.down()) {
      this.down.set(true);
    }
    if (!this.timer) {
      this.timer = setInterval(() => this.check(), 10_000);
    }
  }

  /** The interceptor saw a successful response — the backend is up again. */
  recover(): void {
    if (this.down()) {
      this.down.set(false);
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Ping a public endpoint; the interceptor turns the result into enter()/recover(). */
  check(): void {
    this.http.get(`${environment.apiBase}/curses`).subscribe({ error: () => {} });
  }
}
