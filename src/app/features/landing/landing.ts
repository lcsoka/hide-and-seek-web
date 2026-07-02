import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import * as L from 'leaflet';
import { TRANSIT_MODES } from '../../core/maps/overpass';
import { ApiClient } from '../../core/services/api-client';
import { AuthStore } from '../../core/services/auth-store';
import { PlayerStore } from '../../core/services/player-store';
import { TokenStore } from '../../core/services/token-store';
import { AuthModal } from '../auth/auth-modal';
import { LangToggle } from '../../shared/lang-toggle';

@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink, TranslocoModule, LangToggle, AuthModal],
  templateUrl: './landing.html',
})
export class Landing {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(TokenStore);
  private readonly players = inject(PlayerStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthStore);
  readonly authOpen = signal(false);

  readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('mapEl');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly createOpen = signal(false);
  readonly joinOpen = signal(false);

  readonly cities = ['budapest', 'debrecen', 'szeged', 'miskolc', 'pecs', 'gyor', 'nyiregyhaza', 'kecskemet', 'szekesfehervar', 'szombathely'];
  readonly sizes = ['small', 'medium', 'large'];
  readonly allModes = TRANSIT_MODES;
  readonly modes = signal<string[]>(['metro', 'tram']);
  readonly steps = [{ key: 'hide', icon: '🙈' }, { key: 'ask', icon: '🔎' }, { key: 'catch', icon: '🎯' }];

  name = '';
  city = 'budapest';
  size = 'medium';
  units = 'metric';
  zoneRule = 'nearest';
  revealSeekers = false; // casual: show seeker positions to the hider (faithful = off)
  joinCode = '';

  constructor() {
    afterNextRender(() => this.initBackdrop());
  }

  /** A non-interactive Budapest map that slowly drifts between landmarks — the hero backdrop,
   *  with a hider (rose) + seeker (blue) marker pulsing to set the theme. Tiles follow the OS
   *  colour scheme (voyager when light, dark_all when dark) and swap live if the OS toggles. */
  private initBackdrop(): void {
    const spots: L.LatLngExpression[] = [
      [47.4979, 19.0402], [47.5003, 19.0836], [47.5106, 19.0567], [47.4874, 19.0700], [47.4813, 19.0561],
    ];
    const map = L.map(this.mapEl().nativeElement, {
      center: spots[0], zoom: 13, zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, inertia: false,
    });
    const tileUrl = (dark: boolean) =>
      dark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let tiles = L.tileLayer(tileUrl(scheme.matches), { subdomains: 'abcd', maxZoom: 18 }).addTo(map);
    const onSchemeChange = (e: MediaQueryListEvent) => {
      map.removeLayer(tiles);
      tiles = L.tileLayer(tileUrl(e.matches), { subdomains: 'abcd', maxZoom: 18 }).addTo(map);
    };
    scheme.addEventListener('change', onSchemeChange);
    const dot = (color: string) =>
      L.divIcon({ className: '', iconSize: [14, 14], html: `<div class="jl-pulse-dot" style="width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px rgba(2,6,23,.5)"></div>` });
    L.marker([47.5003, 19.0836], { icon: dot('#f43f5e'), interactive: false }).addTo(map);
    L.marker([47.4979, 19.0402], { icon: dot('#3b82f6'), interactive: false }).addTo(map);
    L.marker([47.5106, 19.0567], { icon: dot('#3b82f6'), interactive: false }).addTo(map);
    setTimeout(() => map.invalidateSize(), 200);

    let i = 0;
    const drift = setInterval(() => {
      i = (i + 1) % spots.length;
      map.flyTo(spots[i], 13, { duration: 7, easeLinearity: 0.25 });
    }, 9000);
    this.destroyRef.onDestroy(() => {
      clearInterval(drift);
      scheme.removeEventListener('change', onSchemeChange);
      map.remove();
    });
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
