import { Component, effect, inject, input, output, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TransitRoutes } from '../../core/services/transit-routes';
import { GroupedLine } from '../../core/services/transit.model';
import { TransitService } from '../../core/services/transit.service';
import { BoardChoice } from './transit-picker.model';

/** Board flow: pick a nearby line (grouped by number + mode); tapping it draws its route on the map. */
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

  readonly lines = this.transit.lines;
  readonly busy = this.transit.busy;
  readonly mode = (id: string) => this.transitService.transitMeta(id);

  readonly selectedLine = signal<GroupedLine | null>(null);

  constructor() {
    // Load nearby lines once the sheet opens with a known location.
    effect(() => {
      if (this.open() && this.seekerLat() != null && this.seekerLng() != null && this.lines() === null) {
        void this.transit.loadLines(this.seekerLat()!, this.seekerLng()!, this.transitModes());
      }
    });
  }

  /** Tapping a line draws its path on the map behind the sheet and arms the Board button. */
  previewLine(line: GroupedLine): void {
    this.selectedLine.set(line);
    void this.transit.showLine(line);
  }

  confirmBoard(): void {
    const line = this.selectedLine();
    if (!line) {
      return;
    }
    // Board at the nearest stop serving this line; fall back to the seeker's own position.
    const stop = this.transit.boardStopFor(line);
    this.board.emit({
      stop_name: stop?.name ?? '',
      stop_lat: stop?.lat ?? this.seekerLat() ?? 0,
      stop_lng: stop?.lng ?? this.seekerLng() ?? 0,
      line: line.ref,
      mode: line.mode,
    });
    this.closeChange.emit(false);
    this.selectedLine.set(null);
    this.transit.reset();
  }

  close(): void {
    this.selectedLine.set(null);
    this.transit.reset();
    this.transit.clearDisplayed();
    this.closeChange.emit(false);
  }
}
