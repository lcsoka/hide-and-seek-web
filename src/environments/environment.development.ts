export const environment = {
  production: false,
  apiBase: 'http://hide-and-seek.test/api/v1',
  reverb: { key: '4htb5glvhto3zeaif1is', host: 'localhost', port: 8080, scheme: 'ws' },
  // Matches GAME_DEBUG_TOKEN in the backend .env — used by the /dev cockpit.
  developerToken: 'local-dev-token',
  // Sentry stays off in local dev.
  sentryDsn: '',
};
