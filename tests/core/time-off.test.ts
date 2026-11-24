import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWANCE, deleteTimeOff, listTimeOff, personFileName, saveTimeOff, setTimeOffAllowance } from '../../src/core/time-off/time-off';
import { parseFrontmatter } from '../../src/core/fs/frontmatter';
import { tempDir } from './helpers';

const vacation = (start: string, end = start, extra = {}) => ({ type: 'vacation' as const, start, end, note: '', ...extra });

describe('time off', () => {
  it('keeps one readable Markdown file per person', async () => {
    const v = await tempDir();
    const e = await saveTimeOff(v, 'Ana Costa', vacation('2026-12-22', '2027-01-02', { note: 'Christmas' }));
    await saveTimeOff(v, 'Rui Matos', { type: 'sick', start: '2026-11-10', end: '2026-11-10', half: 'am', note: '' });
    const file = await fs.readFile(path.join(v, 'Time off', 'Ana Costa.md'), 'utf8');
    const { data } = parseFrontmatter(file);
    expect(data).toMatchObject({ person: 'Ana Costa', allowance: DEFAULT_ALLOWANCE, entries: [{ id: e.id, type: 'vacation', start: '2026-12-22', end: '2027-01-02', note: 'Christmas' }] });
    const people = await listTimeOff(v);
    expect(people.map((p) => p.person)).toEqual(['Ana Costa', 'Rui Matos']);
    expect(people[1].entries[0]).toMatchObject({ type: 'sick', half: 'am' });
  });

  it('edits and deletes entries, keeping them sorted', async () => {
    const v = await tempDir();
    const a = await saveTimeOff(v, 'Ana', vacation('2026-08-03', '2026-08-14'));
    await saveTimeOff(v, 'Ana', vacation('2026-04-06'));
    await saveTimeOff(v, 'Ana', { ...vacation('2026-08-10', '2026-08-21'), id: a.id });
    let [ana] = await listTimeOff(v);
    expect(ana.entries.map((e) => e.start)).toEqual(['2026-04-06', '2026-08-10']);
    await deleteTimeOff(v, 'Ana', a.id);
    [ana] = await listTimeOff(v);
    expect(ana.entries).toHaveLength(1);
    await expect(deleteTimeOff(v, 'Ana', a.id)).rejects.toThrow(/no longer exists/);
  });

  it('rejects invalid and overlapping entries, but allows a morning and an afternoon', async () => {
    const v = await tempDir();
    await saveTimeOff(v, 'Ana', vacation('2026-08-03', '2026-08-07'));
    await expect(saveTimeOff(v, 'Ana', vacation('2026-08-07', '2026-08-10'))).rejects.toThrow(/overlaps/);
    await expect(saveTimeOff(v, 'Ana', vacation('2026-09-10', '2026-09-01'))).rejects.toThrow(/before the first/);
    await expect(saveTimeOff(v, 'Ana', vacation('2026-02-30'))).rejects.toThrow(/valid dates/);
    await expect(saveTimeOff(v, 'Ana', vacation('2026-09-01', '2026-09-02', { half: 'am' }))).rejects.toThrow(/half day/);
    await expect(saveTimeOff(v, 'Ana', vacation('2026-01-01', '2027-06-01'))).rejects.toThrow(/one year/);
    await saveTimeOff(v, 'Ana', vacation('2026-10-02', '2026-10-02', { half: 'am' }));
    await expect(saveTimeOff(v, 'Ana', { type: 'training', start: '2026-10-02', end: '2026-10-02', half: 'pm', note: 'Meetup' })).resolves.toBeTruthy();
    await expect(saveTimeOff(v, 'Ana', vacation('2026-10-02'))).rejects.toThrow(/overlaps/);
  });

  it('stores the allowance, per year when needed', async () => {
    const v = await tempDir();
    await setTimeOffAllowance(v, 'Ana', 25);
    await setTimeOffAllowance(v, 'Ana', 27.5, '2026');
    const [ana] = await listTimeOff(v);
    expect(ana.allowance).toBe(25);
    expect(ana.allowanceByYear).toEqual({ '2026': 27.5 });
    await expect(setTimeOffAllowance(v, 'Ana', -1)).rejects.toThrow();
  });

  it('makes safe file names from people names', () => {
    expect(personFileName('Ana Costa')).toBe('Ana Costa.md');
    expect(personFileName('a/b: c?')).toBe('a b c.md');
    expect(() => personFileName('  ')).toThrow();
  });
});

describe('leave', () => {
  it('stores leave with its kind', async () => {
    const v = await tempDir();
    await saveTimeOff(v, 'Ana', { type: 'leave', start: '2026-09-07', end: '2026-10-16', note: 'Parental leave' });
    const [ana] = await listTimeOff(v);
    expect(ana.entries[0]).toMatchObject({ type: 'leave', start: '2026-09-07', end: '2026-10-16', note: 'Parental leave' });
  });
});
