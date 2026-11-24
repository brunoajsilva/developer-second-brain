import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createVault, initializeVault, inspectFolder, readVaultMeta } from '../../src/core/vault/vault';
import { listBoards } from '../../src/core/boards/boards';
import { listDocs } from '../../src/core/docs/docs';
import { addTeamMember, listTeam, removeTeamMember } from '../../src/core/vault/team';
import { tempDir } from './helpers';

describe('vaults', () => {
  it('creates a vault with its structure and sample content', async () => {
    const dir = await tempDir();
    const meta = await createVault(dir, 'Cards Team', true, []);
    expect(meta.id).toMatch(/^[0-9a-f]{8}$/);
    expect((await readVaultMeta(dir))?.name).toBe('Cards Team');
    await expect(fs.stat(path.join(dir, '_vault.md'))).resolves.toBeTruthy();
    for (const s of ['Docs', 'Boards']) expect((await fs.stat(path.join(dir, s))).isDirectory()).toBe(true);
    expect((await listBoards(dir))[0].columns.map((c) => c.name)).toEqual(['To do', 'In progress', 'Blocked', 'Done']);
    expect((await listDocs(dir)).map((d) => d.path)).toContain('User guide/Welcome.md');
  });

  it('rejects nested, duplicate and copied vaults', async () => {
    const a = await tempDir('a');
    const metaA = await createVault(a, 'A', false, []);
    const registered = [{ id: metaA.id, name: 'A', path: a }];
    await expect(createVault(path.join(a, 'inside'), 'B', false, registered)).rejects.toThrow(/inside the vault/);
    await expect(inspectFolder(a, registered)).rejects.toThrow(/already in the list/);
    await expect(createVault(path.dirname(a), 'Parent', false, registered)).rejects.toThrow();
    const copy = await tempDir('copy');
    await fs.cp(a, copy, { recursive: true });
    await expect(inspectFolder(copy, registered)).rejects.toThrow(/identifier/i);
  });

  it('opening a folder without _vault.md asks to convert it and leaves its files alone', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, 'Docs'), { recursive: true });
    await fs.writeFile(path.join(dir, 'Docs', 'existing.md'), '# Existing\n');
    expect((await inspectFolder(dir, [])).meta).toBeNull();
    await initializeVault(dir, { id: 'abc12345', name: 'Converted', description: '' });
    expect(await fs.readFile(path.join(dir, 'Docs', 'existing.md'), 'utf8')).toBe('# Existing\n');
    expect((await readVaultMeta(dir))?.id).toBe('abc12345');
  });

  it('keeps the team in _team.md', async () => {
    const dir = await tempDir();
    await createVault(dir, 'T', false, []);
    await addTeamMember(dir, 'Ana Costa');
    await addTeamMember(dir, 'ana costa');
    await addTeamMember(dir, 'Rui Matos');
    expect(await listTeam(dir)).toEqual(['Ana Costa', 'Rui Matos']);
    await removeTeamMember(dir, 'Ana Costa');
    expect(await listTeam(dir)).toEqual(['Rui Matos']);
    expect(await fs.readFile(path.join(dir, '_team.md'), 'utf8')).toMatch(/^# Team/);
  });
});
