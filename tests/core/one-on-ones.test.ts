import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CADENCE_DAYS, deleteOneOnOne, listOneOnOnes, readOneOnOne, setOneOnOneAgenda, setOneOnOneCadence, startOneOnOne, writeOneOnOne
} from '../../src/core/one-on-ones/one-on-ones';
import { ConflictError } from '../../src/core/fs/file-store';
import { listDocs } from '../../src/core/docs/docs';
import { buildSearchIndex, searchIndex } from '../../src/core/search/search-index';
import { tempDir } from './helpers';

describe('1:1 notes', () => {
  it('collects agenda topics and moves them into the note when the 1:1 starts', async () => {
    const v = await tempDir();
    await setOneOnOneAgenda(v, 'Ana Costa', ['Career goals for 2027', '  ', 'Feedback on the RFC']);
    let [ana] = await listOneOnOnes(v);
    expect(ana).toMatchObject({ person: 'Ana Costa', cadenceDays: DEFAULT_CADENCE_DAYS, agenda: ['Career goals for 2027', 'Feedback on the RFC'], meetings: [] });

    const id = await startOneOnOne(v, 'Ana Costa', '2026-11-24');
    expect(id).toBe('2026-11-24');
    const note = await readOneOnOne(v, 'Ana Costa', id);
    expect(note.text).toContain('# 1:1 with Ana Costa, 24 November 2026');
    expect(note.text).toContain('- Career goals for 2027\n- Feedback on the RFC');
    [ana] = await listOneOnOnes(v);
    expect(ana.agenda).toEqual([]);
    expect(await startOneOnOne(v, 'Ana Costa', '2026-11-24')).toBe('2026-11-24-2');
  });

  it('lists meetings newest first and gathers open action items across them', async () => {
    const v = await tempDir();
    const a = await startOneOnOne(v, 'Rui', '2026-10-01');
    const b = await startOneOnOne(v, 'Rui', '2026-11-01');
    const noteA = await readOneOnOne(v, 'Rui', a);
    await writeOneOnOne(v, 'Rui', a, noteA.text.replace('## Notes\n\n', '## Notes\n\nTalked about on-call load.\n').replace('- [ ] \n', '- [ ] Book the AWS course\n- [x] Share the roadmap\n'), noteA.hash);
    const noteB = await readOneOnOne(v, 'Rui', b);
    await writeOneOnOne(v, 'Rui', b, noteB.text.replace('- [ ] \n', '- [ ] Pair on the queue migration\n'), noteB.hash);
    const [rui] = await listOneOnOnes(v);
    expect(rui.meetings.map((m) => m.id)).toEqual(['2026-11-01', '2026-10-01']);
    expect(rui.meetings[1]).toMatchObject({ openActions: 1 });
    expect(rui.meetings[1].excerpt).toContain('Talked about on-call load');
    expect(rui.openActions.map((x) => x.text)).toEqual(['Pair on the queue migration', 'Book the AWS course']);
    const lines = (await readOneOnOne(v, 'Rui', a)).text.split('\n');
    const action = rui.openActions.find((x) => x.meeting === a)!;
    expect(lines[action.line]).toBe('- [ ] Book the AWS course');
    await expect(writeOneOnOne(v, 'Rui', a, 'stale', noteA.hash)).rejects.toBeInstanceOf(ConflictError);
  });

  it('stores the cadence and deletes notes to the trash', async () => {
    const v = await tempDir();
    await setOneOnOneCadence(v, 'Ana', 7);
    const id = await startOneOnOne(v, 'Ana', '2026-11-24');
    expect((await listOneOnOnes(v))[0].cadenceDays).toBe(7);
    await deleteOneOnOne(v, 'Ana', id);
    expect((await listOneOnOnes(v))[0].meetings).toEqual([]);
    expect(await fs.readdir(path.join(v, '.trash'))).toHaveLength(1);
    await expect(setOneOnOneCadence(v, 'Ana', 2.5)).rejects.toThrow();
    await expect(readOneOnOne(v, 'Ana', '../x')).rejects.toThrow();
  });

  it('stays out of Docs and out of search', async () => {
    const v = await tempDir();
    await setOneOnOneAgenda(v, 'Ana', ['salary review']);
    await startOneOnOne(v, 'Ana', '2026-11-24');
    expect(await listDocs(v)).toEqual([]);
    expect(searchIndex(await buildSearchIndex(v), 'v', 'V', 'salary')).toEqual([]);
  });
});

describe('feedback log', () => {
  it('adds, edits and deletes feedback in a readable feedback.md', async () => {
    const { saveFeedback, deleteFeedback, parseFeedback } = await import('../../src/core/one-on-ones/one-on-ones');
    const v = await tempDir();
    await saveFeedback(v, 'Ana', { date: '2026-11-20', kind: 'improve', text: 'Write smaller PRs.' });
    await saveFeedback(v, 'Ana', { date: '2026-11-24', kind: 'praise', text: 'Led the incident review calmly.\n\n## not a heading' });
    await saveFeedback(v, 'Ana', { date: '2026-11-24', kind: 'note', text: 'Wants to mentor a junior.' });
    const file = await fs.readFile(path.join(v, 'One-on-ones', 'Ana', 'feedback.md'), 'utf8');
    expect(file).toMatch(/^# Feedback about Ana/);
    expect(file).toContain('## 2026-11-24 · Praise');
    expect(file).toContain('### not a heading');
    let [ana] = await listOneOnOnes(v);
    expect(ana.feedback.map((f) => [f.date, f.kind])).toEqual([['2026-11-24', 'note'], ['2026-11-24', 'praise'], ['2026-11-20', 'improve']]);
    expect(ana.feedback).toHaveLength(3);
    const improve = ana.feedback.find((f) => f.kind === 'improve')!;
    await saveFeedback(v, 'Ana', { id: improve.id, date: improve.date, kind: 'improve', text: 'Write smaller PRs; already better.' });
    await deleteFeedback(v, 'Ana', ana.feedback.find((f) => f.kind === 'note')!.id);
    [ana] = await listOneOnOnes(v);
    expect(ana.feedback.map((f) => f.text)).toEqual(['Led the incident review calmly.\n\n### not a heading', 'Write smaller PRs; already better.']);
    expect(parseFeedback('# x\n\n## 2026-01-02 · Elogio\n\nBom trabalho').entries[0]).toMatchObject({ kind: 'praise', text: 'Bom trabalho' });
    await expect(saveFeedback(v, 'Ana', { date: '2026-11-24', kind: 'note', text: '   ' })).rejects.toThrow(/Write the feedback/);
  });
});

describe('reviews', () => {
  it('creates, edits, renames and deletes free documents per person', async () => {
    const m = await import('../../src/core/one-on-ones/one-on-ones');
    const v = await tempDir();
    const id = await m.createReview(v, 'Ana', '  2026 review ');
    expect(id).toBe('2026 review');
    await expect(m.createReview(v, 'Ana', '2026 review')).rejects.toThrow(/already/);
    const doc = await m.readReview(v, 'Ana', id);
    await m.writeReview(v, 'Ana', id, '# Summary\n\nStrong year; led the queue migration.', doc.hash);
    await expect(m.writeReview(v, 'Ana', id, 'stale', doc.hash)).rejects.toBeInstanceOf(ConflictError);
    let [ana] = await listOneOnOnes(v);
    expect(ana.reviews).toMatchObject([{ id: '2026 review', excerpt: 'Strong year; led the queue migration.' }]);
    expect(ana.meetings).toEqual([]);
    const renamed = await m.renameReview(v, 'Ana', id, 'Performance review 2026');
    expect(await fs.readFile(path.join(v, 'One-on-ones', 'Ana', 'Reviews', 'Performance review 2026.md'), 'utf8')).toContain('Strong year');
    await expect(m.readReview(v, 'Ana', '../feedback')).rejects.toThrow();
    expect(await listDocs(v)).toEqual([]);
    expect(searchIndex(await buildSearchIndex(v), 'v', 'V', 'migration')).toEqual([]);
    await m.deleteReview(v, 'Ana', renamed);
    [ana] = await listOneOnOnes(v);
    expect(ana.reviews).toEqual([]);
  });
});
