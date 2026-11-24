import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInside, slugify, validateRelativePath } from '../../src/core/fs/paths';

describe('paths', () => {
  it('accepts simple names and subfolders', () => {
    expect(validateRelativePath('Architecture/ADR-001 Messaging.md')).toEqual(['Architecture', 'ADR-001 Messaging.md']);
  });
  it.each(['../out.md', 'a/../../b.md', '/abs.md', 'C:/x.md', 'a\\b.md', 'a//b.md', '.hidden.md', 'a/.b.md', 'name.md ', 'a:b.md', ''])('rejects %j', (p) => {
    expect(() => validateRelativePath(p)).toThrow();
  });
  it('resolveInside always stays inside the base', () => {
    const base = path.resolve('/tmp/vault-x');
    expect(resolveInside(base, 'Docs', 'a/b.md')).toBe(path.join(base, 'Docs', 'a', 'b.md'));
    expect(() => resolveInside(base, 'Docs', '../Boards/x.md')).toThrow();
  });
  it('slugify removes accents', () => {
    expect(slugify('Fix timeout — Cartões & MDK!')).toBe('fix-timeout-cartoes-mdk');
  });
});
