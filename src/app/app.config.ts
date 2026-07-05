import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import * as Sentry from '@sentry/angular';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { maintenanceInterceptor } from './core/interceptors/maintenance.interceptor';
import { BrowserLocationSource } from './core/services/browser-location-source';
import { LOCATION_SOURCE } from './core/services/location-source';
import { TranslocoHttpLoader } from './transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Report uncaught errors to Sentry (no-op until a DSN is configured — see main.ts).
    ...(environment.sentryDsn ? [{ provide: ErrorHandler, useValue: Sentry.createErrorHandler() }] : []),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, maintenanceInterceptor])),
    { provide: LOCATION_SOURCE, useClass: BrowserLocationSource },
    // Hungarian-first UI; English is the fallback for any missing key. Runtime switchable.
    provideTransloco({
      config: {
        availableLangs: ['hu', 'en'],
        defaultLang: 'hu',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        missingHandler: { useFallbackTranslation: true },
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
