import { useCallback, useEffect, useRef, useState } from 'react';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function fmtDia(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return `${iso.slice(8)} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
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
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `daqui a ${n} dias` : `há ${-n} dias`;
}

export function fmtAtras(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
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
