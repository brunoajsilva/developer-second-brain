import { describe, expect, it } from 'vitest';
import { between, depois, antes } from '../src/core/fractional';

describe('chaves fracionárias', () => {
  it('cria chaves entre vizinhos', () => {
    const a = depois(null);
    const b = depois(a);
    expect(a < b).toBe(true);
    const m = between(a, b);
    expect(a < m && m < b).toBe(true);
    expect(antes(a) < a).toBe(true);
  });

  it('mantém a ordem em 2000 inserções aleatórias e nunca termina em 0', () => {
    let lista: string[] = [depois(null)];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 2000; n++) {
      const i = Math.floor(rnd() * (lista.length + 1));
      const a = i === 0 ? '' : lista[i - 1];
      const b = i === lista.length ? null : lista[i];
      const c = between(a, b);
      expect(c > a).toBe(true);
      if (b !== null) expect(c < b).toBe(true);
      expect(c.endsWith('0')).toBe(false);
      lista.splice(i, 0, c);
    }
    const ordenada = [...lista].sort();
    expect(lista).toEqual(ordenada);
    expect(new Set(lista).size).toBe(lista.length);
  });

  it('recusa intervalos invertidos', () => {
    expect(() => between('b', 'a')).toThrow();
    expect(() => between('a', 'a')).toThrow();
  });
});
