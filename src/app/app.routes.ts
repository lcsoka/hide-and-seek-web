import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  { path: 's/:id', loadComponent: () => import('./features/session/session').then((m) => m.SessionView) },
];
