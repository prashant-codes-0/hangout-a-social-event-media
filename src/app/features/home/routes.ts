import { Routes } from '@angular/router';

export const homeRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./homepage/homepage.component').then(c => c.HomepageComponent)
  }
];