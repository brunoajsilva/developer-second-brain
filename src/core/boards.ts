import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { existe, gravar, ler, paraLixo, ConflitoErro } from './armazem';
import { escrever, parse, txt, dia, lista } from './frontmatter';
import { ErroValidacao, idCurto, reId, resolverDentro, slug } from './caminhos';
import { between } from './fractional';
import type { Board, Cartao, CartaoEntrada, Estado, Prioridade } from '../shared/types';

const FICH_BOARD = '_board.md';
const PRIORIDADES: Prioridade[] = ['', 'baixa', 'media', 'alta'];

const dirBoards = (cofre: string) => path.join(cofre, 'Boards');

export function estadosPadrao(): Estado[] {
  return [
    { id: 'a-fazer', nome: 'To do' },
    { id: 'em-curso', nome: 'In progress' },
    { id: 'feito', nome: 'Done', fim: true }
  ];
}

function limparEstados(es: Estado[]): Estado[] {
  const usados = new Set<string>();
  const out: Estado[] = [];
  for (const e of es) {
    const nome = (e.nome || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 30);
    if (!nome) continue;
    let id = reId.test(e.id || '') && !usados.has(e.id) ? e.id : slug(nome, 30) || 'estado';
    const base = id;
    let k = 2;
    while (usados.has(id)) id = base + '-' + k++;
    usados.add(id);
    out.push({ id, nome, ...(e.fim ? { fim: true } : {}) });
  }
  if (out.length < 1) throw new ErroValidacao('A board needs at least one column.');
  if (out.length > 12) throw new ErroValidacao('A board can have at most 12 columns.');
  if (!out.some((e) => e.fim)) out[out.length - 1].fim = true;
  return out;
}

async function lerBoardDir(dir: string, id: string): Promise<Board | null> {
  const f = path.join(dir, FICH_BOARD);
  if (!(await existe(f))) return null;
  const p = parse((await ler(f)).texto);
  let estados: Estado[] = [];
  const raw = p.dados.estados;
  if (Array.isArray(raw)) {
    estados = raw
      .map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        return { id: txt(o.id), nome: txt(o.nome), fim: o.fim === true };
      })
      .filter((e) => reId.test(e.id) && e.nome)
      .map((e) => ({ id: e.id, nome: e.nome, ...(e.fim ? { fim: true } : {}) }));
  }
  if (estados.length === 0) estados = estadosPadrao();
  return { id, nome: txt(p.dados.nome).trim() || id, descricao: p.corpo.trim(), estados };
}

export async function listarBoards(cofre: string): Promise<Board[]> {
  let ents;
  try {
    ents = await fs.readdir(dirBoards(cofre), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Board[] = [];
  for (const e of ents) {
    if (!e.isDirectory() || !reId.test(e.name)) continue;
    const b = await lerBoardDir(path.join(dirBoards(cofre), e.name), e.name);
    if (b) out.push(b);
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

export async function guardarBoard(cofre: string, b: { id?: string; nome: string; descricao?: string; estados: Estado[] }): Promise<Board> {
  const nome = b.nome.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  if (!nome) throw new ErroValidacao('The board needs a name.');
  const estados = limparEstados(b.estados);
  let id = b.id || '';
  if (id) {
    if (!reId.test(id)) throw new ErroValidacao('invalid board id');
    if (!(await existe(path.join(dirBoards(cofre), id)))) throw new ErroValidacao('board not found');
  } else {
    const base = slug(nome, 30) || 'board';
    id = base;
    let k = 2;
    while (await existe(path.join(dirBoards(cofre), id))) id = base + '-' + k++;
  }
  const dir = path.join(dirBoards(cofre), id);
  await fs.mkdir(dir, { recursive: true });
  await gravar(path.join(dir, FICH_BOARD), escrever({ nome, estados }, b.descricao ?? ''));
  // cartões cujo estado deixou de existir passam para o primeiro estado
  const ids = new Set(estados.map((e) => e.id));
  for (const c of await listarCartoes(cofre, id, estados)) {
    if (!ids.has(c.rawEstado)) await escreverCartaoMover(cofre, id, c.id, estados[0].id, c.ordem);
  }
  return { id, nome, descricao: (b.descricao ?? '').trim(), estados };
}

export async function apagarBoard(cofre: string, id: string): Promise<void> {
  if (!reId.test(id)) throw new ErroValidacao('invalid board id');
  const dir = path.join(dirBoards(cofre), id);
  if (!(await existe(dir))) throw new ErroValidacao('board not found');
  await paraLixo(cofre, dir);
}

// ---------- Cartões

type CartaoRaw = Cartao & { rawEstado: string; ficheiro: string };

function ficheiroDe(cofre: string, boardId: string, nome: string): string {
  return resolverDentro(cofre, 'Boards', boardId + '/' + nome);
}

function paraCartao(boardId: string, ficheiro: string, texto: string, hash: string, estados: Estado[]): CartaoRaw {
  const p = parse(texto);
  const d = p.dados;
  const stem = path.basename(ficheiro, '.md');
  const id = txt(d.id).trim() || stem.split('-').pop() || stem;
  const rawEstado = txt(d.estado).trim();
  const estado = estados.some((e) => e.id === rawEstado) ? rawEstado : estados[0].id;
  const pr = txt(d.prioridade).trim().toLowerCase() as Prioridade;
  return {
    id,
    board: boardId,
    titulo: txt(d.titulo).trim() || stem,
    estado,
    rawEstado,
    responsavel: txt(d.responsavel).trim(),
    prazo: dia(d.prazo),
    prioridade: PRIORIDADES.includes(pr) ? pr : '',
    etiquetas: lista(d.etiquetas),
    ordem: txt(d.ordem),
    criado: txt(d.criado),
    atualizado: txt(d.atualizado),
    atualizado_por: txt(d.atualizado_por),
    corpo: p.corpo.replace(/\n+$/, ''),
    hash,
    ficheiro
  };
}

export async function listarCartoes(cofre: string, boardId: string, estados?: Estado[]): Promise<CartaoRaw[]> {
  if (!reId.test(boardId)) throw new ErroValidacao('invalid board id');
  const dir = path.join(dirBoards(cofre), boardId);
  const es = estados ?? (await lerBoardDir(dir, boardId))?.estados ?? estadosPadrao();
  let nomes: string[];
  try {
    nomes = (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith('.md') && !n.startsWith('_') && !n.startsWith('.'));
  } catch {
    return [];
  }
  const out: CartaoRaw[] = [];
  for (const n of nomes) {
    const f = path.join(dir, n);
    const l = await ler(f);
    out.push(paraCartao(boardId, f, l.texto, l.hash, es));
  }
  return out.sort((a, b) => (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : a.id.localeCompare(b.id)));
}

export async function listarTodosCartoes(cofre: string): Promise<Cartao[]> {
  const out: Cartao[] = [];
  for (const b of await listarBoards(cofre)) {
    for (const c of await listarCartoes(cofre, b.id, b.estados)) {
      const { rawEstado: _r, ficheiro: _f, ...limpo } = c;
      out.push(limpo);
    }
  }
  return out;
}

async function acharCartao(cofre: string, boardId: string, id: string): Promise<CartaoRaw> {
  if (!reId.test(id)) throw new ErroValidacao('invalid card id');
  const c = (await listarCartoes(cofre, boardId)).find((x) => x.id === id);
  if (!c) throw new ErroValidacao('card not found');
  return c;
}

function cabecalho(c: { id: string; titulo: string; estado: string; responsavel: string; prazo: string; prioridade: string; etiquetas: string[]; ordem: string; criado: string; atualizado: string; atualizado_por: string }) {
  return {
    id: c.id,
    titulo: c.titulo,
    estado: c.estado,
    responsavel: c.responsavel,
    prazo: c.prazo,
    prioridade: c.prioridade,
    etiquetas: c.etiquetas,
    ordem: c.ordem,
    criado: c.criado,
    atualizado: c.atualizado,
    atualizado_por: c.atualizado_por
  };
}

const agora = () => new Date().toISOString().slice(0, 19);

function limparEntrada(e: CartaoEntrada) {
  const titulo = e.titulo.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!titulo) throw new ErroValidacao('The title cannot be empty.');
  const prazo = /^\d{4}-\d{2}-\d{2}$/.test(e.prazo) ? e.prazo : '';
  const pr = PRIORIDADES.includes(e.prioridade) ? e.prioridade : '';
  const etiquetas = [...new Set(e.etiquetas.map((t) => t.replace(/[,\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
  if (e.corpo.length > 200000) throw new ErroValidacao('Card is too large.');
  return { titulo, prazo, prioridade: pr, etiquetas, responsavel: e.responsavel.trim().slice(0, 60), corpo: e.corpo.replace(/\r\n/g, '\n').replace(/\n+$/, '') };
}

/** Grava um cartão. Cartão novo: sem id e sem hash. Existente: hash do que a interface leu. */
export async function guardarCartao(cofre: string, e: CartaoEntrada, esperado: string | null, autor: string): Promise<Cartao> {
  const b = (await listarBoards(cofre)).find((x) => x.id === e.board);
  if (!b) throw new ErroValidacao('board not found');
  const l = limparEntrada(e);
  const estado = b.estados.some((x) => x.id === e.estado) ? e.estado : b.estados[0].id;

  if (!e.id) {
    const id = idCurto();
    const todos = await listarCartoes(cofre, b.id, b.estados);
    const ult = todos.filter((c) => c.estado === estado).map((c) => c.ordem).sort().pop() ?? '';
    const ordem = between(ult, null);
    const f = ficheiroDe(cofre, b.id, (slug(l.titulo, 40) || 'cartao') + '-' + id + '.md');
    const cab = cabecalho({ id, titulo: l.titulo, estado, responsavel: l.responsavel, prazo: l.prazo, prioridade: l.prioridade, etiquetas: l.etiquetas, ordem, criado: agora(), atualizado: agora(), atualizado_por: autor });
    const g = await gravar(f, escrever(cab, l.corpo), null);
    return semInternos(paraCartao(b.id, f, g.texto, g.hash, b.estados));
  }

  const atual = await acharCartao(cofre, b.id, e.id);
  let ordem = atual.ordem;
  if (estado !== atual.estado) {
    const col = (await listarCartoes(cofre, b.id, b.estados)).filter((c) => c.estado === estado && c.id !== atual.id);
    ordem = between(col.map((c) => c.ordem).sort().pop() ?? '', null);
  }
  const cab = cabecalho({ ...atual, titulo: l.titulo, estado, responsavel: l.responsavel, prazo: l.prazo, prioridade: l.prioridade, etiquetas: l.etiquetas, ordem, atualizado: agora(), atualizado_por: autor });
  const g = await gravar(atual.ficheiro, escrever(cab, l.corpo), esperado ?? undefined);
  return semInternos(paraCartao(b.id, atual.ficheiro, g.texto, g.hash, b.estados));
}

function semInternos(c: CartaoRaw): Cartao {
  const { rawEstado: _r, ficheiro: _f, ...limpo } = c;
  return limpo;
}

async function escreverCartaoMover(cofre: string, boardId: string, id: string, estado: string, ordem: string): Promise<void> {
  const c = await acharCartao(cofre, boardId, id);
  const p = parse((await ler(c.ficheiro)).texto);
  await gravar(c.ficheiro, escrever({ ...p.dados, estado, ordem }, p.corpo));
}

/** Move um cartão para um estado, entre dois vizinhos. Só reescreve o ficheiro do cartão movido. */
export async function moverCartao(cofre: string, boardId: string, id: string, estado: string, antesDe: string | null): Promise<void> {
  const b = (await listarBoards(cofre)).find((x) => x.id === boardId);
  if (!b) throw new ErroValidacao('board not found');
  if (!b.estados.some((e) => e.id === estado)) throw new ErroValidacao('invalid column');
  const col = (await listarCartoes(cofre, boardId, b.estados)).filter((c) => c.estado === estado && c.id !== id);
  let ordem: string;
  const i = antesDe ? col.findIndex((c) => c.id === antesDe) : -1;
  if (i < 0) {
    ordem = between(col.length ? col[col.length - 1].ordem : '', null);
  } else {
    const a = i > 0 ? col[i - 1].ordem : '';
    let bnd = col[i].ordem;
    // chaves iguais (cartões criados em simultâneo noutros PCs): reatribui as da coluna
    if (bnd <= a) {
      let prev = '';
      for (const c of col) {
        const nova = between(prev, null);
        await escreverCartaoMover(cofre, boardId, c.id, estado, nova);
        prev = nova;
      }
      const fresh = (await listarCartoes(cofre, boardId, b.estados)).filter((c) => c.estado === estado && c.id !== id);
      const j = fresh.findIndex((c) => c.id === antesDe);
      ordem = between(j > 0 ? fresh[j - 1].ordem : '', fresh[j].ordem);
    } else {
      ordem = between(a, bnd);
    }
  }
  await escreverCartaoMover(cofre, boardId, id, estado, ordem);
}

export async function apagarCartao(cofre: string, boardId: string, id: string): Promise<void> {
  const c = await acharCartao(cofre, boardId, id);
  await paraLixo(cofre, c.ficheiro);
}

export { ConflitoErro };
