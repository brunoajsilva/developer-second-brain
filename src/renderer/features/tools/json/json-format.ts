// A small JSON parser and printer. Unlike JSON.parse/stringify it keeps numbers exactly as written
// (64-bit ids stay intact), reports errors by line and column, and can accept comments and trailing commas.

export type JsonNode =
  | { type: 'object'; entries: { key: string; value: JsonNode }[] }
  | { type: 'array'; items: JsonNode[] }
  | { type: 'string'; raw: string }
  | { type: 'number'; raw: string }
  | { type: 'literal'; raw: 'true' | 'false' | 'null' };

export interface ParseOptions {
  /** Accept // and /* *\/ comments and trailing commas (JSONC, as in tsconfig.json or VS Code settings). */
  lenient?: boolean;
}

export class JsonSyntaxError extends Error {
  constructor(message: string, readonly offset: number, readonly line: number, readonly column: number) {
    super(`${message} (line ${line}, column ${column})`);
  }
}

export interface ParseResult {
  root: JsonNode;
  /** Keys that appear more than once in the same object (the last one wins in most parsers). */
  duplicateKeys: string[];
}

/** The next character starts another value, so most likely a comma is missing before it. */
const startsValue = (c: string | undefined) => c !== undefined && /["{[\-0-9tfn]/.test(c);

const describe = (c: string | undefined) => (c === undefined ? 'the end of the text' : c === '\n' ? 'a line break' : `“${c}”`);

export function parseJson(text: string, options: ParseOptions = {}): ParseResult {
  const lenient = !!options.lenient;
  const src = text.replace(/^﻿/, '');
  let i = 0;
  const duplicateKeys = new Set<string>();

  const fail = (message: string, at = i): never => {
    let line = 1;
    let col = 1;
    for (let k = 0; k < at && k < src.length; k++) {
      if (src[k] === '\n') { line++; col = 1; } else col++;
    }
    throw new JsonSyntaxError(message, at, line, col);
  };

  const skip = () => {
    for (;;) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
        if (!lenient) fail('Comments are not allowed in JSON. Turn on “Allow comments” to accept them');
        if (src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
        else {
          const end = src.indexOf('*/', i + 2);
          if (end < 0) fail('This comment is never closed');
          i = end + 2;
        }
        continue;
      }
      return;
    }
  };

  const string = (): string => {
    const start = i;
    i++; // opening quote
    for (;;) {
      const c = src[i];
      if (c === undefined) fail('This string is never closed', start);
      if (c === '"') { i++; return src.slice(start, i); }
      if (c === '\n') fail('Strings cannot contain line breaks; use \\n');
      if (c < ' ') fail('Control characters must be escaped inside strings');
      if (c === '\\') {
        const e = src[i + 1];
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) fail('“\\u” must be followed by four hex digits');
          i += 6;
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) i += 2;
        else fail(`“\\${e ?? ''}” is not a valid escape`);
        continue;
      }
      i++;
    }
  };

  const number = (): string => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) fail(`Unexpected ${describe(src[i])}`);
    i += m![0].length;
    return m![0];
  };

  const value = (depth: number): JsonNode => {
    if (depth > 1000) fail('Nested too deeply');
    skip();
    const c = src[i];
    if (c === '{') {
      i++;
      const entries: { key: string; value: JsonNode }[] = [];
      const seen = new Set<string>();
      skip();
      if (src[i] === '}') { i++; return { type: 'object', entries }; }
      for (;;) {
        skip();
        if (src[i] !== '"') {
          if (lenient && src[i] === '}' && entries.length) { i++; return { type: 'object', entries }; }
          fail(src[i] === "'" ? 'Keys must use double quotes' : `Expected a key in double quotes, found ${describe(src[i])}`);
        }
        const key = string();
        if (seen.has(key)) duplicateKeys.add(JSON.parse(key));
        seen.add(key);
        skip();
        if (src[i] !== ':') fail(`Expected “:” after the key, found ${describe(src[i])}`);
        i++;
        entries.push({ key, value: value(depth + 1) });
        skip();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return { type: 'object', entries }; }
        fail(src[i] === undefined ? 'The JSON ends too early: a “}” is missing' : startsValue(src[i]) ? 'A comma is missing before this key' : `Expected “,” or “}” after the value, found ${describe(src[i])}`);
      }
    }
    if (c === '[') {
      i++;
      const items: JsonNode[] = [];
      skip();
      if (src[i] === ']') { i++; return { type: 'array', items }; }
      for (;;) {
        skip();
        if (lenient && src[i] === ']' && items.length) { i++; return { type: 'array', items }; }
        items.push(value(depth + 1));
        skip();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return { type: 'array', items }; }
        fail(src[i] === undefined ? 'The JSON ends too early: a “]” is missing' : startsValue(src[i]) ? 'A comma is missing before this value' : `Expected “,” or “]” after the value, found ${describe(src[i])}`);
      }
    }
    if (c === '"') return { type: 'string', raw: string() };
    if (c === "'") fail('Strings must use double quotes');
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return { type: 'number', raw: number() };
    for (const lit of ['true', 'false', 'null'] as const) if (src.startsWith(lit, i)) { i += lit.length; return { type: 'literal', raw: lit }; }
    if (c === ',' ) fail('There is an extra comma here');
    return fail(c === undefined ? 'The JSON ends too early' : `Unexpected ${describe(c)}`);
  };

  skip();
  if (i >= src.length) fail('There is no JSON to read');
  const root = value(0);
  skip();
  if (i < src.length) fail(`Unexpected ${describe(src[i])} after the end of the JSON`);
  return { root, duplicateKeys: [...duplicateKeys] };
}

export interface FormatOptions {
  /** Spaces per level, or 'tab'. 0 = minified. */
  indent: number | 'tab';
  sortKeys?: boolean;
}

const keyText = (raw: string) => JSON.parse(raw) as string;

export function printJson(node: JsonNode, options: FormatOptions): string {
  const unit = options.indent === 'tab' ? '\t' : ' '.repeat(options.indent);
  const pretty = unit.length > 0;
  const print = (n: JsonNode, level: number): string => {
    const pad = unit.repeat(level + 1);
    const close = unit.repeat(level);
    switch (n.type) {
      case 'string':
      case 'number':
      case 'literal':
        return n.raw;
      case 'array':
        if (!n.items.length) return '[]';
        return pretty ? `[\n${n.items.map((x) => pad + print(x, level + 1)).join(',\n')}\n${close}]` : `[${n.items.map((x) => print(x, level)).join(',')}]`;
      case 'object': {
        if (!n.entries.length) return '{}';
        const entries = options.sortKeys ? [...n.entries].sort((a, b) => (keyText(a.key) < keyText(b.key) ? -1 : keyText(a.key) > keyText(b.key) ? 1 : 0)) : n.entries;
        return pretty
          ? `{\n${entries.map((e) => `${pad}${e.key}: ${print(e.value, level + 1)}`).join(',\n')}\n${close}}`
          : `{${entries.map((e) => `${e.key}:${print(e.value, level)}`).join(',')}}`;
      }
    }
  };
  return print(node, 0);
}

export interface JsonStats {
  keys: number;
  values: number;
  depth: number;
  /** Integers outside ±2^53 that JSON.parse would round. */
  unsafeNumbers: string[];
}

export function jsonStats(root: JsonNode): JsonStats {
  const stats: JsonStats = { keys: 0, values: 0, depth: 0, unsafeNumbers: [] };
  const walk = (n: JsonNode, depth: number) => {
    stats.values++;
    stats.depth = Math.max(stats.depth, depth);
    if (n.type === 'object') for (const e of n.entries) { stats.keys++; walk(e.value, depth + 1); }
    else if (n.type === 'array') for (const x of n.items) walk(x, depth + 1);
    else if (n.type === 'number' && /^-?\d+$/.test(n.raw) && !Number.isSafeInteger(Number(n.raw))) stats.unsafeNumbers.push(n.raw);
  };
  walk(root, 0);
  return stats;
}
