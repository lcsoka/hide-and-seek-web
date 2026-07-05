# Hide & Seek — Web

The web client for **Hide & Seek**, a real-time, location-based hide-and-seek game played across
Hungarian cities (inspired by Jet Lag: The Game). One seeker team chases a hider around a city,
narrowing down their location with radar/thermometer/matching questions while the hider slows them
down with curses.

This is a thin, presentational client: the [backend](https://github.com/lcsoka/hide-and-seek-backend)
is authoritative for all rules and state, and this app renders it, sends player actions, and reacts
to real-time events. Built with **Angular 22**, **Tailwind CSS v4**, **Leaflet** + **turf.js** and
**Laravel Echo**.

**Live:** play at **[hideandseek.hu](https://hideandseek.hu)** (talks to the API at `api.hideandseek.hu`).

> The backend lives in a separate repository: **[hide-and-seek-backend](https://github.com/lcsoka/hide-and-seek-backend)**.

---

## Highlights

- **Join & lobby** — create or join a game by code, pick a display name and avatar, ready up.
- **Roles & onboarding** — role intros and objectives for hider vs. seeker; faithful visibility (the
  hider can't see seekers).
- **Deduction map** — Leaflet map with live radar/thermometer previews and a running deduction area
  that carves down the play region as questions are answered (turf.js geometry).
- **Questions & curses** — ask geo questions, play curses, roll dice, complete challenges.
- **Transit** — board/alight journeys with a seeker journey log.
- **Real-time** — live positions, questions, curses and state changes over WebSockets (Laravel
  Echo + Pusher protocol), with reconnection and backgrounding handling.
- **Mobile-first HUD** — bottom sheets and FAB controls that keep the map visible.
- **Hungarian-first localization** — Transloco with `hu` as the default and `en` as the fallback.
- **Developer cockpit** — a debug mode for GPS spoofing, state inspection and action injection while
  building against the backend contract.

## Tech stack

| | |
|---|---|
| Framework | Angular 22 (standalone, signals) |
| Styling | Tailwind CSS v4 |
| Maps / geometry | Leaflet, `@turf/turf`, `osmtogeojson` |
| Realtime | `laravel-echo` + `pusher-js` (Reverb) |
| i18n | `@jsverse/transloco` (Hungarian-first) |
| Unit tests | Vitest |
| E2E tests | Playwright |

## Requirements

- Node.js **20+** and npm
- A running **[hide-and-seek-backend](https://github.com/lcsoka/hide-and-seek-backend)** instance (REST + Reverb WebSockets)

## Getting started

```bash
git clone git@github.com:lcsoka/hide-and-seek-web.git
cd hide-and-seek-web
npm install

# Start the dev server
npm start          # ng serve → http://localhost:4200
```

### Pointing at the backend

The dev build reads its configuration from `src/environments/environment.development.ts`. Defaults
assume the backend runs at `http://hide-and-seek.test` (Laravel Herd) with Reverb on `localhost:8080`:

```ts
export const environment = {
  apiBase: 'http://hide-and-seek.test/api',
  reverb: { key: '…', host: 'localhost', port: 8080, scheme: 'ws' },
  // developerToken: '…'  // for the developer cockpit
};
```

Adjust these to match your backend's `.env` (`APP_URL`, `REVERB_*`).

## Building

```bash
npm run build      # production build → dist/
```

## Testing

```bash
npm test           # Vitest unit tests
npm run e2e        # Playwright end-to-end tests
```

## Project layout

```
src/app/
  core/          Services (API client, realtime, location), map/Overpass helpers
  features/
    landing/     Create / join a game
    auth/        Guest + account auth UI
    session/     In-game shell, HUD, drawers, pickers
    map/         Deduction map + player markers
    replay/      In-app replay view
    profile/     Player profile
    content/     User-generated curses / questions
    dev/         Developer cockpit (GPS spoofing, inspector, action injector)
  shared/        Reusable UI components
  transloco-loader.ts
src/environments/  Per-environment config (API base, Reverb keys)
```

## License

Private project. All rights reserved unless noted otherwise.
