import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { ProfileService } from './profile.service';
import { ProfileData, UpdateProfileDto } from './profile.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent {
  private authService = inject(AuthService);
  private profileService = inject(ProfileService);
  private fb = inject(FormBuilder);

  isEditing = signal(false);
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  verificationLoading = signal(false);
  otpSent = signal(false);
  otpLoading = signal(false);
  otpVerifying = signal(false);
  otpCode = signal('');

  currentUser = this.authService.currentUser;

  profileForm = this.fb.group({
    name: [this.currentUser()?.name || '', [Validators.required, Validators.minLength(2)]],
    email: [this.currentUser()?.email || '', [Validators.required, Validators.email]]
  });

  toggleEdit(): void {
    this.isEditing.update(editing => !editing);
    if (!this.isEditing()) {
      // Reset form when canceling
      this.profileForm.patchValue({
        name: this.currentUser()?.name || '',
        email: this.currentUser()?.email || ''
      });
    }
  }

  onSubmit(): void {
    if (this.profileForm.valid && !this.isLoading()) {
      this.isLoading.set(true);
      this.error.set(null);
      this.success.set(null);

      // TODO: Implement profile update API call
      setTimeout(() => {
        this.isLoading.set(false);
        this.success.set('Profile updated successfully!');
        this.isEditing.set(false);
      }, 1000);
    }
  }

  sendOTP(): void {
    if (this.otpLoading()) return;

    // Check if user is already verified
    if (this.profileService.isUserVerified()) {
      this.error.set('Your account is already verified.');
      return;
    }

    this.otpLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    this.profileService.sendOTP().subscribe({
      next: (response) => {
        console.log('OTP sent response:', response);
        this.otpLoading.set(false);
        
        if (response.success) {
          this.otpSent.set(true);
          this.success.set(`OTP sent successfully to ${this.currentUser()?.email}. Please check your email and enter the code below. Code expires in 10 minutes.`);
        } else {
          this.error.set(response.message || 'Failed to send OTP. Please try again.');
        }
      },
      error: (err) => {
        console.error('Error sending OTP:', err);
        this.otpLoading.set(false);
        this.error.set(err.error?.message || err.message || 'Failed to send OTP. Please try again.');
      }
    });
  }

  verifyOTP(): void {
    if (this.otpVerifying() || !this.otpCode().trim()) return;

    const currentUser = this.currentUser();
    if (!currentUser?.email) {
      this.error.set('No email address found.');
      return;
    }

    this.otpVerifying.set(true);
    this.error.set(null);
    this.success.set(null);

    this.profileService.verifyOTP(currentUser.email, this.otpCode().trim()).subscribe({
      next: (response) => {
        console.log('OTP verification response:', response);
        this.otpVerifying.set(false);
        
        if (response.success) {
          this.success.set('Email verified successfully! Your account is now verified.');
          this.otpSent.set(false);
          this.otpCode.set('');
          
          // Update user verification status in the auth service
          this.authService.updateUserVerificationStatus(true);
        } else {
          this.error.set(response.message || 'Invalid OTP. Please try again.');
        }
      },
      error: (err) => {
        console.error('Error verifying OTP:', err);
        this.otpVerifying.set(false);
        this.error.set(err.error?.message || err.message || 'Invalid OTP. Please try again.');
      }
    });
  }

  resendOTP(): void {
    this.sendOTP();
  }

  cancelOTPVerification(): void {
    this.otpSent.set(false);
    this.otpCode.set('');
    this.error.set(null);
    this.success.set(null);
  }

  requestVerification(): void {
    // For now, this will trigger OTP flow
    this.sendOTP();
  }

  // Validation helper methods
  isFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.profileForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) {
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`;
      }
      if (field.errors['email']) {
        return 'Please enter a valid email address';
      }
      if (field.errors['minlength']) {
        const requiredLength = field.errors['minlength'].requiredLength;
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at least ${requiredLength} characters`;
      }
    }
    return '';
  }
}