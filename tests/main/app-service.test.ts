import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppService } from '../../src/main/services/app-service';
import { tempDir } from '../core/helpers';

const services: AppService[] = [];
async function service() {
  const dir = await tempDir('service');
  const s = new AppService(path.join(dir, 'settings.json'), { pickFolder: async () => null, revealInFolder: () => undefined, notifyVaultChanged: () => undefined,
    updates: { status: () => ({ mode: 'off', current: '0.0.0', state: 'idle' }), check: async () => ({ mode: 'off', current: '0.0.0', state: 'idle' }), install: async () => undefined } });
  services.push(s);
  return { s, dir };
}
afterEach(async () => { await Promise.all(services.splice(0).map((s) => s.stop())); });

describe('AppService', () => {
  it('creates a vault in its own subfolder and serves it over the invoke contract', async () => {
    const { s, dir } = await service();
    const created = await s.invoke('createVault', ['Team Notes', dir, false]);
    expect(created.ok).toBe(true);
    const vault = (created as { ok: true; value: { id: string; path: string } }).value;
    expect(vault.path).toBe(path.join(dir, 'Team Notes'));
    const boards = await s.invoke('listBoards', [vault.id]);
    expect(boards).toMatchObject({ ok: true, value: [{ name: 'Team board' }] });
  });

  it('maps errors to codes and rejects unknown methods', async () => {
    const { s } = await service();
    expect(await s.invoke('listBoards', ['nope'])).toMatchObject({ ok: false, error: { code: 'invalid', message: 'unknown vault' } });
    expect(await s.invoke('constructor', [])).toMatchObject({ ok: false, error: { code: 'error' } });
  });

  it('migrates a legacy vault the first time it is opened', async () => {
    const { s, dir } = await service();
    const legacy = path.join(dir, 'Old');
    await fs.mkdir(path.join(legacy, 'Boards', 'b'), { recursive: true });
    await fs.writeFile(path.join(legacy, '_cofre.md'), '---\nid: aaaa1111\nnome: Antigo\n---\n');
    await fs.writeFile(path.join(legacy, 'Boards', 'b', '_board.md'), '---\nnome: B\nestados:\n  - id: x\n    nome: X\n---\n');
    const opened = await s.invoke('openFolder', [legacy]);
    expect(opened).toMatchObject({ ok: true, value: { status: 'opened', vault: { id: 'aaaa1111', name: 'Antigo' } } });
    await expect(fs.stat(path.join(legacy, '_vault.md'))).resolves.toBeTruthy();
    expect(await s.invoke('listBoards', ['aaaa1111'])).toMatchObject({ ok: true, value: [{ name: 'B', columns: [{ id: 'x', name: 'X' }] }] });
  });
});
