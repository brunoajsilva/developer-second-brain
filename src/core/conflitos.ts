// Cópias de conflito criadas pelos serviços de drive (OneDrive: "nome-NOMEDOPC.md"; Dropbox/Drive: "(conflicted copy)").
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { existe, gravar, ler, listarMd, paraLixo } from './armazem';
import { relativo, validarRelativo } from './caminhos';
import type { CopiaConflito } from '../shared/types';

const reOneDrive = /^(.+?)-([A-Z0-9][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z0-9]{6,})$/;
const reDropbox = /^(.+?)(?: \(.*(?:conflicted copy|c[óo]pia em conflito).*\))$/i;

export function originalDe(nomeSemExt: string): string | null {
  const d = nomeSemExt.match(reDropbox);
  if (d) return d[1];
  const o = nomeSemExt.match(reOneDrive);
  return o ? o[1] : null;
}

export async function listarConflitos(cofre: string): Promise<CopiaConflito[]> {
  const out: CopiaConflito[] = [];
  for (const f of await listarMd(cofre)) {
    const stem = path.basename(f, '.md');
    const base = originalDe(stem);
    if (!base) continue;
    const orig = path.join(path.dirname(f), base + '.md');
    if (!(await existe(orig))) continue;
    const [a, b] = await Promise.all([fs.stat(f), fs.stat(orig)]);
    out.push({ copia: relativo(cofre, f), original: relativo(cofre, orig), copiaMod: a.mtimeMs, originalMod: b.mtimeMs });
  }
  return out;
}

export async function resolverConflito(cofre: string, copia: string, manter: 'original' | 'copia'): Promise<void> {
  const segs = validarRelativo(copia);
  const f = path.resolve(cofre, ...segs);
  const base = originalDe(path.basename(f, '.md'));
  if (!base) throw new Error('not a conflict copy');
  const orig = path.join(path.dirname(f), base + '.md');
  if (!(await existe(f)) || !(await existe(orig))) throw new Error('file not found');
  if (manter === 'copia') {
    const c = await ler(f);
    await paraLixo(cofre, orig).catch(() => undefined);
    await gravar(orig, c.texto);
    await paraLixo(cofre, f);
  } else {
    await paraLixo(cofre, f);
  }
}
