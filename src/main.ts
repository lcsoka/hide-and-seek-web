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
    // Distributed tracing: browserTracingIntegration instruments fetch/XHR + navigations and,
    // for URLs matching tracePropagationTargets, attaches `sentry-trace` + `baggage` headers so a
    // frontend request and the backend that handles it stitch into ONE trace across the two Sentry
    // projects. Scoped to our API origin so we never leak trace headers to third parties (tiles,
    // fonts). The backend already allows these headers via CORS; it must also run Sentry tracing.
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [/^https:\/\/api\.hideandseek\.hu\//],
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
