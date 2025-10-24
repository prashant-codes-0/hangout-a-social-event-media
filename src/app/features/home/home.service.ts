import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HangoutService } from '../hangouts/hangout.service';
import { Hangout } from '../hangouts/hangout.model';

@Injectable({
  providedIn: 'root'
})
export class HomeService {
  private hangoutService = inject(HangoutService);

  /**
   * Get featured hangouts for the homepage
   */
  getFeaturedHangouts(): Observable<Hangout[]> {
    return this.hangoutService.getAllHangouts().pipe(
      map(response => response.success ? response.data : [])
    );
  }

  /**
   * Get popular hangout purposes
   */
  getPopularPurposes(): string[] {
    return ['Networking', 'Food & Drinks', 'Sports', 'Gaming', 'Study', 'Travel', 'Music'];
  }

  /**
   * Get popular hangout places
   */
  getPopularPlaces(): string[] {
    return ['Coffee Shop', 'Park', 'Restaurant', 'Library', 'Gym', 'Beach', 'Mall'];
  }

  /**
   * Search hangouts with filters
   */
  searchHangouts(query: string, filters?: any): Observable<Hangout[]> {
    return this.hangoutService.searchHangouts(query, filters).pipe(
      map(response => response.success ? response.data : [])
    );
  }
}