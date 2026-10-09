import {
  deriveHangoutStatus,
  isDiscoverable,
  formatHangoutWhen,
  REMINDER_WINDOWS,
  REMINDER_TOLERANCE_MS,
} from './hangout-status';
import {
  DEFAULT_DURATION_MINUTES,
  HangoutStatus,
} from './schemas/hangout.schema';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = new Date('2030-06-01T12:00:00.000Z').getTime();
const START = new Date('2030-06-01T14:00:00.000Z'); // 2h away

describe('deriveHangoutStatus', () => {
  it('is upcoming before the start time', () => {
    const status = deriveHangoutStatus(START, 120, HangoutStatus.UPCOMING, NOW);
    expect(status).toBe(HangoutStatus.UPCOMING);
  });

  it('is ongoing between the start and the end of the duration', () => {
    const justAfterStart = START.getTime() + MINUTE;
    expect(
      deriveHangoutStatus(START, 120, HangoutStatus.UPCOMING, justAfterStart),
    ).toBe(HangoutStatus.ONGOING);
  });

  it('is completed once the duration has elapsed', () => {
    const afterEnd = START.getTime() + 120 * MINUTE;
    expect(
      deriveHangoutStatus(START, 120, HangoutStatus.ONGOING, afterEnd),
    ).toBe(HangoutStatus.COMPLETED);
  });

  it('treats cancelled as terminal, even long after the event', () => {
    const longAfter = START.getTime() + 40 * 24 * HOUR;
    expect(
      deriveHangoutStatus(START, 120, HangoutStatus.CANCELLED, longAfter),
    ).toBe(HangoutStatus.CANCELLED);
  });

  it('falls back to the default duration when none is given', () => {
    const justInsideDefault =
      START.getTime() + (DEFAULT_DURATION_MINUTES - 1) * MINUTE;
    expect(
      deriveHangoutStatus(
        START,
        undefined,
        HangoutStatus.ONGOING,
        justInsideDefault,
      ),
    ).toBe(HangoutStatus.ONGOING);

    const justOutsideDefault =
      START.getTime() + (DEFAULT_DURATION_MINUTES + 1) * MINUTE;
    expect(
      deriveHangoutStatus(
        START,
        undefined,
        HangoutStatus.ONGOING,
        justOutsideDefault,
      ),
    ).toBe(HangoutStatus.COMPLETED);
  });

  it('restores an event to whatever the clock says when no current status is given', () => {
    expect(deriveHangoutStatus(START, 120, undefined, NOW)).toBe(
      HangoutStatus.UPCOMING,
    );
  });

  it('is not confused by an unparseable date', () => {
    expect(
      deriveHangoutStatus('not-a-date', 120, HangoutStatus.UPCOMING, NOW),
    ).toBe(HangoutStatus.UPCOMING);
  });
});

describe('isDiscoverable', () => {
  it('keeps upcoming and ongoing events in the feed', () => {
    expect(isDiscoverable(HangoutStatus.UPCOMING)).toBe(true);
    expect(isDiscoverable(HangoutStatus.ONGOING)).toBe(true);
  });

  it('hides finished and cancelled events', () => {
    expect(isDiscoverable(HangoutStatus.COMPLETED)).toBe(false);
    expect(isDiscoverable(HangoutStatus.CANCELLED)).toBe(false);
  });
});

describe('reminder windows', () => {
  it('orders windows from furthest to nearest', () => {
    const offsets = REMINDER_WINDOWS.map((w) => w.offsetMs);
    expect(offsets).toEqual([...offsets].sort((a, b) => b - a));
  });

  it('uses unique kinds so each window is claimed independently', () => {
    const kinds = REMINDER_WINDOWS.map((w) => w.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('keeps the tolerance wider than the reminder cron interval', () => {
    // 10 minute cron: a narrower tolerance could skip a window entirely.
    const TEN_MINUTES = 10 * MINUTE;
    expect(REMINDER_TOLERANCE_MS).toBeGreaterThan(TEN_MINUTES);
  });

  it('gives every window a headline and a positive offset', () => {
    for (const window of REMINDER_WINDOWS) {
      expect(window.kind).toBeTruthy();
      expect(window.headline).toBeTruthy();
      expect(window.offsetMs).toBeGreaterThan(0);
    }
  });
});

describe('formatHangoutWhen', () => {
  it('returns an empty string instead of "Invalid Date"', () => {
    expect(formatHangoutWhen('nonsense')).toBe('');
  });

  it('includes the weekday, date and time', () => {
    const formatted = formatHangoutWhen('2030-06-01T14:00:00.000Z');
    // e.g. "Sat · Jun 1, 7:45 PM" (server timezone, so only assert the shape)
    expect(formatted).toMatch(/^\w{3} · \w{3} \d{1,2}, .+$/);
  });
});
