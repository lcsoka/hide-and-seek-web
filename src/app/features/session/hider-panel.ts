import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { GameState } from '../../core/models/models';
import { ApiClient } from '../../core/services/api-client';
import { HidingState } from '../../core/services/hiding-state';
import { SessionStore } from '../../core/services/session-store';
import { transitMeta } from '../../core/util/transit';

/** Smart hiding: auto-find the nearest station (shared with the map) and confirm in one tap. */
@Component({
  selector: 'app-hider-panel',
  templateUrl: './hider-panel.html',
})
export class HiderPanel {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);
  readonly hiding = inject(HidingState);

  readonly state = input.required<GameState>();
  readonly sessionId = input.required<string>();
  readonly meId = input<string | null>(null);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly mode = transitMeta;

  readonly stations = this.hiding.stations;
  readonly selected = this.hiding.selected;
  readonly me = computed(() => this.state().players.find((p) => p.id === this.meId()));
  readonly hasLocation = computed(() => this.me()?.lat != null && this.me()?.lng != null);
  readonly others = computed(() => this.stations()?.filter((s) => s !== this.selected()) ?? []);

  constructor() {
    effect(() => {
      const m = this.me();
      const modes = this.state().config?.['transit_modes'] as string[] | undefined;
      if (m?.lat != null && m?.lng != null) {
        void this.hiding.loadFor(m.lat, m.lng, modes);
      }
    });
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
