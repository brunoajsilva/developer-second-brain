import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { abrirPastaComoCofre, converterEmCofre, criarCofre, lerCofre } from '../src/core/cofre';
import { listarBoards } from '../src/core/boards';
import { listarDocs } from '../src/core/docs';
import { pastaTemp } from './util';

describe('cofres', () => {
  it('cria um cofre com estrutura e exemplo', async () => {
    const d = await pastaTemp();
    const meta = await criarCofre(d, 'Equipa Cards', true, []);
    expect(meta.id).toMatch(/^[0-9a-f]{8}$/);
    expect((await lerCofre(d))?.nome).toBe('Equipa Cards');
    for (const s of ['Docs', 'Boards']) expect((await fs.stat(path.join(d, s))).isDirectory()).toBe(true);
    expect((await listarBoards(d))[0].estados.map((e) => e.nome)).toEqual(['To do', 'In progress', 'Blocked', 'Done']);
    expect((await listarDocs(d)).map((x) => x.path)).toContain('User guide/Welcome.md');
  });

  it('recusa cofres aninhados, repetidos e com id repetido', async () => {
    const a = await pastaTemp('a');
    const metaA = await criarCofre(a, 'A', false, []);
    const reg = [{ id: metaA.id, nome: 'A', caminho: a }];
    await expect(criarCofre(path.join(a, 'dentro'), 'B', false, reg)).rejects.toThrow(/inside the vault/);
    await expect(abrirPastaComoCofre(a, reg)).rejects.toThrow(/already in the list/);
    const pai = path.dirname(a);
    await expect(criarCofre(pai, 'Pai', false, reg)).rejects.toThrow();
    // cópia da pasta: mesmo id noutro sítio
    const copia = await pastaTemp('copia');
    await fs.cp(a, copia, { recursive: true });
    await expect(abrirPastaComoCofre(copia, reg)).rejects.toThrow(/identifier/i);
  });

  it('abrir uma pasta sem _cofre.md pede conversão e não toca nos ficheiros', async () => {
    const d = await pastaTemp();
    await fs.mkdir(path.join(d, 'Docs'), { recursive: true });
    await fs.writeFile(path.join(d, 'Docs', 'existente.md'), '# Existente\n');
    const r = await abrirPastaComoCofre(d, []);
    expect(r.meta).toBeNull();
    await converterEmCofre(d, { id: 'abc12345', nome: 'Convertido', descricao: '' });
    expect(await fs.readFile(path.join(d, 'Docs', 'existente.md'), 'utf8')).toBe('# Existente\n');
    expect((await lerCofre(d))?.id).toBe('abc12345');
  });
});
