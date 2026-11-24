import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apagarBoard, apagarCartao, guardarBoard, guardarCartao, listarBoards, listarCartoes, moverCartao } from '../src/core/boards';
import { ConflitoErro } from '../src/core/armazem';
import { criarCofre } from '../src/core/cofre';
import { parse } from '../src/core/frontmatter';
import { pastaTemp } from './util';
import type { CartaoEntrada } from '../src/shared/types';

const entrada = (board: string, titulo: string, extra: Partial<CartaoEntrada> = {}): CartaoEntrada => ({
  board, titulo, estado: 'a-fazer', responsavel: '', prazo: '', prioridade: '', etiquetas: [], corpo: '', ...extra
});

async function preparar() {
  const d = await pastaTemp();
  await criarCofre(d, 'T', false, []);
  const b = await guardarBoard(d, { nome: 'Sprint 24', estados: [{ id: '', nome: 'A fazer' }, { id: '', nome: 'Em curso' }, { id: '', nome: 'Feito' }] });
  return { d, b };
}

describe('boards', () => {
  it('cria board em _board.md com ids derivados e estado final', async () => {
    const { d, b } = await preparar();
    expect(b.id).toBe('sprint-24');
    expect(b.estados.map((e) => e.id)).toEqual(['a-fazer', 'em-curso', 'feito']);
    expect(b.estados[2].fim).toBe(true);
    const raw = await fs.readFile(path.join(d, 'Boards', 'sprint-24', '_board.md'), 'utf8');
    expect(raw.startsWith('---\n')).toBe(true);
    expect((await listarBoards(d))[0].nome).toBe('Sprint 24');
  });

  it('cria cartões com YAML válido, ficheiro slug-id.md e ordem crescente', async () => {
    const { d } = await preparar();
    const c1 = await guardarCartao(d, entrada('sprint-24', 'Corrigir timeout: Cards', { prazo: '2026-12-04', etiquetas: ['cards', 'backend'], prioridade: 'alta', responsavel: 'Bruno Silva', corpo: '- [x] a\n- [ ] b' }), null, 'Bruno Silva');
    const c2 = await guardarCartao(d, entrada('sprint-24', 'Segundo'), null, 'Bruno Silva');
    expect(c1.ordem < c2.ordem).toBe(true);
    const nomes = (await fs.readdir(path.join(d, 'Boards', 'sprint-24'))).filter((n) => !n.startsWith('_'));
    expect(nomes.some((n) => n === `corrigir-timeout-cards-${c1.id}.md`)).toBe(true);
    const raw = await fs.readFile(path.join(d, 'Boards', 'sprint-24', `corrigir-timeout-cards-${c1.id}.md`), 'utf8');
    const p = parse(raw);
    expect(p.valido).toBe(true);
    expect(p.dados.prazo).toBe('2026-12-04'); // string entre aspas, não Date
    expect(p.dados.etiquetas).toEqual(['cards', 'backend']);
    expect(p.corpo).toContain('- [x] a');
    const lidos = await listarCartoes(d, 'sprint-24');
    expect(lidos.find((c) => c.id === c1.id)?.prazo).toBe('2026-12-04');
  });

  it('lê cartões escritos à mão (prazo sem aspas, etiquetas separadas por vírgulas)', async () => {
    const { d } = await preparar();
    await fs.writeFile(path.join(d, 'Boards', 'sprint-24', 'a-mao-zzzz.md'), '---\ntitulo: A mao\nestado: inexistente\nprazo: 2026-12-04\netiquetas: x, y\n---\n\nTexto\n');
    const [c] = await listarCartoes(d, 'sprint-24');
    expect(c.estado).toBe('a-fazer');
    expect(c.prazo).toBe('2026-12-04');
    expect(c.etiquetas).toEqual(['x', 'y']);
    expect(c.id).toBe('zzzz');
  });

  it('mover grava só o ficheiro do cartão movido', async () => {
    const { d } = await preparar();
    const a = await guardarCartao(d, entrada('sprint-24', 'A'), null, 'x');
    const b = await guardarCartao(d, entrada('sprint-24', 'B'), null, 'x');
    const c = await guardarCartao(d, entrada('sprint-24', 'C'), null, 'x');
    const dir = path.join(d, 'Boards', 'sprint-24');
    const antes = new Map<string, string>();
    for (const n of await fs.readdir(dir)) antes.set(n, await fs.readFile(path.join(dir, n), 'utf8'));
    await moverCartao(d, 'sprint-24', c.id, 'a-fazer', a.id); // C passa para antes de A
    const alterados: string[] = [];
    for (const n of await fs.readdir(dir)) if ((await fs.readFile(path.join(dir, n), 'utf8')) !== antes.get(n)) alterados.push(n);
    expect(alterados).toHaveLength(1);
    expect(alterados[0]).toContain(c.id);
    expect((await listarCartoes(d, 'sprint-24')).map((x) => x.titulo)).toEqual(['C', 'A', 'B']);
    await moverCartao(d, 'sprint-24', a.id, 'em-curso', null);
    const l = await listarCartoes(d, 'sprint-24');
    expect(l.find((x) => x.id === a.id)?.estado).toBe('em-curso');
    await moverCartao(d, 'sprint-24', b.id, 'a-fazer', c.id);
    expect((await listarCartoes(d, 'sprint-24')).filter((x) => x.estado === 'a-fazer').map((x) => x.titulo)).toEqual(['B', 'C']);
  });

  it('muitas inserções no mesmo sítio mantêm a ordem', async () => {
    const { d } = await preparar();
    const base = await guardarCartao(d, entrada('sprint-24', 'Base'), null, 'x');
    for (let i = 0; i < 30; i++) {
      const n = await guardarCartao(d, entrada('sprint-24', 'N' + i), null, 'x');
      await moverCartao(d, 'sprint-24', n.id, 'a-fazer', base.id);
    }
    const l = (await listarCartoes(d, 'sprint-24')).map((c) => c.titulo);
    expect(l).toHaveLength(31);
    expect(l[l.length - 1]).toBe('Base');
    expect(l.slice(0, 30)).toEqual(Array.from({ length: 30 }, (_, i) => 'N' + i));
  });

  it('recupera quando dois PCs criaram cartões com a mesma chave de ordem', async () => {
    const { d } = await preparar();
    const dir = path.join(d, 'Boards', 'sprint-24');
    for (const [id, t] of [['aaaa', 'X'], ['bbbb', 'Y'], ['cccc', 'Z']]) await fs.writeFile(path.join(dir, `${t.toLowerCase()}-${id}.md`), `---\nid: ${id}\ntitulo: ${t}\nestado: a-fazer\nordem: V\n---\n\n`);
    await moverCartao(d, 'sprint-24', 'cccc', 'a-fazer', 'bbbb');
    const l = await listarCartoes(d, 'sprint-24');
    const ordens = l.map((c) => c.ordem);
    expect(new Set(ordens).size).toBe(3);
    expect(l.map((c) => c.titulo).indexOf('Z')).toBeLessThan(l.map((c) => c.titulo).indexOf('Y'));
  });

  it('editar com hash antigo dá conflito e não sobrescreve', async () => {
    const { d } = await preparar();
    const c = await guardarCartao(d, entrada('sprint-24', 'Cartao', { corpo: 'v1' }), null, 'Bruno');
    await guardarCartao(d, { ...entrada('sprint-24', 'Cartao', { corpo: 'v2 da Ana' }), id: c.id }, c.hash, 'Ana'); // outro PC
    await expect(guardarCartao(d, { ...entrada('sprint-24', 'Cartao', { corpo: 'v2 do Bruno' }), id: c.id }, c.hash, 'Bruno')).rejects.toBeInstanceOf(ConflitoErro);
    expect((await listarCartoes(d, 'sprint-24'))[0].corpo).toBe('v2 da Ana');
  });

  it('mudar o estado no editor põe o cartão no fim da coluna nova', async () => {
    const { d } = await preparar();
    const a = await guardarCartao(d, entrada('sprint-24', 'A', { estado: 'em-curso' }), null, 'x');
    const b = await guardarCartao(d, entrada('sprint-24', 'B'), null, 'x');
    const nb = await guardarCartao(d, { ...entrada('sprint-24', 'B', { estado: 'em-curso' }), id: b.id }, b.hash, 'x');
    expect(nb.ordem > a.ordem).toBe(true);
  });

  it('remover um estado passa os cartões para o primeiro', async () => {
    const { d, b } = await preparar();
    const c = await guardarCartao(d, entrada('sprint-24', 'A', { estado: 'em-curso' }), null, 'x');
    await guardarBoard(d, { id: b.id, nome: b.nome, estados: b.estados.filter((e) => e.id !== 'em-curso') });
    const l = await listarCartoes(d, 'sprint-24');
    expect(l[0].estado).toBe('a-fazer');
    expect(parse(await fs.readFile(l[0].ficheiro, 'utf8')).dados.estado).toBe('a-fazer');
    expect(c.id).toBe(l[0].id);
  });

  it('apagar cartão e board vai para .lixo', async () => {
    const { d } = await preparar();
    const c = await guardarCartao(d, entrada('sprint-24', 'A'), null, 'x');
    await apagarCartao(d, 'sprint-24', c.id);
    expect(await listarCartoes(d, 'sprint-24')).toHaveLength(0);
    await apagarBoard(d, 'sprint-24');
    expect(await listarBoards(d)).toHaveLength(0);
    const lixo = await fs.readdir(path.join(d, '.lixo'));
    expect(lixo).toHaveLength(2);
  });
});
