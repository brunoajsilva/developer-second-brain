import { describe, expect, it } from 'vitest';
import { keyAfter, keyBefore, keyBetween } from '../../src/core/boards/fractional-index';

describe('fractional index', () => {
  it('creates keys between neighbours', () => {
    const a = keyAfter(null);
    const b = keyAfter(a);
    expect(a < b).toBe(true);
    const mid = keyBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
    expect(keyBefore(a) < a).toBe(true);
  });

  it('keeps order across 2000 random inserts and never ends in 0', () => {
    const keys: string[] = [keyAfter(null)];
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 2000; n++) {
      const i = Math.floor(random() * (keys.length + 1));
      const a = i === 0 ? '' : keys[i - 1];
      const b = i === keys.length ? null : keys[i];
      const c = keyBetween(a, b);
      expect(c > a).toBe(true);
      if (b !== null) expect(c < b).toBe(true);
      expect(c.endsWith('0')).toBe(false);
      keys.splice(i, 0, c);
    }
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rejects inverted ranges', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
  });
});
