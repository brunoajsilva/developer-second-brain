import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Api } from '../shared/api';
import { ApiErro, type CofreInfo, type CofreRegisto, type MudancaCofre } from '../shared/types';
import { ArmazemDefinicoes, estadoDosCofres } from '../core/definicoes';
import { abrirPastaComoCofre, converterEmCofre, criarCofre, lerCofre, novoIdCofre, validarNovoCofre } from '../core/cofre';
import { apagarBoard, apagarCartao, guardarBoard, guardarCartao, listarBoards, listarCartoes, listarTodosCartoes, moverCartao } from '../core/boards';
import { apagarDoc, apagarPasta, criarDoc, criarPasta, gravarDoc, guardarAnexo, lerDoc, listarDocs, listarPastas, moverDoc, renomearPasta } from '../core/docs';
import { construirIndice, pesquisar, referidoEm, type Indice } from '../core/pesquisa';
import { listarConflitos, resolverConflito } from '../core/conflitos';
import { ConflitoErro, existe, gravar, ler } from '../core/armazem';
import { ErroValidacao, resolverDentro } from '../core/caminhos';

export interface Anfitriao {
  escolherPasta(titulo: string): Promise<string | null>;
  mostrarNoExplorador(abs: string): void;
  aoMudar(m: MudancaCofre): void;
}

/** Toda a lógica da app fora da janela: cofres, ficheiros, pesquisa e observação da pasta. */
export class Servico {
  private defs: ArmazemDefinicoes;
  private indices = new Map<string, Indice>();
  private observadores = new Map<string, FSWatcher>();

  constructor(ficheiroDefinicoes: string, private anfitriao: Anfitriao) {
    this.defs = new ArmazemDefinicoes(ficheiroDefinicoes);
  }

  async iniciar(): Promise<void> {
    const d = await this.defs.ler();
    for (const c of await estadoDosCofres(d)) if (c.disponivel) this.observar(c);
  }

  async parar(): Promise<void> {
    await Promise.all([...this.observadores.values()].map((w) => w.close()));
    this.observadores.clear();
  }

  async caminhoDe(cofreId: string): Promise<string> {
    const d = await this.defs.ler();
    const c = d.cofres.find((x) => x.id === cofreId);
    if (!c) throw new ErroValidacao('cofre desconhecido');
    if (!(await existe(c.caminho))) throw new ErroValidacao('A pasta deste cofre nao esta acessivel.');
    return c.caminho;
  }

  private observar(c: CofreRegisto): void {
    if (this.observadores.has(c.id)) return;
    const raiz = c.caminho;
    const w = chokidar.watch(raiz, {
      ignoreInitial: true,
      ignored: (p: string) => {
        const rel = path.relative(raiz, p);
        return rel !== '' && rel.split(path.sep).some((s) => s.startsWith('.'));
      },
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
    });
    w.on('all', (tipo, p) => {
      if (!p.toLowerCase().endsWith('.md') && !/\.(png|jpe?g|gif|webp)$/i.test(p)) return;
      this.indices.delete(c.id);
      this.anfitriao.aoMudar({ cofreId: c.id, tipo, rel: path.relative(raiz, p).split(path.sep).join('/') });
    });
    w.on('error', () => undefined);
    this.observadores.set(c.id, w);
  }

  private async desobservar(id: string): Promise<void> {
    const w = this.observadores.get(id);
    if (w) {
      await w.close();
      this.observadores.delete(id);
    }
    this.indices.delete(id);
  }

  private async indice(cofreId: string): Promise<Indice> {
    let ix = this.indices.get(cofreId);
    if (!ix) {
      ix = await construirIndice(await this.caminhoDe(cofreId));
      this.indices.set(cofreId, ix);
    }
    return ix;
  }

  private async registar(meta: { id: string; nome: string }, caminho: string, pessoal?: boolean): Promise<CofreInfo> {
    const anterior = (await this.defs.ler()).cofres.find((c) => c.id === meta.id);
    const reg: CofreRegisto = { id: meta.id, nome: meta.nome, caminho, pessoal: pessoal ?? anterior?.pessoal ?? false };
    await this.defs.atualizar((d) => {
      d.cofres = d.cofres.filter((c) => c.id !== reg.id);
      d.cofres.push(reg);
      d.cofreAtivo = reg.id;
    });
    const info: CofreInfo = { ...reg, disponivel: true };
    this.observar(info);
    return info;
  }

  private async autor(): Promise<string> {
    return (await this.defs.ler()).utilizador || 'Sem nome';
  }

  /** Os métodos da API. O nome de cada um é o nome da chamada IPC. */
  api: Api = {
    definicoes: () => this.defs.ler(),
    definirUtilizador: async (nome) => void (await this.defs.atualizar((d) => void (d.utilizador = nome.trim().slice(0, 60)))),
    definirAbrirUltimo: async (v) => void (await this.defs.atualizar((d) => void (d.abrirUltimo = !!v))),
    definirAtivo: async (id) => void (await this.defs.atualizar((d) => void (d.cofreAtivo = id))),

    cofres: async () => estadoDosCofres(await this.defs.ler()),
    escolherPasta: (t) => this.anfitriao.escolherPasta(t),

    criarCofre: async (nome, pasta, pessoal) => {
      const d = await this.defs.ler();
      // a pasta escolhida é a "mãe": cada cofre fica na sua própria subpasta
      const base = nome.trim().replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 60) || 'Cofre';
      let destino = path.join(pasta, base);
      for (let i = 2; (await existe(destino)) && (await fs.readdir(destino)).length > 0; i++) destino = path.join(pasta, `${base} ${i}`);
      const meta = await criarCofre(destino, nome, true, d.cofres);
      return this.registar(meta, destino, pessoal);
    },
    abrirPasta: async (pasta) => {
      const d = await this.defs.ler();
      const { meta } = await abrirPastaComoCofre(pasta, d.cofres);
      if (meta) return { estado: 'aberto', cofre: await this.registar(meta, pasta) };
      return { estado: 'converter', pasta, nome: path.basename(pasta) };
    },
    definirPessoal: async (id, v) => void (await this.defs.atualizar((d) => void (d.cofres.forEach((c) => { if (c.id === id) c.pessoal = !!v; })))),
    converterPasta: async (pasta, nome, pessoal) => {
      const d = await this.defs.ler();
      await validarNovoCofre(pasta, null, d.cofres);
      const meta = { id: novoIdCofre(), nome: nome.trim().slice(0, 60) || path.basename(pasta), descricao: '' };
      await converterEmCofre(pasta, meta);
      return this.registar(meta, pasta, pessoal);
    },
    removerCofre: async (id) => {
      await this.defs.atualizar((d) => {
        d.cofres = d.cofres.filter((c) => c.id !== id);
        if (d.cofreAtivo === id) d.cofreAtivo = '';
      });
      await this.desobservar(id);
    },
    localizarCofre: async (id, pasta) => {
      const meta = await lerCofre(pasta);
      if (!meta) throw new ErroValidacao('Essa pasta nao e um cofre (nao tem _cofre.md).');
      if (meta.id !== id) throw new ErroValidacao('Essa pasta e outro cofre ("' + meta.nome + '"), nao o que procuras.');
      await this.desobservar(id);
      return this.registar(meta, pasta);
    },
    mostrarNoExplorador: async (id, rel) => {
      const raiz = await this.caminhoDe(id);
      this.anfitriao.mostrarNoExplorador(rel ? path.resolve(raiz, ...rel.split('/').filter((s) => s && s !== '..')) : raiz);
    },

    boards: async (id) => listarBoards(await this.caminhoDe(id)),
    guardarBoard: async (id, b) => guardarBoard(await this.caminhoDe(id), b),
    apagarBoard: async (id, b) => apagarBoard(await this.caminhoDe(id), b),
    cartoes: async (id, b) => (await listarCartoes(await this.caminhoDe(id), b)).map(({ rawEstado: _r, ficheiro: _f, ...c }) => c),
    todosCartoes: async (id) => listarTodosCartoes(await this.caminhoDe(id)),
    guardarCartao: async (id, c, hash) => guardarCartao(await this.caminhoDe(id), c, hash, await this.autor()),
    moverCartao: async (id, b, c, e, antes) => moverCartao(await this.caminhoDe(id), b, c, e, antes),
    apagarCartao: async (id, b, c) => apagarCartao(await this.caminhoDe(id), b, c),

    docs: async (id) => listarDocs(await this.caminhoDe(id)),
    lerDoc: async (id, rel) => lerDoc(await this.caminhoDe(id), rel),
    gravarDoc: async (id, rel, texto, hash) => gravarDoc(await this.caminhoDe(id), rel, texto, hash),
    criarDoc: async (id, rel, texto) => criarDoc(await this.caminhoDe(id), rel, texto),
    apagarDoc: async (id, rel) => apagarDoc(await this.caminhoDe(id), rel),
    moverDoc: async (id, de, para) => moverDoc(await this.caminhoDe(id), de, para),
    pastasDocs: async (id) => listarPastas(await this.caminhoDe(id)),
    criarPasta: async (id, rel) => criarPasta(await this.caminhoDe(id), rel),
    renomearPasta: async (id, de, para) => renomearPasta(await this.caminhoDe(id), de, para),
    apagarPasta: async (id, rel) => apagarPasta(await this.caminhoDe(id), rel),
    guardarAnexo: async (id, rel, ext, bytes) => guardarAnexo(await this.caminhoDe(id), rel, ext, bytes),

    pesquisar: async (consulta, ids) => {
      const d = await estadoDosCofres(await this.defs.ler());
      const out = [];
      for (const c of d) {
        if (!c.disponivel || !ids.includes(c.id)) continue;
        out.push(...pesquisar(await this.indice(c.id), c.id, c.nome, consulta));
      }
      return out.slice(0, 40);
    },
    referidoEm: async (id, alvo) => referidoEm(await this.indice(id), alvo),

    conflitos: async (id) => listarConflitos(await this.caminhoDe(id)),
    lerFicheiro: async (id, rel) => {
      const raiz = await this.caminhoDe(id);
      return (await ler(resolverDentro(raiz, '.', rel))).texto;
    },
    resolverConflito: async (id, copia, manter) => resolverConflito(await this.caminhoDe(id), copia, manter),

    pessoas: async (id) => {
      const raiz = await this.caminhoDe(id);
      const nomes = new Set<string>();
      const f = path.join(raiz, '_equipa.md');
      if (await existe(f)) for (const l of (await ler(f)).texto.split('\n')) { const m = l.match(/^\s*[-*]\s+(.+)$/); if (m) nomes.add(m[1].trim()); }
      for (const c of await listarTodosCartoes(raiz)) if (c.responsavel) nomes.add(c.responsavel);
      const eu = (await this.defs.ler()).utilizador;
      if (eu) nomes.add(eu);
      return [...nomes].sort((a, b) => a.localeCompare(b, 'pt'));
    },
    adicionarPessoa: async (id, nome) => {
      const raiz = await this.caminhoDe(id);
      const n = nome.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
      if (!n) return;
      const f = path.join(raiz, '_equipa.md');
      const base = (await existe(f)) ? (await ler(f)).texto : '# Equipa\n\n';
      if (base.split('\n').some((l) => l.replace(/^\s*[-*]\s+/, '').trim().toLowerCase() === n.toLowerCase())) return;
      await gravar(f, base.replace(/\n*$/, '\n') + '- ' + n + '\n');
    },
    equipa: async (id) => {
      const f = path.join(await this.caminhoDe(id), '_equipa.md');
      const out: string[] = [];
      if (await existe(f)) for (const l of (await ler(f)).texto.split('\n')) { const m = l.match(/^\s*[-*]\s+(.+)$/); if (m) out.push(m[1].trim()); }
      return out;
    },
    removerPessoa: async (id, nome) => {
      const f = path.join(await this.caminhoDe(id), '_equipa.md');
      if (!(await existe(f))) return;
      const alvo = nome.trim().toLowerCase();
      const atual = await ler(f);
      const linhas = atual.texto.split('\n').filter((l) => l.replace(/^\s*[-*]\s+/, '').trim().toLowerCase() !== alvo || !/^\s*[-*]\s+/.test(l));
      await gravar(f, linhas.join('\n'), atual.hash);
    }
  };

  /** Chamada vinda do IPC: converte exceções em erros com código que a interface sabe tratar. */
  async chamar(nome: string, args: unknown[]): Promise<{ ok: true; valor: unknown } | { ok: false; erro: { codigo: string; mensagem: string; dados?: unknown } }> {
    const f = (this.api as unknown as Record<string, ((...a: unknown[]) => Promise<unknown>) | undefined>)[nome];
    if (typeof f !== 'function' || !Object.prototype.hasOwnProperty.call(this.api, nome)) return { ok: false, erro: { codigo: 'erro', mensagem: 'chamada desconhecida' } };
    try {
      return { ok: true, valor: await f(...args) };
    } catch (e) {
      if (e instanceof ConflitoErro) return { ok: false, erro: { codigo: 'conflito', mensagem: e.message, dados: { atual: e.atual } } };
      if (e instanceof ErroValidacao || e instanceof ApiErro) return { ok: false, erro: { codigo: 'invalido', mensagem: e.message } };
      const msg = e instanceof Error ? e.message : String(e);
      const codigo = (e as NodeJS.ErrnoException)?.code;
      if (codigo === 'ENOENT') return { ok: false, erro: { codigo: 'ausente', mensagem: 'O ficheiro ou a pasta ja nao existe.' } };
      if (codigo === 'EACCES' || codigo === 'EPERM') return { ok: false, erro: { codigo: 'permissao', mensagem: 'Sem permissao para escrever aqui.' } };
      return { ok: false, erro: { codigo: 'erro', mensagem: msg } };
    }
  }
}
