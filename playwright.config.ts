import { defineConfig } from '@playwright/test';

/**
 * End-to-end multiplayer tests: several independent browser contexts (= real separate
 * players) drive the live UI against the running backend, asserting realtime sync.
 *
 * Requires the backend stack up: Herd (http://hide-and-seek.test) + `php artisan
 * reverb:start` + `php artisan queue:work` (realtime is queued — without the worker the
 * UI only catches up via the slow /state poll). The Angular dev server on :4321 is
 * started automatically (or reused).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 }, // realtime is ~instant with Reverb; this also covers the poll fallback
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4321',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start -- --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
