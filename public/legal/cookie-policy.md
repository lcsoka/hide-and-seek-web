# Cookie & Local Storage Policy — Hide & Seek

_Last updated: [DATE]._

> **Template notice.** This is a good-faith draft based on how the Hide & Seek app actually stores
> data in the browser. It is **not legal advice** — have it reviewed and translated to Hungarian, and
> verify the list below against the deployed app before publishing.

This policy explains the cookies and browser storage that **Hide & Seek** (`hideandseek.hu`) uses.

## What we use

Hide & Seek is a single-page app that keeps you signed in with a token, not with tracking cookies.
We use only what is necessary for the app to work:

| Name / key | Type | Purpose | Retention |
|---|---|---|---|
| Auth token | `localStorage` | Keeps you signed in between visits (your bearer token). | Until you log out or delete your account |
| Language preference | `localStorage` | Remembers your chosen language (Hungarian/English). | Until cleared |
| Gameplay state | `localStorage` | Remembers your current player/game so a page refresh doesn't drop you mid-game. | Until the game ends or you clear it |

Sign-in uses a bearer token (not login cookies), so the app sets no tracking cookies of its own. We
do **not** use advertising cookies, third-party analytics, social-media trackers, or cross-site
tracking of any kind.

## Third-party requests

When the map is shown, your browser loads **map tiles** and makes **OpenStreetMap** queries from
external providers. These providers receive your IP address and the map area you view, and may set
their own cookies under their policies. See our [Privacy Policy](privacy-policy.md) §3.

## Managing storage

Because the items above are strictly necessary for the app to function (keeping you logged in), the
app works without a tracking-consent banner. You can still clear this data at any time:

- Log out to remove your auth token, or **delete your account** (Profile → Danger zone).
- Clear your browser's site data / cookies for `hideandseek.hu` in your browser settings.

Clearing the auth token will simply sign you out.

## Changes

We may update this policy; the current version always lives here with the date above.

## Contact

Questions: **[CONTACT EMAIL]**.
