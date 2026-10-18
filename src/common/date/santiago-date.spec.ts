import {
  lastDayOfMonth,
  monthInSantiago,
  todayInSantiago,
} from './santiago-date';

describe('santiago-date', () => {
  it('devuelve la fecha de hoy en formato YYYY-MM-DD', () => {
    expect(todayInSantiago()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('calcula el último día del mes', () => {
    expect(lastDayOfMonth('2026-07')).toBe('2026-07-31');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
  });

  it('calcula el mes en Santiago, no en UTC', () => {
    expect(monthInSantiago(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10');
    expect(monthInSantiago(new Date('2026-11-01T12:00:00Z'))).toBe('2026-11');
  });
});
