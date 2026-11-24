import matter from 'gray-matter';

export interface Parsed {
  dados: Record<string, unknown>;
  corpo: string;
  valido: boolean; // false se o YAML do cabeçalho não for válido
}

const nada = {} as Record<string, unknown>;

export function parse(texto: string): Parsed {
  const t = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!t.startsWith('---')) return { dados: nada, corpo: t, valido: true };
  try {
    const m = matter(t, {});
    return { dados: (m.data ?? {}) as Record<string, unknown>, corpo: m.content.replace(/^\n+/, ''), valido: true };
  } catch {
    return { dados: {}, corpo: t, valido: false };
  }
}

export function escrever(dados: Record<string, unknown>, corpo: string): string {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dados)) if (v !== undefined) limpo[k] = v;
  const c = corpo.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  return matter.stringify('\n' + c + '\n', limpo, { lineWidth: -1 } as never).replace(/^---\n([\s\S]*?)\n---\n\n+/, '---\n$1\n---\n\n');
}

export const txt = (v: unknown, def = ''): string => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? def : v.toISOString();
  if (v === null || v === undefined) return def;
  return String(v);
};

export const dia = (v: unknown): string => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = txt(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

export const lista = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => txt(x).trim()).filter(Boolean);
  const s = txt(v);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

export function tituloDoTexto(texto: string, fallback: string): string {
  const p = parse(texto);
  const t = txt(p.dados.titulo).trim();
  if (t) return t;
  const m = p.corpo.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}
