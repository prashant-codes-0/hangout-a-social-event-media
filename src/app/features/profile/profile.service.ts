import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { ProfileData, UpdateProfileDto } from './profile.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = 'http://localhost:3000/profile';

  /**
   * Get user profile data
   */
  getProfile(): Observable<ProfileData> {
    return this.http.get<ProfileData>(`${this.apiUrl}`);
  }

  /**
   * Update user profile
   */
  updateProfile(profileData: UpdateProfileDto): Observable<ProfileData> {
    return this.http.put<ProfileData>(`${this.apiUrl}`, profileData);
  }

  /**
   * Change password
   */
  changePassword(currentPassword: string, newPassword: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/change-password`, {
      currentPassword,
      newPassword
    });
  }

  /**
   * Delete account
   */
  deleteAccount(): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}`);
  }

  /**
   * Upload profile picture
   */
  uploadProfilePicture(file: File): Observable<{ success: boolean; imageUrl: string }> {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return this.http.post<{ success: boolean; imageUrl: string }>(`${this.apiUrl}/upload-picture`, formData);
  }

  /**
   * Get user statistics
   */
  getUserStats(): Observable<{
    hangioutsCreated: number;
    hangioutsJoined: number;
    totalBlasts: number;
    memberSince: string;
  }> {
    return this.http.get<{
      hangioutsCreated: number;
      hangioutsJoined: number;
      totalBlasts: number;
      memberSince: string;
    }>(`${this.apiUrl}/stats`);
  }
}