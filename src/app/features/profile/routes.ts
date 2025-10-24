import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// Guard to protect profile routes
const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/auth/login']);
    return false;
  }
  return true;
};

export const profileRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./profile.component').then(c => c.ProfileComponent),
    canActivate: [authGuard]
  }
];