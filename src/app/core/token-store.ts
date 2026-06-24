import { Injectable, signal } from '@angular/core';

const KEY = 'jl_token';

@Injectable({ providedIn: 'root' })
export class TokenStore {
  readonly token = signal<string | null>(localStorage.getItem(KEY));

  set(token: string): void {
    localStorage.setItem(KEY, token);
    this.token.set(token);
  }

  clear(): void {
    localStorage.removeItem(KEY);
    this.token.set(null);
  }
}
