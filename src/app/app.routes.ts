import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  { path: 's/:id', loadComponent: () => import('./features/session/session').then((m) => m.SessionView) },
  { path: 'map', loadComponent: () => import('./features/map/map-page').then((m) => m.MapPage) },
  { path: 'dev', loadComponent: () => import('./features/dev/index').then((m) => m.DevIndex) },
  { path: 'dev/duo', loadComponent: () => import('./features/dev/duo').then((m) => m.DevDuo) },
  { path: 'dev/s/:id', loadComponent: () => import('./features/dev/cockpit').then((m) => m.DevCockpit) },
  { path: 'replay/s/:id', loadComponent: () => import('./features/replay/replay').then((m) => m.Replay) },
];
