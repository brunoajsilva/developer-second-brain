import { describe, expect, it } from 'vitest';
import { JsonSyntaxError, jsonStats, parseJson, printJson } from '../../src/renderer/features/tools/json/json-format';

const fmt = (text: string, indent: number | 'tab' = 2, sortKeys = false, lenient = false) => printJson(parseJson(text, { lenient }).root, { indent, sortKeys });

describe('JSON format', () => {
  const src = '{"b":1,"a":[true,null,{"x":"y"}],"c":{}, "d":[]}';

  it('beautifies with 2 or 4 spaces or tabs', () => {
    expect(fmt(src)).toBe('{\n  "b": 1,\n  "a": [\n    true,\n    null,\n    {\n      "x": "y"\n    }\n  ],\n  "c": {},\n  "d": []\n}');
    expect(fmt('{"a":[1]}', 4)).toBe('{\n    "a": [\n        1\n    ]\n}');
    expect(fmt('{"a":1}', 'tab')).toBe('{\n\t"a": 1\n}');
  });

  it('minifies and sorts keys at every level', () => {
    expect(fmt(' { "b" : 1 ,\n "a" : { "z": 1, "y": 2 } } ', 0)).toBe('{"b":1,"a":{"z":1,"y":2}}');
    expect(fmt('{"b":1,"a":{"z":1,"y":2}}', 0, true)).toBe('{"a":{"y":2,"z":1},"b":1}');
  });

  it('keeps numbers and strings exactly as written', () => {
    const big = '{"id":12345678901234567890,"f":1.50,"e":1E+3,"s":"caf\\u00e9 \\"q\\""}';
    expect(fmt(big, 0)).toBe(big);
    expect(jsonStats(parseJson(big).root).unsafeNumbers).toEqual(['12345678901234567890']);
  });

  it('reports errors with line and column', () => {
    const expectError = (text: string, message: RegExp, line: number, column: number) => {
      try { parseJson(text); throw new Error('no error'); } catch (e) {
        expect(e).toBeInstanceOf(JsonSyntaxError);
        expect((e as JsonSyntaxError).message).toMatch(message);
        expect([(e as JsonSyntaxError).line, (e as JsonSyntaxError).column]).toEqual([line, column]);
      }
    };
    expectError('{\n  "a": 1\n  "b": 2\n}', /comma is missing before this key/, 3, 3);
    expectError('[1 2]', /comma is missing before this value/, 1, 4);
    expectError('{"a": 1 :}', /Expected “,” or “}”/, 1, 9);
    expectError('{"a": 1,}', /Expected a key/, 1, 9);
    expectError("{'a': 1}", /double quotes/, 1, 2);
    expectError('[1, 2', /ends too early/, 1, 6);
    expectError('{"a": 1} x', /after the end/, 1, 10);
    expectError('{"a": "line\nbreak"}', /line breaks/, 1, 12);
    expectError('{"a": tru}', /Unexpected/, 1, 7);
    expectError('// hi\n{}', /Comments are not allowed/, 1, 1);
    expectError('', /no JSON/, 1, 1);
  });

  it('accepts comments and trailing commas when lenient', () => {
    const jsonc = '{\n  // compiler\n  "strict": true, /* yes */\n  "paths": ["a", "b",],\n}';
    expect(fmt(jsonc, 0, false, true)).toBe('{"strict":true,"paths":["a","b"]}');
  });

  it('flags duplicate keys and counts structure', () => {
    const r = parseJson('{"a":1,"a":2,"b":{"c":[1,2]}}');
    expect(r.duplicateKeys).toEqual(['a']);
    expect(jsonStats(r.root)).toMatchObject({ keys: 4, depth: 3 });
  });
});
