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
          // Process hangout to set user status flags
          const processedHangout = this.processHangoutWithUserStatus(response.data);
          this.hangout.set(processedHangout);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load hangout');
        this.loading.set(false);
      }
    });
  }

  // Process hangout to set user status flags
  private processHangoutWithUserStatus(hangout: Hangout): Hangout {
    const currentUser = this.authService.currentUser();

    if (!currentUser) {
      return hangout;
    }

    // Check if user is the creator
    const isCreator = hangout.createdBy?._id === currentUser._id;

    // Check if user has requested (requestedBy can be User[] or string[])
    let userHasRequested = false;
    if (hangout.requestedBy && Array.isArray(hangout.requestedBy)) {
      userHasRequested = hangout.requestedBy.some(user => {
        const userId = typeof user === 'string' ? user : user._id;
        return userId === currentUser._id;
      });
    }

    // Check if user has joined (attendees should be User[])
    let userHasJoined = false;
    if (hangout.attendees && Array.isArray(hangout.attendees)) {
      userHasJoined = hangout.attendees.some(user => {
        const userId = typeof user === 'string' ? user : user._id;
        return userId === currentUser._id;
      });
    }

    return {
      ...hangout,
      isCreator,
      userHasRequested,
      userHasJoined
    };
  }

  joinHangout(): void {
    const hangout = this.hangout();
    if (!hangout || !this.authService.isAuthenticated()) {
      return;
    }

    // Check if user is verified/admin/sponsor before making API call
    if (!this.canUserJoinHangouts()) {
      this.error.set('Only verified users, admins, and sponsors can join hangouts. Please verify your account first.');
      return;
    }

    this.actionLoading.set(true);
    this.hangoutService.joinHangout(hangout._id).subscribe({
      next: (response: any) => {
        if (response.success) {
          // Reload the hangout to get updated data
          this.loadHangout(hangout._id);
        }
        this.actionLoading.set(false);
      },
      error: (err) => {
        if (err.status === 403) {
          this.error.set('Only verified users, admins, and sponsors can join hangouts. Please verify your account first.');
        } else {
          this.error.set(err.error?.message || 'Failed to join hangout');
        }
        this.actionLoading.set(false);
      }
    });
  }

  leaveOrCancelHangout(): void {
    const hangout = this.hangout();
    if (!hangout || !this.authService.isAuthenticated()) {
      return;
    }

    this.actionLoading.set(true);
    this.hangoutService.leaveOrCancelHangout(hangout._id).subscribe({
      next: (response: any) => {
        if (response.success) {
          // Reload the hangout to get updated data
          this.loadHangout(hangout._id);
        }
        this.actionLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to leave/cancel hangout');
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
          // Reload the hangout to get updated data
          this.loadHangout(hangout._id);
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
    return hangout?.userHasJoined || false;
  }

  isUserRequested(): boolean {
    const hangout = this.hangout();
    return hangout?.userHasRequested || false;
  }

  isUserCreator(): boolean {
    const hangout = this.hangout();
    return hangout?.isCreator || false;
  }

  // Check if user can join hangouts (verified, admin, or sponsor)
  canUserJoinHangouts(): boolean {
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;
    
    return currentUser.verified || 
           currentUser.role === 'admin' || 
           currentUser.role === 'sponsor';
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }
}