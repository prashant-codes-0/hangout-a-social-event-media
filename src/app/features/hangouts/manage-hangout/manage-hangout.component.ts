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

    this.hangoutService.getMyHangoutRequests().subscribe({
      next: (response) => {
        if (response.success) {
          this.myHangouts.set(response.data);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load your hangouts. Please try again.');
        this.loading.set(false);
        console.error('Error loading my hangouts:', err);
      }
    });
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
        // Clear selection to refresh the view
        this.selectedHangout.set(null);
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
        // Clear selection to refresh the view
        this.selectedHangout.set(null);
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