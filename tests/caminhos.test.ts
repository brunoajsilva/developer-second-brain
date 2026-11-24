import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { resolverDentro, slug, validarRelativo } from '../src/core/caminhos';

describe('caminhos', () => {
  it('aceita nomes simples e subpastas', () => {
    expect(validarRelativo('Arquitetura/ADR-001 Mensageria.md')).toEqual(['Arquitetura', 'ADR-001 Mensageria.md']);
  });
  it.each(['../fora.md', 'a/../../b.md', '/abs.md', 'C:/x.md', 'a\\b.md', 'a//b.md', '.escondido.md', 'a/.b.md', 'nome.md ', 'a:b.md', ''])('recusa %j', (p) => {
    expect(() => validarRelativo(p)).toThrow();
  });
  it('resolverDentro fica sempre dentro da base', () => {
    const base = path.resolve('/tmp/cofre-x');
    expect(resolverDentro(base, 'Docs', 'a/b.md')).toBe(path.join(base, 'Docs', 'a', 'b.md'));
    expect(() => resolverDentro(base, 'Docs', '../Boards/x.md')).toThrow();
  });
  it('slug remove acentos', () => {
    expect(slug('Corrigir timeout — Cartões & MDK!')).toBe('corrigir-timeout-cartoes-mdk');
  });
});
