import { Component, effect, inject, input, output, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { RouteLine } from '../../core/maps/overpass.model';
import { TransitRoutes } from '../../core/services/transit-routes';
import { TransitStop } from '../../core/services/transit.model';
import { TransitService } from '../../core/services/transit.service';
import { BoardChoice } from './transit-picker.model';

/** Board flow: pick the nearest stop, then a line; tapping a line draws its route on the map. */
@Component({
  selector: 'app-transit-picker',
  imports: [TranslocoModule],
  templateUrl: './transit-picker.html',
})
export class TransitPicker {
  private readonly transit = inject(TransitRoutes);
  private readonly transitService = inject(TransitService);

  readonly open = input(false);
  readonly seekerLat = input<number | null>(null);
  readonly seekerLng = input<number | null>(null);
  readonly transitModes = input<string[] | undefined>(undefined);
  readonly board = output<BoardChoice>();
  readonly closeChange = output<boolean>();

  readonly stops = this.transit.stops;
  readonly routes = this.transit.routes;
  readonly busy = this.transit.busy;
  readonly mode = (id: string) => this.transitService.transitMeta(id);

  readonly selectedStop = signal<TransitStop | null>(null);
  readonly selectedLine = signal<RouteLine | null>(null);

  constructor() {
    // Load nearby stops once the sheet opens with a known location.
    effect(() => {
      if (this.open() && this.seekerLat() != null && this.seekerLng() != null && this.stops() === null) {
        void this.transit.loadStops(this.seekerLat()!, this.seekerLng()!, this.transitModes());
      }
    });
  }

  pickStop(stop: TransitStop): void {
    this.selectedStop.set(stop);
    this.selectedLine.set(null);
    this.transit.clearDisplayed();
    void this.transit.loadRoutes(stop, this.transitModes());
  }

  /** Tapping a line draws its path on the map behind the sheet and arms the Board button. */
  previewLine(line: RouteLine): void {
    this.selectedLine.set(line);
    void this.transit.showRoute(line);
  }

  confirmBoard(): void {
    const stop = this.selectedStop();
    const line = this.selectedLine();
    if (!stop || !line) {
      return;
    }
    this.board.emit({ stop_name: stop.name, stop_lat: stop.lat, stop_lng: stop.lng, line: line.ref, mode: line.mode });
    this.closeChange.emit(false);
    this.selectedStop.set(null);
    this.selectedLine.set(null);
    this.transit.reset();
  }

  back(): void {
    this.selectedStop.set(null);
    this.selectedLine.set(null);
    this.transit.clearDisplayed();
  }

  close(): void {
    this.selectedStop.set(null);
    this.selectedLine.set(null);
    this.transit.reset();
    this.transit.clearDisplayed();
    this.closeChange.emit(false);
  }
}
