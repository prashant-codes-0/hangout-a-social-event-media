import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HangoutService } from '../hangout.service';
import { AuthService } from '../../auth/auth.service';
import { Hangout } from '../hangout.model';

@Component({
  selector: 'app-hangout-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hangout-details.component.html',
  styleUrls: ['./hangout-details.component.css']
})
export class HangoutDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private hangoutService = inject(HangoutService);
  private authService = inject(AuthService);

  hangout = signal<Hangout | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  actionLoading = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadHangout(id);
    } else {
      this.router.navigate(['/hangouts']);
    }
  }

  loadHangout(id: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.hangoutService.getHangoutById(id).subscribe({
      next: (response) => {
        if (response.success) {
          this.hangout.set(response.data);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load hangout');
        this.loading.set(false);
      }
    });
  }

  joinHangout(): void {
    const hangout = this.hangout();
    if (!hangout || !this.authService.isAuthenticated()) {
      return;
    }

    this.actionLoading.set(true);
    this.hangoutService.joinHangout(hangout._id).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.hangout.set(response.data || hangout);
        }
        this.actionLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to join hangout');
        this.actionLoading.set(false);
      }
    });
  }

  leaveHangout(): void {
    const hangout = this.hangout();
    if (!hangout || !this.authService.isAuthenticated()) {
      return;
    }

    this.actionLoading.set(true);
    this.hangoutService.leaveHangout(hangout._id).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.hangout.set(response.data || hangout);
        }
        this.actionLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to leave hangout');
        this.actionLoading.set(false);
      }
    });
  }

  toggleBlast(): void {
    const hangout = this.hangout();
    if (!hangout || !this.authService.isAuthenticated()) {
      return;
    }

    this.hangoutService.toggleBlast(hangout._id).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.hangout.set(response.data || hangout);
        }
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to blast hangout');
      }
    });
  }

  deleteHangout(): void {
    const hangout = this.hangout();
    if (!hangout || !this.canEdit()) {
      return;
    }

    if (confirm('Are you sure you want to delete this hangout?')) {
      this.actionLoading.set(true);
      this.hangoutService.deleteHangout(hangout._id).subscribe({
        next: (response) => {
          if (response.success) {
            this.router.navigate(['/hangouts']);
          }
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to delete hangout');
          this.actionLoading.set(false);
        }
      });
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getTimeUntil(date: string): string {
    const now = new Date();
    const hangoutDate = new Date(date);
    const diffMs = hangoutDate.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Event has passed';
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} to go`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} to go`;
    if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} to go`;
    return 'Starting soon!';
  }

  canEdit(): boolean {
    const hangout = this.hangout();
    const currentUser = this.authService.currentUser();
    return !!(hangout && currentUser && hangout.createdBy._id === currentUser._id);
  }

  isUserJoined(): boolean {
    const hangout = this.hangout();
    const currentUser = this.authService.currentUser();
    return !!(hangout && currentUser && 
      hangout.attendees.some(attendee => attendee._id === currentUser._id));
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }
}