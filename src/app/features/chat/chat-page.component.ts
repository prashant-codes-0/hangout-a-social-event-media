import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ChatComponent } from './chat.component';
import { HangoutService } from '../hangouts/hangout.service';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, RouterModule, ChatComponent],
  template: `
    <div class="container mx-auto px-4 py-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-4">
          <button class="btn btn-ghost" (click)="goBack()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Hangout
          </button>
          <div>
            <h1 class="text-2xl font-bold">Hangout Chat</h1>
            @if (hangoutTitle) {
              <p class="text-base-content/70">{{ hangoutTitle }}</p>
            }
          </div>
        </div>
      </div>

      <!-- Full Screen Chat -->
      @if (hangoutId) {
        <div class="max-w-4xl mx-auto">
          <div class="h-[70vh]">
            <app-chat [hangoutId]="hangoutId" class="h-full"></app-chat>
          </div>
        </div>
      } @else {
        <div class="text-center py-12">
          <div class="text-6xl mb-4">💬</div>
          <h3 class="text-xl font-bold mb-2">Chat not available</h3>
          <p class="text-base-content/70 mb-6">Unable to load the hangout chat.</p>
          <a routerLink="/hangouts" class="btn btn-primary">Browse Hangouts</a>
        </div>
      }
    </div>
  `,
  styles: [`
    app-chat {
      display: block;
      height: 100%;
    }
    
    app-chat ::ng-deep .chat-container {
      height: 100%;
      max-height: none;
    }
  `]
})
export class ChatPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private hangoutService = inject(HangoutService);
  private authService = inject(AuthService);

  hangoutId: string | null = null;
  hangoutTitle: string = '';

  ngOnInit() {
    this.hangoutId = this.route.snapshot.paramMap.get('id');
    
    if (this.hangoutId) {
      this.loadHangoutInfo();
    }
  }

  loadHangoutInfo() {
    if (!this.hangoutId) return;

    this.hangoutService.getHangoutById(this.hangoutId).subscribe({
      next: (response) => {
        if (response.success) {
          this.hangoutTitle = response.data.title;
        }
      },
      error: (err) => {
        console.error('Failed to load hangout info:', err);
      }
    });
  }

  goBack() {
    if (this.hangoutId) {
      this.router.navigate(['/hangouts/details', this.hangoutId]);
    } else {
      this.router.navigate(['/hangouts']);
    }
  }
}