import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdate } from './core/services/app-update';
import { DevMode } from './core/services/dev-mode';
import { InstallPrompt } from './core/services/install-prompt';
import { Language } from './core/services/language';
import { Seo } from './core/services/seo';
import { MaintenanceOverlay } from './shared/maintenance-overlay';
import { UpdateToast } from './shared/update-toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MaintenanceOverlay, UpdateToast],
  template: `
    <!-- Base fill layer: a plain fixed element paints the WHOLE viewport incl. the safe areas
         (iOS can skip painting a scroll container's background into the home-indicator band, which
         left a strip there). The scroll container above it is transparent; pages supply their bg. -->
    <div class="fixed inset-0 bg-gray-50 dark:bg-gray-950"></div>
    <div class="fixed inset-0 overflow-y-auto overscroll-contain text-gray-900 dark:text-gray-100">
      <router-outlet />
    </div>
    <app-maintenance-overlay />
    <app-update-toast />
  `,
})
export class App {
  constructor() {
    inject(Language).init(); // restore the saved language (Hungarian by default)
    inject(Seo).init(); // keep <title> + meta tags in sync with the route and language
    inject(InstallPrompt).init(); // capture the "add to home screen" opportunity early
    inject(DevMode); // resolve the ?dev=<token> opt-in from the entry URL before navigation
    inject(AppUpdate).init(); // watch for a newer deployed build → offer a Refresh
  }
}
