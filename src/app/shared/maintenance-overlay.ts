import { Component, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { MaintenanceService } from '../core/services/maintenance';
import { Icon } from './icon';

/** Full-screen blocker shown while the backend is in maintenance mode (HTTP 503). */
@Component({
  selector: 'app-maintenance-overlay',
  imports: [TranslocoModule, Icon],
  templateUrl: './maintenance-overlay.html',
})
export class MaintenanceOverlay {
  readonly maintenance = inject(MaintenanceService);
}
