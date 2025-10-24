import { Injectable, signal } from '@angular/core';

export type LayoutType = 'main' | 'auth' | 'minimal';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {
  private currentLayout = signal<LayoutType>('main');

  getCurrentLayout() {
    return this.currentLayout();
  }

  setLayout(layout: LayoutType): void {
    this.currentLayout.set(layout);
  }

  // Convenience methods
  useMainLayout(): void {
    this.setLayout('main');
  }

  useAuthLayout(): void {
    this.setLayout('auth');
  }

  useMinimalLayout(): void {
    this.setLayout('minimal');
  }

  isMainLayout(): boolean {
    return this.currentLayout() === 'main';
  }

  isAuthLayout(): boolean {
    return this.currentLayout() === 'auth';
  }

  isMinimalLayout(): boolean {
    return this.currentLayout() === 'minimal';
  }
}