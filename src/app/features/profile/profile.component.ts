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
  private fb = inject(FormBuilder);

  isEditing = signal(false);
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

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