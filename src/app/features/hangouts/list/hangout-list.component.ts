import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HangoutService } from '../hangout.service';
import { AuthService } from '../../auth/auth.service';
import { Hangout } from '../hangout.model';

@Component({
    selector: 'app-hangout-list',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './hangout-list.component.html',
    styleUrls: ['./hangout-list.component.css']
})
export class HangoutListComponent implements OnInit {
    private hangoutService = inject(HangoutService);
    private authService = inject(AuthService);

    // State
    hangouts = signal<Hangout[]>([]);
    loading = signal(false);
    error = signal<string | null>(null);

    // Filters
    searchTerm = signal('');
    selectedDate = signal('');
    selectedPurpose = signal('');
    selectedPlace = signal('');

    // Popular filter options
    popularPurposes = ['Networking', 'Food & Drinks', 'Sports', 'Gaming', 'Study', 'Travel', 'Music', 'Art'];
    popularPlaces = ['Coffee Shop', 'Restaurant', 'Park', 'Library', 'Gym', 'Beach', 'Mall', 'Home'];

    // Computed filtered hangouts
    filteredHangouts = computed(() => {
        let filtered = this.hangouts();

        // Search filter
        if (this.searchTerm()) {
            const term = this.searchTerm().toLowerCase();
            filtered = filtered.filter(hangout =>
                hangout.title.toLowerCase().includes(term) ||
                hangout.description.toLowerCase().includes(term) ||
                hangout.purpose.toLowerCase().includes(term) ||
                hangout.place.toLowerCase().includes(term)
            );
        }

        // Date filter
        if (this.selectedDate()) {
            filtered = filtered.filter(hangout => {
                const hangoutDate = new Date(hangout.time).toDateString();
                const filterDate = new Date(this.selectedDate()).toDateString();
                return hangoutDate === filterDate;
            });
        }

        // Purpose filter
        if (this.selectedPurpose()) {
            filtered = filtered.filter(hangout =>
                hangout.purpose === this.selectedPurpose()
            );
        }

        // Place filter
        if (this.selectedPlace()) {
            filtered = filtered.filter(hangout =>
                hangout.place === this.selectedPlace()
            );
        }

        return filtered;
    });

    ngOnInit(): void {
        this.loadHangouts();
    }

    loadHangouts(): void {
        this.loading.set(true);
        this.error.set(null);

        this.hangoutService.getAllHangouts().subscribe({
            next: (response) => {
                if (response.success) {
                    this.hangouts.set(response.data);
                }
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err.error?.message || 'Failed to load hangouts');
                this.loading.set(false);
            }
        });
    }

    joinHangout(hangout: Hangout): void {
        if (!this.authService.isAuthenticated()) {
            return;
        }

        this.hangoutService.joinHangout(hangout._id).subscribe({
            next: (response: any) => {
                if (response.success) {
                    // Update the hangout in the list
                    const currentHangouts = this.hangouts();
                    const index = currentHangouts.findIndex(h => h._id === hangout._id);
                    if (index !== -1) {
                        currentHangouts[index] = response.data || hangout;
                        this.hangouts.set([...currentHangouts]);
                    }
                }
            },
            error: (err) => {
                this.error.set(err.error?.message || 'Failed to join hangout');
            }
        });
    }

    toggleBlast(hangout: Hangout): void {
        if (!this.authService.isAuthenticated()) {
            return;
        }

        this.hangoutService.toggleBlast(hangout._id).subscribe({
            next: (response: any) => {
                if (response.success) {
                    // Update the hangout in the list
                    const currentHangouts = this.hangouts();
                    const index = currentHangouts.findIndex(h => h._id === hangout._id);
                    if (index !== -1) {
                        currentHangouts[index] = response.data || hangout;
                        this.hangouts.set([...currentHangouts]);
                    }
                }
            },
            error: (err) => {
                this.error.set(err.error?.message || 'Failed to blast hangout');
            }
        });
    }

    applyFilters(): void {
        // Filters are applied automatically through computed signal
    }

    clearFilters(): void {
        this.searchTerm.set('');
        this.selectedDate.set('');
        this.selectedPurpose.set('');
        this.selectedPlace.set('');
    }

    setPurposeFilter(purpose: string): void {
        this.selectedPurpose.set(this.selectedPurpose() === purpose ? '' : purpose);
    }

    setPlaceFilter(place: string): void {
        this.selectedPlace.set(this.selectedPlace() === place ? '' : place);
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getTimeUntil(date: string): string {
        const now = new Date();
        const hangoutDate = new Date(date);
        const diffMs = hangoutDate.getTime() - now.getTime();

        if (diffMs < 0) return 'Past';

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (diffDays > 0) return `${diffDays}d`;
        if (diffHours > 0) return `${diffHours}h`;
        return 'Soon';
    }

    // Expose auth service methods to template
    get isAuthenticated() {
        return this.authService.isAuthenticated();
    }
}