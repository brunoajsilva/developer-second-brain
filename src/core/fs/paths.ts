import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Ids of boards, columns and cards: lowercase slug. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

export class ValidationError extends Error {
  readonly code = 'invalid';
}

const caseInsensitiveFs = () => process.platform === 'win32' || process.platform === 'darwin';

export function slugify(text: string, maxLength = 40): string {
  const s = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, maxLength).replace(/-+$/g, '');
}

/** 4-character random id (a–z, 0–9). */
export function shortId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(4);
  let id = '';
  for (let i = 0; i < 4; i++) id += alphabet[bytes[i] % alphabet.length];
  return id;
}

const INVALID_SEGMENT = /[<>:"\\|?*\u0000-\u001f]/;

/** Validates a "/"-separated relative path (no "..", no characters Windows forbids). Returns its segments. */
export function validateRelativePath(relativePath: string): string[] {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.length > 240) throw new ValidationError('invalid path');
  if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) throw new ValidationError('path must be relative');
  const segments = relativePath.split('/');
  for (const s of segments) {
    if (s === '' || s === '.' || s === '..') throw new ValidationError('invalid path');
    if (INVALID_SEGMENT.test(s)) throw new ValidationError('invalid characters in the name');
    if (/[. ]$/.test(s)) throw new ValidationError('names cannot end with a dot or a space');
    if (s.startsWith('.')) throw new ValidationError('names cannot start with a dot');
  }
  return segments;
}

/** Joins base + subfolder + relative path, guaranteeing the result stays inside base/subfolder. */
export function resolveInside(base: string, subfolder: string, relativePath: string): string {
  const segments = validateRelativePath(relativePath);
  const root = path.resolve(base, subfolder);
  const full = path.resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + path.sep)) throw new ValidationError('path is outside the vault');
  return full;
}

/** Relative path with "/" separators on every platform. */
export function toRelative(base: string, absolutePath: string): string {
  return path.relative(base, absolutePath).split(path.sep).join('/');
}

export function isSamePath(a: string, b: string): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return caseInsensitiveFs() ? x.toLowerCase() === y.toLowerCase() : x === y;
}

export function isInside(parent: string, child: string): boolean {
  const normalize = (s: string) => (caseInsensitiveFs() ? s.toLowerCase() : s);
  return normalize(path.resolve(child)).startsWith(normalize(path.resolve(parent)) + path.sep);
}
