import {
  DEFAULT_DURATION_MINUTES,
  HangoutStatus,
} from './schemas/hangout.schema';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Reminder windows, delivered once each, measured backwards from the start time.
export const REMINDER_WINDOWS = [
  { kind: '24h', offsetMs: 24 * HOUR, headline: 'Tomorrow' },
  { kind: '2h', offsetMs: 2 * HOUR, headline: 'Starts in 2 hours' },
  { kind: '30m', offsetMs: 30 * MINUTE, headline: 'Starting soon' },
] as const;

// Half-width of a reminder window. Must stay comfortably larger than the cron
// interval so every scheduled tick lands inside the window exactly once.
export const REMINDER_TOLERANCE_MS = 15 * MINUTE;

// CANCELLED is terminal: a cancelled hangout never becomes live again on its own.
export function deriveHangoutStatus(
  time: Date | string,
  durationMinutes?: number,
  currentStatus?: HangoutStatus,
  now: number = Date.now(),
): HangoutStatus {
  if (currentStatus === HangoutStatus.CANCELLED) {
    return HangoutStatus.CANCELLED;
  }

  const start = new Date(time).getTime();
  if (isNaN(start)) {
    return currentStatus ?? HangoutStatus.UPCOMING;
  }

  const duration =
    durationMinutes && durationMinutes > 0
      ? durationMinutes
      : DEFAULT_DURATION_MINUTES;
  const end = start + duration * MINUTE;

  if (now < start) return HangoutStatus.UPCOMING;
  if (now < end) return HangoutStatus.ONGOING;
  return HangoutStatus.COMPLETED;
}

// Hangouts still worth showing in a discovery feed: anything the user can act on
// or that is happening right now.
export function isDiscoverable(status: HangoutStatus): boolean {
  return status === HangoutStatus.UPCOMING || status === HangoutStatus.ONGOING;
}

// "Fri, 25 Jul · 7:00 PM"
export function formatHangoutWhen(time: Date | string): string {
  const date = new Date(time);
  if (isNaN(date.getTime())) return '';

  return date
    .toLocaleString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(',', ' ·');
}
