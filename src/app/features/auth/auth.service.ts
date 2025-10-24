import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { AuthUser, AuthResponse, SignUpDto, SignInDto } from './auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/auth';
  
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  // Signal for reactive UI
  public isAuthenticated = signal<boolean>(false);
  public currentUser = signal<AuthUser | null>(null);

  constructor() {
    // Check for existing token on app start
    this.loadUserFromStorage();
  }

  signUp(userData: SignUpDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/signup`, userData);
  }

  signIn(credentials: SignInDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/signin`, credentials)
      .pipe(
        tap(response => {
          if (response.success) {
            this.setCurrentUser(response.data.user, response.data.access_token);
          }
        })
      );
  }

  signOut(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  private setCurrentUser(user: any, token: string): void {
    console.log('💾 setCurrentUser called');
    console.log('User to store:', user);
    console.log('Token to store:', token);
    
    // Normalize user object to use _id consistently
    const normalizedUser: AuthUser = {
      _id: user._id || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified
    };
    
    console.log('Normalized user:', normalizedUser);
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    
    this.currentUserSubject.next(normalizedUser);
    this.isAuthenticated.set(true);
    this.currentUser.set(normalizedUser);
  }

  private loadUserFromStorage(): void {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        this.currentUserSubject.next(user);
        this.isAuthenticated.set(true);
        this.currentUser.set(user);
      } catch (error) {
        // Invalid stored data, clear it
        this.signOut();
      }
    }
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'admin';
  }

  isSponsor(): boolean {
    return this.currentUser()?.role === 'sponsor';
  }

  isVerified(): boolean {
    return this.currentUser()?.verified || false;
  }
}