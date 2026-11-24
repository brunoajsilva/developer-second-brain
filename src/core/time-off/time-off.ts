// Team time off: one Markdown file per person in "Time off/", so each person edits only their own file
// and sync drives never see two people changing the same file.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { asDate, asText, parseFrontmatter, stringifyFrontmatter } from '../fs/frontmatter';
import { ValidationError, shortId } from '../fs/paths';
import { TIME_OFF_DIR } from '../vault/layout';
import type { TimeOffEntry, TimeOffPerson, TimeOffType } from '../../shared/types';

/** Portugal's legal minimum of paid vacation days. */
export const DEFAULT_ALLOWANCE = 22;
const TYPES: TimeOffType[] = ['vacation', 'sick', 'training', 'leave', 'other'];
const MAX_SPAN_DAYS = 366;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const timeOffDir = (vault: string) => path.join(vault, TIME_OFF_DIR);

/** File name for a person: the name itself, minus characters file systems reject. */
export function personFileName(person: string): string {
  const clean = person.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 60);
  if (!clean) throw new ValidationError('Choose who the time off is for.');
  return clean + '.md';
}

const validDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s);

function readEntry(raw: unknown): TimeOffEntry | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const start = asDate(o.start);
  const end = asDate(o.end) || start;
  if (!start || end < start) return null;
  const type = TYPES.includes(o.type as TimeOffType) ? (o.type as TimeOffType) : 'other';
  const half = o.half === 'am' || o.half === 'pm' ? o.half : undefined;
  return { id: asText(o.id) || `${start}-${type}`, type, start, end, ...(half && start === end ? { half } : {}), note: asText(o.note) };
}

function toPerson(fallbackName: string, text: string): TimeOffPerson {
  const { data } = parseFrontmatter(text);
  const entries = (Array.isArray(data.entries) ? data.entries : []).map(readEntry).filter((e): e is TimeOffEntry => !!e);
  const byYear: Record<string, number> = {};
  if (data.allowanceByYear && typeof data.allowanceByYear === 'object') {
    for (const [y, v] of Object.entries(data.allowanceByYear as Record<string, unknown>)) if (/^\d{4}$/.test(y) && Number.isFinite(Number(v))) byYear[y] = Number(v);
  }
  const allowance = Number(data.allowance);
  return {
    person: asText(data.person).trim() || fallbackName,
    allowance: Number.isFinite(allowance) && allowance >= 0 ? allowance : DEFAULT_ALLOWANCE,
    allowanceByYear: byYear,
    entries: entries.sort((a, b) => a.start.localeCompare(b.start))
  };
}

export async function listTimeOff(vault: string): Promise<TimeOffPerson[]> {
  let names: string[];
  try {
    names = (await fs.readdir(timeOffDir(vault))).filter((n) => n.toLowerCase().endsWith('.md') && !n.startsWith('.') && !n.startsWith('_'));
  } catch {
    return [];
  }
  const out: TimeOffPerson[] = [];
  for (const n of names) out.push(toPerson(n.replace(/\.md$/i, ''), (await readTextFile(path.join(timeOffDir(vault), n))).text));
  return out.sort((a, b) => a.person.localeCompare(b.person));
}

/** Reads a person's file (or a fresh record), lets `change` edit it, and writes it back. */
async function updatePerson(vault: string, person: string, change: (p: TimeOffPerson) => void): Promise<TimeOffPerson> {
  const file = path.join(timeOffDir(vault), personFileName(person));
  const current = (await pathExists(file)) ? await readTextFile(file) : null;
  const record = current ? toPerson(person, current.text) : { person: person.trim(), allowance: DEFAULT_ALLOWANCE, allowanceByYear: {}, entries: [] };
  const body = current ? parseFrontmatter(current.text).body : `Time off for ${person.trim()}. Edited from the Time off map; every entry is in the list above.`;
  change(record);
  record.entries.sort((a, b) => a.start.localeCompare(b.start));
  const header = {
    person: record.person,
    allowance: record.allowance,
    ...(Object.keys(record.allowanceByYear).length ? { allowanceByYear: record.allowanceByYear } : {}),
    entries: record.entries.map((e) => ({ id: e.id, type: e.type, start: e.start, end: e.end, ...(e.half ? { half: e.half } : {}), ...(e.note ? { note: e.note } : {}) }))
  };
  // the hash we read guards against another computer writing the same file in between
  await writeTextFile(file, stringifyFrontmatter(header, body), current ? current.hash : null);
  return record;
}

function validate(entry: Omit<TimeOffEntry, 'id'>): Omit<TimeOffEntry, 'id'> {
  if (!TYPES.includes(entry.type)) throw new ValidationError('Unknown type of time off.');
  if (!validDate(entry.start) || !validDate(entry.end)) throw new ValidationError('Use valid dates.');
  if (entry.end < entry.start) throw new ValidationError('The last day cannot be before the first day.');
  const span = (Date.parse(entry.end) - Date.parse(entry.start)) / 86_400_000 + 1;
  if (span > MAX_SPAN_DAYS) throw new ValidationError('Time off can span at most one year.');
  const half = entry.half === 'am' || entry.half === 'pm' ? entry.half : undefined;
  if (half && entry.start !== entry.end) throw new ValidationError('A half day must start and end on the same day.');
  return { type: entry.type, start: entry.start, end: entry.end, ...(half ? { half } : {}), note: (entry.note ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) };
}

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end;

export async function saveTimeOff(vault: string, person: string, input: Omit<TimeOffEntry, 'id'> & { id?: string }): Promise<TimeOffEntry> {
  const clean = validate(input);
  let saved: TimeOffEntry | null = null;
  await updatePerson(vault, person, (p) => {
    const others = p.entries.filter((e) => e.id !== input.id);
    // two half days on the same day (morning + afternoon) are fine; anything else overlapping is a mistake
    const clash = others.find((e) => overlaps(e, clean) && !(e.half && clean.half && e.half !== clean.half));
    if (clash) throw new ValidationError(`This overlaps time off already booked (${clash.start}${clash.end !== clash.start ? ' to ' + clash.end : ''}).`);
    if (input.id && !p.entries.some((e) => e.id === input.id)) throw new ValidationError('That entry no longer exists.');
    saved = { id: input.id || shortId() + shortId(), ...clean };
    p.entries = [...others, saved];
  });
  return saved!;
}

export async function deleteTimeOff(vault: string, person: string, entryId: string): Promise<void> {
  await updatePerson(vault, person, (p) => {
    if (!p.entries.some((e) => e.id === entryId)) throw new ValidationError('That entry no longer exists.');
    p.entries = p.entries.filter((e) => e.id !== entryId);
  });
}

export async function setTimeOffAllowance(vault: string, person: string, allowance: number, year?: string): Promise<void> {
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 366) throw new ValidationError('Enter a number of days between 0 and 366.');
  const days = Math.round(allowance * 2) / 2;
  await updatePerson(vault, person, (p) => {
    if (year) {
      if (!/^\d{4}$/.test(year)) throw new ValidationError('invalid year');
      p.allowanceByYear = { ...p.allowanceByYear, [year]: days };
    } else p.allowance = days;
  });
}
