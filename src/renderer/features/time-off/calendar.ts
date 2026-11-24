// Portuguese public holidays, working days and vacation balances. Pure functions on "YYYY-MM-DD" strings.
import type { TimeOffEntry, TimeOffPerson, TimeOffType } from '../../../shared/types';

export interface Holiday {
  date: string;
  name: string;
  /** Not a legal holiday, but commonly given (Carnival). Shown, yet counted as a working day. */
  optional?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const toUtc = (s: string) => new Date(s + 'T00:00:00Z');
export const addDays = (s: string, n: number) => { const d = toUtc(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayOfWeek = (s: string) => toUtc(s).getUTCDay(); // 0 = Sunday
export const isWeekend = (s: string) => { const d = dayOfWeek(s); return d === 0 || d === 6; };
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

/** Easter Sunday (Gregorian calendar, anonymous algorithm). */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

const cache = new Map<number, Map<string, Holiday>>();

/** National holidays of Portugal (Labour Code, art. 234), plus Carnival marked optional. */
export function portugueseHolidays(year: number): Map<string, Holiday> {
  const hit = cache.get(year);
  if (hit) return hit;
  const e = easter(year);
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'Ano Novo' },
    { date: addDays(e, -47), name: 'Carnaval', optional: true },
    { date: addDays(e, -2), name: 'Sexta-feira Santa' },
    { date: e, name: 'Páscoa' },
    { date: iso(year, 4, 25), name: 'Dia da Liberdade' },
    { date: iso(year, 5, 1), name: 'Dia do Trabalhador' },
    { date: addDays(e, 60), name: 'Corpo de Deus' },
    { date: iso(year, 6, 10), name: 'Dia de Portugal' },
    { date: iso(year, 8, 15), name: 'Assunção de Nossa Senhora' },
    { date: iso(year, 10, 5), name: 'Implantação da República' },
    { date: iso(year, 11, 1), name: 'Todos os Santos' },
    { date: iso(year, 12, 1), name: 'Restauração da Independência' },
    { date: iso(year, 12, 8), name: 'Imaculada Conceição' },
    { date: iso(year, 12, 25), name: 'Natal' }
  ];
  const map = new Map(list.map((h) => [h.date, h]));
  cache.set(year, map);
  return map;
}

export const holidayOn = (date: string) => portugueseHolidays(Number(date.slice(0, 4))).get(date);

/** A working day: Monday to Friday and not a (mandatory) public holiday. */
export function isWorkingDay(date: string): boolean {
  if (isWeekend(date)) return false;
  const h = holidayOn(date);
  return !h || !!h.optional;
}

/** Working days an entry takes, optionally only those between `from` and `to` (inclusive). Half days count 0.5. */
export function workingDays(entry: Pick<TimeOffEntry, 'start' | 'end' | 'half'>, from = entry.start, to = entry.end): number {
  const start = entry.start > from ? entry.start : from;
  const end = entry.end < to ? entry.end : to;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(d)) n++;
  return entry.half && n > 0 ? 0.5 : n;
}

export const allowanceFor = (p: Pick<TimeOffPerson, 'allowance' | 'allowanceByYear'>, year: number) => p.allowanceByYear[String(year)] ?? p.allowance;

export interface Balance {
  allowance: number;
  /** Vacation working days already taken this year (before today). */
  taken: number;
  /** Vacation working days booked from today on. */
  planned: number;
  remaining: number;
}

export function vacationBalance(p: TimeOffPerson, year: number, today = todayIso()): Balance {
  const yearStart = iso(year, 1, 1);
  const yearEnd = iso(year, 12, 31);
  let taken = 0;
  let planned = 0;
  for (const e of p.entries) {
    if (e.type !== 'vacation' || e.end < yearStart || e.start > yearEnd) continue;
    const yesterday = addDays(today, -1);
    taken += workingDays(e, yearStart, yesterday < yearEnd ? yesterday : yearEnd);
    planned += workingDays(e, today > yearStart ? today : yearStart, yearEnd);
  }
  const allowance = allowanceFor(p, year);
  return { allowance, taken, planned, remaining: allowance - taken - planned };
}

/** The entry (or entries, for two half days) a person has on a date. */
export const entriesOn = (p: TimeOffPerson, date: string) => p.entries.filter((e) => e.start <= date && date <= e.end);

/** People away on a day, with what they are doing. */
export const outOn = (records: TimeOffPerson[], date: string) => records.flatMap((p) => entriesOn(p, date).map((entry) => ({ person: p.person, entry })));

export const TYPE_LABELS: Record<TimeOffType, string> = { vacation: 'Vacation', sick: 'Sick leave', training: 'Training or conference', leave: 'Leave (parental, marriage…)', other: 'Other' };
export const TYPE_SHORT: Record<TimeOffType, string> = { vacation: 'Vacation', sick: 'Sick', training: 'Training', leave: 'Leave', other: 'Other' };

/** Common kinds of leave, offered as quick picks for the note. */
export const LEAVE_REASONS = ['Parental leave', 'Marriage', 'Bereavement', 'Medical appointment', 'Blood donation', 'Family assistance'];
