import type { Api } from '../../shared/api';
import { ApiErro, type MudancaCofre } from '../../shared/types';

declare global {
  interface Window {
    ponte: {
      chamar(nome: string, args: unknown[]): Promise<{ ok: boolean; valor?: unknown; erro?: { codigo: string; mensagem: string; dados?: unknown } }>;
      aoMudar(cb: (m: MudancaCofre) => void): () => void;
      aoCapturar(cb: () => void): () => void;
    };
  }
}

export const api: Api = new Proxy({} as Api, {
  get: (_t, nome) => {
    if (typeof nome !== 'string') return undefined;
    return async (...args: unknown[]) => {
      const r = await window.ponte.chamar(nome, args);
      if (r.ok) return r.valor;
      throw new ApiErro(r.erro!.codigo, r.erro!.mensagem, r.erro!.dados);
    };
  }
});

export const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const eConflito = (e: unknown): e is ApiErro => e instanceof ApiErro && e.codigo === 'conflito';
