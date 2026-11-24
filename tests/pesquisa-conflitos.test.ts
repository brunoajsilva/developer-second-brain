import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { criarCofre } from '../src/core/cofre';
import { criarDoc } from '../src/core/docs';
import { guardarBoard, guardarCartao } from '../src/core/boards';
import { construirIndice, pesquisar, referidoEm } from '../src/core/pesquisa';
import { listarConflitos, originalDe, resolverConflito } from '../src/core/conflitos';
import { pastaTemp } from './util';

describe('pesquisa e ligações', () => {
  it('encontra texto em docs e cartões, ignora acentos, e calcula "referido em"', async () => {
    const d = await pastaTemp();
    await criarCofre(d, 'T', false, []);
    await guardarBoard(d, { nome: 'Sprint', estados: [{ id: '', nome: 'A fazer' }] });
    const c = await guardarCartao(d, { board: 'sprint', titulo: 'Corrigir timeout', estado: 'a-fazer', responsavel: '', prazo: '', prioridade: '', etiquetas: [], corpo: 'Ver [[ADR-001 Mensageria]] e logs.' }, null, 'x');
    await criarDoc(d, 'Arq/ADR-001 Mensageria.md', '# Mensageria\n\nA validação passa para uma fila. Ver [[#' + c.id + ']].');
    await criarDoc(d, 'Outro.md', '# Outro\n\nsem ligações');
    const ix = await construirIndice(d);
    const r = pesquisar(ix, 'id', 'T', 'validacao fila');
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('doc');
    expect(r[0].excerto).toContain('fila');
    expect(pesquisar(ix, 'id', 'T', 'timeout')[0].tipo).toBe('cartao');
    expect(pesquisar(ix, 'id', 'T', 'mensag')[0].titulo).toBe('Mensageria'); // prefixo
    const refsDoc = referidoEm(ix, { tipo: 'doc', titulo: 'Mensageria', ref: 'Arq/ADR-001 Mensageria.md' });
    expect(refsDoc.map((x) => x.titulo)).toEqual(['Corrigir timeout']);
    const refsCartao = referidoEm(ix, { tipo: 'cartao', titulo: 'Corrigir timeout', ref: 'sprint/' + c.id });
    expect(refsCartao.map((x) => x.titulo)).toEqual(['Mensageria']);
  });
});

describe('cópias de conflito da drive', () => {
  it('reconhece padrões da OneDrive e do Dropbox', () => {
    expect(originalDe('Acessos-DESKTOP-ABC123')).toBe('Acessos');
    expect(originalDe('Acessos-LAPTOP7K2')).toBe('Acessos');
    expect(originalDe('Acessos (conflicted copy 2026-11-24)')).toBe('Acessos');
    expect(originalDe('ADR-001 Mensageria')).toBeNull();
    expect(originalDe('bem-vindo')).toBeNull();
    expect(originalDe('Deploy-Cards')).toBeNull();
  });

  it('lista e resolve (manter a cópia ou o original) sem apagar nada de vez', async () => {
    const d = await pastaTemp();
    await criarCofre(d, 'T', false, []);
    await criarDoc(d, 'Acessos.md', '# original');
    await criarDoc(d, 'Acessos-DESKTOP-ABC123.md', '# da outra pessoa');
    await criarDoc(d, 'Sozinho-DESKTOP-ABC123.md', '# sem original'); // sem original: não é conflito
    const l = await listarConflitos(d);
    expect(l).toHaveLength(1);
    expect(l[0].original).toBe('Docs/Acessos.md');
    await resolverConflito(d, l[0].copia, 'copia');
    expect(await fs.readFile(path.join(d, 'Docs', 'Acessos.md'), 'utf8')).toBe('# da outra pessoa\n'.replace(/\n$/, ''));
    expect(await listarConflitos(d)).toHaveLength(0);
    expect((await fs.readdir(path.join(d, '.lixo'))).length).toBeGreaterThan(0);
  });
});
