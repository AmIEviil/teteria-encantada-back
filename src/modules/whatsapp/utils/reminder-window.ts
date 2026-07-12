export const REMINDER_LEAD_MINUTES = 60;
export const NO_RESPONSE_MINUTES = 45;

export function reminderUpperBound(now: Date): Date {
  return new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000);
}

export function noResponseCutoff(now: Date): Date {
  return new Date(now.getTime() - NO_RESPONSE_MINUTES * 60 * 1000);
}
