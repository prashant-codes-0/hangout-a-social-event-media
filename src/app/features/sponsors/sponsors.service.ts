import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { SponsorStats, SponsoredHangout, CreateSponsoredHangoutDto, CampaignAnalytics } from './sponsors.model';

@Injectable({
  providedIn: 'root'
})
export class SponsorsService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/sponsors';

  /**
   * Get sponsor dashboard statistics
   */
  getSponsorStats(): Observable<SponsorStats> {
    return this.http.get<SponsorStats>(`${this.apiUrl}/stats`);
  }

  /**
   * Get all sponsored hangouts
   */
  getSponsoredHangouts(): Observable<SponsoredHangout[]> {
    return this.http.get<SponsoredHangout[]>(`${this.apiUrl}/hangouts`);
  }

  /**
   * Create a new sponsored hangout
   */
  createSponsoredHangout(hangoutData: CreateSponsoredHangoutDto): Observable<SponsoredHangout> {
    return this.http.post<SponsoredHangout>(`${this.apiUrl}/hangouts`, hangoutData);
  }

  /**
   * Update sponsored hangout
   */
  updateSponsoredHangout(hangoutId: string, hangoutData: Partial<CreateSponsoredHangoutDto>): Observable<SponsoredHangout> {
    return this.http.put<SponsoredHangout>(`${this.apiUrl}/hangouts/${hangoutId}`, hangoutData);
  }

  /**
   * Delete sponsored hangout
   */
  deleteSponsoredHangout(hangoutId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/hangouts/${hangoutId}`);
  }

  /**
   * Get campaign analytics
   */
  getCampaignAnalytics(hangoutId: string): Observable<CampaignAnalytics> {
    return this.http.get<CampaignAnalytics>(`${this.apiUrl}/hangouts/${hangoutId}/analytics`);
  }

  /**
   * Get sponsor billing information
   */
  getBillingInfo(): Observable<{
    currentPlan: string;
    nextBillingDate: string;
    totalSpent: number;
    activeSponsorship: number;
  }> {
    return this.http.get<{
      currentPlan: string;
      nextBillingDate: string;
      totalSpent: number;
      activeSponsorship: number;
    }>(`${this.apiUrl}/billing`);
  }

  /**
   * Boost hangout visibility
   */
  boostHangout(hangoutId: string, boostType: 'basic' | 'premium' | 'featured'): Observable<{ success: boolean; cost: number }> {
    return this.http.post<{ success: boolean; cost: number }>(`${this.apiUrl}/hangouts/${hangoutId}/boost`, {
      boostType
    });
  }
}