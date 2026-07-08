import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ActiveSession } from '../../core/models';
import { TRANSIT_MODES } from '../../core/maps/overpass';
import { ApiClient } from '../../core/services/api-client';
import { AuthStore } from '../../core/services/auth-store';
import { PlayerStore } from '../../core/services/player-store';
import { TokenStore } from '../../core/services/token-store';
import { AppFooter } from '../../shared/app-footer';
import { InstallBanner } from '../../shared/install-banner';
import { LangToggle } from '../../shared/lang-toggle';
import { MapBackdrop } from '../../shared/map-backdrop';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink, TranslocoModule, LangToggle, MapBackdrop, AppFooter, InstallBanner, Icon],
  host: { class: 'block h-full' },
  templateUrl: './landing.html',
})
export class Landing {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly players = inject(PlayerStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  readonly auth = inject(AuthStore);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly createOpen = signal(false);
  readonly joinOpen = signal(false);
  // Still-live games the user can rejoin, and the "start a new one anyway?" confirmation.
  readonly activeSessions = signal<ActiveSession[]>([]);
  readonly confirmNew = signal(false);

  readonly cities = ['budapest', 'debrecen', 'szeged', 'miskolc', 'pecs', 'gyor', 'nyiregyhaza', 'kecskemet', 'szekesfehervar', 'szombathely'];
  readonly sizes = ['small', 'medium', 'large'];
  readonly allModes = TRANSIT_MODES;
  readonly modes = signal<string[]>(['metro', 'tram']);
  readonly steps = [{ key: 'hide', icon: 'hide' }, { key: 'ask', icon: 'ask' }, { key: 'catch', icon: 'seek' }];

  name = '';
  city = 'budapest';
  size = 'medium';
  units = 'metric';
  zoneRule = 'nearest';
  revealSeekers = false; // casual: show seeker positions to the hider (faithful = off)
  joinCode = '';

  constructor() {
    // Prefill the name from the signed-in profile: a registered user always plays under their
    // account name (the input is hidden for them); a returning guest gets their name pre-filled.
    effect(() => {
      const user = this.auth.user();
      if (user && (!user.is_guest || !this.name)) {
        this.name = user.name;
      }
    });
    void this.loadActiveSessions();

    // Arrived via a shareable invite link (/join/:code): pre-fill the code and open the join
    // sheet so the invitee only needs their name (if a guest) and one tap.
    const code = this.route.snapshot.paramMap.get('code');
    if (code) {
      this.joinCode = code.toUpperCase();
      this.joinOpen.set(true);
    }
  }

  /** Load the user's still-live games so they can rejoin one they left. */
  private async loadActiveSessions(): Promise<void> {
    if (!this.tokens.token()) {
      return;
    }
    try {
      this.activeSessions.set(await this.api.mySessions());
    } catch {
      // not signed in / offline — no resume list, that's fine
    }
  }

  /** Rejoin a game the user is already part of. */
  resume(s: ActiveSession): void {
    this.players.set(s.id, s.player_id);
    void this.router.navigate(['/s', s.id]);
  }

  /** Open the create sheet — but confirm first if the user already has a live game. */
  startGame(): void {
    if (this.activeSessions().length) {
      this.confirmNew.set(true);
    } else {
      this.createOpen.set(true);
    }
  }

  proceedNewGame(): void {
    this.confirmNew.set(false);
    this.createOpen.set(true);
  }

  /** Toggle a transit mode, but never let the last one be removed (need ≥1 to hide at). */
  toggleMode(id: string): void {
    this.modes.update((m) => (m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]));
  }

  /** Join codes are 6 uppercase alphanumerics (SessionFactory Str::random(6)); be lenient on length. */
  joinCodeValid(): boolean {
    return /^[A-Za-z0-9]{4,8}$/.test(this.joinCode.trim());
  }

  async create(): Promise<void> {
    if (!this.name.trim()) {
      return;
    }
    await this.run(async () => {
      await this.ensureToken();
      const session = await this.api.createSession({ city: this.city, game_size: this.size, display_name: this.name.trim(), config: { units: this.units, transit_modes: this.modes(), hiding_zone_rule: this.zoneRule, reveal_seekers_to_hider: this.revealSeekers } });
      if (session.host_player_id) {
        this.players.set(session.id, session.host_player_id);
      }
      await this.router.navigate(['/s', session.id]);
    }, this.transloco.translate('landing.createFailed'));
  }

  async join(): Promise<void> {
    if (!this.name.trim() || !this.joinCodeValid()) {
      return;
    }
    await this.run(async () => {
      await this.ensureToken();
      const { player, session } = await this.api.join(this.joinCode.trim().toUpperCase(), this.name.trim());
      this.players.set(session.id, player.id);
      await this.router.navigate(['/s', session.id]);
    }, this.transloco.translate('landing.joinFailed'));
  }

  private async ensureToken(): Promise<void> {
    if (!this.tokens.token()) {
      const auth = await this.api.guest(this.name || undefined);
      this.tokens.set(auth.token);
    }
  }

  private async run(fn: () => Promise<void>, fallback?: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e: any) {
      // A stored token can outlive the backend it was minted against (e.g. the dev DB was
      // reset), so the stale token 401s. Drop it, mint a fresh guest token, and retry once.
      if (e?.status === 401) {
        this.tokens.clear();
        try {
          await fn();

          return;
        } catch (retryError: any) {
          e = retryError;
        }
      }
      // Prefer the caller's friendly, localized fallback (e.g. "check the code") over the raw
      // backend message; fall back to a validation message or the generic error.
      this.error.set(fallback ?? e?.error?.message ?? this.transloco.translate('common.error'));
    } finally {
      this.busy.set(false);
    }
  }
}
