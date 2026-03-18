import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';

function getAuthToken(): string | null {
  try {
    return (
      localStorage.getItem('vs_auth_token') ||
      localStorage.getItem('vs_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token')
    );
  } catch {
    return null;
  }
}

export const authGuard: CanMatchFn = (): boolean | UrlTree => {
  const router = inject(Router);
  const token = getAuthToken();
  if (token && String(token).trim()) return true;
  return router.parseUrl('/login');
};

