import { computed, inject, Injectable, signal } from '@angular/core';
import { Profile } from '../models';
import { ApiClient } from './api-client';
import { TokenStore } from './token-store';

/**
 * The signed-in identity. Everyone starts as a guest (a throwaway User + token); registering
 * promotes that same user in place, so history is preserved. Loads /me on start when a token
 * already exists.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);

  readonly user = signal<Profile | null>(null);
  readonly isRegistered = computed(() => !!this.user() && !this.user()!.is_guest);

  constructor() {
    if (this.tokens.token()) {
      void this.loadMe();
    }
  }

  async loadMe(): Promise<void> {
    if (!this.tokens.token()) {
      this.user.set(null);

      return;
    }
    try {
      this.user.set(await this.api.me());
    } catch (e: unknown) {
      // A stale/invalid token (e.g. its guest was pruned, or it was revoked): drop it so the
      // next guest/register flow mints a fresh one instead of reusing a dead token.
      if (this.isUnauthorized(e)) {
        this.tokens.clear();
      }
      this.user.set(null);
    }
  }

  /** Register the current guest (minting one first if the visitor hasn't played yet). */
  async register(email: string, password: string, name?: string): Promise<Profile> {
    await this.ensureGuestToken();
    const body = { email, password, name: name || undefined };

    let profile: Profile;
    try {
      profile = await this.api.register(body);
    } catch (e: unknown) {
      if (!this.isUnauthorized(e)) {
        throw e;
      }
      // The stored token was stale — mint a fresh guest and promote that one instead.
      this.tokens.clear();
      await this.ensureGuestToken();
      profile = await this.api.register(body);
    }
    this.user.set(profile);

    return profile;
  }

  async login(email: string, password: string): Promise<Profile> {
    const res = await this.api.login(email, password);
    this.tokens.set(res.token);
    this.user.set(res);

    return res;
  }

  forgotPassword(email: string): Promise<{ message: string }> {
    return this.api.forgotPassword(email);
  }

  resetPassword(token: string, email: string, password: string): Promise<{ message: string }> {
    return this.api.resetPassword({ token, email, password });
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } catch {
      // token already gone — clear locally regardless
    }
    this.tokens.clear();
    this.user.set(null);
  }

  async updateName(name: string): Promise<void> {
    this.user.set(await this.api.updateProfile({ name }));
  }

  /** Permanently delete the account (GDPR). Only clears local auth once the server confirms. */
  async deleteAccount(password?: string): Promise<void> {
    await this.api.deleteAccount(password);
    this.tokens.clear();
    this.user.set(null);
  }

  async uploadAvatar(file: File): Promise<void> {
    this.user.set(await this.api.uploadAvatar(file));
  }

  private async ensureGuestToken(): Promise<void> {
    if (!this.tokens.token()) {
      const auth = await this.api.guest();
      this.tokens.set(auth.token);
    }
  }

  private isUnauthorized(e: unknown): boolean {
    return (e as { status?: number })?.status === 401;
  }
}
