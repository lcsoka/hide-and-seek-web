import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevMode } from './core/services/dev-mode';
import { InstallPrompt } from './core/services/install-prompt';
import { Language } from './core/services/language';
import { Seo } from './core/services/seo';
import { MaintenanceOverlay } from './shared/maintenance-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MaintenanceOverlay],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <router-outlet />
    </div>
    <app-maintenance-overlay />
  `,
})
export class App {
  constructor() {
    inject(Language).init(); // restore the saved language (Hungarian by default)
    inject(Seo).init(); // keep <title> + meta tags in sync with the route and language
    inject(InstallPrompt).init(); // capture the "add to home screen" opportunity early
    inject(DevMode); // resolve the ?dev=<token> opt-in from the entry URL before navigation
  }
}
