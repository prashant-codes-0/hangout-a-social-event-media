import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-sponsor-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mx-auto px-4 py-8">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold mb-2">Sponsor Dashboard</h1>
        <p class="text-base-content/70">Manage your sponsored hangouts and campaigns</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Sponsored Hangouts -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              My Sponsorships
            </h2>
            <p>View and manage your sponsored events</p>
            <div class="card-actions justify-end">
              <button class="btn btn-primary btn-sm">View All</button>
            </div>
          </div>
        </div>

        <!-- Create Sponsored Event -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Create Campaign
            </h2>
            <p>Launch a new sponsored hangout</p>
            <div class="card-actions justify-end">
              <button class="btn btn-primary btn-sm">Create</button>
            </div>
          </div>
        </div>

        <!-- Analytics -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Campaign Analytics
            </h2>
            <p>Track performance and engagement</p>
            <div class="card-actions justify-end">
              <button class="btn btn-primary btn-sm">View Stats</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sponsor Benefits -->
      <div class="mt-8">
        <h2 class="text-2xl font-bold mb-4">Sponsor Benefits</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-center gap-3 p-4 bg-base-200 rounded-lg">
            <div class="badge badge-primary">✓</div>
            <span>Priority placement in search results</span>
          </div>
          <div class="flex items-center gap-3 p-4 bg-base-200 rounded-lg">
            <div class="badge badge-primary">✓</div>
            <span>Sponsored badge on your events</span>
          </div>
          <div class="flex items-center gap-3 p-4 bg-base-200 rounded-lg">
            <div class="badge badge-primary">✓</div>
            <span>Detailed analytics and insights</span>
          </div>
          <div class="flex items-center gap-3 p-4 bg-base-200 rounded-lg">
            <div class="badge badge-primary">✓</div>
            <span>Custom branding options</span>
          </div>
        </div>
      </div>

      <!-- Coming Soon Notice -->
      <div class="alert alert-info mt-8">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Sponsor features are coming soon! This is a placeholder for the sponsor dashboard.</span>
      </div>
    </div>
  `,
  styles: [`
    .card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .card:hover {
      transform: translateY(-2px);
    }
    
    .btn:hover {
      transform: translateY(-1px);
    }
    
    .badge {
      font-size: 1rem;
      padding: 0.5rem;
    }
  `]
})
export class SponsorDashboardComponent {
  private authService = inject(AuthService);

  constructor() {
    // Verify sponsor access
    if (!this.authService.isSponsor()) {
      console.warn('Unauthorized access to sponsor dashboard');
    }
  }
}