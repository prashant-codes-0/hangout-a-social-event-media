import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeAgo',
  standalone: true
})
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date): string {
    if (!value) return '';

    const now = new Date();
    const date = new Date(value);
    const diffMs = now.getTime() - date.getTime();
    
    // If the date is in the future, show "in X time"
    if (diffMs < 0) {
      return this.formatFutureTime(Math.abs(diffMs));
    }

    // Past dates
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else if (diffWeeks < 4) {
      return `${diffWeeks}w ago`;
    } else if (diffMonths < 12) {
      return `${diffMonths}mo ago`;
    } else {
      return `${diffYears}y ago`;
    }
  }

  private formatFutureTime(diffMs: number): string {
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 60) {
      return 'in a moment';
    } else if (diffMinutes < 60) {
      return `in ${diffMinutes}m`;
    } else if (diffHours < 24) {
      return `in ${diffHours}h`;
    } else if (diffDays < 7) {
      return `in ${diffDays}d`;
    } else if (diffWeeks < 4) {
      return `in ${diffWeeks}w`;
    } else {
      return `in ${diffMonths}mo`;
    }
  }
}