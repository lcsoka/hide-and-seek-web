import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { TokenStore } from '../services/token-store';

/**
 * Attaches the Sanctum bearer token AND the active language to API requests, so the backend
 * (SetLocale middleware) returns curse/question names + messages in the chosen language.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenStore).token();
  const lang = inject(TranslocoService).getActiveLang();
  const setHeaders: Record<string, string> = { 'Accept-Language': lang };
  if (token) {
    setHeaders['Authorization'] = `Bearer ${token}`;
  }

  return next(req.clone({ setHeaders }));
};
