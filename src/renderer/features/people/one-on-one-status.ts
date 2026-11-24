import { addDays, todayIso } from '../time-off/calendar';
import type { OneOnOnePerson } from '../../../shared/types';

export const CADENCES: [number, string][] = [[7, 'Every week'], [14, 'Every 2 weeks'], [21, 'Every 3 weeks'], [30, 'Every month'], [0, 'No fixed cadence']];

export const cadenceLabel = (days: number) => CADENCES.find(([d]) => d === days)?.[1] ?? `Every ${days} days`;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

export interface OneOnOneStatus {
  last: string | null;
  /** Days since the last 1:1. */
  since: number | null;
  next: string | null;
  overdue: boolean;
}

export function oneOnOneStatus(p: OneOnOnePerson | undefined, today = todayIso()): OneOnOneStatus {
  const last = p?.meetings[0]?.date ?? null;
  const cadence = p?.cadenceDays ?? 14;
  if (!last) return { last: null, since: null, next: null, overdue: false };
  const next = cadence ? addDays(last, cadence) : null;
  return { last, since: daysBetween(last, today), next, overdue: !!next && next < today };
}

export function describeSince(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
