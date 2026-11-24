import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateVault } from '../../src/core/vault/migration';
import { readVaultMeta } from '../../src/core/vault/vault';
import { listBoards, readCards } from '../../src/core/boards/boards';
import { listDocs, readDoc } from '../../src/core/docs/docs';
import { listTeam } from '../../src/core/vault/team';
import { SettingsStore } from '../../src/core/settings/settings-store';
import { tempDir } from './helpers';

/** A vault exactly as v0.1 wrote it. */
async function legacyVault(): Promise<string> {
  const v = await tempDir('legacy');
  const w = async (rel: string, text: string) => {
    await fs.mkdir(path.dirname(path.join(v, rel)), { recursive: true });
    await fs.writeFile(path.join(v, rel), text);
  };
  await w('_cofre.md', '---\nid: abcd1234\nnome: Equipa Cards\n---\n\nCofre da equipa.\n');
  await w('_equipa.md', '# Equipa\n\n- Ana Costa\n- Rui Matos\n');
  await w('Boards/sprint/_board.md', '---\nnome: Sprint 24\nestados:\n  - id: a-fazer\n    nome: A fazer\n  - id: feito\n    nome: Feito\n    fim: true\n---\n\nDescrição do sprint\n');
  await w('Boards/sprint/corrigir-x1y2.md', "---\nid: x1y2\ntitulo: Corrigir timeout\nestado: feito\nresponsavel: Ana Costa\nprazo: '2026-12-04'\nprioridade: alta\netiquetas:\n  - backend\nordem: V\ncriado: '2026-11-01T10:00:00'\natualizado: '2026-11-02T10:00:00'\natualizado_por: Ana Costa\n---\n\n- [ ] passo\n");
  await w('Docs/Arquitetura/Visao.md', '# Visão\n\n![](_anexos/imagem-1.png)\n');
  await w('Docs/Arquitetura/_anexos/imagem-1.png', 'png');
  await w('Docs/Notas.md', '---\ntitulo: Notas soltas\n---\n\ntexto\n');
  await w('.lixo/2026-01-01/velho.md', 'x');
  return v;
}

describe('legacy vault migration', () => {
  it('renames files, folders and keys to English, keeping the data', async () => {
    const v = await legacyVault();
    const report = await migrateVault(v);
    expect(report.changed.length).toBeGreaterThan(0);

    expect(await readVaultMeta(v)).toEqual({ id: 'abcd1234', name: 'Equipa Cards', description: 'Cofre da equipa.' });
    await expect(fs.stat(path.join(v, '_cofre.md'))).rejects.toThrow();
    expect(await listTeam(v)).toEqual(['Ana Costa', 'Rui Matos']);
    expect(await fs.readFile(path.join(v, '_team.md'), 'utf8')).toMatch(/^# Team/);
    await expect(fs.stat(path.join(v, '_equipa.md'))).rejects.toThrow();
    expect(await fs.readdir(path.join(v, '.trash'))).toEqual(['2026-01-01']);
    await expect(fs.stat(path.join(v, '.lixo'))).rejects.toThrow();

    const [board] = await listBoards(v);
    expect(board).toMatchObject({ id: 'sprint', name: 'Sprint 24', description: 'Descrição do sprint' });
    expect(board.columns).toEqual([{ id: 'a-fazer', name: 'A fazer' }, { id: 'feito', name: 'Feito', done: true }]);
    const [card] = await readCards(v, 'sprint');
    expect(card).toMatchObject({ id: 'x1y2', title: 'Corrigir timeout', status: 'feito', assignee: 'Ana Costa', due: '2026-12-04', priority: 'high', tags: ['backend'], order: 'V', updatedBy: 'Ana Costa', body: '- [ ] passo' });

    expect((await readDoc(v, 'Arquitetura/Visao.md')).text).toContain('](_attachments/imagem-1.png)');
    await expect(fs.stat(path.join(v, 'Docs', 'Arquitetura', '_attachments', 'imagem-1.png'))).resolves.toBeTruthy();
    expect((await readDoc(v, 'Notas.md')).text).toMatch(/^---\ntitle: Notas soltas\n---/);
  });

  it('is idempotent', async () => {
    const v = await legacyVault();
    await migrateVault(v);
    expect((await migrateVault(v)).changed).toEqual([]);
  });

  it('merges a legacy trash into an existing .trash', async () => {
    const v = await legacyVault();
    await fs.mkdir(path.join(v, '.trash', '2026-01-01'), { recursive: true });
    await migrateVault(v);
    expect((await fs.readdir(path.join(v, '.trash'))).sort()).toEqual(['2026-01-01', '2026-01-01-2']);
  });

  it('imports the legacy settings file once', async () => {
    const dir = await tempDir('settings');
    await fs.writeFile(path.join(dir, 'definicoes.json'), JSON.stringify({ utilizador: 'Bruno', abrirUltimo: true, cofreAtivo: 'a1', cofres: [{ id: 'a1', nome: 'Equipa', caminho: '/x', pessoal: true }] }));
    const store = new SettingsStore(path.join(dir, 'settings.json'));
    expect(await store.read()).toEqual({ userName: 'Bruno', openLastVault: true, activeVaultId: 'a1', vaults: [{ id: 'a1', name: 'Equipa', path: '/x', personal: true }] });
    expect(JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8')).userName).toBe('Bruno');
  });
});
