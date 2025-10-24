import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HangoutService } from '../hangout.service';
import { AuthService } from '../../auth/auth.service';
import { Hangout, RequestDetail } from '../hangout.model';

@Component({
  selector: 'app-manage-hangout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './manage-hangout.component.html',
  styleUrls: ['./manage-hangout.component.css']
})
export class ManageHangoutComponent implements OnInit {
  private hangoutService = inject(HangoutService);
  private authService = inject(AuthService);

  myHangouts = signal<Hangout[]>([]);
  selectedHangout = signal<Hangout | null>(null);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  searchTerm = signal<string>('');

  // Computed property for filtered join requests
  filteredJoinRequests = computed(() => {
    const hangout = this.selectedHangout();
    if (!hangout?.requestDetails) return [];
    
    const search = this.searchTerm().toLowerCase().trim();
    
    if (!search) {
      return hangout.requestDetails;
    }
    
    return hangout.requestDetails.filter(request => 
      request.name.toLowerCase().includes(search) ||
      request.email.toLowerCase().includes(search)
    );
  });

  ngOnInit() {
    this.loadMyHangouts();
  }

  loadMyHangouts() {
    this.loading.set(true);
    this.error.set(null);

    // Load all my hangouts first
    this.hangoutService.getMyHangouts().subscribe({
      next: (response) => {
        if (response.success) {
          // Then get the detailed request data
          this.hangoutService.getMyHangoutRequests().subscribe({
            next: (requestResponse) => {
              if (requestResponse.success) {
                // Merge the request details into the hangouts
                const hangoutsWithRequests = response.data.map(hangout => {
                  const hangoutWithRequests = requestResponse.data.find(h => h._id === hangout._id);
                  return {
                    ...hangout,
                    requestDetails: hangoutWithRequests?.requestDetails || [],
                    pendingRequestsCount: hangoutWithRequests?.pendingRequestsCount || 0
                  };
                });
                this.myHangouts.set(hangoutsWithRequests);
              } else {
                // If request details fail, just show hangouts without request details
                this.myHangouts.set(response.data);
              }
              this.loading.set(false);
            },
            error: (err) => {
              // If request details fail, just show hangouts without request details
              console.warn('Failed to load request details:', err);
              this.myHangouts.set(response.data);
              this.loading.set(false);
            }
          });
        } else {
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.error.set('Failed to load your hangouts. Please try again.');
        this.loading.set(false);
        console.error('Error loading my hangouts:', err);
      }
    });
  }

  refreshSelectedHangout() {
    const currentSelected = this.selectedHangout();
    if (currentSelected) {
      // Find the updated hangout data and refresh the selection
      setTimeout(() => {
        const updatedHangout = this.myHangouts().find(h => h._id === currentSelected._id);
        if (updatedHangout) {
          this.selectedHangout.set(updatedHangout);
        }
      }, 100); // Small delay to ensure data is loaded
    }
  }

  selectHangout(hangout: Hangout) {
    this.selectedHangout.set(hangout);
    this.searchTerm.set(''); // Clear search when selecting new hangout
  }

  approveRequest(request: RequestDetail) {
    const hangoutId = this.selectedHangout()?._id;
    if (!hangoutId) return;

    this.hangoutService.updateRequestStatus(hangoutId, request.userId, 'approve').subscribe({
      next: (response) => {
        console.log('Request approved:', response);
        // Reload hangouts to get updated data
        this.loadMyHangouts();
        // Keep the current hangout selected and refresh its data
        this.refreshSelectedHangout();
      },
      error: (err) => {
        console.error('Error approving request:', err);
        this.error.set('Failed to approve request. Please try again.');
      }
    });
  }

  rejectRequest(request: RequestDetail) {
    const hangoutId = this.selectedHangout()?._id;
    if (!hangoutId) return;

    this.hangoutService.updateRequestStatus(hangoutId, request.userId, 'reject').subscribe({
      next: (response) => {
        console.log('Request rejected:', response);
        // Reload hangouts to get updated data
        this.loadMyHangouts();
        // Keep the current hangout selected and refresh its data
        this.refreshSelectedHangout();
      },
      error: (err) => {
        console.error('Error rejecting request:', err);
        this.error.set('Failed to reject request. Please try again.');
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
}