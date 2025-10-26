import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HangoutService } from '../../hangouts/hangout.service';
import { AuthService } from '../../auth/auth.service';
import { Hangout } from '../../hangouts/hangout.model';

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css']
})
export class HomepageComponent implements OnInit {
  private hangoutService = inject(HangoutService);
  public authService = inject(AuthService);

  hangouts = signal<Hangout[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Filters
  searchTerm = '';
  selectedPurpose = '';
  selectedPlace = '';
  selectedDate = '';

  // Popular purposes and places for filter chips
  popularPurposes = ['Networking', 'Food & Drinks', 'Sports', 'Gaming', 'Study', 'Travel', 'Music'];
  popularPlaces = ['Coffee Shop', 'Park', 'Restaurant', 'Library', 'Gym', 'Beach', 'Mall'];

  ngOnInit() {
    this.loadHangouts();
  }

  loadHangouts() {
    this.loading.set(true);
    this.error.set(null);

    this.hangoutService.getAllHangouts().subscribe({
      next: (response) => {
        if (response.success) {
          // Process hangouts to set userHasRequested flag
          const processedHangouts = this.processHangoutsWithRequestStatus(response.data);
          this.hangouts.set(processedHangouts);
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Failed to load hangouts. Please try again.');
        this.loading.set(false);
        console.error('Error loading hangouts:', err);
      }
    });
  }

  applyFilters() {
    // Filters are applied in the computed filteredHangouts method
  }

  clearFilters() {
    this.selectedPurpose = '';
    this.selectedPlace = '';
    this.selectedDate = '';
    this.searchTerm = '';
  }

  setPurposeFilter(purpose: string) {
    this.selectedPurpose = this.selectedPurpose === purpose ? '' : purpose;
  }

  setPlaceFilter(place: string) {
    this.selectedPlace = this.selectedPlace === place ? '' : place;
  }

  toggleBlast(hangout: Hangout) {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    this.hangoutService.toggleBlast(hangout._id).subscribe({
      next: (response) => {
        console.log('Toggle blast response:', response);

        // Reload hangouts to get updated data
        if (response.success) {
          this.loadHangouts();
        }
      },
      error: (err) => {
        console.error('Error toggling blast:', err);
      }
    });
  }

  // Process hangouts to set userHasRequested flag
  private processHangoutsWithRequestStatus(hangouts: Hangout[]): Hangout[] {
    const currentUser = this.authService.currentUser();

    console.log('🔍 Processing hangouts with request status');
    console.log('Current user:', currentUser);

    if (!currentUser) {
      console.log('❌ No current user found');
      return hangouts;
    }

    return hangouts.map(hangout => {
      // Check if user is the creator
      const isCreator = hangout.createdBy?._id === currentUser._id;

      // Check if user has requested (requestedBy can be User[] or string[])
      let userHasRequested = false;
      if (hangout.requestedBy && Array.isArray(hangout.requestedBy)) {
        userHasRequested = hangout.requestedBy.some(user => {
          // Handle both User object and string ID
          const userId = typeof user === 'string' ? user : user._id;
          return userId === currentUser._id;
        });
      }

      // Check if user has joined (attendees should be User[])
      let userHasJoined = false;
      if (hangout.attendees && Array.isArray(hangout.attendees)) {
        userHasJoined = hangout.attendees.some(user => {
          // Handle both User object and string ID
          const userId = typeof user === 'string' ? user : user._id;
          return userId === currentUser._id;
        });
      }

      console.log(`Hangout "${hangout.title}":`, {
        createdBy: hangout.createdBy,
        requestedBy: hangout.requestedBy,
        attendees: hangout.attendees,
        currentUserId: currentUser._id,
        isCreator,
        userHasRequested,
        userHasJoined
      });

      return {
        ...hangout,
        isCreator,
        userHasRequested,
        userHasJoined
      };
    });
  }

  // Check if current user has requested to join this hangout
  hasUserRequested(hangoutId: string): boolean {
    const hangout = this.hangouts().find(h => h._id === hangoutId);
    return hangout?.userHasRequested || false;
  }

  // Check if current user has joined this hangout
  hasUserJoined(hangoutId: string): boolean {
    const hangout = this.hangouts().find(h => h._id === hangoutId);
    return hangout?.userHasJoined || false;
  }

  // Get user status for a hangout
  getUserStatus(hangout: Hangout): 'creator' | 'joined' | 'requested' | 'none' {
    if (hangout.isCreator) return 'creator';
    if (hangout.userHasJoined) return 'joined';
    if (hangout.userHasRequested) return 'requested';
    return 'none';
  }

  joinHangout(hangout: Hangout) {
    console.log('🎯 Join hangout clicked for:', hangout.title);
    console.log('User status:', this.getUserStatus(hangout));
    console.log('Is authenticated:', this.authService.isAuthenticated());

    if (!this.authService.isAuthenticated()) {
      console.log('❌ User not authenticated');
      return;
    }

    // Check if user is the creator
    if (hangout.isCreator) {
      console.log('❌ User is the creator of this hangout');
      return;
    }

    // Check if user has already joined or requested
    if (hangout.userHasJoined) {
      console.log('❌ User has already joined this hangout');
      return;
    }

    if (hangout.userHasRequested) {
      console.log('❌ User has already requested to join this hangout');
      return;
    }

    console.log('✅ Making join request...');
    this.hangoutService.joinHangout(hangout._id).subscribe({
      next: (response) => {
        console.log('Join hangout response:', response);

        if (response.success) {
          console.log('Successfully requested to join hangout, reloading hangouts list');
          this.loadHangouts();
        }
      },
      error: (err) => {
        console.error('Error joining hangout:', err);
      }
    });
  }

  leaveOrCancelHangout(hangout: Hangout) {
    const action = hangout.userHasJoined ? 'leave' : 'cancel request for';
    console.log(`🚪 ${action} hangout clicked for:`, hangout.title);
    console.log('User status:', this.getUserStatus(hangout));
    console.log('Hangout details:', {
      userHasJoined: hangout.userHasJoined,
      userHasRequested: hangout.userHasRequested,
      isCreator: hangout.isCreator,
      attendees: hangout.attendees,
      requestedBy: hangout.requestedBy,
      currentUserId: this.authService.currentUser()?._id
    });

    if (!this.authService.isAuthenticated()) {
      console.log('❌ User not authenticated');
      return;
    }

    // Check if user is the creator
    if (hangout.isCreator) {
      console.log('❌ User is the creator of this hangout and cannot leave/cancel');
      return;
    }

    // Check if user has joined or requested
    if (!hangout.userHasJoined && !hangout.userHasRequested) {
      console.log('❌ User has not joined or requested this hangout');
      return;
    }

    console.log(`✅ Making ${action} request to API...`);
    console.log('API endpoint:', `hangouts/${hangout._id}/leave-or-cancel`);

    this.hangoutService.leaveOrCancelHangout(hangout._id).subscribe({
      next: (response) => {
        console.log(`${action} hangout API response:`, response);

        if (response.success) {
          console.log(`✅ Successfully ${action}ed hangout, reloading hangouts list`);
          this.loadHangouts();
        } else {
          console.log(`❌ API returned success: false for ${action}`);
        }
      },
      error: (err) => {
        console.error(`💥 Error ${action}ing hangout:`, err);
        console.error('Error details:', {
          status: err.status,
          statusText: err.statusText,
          error: err.error
        });
      }
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getTimeUntil(dateString: string): string {
    const now = new Date();
    const eventDate = new Date(dateString);
    const diffMs = eventDate.getTime() - now.getTime();

    if (diffMs < 0) return 'Past';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;

    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffMinutes}m`;
  }

  filteredHangouts() {
    let filtered = this.hangouts();

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(hangout =>
        hangout.title.toLowerCase().includes(term) ||
        hangout.description.toLowerCase().includes(term) ||
        hangout.purpose.toLowerCase().includes(term) ||
        hangout.place.toLowerCase().includes(term)
      );
    }

    // Purpose filter
    if (this.selectedPurpose) {
      filtered = filtered.filter(hangout => hangout.purpose === this.selectedPurpose);
    }

    // Place filter
    if (this.selectedPlace) {
      filtered = filtered.filter(hangout => hangout.place === this.selectedPlace);
    }

    // Date filter
    if (this.selectedDate) {
      filtered = filtered.filter(hangout => {
        const hangoutDate = new Date(hangout.time).toDateString();
        const filterDate = new Date(this.selectedDate).toDateString();
        return hangoutDate === filterDate;
      });
    }

    return filtered;
  }
}