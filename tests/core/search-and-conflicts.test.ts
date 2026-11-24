import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createVault } from '../../src/core/vault/vault';
import { createDoc } from '../../src/core/docs/docs';
import { saveBoard, saveCard } from '../../src/core/boards/boards';
import { buildSearchIndex, findBacklinks, searchIndex } from '../../src/core/search/search-index';
import { listConflicts, originalNameOf, resolveConflict } from '../../src/core/conflicts/conflicts';
import { tempDir } from './helpers';

describe('search and links', () => {
  it('finds text in pages and cards, ignores accents, and computes backlinks', async () => {
    const v = await tempDir();
    await createVault(v, 'T', false, []);
    await saveBoard(v, { name: 'Sprint', columns: [{ id: '', name: 'To do' }] });
    const card = await saveCard(v, { board: 'sprint', title: 'Fix timeout', status: 'to-do', assignee: '', due: '', priority: '', tags: [], body: 'See [[ADR-001 Messaging]] and logs.' }, null, 'x');
    await createDoc(v, 'Arch/ADR-001 Messaging.md', '# Messaging\n\nValidação moves to a queue. See [[#' + card.id + ']].');
    await createDoc(v, 'Other.md', '# Other\n\nno links');
    const index = await buildSearchIndex(v);
    const hits = searchIndex(index, 'id', 'T', 'validacao queue');
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('doc');
    expect(hits[0].excerpt).toContain('queue');
    expect(searchIndex(index, 'id', 'T', 'timeout')[0].kind).toBe('card');
    expect(searchIndex(index, 'id', 'T', 'messag')[0].title).toBe('ADR-001 Messaging');
    expect(findBacklinks(index, { kind: 'doc', title: 'ADR-001 Messaging', ref: 'Arch/ADR-001 Messaging.md' }).map((b) => b.title)).toEqual(['Fix timeout']);
    expect(findBacklinks(index, { kind: 'card', title: 'Fix timeout', ref: 'sprint/' + card.id }).map((b) => b.title)).toEqual(['ADR-001 Messaging']);
  });
});

describe('sync conflict copies', () => {
  it('recognizes OneDrive and Dropbox patterns', () => {
    expect(originalNameOf('Access-DESKTOP-ABC123')).toBe('Access');
    expect(originalNameOf('Access-LAPTOP7K2')).toBe('Access');
    expect(originalNameOf('Access (conflicted copy 2026-11-24)')).toBe('Access');
    expect(originalNameOf('Access (cópia em conflito de Ana)')).toBe('Access');
    expect(originalNameOf('ADR-001 Messaging')).toBeNull();
    expect(originalNameOf('welcome')).toBeNull();
    expect(originalNameOf('Deploy-Cards')).toBeNull();
  });

  it('lists and resolves (keep the copy or the original) without deleting anything for good', async () => {
    const v = await tempDir();
    await createVault(v, 'T', false, []);
    await createDoc(v, 'Access.md', '# original');
    await createDoc(v, 'Access-DESKTOP-ABC123.md', '# from someone else');
    await createDoc(v, 'Alone-DESKTOP-ABC123.md', '# no original');
    const conflicts = await listConflicts(v);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].original).toBe('Docs/Access.md');
    await resolveConflict(v, conflicts[0].copy, 'copy');
    expect(await fs.readFile(path.join(v, 'Docs', 'Access.md'), 'utf8')).toBe('# from someone else');
    expect(await listConflicts(v)).toHaveLength(0);
    expect((await fs.readdir(path.join(v, '.trash'))).length).toBeGreaterThan(0);
  });
});
