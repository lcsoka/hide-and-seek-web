export const environment = {
  production: true,
  apiBase: 'https://api.hideandseek.hu/api/v1',
  reverb: {
    key: '955b8a241a4607be152eed07d17fdc722d7f4c78',
    host: 'api.hideandseek.hu',
    port: 443,
    scheme: 'wss',
  },
  // Developer cockpit token — empty in production so the cockpit stays inert there.
  developerToken: '',
  // Sentry error monitoring — paste your project's (public) DSN to enable. Empty = disabled.
  sentryDsn: '',
};
