// Tipos partilhados entre o processo principal, o preload e a interface.

export interface CofreRegisto {
  id: string;
  nome: string;
  caminho: string;
  pessoal?: boolean; // marcação local: cofre só meu (mostra cadeado)
}

export interface CofreInfo extends CofreRegisto {
  disponivel: boolean;
  motivo?: string; // porque está indisponível
}

export interface Definicoes {
  utilizador: string;
  abrirUltimo: boolean;
  cofreAtivo: string;
  cofres: CofreRegisto[];
}

export interface Estado {
  id: string;
  nome: string;
  fim?: boolean;
}

export interface Board {
  id: string;
  nome: string;
  descricao: string;
  estados: Estado[];
}

export type Prioridade = '' | 'baixa' | 'media' | 'alta';

export interface Cartao {
  id: string;
  board: string;
  titulo: string;
  estado: string;
  responsavel: string;
  prazo: string; // AAAA-MM-DD ou ''
  prioridade: Prioridade;
  etiquetas: string[];
  ordem: string;
  criado: string;
  atualizado: string;
  atualizado_por: string;
  corpo: string;
  hash: string;
}

export interface CartaoEntrada {
  id?: string;
  board: string;
  titulo: string;
  estado: string;
  responsavel: string;
  prazo: string;
  prioridade: Prioridade;
  etiquetas: string[];
  corpo: string;
}

export interface DocResumo {
  path: string; // relativo a Docs/, com .md
  titulo: string;
  mod: number;
}

export interface DocLido {
  path: string;
  texto: string;
  hash: string;
  mod: number;
}


export interface ResultadoPesquisa {
  cofreId: string;
  cofreNome: string;
  tipo: 'doc' | 'cartao';
  titulo: string;
  contexto: string; // pasta do doc ou nome do board
  ref: string; // path do doc ou "boardId/cardId"
  excerto: string;
}

export interface Referencia {
  tipo: 'doc' | 'cartao';
  titulo: string;
  ref: string;
}

export interface CopiaConflito {
  copia: string; // caminho relativo ao cofre
  original: string;
  copiaMod: number;
  originalMod: number;
}

export interface ConflitoDados {
  atual: { texto: string; hash: string; mod: number };
}

export interface MudancaCofre {
  cofreId: string;
  tipo: string;
  rel: string;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: { codigo: string; mensagem: string; dados?: unknown } };

export class ApiErro extends Error {
  codigo: string;
  dados?: unknown;
  constructor(codigo: string, mensagem: string, dados?: unknown) {
    super(mensagem);
    this.codigo = codigo;
    this.dados = dados;
  }
}
