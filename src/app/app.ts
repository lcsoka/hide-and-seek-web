import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Language } from './core/services/language';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <router-outlet />
    </div>
  `,
})
export class App {
  constructor() {
    inject(Language).init(); // restore the saved language (Hungarian by default)
  }
}
