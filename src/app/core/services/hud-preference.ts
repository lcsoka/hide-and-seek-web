import { Injectable, signal } from '@angular/core';

/**
 * Which in-game HUD to render: the stable classic one (default) or the new one under test.
 * Persisted per-device so a player can opt into the new HUD, and we can flip the default once
 * it's proven. Toggled from the "How to play" sheet.
 */
@Injectable({ providedIn: 'root' })
export class HudPreference {
  private readonly key = 'hs.hud.next';
  readonly useNext = signal(this.load());

  private load(): boolean {
    try {
      // Default = the new HUD (dogfooding); only an explicit opt-out ('0') falls back to classic.
      return localStorage.getItem(this.key) !== '0';
    } catch {
      return true;
    }
  }

  set(next: boolean): void {
    this.useNext.set(next);
    try {
      localStorage.setItem(this.key, next ? '1' : '0');
    } catch {
      // storage unavailable (private mode) — the in-memory signal still works for this session
    }
  }

  toggle(): void {
    this.set(!this.useNext());
  }
}
