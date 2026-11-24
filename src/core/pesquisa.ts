import * as path from 'node:path';
import MiniSearch from 'minisearch';
import { listarMd, ler } from './armazem';
import { listarBoards, listarCartoes } from './boards';
import { relativo } from './caminhos';
import { parse, tituloDoTexto } from './frontmatter';
import type { Referencia, ResultadoPesquisa } from '../shared/types';

interface Item {
  id: string;
  tipo: 'doc' | 'cartao';
  titulo: string;
  contexto: string;
  ref: string;
  texto: string;
}

export interface Indice {
  ms: MiniSearch<Item>;
  itens: Map<string, Item>;
  refs: { tipo: 'doc' | 'cartao'; titulo: string; ref: string; chave: string[]; texto: string }[];
}

/** Lê todo o cofre. Para centenas de ficheiros demora bem menos de 1 s. */
export async function construirIndice(cofre: string): Promise<Indice> {
  const itens: Item[] = [];
  const base = path.join(cofre, 'Docs');
  for (const f of await listarMd(base, (n) => !n.startsWith('_'))) {
    if (path.basename(f).startsWith('_')) continue;
    const l = await ler(f);
    const rel = relativo(base, f);
    const stem = path.basename(f, '.md');
    const titulo = tituloDoTexto(l.texto, stem);
    itens.push({ id: 'd:' + rel, tipo: 'doc', titulo, contexto: path.dirname(rel) === '.' ? 'Docs' : path.dirname(rel), ref: rel, texto: parse(l.texto).corpo });
  }
  for (const b of await listarBoards(cofre)) {
    for (const c of await listarCartoes(cofre, b.id, b.estados)) {
      itens.push({ id: 'c:' + b.id + '/' + c.id, tipo: 'cartao', titulo: c.titulo, contexto: b.nome, ref: b.id + '/' + c.id, texto: [c.corpo, c.etiquetas.join(' '), c.responsavel].join('\n') });
    }
  }
  const ms = new MiniSearch<Item>({
    fields: ['titulo', 'texto'],
    storeFields: [],
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { titulo: 3 }, combineWith: 'AND' },
    processTerm: (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  });
  ms.addAll(itens);
  const mapa = new Map(itens.map((i) => [i.id, i]));
  const refs = itens.map((i) => ({
    tipo: i.tipo,
    titulo: i.titulo,
    ref: i.ref,
    chave: i.tipo === 'doc' ? [i.titulo.toLowerCase(), path.basename(i.ref, '.md').toLowerCase()] : [i.ref.split('/')[1]],
    texto: i.texto
  }));
  return { ms, itens: mapa, refs };
}

function excerto(texto: string, termos: string[]): string {
  const limpo = texto.replace(/\s+/g, ' ');
  const baixo = limpo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  for (const t of termos) {
    const i = baixo.indexOf(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    if (i >= 0) {
      const ini = Math.max(0, i - 40);
      return (ini > 0 ? '…' : '') + limpo.slice(ini, i + 90) + (i + 90 < limpo.length ? '…' : '');
    }
  }
  return limpo.slice(0, 110);
}

export function pesquisar(ix: Indice, cofreId: string, cofreNome: string, consulta: string, limite = 20): ResultadoPesquisa[] {
  const q = consulta.trim();
  if (!q) return [];
  const termos = q.split(/\s+/).filter(Boolean);
  return ix.ms
    .search(q)
    .slice(0, limite)
    .map((r) => {
      const i = ix.itens.get(String(r.id))!;
      return { cofreId, cofreNome, tipo: i.tipo, titulo: i.titulo, contexto: i.contexto, ref: i.ref, excerto: excerto(i.texto, termos) };
    });
}

const reLigacao = /\[\[([^\]\n]+)\]\]/g;

/** Quem refere esta página (por título/nome) ou este cartão (por [[#id]]). */
export function referidoEm(ix: Indice, alvo: { tipo: 'doc' | 'cartao'; titulo: string; ref: string }): Referencia[] {
  const chaves = alvo.tipo === 'doc' ? [alvo.titulo.toLowerCase(), path.basename(alvo.ref, '.md').toLowerCase()] : ['#' + alvo.ref.split('/')[1]];
  const out: Referencia[] = [];
  for (const r of ix.refs) {
    if (r.tipo === alvo.tipo && r.ref === alvo.ref) continue;
    reLigacao.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = reLigacao.exec(r.texto))) {
      const dest = m[1].split('|')[0].trim().toLowerCase();
      if (chaves.includes(dest)) {
        out.push({ tipo: r.tipo, titulo: r.titulo, ref: r.ref });
        break;
      }
    }
  }
  return out;
}
