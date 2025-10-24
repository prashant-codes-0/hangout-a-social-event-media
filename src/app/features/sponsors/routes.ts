import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// Guard to protect sponsor routes
const sponsorGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (!authService.isSponsor()) {
    router.navigate(['/']);
    return false;
  }

  return true;
};

export const sponsorRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./sponsor-dashboard.component').then(c => c.SponsorDashboardComponent),
    canActivate: [sponsorGuard]
  }
];