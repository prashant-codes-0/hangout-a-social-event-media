import { Routes } from '@angular/router';

export const routes: Routes = [
  { 
    path: '', 
    loadChildren: () => import('./features/home/routes').then(m => m.homeRoutes)
  },
  { 
    path: 'auth', 
    loadChildren: () => import('./features/auth/routes').then(m => m.authRoutes)
  },
  { 
    path: 'hangouts', 
    loadChildren: () => import('./features/hangouts/routes').then(m => m.hangoutRoutes)
  },
  { 
    path: 'profile', 
    loadChildren: () => import('./features/profile/routes').then(m => m.profileRoutes)
  },
  { 
    path: 'admin', 
    loadChildren: () => import('./features/admin/routes').then(m => m.adminRoutes)
  },
  { 
    path: 'sponsors', 
    loadChildren: () => import('./features/sponsors/routes').then(m => m.sponsorRoutes)
  },
  // Legacy redirects
  { path: 'login', redirectTo: 'auth/login' },
  { path: 'signup', redirectTo: 'auth/signup' },
  { path: 'settings', redirectTo: 'profile' },
  { path: '**', redirectTo: '' }
];
