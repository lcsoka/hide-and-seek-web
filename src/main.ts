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
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
