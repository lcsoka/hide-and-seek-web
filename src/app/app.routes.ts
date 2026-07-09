import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  // Shareable invite link: opens the landing with the join sheet pre-filled with the code.
  { path: 'join/:code', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage) },
  { path: 'content', loadComponent: () => import('./features/content/my-content').then((m) => m.MyContentPage) },
  { path: 'auth', loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password').then((m) => m.ResetPasswordPage) },
  { path: 'legal/:doc', loadComponent: () => import('./features/legal/legal-page').then((m) => m.LegalPage) },
  { path: 's/:id', loadComponent: () => import('./features/session/session').then((m) => m.SessionView) },
  { path: 'map', loadComponent: () => import('./features/map/map-page').then((m) => m.MapPage) },
  // Isolated three.js proof-of-concept (see features/lab) — touches nothing else in the app.
  { path: 'lab', loadComponent: () => import('./features/lab/three-poc').then((m) => m.ThreePoc) },
  { path: 'dev', loadComponent: () => import('./features/dev/index').then((m) => m.DevIndex) },
  { path: 'dev/duo', loadComponent: () => import('./features/dev/duo').then((m) => m.DevDuo) },
  { path: 'dev/s/:id', loadComponent: () => import('./features/dev/cockpit').then((m) => m.DevCockpit) },
  { path: 'replay/s/:id', loadComponent: () => import('./features/replay/replay').then((m) => m.Replay) },
];
