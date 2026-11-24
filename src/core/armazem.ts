// Leitura e escrita atómica com deteção de conflitos (hash do conteúdo lido).
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export interface Lido {
  texto: string;
  hash: string;
  mod: number;
}

export class ConflitoErro extends Error {
  codigo = 'conflito';
  atual: Lido;
  constructor(atual: Lido) {
    super('O ficheiro foi alterado por outra pessoa ou noutro PC.');
    this.atual = atual;
  }
}

export const hashTexto = (t: string) => createHash('sha1').update(t, 'utf8').digest('hex');

export async function existe(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

export async function ler(abs: string): Promise<Lido> {
  const [texto, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
  const t = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return { texto: t, hash: hashTexto(t), mod: st.mtimeMs };
}

/**
 * Grava de forma atómica (ficheiro temporário + renomear), para a drive nunca sincronizar meio ficheiro.
 * esperado === undefined: sem verificação. esperado === null: o ficheiro não pode existir.
 * esperado === string: o conteúdo atual tem de ter esse hash, senão ConflitoErro.
 */
export async function gravar(abs: string, texto: string, esperado?: string | null): Promise<Lido> {
  const t = texto.replace(/\r\n/g, '\n');
  if (esperado !== undefined) {
    if (await existe(abs)) {
      const atual = await ler(abs);
      if (esperado === null || atual.hash !== esperado) {
        if (atual.hash !== hashTexto(t)) throw new ConflitoErro(atual);
      }
    } else if (typeof esperado === 'string') {
      // o ficheiro desapareceu entretanto: gravar recria-o
    }
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), '.' + path.basename(abs) + '.' + randomBytes(4).toString('hex') + '.tmp');
  try {
    await fs.writeFile(tmp, t, 'utf8');
    await fs.rename(tmp, abs);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  const st = await fs.stat(abs);
  return { texto: t, hash: hashTexto(t), mod: st.mtimeMs };
}

/** Move para .lixo/<data>/<caminho relativo ao cofre>. Nada é apagado de vez. */
export async function paraLixo(cofre: string, abs: string): Promise<void> {
  const rel = path.relative(cofre, abs);
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  let dest = path.join(cofre, '.lixo', carimbo, rel);
  for (let i = 2; await existe(dest); i++) dest = path.join(cofre, '.lixo', `${carimbo}-${i}`, rel); // evita colisões no mesmo milissegundo
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(abs, dest);
}

export async function listarMd(dir: string, aceitaSub: (nome: string) => boolean = () => true): Promise<string[]> {
  const out: string[] = [];
  async function rec(d: string) {
    let ents;
    try {
      ents = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (aceitaSub(e.name)) await rec(p);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
    }
  }
  await rec(dir);
  return out;
}
