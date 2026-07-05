import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// Error monitoring — only active when a DSN is configured (empty in dev, set in production).
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    sendDefaultPii: false, // GDPR: don't attach IPs / request bodies
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      // Expected client-side HTTP errors (validation, auth, rate limits) are handled in the UI —
      // don't report them as crashes. Server errors (5xx) and real JS errors still flow through.
      const err = hint?.originalException as { name?: string; status?: number } | undefined;
      if (err?.name === 'HttpErrorResponse' && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
        return null;
      }

      return event;
    },
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
