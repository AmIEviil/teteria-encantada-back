import {
  reminderUpperBound,
  noResponseCutoff,
  REMINDER_LEAD_MINUTES,
  NO_RESPONSE_MINUTES,
} from './reminder-window';

describe('reminder-window', () => {
  const now = new Date('2026-06-10T12:00:00.000Z');

  it('reminderUpperBound = ahora + 60 min', () => {
    expect(reminderUpperBound(now).toISOString()).toBe('2026-06-10T13:00:00.000Z');
    expect(REMINDER_LEAD_MINUTES).toBe(60);
  });

  it('noResponseCutoff = ahora - 45 min', () => {
    expect(noResponseCutoff(now).toISOString()).toBe('2026-06-10T11:15:00.000Z');
    expect(NO_RESPONSE_MINUTES).toBe(45);
  });
});
