// Definições locais (por pessoa, fora dos cofres): nome, cofres abertos e caminho de cada um.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { gravar, existe } from './armazem';
import { lerCofre } from './cofre';
import type { CofreInfo, Definicoes } from '../shared/types';

export const definicoesPadrao = (): Definicoes => ({ utilizador: '', abrirUltimo: false, cofreAtivo: '', cofres: [] });

export class ArmazemDefinicoes {
  constructor(private ficheiro: string) {}

  async ler(): Promise<Definicoes> {
    try {
      const j = JSON.parse(await fs.readFile(this.ficheiro, 'utf8')) as Partial<Definicoes>;
      const cofres = Array.isArray(j.cofres)
        ? j.cofres.filter((c) => c && typeof c.id === 'string' && typeof c.caminho === 'string').map((c) => ({ id: c.id, nome: String(c.nome ?? ''), caminho: c.caminho, pessoal: c.pessoal === true }))
        : [];
      return { utilizador: String(j.utilizador ?? ''), abrirUltimo: j.abrirUltimo === true, cofreAtivo: String(j.cofreAtivo ?? ''), cofres };
    } catch {
      return definicoesPadrao();
    }
  }

  async gravar(d: Definicoes): Promise<void> {
    await fs.mkdir(path.dirname(this.ficheiro), { recursive: true });
    await gravar(this.ficheiro, JSON.stringify(d, null, 2));
  }

  async atualizar(f: (d: Definicoes) => void): Promise<Definicoes> {
    const d = await this.ler();
    f(d);
    await this.gravar(d);
    return d;
  }
}

/** Estado de cada cofre registado: disponível, ou porque não está (pasta em falta, outro cofre na pasta). */
export async function estadoDosCofres(d: Definicoes): Promise<CofreInfo[]> {
  const out: CofreInfo[] = [];
  for (const c of d.cofres) {
    if (!(await existe(c.caminho))) {
      out.push({ ...c, disponivel: false, motivo: 'Folder not found' });
      continue;
    }
    const meta = await lerCofre(c.caminho);
    if (!meta) out.push({ ...c, disponivel: false, motivo: 'The folder no longer has _cofre.md' });
    else if (meta.id !== c.id) out.push({ ...c, disponivel: false, motivo: 'A pasta e outro cofre' });
    else out.push({ ...c, nome: meta.nome || c.nome, disponivel: true });
  }
  return out;
}
