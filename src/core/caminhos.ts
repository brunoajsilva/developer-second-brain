import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

export const reId = /^[a-z0-9][a-z0-9-]{0,80}$/;

export class ErroValidacao extends Error {
  codigo = 'invalido';
}

export function slug(s: string, max = 40): string {
  const r = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return r.slice(0, max).replace(/-+$/g, '');
}

export function idCurto(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = randomBytes(4);
  let r = '';
  for (let i = 0; i < 4; i++) r += a[b[i] % a.length];
  return r;
}

const segInvalido = /[<>:"\\|?*\u0000-\u001f]/;

/** Valida um caminho relativo com "/" (sem .., sem caracteres proibidos no Windows). */
export function validarRelativo(rel: string): string[] {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 240) throw new ErroValidacao('caminho invalido');
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) throw new ErroValidacao('caminho tem de ser relativo');
  const segs = rel.split('/');
  for (const s of segs) {
    if (s === '' || s === '.' || s === '..') throw new ErroValidacao('caminho invalido');
    if (segInvalido.test(s)) throw new ErroValidacao('caracteres invalidos no nome');
    if (/[. ]$/.test(s)) throw new ErroValidacao('o nome nao pode acabar em ponto ou espaco');
    if (s.startsWith('.')) throw new ErroValidacao('nomes nao podem comecar por ponto');
  }
  return segs;
}

/** Junta base + sub + rel garantindo que o resultado fica dentro de base/sub. */
export function resolverDentro(base: string, sub: string, rel: string): string {
  const segs = validarRelativo(rel);
  const raiz = path.resolve(base, sub);
  const full = path.resolve(raiz, ...segs);
  if (full !== raiz && !full.startsWith(raiz + path.sep)) throw new ErroValidacao('caminho fora do cofre');
  return full;
}

export function relativo(base: string, abs: string): string {
  return path.relative(base, abs).split(path.sep).join('/');
}

export function mesmoCaminho(a: string, b: string): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' || process.platform === 'darwin' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

export function estaDentro(pai: string, filho: string): boolean {
  const p = path.resolve(pai);
  const f = path.resolve(filho);
  const norm = (s: string) => (process.platform === 'win32' || process.platform === 'darwin' ? s.toLowerCase() : s);
  return norm(f).startsWith(norm(p) + path.sep);
}
