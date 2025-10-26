import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HangoutService } from '../hangout.service';
import { AuthService } from '../../auth/auth.service';
import { Hangout } from '../hangout.model';

@Component({
  selector: 'app-view-user-hangout-info',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './view-user-hangout-info.component.html'
})
export class ViewUserHangoutInfoComponent implements OnInit {
  private hangoutService = inject(HangoutService);
  private authService = inject(AuthService);

  // Data signals
  myHangouts = signal<Hangout[]>([]);
  joinedHangouts = signal<Hangout[]>([]);
  requestedHangouts = signal<Hangout[]>([]);

  // Loading states
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Tab state
  activeTab = signal<'overview' | 'joined' | 'requested'>('overview');

  // Detailed stats
  stats = signal({
    totalCreated: 0,
    totalJoined: 0,
    totalRequested: 0,
    totalAttendees: 0,
    averageAttendeesPerHangout: 0,
    upcomingHangouts: 0,
    pastHangouts: 0,
    mostPopularPurpose: '',
    mostPopularPlace: ''
  });

  currentUser = this.authService.currentUser;

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.loadAllUserHangouts();
    }
  }

  loadAllUserHangouts() {
    this.loading.set(true);
    this.error.set(null);

    // Load all user hangout data
    Promise.all([
      this.hangoutService.getMyHangouts().toPromise(),
      this.hangoutService.getJoinedHangouts().toPromise(),
      this.hangoutService.getMyHangoutRequests().toPromise()
    ]).then(([myResponse, joinedResponse, requestedResponse]) => {
      // Process my hangouts
      if (myResponse?.success) {
        this.myHangouts.set(myResponse.data);
      }

      // Process joined hangouts
      if (joinedResponse?.success) {
        this.joinedHangouts.set(joinedResponse.data);
      }

      // Process requested hangouts
      if (requestedResponse?.success) {
        const requestedData = requestedResponse.data.filter(hangout =>
          hangout.requestDetails && hangout.requestDetails.length > 0
        );
        this.requestedHangouts.set(requestedData);
      }

      // Calculate detailed stats
      this.calculateDetailedStats();
      this.loading.set(false);
    }).catch(err => {
      console.error('Error loading user hangouts:', err);
      this.error.set('Failed to load hangout data');
      this.loading.set(false);
    });
  }

  private calculateDetailedStats() {
    const myHangouts = this.myHangouts();
    const joinedHangouts = this.joinedHangouts();
    const requestedHangouts = this.requestedHangouts();

    // Basic counts
    const totalCreated = myHangouts.length;
    const totalJoined = joinedHangouts.length;
    const totalRequested = requestedHangouts.length;

    // Calculate total attendees across user's created hangouts
    const totalAttendees = myHangouts.reduce((total, hangout) => {
      return total + (hangout.attendees?.length || 0);
    }, 0);

    // Average attendees per hangout
    const averageAttendeesPerHangout = totalCreated > 0 ?
      Math.round((totalAttendees / totalCreated) * 10) / 10 : 0;

    // Upcoming vs past hangouts
    const now = new Date();
    const allUserHangouts = [...myHangouts, ...joinedHangouts];
    const upcomingHangouts = allUserHangouts.filter(hangout =>
      new Date(hangout.time) > now
    ).length;
    const pastHangouts = allUserHangouts.filter(hangout =>
      new Date(hangout.time) <= now
    ).length;

    // Most popular purpose and place
    const purposeCounts: { [key: string]: number } = {};
    const placeCounts: { [key: string]: number } = {};

    allUserHangouts.forEach(hangout => {
      purposeCounts[hangout.purpose] = (purposeCounts[hangout.purpose] || 0) + 1;
      placeCounts[hangout.place] = (placeCounts[hangout.place] || 0) + 1;
    });

    const mostPopularPurpose = Object.keys(purposeCounts).reduce((a, b) =>
      purposeCounts[a] > purposeCounts[b] ? a : b, ''
    );
    const mostPopularPlace = Object.keys(placeCounts).reduce((a, b) =>
      placeCounts[a] > placeCounts[b] ? a : b, ''
    );

    this.stats.set({
      totalCreated,
      totalJoined,
      totalRequested,
      totalAttendees,
      averageAttendeesPerHangout,
      upcomingHangouts,
      pastHangouts,
      mostPopularPurpose,
      mostPopularPlace
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getTimeUntil(dateString: string): string {
    const now = new Date();
    const eventDate = new Date(dateString);
    const diffMs = eventDate.getTime() - now.getTime();

    if (diffMs < 0) return 'Past';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 0) return `${diffDays} days`;
    if (diffHours > 0) return `${diffHours} hours`;

    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffMinutes} minutes`;
  }

  // Tab navigation methods
  setActiveTab(tab: 'overview' | 'joined' | 'requested') {
    this.activeTab.set(tab);
  }
}