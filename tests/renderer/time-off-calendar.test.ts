import { describe, expect, it } from 'vitest';
import { easter, holidayOn, isWorkingDay, portugueseHolidays, vacationBalance, workingDays } from '../../src/renderer/features/time-off/calendar';
import type { TimeOffPerson } from '../../src/shared/types';

describe('Portuguese holidays', () => {
  it('computes Easter', () => {
    expect([2024, 2025, 2026, 2027, 2028].map(easter)).toEqual(['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16']);
  });

  it('lists the 13 national holidays plus Carnival for 2026', () => {
    const h = portugueseHolidays(2026);
    expect(h.size).toBe(14);
    expect(holidayOn('2026-04-03')?.name).toBe('Sexta-feira Santa');
    expect(holidayOn('2026-06-04')?.name).toBe('Corpo de Deus');
    expect(holidayOn('2026-02-17')).toMatchObject({ name: 'Carnaval', optional: true });
    expect(holidayOn('2026-06-10')?.name).toBe('Dia de Portugal');
    expect(holidayOn('2026-06-13')).toBeUndefined(); // municipal (Lisbon), not national
  });

  it('knows working days', () => {
    expect(isWorkingDay('2026-11-24')).toBe(true); // Tuesday
    expect(isWorkingDay('2026-11-28')).toBe(false); // Saturday
    expect(isWorkingDay('2026-12-08')).toBe(false); // Imaculada Conceição (Tuesday)
    expect(isWorkingDay('2026-02-17')).toBe(true); // Carnival is optional
  });
});

describe('vacation days', () => {
  it('counts working days, skipping weekends and holidays', () => {
    // Mon 21 Dec → Fri 1 Jan 2027: 10 weekdays minus Christmas and New Year
    expect(workingDays({ start: '2026-12-21', end: '2027-01-01' })).toBe(8);
    expect(workingDays({ start: '2026-12-21', end: '2027-01-01' }, '2027-01-01', '2027-12-31')).toBe(0);
    expect(workingDays({ start: '2026-11-24', end: '2026-11-24', half: 'pm' })).toBe(0.5);
    expect(workingDays({ start: '2026-11-28', end: '2026-11-29' })).toBe(0);
  });

  it('splits the balance into taken and planned, per year', () => {
    const ana: TimeOffPerson = {
      person: 'Ana', allowance: 22, allowanceByYear: { '2027': 25 },
      entries: [
        { id: '1', type: 'vacation', start: '2026-08-03', end: '2026-08-14', note: '' }, // 10 days, taken
        { id: '2', type: 'vacation', start: '2026-12-21', end: '2027-01-08', note: '' }, // 8 in 2026, 5 in 2027
        { id: '3', type: 'sick', start: '2026-10-05', end: '2026-10-09', note: '' }, // not vacation
        { id: '4', type: 'vacation', start: '2026-11-25', end: '2026-11-25', half: 'am', note: '' }
      ]
    };
    expect(vacationBalance(ana, 2026, '2026-11-24')).toEqual({ allowance: 22, taken: 10, planned: 8.5, remaining: 3.5 });
    expect(vacationBalance(ana, 2027, '2026-11-24')).toEqual({ allowance: 25, taken: 0, planned: 5, remaining: 20 });
    expect(vacationBalance(ana, 2026, '2026-12-28')).toMatchObject({ taken: 14.5, planned: 4 }) // 21–24 Dec taken (25th is Christmas), 28–31 Dec planned;
  });
});

describe('leave', () => {
  it('is not deducted from vacation days', () => {
    const ana: TimeOffPerson = { person: 'Ana', allowance: 22, allowanceByYear: {}, entries: [{ id: '1', type: 'leave', start: '2026-09-07', end: '2026-10-16', note: 'Parental leave' }] };
    expect(vacationBalance(ana, 2026, '2026-11-24')).toEqual({ allowance: 22, taken: 0, planned: 0, remaining: 22 });
  });
});
