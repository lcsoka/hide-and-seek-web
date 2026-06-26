import { Injectable, signal } from '@angular/core';

const KEY = 'jl_token';

/**
 * Holds the Sanctum bearer token. Normally persisted in localStorage, but a `?token=`
 * URL param overrides it in-memory for this app instance only (never written to
 * localStorage). That lets several windows/iframes of the SAME browser each act as a
 * different player — used by the dev "duo" view to watch two clients play together.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly urlToken = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('token');
  readonly token = signal<string | null>(this.urlToken ?? localStorage.getItem(KEY));

  set(token: string): void {
    if (!this.urlToken) {
      localStorage.setItem(KEY, token);
    }
    this.token.set(token);
  }

  clear(): void {
    if (!this.urlToken) {
      localStorage.removeItem(KEY);
    }
    this.token.set(null);
  }
}
