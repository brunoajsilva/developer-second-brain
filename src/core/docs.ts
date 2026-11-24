import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { existe, gravar, ler, listarMd, paraLixo } from './armazem';
import { ErroValidacao, relativo, resolverDentro } from './caminhos';
import { tituloDoTexto } from './frontmatter';
import type { DocLido, DocResumo } from '../shared/types';

const dirDocs = (cofre: string) => path.join(cofre, 'Docs');

function validarMd(rel: string): void {
  if (!/\.md$/i.test(rel)) throw new ErroValidacao('os nomes das paginas terminam em .md');
  if (rel.split('/').some((s) => s.startsWith('_'))) throw new ErroValidacao('nomes que comecam por _ sao reservados');
}

export function caminhoDoc(cofre: string, rel: string): string {
  validarMd(rel);
  return resolverDentro(cofre, 'Docs', rel);
}

export async function listarDocs(cofre: string): Promise<DocResumo[]> {
  const base = dirDocs(cofre);
  const ficheiros = await listarMd(base, (n) => !n.startsWith('_'));
  const out: DocResumo[] = [];
  for (const f of ficheiros) {
    if (path.basename(f).startsWith('_')) continue;
    const l = await ler(f);
    const rel = relativo(base, f);
    out.push({ path: rel, titulo: tituloDoTexto(l.texto, path.basename(f, '.md')), mod: l.mod });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'pt'));
}

export async function lerDoc(cofre: string, rel: string): Promise<DocLido> {
  const f = caminhoDoc(cofre, rel);
  if (!(await existe(f))) throw new ErroValidacao('pagina nao encontrada');
  const l = await ler(f);
  return { path: rel, texto: l.texto, hash: l.hash, mod: l.mod };
}

export async function gravarDoc(cofre: string, rel: string, texto: string, esperado: string | null): Promise<{ hash: string; mod: number }> {
  if (texto.length > 1_000_000) throw new ErroValidacao('pagina demasiado grande (max 1 MB)');
  const g = await gravar(caminhoDoc(cofre, rel), texto, esperado);
  return { hash: g.hash, mod: g.mod };
}

export async function criarDoc(cofre: string, rel: string, texto: string): Promise<DocLido> {
  const g = await gravar(caminhoDoc(cofre, rel), texto, null);
  return { path: rel, texto: g.texto, hash: g.hash, mod: g.mod };
}

/** Remove pastas vazias a partir de `d`, subindo (sem tocar na raiz de Docs). */
async function limparVazias(cofre: string, d: string): Promise<void> {
  const raiz = dirDocs(cofre);
  while (d.length > raiz.length && d.startsWith(raiz + path.sep)) {
    let resto: string[];
    try { resto = (await fs.readdir(d)).filter((n) => !n.startsWith('.')); } catch { return; }
    if (resto.length) break;
    await fs.rm(d, { recursive: true, force: true });
    d = path.dirname(d);
  }
}

export async function apagarDoc(cofre: string, rel: string): Promise<void> {
  const f = caminhoDoc(cofre, rel);
  if (!(await existe(f))) throw new ErroValidacao('pagina nao encontrada');
  await paraLixo(cofre, f);
  await limparVazias(cofre, path.dirname(f));
}

export async function moverDoc(cofre: string, de: string, para: string): Promise<void> {
  const a = caminhoDoc(cofre, de);
  const b = caminhoDoc(cofre, para);
  if (!(await existe(a))) throw new ErroValidacao('pagina nao encontrada');
  const mesmo = a.toLowerCase() === b.toLowerCase();
  if (!mesmo && (await existe(b))) throw new ErroValidacao('ja existe uma pagina com esse nome');
  await fs.mkdir(path.dirname(b), { recursive: true });
  await fs.rename(a, b);
  await limparVazias(cofre, path.dirname(a));
  // leva a pasta de anexos atrás, se existir
  const anexoA = path.join(path.dirname(a), '_anexos');
  const anexoB = path.join(path.dirname(b), '_anexos');
  if (path.dirname(a) !== path.dirname(b) && (await existe(anexoA))) {
    await fs.mkdir(anexoB, { recursive: true });
    for (const n of await fs.readdir(anexoA)) if (!(await existe(path.join(anexoB, n)))) await fs.copyFile(path.join(anexoA, n), path.join(anexoB, n));
  }
}

function validarPasta(rel: string): string {
  const limpo = rel.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!limpo) throw new ErroValidacao('indica o nome da pasta');
  if (limpo.split('/').some((s) => !s.trim() || s.startsWith('_') || s.startsWith('.'))) throw new ErroValidacao('nomes de pastas nao podem comecar por _ ou .');
  return limpo;
}

/** Todas as pastas dentro de Docs (inclui as vazias), como caminhos relativos. */
export async function listarPastas(cofre: string): Promise<string[]> {
  const base = dirDocs(cofre);
  const out: string[] = [];
  async function rec(d: string) {
    let ents;
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const abs = path.join(d, e.name);
      out.push(relativo(base, abs));
      await rec(abs);
    }
  }
  await rec(base);
  return out.sort((a, b) => a.localeCompare(b, 'pt'));
}

export async function criarPasta(cofre: string, rel: string): Promise<void> {
  const r = validarPasta(rel);
  const d = resolverDentro(cofre, 'Docs', r);
  if (await existe(d)) throw new ErroValidacao('ja existe uma pasta com esse nome');
  await fs.mkdir(d, { recursive: true });
}

export async function renomearPasta(cofre: string, de: string, para: string): Promise<void> {
  const a = resolverDentro(cofre, 'Docs', validarPasta(de));
  const pr = validarPasta(para);
  const b = resolverDentro(cofre, 'Docs', pr);
  if (!(await existe(a))) throw new ErroValidacao('pasta nao encontrada');
  if (a.toLowerCase() === b.toLowerCase() && a === b) return;
  if (b.toLowerCase().startsWith(a.toLowerCase() + path.sep)) throw new ErroValidacao('nao podes mover uma pasta para dentro dela propria');
  if (a.toLowerCase() !== b.toLowerCase() && (await existe(b))) throw new ErroValidacao('ja existe uma pasta com esse nome');
  await fs.mkdir(path.dirname(b), { recursive: true });
  await fs.rename(a, b);
  await limparVazias(cofre, path.dirname(a));
}

export async function apagarPasta(cofre: string, rel: string): Promise<void> {
  const d = resolverDentro(cofre, 'Docs', validarPasta(rel));
  if (!(await existe(d))) throw new ErroValidacao('pasta nao encontrada');
  await paraLixo(cofre, d);
  await limparVazias(cofre, path.dirname(d));
}

const extPermitidas = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/** Guarda uma imagem colada em _anexos/ ao lado da página. Devolve o caminho relativo à página. */
export async function guardarAnexo(cofre: string, docRel: string, ext: string, bytes: Uint8Array): Promise<string> {
  const e = ext.toLowerCase().replace(/^\./, '');
  if (!extPermitidas.has(e)) throw new ErroValidacao('so se aceitam imagens png, jpg, gif ou webp');
  if (bytes.byteLength > 10 * 1024 * 1024) throw new ErroValidacao('imagem demasiado grande (max 10 MB)');
  const doc = caminhoDoc(cofre, docRel);
  const dir = path.join(path.dirname(doc), '_anexos');
  await fs.mkdir(dir, { recursive: true });
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const base = `imagem-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  let nome = `${base}.${e}`;
  let k = 2;
  while (await existe(path.join(dir, nome))) nome = `${base}-${k++}.${e}`;
  await fs.writeFile(path.join(dir, nome), bytes);
  return '_anexos/' + nome;
}

/** Caminho absoluto de um ficheiro relativo ao cofre, só se ficar dentro dele (para o protocolo vault://). */
export function caminhoNoCofre(cofre: string, rel: string): string {
  const segs = rel.split('/').filter(Boolean);
  const full = path.resolve(cofre, ...segs);
  const raiz = path.resolve(cofre);
  if (full !== raiz && !full.startsWith(raiz + path.sep)) throw new ErroValidacao('caminho fora do cofre');
  if (segs.some((s) => s === '..' || s.startsWith('.'))) throw new ErroValidacao('caminho invalido');
  return full;
}
