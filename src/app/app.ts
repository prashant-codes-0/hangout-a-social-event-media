import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MainLayoutComponent } from './shared/layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './shared/layouts/auth-layout/auth-layout.component';
import { LayoutService, LayoutType } from './shared/layouts/layout.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MainLayoutComponent, AuthLayoutComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private router = inject(Router);
  private layoutService = inject(LayoutService);

  protected readonly title = signal('Hangouts - Find Your Tribe');
  
  // Computed layout based on current route
  currentLayout = computed(() => {
    return this.layoutService.getCurrentLayout();
  });

  constructor() {
    // Set layout based on route
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.setLayoutForRoute(event.url);
      });

    // Set initial layout
    this.setLayoutForRoute(this.router.url);
  }

  private setLayoutForRoute(url: string): void {
    if (url.startsWith('/auth/')) {
      this.layoutService.useAuthLayout();
    } else {
      this.layoutService.useMainLayout();
    }
  }
}
