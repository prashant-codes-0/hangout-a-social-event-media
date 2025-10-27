import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { ProfileData, UpdateProfileDto } from './profile.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = `${environment.apiUrl}/profile`;
  private readonly baseUrl = environment.apiUrl;

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

  /**
   * Check if current user is verified
   */
  isUserVerified(): boolean {
    const currentUser = this.authService.currentUser();
    return currentUser?.verified || false;
  }

  /**
   * Send OTP to user's email for verification
   */
  sendOTP(email?: string): Observable<any> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      throw new Error('No user logged in');
    }

    // Use provided email or current user's email
    const emailToUse = email || currentUser.email;
    if (!emailToUse) {
      throw new Error('No email address available');
    }

    return this.http.post(`${this.baseUrl}/auth/send-otp`, {
      email: emailToUse
    });
  }

  /**
   * Verify OTP for email verification
   */
  verifyOTP(email: string, otpCode: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/verify-otp`, {
      email,
      otpCode
    });
  }

  /**
   * Request user verification
   */
  requestVerification(): Observable<any> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      throw new Error('No user logged in');
    }

    // Check if user is already verified
    if (this.isUserVerified()) {
      throw new Error('User is already verified');
    }

    return this.http.patch(`${this.baseUrl}/auth/verify-only`, {
      userId: currentUser._id
    });
  }
}