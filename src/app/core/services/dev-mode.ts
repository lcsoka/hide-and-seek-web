import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const KEY = 'jl_dev_token';

/**
 * Resolves the developer/debug token WITHOUT baking it into the public production bundle. An
 * operator turns dev mode on for THEIR browser only by opening any page with `?dev=<token>` (the
 * token is persisted to localStorage; `?dev=` with no value clears it). Everyone else has no token,
 * so `enabled` is false and the game behaves normally — crucial, because dev mode also suppresses
 * the real GPS loop. In local dev the token still comes from environment.development.ts.
 */
@Injectable({ providedIn: 'root' })
export class DevMode {
  readonly token: string;

  constructor() {
    const fromUrl = new URLSearchParams(location.search).get('dev');
    if (fromUrl !== null) {
      fromUrl ? localStorage.setItem(KEY, fromUrl) : localStorage.removeItem(KEY);
    }
    this.token = localStorage.getItem(KEY) || environment.developerToken || '';
  }

  get enabled(): boolean {
    return this.token !== '';
  }
}
