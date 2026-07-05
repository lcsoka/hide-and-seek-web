import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { MaintenanceService } from '../services/maintenance';

/** Detects Laravel maintenance mode: a 503 shows the maintenance screen; any success clears it. */
export const maintenanceInterceptor: HttpInterceptorFn = (req, next) => {
  const maintenance = inject(MaintenanceService);

  return next(req).pipe(
    tap((event: HttpEvent<unknown>) => {
      if (event instanceof HttpResponse) {
        maintenance.recover();
      }
    }),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 503) {
        maintenance.enter();
      }

      return throwError(() => err);
    }),
  );
};
