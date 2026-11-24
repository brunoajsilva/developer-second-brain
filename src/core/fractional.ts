// Chaves fracionárias: mover um cartão grava só um ficheiro.
// Ordem lexicográfica por código ASCII (dígitos < maiúsculas < minúsculas).
const D = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = D.length;

/** Devolve c com a < c < b. a='' = início; b=null = fim. Nunca termina em '0'. */
export function between(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error('between: a tem de ser menor que b');
  if (b !== null) {
    let n = 0;
    while ((a[n] || '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + between(a.slice(n), b.slice(n));
  }
  const da = a ? D.indexOf(a[0]) : 0;
  const db = b !== null ? D.indexOf(b[0]) : BASE;
  if (db - da > 1) return D[Math.round((da + db) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return D[da] + between(a.slice(1), null);
}

export function depois(a: string | null): string {
  return between(a ?? '', null);
}

export function antes(b: string | null): string {
  return between('', b);
}
