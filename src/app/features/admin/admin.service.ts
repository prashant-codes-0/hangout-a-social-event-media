import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AdminStats, UserManagement, HangoutModeration } from './admin.model';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/admin';

  /**
   * Get admin dashboard statistics
   */
  getAdminStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.apiUrl}/stats`);
  }

  /**
   * Get all users for management
   */
  getAllUsers(): Observable<UserManagement[]> {
    return this.http.get<UserManagement[]>(`${this.apiUrl}/users`);
  }

  /**
   * Update user role
   */
  updateUserRole(userId: string, role: 'user' | 'admin' | 'sponsor'): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.apiUrl}/users/${userId}/role`, { role });
  }

  /**
   * Ban/unban user
   */
  toggleUserBan(userId: string): Observable<{ success: boolean; banned: boolean }> {
    return this.http.post<{ success: boolean; banned: boolean }>(`${this.apiUrl}/users/${userId}/toggle-ban`, {});
  }

  /**
   * Get hangouts for moderation
   */
  getHangoutsForModeration(): Observable<HangoutModeration[]> {
    return this.http.get<HangoutModeration[]>(`${this.apiUrl}/hangouts`);
  }

  /**
   * Approve/reject hangout
   */
  moderateHangout(hangoutId: string, action: 'approve' | 'reject', reason?: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/hangouts/${hangoutId}/moderate`, {
      action,
      reason
    });
  }

  /**
   * Delete hangout
   */
  deleteHangout(hangoutId: string, reason: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/hangouts/${hangoutId}`, {
      body: { reason }
    });
  }

  /**
   * Get system logs
   */
  getSystemLogs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/logs`);
  }
}