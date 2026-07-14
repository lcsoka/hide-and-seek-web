import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { GameState } from '../../core/models';
import { ApiClient } from '../../core/services/api-client';
import { HidingState } from '../../core/services/hiding-state';
import { SessionStore } from '../../core/services/session-store';
import { TransitService } from '../../core/services/transit.service';
import { Icon } from '../../shared/icon';

/** Smart hiding: auto-find the nearest station (shared with the map) and confirm in one tap. */
@Component({
  selector: 'app-hider-panel',
  imports: [TranslocoModule, Icon],
  templateUrl: './hider-panel.html',
})
export class HiderPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  private readonly transitService = inject(TransitService);
  readonly hiding = inject(HidingState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly meId = input<string | null>(null);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  // The hider taps "I arrived" once they're at their hiding spot — only THEN do we search for
  // nearby stops. Without this, every step during the walk re-queried Overpass needlessly.
  readonly arrived = signal(false);
  readonly mode = (id: string) => this.transitService.transitMeta(id);

  readonly stations = this.hiding.stations;
  readonly selected = this.hiding.selected;
  readonly calculating = this.hiding.calculating;
  readonly me = computed(() => this.state().players.find((p) => p.id === this.meId()));
  readonly hasLocation = computed(() => this.me()?.lat != null && this.me()?.lng != null);
  readonly others = computed(() => this.stations()?.filter((s) => s !== this.selected()) ?? []);

  private lastRound = -1;

  constructor() {
    // A fresh hiding phase (new round) resets the arrival — the hider must confirm again where they are.
    effect(() => {
      const round = Number(this.state().round ?? 0);
      if (round !== this.lastRound) {
        this.lastRound = round;
        this.arrived.set(false);
        this.hiding.reset();
      }
    });
  }

  /** The hider is at their hiding spot: search for nearby stops ONCE, from the current position. */
  arrive(): void {
    const m = this.me();
    if (m?.lat == null || m?.lng == null) {
      return;
    }
    this.arrived.set(true);
    const modes = this.state().config?.['transit_modes'] as string[] | undefined;
    const radiusM = Number(this.state().config?.['hiding_zone_radius_m'] ?? 400) || 400;
    void this.hiding.loadFor(m.lat, m.lng, modes, radiusM);
  }

  /** Tapped "I arrived" too early — go back to moving (and drop the stops we found). */
  goBack(): void {
    this.arrived.set(false);
    this.hiding.reset();
  }

  async hideHere(): Promise<void> {
    const station = this.selected();
    if (!station) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.submitAction(this.sessionId(), 'choose_station', { lat: station.lat, lng: station.lng });
      await this.api.submitAction(this.sessionId(), 'confirm_hidden', {});
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Could not confirm — make sure you are at the station.');
    } finally {
      this.busy.set(false);
      this.store.refresh();
    }
  }
}
