import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  { path: 's/:id', loadComponent: () => import('./features/session/session').then((m) => m.SessionView) },
  { path: 'dev', loadComponent: () => import('./features/dev/index').then((m) => m.DevIndex) },
  { path: 'dev/s/:id', loadComponent: () => import('./features/dev/cockpit').then((m) => m.DevCockpit) },
];
