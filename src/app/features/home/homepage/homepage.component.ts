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
          this.hangouts.set(response.data);
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
      next: (updatedHangout) => {
        // Update the hangout in the list
        const updatedHangouts = this.hangouts().map(h =>
          h._id === hangout._id ? updatedHangout : h
        );
        this.hangouts.set(updatedHangouts);
      },
      error: (err) => {
        console.error('Error toggling blast:', err);
      }
    });
  }

  joinHangout(hangout: Hangout) {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    this.hangoutService.joinHangout(hangout._id).subscribe({
      next: (updatedHangout) => {
        // Update the hangout in the list
        const updatedHangouts = this.hangouts().map(h =>
          h._id === hangout._id ? updatedHangout : h
        );
        this.hangouts.set(updatedHangouts);
      },
      error: (err) => {
        console.error('Error joining hangout:', err);
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