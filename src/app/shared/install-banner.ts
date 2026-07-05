import { Component, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { InstallPrompt } from '../core/services/install-prompt';

/** Dismissible "add to home screen" banner. Native install on Chromium, manual hint on iOS. */
@Component({
  selector: 'app-install-banner',
  imports: [TranslocoModule],
  templateUrl: './install-banner.html',
})
export class InstallBanner {
  readonly prompt = inject(InstallPrompt);
}
