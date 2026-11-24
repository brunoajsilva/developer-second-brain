import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apagarDoc, caminhoNoCofre, criarDoc, criarPasta, apagarPasta, listarPastas, renomearPasta, gravarDoc, guardarAnexo, lerDoc, listarDocs, moverDoc } from '../src/core/docs';
import { criarCofre } from '../src/core/cofre';
import { ConflitoErro } from '../src/core/armazem';
import { pastaTemp } from './util';

async function cofre() {
  const d = await pastaTemp();
  await criarCofre(d, 'T', false, []);
  return d;
}

describe('docs', () => {
  it('cria, lista (com título do primeiro #), lê e grava com hash', async () => {
    const d = await cofre();
    await criarDoc(d, 'Arquitetura/ADR-001 Mensageria.md', '# Mensageria entre Cards e MDK\n\ntexto');
    const l = await listarDocs(d);
    expect(l).toHaveLength(1);
    expect(l[0].titulo).toBe('Mensageria entre Cards e MDK');
    const r = await lerDoc(d, l[0].path);
    const g = await gravarDoc(d, l[0].path, r.texto + '\nmais', r.hash);
    expect(g.hash).not.toBe(r.hash);
    await expect(gravarDoc(d, l[0].path, 'outra', r.hash)).rejects.toBeInstanceOf(ConflitoErro);
    await expect(criarDoc(d, l[0].path, 'x')).rejects.toBeInstanceOf(ConflitoErro);
  });

  it('recusa caminhos fora de Docs e nomes reservados', async () => {
    const d = await cofre();
    await expect(criarDoc(d, '../Boards/x.md', 'x')).rejects.toThrow();
    await expect(criarDoc(d, '_modelos/x.md', 'x')).rejects.toThrow();
    await expect(criarDoc(d, 'sem-extensao', 'x')).rejects.toThrow();
    await expect(lerDoc(d, 'nao-existe.md')).rejects.toThrow(/not found/);
  });

  it('mover e apagar (para .lixo, e remove pastas vazias)', async () => {
    const d = await cofre();
    await criarDoc(d, 'A/B/pagina.md', '# P');
    await moverDoc(d, 'A/B/pagina.md', 'C/pagina.md');
    expect((await listarDocs(d)).map((x) => x.path)).toEqual(['C/pagina.md']);
    await expect(moverDoc(d, 'C/pagina.md', 'C/pagina.md')).resolves.toBeUndefined();
    await apagarDoc(d, 'C/pagina.md');
    expect(await listarDocs(d)).toEqual([]);
    await expect(fs.stat(path.join(d, 'Docs', 'C'))).rejects.toThrow();
    const lixo = await fs.readdir(path.join(d, '.lixo'));
    expect(lixo).toHaveLength(1);
  });

  it('gere pastas: criar vazia, listar, renomear com conteudo, apagar', async () => {
    const d = await cofre();
    await criarPasta(d, 'Vazia/Sub');
    await criarDoc(d, 'Arq/X.md', '# X');
    expect(await listarPastas(d)).toEqual(expect.arrayContaining(['Vazia', 'Vazia/Sub', 'Arq']));
    await expect(criarPasta(d, 'Arq')).rejects.toThrow();
    await expect(criarPasta(d, '_x')).rejects.toThrow();
    await renomearPasta(d, 'Arq', 'Arquitetura');
    expect((await listarDocs(d)).map((x) => x.path)).toContain('Arquitetura/X.md');
    await expect(renomearPasta(d, 'Arquitetura', 'Arquitetura/Dentro')).rejects.toThrow();
    await apagarPasta(d, 'Arquitetura');
    expect(await listarPastas(d)).not.toContain('Arquitetura');
  });

  it('guarda imagens coladas em _anexos e não as lista como páginas', async () => {
    const d = await cofre();
    await criarDoc(d, 'Runbooks/Deploy.md', '# Deploy');
    const rel = await guardarAnexo(d, 'Runbooks/Deploy.md', 'png', new Uint8Array([137, 80, 78, 71]));
    expect(rel).toMatch(/^_anexos\/imagem-\d{8}-\d{6}\.png$/);
    expect((await fs.readFile(path.join(d, 'Docs', 'Runbooks', rel))).length).toBe(4);
    const rel2 = await guardarAnexo(d, 'Runbooks/Deploy.md', 'png', new Uint8Array([1]));
    expect(rel2).not.toBe(rel);
    await expect(guardarAnexo(d, 'Runbooks/Deploy.md', 'exe', new Uint8Array([1]))).rejects.toThrow();
    expect((await listarDocs(d)).map((x) => x.path)).toEqual(['Runbooks/Deploy.md']);
  });

  it('caminhoNoCofre não deixa sair do cofre nem ler pastas escondidas', async () => {
    const d = await cofre();
    expect(caminhoNoCofre(d, 'Docs/x/_anexos/a.png')).toBe(path.join(d, 'Docs', 'x', '_anexos', 'a.png'));
    expect(() => caminhoNoCofre(d, '../x')).toThrow();
    expect(() => caminhoNoCofre(d, '.lixo/x')).toThrow();
  });
});
