import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// Guard to protect authenticated routes
const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/auth/login']);
    return false;
  }
  return true;
};

export const hangoutRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/hangout-list.component').then(c => c.HangoutListComponent)
  },
  {
    path: 'details/:id',
    loadComponent: () => import('./details/hangout-details.component').then(c => c.HangoutDetailsComponent)
  },
  {
    path: 'create',
    loadComponent: () => import('./create/create-hangout.component').then(c => c.CreateHangoutComponent),
    canActivate: [authGuard]
  },
  {
    path: 'my-hangouts',
    loadComponent: () => import('./list/hangout-list.component').then(c => c.HangoutListComponent),
    canActivate: [authGuard],
    data: { filter: 'my-hangouts' }
  },
  {
    path: 'joined-hangouts',
    loadComponent: () => import('./list/hangout-list.component').then(c => c.HangoutListComponent),
    canActivate: [authGuard],
    data: { filter: 'joined' }
  },
  {
    path: 'manage',
    loadComponent: () => import('./manage-hangout/manage-hangout.component').then(c => c.ManageHangoutComponent),
    canActivate: [authGuard]
  }
];