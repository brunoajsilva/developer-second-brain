import type {
  Board, Cartao, CartaoEntrada, CofreInfo, CopiaConflito, Definicoes, DocLido, DocResumo, Estado, Referencia, ResultadoPesquisa
} from './types';

/** Tudo o que a interface pode pedir ao processo principal. Cada método vira uma chamada IPC. */
export interface Api {
  definicoes(): Promise<Definicoes>;
  definirUtilizador(nome: string): Promise<void>;
  definirAbrirUltimo(v: boolean): Promise<void>;
  definirAtivo(cofreId: string): Promise<void>;

  cofres(): Promise<CofreInfo[]>;
  escolherPasta(titulo: string): Promise<string | null>;
  criarCofre(nome: string, pasta: string, pessoal: boolean): Promise<CofreInfo>;
  abrirPasta(pasta: string): Promise<{ estado: 'aberto'; cofre: CofreInfo } | { estado: 'converter'; pasta: string; nome: string }>;
  converterPasta(pasta: string, nome: string, pessoal: boolean): Promise<CofreInfo>;
  definirPessoal(cofreId: string, pessoal: boolean): Promise<void>;
  removerCofre(cofreId: string): Promise<void>;
  localizarCofre(cofreId: string, pasta: string): Promise<CofreInfo>;
  mostrarNoExplorador(cofreId: string, rel: string): Promise<void>;

  boards(cofreId: string): Promise<Board[]>;
  guardarBoard(cofreId: string, b: { id?: string; nome: string; descricao?: string; estados: Estado[] }): Promise<Board>;
  apagarBoard(cofreId: string, boardId: string): Promise<void>;
  cartoes(cofreId: string, boardId: string): Promise<Cartao[]>;
  todosCartoes(cofreId: string): Promise<Cartao[]>;
  guardarCartao(cofreId: string, c: CartaoEntrada, hash: string | null): Promise<Cartao>;
  moverCartao(cofreId: string, boardId: string, cartaoId: string, estado: string, antesDe: string | null): Promise<void>;
  apagarCartao(cofreId: string, boardId: string, cartaoId: string): Promise<void>;

  docs(cofreId: string): Promise<DocResumo[]>;
  lerDoc(cofreId: string, rel: string): Promise<DocLido>;
  gravarDoc(cofreId: string, rel: string, texto: string, hash: string | null): Promise<{ hash: string; mod: number }>;
  criarDoc(cofreId: string, rel: string, texto: string): Promise<DocLido>;
  apagarDoc(cofreId: string, rel: string): Promise<void>;
  moverDoc(cofreId: string, de: string, para: string): Promise<void>;
  pastasDocs(cofreId: string): Promise<string[]>;
  criarPasta(cofreId: string, rel: string): Promise<void>;
  renomearPasta(cofreId: string, de: string, para: string): Promise<void>;
  apagarPasta(cofreId: string, rel: string): Promise<void>;
  guardarAnexo(cofreId: string, docRel: string, ext: string, bytes: Uint8Array): Promise<string>;

  pesquisar(consulta: string, cofreIds: string[]): Promise<ResultadoPesquisa[]>;
  referidoEm(cofreId: string, alvo: { tipo: 'doc' | 'cartao'; titulo: string; ref: string }): Promise<Referencia[]>;

  conflitos(cofreId: string): Promise<CopiaConflito[]>;
  lerFicheiro(cofreId: string, rel: string): Promise<string>;
  resolverConflito(cofreId: string, copia: string, manter: 'original' | 'copia'): Promise<void>;

  pessoas(cofreId: string): Promise<string[]>;
  adicionarPessoa(cofreId: string, nome: string): Promise<void>;
  equipa(cofreId: string): Promise<string[]>;
  removerPessoa(cofreId: string, nome: string): Promise<void>;
}

export type NomeApi = keyof Api;
