import { useCallback, useEffect, useRef, useState } from 'react';

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDia(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return `${MESES[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8))}`;
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasAte(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const a = Date.parse(hojeISO() + 'T00:00:00Z');
  const b = Date.parse(iso + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function fmtDiasAte(iso: string): string {
  const n = diasAte(iso);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days overdue`;
}

export function fmtAtras(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function checklist(corpo: string): { n: number; d: number } {
  const a = corpo.match(/^\s*[-*+]\s+\[[ xX]\]/gm) ?? [];
  return { n: a.length, d: a.filter((x) => /\[[xX]\]/.test(x)).length };
}

export function igualNome(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Carrega dados e volta a carregar quando as dependências mudam (inclui o "tick" das alterações na pasta). */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const seq = useRef(0);
  const recarregar = useCallback(() => {
    const n = ++seq.current;
    fn()
      .then((d) => {
        if (n === seq.current) {
          setDados(d);
          setErro('');
        }
      })
      .catch((e: unknown) => {
        if (n === seq.current) setErro(e instanceof Error ? e.message : String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  return { dados, erro, recarregar, setDados };
}

export function useDebounce(fn: () => void, ms: number) {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const f = useRef(fn);
  f.current = fn;
  const chamar = useCallback(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => f.current(), ms);
  }, [ms]);
  const cancelar = useCallback(() => clearTimeout(t.current), []);
  const agora = useCallback(() => {
    clearTimeout(t.current);
    f.current();
  }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  return { chamar, cancelar, agora };
}

/** "Blocked" / "Bloqueado" columns (names are free text). */
export const eBloqueado = (nome: string) => /bloq|block/i.test(nome);

/** Plain-text excerpt of Markdown, for search results and previews. */
export function textoSimples(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[!(note|tip|important|warning|caution)\]/gi, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s*/gm, '')
    .replace(/(^|\s)(#{1,6}|>)\s/g, ' ')
    .replace(/\[[ xX]\]\s*/g, '')
    .replace(/(^|\s)[-*+](?=\s)/g, ' ')
    .replace(/-{3,}/g, ' ')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~=|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
