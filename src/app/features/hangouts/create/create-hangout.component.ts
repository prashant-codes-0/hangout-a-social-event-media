import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HangoutService } from '../hangout.service';
import { AuthService } from '../../auth/auth.service';
import { CreateHangoutDto } from '../hangout.model';

@Component({
  selector: 'app-create-hangout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-hangout.component.html',
  styleUrls: ['./create-hangout.component.css']
})
export class CreateHangoutComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private hangoutService = inject(HangoutService);
  private authService = inject(AuthService);

  isLoading = signal(false);
  error = signal<string | null>(null);

  // Form setup
  hangoutForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    purpose: ['', [Validators.required]],
    place: ['', [Validators.required, Validators.minLength(3)]],
    time: ['', [Validators.required, this.futureDateValidator]],
    capacity: [10, [Validators.required, Validators.min(2), Validators.max(100)]],
    isPublic: [true, [Validators.required]]
  });

  // Purpose options
  purposeOptions = [
    'Networking', 'Food & Drinks', 'Sports', 'Gaming', 'Study',
    'Travel', 'Music', 'Art', 'Movies', 'Books', 'Technology', 'Other'
  ];

  // Place suggestions
  placeSuggestions = [
    'Coffee Shop', 'Restaurant', 'Park', 'Library', 'Gym',
    'Beach', 'Mall', 'Home', 'Office', 'Community Center'
  ];

  onSubmit(): void {
    if (this.hangoutForm.valid && !this.isLoading()) {
      this.isLoading.set(true);
      this.error.set(null);

      const formValue = this.hangoutForm.value;
      const hangoutData: CreateHangoutDto = {
        title: formValue.title!,
        description: formValue.description!,
        purpose: formValue.purpose!,
        place: formValue.place!,
        time: new Date(formValue.time!).toISOString(),
        capacity: formValue.capacity!,
        isPublic: formValue.isPublic!
      };

      this.hangoutService.createHangout(hangoutData).subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response.success) {
            this.router.navigate(['/hangouts/details', response.data._id]);
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          this.error.set(err.error?.message || 'Failed to create hangout');
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  // Custom validator for future dates
  futureDateValidator(control: any) {
    if (!control.value) return null;

    const selectedDate = new Date(control.value);
    const now = new Date();

    if (selectedDate <= now) {
      return { pastDate: true };
    }

    return null;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.hangoutForm.controls).forEach(key => {
      const control = this.hangoutForm.get(key);
      control?.markAsTouched();
    });
  }

  // Validation helper methods
  isFieldInvalid(fieldName: string): boolean {
    const field = this.hangoutForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.hangoutForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) {
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`;
      }
      if (field.errors['minlength']) {
        const requiredLength = field.errors['minlength'].requiredLength;
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at least ${requiredLength} characters`;
      }
      if (field.errors['maxlength']) {
        const maxLength = field.errors['maxlength'].requiredLength;
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be less than ${maxLength} characters`;
      }
      if (field.errors['min']) {
        const min = field.errors['min'].min;
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at least ${min}`;
      }
      if (field.errors['max']) {
        const max = field.errors['max'].max;
        return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at most ${max}`;
      }
      if (field.errors['pastDate']) {
        return 'Please select a future date and time';
      }
    }
    return '';
  }

  // Helper methods for template
  selectPurpose(purpose: string): void {
    this.hangoutForm.patchValue({ purpose });
  }

  selectPlace(place: string): void {
    this.hangoutForm.patchValue({ place });
  }

  // Get minimum datetime for input (current time + 1 hour)
  getMinDateTime(): string {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }
}